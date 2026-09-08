import { t } from "@/lib/i18n/core";
import { LanguagePicker, useLocale } from "@/lib/i18n/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  useLocale();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="anim-rise max-w-md text-center">
        <LanguagePicker />
        <p className="t-display-xl mt-6 font-light">404</p>
        <span className="standex-bar mt-2" aria-hidden="true" />
        <h1 className="t-title-l mt-4">{t("Page introuvable")}</h1>
        <p className="t-body mt-3 text-muted-foreground">
          {t("Cette page est introuvable ou a été déplacée.")}
        </p>
        <div className="mt-8">
          <Link
            to="/"
            className="press inline-flex h-12 items-center justify-center rounded-[var(--r-pill)] bg-[var(--primary)] px-6 font-semibold text-[var(--primary-foreground)] shadow-[var(--e-2)] transition-[background-color,box-shadow] duration-[var(--d-fast)] ease-[var(--ease-out)] hover:bg-[var(--primary-hover)] hover:shadow-[var(--e-3)]"
          >
            {t("Retour à l'accueil")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  useLocale();
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="anim-rise max-w-md text-center">
        <LanguagePicker />
        <span className="standex-bar mt-6" aria-hidden="true" />
        <h1 className="t-title-l mt-4">{t("La page n'a pas pu être chargée")}</h1>
        <p className="t-body mt-3 text-muted-foreground">
          {t("Une erreur est survenue. Réessayez ou revenez à l'accueil.")}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="press inline-flex h-12 cursor-pointer items-center justify-center rounded-[var(--r-pill)] bg-[var(--primary)] px-6 font-semibold text-[var(--primary-foreground)] shadow-[var(--e-2)] transition-[background-color,box-shadow] duration-[var(--d-fast)] ease-[var(--ease-out)] hover:bg-[var(--primary-hover)] hover:shadow-[var(--e-3)]"
          >
            {t("Réessayer")}
          </button>
          <a
            href="/"
            className="press inline-flex h-12 items-center justify-center rounded-[var(--r-pill)] px-6 font-semibold text-foreground shadow-[inset_0_0_0_1px_var(--hairline-strong)] transition-[background-color,box-shadow] duration-[var(--d-fast)] ease-[var(--ease-out)] hover:bg-[var(--surface-tint)]"
          >
            {t("Retour à l'accueil")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Standex DETECT — Détection magnétique" },
      { name: "description", content: "Standex DETECT — Détection magnétique" },
      { name: "author", content: "Standex Electronics" },
      // Valeur de `--standex-blue` en dur : une meta ne peut pas lire une variable CSS. À synchroniser si le jeton change.
      { name: "theme-color", content: "#254061" },
      { property: "og:title", content: "Standex DETECT — Détection magnétique" },
      { property: "og:description", content: "Standex DETECT — Détection magnétique" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Source+Sans+3:ital,wght@0,200..900;1,200..900&family=Lato:wght@400;700&family=IBM+Plex+Mono:wght@400;500&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/brand/favicon-32.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/brand/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        {t(children)}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
