import { t } from "@/lib/i18n/core";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { PrivateDesignError } from "@/components/leadmagnet/design-space";

export const Route = createFileRoute("/design")({
  ssr: false,
  // Adresse conservée pour les anciens liens : elle amène à l'espace projet
  // UNIQUE de l'accueil. Auparavant, elle montait un second espace en
  // parallèle, et revenir à l'accueil depuis le logo perdait le brouillon.
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: t("Concevoir une détection — Standex DETECT") },
      {
        name: "description",
        content: t(
          "Espace de co-conception privé : exigences, montage, candidats, câblage et préparation de la revue Standex.",
        ),
      },
      { property: "og:title", content: t("Concevoir une détection — Standex DETECT") },
      {
        property: "og:description",
        content: t("Co-conception privée d'une solution de détection magnétique Standex."),
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => null,
  errorComponent: PrivateDesignError,
});

