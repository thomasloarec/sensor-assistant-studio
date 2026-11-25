// Local component preview, like workshop-preview.tsx. No production data or submission.
import { createRoot } from "react-dom/client";
import LevelJourney from "@/components/level/level-journey";
import "./styles.css";
import "./routes/studio.css";

createRoot(document.getElementById("root")!).render(<LevelJourney onClassic={() => window.location.assign("http://127.0.0.1:5198/")} />);
