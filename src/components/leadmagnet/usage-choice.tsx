import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/react";
import {
  flushUsage,
  setUsageChoice,
  subscribeUsage,
  trackUsage,
  usageAllowedHost,
  usageChoice,
  USAGE_CHOICE_KEY,
} from "@/lib/usage/client";
/** Optional, first-party measurement. No tracking identifiers before agreement. */
export function UsageChoice() {
  useLocale();
  const choice = useSyncExternalStore(subscribeUsage, usageChoice, () => null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === USAGE_CHOICE_KEY && (event.newValue === "yes" || event.newValue === "no"))
        setUsageChoice(event.newValue);
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  useEffect(() => {
    if (choice !== "yes") return;
    trackUsage("visit", {}, true);
    let lastInput = Date.now();
    const active = () => {
      lastInput = Date.now();
    };
    const flush = () => {
      void flushUsage();
    };
    const tick = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastInput < 60_000)
        trackUsage("heartbeat");
      void flushUsage();
    }, 60_000);
    window.addEventListener("pointerdown", active, { passive: true });
    window.addEventListener("keydown", active);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      clearInterval(tick);
      window.removeEventListener("pointerdown", active);
      window.removeEventListener("keydown", active);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [choice]);
  if (!usageAllowedHost()) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-4" aria-label={t("Mesure de l’usage")}>
      {choice && !editing ? (
        <Button variant="ghost" onClick={() => setEditing(true)}>
          {t("Mesure de l’usage")}
        </Button>
      ) : (
        <div className="panel-block flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="t-title-s">{t("Aider à améliorer Sensor Studio")}</h2>
            <p className="t-body mt-2">
              {t(
                "Autorisez-vous la mesure des étapes utilisées ? Aucune réponse, coordonnée ou géométrie 3D n’est collectée. Les données sont conservées au maximum 90 jours. Votre choix est modifiable ici.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setUsageChoice("no");
                setEditing(false);
              }}
            >
              {t("Refuser")}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setUsageChoice("yes");
                setEditing(false);
              }}
            >
              {t("Autoriser")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
