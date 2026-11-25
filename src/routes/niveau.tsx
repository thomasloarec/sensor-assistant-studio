import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { t } from "@/lib/i18n/core";
const LevelJourney = lazy(() => import("@/components/level/level-journey"));
export const Route = createFileRoute("/niveau")({
  ssr: false,
  head: () => ({ meta: [{ title: t("Niveau de liquide · Sensor Studio") }, { name: "robots", content: "noindex, nofollow" }] }),
  component: () => <Suspense fallback={<p className="t-body p-8">{t("Chargement du parcours niveau…")}</p>}><LevelJourney /></Suspense>,
});
