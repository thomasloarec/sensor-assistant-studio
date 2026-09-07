import messages from "./messages.json";

export const LANGUAGES = [
  { id: "fr", name: "Français", tag: "fr-FR" },
  { id: "en", name: "English", tag: "en-GB" },
  { id: "zh", name: "简体中文", tag: "zh-CN" },
  { id: "de", name: "Deutsch", tag: "de-DE" },
  { id: "es", name: "Español", tag: "es-ES" },
  { id: "ru", name: "Русский", tag: "ru-RU" },
  { id: "it", name: "Italiano", tag: "it-IT" },
  { id: "ja", name: "日本語", tag: "ja-JP" },
] as const;
export type Locale = (typeof LANGUAGES)[number]["id"];
export const LOCALE_KEY = "standex.language.v1";
export const isLocale = (value: unknown): value is Locale => LANGUAGES.some((l) => l.id === value);
let selected: Locale = "fr";
let initialized = false;
const listeners = new Set<() => void>();
export function getLocale(): Locale {
  if (typeof window === "undefined") return "fr";
  if (!initialized) {
    initialized = true;
    try {
      const value = localStorage.getItem(LOCALE_KEY);
      if (isLocale(value)) selected = value;
    } catch {
      /* Storage can be disabled. */
    }
  }
  return selected;
}
export function setLocale(locale: Locale) {
  if (!isLocale(locale)) return;
  initialized = true;
  selected = locale;
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    /* The current tab still works. */
  }
  listeners.forEach((l) => l());
}
export function subscribeLocale(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export const localeTag = (locale = getLocale()) => LANGUAGES.find((l) => l.id === locale)!.tag;
export const number = (value: number, maximumFractionDigits = 2, locale = getLocale()) =>
  new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits }).format(value);
type Translations = Record<string, readonly string[]>;
const dictionary: Translations = messages;
const frenchLabels: Readonly<Record<string, string>> = {
  draft: "Brouillon",
  in_review: "En cours de revue",
  closed: "Clôturé",
  archived: "Archivé",
  good: "Conforme",
  needs_revision: "À réviser",
  unsafe: "À risque",
  unclear: "À clarifier",
  not_reviewed: "Non revu",
  prospect: "Prospect",
  assistant: "Assistant",
  internal: "Interne",
  sales: "Commercial",
  other: "Autre",
  low: "Faible",
  medium: "Moyen",
  high: "Élevé",
  unknown: "Inconnu",
  very_low: "Très faible",
  small: "Petit",
  maintenance: "Maintenance",
};
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Parameterized messages remain translatable after canonical French notes are saved.
// Only complete, recognized messages match. Arbitrary user prose is never sent away.
const templates = Object.keys(dictionary)
  .filter((key) => /\{\d+\}/.test(key))
  // Match specific messages before broader prefixes such as "Scénario {0}".
  .sort((a, b) => b.replace(/\{\d+\}/g, "").length - a.replace(/\{\d+\}/g, "").length)
  .map((key) => ({
    key,
    pattern: new RegExp(
      "^" +
        key
          .split(/\{\d+\}/)
          .map(escape)
          .join("(.*?)") +
        "$",
    ),
  }));
function phrase(value: string, locale: Locale): string | null {
  const key = normalize(value),
    index = LANGUAGES.findIndex((l) => l.id === locale) - 1;
  const direct = dictionary[key]?.[index];
  if (direct) return direct;
  if (/[\r\n]/.test(value)) return null;
  for (const template of templates) {
    const match = key.match(template.pattern);
    if (match)
      return dictionary[template.key]![index]!.replace(
        /\{(\d+)\}/g,
        (_, n: string) => phrase(match[Number(n) + 1] ?? "", locale) ?? match[Number(n) + 1] ?? "",
      );
  }
  return null;
}
/** Translate owned UI text; identifiers, numbers, objects and unknown/user text pass through. */
export function t<T>(value: T, locale: Locale = getLocale()): T {
  if (typeof value !== "string") return value;
  if (locale === "fr") return (frenchLabels[value] ?? value) as T;
  const exact = phrase(value, locale);
  if (exact) return exact as T;
  return value
    .split("\n")
    .map((line) => {
      const translated = phrase(line, locale);
      if (translated) return translated;
      // Generated Markdown retains its structure; translate only recognized cells/messages.
      if (/^\|.*\|$/.test(line))
        return line
          .split("|")
          .map((cell) => {
            const v = phrase(cell, locale);
            return v ? ` ${v} ` : cell;
          })
          .join("|");
      const match = line.match(/^(\s*(?:#{1,6} |[-•] |\d+\. ))(.*)$/);
      return match ? match[1] + (phrase(match[2]!, locale) ?? match[2]!) : line;
    })
    .join("\n") as T;
}
export function msg(
  source: string,
  values: readonly (string | number)[] = [],
  locale = getLocale(),
): string {
  return t(source, locale).replace(/\{(\d+)\}/g, (_, n: string) => String(values[Number(n)] ?? ""));
}
