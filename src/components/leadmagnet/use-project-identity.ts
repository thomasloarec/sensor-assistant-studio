import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { t } from "@/lib/i18n/core";
import type { DesignDossier } from "@/lib/leadmagnet/dossier";
import { identityInput, identityKey } from "@/lib/leadmagnet/project-identity";
import { requestProjectIdentity } from "@/lib/leadmagnet/project-identity-client";
export function useProjectIdentity(
  dossier: DesignDossier,
  setDossier: Dispatch<SetStateAction<DesignDossier>>,
  enabled: boolean,
) {
  const key = identityKey(dossier);
  const previous = useRef({ id: dossier.id, key });
  const attempted = useRef(new Set<string>());
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  useEffect(() => {
    const old = previous.current;
    previous.current = { id: dossier.id, key };
    if (old.id === dossier.id && old.key !== key)
      setDossier((d) => ({ ...d, business: { ...d.business, industryConfirmed: false } }));
    if (old.id !== dossier.id || old.key !== key) setStatus("idle");
  }, [dossier.id, key, setDossier]);
  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      return;
    }
    const input = identityInput(dossier);
    if (!input.answers.some((a) => a.value.trim().length > 3)) return;
    const attempt = dossier.id + ":" + key;
    if (attempted.current.has(attempt)) return;
    const controller = new AbortController();
    let live = true;
    // Debounce the transition so StrictMode does not consume two provider calls.
    const timer = setTimeout(() => {
      attempted.current.add(attempt);
      if (attempted.current.size > 20)
        attempted.current.delete(attempted.current.values().next().value!);
      setStatus("loading");
      const originalIndustry = JSON.stringify([
        dossier.business.industry,
        dossier.business.industryConfirmed,
        dossier.business.industrySource,
      ]);
      void requestProjectIdentity(input, controller.signal)
        .then((result) => {
          if (!live) return;
          setDossier((d) => {
            if (d.id !== dossier.id || identityKey(d) !== key) return d;
            const titleAllowed =
              d.titleSource !== "user" &&
              (d.titleSource === "ai" ||
                !d.title.trim() ||
                d.title === t("Nouveau projet", d.sourceLocale));
            const industryUnchanged =
              originalIndustry ===
              JSON.stringify([
                d.business.industry,
                d.business.industryConfirmed,
                d.business.industrySource,
              ]);
            const industryAllowed =
              industryUnchanged &&
              !d.business.industryConfirmed &&
              d.business.industrySource !== "user";
            return {
              ...d,
              ...(titleAllowed ? { title: result.title, titleSource: "ai" as const } : {}),
              business: industryAllowed
                ? {
                    ...d.business,
                    industry: result.industry,
                    industryConfirmed: false,
                    industrySource: "ai",
                  }
                : d.business,
            };
          });
          setStatus("ready");
        })
        .catch(() => {
          if (live) setStatus("unavailable");
        });
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [dossier.id, key, enabled, setDossier]);
  return status;
}
