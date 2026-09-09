/** Briques communes de l'espace de travail interne : états d'attente, de vide et
 *  d'erreur, libellés d'étape, valeurs inconnues affichées comme telles.
 *
 *  Aucune valeur littérale de couleur ou de durée : uniquement les jetons du
 *  socle de design.
 */
import { t } from "@/lib/i18n/core";
import { Button } from "@/components/ui/button";
import { AvatarInitials } from "@/components/standex/dashboard/avatar-initials";
import {
  CRM_STAGES,
  CRM_STAGE_LABEL,
  annualRevenue,
  annualVolume,
  formatAmount,
  formatPercent,
  marginPercent,
  personFullName,
  taskOverdueDays,
  type CrmPerson,
  type CrmProject,
  type CrmStage,
  type CrmTask,
  type TaskStatus,
} from "@/lib/leadmagnet/crm";

export const stageLabel = (stage: CrmStage) => t(CRM_STAGE_LABEL[stage]);
export const ALL_STAGES = CRM_STAGES;


/* i18n-canonical : libellés canoniques traduits par t() au rendu. */
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "À faire",
  in_progress: "En cours",
  blocked: "Bloqué",
  done: "Terminé",
  not_applicable: "Sans objet",
};

export const STAKEHOLDER_LABEL: Record<string, string> = {
  sales: "Commercial",
  fae: "FAE",
  client: "Client",
};

/** Une valeur absente est écrite « inconnu » : jamais remplacée par zéro. */
export function UnknownValue({ reason }: { reason?: string }) {
  return (
    <span className="text-muted-foreground">
      {t("inconnu")}
      {reason ? ` — ${reason}` : ""}
    </span>
  );
}

export function marginReasonText(reason: string): string {
  switch (reason) {
    case "no_price":
      return t("prix de vente non renseigné");
    case "zero_price":
      return t("prix de vente nul : la marge ne peut pas être calculée");
    case "cost_in_sap":
      return t("coût suivi dans SAP");
    default:
      return t("coût unitaire non renseigné");
  }
}

export function MarginCell({ project, locale }: { project: CrmProject; locale: string }) {
  const margin = marginPercent(project);
  if (!margin.known) return <UnknownValue reason={marginReasonText(margin.reason)} />;
  return <span className="t-metric">{formatPercent(margin.value, locale)}</span>;
}

/** La provenance n'occupe le premier plan que lorsqu'elle signale une
 *  exception. Le cas ordinaire reste lisible au survol et pour les lecteurs
 *  d'écran : rien n'est perdu, seule la répétition disparaît. */
export function RevenueCell({ project, locale }: { project: CrmProject; locale: string }) {
  const revenue = annualRevenue(project);
  if (!revenue.known) return <UnknownValue />;
  const notes: string[] = [];
  if (revenue.value.source === "manual_estimate") notes.push(t("estimation saisie"));
  if (!revenue.value.currency) notes.push(t("devise non renseignée"));
  const amount = formatAmount(revenue.value.amount, revenue.value.currency, locale);
  return (
    <span className="t-metric" title={notes.length > 0 ? notes.join(" — ") : undefined}>
      {amount}
      {notes.length > 0 ? (
        <span className="t-caption text-muted-foreground"> — {notes.join(" — ")}</span>
      ) : null}
    </span>
  );
}

export function VolumeCell({ project }: { project: CrmProject }) {
  const volume = annualVolume(project);
  if (!volume.known) return <UnknownValue />;
  const exception = volume.value.source === "override";
  const note = exception
    ? t("capteurs/an — corrigé à la main")
    : t("capteurs/an — dernière version envoyée");
  return (
    <span className="t-metric" title={note}>
      {volume.value.sensorsPerYear}{" "}
      {exception ? (
        <span className="t-caption text-muted-foreground">{note}</span>
      ) : (
        <span className="sr-only">{note}</span>
      )}
    </span>
  );
}

export function personName(directory: readonly CrmPerson[], id: string | null): string {
  if (!id) return t("non attribué");
  const person = directory.find((p) => p.id === id);
  return person ? personFullName(person) : t("personne retirée de l'annuaire");
}

/** Teinte d'une étape : trois couleurs d'état seulement, jamais une de plus. */
function stageTone(stage: CrmStage): "blue" | "success" | "warning" | "muted" {
  if (stage === "closed_won") return "success";
  if (stage === "on_hold") return "warning";
  if (stage === "closed_lost" || stage === "dead") return "muted";
  return "blue";
}

/** Pastille d'étape : le libellé anglais reste aligné sur SAP, la teinte
 *  n'ajoute qu'un repère de balayage. */
