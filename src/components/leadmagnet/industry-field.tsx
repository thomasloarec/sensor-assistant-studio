import { t } from "@/lib/i18n/core";
import { INDUSTRIES, isIndustry } from "@/lib/leadmagnet/industries";
import type { BusinessMeta } from "@/lib/leadmagnet/dossier";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
export function IndustryField({
  business,
  onChange,
}: {
  business: BusinessMeta;
  onChange: (patch: Partial<BusinessMeta>) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="project-industry" className="t-label">
        {t("Industrie")} *
      </Label>
      <select
        id="project-industry"
        required
        value={business.industry ?? ""}
        aria-describedby="industry-help"
        className="t-body min-h-11 w-full rounded-[var(--r-sm)] bg-[var(--surface-sunken)] p-3"
        onChange={(e) =>
          onChange({
            industry: isIndustry(e.target.value) ? e.target.value : null,
            industryConfirmed: isIndustry(e.target.value),
            industrySource: "user",
          })
        }
      >
        <option value="">{t("Choisir une industrie")}</option>
        {INDUSTRIES.map((i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </select>
      <p id="industry-help" className="t-caption">
        {t(
          "Choisissez l’industrie de l’application finale du projet, pas l’activité de votre entreprise.",
        )}
      </p>
      {business.industry && !business.industryConfirmed ? (
        <div className="panel-block notice-info space-y-2">
          <p className="t-body">
            {business.industrySource === "ai"
              ? t("Industrie suggérée : confirmez-la ou choisissez une autre industrie.")
              : t("Les réponses ont changé. Confirmez à nouveau l’industrie.")}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange({ industryConfirmed: true })}
          >
            {t("Confirmer cette industrie")}
          </Button>
        </div>
      ) : null}
      {business.industryConfirmed ? (
        <p role="status" className="t-caption">
          {t("Industrie confirmée")}
        </p>
      ) : null}
    </div>
  );
}
