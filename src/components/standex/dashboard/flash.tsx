/** Retours transitoires de l'espace de travail interne.
 *
 * Règle d'emploi : le SUCCÈS d'une écriture part en pastille flottante ; une
 * ERREUR ou un REFUS reste en place, à côté de l'action refusée, parce qu'il
 * doit rester lisible et actionnable.
 *
 * Aucune dépendance ajoutée : contexte React et CSS du socle uniquement.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { t } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/react";

type FlashKind = "success" | "info";

interface FlashItem {
  id: number;
  kind: FlashKind;
  text: string;
}

interface FlashApi {
  success: (text: string) => void;
  info: (text: string) => void;
}

const BASE_CLASS = ["toast", "flex", "items-start", "gap-3"].join(" ");
const SUCCESS_CLASS = ["notice", "notice-success", "notice-success-sweep"].join(" ");

const NOOP: FlashApi = { success: () => {}, info: () => {} };
const FlashContext = createContext<FlashApi>(NOOP);

/** Durée de vie d'une pastille, chronomètre suspendu au survol et au focus. */
const LIFETIME_MS = 4500;
const MAX_VISIBLE = 3;

export function useFlash(): FlashApi {
  return useContext(FlashContext);
}

export function FlashProvider({ children }: { children: React.ReactNode }) {
  useLocale();
  const [items, setItems] = useState<FlashItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((kind: FlashKind, text: string) => {
    const id = nextId.current++;
    // La plus ancienne sort en premier quand la pile déborde.
    setItems((current) => [...current, { id, kind, text }].slice(-MAX_VISIBLE));
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const api = useMemo<FlashApi>(
    () => ({
      success: (text: string) => push("success", text),
      info: (text: string) => push("info", text),
    }),
    [push],
  );

  return (
    <FlashContext.Provider value={api}>
      {children}
      <div
        className="toast-region"
        role="status"
        aria-live="polite"
        aria-atomic="false"
      >
        {items.map((item) => (
          <FlashToast key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </div>
    </FlashContext.Provider>
  );
}

function FlashToast({ item, onDismiss }: { item: FlashItem; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(onDismiss, LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [paused, onDismiss]);

  return (
    <div
      className={`${BASE_CLASS} ${item.kind === "success" ? SUCCESS_CLASS : ""}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <p className="t-body min-w-0 flex-1">{item.text}</p>
      <button
        type="button"
        aria-label={t("Fermer ce message")}
        onClick={onDismiss}
        className="press inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-sm)] text-[var(--muted-foreground)]"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
