/** Vignette d'un COUPLE : le capteur et son aimant, côte à côte.
 *
 * Pourquoi deux vignettes et non une scène commune : dans une scène commune, la
 * caméra doit reculer pour contenir les deux corps ET l'entrefer de dessin, si
 * bien que chaque objet n'occupait plus qu'une dizaine de pour cent de l'image.
 * Ici chaque objet garde son propre cadrage (`fitToView`), donc sa lisibilité,
 * et le « + » dit que les deux se commandent ensemble.
 *
 * L'aimant est rendu en 3D avec la géométrie de boîtier réellement documentée
 * (`paired-magnets.ts`, alimenté par `magnet-catalog.ts`). Quand cette géométrie
 * n'existe pas, aucun cylindre n'est inventé : un pictogramme N/S le remplace et
 * il est annoncé comme un repère, pas comme un dessin de la pièce.
 */
import { pairedMagnetModel } from "@/lib/standex/paired-magnets";
import { t } from "@/lib/i18n/core";
import { CandidateThumbnail } from "./candidate-thumbnail";

/** Repère N/S, utilisé UNIQUEMENT sans géométrie de boîtier documentée.
 *  Aucun texte dans l'image : le repère est annoncé par `aria-label` et par
 *  l'infobulle. La légende « Aimant » est écrite SOUS l'image. */
function MagnetPictogram({ magnetId }: { magnetId: string }) {
  const label = `${magnetId} — ${t("repère magnétique, pas un dessin de la pièce")}`;
  return (
    <div className="candidate-thumb" data-role="magnet" title={label}>
      <div className="candidate-thumb-fallback" role="img" aria-label={label}>
        <svg viewBox="-60 -30 120 60" aria-hidden="true" focusable="false">
          <rect className="magnet-pole-north" x={-44} y={-16} width={44} height={32} rx={3} />
          <rect className="magnet-pole-south" x={0} y={-16} width={44} height={32} rx={3} />
          <text className="magnet-pole-text" x={-22} y={6} textAnchor="middle">
            N
          </text>
          <text className="magnet-pole-text" x={22} y={6} textAnchor="middle">
            S
          </text>
        </svg>
      </div>
      <span className="candidate-thumb-legend t-label">
        <svg
          className="candidate-thumb-legend-icon"
          viewBox="-12 -6 24 12"
          aria-hidden="true"
          focusable="false"
        >
          <rect className="magnet-pole-north" x={-10} y={-5} width={10} height={10} rx={1} />
          <rect className="magnet-pole-south" x={0} y={-5} width={10} height={10} rx={1} />
        </svg>
        <span>{t("Aimant")}</span>
        <strong className="t-metric">{magnetId}</strong>
      </span>
    </div>
  );
}

export function PairThumbnail({
  sensorId,
  magnetId,
  size = "large",
}: {
  sensorId: string;
  magnetId: string;
  size?: "compact" | "large";
}) {
  // Le boîtier dépend parfois de la variante de capteur (M11S en M5 ou M8) :
  // on interroge la géométrie avec le capteur réellement retenu.
  const magnetDrawn = pairedMagnetModel(magnetId, sensorId) !== null;
  return (
    <div className="pair-thumb-row" data-magnet-drawn={magnetDrawn ? "3d" : "picto"}>
      {/* Chaque vignette porte sa légende : « Capteur » d'un côté, « Aimant »
          de l'autre, avec le repère de pôles. Le rendu 3D est demandé dès que
          la vignette est visible, sans survol. */}
      <CandidateThumbnail
        sensorId={sensorId}
        cabled={true}
        fitToView
        size={size}
        legend="sensor"
        quiet
      />
      <span className="pair-thumb-plus" aria-hidden="true">
        +
      </span>
      {magnetDrawn ? (
        <CandidateThumbnail
          sensorId={magnetId}
          // Capteur du couple : la fiche peut donner un boîtier par variante
          // (M11S en M5 ou en M8). Sans lui, l'aimant serait dessiné dans une
          // autre variante que celle réellement retenue, en 2D comme en 3D.
          hostSensorId={sensorId}
          cabled={false}
          fitToView
          size={size}
          legend="magnet"
          quiet
        />
      ) : (
        <MagnetPictogram magnetId={magnetId} />
      )}
    </div>
  );
}
