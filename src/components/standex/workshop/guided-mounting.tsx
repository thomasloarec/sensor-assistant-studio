import { useMemo, useState } from "react";
import { t, msg } from "@/lib/i18n/core";
import { CircleCheck, CircleHelp, CircleX, Move3d, Wand2 } from "lucide-react";
import type { WorkshopConfig } from "@/lib/standex/magnetic-workshop";
import {
  applySuggestion,
  mountingFromWorkshop,
  moveCouple,
  profileFor,
  sensitivityComparison,
  suggestPose,
  withComputed,
  workshopPatchFromMounting,
} from "@/lib/standex/mounting";
import type { GuidedMounting } from "@/lib/standex/mounting";

/* i18n-canonical : libellés stockés en français, traduits au rendu par t(). */
const VERDICT_TITLE = {
  expected: "Détection prévue dans ce montage",
  not_expected: "Détection non prévue dans ce montage",
  undetermined: "Comportement indéterminé",
} as const;
const COVERAGE_LABEL = {
  covered: "Toute la course est couverte par le gabarit",
  partial: "Une partie de la course sort du gabarit",
  uncovered: "La course sort du gabarit de référence",
} as const;
const EVIDENCE_LABEL = {
  published_typical: "Valeurs typiques publiées Standex",
  none: "Aucune source applicable à cette pose",
} as const;
const REASON_LABEL: Record<string, string> = {
  NO_PROFILE: "Ce couple capteur–aimant n'a pas de table publiée.",
  CLASS_NOT_PUBLISHED: "Cette classe de sensibilité n'est pas publiée.",
  ORIENTATION_OFF_TEMPLATE: "L'aimant n'est plus parallèle au gabarit de référence.",
  LATERAL_OFFSET: "L'aimant est décalé hors du plan de référence.",
  FERROUS_DECLARED: "Une matière ferromagnétique proche est déclarée.",
  TEMPERATURE_OFF_TEMPLATE: "La température sort du cas de référence.",
  CUSTOM_MODEL_NOT_CHARACTERISED: "Votre modèle importé n'est pas caractérisé.",
  COLLISION_OR_CONTACT: "Les deux corps se touchent sur une partie de la course.",
  EDUCATION_MODE: "La démonstration pédagogique n'utilise pas de distances réelles.",
};
const LIMIT_LABEL: Record<string, string> = {
  datum_not_characterised: "Les repères de mesure des plans ne sont pas caractérisés.",
  typical_not_guaranteed: "Une valeur typique n'est pas une valeur garantie.",
  schematic_template: "Le gabarit affiché est explicitement schématique.",
};

export function useGuidedMounting(config: WorkshopConfig): GuidedMounting {
  return useMemo(() => withComputed(mountingFromWorkshop(config)), [config]);
}

