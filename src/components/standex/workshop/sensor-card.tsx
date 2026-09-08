import { t } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/react";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowUpRight,
  Cable,
  Check,
  ChevronRight,
  Eye,
  Layers3,
  Ruler,
  Thermometer,
  X,
  Zap,
} from "lucide-react";
import { sensorById, sizeLabel, formatMm, sensorSource } from "@/lib/standex/sensor-catalog";
import { SENSOR_SPECIFICATIONS } from "@/lib/standex/sensor-specifications";
import type { Contact } from "@/lib/standex/magnetic-workshop";
import { SensorPlan } from "./sensor-plan";
import "./sensor-card.css";

export default function SensorCard({
  sensorId,
  contact,
  onClose,
  onSelect,
}: {
  sensorId: string;
  contact?: Contact;
  onClose: () => void;
  onSelect?: (id: string) => void;
}) {
  useLocale();
  const model = sensorById(sensorId),
    specs = SENSOR_SPECIFICATIONS[model.id];
  const dialog = useRef<HTMLDialogElement>(null),
    titleId = useId();
  const [tab, setTab] = useState<"overview" | "electrical" | "integration">("overview");
  const [xray, setXray] = useState(false),
    [variant, setVariant] = useState(0);
  const rating = specs?.electrical[variant];
  useEffect(() => {
    const el = dialog.current,
      previous = document.activeElement;
    el?.showModal();
    return () => {
      el?.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  const height = Math.max(model.body[2], model.nutWidth ?? 0, model.collarDiameter ?? 0);
  const drawingUnit = Math.max(model.body[0], height) / 26;
  const drawingPad = model.shape === "smd" ? model.body[0] * 0.3 : 9;
  return (
    <dialog
      ref={dialog}
      className="sensor-card"
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sc-shell">
        <div className="sc-hero">
          <div className="sc-brand">
            STANDEX <span>DETECT</span>
          </div>
          <span className="sc-category">{t(model.category)}</span>
          <h2 id={titleId} className="t-title-s">
            {t(model.name)}
          </h2>
          <p>{t(model.description)}</p>
          <div className="sc-drawing">
            <svg
              viewBox={`${-model.body[0] / 2 - drawingPad} ${-height / 2 - 6 * drawingUnit} ${model.body[0] + drawingPad * 2} ${height + 18 * drawingUnit}`}
              role="img"
              aria-label={t(`Illustration du capteur ${model.name}`)}
            >
              <SensorPlan model={model} xray={xray} contact={contact ?? "open"} />
              <g stroke="#80b6cd" strokeWidth={0.15 * drawingUnit} fill="#c2e5f1">
                <path
                  d={`M${-model.body[0] / 2} ${height / 2 + 2 * drawingUnit} v${3 * drawingUnit} h${model.body[0]} v${-3 * drawingUnit}`}
                  fill="none"
                />
                <text
                  x="0"
                  y={height / 2 + 9 * drawingUnit}
                  textAnchor="middle"
                  stroke="none"
                  fontSize={model.body[0] * 0.06}
                >
                  {t(formatMm(model.body[0]))} mm
                </text>
              </g>
            </svg>
          </div>
          <button className="sc-xray" aria-pressed={xray} onClick={() => setXray(!xray)}>
            <Eye size={16} />
            {t("Voir les contacts")}
          </button>
          {xray && (
            <small className="sc-contact-note">
              {t(
                contact
                  ? "Contacts symboliques · état du montage"
                  : "Contacts symboliques · illustration",
              )}
            </small>
          )}
          <div className="sc-hero-size">
            <Ruler size={19} />
            <div>
              <small>{t("Dimensions du corps")}</small>
              <strong className="t-metric">{t(sizeLabel(model))}</strong>
            </div>
          </div>
          {specs && (
            <div className="sc-strength">
              <Check size={18} />
              <span>{t(specs.strength)}</span>
            </div>
          )}
        </div>
        <div className="sc-content">
          <header>
            <div>
              <p className="mw-eyebrow">{t("LE PRODUIT EN DÉTAIL")}</p>
              <span>{t("Comprendre ses atouts. Préparer son intégration.")}</span>
            </div>
            <button
              className="mw-icon-button"
              aria-label={t("Fermer la carte produit")}
              onClick={onClose}
              autoFocus
            >
              <X />
            </button>
          </header>
          <nav className="sc-tabs" aria-label={t("Rubriques de la carte")}>
            {(
              [
                ["overview", "Essentiel"],
                ["electrical", "Électrique"],
                ["integration", "Intégration"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
                {t(label)}
              </button>
            ))}
          </nav>
          {!specs ? (
            <div className="sc-panel">
              <h3>{t("Un reed pour apprendre")}</h3>
              <p>
                {t(
                  "Ce modèle est fictif. Ses dimensions servent à l'illustration ; il n'a pas de caractéristiques électriques commerciales.",
                )}
              </p>
            </div>
          ) : (
            <div className="sc-panel">
              {tab === "overview" && (
                <>
                  <div className="sc-feature-grid">
                    <article>
                      <Thermometer />
                      <small>{t("Température de fonctionnement")}</small>
                      <strong>
                        {t(formatMm(specs.temperatures[0]!.min))} →{" "}
                        {t(formatMm(specs.temperatures[0]!.max))} <em>°C</em>
                      </strong>
                      <span>{t(specs.temperatures[0]!.condition)}</span>
                    </article>
                    <article>
                      <Layers3 />
                      <small>{t("Boîtier")}</small>
                      <strong className="sc-material">{t(specs.material)}</strong>
                      <span>{t(model.category)}</span>
                    </article>
                  </div>
                  <h3>
                    <Cable size={19} />
                    {t("Connexion et câbles")}
                  </h3>
                  <p>{t(specs.cableMaterial)}</p>
                  {!!specs.cableLengths.length && (
                    <div className="sc-cable-pills">
                      {specs.cableLengths.map((n) => (
                        <span key={n}>{t(n >= 1000 ? formatMm(n / 1000) + " m" : n + " mm")}</span>
                      ))}
                    </div>
                  )}
                  {specs.cableNote && <p className="sc-note">{t(specs.cableNote)}</p>}
                  <button className="sc-more" onClick={() => setTab("electrical")}>
                    {t("Explorer les caractéristiques électriques")}
                    <ChevronRight size={17} />
                  </button>
                </>
              )}
              {tab === "electrical" && rating && (
                <>
                  <h3>
                    <Zap size={19} />
                    {t("Le contact et ses limites")}
                  </h3>
                  <label className="sc-variant">
                    {t("Option électrique de la série")}
                    <select value={variant} onChange={(e) => setVariant(Number(e.target.value))}>
                      {specs.electrical.map((v, i) => (
                        <option key={v.model} value={i}>
                          {t(v.model)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="sc-ratings">
                    <article>
                      <strong>
                        {t(formatMm(rating.power))} <em>W</em>
                      </strong>
                      <span>{t("Puissance commutée max.")}</span>
                    </article>
                    <article>
                      <strong>
                        {t(formatMm(rating.voltage))} <em>V</em>
                      </strong>
                      <span>{t("Tension commutée max.")}</span>
                    </article>
                    <article>
                      <strong>
                        {t(formatMm(rating.switching))} <em>A</em>
                      </strong>
                      <span>{t("Courant commuté max.")}</span>
                    </article>
                    <article>
                      <strong>
                        {t(formatMm(rating.carry))} <em>A</em>
                      </strong>
                      <span>{t("Courant traversant max.")}</span>
                    </article>
                  </div>
                  <p className="sc-note">
                    {t(
                      "Respecter simultanément les limites de tension, de courant et de puissance. Les valeurs tension et courant s'entendent en continu ou en crête alternative, selon la fiche.",
                    )}
                  </p>
                  {specs.electricalNote && <p className="sc-note">{t(specs.electricalNote)}</p>}
                  <p className="sc-note">
                    {t(
                      "Options de série à vérifier pour la référence de commande exacte. Ce choix de consultation ne modifie pas le contact simulé du montage.",
                    )}
                  </p>
                </>
              )}
              {tab === "integration" && (
                <>
                  <h3>
                    <Thermometer size={19} />
                    {t("Environnement d'utilisation")}
                  </h3>
                  <div className="sc-temperatures">
                    {specs.temperatures.map((v) => (
                      <div key={v.condition}>
                        <span>{t(v.condition)}</span>
                        <strong>
                          {t(formatMm(v.min))} → {t(formatMm(v.max))} °C
                        </strong>
                      </div>
                    ))}
                  </div>
                  <h3>
                    <Ruler size={19} />
                    {t("Préparer le montage")}
                  </h3>
                  <p>{t(specs.integration)}</p>
                  {model.note && <p className="sc-note">{t(model.note)}</p>}
                  <p className="sc-note">
                    {t(
                      "Les dimensions décrivent le corps. Prévoir aussi les câbles, connexions, écrous, adaptateurs et dégagements de montage.",
                    )}
                  </p>
                </>
              )}
            </div>
          )}
          <footer>
            {sensorSource(model) && (
              <a href={sensorSource(model)!} target="_blank" rel="noreferrer">
                {t("Fiche fabricant · PDF")} <ArrowUpRight size={15} />
              </a>
            )}
            {specs && (
              <small>
                {t("Fiche de série ·")} {t(specs.revision)}
              </small>
            )}
            {model.id === "MK24-A-J" && (
              <a
                className="sc-secondary-source"
                href="https://www.mouser.com/pdfdocs/datasheet-reed-sensor-mk24-oe-v02.pdf"
                target="_blank"
                rel="noreferrer"
              >
                {t("Précision fabricant sur l'astérisque ↗")}
              </a>
            )}
            {onSelect && (
              <button className="mw-button" onClick={() => onSelect(model.id)}>
                {t("Utiliser ce capteur")}
                <ChevronRight size={16} />
              </button>
            )}
          </footer>
        </div>
      </div>
    </dialog>
  );
}
