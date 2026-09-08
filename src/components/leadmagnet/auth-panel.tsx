import { useLocale } from "@/lib/i18n/react";
import { t } from "@/lib/i18n/core";
/** Entrée de connexion réelle au projet Supabase existant.
 *
 * Aucun service externe n'est ajouté : on utilise le client déjà présent.
 * Aucun compte n'est créé ici ; les rôles restent provisionnés côté serveur.
 */
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/standex/supabase";
import type { LeadBackendStatus } from "@/lib/leadmagnet/backend";
import { Loader2 } from "lucide-react";

interface Props {
  backend: LeadBackendStatus | null;
  /** Appelé après une connexion ou une déconnexion réussie. */
  onChanged?: () => void;
}

export function AuthPanel({ backend, onChanged }: Props) {
  useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        <span className="t-caption">{t("Connecté")}{backend.role ? ` — rôle ${backend.role}` : ""}.</span>
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
        {message ? <span>{message}</span> : null}
      </div>
    );

  return (
    <form
      className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage(null);
        try {
          const { error } = await supabase!.auth.signInWithPassword({ email, password });
          if (error) {
            setMessage(t("Connexion refusée. Vérifiez l'adresse et le mot de passe."));
            return;
          }
          setPassword("");
          setMessage(t("Connexion établie."));
          onChanged?.();
        } catch {
          setMessage(t("La connexion n'a pas abouti : réseau indisponible. Réessayez."));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
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
      </div>
      <div>
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
      </div>
      <Button
        type="submit"
        className="min-h-11 text-base"
        disabled={busy}
        aria-busy={busy ? "true" : undefined}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {busy ? "Connexion…" : t("Se connecter")}
      </Button>
      {message ? <p className="notice notice-info sm:col-span-3">{message}</p> : null}
    </form>
  );
}
