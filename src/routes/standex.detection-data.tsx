/** Données de détection — annuaire d'administration.
 *
 *  Écran réservé à l'administration Standex. Le masquage du menu ne protège
 *  rien : l'autorisation est vérifiée côté serveur par les RPC de la migration
 *  1.9 (`crm_require_admin`), et l'écran affiche le refus tel quel.
 *
 *  Deux natures de données, présentées séparément et jamais mélangées :
 *   - « Distances de commutation » : vraies distances d'activation et de
 *     relâchement, par combinaison exacte ;
 *   - « Plages du guide » : colonnes « up » et « to » de la brochure. Ce sont des
 *     plages DOCUMENTAIRES : elles ne sont ni converties en seuils, ni triées, et
 *     un ordre imprimé atypique est conservé tel quel puis signalé.
 *
 *  Une valeur manquante reste manquante : aucun zéro, aucune valeur voisine.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { t } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/react";
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
import { useFlash } from "@/components/standex/dashboard/flash";
import {
  buildDirectory,
  buildGuideDirectory,
  emptyRecordFor,
  filterDirectory,
  filterGuideDirectory,
  EMPTY_FILTERS,
  type DirectoryEntry,
  type DirectoryFilters,
  type GuideDirectoryEntry,
} from "@/lib/standex/detection-data/directory";
import {
  DETECTION_APPROACHES,
  DETECTION_CLASS_KINDS,
  DETECTION_CONTACT_FORMS,
  DETECTION_THRESHOLD_KINDS,
  GUIDE_APPROACHES,
  GUIDE_BOUND_NOTES,
  datumForApproach,
  detectionKey,
  emptyGuideRecord,
  guideKnownFamilies,
  guideKnownMagnetIds,
  guideRecordKey,
  hasErrors,
  hasGuideErrors,
  detectionMagnetIds,
  knownMagnetIds,
  magnetFamilyScope,
  parseDecimal,
  realSensors,
  validateDetectionRecord,
  validateGuideRecord,
  type DetectionFieldErrors,
  type DetectionRecord,
  type GuideApproachId,
  type GuideFieldErrors,
  type GuideRecord,
} from "@/lib/standex/detection-data/model";
import {
  detectionConflictVersion,
  fetchDetectionDirectory,
  fetchGuideDirectory,
  DETECTION_DENIED_MESSAGE,
  NON_NUMERIC_MESSAGE,
  humanDetectionError,
  saveDetectionRow,
  saveGuideRow,
} from "@/lib/standex/detection-data/adapter";
import { loadDetectionData } from "@/lib/standex/detection-data/store";

export const Route = createFileRoute("/standex/detection-data")({
  component: DetectionDataScreen,
});

const mm = (v: number | null) => (v === null ? "—" : v.toFixed(2).replace(/\.00$/, ""));
const raw = (v: number | null) => (v === null ? "" : String(v));

/** Brouillon en cours : les champs numériques restent des CHAÎNES pendant la
 *  frappe. Sans cela, « 15, » serait refusé à chaque touche et il deviendrait
 *  impossible de taper « 15,4 » ou un signe moins. La conversion se fait à
 *  l'enregistrement, et une saisie non convertible est signalée, jamais
 *  silencieusement remplacée par l'ancienne valeur. */
interface DistanceDraft {
  record: DetectionRecord;
  pullIn: string;
  dropOut: string;
  temperature: string;
  expectedVersion: number | null;
  isNew: boolean;
}
interface GuideDraft {
  record: GuideRecord;
  page: string;
  up: string;
  to: string;
  expectedVersion: number | null;
  isNew: boolean;
}

