/** Encart pédagogique de compatibilité, affiché AVANT les couples proposés.
 *
 * Présentation seule : aucune réponse n'est réécrite ici, aucun calcul n'est
 * fait. Les boutons ouvrent la question concernée du questionnaire et y placent
 * le curseur ; c'est la personne qui décide de ce qui change.
 *
 * Mise en page : un statut (modalité inadaptée, étude d'ingénierie, information
 * manquante), une phrase de pourquoi avec les mots de la personne, une ou deux
 * actions câblées ; le raisonnement, les sources et les citations sont repliés.
 */
import { Button } from "@/components/ui/button";
import { msg, t } from "@/lib/i18n/core";
import { FIT_PANEL, type FitAssessment, type FitIssue, type FitStep } from "@/lib/leadmagnet/application-fit";

const stepLabel = (step: FitStep) =>
  step.number === null
    ? t(step.label)
    : msg("Question {0} · {1}", [String(step.number), t(step.label)]);

function StepButton({
  step,
  label,
  onGoToStep,
}: {
  step: FitStep;
  label: string;
  onGoToStep: (key: string) => void;
}) {
  return (
    <Button
      variant="outline"
      className="min-h-11 shrink-0 text-base"
      data-testid="fit-step-button"
      data-step={step.key}
      aria-label={`${label} — ${stepLabel(step)}`}
      onClick={() => onGoToStep(step.key)}
    >
      {label}
    </Button>
  );
}

/** Trois natures distinctes, jamais confondues à l'affichage. */
export type FitIssueKind = "modality" | "review" | "insufficient";
export function fitIssueKind(id: FitIssue["id"]): FitIssueKind {
  if (id === "extreme_temperature_review" || id === "extreme_gap_review") return "review";
  if (id === "no_meaningful_requirement") return "insufficient";
  return "modality";
}
/* i18n-canonical : statuts et libellés de l'encart. */
export const FIT_STATUS = {
  modality: "Technologie reed inadaptée telle que décrite",
  review: "Étude d'ingénierie Standex nécessaire",
  insufficient: "Informations insuffisantes",
  youWrote: "Vous avez écrit",
  nextSteps: "Prochaines étapes",
  details: "Détails techniques et sources",
  contact: "Contacter l'ingénierie Standex",
  reviewTitle: "Votre demande relève d'une étude d'ingénierie",
  reviewNote:
    "Ce n'est pas un refus : aucune gamme standard documentée ne couvre cette demande, mais votre projet peut être transmis à l'ingénierie Standex.",
  insufficientTitle: "Encore une information avant de proposer des capteurs",
} as const;
const STATUS_CLASS: Record<FitIssueKind, string> = {
  modality: "notice-warning",
  review: "notice-info",
  insufficient: "notice-info",
};

