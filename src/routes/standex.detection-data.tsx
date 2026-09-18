/** Données de détection — annuaire d'administration.
 *
 *  Écran réservé à l'administration Standex. Le masquage du menu ne protège
 *  rien : l'autorisation est vérifiée côté serveur par les RPC de la migration
 *  1.9 (`crm_require_admin`), et l'écran affiche le refus tel quel.
 *
 *  Deux natures de données coexistent sur le site et ne sont jamais mélangées :
 *   - ICI, de vraies distances de commutation (activation / relâchement) ;
 *   - AILLEURS, les plages « up / to » du guide d'activation, documentaires,
 *     jamais converties en seuils. Cet écran ne les touche pas.
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
  emptyRecordFor,
  filterDirectory,
  EMPTY_FILTERS,
  type DirectoryEntry,
  type DirectoryFilters,
} from "@/lib/standex/detection-data/directory";
import {
  DETECTION_APPROACHES,
  DETECTION_CLASS_KINDS,
  DETECTION_CONTACT_FORMS,
  DETECTION_THRESHOLD_KINDS,
  datumForApproach,
  detectionKey,
  hasErrors,
  knownMagnetIds,
  parseDecimal,
  realSensors,
  validateDetectionRecord,
  type DetectionFieldErrors,
  type DetectionRecord,
} from "@/lib/standex/detection-data/model";
import {
  detectionConflictVersion,
  fetchDetectionDirectory,
  humanDetectionError,
  saveDetectionRow,
} from "@/lib/standex/detection-data/adapter";
import { loadDetectionData } from "@/lib/standex/detection-data/store";

export const Route = createFileRoute("/standex/detection-data")({
  component: DetectionDataScreen,
});

const mm = (v: number | null) => (v === null ? "—" : v.toFixed(2).replace(/\.00$/, ""));

function DetectionDataScreen() {
  const { capabilities } = useCrm();
  const flash = useFlash();
  useLocale();
  const role = capabilities?.role ?? null;
  const [saved, setSaved] = useState<DetectionRecord[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "denied" | "error">("loading");
  const [detail, setDetail] = useState<string | null>(null);
  const [filters, setFilters] = useState<DirectoryFilters>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<DetectionRecord | null>(null);
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<DetectionFieldErrors>({});
  const identity = useRef<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const rows = await fetchDetectionDirectory();
      setSaved(rows);
      setState("ready");
      setDetail(null);
    } catch (error) {
      const message = humanDetectionError(error);
      setDetail(message);
      setState(message === t("Réservé à l'administration Standex") ? "denied" : "error");
    }
  }, []);

  /* Changement de compte en vol : on ne garde jamais un annuaire lu par un
     autre utilisateur. Le brouillon en cours est conservé, la décision de
     l'enregistrer ou de l'abandonner reste explicite. */
  useEffect(() => {
    const who = capabilities?.userId ?? null;
    if (identity.current === who) return;
    identity.current = who;
    setSaved([]);
    if (role === "admin") void load();
    else setState(role === null ? "loading" : "denied");
  }, [capabilities?.userId, role, load]);

  const entries = useMemo(() => buildDirectory(saved), [saved]);
  const shown = useMemo(() => filterDirectory(entries, filters), [entries, filters]);
  const families = useMemo(
    () => [...new Set(entries.map((e) => e.record.sensorFamily))].sort(),
    [entries],
  );
  const magnets = useMemo(
    () => [...new Set(entries.map((e) => e.record.magnetId).filter((m) => m !== ""))].sort(),
    [entries],
  );
  const complete = entries.filter((e) => e.complete).length;

  const openEntry = (entry: DirectoryEntry) => {
    setDraft({ ...entry.record });
    setDraftVersion(entry.origin === "saved" ? entry.record.rowVersion : null);
    setErrors({});
  };

  const patch = (next: Partial<DetectionRecord>) => {
    setDraft((cur) => {
      if (!cur) return cur;
      const merged = { ...cur, ...next };
      if (next.approachId) merged.datum = datumForApproach(next.approachId);
      return merged;
    });
  };

  const save = async () => {
    if (!draft) return;
    const others = saved.filter((r) => detectionKey(r) !== detectionKey(draft));
    const found = validateDetectionRecord(draft, others);
    setErrors(found);
    if (hasErrors(found)) return;
    setPending(true);
    try {
      await saveDetectionRow(draft, draftVersion);
      // La réussite n'est annoncée qu'après réponse du serveur.
      await load();
      await loadDetectionData(true);
      flash(t("Ligne enregistrée. Les simulations utilisent la nouvelle valeur."));
      setDraft(null);
      setDraftVersion(null);
    } catch (error) {
      const version = detectionConflictVersion(error);
      setDetail(
        version === null
          ? humanDetectionError(error)
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
        {t(
          "Distances réelles d'activation et de relâchement, par combinaison exacte. Les plages du guide d'activation ne sont pas des seuils : elles ne figurent pas ici.",
        )}
      </p>
      {detail ? <p className="notice-warning t-caption">{detail}</p> : null}
      {state === "error" ? (
        <p className="notice-danger t-caption">
          {t("Annuaire non activé sur ce serveur")} — {t("aucune modification n'a été enregistrée")}
        </p>
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
          options={[...DETECTION_APPROACHES]}
          onChange={(v) => setFilters({ ...filters, approach: v })}
        />
        <FilterSelect
          id="dd-origin"
          label={t("Origine")}
          value={filters.origin}
          options={["compiled", "saved", "missing"]}
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
          onClick={() => setFilters(EMPTY_FILTERS)}
        >
          {t("Réinitialiser les filtres")}
        </Button>
      </section>

      <p className="t-caption text-muted-foreground">
        {shown.length} / {entries.length} {t("combinaisons")} · {complete}{" "}
        {t("avec deux distances réelles")}
      </p>

      {state === "loading" ? (
        <p className="t-caption text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden="true" />
          {t("Chargement…")}
        </p>
      ) : null}

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
                  <span className={e.complete ? "chip" : "chip"} data-state={e.complete}>
                    {e.complete
                      ? t("Complète")
                      : e.origin === "missing"
                        ? t("À compléter")
                        : t("Incomplète")}
                  </span>
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

      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          const first = realSensors()[0];
          if (first) openEntryFromScratch(first.id, first.name);
        }}
      >
        {t("Ajouter une combinaison")}
      </Button>

      {draft ? (
        <EditPanel
          draft={draft}
          errors={errors}
          pending={pending}
          onPatch={patch}
          onCancel={() => {
            setDraft(null);
            setDraftVersion(null);
          }}
          onSave={() => void save()}
        />
      ) : null}
    </div>
  );

  function openEntryFromScratch(family: string, reference: string) {
    setDraft(emptyRecordFor(family, reference));
    setDraftVersion(null);
    setErrors({});
  }
}

function FilterSelect({
  id,
  label,
  value,
  options,
  labels,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  labels?: Record<string, string>;
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
          <SelectItem value="all">
            {label} — {t("tout")}
          </SelectItem>
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
  onCancel,
  onSave,
}: {
  draft: DetectionRecord;
  errors: DetectionFieldErrors;
  pending: boolean;
  onPatch: (next: Partial<DetectionRecord>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const decimal = (key: "pullInMm" | "dropOutMm" | "temperatureC", raw: string) => {
    const parsed = parseDecimal(raw);
    if (parsed === "invalid") return;
    onPatch({ [key]: parsed } as Partial<DetectionRecord>);
  };
  const shown = (v: number | null) => (v === null ? "" : String(v));

  return (
    <section className="panel-block-lg space-y-3" aria-label={t("Modifier la ligne")}>
      <h3 className="t-title-s">{t("Modifier la ligne")}</h3>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label={t("Référence catalogue")} error={errors.sensorFamily}>
          <Select value={draft.sensorFamily} onValueChange={(v) => onPatch({ sensorFamily: v })}>
            <SelectTrigger className="min-h-11">
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
        </Field>
        <Field label={t("Référence imprimée")} error={errors.sensorReference}>
          <Input
            className="min-h-11"
            value={draft.sensorReference}
            onChange={(e) => onPatch({ sensorReference: e.target.value })}
          />
        </Field>
        <Field label={t("Nature de la colonne")}>
          <Select
            value={draft.classKind}
            onValueChange={(v) => onPatch({ classKind: v as DetectionRecord["classKind"] })}
          >
            <SelectTrigger className="min-h-11">
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
        </Field>
        <Field label={t("Classe ou modèle")} error={errors.sensitivityClass}>
          <Input
            className="min-h-11"
            value={draft.sensitivityClass}
            onChange={(e) => onPatch({ sensitivityClass: e.target.value })}
          />
        </Field>
        <Field label={t("Contact")}>
          <Select
            value={draft.contactForm}
            onValueChange={(v) => onPatch({ contactForm: v as DetectionRecord["contactForm"] })}
          >
            <SelectTrigger className="min-h-11">
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
        </Field>
        <Field label={t("Aimant")} error={errors.magnetId}>
          <Select value={draft.magnetId} onValueChange={(v) => onPatch({ magnetId: v })}>
            <SelectTrigger className="min-h-11">
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
        </Field>
        <Field label={t("Approche")} error={errors.approachId}>
          <Select
            value={draft.approachId}
            onValueChange={(v) => onPatch({ approachId: v as DetectionRecord["approachId"] })}
          >
            <SelectTrigger className="min-h-11">
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
        </Field>
        <Field label={t("Nature des distances")}>
          <Select
            value={draft.thresholdKind}
            onValueChange={(v) => onPatch({ thresholdKind: v as DetectionRecord["thresholdKind"] })}
          >
            <SelectTrigger className="min-h-11">
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
        </Field>
        <Field label={t("Activation (mm)")} error={errors.pullInMm}>
          <Input
            className="min-h-11"
            inputMode="decimal"
            value={shown(draft.pullInMm)}
            onChange={(e) => decimal("pullInMm", e.target.value)}
            placeholder={t("inconnu")}
          />
        </Field>
        <Field label={t("Relâchement (mm)")} error={errors.dropOutMm}>
          <Input
            className="min-h-11"
            inputMode="decimal"
            value={shown(draft.dropOutMm)}
            onChange={(e) => decimal("dropOutMm", e.target.value)}
            placeholder={t("inconnu")}
          />
        </Field>
        <Field label={t("Température (°C)")} error={errors.temperatureC}>
          <Input
            className="min-h-11"
            inputMode="decimal"
            value={shown(draft.temperatureC)}
            onChange={(e) => decimal("temperatureC", e.target.value)}
            placeholder={t("inconnu")}
          />
        </Field>
        <Field label={t("Nature de la source")} error={errors.sourceType}>
          <Input
            className="min-h-11"
            value={draft.sourceType}
            onChange={(e) => onPatch({ sourceType: e.target.value })}
            placeholder={t("fiche, essai, mesure")}
          />
        </Field>
        <Field label={t("Source précise")} error={errors.sourceRef}>
          <Input
            className="min-h-11"
            value={draft.sourceRef}
            onChange={(e) => onPatch({ sourceRef: e.target.value })}
            placeholder={t("document, page, rapport d'essai")}
          />
        </Field>
        <Field label={t("Date de saisie")} error={errors.enteredOn}>
          <Input
            className="min-h-11"
            value={draft.enteredOn}
            onChange={(e) => onPatch({ enteredOn: e.target.value })}
            placeholder="AAAA-MM-JJ"
          />
        </Field>
        <Field label={t("État")} error={errors.status}>
          <Select
            value={draft.status}
            onValueChange={(v) => onPatch({ status: v as DetectionRecord["status"] })}
          >
            <SelectTrigger className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">{t("Brouillon — non utilisé en simulation")}</SelectItem>
              <SelectItem value="validated">{t("Validée — utilisée en simulation")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <p className="notice-info t-caption">
        {t(
          "Un brouillon peut rester incomplet : il n'alimente aucune simulation. Une ligne validée porte une activation et un relâchement finis, le relâchement plus loin que l'activation.",
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onSave} disabled={pending}>
          {pending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : null}
          {t("Enregistrer")}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          {t("Annuler")}
        </Button>
      </div>
    </section>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="t-label">{label}</Label>
      {children}
      {error ? <p className="t-caption text-[color:var(--danger)]">{t(error)}</p> : null}
    </div>
  );
}
