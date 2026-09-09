import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { createOwnedLock } from "@/lib/leadmagnet/session-guard";
import { t, localeTag } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DossierConsole } from "@/components/standex/console/dossier-console";
import { useCrm } from "@/components/standex/dashboard/crm-context";
import { useFlash } from "@/components/standex/dashboard/flash";
import { AvatarInitials } from "@/components/standex/dashboard/avatar-initials";
import {
  ALL_STAGES,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  MarginCell,
  RevenueCell,
  STAKEHOLDER_LABEL,
  StageGauge,
  StagePill,
  TASK_STATUS_LABEL,
  TaskRow,
  UnknownValue,
  VolumeCell,
  personName,
  stageLabel,
  CrmUnavailableNotice,
  InternalEnglishHint,
  ClientLocaleHint,
} from "@/components/standex/dashboard/crm-shared";
import {
  applyCrmTemplate,
  fetchCrmBoard,
  fetchCrmProject,
  queueReviewNotification,
  setCrmCost,
  setCrmFields,
  setCrmOwners,
  setCrmPrice,
  setCrmStage,
  upsertCrmTask,
  type CrmProjectDetail,
} from "@/lib/leadmagnet/dashboard-adapter";
import { requestKeyFor, releaseRequestKey } from "@/lib/leadmagnet/request-key";
import type { CrmPerson } from "@/lib/leadmagnet/crm";
import { fetchStaffView, type DossierView } from "@/lib/leadmagnet/supabase-adapter";


import {
  CRM_STAGES,
  TASK_STATUSES,
  actionAgeDays,
  nextAction,
  projectAgeDays,
  stageAgeDays,
  isCountryCode,
  isCurrencyCode,
  parseAmountInput,
  parseVolumeInput,
  personFullName,
  taskProgress,
  type CrmStage,
  type CrmTask,
  type TaskStakeholder,
  type TaskStatus,
} from "@/lib/leadmagnet/crm";

import { latestSapNoteText, sapNotesToText } from "@/lib/leadmagnet/sap-note";

export const Route = createFileRoute("/standex/projects/$dossierId")({
  component: ProjectDetailRoute,
});

type Tab = "tracking" | "tasks" | "sap" | "review" | "notify";

/* i18n-canonical : libellés canoniques traduits par t() au rendu. */
const TABS: { id: Tab; label: string }[] = [
  { id: "tracking", label: "Suivi" },
  { id: "tasks", label: "Tâches" },
  { id: "sap", label: "Notes SAP" },
  { id: "review", label: "Revue, documents et 3D" },
  { id: "notify", label: "Information du client" },
];

/** La route lit l'identifiant dans l'URL ; l'écran, lui, le reçoit en propriété :
 *  il peut donc être monté et vérifié sans routeur. */
function ProjectDetailRoute() {
  const { dossierId } = Route.useParams();
  return <ProjectDetail dossierId={dossierId} />;
}

