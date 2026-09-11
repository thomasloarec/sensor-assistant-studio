import { useState } from "react";
import { t } from "@/lib/i18n/core";
import { BARE_MAGNETS, PACKAGED_MAGNET_IDS, magnetSource } from "@/lib/standex/magnet-catalog";
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

export default function MagnetCatalog({
  view,
  sameScale,
}: {
  view: "2d" | "3d";
  sameScale: boolean;
}) {
  const [material, setMaterial] = useState("");
  const entries = [
    ...PACKAGED_MAGNET_IDS.map((id) => ({ id, material: "unknown" as const })),
    ...BARE_MAGNETS,
  ].filter((m) => !material || m.material === material);
  return (
    <section aria-label={t("Catalogue des aimants")}>
      <label className="mw-catalog-material">
        {t("Matériau de l’aimant")}
        <select
          value={material}
          data-active={Boolean(material)}
          onChange={(e) => setMaterial(e.target.value)}
        >
          <option value="">{t("Tous les matériaux")}</option>
          {Object.keys(ADVICE).map((key) => (
            <option key={key} value={key}>
              {key === "unknown" ? t("Non renseigné") : key}
            </option>
          ))}
        </select>
      </label>
      <div className="notice-info t-body">
        <p>
          {t(
            "Le matériau seul ne détermine pas la distance : la nuance, les dimensions, l’aimantation et le capteur doivent correspondre à la même référence.",
          )}
        </p>
        {(material ? [material] : ["Ferrite", "AlNiCo", "NdFeB", "SmCo"]).map((key) => (
          <p key={key}>{t(ADVICE[key as keyof typeof ADVICE])}</p>
        ))}
        <p>
          {t(
            "Les valeurs « up / to » de la nouvelle brochure restent à qualifier. Elles ne servent pas encore à calculer une marge ou une zone de détection.",
          )}
        </p>
      </div>
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
