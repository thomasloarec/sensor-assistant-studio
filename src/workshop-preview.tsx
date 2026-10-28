import "./styles.css";
import { t } from "@/lib/i18n/core";
import { useLocale } from "./lib/i18n/react";
import { createRoot } from "react-dom/client";
import MagneticWorkshop from "./components/standex/workshop/workshop";
import { WorkspacePanel } from './components/leadmagnet/workspace-panel';
import { DEFAULT_WORKSHOP, parseWorkshopConfig } from "./lib/standex/magnetic-workshop";
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
  const close=()=>{window.location.href='https://sensor-pal-tester.lovable.app/';};
  const fresh=new URLSearchParams(window.location.search).has('fresh');
  return (
    <WorkspacePanel open fullscreen bare languagePicker title={t('Atelier 3D')} onOpenChange={(open)=>{if(!open)close();}}
      badge={<span className="t-caption">{t("Aperçu local · les sauvegardes de cette démonstration restent dans ce navigateur.")}</span>}>
      <MagneticWorkshop
        clientPedagogical
        embedded
        initialConfig={fresh ? {...DEFAULT_WORKSHOP,sensorId:"MK04",magnetModel:"M04"} : stored()}
        onClose={close}
        onSave={async (config) => {
          localStorage.setItem(key, JSON.stringify(config));
        }}
        storageLabel="ce navigateur (démonstration)"
      />
    </WorkspacePanel>
  );
}
const previewRoot=createRoot(document.getElementById("root")!);
previewRoot.render(<Preview />);
if(import.meta.hot)import.meta.hot.dispose(()=>previewRoot.unmount());
