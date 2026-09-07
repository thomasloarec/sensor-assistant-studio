import { t } from "@/lib/i18n/core";
import { useLocale } from "./lib/i18n/react";
import { createRoot } from "react-dom/client";
import MagneticWorkshop from "./components/standex/workshop/workshop";
import { parseWorkshopConfig } from "./lib/standex/magnetic-workshop";
const key = "standex-workshop-local-preview-v1";
function stored() {
  try {
    return parseWorkshopConfig(JSON.parse(localStorage.getItem(key) ?? "null"));
  } catch {
    return null;
  }
}
// This harness is served only by vite.workshop.config.ts on loopback, with no backend.
function Preview() {
  useLocale();
  return (
    <>
      <div
        style={{
          padding: "7px 20px",
          background: "#254061",
          color: "#fff",
          font: "11px system-ui",
        }}
      >
        {t("Aperçu local · les sauvegardes de cette démonstration restent dans ce navigateur.")}
      </div>
      <MagneticWorkshop
        initialConfig={stored()}
        onClose={() => {
          window.location.href =
            "https://id-preview--9aff67a3-e0d0-4a40-95e1-da809f7ff333.lovable.app";
        }}
        onSave={async (config) => {
          localStorage.setItem(key, JSON.stringify(config));
        }}
        storageLabel="ce navigateur (démonstration)"
      />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
