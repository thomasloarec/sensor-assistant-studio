// FICHIER TEMPORAIRE DE RECETTE — supprimé à la fin de la recette.
import { createFileRoute } from "@tanstack/react-router";
import MagneticWorkshop from "@/components/standex/workshop/workshop";
export const Route = createFileRoute("/recette-atelier-tmp")({
  ssr: false,
  head: () => ({ meta: [{ title: "Recette" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <MagneticWorkshop initialConfig={null} onClose={() => undefined} onSave={async () => undefined} />
  ),
});
