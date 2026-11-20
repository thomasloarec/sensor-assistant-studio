/* i18n-canonical: labels and safe error keys are translated at rendering. */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { t, msg, localeTag } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/react";
import { supabase } from "@/lib/standex/supabase";
import { summarizeUsage, FUNNELS, type UsageReport, type UsageView } from "@/lib/usage/model";

export const USAGE_LABELS: Record<string, string> = {
  visit: "Visiteurs observés",
  project_started: "Parcours démarrés",
  suggestions_viewed: "Couples proposés consultés",
  workshop_opened: "Atelier ouvert",
  workshop_ready: "Atelier prêt",
  workshop_active: "Actifs dans l’atelier",
  trial_started: "Essai lancé",
  result_viewed: "Résultats après essai",
  import_clicked: "Clic sur Importer",
  import_selected: "Fichier sélectionné",
  import_ready: "Imports personnels réussis",
  parts_defined: "Pièces mobiles définies",
  motion_confirmed: "Mouvement confirmé",
  installation_completed: "Installation effectuée",
  contact_viewed: "Avec Standex",
  submission_attempted: "Envoi tenté",
  submission_pending: "Projet enregistré",
  submission_confirmed: "Utilisateurs ayant transmis",
  question_1: "Application",
  question_2: "Pièce à détecter",
  question_3: "Mouvement",
  question_4: "Montage",
  question_5: "Électrique",
  question_6: "Environnement",
  result_unavailable: "Estimation indisponible",
  import_failed: "Import du modèle refusé",
  submission_blocked: "Informations à compléter",
  submission_failed: "Échec de l’envoi",
  render_failed: "Affichage 3D interrompu",
  suggestions_empty: "Aucun couple proposé",
  questions: "Questionnaire",
  suggestions: "Couples proposés",
  workshop: "Atelier, avant résultat",
  result: "Résultat et configuration",
  contact: "Avec Standex, sans envoi abouti",
  pending: "Vérification d’email en attente",
  expired: "Vérification d’email expirée",
  submitted: "Transmission confirmée",
};
/* i18n-canonical: translated when rendered. */
const VIEWS: { id: UsageView; label: string }[] = [
  { id: "global", label: "Vue globale" },
  { id: "questions", label: "Les 6 questions" },
  { id: "import", label: "Import personnel" },
  { id: "contact", label: "Avec Standex" },
];
export type UsageLoader = (days: number) => Promise<UsageReport>;
/* i18n-canonical: safe error keys translated when rendered. */
export const loadUsageReport: UsageLoader = async (days) => {
  if (!supabase) throw Error("Le suivi des usages n’est pas encore disponible.");
  const { data, error } = await supabase.rpc("product_usage_report", { _days: days });
  if (error)
    throw Error(
      error.message?.includes("PERIOD_TOO_LARGE")
        ? "Choisissez une période plus courte."
        : "Le suivi des usages n’est pas encore disponible.",
    );
  if (!data || !Array.isArray(data.sessions))
    throw Error("Le suivi des usages n’est pas encore disponible.");
  return data as UsageReport;
};
export function ProductUsage({
  sessionGeneration = 0,
  loadReport = loadUsageReport,
}: {
  sessionGeneration?: number;
  loadReport?: UsageLoader;
}) {
  const locale = useLocale();
  const tag = localeTag(locale);
  const [days, setDays] = useState(7),
    [view, setView] = useState<UsageView>("global"),
    [reload, setReload] = useState(0);
  const [report, setReport] = useState<UsageReport | null>(null),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setReport(null);
    setError(null);
    setLoading(true);
    /* i18n-canonical: safe error keys translated when rendered. */
    void loadReport(days)
      .then((data) => {
        if (live) setReport(data);
      })
      .catch((err) => {
        if (live)
          setError(
            err instanceof Error && err.message === "Choisissez une période plus courte."
              ? err.message
              : "Le suivi des usages n’est pas encore disponible.",
          );
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [days, reload, sessionGeneration, loadReport]);
  const n = (x: number) => new Intl.NumberFormat(tag).format(x);
  const percent = (a: number, b: number) =>
    b
      ? new Intl.NumberFormat(tag, { style: "percent", maximumFractionDigits: 0 }).format(a / b)
      : "—";
  const summary = report ? summarizeUsage(report) : null;
  const count = (key: string) => summary?.counts[key] ?? 0;
  const cards = ["visit", "project_started", "workshop_active", "import_ready", "result_viewed", "submission_confirmed"];
  return (
    <section
      role="tabpanel"
      id="panel-usage"
      aria-labelledby="tab-usage"
      className="space-y-5"
      aria-busy={loading}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="t-title-m">{t("Usage produit")}</h2>
          <p className="t-body mt-2">
            {t("Comprendre les premières utilisations de Sensor Studio.")}
          </p>
        </div>
        <Button variant="outline" onClick={() => setReload((v) => v + 1)} disabled={loading}>
          {t("Actualiser")}
        </Button>
      </header>
      <div className="flex flex-wrap items-center gap-4">
        <label className="t-body flex items-center gap-3">
          {t("Période")}
          <select
            className="min-h-11 rounded-[var(--r-sm)] bg-[var(--surface-sunken)] px-4 py-2"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[7, 30, 90].map((d) => (
              <option key={d} value={d}>
                {msg("{0} derniers jours", [n(d)])}
              </option>
            ))}
          </select>
        </label>
        {report ? (
          <span className="t-caption">
            {new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeZone: "Europe/Paris" }).format(
              new Date(report.since),
            )}{" "}
            —{" "}
            {new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeZone: "Europe/Paris" }).format(
              new Date(report.now),
            )}
          </span>
        ) : null}
      </div>
      <p className="notice-info t-body">
        {t(
          "Usages ayant autorisé la mesure. Tests internes et comptes Standex exclus. Un navigateur peut représenter plusieurs personnes ; une personne peut utiliser plusieurs navigateurs.",
        )}
      </p>
      {loading ? (
        <p className="t-body" role="status">
          {t("Chargement…")}
        </p>
      ) : null}
      {error ? (
        <p className="notice-warning" role="alert">
          {t(error)}
        </p>
      ) : null}
      {summary && report ? (
        <>
          {!report.sessions.length ? (
            <p className="notice-info">
              {t(
                "Aucun usage mesuré sur cette période. Les chiffres apparaîtront après les premières utilisations autorisées.",
              )}
            </p>
          ) : null}
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            {cards.map((key) => (
              <div key={key} className="panel-block">
                <dt className="t-caption">{t(USAGE_LABELS[key]!)}</dt>
                <dd className="t-title-l t-metric mt-2">{n(count(key))}</dd>
                <p className="t-caption mt-2">{t("Navigateurs distincts")}</p>
              </div>
            ))}
          </dl>
          <section className="panel-block-lg space-y-5">
            <div>
              <h3 className="t-title-s">{t("Jusqu’où vont les utilisateurs ?")}</h3>
              <p className="t-caption mt-2">
                {t("Utilisateurs distincts ayant franchi chaque étape, dans l’ordre.")}
              </p>
            </div>
            <div
              className="segmented"
              role="group"
              aria-label={t("Parcours à examiner")}
              style={{
                ["--seg-count" as string]: 4,
                ["--seg" as string]: VIEWS.findIndex((v) => v.id === view),
              }}
            >
              <span className="segmented-thumb" aria-hidden="true" />
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="segmented-item"
                  data-active={view === v.id ? "true" : undefined}
                  aria-pressed={view === v.id}
                  onClick={() => setView(v.id)}
                >
                  {t(v.label)}
                </button>
              ))}
            </div>
            <div aria-live="polite" className="space-y-4">
              {FUNNELS[view].map((key, i) => {
                const values = summary.funnel[view];
                return (
                  <div
                    key={key}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                  >
                    <span className="t-body">{t(USAGE_LABELS[key]!)}</span>
                    <div className="progress-mini hidden sm:block" aria-hidden="true">
                      <span
                        style={{ width: `${values[0] ? (100 * values[i]!) / values[0] : 0}%` }}
                      />
                    </div>
                    <span className="t-metric t-body">
                      {n(values[i]!)}{" "}
                      <span className="t-caption">
                        {i ? `· ${percent(values[i]!, values[i - 1]!)}` : ""}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="t-caption">
              {t(
                "Le pourcentage indique le passage depuis l’étape précédente. Une absence de suite ne prouve pas un blocage.",
              )}
            </p>
            {view === "global" ? (
              <p className="notice-info">
                {msg("{0} utilisateurs ont choisi le contact direct sans ouvrir l’atelier.", [
                  n(summary.direct),
                ])}
              </p>
            ) : null}
            {view === "questions" ? (
              <p className="t-caption">
                {msg(
                  "{0} utilisateurs ont choisi « Je ne sais pas encore » sur au moins une question.",
                  [n(count("question_skipped"))],
                )}
              </p>
            ) : null}
            {view === "import" ? (
              <p className="t-caption">
                {t(
                  "Modèles personnels uniquement. Chaque parcours suit un même import ; les démonstrations sont exclues.",
                )}
              </p>
            ) : null}
            {view === "contact" ? (
              <p className="t-caption">
                {msg(
                  "{0} rapports PDF générés. La transmission est confirmée par le serveur ; un projet enregistré peut encore attendre la vérification d’email.",
                  [n(count("pdf_generated"))],
                )}
              </p>
            ) : null}
            <details>
              <summary className="t-caption min-h-11 cursor-pointer">
                {t("Comment lire ces chiffres")}
              </summary>
              <p className="t-body">
                {t(
                  "Les parcours suivent un même projet dans une même session. Une session se termine après 30 minutes d’inactivité. Les transmissions différées restent rattachées à leur session d’origine ; les périodes récentes peuvent encore évoluer.",
                )}
              </p>
            </details>
          </section>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="panel-block-lg space-y-4">
              <h3 className="t-title-s">{t("Où s’arrêtent-ils ?")}</h3>
              <p className="t-caption">
                {t(
                  "Dernière étape du dernier projet de chaque session close. Une personne peut avoir plusieurs sessions.",
                )}
              </p>
              <dl className="space-y-3">
                {Object.entries(summary.stops).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-4">
                    <dt className="t-body">{t(USAGE_LABELS[key]!)}</dt>
                    <dd className="t-metric">{n(value)}</dd>
                  </div>
                ))}
              </dl>
              <p className="t-caption">
                {msg("{0} sessions encore actives, exclues des points d’arrêt.", [
                  n(summary.active),
                ])}
              </p>
            </section>
            <section className="panel-block-lg space-y-4">
              <h3 className="t-title-s">{t("Difficultés rencontrées")}</h3>
              <p className="t-caption">
                {t(
                  "Personnes touchées, même après une reprise. Les catégories peuvent se recouper.",
                )}
              </p>
              {summary.problems.map((p) => (
                <details key={p.name}>
                  <summary className="min-h-11 cursor-pointer t-body">
                    {t(USAGE_LABELS[p.name]!)} <span className="t-metric">· {n(p.count)}</span>
                  </summary>
                  <p className="t-caption">
                    {p.name === "result_unavailable"
                      ? t("Une estimation indisponible n’est pas une détection négative valide.")
                      : msg("{0} utilisateurs ont ensuite réussi cette étape.", [n(p.recovered)])}
                  </p>
                </details>
              ))}
            </section>
          </div>
        </>
      ) : null}
    </section>
  );
}
