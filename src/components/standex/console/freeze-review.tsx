import { useEffect, useState } from "react";
import { t } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/react";
import { supabase } from "@/lib/standex/supabase";
import { verifyFreeze, freezeMarkdown } from "@/lib/standex/design-freeze";
import type { DesignFreeze } from "@/lib/standex/design-freeze";
import { stableStringify } from "@/lib/leadmagnet/dossier";
interface Attestation {
  reviewId: string;
  dossierId: string;
  revisionId: string;
  freezeHash: string;
  authorId: string;
  authorName: string;
  role: "rnd";
  publishedAt: string;
  scope: string;
  conditions: string;
  verdict: string;
}
export default function FreezeReview({
  raw,
  dossierId,
  revisionId,
  refreshKey,
}: {
  raw: unknown;
  dossierId: string;
  revisionId: string;
  refreshKey: string;
}) {
  useLocale();
  const [view, setView] = useState<{
    key: unknown;
    freeze: DesignFreeze;
    attestation: Attestation | null;
    unavailable: boolean;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setView(null);
    void (async () => {
      if (!(await verifyFreeze(raw))) return;
      const freeze = raw as DesignFreeze;
      if (!supabase) {
        if (!cancelled) setView({ key: raw, freeze, attestation: null, unavailable: true });
        return;
      }
      // The RPC is read-only. No imported file or browser role can supply this authority.
      const { data, error } = await supabase.rpc("lead_freeze_attestation", {
        p_dossier: dossierId,
        p_revision: revisionId,
        p_hash: freeze.hash,
      });
      const a = data as Attestation | null;
      const valid =
        !error &&
        a?.role === "rnd" &&
        a.dossierId === dossierId &&
        a.revisionId === revisionId &&
        a.freezeHash === freeze.hash &&
        typeof a.authorId === "string" &&
        typeof a.authorName === "string" &&
        Number.isFinite(Date.parse(a.publishedAt));
      if (!cancelled)
        setView({ key: raw, freeze, attestation: valid ? a : null, unavailable: Boolean(error) });
    })().catch(() => {
      if (!cancelled) setView(null);
    });
    return () => {
      cancelled = true;
    };
  }, [raw, dossierId, revisionId, refreshKey]);
  if (!view || view.key !== raw) return null;
  function exportFile(format: "json" | "md") {
    if (!view) return;
    const content =
      format === "json"
        ? stableStringify({ designFreeze: view.freeze, serverAttestation: view.attestation })
        : freezeMarkdown(view.freeze, (s) => t(s)) +
          (view.attestation
            ? "\n\n## " +
              t("Revue R&D publiée") +
              "\n\n" +
              [
                view.attestation.authorName,
                view.attestation.role,
                view.attestation.publishedAt,
                view.attestation.reviewId,
                view.attestation.freezeHash,
              ].join(" · ")
            : "");
    const url = URL.createObjectURL(
      new Blob([content], {
        type: format === "json" ? "application/json" : "text/markdown;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = format === "json" ? "STANDEX-review.json" : "STANDEX-review.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <details className="panel-block">
      <summary className="t-title-s cursor-pointer">{t("Fiche de revue de conception")}</summary>
      <p className="notice-info t-body">
        {t(view.attestation ? "Revue R&D publiée" : "Non contre-signée")}
        {view.unavailable && " · " + t("Contre-signature serveur non activée")}
      </p>
      {view.attestation && (
        <p className="t-body">
          {view.attestation.authorName} · {view.attestation.role} · {view.attestation.publishedAt}
          <br />
          {view.attestation.scope}
          <br />
          {view.attestation.conditions}
        </p>
      )}
      <p className="t-caption">
        {t(
          "Une revue publiée atteste la revue de cette révision, pas une certification du produit.",
        )}
      </p>
      <div className="flex gap-3 flex-wrap">
        <button
          className="min-h-11 surface-interactive t-body px-4"
          onClick={() => exportFile("json")}
        >
          {t("Exporter JSON")}
        </button>
        <button
          className="min-h-11 surface-interactive t-body px-4"
          onClick={() => exportFile("md")}
        >
          {t("Exporter Markdown")}
        </button>
      </div>
      <pre className="code-block whitespace-pre-wrap">
        {freezeMarkdown(view.freeze, (s) => t(s))}
      </pre>
    </details>
  );
}
