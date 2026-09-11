import { useMemo } from "react";
import { t, msg } from "@/lib/i18n/core";
import { CircleCheck, CircleHelp, CircleX, Move3d, Wand2 } from "lucide-react";
import type { WorkshopConfig } from "@/lib/standex/magnetic-workshop";
import {
  applySuggestion,
  mountingFromWorkshop,
  mountingHash,
  moveCouple,
  profileFor,
  referenceTravelExploration,
  sensitivityComparison,
  documentedDistances,
  suggestPose,
  withComputed,
  workshopPatchFromMounting,
} from "@/lib/standex/mounting";
import type { GuidedMounting } from "@/lib/standex/mounting";

/* i18n-canonical : libellés stockés en français, traduits au rendu par t(). */
const VERDICT_TITLE = {
  expected: "Détection prévue dans le modèle de référence",
  not_expected: "Détection non prévue dans le modèle de référence",
  undetermined: "Comportement indéterminé",
} as const;
const COVERAGE_LABEL = {
  covered: "Toute la course est couverte par le gabarit",
  partial: "Une partie de la course sort du gabarit",
  outside: "La course sort du gabarit de référence",
} as const;
const EVIDENCE_LABEL = {
  published_typical: "Valeurs typiques publiées Standex",
  schematic: "Gabarit géométrique schématique, non caractérisé",
  uncharacterised: "Aucune source applicable à cette pose",
} as const;
/** Chaque code émis par le moteur a ici une phrase lisible : aucun code brut à l'écran. */
const REASON_LABEL: Record<string, string> = {
  NO_PROFILE: "Ce couple capteur–aimant n'a pas de table publiée.",
  APPROACH_NOT_LOCATED:
    "Cette approche est documentée en distances, mais sa trajectoire n'est pas définie.",
  SOURCE_NOT_QUALIFIED: "La source de ce couple n'est pas encore qualifiée pour le calcul.",
  CLASS_NOT_PUBLISHED: "Cette classe de sensibilité n'est pas publiée.",
  CUSTOM_MODEL_NOT_CHARACTERISED: "Votre modèle importé n'est pas caractérisé.",
  FERROUS_DECLARED: "Une matière ferromagnétique proche est déclarée.",
  TEMPERATURE_NOT_AMBIENT: "La température déclarée sort du cas de référence.",
  EDUCATION_MODE: "La démonstration pédagogique n'utilise pas de distances réelles.",
  MOTION_NOT_ON_APPROACH_AXIS: "Le mouvement déclaré n'est pas l'approche du gabarit.",
  MAGNETIZATION_NOT_TEMPLATE: "L'aimantation déclarée n'est pas celle du gabarit.",
  POLARITY_NOT_TEMPLATE: "La polarité déclarée n'est pas celle du gabarit.",
  SENSOR_ANGLE_OFF_TEMPLATE: "Le capteur est incliné par rapport au gabarit.",
  ORIENTATION_OFF_TEMPLATE: "L'aimant n'est plus parallèle au gabarit de référence.",
  LATERAL_OFFSET: "L'aimant est décalé hors du plan de référence.",
  COLLISION_OR_CONTACT: "Les deux corps se touchent sur une partie de la course.",
};
const LIMIT_LABEL: Record<string, string> = {
  typical_not_guaranteed: "Une valeur typique n'est pas une valeur garantie.",
  datum_not_characterised: "Les repères de mesure des plans ne sont pas caractérisés.",
  schematic_template_only: "Le gabarit affiché est explicitement schématique.",
  sensitivity_spread: "La dispersion de sensibilité entre pièces n'est pas couverte.",
  magnet_spread: "La dispersion des aimants n'est pas couverte.",
  temperature_drift: "La dérive en température n'est pas couverte.",
  magnet_aging: "Le vieillissement de l'aimant n'est pas couvert.",
  material_permeability: "La perméabilité des matériaux voisins n'est pas couverte.",
  assembly_misalignment: "Les défauts d'alignement de montage ne sont pas couverts.",
  contact_bounce: "Les rebonds du contact ne sont pas couverts.",
  switching_rate: "La cadence de commutation n'est pas couverte.",
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
          {t("Replacer l'aimant sur le gabarit de référence")}
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

/**
 * Guidage de position. La prévisualisation vit dans l'état du parent : elle
 * n'écrit RIEN dans la configuration tant que l'utilisateur n'applique pas.
 * Si les entrées changent, la proposition affichée est recalculée et une
 * prévisualisation devenue obsolète est abandonnée par le parent.
 */
export function GuidedSuggestion({
  config,
  update,
  preview,
  onPreview,
}: {
  config: WorkshopConfig;
  update: (patch: Partial<WorkshopConfig>) => void;
  /** Pose prévisualisée, jamais enregistrée. */
  preview: GuidedMounting | null;
  onPreview: (next: GuidedMounting | null) => void;
}) {
  const mounting = useGuidedMounting(config);
  const proposal = useMemo(() => suggestPose(mounting), [mounting]);
  const previewing = preview !== null && mountingHash(preview) !== mountingHash(mounting);

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
              <dd>
                {t(
                  proposal.suggestion.approachId === "D3"
                    ? "D3 · approche par l'extrémité, axe X du capteur"
                    : "D1 · approche face au centre, axe Z du capteur",
                )}
              </dd>
            </div>
            <div>
              <dt>{t("Entrefer visé")}</dt>
              <dd className="t-metric">{msg("{0} mm", [proposal.suggestion.gapMm])}</dd>
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
            {previewing ? (
              <>
                <button
                  className="mw-button"
                  onClick={() => {
                    update(workshopPatchFromMounting(preview, config));
                    onPreview(null);
                  }}
                >
                  {t("Appliquer cette position")}
                </button>
                <button className="mw-button mw-secondary" onClick={() => onPreview(null)}>
                  {t("Annuler la prévisualisation")}
                </button>
              </>
            ) : (
              <button
                className="mw-button"
                onClick={() => {
                  if (!proposal.ok) return;
                  const applied = applySuggestion(mounting, proposal.suggestion);
                  if (applied.ok) onPreview(applied.mounting);
                }}
              >
                {t("Prévisualiser la position suggérée")}
              </button>
            )}
          </div>
          <details>
            <summary>{t("Explorer la course du gabarit")}</summary>
            <p className="mw-help">
              {t(
                "Action distincte : elle remplace votre course déclarée par celle du gabarit publié. Votre besoin et vos contraintes restent inchangés.",
              )}
            </p>
            <p className="mw-help t-metric">
              {msg("De {0} mm à {1} mm", [
                proposal.suggestion.startGapMm,
                proposal.suggestion.endGapMm,
              ])}
            </p>
            <button
              className="mw-button mw-secondary"
              onClick={() => {
                if (!proposal.ok) return;
                update(
                  workshopPatchFromMounting(
                    referenceTravelExploration(mounting, proposal.suggestion),
                    config,
                  ),
                );
              }}
            >
              {t("Reprendre la course du gabarit")}
            </button>
          </details>
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
  // Lignes documentaires : toute famille, toute classe, toute approche du
  // registre. Elles ne sont jamais présentées comme un volume de détection.
  const documented = rows.length === 0 ? documentedDistances(profile) : [];
  if (rows.length === 0 && documented.length === 0) return null;
  if (rows.length === 0)
    return (
      <details className="mw-compare" data-testid="documented-distances">
        <summary>{t("Distances publiées (documentation)")}</summary>
        <p className="mw-help">
          {t(
            "Ces distances ne sont pas utilisées par le calcul : la trajectoire de cette approche n'est pas définie.",
          )}
        </p>
        <table>
          <thead>
            <tr>
              <th scope="col">{t("Classe")}</th>
              <th scope="col">{t("Enclenchement")}</th>
              <th scope="col">{t("Relâchement")}</th>
            </tr>
          </thead>
          <tbody>
            {documented.map((r) => (
              <tr key={r.sensitivityClass}>
                <th scope="row">{msg("Classe {0}", [r.sensitivityClass])}</th>
                <td className="t-metric">{msg("{0} mm", [r.pullInMm])}</td>
                <td className="t-metric">{msg("{0} mm", [r.dropOutMm])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mw-help">{t(documented[0]!.sourceRef)}</p>
      </details>
    );
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
