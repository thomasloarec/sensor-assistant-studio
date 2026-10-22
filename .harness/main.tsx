import "../src/styles.css";
import { createRoot } from "react-dom/client";
import MagneticWorkshop from "../src/components/standex/workshop/workshop";
createRoot(document.getElementById("root")!).render(
  <MagneticWorkshop storageMode="memory" onClose={() => {}} onSave={async () => {}} />,
);
