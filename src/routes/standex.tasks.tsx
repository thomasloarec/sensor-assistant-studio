import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { t } from "@/lib/i18n/core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  TaskRow,
  personName,
  sortByUrgency,
  stageLabel,
  CrmUnavailableNotice,
} from "@/components/standex/dashboard/crm-shared";
import {
  fetchCrmBoard,
  fetchCrmProject,
  type CrmBoard,
} from "@/lib/leadmagnet/dashboard-adapter";
import {
  TASK_STATUSES,
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
  const { capabilities, legacyRole, sessionGeneration } = useCrm();
  const [board, setBoard] = useState<CrmBoard | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<TaskStatus | "open">("open");
  const [stakeholder, setStakeholder] = useState<TaskStakeholder | "all">("all");
  const [mine, setMine] = useState(false);

  /** Numéro de session : une lecture lancée pour le compte précédent ne doit
   *  jamais peupler l'écran après un changement de connexion. */
  const sessionRef = useRef(sessionGeneration);
  useEffect(() => {
    sessionRef.current = sessionGeneration;
    setBoard(null);
    setRows(null);
    setError(null);
  }, [sessionGeneration]);

  const load = useCallback(async () => {
    const gen = sessionRef.current;
    setLoading(true);
    setError(null);
    try {
      const b = await fetchCrmBoard();
      if (sessionRef.current !== gen) return;
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
      if (sessionRef.current !== gen) return;
      setRows(details.flat());
    } catch (e: unknown) {
      if (sessionRef.current !== gen) return;
      setRows(null);
      setError(e instanceof Error ? e.message : t("Lecture refusée."));
    } finally {
      if (sessionRef.current === gen) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (capabilities?.available) void load();
  }, [capabilities?.available, sessionGeneration, load]);

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

  /** Regroupement par projet, ordre d'urgence à l'intérieur de chaque groupe :
   *  le premier groupe est celui qui porte la tâche la plus urgente. */
  const groups = useMemo(() => {
    const byProject = new Map<string, Row[]>();
    for (const row of sortByUrgency(visible, (r) => r.task)) {
      const list = byProject.get(row.dossierId);
      if (list) list.push(row);
      else byProject.set(row.dossierId, [row]);
    }
    return [...byProject.entries()].map(([dossierId, list]) => ({
      dossierId,
      label: list[0]!.projectLabel,
      rows: list,
    }));
  }, [visible]);

  /* Pastilles des filtres actifs : ce qui filtre la liste se voit et se retire
     d'un geste, exactement comme sur l'écran Projets. */
  const chips: { key: string; text: string; clear: () => void }[] = [];
  if (status !== "open")
    chips.push({
      key: "status",
      text: `${t("État")} : ${t(TASK_STATUS_LABEL[status])}`,
      clear: () => setStatus("open"),
    });
  if (stakeholder !== "all")
    chips.push({
      key: "stakeholder",
      text: `${t("Rôle concerné")} : ${t(STAKEHOLDER_LABEL[stakeholder] ?? stakeholder)}`,
      clear: () => setStakeholder("all"),
    });
  if (mine)
    chips.push({
      key: "mine",
      text: t("Seulement les tâches qui me sont attribuées"),
      clear: () => setMine(false),
    });

  if (capabilities === null) return <LoadingBlock />;
  if (!capabilities.available)
    return (
      <CrmUnavailableNotice
        plain={t("Le suivi des tâches n'est pas encore activé sur ce serveur.")}
        detail={capabilities.detail}
        isAdmin={legacyRole === "admin"}
      />
    );

  return (
    <div className="space-y-4">
      <h2 className="t-title-m">{t("Tâches")}</h2>

      <section className="workbar" aria-label={t("Barre de travail")}>
        <Label className="sr-only" htmlFor="task-status">
          {t("État")}
        </Label>
        <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus | "open")}>
          <SelectTrigger id="task-status" className="min-h-11 w-auto min-w-[11rem]">
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

        <Label className="sr-only" htmlFor="task-stakeholder">
          {t("Rôle concerné")}
        </Label>
        <Select
          value={stakeholder}
          onValueChange={(v) => setStakeholder(v as TaskStakeholder | "all")}
        >
          <SelectTrigger id="task-stakeholder" className="min-h-11 w-auto min-w-[11rem]">
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

        <Button
          variant={mine ? "default" : "outline"}
          aria-pressed={mine}
          disabled={!capabilities.person}
          title={t("Seulement les tâches qui me sont attribuées")}
          onClick={() => setMine((v) => !v)}
        >
          {t("Mes tâches")}
          <span className="sr-only"> — {t("Seulement les tâches qui me sont attribuées")}</span>
        </Button>

        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void load()}>
          {t("Actualiser")}
        </Button>
      </section>

      {capabilities.person ? null : (
        <p className="t-caption text-muted-foreground">
          {t("Votre compte n'est rattaché à aucune personne de l'annuaire.")}
        </p>
      )}

      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span key={chip.key} className="chip">
              {chip.text}
              <button type="button" onClick={chip.clear} aria-label={`${t("Retirer")} : ${chip.text}`}>
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <p className="t-caption text-muted-foreground">{t("Triées par urgence.")}</p>

      {error ? <ErrorBlock text={error} onRetry={() => void load()} /> : null}
      {loading && rows === null ? <LoadingBlock rows={6} /> : null}
      {truncated ? (
        <p className="notice-info t-caption">
          {t("Seuls les 25 projets les plus récents sont lus ici : ouvrez une fiche projet pour voir toutes ses tâches.")}
        </p>
      ) : null}

      {rows !== null && visible.length === 0 && !loading ? (
        <EmptyBlock
          title={t("Aucune tâche")}
          text={t("Aucune tâche ne correspond à ce filtre.")}
        />
      ) : null}

      {groups.map((group) => (
        <section key={group.dossierId} className="space-y-2">
          <h3 className="flex flex-wrap items-center gap-2">
            <Link
              to="/standex/projects/$dossierId"
              params={{ dossierId: group.dossierId }}
              className="t-title-s inline-flex min-h-11 items-center underline-offset-2 hover:underline"
            >
              {group.label}
            </Link>
            <span className="t-caption text-muted-foreground">({group.rows.length})</span>
          </h3>
          <ul className="space-y-2">
            {group.rows.map((row) => (
              <TaskRow
                key={row.task.id}
                task={row.task}
                person={personName(board?.directory ?? [], row.task.personId)}
                extra={
                  <p>
                    <Badge variant="outline">{stageLabel(row.task.stage)}</Badge>
                  </p>
                }
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
