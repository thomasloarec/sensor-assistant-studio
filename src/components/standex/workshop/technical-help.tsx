import { useId } from "react";
import { t, msg } from "@/lib/i18n/core";

/** An explicit disclosure also works with touch and keyboard, without hover. */
export function TechnicalHelp({ term, children }: { term: string; children: string }) {
  const id = useId();
  return (
    <details className="technical-help">
      <summary aria-controls={id} aria-label={msg("Comprendre : {0}", [t(term)])}>
        *
      </summary>
      <div id={id} role="note">
        <strong>{t(term)}</strong>
        <p>{t(children)}</p>
      </div>
    </details>
  );
}

/* i18n-canonical: translated by TechnicalHelp. */
export const NEED_HELP: Record<string, string> = {
  gapClosedMm:
    "Distance libre entre le capteur et l’aimant lorsque votre pièce est fermée. Exemple : bac complètement rentré. Mesurez dans la direction D choisie sur le schéma ; ce n’est pas la distance entre leurs centres.",
  gapOpenMm:
    "Distance libre entre le capteur et l’aimant lorsque votre pièce est ouverte. Exemple : bac sorti. Utilisez les mêmes faces de référence que pour la position fermée.",
  gapToleranceMm:
    "Variation maximale de cette distance due au montage, en plus ou en moins. Exemple : 0,5 mm signifie ±0,5 mm. Si vous ne la connaissez pas, laissez le champ vide : la comparaison restera conditionnelle.",
  temperatureMinC:
    "Température la plus basse prévue près du capteur. Elle documente votre besoin ; les distances typiques ne sont pas corrigées en température sans mesures Standex.",
  temperatureMaxC:
    "Température la plus haute prévue près du capteur, y compris pendant le fonctionnement de la machine. Elle ne constitue pas une température validée pour la solution.",
};
