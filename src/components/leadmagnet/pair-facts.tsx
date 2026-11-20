import { Box, Magnet, MoveHorizontal, Ruler, Wrench, Bolt } from "lucide-react";
import { t } from "@/lib/i18n/core";
import type { PairCard } from "@/lib/leadmagnet/pair-cards";
import { formatMm } from "@/lib/standex/sensor-catalog";

/** Documentary values stay attached to the exact proposed pair. */
export function PairFacts({ card }: { card: PairCard }) {
  const hasRange = card.guideUpMm !== null && card.guideToMm !== null;
  return (
    <dl className="pair-card-facts" aria-label={t("Données de choix")}>
      {card.materialLabel ? (
        <div>
          <dt>
            <Magnet aria-hidden="true" />
            {t("Matériau de l'aimant")}
          </dt>
          <dd>{t(card.materialLabel)}</dd>
        </div>
      ) : null}
      {card.sensorMaterialLabel ? (
        <div data-testid="pair-sensor-material">
          <dt>
            <Box aria-hidden="true" />
            {t("Boîtier du capteur")}
          </dt>
          <dd>{t(card.sensorMaterialLabel)}</dd>
        </div>
      ) : null}
      {card.threadLabel ? (
        <div data-testid="pair-thread">
          <dt>
            <Bolt aria-hidden="true" />
            {t("Filetage")}
          </dt>
          <dd className="t-metric">{card.threadLabel}</dd>
        </div>
      ) : null}
      <div>
        <dt>
          <Wrench aria-hidden="true" />
          {t("Montage du capteur")}
        </dt>
        <dd>{t(card.fixingLabel)}</dd>
      </div>
      <div>
        <dt>
          <Ruler aria-hidden="true" />
          {t("Dimensions du capteur")}
        </dt>
        <dd className="t-metric">{card.size}</dd>
      </div>
      <div data-testid="pair-activation-distance">
        <dt>
          <MoveHorizontal aria-hidden="true" />
          {t("Distance d’activation")}
        </dt>
        <dd>
          {hasRange ? (
            <>
              <span className="pair-distance-value">
                <span className="t-metric">
                  {formatMm(card.guideUpMm!)} – {formatMm(card.guideToMm!)} mm
                </span>
                <span className="t-caption">{t("indicatif, à confirmer")}</span>
              </span>
              <span className="t-caption block mt-1">
                {t("Plage documentaire indicative, sans validation de la simulation.")}
              </span>
              <span className="t-caption block mt-1">
                {t("Référence documentaire")} · {card.guideReference} · {card.guideApproach}
              </span>
            </>
          ) : card.maxPullInMm !== null ? (
            <>
              <span className="pair-distance-value">
                <span className="t-metric">{formatMm(card.maxPullInMm)} mm</span>
                <span className="t-caption">{t("indicatif, à confirmer")}</span>
              </span>
              <span className="t-caption block mt-1">{t("Distance typique publiée")}</span>
            </>
          ) : (
            <span>{t("Distances non publiées pour ce couple")}</span>
          )}
        </dd>
      </div>
    </dl>
  );
}
