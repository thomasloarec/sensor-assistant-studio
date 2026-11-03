import { useLocale } from "@/lib/i18n/react";
import { msg, t } from "@/lib/i18n/core";
/** Entrée de connexion réelle au projet Supabase existant.
 *
 * Aucun service externe n'est ajouté : on utilise le client déjà présent.
 * Account creation is explicit and server-controlled; staff roles are never self-assigned.
 */
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/standex/supabase";
import type { LeadBackendStatus } from "@/lib/leadmagnet/backend";
import { Loader2 } from "lucide-react";
import { CUSTOMER_EMAIL_ACCESS, customerRequest, customerAccessMessage } from "@/lib/leadmagnet/customer-access";

interface Props {
  backend: LeadBackendStatus | null;
  /** Appelé après une connexion ou une déconnexion réussie. */
  onChanged?: () => void;
  allowCreate?: boolean;
}

export function AuthPanel({ backend, onChanged, allowCreate = false }: Props) {
  useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(!CUSTOMER_EMAIL_ACCESS);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const uid = useId();
  const emailId = `auth-email-${uid}`;
  const passwordId = `auth-password-${uid}`;

  if (!backend?.configured || !supabase)
    return (
      <p className="t-caption">
        {t("La liaison avec l'équipe Standex n'est pas configurée sur cet environnement : la connexion n'est pas possible ici.")}
      </p>
    );

  if (backend.authenticated)
    return (
      <div className="flex flex-wrap items-center gap-3 text-base">
        <span className="t-caption">
          {backend.role ? msg("Connecté — rôle {0}.", [backend.role]) : t("Connecté.")}
        </span>
        <Button
          variant="outline"
          className="min-h-11 text-base"
          onClick={async () => {
            await supabase!.auth.signOut();
            onChanged?.();
          }}
        >
          {t("Se déconnecter")}
        </Button>
        {message ? <span>{t(message)}</span> : null}
      </div>
    );

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage(null);
        try {
          if (!usePassword) {
            await customerRequest({ action: allowCreate ? "register" : "login", email });
            setMessage(t("Si cette adresse peut recevoir un lien, un email de connexion vous sera envoyé. Vérifiez aussi vos courriers indésirables."));
            return;
          }
          const { error } = await supabase!.auth.signInWithPassword({ email, password });
          if (error) {
            setMessage(t("Connexion refusée. Vérifiez l'adresse et le mot de passe."));
            return;
          }
          setPassword("");
          setMessage(t("Connexion établie."));
          onChanged?.();
        } catch (error) {
          setMessage(t(customerAccessMessage(error)));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="field">
        <Label htmlFor={emailId} className="t-label">
          {t("Adresse e-mail")}
        </Label>
        <Input
          id={emailId}
          className="min-h-11 text-base"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          required
        />
        <span />
      </div>
      {usePassword ? <div className="field">
        <Label htmlFor={passwordId} className="t-label">
          {t("Mot de passe")}
        </Label>
        <Input
          id={passwordId}
          className="min-h-11 text-base"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(ev) => setPassword(ev.target.value)}
          required
        />
        <span />
      </div> : null}
      <div className="flex flex-wrap items-center gap-3">
      <Button
        type="submit"
        className="min-h-11 t-body"
        disabled={busy}
        aria-busy={busy ? "true" : undefined}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {busy ? t("Connexion…") : usePassword ? t("Se connecter") : t("Recevoir un lien de connexion")}
      </Button>
      {CUSTOMER_EMAIL_ACCESS ? <Button type="button" variant="ghost" className="min-h-11 t-body" disabled={busy}
        onClick={() => { setUsePassword(!usePassword); setPassword(""); setMessage(null); }}>
        {usePassword ? t("Utiliser un lien par email") : t("Utiliser un mot de passe existant")}
      </Button> : null}
      </div>
      {message ? <p className="notice notice-info sm:col-span-full">{t(message)}</p> : null}
    </form>
  );
}
