import { useEffect, useId, useSyncExternalStore } from "react";
import { Globe2 } from "lucide-react";
import { getLocale, isLocale, LANGUAGES, LOCALE_KEY, setLocale, subscribeLocale, t } from "./core";
import "./language.css";

export function useLocale() {
  return useSyncExternalStore(subscribeLocale, getLocale, () => "fr" as const);
}
export function LanguagePicker() {
  const locale = useLocale(),
    id = useId();
  useEffect(() => {
    document.documentElement.lang = LANGUAGES.find((l) => l.id === locale)!.tag;
    document.title = t("Votre projet capteur · Standex Detect", locale);
    const changed = (e: StorageEvent) => {
      if (e.key === LOCALE_KEY && isLocale(e.newValue) && e.newValue !== getLocale())
        setLocale(e.newValue);
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [locale]);
  return (
    <label className="language-picker" htmlFor={id}>
      <Globe2 size={16} aria-hidden="true" />
      <span className="language-sr">{t("Langue du site")}</span>
      <select
        id={id}
        value={locale}
        onChange={(e) => {
          if (isLocale(e.target.value)) setLocale(e.target.value);
        }}
      >
        {LANGUAGES.map((l) => (
          <option key={l.id} value={l.id} lang={l.tag}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
