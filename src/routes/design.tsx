import { createFileRoute } from "@tanstack/react-router";
import { DesignSpace, PrivateDesignError } from "@/components/leadmagnet/design-space";

export const Route = createFileRoute("/design")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Concevoir une détection — Standex DETECT" },
      {
        name: "description",
        content:
          "Espace de co-conception privé : exigences, montage, candidats, câblage et préparation de la revue Standex.",
      },
      { property: "og:title", content: "Concevoir une détection — Standex DETECT" },
      {
        property: "og:description",
        content: "Co-conception privée d'une solution de détection magnétique Standex.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DesignRoute,
  // Frontière dédiée : une erreur ici ne remonte qu'un code fixe, sans message
  // d'origine ni pile, pour qu'aucune donnée du projet privé ne parte en télémétrie.
  errorComponent: PrivateDesignError,
});

/** /design monte exactement la même expérience que l'espace projet de l'accueil. */
function DesignRoute() {
  return <DesignSpace chrome="page" />;
}
