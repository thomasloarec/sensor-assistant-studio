import { useState } from "react";
import { t } from "@/lib/i18n/core";
import { parseAnnualVolume, type BusinessMeta } from "@/lib/leadmagnet/dossier";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function ProjectContextFields({
  business,
  onChange,
  onInvalid,
}: {
  business: BusinessMeta;
  onChange: (business: BusinessMeta) => void;
  onInvalid: (message: string | null) => void;
}) {
  const [raw, setRaw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const defer = (key: string) => {
    if (key === "annualVolume") {
      setRaw(null);
      setError(null);
      onInvalid(null);
    }
    onChange({
      ...business,
      [key]:
        key === "annualVolume" ? { kind: "unknown" } : key === "projectPhase" ? "unknown" : null,
      undefinedFields: [...new Set([...(business.undefinedFields ?? []), key])],
    });
  };
  const patch = (key: string, value: unknown) =>
    onChange({
      ...business,
      [key]: value,
      undefinedFields: (business.undefinedFields ?? []).filter((k) => k !== key),
    });
  const unknownButton = (key: string) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="mt-2 min-h-11"
      aria-pressed={business.undefinedFields?.includes(key) ?? false}
      onClick={() => defer(key)}
    >
      {t("Non défini pour le moment")}
    </Button>
  );
  // i18n-canonical: choice labels are translated at render time.
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div>
        <Label className="t-label" htmlFor="annual-volume">
          {t("Volume annuel de capteurs")}
        </Label>
        <Input
          id="annual-volume"
          inputMode="numeric"
          value={
            raw ??
            (business.annualVolume.kind === "known"
              ? String(business.annualVolume.sensorsPerYear)
              : "")
          }
          aria-invalid={Boolean(error)}
          onChange={(e) => {
            setRaw(e.target.value);
            const parsed = parseAnnualVolume(e.target.value);
            const message = "error" in parsed ? parsed.error : null;
            setError(message);
            onInvalid(message);
            patch("annualVolume", "error" in parsed ? { kind: "unknown" } : parsed);
          }}
        />
        {error ? (
          <p role="alert" className="notice-danger">
            {error}
          </p>
        ) : null}
        {unknownButton("annualVolume")}
      </div>
      <div>
        <Label className="t-label" htmlFor="project-phase">
          {t("Phase du projet")}
        </Label>
        <select
          id="project-phase"
          className="t-body min-h-11 w-full"
          value={business.projectPhase}
          onChange={(e) =>
            e.target.value === "unknown"
              ? defer("projectPhase")
              : patch("projectPhase", e.target.value)
          }
        >
          {(
            [
              ["unknown", "Non défini pour le moment"],
              ["exploration", "Exploration"],
              ["design", "Conception"],
              ["prototype", "Prototype"],
              ["industrialisation", "Industrialisation"],
            ] as const
          ).map(([v, l]) => (
            <option key={v} value={v}>
              {t(l)}
            </option>
          ))}
        </select>
      </div>
      {/* i18n-canonical: date labels are translated below. */}
      {(
        [
          ["seriesStartDate", "Date de lancement série"],
          ["samplesNeededBy", "Échantillons utiles avant"],
        ] as const
      ).map(([key, label]) => (
        <div key={key}>
          <Label className="t-label" htmlFor={key}>
            {t(label)}
          </Label>
          <Input
            id={key}
            type="date"
            value={business[key] ?? ""}
            onChange={(e) => patch(key, e.target.value || null)}
          />
          {unknownButton(key)}
        </div>
      ))}
      <div>
        <Label className="t-label" htmlFor="series-duration">
          {t("Durée de série (années)")}
        </Label>
        <Input
          id="series-duration"
          type="number"
          min={0}
          step={0.5}
          value={business.seriesDurationYears ?? ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            patch(
              "seriesDurationYears",
              e.target.value !== "" && Number.isFinite(n) && n >= 0 ? n : null,
            );
          }}
        />
        {unknownButton("seriesDurationYears")}
      </div>
    </div>
  );
}
