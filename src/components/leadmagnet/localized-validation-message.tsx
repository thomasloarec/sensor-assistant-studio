import { useLocale } from "@/lib/i18n/react";
import { msg, t } from "@/lib/i18n/core";

export function localizedValidationText(value: string): string {
  try {
    const parsed = JSON.parse(value) as { kind?: string; fields?: string[] };
    if (parsed.kind === "nda-missing" && Array.isArray(parsed.fields))
      return msg("Champs à compléter avant génération : {0}.", [
        parsed.fields.map((field) => t(field)).join(", "),
      ]);
    if (parsed.kind === "connector-missing" && Array.isArray(parsed.fields))
      return msg("Champs requis : {0}.", [
        parsed.fields.map((field) => t(field)).join(", "),
      ]);
  } catch {
    // Canonical UI keys are translated below; user-entered values never use this path.
  }
  return t(value);
}

/** Re-renders an already visible validation message when the interface locale changes. */
export function LocalizedValidationMessage({ value }: { value: string }) {
  useLocale();
  return <>{localizedValidationText(value)}</>;
}