/** Accueil client : découverte interactive, puis espace projet unifié à la même URL.
 *
 * L'espace projet est le composant DesignSpace existant (même dossier, mêmes
 * gardes serveur, mêmes handlers) : aucune seconde application, aucun envoi
 * silencieux. Le banc interne vit désormais sur /internal.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Magnet, ArrowRight, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MagnetPlay } from "@/components/leadmagnet/magnet-play";
import { DesignSpace, PrivateDesignError } from "@/components/leadmagnet/design-space";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Faire détecter votre idée — Standex DETECT" },
      {
        name: "description",
        content:
          "Décrivez ce que vous voulez détecter, jouez avec un aimant et un capteur, et préparez votre projet de détection magnétique avec les ingénieurs Standex.",
      },
      { property: "og:title", content: "Faire détecter votre idée — Standex DETECT" },
      {
        property: "og:description",
        content:
          "Découverte interactive de la détection magnétique et espace de projet privé Standex DETECT.",
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
  const [started, setStarted] = useState(false);
  /** Compteur : chaque demande « Mon espace » ouvre le panneau de l'espace
   * UNIQUE monté ci-dessous. Il n'existe pas de second compte parallèle. */
  const [accountRequest, setAccountRequest] = useState(0);

  return (
    <div data-readable className="min-h-screen bg-background text-foreground">
      <header className={started ? "hidden" : "border-b bg-card"}>
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-4 sm:gap-4">
          <span className="flex min-w-0 items-center gap-2">
            <Magnet className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate text-base font-semibold sm:text-lg">Standex DETECT</span>
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              className="min-h-11 text-base"
              onClick={() => setAccountRequest((n) => n + 1)}
            >
              <UserRound className="mr-2 h-4 w-4" /> Mon espace
            </Button>
          </div>
        </div>
      </header>

      <main className={started ? "hidden" : "mx-auto max-w-6xl px-4 py-12 sm:py-20"}>
          <div className="grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-center">
            <div>
              <p className="text-base font-semibold uppercase tracking-wide text-primary">
                Détection magnétique
              </p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
                Donnez vie à votre détection.
              </h1>
              <p className="mt-6 max-w-xl text-xl leading-relaxed text-foreground">
                Détecter un mouvement, simplement. Un aimant passe, le capteur réagit. Dites-nous ce
                que vous voulez détecter : nous construisons la solution avec vous.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <Button className="min-h-14 px-7 text-lg" onClick={() => setStarted(true)}>
                  Décrire mon besoin <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button
                  variant="outline"
                  className="min-h-14 px-6 text-lg"
                  onClick={() => setAccountRequest((n) => n + 1)}
                >
                  Retrouver mes projets
                </Button>
                <a
                  href="#aimant"
                  className="min-h-11 rounded-md px-3 py-2 text-base underline underline-offset-4"
                >
                  Explorer avec l'aimant
                </a>
              </div>
              <p className="mt-6 text-base text-muted-foreground">
                Rien à installer, aucun formulaire pour commencer. Votre travail reste sur votre
                appareil tant que vous ne l'envoyez pas.
              </p>
            </div>

            <section id="aimant" aria-label="Jouer avec l'aimant et le capteur">
              <MagnetPlay />
            </section>
          </div>

          <section aria-label="Comment ça se passe" className="mt-16 border-t pt-10">
            <h2 className="text-2xl font-semibold">Comment ça se passe</h2>
            <ol className="mt-6 grid gap-6 sm:grid-cols-3">
              {[
                {
                  t: "1. Vous décrivez",
                  d: "Quelques questions simples, en français : ce que vous voulez détecter, où le capteur se place, dans quelles conditions.",
                },
                {
                  t: "2. Vous visualisez",
                  d: "Un atelier 3D facultatif pour placer capteur, aimant et câble. Rien n'est envoyé tant que vous ne le demandez pas.",
                },
                {
                  t: "3. Standex relit",
                  d: "Vous pouvez faire relire votre projet par nos équipes. Une revue R&D reste toujours nécessaire avant commande.",
                },
              ].map((s) => (
                <li key={s.t} className="rounded-lg border bg-card p-5">
                  <h3 className="text-lg font-semibold">{s.t}</h3>
                  <p className="mt-2 text-base leading-relaxed text-muted-foreground">{s.d}</p>
                </li>
              ))}
            </ol>
          </section>
      </main>

      {/* UN SEUL espace projet, monté en permanence : la session, la liste des
          projets et le travail en cours ne sont jamais remontés à zéro. */}
      <DesignSpace
        chrome="embedded"
        visible={started}
        accountRequest={accountRequest}
        onWorkspaceOpen={() => setStarted(true)}
      />
    </div>
  );
}