function DetectionDataScreen() {
  const { capabilities } = useCrm();
  const flash = useFlash();
  useLocale();
  const role = capabilities?.role ?? null;
  const userId = capabilities?.userId ?? null;
  const [saved, setSaved] = useState<DetectionRecord[]>([]);
  const [savedGuide, setSavedGuide] = useState<GuideRecord[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "denied" | "error">("loading");
  const [detail, setDetail] = useState<string | null>(null);
  const [filters, setFilters] = useState<DirectoryFilters>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<DistanceDraft | null>(null);
  const [guideDraft, setGuideDraft] = useState<GuideDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<DetectionFieldErrors>({});
  const [guideErrors, setGuideErrors] = useState<GuideFieldErrors>({});
  const [dirty, setDirty] = useState(false);
  /** Action demandée alors qu'un brouillon non enregistré est ouvert. */
  const [blocked, setBlocked] = useState<null | (() => void)>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const panel = useRef<HTMLDivElement | null>(null);
  /** Génération d'identité : toute réponse d'une génération périmée est ignorée. */
  const generation = useRef(0);
  const identity = useRef<string | null>(null);

  const load = useCallback(async () => {
    const mine = generation.current;
    setState("loading");
    try {
      const [rows, guideRows] = await Promise.all([
        fetchDetectionDirectory(),
        fetchGuideDirectory(),
      ]);
      if (mine !== generation.current) return false; // compte ou rôle changé entre-temps
      setSaved(rows);
      setSavedGuide(guideRows);
      setState("ready");
      setDetail(null);
      return true;
    } catch (error) {
      if (mine !== generation.current) return false;
      const message = humanDetectionError(error);
      setDetail(message);
      setState(message === DETECTION_DENIED_MESSAGE ? "denied" : "error");
      return false;
    }
  }, []);

  /* Changement de compte ou de rôle : l'annuaire lu par quelqu'un d'autre n'est
     jamais conservé, et le brouillon protégé est effacé avec lui. Un simple
     renouvellement de jeton pour le MÊME compte ne déclenche rien : le
     brouillon non enregistré survit. */
  useEffect(() => {
    const who = userId === null ? null : userId + "/" + (role ?? "none");
    if (identity.current === who) return;
    const accountChanged = identity.current !== null && !identity.current.startsWith(String(userId));
    identity.current = who;
    generation.current += 1;
    setSaved([]);
    setSavedGuide([]);
    if (accountChanged || userId === null) {
      setDraft(null);
      setGuideDraft(null);
      setDirty(false);
      setBlocked(null);
    }
    if (role === "admin") void load();
    else setState(role === null ? "loading" : "denied");
  }, [userId, role, load]);

  const entries = useMemo(() => buildDirectory(saved), [saved]);
  const guideEntries = useMemo(() => buildGuideDirectory(savedGuide), [savedGuide]);
  const shown = useMemo(() => filterDirectory(entries, filters), [entries, filters]);
  const guideShown = useMemo(
    () => filterGuideDirectory(guideEntries, filters),
    [guideEntries, filters],
  );
  const isGuide = filters.dataset === "guide";
  const families = useMemo(
    () =>
      [
        ...new Set(
          (isGuide ? guideEntries : entries).map((e) => e.record.sensorFamily).filter((f) => f !== ""),
        ),
      ].sort(),
    [entries, guideEntries, isGuide],
  );
  const magnets = useMemo(
    () =>
      [
        ...new Set(
          (isGuide ? guideEntries : entries).map((e) => e.record.magnetId).filter((m) => m !== ""),
        ),
      ].sort(),
    [entries, guideEntries, isGuide],
  );
  const total = isGuide ? guideEntries.length : entries.length;
  const listed = isGuide ? guideShown.length : shown.length;
  const complete = (isGuide ? guideEntries : entries).filter((e) => e.complete).length;

  /** Toute ouverture passe par ici : un brouillon non enregistré n'est jamais
   *  perdu sans décision explicite. */
  const guard = (action: () => void) => {
    if (dirty) setBlocked(() => action);
    else action();
  };

  const openEntry = (entry: DirectoryEntry) =>
    guard(() => {
      setDraft({
        record: { ...entry.record },
        pullIn: raw(entry.record.pullInMm),
        dropOut: raw(entry.record.dropOutMm),
        temperature: raw(entry.record.temperatureC),
        expectedVersion: entry.origin === "saved" ? entry.record.rowVersion : null,
        isNew: entry.origin !== "saved",
      });
      setGuideDraft(null);
      setErrors({});
      setDirty(false);
      setRefreshFailed(false);
    });

  const openGuideEntry = (entry: GuideDirectoryEntry) =>
    guard(() => {
      setGuideDraft({
        record: { ...entry.record },
        page: raw(entry.record.page),
        up: raw(entry.record.upMm),
        to: raw(entry.record.toMm),
        expectedVersion: entry.origin === "saved" ? entry.record.rowVersion : null,
        isNew: entry.origin !== "saved",
      });
      setDraft(null);
      setGuideErrors({});
      setDirty(false);
      setRefreshFailed(false);
    });

  // Le panneau d'édition reçoit le focus : la ligne éditée n'est jamais
  // ouverte hors du champ de vision.
  useEffect(() => {
    if (!draft && !guideDraft) return;
    panel.current?.scrollIntoView({ block: "nearest" });
    panel.current?.focus();
  }, [draft?.record.id, draft?.isNew, guideDraft?.record.id, guideDraft?.isNew]);

  const patch = (next: Partial<DetectionRecord>) => {
    setDirty(true);
    setDraft((cur) => {
      if (!cur) return cur;
      const record = { ...cur.record, ...next };
      if (next.approachId) record.datum = datumForApproach(next.approachId);
      return { ...cur, record };
    });
  };
  const patchGuide = (next: Partial<GuideRecord>) => {
    setDirty(true);
    setGuideDraft((cur) => (cur ? { ...cur, record: { ...cur.record, ...next } } : cur));
  };

  /** Une autre combinaison est une NOUVELLE ligne, créée explicitement : la clé
   *  d'une ligne existante ne se renomme pas. La saisie en cours est reprise
   *  telle quelle, sans identifiant ni version, donc sans risque d'écraser la
   *  ligne d'origine ni une autre ligne de même version. */
  const duplicateDraft = () => {
    setDraft((cur) =>
      cur
        ? {
            ...cur,
            record: { ...cur.record, id: null, rowVersion: null, updatedAt: null, updatedBy: null },
            expectedVersion: null,
            isNew: true,
          }
        : cur,
    );
    setErrors({});
    setDirty(true);
  };

  const closeDraft = () => {
    setDraft(null);
    setGuideDraft(null);
    setDirty(false);
    setErrors({});
    setGuideErrors({});
  };

  /** Relecture après écriture : la réussite n'est annoncée que si le serveur a
   *  bien été relu. Sinon la ligne est enregistrée mais on le dit franchement. */
  const refreshAfterSave = async () => {
    const directoryOk = await load();
    let simulationsOk = true;
    try {
      await loadDetectionData(true);
    } catch {
      simulationsOk = false;
    }
    return directoryOk && simulationsOk;
  };

  const save = async () => {
    if (!draft || pending) return; // jamais deux écritures pour le même clic
    const record: DetectionRecord = {
      ...draft.record,
      pullInMm: null,
      dropOutMm: null,
      temperatureC: null,
    };
    const found: DetectionFieldErrors = {};
    const pullIn = parseDecimal(draft.pullIn);
    const dropOut = parseDecimal(draft.dropOut);
    const temperature = parseDecimal(draft.temperature);
    if (pullIn === "invalid") found.pullInMm = NON_NUMERIC_MESSAGE;
    else record.pullInMm = pullIn;
    if (dropOut === "invalid") found.dropOutMm = NON_NUMERIC_MESSAGE;
    else record.dropOutMm = dropOut;
    if (temperature === "invalid") found.temperatureC = NON_NUMERIC_MESSAGE;
    else record.temperatureC = temperature;
    const others = saved.filter((r) => detectionKey(r) !== detectionKey(record));
    const all = { ...validateDetectionRecord(record, others), ...found };
    setErrors(all);
    if (hasErrors(all)) return;
    setPending(true);
    const mine = generation.current;
    try {
      await saveDetectionRow(record, draft.expectedVersion);
      if (mine !== generation.current) return;
      const fresh = await refreshAfterSave();
      setRefreshFailed(!fresh);
      if (fresh) flash.success(t("Ligne enregistrée. Les simulations utilisent la nouvelle valeur."));
      else
        setDetail(
          t("Ligne enregistrée, mais la relecture a échoué : les simulations peuvent encore afficher la valeur précédente."),
        );
      closeDraft();
    } catch (error) {
      if (mine !== generation.current) return;
      const version = detectionConflictVersion(error);
      setDetail(
        version === null
          ? t(humanDetectionError(error))
          : t("Ligne modifiée entre-temps") + " — " + t("rechargez avant d'enregistrer"),
      );
    } finally {
      setPending(false);
    }
  };

  const saveGuide = async () => {
    if (!guideDraft || pending) return;
    const record: GuideRecord = { ...guideDraft.record, page: null, upMm: null, toMm: null };
    const found: GuideFieldErrors = {};
    const page = parseDecimal(guideDraft.page);
    const up = parseDecimal(guideDraft.up);
    const to = parseDecimal(guideDraft.to);
    if (page === "invalid") found.page = NON_NUMERIC_MESSAGE;
    else record.page = page;
    if (up === "invalid") found.upMm = NON_NUMERIC_MESSAGE;
    else record.upMm = up;
    if (to === "invalid") found.toMm = NON_NUMERIC_MESSAGE;
    else record.toMm = to;
    const others = savedGuide.filter((r) => guideRecordKey(r) !== guideRecordKey(record));
    const all = { ...validateGuideRecord(record, others), ...found };
    setGuideErrors(all);
    if (hasGuideErrors(all)) return;
    setPending(true);
    const mine = generation.current;
    try {
      await saveGuideRow(record, guideDraft.expectedVersion);
      if (mine !== generation.current) return;
      const fresh = await refreshAfterSave();
      setRefreshFailed(!fresh);
      if (fresh)
        flash.success(t("Plage du guide enregistrée. Elle reste documentaire, jamais un seuil."));
      else
        setDetail(
          t("Ligne enregistrée, mais la relecture a échoué : les simulations peuvent encore afficher la valeur précédente."),
        );
      closeDraft();
    } catch (error) {
      if (mine !== generation.current) return;
      const version = detectionConflictVersion(error);
      setDetail(
        version === null
          ? t(humanDetectionError(error))
          : t("Ligne modifiée entre-temps") + " — " + t("rechargez avant d'enregistrer"),
      );
    } finally {
      setPending(false);
    }
  };

  if (state === "denied")
    return (
      <div className="space-y-3">
        <h2 className="t-title-m">{t("Données de détection")}</h2>
        <p className="notice-warning t-body">
          <Lock className="mr-2 inline h-4 w-4" aria-hidden="true" />
          {t("Réservé à l'administration Standex")}
        </p>
      </div>
    );

  return (
    <div className="space-y-4">
      <h2 className="t-title-m">{t("Données de détection")}</h2>
      <p className="t-body text-muted-foreground">
        {isGuide
          ? t(
              "Plages « up » et « to » de la brochure d'activation. Ce sont des plages documentaires : elles ne sont ni des seuils d'activation, ni des seuils de relâchement, et ne sont jamais réordonnées.",
            )
          : t(
              "Distances réelles d'activation et de relâchement, par combinaison exacte. Les plages du guide d'activation ne sont pas des seuils : elles sont dans l'autre onglet.",
            )}
      </p>
      {detail ? <p className="notice-warning t-caption">{detail}</p> : null}
      {refreshFailed ? (
        <p className="notice-warning t-caption">
          {t("La relecture du serveur a échoué.")}{" "}
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            {t("Réessayer")}
          </Button>
        </p>
      ) : null}
      {state === "error" ? (
        <p className="notice-danger t-caption">
          {t("Annuaire non activé sur ce serveur")} — {t("aucune modification n'a été enregistrée")}{" "}
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            {t("Réessayer")}
          </Button>
        </p>
      ) : null}
      {blocked ? (
        <div className="notice-warning t-caption flex flex-wrap items-center gap-2">
          {t("Une modification n'est pas enregistrée.")}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const action = blocked;
              setBlocked(null);
              setDirty(false);
              action();
            }}
          >
            {t("Abandonner la modification")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setBlocked(null)}>
            {t("Continuer l'édition")}
          </Button>
        </div>
      ) : null}

      <section className="workbar" aria-label={t("Filtres")}>
        <Label className="sr-only" htmlFor="dd-search">
          {t("Rechercher une référence ou un aimant")}
        </Label>
        <Input
          id="dd-search"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          placeholder={t("Rechercher une référence ou un aimant")}
          className="min-h-11 w-auto min-w-[14rem]"
        />
        <FilterSelect
          id="dd-dataset"
          label={t("Nature de la donnée")}
          value={filters.dataset}
          options={["distances", "guide"]}
          includeAll={false}
          labels={{
            distances: t("Distances de commutation"),
            guide: t("Plages du guide (documentaires)"),
          }}
          onChange={(v) =>
            guard(() =>
              setFilters({
                ...EMPTY_FILTERS,
                search: filters.search,
                dataset: v as DirectoryFilters["dataset"],
              }),
            )
          }
        />
        <FilterSelect
          id="dd-family"
          label={t("Famille")}
          value={filters.family}
          options={families}
          onChange={(v) => setFilters({ ...filters, family: v })}
        />
        <FilterSelect
          id="dd-magnet"
          label={t("Aimant")}
          value={filters.magnet}
          options={magnets}
          onChange={(v) => setFilters({ ...filters, magnet: v })}
        />
        <FilterSelect
          id="dd-approach"
          label={t("Approche")}
          value={filters.approach}
          options={isGuide ? [...GUIDE_APPROACHES] : [...DETECTION_APPROACHES]}
          onChange={(v) => setFilters({ ...filters, approach: v })}
        />
        <FilterSelect
          id="dd-origin"
          label={t("Origine")}
          value={filters.origin}
          options={isGuide ? ["compiled", "saved"] : ["compiled", "saved", "missing"]}
          labels={{
            compiled: t("Jeu livré"),
            saved: t("Saisie Standex"),
            missing: t("À compléter"),
          }}
          onChange={(v) => setFilters({ ...filters, origin: v })}
        />
        <FilterSelect
          id="dd-complete"
          label={t("Complétude")}
          value={filters.completeness}
          options={["complete", "incomplete"]}
          labels={{ complete: t("Complète"), incomplete: t("Incomplète") }}
          onChange={(v) => setFilters({ ...filters, completeness: v })}
        />
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => setFilters({ ...EMPTY_FILTERS, dataset: filters.dataset })}
        >
          {t("Réinitialiser les filtres")}
        </Button>
      </section>

      <p className="t-caption text-muted-foreground">
        {listed} / {total} {t("combinaisons")} · {complete}{" "}
        {isGuide ? t("avec une plage imprimée") : t("avec deux distances réelles")}
      </p>

      {state === "loading" ? (
        <p className="t-caption text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden="true" />
          {t("Chargement…")}
        </p>
      ) : null}

      {/* Le tableau ne s'affiche qu'une fois le rôle administrateur CONFIRMÉ par
          le serveur : sans confirmation, l'écran ne montre pas l'annuaire. */}
      {state !== "ready" ? null : isGuide ? (
        <div className="panel-block max-h-[60vh] overflow-auto p-0">
          <table className="t-body w-full border-separate border-spacing-0 text-left">
            <thead className="sticky top-0 z-10 bg-[var(--surface)]">
              <tr>
                {[
                  t("Référence imprimée"),
                  t("Aimant"),
                  t("Approche"),
                  t("up (mm)"),
                  t("to (mm)"),
                  t("Page"),
                  t("État"),
                  "",
                ].map((h) => (
                  <th key={h} scope="col" className="t-label px-3 py-2 align-bottom">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {guideShown.map((e) => (
                <tr key={e.key} data-testid="guide-row" data-origin={e.origin}>
                  <th
                    scope="row"
                    className="t-body sticky left-0 bg-[var(--surface)] px-3 py-2 font-normal"
                  >
                    {e.record.sensorReference}
                    <span className="t-caption block text-muted-foreground">
                      {e.record.sensorFamily}
                    </span>
                  </th>
                  <td className="px-3 py-2">{e.record.magnetId}</td>
                  <td className="px-3 py-2">{e.record.approachId}</td>
                  <td className="t-metric px-3 py-2">
                    {e.record.upNote === "not_published" ? "—" : mm(e.record.upMm)}
                    {e.record.upNote === "below_zero" ? " (<0)" : ""}
                  </td>
                  <td className="t-metric px-3 py-2">
                    {e.record.toNote === "not_published" ? "—" : mm(e.record.toMm)}
                    {e.record.toNote === "below_zero" ? " (<0)" : ""}
                    {e.atypical ? (
                      <span className="t-caption block text-muted-foreground">
                        {t("ordre imprimé inhabituel — à confirmer par Standex")}
                      </span>
                    ) : null}
                  </td>
                  <td className="t-metric px-3 py-2">{e.record.page ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className="chip">
                      {e.complete ? t("Complète") : t("Incomplète")}
                    </span>
                    {e.baseline ? (
                      <span className="t-caption block text-muted-foreground">
                        {t("brouillon proposé ; la ligne livrée reste en vigueur")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <Button size="sm" variant="ghost" onClick={() => openGuideEntry(e)}>
                      {t("Modifier")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel-block max-h-[60vh] overflow-auto p-0">
          <table className="t-body w-full border-separate border-spacing-0 text-left">
            <thead className="sticky top-0 z-10 bg-[var(--surface)]">
              <tr>
                {[
                  t("Référence"),
                  t("Classe ou modèle"),
                  t("Contact"),
                  t("Aimant"),
                  t("Approche"),
                  t("Activation (mm)"),
                  t("Relâchement (mm)"),
                  t("État"),
                  t("Source"),
                  "",
                ].map((h) => (
                  <th key={h} scope="col" className="t-label px-3 py-2 align-bottom">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.key} data-testid="detection-row" data-origin={e.origin}>
                  <th
                    scope="row"
                    className="t-body sticky left-0 bg-[var(--surface)] px-3 py-2 font-normal"
                  >
                    {e.record.sensorReference}
                    <span className="t-caption block text-muted-foreground">
                      {e.record.sensorFamily}
                      {e.simulatable ? "" : " · " + t("contact non simulé")}
                    </span>
                  </th>
                  <td className="px-3 py-2">
                    {e.record.sensitivityClass || "—"}
                    <span className="t-caption block text-muted-foreground">
                      {e.record.classKind === "sensitivity"
                        ? t("Classe de sensibilité")
                        : t("Modèle de contact")}
                    </span>
                  </td>
                  <td className="px-3 py-2">{e.record.contactForm}</td>
                  <td className="px-3 py-2">{e.record.magnetId || "—"}</td>
                  <td className="px-3 py-2">{e.record.approachId}</td>
                  <td className="t-metric px-3 py-2">{mm(e.record.pullInMm)}</td>
                  <td className="t-metric px-3 py-2">{mm(e.record.dropOutMm)}</td>
                  <td className="px-3 py-2">
                    <span className="chip">
                      {e.complete
                        ? t("Complète")
                        : e.origin === "missing"
                          ? t("À compléter")
                          : t("Incomplète")}
                    </span>
                    {e.baseline ? (
                      <span className="t-caption block text-muted-foreground">
                        {t("brouillon proposé ; la ligne livrée reste en vigueur")} :{" "}
                        {mm(e.baseline.pullInMm)} / {mm(e.baseline.dropOutMm)} {t("mm")}
                      </span>
                    ) : null}
                  </td>
                  <td className="t-caption px-3 py-2">
                    {e.record.sourceRef || t("Source à renseigner")}
                    {e.record.updatedAt ? (
                      <span className="block text-muted-foreground">
                        {t("Modifiée le")} {e.record.updatedAt.slice(0, 10)}
                        {e.record.updatedBy ? " · " + e.record.updatedBy : ""}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <Button size="sm" variant="ghost" onClick={() => openEntry(e)}>
                      {e.origin === "missing" ? t("Renseigner") : t("Modifier")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {state === "ready" ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            guard(() => {
              if (isGuide) {
                setGuideDraft({
                  record: emptyGuideRecord(),
                  page: "",
                  up: "",
                  to: "",
                  expectedVersion: null,
                  isNew: true,
                });
                setDraft(null);
                setGuideErrors({});
              } else {
                const first = realSensors()[0];
                if (!first) return;
                setDraft({
                  record: emptyRecordFor(first.id, first.documentedAs ?? first.name),
                  pullIn: "",
                  dropOut: "",
                  temperature: "",
                  expectedVersion: null,
                  isNew: true,
                });
                setGuideDraft(null);
                setErrors({});
              }
              setDirty(false);
            })
          }
        >
          {t("Ajouter une combinaison")}
        </Button>
      ) : null}

      {draft || guideDraft ? (
        <div ref={panel} tabIndex={-1}>
          {draft ? (
            <EditPanel
              draft={draft}
              errors={errors}
              pending={pending}
              onPatch={patch}
              onDuplicate={duplicateDraft}
              onRaw={(key, value) => {
                setDirty(true);
                setDraft((cur) => (cur ? { ...cur, [key]: value } : cur));
              }}
              onCancel={closeDraft}
              onSave={() => void save()}
            />
          ) : null}
          {guideDraft ? (
            <GuideEditPanel
              draft={guideDraft}
              errors={guideErrors}
              pending={pending}
              onPatch={patchGuide}
              onRaw={(key, value) => {
                setDirty(true);
                setGuideDraft((cur) => (cur ? { ...cur, [key]: value } : cur));
              }}
              onCancel={closeDraft}
              onSave={() => void saveGuide()}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  options,
  labels,
  includeAll = true,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  labels?: Record<string, string>;
  includeAll?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <>
      <Label className="sr-only" htmlFor={id}>
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="min-h-11 w-auto min-w-[9rem]">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {includeAll ? (
            <SelectItem value="all">
              {label} — {t("tout")}
            </SelectItem>
          ) : null}
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {labels?.[o] ?? o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

/** Édition d'UNE ligne : jamais des dizaines de champs ouverts en même temps. */
function EditPanel({
  draft,
  errors,
  pending,
  onPatch,
  onDuplicate,
  onRaw,
  onCancel,
  onSave,
}: {
  draft: DistanceDraft;
  errors: DetectionFieldErrors;
  pending: boolean;
  onPatch: (next: Partial<DetectionRecord>) => void;
  onDuplicate: () => void;
  onRaw: (key: "pullIn" | "dropOut" | "temperature", value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const r = draft.record;
  return (
    <section className="panel-block-lg space-y-3" aria-label={t("Modifier la ligne")}>
      <h3 className="t-title-s">{t("Modifier la ligne")}</h3>
      <div className="grid gap-3 md:grid-cols-3">
        <Field id="dd-f-family" label={t("Référence catalogue")} error={errors.sensorFamily}>
          {(id) => (
            <Select value={r.sensorFamily} onValueChange={(v) => onPatch({ sensorFamily: v })}>
              <SelectTrigger id={id} className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {realSensors().map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field id="dd-f-ref" label={t("Référence imprimée")} error={errors.sensorReference}>
          {(id) => (
            <Input
              id={id}
              className="min-h-11"
              value={r.sensorReference}
              onChange={(e) => onPatch({ sensorReference: e.target.value })}
            />
          )}
        </Field>
        <Field id="dd-f-kind" label={t("Nature de la colonne")}>
          {(id) => (
            <Select
              value={r.classKind}
              onValueChange={(v) => onPatch({ classKind: v as DetectionRecord["classKind"] })}
            >
              <SelectTrigger id={id} className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DETECTION_CLASS_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k === "sensitivity" ? t("Classe de sensibilité") : t("Modèle de contact")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field id="dd-f-class" label={t("Classe ou modèle")} error={errors.sensitivityClass}>
          {(id) => (
            <Input
              id={id}
              className="min-h-11"
              value={r.sensitivityClass}
              onChange={(e) => onPatch({ sensitivityClass: e.target.value })}
            />
          )}
        </Field>
        <Field id="dd-f-contact" label={t("Contact")}>
          {(id) => (
            <Select
              value={r.contactForm}
              onValueChange={(v) => onPatch({ contactForm: v as DetectionRecord["contactForm"] })}
            >
              <SelectTrigger id={id} className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DETECTION_CONTACT_FORMS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field id="dd-f-magnet" label={t("Aimant")} error={errors.magnetId}>
          {(id) => (
            <Select value={r.magnetId} onValueChange={(v) => onPatch({ magnetId: v })}>
              <SelectTrigger id={id} className="min-h-11">
                <SelectValue placeholder={t("Aimant")} />
              </SelectTrigger>
              <SelectContent>
                {knownMagnetIds().map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field id="dd-f-approach" label={t("Approche")} error={errors.approachId}>
          {(id) => (
            <Select
              value={r.approachId}
              onValueChange={(v) => onPatch({ approachId: v as DetectionRecord["approachId"] })}
            >
              <SelectTrigger id={id} className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DETECTION_APPROACHES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field id="dd-f-threshold" label={t("Nature des distances")}>
          {(id) => (
            <Select
              value={r.thresholdKind}
              onValueChange={(v) =>
                onPatch({ thresholdKind: v as DetectionRecord["thresholdKind"] })
              }
            >
              <SelectTrigger id={id} className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DETECTION_THRESHOLD_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k === "typical"
                      ? t("Valeurs typiques")
                      : t("Activation minimale / relâchement maximal")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field id="dd-f-pullin" label={t("Activation (mm)")} error={errors.pullInMm}>
          {(id) => (
            <Input
              id={id}
              className="min-h-11"
              inputMode="decimal"
              value={draft.pullIn}
              onChange={(e) => onRaw("pullIn", e.target.value)}
              placeholder={t("inconnu")}
            />
          )}
        </Field>
        <Field id="dd-f-dropout" label={t("Relâchement (mm)")} error={errors.dropOutMm}>
          {(id) => (
            <Input
              id={id}
              className="min-h-11"
              inputMode="decimal"
              value={draft.dropOut}
              onChange={(e) => onRaw("dropOut", e.target.value)}
              placeholder={t("inconnu")}
            />
          )}
        </Field>
        <Field id="dd-f-temp" label={t("Température (°C)")} error={errors.temperatureC}>
          {(id) => (
            <Input
              id={id}
              className="min-h-11"
              inputMode="text"
              value={draft.temperature}
              onChange={(e) => onRaw("temperature", e.target.value)}
              placeholder={t("inconnu")}
            />
          )}
        </Field>
        <Field id="dd-f-srctype" label={t("Nature de la source")} error={errors.sourceType}>
          {(id) => (
            <Input
              id={id}
              className="min-h-11"
              value={r.sourceType}
              onChange={(e) => onPatch({ sourceType: e.target.value })}
              placeholder={t("fiche, essai, mesure")}
            />
          )}
        </Field>
        <Field id="dd-f-srcref" label={t("Source précise")} error={errors.sourceRef}>
          {(id) => (
            <Input
              id={id}
              className="min-h-11"
              value={r.sourceRef}
              onChange={(e) => onPatch({ sourceRef: e.target.value })}
              placeholder={t("document, page, rapport d'essai")}
            />
          )}
        </Field>
        <Field id="dd-f-date" label={t("Date de saisie")} error={errors.enteredOn}>
          {(id) => (
            <Input
              id={id}
              className="min-h-11"
              value={r.enteredOn}
              onChange={(e) => onPatch({ enteredOn: e.target.value })}
              placeholder="AAAA-MM-JJ"
            />
          )}
        </Field>
        <Field id="dd-f-status" label={t("État")} error={errors.status}>
          {(id) => (
            <Select
              value={r.status}
              onValueChange={(v) => onPatch({ status: v as DetectionRecord["status"] })}
            >
              <SelectTrigger id={id} className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{t("Brouillon — non utilisé en simulation")}</SelectItem>
                <SelectItem value="validated">{t("Validée — utilisée en simulation")}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
      </div>
      <p className="notice-info t-caption">
        {t(
          "Un brouillon peut rester incomplet : il n'alimente aucune simulation. Une ligne validée porte une activation et un relâchement finis, le relâchement plus loin que l'activation.",
        )}
      </p>
      <Actions pending={pending} onCancel={onCancel} onSave={onSave} />
    </section>
  );
}

function GuideEditPanel({
  draft,
  errors,
  pending,
  onPatch,
  onRaw,
  onCancel,
  onSave,
}: {
  draft: GuideDraft;
  errors: GuideFieldErrors;
  pending: boolean;
  onPatch: (next: Partial<GuideRecord>) => void;
  onRaw: (key: "page" | "up" | "to", value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const r = draft.record;
  const noteSelect = (
    id: string,
    value: GuideRecord["upNote"],
    apply: (v: GuideRecord["upNote"]) => void,
  ) => (
    <Select value={value ?? "value"} onValueChange={(v) => apply(v === "value" ? null : (v as GuideRecord["upNote"]))}>
      <SelectTrigger id={id} className="min-h-11">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="value">{t("Valeur imprimée")}</SelectItem>
        {GUIDE_BOUND_NOTES.map((n) => (
          <SelectItem key={n} value={n}>
            {n === "not_published" ? t("Non publié (« - »)") : t("Sous zéro (« <0 »)")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  return (
    <section className="panel-block-lg space-y-3" aria-label={t("Modifier la plage du guide")}>
      <h3 className="t-title-s">{t("Modifier la plage du guide")}</h3>
      <p className="notice-info t-caption">
        {t(
          "Ces deux colonnes sont recopiées de la brochure. Elles ne sont pas un seuil d'activation ni de relâchement : « up » peut être supérieur à « to », et cet ordre est conservé tel qu'imprimé.",
        )}
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <Field id="dg-family" label={t("Famille")} error={errors.sensorFamily}>
          {(id) => (
            <Select value={r.sensorFamily} onValueChange={(v) => onPatch({ sensorFamily: v })}>
              <SelectTrigger id={id} className="min-h-11">
                <SelectValue placeholder={t("Famille")} />
              </SelectTrigger>
              <SelectContent>
                {guideKnownFamilies().map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field id="dg-ref" label={t("Référence imprimée")} error={errors.sensorReference}>
          {(id) => (
            <Input
              id={id}
              className="min-h-11"
              value={r.sensorReference}
              onChange={(e) => onPatch({ sensorReference: e.target.value })}
            />
          )}
        </Field>
        <Field id="dg-magnet" label={t("Aimant")} error={errors.magnetId}>
          {(id) => (
            <Select value={r.magnetId} onValueChange={(v) => onPatch({ magnetId: v })}>
              <SelectTrigger id={id} className="min-h-11">
                <SelectValue placeholder={t("Aimant")} />
              </SelectTrigger>
              <SelectContent>
                {guideKnownMagnetIds().map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field id="dg-approach" label={t("Approche")} error={errors.approachId}>
          {(id) => (
            <Select
              value={r.approachId}
              onValueChange={(v) => onPatch({ approachId: v as GuideApproachId })}
            >
              <SelectTrigger id={id} className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GUIDE_APPROACHES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field id="dg-up" label={t("up (mm)")} error={errors.upMm}>
          {(id) => (
            <Input
              id={id}
              className="min-h-11"
              inputMode="decimal"
              value={draft.up}
              onChange={(e) => onRaw("up", e.target.value)}
              placeholder={t("inconnu")}
            />
          )}
        </Field>
        <Field id="dg-upnote" label={t("Mention de la colonne « up »")}>
          {(id) => noteSelect(id, r.upNote, (v) => onPatch({ upNote: v }))}
        </Field>
        <Field id="dg-to" label={t("to (mm)")} error={errors.toMm}>
          {(id) => (
            <Input
              id={id}
              className="min-h-11"
              inputMode="decimal"
              value={draft.to}
              onChange={(e) => onRaw("to", e.target.value)}
              placeholder={t("inconnu")}
            />
          )}
        </Field>
        <Field id="dg-tonote" label={t("Mention de la colonne « to »")}>
          {(id) => noteSelect(id, r.toNote, (v) => onPatch({ toNote: v }))}
        </Field>
        <Field id="dg-page" label={t("Page")} error={errors.page}>
          {(id) => (
            <Input
              id={id}
              className="min-h-11"
              inputMode="numeric"
              value={draft.page}
              onChange={(e) => onRaw("page", e.target.value)}
            />
          )}
        </Field>
        <Field id="dg-srcref" label={t("Source précise")} error={errors.sourceRef}>
          {(id) => (
            <Input
              id={id}
              className="min-h-11"
              value={r.sourceRef}
              onChange={(e) => onPatch({ sourceRef: e.target.value })}
              placeholder={t("brochure, page")}
            />
          )}
        </Field>
        <Field id="dg-date" label={t("Date de saisie")} error={errors.enteredOn}>
          {(id) => (
            <Input
              id={id}
              className="min-h-11"
              value={r.enteredOn}
              onChange={(e) => onPatch({ enteredOn: e.target.value })}
              placeholder="AAAA-MM-JJ"
            />
          )}
        </Field>
        <Field id="dg-status" label={t("État")} error={errors.status}>
          {(id) => (
            <Select
              value={r.status}
              onValueChange={(v) => onPatch({ status: v as GuideRecord["status"] })}
            >
              <SelectTrigger id={id} className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{t("Brouillon — non utilisé en simulation")}</SelectItem>
                <SelectItem value="validated">{t("Validée — utilisée en simulation")}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
      </div>
      <Actions pending={pending} onCancel={onCancel} onSave={onSave} />
    </section>
  );
}

function Actions({
  pending,
  onCancel,
  onSave,
}: {
  pending: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={onSave} disabled={pending}>
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {t("Enregistrer")}
      </Button>
      <Button variant="ghost" onClick={onCancel} disabled={pending}>
        {t("Annuler")}
      </Button>
    </div>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  children: (id: string) => React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="t-label" htmlFor={id}>
        {label}
      </Label>
      {children(id)}
      {error ? (
        <p className="notice-danger t-caption" id={id + "-error"}>
          {t(error)}
        </p>
      ) : null}
    </div>
  );
}
