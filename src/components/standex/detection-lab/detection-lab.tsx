/** Laboratoire de détection reed — préversion interne staff.
 * Aucune physique ici : tout vient du noyau pur src/lib/detection-lab. */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { t, msg, number } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { downloadText } from "@/lib/standex/export";
import { summarize, ROW_GROUPS, type Calibrations, type PilotRow, type PilotClass, type RowGroup } from "@/lib/detection-lab/pilot";
import { CUT_IDS, classifyPose, suggest, thresholdsFor, type Cut, type CutId, type Suggestion } from "@/lib/detection-lab/classify";
import { PILOT_MAGNETS } from "@/lib/detection-lab/magnets";
import { PROFILE, type DistanceConvention, type ResponseModel } from "@/lib/detection-lab/profile";
import { CATEGORY_LABEL, CAUSE_LABEL, buildReportJson, cutToCsv, cutToJson, cutToSvg, LAB_TOKENS, tableToCsv, type LabPalette } from "@/lib/detection-lab/report";
import { createLabRunner, LabDisposedError, type LabRunner } from "./lab-runner";
import type { Vec3 } from "@/lib/detection-lab/field";
import "./detection-lab.css";

// i18n-canonical : libellés français canoniques, traduits au rendu par t().
// Angle de l'axe d'aimantation dans le plan (x, y), modulo 180° (N/S donnent la même réponse).
const ORIENTATIONS: { deg: number; label: string }[] = [
  { deg: 0, label: "Parallèle aux lames" },
  { deg: 45, label: "Intermédiaire 45°" },
  { deg: 90, label: "Perpendiculaire aux lames" },
  { deg: 135, label: "Intermédiaire 135°" },
];
const axisOf = (deg: number): Vec3 => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180), 0];
const norm180 = (deg: number) => ((deg % 180) + 180) % 180;
const GROUP_LABEL: Record<RowGroup, string> = {
  training: "Apprentissage D1 Form",
  form_control: "Contrôles hors apprentissage D3/D4/D5 Form",
  doc_adaptation: "Adaptations documentaires MK03/MK13 (non indépendantes)",
  quarantine: "Quarantaine MK04",
};
const CUT_LABEL: Record<CutId, string> = {
  "1-parallel-C": "Axes parallèles — classe C",
  "2-perpendicular-centred-C": "Perpendiculaire centré — classe C",
  "3-perpendicular-offset-C": "Perpendiculaire décalé — classe C",
  "4-oblique-45-C": "Orientation intermédiaire 45° — classe C",
  "5-parallel-E": "Axes parallèles — classe E",
  "6-path-C": "Trajet traversant les lobes — classe C",
};
const STATUS_LABEL: Record<PilotRow["status"], string> = {
  training: "Apprentissage",
  control: "Contrôle",
  adaptation: "Adaptation documentaire",
  missing: "Manquant",
  unavailable: "Indisponible",
  quarantine: "Quarantaine",
};
const fmt = (v: number | null, n = 1) => (v == null ? "—" : number(v, n));

/** Palette lue dans le DOM (jetons de charte calculés) : reste côté interface, le noyau n'en dépend pas. */
function paletteFromElement(el: Element): LabPalette {
  const cs = getComputedStyle(el), out = {} as LabPalette;
  for (const [k, tok] of Object.entries(LAB_TOKENS) as [keyof LabPalette, string][]) out[k] = cs.getPropertyValue(tok).trim() || "currentColor";
  return out;
}