/** Verdict honnête : couverture, source, puis conclusion. Jamais « validé terrain ». */
export function GuidedVerdict({
  mounting,
  onFixCoverage,
}: {
  mounting: GuidedMounting;
  onFixCoverage?: () => void;
}) {
  const c = mounting.computed;
  if (!c) return null;
  const Icon =
    c.verdict === "expected" ? CircleCheck : c.verdict === "not_expected" ? CircleX : CircleHelp;
  return (
    <div className={"mw-verdict mw-verdict-" + c.verdict} role="status" data-testid="guided-verdict">
      <p className="mw-verdict-head">
        <Icon size={18} aria-hidden="true" />
        <strong className="t-title-s">{t(VERDICT_TITLE[c.verdict])}</strong>
      </p>
      <p className="mw-verdict-main">{t(c.mainMessage)}</p>
      <dl className="mw-verdict-grid">
        <div>
          <dt>{t("Couverture de la pose")}</dt>
          <dd>{t(COVERAGE_LABEL[c.coverage])}</dd>
        </div>
        <div>
          <dt>{t("Niveau de preuve")}</dt>
          <dd>{t(EVIDENCE_LABEL[c.evidence])}</dd>
        </div>
      </dl>
      {c.reasons.length > 0 && (
        <ul className="mw-verdict-reasons">
          {c.reasons.map((r) => (
            <li key={r}>{t(REASON_LABEL[r] ?? r)}</li>
          ))}
        </ul>
      )}
      {c.verdict !== "expected" && onFixCoverage && (
        <button className="mw-button mw-secondary mw-wide" onClick={onFixCoverage}>
          {t("Revenir au gabarit de référence")}
        </button>
      )}
      <details>
        <summary>{t("Ce que ce résultat ne dit pas")}</summary>
        <ul className="mw-verdict-reasons">
          {c.limits.map((l) => (
            <li key={l}>{t(LIMIT_LABEL[l] ?? l)}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/** Guidage de position : proposer, prévisualiser dans la scène, appliquer ou annuler. */
export function GuidedSuggestion({
  config,
  update,
  replace,
}: {
  config: WorkshopConfig;
  update: (patch: Partial<WorkshopConfig>) => void;
  replace: (next: WorkshopConfig) => void;
}) {
  const [snapshot, setSnapshot] = useState<WorkshopConfig | null>(null);
  const mounting = useGuidedMounting(config);
  const proposal = useMemo(() => suggestPose(mounting), [mounting]);

  const preview = () => {
    if (!proposal.ok) return;
    const applied = applySuggestion(mounting, proposal.suggestion);
    if (!applied.ok) return;
    setSnapshot(config);
    update(workshopPatchFromMounting(applied.mounting, config));
  };
  return (
    <div className="mw-guide panel-block" data-testid="guided-suggestion">
      <p className="mw-guide-head">
        <Wand2 size={16} aria-hidden="true" />
        <strong className="t-title-s">{t("Position suggérée de l'aimant")}</strong>
      </p>
      {proposal.ok ? (
        <>
          <dl className="mw-verdict-grid">
            <div>
              <dt>{t("Plan et axe de référence")}</dt>
              <dd>{t(proposal.suggestion.axisLabel)}</dd>
            </div>
            <div>
              <dt>{t("Entrefer visé")}</dt>
              <dd className="t-metric">{msg("{0} mm", [proposal.suggestion.gapMm])}</dd>
            </div>
            <div>
              <dt>{t("Départ conseillé")}</dt>
              <dd className="t-metric">{msg("{0} mm", [proposal.suggestion.startGapMm])}</dd>
            </div>
            <div>
              <dt>{t("Décalage et orientation")}</dt>
              <dd className="t-metric">{t("0 mm · 0°")}</dd>
            </div>
          </dl>
          <p className="mw-help">
            {t(
              "Gabarit géométrique explicitement schématique, issu des distances typiques publiées. Ce n'est pas une validation de votre montage.",
            )}
          </p>
          <div className="mw-guide-actions">
            {snapshot ? (
              <>
                <button className="mw-button" onClick={() => setSnapshot(null)}>
                  {t("Appliquer cette position")}
                </button>
                <button
                  className="mw-button mw-secondary"
                  onClick={() => {
                    replace(snapshot);
                    setSnapshot(null);
                  }}
                >
                  {t("Annuler la prévisualisation")}
                </button>
              </>
            ) : (
              <button className="mw-button" onClick={preview}>
                {t("Prévisualiser la position suggérée")}
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="mw-help">
          {t(
            proposal.reason === "COLLISION"
              ? "La position suggérée ferait se toucher les deux corps : aucune proposition à travers la matière."
              : "Aucune position documentée pour ce couple et cette sensibilité.",
          )}
        </p>
      )}
      <details>
        <summary>{t("Déplacer le couple entier")}</summary>
        <p className="mw-help">
          {t("Le capteur et l'aimant gardent exactement leur pose relative.")}
        </p>
        <div className="mw-guide-actions">
          {(
            [
              [t("Décaler de 5 mm en X"), { translationMm: [5, 0, 0] as [number, number, number] }],
              [t("Décaler de 5 mm en Z"), { translationMm: [0, 0, 5] as [number, number, number] }],
              [t("Tourner de 15°"), { rotationDeg: [0, 15, 0] as [number, number, number] }],
            ] as const
          ).map(([label, move]) => (
            <button
              key={label}
              className="mw-button mw-secondary"
              onClick={() => update(workshopPatchFromMounting(moveCouple(mounting, move), config))}
            >
              <Move3d size={15} aria-hidden="true" />
              {t(label)}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}

/** Comparaison des sensibilités : uniquement des lignes publiées, avec leur source. */
export function SensitivityComparison({ config }: { config: WorkshopConfig }) {
  const profile = profileFor(config.sensorId, config.magnetModel, config.geometry);
  if (!profile) return null;
  const rows = sensitivityComparison(profile);
  if (rows.length === 0) return null;
  return (
    <details className="mw-compare" data-testid="sensitivity-comparison">
      <summary>{t("Comparer les sensibilités")}</summary>
      <table>
        <thead>
          <tr>
            <th scope="col">{t("Classe")}</th>
            <th scope="col">{t("Enclenchement")}</th>
            <th scope="col">{t("Relâchement")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sensitivityClass} aria-current={r.sensitivityClass === config.sensitivity}>
              <th scope="row">{msg("Classe {0}", [r.sensitivityClass])}</th>
              <td className="t-metric">{msg("{0} mm", [r.pullInMm])}</td>
              <td className="t-metric">{msg("{0} mm", [r.dropOutMm])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mw-help">{t(rows[0]!.sourceRef)}</p>
    </details>
  );
}