export function ProjectDetail({ dossierId }: { dossierId: string }) {
  const { capabilities, legacyRole, sessionGeneration } = useCrm();
  const locale = useLocale();
  const tag = localeTag(locale);
  const [tab, setTab] = useState<Tab>("tracking");
  const [detail, setDetail] = useState<CrmProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /* Le succès d'une écriture part en pastille flottante ; un refus, lui, reste
     en place à côté de l'action refusée. */
  const flash = useFlash();

  const dossierRef = useRef(dossierId);
  /** Compte réellement connecté : un changement de compte périme tout ce qui est
   *  affiché et tout ce qui est encore en vol. Rien de l'ancien compte ne doit
   *  réapparaître pendant que la nouvelle lecture est en cours. */
  const sessionRef = useRef(sessionGeneration);
  /** Numéro de la dernière demande émise : une réponse plus ancienne est ignorée,
   *  même si elle revient après une plus récente (A → B → A). */
  const genRef = useRef(0);
  /** Verrou synchrone attaché à SA génération : une réponse ancienne ne peut
   *  jamais libérer le verrou d'une écriture plus récente (A → B → A). */
  const pendingRef = useRef(createOwnedLock());

  // Changer de projet OU de compte invalide toute réponse encore en vol.
  useEffect(() => {
    dossierRef.current = dossierId;
    sessionRef.current = sessionGeneration;
    genRef.current += 1;
    pendingRef.current.reset();

    setDetail(null);
    setError(null);


    setBusy(false);
    setPageDirectory([]);
  }, [dossierId, sessionGeneration]);

  /** Relit l'état serveur. `keepError` conserve un message de conflit déjà affiché :
   *  la relecture ne doit jamais effacer l'explication de l'échec précédent. */
  const reload = useCallback((keepError = false) => {
    const asked = dossierId;
    const session = sessionGeneration;
    const gen = ++genRef.current;
    if (!keepError) setError(null);
    fetchCrmProject(asked)
      .then((d) => {
        if (dossierRef.current !== asked || genRef.current !== gen) return;
        if (sessionRef.current !== session) return;
        setDetail(d);
      })
      .catch((e: unknown) => {
        if (dossierRef.current !== asked || genRef.current !== gen) return;
        if (sessionRef.current !== session) return;
        if (keepError) return;
        setDetail(null);
        setError(e instanceof Error ? e.message : t("Lecture refusée."));
      });
  }, [dossierId, sessionGeneration]);

  const load = useCallback(() => reload(false), [reload]);

  // Annuaire métier, lu une fois : il sert à nommer les responsables du projet.
  const [pageDirectory, setPageDirectory] = useState<CrmPerson[]>([]);
  useEffect(() => {
    let alive = true;
    if (!capabilities?.available) return;
    const session = sessionGeneration;
    fetchCrmBoard()
      .then((b) => {
        if (alive && sessionRef.current === session) setPageDirectory(b.directory);
      })
      .catch(() => {
        if (alive && sessionRef.current === session) setPageDirectory([]);
      });
    return () => {
      alive = false;
    };
  }, [capabilities?.available, sessionGeneration]);


  useEffect(() => {
    if (capabilities?.available) load();
  }, [capabilities?.available, sessionGeneration, load]);

  const run = async (fn: () => Promise<CrmProjectDetail>, ok: string) => {
    const asked = dossierId;
    const session = sessionGeneration;
    const gen = genRef.current + 1;
    if (!pendingRef.current.acquire(gen)) return;
    genRef.current = gen;

    setBusy(true);
    
    setError(null);
    try {
      const next = await fn();
      if (dossierRef.current !== asked || genRef.current !== gen) return;
      if (sessionRef.current !== session) return;
      setDetail(next);
      flash.success(ok);
    } catch (e: unknown) {
      if (dossierRef.current !== asked || genRef.current !== gen) return;
      if (sessionRef.current !== session) return;
      setError(e instanceof Error ? e.message : t("Action refusée."));
      // Un conflit de version se résout en relisant l'état réel du serveur,
      // sans effacer le message qui explique pourquoi l'écriture a échoué.
      reload(true);
    } finally {
      // Seule l'écriture propriétaire du verrou peut le rendre : une réponse
      // périmée ne débloque ni la suivante ni son indicateur d'occupation.
      if (
        pendingRef.current.release(gen)
        && dossierRef.current === asked
        && sessionRef.current === session
      ) setBusy(false);
    }

  };

  // La session affichée doit être la session courante : entre une déconnexion
  // et la première lecture du nouveau compte, on n'affiche pas l'ancien projet.
  if (sessionRef.current !== sessionGeneration) return <LoadingBlock />;
  if (capabilities === null) return <LoadingBlock />;
  if (!capabilities.available)
    return (
      <div className="space-y-3">
        <CrmUnavailableNotice
          plain={t("Le suivi de projet n'est pas encore activé sur ce serveur.")}
          detail={capabilities.detail}
          isAdmin={legacyRole === "admin"}
        >
          {t("Les revues et documents restent accessibles ci-dessous.")}
        </CrmUnavailableNotice>
        <DossierConsole initialDossierId={dossierId} embedded />
      </div>
    );

  const project = detail?.project ?? null;

  return (
    <div className="space-y-4">
      {/* Identité du projet : d'où l'on vient, de qui il s'agit, où il en est. */}
      <div className="space-y-1">
        <Link
          to="/standex"
          className="t-caption inline-flex min-h-11 items-center text-muted-foreground"
        >
          ← {t("Projets")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="t-title-l">
            {/* Société réellement affichée : celle déclarée par le client, sauf
                correction interne explicite. Puis le nom du projet. */}
            {project?.companyEffective ?? project?.company ?? project?.title ?? t("Fiche projet")}
          </h2>
          {project?.projectName ? (
            <span className="t-body text-muted-foreground">{project.projectName}</span>
          ) : null}
          {project ? (
            <span className="inline-flex items-center gap-2">
              <StagePill stage={project.stage} />
              <StageGauge stage={project.stage} />
            </span>
          ) : null}
        </div>
      </div>

      {detail && project ? <ProjectSummary detail={detail} directory={pageDirectory} /> : null}

      {/* Onglets : même vocabulaire que la navigation de l'espace de travail. */}
      <div
        role="tablist"
        aria-label={t("Sections de la fiche projet")}
        className="segmented"
        style={{
          ["--seg-count" as string]: TABS.length,
          ["--seg" as string]: TABS.findIndex((item) => item.id === tab),
        }}
      >
        <span className="segmented-thumb" aria-hidden="true" />
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            data-active={tab === item.id ? "true" : undefined}
            className="segmented-item"
            onClick={() => setTab(item.id)}
          >
            {t(item.label)}
          </button>
        ))}
      </div>

      {error ? <ErrorBlock text={error} onRetry={load} /> : null}
      {detail === null && !error ? <LoadingBlock /> : null}


      {detail && project ? (
        <>
          {tab === "tracking" ? (
            <div role="tabpanel" id="panel-tracking" aria-labelledby="tab-tracking">
              <TrackingTab
                detail={detail}
                locale={tag}
                busy={busy}
                onRun={run}
                directoryFallback={capabilities.person?.id ?? null}
              />
            </div>
          ) : null}
          {tab === "tasks" ? (
            <div role="tabpanel" id="panel-tasks" aria-labelledby="tab-tasks">
              <TasksTab detail={detail} busy={busy} onRun={run} directory={pageDirectory} />
            </div>
          ) : null}
          {tab === "sap" ? (
            <div role="tabpanel" id="panel-sap" aria-labelledby="tab-sap">
              <SapTab detail={detail} />
            </div>
          ) : null}
          {tab === "notify" ? (
            <div role="tabpanel" id="panel-notify" aria-labelledby="tab-notify">
              <NotifyTab detail={detail} busy={busy} onRun={run} />
            </div>
          ) : null}
        </>
      ) : null}

      {tab === "review" ? (
        <section
          role="tabpanel"
          id="panel-review"
          aria-labelledby="tab-review"
          aria-label={t("Revue, documents et 3D")}
        >
          <p className="t-caption text-muted-foreground">
            {t("Revue technique et décisions envoyées au client : offres, échantillons, retours R&D et documents.")}
          </p>
          <DossierConsole initialDossierId={dossierId} embedded />
        </section>
      ) : null}

    </div>
  );
}

