import { useEffect, useState } from "react";
import { t } from "@/lib/i18n/core";
import { Button } from "@/components/ui/button";

// i18n-canonical: complete examples, never copied into the user's answers.
const EXAMPLES: Record<string, readonly string[]> = {
  detection_goal: [
    "Détecter que le réservoir d’eau amovible est complètement inséré dans une machine à café professionnelle.",
    "Détecter la fermeture du tiroir de cartouche d’un appareil de diagnostic médical.",
    "Détecter la fin de course du vérin d’une ligne de conditionnement.",
  ],
  states_motion: [
    "Le réservoir coulisse horizontalement sur 40 mm. Un aimant est intégré au réservoir ; la détection doit se faire à 3–6 mm du capteur.",
    "Le tiroir avance de 30 mm. Contact fermé lorsqu’il est inséré, ouvert dès son retrait de 5 mm.",
    "Le piston porte un aimant permanent et se déplace à 1 m/s. Répétabilité souhaitée : ±1 mm.",
  ],
  mounting: [
    "Capteur vissé à l’intérieur de la machine, aimant fixé sur le réservoir plastique amovible.",
    "Capteur soudé en CMS sur la carte électronique fixe ; aimant intégré au tiroir mobile.",
    "Capteur placé à l’extérieur du vérin dans un logement Ø 8 mm ; maintien mécanique à définir.",
  ],
  envelope: [
    "Volume disponible pour le capteur : 15 × 15 × 15 mm, hors câble. Accès aux vis par le dessus.",
    "Zone sur la carte : 8 × 4 mm ; hauteur maximale 3 mm, terminaisons comprises.",
    "Logement Ø 8 mm, profondeur 30 mm ; prévoir le passage du câble à l’arrière.",
  ],
  electrical: [
    "Entrée numérique 3,3 VDC, courant inférieur à 5 mA ; contact normalement ouvert.",
    "Entrée de carte 5 VDC, 2 mA ; commutation d’un signal, sans charge de puissance.",
    "Entrée automate 24 VDC, courant inférieur à 20 mA ; deux fils souhaités.",
  ],
  environment: [
    "Température de 5 à 60 °C ; humidité, vapeur et projections d’eau occasionnelles.",
    "Utilisation intérieure, 10 à 40 °C ; nettoyage avec désinfectant, sans immersion.",
    "Température de −20 à +80 °C ; vibrations, huile et poussières ; protection IP67 souhaitée.",
  ],
};

export function NeedExamples({ questionKey }: { questionKey: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const examples = EXAMPLES[questionKey] ?? [];
  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % 3), 6000);
    return () => window.clearInterval(timer);
  }, [paused]);
  return (
    <div className="panel-block space-y-2">
      <p className="t-label">
        {t("Exemple de réponse détaillée")} · {index + 1}/3
      </p>
      <p className="t-body">{examples[index] ? t(examples[index]) : null}</p>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setPaused((p) => !p)}>
          {paused ? t("Reprendre") : t("Pause")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setPaused(true);
            setIndex((i) => (i + 1) % 3);
          }}
        >
          {t("Autre exemple")}
        </Button>
      </div>
    </div>
  );
}
