import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Droplets, SlidersHorizontal, Play, Pause, Pencil, Download, ChevronDown } from "lucide-react";
import { LevelProjectHeader } from "./level-project-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NeedExamples } from "@/components/leadmagnet/need-examples";
import { SceneLoading } from "./scene-loading";
import { LevelMonitor } from "./level-monitor";
import { applyRemedy, configurationGuidance, horizontalAlternative, REMEDY_LABELS, type Remedy } from "@/lib/level/guidance";
import { intakeErrors, intakeKey, seedConfiguration, tankHeightFromCm, tankHeightInCm } from "@/lib/level/intake";
import { ConnectorChoices } from "@/components/leadmagnet/connector-choices";
import { ProjectContextFields } from "@/components/leadmagnet/project-context-fields";
import { IndustryField } from "@/components/leadmagnet/industry-field";
import type { BusinessMeta } from "@/lib/leadmagnet/dossier";
import { COUNTRY_CODES } from "@/lib/leadmagnet/sales-contact";
import { countryDisplayName } from "@/lib/leadmagnet/country-labels";
import { Label } from "@/components/ui/label";
import { DEFAULT_TERMINATION, freeReference, terminationLabel, type Termination } from "@/lib/leadmagnet/connectors";
import { terminationFromHousing } from "@/lib/leadmagnet/connector-library";
import { t, getLocale } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/react";
import { assessConfiguration, architectureFamily, configurationIssues, contextErrors, createLevelBrief, FAMILY_LABELS,
  illustrativeReading, INITIAL_CONFIGURATION, INITIAL_CONTEXT, setPointCount, resizeTank, pointBounds, MAX_REACH_MM, MAX_TANK_HEIGHT_MM,
  fitStemToPoints, setDetectionGoal, setMounting, setTravelPreference, isCompact, mountingDatum, proposedContactForm,
  type LevelConfiguration, type LevelContext } from "@/lib/level/configuration";
import "./level.css";

const LevelScene = lazy(() => import("./level-scene"));
const PositionChoiceScene = lazy(() => import("./position-choice-scene"));
type Stage = "choice" | "questions" | "configure" | "review" | "standex";

