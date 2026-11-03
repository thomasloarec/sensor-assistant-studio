import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n/core";
import { LanguagePicker, useLocale } from "@/lib/i18n/react";
import { BrandLogo } from "@/components/standex/brand-logo";
import { Button } from "@/components/ui/button";
import { AuthPanel } from "@/components/leadmagnet/auth-panel";
import { supabase } from "@/lib/standex/supabase";
import { checkLeadBackend, type LeadBackendStatus } from "@/lib/leadmagnet/backend";
import { fetchMyDossiers, type DossierListItem } from "@/lib/leadmagnet/supabase-adapter";
import {
  customerRequest,
  customerAccessMessage,
  type PendingProject,
} from "@/lib/leadmagnet/customer-access";

export const Route = createFileRoute("/account")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    pending:
      typeof search["pending"] === "string" && /^[a-f0-9-]{36}$/i.test(search["pending"])
        ? search["pending"]
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sensor Studio" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: CustomerAccount,
});
function CustomerAccount() {
  useLocale();
  const requested = Route.useSearch().pending;
  const [token, setToken] = useState<string | null>(null);
  const [backend, setBackend] = useState<LeadBackendStatus | null>(null);
  const [pending, setPending] = useState<PendingProject[]>([]);
  const [projects, setProjects] = useState<DossierListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const refresh = async () => {
    const next = await checkLeadBackend();
    setBackend(next);
    if (!next.authenticated) {
      setProjects([]);
      setPending([]);
      return;
    }
    const [list, items] = await Promise.all([
      customerRequest({ action: "list" }, true),
      fetchMyDossiers(),
    ]);
    setPending(list.pending ?? []);
    setProjects(items);
  };
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const value = hash.get("token_hash");
    if (value && /^[a-f0-9]{32,128}$/i.test(value)) {
      setToken(value);
      // Keep tokens out of subsequent history entries and copied URLs.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    void refresh().catch((error) => setMessage(customerAccessMessage(error)));
    const sub = supabase?.auth.onAuthStateChange(() => {
      setTimeout(() => void refresh().catch(() => {}), 0);
    });
    return () => sub?.data.subscription.unsubscribe();
  }, []);
  const claim = async (id: string) => {
    const result = await customerRequest({ action: "claim", id }, true);
    if (result.dossier_id) {
      const target = new URL("/", window.location.origin);
      target.searchParams.set("dossier", result.dossier_id);
      window.location.assign(target.href);
    }
  };
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(customerAccessMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-6 px-4 py-8" data-readable>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <BrandLogo />
        <LanguagePicker />
      </div>
      <h1 className="t-title-l">{t("Mes projets")}</h1>
      {token ? (
        <section className="panel-block-lg space-y-4">
          <p className="t-body">
            {t("Confirmez l'ouverture de votre espace. Aucun mot de passe n'est nécessaire.")}
          </p>
          <Button
            disabled={busy}
            className="min-h-11 t-body"
            onClick={() =>
              void run(async () => {
                const { error } = await supabase!.auth.verifyOtp({
                  token_hash: token,
                  type: "email",
                });
                if (error) {
                  setToken(null);
                  throw new Error("LINK_EXPIRED");
                }
                setToken(null);
                if (requested) await claim(requested);
                else await refresh();
              })
            }
          >
            {t("Accéder à mes projets")}
          </Button>
        </section>
      ) : (
        <div className="panel-block-lg">
          {backend ? (
            <AuthPanel backend={backend} onChanged={() => void refresh()} />
          ) : (
            <p>{t("Vérification de l'accès…")}</p>
          )}
        </div>
      )}
      {message ? (
        <p role="alert" className="notice-danger">
          {t(message)}
        </p>
      ) : null}
      {backend?.authenticated && !token ? (
        <>
          {pending.length ? (
            <section className="panel-block-lg space-y-4">
              <h2 className="t-title-m">{t("Envois à confirmer")}</h2>
              <p className="t-body">
                {t(
                  "Votre adresse est vérifiée. Confirmez les projets que vous souhaitez transmettre à Standex.",
                )}
              </p>
              {pending.map((p) => (
                <div key={p.id} className="surface-raised rounded-[var(--r-lg)] p-4 space-y-2">
                  <p className="t-title-s">{p.title}</p>
                  <Button
                    className="min-h-11 t-body"
                    disabled={busy}
                    onClick={() => void run(() => claim(p.id))}
                  >
                    {t("Confirmer et ouvrir ce projet")}
                  </Button>
                </div>
              ))}
            </section>
          ) : null}
          <section className="panel-block-lg space-y-4">
            {projects.length ? (
              projects.map((p) => (
                <div key={p.id}>
                  <Link
                    to="/"
                    search={{ dossier: p.id }}
                    className="text-link t-body inline-flex min-h-11 items-center"
                  >
                    {p.title}
                  </Link>
                </div>
              ))
            ) : (
              <p className="t-body">{t("Aucun projet envoyé pour le moment.")}</p>
            )}
          </section>
        </>
      ) : null}
      <Link to="/" className="text-link t-body inline-flex min-h-11 items-center">
        {t("Retour à l'accueil")}
      </Link>
    </main>
  );
}
