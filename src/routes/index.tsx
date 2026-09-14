import { t } from "@/lib/i18n/core";
/** Accueil client : découverte interactive, puis espace projet unifié à la même URL.
 *
 * L'espace projet est le composant DesignSpace existant (même dossier, mêmes
 * gardes serveur, mêmes handlers) : aucune seconde application, aucun envoi
 * silencieux. Le banc interne vit désormais sur /internal.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { ArrowRight, ChevronDown, UserRound } from "lucide-react";
import { BrandLogo } from "@/components/standex/brand-logo";
import { usePublishedHeaderHeight } from "@/components/standex/app-header";
import { Button } from "@/components/ui/button";
import { MagnetPlay } from "@/components/leadmagnet/magnet-play";
import { DesignSpace, PrivateDesignError } from "@/components/leadmagnet/design-space";
import { useReveal } from "@/hooks/use-reveal";
import { LanguagePicker, useLocale } from "@/lib/i18n/react";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => {
    const raw = typeof search["dossier"] === "string" ? search["dossier"] : "";
    return UUID_RE.test(raw) ? { dossier: raw } : {};
  },
  head: () => ({
    meta: [
      { title: t("Sensor Studio — faire détecter votre idée · Standex DETECT") },
      {
        name: "description",
        content:
          t("Décrivez ce que vous voulez détecter, jouez avec un aimant et un capteur, et préparez votre projet de détection magnétique avec les ingénieurs Standex."),
      },
      { property: "og:title", content: t("Sensor Studio — faire détecter votre idée · Standex DETECT") },
      {
        property: "og:description",
        content:
          t("Découverte interactive de la détection magnétique et espace de projet privé Standex DETECT."),
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: HomeRoute,
  errorComponent: PrivateDesignError,
});

function HomeRoute() {
  useLocale();
  /** Lien reçu par message : le projet n'est ouvert qu'après connexion et
   * seulement s'il appartient réellement au compte. */
  const requestedDossierId = Route.useSearch().dossier ?? "";
  const [started, setStarted] = useState(false);
  /** L'espace projet reste monté : une fois ouvert, revenir à l'accueil ne
   * perd rien et « Reprendre mon projet » réaffiche le même brouillon. */
  const [opened, setOpened] = useState(false);
  const openWorkspace = () => {
    setOpened(true);
    setStarted(true);
  };
  // Lien « /?dossier=… » : on ouvre l'espace projet après le montage, comme un
  // clic réel, pour que l'écran suive exactement le parcours habituel.
  const [accountRequest, setAccountRequest] = useState(0);

  useEffect(() => {
    if (!requestedDossierId) return;
    setOpened(true);
    setStarted(true);
    // Le projet demandé appartient à un compte : on présente tout de suite
    // l'espace de connexion, sans rien ouvrir avant vérification.
    setAccountRequest((n) => n + 1);
  }, [requestedDossierId]);


  /* Le héros garde sa mise en page propre, mais il publie la même hauteur de
     bandeau que le composant partagé : tout élément collant se cale pareil. */
  const headerRef = usePublishedHeaderHeight<HTMLElement>();

  return (
    <div data-readable className="min-h-screen bg-background text-foreground">
      <main className={started ? "hidden" : undefined}>
        <div className="immersive hero-field overflow-hidden">
          <header
            ref={headerRef}
            className="material sticky top-0 z-30 shadow-[inset_0_-1px_0_var(--hairline)]"
          >
            {/* La rangée entière peut passer à la ligne : avec « Reprendre mon
                projet » en allemand ou en russe, trois contrôles ne tiennent pas
                sur 320 px. On les fait descendre plutôt que les couper. */}
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 sm:gap-4 sm:px-6 lg:px-8">
              <span className="flex min-w-0 items-center">
                <BrandLogo tone="reversed" height={44} className="hidden sm:block" />
                <BrandLogo variant="mark" tone="reversed" height={32} className="sm:hidden" />
                {/* Nom de l'outil à côté de la marque, jamais dans le logo. */}
                <span className="t-title-s ml-3 whitespace-nowrap">Sensor Studio</span>
              </span>
              <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
                <LanguagePicker />
                {opened ? (
                  <Button variant="outline" className="min-h-11" onClick={() => setStarted(true)}>
                    <ArrowRight className="h-4 w-4 shrink-0" /> {t("Reprendre mon projet")}
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setAccountRequest((n) => n + 1)}
                >
                  <UserRound className="h-4 w-4 shrink-0" /> {t("Mon espace")}
                </Button>
              </div>
            </div>
          </header>

          {/* Hauteur NATURELLE du contenu : le héros ne réserve plus la moitié
              basse de l'écran, si bien que « Comment ça se passe » est visible
              sans grand vide au premier coup d'œil. */}
          <div className="relative mx-auto flex max-w-7xl items-center px-4 py-12 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
            <span className="hero-glow right-[6%] top-[10%] size-[520px] max-w-[70vw]" />
            <div className="grid w-full gap-14 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:gap-10">
              <div
                className="home-hero-copy anim-stagger relative z-10"
                style={{ "--stagger": "70ms" } as CSSProperties}
              >
                <p className="t-label flex items-center gap-3">
                  <span className="standex-bar h-[14px] w-[6px] shrink-0" aria-hidden="true" />
                  {t("Détection magnétique")}
                </p>
                <h1 className="t-display-xl mt-5 max-w-[18ch] text-balance">
                  {t("Vérifiez la détection dans votre montage.")}
                </h1>
                <p className="t-body-l mt-7 max-w-[34rem] text-muted-foreground">
                  {t("Décrivez ce que vous voulez détecter. Sensor Studio vous propose des couples capteur-aimant Standex et vous montre s'ils détecteront dans votre montage.")}
                </p>
                {/* UN SEUL bouton primaire : le retour sur un projet existant est
                    un lien, pas une seconde action de même poids. */}
                <div className="mt-10 flex flex-wrap items-center gap-6">
                  <Button size="lg" className="group" onClick={openWorkspace}>
                    {t("Commencer")}
                    <ArrowRight className="transition-transform duration-[var(--d-fast)] group-hover:translate-x-[3px]" />
                  </Button>
                  {/* Fond sombre : le lien prend la couleur de texte du contexte
                      immersif (voir `.immersive .text-link`) et la taille du bouton. */}
                  <button
                    type="button"
                    className="text-link t-body min-h-11"
                    onClick={() => setAccountRequest((n) => n + 1)}
                  >
                    {t("J'ai déjà un projet")}
                  </button>
                </div>
                <p className="t-caption mt-7 max-w-[34rem]">
                  {t("Rien à installer, aucun formulaire pour commencer. Votre travail reste sur votre appareil tant que vous ne l'envoyez pas.")}
                </p>
              </div>

              <section
                id="aimant"
                aria-label={t("Comprendre le principe de détection")}
                className="anim-scale-in relative z-10 overflow-hidden rounded-[var(--r-2xl)] bg-[var(--surface)] shadow-[var(--e-4)] backdrop-blur-2xl lg:[animation-delay:260ms]"
              >
                <MagnetPlay />
              </section>
            </div>
          </div>

        </div>

        <section aria-label={t("Comment ça se passe")} className="bg-background py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <hr className="standex-rule mb-12" />
            <h2 className="t-display-m">{t("Comment ça se passe")}</h2>
            <ol className="mt-10 grid gap-6 sm:grid-cols-3">
              {[
                {
                  n: "01",
                  t: t("Décrivez"),
                  d: t("Six questions simples, dans vos mots."),
                },
                {
                  n: "02",
                  t: t("Testez"),
                  d: t("Des couples capteur-aimant proposés, à essayer dans votre montage en 3D."),
                },
                {
                  n: "03",
                  t: t("Confirmez"),
                  d: t("Standex relit votre projet et confirme avec des échantillons."),
                },

              ].map((step, index) => (
                <ProcessStep key={step.t} step={step} index={index} />
              ))}
            </ol>
          </div>
        </section>
      </main>

      {/* UN SEUL espace projet, monté en permanence : la session, la liste des
          projets et le travail en cours ne sont jamais remontés à zéro. */}
      <div className={started ? "step-enter" : undefined}>
        <DesignSpace
          chrome="embedded"
          visible={started}
          accountRequest={accountRequest}
          onWorkspaceOpen={openWorkspace}
          onGoHome={() => setStarted(false)}
          requestedDossierId={requestedDossierId || null}
        />
      </div>
    </div>
  );
}

function ProcessStep({
  step,
  index,
}: {
  step: { n: string; t: string; d: string };
  index: number;
}) {
  const ref = useReveal<HTMLLIElement>();

  return (
    <li ref={ref} className={`surface-interactive reveal reveal-delay-${index + 1} p-8`}>
      <span
        aria-hidden="true"
        className="t-metric block text-[2.5rem] leading-none text-[var(--standex-blue-25)]"
      >
        {step.n}
      </span>
      <h3 className="t-title-m mt-8">{step.t}</h3>
      <p className="t-body mt-3 text-muted-foreground">{step.d}</p>
    </li>
  );
}
