import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/react";
import { localeTag } from "@/lib/i18n/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCrm } from "@/components/standex/dashboard/crm-context";
import {
  ALL_STAGES,
  CountryCell,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  MarginCell,
  RevenueCell,
  StageBadge,
  UnknownValue,
  VolumeCell,
  countryName,
  personName,
  stageLabel,
  CrmUnavailableNotice,
} from "@/components/standex/dashboard/crm-shared";
import { fetchCrmBoard, type CrmBoard } from "@/lib/leadmagnet/dashboard-adapter";
import {
  stageAgeDays,
  filterProjects,
  groupByStage,
  pipelineTotals,
  sortProjects,
  formatAmount,
  personFullName,
  type BoardSort,
  type CrmStage,
} from "@/lib/leadmagnet/crm";

export const Route = createFileRoute("/standex/")({
  component: ProjectsBoard,
});

/* i18n-canonical : libellés canoniques traduits par t() au rendu. */
const SORTS: { id: BoardSort; label: string }[] = [
  { id: "updated_desc", label: "Activité la plus récente" },
  { id: "updated_asc", label: "Sans activité depuis longtemps" },
  { id: "revenue_desc", label: "Chiffre d'affaires estimé" },
  { id: "stage_age_desc", label: "Ancienneté dans l'étape" },
  { id: "company_asc", label: "Société (A→Z)" },
];

