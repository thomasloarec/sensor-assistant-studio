import { createFileRoute } from "@tanstack/react-router";
import { t } from "@/lib/i18n/core";
import { DossierConsole } from "@/components/standex/console/dossier-console";

/** Accès direct à la console des dossiers, inchangée. */
export const Route = createFileRoute("/standex/console")({
  component: ConsoleScreen,
});

function ConsoleScreen() {
  return (
    <div className="space-y-3">
      <p className="t-caption">
        {t(
          "Revue R&D des dossiers de conception : offres, échantillons, documents et 3D. Accessible aussi depuis l'onglet Revue de chaque projet.",
        )}
      </p>
      <DossierConsole embedded />
    </div>
  );
}