function Field({ label, children, hint, group = false }: { label: string; children: ReactNode; hint?: string; group?: boolean }) {
  const Tag = group ? "div" : "label";
  return <Tag className="lv-field"><span className="t-body font-semibold">{label}</span>{children}
    {hint ? <span className="t-caption text-muted-foreground">{hint}</span> : null}</Tag>;
}
function SelectField({ label, value, onChange, options, disabled = false }: {
  label: string; value: string; onChange: (value: string) => void; options: readonly (readonly [string, string])[]; disabled?: boolean;
}) {
  return <Field label={label}><span className="lv-select"><select aria-label={label} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
    {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
  </select><ChevronDown size={18} aria-hidden="true" /></span></Field>;
}
function RangeField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return <label className="lv-field"><span className="lv-between"><span className="t-body font-semibold">{label}</span>
    <span className="t-metric t-body">{value} mm</span></span>
    <input className="lv-range" type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} /></label>;
}
function Choice<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: readonly (readonly [T, string])[]; label: string }) {
  return <div className="lv-segment" role="group" aria-label={label}>{options.map(([id, text]) =>
    <button type="button" key={id} aria-pressed={value === id} onClick={() => onChange(id)}>{text}</button>)}</div>;
}
function ReviewFacts({ rows }: { rows: readonly (readonly [string, ReactNode])[] }) {
  return <dl className="review-facts mt-3">{rows.map(([label, value]) => <div className="review-fact" key={label}>
    <dt className="review-fact-label">{label}</dt><dd className="t-body">{value}</dd>
  </div>)}</dl>;
}
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => { const q = window.matchMedia("(prefers-reduced-motion: reduce)"); const update = () => setReduced(q.matches);
    update(); q.addEventListener("change", update); return () => q.removeEventListener("change", update); }, []);
  return reduced;
}
export default function LevelJourney({ embedded = false, active = true, onClassic }: { embedded?: boolean; active?: boolean; onClassic?: () => void }) {
  useLocale();
  const fluids = [["water", t("Eau")], ["oil", t("Huile")], ["other", t("Autre liquide")], ["unknown", t("À définir")]] as const;
  const stages: { id: Stage; label: string }[] = [{ id: "questions", label: t("Mon besoin") }, { id: "configure", label: t("Configuration") },
    { id: "review", label: t("Résultat") }, { id: "standex", label: t("Avec Standex") }];
  const [stage, setStage] = useState<Stage>("choice");
  const [question, setQuestion] = useState(0);
  const [returnToConfig, setReturnToConfig] = useState(false);
  const [context, setContext] = useState<LevelContext>({ ...INITIAL_CONTEXT });
  const [config, setConfig] = useState<LevelConfiguration>({ ...INITIAL_CONFIGURATION, pointsMm: [...INITIAL_CONFIGURATION.pointsMm] });
  const [level, setLevel] = useState(50);
  const [playing, setPlaying] = useState(false);
  const [direction, setDirection] = useState<"up" | "down">("up");
  const [cableLength, setCableLength] = useState("");
  const [termination, setTermination] = useState<Termination>(DEFAULT_TERMINATION);
  const [connectorRequested, setConnectorRequested] = useState(false);
  const [projectTitle, setProjectTitle] = useState<string | null>(null);
  const [business, setBusiness] = useState<BusinessMeta>({ projectPhase: "unknown", seriesStartDate: null, samplesNeededBy: null,
    annualVolume: { kind: "unknown" }, seriesDurationYears: null, contactName: null, contactEmail: null, contactCompany: null });
  const [projectNotes, setProjectNotes] = useState("");
  const [volumeError, setVolumeError] = useState<string | null>(null);
  const [exported, setExported] = useState(false);
  const reduced = useReducedMotion();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const controlsRef = useRef<HTMLElement>(null);
  const seededKey = useRef<string | null>(null);
  const assessment = assessConfiguration(context, config);
  const errors = contextErrors(context);
  const intakeProblems = intakeErrors(context);
  const questionProblems = question === 2 ? intakeErrors({ ...context, detectionHeight: "" }) : intakeProblems;
  const cableInvalid = cableLength.trim() !== "" && (!Number.isFinite(Number(cableLength)) || Number(cableLength) <= 0);
  const selected = assessment.selected;
  const family = selected?.family ?? architectureFamily(config);
  const issues = configurationIssues(config, family);
  const reading = illustrativeReading(config, level, family);
  const signalAvailable = reading.usable && selected !== null && errors.length === 0;
  const specific = assessment.specific || issues.length > 0;
  const guidance = configurationGuidance(context, config, family);
  const horizontalOption = config.tankHeightMm >= 1000 && horizontalAlternative(context, config);
  const currentIndex = stages.findIndex(s => s.id === stage);
  const changeConfig = (patch: Partial<LevelConfiguration>) => { setPlaying(false); setConfig(c => ({ ...c, ...patch })); setExported(false); };
  const changeContext = (patch: Partial<LevelContext>) => { setContext(c => ({ ...c, ...patch })); setExported(false); };
  const go = (s: Stage) => { setPlaying(false); setExported(false); setStage(s); };
  const openConfigurator = () => {
    if (intakeProblems.length) { setQuestion(intakeErrors({ ...context, detectionHeight: "" }).length ? 2 : 3); go("questions"); return; }
    const key = intakeKey(context);
    if (seededKey.current !== key) {
      const next = seedConfiguration(context);
      setConfig(next); setLevel(next.tankHeightMm / 2); seededKey.current = key;
    }
    go("configure");
  };
  const classic = () => onClassic ? onClassic() : window.location.assign("/");

  useEffect(() => {
    if (!active) return;
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.closest("main")?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [stage, question, active]);
  useEffect(() => { if (!active || reduced) setPlaying(false); }, [active, reduced]);
  useEffect(() => {
    if (stage === "configure" && guidance && controlsRef.current) controlsRef.current.scrollTop = 0;
  }, [stage, guidance?.message]);
  useEffect(() => {
    const pauseHidden = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener("visibilitychange", pauseHidden);
    return () => document.removeEventListener("visibilitychange", pauseHidden);
  }, []);
  useEffect(() => {
    if (!playing || reduced || !active || stage !== "configure") return;
    let request = 0, previous = 0;
    const tick = (now: number) => {
      if (!previous) previous = now;
      const elapsed = now - previous;
      if (elapsed >= 32) {
        previous = now;
        setLevel(current => {
          const next = Math.max(0, Math.min(config.tankHeightMm, current + (direction === "up" ? 1 : -1) * elapsed * config.tankHeightMm / 12000));
          return next;
        });
      }
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [playing, reduced, active, stage, direction, config.tankHeightMm]);
  useEffect(() => { if ((direction === "up" && level >= config.tankHeightMm) || (direction === "down" && level <= 0)) setPlaying(false); }, [level, direction, config.tankHeightMm]);
  const editApplication = () => { setReturnToConfig(true); setQuestion(1); go("questions"); };
  const remedy = (action: Remedy) => {
    if (action === "liquid") { editApplication(); return; }
    setPlaying(false); setExported(false);
    const next = applyRemedy(config, action);
    setLevel(l => Math.min(next.tankHeightMm, l * next.tankHeightMm / config.tankHeightMm));
    setConfig(next);
  };
  const returnFromLiquid = returnToConfig && question === 1;
  const advanceQuestion = () => {
    if (returnFromLiquid || question === 3) { setReturnToConfig(false); openConfigurator(); }
    else setQuestion(q => q + 1);
  };
  const download = () => {
    const brief = { ...createLevelBrief(context, config, { lengthMm: cableLength, connector: terminationLabel(termination) }, {
      name: business.contactName ?? "", company: business.contactCompany ?? "", email: business.contactEmail ?? "",
      phone: business.contactPhone ?? "", country: business.siteCountry ?? "", city: business.siteCity ?? "" }),
      title: projectTitle ?? t("Nouveau projet"), project_details: business, additional_notes: projectNotes };
    const url = URL.createObjectURL(new Blob([JSON.stringify(brief, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "Sensor-Studio-Niveau-Brouillon.json";
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setExported(true);
  };
  const scene = (productOnly = false) => <Suspense fallback={<SceneLoading />}>
    {active ? <LevelScene configuration={config} family={family} material={selected?.material === "to_define" ? family === "LS03" ? "PA" : "PP" : selected?.material ?? "PP"} levelMm={level} oil={context.fluid === "oil"} productOnly={productOnly} interactive={!productOnly} /> : null}
  </Suspense>;

  return <div className={`lv-journey${embedded ? " lv-embedded" : ""}`} data-readable>
    {!embedded ? <LevelProjectHeader title={projectTitle ?? t("Nouveau projet")} onRename={setProjectTitle} onChoice={() => go("choice")} onClassic={classic} /> : null}
    {stage !== "choice" ? <div className="project-stepper-bar lv-stepper-bar project-stepper-sticky"><nav className={`project-stepper project-stepper-${currentIndex} lv-project-stepper`} aria-label={t("Étapes du projet de niveau")}>
      <span className="project-stepper-thumb" aria-hidden="true" />
      {stages.map((s, i) => <button type="button" key={s.id} aria-label={`${i + 1}. ${s.label}`} aria-current={stage === s.id ? "step" : undefined}
        onClick={() => { if (s.id === "questions") { setQuestion(0); setReturnToConfig(false); } if (s.id === "configure") openConfigurator(); else go(s.id); }}
        className={`relative z-10 min-h-11 bg-transparent px-4 py-3 text-left transition-colors duration-[var(--d-base)] ${stage === s.id ? "text-[var(--heading)]" : "text-[var(--muted-foreground)]"}`}>
        <span className="project-stepper-content flex min-w-0 items-center gap-2 text-base font-semibold">
          <span className={`standex-bar !h-3 !w-1 transition-opacity duration-[var(--d-base)] ${stage === s.id ? "opacity-100" : "opacity-25"}`} aria-hidden="true" />
          <span className={`project-stepper-label${s.id === "configure" ? " lv-step-full" : ""}`}>{i + 1}. {s.label}</span>
          {s.id === "configure" ? <span className="project-stepper-label lv-step-short" aria-hidden="true">{i + 1}. {t("Configurer")}</span> : null}
        </span>
      </button>)}
    </nav></div> : null}
    <div className="lv-topbar">
      <button type="button" className="text-link t-caption" onClick={() => go("choice")}>{t("Types de capteurs")}</button>
      <span className="lv-preview t-caption">{t("Aperçu du parcours niveau")}</span>
    </div>

    {stage === "choice" ? <main className="lv-intro">
      <p className="t-label">{t("Votre projet")}</p>
      <h1 className="t-display-m" ref={headingRef} tabIndex={-1}>{t("Que souhaitez-vous détecter ?")}</h1>
      <p className="t-body-l text-muted-foreground">{t("Deux situations, un parcours adapté à votre application.")}</p>
      <div className="lv-choice-grid">
        <section className="lv-type-card">
          <div className="lv-type-picture" aria-hidden="true"><Suspense fallback={<SceneLoading />}>{active ? <PositionChoiceScene /> : null}</Suspense></div>
          <div className="lv-type-copy"><p className="t-label">{t("Capteur de position")}</p><h2 className="t-title-l">{t("Position et mouvement")}</h2>
            <p className="t-body">{t("Repérer une ouverture, une présence ou le déplacement d’une pièce.")}</p>
            <Button onClick={classic}>{t("Configurer un capteur de position")}</Button></div>
        </section>
        <section className="lv-type-card">
          <div className="lv-type-picture" aria-label={t("Capteur à flotteur dans une cuve")}><Suspense fallback={<SceneLoading />}>
            {active ? <LevelScene configuration={INITIAL_CONFIGURATION} family="LS01" levelMm={75} material="PP" showMarkers={false} /> : null}
          </Suspense></div>
          <div className="lv-type-copy"><p className="t-label">{t("Capteur à flotteur")}</p><h2 className="t-title-l">{t("Niveau de liquide")}</h2>
            <p className="t-body">{t("Détecter un niveau haut ou bas, plusieurs seuils ou suivre la hauteur du liquide.")}</p>
            <Button onClick={() => { setQuestion(0); setReturnToConfig(false); go("questions"); }}>{t("Configurer un capteur de niveau")}</Button></div>
        </section>
      </div>
    </main> : null}

    {stage === "questions" ? <main className="lv-question-main">
      <section className="questionnaire-card" aria-labelledby="level-question-title">
        <div className="questionnaire-meta"><p className="questionnaire-count t-caption">{t("Question")} {question + 1} {t("sur")} 4</p>
          <p className="questionnaire-category t-label">{t(["L’application", "Le liquide", "La cuve", "La détection"][question]!)}</p></div>
        <div className="questionnaire-progress" aria-hidden="true"><div style={{ width: `${(question + 1) / 4 * 100}%` }} /></div>
        <h1 id="level-question-title" className="t-title-l mt-5" ref={headingRef} tabIndex={-1}>
          {t(["Dans quel équipement, et pour quoi faire ?", "Quel liquide, à quelles températures ?", "Dans quelles conditions le capteur sera-t-il installé ?", "Quel niveau faut-il détecter ?"][question]!)}</h1>
        <div className="questionnaire-grid mt-6">
          <div className="questionnaire-answer lv-fields">
            {question === 0 ? <Field label={t("Votre application")}><Textarea rows={4} value={context.purpose}
              placeholder={t("Décrivez la machine, la cuve ou le réservoir, et l’action attendue.")}
              onChange={e => changeContext({ purpose: e.target.value })} /></Field> : question === 1 ? <>
              <SelectField label={t("Liquide")} value={context.fluid} options={fluids} onChange={v => changeContext({ fluid: v as LevelContext["fluid"] })} />
              {context.fluid !== "unknown" ? <Field label={context.fluid === "water" ? t("Type d’eau et éventuels additifs") : t("Nom ou référence du liquide")}>
                <Input value={context.fluidName} placeholder={context.fluid === "water" ? t("Eau du réseau, condensats, eau glycolée…") : t("Référence, composition…")} onChange={e => changeContext({ fluidName: e.target.value })} />
              </Field> : null}
              <div className="lv-two-fields"><Field label={t("Température minimale (°C)")}><Input type="number" value={context.temperatureMin} placeholder={t("À définir")} onChange={e => changeContext({ temperatureMin: e.target.value })} /></Field>
                <Field label={t("Température maximale (°C)")}><Input type="number" value={context.temperatureMax} placeholder={t("À définir")} onChange={e => changeContext({ temperatureMax: e.target.value })} /></Field></div>
              {errors.map(e => <p key={e} className="notice-danger t-body" role="alert">{t(e)}</p>)}
            </> : question === 2 ? <>
              <SelectField label={t("Accès pour installer le capteur")} value={context.mountingAccess} onChange={v => changeContext({ mountingAccess: v as LevelContext["mountingAccess"] })}
                options={[["unknown", t("À définir")], ["free", t("Position de fixation libre")], ["top", t("Ouverture imposée en haut")], ["side", t("Accès par une paroi latérale")], ["bottom", t("Insertion par le fond")]]} />
              <Field label={t("Hauteur utile de la cuve (cm)")} hint={t("Du fond au niveau maximal du liquide. Par exemple : 190 cm pour une cuve de 1,90 m.")}><Input type="number" min="6" max="1000" step="any" value={tankHeightInCm(context.tankHeight)} placeholder={t("À définir")} onChange={e => changeContext({ tankHeight: tankHeightFromCm(e.target.value) })} /></Field>
              <Field label={t("Contraintes à connaître")} hint={t("Facultatif")}><Textarea rows={3} value={context.constraints} onChange={e => changeContext({ constraints: e.target.value })}
                placeholder={t("Accès uniquement par le haut, nettoyage, liquide agité, espace étroit…")} /></Field>
              <details className="lv-details"><summary>{t("Pression et immersion")}</summary><div className="lv-fields mt-4">
              <SelectField label={t("Cuve")} value={context.tank} onChange={v => changeContext({ tank: v as LevelContext["tank"] })}
                options={[["unknown", t("À définir")], ["vented", t("À pression atmosphérique")], ["pressurised", t("Sous pression ou sous vide")]]} />
              <SelectField label={t("Immersion du corps du capteur")} value={context.bodyExposure} onChange={v => changeContext({ bodyExposure: v as LevelContext["bodyExposure"] })}
                options={[["unknown", t("À définir")], ["permanent", t("En permanence")], ["intermittent", t("Par intermittence")]]} />
              <SelectField label={t("Sortie de câble et câble")} value={context.cableExposure} onChange={v => changeContext({ cableExposure: v as LevelContext["cableExposure"] })}
                options={[["unknown", t("À définir")], ["dry", t("Restent hors du liquide")], ["wet", t("Seront immergés, même occasionnellement")]]} />
              </div></details>
            </> : <>
              <SelectField label={t("Niveau à détecter")} value={context.detectionGoal} onChange={v => changeContext({ detectionGoal: v as LevelContext["detectionGoal"] })}
                options={[["unknown", t("À définir")], ["high", t("Un niveau haut")], ["low", t("Un niveau bas")], ["multiple", t("Plusieurs niveaux")], ["continuous", t("Suivre le niveau en continu")]]} />
              {["high", "low"].includes(context.detectionGoal) ? <Field label={t("Hauteur du niveau à détecter (mm)")} hint={t("Mesurée depuis le fond. Facultatif : une première position sera proposée.")}><Input type="number" min="0" value={context.detectionHeight} placeholder={t("À définir")} onChange={e => changeContext({ detectionHeight: e.target.value })} /></Field> : null}
              <SelectField label={t("Le liquide peut-il faire des vaguelettes ?")} value={context.responsePriority} onChange={v => changeContext({ responsePriority: v as LevelContext["responsePriority"] })}
                options={[["unknown", t("À définir")], ["limit", t("Non, le niveau reste plutôt stable")], ["movement", t("Oui, de petits mouvements sont à ignorer")]]} />
              <p className="t-caption text-muted-foreground">{t("Comme de l’eau qui clapote quand le réservoir bouge ou qu’une pompe démarre. Ces petits mouvements ne doivent pas provoquer d’alarme.")}</p>
            </>}
            {question >= 2 ? questionProblems.map(e => <p key={e} className="notice-danger t-body" role="alert">{t(e)}</p>) : null}
          </div>
          <aside className="questionnaire-examples">
            <NeedExamples key={question} questionKey={["level_application", "level_liquid", "level_installation", "level_detection"][question]!} />
          </aside>
        </div>
        <div className="questionnaire-navigation lv-question-nav">
          <Button variant="ghost" onClick={() => question > 0 ? setQuestion(q => q - 1) : go("choice")}>{t("Précédent")}</Button>
          <Button variant="secondary" onClick={advanceQuestion} disabled={(question === 1 && errors.length > 0) || (question >= 2 && questionProblems.length > 0)}>{t("À préciser plus tard")}</Button>
          <Button size="lg" disabled={(question === 1 && errors.length > 0) || (question >= 2 && questionProblems.length > 0)} onClick={advanceQuestion}>
            {t(returnFromLiquid ? "Revenir au configurateur" : question === 3 ? "Ouvrir le configurateur" : "Continuer")}</Button>
        </div>
      </section>
    </main> : null}

    {stage === "configure" ? <main className="lv-config-main">
      <div className="lv-config-heading"><div><p className="t-label">{t("Configuration assistée")}</p>
        <h1 className="t-title-l" tabIndex={-1} ref={headingRef}>{t("Imaginez votre détection, en situation.")}</h1></div>
        <button type="button" className="lv-context-chip" onClick={editApplication}><Droplets size={18} aria-hidden="true" />
          <span>{context.fluidName || fluids.find(f => f[0] === context.fluid)![1]} · {context.temperatureMin || "?"} {t("à")} {context.temperatureMax || "?"} °C</span>
          <Pencil size={16} aria-hidden="true" /><span className="sr-only">{t("Modifier le liquide et les températures")}</span></button>
      </div>
      <div className="lv-config-grid">
        <aside ref={controlsRef} className="lv-controls panel-block" tabIndex={0} aria-label={t("Votre configuration")}>
          <h2 className="t-title-s">{t("Votre configuration")}</h2>
          {context.tankHeight === "" || context.detectionGoal === "unknown" ? <p className="t-caption text-muted-foreground">{t("Les informations encore inconnues utilisent une première proposition modifiable ci-dessous.")}</p> : null}
          {guidance ? <div className="notice-warning lv-guidance" role="status"><p className="t-body">{t(guidance.message)}</p>
            <div className="lv-remedies">{guidance.actions.map(action => <Button key={action} variant="secondary" onClick={() => remedy(action)}>{t(REMEDY_LABELS[action])}</Button>)}</div>
          </div> : null}
          <Choice label={t("Mode de détection")} value={config.mode} onChange={mode => changeConfig(fitStemToPoints({ ...config, mode }))} options={[["points", t("Par points")], ["continuous", t("En continu")]]} />
          {config.mode === "points" ? <SelectField label={t("Points de détection souhaités")} value={String(config.count)} onChange={v => { setPlaying(false); setConfig(c => setPointCount(c, Number(v))); }}
            options={Array.from({ length: 12 }, (_, i) => [String(i + 1), `${i + 1} ${t(i === 0 ? "point" : "points")}`] as const)} /> :
            <p className="t-caption">{t("La tige est étendue à la hauteur de la cuve pour illustrer le suivi du niveau. La plage réellement mesurable reste à confirmer.")}</p>}
          {config.mode === "points" ? <p className="t-caption text-muted-foreground">{t("Changer le nombre répartit les points et allonge la tige si nécessaire.")}</p> : null}
          {config.mode === "points" && config.count === 1 ? <Field group label={t("Niveau à détecter")}><Choice label={t("Niveau à détecter")} value={config.closedWhen} onChange={goal => changeConfig(setDetectionGoal(config, goal))}
            options={[["high", t("Niveau haut")], ["low", t("Niveau bas")]]} /></Field> : null}
          {config.orientation === "vertical" && config.mode === "points" && config.count === 1 ? <SelectField label={t("Le liquide peut-il faire des vaguelettes ?")} value={config.travelPreference} onChange={v => changeConfig(setTravelPreference(config, v as "short" | "long"))}
            options={[["short", t("Non, le niveau reste plutôt stable")], ["long", t("Oui, de petits mouvements sont à ignorer")]]} /> : null}
          <Field group label={t("Orientation")}><Choice label={t("Orientation")} value={config.orientation} onChange={orientation => changeConfig({ orientation })}
            options={[["vertical", t("Verticale")], ["horizontal", t("Horizontale")]]} /></Field>
          {config.orientation === "horizontal" && config.mode === "points" && config.count > 1 ? <p className="notice-info t-body">{config.count} {t("capteurs horizontaux : un à chaque point. Prévoir un accès latéral à chaque hauteur.")}</p> : null}
          {horizontalOption && !guidance ? <div className="notice-info t-body"><p>{t("Ces niveaux peuvent être détectés séparément par des capteurs horizontaux. Prévoir un accès latéral à chaque hauteur.")}</p><Button variant="secondary" className="mt-3" onClick={() => remedy("horizontal_array")}>{t(REMEDY_LABELS.horizontal_array)}</Button></div> : null}
          {config.orientation === "vertical" ? <>
            <SelectField label={t("Fixation dans la cuve")} value={config.mounting} onChange={v => changeConfig(setMounting(config, v as LevelConfiguration["mounting"]))}
              options={[["support", t("Capteur droit, hauteur de fixation libre")], ["top", t("Ouverture imposée en haut")], ["bottom", t("Insertion par le fond")]]} />
            <p className="t-caption text-muted-foreground">{config.mounting === "support" ? <>{t("Fixation proposée à")} {Math.round(mountingDatum(config) * 10) / 10} mm. {t("Le capteur reste droit. Déplacez le point pour ajuster sa position.")}</> : t(config.mounting === "bottom" ? "Le capteur est retourné. Cette construction et sa logique de contact sont à confirmer avec Standex." : "La fixation reste en haut ; la tige rejoint la zone à détecter.")}</p>
          </> :
            <SelectField label={t("Finition de montage")} value={config.connection} onChange={v => changeConfig({ connection: v as LevelConfiguration["connection"] })}
              options={[["standard", t("Standard")], ["DK", "DK"], ["DL", "DL"], ["GZ", "GZ"]]} />}
          <RangeField label={t("Hauteur utile de la cuve")} value={config.tankHeightMm} min={60} max={MAX_TANK_HEIGHT_MM} step={10} onChange={height => {
            setPlaying(false); setExported(false);
            setLevel(l => l * height / config.tankHeightMm); setConfig(c => resizeTank(c, height));
          }} />
          <p className="t-caption text-muted-foreground">{t("Changer la hauteur recale les points et le montage ; les dimensions des flotteurs restent fixes.")}</p>
          {config.orientation === "vertical" ? <><RangeField label={t("Longueur souhaitée sous fixation")} value={config.reachMm} min={25} max={MAX_REACH_MM} step={0.5} onChange={reachMm => changeConfig({ reachMm })} />
            <p className="t-caption text-muted-foreground">{t("La longueur de tige oriente la famille : plastique jusqu’à 250 mm, inox jusqu’à 2 000 mm. Le liquide et la température peuvent imposer l’inox.")}</p></> : null}
          {config.mode === "points" ? <>
            <div className="lv-field"><h3 className="t-body font-semibold">{t("Position des points")}</h3><p className="t-caption text-muted-foreground">{t("Hauteurs souhaitées depuis le fond de la cuve.")}</p></div>
            {config.pointsMm.map((point, i) => <RangeField key={i} label={`${t("Point")} ${i + 1}`} value={point} {...pointBounds(config, i)}
              onChange={v => { const next = { ...config, pointsMm: config.pointsMm.map((p, index) => index === i ? v : p) }; changeConfig(config.count === 1 ? fitStemToPoints(next) : next); }} />)}
            {config.count > 1 && config.orientation === "vertical" ? <SelectField label={t("Répartition sur les flotteurs")} value={String(config.pointsPerFloat)}
              onChange={v => changeConfig({ pointsPerFloat: Number(v) as 1 | 2 })} options={[["2", t("Jusqu’à 2 points par flotteur")], ["1", t("1 point par flotteur")]]} /> : null}
            {config.count === 1 && config.orientation === "vertical" && !isCompact(family) ? <>
              <RangeField label={t("Course du flotteur entre les butées")} value={config.floatTravelMm} min={2} max={Math.min(100, config.tankHeightMm - 32)} step={.5}
                onChange={floatTravelMm => changeConfig(fitStemToPoints({ ...config, floatTravelMm }))} />
              <p className="t-caption text-muted-foreground">{t("Les collerettes limitent le mouvement autour du niveau choisi, même avec une longue tige.")}</p>
            </> : null}
          </> : null}
          <div className="lv-study-details">
          <section className="lv-family-card" aria-live="polite">
            <p className="t-label">{t(specific ? "Demande spécifique" : "Piste à étudier")}</p>
            <h2 className="t-display-m">{config.custom ? t("Sur mesure") : selected ? `${config.orientation === "horizontal" && config.count > 1 ? `${config.count} × ` : ""}${selected.family}` : t("Avec Standex")}</h2>
            {selected ? <><p className="t-title-s">{t(FAMILY_LABELS[selected.family])}</p><p className="t-body">{t(selected.material === "SS" ? "Tige inox" : selected.material === "PP" ? "Matériau à envisager : PP" : selected.material === "PA" ? "Matériau à envisager : PA" : "Matériau à définir")}</p></> : null}
            <p className="t-caption">{t("La famille évolue avec vos réglages. La construction exacte reste à confirmer.")}</p>
            {config.travelPreference === "long" ? <p className="t-caption">{t("Le montage proposé tient compte des petits mouvements du liquide. L’absence de déclenchement intempestif reste à vérifier dans l’application.")}</p> : null}
          </section>
          {selected?.reasons.length ? <details className="lv-details panel-block"><summary>{t("Points à préciser")}</summary><ul className="lv-notes t-caption">{selected.reasons.map(x => <li key={x}>{t(x)}</li>)}</ul></details> : null}
          <details className="lv-details panel-block"><summary>{t("Pourquoi cette piste ?")}</summary>
            <p className="t-caption">{t("Le filtrage est documentaire. La chimie, la flottabilité, l’immersion et la charge ne sont pas validées par cette illustration.")}</p>
            <ul className="lv-notes t-caption">{assessment.candidates.filter(c => c.status === "excluded").map(c => <li key={c.family}><strong>{c.family}</strong> — {c.reasons.map(reason => t(reason)).join(" ")}</li>)}</ul>
            {selected ? <p className="t-caption">{t(selected.source)}</p> : null}</details>
          <section className="panel-block lv-custom"><h2 className="t-title-s">{t("Une autre forme ?")}</h2>
            <p className="t-body">{t("Corps coudé, accès particulier, encombrement réduit… décrivez ce qu’il vous faut.")}</p>
            <Button variant="outline" onClick={() => changeConfig({ custom: !config.custom })}>{t(config.custom ? "Revenir aux familles" : "Prévoir une forme spécifique")}</Button>
            {config.custom ? <Field label={t("Votre forme et vos contraintes")}><Textarea value={config.customDescription} onChange={e => changeConfig({ customDescription: e.target.value })} placeholder={t("Forme, accès, dimensions à respecter…")} /></Field> : null}
          </section>
          <Button size="lg" className="lv-continue" onClick={() => go("review")}>{t(specific ? "Préparer la demande" : "Revoir cette configuration")}</Button>
          </div>
        </aside>
        <section className="lv-visual-column" aria-label={t("Simulation du niveau de liquide")}>
          <div className="lv-visual surface">
            <div className="lv-visual-title"><div><p className="t-label">{t("Dans votre cuve")}</p><p className="t-caption text-muted-foreground">{t("Vue en coupe · enveloppes reconstruites d’après les fiches")}</p></div>
              <span className="lv-preview t-caption">{t("Illustration du besoin")}</span></div>
            <div className="lv-canvas" role="group" aria-label={t("Cuve, liquide et flotteurs mobiles")}>{!config.custom && selected && issues.length === 0 ? scene() :
              <div className="lv-empty"><SlidersHorizontal size={40} /><h2 className="t-title-m">{t(config.custom ? "Une forme adaptée à votre application" : "Une configuration à étudier")}</h2>
                <p className="t-body">{t(!config.custom && guidance ? guidance.message : "Votre besoin reste conservé. Décrivez les contraintes pour préparer l’étude avec Standex.")}</p></div>}</div>
            <div className="lv-playback">
              <p className="t-caption text-muted-foreground">{t(family === "LS05" ? "Gabarit illustré : tige Ø12 mm, flotteur Ø32 mm. Largeur de cuve indicative." : "Largeur de cuve indicative. Utilisez le zoom pour examiner le capteur.")}</p>
              <div className="lv-between"><h2 className="t-title-s">{t("Faire varier le liquide")}</h2><output className="t-metric t-body">{Math.round(level)} / {config.tankHeightMm} mm</output></div>
              <input type="range" className="lv-range" aria-label={t("Hauteur du liquide")} min={0} max={config.tankHeightMm} value={level} step={1} onChange={e => { setPlaying(false); setLevel(Number(e.target.value)); }} />
              <div className="lv-play-actions"><Choice label={t("Sens de variation")} value={direction} onChange={d => { setPlaying(false); setDirection(d); }} options={[["up", t("Remplissage")], ["down", t("Vidange")]]} />
                <Button disabled={reduced || !signalAvailable} onClick={() => {
                  if (!playing && direction === "up" && level >= config.tankHeightMm) setLevel(0);
                  if (!playing && direction === "down" && level <= 0) setLevel(config.tankHeightMm);
                  setPlaying(v => !v);
                }}>{playing ? <Pause size={18} /> : <Play size={18} />}{t(playing ? "Pause" : "Lancer")}</Button></div>
              {reduced ? <p className="t-caption">{t("Mouvements réduits : utilisez le curseur pour changer le niveau.")}</p> : null}
            </div>
          </div>

        </section>
        <LevelMonitor configuration={config} family={family} level={level} available={signalAvailable} />
      </div>
    </main> : null}

    {stage === "review" || stage === "standex" ? <main className="lv-review-main space-y-5">
      <div><h1 className="t-display-m" ref={headingRef} tabIndex={-1}>{t(stage === "review" ? "Résultat" : "Préparez la suite avec notre équipe.")}</h1>
        <p className="t-body mt-2">{t(stage === "review" ? "Les derniers détails de votre configuration." : "Cet aperçu prépare un brouillon. Aucun dossier n’est envoyé à Standex.")}</p></div>
      <div className="review-grid">
        <div className="space-y-4">
          <section className="panel-block-lg">
            <h2 className="t-title-m">{t("Votre projet")}</h2>
            <ReviewFacts rows={[
              [t("Application"), context.purpose || t("Non défini pour le moment")],
              [t("Liquide"), context.fluidName || fluids.find(f => f[0] === context.fluid)![1]],
              [t("Températures"), `${context.temperatureMin || "?"} ${t("à")} ${context.temperatureMax || "?"} °C`],
              [t("Cuve"), t(context.tank === "vented" ? "À pression atmosphérique" : context.tank === "pressurised" ? "Sous pression ou sous vide" : "À définir")],
              [t("Immersion du corps du capteur"), t(context.bodyExposure === "permanent" ? "En permanence" : context.bodyExposure === "intermittent" ? "Par intermittence" : "À définir")],
              [t("Sortie de câble et câble"), t(context.cableExposure === "wet" ? "Seront immergés, même occasionnellement" : context.cableExposure === "dry" ? "Restent hors du liquide" : "À définir")],
            ]} />
            <button type="button" className="text-link mt-3 min-h-11" onClick={editApplication}>{t("Modifier le liquide et les températures")}</button>
          </section>
          <section className="panel-block-lg">
            <h2 className="t-title-m">{t("Configuration technique")}</h2>
            <div className="lv-solution-summary">
              <div><p className="t-label">{t(config.custom ? "Demande spécifique" : "Piste à étudier")}</p>
                <p className="t-title-l mt-2">{config.custom ? t("Forme spécifique") : selected?.family ?? t("Configuration à étudier")}</p>
                <p className="t-body mt-2">{config.custom ? config.customDescription || t("À définir") : selected ? t(FAMILY_LABELS[selected.family]) : t("Votre besoin reste conservé. Décrivez les contraintes pour préparer l’étude avec Standex.")}</p>
              </div>
              {selected && !config.custom ? <div className="lv-review-picture" aria-label={t("Votre capteur")}>{scene(true)}</div> : null}
            </div>
            <ReviewFacts rows={[
              [t("Détection"), config.mode === "continuous" ? t("En continu") : `${config.count} ${t("point(s)")} · ${config.pointsMm.join(", ")} mm`],
              [t("Montage"), config.orientation === "vertical" ? `${t("Vertical")} · ${t(config.mounting === "top" ? "Ouverture imposée en haut" : config.mounting === "support" ? "Capteur droit, hauteur de fixation libre" : "Insertion par le fond")}` : `${t("Horizontal")} · ${config.connection}`],
              ...(config.orientation === "horizontal" ? [[t("Nombre de capteurs"), String(config.count)]] as const : []),
              ...(config.mode === "points" && config.count === 1 ? [[t("Niveau à détecter"), t(config.closedWhen === "high" ? "Niveau haut" : "Niveau bas")],
                [t("Forme de contact proposée"), proposedContactForm(config, family) ? `${t("Forme")} ${proposedContactForm(config, family)}` : t("À confirmer avec Standex")]] as const : []),
              ...(config.orientation === "vertical" ? [[t("Longueur souhaitée"), `${config.reachMm} mm`] as const] : []),
              [t("Câble"), cableLength ? `${cableLength} mm` : t("À définir")],
              [t("Terminaison"), t(terminationLabel(termination))],
            ]} />
            <p className="t-caption mt-3">{t("La famille évolue avec vos réglages. La construction exacte reste à confirmer.")}</p>
            {issues.length ? <ul className="notice-warning lv-notes t-body mt-3">{issues.map(issue => <li key={issue}>{t(issue)}</li>)}</ul> : null}
            <button type="button" className="text-link mt-3 min-h-11" onClick={() => go("configure")}>{t("Modifier la configuration")}</button>
          </section>
          {stage === "review" ? <section className="panel-block-lg lv-fields">
            <h2 className="t-title-m">{t("Câble et connexion")}</h2>
            {config.orientation === "horizontal" && config.count > 1 ? <p className="t-caption">{t("Ces options de câble et de connexion s’appliquent à chaque capteur.")}</p> : null}
            <Field label={t("Longueur de câble souhaitée (mm)")}><Input type="number" min="0" value={cableLength} placeholder={t("À définir")} onChange={e => setCableLength(e.target.value)} /></Field>
            {cableInvalid ? <p className="notice-danger t-body" role="alert">{t("Saisissez une longueur positive ou laissez ce point à définir.")}</p> : null}
            <p className="t-caption">{t("Une gaine est proposée par défaut. Sa matière et les conditions d’exposition seront confirmées.")}</p>
            <Field group label={t("Terminaison")}><Choice label={t("Terminaison")} value={connectorRequested ? "connector" : "bare"} onChange={v => { setConnectorRequested(v === "connector"); if (v === "bare") setTermination(DEFAULT_TERMINATION); }} options={[["bare", t("Fils nus")], ["connector", t("Avec connecteur")]]} /></Field>
            {connectorRequested ? <><ConnectorChoices termination={termination} onSelect={h => setTermination(terminationFromHousing(h))} />
              <Field label={t("Ou votre référence de connecteur")}><Input value={termination.kind === "free_reference" ? termination.text : ""} onChange={e => setTermination(freeReference(e.target.value))} placeholder={t("Fabricant et référence")} /></Field></> : null}
          </section> : null}
          <section className="panel-block-lg space-y-4">
            <h2 className="t-title-m">{t("Détails du projet")}</h2>
            <ProjectContextFields business={business} onChange={next => { setBusiness(next); setExported(false); }} onInvalid={setVolumeError} />
            {context.constraints ? <p className="t-body">{context.constraints}</p> : null}
            <Field label={t("Contraintes complémentaires")}><Textarea value={projectNotes} onChange={e => { setProjectNotes(e.target.value); setExported(false); }} /></Field>
          </section>
        </div>
        <aside className="space-y-4">
          {stage === "review" ? <section className="panel-block-lg space-y-4">
            <h2 className="t-title-m">{t("Avec Standex")}</h2>
            <p className="t-body">{t("Préparez la suite avec notre équipe.")}</p>
            <Button className="lv-continue w-full" disabled={cableInvalid || Boolean(volumeError)} onClick={() => go("standex")}>{t("Continuer avec Standex")}</Button>
            <Button variant="outline" className="lv-continue w-full" onClick={() => go("configure")}>{t("Modifier la configuration")}</Button>
          </section> : <section className="panel-block-lg space-y-3">
            <h2 className="t-title-m">{t("Vos coordonnées")}</h2>
            {([['contactName', t("Nom"), 'text'], ['contactCompany', t("Entreprise"), 'text']] as const).map(([key, label, type]) =>
              <div key={key}><Label htmlFor={`level-${key}`} className="t-label">{label}</Label><Input id={`level-${key}`} className="mt-2 w-full" type={type} value={business[key] ?? ""} onChange={e => { setExported(false); setBusiness(b => ({ ...b, [key]: e.target.value || null })); }} /></div>)}
            <IndustryField business={business} onChange={patch => { setExported(false); setBusiness(b => ({ ...b, ...patch })); }} />
            <div><Label htmlFor="level-email" className="t-label">{t("E-mail professionnel")}</Label><Input id="level-email" className="mt-2 w-full" type="email" value={business.contactEmail ?? ""} onChange={e => { setExported(false); setBusiness(b => ({ ...b, contactEmail: e.target.value || null })); }} /></div>
            <div><Label htmlFor="level-phone" className="t-label">{t("Numéro de téléphone")}</Label><Input id="level-phone" type="tel" autoComplete="tel" maxLength={80} value={business.contactPhone ?? ""} onChange={e => { setExported(false); setBusiness(b => ({ ...b, contactPhone: e.target.value || null })); }} /></div>
            <SelectField label={t("Pays du site")} value={business.siteCountry ?? ""} options={[["", t("Sélectionnez le pays de votre site")], ...COUNTRY_CODES.map(code => [code, countryDisplayName(code, getLocale())] as const).sort((a, b) => a[1].localeCompare(b[1], getLocale()))]} onChange={country => { setExported(false); setBusiness(b => ({ ...b, siteCountry: country || null, siteCity: null })); }} />
            <Field label={t("Ville du site")}><Input value={business.siteCity ?? ""} disabled={!business.siteCountry} maxLength={160} onChange={e => { setExported(false); setBusiness(b => ({ ...b, siteCity: e.target.value || null })); }} /></Field>
            <hr className="standex-rule" />
            <p className="t-caption">{t("Cet aperçu prépare un brouillon. Aucun dossier n’est envoyé à Standex.")}</p>
            <Button className="lv-continue w-full" disabled={Boolean(volumeError) || cableInvalid} onClick={download}><Download size={18} />{t("Télécharger le dossier de travail")}</Button>
            {exported ? <p className="notice-success t-body" role="status">{t("Brouillon téléchargé. Il n’a pas été envoyé à Standex.")}</p> : null}
          </section>}
        </aside>
      </div>
    </main> : null}
  </div>;
}
