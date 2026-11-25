import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Droplets, SlidersHorizontal, Play, Pause, Pencil, Download, Lightbulb, ChevronDown } from "lucide-react";
import { LevelProjectHeader } from "./level-project-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NeedExamples } from "@/components/leadmagnet/need-examples";
import { SceneLoading } from "./scene-loading";
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
  illustrativeReading, INITIAL_CONFIGURATION, INITIAL_CONTEXT, requestedFloats, setPointCount,
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
  const assessment = assessConfiguration(context, config);
  const issues = configurationIssues(config);
  const errors = contextErrors(context);
  const cableInvalid = cableLength.trim() !== "" && (!Number.isFinite(Number(cableLength)) || Number(cableLength) <= 0);
  const selected = assessment.selected;
  const family = selected?.family ?? architectureFamily(config);
  const reading = illustrativeReading(config, level);
  const signalAvailable = reading.usable && selected !== null && errors.length === 0;
  const specific = assessment.specific || issues.length > 0;
  const currentIndex = stages.findIndex(s => s.id === stage);
  const changeConfig = (patch: Partial<LevelConfiguration>) => { setPlaying(false); setConfig(c => ({ ...c, ...patch })); setExported(false); };
  const changeContext = (patch: Partial<LevelContext>) => { setContext(c => ({ ...c, ...patch })); setExported(false); };
  const go = (s: Stage) => { setPlaying(false); setExported(false); setStage(s); };
  const classic = () => onClassic ? onClassic() : window.location.assign("/");

  useEffect(() => {
    if (!active) return;
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.closest("main")?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [stage, question, active]);
  useEffect(() => { if (!active || reduced) setPlaying(false); }, [active, reduced]);
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
  const returnFromLiquid = returnToConfig && question === 1;
  const advanceQuestion = () => {
    if (returnFromLiquid || question === 2) { setReturnToConfig(false); go("configure"); }
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
    {active ? <LevelScene configuration={config} family={family} material={selected?.material ?? "PP"} levelMm={level} oil={context.fluid === "oil"} productOnly={productOnly} /> : null}
  </Suspense>;

  return <div className={`lv-journey${embedded ? " lv-embedded" : ""}`} data-readable>
    {!embedded ? <LevelProjectHeader title={projectTitle ?? t("Nouveau projet")} onRename={setProjectTitle} onChoice={() => go("choice")} onClassic={classic} /> : null}
    {stage !== "choice" ? <nav className={`project-stepper project-stepper-${currentIndex} project-stepper-sticky lv-project-stepper`} aria-label={t("Étapes du projet de niveau")}>
      <span className="project-stepper-thumb" aria-hidden="true" />
      {stages.map((s, i) => <button type="button" key={s.id} aria-current={stage === s.id ? "step" : undefined}
        onClick={() => { if (s.id === "questions") { setQuestion(0); setReturnToConfig(false); } go(s.id); }}
        className={`relative z-10 min-h-11 bg-transparent px-4 py-3 text-left transition-colors duration-[var(--d-base)] ${stage === s.id ? "text-[var(--heading)]" : "text-[var(--muted-foreground)]"}`}>
        <span className="project-stepper-content flex min-w-0 items-center gap-2 text-base font-semibold">
          <span className={`standex-bar !h-3 !w-1 transition-opacity duration-[var(--d-base)] ${stage === s.id ? "opacity-100" : "opacity-25"}`} aria-hidden="true" />
          <span className="project-stepper-label">{i + 1}. {s.label}</span>
        </span>
      </button>)}
    </nav> : null}
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
            <p className="t-body">{t("Détecter un niveau bas, plusieurs seuils ou suivre la hauteur du liquide.")}</p>
            <Button onClick={() => { setQuestion(0); setReturnToConfig(false); go("questions"); }}>{t("Configurer un capteur de niveau")}</Button></div>
        </section>
      </div>
    </main> : null}

    {stage === "questions" ? <main className="lv-question-main">
      <section className="questionnaire-card" aria-labelledby="level-question-title">
        <div className="questionnaire-meta"><p className="questionnaire-count t-caption">{t("Question")} {question + 1} {t("sur")} 3</p>
          <p className="questionnaire-category t-label">{t(["L’application", "Le liquide", "La cuve"][question]!)}</p></div>
        <div className="questionnaire-progress" aria-hidden="true"><div style={{ width: `${(question + 1) / 3 * 100}%` }} /></div>
        <h1 id="level-question-title" className="t-title-l mt-5" ref={headingRef} tabIndex={-1}>
          {t(["Dans quel équipement, et pour quoi faire ?", "Quel liquide, à quelles températures ?", "Dans quelles conditions le capteur sera-t-il installé ?"][question]!)}</h1>
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
            </> : <>
              <SelectField label={t("Cuve")} value={context.tank} onChange={v => changeContext({ tank: v as LevelContext["tank"] })}
                options={[["unknown", t("À définir")], ["vented", t("À pression atmosphérique")], ["pressurised", t("Sous pression ou sous vide")]]} />
              <SelectField label={t("Immersion du corps du capteur")} value={context.bodyExposure} onChange={v => changeContext({ bodyExposure: v as LevelContext["bodyExposure"] })}
                options={[["unknown", t("À définir")], ["permanent", t("En permanence")], ["intermittent", t("Par intermittence")]]} />
              <SelectField label={t("Sortie de câble et câble")} value={context.cableExposure} onChange={v => changeContext({ cableExposure: v as LevelContext["cableExposure"] })}
                options={[["unknown", t("À définir")], ["dry", t("Restent hors du liquide")], ["wet", t("Seront immergés, même occasionnellement")]]} />
              <Field label={t("Contraintes à connaître")} hint={t("Facultatif")}><Textarea rows={3} value={context.constraints} onChange={e => changeContext({ constraints: e.target.value })}
                placeholder={t("Accès uniquement par le haut, nettoyage, liquide agité, espace étroit…")} /></Field>
            </>}
          </div>
          <aside className="questionnaire-examples">
            <NeedExamples key={question} questionKey={["level_application", "level_liquid", "level_installation"][question]!} />
          </aside>
        </div>
        <div className="questionnaire-navigation lv-question-nav">
          <Button variant="ghost" onClick={() => question > 0 ? setQuestion(q => q - 1) : go("choice")}>{t("Précédent")}</Button>
          <Button variant="secondary" onClick={advanceQuestion} disabled={question === 1 && errors.length > 0}>{t("À préciser plus tard")}</Button>
          <Button size="lg" disabled={question === 1 && errors.length > 0} onClick={advanceQuestion}>
            {t(returnFromLiquid ? "Revenir au configurateur" : question === 2 ? "Ouvrir le configurateur" : "Continuer")}</Button>
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
        <aside className="lv-controls panel-block">
          <h2 className="t-title-s">{t("Votre configuration")}</h2>
          <Choice label={t("Mode de détection")} value={config.mode} onChange={mode => changeConfig({ mode })} options={[["points", t("Par points")], ["continuous", t("En continu")]]} />
          {config.mode === "points" ? <SelectField label={t("Points de détection souhaités")} value={String(config.count)} onChange={v => { setPlaying(false); setConfig(c => setPointCount(c, Number(v))); }}
            options={Array.from({ length: 12 }, (_, i) => [String(i + 1), `${i + 1} ${t(i === 0 ? "point" : "points")}`] as const)} /> :
            <p className="t-caption">{t("Un flotteur suit la hauteur. Le LS05 inox est la piste pour le continu.")}</p>}
          {config.mode === "points" ? <p className="t-caption text-muted-foreground">{t("Changer le nombre répartit les points et allonge la tige si nécessaire.")}</p> : null}
          <Field group label={t("Orientation")}><Choice label={t("Orientation")} value={config.orientation} onChange={orientation => changeConfig({ orientation })}
            options={[["vertical", t("Verticale")], ["horizontal", t("Horizontale")]]} /></Field>
          {config.orientation === "vertical" ? <Field group label={t("Fixation dans la cuve")}><Choice label={t("Fixation")} value={config.mounting} onChange={mounting => changeConfig({ mounting })}
            options={[["top", t("Par le haut")], ["bottom", t("Par le fond")]]} /></Field> :
            <SelectField label={t("Finition de montage")} value={config.connection} onChange={v => changeConfig({ connection: v as LevelConfiguration["connection"] })}
              options={[["standard", t("Standard")], ["DK", "DK"], ["DL", "DL"], ["GZ", "GZ"]]} />}
          <RangeField label={t("Hauteur utile de la cuve")} value={config.tankHeightMm} min={60} max={600} step={10} onChange={height => {
            setLevel(l => Math.min(l, height)); changeConfig({ tankHeightMm: height });
          }} />
          {config.orientation === "vertical" ? <RangeField label={t("Longueur souhaitée sous fixation")} value={config.reachMm} min={25} max={600} step={0.5} onChange={reachMm => changeConfig({ reachMm })} /> : null}
          {config.mode === "points" ? <>
            <div className="lv-field"><h3 className="t-body font-semibold">{t("Position des points")}</h3><p className="t-caption text-muted-foreground">{t("Hauteurs souhaitées depuis le fond de la cuve.")}</p></div>
            {config.pointsMm.map((point, i) => <RangeField key={i} label={`${t("Point")} ${i + 1}`} value={point} min={0} max={config.tankHeightMm}
              onChange={v => changeConfig({ pointsMm: config.pointsMm.map((p, index) => index === i ? v : p) })} />)}
            {config.count > 1 ? <SelectField label={t("Répartition sur les flotteurs")} value={String(config.pointsPerFloat)}
              onChange={v => changeConfig({ pointsPerFloat: Number(v) as 1 | 2 })} options={[["2", t("Jusqu’à 2 points par flotteur")], ["1", t("1 point par flotteur")]]} /> :
              <SelectField label={t("Signal demandé")} value={config.closedWhen} onChange={v => changeConfig({ closedWhen: v as "low" | "high" })}
                options={[["low", t("Circuit fermé au niveau bas")], ["high", t("Circuit fermé au niveau haut")]]} />}
          </> : null}
        </aside>
        <section className="lv-visual-column" aria-label={t("Simulation du niveau de liquide")}>
          <div className="lv-visual surface">
            <div className="lv-visual-title"><div><p className="t-label">{t("Dans votre cuve")}</p><p className="t-caption text-muted-foreground">{t("Vue en coupe · enveloppes reconstruites d’après les fiches")}</p></div>
              <span className="lv-preview t-caption">{t("Illustration du besoin")}</span></div>
            <div className="lv-canvas" role="img" aria-label={t("Cuve, liquide et flotteurs mobiles")}>{!config.custom && selected && issues.length === 0 ? scene() :
              <div className="lv-empty"><SlidersHorizontal size={40} /><h2 className="t-title-m">{t(config.custom ? "Une forme adaptée à votre application" : "Une configuration à étudier")}</h2>
                <p className="t-body">{t(!config.custom && issues[0] ? issues[0] : "Votre besoin reste conservé. Décrivez les contraintes pour préparer l’étude avec Standex.")}</p></div>}</div>
            <div className="lv-playback">
              <div className="lv-between"><h2 className="t-title-s">{t("Faire varier le liquide")}</h2><output className="t-metric t-body">{Math.round(level)} / {config.tankHeightMm} mm</output></div>
              <input type="range" className="lv-range" aria-label={t("Hauteur du liquide")} min={0} max={config.tankHeightMm} value={level} step={1} onChange={e => { setPlaying(false); setLevel(Number(e.target.value)); }} />
              <div className="lv-play-actions"><Choice label={t("Sens de variation")} value={direction} onChange={d => { setPlaying(false); setDirection(d); }} options={[["up", t("Remplissage")], ["down", t("Vidange")]]} />
                <Button disabled={reduced} onClick={() => {
                  if (!playing && direction === "up" && level >= config.tankHeightMm) setLevel(0);
                  if (!playing && direction === "down" && level <= 0) setLevel(config.tankHeightMm);
                  setPlaying(v => !v);
                }}>{playing ? <Pause size={18} /> : <Play size={18} />}{t(playing ? "Pause" : "Lancer")}</Button></div>
              {reduced ? <p className="t-caption">{t("Mouvements réduits : utilisez le curseur pour changer le niveau.")}</p> : null}
            </div>
          </div>
          <section className="lv-output panel-block" aria-label={t("Lecture de la détection souhaitée")}>
            <div className="lv-between"><h2 className="t-title-s">{t("Ce que vous souhaitez lire")}</h2><span className="t-caption text-muted-foreground">{t("Seuils à confirmer par Standex")}</span></div>
            {!signalAvailable ? <p className="notice-info t-body">{t("Le signal reste à définir pour cette configuration.")}</p> : config.mode === "continuous" ?
              <div className="lv-reading"><span className="t-display-m t-metric">{reading.steppedMm} <span className="t-body">mm</span></span><p className="t-body">{t("Lecture illustrée par pas de 5 mm, sans garantie d’exactitude.")}</p></div> :
              config.count === 1 ? <div className="lv-circuit" data-on={reading.active}>
                <svg viewBox="0 0 200 72" role="img" aria-label={t(reading.active ? "Circuit fermé" : "Circuit ouvert")}>
                  <path d="M 36 36 V 10 H 83 M 117 10 H 170 V 62 H 36 V 48" />
                  <path d={reading.active ? "M 83 10 H 117" : "M 83 10 L 114 0"} />
                  <path d="M 25 36 H 47 M 30 48 H 42" /><circle cx="170" cy="36" r="13" />
                  <path d="M 162 28 L 178 44 M 178 28 L 162 44" />
                </svg><Lightbulb className="lv-lamp" size={36} aria-hidden="true" /><div><p className="t-title-m">{t(reading.active ? "Signal actif" : "Signal inactif")}</p>
                  <p className="t-body">{t(reading.active ? "Circuit demandé fermé" : "Circuit demandé ouvert")}</p></div></div> :
                <div className="lv-zone-output"><p className="t-title-m">{t("Zone")} {reading.zone + 1} / {config.count + 1}</p>
                  <div className="lv-zone-strip" aria-hidden="true">{Array.from({ length: config.count + 1 }, (_, i) => <span key={i} data-active={i === reading.zone} />)}</div>
                  <div className="lv-thresholds">{config.pointsMm.map((point, i) => <span key={i} data-active={level >= point}>{t("Point")} {i + 1} · {point} mm · {t(level >= point ? "dépassé" : "non atteint")}</span>)}</div>
                  <p className="t-caption">{requestedFloats(config)} {t("flotteur(s)")} · {config.count} {t("points de commutation souhaités")}. {t("Codage par résistances à définir avec Standex.")}</p>
                </div>}
          </section>
        </section>
        <aside className="lv-study-column">
          <section className="panel-block lv-family-card" aria-live="polite">
            <p className="t-label">{t(specific ? "Demande spécifique" : "Piste à étudier")}</p>
            <h2 className="t-display-m">{config.custom ? t("Sur mesure") : selected ? selected.family : t("Avec Standex")}</h2>
            {selected ? <><p className="t-title-s">{t(FAMILY_LABELS[selected.family])}</p><p className="t-body">{t(selected.material === "SS" ? "Tige inox" : selected.material === "PP" ? "Matériau à envisager : PP" : selected.material === "PA" ? "Matériau à envisager : PA" : "Matériau à définir")}</p></> : null}
            <p className="t-caption">{t("La famille évolue avec vos réglages. La construction exacte reste à confirmer.")}</p>
          </section>
          {issues.length ? <div className="notice-warning"><h3 className="t-title-s">{t("À ajuster")}</h3><ul className="lv-notes t-body">{issues.map(x => <li key={x}>{t(x)}</li>)}</ul></div> : null}
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
        </aside>
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
              [t("Montage"), config.orientation === "vertical" ? `${t("Vertical")} · ${t(config.mounting === "top" ? "par le haut" : "par le fond")}` : `${t("Horizontal")} · ${config.connection}`],
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
