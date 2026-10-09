import { useState } from "react";
import { ChevronLeft, ChevronRight, Lightbulb } from "lucide-react";
import { t } from "@/lib/i18n/core";
import { Button } from "@/components/ui/button";

// i18n-canonical: complete examples, never copied into the user's answers.
const EXAMPLES: Record<string, readonly string[]> = {
  detection_goal: [
    "Détecter que le réservoir d’eau amovible est complètement inséré dans une machine à café professionnelle.",
    "Détecter la fermeture du tiroir de cartouche d’un appareil de diagnostic médical.",
    "Détecter la fin de course du vérin d’une ligne de conditionnement.",
  ],
  target_object: [
    "Le réservoir d’eau amovible, en plastique, poignée vers l’avant.",
    "Le tiroir de cartouche, en tôle pliée, avec un aimant déjà intégré.",
    "La tige du vérin, en acier, portant un aimant permanent.",
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

/**
 * Exemples de réponses détaillées : une note éditoriale, pas un champ.
 *
 * Navigation ENTIÈREMENT manuelle (flèches précédent / suivant) : aucun
 * défilement automatique, donc aucun bouton « Pause ». Les flèches sont les
 * cibles cliquables (≥ 44 px) ; les points, rapprochés, indiquent seulement la
 * position et restent décoratifs pour les lecteurs d'écran, qui reçoivent le
 * compteur en texte.
 */
export function NeedExamples({ questionKey }: { questionKey: string }) {
  const [index, setIndex] = useState(0);
  const examples = EXAMPLES[questionKey] ?? [];
  if (examples.length === 0) return null;
  const total = examples.length;
  const go = (delta: number) => setIndex((i) => (i + delta + total) % total);
  return (
    <div className="questionnaire-examples-content">
      <p className="questionnaire-examples-label">
        <Lightbulb className="size-4" aria-hidden="true" />
        <span>{t("Exemple")}</span>
        <span className="sr-only">
          {" "}
          {index + 1}/{total}
        </span>
      </p>
      <p key={index} className="t-body questionnaire-examples-text" aria-live="polite">
        {examples[index] ? `« ${t(examples[index])} »` : null}
      </p>
      {total > 1 ? (
        <div className="questionnaire-examples-nav">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label={t("Exemple précédent")}
            onClick={() => go(-1)}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <span className="questionnaire-examples-dots" aria-hidden="true">
            {examples.map((_, exampleIndex) => (
              <span
                key={exampleIndex}
                className={
                  index === exampleIndex
                    ? "questionnaire-examples-dot is-active"
                    : "questionnaire-examples-dot"
                }
              />
            ))}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label={t("Exemple suivant")}
            onClick={() => go(1)}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
