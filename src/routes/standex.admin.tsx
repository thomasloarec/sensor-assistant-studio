/** Réglages de la plateforme.
 *
 *  Cet écran n'a pas le même rôle que Projets, Tâches et Dossiers : il règle
 *  l'annuaire métier, les droits d'accès et donne à lire le journal des
 *  actions. Il ne modifie aucun dossier client.
 *
 *  Aucune valeur littérale : jetons du socle uniquement. Les RPC, le garde-fou
 *  du dernier administrateur actif et la remise à zéro sur changement de compte
 *  sont ceux de la version précédente : seul le rendu change.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Lock, MoreHorizontal } from "lucide-react";
import { t, localeTag } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCrm } from "@/components/standex/dashboard/crm-context";
import { useFlash } from "@/components/standex/dashboard/flash";
import { AvatarInitials } from "@/components/standex/dashboard/avatar-initials";
import {
  CrmUnavailableNotice,
  EmptyBlock,
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
import { personFullName, type CrmPerson } from "@/lib/leadmagnet/crm";
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

/* i18n-canonical : traduits par t() au rendu. */
const SECTIONS = [
  { id: "directory", label: "Annuaire" },
  { id: "accounts", label: "Comptes et droits" },
  { id: "audit", label: "Journal" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

/** Un seul bloc ouvert à la fois, et par personne. */
type OpenForm = { personId: string; form: "edit" | "link" | "grant" } | null;

const AUDIT_PAGE = 20;

export function AdminScreen() {
  const { capabilities, legacyRole, sessionGeneration } = useCrm();
  const flash = useFlash();
  const locale = useLocale();
  const tag = localeTag(locale);
  const [overview, setOverview] = useState<CrmAdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<SectionId>("directory");
  const [open, setOpen] = useState<OpenForm>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [auditShown, setAuditShown] = useState(AUDIT_PAGE);
  const [person, setPerson] = useState({ firstName: "", lastName: "", role: "sales" as "sales" | "fae" });
  const [linkEmail, setLinkEmail] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<Record<string, { firstName: string; lastName: string; role: "sales" | "fae" }>>({});
  const [grantRole, setGrantRole] = useState<Record<string, StaffRole>>({});
  /** Refus de règle : la ligne concernée reçoit `.anim-nudge` une seule fois. */
  const [nudge, setNudge] = useState<string | null>(null);

  /** Numéro de session : une lecture lancée pour le compte précédent ne doit
   *  jamais peupler l'écran après un changement de connexion. */
  const sessionRef = useRef(sessionGeneration);
  useEffect(() => {
    sessionRef.current = sessionGeneration;
    setOverview(null);
    setError(null);
    // Un changement de compte annule aussi les saisies en cours : sans cela une
    // écriture partie avant la bascule laisserait l'écran occupé pour toujours
    // (son `finally` refuse, à juste titre, de débloquer la NOUVELLE session),
    // et les noms, adresses et choix de droit du compte précédent resteraient
    // affichés. Une simple reconfirmation de la MÊME session ne passe pas ici.
    setBusy(false);
    setPerson({ firstName: "", lastName: "", role: "sales" });
    setLinkEmail({});
    setEdit({});
    setGrantRole({});
    setOpen(null);
    setAddOpen(false);
    setNudge(null);
    setAuditShown(AUDIT_PAGE);
  }, [sessionGeneration]);

  const load = useCallback(() => {
    const gen = sessionRef.current;
    setError(null);
    fetchCrmAdminOverview()
      .then((o) => {
        if (sessionRef.current === gen) setOverview(o);
      })
      .catch((e: unknown) => {
        if (sessionRef.current !== gen) return;
        setOverview(null);
        setError(e instanceof Error ? e.message : t("Lecture refusée."));
      });
  }, []);

  useEffect(() => {
    if (capabilities?.available && capabilities.role === "admin") load();
  }, [capabilities?.available, capabilities?.role, sessionGeneration, load]);

  const run = async (fn: () => Promise<CrmAdminOverview>, ok: string, nudgeKey?: string) => {
    if (busy) return;
    // Une écriture appartient à la session qui l'a lancée : si le compte change
    // entre-temps, son résultat ne repeuple ni l'écran ni l'indicateur.
    const session = sessionRef.current;
    setBusy(true);
    setError(null);
    setNudge(null);
    try {
      const next = await fn();
      if (sessionRef.current !== session) return;
      setOverview(next);
      // Succès d'écriture : pastille flottante. Les refus restent en place.
      flash.success(ok);
    } catch (e: unknown) {
      if (sessionRef.current !== session) return;
      setError(e instanceof Error ? e.message : t("Action refusée."));
      if (nudgeKey) setNudge(nudgeKey);
    } finally {
      if (sessionRef.current === session) setBusy(false);
    }
  };

  if (sessionRef.current !== sessionGeneration) return <LoadingBlock />;
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
      <div className="panel-block-lg mx-auto max-w-xl text-center">
        <p className="notice-warning text-sm">
          {t("Cette page est réservée aux administrateurs Standex. Votre compte n'a pas ce droit.")}
        </p>
      </div>
    );

  const admins = (overview?.staff ?? []).filter((s) => s.role === "admin" && s.active);
  /** Comptes déjà porteurs d'un droit Standex : servent à distinguer un simple
   *  rattachement d'annuaire d'un droit réellement accordé. */
  const staffByUser = new Map((overview?.staff ?? []).map((s) => [s.userId, s]));
  const activePeople = (overview?.directory ?? []).filter((p) => p.active).length;
  const linkedAccounts = (overview?.directory ?? []).filter((p) => p.userId).length;

  const toggle = (personId: string, form: "edit" | "link" | "grant") =>
    setOpen((o) => (o && o.personId === personId && o.form === form ? null : { personId, form }));

  const sectionIndex = SECTIONS.findIndex((s) => s.id === section);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Link to="/standex" className="t-caption inline-flex min-h-11 items-center">
          ← {t("Espace de travail")}
        </Link>
        <h2 className="t-title-m">{t("Réglages de la plateforme")}</h2>
        <p className="t-caption">
          {t("Annuaire des commerciaux et des FAE, comptes et droits d'accès, journal des actions.")}
        </p>
      </div>

      <dl className="kpi-row">
        <div className="kpi">
          <dt>{t("Personnes actives")}</dt>
          <dd className="t-metric">{activePeople}</dd>
        </div>
        <div className="kpi">
          <dt>{t("Comptes rattachés")}</dt>
          <dd className="t-metric">{linkedAccounts}</dd>
        </div>
        <div className="kpi">
          <dt>{t("Administrateurs actifs")}</dt>
          <dd className="t-metric">{admins.length}</dd>
        </div>
        <div className="kpi">
          <dt>{t("Version de l'espace de travail")}</dt>
          <dd className="t-metric">{overview?.crmVersion ?? t("inconnue")}</dd>
        </div>
      </dl>

      <div
        role="tablist"
        aria-label={t("Sections des réglages")}
        className="segmented"
        style={{
          ["--seg-count" as string]: SECTIONS.length,
          ["--seg" as string]: sectionIndex < 0 ? 0 : sectionIndex,
        }}
      >
        <span className="segmented-thumb" aria-hidden="true" />
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            id={`tab-${s.id}`}
            aria-selected={section === s.id}
            aria-controls={`panel-${s.id}`}
            data-active={section === s.id ? "true" : undefined}
            className="segmented-item"
            onClick={() => setSection(s.id)}
          >
            {t(s.label)}
          </button>
        ))}
      </div>

      {error ? <ErrorBlock text={error} onRetry={load} /> : null}
      {overview === null ? <LoadingBlock /> : null}

      {overview ? (
        <>
          {section === "directory" ? (
            <section role="tabpanel" id="panel-directory" aria-labelledby="tab-directory" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="t-title-s">{t("Annuaire métier (commerciaux et FAE)")}</h3>
                <Button id="add-person-toggle" size="sm" onClick={() => setAddOpen((v) => !v)}>
                  {t("Ajouter une personne")}
                </Button>
              </div>
              <p className="t-caption">
                {t("Ces fiches sont des identités métier. Elles ne créent aucun compte et n'ouvrent aucun droit : le rattachement à un compte déjà inscrit est une action distincte, ci-dessous.")}
              </p>

              {addOpen ? (
                <div className="panel-block anim-rise">
                  <div className="field-row">
                    <div className="field">
                      <Label className="t-caption" htmlFor="new-first">
                        {t("Prénom")}
                      </Label>
                      <Input
                        id="new-first"
                        value={person.firstName}
                        onChange={(e) => setPerson({ ...person, firstName: e.target.value })}
                      />
                      <span />
                    </div>
                    <div className="field">
                      <Label className="t-caption" htmlFor="new-last">
                        {t("Nom")}
                      </Label>
                      <Input
                        id="new-last"
                        value={person.lastName}
                        onChange={(e) => setPerson({ ...person, lastName: e.target.value })}
                      />
                      <span />
                    </div>
                    <div className="field">
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
                      <span />
                    </div>
                    <div className="field-actions">
                      <Button
                        id="new-person-submit"
                        size="sm"
                        disabled={busy || !person.firstName.trim() || !person.lastName.trim()}
                        onClick={() => {
                          // Le vidage du formulaire n'appartient qu'à la session
                          // qui a lancé l'écriture : une réponse revenue après
                          // un changement de compte ne touche plus l'écran.
                          const gen = sessionRef.current;
                          void run(async () => {
                            const next = await upsertCrmPerson(
                              null,
                              person.firstName.trim(),
                              person.lastName.trim(),
                              person.role,
                              true,
                            );
                            if (sessionRef.current === gen) {
                              setPerson({ firstName: "", lastName: "", role: "sales" });
                              setAddOpen(false);
                            }
                            return next;
                          }, t("Personne ajoutée à l'annuaire."));
                        }}
                      >
                        {busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
                        {t("Ajouter à l'annuaire")}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              {overview.directory.length === 0 ? (
                <EmptyBlock text={t("Aucune personne dans l'annuaire.")} />
              ) : (
                <ul className="space-y-2">
                  {overview.directory.map((p) => (
                    <PersonRow
                      key={p.id}
                      person={p}
                      busy={busy}
                      granted={p.userId ? staffByUser.has(p.userId) : false}
                      open={open && open.personId === p.id ? open.form : null}
                      nudge={nudge === p.id}
                      onToggle={(form) => toggle(p.id, form)}
                      linkEmail={linkEmail[p.id] ?? ""}
                      onLinkEmail={(v) => setLinkEmail((m) => ({ ...m, [p.id]: v }))}
                      edit={edit[p.id] ?? null}
                      onEdit={(v) => setEdit((m) => ({ ...m, [p.id]: v }))}
                      grant={grantRole[p.id] ?? (p.role === "fae" ? "rnd" : "sales")}
                      onGrant={(v) => setGrantRole((m) => ({ ...m, [p.id]: v }))}
                      run={run}
                      clearEdit={() =>
                        setEdit((m) => {
                          const { [p.id]: _removed, ...rest } = m;
                          return rest;
                        })
                      }
                      closeForm={() => setOpen(null)}
                    />
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {section === "accounts" ? (
            <section role="tabpanel" id="panel-accounts" aria-labelledby="tab-accounts" className="space-y-3">
              <h3 className="t-title-s">{t("Comptes Standex et droits")}</h3>
              <p className="t-caption">
                {t("Le dernier administrateur actif ne peut pas être retiré : le serveur refuse l'opération.")}
              </p>
              {overview.staff.length === 0 ? (
                <EmptyBlock text={t("Aucun compte Standex.")} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">{t("Personne")}</th>
                        <th scope="col">{t("Adresse")}</th>
                        <th scope="col">{t("Droit")}</th>
                        <th scope="col">{t("État")}</th>
                        <th scope="col">{t("Action")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.staff.map((s) => {
                        const lastAdmin = s.role === "admin" && s.active && admins.length <= 1;
                        return (
                          <tr
                            key={s.userId}
                            style={{
                              ["--row-accent" as string]: s.active
                                ? "var(--standex-blue-25)"
                                : "var(--standex-gray-25)",
                            }}
                          >
                            <td>
                              <span className="inline-flex items-center gap-2">
                                <AvatarInitials name={s.displayName} />
                                <span>{s.displayName}</span>
                              </span>
                            </td>
                            <td className="t-caption">{s.email ?? t("inconnu")}</td>
                            <td>
                              <Select
                                value={s.role}
                                onValueChange={(v) =>
                                  void run(
                                    () => setStaffRole(s.userId, v as StaffRole, s.active),
                                    t("Droit mis à jour."),
                                    s.userId,
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
                            </td>
                            <td>
                              <span className="stage-pill" data-tone={s.active ? "blue" : "muted"}>
                                {s.active ? t("Actif") : t("désactivé")}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`inline-flex items-center gap-2 ${nudge === s.userId ? "anim-nudge" : ""}`}
                              >
                                {lastAdmin ? (
                                  <Lock className="size-4 text-[var(--muted-foreground)]" aria-hidden="true" />
                                ) : null}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={busy || lastAdmin}
                                  aria-describedby={lastAdmin ? `last-admin-${s.userId}` : undefined}
                                  onClick={() =>
                                    void run(
                                      () => setStaffRole(s.userId, s.role, !s.active),
                                      s.active ? t("Compte désactivé.") : t("Compte réactivé."),
                                      s.userId,
                                    )
                                  }
                                >
                                  {s.active ? t("Désactiver") : t("Réactiver")}
                                </Button>
                              </span>
                              {lastAdmin ? (
                                <span className="t-caption block" id={`last-admin-${s.userId}`}>
                                  {t("Dernier administrateur actif : ce droit ne peut pas être retiré.")}
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          {section === "audit" ? (
            <section role="tabpanel" id="panel-audit" aria-labelledby="tab-audit" className="space-y-3">
              <h3 className="t-title-s">{t("Journal des actions")}</h3>
              {overview.audit.length === 0 ? (
                <EmptyBlock text={t("Aucune action enregistrée.")} />
              ) : (
                <>
                  <AuditTimeline entries={overview.audit.slice(0, auditShown)} tag={tag} />
                  {auditShown < overview.audit.length ? (
                    <Button variant="outline" onClick={() => setAuditShown((n) => n + AUDIT_PAGE)}>
                      {t("Afficher plus")}
                    </Button>
                  ) : null}
                </>
              )}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------- Ligne d'une personne */

function AccountPill({ person, granted }: { person: CrmPerson; granted: boolean }) {
  if (!person.userId)
    return (
      <span className="account-pill" data-state="none">
        {t("aucun compte rattaché")}
      </span>
    );
  if (!granted)
    return (
      <span className="account-pill" data-state="pending">
        {t("rattaché, sans droit")}
      </span>
    );
  return (
    <span className="account-pill" data-state="linked">
      {t("rattaché")}
      {person.email ? <span className="t-caption"> {person.email}</span> : null}
    </span>
  );
}

function PersonRow({
  person: p,
  busy,
  granted,
  open,
  nudge,
  onToggle,
  linkEmail,
  onLinkEmail,
  edit,
  onEdit,
  grant,
  onGrant,
  run,
  clearEdit,
  closeForm,
}: {
  person: CrmPerson;
  busy: boolean;
  granted: boolean;
  open: "edit" | "link" | "grant" | null;
  nudge: boolean;
  onToggle: (form: "edit" | "link" | "grant") => void;
  linkEmail: string;
  onLinkEmail: (value: string) => void;
  edit: { firstName: string; lastName: string; role: "sales" | "fae" } | null;
  onEdit: (value: { firstName: string; lastName: string; role: "sales" | "fae" }) => void;
  grant: StaffRole;
  onGrant: (value: StaffRole) => void;
  run: (fn: () => Promise<CrmAdminOverview>, ok: string, nudgeKey?: string) => Promise<void>;
  clearEdit: () => void;
  closeForm: () => void;
}) {
  const name = personFullName(p);
  const first = edit?.firstName ?? p.firstName;
  const last = edit?.lastName ?? p.lastName;
  const role = edit?.role ?? p.role;

  return (
    <li className={`panel-block space-y-2${nudge ? " anim-nudge" : ""}`} data-inactive={p.active ? undefined : "true"}>
      <div className="person-row" data-inactive={p.active ? undefined : "true"}>
        <AvatarInitials name={name} />
        <span className="t-title-s min-w-0">{name}</span>
        <span className="stage-pill">{p.role === "fae" ? "FAE" : t("Commercial")}</span>
        <AccountPill person={p} granted={granted} />
        {p.active ? null : (
          <span className="stage-pill" data-tone="muted">
            {t("désactivé")}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" aria-label={t("Actions sur cette personne")}>
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onToggle("edit")}>{t("Modifier la fiche")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onToggle("link")}>
              {p.userId ? t("Détacher") : t("Rattacher un compte")}
            </DropdownMenuItem>
            {p.userId && !granted ? (
              <DropdownMenuItem onSelect={() => onToggle("grant")}>
                {t("Accorder un droit Standex")}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              disabled={busy}
              onSelect={() =>
                void run(
                  () => upsertCrmPerson(p.id, p.firstName, p.lastName, p.role, !p.active),
                  p.active ? t("Personne désactivée.") : t("Personne réactivée."),
                  p.id,
                )
              }
            >
              {p.active ? t("Désactiver") : t("Réactiver")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {open === "link" ? (
        <div className="anim-rise field-row">
          <div className="field">
            <Label className="t-caption" htmlFor={`link-${p.id}`}>
              {t("Adresse d'un compte existant")}
            </Label>
            <Input
              id={`link-${p.id}`}
              type="email"
              value={linkEmail}
              onChange={(e) => onLinkEmail(e.target.value)}
            />
            <span className="t-caption">
              {t("Ce champ ne crée aucun compte : le compte doit déjà être inscrit.")}
            </span>
          </div>
          <div className="field-actions inline-flex items-center gap-2">
            <Button
              id={`link-${p.id}-submit`}
              size="sm"
              variant="outline"
              disabled={busy || !linkEmail.trim()}
              onClick={() =>
                void run(
                  () => linkCrmPerson(p.id, linkEmail.trim()),
                  t("Personne rattachée à ce compte."),
                  p.id,
                )
              }
            >
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
              {t("Rattacher")}
            </Button>
            {p.userId ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void run(() => linkCrmPerson(p.id, null), t("Rattachement retiré."), p.id)
                }
              >
                {t("Détacher")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Rattacher un compte n'ouvre AUCUN droit : l'attribution du premier
          droit Standex est une action distincte, explicite, qui ne crée ni
          compte ni invitation. */}
      {open === "grant" && p.userId && !granted ? (
        <div className="anim-rise space-y-2">
          <p className="t-caption">
            {t("Ce compte est rattaché mais n'a encore aucun droit Standex. Choisissez le droit à lui accorder.")}
          </p>
          <div className="field-row">
            <div className="field">
              <Label className="t-caption">{t("Droit")}</Label>
              <Select value={grant} onValueChange={(v) => onGrant(v as StaffRole)}>
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
              <span />
            </div>
            <div className="field-actions">
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => setStaffRole(p.userId as string, grant, true),
                    t("Droit Standex accordé à ce compte."),
                    p.id,
                  )
                }
              >
                {busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
                {t("Accorder ce droit")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {open === "edit" ? (
        <div className="anim-rise field-row">
          <div className="field">
            <Label className="t-caption" htmlFor={`first-${p.id}`}>
              {t("Prénom")}
            </Label>
            <Input
              id={`first-${p.id}`}
              value={first}
              onChange={(e) => onEdit({ firstName: e.target.value, lastName: last, role })}
            />
            <span />
          </div>
          <div className="field">
            <Label className="t-caption" htmlFor={`last-${p.id}`}>
              {t("Nom")}
            </Label>
            <Input
              id={`last-${p.id}`}
              value={last}
              onChange={(e) => onEdit({ firstName: first, lastName: e.target.value, role })}
            />
            <span />
          </div>
          <div className="field">
            <Label className="t-caption">{t("Fonction")}</Label>
            <Select
              value={role}
              onValueChange={(v) => onEdit({ firstName: first, lastName: last, role: v as "sales" | "fae" })}
            >
              <SelectTrigger className="min-h-11 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sales">{t("Commercial")}</SelectItem>
                <SelectItem value="fae">FAE</SelectItem>
              </SelectContent>
            </Select>
            <span />
          </div>
          <div className="field-actions">
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !first.trim() || !last.trim()}
              onClick={() =>
                void run(
                  async () => {
                    const next = await upsertCrmPerson(p.id, first.trim(), last.trim(), role, p.active);
                    clearEdit();
                    closeForm();
                    return next;
                  },
                  t("Fiche annuaire mise à jour."),
                  p.id,
                )
              }
            >
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
              {t("Enregistrer la fiche")}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/* ---------------------------------------------------------------- Journal */

/** Une date illisible reste affichée telle quelle : jamais remplacée par une
 *  date inventée. */
function parseAt(at: string): Date | null {
  const d = new Date(at);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function groupAuditByDay(
  entries: readonly { at: string; action: string; actorName: string }[],
): { key: string; date: Date | null; entries: typeof entries }[] {
  const out: { key: string; date: Date | null; entries: (typeof entries)[number][] }[] = [];
  for (const e of entries) {
    const date = parseAt(e.at);
    const key = date ? date.toISOString().slice(0, 10) : `raw:${e.at}`;
    const last = out[out.length - 1];
    if (last && last.key === key) last.entries.push(e);
    else out.push({ key, date, entries: [e] });
  }
  return out;
}

function AuditTimeline({
  entries,
  tag,
}: {
  entries: readonly { at: string; action: string; actorName: string }[];
  tag: string;
}) {
  const days = groupAuditByDay(entries);
  const dayFormat = new Intl.DateTimeFormat(tag, { dateStyle: "full" });
  const timeFormat = new Intl.DateTimeFormat(tag, { timeStyle: "short" });
  return (
    <div className="timeline">
      {days.map((day) => (
        <section key={day.key} className="panel-block space-y-2">
          <p className="t-label">{day.date ? dayFormat.format(day.date) : day.entries[0]!.at}</p>
          <ul className="space-y-1">
            {day.entries.map((e, i) => {
              const date = parseAt(e.at);
              return (
                <li key={`${e.at}-${i}`} className="timeline-entry">
                  <span className="t-metric text-[var(--muted-foreground)]">
                    {date ? timeFormat.format(date) : e.at}
                  </span>
                  <span className="t-body">{e.action}</span>
                  {e.actorName ? (
                    <span className="t-caption inline-flex items-center gap-2">
                      <AvatarInitials name={e.actorName} />
                      {e.actorName}
                    </span>
                  ) : (
                    <span />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