/* --------------------------------------------------------------- Résumé */

/** Âges réels, responsables et prochaine action : quatre repères posés, jamais
 *  inventés. Une donnée manquante reste écrite « inconnu » en clair. */
function ProjectSummary({
  detail,
  directory,
}: {
  detail: CrmProjectDetail;
  directory: readonly CrmPerson[];
}) {
  const p = detail.project;
  const age = projectAgeDays(p);
  const stageAge = stageAgeDays(p);
  const next = nextAction(p, detail.tasks);
  const nextAge = actionAgeDays(next);
  const unknown = t("inconnu");
  const sales = personName(directory, p.salesPersonId ?? null);
  const fae = personName(directory, p.faePersonId ?? null);

  return (
    <dl className="kpi-row">
      <div className="kpi">
        <dt>{t("Âge total du projet")}</dt>
        <dd className="t-metric">{age === null ? unknown : `${age} ${t("jour(s)")}`}</dd>
      </div>
      <div className="kpi">
        <dt>{t("Âge de l'étape en cours")}</dt>
        <dd className="t-metric">
          {stageAge === null ? unknown : `${stageAge} ${t("jour(s)")}`}
        </dd>
      </div>
      <div className="kpi">
        <dt>{t("Responsables")}</dt>
        <dd className="t-body space-y-1">
          <span className="flex items-center gap-2">
            <AvatarInitials name={sales} />
            <span>
              {t("Commercial")} : {sales}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <AvatarInitials name={fae} />
            <span>
              {t("FAE")} : {fae}
            </span>
          </span>
        </dd>
      </div>
      <div className="kpi">
        <dt>{t("Prochaine action")}</dt>
        <dd className="t-body">
          {next === null ? (
            <span className="text-muted-foreground">{t("aucune action en attente")}</span>
          ) : (
            <>
              {next.label}
              <span className="t-caption block text-muted-foreground">
                {t(STAKEHOLDER_LABEL[next.stakeholder] ?? next.stakeholder)}
                {nextAge === null ? "" : ` · ${nextAge} ${t("jour(s)")}`}
              </span>
            </>
          )}
        </dd>
      </div>
    </dl>
  );
}



/* ------------------------------------------------------------------ Suivi */

