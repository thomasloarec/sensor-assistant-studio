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
} from "@/lib/standex/design-freeze";
import type { DesignFreeze } from "@/lib/standex/design-freeze";
import "./studio-v2.css";
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
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [sort, setSort] = useState<"margin" | "sensor">("margin"),
    [freeze, setFreeze] = useState<DesignFreeze | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
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
      exploreSolutions(study.need, config.geometry, {
        referencePose: referenceAllowed({ ...config, sensorId: "MK03" }),
        ferrous: config.ferromagnetic,
      }),
    [study.need, config],
  );
  const rows =
    sort === "sensor" ? [...solutions].sort((a, b) => a.id.localeCompare(b.id)) : solutions;
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
  function print() {
    document.body.classList.add("studio-print");
    const done = () => document.body.classList.remove("studio-print");
    window.addEventListener("afterprint", done, { once: true });
    window.print();
    done();
  }
  return (
    <section className="studio-v2" aria-labelledby="studio-v2-title">
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
            "1. Jouez le cycle. 2. Comparez les écarts. 3. Changez la tolérance. 4. Confirmez les hypothèses. 5. Exportez la fiche.",
          )}
        </p>
      )}
      <div className="studio-counts">
        <span>{msg("{0} famille(s) documentée(s) sur {1}", [documented, families])}</span>
        <span>
          {msg("{0} famille(s) physiquement calibrée(s) sur {1}", [calibrated, families])}
        </span>
        <span>{t("4 classes de sensibilité ne sont pas 4 capteurs")}</span>
      </div>
      <p className="studio-limit">
        {t(
          "Les distances publiées sont typiques. Les écarts affichés ne garantissent ni le pire cas, ni le comportement en température, ni une pose différente.",
        )}
      </p>
      <div className="studio-inputs">
        {(Object.keys(NEED_LABELS) as (keyof Need)[]).map((key) => (
          <label key={key}>
            {t(NEED_LABELS[key])}{" "}
            <small>
              {key.startsWith("temperature") ? "°C" : key === "agingAllowancePct" ? "%" : "mm"}
            </small>
            <input
              type="number"
              step="any"
              value={study.need[key] ?? ""}
              placeholder={t("Non renseigné")}
              onChange={(e) => {
                const value = e.target.value === "" ? null : e.target.valueAsNumber;
                setStudy((s) => ({ ...s, need: { ...s.need, [key]: value } }));
              }}
            />
          </label>
        ))}
      </div>
      {!validNeed(study.need) && (
        <p role="alert">{t("Saisie invalide : vérifiez les valeurs et leur ordre.")}</p>
      )}
      <details open>
        <summary>{t("Espace des solutions")}</summary>
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
                  <th scope="row">
                    <button
                      className="studio-row-button"
                      aria-pressed={selectedId === row.id}
                      onClick={() => setSelectedId(row.id)}
                    >
                      {row.sensorFamily}
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
                <h4>{t("Contributions inconnues")}</h4>
                <ul>
                  {selected.reference.unknown.map((code) => (
                    <li key={code}>{t(MISSING_LABELS[code] ?? code)}</li>
                  ))}
                </ul>
                <h4>{t("Où votre conception casse")}</h4>
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
                  onClick={() =>
                    onApply({
                      sensorId: selected.sensorFamily,
                      sensitivity: selected.sensitivityClass as WorkshopConfig["sensitivity"],
                      magnetModel: "M02",
                      geometry: selected.approachId,
                    })
                  }
                >
                  {t("Appliquer au montage")}
                </button>
              </>
            )}
          </div>
        ) : (
          <p>{t("Sélectionnez une ligne pour examiner ses sources et ses limites.")}</p>
        )}
      </details>
      <details
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
          <div className="studio-actions studio-no-print">
            <button
              onClick={() =>
                download("STANDEX-fiche-revue.json", stableStringify(freeze), "application/json")
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
            <button onClick={print}>{t("Imprimer")}</button>
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
          <p className="studio-hash">{"SHA-256"} : {freeze.hash}</p>
        </div>
      )}
    </section>
  );
}
