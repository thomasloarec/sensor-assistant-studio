import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n/core";
import type { ReviewOperation } from "@/lib/leadmagnet/review-submit-state";
import { reviewOperationLabel } from "@/lib/leadmagnet/review-submit-state";

interface Props {
  busy: boolean;
  operation: ReviewOperation;
  ndaGuidance: string | null;
  canRefreshNda: boolean;
  authenticated: boolean;
  message: string | null;
  messageTone: "info" | "danger" | "success";
  onSubmit: () => void;
  onOpenNda: () => void;
  onRefreshNda: () => void;
}

export function ReviewSubmitControl({
  busy,
  operation,
  ndaGuidance,
  canRefreshNda,
  authenticated,
  message,
  messageTone,
  onSubmit,
  onOpenNda,
  onRefreshNda,
}: Props) {
  const busyLabel = reviewOperationLabel(operation);
  return (
    <div className="space-y-3">
      <Button
        size="lg"
        className="w-full sm:w-auto"
        onClick={onSubmit}
        disabled={busy}
        aria-busy={busy ? "true" : undefined}
        aria-describedby={
          ndaGuidance ? "review-submit-guidance" : message ? "review-submit-message" : undefined
        }
      >
        {busy ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <ShieldCheck className="mr-1 h-4 w-4" />
        )}{" "}
        {busy ? t(busyLabel ?? "Une opération est en cours…") : t("Transmettre à la revue Standex")}
      </Button>

      {ndaGuidance ? (
        <div id="review-submit-guidance" className="notice notice-warning space-y-3" role="status">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t(ndaGuidance)}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onOpenNda}>
              {t("Ouvrir Confidentialité et NDA")}
            </Button>
            {canRefreshNda ? (
              <Button type="button" size="sm" variant="outline" onClick={onRefreshNda}>
                {t("Actualiser le statut NDA")}
              </Button>
            ) : null}
          </div>
          {!authenticated ? (
            <p className="t-caption">
              {t("Connectez-vous ci-dessous pour préparer ou actualiser la vérification du NDA.")}
            </p>
          ) : null}
        </div>
      ) : null}

      {busy && busyLabel ? (
        <p className="notice notice-info" role="status" aria-live="polite">
          {t(busyLabel)}
        </p>
      ) : null}

      {message ? (
        <p
          id="review-submit-message"
          className={`notice ${
            messageTone === "success"
              ? "notice-success notice-success-sweep"
              : messageTone === "danger"
                ? "notice-danger"
                : "notice-info"
          }`}
          role={messageTone === "danger" ? "alert" : "status"}
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}