function ProjectsBoard() {
  const { capabilities, legacyRole, sessionGeneration } = useCrm();
  const locale = useLocale();
  const tag = localeTag(locale);
  const [board, setBoard] = useState<CrmBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [display, setDisplay] = useState<"table" | "pipeline">("table");
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<CrmStage | "all">("all");
  const [salesId, setSalesId] = useState<string>("all");
  const [faeId, setFaeId] = useState<string>("all");
  const [country, setCountry] = useState("all");
  const [company, setCompany] = useState("");
  const [revenueMin, setRevenueMin] = useState("");
  const [revenueMax, setRevenueMax] = useState("");
  const [revenueCurrency, setRevenueCurrency] = useState("");
  const [launchFrom, setLaunchFrom] = useState("");
  const [launchTo, setLaunchTo] = useState("");
  const [onlyLate, setOnlyLate] = useState(false);
  const [sort, setSort] = useState<BoardSort>("updated_desc");

  /** Numéro de session : une lecture lancée pour le compte précédent ne doit
   *  jamais peupler l'écran après un changement de connexion. */
  const sessionRef = useRef(sessionGeneration);
  useEffect(() => {
    sessionRef.current = sessionGeneration;
    setBoard(null);
    setError(null);
  }, [sessionGeneration]);

  const load = useCallback(() => {
    const gen = sessionRef.current;
    setLoading(true);
    setError(null);
    fetchCrmBoard()
      .then((b) => {
        if (sessionRef.current !== gen) return;
        setBoard(b);
      })
      .catch((e: unknown) => {
        if (sessionRef.current !== gen) return;
        setBoard(null);
        setError(e instanceof Error ? e.message : t("Lecture refusée."));
      })
      .finally(() => {
        if (sessionRef.current === gen) setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (capabilities?.available) load();
  }, [capabilities?.available, sessionGeneration, load]);

  /** Pays réellement présents dans les projets : la liste n'invente rien. */
  const countries = useMemo(() => {
    const codes = new Set<string>();
    for (const p of board?.projects ?? []) {
      const c = (p.countryCode ?? "").trim().toUpperCase();
      if (c) codes.add(c);
    }
    return [...codes].sort((a, b) =>
      (countryName(a, tag) ?? a).localeCompare(countryName(b, tag) ?? b));
  }, [board, tag]);

  const projects = useMemo(() => {
    if (!board) return [];
    const bound = (v: string) => {
      const n = Number(v.replace(",", "."));
      return v.trim() !== "" && Number.isFinite(n) ? n : null;
    };
    const filtered = filterProjects(board.projects, {
      search,
      ...(stage === "all" ? {} : { stages: [stage] }),
      salesPersonId: salesId === "all" ? null : salesId,
      faePersonId: faeId === "all" ? null : faeId,
      countryCode: country === "all" ? null : country,
      company: company.trim() ? company.trim() : null,
      revenueMin: bound(revenueMin),
      revenueMax: bound(revenueMax),
      revenueCurrency: revenueCurrency.trim() ? revenueCurrency.trim() : null,
      seriesLaunchFrom: launchFrom || null,
      seriesLaunchTo: launchTo || null,
      onlyLate,
    });
    return sortProjects(filtered, sort);
  }, [board, search, stage, salesId, faeId, country, company, revenueMin, revenueMax,
    revenueCurrency, launchFrom, launchTo, onlyLate, sort]);

  const totals = useMemo(() => pipelineTotals(projects), [projects]);

  if (capabilities === null) return <LoadingBlock />;

  if (!capabilities.available)
    return (
      <div className="space-y-3">
        <h2 className="t-title-m">{t("Projets")}</h2>
        <CrmUnavailableNotice
          plain={t("Le suivi des projets n'est pas encore activé sur ce serveur.")}
          detail={capabilities.detail}
          isAdmin={legacyRole === "admin"}
        >
          {t("La console des dossiers reste utilisable.")}
        </CrmUnavailableNotice>
        <Link
          to="/standex/console"
          className="inline-flex min-h-11 items-center rounded-[var(--r-sm)] bg-[var(--surface-tint)] px-3 text-sm"
        >
          {t("Ouvrir la console dossiers")}
        </Link>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="t-title-m">{t("Projets")}</h2>
        <div role="group" aria-label={t("Affichage")} className="ml-auto flex gap-1">
          <Button
            size="sm"
            variant={display === "table" ? "default" : "outline"}
            aria-pressed={display === "table"}
            onClick={() => setDisplay("table")}
          >
            {t("Tableau")}
          </Button>
          <Button
            size="sm"
            variant={display === "pipeline" ? "default" : "outline"}
            aria-pressed={display === "pipeline"}
            onClick={() => setDisplay("pipeline")}
          >
            {t("Pipeline")}
          </Button>
        </div>
      </div>

      <section className="panel-block grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label className="t-caption" htmlFor="crm-search">
            {t("Rechercher (société, projet, pays)")}
          </Label>
          <Input
            id="crm-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Nom saisi dans le projet")}
          />
        </div>
        <div>
          <Label className="t-caption">{t("Étape")}</Label>
          <Select value={stage} onValueChange={(v) => setStage(v as CrmStage | "all")}>
            <SelectTrigger className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("Toutes les étapes")}</SelectItem>
              {ALL_STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {stageLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="t-caption">{t("Pays")}</Label>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("Tous les pays")}</SelectItem>
              {countries.map((c) => (
                <SelectItem key={c} value={c}>
                  {countryName(c, tag) ?? c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="t-caption" htmlFor="crm-company">{t("Société")}</Label>
          <Input
            id="crm-company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder={t("Nom de société")}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="t-caption" htmlFor="crm-rev-min">{t("CA min.")}</Label>
            <Input
              id="crm-rev-min"
              inputMode="decimal"
              value={revenueMin}
              onChange={(e) => setRevenueMin(e.target.value)}
            />
          </div>
          <div>
            <Label className="t-caption" htmlFor="crm-rev-max">{t("CA max.")}</Label>
            <Input
              id="crm-rev-max"
              inputMode="decimal"
              value={revenueMax}
              onChange={(e) => setRevenueMax(e.target.value)}
            />
          </div>
          <div>
            <Label className="t-caption" htmlFor="crm-rev-cur">{t("Devise")}</Label>
            <Input
              id="crm-rev-cur"
              value={revenueCurrency}
              onChange={(e) => setRevenueCurrency(e.target.value.toUpperCase())}
              maxLength={3}
              placeholder="EUR"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="t-caption" htmlFor="crm-launch-from">
              {t("Lancement série du")}
            </Label>
            <Input
              id="crm-launch-from"
              type="date"
              value={launchFrom}
              onChange={(e) => setLaunchFrom(e.target.value)}
            />
          </div>
          <div>
            <Label className="t-caption" htmlFor="crm-launch-to">
              {t("Lancement série au")}
            </Label>
            <Input
              id="crm-launch-to"
              type="date"
              value={launchTo}
              onChange={(e) => setLaunchTo(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label className="t-caption">{t("Commercial")}</Label>
          <Select value={salesId} onValueChange={setSalesId}>
            <SelectTrigger className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("Tous")}</SelectItem>
              {(board?.directory ?? [])
                .filter((p) => p.role === "sales")
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {personFullName(p)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="t-caption">{t("FAE")}</Label>
          <Select value={faeId} onValueChange={setFaeId}>
            <SelectTrigger className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("Tous")}</SelectItem>
              {(board?.directory ?? [])
                .filter((p) => p.role === "fae")
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {personFullName(p)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="t-caption">{t("Trier par")}</Label>
          <Select value={sort} onValueChange={(v) => setSort(v as BoardSort)}>
            <SelectTrigger className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {t(s.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={onlyLate}
            onChange={(e) => setOnlyLate(e.target.checked)}
          />
          {t("Seulement les projets en retard ou bloqués")}
        </label>
        <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-2 t-caption text-muted-foreground">
          <span>
            {projects.length} {t("projet(s) affiché(s)")}
          </span>
          {totals.byCurrency.map((c) => (
            <Badge key={c.currency} variant="outline">
              {formatAmount(c.amount, c.currency, tag)} — {c.projects} {t("projet(s)")}
            </Badge>
          ))}
          {totals.unknownAmount > 0 ? (
            <span>
              {totals.unknownAmount} {t("sans chiffre d'affaires estimable")}
            </span>
          ) : null}
          {totals.unknownCurrency > 0 ? (
            <span>
              {totals.unknownCurrency} {t("sans devise renseignée")}
            </span>
          ) : null}
          {revenueMin || revenueMax ? (
            <span>{t("Les projets sans chiffre d'affaires estimable sont exclus par ce filtre.")}</span>
          ) : null}
          {launchFrom || launchTo ? (
            <span>{t("Les projets sans date de lancement série sont exclus par ce filtre.")}</span>
          ) : null}
          <Button size="sm" variant="ghost" onClick={load}>
            {t("Actualiser")}
          </Button>
        </div>
      </section>

      {error ? <ErrorBlock text={error} onRetry={load} /> : null}
      {loading && !board ? <LoadingBlock /> : null}

      {board && projects.length === 0 && !loading ? (
        <EmptyBlock text={t("Aucun projet ne correspond à cette recherche.")} />
      ) : null}

      {board && projects.length > 0 && display === "table" ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <caption className="sr-only">{t("Projets suivis")}</caption>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="p-2">{t("Société / projet")}</th>
                <th scope="col" className="p-2">{t("Étape")}</th>
                <th scope="col" className="p-2">{t("Pays")}</th>
                <th scope="col" className="p-2">{t("Commercial")}</th>
                <th scope="col" className="p-2">{t("FAE")}</th>
                <th scope="col" className="p-2">{t("Volume annuel")}</th>
                <th scope="col" className="p-2">{t("Chiffre d'affaires")}</th>
                <th scope="col" className="p-2">{t("Marge")}</th>
                <th scope="col" className="p-2">{t("Avancement")}</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.dossierId} className="align-top">
                  <td className="p-2">
                    <Link
                      to="/standex/projects/$dossierId"
                      params={{ dossierId: p.dossierId }}
                      className="inline-flex min-h-11 items-center font-medium underline-offset-2 hover:underline"
                    >
                      {p.companyEffective ?? p.title}
                    </Link>
                    <p className="t-caption text-muted-foreground">
                      {p.projectName ?? p.title} — {t("version")} {p.currentRevision}
                    </p>
                    {p.filed ? null : (
                      <p className="t-caption text-muted-foreground">
                        {t("Aucun suivi interne renseigné pour l'instant.")}
                      </p>
                    )}
                  </td>
                  <td className="p-2">
                    <StageBadge stage={p.stage} />
                    <p className="t-caption text-muted-foreground">
                      {stageAgeDays(p) === null
                        ? t("depuis une date inconnue")
                        : `${stageAgeDays(p)} ${t("jour(s)")}`}
                    </p>
                  </td>
                  <td className="p-2"><CountryCell code={p.countryCode} locale={tag} /></td>
                  <td className="p-2">{personName(board.directory, p.salesPersonId)}</td>
                  <td className="p-2">{personName(board.directory, p.faePersonId)}</td>
                  <td className="p-2"><VolumeCell project={p} /></td>
                  <td className="p-2"><RevenueCell project={p} locale={tag} /></td>
                  <td className="p-2"><MarginCell project={p} locale={tag} /></td>
                  <td className="p-2">
                    {p.tasksTotal === 0 ? (
                      <UnknownValue reason={t("aucune tâche")} />
                    ) : (
                      <span className="t-metric">
                        {p.tasksDone}/{p.tasksTotal}
                      </span>
                    )}
                    {p.tasksBlocked > 0 ? (
                      <p className="t-caption text-destructive">
                        {p.tasksBlocked} {t("bloquée(s)")}
                      </p>
                    ) : null}
                    {p.tasksOverdue > 0 ? (
                      <p className="t-caption text-destructive">
                        {p.tasksOverdue} {t("en retard")}
                      </p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {board && projects.length > 0 && display === "pipeline" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {groupByStage(projects).map((column) => (
            <section key={column.stage} className="panel-block space-y-2">
              <h3 className="t-title-s">
                {stageLabel(column.stage)}{" "}
                <span className="t-caption text-muted-foreground">({column.projects.length})</span>
              </h3>
              {column.projects.length === 0 ? (
                <p className="t-caption text-muted-foreground">{t("Aucun projet.")}</p>
              ) : (
                column.projects.map((p) => (
                  <Link
                    key={p.dossierId}
                    to="/standex/projects/$dossierId"
                    params={{ dossierId: p.dossierId }}
                    className="block min-h-11 rounded-[var(--r-sm)] bg-[var(--surface-sunken)] p-3 shadow-[var(--e-inset)]"
                  >
                    <span className="block font-medium">{p.companyEffective ?? p.title}</span>
                    <span className="block t-caption text-muted-foreground">
                      {p.projectName ?? t("projet sans nom")}
                    </span>
                    <span className="block t-caption text-muted-foreground">
                      {t("Commercial")} : {personName(board.directory, p.salesPersonId)} — {t("FAE")}{" "}
                      : {personName(board.directory, p.faePersonId)}
                    </span>
                    <span className="block t-caption">
                      <CountryCell code={p.countryCode} locale={tag} />
                    </span>
                    <span className="block t-caption">
                      <RevenueCell project={p} locale={tag} />
                    </span>
                  </Link>
                ))
              )}
            </section>
          ))}
        </div>
      ) : null}

    </div>
  );
}
