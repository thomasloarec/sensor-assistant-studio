import { t } from "@/lib/i18n/core";
import { INDUSTRIES, isIndustry } from "@/lib/leadmagnet/industries";
import type { BusinessMeta } from "@/lib/leadmagnet/dossier";
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
    </div>
  );
}
