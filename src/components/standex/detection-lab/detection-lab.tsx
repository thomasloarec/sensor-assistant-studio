/** Laboratoire de détection reed — préversion interne staff.
 * Aucune physique ici : tout vient du noyau pur src/lib/detection-lab. */
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { t, msg, number } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { downloadText } from "@/lib/standex/export";
import { buildCalibrations, buildPilotTable, summarize, type Calibrations, type PilotRow, type PilotClass } from "@/lib/detection-lab/pilot";
import { CUT_IDS, classifyPose, computeCutById, suggest, thresholdsFor, type Cut, type CutId, type Suggestion } from "@/lib/detection-lab/classify";
import { PILOT_MAGNETS } from "@/lib/detection-lab/magnets";
import { PROFILE, type DistanceConvention, type ResponseModel } from "@/lib/detection-lab/profile";
import { CATEGORY_LABEL, CAUSE_LABEL, buildReportJson, cutToCsv, cutToJson, cutToSvg, tableToCsv } from "@/lib/detection-lab/report";
import type { Vec3 } from "@/lib/detection-lab/field";
import "./detection-lab.css";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const ORIENTATIONS: { id: string; label: string; axis: Vec3 }[] = [
  { id: "par", label: "Parallèle aux lames", axis: [1, 0, 0] },
  { id: "perp", label: "Perpendiculaire aux lames", axis: [0, 1, 0] },
  { id: "45", label: "Intermédiaire 45°", axis: [Math.SQRT1_2, Math.SQRT1_2, 0] },
];
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
  missing: "Manquant",
  unavailable: "Indisponible",
  quarantine: "Quarantaine",
};
const fmt = (v: number | null, n = 1) => (v == null ? "—" : number(v, n));

