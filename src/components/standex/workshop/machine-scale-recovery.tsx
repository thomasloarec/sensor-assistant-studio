import { useId, useState } from "react";
import { msg, number, t } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/react";
import type { Vec3 } from "@/lib/standex/magnetic-workshop";
import { machineScaleFromLength, scaledMachineSize } from "@/lib/standex/machine-scale";

export default function MachineScaleRecovery({ fileName, sizeMm, triedScale, busy, onConfirm, onCancel }: {
  fileName: string; sizeMm: Vec3; triedScale: number; busy: boolean;
  onConfirm: (scale: number) => void; onCancel: () => void;
}) {
  useLocale();
  const id = useId();
  const [length, setLength] = useState("");
  const [unit, setUnit] = useState<number | null>(null);
  const scale = unit ?? machineScaleFromLength(sizeMm, triedScale, length);
  const size = scale === null ? null : scaledMachineSize(sizeMm, triedScale, scale);
  const dimensions = (values: Vec3) => values.map(n => number(n / 10, 3)).join(" × ") + " cm";
  const invalid = length.length > 0 && scale === null;
  return <section className="mw-units-retry notice-info" aria-labelledby={id} aria-busy={busy} data-testid="units-retry">
    <h3 id={id} className="t-title-s">{t("Ajuster la taille du modèle")}</h3>
    <p className="t-body mw-file-name">{fileName}</p>
    <p className="t-body">{t("L’échelle du fichier dépasse les limites de l’atelier. Indiquez sa plus grande dimension réelle pour continuer.")}</p>
    <p className="t-caption">{msg("Dimensions lues (X × Y × Z) : {0}", [dimensions(sizeMm)])}</p>
    <label className="mw-field">
      {t("Plus grande dimension réelle (cm)")}
      <input autoFocus inputMode="decimal" type="text" value={length} disabled={busy}
        aria-describedby={id + "-help"} aria-invalid={invalid || undefined}
        onInput={e => { setLength(e.currentTarget.value); setUnit(null); }} />
    </label>
    <p className="t-caption" id={id + "-help"}>{t("Mesurez le côté le plus long de l’objet. Toutes les pièces seront redimensionnées ensemble. De 0,01 à 2 000 cm.")}</p>
    <details>
      <summary>{t("Je connais les unités du fichier")}</summary>
      <label className="mw-select-label">{t("Unités du fichier")}
        <select value={unit ?? ""} disabled={busy} onChange={e => { setUnit(e.target.value ? Number(e.target.value) : null); setLength(""); }}>
          <option value="">{t("Choisir les unités")}</option>
          {([ [1, t("Millimètres")], [10, t("Centimètres")], [1000, t("Mètres · standard GLB")] ] as const).map(([value, label]) => {
            const candidate = scaledMachineSize(sizeMm, triedScale, value);
            return <option key={value} value={value} disabled={!candidate}>{label}{candidate ? " · " + dimensions(candidate) : " · " + t("Hors limites")}</option>;
          })}
        </select>
      </label>
    </details>
    {size && <p className="t-body" role="status">{msg("Dimensions après ajustement (X × Y × Z) : {0}", [dimensions(size)])}</p>}
    <div className="mw-guide-row">
      <button className="mw-button" disabled={!size || busy} onClick={() => { if (size && scale !== null) onConfirm(scale); }}>{t("Importer à cette taille")}</button>
      <button className="mw-button mw-secondary" onClick={onCancel}>{t("Annuler l'import")}</button>
    </div>
  </section>;
}
