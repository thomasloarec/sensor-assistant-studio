import { useId } from "react";
import type { BusinessMeta } from "@/lib/leadmagnet/dossier";
import { t } from "@/lib/i18n/core";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IndustryField } from "./industry-field";
import { SiteLocation } from "./site-location";

export function ProjectContactFields({
  business,
  onChange,
}: {
  business: BusinessMeta;
  onChange: (patch: Partial<BusinessMeta>) => void;
}) {
  const id = useId();
  return (
    <>
      {(
        [
          ["contactName", "Nom", "text"],
          ["contactCompany", "Entreprise", "text"],
        ] as const
      ).map(([key, label, type]) => (
        <div key={key}>
          <Label htmlFor={`${id}-${key}`} className="t-label">
            {t(label)}
          </Label>
          <Input
            id={`${id}-${key}`}
            className="mt-2 w-full"
            type={type}
            value={business[key] ?? ""}
            onChange={(e) => onChange({ [key]: e.target.value || null })}
          />
        </div>
      ))}
      <IndustryField business={business} onChange={onChange} />
      <div>
        <Label htmlFor={`${id}-email`} className="t-label">
          {t("E-mail professionnel")}
        </Label>
        <Input
          id={`${id}-email`}
          className="mt-2 w-full"
          type="email"
          value={business.contactEmail ?? ""}
          onChange={(e) => onChange({ contactEmail: e.target.value || null })}
        />
      </div>
      <div>
        <Label htmlFor={`${id}-phone`} className="t-label">
          {t("Numéro de téléphone")}
        </Label>
        <Input
          id={`${id}-phone`}
          type="tel"
          autoComplete="tel"
          maxLength={80}
          value={business.contactPhone ?? ""}
          onChange={(e) => onChange({ contactPhone: e.target.value || null })}
        />
      </div>
      <SiteLocation business={business} onChange={onChange} />
    </>
  );
}
