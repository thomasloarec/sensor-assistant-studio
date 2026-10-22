// Route TEMPORAIRE de recette locale : supprimée avant livraison.
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";

const MagneticWorkshop = lazy(() => import("@/components/standex/workshop/workshop"));

export const Route = createFileRoute("/recette-atelier-tmp")({
  ssr: false,
  head: () => ({ meta: [{ title: "Recette atelier (temporaire)" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const [cfg, setCfg] = useState<unknown>(undefined);
  useEffect(() => {
    const raw = sessionStorage.getItem("recette-cfg");
    setCfg(raw ? JSON.parse(raw) : null);
  }, []);
  if (cfg === undefined) return null;
  return (
    <Suspense fallback={null}>
      <MagneticWorkshop
        initialConfig={(cfg ?? undefined) as never}
        storageMode="memory"
        onClose={() => {}}
        onSave={(c: unknown) => {
          (window as unknown as { __saved: unknown }).__saved = c;
        }}
      />
    </Suspense>
  );
}