function TrackingTab({
  detail,
  locale,
  busy,
  onRun,
}: {
  detail: CrmProjectDetail;
  locale: string;
  busy: boolean;
  onRun: (fn: () => Promise<CrmProjectDetail>, ok: string) => Promise<void>;
  directoryFallback: string | null;
}) {
  const p = detail.project;
  const { capabilities } = useCrm();
  /** Valeurs telles qu'elles sont côté serveur : point de remise à zéro. */
  const serverFields = useMemo(
    () => ({
      company: p.company ?? "",
      projectName: p.projectName ?? "",
      countryCode: p.countryCode ?? "",
      currency: p.currency ?? "",
      seriesLaunch: p.seriesLaunch ?? "",
      volumeOverride: p.annualVolumeOverride === null ? "" : String(p.annualVolumeOverride),
      estimate: p.estimatedAnnualRevenue === null ? "" : String(p.estimatedAnnualRevenue),
    }),
    [p],
  );
  const [fields, setFieldsState] = useState(serverFields);
  /** Champs réellement modifiés à la main : seuls ceux-là sont envoyés. */
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [price, setPrice] = useState(p.unitPrice === null ? "" : String(p.unitPrice));
  const [cost, setCost] = useState(p.unitCost === null ? "" : String(p.unitCost));
  const [costInSap, setCostInSap] = useState(p.costInSap);
  const [local, setLocal] = useState<string | null>(null);
  const [directory, setDirectory] = useState(
    { sales: p.salesPersonId ?? "none", fae: p.faePersonId ?? "none" },
  );
  const [board, setBoard] = useState<{ id: string; name: string; role: string }[]>([]);

  const setField = (key: keyof typeof serverFields, value: string) => {
    setFieldsState((f) => ({ ...f, [key]: value }));
    setDirty((d) => new Set(d).add(key));
  };

  // Une écriture confirmée fait changer la version : on repart alors de l'état
  // réellement enregistré. En cas d'échec la version ne bouge pas, donc la
  // saisie en cours est conservée telle quelle.
  const syncKey = `${p.dossierId}:${p.version}`;
  const syncedRef = useRef(syncKey);
  useEffect(() => {
    if (syncedRef.current === syncKey) return;
    syncedRef.current = syncKey;
    setFieldsState(serverFields);
    setDirty(new Set());
    setPrice(p.unitPrice === null ? "" : String(p.unitPrice));
    setCost(p.unitCost === null ? "" : String(p.unitCost));
    setCostInSap(p.costInSap);
    setDirectory({ sales: p.salesPersonId ?? "none", fae: p.faePersonId ?? "none" });
    setLocal(null);
  }, [syncKey, serverFields, p]);

  useEffect(() => {
    let alive = true;
    import("@/lib/leadmagnet/dashboard-adapter").then(async (m) => {
      try {
        const b = await m.fetchCrmBoard();
        if (!alive) return;
        setBoard(
          b.directory
            .filter((d) => d.active)
            .map((d) => ({ id: d.id, name: personFullName(d), role: d.role })),
        );
      } catch {
        if (alive) setBoard([]);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const canPrice = capabilities?.role === "sales" || capabilities?.role === "admin";
  // Le coût est réservé à la R&D et à l'administration : le serveur le refuse
  // au commerce, l'écran ne doit donc pas laisser croire le contraire.
  const canCost = capabilities?.role === "rnd" || capabilities?.role === "admin";
  const canOwners = capabilities?.role === "sales" || capabilities?.role === "admin";
  /** Un montant déjà renseigné verrouille la devise côté serveur. */
  const currencyLocked =
    p.currency !== null &&
    (p.unitPrice !== null || p.unitCost !== null || p.estimatedAnnualRevenue !== null);

  return (
    <div className="space-y-4">
      {/* Sur une fiche unique, la provenance d'une valeur est une information de
          premier plan : elle reste visible, contrairement au tableau. */}
      <dl className="kpi-row">
        <div className="kpi">
          <dt>{t("Volume annuel de capteurs")}</dt>
          <dd className="num">
            <VolumeCell project={p} />
          </dd>
        </div>
        <div className="kpi">
          <dt>{t("Chiffre d'affaires annuel")}</dt>
          <dd className="num">
            <RevenueCell project={p} locale={locale} />
          </dd>
        </div>
        <div className="kpi">
          <dt>{t("Marge")}</dt>
          <dd className="num">
            <MarginCell project={p} locale={locale} />
          </dd>
        </div>
        <div className="kpi">
          <dt>{t("Lancement série")}</dt>
          <dd className="num">
            {p.seriesLaunchEffective ? (
              <>
                <span className="t-metric">{p.seriesLaunchEffective}</span>
                <span className="t-caption block text-muted-foreground">
                  {p.seriesLaunchSource === "override"
                    ? t("corrigé en interne")
                    : t("déclaré par le client")}
                </span>
              </>
            ) : (
              <UnknownValue />
            )}
          </dd>
        </div>
        <div className="kpi">
          <dt>{t("Avancement")}</dt>
          <dd className="num">
            {taskProgress(detail.tasks).percent === null ? (
              <UnknownValue reason={t("aucune tâche")} />
            ) : (
              <span className="t-metric">{taskProgress(detail.tasks).percent} %</span>
            )}
          </dd>
        </div>
        <div className="kpi">
          <dt>{t("Dernière version envoyée")}</dt>
          <dd className="t-metric num">{p.currentRevision}</dd>
        </div>
      </dl>


      <section className="space-y-2">
        <h3 className="t-title-s">{t("Étape")}</h3>
        <p className="t-caption text-muted-foreground">
          {t("Une étape « Closed Won » n'est jamais posée automatiquement : elle se choisit ici, en connaissance de cause.")}
        </p>
        <Select
          value={p.stage}
          onValueChange={(v) =>
            void onRun(() => setCrmStage(p.dossierId, v as CrmStage, p.version), t("Étape mise à jour."))
          }
        >
          <SelectTrigger className="min-h-11 max-w-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALL_STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {stageLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="space-y-2">
        <h3 className="t-title-s">{t("Identité du projet")}</h3>
        {local ? <p className="notice-warning t-caption anim-nudge">{local}</p> : null}
        {/* Trois rangées alignées : libellé, champ, aide. Un libellé long ne
            décale plus son voisin. */}
        <div className="field-row">
          <div className="field">
            <Label className="t-caption">{t("Société")}</Label>
            <Input
              value={fields.company}
              placeholder={p.companySubmitted ?? ""}
              onChange={(e) => setField("company", e.target.value)}
            />
            {p.companySubmitted ? (
              <p className="t-caption text-muted-foreground">
                {t("Déclaré par le client :")} {p.companySubmitted}
              </p>
            ) : (
              <span />
            )}
          </div>
          <div className="field">
            <Label className="t-caption">{t("Nom du projet")}</Label>
            <Input
              value={fields.projectName}
              onChange={(e) => setField("projectName", e.target.value)}
            />
            <span />
          </div>
          <div className="field">
            <Label className="t-caption">{t("Pays (code à deux lettres)")}</Label>
            <Input
              value={fields.countryCode}
              maxLength={2}
              onChange={(e) => setField("countryCode", e.target.value)}
            />
            <span />
          </div>
          <div className="field">
            <Label className="t-caption">{t("Devise (code à trois lettres)")}</Label>
            <Input
              value={fields.currency}
              maxLength={3}
              disabled={currencyLocked}
              onChange={(e) => setField("currency", e.target.value)}
            />
            {currencyLocked ? (
              <p className="t-caption text-muted-foreground">
                {t("Devise verrouillée : des montants sont déjà enregistrés. Effacez-les d'abord si la devise doit changer.")}
              </p>
            ) : (
              <span />
            )}
          </div>
          <div className="field">
            <Label className="t-caption">{t("Lancement série")}</Label>
            <Input
              type="date"
              value={fields.seriesLaunch}
              onChange={(e) => setField("seriesLaunch", e.target.value)}
            />
            <span />
          </div>
          <div className="field">
            <Label className="t-caption">{t("Volume annuel corrigé (capteurs)")}</Label>
            <Input
              inputMode="numeric"
              value={fields.volumeOverride}
              onChange={(e) => setField("volumeOverride", e.target.value)}
            />
            <p className="t-caption text-muted-foreground">
              {t("Vide : le volume de la dernière version envoyée est utilisé.")}
            </p>
          </div>
          <div className="field">
            <Label className="t-caption">{t("Estimation de chiffre d'affaires annuel")}</Label>
            <Input
              inputMode="decimal"
              value={fields.estimate}
              onChange={(e) => setField("estimate", e.target.value)}
            />
            <p className="t-caption text-muted-foreground">
              {t("Utilisée tant que volume et prix ne permettent pas le calcul ; elle n'est jamais effacée.")}
            </p>
          </div>
        </div>

        <Button
          size="sm"
          disabled={busy || dirty.size === 0}
          onClick={() => {
            const volume = parseVolumeInput(fields.volumeOverride);
            const estimate = parseAmountInput(fields.estimate);
            if (!volume.ok) return setLocal(t("Volume annuel : entier positif attendu."));
            if (!estimate.ok) return setLocal(t("Estimation : montant positif attendu."));
            if (fields.countryCode.trim() && !isCountryCode(fields.countryCode))
              return setLocal(t("Pays : code à deux lettres attendu."));
            if (fields.currency.trim() && !isCurrencyCode(fields.currency))
              return setLocal(t("Devise : code à trois lettres attendu."));
            if (dirty.has("currency") && currencyLocked)
              return setLocal(
                t("La devise ne peut plus changer : des montants sont déjà enregistrés dans la devise actuelle."),
              );
            // Seuls les champs réellement modifiés partent : enregistrer ici
            // ne doit jamais écraser une valeur changée entre-temps ailleurs.
            const patch: Record<string, unknown> = {};
            if (dirty.has("company")) patch["company"] = fields.company.trim() || null;
            if (dirty.has("projectName")) patch["project_name"] = fields.projectName.trim() || null;
            if (dirty.has("countryCode"))
              patch["country_code"] = fields.countryCode.trim().toUpperCase() || null;
            if (dirty.has("currency"))
              patch["currency"] = fields.currency.trim().toUpperCase() || null;
            if (dirty.has("seriesLaunch")) patch["series_launch"] = fields.seriesLaunch || null;
            if (dirty.has("volumeOverride")) patch["annual_volume_override"] = volume.value;
            if (dirty.has("estimate")) patch["estimated_annual_revenue"] = estimate.value;
            if (Object.keys(patch).length === 0) return setLocal(t("Aucune modification à enregistrer."));
            setLocal(null);
            void onRun(() => setCrmFields(p.dossierId, patch, p.version), t("Fiche enregistrée."));
          }}
        >
          {t("Enregistrer")}
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="t-title-s">{t("Prix et coût")}</h3>
        <p className="t-caption text-muted-foreground">
          {t("Ces montants restent internes : ils ne partent jamais au client, ni dans un export, ni dans un message.")}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label className="t-caption">{t("Prix de vente unitaire")}</Label>
            <Input
              inputMode="decimal"
              value={price}
              disabled={!canPrice}
              onChange={(e) => setPrice(e.target.value)}
            />
            {canPrice ? null : (
              <p className="t-caption text-muted-foreground">
                {t("Seul le commerce ou l'administration renseigne le prix.")}
              </p>
            )}
            <Button
              size="sm"
              variant="outline"
              className="mt-1"
              disabled={busy || !canPrice}
              onClick={() => {
                const parsed = parseAmountInput(price);
                if (!parsed.ok) return setLocal(t("Prix : montant positif attendu."));
                void onRun(
                  () =>
                    setCrmPrice(
                      p.dossierId,
                      parsed.value,
                      currencyLocked
                        ? p.currency
                        : fields.currency.trim().toUpperCase() || p.currency,
                      p.version,
                    ),
                  t("Prix enregistré."),
                );
              }}
            >
              {t("Enregistrer le prix")}
            </Button>
          </div>
          <div>
            <Label className="t-caption">{t("Coût unitaire")}</Label>
            <Input
              inputMode="decimal"
              value={cost}
              disabled={!canCost || costInSap}
              onChange={(e) => setCost(e.target.value)}
            />
            <label className="mt-1 flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={costInSap}
                disabled={!canCost}
                onChange={(e) => setCostInSap(e.target.checked)}
              />
              {t("Voir le coût dans SAP")}
            </label>
            <Button
              size="sm"
              variant="outline"
              className="mt-1"
              disabled={busy || !canCost}
              onClick={() => {
                const parsed = parseAmountInput(cost);
                if (!costInSap && !parsed.ok)
                  return setLocal(t("Coût : montant positif attendu (zéro accepté)."));
                void onRun(
                  () =>
                    setCrmCost(
                      p.dossierId,
                      costInSap ? null : parsed.ok ? parsed.value : null,
                      costInSap,
                      p.version,
                    ),
                  t("Coût enregistré."),
                );
              }}
            >
              {t("Enregistrer le coût")}
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="t-title-s">{t("Responsables")}</h3>
        <p className="t-caption text-muted-foreground">
          {t("Désigner une personne ici n'ouvre aucun accès : l'accès dépend du compte rattaché et de l'affectation au dossier.")}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label className="t-caption">{t("Commercial")}</Label>
            <Select
              value={directory.sales}
              disabled={!canOwners}
              onValueChange={(v) => setDirectory({ ...directory, sales: v })}
            >
              <SelectTrigger className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("non attribué")}</SelectItem>
                {board
                  .filter((d) => d.role === "sales")
                  .map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="t-caption">FAE</Label>
            <Select
              value={directory.fae}
              disabled={!canOwners}
              onValueChange={(v) => setDirectory({ ...directory, fae: v })}
            >
              <SelectTrigger className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("non attribué")}</SelectItem>
                {board
                  .filter((d) => d.role === "fae")
                  .map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {canOwners ? null : (
          <p className="t-caption text-muted-foreground">
            {t("Seul le commerce ou l'administration désigne les responsables.")}
          </p>
        )}
        <Button
          size="sm"
          disabled={busy || !canOwners}
          onClick={() =>
            void onRun(
              () =>
                setCrmOwners(
                  p.dossierId,
                  directory.sales === "none" ? null : directory.sales,
                  directory.fae === "none" ? null : directory.fae,
                  p.version,
                ),
              t("Responsables enregistrés."),
            )
          }
        >
          {t("Enregistrer les responsables")}
        </Button>
      </section>
    </div>
  );
}

/* ----------------------------------------------------------------- Tâches */

function TasksTab({
  detail,
  busy,
  onRun,
}: {
  detail: CrmProjectDetail;
  busy: boolean;
  onRun: (fn: () => Promise<CrmProjectDetail>, ok: string) => Promise<void>;
}) {
  const p = detail.project;
  // Une clé de demande appartient au compte qui l'a créée.
  const accountId = useCrm().capabilities?.userId ?? null;
  const progress = taskProgress(detail.tasks);
  const [draft, setDraft] = useState({
    label: "",
    stage: p.stage as CrmStage,
    stakeholder: "sales" as TaskStakeholder,
    dueOn: "",
  });
  const [naReason, setNaReason] = useState<Record<string, string>>({});
  const [local, setLocal] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <p className="text-sm">
        {progress.percent === null
          ? t("Aucune tâche : l'avancement est inconnu, il ne vaut pas 0 %.")
          : `${progress.done}/${progress.total} — ${progress.percent} %`}
        {progress.blocked > 0 ? ` — ${progress.blocked} ${t("bloquée(s)")}` : ""}
      </p>

      {detail.tasks.length === 0 ? (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void onRun(
              () => applyCrmTemplate(p.dossierId, p.version),
              t("Liste de tâches type ajoutée."),
            )
          }
        >
          {t("Ajouter la liste de tâches type")}
        </Button>
      ) : null}

      {local ? <p className="notice-warning t-caption">{local}</p> : null}

      <ul className="space-y-2">
        {detail.tasks.map((task) => (
          <li key={task.id} className="panel-block space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{task.label}</span>
              <Badge variant="outline">{stageLabel(task.stage)}</Badge>
              <span className="t-caption text-muted-foreground">
                {t(STAKEHOLDER_LABEL[task.stakeholder] ?? task.stakeholder)}
              </span>
              {task.dueOn ? (
                <span className="t-caption t-metric">
                  {t("échéance")} {task.dueOn}
                </span>
              ) : (
                <span className="t-caption text-muted-foreground">{t("sans échéance")}</span>
              )}
              {task.status === "done" && task.doneByName ? (
                <span className="t-caption text-muted-foreground">
                  {t("terminée par")} {task.doneByName}
                </span>
              ) : null}
            </div>
            {task.status === "not_applicable" && task.naReason ? (
              <p className="t-caption text-muted-foreground">
                {t("Sans objet :")} {task.naReason}
              </p>
            ) : null}
            <div className="flex flex-wrap items-end gap-2">
              <Select
                value={task.status}
                onValueChange={(v) => {
                  const status = v as TaskStatus;
                  if (status === "not_applicable" && !(naReason[task.id] ?? "").trim()) {
                    setLocal(t("Un item « sans objet » demande une justification."));
                    return;
                  }
                  setLocal(null);
                  void onRun(
                    () =>
                      upsertCrmTask(p.dossierId, {
                        id: task.id,
                        stage: task.stage,
                        label: task.label,
                        stakeholder: task.stakeholder,
                        status,
                        personId: task.personId,
                        naReason: status === "not_applicable" ? (naReason[task.id] ?? "").trim() : null,
                        dueOn: task.dueOn,
                        expectedVersion: task.version,
                      }),
                    t("Tâche mise à jour."),
                  );
                }}
              >
                <SelectTrigger className="min-h-11 w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(TASK_STATUS_LABEL[s])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div>
                <Label className="t-caption" htmlFor={`due-${task.id}`}>
                  {t("Échéance")}
                </Label>
                <Input
                  id={`due-${task.id}`}
                  type="date"
                  value={task.dueOn ?? ""}
                  onChange={(e) => {
                    const dueOn = e.target.value || null;
                    if (dueOn === (task.dueOn ?? null)) return;
                    setLocal(null);
                    void onRun(
                      () =>
                        upsertCrmTask(p.dossierId, {
                          id: task.id,
                          stage: task.stage,
                          label: task.label,
                          stakeholder: task.stakeholder,
                          status: task.status,
                          personId: task.personId,
                          naReason: task.naReason,
                          dueOn,
                          expectedVersion: task.version,
                        }),
                      t("Échéance mise à jour."),
                    );
                  }}
                />
              </div>
              <div>
                <Label className="t-caption">{t("Rôle concerné")}</Label>
                <Select
                  value={task.stakeholder}
                  onValueChange={(v) => {
                    const stakeholder = v as TaskStakeholder;
                    if (stakeholder === task.stakeholder) return;
                    setLocal(null);
                    void onRun(
                      () =>
                        upsertCrmTask(p.dossierId, {
                          id: task.id,
                          stage: task.stage,
                          label: task.label,
                          stakeholder,
                          status: task.status,
                          personId: task.personId,
                          naReason: task.naReason,
                          dueOn: task.dueOn,
                          expectedVersion: task.version,
                        }),
                      t("Rôle mis à jour."),
                    );
                  }}
                >
                  <SelectTrigger className="min-h-11 w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["sales", "fae", "client"] as const).map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(STAKEHOLDER_LABEL[s] ?? s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="t-caption" htmlFor={`na-${task.id}`}>
                  {t("Motif si « sans objet »")}
                </Label>
                <Input
                  id={`na-${task.id}`}
                  value={naReason[task.id] ?? ""}
                  onChange={(e) => setNaReason((m) => ({ ...m, [task.id]: e.target.value }))}
                />
                <InternalEnglishHint />
              </div>
            </div>
          </li>
        ))}
      </ul>

      <section className="panel-block grid gap-2 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Label className="t-caption">{t("Nouvelle tâche")}</Label>
          <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          <InternalEnglishHint />
        </div>
        <div>
          <Label className="t-caption">{t("Étape")}</Label>
          <Select
            value={draft.stage}
            onValueChange={(v) => setDraft({ ...draft, stage: v as CrmStage })}
          >
            <SelectTrigger className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {stageLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="t-caption">{t("Rôle concerné")}</Label>
          <Select
            value={draft.stakeholder}
            onValueChange={(v) => setDraft({ ...draft, stakeholder: v as TaskStakeholder })}
          >
            <SelectTrigger className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["sales", "fae", "client"] as const).map((s) => (
                <SelectItem key={s} value={s}>
                  {t(STAKEHOLDER_LABEL[s] ?? s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="t-caption">{t("Échéance (facultative)")}</Label>
          <Input
            type="date"
            value={draft.dueOn}
            onChange={(e) => setDraft({ ...draft, dueOn: e.target.value })}
          />
        </div>
        <Button
          size="sm"
          disabled={busy || !draft.label.trim()}
          onClick={() =>
            void onRun(async () => {
              // Clé de création stable : un même ajout rejoué (double-clic,
              // reprise réseau) rend l'action déjà créée, pas un doublon.
              const scope = `task:${p.dossierId}:${draft.stage}:${draft.label.trim()}`;
              const clientKey = requestKeyFor(scope, accountId);
              const next = await upsertCrmTask(p.dossierId, {
                stage: draft.stage,
                label: draft.label.trim(),
                stakeholder: draft.stakeholder,
                status: "todo",
                dueOn: draft.dueOn || null,
                clientKey,
              });
              releaseRequestKey(scope, accountId);
              setDraft({ label: "", stage: p.stage, stakeholder: "sales", dueOn: "" });
              return next;
            }, t("Tâche ajoutée."))
          }
        >

          {t("Ajouter")}
        </Button>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------- Notes SAP */

function SapTab({ detail }: { detail: CrmProjectDetail }) {
  const text = useMemo(() => sapNotesToText(detail.sapNotes), [detail.sapNotes]);
  // Le backend renvoie l'historique du plus récent au plus ancien : « Copier la
  // dernière » doit choisir le max de createdAt, jamais la dernière ligne du tableau.
  const latest = useMemo(() => latestSapNoteText(detail.sapNotes), [detail.sapNotes]);
  const [copyState, setCopyState] = useState<{ ok: boolean; text: string } | null>(null);

  const copy = async (value: string, okMessage: string) => {
    try {
      const write = navigator.clipboard?.writeText;
      if (!write) {
        setCopyState({
          ok: false,
          text: t("Copie impossible depuis ce navigateur : sélectionnez le texte et copiez-le à la main."),
        });
        return;
      }
      await navigator.clipboard.writeText(value);
      setCopyState({ ok: true, text: okMessage });
    } catch {
      setCopyState({
        ok: false,
        text: t("Copie impossible depuis ce navigateur : sélectionnez le texte et copiez-le à la main."),
      });
    }
  };

  return (
    <div className="space-y-2">
      <p className="t-caption text-muted-foreground">
        {t("Notes rédigées en anglais, dans un format fixe, à recopier dans SAP. Elles s'ajoutent et ne se modifient jamais.")}
      </p>
      {detail.sapNotes.length === 0 ? (
        <p className="panel-block text-sm text-muted-foreground">
          {t("Aucune note pour l'instant : elles apparaissent au fil des étapes et des tâches terminées.")}
        </p>
      ) : (
        <>
          <pre className="code-block max-h-96 whitespace-pre-wrap">{text}</pre>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void copy(text, t("Toutes les notes ont été copiées."))}
            >
              {t("Copier tout")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void copy(latest, t("La dernière note a été copiée."))}
            >
              {t("Copier la dernière")}
            </Button>
          </div>
          {copyState ? (
            <p
              role="status"
              className={copyState.ok ? "notice-success t-caption" : "notice-warning t-caption"}
            >
              {copyState.text}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------- Information du client */

/** Langue enregistrée du projet, lue dans la dernière version soumise.
 *  Rien n'est deviné : sans version envoyée, la langue reste inconnue. */
export function submittedSourceLocale(view: DossierView | null): string | null {
  const revisions = view?.revisions ?? [];
  for (let i = revisions.length - 1; i >= 0; i -= 1) {
    const value = (revisions[i]?.snapshot as { sourceLocale?: unknown } | undefined)?.sourceLocale;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function NotifyTab({
  detail,
  busy,
  onRun,
}: {
  detail: CrmProjectDetail;
  busy: boolean;
  onRun: (fn: () => Promise<CrmProjectDetail>, ok: string) => Promise<void>;
}) {
  const p = detail.project;
  const [view, setView] = useState<DossierView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [summary, setSummary] = useState("");
  const [reviewId, setReviewId] = useState<string>("");

  useEffect(() => {
    let alive = true;
    fetchStaffView(p.dossierId)
      .then((v) => {
        if (alive) setView(v);
      })
      .catch((e: unknown) => {
        if (alive) setLoadError(e instanceof Error ? e.message : t("Lecture refusée."));
      });
    return () => {
      alive = false;
    };
  }, [p.dossierId]);

  const published = (view?.reviews ?? []).filter((r) => r.published && !r.superseded);
  const chosen = published.find((r) => r.id === reviewId) ?? null;
  /** Contenu client de l'aperçu : rien d'interne n'y entre. */
  const selected = chosen
    ? {
        verdict: chosen.verdict,
        exactPartNumber: chosen.exact_part_number,
        conditions: chosen.conditions,
        message: chosen.message,
      }
    : null;
  /** Langue enregistrée du projet : celle de la dernière version RÉELLEMENT
   *  envoyée par le client. À défaut seulement, celle du dernier message
   *  préparé. Jamais la langue de l'écran interne. */
  const clientLocale = submittedSourceLocale(view) ?? detail.notifications[0]?.locale ?? "fr";
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const absoluteLink = `${origin}/?dossier=${p.dossierId}`;

  return (
    <div className="space-y-3">
      <p className="notice-info text-sm">
        {t("Aucun service d'envoi n'est raccordé à ce projet : un message préparé ici reste « en attente d'envoi » et n'est jamais présenté comme envoyé.")}
      </p>
      {loadError ? <p className="notice-warning t-caption">{loadError}</p> : null}

      <div>
        <Label className="t-caption">{t("Retour publié concerné")}</Label>
        <Select value={reviewId} onValueChange={setReviewId}>
          <SelectTrigger className="min-h-11 max-w-lg">
            <SelectValue placeholder={t("Choisir un retour déjà publié")} />
          </SelectTrigger>
          <SelectContent>
            {published.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {t("version")} {r.revision} — {r.verdict}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {published.length === 0 ? (
          <p className="t-caption text-muted-foreground">
            {t("Rien à annoncer : aucun retour n'est publié sur ce dossier.")}
          </p>
        ) : null}
      </div>

      <div>
        <Label className="t-caption">{t("Objet")}</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        <ClientLocaleHint locale={clientLocale} />
      </div>
      <div>
        <Label className="t-caption">{t("Message (contenu client uniquement)")}</Label>
        <Textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} />
        <ClientLocaleHint locale={clientLocale} />
        <p className="t-caption text-muted-foreground">
          {t("N'écrivez ici que ce que le client peut lire : ni prix interne, ni coût, ni note interne.")}
        </p>
      </div>

      {selected ? (
        <section className="panel-block space-y-2" aria-label={t("Aperçu du message client")}>
          <h3 className="t-title-s">{t("Aperçu tel que le client le lira")}</h3>
          <p className="t-caption text-muted-foreground">
            {t("Langue du client :")} {clientLocale} · {t("envoi non configuré")}
          </p>
          <p className="text-sm font-medium">{subject.trim() || t("(objet vide)")}</p>
          <p className="whitespace-pre-wrap text-sm">{summary.trim() || t("(message vide)")}</p>
          <ul className="t-caption space-y-1 text-muted-foreground">
            <li>
              {t("Décision publiée :")} {selected.verdict}
              {selected.exactPartNumber ? ` · ${selected.exactPartNumber}` : ""}
            </li>
            {selected.conditions ? (
              <li>
                {t("Conditions :")} {selected.conditions}
              </li>
            ) : null}
            {selected.message ? (
              <li>
                {t("Questions ouvertes :")} {selected.message}
              </li>
            ) : null}
          </ul>
          <p className="text-sm">
            <a className="underline" href={absoluteLink} target="_blank" rel="noreferrer">
              {absoluteLink}
            </a>
          </p>
        </section>
      ) : null}

      <Button
        size="sm"
        disabled={busy || !reviewId || !subject.trim() || !summary.trim()}
        onClick={() =>
          void onRun(
            () => queueReviewNotification(reviewId, subject.trim(), summary.trim()),
            t("Message préparé et mis en attente d'envoi."),
          )
        }
      >
        {t("Préparer le message")}
      </Button>

      <section className="space-y-2">
        <h3 className="t-title-s">{t("Messages préparés")}</h3>
        {detail.notifications.length === 0 ? (
          <p className="panel-block text-sm text-muted-foreground">{t("Aucun message préparé.")}</p>
        ) : (
          <ul className="space-y-2">
            {detail.notifications.map((n) => (
              <li key={n.id} className="panel-block space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{n.subject}</span>
                  <Badge variant="secondary">
                    {n.status === "pending"
                      ? t("en attente d'envoi — envoi non configuré")
                      : n.status === "failed"
                        ? t("échec")
                        : t("annulé")}
                  </Badge>
                  <span className="t-caption text-muted-foreground">
                    {t("langue du client :")} {n.locale}
                  </span>
                </div>
                <p className="whitespace-pre-wrap">{n.summary}</p>
                <p className="t-caption text-muted-foreground">
                  {t("lien :")}{" "}
                  <a
                    className="underline"
                    href={`${origin}${n.linkPath}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {`${origin}${n.linkPath}`}
                  </a>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
