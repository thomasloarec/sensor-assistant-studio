/** Écran d'accès réservé : seuls les comptes de la liste peuvent tester l'outil.
 *  Le masquage côté navigateur ne protège pas les données : les RPC serveur
 *  revérifient toujours la session et le rôle. Aucun compte n'est créé ici. */
import { useEffect, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n/core";
import { LanguagePicker, useLocale } from "@/lib/i18n/react";
import { supabase } from "@/lib/standex/supabase";
import { AuthPanel } from "@/components/leadmagnet/auth-panel";
import { BrandLogo } from "@/components/standex/brand-logo";
import { Button } from "@/components/ui/button";
import type { LeadBackendStatus } from "@/lib/leadmagnet/backend";

export const ALLOWED_TESTERS = ["tloarec@standexelectronics.com"];

type State = "loading" | "out" | "denied" | "in";

export function AccessGate({ children }: { children: ReactNode }) {
  useLocale();
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    if (!supabase) {
      setState("out");
      return;
    }
    const check = async () => {
      const { data } = await supabase!.auth.getUser();
      const email = data.user?.email?.toLowerCase();
      setState(!email ? "out" : ALLOWED_TESTERS.includes(email) ? "in" : "denied");
    };
    void check();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") void check();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (state === "in") return <>{children}</>;

  const backend = {
    configured: Boolean(supabase),
    authenticated: false,
    role: null,
  } as unknown as LeadBackendStatus;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4" data-readable>
      <div className="panel-block-lg anim-rise w-full max-w-[30rem] space-y-4">
        <div className="flex items-center justify-between gap-3">
          <BrandLogo />
          <LanguagePicker />
        </div>
        <span className="standex-bar" aria-hidden="true" />
        <h1 className="t-title-l">{t("Accès réservé")}</h1>
        {state === "loading" ? (
          <p className="t-body">{t("Vérification de l'accès…")}</p>
        ) : state === "denied" ? (
          <>
            <p className="notice-warning">{t("Ce compte n'est pas autorisé à tester l'outil.")}</p>
            <Button variant="outline" className="min-h-11 text-base" onClick={() => void supabase?.auth.signOut()}>
              {t("Se déconnecter")}
            </Button>
          </>
        ) : (
          <>
            <p className="t-body">
              {t("Cet outil est en phase de test. Connectez-vous avec un compte autorisé pour y accéder.")}
            </p>
            <AuthPanel backend={backend} />
          </>
        )}
      </div>
    </main>
  );
}
