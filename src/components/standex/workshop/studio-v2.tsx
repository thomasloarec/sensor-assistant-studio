import { preferredMagnet } from "@/lib/standex/magnet-catalog";
import { sensorById } from "@/lib/standex/sensor-catalog";
import { documentLogoSource } from "@/components/standex/brand-logo";
import { studioExportSheets, workbookBytes, downloadBinary } from "@/lib/standex/studio-exports";
import { CandidateThumbnail } from "@/components/leadmagnet/candidate-thumbnail";
import { useEffect, useMemo, useRef, useState } from "react";
import { t, msg, number } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/react";
import { stableStringify } from "@/lib/leadmagnet/dossier";
import { DEFAULT_WORKSHOP, referenceAllowed } from "@/lib/standex/magnetic-workshop";
import type { WorkshopConfig } from "@/lib/standex/magnetic-workshop";
import { newStudy, deriveStudioFields, confirmStudioField } from "@/lib/standex/studio-dossier";
import type { StudioStudy } from "@/lib/standex/studio-dossier";
import { DOSSIER_FIELDS } from "@/lib/standex/application-dossier";
import { exploreSolutions } from "@/lib/standex/magnetics/solutions";
import { PUBLISHED_REGISTRY } from "@/lib/standex/magnetics/registries";
import { validNeed } from "@/lib/standex/magnetics/margin";
import type { Need } from "@/lib/standex/magnetics/margin";
import {
  createDesignFreeze,
  STUDIO_NOTICES,
  SOLUTION_COLUMNS,
  freezeMarkdown,
  verifyFreeze,
  VERDICT_LABELS,
  INVALIDANT_LABELS,
  MISSING_LABELS,
  REFERENCE_REASON_LABELS,
} from "@/lib/standex/design-freeze";
import type { DesignFreeze } from "@/lib/standex/design-freeze";
import "./studio-v2.css";
import { TechnicalHelp, NEED_HELP } from "./technical-help";
import { needIssues } from "@/lib/standex/magnetics/need-issues";
import type { PublishedApproach } from "@/lib/standex/magnetics/registries";
import SensorCard from "./sensor-card";
export interface StudioProps {
  config: WorkshopConfig;
  onApply: (patch: Partial<WorkshopConfig>) => void;
  initialStudy?: StudioStudy | null | undefined;
  onStudyChange?: ((study: StudioStudy, freeze: DesignFreeze | null) => void) | undefined;
  dossierId?: string | undefined;
  revision?: number | undefined;
}
/* i18n-canonical: stable source keys translated through t at rendering. */
const NEED_LABELS: Record<keyof Need, string> = {
  gapClosedMm: "Entrefer fermé",
  gapOpenMm: "Entrefer ouvert",
  gapToleranceMm: "Tolérance de montage",
  temperatureMinC: "Température minimale",
  temperatureMaxC: "Température maximale",
  agingAllowancePct: "Perte admise au vieillissement",
};
const HELP_CODES = [
  "A · Géométrie active de M02",
  "B · Poses exactes D1 et D3",
  "C · Point de référence magnétique",
  "D · Mesures indépendantes",
  "E · Rémanence et dispersion",
  "F · Dispersion des contacts",
  "G · Dérives en température",
  "H · Tolérances d'assemblage",
  "I · Pièces ferromagnétiques",
  "J · Vieillissement",
  "K · Dynamique et vibrations",
  "L · Limites électriques assemblées",
  "M · Câbles et environnement",
  "N · Autres familles du catalogue",
  "O · Critères de validation R&D",
];
const display = (v: number | null, unit = "mm") =>
  v === null ? t("Non renseigné") : number(v) + " " + unit;
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function StudioV2({
  config,
  onApply,
  initialStudy,
  onStudyChange,
  dossierId = "local",
  revision = 1,
}: StudioProps) {
  useLocale();
  const [study, setStudy] = useState<StudioStudy>(() => initialStudy ?? newStudy());
  const [demoRun, setDemoRun] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [sort, setSort] = useState<"margin" | "sensor">("margin"),
    [freeze, setFreeze] = useState<DesignFreeze | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [productCard, setProductCard] = useState<string | null>(null);
  const issues = needIssues(study.need);
  const approach = study.comparisonApproach ?? "D1";
  const callback = useRef(onStudyChange);
  callback.current = onStudyChange;
  const request = useRef(0);
  const inputVersion = stableStringify({ study, config, dossierId, revision });
  const currentInput = useRef(inputVersion);
  currentInput.current = inputVersion;
  useEffect(() => {
    setFreeze(null);
    request.current++;
  }, [inputVersion]);
  useEffect(() => {
    const next = deriveStudioFields(study, config);
    if (stableStringify(next) !== stableStringify(study)) setStudy(next);
  }, [study, config]);
  useEffect(() => {
    callback.current?.(study, freeze);
  }, [study, freeze]);
  const solutions = useMemo(
    () =>
      exploreSolutions(study.need, approach, {
        referencePose: true,
        ferrous: config.ferromagnetic,
      }),
    [study.need, config, approach],
  );
  const displaySolutions = solutions.filter((row) => {
    const familyRows = solutions.filter((other) => other.sensorFamily === row.sensorFamily);
    const preferred = preferredMagnet(sensorById(row.sensorFamily));
    const defaultMagnet = familyRows.some((other) => other.magnetId === preferred)
      ? preferred
      : (familyRows.find((other) => other.magnetId === "M02")?.magnetId ?? familyRows[0]?.magnetId);
    return row.id === study.selectedSolutionId || row.magnetId === defaultMagnet;
  });
  const rows =
    sort === "sensor"
      ? [...displaySolutions].sort((a, b) => a.id.localeCompare(b.id))
      : displaySolutions;
  const selected = solutions.find((s) => s.id === selectedId) ?? null;
  const documented = new Set(PUBLISHED_REGISTRY.rows.map((r) => r.sensorFamily)).size;
  const families = new Set(rows.map((r) => r.sensorFamily)).size;
  const calibrated = new Set(
    rows.filter((r) => r.physical.provenance.length).map((r) => r.sensorFamily),
  ).size;
  const bandRows = rows.filter((r) => r.reference.pullMm !== null);
  const maximum = Math.max(
    1,
    ...bandRows.map((r) => r.reference.dropMm! * 1.3),
    (study.need.gapOpenMm ?? 0) + (study.need.gapToleranceMm ?? 0),
  );
  const x = (v: number) => 190 + (v / maximum) * 590;
  const confirmed = Object.values(study.fields).filter((f) => f.state === "confirmed").length;
  function demo() {
    // Reopening the dossier after a reset is a new, explicit consultation.
    setDemoRun((run) => run + 1);
    setStudy({
      ...newStudy(),
      example: true,
      need: {
        gapClosedMm: 7.5,
        gapOpenMm: 22,
        gapToleranceMm: 0.5,
        temperatureMinC: 20,
        temperatureMaxC: 20,
        agingAllowancePct: null,
      },
      envelopeMm: [45, 25, 15],
    });
    setSelectedId(null);
    setNotice("");
    onApply({ ...DEFAULT_WORKSHOP, sensitivity: "B", start: 22, end: 7.5 });
  }
  async function generate() {
    const key = inputVersion,
      id = ++request.current;
    setBusy(true);
    setNotice("");
    try {
      const f = await createDesignFreeze({
        dossierId,
        revision,
        generatedAt: new Date().toISOString(),
        author: "",
        config,
        study,
      });
      if (id === request.current && key === currentInput.current) setFreeze(f);
    } catch {
      setNotice(STUDIO_NOTICES.invalid);
    } finally {
      setBusy(false);
    }
  }
  async function exportPdf() {
    if (!freeze) return;
    setBusy(true);
    try {
      const { reviewPdf } = await import("@/lib/standex/studio-pdf");
      downloadBinary(
        "STANDEX-fiche-revue.pdf",
        await reviewPdf(freeze, documentLogoSource(), t),
        "application/pdf",
      );
    } catch {
      setNotice(t("Export impossible. Réessayez après le chargement de la page."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="studio-v2" aria-labelledby="studio-v2-title">
      {productCard && <SensorCard sensorId={productCard} onClose={() => setProductCard(null)} />}
      <header className="studio-head">
        <div>
          <p className="studio-eyebrow">{t("Sensor Studio · Revue de conception")}</p>
          <h2 id="studio-v2-title">{t("Du montage à une décision documentée")}</h2>
          <p>
            {t(
              "Comparez vos entrefers aux données publiées, puis préparez les essais qui manquent.",
            )}
          </p>
        </div>
        <button className="mw-button" onClick={demo}>
          {t(study.example ? "Réinitialiser la démonstration" : "Démonstration guidée")}
        </button>
      </header>
      {study.example && (
        <p className="studio-example" role="status">
          {t("Données d'exemple")} ·{" "}
          {t(
            "1. Comparez les écarts. 2. Retenez une solution. 3. Confirmez les hypothèses. 4. Générez et exportez la fiche.",
          )}
        </p>
      )}
      <details className="studio-method">
        <summary>{t("Comprendre les résultats et leurs limites")}</summary>
        <div className="studio-counts">
          <span>{msg("{0} famille(s) documentée(s) sur {1}", [documented, families])}</span>
          <span>
            {msg("{0} famille(s) physiquement calibrée(s) sur {1}", [calibrated, families])}
          </span>
        </div>
        <p>
          {t(
            "SERRÉ : comparaison typique à confirmer par des essais. NON TENU : marge inférieure à 10 %. NON ÉVALUABLE : une donnée ou une condition manque.",
          )}
        </p>
        <p>
          {t(
            "Les distances publiées sont typiques. Les écarts affichés ne garantissent ni le pire cas, ni le comportement en température, ni une pose différente.",
          )}
        </p>
      </details>
      <h3>{t("1. Décrivez vos distances")}</h3>
      <div className="studio-inputs">
        {(Object.keys(NEED_LABELS) as (keyof Need)[])
          .filter((key) => key !== "agingAllowancePct")
          .map((key) => (
            <div key={key}>
              <div className="studio-label-help">
                <label htmlFor={`need-${key}`}>
                  {t(NEED_LABELS[key])} {key.startsWith("temperature") ? "°C" : "mm"}
                </label>
                <TechnicalHelp term={NEED_LABELS[key]}>{NEED_HELP[key]!}</TechnicalHelp>
              </div>
              <input
                id={`need-${key}`}
                type="number"
                step="any"
                aria-invalid={issues.some((i) => i.field === key)}
                aria-describedby={issues.some((i) => i.field === key) ? `issue-${key}` : undefined}
                value={study.need[key] ?? ""}
                placeholder={t("Non renseigné")}
                onChange={(e) => {
                  const value = e.target.value === "" ? null : e.target.valueAsNumber;
                  setStudy((s) => ({ ...s, need: { ...s.need, [key]: value } }));
                }}
              />
              {issues.some((i) => i.field === key) && (
                <p id={`issue-${key}`} className="studio-field-error">
                  {issues
                    .filter((i) => i.field === key)
                    .map((i) => t(i.message))
                    .join(" ")}
                </p>
              )}
            </div>
          ))}
      </div>
      {!validNeed(study.need) && (
        <div className="notice-danger studio-validation" role="alert">
          <strong>{t("Corrigez les champs signalés avant de comparer.")}</strong>
        </div>
      )}
      {(study.need.gapClosedMm === null || study.need.gapOpenMm === null) && (
        <p className="notice-info" role="status">
          {t(
            "Renseignez les deux distances pour calculer les écarts. Une valeur absente n’est pas zéro.",
          )}
        </p>
      )}
      {study.need.gapToleranceMm === null && (
        <p className="notice-warning">
          {t("Tolérance inconnue : écarts nominaux sans tolérance, comparaison conditionnelle.")}
        </p>
      )}
      {(study.need.temperatureMinC !== null || study.need.temperatureMaxC !== null) && (
        <p className="t-caption">
          {t(
            "Température : besoin enregistré. Les distances typiques restent inchangées, faute de caractérisation thermique.",
          )}
        </p>
      )}
      <details open>
        <summary>{t("Espace des solutions")}</summary>
        <div className="studio-orientation">
          <label>
            {t("Orientation de l’aimant")}
            <select
              value={["D4", "D5"].includes(approach) ? "perpendicular" : "parallel"}
              onChange={(e) => {
                setSelectedId(null);
                setStudy((s) => ({
                  ...s,
                  comparisonApproach: e.target.value === "parallel" ? "D1" : "D4",
                  selectedSolutionId: null,
                }));
              }}
            >
              <option value="parallel">{t("Aimant parallèle au capteur")}</option>
              <option value="perpendicular">{t("Aimant perpendiculaire au capteur")}</option>
            </select>
          </label>
          <label>
            {t("Position de comparaison")}
            <select
              value={approach}
              onChange={(e) => {
                setSelectedId(null);
                setStudy((s) => ({
                  ...s,
                  comparisonApproach: e.target.value as PublishedApproach,
                  selectedSolutionId: null,
                }));
              }}
            >
              {(["D4", "D5"].includes(approach) ? ["D4", "D5"] : ["D1", "D2", "D3"]).map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <TechnicalHelp term={t("Position de comparaison")}>
            {t(
              "D1 à D5 désignent des trajets distincts dans la documentation Standex. L’orientation seule ne suffit pas : mesurez la distance selon le trajet représenté. La vue du duo est indicative, sans calibration physique.",
            )}
          </TechnicalHelp>
        </div>
        <div className="studio-table-head">
          <p>{t("Tri par écart de fermeture décroissant, sans recommandation automatique.")}</p>
          <label>
            {t("Trier")}
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="margin">{t("Écart de fermeture")}</option>
              <option value="sensor">{t("Capteur")}</option>
            </select>
          </label>
        </div>
        <div className="studio-table-scroll">
          <table>
            <caption>{t("Comparaison aux valeurs typiques")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("Duo capteur et aimant")}</th>
                {SOLUTION_COLUMNS.map((label) => (
                  <th key={label} scope="col">
                    {t(label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-selected={selectedId === row.id}>
                  <td className="studio-duo">
                    <button
                      aria-label={msg("Voir le duo : {0}", [row.sensorFamily])}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <CandidateThumbnail
                        sensorId={row.sensorFamily}
                        livePreview={selectedId === null}
                        pair={{ magnetId: row.magnetId, approach }}
                      />
                    </button>
                  </td>
                  <th scope="row">
                    <button
                      className="studio-row-button"
                      aria-pressed={selectedId === row.id}
                      onClick={() => setSelectedId(row.id)}
                    >
                      {row.sensorFamily}
                    </button>
                    <button
                      onClick={() => setProductCard(row.sensorFamily)}
                      aria-label={msg("Découvrir : {0}", [row.sensorFamily])}
                    >
                      {t("Fiche produit")}
                    </button>
                  </th>
                  <td>{row.sensitivityClass || "—"}</td>
                  <td>{row.magnetId || "—"}</td>
                  <td>{display(row.reference.pullMm)}</td>
                  <td>{display(row.reference.dropMm)}</td>
                  <td>{display(row.reference.closingMm)}</td>
                  <td>{display(row.reference.openingMm)}</td>
                  <td>
                    <span className="studio-verdict" data-verdict={row.reference.verdict}>
                      {t(VERDICT_LABELS[row.reference.verdict])}
                    </span>
                  </td>
                  <td>{t(VERDICT_LABELS[row.physical.verdict])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {bandRows.length > 0 && (
          <details className="studio-band">
            <summary>{t("Voir les bandes d'entrefer")}</summary>
            <div className="studio-table-scroll">
              <svg
                viewBox={`0 0 830 ${60 + bandRows.length * 42}`}
                role="img"
                aria-label={t("Bandes des distances typiques et entrefers déclarés")}
              >
                {Array.from({ length: 6 }, (_, i) => (maximum * i) / 5).map((value) => (
                  <g key={value}>
                    <line
                      x1={x(value)}
                      x2={x(value)}
                      y1="25"
                      y2={40 + bandRows.length * 42}
                      className="studio-grid"
                    />
                    <text x={x(value)} y="16" textAnchor="middle">
                      {number(value, 1)}
                    </text>
                  </g>
                ))}
                {bandRows.map((row, i) => (
                  <g key={row.id}>
                    <text x="5" y={53 + i * 42}>
                      {row.sensorFamily} · {row.sensitivityClass}
                    </text>
                    <rect
                      x={x(row.reference.pullMm!)}
                      y={34 + i * 42}
                      width={x(row.reference.dropMm!) - x(row.reference.pullMm!)}
                      height="24"
                      className="studio-band-rect"
                      data-selected={row.id === selectedId}
                      role="button"
                      tabIndex={0}
                      aria-label={[
                        row.sensorFamily,
                        row.sensitivityClass,
                        row.magnetId,
                        row.approachId,
                      ].join(" / ")}
                      onClick={() => setSelectedId(row.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(row.id);
                        }
                      }}
                    />
                    <text x={x(row.reference.pullMm!) - 5} y={51 + i * 42} textAnchor="end">
                      {number(row.reference.pullMm!)}
                    </text>
                    <text x={x(row.reference.dropMm!) + 5} y={51 + i * 42}>
                      {number(row.reference.dropMm!)}
                    </text>
                  </g>
                ))}
                {study.need.gapClosedMm !== null && (
                  <line
                    className="studio-gap-closed"
                    x1={x(study.need.gapClosedMm + (study.need.gapToleranceMm ?? 0))}
                    x2={x(study.need.gapClosedMm + (study.need.gapToleranceMm ?? 0))}
                    y1="25"
                    y2={40 + bandRows.length * 42}
                  />
                )}
                {study.need.gapOpenMm !== null && (
                  <line
                    className="studio-gap-open"
                    x1={x(study.need.gapOpenMm - (study.need.gapToleranceMm ?? 0))}
                    x2={x(study.need.gapOpenMm - (study.need.gapToleranceMm ?? 0))}
                    y1="25"
                    y2={40 + bandRows.length * 42}
                  />
                )}
              </svg>
            </div>
            <p>
              {t(
                "Trait plein : fermeture avec tolérance. Pointillés : ouverture avec tolérance. Bande : hystérésis typique.",
              )}
            </p>
          </details>
        )}
        {selected ? (
          <div className="studio-selection">
            <h3>
              {selected.sensorFamily} · {selected.sensitivityClass} · {selected.magnetId} ·{" "}
              {selected.approachId}
            </h3>
            <p>
              {t(
                "Données manquantes pour la prédiction physique : géométrie active, repères et validation indépendante.",
              )}
            </p>
            <div className="studio-duo-detail">
              <CandidateThumbnail
                sensorId={selected.sensorFamily}
                pair={{ magnetId: selected.magnetId, approach }}
              />
            </div>
            <p>
              {t(
                "Vue indicative des boîtiers. Les dimensions de l’aimant standard viennent de sa fiche ; son axe magnétique interne reste à confirmer.",
              )}
            </p>
            <a
              href="https://standexdetect.com/wp-content/uploads/sites/2/2025/12/Activate-Distance-Guide-for-Reed-Sensors.pdf"
              target="_blank"
              rel="noreferrer"
            >
              {t("Voir le schéma officiel D1 à D5")}
            </a>
            <p>
              {t(
                "Le choix retenu documente cette comparaison. La pose et l’aimant de l’atelier 3D restent à régler séparément.",
              )}
            </p>
            {selected.reference.verdict === "unavailable" && (
              <p className="notice-warning">
                {t(REFERENCE_REASON_LABELS[selected.reference.reason] ?? selected.reference.reason)}
              </p>
            )}
            {selected.reference.provenance.map((p) => (
              <p key={p.registryId}>
                {t("Source")} : {p.registryId} ·{" "}
                <a href={p.sourceRef.split(" ; ")[0]} target="_blank" rel="noreferrer">
                  {t("Source Standex ↗")}
                </a>
              </p>
            ))}
            {selected.reference.verdict !== "unavailable" && (
              <>
                <details>
                  <summary>{t("Données à caractériser avec Standex")}</summary>
                  <p>
                    {t(
                      "Cette liste décrit les limites du modèle. Ce ne sont pas des champs supplémentaires à remplir : Standex doit fournir les mesures, avec votre contexte de montage.",
                    )}
                  </p>
                  <ul>
                    {selected.reference.unknown.map((code) => (
                      <li key={code}>{t(MISSING_LABELS[code] ?? code)}</li>
                    ))}
                  </ul>
                </details>
                <h4>{t("Limites de distance à surveiller")}</h4>
                <ul>
                  {selected.reference.invalidants.map((i) => (
                    <li key={i.code}>
                      {t(INVALIDANT_LABELS[i.code]!)}
                      {i.value !== null ? " : " + display(i.value) : ""}
                    </li>
                  ))}
                </ul>
                <button
                  className="mw-button"
                  aria-pressed={study.selectedSolutionId === selected.id}
                  onClick={() => {
                    setStudy((s) => ({ ...s, selectedSolutionId: selected.id }));
                    onApply({
                      sensorId: selected.sensorFamily,
                      sensitivity: selected.sensitivityClass as WorkshopConfig["sensitivity"],
                      magnetModel: selected.magnetId,
                      geometry: ["D3", "D5"].includes(selected.approachId) ? "D3" : "D1",
                      sensorAngle:
                        !["D3", "D5"].includes(selected.approachId) &&
                        sensorById(selected.sensorFamily).shape === "flange"
                          ? 180
                          : 0,
                      magnetAngle: ["D4", "D5"].includes(selected.approachId) ? -90 : 0,
                      magnetTilt: 0,
                      lateralShift: ["D2", "D4"].includes(selected.approachId)
                        ? sensorById(selected.sensorFamily).body[0] / 2
                        : 0,
                    });
                  }}
                >
                  {t("Retenir cette solution")}
                </button>
              </>
            )}
          </div>
        ) : (
          <p>{t("Sélectionnez une ligne pour examiner ses sources et ses limites.")}</p>
        )}
      </details>
      <details
        key={`dossier-${demoRun}`}
        onToggle={(e) => {
          if (e.currentTarget.open && !study.consulted)
            setStudy((s) => deriveStudioFields({ ...s, consulted: true }, config));
        }}
      >
        <summary>
          {t("Dossier : hypothèses à confirmer")} · {confirmed}/24 {t("confirmés")}
        </summary>
        <p>
          {t(
            "Une proposition de l'atelier reste une hypothèse jusqu'à votre confirmation. Les valeurs confirmées sont conservées lors d'un changement de montage.",
          )}
        </p>
        <div className="studio-fields">
          {DOSSIER_FIELDS.map((def) => {
            const field = study.fields[def.id];
            return (
              <div key={def.id}>
                <label>
                  {t(def.labelFr)}
                  <input
                    value={field?.value ?? ""}
                    placeholder={t("Non renseigné")}
                    onChange={(e) => {
                      const value = e.target.value;
                      setStudy((s) => ({
                        ...s,
                        fields: {
                          ...s.fields,
                          [def.id]: {
                            value,
                            source: "user",
                            state: "hypothesis",
                            proposal: s.fields[def.id]?.proposal ?? null,
                          },
                        },
                      }));
                    }}
                  />
                </label>
                {field && (
                  <>
                    <small>
                      {t(field.source === "atelier" ? "Source : atelier" : "Source : utilisateur")}{" "}
                      · {t(field.state === "confirmed" ? "Confirmé" : "Hypothèse")}
                    </small>
                    {field.value && field.state !== "confirmed" && (
                      <button onClick={() => setStudy((s) => confirmStudioField(s, def.id))}>
                        {t("Confirmer")}
                      </button>
                    )}
                    {field.proposal && (
                      <p>
                        {t("Le montage propose une autre valeur")} : {field.proposal}{" "}
                        <button
                          onClick={() =>
                            setStudy((s) => ({
                              ...s,
                              fields: {
                                ...s.fields,
                                [def.id]: {
                                  value: field.proposal!,
                                  source: "atelier",
                                  state: "hypothesis",
                                  proposal: null,
                                },
                              },
                            }))
                          }
                        >
                          {t("Utiliser cette hypothèse")}
                        </button>
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </details>
      <details>
        <summary>{t("Données à demander à Standex")}</summary>
        <p>
          {t(
            "Chaque donnée demandée lève une limite identifiée. Les demandes A à D sont prioritaires pour la calibration.",
          )}
        </p>
        <ol>
          {HELP_CODES.map((code) => (
            <li key={code}>{t(code)}</li>
          ))}
        </ol>
        <button
          className="mw-button mw-secondary"
          onClick={() =>
            download(
              "STANDEX-donnees-a-demander.md",
              "# " +
                t("Données à demander à Standex") +
                "\n\n" +
                HELP_CODES.map((code) => "- [ ] " + t(code)).join("\n"),
              "text/markdown;charset=utf-8",
            )
          }
        >
          {t("Exporter la liste")}
        </button>
      </details>
      <div className="studio-actions">
        <button
          className="mw-button"
          disabled={busy || !validNeed(study.need)}
          onClick={() => void generate()}
        >
          {t(busy ? "Génération…" : "Générer la fiche de revue")}
        </button>
        <label className="studio-import">
          {t("Vérifier une empreinte JSON")}
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                if (file.size > 2_000_000) throw new Error();
                setNotice(
                  (await verifyFreeze(JSON.parse(await file.text())))
                    ? STUDIO_NOTICES.verified
                    : STUDIO_NOTICES.badHash,
                );
              } catch {
                setNotice(STUDIO_NOTICES.badHash);
              }
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {notice && <p role="status">{t(notice)}</p>}
      {freeze && (
        <div className="studio-freeze">
          <div className="studio-print-status">{t("Non contre-signée")}</div>
          <h3>{t("Fiche de revue de conception")}</h3>
          <p>
            {t("Non contre-signée")} ·{" "}
            {t("Une modification du montage ou des déclarations impose une nouvelle fiche.")}
          </p>
          <div className="studio-actions studio-no-print studio-export-bar">
            <details className="studio-export-menu">
              <summary>{t("Exporter la fiche")}</summary>
              <div>
                <button disabled={busy} onClick={() => void exportPdf()}>
                  {t("PDF Standex")}
                </button>
                <button
                  onClick={() =>
                    downloadBinary(
                      "STANDEX-revue-bilingue.xlsx",
                      workbookBytes(studioExportSheets(freeze, study, config)),
                      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    )
                  }
                >
                  {t("Excel bilingue FR / EN")}
                </button>
                <button
                  onClick={() =>
                    download(
                      "STANDEX-fiche-revue.json",
                      stableStringify(freeze),
                      "application/json",
                    )
                  }
                >
                  {t("Exporter JSON")}
                </button>
                <button
                  onClick={() =>
                    download(
                      "STANDEX-fiche-revue.md",
                      freezeMarkdown(freeze, (s) => t(s)),
                      "text/markdown;charset=utf-8",
                    )
                  }
                >
                  {t("Exporter Markdown")}
                </button>
              </div>
            </details>
          </div>
          {freeze.sections.map((section) => (
            <section key={section.id}>
              <h4>
                {section.id}. {t(section.title)}
              </h4>
              <dl>
                {section.entries.map((entry, i) => (
                  <div key={i}>
                    <dt>{t(entry.label)}</dt>
                    <dd>
                      {t(entry.value)}
                      {t(entry.value) !== entry.value && (
                        <small lang="fr">FR : {entry.value}</small>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <p className="studio-hash">
            {"SHA-256"} : {freeze.hash}
          </p>
        </div>
      )}
    </section>
  );
}
