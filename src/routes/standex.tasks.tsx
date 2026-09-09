import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  STAKEHOLDER_LABEL,
  TASK_STATUS_LABEL,
  personName,
  stageLabel,
} from "@/components/standex/dashboard/crm-shared";
import {
  fetchCrmBoard,
  fetchCrmProject,
  type CrmBoard,
} from "@/lib/leadmagnet/dashboard-adapter";
import {
  TASK_STATUSES,
  taskOverdueDays,
  type CrmTask,
  type TaskStakeholder,
  type TaskStatus,
} from "@/lib/leadmagnet/crm";

export const Route = createFileRoute("/standex/tasks")({
  component: TasksScreen,
});

/** Nombre de fiches lues d'un coup : au-delà, l'écran le dit au lieu de laisser
 *  croire que la liste est complète. */
const MAX_PROJECTS = 25;

interface Row {
  task: CrmTask;
  dossierId: string;
  projectLabel: string;
}

function TasksScreen() {
  const { capabilities } = useCrm();
  const [board, setBoard] = useState<CrmBoard | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<TaskStatus | "open">("open");
  const [stakeholder, setStakeholder] = useState<TaskStakeholder | "all">("all");
  const [mine, setMine] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const b = await fetchCrmBoard();
      setBoard(b);
      const slice = b.projects.slice(0, MAX_PROJECTS);
      setTruncated(b.projects.length > slice.length);
      const details = await Promise.all(
        slice.map(async (p) => {
          try {
            const detail = await fetchCrmProject(p.dossierId);
            return detail.tasks.map((task) => ({
              task,
              dossierId: p.dossierId,
              projectLabel: p.company ?? p.title,
            }));
          } catch {
            // Un dossier refusé ne fait pas tomber la liste entière.
            return [] as Row[];
          }
        }),
      );
      setRows(details.flat());
    } catch (e: unknown) {
      setRows(null);
      setError(e instanceof Error ? e.message : t("Lecture refusée."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (capabilities?.available) void load();
  }, [capabilities?.available, load]);

  const visible = useMemo(() => {
    const personId = capabilities?.person?.id ?? null;
    return (rows ?? []).filter((r) => {
      if (status === "open") {
        if (r.task.status === "done" || r.task.status === "not_applicable") return false;
      } else if (r.task.status !== status) return false;
      if (stakeholder !== "all" && r.task.stakeholder !== stakeholder) return false;
      if (mine && (!personId || r.task.personId !== personId)) return false;
      return true;
    });
  }, [rows, status, stakeholder, mine, capabilities?.person?.id]);

  if (capabilities === null) return <LoadingBlock />;
  if (!capabilities.available)
    return (
      <p className="notice-warning text-sm">
        {t("Le suivi des tâches n'est pas installé sur ce serveur :")} {t(capabilities.detail)}
      </p>
    );

  return (
    <div className="space-y-4">
      <h2 className="t-title-m">{t("Tâches")}</h2>
      <section className="panel-block grid gap-3 sm:grid-cols-3">
        <div>
          <Label className="t-caption">{t("État")}</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus | "open")}>
            <SelectTrigger className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">{t("À traiter")}</SelectItem>
              {TASK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(TASK_STATUS_LABEL[s])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="t-caption">{t("Rôle concerné")}</Label>
          <Select
            value={stakeholder}
            onValueChange={(v) => setStakeholder(v as TaskStakeholder | "all")}
          >
            <SelectTrigger className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("Tous")}</SelectItem>
              {(["sales", "fae", "client"] as const).map((s) => (
                <SelectItem key={s} value={s}>
                  {t(STAKEHOLDER_LABEL[s] ?? s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={mine}
            onChange={(e) => setMine(e.target.checked)}
            disabled={!capabilities.person}
          />
          {capabilities.person
            ? t("Seulement les tâches qui me sont attribuées")
            : t("Votre compte n'est rattaché à aucune personne de l'annuaire.")}
        </label>
      </section>

      {error ? <ErrorBlock text={error} onRetry={() => void load()} /> : null}
      {loading && rows === null ? <LoadingBlock /> : null}
      {truncated ? (
        <p className="notice-info t-caption">
          {t("Seuls les 25 projets les plus récents sont lus ici : ouvrez une fiche projet pour voir toutes ses tâches.")}
        </p>
      ) : null}

      {rows !== null && visible.length === 0 && !loading ? (
        <EmptyBlock text={t("Aucune tâche ne correspond à ce filtre.")} />
      ) : null}

      <ul className="space-y-2">
        {visible.map((row) => {
          const late = taskOverdueDays(row.task);
          return (
            <li key={row.task.id} className="panel-block flex flex-wrap items-center gap-2 text-sm">
              <Link
                to="/standex/projects/$dossierId"
                params={{ dossierId: row.dossierId }}
                className="min-h-11 font-medium underline-offset-2 hover:underline"
              >
                {row.projectLabel}
              </Link>
              <span>{row.task.label}</span>
              <Badge variant="outline">{stageLabel(row.task.stage)}</Badge>
              <Badge variant="secondary">{t(TASK_STATUS_LABEL[row.task.status])}</Badge>
              <span className="t-caption text-muted-foreground">
                {t(STAKEHOLDER_LABEL[row.task.stakeholder] ?? row.task.stakeholder)} —{" "}
                {personName(board?.directory ?? [], row.task.personId)}
              </span>
              {row.task.dueOn ? (
                <span className="t-caption t-metric">
                  {t("échéance")} {row.task.dueOn}
                </span>
              ) : (
                <span className="t-caption text-muted-foreground">{t("sans échéance")}</span>
              )}
              {late !== null ? (
                <span className="t-caption text-destructive">
                  {late} {t("jour(s) de retard")}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      <Button size="sm" variant="ghost" onClick={() => void load()}>
        {t("Actualiser")}
      </Button>
    </div>
  );
}
