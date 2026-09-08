/** Entrée de connexion réelle au projet Supabase existant.
 *
 * Aucun service externe n'est ajouté : on utilise le client déjà présent.
 * Aucun compte n'est créé ici ; les rôles restent provisionnés côté serveur.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/standex/supabase";
import type { LeadBackendStatus } from "@/lib/leadmagnet/backend";

interface Props {
  backend: LeadBackendStatus | null;
  /** Appelé après une connexion ou une déconnexion réussie. */
  onChanged?: () => void;
}

export function AuthPanel({ backend, onChanged }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!backend?.configured || !supabase)
    return (
      <p className="text-xs text-muted-foreground">
        La liaison avec l'équipe Standex n'est pas configurée sur cet environnement : la connexion
        n'est pas possible ici.
      </p>
    );

  if (backend.authenticated)
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">
          Connecté{backend.role ? ` — rôle ${backend.role}` : ""}.
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await supabase!.auth.signOut();
            onChanged?.();
          }}
        >
          Se déconnecter
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
        const { error } = await supabase!.auth.signInWithPassword({ email, password });
        setBusy(false);
        if (error) {
          setMessage("Connexion refusée. Vérifiez l'adresse et le mot de passe.");
          return;
        }
        setPassword("");
        setMessage("Connexion établie.");
        onChanged?.();
      }}
    >
      <div>
        <Label className="text-xs">Adresse e-mail</Label>
        <Input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          required
        />
      </div>
      <div>
        <Label className="text-xs">Mot de passe</Label>
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(ev) => setPassword(ev.target.value)}
          required
        />
      </div>
      <Button size="sm" type="submit" disabled={busy}>
        {busy ? "Connexion…" : "Se connecter"}
      </Button>
      {message ? (
        <p className="text-xs text-muted-foreground sm:col-span-3">{message}</p>
      ) : null}
    </form>
  );
}
