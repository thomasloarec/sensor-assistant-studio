/** Encart pédagogique de compatibilité, affiché AVANT les couples proposés.
 *
 * Présentation seule : aucune réponse n'est réécrite ici, aucun calcul n'est
 * fait. Les boutons ouvrent la question concernée du questionnaire et y placent
 * le curseur ; c'est la personne qui décide de ce qui change.
 *
 * Mise en page : un résumé court et visuellement séparé (ce qui fonctionne / ce
 * qui ne fonctionne pas), puis les adaptations possibles avec, à côté de chaque
 * adaptation, le bouton qui ouvre la réponse visée. Les citations restent
 * disponibles mais repliées, pour ne pas noyer l'essentiel.
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

function IssueBlock({ issue, onGoToStep }: { issue: FitIssue; onGoToStep: (key: string) => void }) {
  return (
    <section className="panel-block space-y-5" data-testid="fit-issue" data-issue={issue.id}>
      <h3 className="t-title-m">{t(issue.title)}</h3>

      {/* Résumé : deux blocs courts, côte à côte dès qu'il y a la place. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[var(--r-m)] bg-[var(--surface-tint)] p-4 space-y-1">
          <p className="t-label">{t(FIT_PANEL.works)}</p>
          <p className="t-body-s">{t(issue.whatWorks)}</p>
        </div>
        <div className="rounded-[var(--r-m)] bg-[var(--surface-sunken)] p-4 space-y-1">
          <p className="t-label">{t(FIT_PANEL.fails)}</p>
          <p className="t-body-s">
            {issue.whatFailsArgs.length
              ? msg(issue.whatFails, issue.whatFailsArgs)
              : t(issue.whatFails)}
          </p>
        </div>
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

      {/* Adaptations : chaque ligne porte son propre bouton d'édition. */}
      <div className="space-y-3">
        <p className="t-label">{t(FIT_PANEL.changes)}</p>
        <ul className="space-y-3">
          {issue.changes.map((c, i) => (
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
        <details className="space-y-2" data-testid="fit-evidence">
          <summary className="t-label min-h-11 cursor-pointer">{t(FIT_PANEL.yourWords)}</summary>
          <ul className="mt-2 space-y-1">
            {issue.evidence.map((e, i) => (
              <li key={`${e.step.key}-${i}`} className="t-body-s">
                {/* La citation reste dans la langue de la personne : jamais traduite. */}
                <span className="t-label">{stepLabel(e.step)}</span> — « {e.quote} »
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="space-y-2">
        <p className="t-label">{t(FIT_PANEL.review)}</p>
        <div className="flex flex-wrap gap-3">
          {issue.steps.map((s) => (
            <StepButton key={s.key} step={s} label={stepLabel(s)} onGoToStep={onGoToStep} />
          ))}
        </div>
      </div>
    </section>
  );
}

export interface CompatibilityPanelProps {
  assessment: FitAssessment;
  /** Ouvre la question demandée et y place le curseur. */
  onGoToStep: (key: string) => void;
  /** Vrai seulement après qu'un point a réellement été levé dans cette session. */
  showResolved?: boolean;
}

export function CompatibilityPanel({
  assessment,
  onGoToStep,
  showResolved = false,
}: CompatibilityPanelProps) {
  if (!assessment.issues.length)
    return showResolved ? (
      <p className="notice-success t-body" data-testid="fit-resolved" role="status">
        {t(FIT_PANEL.resolved)}
      </p>
    ) : null;

  return (
    <div className="panel-block-lg space-y-5" data-testid="fit-panel">
      <div className="space-y-2">
        <h2 className="t-display-m">
          {t(assessment.issues.length > 1 ? FIT_PANEL.titleMany : FIT_PANEL.titleOne)}
        </h2>
        <p className="t-body">{t(FIT_PANEL.intro)}</p>
      </div>
      {assessment.issues.map((issue) => (
        <IssueBlock key={issue.id} issue={issue} onGoToStep={onGoToStep} />
      ))}
      <p className="t-caption">{t(FIT_PANEL.noRewrite)}</p>
      <p className="notice-info t-body-s">{t(FIT_PANEL.noProducts)}</p>
    </div>
  );
}
