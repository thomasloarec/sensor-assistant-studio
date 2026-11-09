import type { ReactNode } from "react";
import type { PlacementEvidence } from "@/lib/detection-lab/workshop-experiment";
import { t } from "@/lib/i18n/core";

// i18n-canonical: labels translated with t() at the visual and accessible render sites.
export function clientPlacementTitle(
  contact: "open" | "closed" | null,
  cause: PlacementEvidence["cause"],
) {
  if (contact !== null) return contact === "closed" ? "Aimant détecté" : "Aimant non détecté";
  return [
    "collision",
    "scenario_collision",
    "overlap",
    "reed_overlap",
    "scenario_overlap",
  ].includes(cause)
    ? "Position à ajuster"
    : "Simulation à compléter";
}

/** Describes the displayed instant, using the very same state as the circuit.
 * It is deliberately not a verdict on the entire motion or the real product. */
export function ClientPlacementStatus({
  contact,
  cause,
  playing,
  children,
}: {
  contact: "open" | "closed" | null;
  cause: PlacementEvidence["cause"];
  playing: boolean;
  children?: ReactNode;
}) {
  const blocked = [
    "collision",
    "scenario_collision",
    "overlap",
    "reed_overlap",
    "scenario_overlap",
  ].includes(cause);
  const title = clientPlacementTitle(contact, cause);
  const help =
    contact !== null
      ? playing
        ? "Le circuit suit la position de l’aimant."
        : "Lancez le mouvement et observez le circuit."
      : blocked
        ? "Vérifiez l’espace autour du capteur et de l’aimant."
        : cause === "motion" || cause === "clip"
          ? "Définissez le mouvement de votre modèle."
          : cause === "asset"
            ? "Chargez votre modèle pour explorer la détection."
            : "Ce montage nécessite une vérification avec Standex.";
  return (
    <div className="mw-verdict-banner notice-info" data-testid="client-pedagogical-verdict">
      <span className="t-caption">{t("À cette position")}</span>
      <strong className="t-title-s" role="status" data-testid="client-instant-state">
        {t(title)}
      </strong>
      <p className="t-body">{t(help)}</p>
      {children}
    </div>
  );
}

export function ClientZoneLegend({
  sensor,
  magnet,
  variableZone,
  children,
  alert,
}: {
  sensor: string;
  magnet: string;
  variableZone: boolean;
  children?: ReactNode;
  alert?: ReactNode;
}) {
  return (
    <div className="mw-legend mw-client-zone-legend" data-testid="client-product-legend">
      <span className="t-title-s">
        {sensor} + {magnet}
      </span>
      <span className="t-caption">{t("Les couleurs dans la vue 3D")}</span>
      <span className="mw-ped-high">{t("Détection estimée")}</span>
      {variableZone && <span className="mw-ped-low">{t("Détection selon la sensibilité")}</span>}
      <span className="mw-ped-gray">{t("Obstacle mécanique")}</span>
      {alert}
      <span className="t-caption">{t("Simulation indicative")}</span>
      <details className="mw-reading-details">
        <summary>{t("En savoir plus")}</summary>
        <div className="mw-reading-details-body">
          <p className="t-body">
            {t(
              "L’aimant actionne le contact sans le toucher. Observez le circuit quand il se déplace.",
            )}
          </p>
          {variableZone && (
            <p className="t-caption">
              {t(
                "La lampe illustre un capteur très sensible. Dans la zone jaune, l’activation dépend de sa sensibilité.",
              )}
            </p>
          )}
          {children}
        </div>
      </details>
    </div>
  );
}
