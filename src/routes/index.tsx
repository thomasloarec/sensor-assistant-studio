/** Accueil client : découverte interactive, puis espace projet unifié à la même URL.
 *
 * L'espace projet est le composant DesignSpace existant (même dossier, mêmes
 * gardes serveur, mêmes handlers) : aucune seconde application, aucun envoi
 * silencieux. Le banc interne vit désormais sur /internal.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Magnet, ArrowRight, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MagnetPlay } from "@/components/leadmagnet/magnet-play";
import { AuthPanel } from "@/components/leadmagnet/auth-panel";
import { DesignSpace, PrivateDesignError } from "@/components/leadmagnet/design-space";
import { checkLeadBackend, type LeadBackendStatus } from "@/lib/leadmagnet/backend";

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
  const [backend, setBackend] = useState<LeadBackendStatus | null>(null);
  const [authTick, setAuthTick] = useState(0);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void checkLeadBackend().then((s) => {
      if (alive) setBackend(s);
    });
    return () => {
      alive = false;
    };
  }, [authTick]);

  return (
    <div data-readable className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-4">
          <span className="flex min-w-0 items-center gap-2">
            <Magnet className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate text-lg font-semibold">Standex DETECT</span>
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Sheet open={accountOpen} onOpenChange={setAccountOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="min-h-11 text-base">
                  <UserRound className="mr-2 h-4 w-4" /> Mon espace
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full overflow-y-auto sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Mon espace</SheetTitle>
                  <SheetDescription className="text-base">
                    Se connecter permet de retrouver ses projets déjà transmis à Standex. Rien de ce
                    que vous préparez ici n'est envoyé tant que vous ne le demandez pas.
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-4 px-4 pb-6">
                  <AuthPanel backend={backend} onChanged={() => setAuthTick((n) => n + 1)} />
                  <Button
                    className="min-h-11 w-full text-base"
                    onClick={() => {
                      setStarted(true);
                      setAccountOpen(false);
                    }}
                  >
                    Ouvrir mon projet
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Vos projets déjà envoyés, les reprises et les propositions Standex s'ouvrent
                    ensuite dans « Mon espace », à l'intérieur de votre projet.
                  </p>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {started ? (
        <DesignSpace chrome="embedded" />
      ) : (
        <main className="mx-auto max-w-6xl px-4 py-12 sm:py-20">
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


        </main>
      )}
    </div>
  );
}
