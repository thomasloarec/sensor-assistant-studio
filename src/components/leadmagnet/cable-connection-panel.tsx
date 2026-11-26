import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/i18n/core";

export type CableLengthChoice = "undecided" | "standard_to_confirm" | "custom_to_confirm";
export type ConnectorChoice = "undecided" | "preference" | "bare";

/** Shared presentation; each journey retains its own dossier and selection handlers. */
export function CableConnectionPanel({
  lengthChoice,
  onLengthChoice,
  lengthFields,
  connectorChoice,
  onConnectorChoice,
  connectorFields,
  children,
}: {
  lengthChoice: CableLengthChoice;
  onLengthChoice: (choice: CableLengthChoice) => void;
  lengthFields: ReactNode;
  connectorChoice: ConnectorChoice;
  onConnectorChoice: (choice: ConnectorChoice) => void;
  connectorFields: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div id="section-cablage" className="panel-block-lg space-y-5">
      <h3 className="t-title-m">{t("Câble et connexion")}</h3>
      {children}
      <div>
        <Label className="t-label">{t("Longueur de câble")}</Label>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t("Longueur de câble")}>
          {(
            [
              ["undecided", t("Je ne sais pas")],
              ["standard_to_confirm", t("Standard")],
              ["custom_to_confirm", t("Sur mesure")],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={lengthChoice === value ? "default" : "outline"}
              className="min-h-11 text-base"
              aria-pressed={lengthChoice === value}
              onClick={() => onLengthChoice(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        {lengthFields}
      </div>
      <div>
        <Label className="t-label">{t("Connecteur")}</Label>
        <div
          className="mt-2 flex flex-wrap gap-2"
          data-testid="connector-choice"
          role="group"
          aria-label={t("Connecteur")}
        >
          {(
            [
              ["undecided", t("Je ne sais pas")],
              ["preference", t("J'ai une préférence")],
              ["bare", t("Pas besoin de connecteur")],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={connectorChoice === value ? "default" : "outline"}
              className="min-h-11 text-base"
              aria-pressed={connectorChoice === value}
              onClick={() => onConnectorChoice(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        {connectorChoice === "bare" ? (
          <p className="t-caption mt-2">
            {t(
              "Vous avez choisi de rester sur des fils nus, sans connecteur. Ce choix est enregistré tel quel : il n'est pas confié à Standex et il apparaît dans le résumé de votre projet.",
            )}
          </p>
        ) : null}
        {connectorFields}
      </div>
    </div>
  );
}