function IssueBlock({
  issue,
  onGoToStep,
  onContactStandex,
}: {
  issue: FitIssue;
  onGoToStep: (key: string) => void;
  onContactStandex?: (() => void) | undefined;
}) {
  const kind = fitIssueKind(issue.id);
  const first = issue.changes[0] ?? null;
  const quote = issue.evidence[0] ?? null;
  return (
    <section className="panel-block space-y-4" data-testid="fit-issue" data-issue={issue.id} data-kind={kind}>
      <p className={`${STATUS_CLASS[kind]} t-label inline-block`} data-testid="fit-status">
        {t(FIT_STATUS[kind])}
      </p>
      <h3 className="t-title-m">{t(issue.title)}</h3>
      {/* Pourquoi, en une phrase, avec les valeurs de la personne. */}
      <p className="t-body">
        {issue.whatFailsArgs.length ? msg(issue.whatFails, issue.whatFailsArgs) : t(issue.whatFails)}
      </p>
      {quote ? (
        <p className="t-body-s" data-testid="fit-quote">
          <span className="t-label">{t(FIT_STATUS.youWrote)}</span> — « {quote.quote} »
        </p>
      ) : null}

      {/* Une ou deux actions concrètes, toujours câblées. */}
      <div className="space-y-2">
        <p className="t-label">{t(FIT_STATUS.nextSteps)}</p>
        {first ? <p className="t-body-s">{t(first.text)}</p> : null}
        <div className="flex flex-wrap gap-3">
          {first ? (
            <StepButton step={first.step} label={t(FIT_PANEL.changeAction)} onGoToStep={onGoToStep} />
          ) : null}
          {kind !== "insufficient" && onContactStandex ? (
            <Button
              variant={kind === "review" ? "default" : "secondary"}
              className="min-h-11 text-base"
              data-testid="fit-contact-standex"
              onClick={onContactStandex}
            >
              {t(FIT_STATUS.contact)}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Le raisonnement complet reste disponible, replié. */}
      <details className="space-y-3" data-testid="fit-details">
        <summary className="t-label min-h-11 cursor-pointer">{t(FIT_STATUS.details)}</summary>
        <div className="mt-2 space-y-4">
          <div className="space-y-1">
            <p className="t-label">{t(FIT_PANEL.works)}</p>
            <p className="t-body-s">{t(issue.whatWorks)}</p>
          </div>
          <div className="space-y-1">
            <p className="t-label">{t(FIT_PANEL.why)}</p>
            <p className="t-body-s">{t(issue.why)}</p>
          </div>
          {issue.diagram.length ? (
            <div className="space-y-2" data-testid="fit-diagram">
              <p className="t-label">{t(FIT_PANEL.diagram)}</p>
              <ol className="flex flex-wrap items-center gap-2">
                {issue.diagram.map((node, i) => (
                  <li key={node} className="flex items-center gap-2">
                    {i > 0 ? <span aria-hidden="true">→</span> : null}
                    <span className="rounded-[var(--r-pill)] bg-[var(--surface-tint)] px-3 py-2 t-body-s">
                      {t(node)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {issue.changes.length > 1 ? (
            <div className="space-y-3">
              <p className="t-label">{t(FIT_PANEL.changes)}</p>
              <ul className="space-y-3">
                {issue.changes.slice(1).map((c, i) => (
                  <li key={i} className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="t-label">{stepLabel(c.step)}</p>
                      <p className="t-body-s">{t(c.text)}</p>
                    </div>
                    <StepButton step={c.step} label={t(FIT_PANEL.changeAction)} onGoToStep={onGoToStep} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {issue.cautions.map((c) => (
            <p key={c} className="notice-warning t-body-s">
              {t(c)}{" "}
              {/* Lien nommé vers la source Standex : jamais l'URL brute. */}
              <a
                className="underline underline-offset-2"
                href={FIT_PANEL.sourceUrl}
                target="_blank"
                rel="noreferrer"
                data-testid="fit-source-link"
              >
                {t(FIT_PANEL.sourceLabel)}
              </a>
            </p>
          ))}
          {issue.evidence.length ? (
            <div className="space-y-1" data-testid="fit-evidence">
              <p className="t-label">{t(FIT_PANEL.yourWords)}</p>
              <ul className="space-y-1">
                {issue.evidence.map((e, i) => (
                  <li key={`${e.step.key}-${i}`} className="t-body-s">
                    {/* La citation reste dans la langue de la personne : jamais traduite. */}
                    <span className="t-label">{stepLabel(e.step)}</span> — « {e.quote} »
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="space-y-2">
            <p className="t-label">{t(FIT_PANEL.review)}</p>
            <div className="flex flex-wrap gap-3">
              {issue.steps.map((st) => (
                <StepButton key={st.key} step={st} label={stepLabel(st)} onGoToStep={onGoToStep} />
              ))}
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}

export interface CompatibilityPanelProps {
  assessment: FitAssessment;
  /** Ouvre la question demandée et y place le curseur. */
  onGoToStep: (key: string) => void;
  /** Ouvre l'envoi du projet à Standex (contexte, contact) : le prospect n'est jamais perdu. */
  onContactStandex?: (() => void) | undefined;
  /** Vrai seulement après qu'un point a réellement été levé dans cette session. */
  showResolved?: boolean;
}

export function CompatibilityPanel({
  assessment,
  onGoToStep,
  onContactStandex,
  showResolved = false,
}: CompatibilityPanelProps) {
  if (!assessment.issues.length)
    return showResolved ? (
      <p className="notice-success t-body" data-testid="fit-resolved" role="status">
        {t(FIT_PANEL.resolved)}
      </p>
    ) : null;
  const kinds = new Set(assessment.issues.map((i) => fitIssueKind(i.id)));
  const onlyReview = kinds.size === 1 && kinds.has("review");
  const onlyInsufficient = kinds.size === 1 && kinds.has("insufficient");
  const title = onlyReview
    ? FIT_STATUS.reviewTitle
    : onlyInsufficient
      ? FIT_STATUS.insufficientTitle
      : assessment.issues.length > 1
        ? FIT_PANEL.titleMany
        : FIT_PANEL.titleOne;
  return (
    <div className="panel-block-lg space-y-5" data-testid="fit-panel" data-kinds={[...kinds].join(" ")}>
      <h2 className="t-display-m">{t(title)}</h2>
      {onlyReview ? <p className="t-body">{t(FIT_STATUS.reviewNote)}</p> : null}
      {assessment.issues.map((issue) => (
        <IssueBlock key={issue.id} issue={issue} onGoToStep={onGoToStep} onContactStandex={onContactStandex} />
      ))}
      <p className="t-caption">{t(FIT_PANEL.noRewrite)}</p>
      {kinds.has("modality") ? <p className="t-caption">{t(FIT_PANEL.noProducts)}</p> : null}
    </div>
  );
}
