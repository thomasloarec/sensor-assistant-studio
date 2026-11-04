import { isLocale, t } from "@/lib/i18n/core";

/** Shared country names for prospect, territory, industry and CRM displays. */
export function countryDisplayName(code: string, locale: string): string {
  const language = locale.split("-")[0];
  if (code === "CZ" && isLocale(language))
    return t("République tchèque (Tchéquie)", language);
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
