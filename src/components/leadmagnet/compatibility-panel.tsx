/** Encart pédagogique de compatibilité, affiché AVANT les couples proposés.
 *
 * Présentation seule : aucune réponse n'est réécrite ici, aucun calcul n'est
 * fait. Les boutons ouvrent la question concernée du questionnaire et y placent
 * le curseur ; c'est la personne qui décide de ce qui change.
 */
import { Button } from "@/components/ui/button";
import { msg, t } from "@/lib/i18n/core";
import { FIT_PANEL, type FitAssessment, type FitIssue, type FitStep } from "@/lib/leadmagnet/application-fit";

const stepLabel = (step: FitStep) =>
  step.number === null
    ? t(step.label)
    : msg("Question {0} · {1}", [String(step.number), t(step.label)]);

function IssueBlock({ issue, onGoToStep }: { issue: FitIssue; onGoToStep: (key: string) => void }) {
  return (
    <section className="panel-block space-y-4" data-testid="fit-issue" data-issue={issue.id}>
      <h3 className="t-title-m">{t(issue.title)}</h3>

      <div className="space-y-1">
        <p className="t-label">{t(FIT_PANEL.works)}</p>
        <p className="t-body">{t(issue.whatWorks)}</p>
      </div>

      <div className="space-y-1">
        <p className="t-label">{t(FIT_PANEL.fails)}</p>
        <p className="t-body">
          {issue.whatFailsArgs.length
            ? msg(issue.whatFails, issue.whatFailsArgs)
            : t(issue.whatFails)}
        </p>
      </div>

      <div className="space-y-1">
        <p className="t-label">{t(FIT_PANEL.why)}</p>
        <p className="t-body">{t(issue.why)}</p>
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
        <p className="t-label">{t(FIT_PANEL.changes)}</p>
        <ul className="space-y-1">
          {issue.changes.map((c, i) => (
            <li key={i} className="t-body">
              <span className="t-label">{stepLabel(c.step)}</span> — {t(c.text)}
            </li>
          ))}
        </ul>
      </div>

      {issue.cautions.map((c) => (
        <p key={c} className="notice-warning t-body-s">
          {t(c)}
        </p>
      ))}

      <div className="space-y-2">
        <p className="t-label">{t(FIT_PANEL.review)}</p>
        <div className="flex flex-wrap gap-3">
          {issue.steps.map((s) =>
            s.number === null ? null : (
              <Button
                key={s.key}
                variant="outline"
                className="min-h-11 text-base"
                data-testid="fit-step-button"
                data-step={s.key}
                onClick={() => onGoToStep(s.key)}
              >
                {stepLabel(s)}
              </Button>
            ),
          )}
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
