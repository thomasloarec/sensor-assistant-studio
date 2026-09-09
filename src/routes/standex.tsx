import { t } from "@/lib/i18n/core";
/** Espace de travail interne Standex.
 *
 * Cette route est désormais une mise en page : elle porte l'en-tête, la
 * navigation entre Projets, Tâches, Administration et la console des dossiers,
 * puis laisse chaque écran s'afficher. Aucun flux existant n'a été retiré : la
 * console complète (revue R&D, variantes, offres, échantillons, confidentialité,
 * documents, 3D) reste accessible et est réutilisée telle quelle dans la fiche
 * projet.
 */
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/standex/brand-logo";
import { CrmProvider, useCrm } from "@/components/standex/dashboard/crm-context";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/standex")({
  component: StandexWorkspace,
  head: () => ({
    meta: [
      { title: t("Espace de travail Standex — projets, revues et suivi") },
      {
        name: "description",
        content: t(
          "Espace interne Standex : suivi des projets, tâches par rôle, revue R&D des dossiers de conception, offres, échantillons et preuves de confidentialité.",
        ),
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: t("Espace de travail Standex") },
      {
        property: "og:description",
        content: t("Espace interne de suivi et de revue des dossiers de conception capteur."),
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const NAV = [
  { to: "/standex", label: "Projets", exact: true },
  { to: "/standex/tasks", label: "Tâches", exact: false },
  { to: "/standex/admin", label: "Administration", exact: false },
  { to: "/standex/console", label: "Console dossiers", exact: false },
] as const;

function WorkspaceHeader() {
  const { capabilities } = useCrm();
  return (
    <header className="material sticky top-0 z-30 shadow-[var(--e-1)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <BrandLogo height={44} />
        <h1 className="t-title-s">{t("Espace de travail Standex")}</h1>
        {capabilities?.role ? (
          <Badge variant="secondary">
            {capabilities.role === "rnd"
              ? "R&D"
              : capabilities.role === "sales"
                ? t("Commerce")
                : t("Administration")}
          </Badge>
        ) : null}
        <Link
          to="/design"
          className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-[var(--r-sm)] px-2 text-sm text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t("Espace de conception")}
        </Link>
      </div>
      <nav
        aria-label={t("Sections de l'espace de travail")}
        className="mx-auto flex max-w-6xl flex-wrap gap-1 px-4 pb-2"
      >
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.exact }}
            activeProps={{
              className:
                "bg-[var(--surface-tint)] text-foreground shadow-[var(--e-1)] font-medium",
            }}
            className="inline-flex min-h-11 items-center rounded-[var(--r-sm)] px-3 text-sm text-muted-foreground transition-colors duration-[var(--d-2)] ease-[var(--ease-standard)]"
          >
            {t(item.label)}
          </Link>
        ))}
      </nav>
    </header>
  );
}

function StandexWorkspace() {
  return (
    <CrmProvider>
      <div data-readable className="min-h-screen bg-background text-foreground">
        <WorkspaceHeader />
        <main className="mx-auto max-w-6xl p-4">
          <Outlet />
        </main>
      </div>
    </CrmProvider>
  );
}
