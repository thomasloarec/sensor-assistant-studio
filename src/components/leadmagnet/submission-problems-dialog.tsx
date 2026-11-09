import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/react";
import { ndaAllowsConfidentialTransfer, type NdaState } from "@/lib/leadmagnet/nda";
import { missingNdaFields } from "@/lib/leadmagnet/nda-docx";

export function SubmissionProblemsDialog({ problems, nda, onClose, onOpenNda }: {
  problems: readonly string[] | null;
  nda: NdaState;
  onClose: () => void;
  onOpenNda: () => void;
}) {
  useLocale();
  const ndaBlocked = !ndaAllowsConfidentialTransfer(nda);
  const missing = ndaBlocked ? missingNdaFields(nda.fields) : [];
  return (
    <Dialog open={problems !== null} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Informations à compléter avant l'envoi")}</DialogTitle>
          <DialogDescription>{t("Votre projet n'a pas été envoyé. Complétez les éléments suivants, puis réessayez.")}</DialogDescription>
        </DialogHeader>
        <ul className="list-disc pl-5 space-y-2 t-body">
          {[...new Set(problems ?? [])].map(problem => <li key={problem}>{t(problem)}</li>)}
        </ul>
        {missing.length ? <section className="notice-warning space-y-2">
          <h3 className="t-title-s">{t("Informations NDA à compléter")}</h3>
          <ul className="list-disc pl-5 space-y-2 t-body">
            {missing.map(label => <li key={label}>{t(label)}</li>)}
          </ul>
        </section> : null}
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={onClose}>{t("Revenir à mon projet")}</Button>
          {ndaBlocked ? <Button onClick={() => { onClose(); requestAnimationFrame(onOpenNda); }}>{t("Ouvrir Confidentialité et NDA")}</Button> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
