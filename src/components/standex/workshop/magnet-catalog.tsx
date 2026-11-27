import { ChevronDown, Info } from "lucide-react";
import { t } from "@/lib/i18n/core";
import {
  BARE_MAGNETS,
  PACKAGED_MAGNET_IDS,
  packagedMagnet,
  magnetSource,
} from "@/lib/standex/magnet-catalog";
import { pairedMagnetModel } from "@/lib/standex/paired-magnets";
import { CandidateThumbnail } from "@/components/leadmagnet/candidate-thumbnail";
import { sizeLabel } from "@/lib/standex/sensor-catalog";

/* i18n-canonical: material advice translated at rendering. */
const ADVICE = {
  Ferrite:
    "Ferrite : économique et résistante à la corrosion, mais moins puissante à volume égal et cassante.",
  AlNiCo:
    "AlNiCo : bonne stabilité en température ; sensible aux champs opposés. Le cylindre Ø 4 × 19 mm est un format courant.",
  NdFeB:
    "Néodyme : forte puissance dans un petit volume ; protection contre la corrosion et tenue en température à vérifier selon la nuance.",
  SmCo: "Samarium-cobalt : adapté aux températures élevées, mais plus coûteux et fragile.",
  unknown: "Matériau non précisé : consulter la fiche de la référence.",
} as const;

export function MagnetMaterialFilter({
  material,
  onChange,
}: {
  material: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mw-catalog-material">
      {t("Matériau de l’aimant")}
      <select
        value={material}
        data-active={Boolean(material)}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t("Tous les matériaux")}</option>
        {Object.keys(ADVICE).map((key) => (
          <option key={key} value={key}>
            {key === "unknown" ? t("Non renseigné") : key}
          </option>
        ))}
      </select>
    </label>
  );
}

export function MagnetMaterialGuide({ material }: { material: string }) {
  return (
    <aside className="mw-catalog-material-guide" aria-label={t("Comprendre les matériaux")}>
      <div className="mw-catalog-guide-title t-title-s">
        <Info size={18} aria-hidden="true" />
        {t("Comprendre les matériaux")}
      </div>
      <p>{t("Le matériau ne suffit pas à déterminer la distance de détection.")}</p>
      {material && (
        <p className="mw-catalog-material-selected" role="status">
          {t(ADVICE[material as keyof typeof ADVICE])}
        </p>
      )}
      <details>
        <summary>
          {t("En savoir plus")}
          <ChevronDown size={18} aria-hidden="true" />
        </summary>
        <div className="mw-catalog-guide-details">
          <p>
            {t(
              "Le matériau seul ne détermine pas la distance : la nuance, les dimensions, l’aimantation et le capteur doivent correspondre à la même référence.",
            )}
          </p>
          {(material ? [] : ["Ferrite", "AlNiCo", "NdFeB", "SmCo"]).map((key) => (
            <p key={key}>{t(ADVICE[key as keyof typeof ADVICE])}</p>
          ))}
          <p>
            {t(
              "Les valeurs « up / to » de la nouvelle brochure restent à qualifier. Elles ne servent pas encore à calculer une marge ou une zone de détection.",
            )}
          </p>
        </div>
      </details>
    </aside>
  );
}

export default function MagnetCatalog({
  view,
  sameScale,
  material = "",
}: {
  view: "2d" | "3d";
  sameScale: boolean;
  material?: string;
}) {
  const entries = [
    // Le matériau d'un aimant en boîtier est celui de l'AIMANT (`magnetMaterial`),
    // jamais celui du boîtier : les deux sont distincts et affichés séparément.
    ...PACKAGED_MAGNET_IDS.map((id) => ({
      id,
      material: packagedMagnet(id)!.magnetMaterial,
    })),
    ...BARE_MAGNETS,
  ].filter((m) => !material || m.material === material);
  return (
    <section aria-label={t("Catalogue des aimants")}>
      <div className="mw-catalog-list">
        {entries.map((entry) => {
          const model = pairedMagnetModel(entry.id)!;
          const source = magnetSource(entry.id)!;
          return (
            <article key={entry.id} className="surface">
              <div className="mw-catalog-choice">
                <div className="mw-catalog-drawing">
                  <CandidateThumbnail
                    sensorId={entry.id}
                    livePreview={view === "3d"}
                    fitToView={!sameScale}
                  />
                </div>
                <h3 className="t-title-s">{model.name}</h3>
                <p className="t-metric">{sizeLabel(model)}</p>
                <p>{entry.material === "unknown" ? t(ADVICE.unknown) : entry.material}</p>
                {(() => {
                  const packaged = packagedMagnet(entry.id);
                  if (!packaged) return null;
                  return (
                    <dl className="mw-catalog-magnet-materials t-body">
                      <div>
                        <dt>{t("Aimant")}</dt>
                        <dd>{packaged.magnetMaterial}</dd>
                      </div>
                      <div>
                        <dt>{t("Boîtier")}</dt>
                        <dd>{packaged.housingMaterial}</dd>
                      </div>
                      {packaged.momentTypE6Vscm != null && (
                        <div>
                          <dt>{t("Moment typ. (MS150)")}</dt>
                          <dd>
                            {(Array.isArray(packaged.momentTypE6Vscm)
                              ? packaged.momentTypE6Vscm.join(" / ")
                              : String(packaged.momentTypE6Vscm)) + " ×10⁻⁶ Vs·cm"}
                            <br />
                            {t(
                              "Valeur brute constructeur, non convertible en distance de commutation.",
                            )}
                          </dd>
                        </div>
                      )}
                    </dl>
                  );
                })()}
              </div>
              <a href={source} target="_blank" rel="noreferrer">
                {t("Fiche fabricant · PDF")}
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}