export function StagePill({ stage }: { stage: CrmStage }) {
  return (
    <span className="stage-pill" data-tone={stageTone(stage)}>
      {stageLabel(stage)}
    </span>
  );
}

const CYCLE_STEP: Partial<Record<CrmStage, number>> = {
  lead: 1,
  qualification: 2,
  solution_quote: 3,
  negotiate: 4,
  closed_won: 4,
};

/** Jauge de cycle : quatre barres inclinées de la marque. Décorative
 *  (`aria-hidden`) — le sens est porté par la pastille. */
export function StageGauge({ stage }: { stage: CrmStage }) {
  const filled = CYCLE_STEP[stage];
  if (!filled) return null;
  const tone = stage === "closed_won" ? "success" : "blue";
  return (
    <span className="stage-gauge" aria-hidden="true" data-tone={tone}>
      {[0, 1, 2, 3].map((i) => (
        <i key={i} data-on={i < filled ? "true" : "false"} />
      ))}
    </span>
  );
}

/** Nom du pays dans la langue de lecture ; à défaut, le code tel quel. */
export function countryName(code: string | null | undefined, locale: string): string | null {
  const raw = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(raw)) return raw || null;
  try {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    return names.of(raw) ?? raw;
  } catch {
    return raw;
  }
}

/** Drapeau décoratif + NOM du pays lisible : le drapeau seul n'est pas une information. */
export function CountryCell({ code, locale }: { code: string | null; locale: string }) {
  const raw = (code ?? "").trim().toUpperCase();
  const name = countryName(raw, locale);
  if (!name) return <UnknownValue reason={t("pays non renseigné")} />;
  const flag = /^[A-Z]{2}$/.test(raw)
    ? String.fromCodePoint(...[...raw].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : null;
  return (
    <span className="inline-flex items-center gap-2">
      {flag ? <span aria-hidden="true">{flag}</span> : null}
      <span>{name}</span>
    </span>
  );
}

/** Attente : des formes qui annoncent le contenu, et une phrase pour les
 *  lecteurs d'écran. Les appels sans propriété gardent leur comportement. */
export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  const heights = ["h-5", "h-4", "h-4", "h-3"];
  return (
    <div className="space-y-2" aria-busy="true">
      <span className="sr-only">{t("Chargement…")}</span>
      {Array.from({ length: Math.max(1, rows) }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={`skeleton ${heights[i % heights.length]} ${i % 2 === 0 ? "w-full" : "w-4/5"}`}
        />
      ))}
    </div>
  );
}

export function EmptyBlock({
  text,
  title,
  action,
}: {
  text: string;
  title?: string;
  action?: React.ReactNode;
}) {
  if (!title && !action)
    return <p className="panel-block text-sm text-muted-foreground">{text}</p>;
  return (
    <div className="panel-block flex flex-col items-center gap-2 text-center">
      <span className="standex-bar" aria-hidden="true" />
      {title ? <p className="t-title-s">{title}</p> : null}
      <p className="t-body text-muted-foreground">{text}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function ErrorBlock({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="notice-danger anim-rise space-y-2 text-sm" role="alert">
      <p>{text}</p>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          {t("Réessayer")}
        </Button>
      ) : null}
    </div>
  );
}

/** Message d'indisponibilité de l'espace de travail interne.
 *
 *  Le visiteur ordinaire lit une phrase simple. Le diagnostic technique
 *  (nom de fichier de migration, procédure serveur, message d'erreur brut)
 *  n'est affiché qu'aux administrateurs.
 */
export function CrmUnavailableNotice({
  plain,
  detail,
  isAdmin,
  children,
}: {
  plain: string;
  detail?: string | null;
  isAdmin: boolean;
  children?: React.ReactNode;
}) {
  return (
    <p className="notice-warning text-sm">
      {plain}
      {children ? <> {children}</> : null}
      {isAdmin && detail ? (
        <>
          {" "}
          <span className="t-caption block">
            {t("Diagnostic (administration) :")} {t(detail)}
          </span>
        </>
      ) : null}
    </p>
  );
}

/** Champ interne : il n'est jamais montré au client et se rédige en anglais,
 *  langue commune de l'équipe et de SAP. */
export function InternalEnglishHint() {
  return (
    <span className="t-caption block text-muted-foreground">
      {t("Interne — à rédiger en anglais")}
    </span>
  );
}

/** Champ destiné au client : il se rédige dans la langue enregistrée du projet. */
export function ClientLocaleHint({ locale }: { locale: string }) {
  return (
    <span className="t-caption block text-muted-foreground">
      {t("Vu par le client — langue enregistrée du projet :")} {locale}
    </span>
  );
}