export default function DetectionLab({ onClose }: { onClose: () => void }) {
  useLocale();
  const [model, setModel] = useState<ResponseModel>("A");
  const [conv, setConv] = useState<DistanceConvention>("C1");
  const [cal, setCal] = useState<Calibrations | null>(null);
  const [rows, setRows] = useState<PilotRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [magnetId, setMagnetId] = useState(PILOT_MAGNETS[0]!.id);
  const [cutId, setCutId] = useState<CutId>("1-parallel-C");
  const [cut, setCut] = useState<Cut | null>(null);
  const [cutBusy, setCutBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setBusy(true); setError(null); setCal(null); setRows([]);
    (async () => {
      try {
        await tick();
        const c = buildCalibrations(model, conv);
        await tick();
        const r = buildPilotTable(model, conv, c);
        if (alive) { setCal(c); setRows(r); }
      } catch {
        if (alive) setError(t("Le calcul a échoué. Aucun résultat n'est affiché."));
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [model, conv]);

  const magnet = PILOT_MAGNETS.find((m) => m.id === magnetId)!;
  useEffect(() => {
    if (!cal) return;
    let alive = true;
    setCutBusy(true); setCut(null);
    (async () => {
      await tick();
      try { const c = computeCutById(cutId, magnet, model, conv, cal); if (alive) setCut(c); }
      catch { if (alive) setError(t("Le calcul a échoué. Aucun résultat n'est affiché.")); }
      finally { if (alive) setCutBusy(false); }
    })();
    return () => { alive = false; };
  }, [cal, cutId, magnet, model, conv]);

  const summary = useMemo(() => summarize(rows), [rows]);
  const svg = useMemo(() => (cut ? cutToSvg(cut, (s) => t(s)) : ""), [cut]);
  const base = `laboratoire-${model}-${conv}`;

  return (
    <div className="lab">
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
              <p className="t-body">
                {msg("{0} lignes : {1} apprentissage, {2} contrôles, {3} manquantes, {4} indisponibles, {5} en quarantaine.", [summary.total, summary.byStatus.training, summary.byStatus.control, summary.byStatus.missing, summary.byStatus.unavailable, summary.byStatus.quarantine])}
                {" "}
                {msg("Écart moyen des contrôles {0} mm, médiane {1} %, {2} contrôles au-delà de 20 %.", [fmt(summary.controls.meanAbsMm, 2), fmt(summary.controls.medianAbsPct, 1), summary.controls.over20])}
              </p>
              <div className="lab-actions">
                <Button variant="secondary" onClick={() => downloadText(`${base}-tableau.csv`, tableToCsv(rows), "text/csv")}><Download size={16} /> CSV</Button>
                <Button variant="secondary" onClick={() => downloadText(`${base}-rapport.json`, JSON.stringify(buildReportJson(model, conv, cal, rows), null, 1), "application/json")}><Download size={16} /> JSON</Button>
              </div>
              <div className="lab-table-wrap" tabIndex={0} aria-label={t("Tableau publié, estimé, écart et anomalie")}>
                <table className="lab-table">
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
                  <div className="lab-svg" dangerouslySetInnerHTML={{ __html: svg }} />
                  <p className="t-caption">{msg("Calculée en {0} ms sur {1} scénarios déterministes.", [cut.computeMs, PROFILE.scenarios.length])}</p>
                  <div className="lab-actions">
                    <Button variant="secondary" onClick={() => downloadText(`${cut.id}-${cut.magnetId}-${model}.svg`, cutToSvg(cut), "image/svg+xml")}><Download size={16} /> SVG</Button>
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
  const [orient, setOrient] = useState("perp");
  const [cls, setCls] = useState<PilotClass>("C");
  const [x, setX] = useState(0);
  const [y, setY] = useState(8);
  const [sugg, setSugg] = useState<Suggestion | null | undefined>(undefined);
  const magnet = PILOT_MAGNETS.find((m) => m.id === magnetId)!;
  const axis = ORIENTATIONS.find((o) => o.id === orient)!.axis;
  const th = thresholdsFor(cal, cls);
  const result = useMemo(() => classifyPose(magnet, { center: [x, y, 0], axis }, th, model), [magnet, x, y, axis, th, model]);
  useEffect(() => setSugg(undefined), [magnetId, orient, cls, x, y, model]);
  const tone = result.category === "favorable" ? "notice-success" : result.category === "variable" ? "notice-info" : result.category === "unfavorable" ? "notice-warning" : "notice-danger";
  return (
    <section className="panel-block lab-section">
      <div className="lab-controls">
        <label className="lab-field"><span className="t-label">{t("Aimant")}</span>
          <select value={magnetId} onChange={(e) => setMagnetId(e.target.value as typeof magnetId)}>{PILOT_MAGNETS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
        </label>
        <label className="lab-field"><span className="t-label">{t("Orientation")}</span>
          <select value={orient} onChange={(e) => setOrient(e.target.value)}>{ORIENTATIONS.map((o) => <option key={o.id} value={o.id}>{t(o.label)}</option>)}</select>
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
        {result.cause === "too_far" && <> · {t("Même la meilleure orientation à cette place reste sous le seuil.")}</>}
        {result.category === "unavailable" && <> · {t("Collision, hors domaine ou seuil absent : aucune estimation.")}</>}
      </p>
      <div className="lab-actions">
        <Button variant="secondary" disabled={result.category === "favorable" || result.category === "unavailable"} onClick={() => setSugg(suggest(magnet, { center: [x, y, 0], axis }, th, model))}>{t("Proposer un déplacement ou une rotation")}</Button>
      </div>
      {sugg === null && <p className="notice-info">{t("Aucun déplacement latéral ni rotation de 90° n'améliore la catégorie.")}</p>}
      {sugg && (
        <p className="notice-success">
          {sugg.kind === "shift" ? msg("Décaler de {0} mm le long des lames", [number(sugg.dxMm, 0)]) : msg("Tourner de 90° autour de {0}", [sugg.about])}
          {" → "}{t(CATEGORY_LABEL[sugg.after])}{" "}{t("(recalculé et vérifié)")}
          {sugg.kind === "shift" && <> <Button variant="ghost" onClick={() => setX(sugg.pose.center[0])}>{t("Appliquer")}</Button></>}
        </p>
      )}
      <p className="t-caption">{msg("Accord requis des {0} scénarios avec un retrait de frontière de {1} %. Pas de pourcentage de confiance.", [PROFILE.scenarios.length, PROFILE.classification.boundaryMargin * 100])}</p>
    </section>
  );
}
