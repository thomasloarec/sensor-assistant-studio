import { createFileRoute } from "@tanstack/react-router";
import { DossierConsole } from "@/components/standex/console/dossier-console";

/** Accès direct à la console des dossiers, inchangée. */
export const Route = createFileRoute("/standex/console")({
  component: () => <DossierConsole embedded />,
});