export default function DetectionLab({ onClose, runner: injected }: { onClose: () => void; runner?: LabRunner }) {
  useLocale();
  const [model, setModel] = useState<ResponseModel>("A");
  const [conv, setConv] = useState<DistanceConvention>("C1");
  const key = `${model}|${conv}`;
  const [calRes, setCalRes] = useState<{ key: string; cal: Calibrations; rows: PilotRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [magnetId, setMagnetId] = useState(PILOT_MAGNETS[0]!.id);
  const [cutId, setCutId] = useState<CutId>("1-parallel-C");
  const [cutRes, setCutRes] = useState<{ key: string; cut: Cut } | null>(null);
  const runnerRef = useRef<LabRunner | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [palette, setPalette] = useState<LabPalette | null>(null);

  // Un exécuteur par montage ; démontage (fermeture, session révoquée) = arrêt réel des calculs.
  useEffect(() => {
    const r = injected ?? createLabRunner();
    runnerRef.current = r;
    return () => { runnerRef.current = null; r.dispose(); };
  }, [injected]);
  useEffect(() => { if (rootRef.current) setPalette(paletteFromElement(rootRef.current)); }, []);

  useEffect(() => {
    const r = runnerRef.current;
    if (!r) return;
    let current = true;
    setError(null);
    r.run({ kind: "calibrate", model, conv }).then(
      (res) => { if (current && res.kind === "calibrate") setCalRes({ key, cal: res.cal, rows: res.rows }); },
      (e) => { if (current && !(e instanceof LabDisposedError)) setError(t("Le calcul a échoué. Aucun résultat n'est affiché.")); },
    );
    return () => { current = false; };
  }, [model, conv, key]);

  const live = calRes && calRes.key === key ? calRes : null;
  const cal = live?.cal ?? null;
  const rows = useMemo(() => live?.rows ?? [], [live]);
  const busy = !live && !error;
  const cutKey = `${key}|${cutId}|${magnetId}`;
  useEffect(() => {
    const r = runnerRef.current;
    if (!r || !cal) return;
    let current = true;
    r.run({ kind: "cut", cutId, magnetId, model, conv, cal }).then(
      (res) => { if (current && res.kind === "cut") setCutRes({ key: cutKey, cut: res.cut }); },
      (e) => { if (current && !(e instanceof LabDisposedError)) setError(t("Le calcul a échoué. Aucun résultat n'est affiché.")); },
    );
    return () => { current = false; };
  }, [cal, cutId, magnetId, model, conv, cutKey]);
  const cut = cutRes && cutRes.key === cutKey ? cutRes.cut : null;
  const cutBusy = !!cal && !cut && !error;

  const summary = useMemo(() => summarize(rows), [rows]);
  const svg = useMemo(() => (cut && palette ? cutToSvg(cut, palette, (s) => t(s)) : ""), [cut, palette]);
  const base = `laboratoire-${model}-${conv}`;

  return (
    <div className="lab" ref={rootRef}>
      <header className="lab-head">
        <Button variant="ghost" onClick={onClose}><ArrowLeft size={18} /> {t("Retour au banc")}</Button>
        <div>
          <p className="t-label">{t("Préversion interne staff")}</p>
          <h1 className="t-title-l">{t("Laboratoire de détection")}</h1>
          <p className="t-body">{t("Placements favorables et ordres de grandeur pédagogiques. Jamais une garantie de commutation au millimètre.")}</p>
        </div>
      </header>

      <div className="lab-controls panel-block">
        <label className="lab-field"><span className="t-label">{t("Modèle de réponse")}</span>
          <select value={model} onChange={(e) => setModel(e.target.value as ResponseModel)}>
            <option value="A">{t("A — intégrale signée")}</option>
            <option value="B">{t("B — deux lames, minimum")}</option>
          </select>
        </label>
        <label className="lab-field"><span className="t-label">{t("Convention de distance")}</span>
          <select value={conv} onChange={(e) => setConv(e.target.value as DistanceConvention)}>
            <option value="C1">{t("C1 — jeu face d'aimant")}</option>
            <option value="C2">{t("C2 — centre de l'aimant (variante)")}</option>
          </select>
        </label>
        <p className="t-caption">{msg("Profil {0} v{1}", [PROFILE.id, PROFILE.version])}</p>
      </div>

      {error && <p className="notice-danger" role="alert">{error}</p>}
      {busy && <p className="notice-info" role="status" aria-live="polite">{t("Calcul des seuils partagés…")}</p>}

      {!busy && cal && (
        <Tabs defaultValue="table">
          <TabsList className="lab-tabs">
            <TabsTrigger value="table">{t("Tableau de cohérence")}</TabsTrigger>
            <TabsTrigger value="cuts">{t("Six coupes")}</TabsTrigger>
            <TabsTrigger value="trial">{t("Essai de placement")}</TabsTrigger>
            <TabsTrigger value="hyp">{t("Hypothèses")}</TabsTrigger>
          </TabsList>

          <TabsContent value="table">
            <section className="panel-block lab-section">
              <h2 className="t-title-m">{t("Seuils partagés entre aimants")}</h2>
              <ThresholdTable cal={cal} />
              <h2 className="t-title-m">{t("Bilan")}</h2>
              <p className="t-body">{t("Seuls les contrôles D3/D4/D5 Form sont hors apprentissage. Les adaptations MK03/MK13 ne sont pas des validations physiques indépendantes et n'entrent pas dans la comparaison A/B.")}</p>
              <div className="lab-table-wrap" tabIndex={0} aria-label={t("Bilan")}>
                <table className="lab-table">
                  {/* i18n-canonical : en-têtes traduits par t(h) */}
                  <thead><tr>{["Groupe", "Lignes", "Publiées", "Absentes", "Estimées", "Écart moyen mm", "Médiane %", "> 20 %"].map((h) => <th key={h} scope="col">{t(h)}</th>)}</tr></thead>
                  <tbody>
                    {ROW_GROUPS.map((g) => { const x = summary.groups[g]; return (
                      <tr key={g}><td>{t(GROUP_LABEL[g])}</td><td className="t-metric">{x.rows}</td><td className="t-metric">{x.published}</td><td className="t-metric">{x.missing}</td><td className="t-metric">{x.estimated}</td><td className="t-metric">{fmt(x.meanAbsMm, 2)}</td><td className="t-metric">{fmt(x.medianAbsPct, 1)}</td><td className="t-metric">{x.over20} / {x.estimated}</td></tr>
                    ); })}
                  </tbody>
                </table>
              </div>
              <div className="lab-actions">
                <Button variant="secondary" onClick={() => downloadText(`${base}-tableau.csv`, tableToCsv(rows), "text/csv")}><Download size={16} /> CSV</Button>
                <Button variant="secondary" onClick={() => downloadText(`${base}-rapport.json`, JSON.stringify(buildReportJson(model, conv, cal, rows), null, 1), "application/json")}><Download size={16} /> JSON</Button>
              </div>
              <div className="lab-table-wrap" tabIndex={0} aria-label={t("Tableau publié, estimé, écart et anomalie")}>
                <table className="lab-table">
                  {/* i18n-canonical : en-têtes traduits par t(h) */}
                  <thead><tr>{["Source", "Page", "Référence", "Aimant", "Classe", "D", "Borne", "Publié", "Estimé", "Écart mm", "Écart %", "Statut", "Anomalies"].map((h) => <th key={h} scope="col">{t(h)}</th>)}</tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} data-status={r.status}>
                        <td>{r.source}</td><td className="t-metric">{r.page}</td><td>{r.reference}</td><td>{r.magnet}</td><td>{r.className}</td><td>{r.approach}</td><td>{r.bound}</td>
                        <td className="t-metric">{fmt(r.published, 2)}</td><td className="t-metric">{fmt(r.estimated, 1)}</td><td className="t-metric">{fmt(r.errorMm, 1)}</td><td className="t-metric">{fmt(r.errorPct, 0)}</td>
                        <td>{t(STATUS_LABEL[r.status])}</td><td>{r.anomalies.map((a) => t(a)).join(" · ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="cuts">
            <section className="panel-block lab-section">
              <div className="lab-controls">
                <label className="lab-field"><span className="t-label">{t("Aimant")}</span>
                  <select value={magnetId} onChange={(e) => setMagnetId(e.target.value as typeof magnetId)}>
                    {PILOT_MAGNETS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </label>
                <label className="lab-field"><span className="t-label">{t("Coupe")}</span>
                  <select value={cutId} onChange={(e) => setCutId(e.target.value as CutId)}>
                    {CUT_IDS.map((c, i) => <option key={c} value={c}>{`${i + 1}. ${t(CUT_LABEL[c])}`}</option>)}
                  </select>
                </label>
              </div>
              {cutBusy && <p className="notice-info" role="status" aria-live="polite">{t("Calcul de la coupe…")}</p>}
              {cut && (
                <>
                  <figure className="lab-figure">
                    <figcaption className="t-title-s">{`${t(cut.title)} · ${cut.magnetId} · ${t("modèle")} ${cut.model} · ${cut.convention}`}</figcaption>
                    <div className="lab-svg" tabIndex={0} aria-label={t("Coupe 2D, défilement horizontal")} dangerouslySetInnerHTML={{ __html: svg }} />
                    <ul className="lab-legend t-body">
                      {(["favorable", "variable"] as const).map((c) => <li key={c}>{t(CATEGORY_LABEL[c])}</li>)}
                      {(["too_far", "orientation", "undetermined"] as const).map((c) => <li key={c}>{t(CATEGORY_LABEL.unfavorable)} — {t(CAUSE_LABEL[c])}</li>)}
                      <li>{t(CATEGORY_LABEL.unavailable)}</li>
                    </ul>
                  </figure>
                  <p className="t-caption">{msg("Calculée en {0} ms sur {1} scénarios déterministes.", [cut.computeMs, PROFILE.scenarios.length])}</p>
                  <div className="lab-actions">
                    <Button variant="secondary" disabled={!svg} onClick={() => downloadText(`${cut.id}-${cut.magnetId}-${model}.svg`, svg, "image/svg+xml")}><Download size={16} /> SVG</Button>
                    <Button variant="secondary" onClick={() => downloadText(`${cut.id}-${cut.magnetId}-${model}.csv`, cutToCsv(cut), "text/csv")}><Download size={16} /> CSV</Button>
                    <Button variant="secondary" onClick={() => downloadText(`${cut.id}-${cut.magnetId}-${model}.json`, cutToJson(cut), "application/json")}><Download size={16} /> JSON</Button>
                  </div>
                </>
              )}
            </section>
          </TabsContent>

          <TabsContent value="trial"><Trial cal={cal} model={model} /></TabsContent>

          <TabsContent value="hyp">
            <section className="panel-block lab-section">
              <h2 className="t-title-m">{t("Hypothèses et provenance")}</h2>
              <p className="notice-warning">{t("Hypothèses de modèle, non qualifiées. Le centre et les seuils ne caractérisent aucun montage réel.")}</p>
              <ul className="t-body lab-list">
                <li>{t(PROFILE.conventions.C1)}</li><li>{t(PROFILE.conventions.C2)}</li>
                {Object.values(PROFILE.approaches).map((a) => <li key={a}>{t(a)}</li>)}
                <li>{t(PROFILE.models.A)}</li><li>{t(PROFILE.models.B)}</li>
              </ul>
              <h3 className="t-title-s">{t("Scénarios déterministes")}</h3>
              <p className="code-block">{PROFILE.scenarios.map((s) => s.id).join(" · ")}</p>
              <h3 className="t-title-s">{t("Aimants pilotes")}</h3>
              <ul className="t-body lab-list">
                {PILOT_MAGNETS.map((m) => <li key={m.id}><span className="t-metric">{m.label} — q {number(m.q, 2)} · m {number(m.momentAm2, 5)} A·m² · J {number(m.jT, 3)} T</span></li>)}
              </ul>
            </section>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function ThresholdTable({ cal }: { cal: Calibrations }) {
  return (
    <div className="lab-table-wrap" tabIndex={0} aria-label={t("Seuils partagés entre aimants")}>
      <table className="lab-table">
        {/* i18n-canonical : en-têtes traduits par t(h) */}
        <thead><tr>{["Classe", "Borne", "Seuil SmCo", "Seuil N45", "Désaccord", "Seuil partagé", "SmCo→N45", "N45→SmCo"].map((h) => <th key={h} scope="col">{t(h)}</th>)}</tr></thead>
        <tbody>
          {Object.values(cal).map((s) => {
            const sn = s.cross.find((x) => x.fromMagnet === "SMCO5-5X4"), ns = s.cross.find((x) => x.fromMagnet === "N45-4X19");
            return (
              <tr key={s.className + s.bound}>
                <td>{s.className}</td><td>{s.bound}</td>
                <td className="t-metric">{fmt(s.implied["SMCO5-5X4"] ?? null, 2)} mT</td><td className="t-metric">{fmt(s.implied["N45-4X19"] ?? null, 2)} mT</td>
                <td className="t-metric">×{fmt(s.disagreement, 2)}</td><td className="t-metric">{fmt(s.shared, 2)} mT</td>
                <td className="t-metric">{fmt(sn?.predictedMm ?? null, 1)} / {fmt(sn?.publishedMm ?? null, 1)} mm</td>
                <td className="t-metric">{fmt(ns?.predictedMm ?? null, 1)} / {fmt(ns?.publishedMm ?? null, 1)} mm</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Trial({ cal, model }: { cal: Calibrations; model: ResponseModel }) {
  const [magnetId, setMagnetId] = useState(PILOT_MAGNETS[0]!.id);
  const [deg, setDeg] = useState(90);
  const [cls, setCls] = useState<PilotClass>("C");
  const [x, setX] = useState(0);
  const [y, setY] = useState(8);
  const [sugg, setSugg] = useState<Suggestion | null | undefined>(undefined);
  const magnet = PILOT_MAGNETS.find((m) => m.id === magnetId)!;
  const axis = useMemo(() => axisOf(deg), [deg]);
  const th = thresholdsFor(cal, cls);
  const result = useMemo(() => classifyPose(magnet, { center: [x, y, 0], axis }, th, model), [magnet, x, y, axis, th, model]);
  useEffect(() => setSugg(undefined), [magnetId, deg, cls, x, y, model]);
  const tone = result.category === "favorable" ? "notice-success" : result.category === "variable" ? "notice-info" : result.category === "unfavorable" ? "notice-warning" : "notice-danger";
  return (
    <section className="panel-block lab-section">
      <div className="lab-controls">
        <label className="lab-field"><span className="t-label">{t("Aimant")}</span>
          <select value={magnetId} onChange={(e) => setMagnetId(e.target.value as typeof magnetId)}>{PILOT_MAGNETS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
        </label>
        <label className="lab-field"><span className="t-label">{t("Orientation")}</span>
          <select value={deg} onChange={(e) => setDeg(Number(e.target.value))}>{ORIENTATIONS.map((o) => <option key={o.deg} value={o.deg}>{t(o.label)}</option>)}</select>
        </label>
        <label className="lab-field"><span className="t-label">{t("Classe")}</span>
          <select value={cls} onChange={(e) => setCls(e.target.value as PilotClass)}><option value="C">C</option><option value="E">E</option></select>
        </label>
        <label className="lab-field"><span className="t-label">{msg("x le long des lames : {0} mm", [number(x, 1)])}</span>
          <input type="range" min={-20} max={20} step={0.5} value={x} onChange={(e) => setX(Number(e.target.value))} />
        </label>
        <label className="lab-field"><span className="t-label">{msg("y centre de l'aimant : {0} mm", [number(y, 1)])}</span>
          <input type="range" min={0} max={24} step={0.5} value={y} onChange={(e) => setY(Number(e.target.value))} />
        </label>
      </div>
      <p className={tone} role="status" aria-live="polite">
        <strong>{t(CATEGORY_LABEL[result.category])}</strong>
        {result.cause && <> — {t(CAUSE_LABEL[result.cause])}</>}
        {result.cause === "orientation" && <> · {t("L'aimant est proche, mais une rotation à la même place augmenterait le couplage.")}</>}
        {result.cause === "too_far" && <> · {t("Parmi les orientations testées, aucune ne suffit à cette place ; un rapprochement valide dans le même alignement atteindrait le seuil.")}</>}
        {result.cause === "undetermined" && <> · {t("Ni la rotation de ±90° ni le rapprochement testés n'atteignent le seuil : décentrage, orientation oblique ou collision à examiner.")}</>}
        {result.category === "unavailable" && <> · {t("Collision, hors domaine ou seuil absent : aucune estimation.")}</>}
      </p>
      <div className="lab-actions">
        <Button variant="secondary" disabled={result.category === "favorable" || result.category === "unavailable"} onClick={() => setSugg(suggest(magnet, { center: [x, y, 0], axis }, th, model))}>{t("Proposer un déplacement ou une rotation")}</Button>
      </div>
      {sugg === null && <p className="notice-info">{t("Aucun décalage le long des lames ni rotation de ±90° dans le plan n'améliore la catégorie.")}</p>}
      {sugg && (
        <p className="notice-success">
          {sugg.kind === "shift" ? msg("Décaler de {0} mm le long des lames", [number(sugg.dxMm, 0)]) : msg("Tourner de {0}° dans le plan", [sugg.degrees > 0 ? "+90" : "−90"])}
          {" → "}{t(CATEGORY_LABEL[sugg.after])}{" "}{t("(recalculé et vérifié)")}
          {" "}<Button variant="ghost" onClick={() => (sugg.kind === "shift" ? setX(sugg.pose.center[0]) : setDeg(norm180(deg + sugg.degrees)))}>{t("Appliquer")}</Button>
        </p>
      )}
      <p className="t-caption">{msg("Accord requis des {0} scénarios avec un retrait de frontière de {1} %. Pas de pourcentage de confiance.", [PROFILE.scenarios.length, PROFILE.classification.boundaryMargin * 100])}</p>
    </section>
  );
}
