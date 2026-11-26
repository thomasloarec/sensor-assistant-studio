import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/i18n/core";
import { ConnectorChoices } from "./connector-choices";
import { LocalizedValidationMessage } from "./localized-validation-message";
import {
  CONNECTOR_FIELD_LABELS,
  DEFAULT_TERMINATION,
  terminationFromDraft,
  type ConnectorDraft,
  type Termination,
} from "@/lib/leadmagnet/connectors";
import type { DocumentedHousing } from "@/lib/leadmagnet/connector-library";

export function ConnectorPreferenceFields({
  termination,
  draft,
  error,
  onDraft,
  onError,
  onTermination,
  onSelect,
}: {
  termination: Termination;
  draft: ConnectorDraft;
  error: string | null;
  onDraft: (draft: ConnectorDraft) => void;
  onError: (error: string | null) => void;
  onTermination: (termination: Termination) => void;
  onSelect: (housing: DocumentedHousing) => void;
}) {
  const id = useId();
  return (
    <div className="mt-3">
      <ConnectorChoices termination={termination} onSelect={onSelect} />
      <details className="mt-3">
        <summary className="t-caption min-h-11 cursor-pointer list-none py-2">
          {t("Saisir une référence précise")}
        </summary>
        <div className="mt-3">
          <Label htmlFor={`${id}-reference`}>{t("Autre référence de connecteur")}</Label>
          <Input
            id={`${id}-reference`}
            value={termination.kind === "free_reference" ? termination.text : ""}
            onChange={(e) =>
              onTermination({
                kind: "free_reference",
                text: e.target.value,
                status: "to_verify_by_rnd",
              })
            }
          />
        </div>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          {CONNECTOR_FIELD_LABELS.map(([key, label]) => (
            <div key={key}>
              <Label htmlFor={`${id}-${key}`} className="t-label">
                {t(label)}
              </Label>
              <Input
                id={`${id}-${key}`}
                value={draft[key]}
                onChange={(e) => onDraft({ ...draft, [key]: e.target.value })}
              />
            </div>
          ))}
        </div>
        {error ? (
          <p className="notice notice-danger mt-2">
            <LocalizedValidationMessage value={error} />
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              onError(null);
              onTermination(DEFAULT_TERMINATION);
            }}
          >
            {t("Fils nus")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              const result = terminationFromDraft(draft);
              if (!result.ok) {
                onError(JSON.stringify({ kind: "connector-missing", fields: result.missing }));
                return;
              }
              onError(null);
              onTermination(result.termination);
            }}
          >
            {t("Enregistrer en « à vérifier par les ingénieurs Standex »")}
          </Button>
        </div>
        <p className="t-caption mt-1">
          {t(
            "Aucune combinaison connecteur/capteur qualifiée n'est documentée dans ce projet : toute référence saisie, sa contrepartie et son brochage restent à vérifier par les ingénieurs Standex.",
          )}
        </p>
      </details>
    </div>
  );
}
