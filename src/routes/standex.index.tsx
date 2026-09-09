import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { msg, t } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/react";
import { localeTag } from "@/lib/i18n/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCrm } from "@/components/standex/dashboard/crm-context";
import { AvatarInitials } from "@/components/standex/dashboard/avatar-initials";
import {
  ALL_STAGES,
  CountryCell,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  MarginCell,
  RevenueCell,
  StageGauge,
  StagePill,
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
  type CrmProject,
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
  /* Plusieurs étapes peuvent être suivies en même temps : une liste vide veut
     dire « toutes », jamais « aucune ». */
  const [stages, setStages] = useState<CrmStage[]>([]);
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
      ...(stages.length === 0 ? {} : { stages }),
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
  }, [board, search, stages, salesId, faeId, country, company, revenueMin, revenueMax,
    revenueCurrency, launchFrom, launchTo, onlyLate, sort]);

  const totals = useMemo(() => pipelineTotals(projects), [projects]);

  /** Remise à zéro des filtres. La recherche, le tri et l'affichage choisis ne
   *  sont pas des filtres : ils sont conservés. */
  const resetFilters = useCallback(() => {
    setStages([]);
    setSalesId("all");
    setFaeId("all");
    setCountry("all");
    setCompany("");
    setRevenueMin("");
    setRevenueMax("");
    setRevenueCurrency("");
    setLaunchFrom("");
    setLaunchTo("");
    setOnlyLate(false);
  }, []);

  /** Chaque filtre actif est lisible et retirable là où il se lit. */
  const chips = useMemo(() => {
    const list: { id: string; label: string; clear: () => void }[] = [];
    for (const s of stages)
      list.push({
        id: `stage:${s}`,
        label: stageLabel(s),
        clear: () => setStages((current) => current.filter((x) => x !== s)),
      });
    const person = (id: string) => {
      const found = (board?.directory ?? []).find((p) => p.id === id);
      return found ? personFullName(found) : id;
    };
    if (salesId !== "all")
      list.push({
        id: "sales",
        label: `${t("Commercial")} : ${person(salesId)}`,
        clear: () => setSalesId("all"),
      });
    if (faeId !== "all")
      list.push({
        id: "fae",
        label: `${t("FAE")} : ${person(faeId)}`,
        clear: () => setFaeId("all"),
      });
    if (country !== "all")
      list.push({
        id: "country",
        label: `${t("Pays")} : ${countryName(country, tag) ?? country}`,
        clear: () => setCountry("all"),
      });
    if (company.trim())
      list.push({
        id: "company",
        label: `${t("Société")} : ${company.trim()}`,
        clear: () => setCompany(""),
      });
    if (revenueMin.trim() || revenueMax.trim() || revenueCurrency.trim())
      list.push({
        id: "revenue",
        label: `${t("Chiffre d'affaires")} : ${revenueMin.trim() || "…"} – ${
          revenueMax.trim() || "…"
        } ${revenueCurrency.trim()}`.trim(),
        clear: () => {
          setRevenueMin("");
          setRevenueMax("");
          setRevenueCurrency("");
        },
      });
    if (launchFrom || launchTo)
      list.push({
        id: "launch",
        label: `${t("Lancement série")} : ${launchFrom || "…"} – ${launchTo || "…"}`,
        clear: () => {
          setLaunchFrom("");
          setLaunchTo("");
        },
      });
    if (onlyLate)
      list.push({
        id: "late",
        label: t("Seulement les projets en retard ou bloqués"),
        clear: () => setOnlyLate(false),
      });
    return list;
  }, [stages, salesId, faeId, country, company, revenueMin, revenueMax, revenueCurrency,
    launchFrom, launchTo, onlyLate, board, tag]);

  const activeFilterCount = chips.length;
  /* Deux déclencheurs distincts : l'étape se filtre là où on la lit, le reste
     vit dans le tiroir. Le compte de chacun ne mélange pas les deux. */
  const stageFilterCount = stages.length;
  const otherFilterCount = activeFilterCount - stageFilterCount - (onlyLate ? 1 : 0);

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
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="t-title-m">{t("Projets")}</h2>
        <p className="t-caption text-muted-foreground">
          {projects.length} {t("projet(s) affiché(s)")}
        </p>
      </div>

      {/* Barre de travail : une seule ligne collante. Les commandes rares
          vivent dans le tiroir de filtres, le résultat reste au-dessus du pli. */}
      {/* `relative` est volontairement absent : l'utilitaire écraserait le
          `position: sticky` du socle et la barre repasserait sous l'en-tête. */}
      <section className="workbar" aria-label={t("Barre de travail")}>

        {loading ? (
          <span className="workbar-progress" aria-hidden="true" />
        ) : null}
        <Label className="sr-only" htmlFor="crm-search">
          {t("Rechercher (société, projet, pays)")}
        </Label>
        <Input
          id="crm-search"
          className="min-w-[12rem] flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Rechercher (société, projet, pays)")}
        />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              {t("Étape")}
              {stageFilterCount > 0 ? (
                <span className="filter-count">{stageFilterCount}</span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[20rem]">
            <fieldset className="space-y-2">
              <legend className="t-label">{t("Filtrer par étape")}</legend>
              <div className="grid grid-cols-2 gap-1">
                {ALL_STAGES.map((s) => (
                  <label key={s} className="flex min-h-11 items-center gap-2 text-base">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={stages.includes(s)}
                      onChange={(e) =>
                        setStages((current) =>
                          e.target.checked ? [...current, s] : current.filter((x) => x !== s),
                        )
                      }
                    />
                    {stageLabel(s)}
                  </label>
                ))}
              </div>
              <Button
                variant="outline"
                onClick={() => setStages([])}
                disabled={stageFilterCount === 0}
              >
                {t("Tout effacer")}
              </Button>
            </fieldset>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              {t("Filtres")}
              {otherFilterCount > 0 ? (
                <span className="filter-count">{otherFilterCount}</span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-[70vh] w-[22rem] overflow-y-auto">
            <div className="space-y-4">


              <div className="field-row">
                <div className="field">
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
                <div className="field">
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
              </div>

              <div className="field-row">
                <div className="field">
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
                <div className="field">
                  <Label className="t-caption" htmlFor="crm-company">
                    {t("Société")}
                  </Label>
                  <Input
                    id="crm-company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder={t("Nom de société")}
                  />
                </div>
              </div>

              <div className="field-row">
                <div className="field">
                  <Label className="t-caption" htmlFor="crm-rev-min">
                    {t("CA min.")}
                  </Label>
                  <Input
                    id="crm-rev-min"
                    inputMode="decimal"
                    value={revenueMin}
                    onChange={(e) => setRevenueMin(e.target.value)}
                  />
                </div>
                <div className="field">
                  <Label className="t-caption" htmlFor="crm-rev-max">
                    {t("CA max.")}
                  </Label>
                  <Input
                    id="crm-rev-max"
                    inputMode="decimal"
                    value={revenueMax}
                    onChange={(e) => setRevenueMax(e.target.value)}
                  />
                </div>
                <div className="field">
                  <Label className="t-caption" htmlFor="crm-rev-cur">
                    {t("Devise")}
                  </Label>
                  <Input
                    id="crm-rev-cur"
                    value={revenueCurrency}
                    onChange={(e) => setRevenueCurrency(e.target.value.toUpperCase())}
                    maxLength={3}
                    placeholder="EUR"
                  />
                </div>
              </div>

              <div className="field-row">
                <div className="field">
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
                <div className="field">
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


              {revenueMin || revenueMax ? (
                <p className="t-caption text-muted-foreground">
                  {t("Les projets sans chiffre d'affaires estimable sont exclus par ce filtre.")}
                </p>
              ) : null}
              {launchFrom || launchTo ? (
                <p className="t-caption text-muted-foreground">
                  {t("Les projets sans date de lancement série sont exclus par ce filtre.")}
                </p>
              ) : null}

              <Button variant="outline" onClick={resetFilters} disabled={activeFilterCount === 0}>
                {t("Tout effacer")}
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Filtre d'alerte : il se voit et se bascule sans ouvrir de tiroir. */}
        <Button
          variant={onlyLate ? "default" : "outline"}
          aria-pressed={onlyLate}
          title={t("Seulement les projets en retard ou bloqués")}
          onClick={() => setOnlyLate((v) => !v)}
        >
          {t("En retard")}
          <span className="sr-only"> — {t("Seulement les projets en retard ou bloqués")}</span>
        </Button>

        <Label className="sr-only" htmlFor="crm-sort">
          {t("Trier par")}
        </Label>
        <Select value={sort} onValueChange={(v) => setSort(v as BoardSort)}>
          <SelectTrigger id="crm-sort" className="min-h-11 w-auto min-w-[12rem]">
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

        {/* Même geste, même vocabulaire que la navigation : contrôle segmenté. */}
        <div
          role="tablist"
          aria-label={t("Affichage")}
          className="segmented ml-auto"
          style={{ ["--seg-count" as string]: 2, ["--seg" as string]: display === "table" ? 0 : 1 }}
        >
          <span className="segmented-thumb" aria-hidden="true" />
          <button
            type="button"
            role="tab"
            aria-selected={display === "table"}
            data-active={display === "table" ? "true" : undefined}
            className="segmented-item"
            onClick={() => setDisplay("table")}
          >
            {t("Tableau")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={display === "pipeline"}
            data-active={display === "pipeline" ? "true" : undefined}
            className="segmented-item"
            onClick={() => setDisplay("pipeline")}
          >
            {t("Pipeline")}
          </button>
        </div>
        <Button size="sm" variant="ghost" onClick={load}>
          {t("Actualiser")}
        </Button>

      </section>

      {/* Filtres actifs : chacun est retirable là où il se lit. */}
      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" aria-label={t("Filtres actifs")}>
          {chips.map((chip) => (
            <span key={chip.id} className="chip">
              {chip.label}
              <button
                type="button"
                aria-label={msg("Retirer le filtre {0}", [chip.label])}
                onClick={chip.clear}
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </span>
          ))}
          <Button size="sm" variant="ghost" onClick={resetFilters}>
            {t("Tout effacer")}
          </Button>
        </div>
      ) : null}




      {error ? <ErrorBlock text={error} onRetry={load} /> : null}
      {loading && !board ? <LoadingBlock rows={6} /> : null}

      {board && projects.length === 0 && !loading ? (
        <EmptyBlock
          title={t("Aucun projet ne correspond à cette recherche.")}
          text={t("Retirez un filtre pour élargir la recherche.")}
          action={
            activeFilterCount > 0 ? (
              <Button variant="outline" onClick={resetFilters}>
                {t("Tout effacer")}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {board && projects.length > 0 && display === "table" ? (
        <div className="overflow-x-auto" aria-busy={loading ? "true" : undefined}>
          <table className="data-table min-w-[900px] text-base">
            <caption className="sr-only">{t("Projets suivis")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("Société / projet")}</th>
                <th scope="col">{t("Étape")}</th>
                <th scope="col">{t("Pays")}</th>
                <th scope="col">{t("Commercial")}</th>
                <th scope="col">{t("FAE")}</th>
                <th scope="col" className="num">{t("Volume annuel")}</th>
                <th scope="col" className="num">{t("Chiffre d'affaires")}</th>
                <th scope="col" className="num">{t("Marge")}</th>
                <th scope="col">{t("Avancement")}</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.dossierId} style={rowAccent(p)}>
                  <td>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to="/standex/projects/$dossierId"
                        params={{ dossierId: p.dossierId }}
                        className="inline-flex min-h-11 items-center t-title-s underline-offset-2 hover:underline"
                      >
                        {p.companyEffective ?? p.title}
                      </Link>
                      {p.filed ? null : (
                        <Badge
                          variant="outline"
                          title={t("Aucun suivi interne renseigné pour l'instant.")}
                        >
                          {t("Non suivi")}
                          <span className="sr-only">
                            {" "}
                            — {t("Aucun suivi interne renseigné pour l'instant.")}
                          </span>
                        </Badge>
                      )}
                    </div>

                    <p className="t-caption text-muted-foreground">
                      {p.projectName ?? p.title} — {t("version")} {p.currentRevision}
                    </p>
                  </td>

                  <td>
                    <span className="inline-flex items-center gap-2">
                      <StagePill stage={p.stage} />
                      <StageGauge stage={p.stage} />
                    </span>
                    <p className="t-caption text-muted-foreground">
                      {stageAgeDays(p) === null
                        ? t("depuis une date inconnue")
                        : `${stageAgeDays(p)} ${t("jour(s)")}`}
                    </p>
                  </td>
                  <td><CountryCell code={p.countryCode} locale={tag} /></td>
                  <td>
                    <PersonCell
                      name={personName(board.directory, p.salesPersonId)}
                      assigned={Boolean(p.salesPersonId)}
                    />
                  </td>
                  <td>
                    <PersonCell
                      name={personName(board.directory, p.faePersonId)}
                      assigned={Boolean(p.faePersonId)}
                    />
                  </td>

                  <td className="num"><VolumeCell project={p} /></td>
                  <td className="num"><RevenueCell project={p} locale={tag} /></td>
                  <td className="num"><MarginCell project={p} locale={tag} /></td>
                  <td>
                    {p.tasksTotal === 0 ? (
                      <UnknownValue reason={t("aucune tâche")} />
                    ) : (
                      <>
                        <span className="t-metric">
                          {p.tasksDone}/{p.tasksTotal}
                        </span>
                        <span
                          className="progress-mini"
                          data-complete={p.tasksDone === p.tasksTotal ? "true" : "false"}
                          aria-hidden="true"
                        >
                          <span
                            style={{ width: `${Math.round((p.tasksDone / p.tasksTotal) * 100)}%` }}
                          />
                        </span>
                      </>
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
            {/* Pied de tableau : le résultat se lit sous la colonne qu'il
                totalise, une ligne par devise, jamais deux devises ajoutées. */}
            <tfoot>
              <tr>
                <td colSpan={6}>
                  <span className="t-caption text-muted-foreground">
                    {projects.length} {t("projet(s) affiché(s)")}
                  </span>
                  {totals.unknownAmount > 0 ? (
                    <span className="t-caption block text-muted-foreground">
                      {totals.unknownAmount} {t("sans chiffre d'affaires estimable")}
                    </span>
                  ) : null}
                  {totals.unknownCurrency > 0 ? (
                    <span className="t-caption block text-muted-foreground">
                      {totals.unknownCurrency} {t("sans devise renseignée")}
                    </span>
                  ) : null}
                </td>
                <td className="num">
                  {totals.byCurrency.map((c) => (
                    <span key={c.currency} className="t-metric block">
                      {formatAmount(c.amount, c.currency, tag)}
                    </span>
                  ))}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>

          </table>
        </div>
      ) : null}

      {board && projects.length > 0 && display === "pipeline" ? (
        <div className="pipeline-rail" aria-busy={loading ? "true" : undefined}>
          {groupByStage(projects).map((column) => {
            /* Poids de la colonne : une ligne par devise, jamais une somme
               mélangée, et rien du tout quand aucun montant n'est connu. */
            const columnTotals = pipelineTotals(column.projects);
            return (
            <section key={column.stage} className="panel-block space-y-2">
              <h3 className="t-title-s flex flex-wrap items-center gap-2">
                <StagePill stage={column.stage} />
                <span className="t-caption text-muted-foreground">({column.projects.length})</span>
                {columnTotals.byCurrency.map((c) => (
                  <span key={c.currency} className="t-metric">
                    {formatAmount(c.amount, c.currency, tag)}
                  </span>
                ))}
              </h3>
              {column.projects.length === 0 ? (
                <p className="t-caption text-muted-foreground">{t("Aucun projet.")}</p>
              ) : (
                column.projects.map((p) => (
                  <Link
                    key={p.dossierId}
                    to="/standex/projects/$dossierId"
                    params={{ dossierId: p.dossierId }}
                    className="surface-interactive pipeline-card min-h-11"
                    style={rowAccent(p)}
                  >

                    <span className="block t-title-s">{p.companyEffective ?? p.title}</span>
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
            );
          })}

        </div>
      ) : null}
    </div>
  );
}

/** Personne responsable : en colonne étroite, la pastille suffit et le nom
 *  reste lisible au survol comme au lecteur d'écran. Une absence
 *  d'attribution, elle, reste écrite en toutes lettres à toutes les tailles. */
function PersonCell({ name, assigned }: { name: string; assigned: boolean }) {
  if (!assigned)
    return <span className="t-caption text-muted-foreground">{name}</span>;
  return (
    <span className="inline-flex items-center gap-2" title={name}>
      <AvatarInitials name={name} />
      <span className="hidden xl:inline">{name}</span>
      <span className="sr-only xl:hidden">{name}</span>
    </span>
  );
}

/** Liseré de ligne : il signale ce qui demande une action avant de rappeler
 *  l'étape, déjà portée par la pastille voisine. */
function rowAccent(project: CrmProject): React.CSSProperties {
  const token =
    project.tasksOverdue > 0 || project.tasksBlocked > 0
      ? "var(--destructive)"
      : project.stage === "closed_won"
        ? "var(--success)"
        : project.stage === "on_hold"
          ? "var(--warning)"
          : project.stage === "closed_lost" || project.stage === "dead"
            ? "var(--standex-gray-25)"
            : "var(--standex-blue-25)";
  return { ["--row-accent" as string]: token };
}

