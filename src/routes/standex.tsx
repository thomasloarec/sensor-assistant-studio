import { t } from "@/lib/i18n/core";
/** Espace de travail interne Standex.
 *
 * Cette route est une mise en page : elle porte l'en-tête (marque, navigation
 * de travail, langue, menu de compte) puis laisse chaque écran s'afficher.
 * Aucun flux existant n'a été retiré : la console complète (revue R&D,
 * variantes, offres, échantillons, confidentialité, documents, 3D) reste
 * accessible et est réutilisée telle quelle dans la fiche projet.
 */
import { useEffect, useState } from "react";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { BrandLogo } from "@/components/standex/brand-logo";
import { CrmProvider, useCrm } from "@/components/standex/dashboard/crm-context";
import { FlashProvider } from "@/components/standex/dashboard/flash";
import { AvatarInitials } from "@/components/standex/dashboard/avatar-initials";
import { CrmUnavailableNotice } from "@/components/standex/dashboard/crm-shared";
import { AuthPanel } from "@/components/leadmagnet/auth-panel";
import { checkLeadBackend, type LeadBackendStatus } from "@/lib/leadmagnet/backend";
import { supabase } from "@/lib/standex/supabase";
import { LanguagePicker } from "@/lib/i18n/react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

/* i18n-canonical : libellés canoniques traduits par t() au rendu.
   Trois surfaces de TRAVAIL seulement : l'administration vit dans le menu de
   compte, parce qu'elle ne dépend d'aucun projet. */
const NAV = [
  { to: "/standex", label: "Projets", exact: true },
  { to: "/standex/tasks", label: "Tâches", exact: false },
  { to: "/standex/console", label: "Dossiers", exact: false },
] as const;

/** Index de l'onglet de travail actif, ou -1 quand l'écran affiché n'en est
 *  aucun (l'administration, par exemple) : aucun onglet ne doit alors
 *  s'allumer. */
function activeIndex(pathname: string): number {
  if (pathname.startsWith("/standex/tasks")) return 1;
  if (pathname.startsWith("/standex/console")) return 2;
  if (pathname === "/standex" || pathname === "/standex/") return 0;
  return -1;
}

function AccountMenu() {
  const { capabilities } = useCrm();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (alive) setEmail(data.session?.user?.email ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [capabilities?.userId]);

  const person = capabilities?.person ?? null;
  const name = person
    ? `${person.firstName} ${person.lastName}`.trim()
    : (email ?? t("Compte Standex"));
  const roleLabel =
    capabilities?.role === "rnd"
      ? "R&D"
      : capabilities?.role === "sales"
        ? t("Commerce")
        : capabilities?.role === "admin"
          ? t("Administration")
          : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={name}
        className="press inline-flex min-h-11 items-center gap-2 rounded-[var(--r-sm)] px-2"
      >
        <AvatarInitials name={name} />
        <span className="t-body max-w-[10rem] truncate">{name}</span>
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[15rem]">
        <div className="space-y-1 px-3 py-2">
          <p className="t-body">{name}</p>
          {email ? <p className="t-caption break-all">{email}</p> : null}
          {roleLabel ? <Badge variant="secondary">{roleLabel}</Badge> : null}
        </div>
        <DropdownMenuSeparator />
        {capabilities?.role === "admin" ? (
          <DropdownMenuItem asChild>
            <Link to="/standex/admin">{t("Administration")}</Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link to="/">{t("Espace de conception")}</Link>
        </DropdownMenuItem>
        {supabase ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                void supabase!.auth.signOut();
              }}
            >
              {t("Se déconnecter")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WorkspaceHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const index = activeIndex(pathname);
  return (
    <header className="material sticky top-0 z-30 shadow-[var(--e-1)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <BrandLogo height={44} />
        <h1 className="t-title-s">{t("Espace de travail Standex")}</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <LanguagePicker />
          <AccountMenu />
        </div>
      </div>
      <nav
        aria-label={t("Sections de l'espace de travail")}
        className="mx-auto max-w-6xl px-4 pb-3"
      >
        <div className="segmented" style={{ ["--seg" as string]: index }}>
          <span className="segmented-thumb" aria-hidden="true" />
          {NAV.map((item, i) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact }}
              data-active={i === index ? "true" : undefined}
              className="segmented-item"
            >
              {t(item.label)}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}

/** Accueil de session : on doit pouvoir se connecter depuis l'espace interne,
 *  sans passer par l'espace de conception. Aucune logique d'authentification
 *  nouvelle : le formulaire existant est réutilisé tel quel. */
function WorkspaceGate() {
  const { capabilities, legacyRole, refresh } = useCrm();
  const [backend, setBackend] = useState<LeadBackendStatus | null>(null);

  useEffect(() => {
    let alive = true;
    void checkLeadBackend()
      .then((status) => {
        if (alive) setBackend(status);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [capabilities?.userId]);

  /* Un serveur qui répond « non autorisé » à un visiteur déconnecté n'est pas
     un serveur non activé : dans ce cas on propose la connexion. */
  const unavailable = capabilities?.available === false && backend?.authenticated === true;

  return (
    <div className="mx-auto w-full max-w-[30rem] space-y-4 panel-block-lg anim-rise">
      <span className="standex-bar" aria-hidden="true" />
      <h2 className="t-title-l">{t("Espace de travail Standex")}</h2>
      {unavailable ? (
        <CrmUnavailableNotice
          plain={t("L'espace de travail interne n'est pas encore activé sur ce serveur.")}
          detail={capabilities?.detail}
          isAdmin={legacyRole === "admin"}
        />
      ) : (
        <>
          <p className="t-body">
            {t(
              "Cet espace est réservé aux équipes Standex. Connectez-vous avec votre compte professionnel.",
            )}
          </p>
          <AuthPanel
            backend={backend}
            onChanged={() => {
              refresh();
              void checkLeadBackend()
                .then(setBackend)
                .catch(() => {});
            }}
          />
          <p className="t-caption">
            {t(
              "Vous avez un compte mais aucun droit sur cet espace ? Un administrateur Standex doit vous l'accorder.",
            )}
          </p>
        </>
      )}
      <Link to="/" className="t-caption inline-flex min-h-11 items-center">
        {t("Revenir à l'espace de conception")}
      </Link>
    </div>
  );
}

function WorkspaceBody() {
  const { capabilities } = useCrm();
  const locked = capabilities !== null && capabilities.role === null;
  return (
    <main className="mx-auto max-w-6xl p-4">{locked ? <WorkspaceGate /> : <Outlet />}</main>
  );
}

function StandexWorkspace() {
  return (
    <CrmProvider>
      <FlashProvider>
        <div data-readable className="min-h-screen bg-background text-foreground">
          <WorkspaceHeader />
          <WorkspaceBody />
        </div>
      </FlashProvider>
    </CrmProvider>
  );
}
