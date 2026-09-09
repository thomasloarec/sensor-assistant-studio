import { useLocale } from "@/lib/i18n/react";
import { msg, t } from "@/lib/i18n/core";
import type { MachineAsset } from "@/lib/standex/machine-assets";
import type { MachineAssembly } from "@/lib/standex/machine-assembly";
import type { Vec3, WorkshopConfig } from "@/lib/standex/magnetic-workshop";
import { sensorById, formatMm } from "@/lib/standex/sensor-catalog";
import type { MachineTool } from "./machine-scene";

function VectorInput({
  label,
  value,
  onChange,
  unit = "mm",
  min = -10000,
  max = 10000,
}: {
  label: string;
  value: Vec3;
  onChange: (v: Vec3) => void;
  unit?: string;
  min?: number;
  max?: number;
}) {
  return (
    <fieldset className="mw-vector">
      <legend className="t-label">
        {t(label)} · {t(unit)}
      </legend>
      <div>
        {["X", "Y", "Z"].map((axis, i) => (
          <label key={axis}>
            <span className="t-label">{t(axis)}</span>
            <input
              type="number"
              step={unit === "°" ? 5 : 0.5}
              min={min}
              max={max}
              aria-label={msg("{0} {1}", [t(label), axis])}
              key={value[i]}
              defaultValue={Math.round(value[i]! * 100) / 100}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (e.target.value === "" || !Number.isFinite(n) || n < min || n > max) {
                  e.target.value = String(Math.round(value[i]! * 100) / 100);
                  return;
                }
                const v = [...value] as Vec3;
                v[i] = n;
                onChange(v);
              }}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export default function MachineControls({
  config,
  asset,
  tool,
  setTool,
  onChange,
  onExample,
  onImport,
  onExit,
  onCatalog,
  onProductCard,
  measure,
}: {
  config: WorkshopConfig;
  asset: MachineAsset | null;
  tool: MachineTool;
  setTool: (v: MachineTool) => void;
  onChange: (patch: Partial<MachineAssembly>) => void;
  onExample: () => void;
  onImport: (file: File | undefined) => void;
  onExit: () => void;
  onCatalog: () => void;
  onProductCard: () => void;
  measure: number | null;
}) {
  const m = config.machine!,
    sensor = sensorById(config.sensorId),
    fits = sensor.body.every((v, i) => v <= m.space[i]!);
  return (
    <div className="mw-machine-controls">
      <p className="mw-eyebrow">{t("Dans votre machine")}</p>
      <h2>{t("Installer et essayer")}</h2>
      <p className="mw-help">
        {t(
          "1. Importez l'objet. 2. Choisissez le capteur. 3. Placez les composants. 4. Ouvrez le bac.",
        )}
      </p>
      <details open>
        <summary>{t("Objet 3D et pièce mobile")}</summary>
        <strong className="mw-file-name t-metric">{t(m.fileName)}</strong>
        <label className="mw-file-label">
          {t("Importer mon fichier GLB")}
          <input
            type="file"
            accept=".glb,model/gltf-binary"
            aria-label={t("Importer mon fichier GLB")}
            onChange={(e) => {
              onImport(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <p className="mw-help">
          {t(
            "GLB autonome, 30 Mo maximum. Le fichier reste dans ce navigateur ; les réglages sont joints au dossier.",
          )}
        </p>
        <label className="mw-select-label">
          {t("Unités du fichier")}
          <select
            value={m.unitScale}
            onChange={(e) => onChange({ unitScale: Number(e.target.value) })}
          >
            <option value={1000}>{t("Mètres · standard GLB")}</option>
            <option value={1}>{t("Millimètres")}</option>
            <option value={10}>{t("Centimètres")}</option>
          </select>
        </label>
        {asset && (
          <p className="mw-help">
            {t("Objet :")} {asset.size.map((n) => formatMm(n, 1)).join(" × ")} mm (X × Y × Z).
          </p>
        )}
        <label className="mw-select-label">
          {t("Pièce à mettre en mouvement")}
          <select value={m.movingNode} onChange={(e) => onChange({ movingNode: e.target.value })}>
            <option value="">{t("Choisir une pièce")}</option>
            {asset?.nodes.map((n) => (
              <option key={n.path} value={n.path}>
                {t(n.name)}
              </option>
            ))}
          </select>
        </label>
        <button className="mw-text-button" onClick={onExample}>
          {t("Recharger l'exemple machine à café")}
        </button>
        <br />
        <a href="/models/machine-cafe-bac-mobile.glb" download>
          {t("Télécharger la machine à café (.glb) ↗")}
        </a>
        <p className="mw-help">
          {t(
            "Pour animer le bac seul, exportez-le comme une pièce séparée du châssis. Choisissez son nom dans la liste.",
          )}
        </p>
        {asset && !asset.nodes.some((n) => n.path === m.movingNode) && (
          <p className="mw-fit-no">{t("Choisissez la pièce mobile avant de lancer le cycle.")}</p>
        )}
      </details>
      <div className="mw-machine-product">
        <strong className="t-title-s">{t(sensor.name)}</strong>
        <button className="mw-product-card-button" onClick={onProductCard}>
          {t("Découvrir ce capteur")}
        </button>
        <button className="mw-button mw-secondary mw-wide" onClick={onCatalog}>
          {t("Choisir dans le catalogue")}
        </button>
      </div>
      <div className="mw-placement-tools" aria-label={t("Outils de placement")}>
        {(
          [
            ["navigate", "Observer"],
            ["sensor", t("Placer le capteur")],
            ["magnet", t("Placer l'aimant")],
            ["measure", "Mesurer"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} aria-pressed={tool === id} onClick={() => setTool(id)}>
            {t(label)}
          </button>
        ))}
      </div>
      <p className="mw-help">
        {t(
          tool === "sensor" || tool === "magnet"
            ? "Bac fermé : cliquez sur une surface pour poser le composant, ou utilisez les flèches 3D. Ajustez ensuite les coordonnées."
            : tool === "measure"
              ? "Cliquez sur deux surfaces pour mesurer leur distance. Un troisième clic recommence la mesure."
              : "Glissez pour tourner, molette pour zoomer. Le capteur garde sa taille réelle.",
        )}
      </p>
      {measure !== null && (
        <p className="mw-measure-result">
          {t("Distance mesurée :")}
          <strong className="t-metric">{t(measure.toFixed(1))} mm</strong> (
          {t((measure / 10).toFixed(2))}
          {" "}
          {t("cm)")}
        </p>
      )}
      <details open>
        <summary>{t("Position des composants")}</summary>
        <label className="mw-select-label">
          {t("Support du capteur")}
          <select
            value={m.sensorMount}
            onChange={(e) => onChange({ sensorMount: e.target.value as "fixed" | "moving" })}
          >
            <option value="fixed">{t("Châssis fixe")}</option>
            <option value="moving">{t("Pièce mobile")}</option>
          </select>
        </label>
        <VectorInput
          label={t("Position du capteur")}
          value={m.sensorPosition}
          onChange={(sensorPosition) => onChange({ sensorPosition })}
        />
        <VectorInput
          label={t("Rotation du capteur")}
          unit="°"
          value={m.sensorRotation}
          onChange={(sensorRotation) => onChange({ sensorRotation })}
        />
        <label className="mw-select-label">
          {t("Support de l'aimant")}
          <select
            value={m.magnetMount}
            onChange={(e) => onChange({ magnetMount: e.target.value as "fixed" | "moving" })}
          >
            <option value="moving">{t("Pièce mobile")}</option>
            <option value="fixed">{t("Châssis fixe")}</option>
          </select>
        </label>
        <VectorInput
          label={t("Position de l'aimant")}
          value={m.magnetPosition}
          onChange={(magnetPosition) => onChange({ magnetPosition })}
        />
        <VectorInput
          label={t("Rotation de l'aimant")}
          unit="°"
          value={m.magnetRotation}
          onChange={(magnetRotation) => onChange({ magnetRotation })}
        />
      </details>
      <details>
        <summary>{t("Le capteur tient-il dans l'espace prévu ?")}</summary>
        <p className="mw-help">
          {t(
            "Renseignez l'espace disponible dans les axes locaux du capteur. Le gabarit est dessiné en 3D. Vérification du corps, hors câble et fixations.",
          )}
        </p>
        <VectorInput
          label={t("Espace disponible")}
          value={m.space}
          min={0.1}
          max={1000}
          onChange={(space) => onChange({ space })}
        />
        <p className={fits ? "mw-fit-ok" : "mw-fit-no"}>
          {t(
            fits
              ? "Le corps tient dans le gabarit déclaré."
              : "Le corps dépasse le gabarit déclaré.",
          )}
        </p>
      </details>
      <details open>
        <summary>{t("Mouvement d'ouverture")}</summary>
        <label className="mw-select-label">
          {t("Type de mouvement")}
          <select
            value={m.motion}
            onChange={(e) => onChange({ motion: e.target.value as "translation" | "rotation" })}
          >
            <option value="translation">{t("Translation · bac coulissant")}</option>
            <option value="rotation">{t("Rotation · porte ou couvercle")}</option>
          </select>
        </label>
        {m.motion === "translation" ? (
          <VectorInput
            label={t("Déplacement ouvert")}
            value={m.travel}
            onChange={(travel) => onChange({ travel })}
          />
        ) : (
          <>
            <VectorInput
              label={t("Point du pivot")}
              value={m.pivot}
              onChange={(pivot) => onChange({ pivot })}
            />
            <label className="mw-select-label">
              {t("Axe du pivot")}
              <select
                value={m.rotationAxis}
                onChange={(e) => onChange({ rotationAxis: e.target.value as "x" | "y" | "z" })}
              >
                {["x", "y", "z"].map((x) => (
                  <option key={x} value={x}>
                    {t(x.toUpperCase())}
                  </option>
                ))}
              </select>
            </label>
            <label className="mw-select-label">
              {t("Angle ouvert (°)")}
              <input
                aria-label={t("Angle ouvert")}
                type="number"
                min={-360}
                max={360}
                value={m.openingAngle}
                onChange={(e) => onChange({ openingAngle: Number(e.target.value) })}
              />
            </label>
          </>
        )}
      </details>
      <button className="mw-text-button" onClick={onExit}>
        {t("Revenir au montage sur le plan quadrillé")}
      </button>
    </div>
  );
}
