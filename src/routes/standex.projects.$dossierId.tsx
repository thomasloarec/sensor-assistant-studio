import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { DossierConsole } from "@/components/standex/console/dossier-console";
import { useCrm } from "@/components/standex/dashboard/crm-context";
import {
  ALL_STAGES,
  ErrorBlock,
  LoadingBlock,
  MarginCell,
  RevenueCell,
  STAKEHOLDER_LABEL,
  TASK_STATUS_LABEL,
  UnknownValue,
  VolumeCell,
  personName,
  stageLabel,
} from "@/components/standex/dashboard/crm-shared";
import {
  applyCrmTemplate,
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
import { fetchStaffView, type DossierView } from "@/lib/leadmagnet/supabase-adapter";
import {
  TASK_STATUSES,
  isCountryCode,
  isCurrencyCode,
  parseAmountInput,
  parseVolumeInput,
  personFullName,
  taskProgress,
  type CrmStage,
  type TaskStakeholder,
  type TaskStatus,
} from "@/lib/leadmagnet/crm";
import { sapNotesToText } from "@/lib/leadmagnet/sap-note";

export const Route = createFileRoute("/standex/projects/$dossierId")({
  component: ProjectDetail,
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

function ProjectDetail() {
  const { dossierId } = Route.useParams();
  const { capabilities } = useCrm();
  const locale = useLocale();
  const tag = localeTag(locale);
  const [tab, setTab] = useState<Tab>("tracking");
  const [detail, setDetail] = useState<CrmProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dossierRef = useRef(dossierId);

  // Changer de projet invalide toute réponse encore en vol.
  useEffect(() => {
    dossierRef.current = dossierId;
    setDetail(null);
    setError(null);
    setMessage(null);
  }, [dossierId]);

  const load = useCallback(() => {
    const asked = dossierId;
    setError(null);
    fetchCrmProject(asked)
      .then((d) => {
        if (dossierRef.current !== asked) return;
        setDetail(d);
      })
      .catch((e: unknown) => {
        if (dossierRef.current !== asked) return;
        setDetail(null);
        setError(e instanceof Error ? e.message : t("Lecture refusée."));
      });
  }, [dossierId]);

  useEffect(() => {
    if (capabilities?.available) load();
  }, [capabilities?.available, load]);

  const run = async (fn: () => Promise<CrmProjectDetail>, ok: string) => {
    if (busy) return;
    const asked = dossierId;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const next = await fn();
      if (dossierRef.current !== asked) return;
      setDetail(next);
      setMessage(ok);
    } catch (e: unknown) {
      if (dossierRef.current !== asked) return;
      setError(e instanceof Error ? e.message : t("Action refusée."));
      // Un conflit de version se résout en relisant l'état réel du serveur.
      load();
    } finally {
      setBusy(false);
    }
  };

  if (capabilities === null) return <LoadingBlock />;
  if (!capabilities.available)
    return (
      <div className="space-y-3">
        <p className="notice-warning text-sm">
          {t("Le suivi de projet n'est pas installé sur ce serveur :")} {t(capabilities.detail)}{" "}
          {t("Les revues et documents restent accessibles ci-dessous.")}
        </p>
        <DossierConsole initialDossierId={dossierId} embedded />
      </div>
    );

  const project = detail?.project ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/standex"
          className="inline-flex min-h-11 items-center text-sm text-muted-foreground"
        >
          ← {t("Projets")}
        </Link>
        <h2 className="t-title-m">{project?.company ?? project?.title ?? t("Fiche projet")}</h2>
        {project ? <Badge variant="outline">{stageLabel(project.stage)}</Badge> : null}
      </div>

      <div role="tablist" aria-label={t("Sections de la fiche projet")} className="flex flex-wrap gap-1">
        {TABS.map((item) => (
          <Button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            size="sm"
            variant={tab === item.id ? "default" : "outline"}
            onClick={() => setTab(item.id)}
          >
            {t(item.label)}
          </Button>
        ))}
      </div>

      {message ? <p className="notice-success text-sm">{message}</p> : null}
      {error ? <ErrorBlock text={error} onRetry={load} /> : null}
      {detail === null && !error ? <LoadingBlock /> : null}

      {detail && project ? (
        <>
          {tab === "tracking" ? (
            <TrackingTab
              detail={detail}
              locale={tag}
              busy={busy}
              onRun={run}
              directoryFallback={capabilities.person?.id ?? null}
            />
          ) : null}
          {tab === "tasks" ? <TasksTab detail={detail} busy={busy} onRun={run} /> : null}
          {tab === "sap" ? <SapTab detail={detail} /> : null}
          {tab === "notify" ? <NotifyTab detail={detail} busy={busy} onRun={run} /> : null}
        </>
      ) : null}

      {tab === "review" ? (
        <section aria-label={t("Revue, documents et 3D")}>
          <p className="t-caption text-muted-foreground">
            {t("Cette section est la console de revue existante, inchangée : elle décide seule de ce que le client voit.")}
          </p>
          <DossierConsole initialDossierId={dossierId} embedded />
        </section>
      ) : null}
    </div>
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
  const [fields, setFields] = useState({
    company: p.company ?? "",
    projectName: p.projectName ?? "",
    countryCode: p.countryCode ?? "",
    currency: p.currency ?? "",
    seriesLaunch: p.seriesLaunch ?? "",
    volumeOverride: p.annualVolumeOverride === null ? "" : String(p.annualVolumeOverride),
    estimate: p.estimatedAnnualRevenue === null ? "" : String(p.estimatedAnnualRevenue),
  });
  const [price, setPrice] = useState(p.unitPrice === null ? "" : String(p.unitPrice));
  const [cost, setCost] = useState(p.unitCost === null ? "" : String(p.unitCost));
  const [costInSap, setCostInSap] = useState(p.costInSap);
  const [local, setLocal] = useState<string | null>(null);
  const [directory, setDirectory] = useState(
    { sales: p.salesPersonId ?? "none", fae: p.faePersonId ?? "none" },
  );
  const [board, setBoard] = useState<{ id: string; name: string; role: string }[]>([]);

  useEffect(() => {
    import("@/lib/leadmagnet/dashboard-adapter").then(async (m) => {
      try {
        const b = await m.fetchCrmBoard();
        setBoard(
          b.directory
            .filter((d) => d.active)
            .map((d) => ({ id: d.id, name: personFullName(d), role: d.role })),
        );
      } catch {
        setBoard([]);
      }
    });
  }, []);

  const canPrice = capabilities?.role === "sales" || capabilities?.role === "admin";
  const canCost = capabilities?.role !== null;

  return (
    <div className="space-y-4">
      <section className="panel-block grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
        <div>
          <p className="t-caption text-muted-foreground">{t("Volume annuel de capteurs")}</p>
          <VolumeCell project={p} />
        </div>
        <div>
          <p className="t-caption text-muted-foreground">{t("Chiffre d'affaires annuel")}</p>
          <RevenueCell project={p} locale={locale} />
        </div>
        <div>
          <p className="t-caption text-muted-foreground">{t("Marge")}</p>
          <MarginCell project={p} locale={locale} />
        </div>
        <div>
          <p className="t-caption text-muted-foreground">{t("Lancement série")}</p>
          {p.seriesLaunch ? <span className="t-metric">{p.seriesLaunch}</span> : <UnknownValue />}
        </div>
        <div>
          <p className="t-caption text-muted-foreground">{t("Avancement")}</p>
          {taskProgress(detail.tasks).percent === null ? (
            <UnknownValue reason={t("aucune tâche")} />
          ) : (
            <span className="t-metric">{taskProgress(detail.tasks).percent} %</span>
          )}
        </div>
        <div>
          <p className="t-caption text-muted-foreground">{t("Dernière version envoyée")}</p>
          <span className="t-metric">{p.currentRevision}</span>
        </div>
      </section>

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
        {local ? <p className="notice-warning t-caption">{local}</p> : null}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label className="t-caption">{t("Société")}</Label>
            <Input
              value={fields.company}
              onChange={(e) => setFields({ ...fields, company: e.target.value })}
            />
          </div>
          <div>
            <Label className="t-caption">{t("Nom du projet")}</Label>
            <Input
              value={fields.projectName}
              onChange={(e) => setFields({ ...fields, projectName: e.target.value })}
            />
          </div>
          <div>
            <Label className="t-caption">{t("Pays (code à deux lettres)")}</Label>
            <Input
              value={fields.countryCode}
              maxLength={2}
              onChange={(e) => setFields({ ...fields, countryCode: e.target.value })}
            />
          </div>
          <div>
            <Label className="t-caption">{t("Devise (code à trois lettres)")}</Label>
            <Input
              value={fields.currency}
              maxLength={3}
              onChange={(e) => setFields({ ...fields, currency: e.target.value })}
            />
          </div>
          <div>
            <Label className="t-caption">{t("Lancement série")}</Label>
            <Input
              type="date"
              value={fields.seriesLaunch}
              onChange={(e) => setFields({ ...fields, seriesLaunch: e.target.value })}
            />
          </div>
          <div>
            <Label className="t-caption">{t("Volume annuel corrigé (capteurs)")}</Label>
            <Input
              inputMode="numeric"
              value={fields.volumeOverride}
              onChange={(e) => setFields({ ...fields, volumeOverride: e.target.value })}
            />
            <p className="t-caption text-muted-foreground">
              {t("Vide : le volume de la dernière version envoyée est utilisé.")}
            </p>
          </div>
          <div>
            <Label className="t-caption">{t("Estimation de chiffre d'affaires annuel")}</Label>
            <Input
              inputMode="decimal"
              value={fields.estimate}
              onChange={(e) => setFields({ ...fields, estimate: e.target.value })}
            />
            <p className="t-caption text-muted-foreground">
              {t("Utilisée tant que volume et prix ne permettent pas le calcul ; elle n'est jamais effacée.")}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            const volume = parseVolumeInput(fields.volumeOverride);
            const estimate = parseAmountInput(fields.estimate);
            if (!volume.ok) return setLocal(t("Volume annuel : entier positif attendu."));
            if (!estimate.ok) return setLocal(t("Estimation : montant positif attendu."));
            if (fields.countryCode.trim() && !isCountryCode(fields.countryCode))
              return setLocal(t("Pays : code à deux lettres attendu."));
            if (fields.currency.trim() && !isCurrencyCode(fields.currency))
              return setLocal(t("Devise : code à trois lettres attendu."));
            setLocal(null);
            void onRun(
              () =>
                setCrmFields(
                  p.dossierId,
                  {
                    company: fields.company.trim() || null,
                    project_name: fields.projectName.trim() || null,
                    country_code: fields.countryCode.trim().toUpperCase() || null,
                    currency: fields.currency.trim().toUpperCase() || null,
                    series_launch: fields.seriesLaunch || null,
                    annual_volume_override: volume.value,
                    estimated_annual_revenue: estimate.value,
                  },
                  p.version,
                ),
              t("Fiche enregistrée."),
            );
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
                      fields.currency.trim().toUpperCase() || p.currency,
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
        <Button
          size="sm"
          disabled={busy}
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
                <Label className="t-caption" htmlFor={`na-${task.id}`}>
                  {t("Motif si « sans objet »")}
                </Label>
                <Input
                  id={`na-${task.id}`}
                  value={naReason[task.id] ?? ""}
                  onChange={(e) => setNaReason((m) => ({ ...m, [task.id]: e.target.value }))}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>

      <section className="panel-block grid gap-2 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Label className="t-caption">{t("Nouvelle tâche")}</Label>
          <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
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
              const next = await upsertCrmTask(p.dossierId, {
                stage: draft.stage,
                label: draft.label.trim(),
                stakeholder: draft.stakeholder,
                status: "todo",
                dueOn: draft.dueOn || null,
              });
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
          <Button
            size="sm"
            variant="outline"
            onClick={() => void navigator.clipboard?.writeText(text)}
          >
            {t("Copier")}
          </Button>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------- Information du client */

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
      </div>
      <div>
        <Label className="t-caption">{t("Message (contenu client uniquement)")}</Label>
        <Textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} />
        <p className="t-caption text-muted-foreground">
          {t("N'écrivez ici que ce que le client peut lire : ni prix interne, ni coût, ni note interne.")}
        </p>
      </div>

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
                  {t("lien :")} {n.linkPath}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
