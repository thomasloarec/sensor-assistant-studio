import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { t } from "@/lib/i18n/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCrm } from "@/components/standex/dashboard/crm-context";
import {
  CrmUnavailableNotice,
  ErrorBlock,
  LoadingBlock,
} from "@/components/standex/dashboard/crm-shared";
import {
  fetchCrmAdminOverview,
  linkCrmPerson,
  setStaffRole,
  upsertCrmPerson,
  type CrmAdminOverview,
} from "@/lib/leadmagnet/dashboard-adapter";
import { personFullName } from "@/lib/leadmagnet/crm";
import type { StaffRole } from "@/lib/leadmagnet/review";

export const Route = createFileRoute("/standex/admin")({
  component: AdminScreen,
});

const ROLES: StaffRole[] = ["rnd", "sales", "admin"];
const ROLE_LABEL: Record<StaffRole, string> = {
  rnd: "R&D",
  sales: "Commerce",
  admin: "Administration",
};

function AdminScreen() {
  const { capabilities, legacyRole } = useCrm();
  const [overview, setOverview] = useState<CrmAdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [person, setPerson] = useState({ firstName: "", lastName: "", role: "sales" as "sales" | "fae" });
  const [linkEmail, setLinkEmail] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setError(null);
    fetchCrmAdminOverview()
      .then(setOverview)
      .catch((e: unknown) => {
        setOverview(null);
        setError(e instanceof Error ? e.message : t("Lecture refusée."));
      });
  }, []);

  useEffect(() => {
    if (capabilities?.available && capabilities.role === "admin") load();
  }, [capabilities?.available, capabilities?.role, load]);

  const run = async (fn: () => Promise<CrmAdminOverview>, ok: string) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      setOverview(await fn());
      setMessage(ok);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("Action refusée."));
    } finally {
      setBusy(false);
    }
  };

  if (capabilities === null) return <LoadingBlock />;
  if (!capabilities.available)
    return (
      <CrmUnavailableNotice
        plain={t("L'administration de l'espace de travail n'est pas encore activée sur ce serveur.")}
        detail={capabilities.detail}
        isAdmin={legacyRole === "admin"}
      />
    );
  if (capabilities.role !== "admin")
    return (
      <p className="notice-warning text-sm">
        {t("Cette page est réservée aux administrateurs Standex. Votre compte n'a pas ce droit.")}
      </p>
    );

  const admins = (overview?.staff ?? []).filter((s) => s.role === "admin" && s.active);

  return (
    <div className="space-y-5">
      <h2 className="t-title-m">{t("Administration")}</h2>
      {message ? <p className="notice-success text-sm">{message}</p> : null}
      {error ? <ErrorBlock text={error} onRetry={load} /> : null}
      {overview === null ? <LoadingBlock /> : null}

      {overview ? (
        <>
          <section className="space-y-2">
            <h3 className="t-title-s">{t("Annuaire métier (commerciaux et FAE)")}</h3>
            <p className="t-caption text-muted-foreground">
              {t("Ces fiches sont des identités métier. Elles ne créent aucun compte et n'ouvrent aucun droit : le rattachement à un compte déjà inscrit est une action distincte, ci-dessous.")}
            </p>
            <ul className="space-y-2">
              {overview.directory.map((p) => (
                <li key={p.id} className="panel-block space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{personFullName(p)}</span>
                    <Badge variant="outline">{p.role === "fae" ? "FAE" : t("Commercial")}</Badge>
                    {p.active ? null : <Badge variant="secondary">{t("désactivé")}</Badge>}
                    {p.userId ? (
                      <Badge variant="secondary">
                        {t("compte rattaché")}
                        {p.email ? ` — ${p.email}` : ""}
                      </Badge>
                    ) : (
                      <span className="t-caption text-muted-foreground">
                        {t("aucun compte rattaché")}
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => upsertCrmPerson(p.id, p.firstName, p.lastName, p.role, !p.active),
                          p.active ? t("Personne désactivée.") : t("Personne réactivée."),
                        )
                      }
                    >
                      {p.active ? t("Désactiver") : t("Réactiver")}
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <Label className="t-caption" htmlFor={`link-${p.id}`}>
                        {t("Adresse d'un compte DÉJÀ inscrit")}
                      </Label>
                      <Input
                        id={`link-${p.id}`}
                        type="email"
                        value={linkEmail[p.id] ?? ""}
                        onChange={(e) =>
                          setLinkEmail((m) => ({ ...m, [p.id]: e.target.value }))
                        }
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !(linkEmail[p.id] ?? "").trim()}
                      onClick={() =>
                        void run(
                          () => linkCrmPerson(p.id, (linkEmail[p.id] ?? "").trim()),
                          t("Personne rattachée à ce compte."),
                        )
                      }
                    >
                      {t("Rattacher")}
                    </Button>
                    {p.userId ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void run(() => linkCrmPerson(p.id, null), t("Rattachement retiré."))
                        }
                      >
                        {t("Détacher")}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>

            <div className="panel-block grid gap-2 sm:grid-cols-4">
              <div>
                <Label className="t-caption">{t("Prénom")}</Label>
                <Input
                  value={person.firstName}
                  onChange={(e) => setPerson({ ...person, firstName: e.target.value })}
                />
              </div>
              <div>
                <Label className="t-caption">{t("Nom")}</Label>
                <Input
                  value={person.lastName}
                  onChange={(e) => setPerson({ ...person, lastName: e.target.value })}
                />
              </div>
              <div>
                <Label className="t-caption">{t("Fonction")}</Label>
                <Select
                  value={person.role}
                  onValueChange={(v) => setPerson({ ...person, role: v as "sales" | "fae" })}
                >
                  <SelectTrigger className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sales">{t("Commercial")}</SelectItem>
                    <SelectItem value="fae">FAE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                disabled={busy || !person.firstName.trim() || !person.lastName.trim()}
                onClick={() =>
                  void run(async () => {
                    const next = await upsertCrmPerson(
                      null,
                      person.firstName.trim(),
                      person.lastName.trim(),
                      person.role,
                      true,
                    );
                    setPerson({ firstName: "", lastName: "", role: "sales" });
                    return next;
                  }, t("Personne ajoutée à l'annuaire."))
                }
              >
                {t("Ajouter à l'annuaire")}
              </Button>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="t-title-s">{t("Comptes Standex et droits")}</h3>
            <p className="t-caption text-muted-foreground">
              {t("Le dernier administrateur actif ne peut pas être retiré : le serveur refuse l'opération.")}
            </p>
            <ul className="space-y-2">
              {overview.staff.map((s) => {
                const lastAdmin = s.role === "admin" && s.active && admins.length <= 1;
                return (
                  <li key={s.userId} className="panel-block flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{s.displayName}</span>
                    {s.email ? (
                      <span className="t-caption text-muted-foreground">{s.email}</span>
                    ) : null}
                    <Badge variant="outline">{t(ROLE_LABEL[s.role])}</Badge>
                    {s.active ? null : <Badge variant="secondary">{t("désactivé")}</Badge>}
                    <Select
                      value={s.role}
                      onValueChange={(v) =>
                        void run(
                          () => setStaffRole(s.userId, v as StaffRole, s.active),
                          t("Droit mis à jour."),
                        )
                      }
                    >
                      <SelectTrigger className="min-h-11 w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {t(ROLE_LABEL[r])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || lastAdmin}
                      title={
                        lastAdmin
                          ? t("Dernier administrateur actif : ce droit ne peut pas être retiré.")
                          : undefined
                      }
                      onClick={() =>
                        void run(
                          () => setStaffRole(s.userId, s.role, !s.active),
                          s.active ? t("Compte désactivé.") : t("Compte réactivé."),
                        )
                      }
                    >
                      {s.active ? t("Désactiver") : t("Réactiver")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="t-title-s">{t("Journal des actions")}</h3>
            <ul className="space-y-1 text-sm">
              {overview.audit.map((a, i) => (
                <li key={`${a.at}-${i}`} className="panel-block">
                  <span className="t-caption text-muted-foreground">{a.at}</span> — {a.action}
                  {a.actorName ? ` — ${a.actorName}` : ""}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
