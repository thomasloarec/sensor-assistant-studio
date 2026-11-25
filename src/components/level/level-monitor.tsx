import type { CSSProperties } from "react";
import ContactCircuit from "@/components/standex/workshop/contact-circuit";
import { t } from "@/lib/i18n/core";
import { illustrativeReading, proposedContactForm, type Family, type LevelConfiguration } from "@/lib/level/configuration";

/** Operator display of the requested behaviour; no invented resistance codes. */
export function LevelMonitor({ configuration: c, family, level, available }: {
  configuration: LevelConfiguration; family: Family; level: number; available: boolean;
}) {
  const reading = illustrativeReading(c, level, family);
  const form = proposedContactForm(c, family);
  const percent = Math.round(reading.steppedMm / c.tankHeightMm * 100);
  return <aside className="lv-monitor panel-block" aria-label={t("Moniteur de niveau")}>
    <header><p className="t-label">{t("Moniteur de niveau")}</p>
      <h2 className="t-title-m">{t(c.mode === "continuous" ? "Mesure continue" : c.count === 1 ? "Signal de détection" : "Niveaux détectés")}</h2>
    </header>
    {!available ? <div className="lv-monitor-pending"><span className="t-display-m">—</span>
      <p className="t-title-s">{t(c.custom ? "Sur mesure" : "Lecture en attente")}</p>
      <p className="t-body">{t(c.custom ? "Votre besoin reste conservé. Décrivez les contraintes pour préparer l’étude avec Standex." : "Ajustez les réglages indiqués à gauche pour activer la démonstration.")}</p></div>
      : c.mode === "continuous" ? <>
        <output className="lv-monitor-value t-display-m t-metric">{reading.steppedMm} <span className="t-body">mm</span></output>
        <div className="lv-gauge-wrap">
          <div className="lv-gauge-scale t-caption t-metric"><span>{c.tankHeightMm} mm</span><span>{c.tankHeightMm / 2} mm</span><span>0 mm</span></div>
          <div className="lv-gauge" role="meter" aria-label={t("Hauteur du liquide")} aria-valuemin={0} aria-valuemax={c.tankHeightMm} aria-valuenow={reading.steppedMm}>
            <div className="lv-gauge-fill" style={{ height: `${reading.steppedMm / c.tankHeightMm * 100}%` }} />
          </div><span className="t-metric t-title-l">{percent} %</span>
        </div>
        <p className="t-caption">{t("Lecture illustrée par pas de 5 mm, sans garantie d’exactitude.")}</p>
      </> : c.count === 1 ? <>
        <p className="t-title-l lv-monitor-value">{t(reading.active ? "Signal actif" : "Signal inactif")}</p>
        <ContactCircuit contact={reading.active ? "closed" : "open"} />
        <div className="lv-single-level"><span className="t-caption">{t(c.closedWhen === "high" ? "Détection du niveau haut" : "Détection du niveau bas")}</span>
          <span className="t-title-l t-metric">{c.pointsMm[0]} mm</span>
          <span className="t-body">{t(reading.active ? "Niveau demandé détecté" : "Niveau demandé non détecté")}</span></div>
        <div className="lv-field t-caption"><span className="font-semibold">{family} · {t("Forme de contact proposée")}</span>
          <span>{form ? `${t("Forme")} ${form}` : t("À confirmer avec Standex")}</span></div>
      </> : <>
        <output className="lv-monitor-value t-display-m">{t("Niveau")} {reading.zone}</output>
        <ol className="lv-level-ladder" aria-label={t("Niveaux détectés")}>
          {Array.from({ length: c.count + 1 }, (_, index) => c.count - index).map(zone => {
            const low = zone === 0 ? 0 : c.pointsMm[zone - 1]!;
            const high = c.pointsMm[zone] ?? c.tankHeightMm;
            const mix = Math.round(zone / c.count * 100);
            return <li key={zone} data-active={reading.zone === zone} aria-current={reading.zone === zone ? "step" : undefined}
              style={{ "--lv-step-color": `color-mix(in oklch, var(--chart-1) ${mix}%, var(--chart-2))`,
                "--lv-step-width": `${36 + zone / c.count * 64}%` } as CSSProperties}>
              <div className="lv-level-step-label"><span className="t-body">{t("Niveau")} {zone}</span>
                <span className="t-caption t-metric">{low}–{high} mm</span></div>
              <span className="lv-level-step-bar" aria-hidden="true" />
            </li>;
          })}
        </ol>
        <p className="t-caption">{t("Codage par résistances à définir avec Standex.")}</p>
      </>}
    <footer className="t-caption">{t("Illustration du besoin")} · {t("Seuils à confirmer par Standex")}</footer>
  </aside>;
}
