import { isLocale, LANGUAGES, t, type Locale } from "@/lib/i18n/core";

export function responseLocale(value: unknown): Locale {
  return isLocale(value) ? value : "fr";
}
export function responseLanguageInstruction(value: unknown): string {
  const locale = responseLocale(value);
  const name = LANGUAGES.find((l) => l.id === locale)!.name;
  return `Language rule: write customer_response in ${name} (${locale}). Preserve product codes, numeric specifications and all qualifications. Include this exact localized follow-up phrase: "${t("Reprise Standex sous 2 jours ouvrés", locale)}". Also return validation_response_fr: a complete French version of the SAME customer response for the existing internal checks. All other internal fields and enum identifiers retain their existing French/canonical format. Do not include internal review text in customer_response. This language rule overrides any earlier request for a French customer_response.`;
}

export function hasLocalizedFollowUp(text: string, value: unknown): boolean {
  const locale = responseLocale(value);
  return (
    locale === "fr" ||
    text
      .toLocaleLowerCase()
      .includes(t("Reprise Standex sous 2 jours ouvrés", locale).toLocaleLowerCase())
  );
}
