import ContactCircuit from "@/components/standex/workshop/contact-circuit";
import { t } from "@/lib/i18n/core";
import { cmValue, formatCm, formatPercent, formatLevel } from "@/lib/level/dimensions";
import { FAMILY_LABELS, illustrativeReading, proposedContactForm, type Family, type LevelConfiguration } from "@/lib/level/configuration";

/** Operator display of the requested behaviour; no invented resistance codes. */
export function LevelMonitor({ configuration: c, family, level, available, candidate = available }: {
  configuration: LevelConfiguration; family: Family; level: number; available: boolean; candidate?: boolean;
}) {
  const reading = illustrativeReading(c, level, family);
  const form = proposedContactForm(c, family);
  const percent = Math.round(reading.steppedMm / c.tankHeightMm * 100);

  return <aside className="lv-monitor panel-block" aria-label={t("Moniteur de niveau")}>
    <header><p className="t-label">{t(candidate ? "Piste à étudier" : "Demande spécifique")}</p>
      <h2 className="t-display-m">{c.custom ? t("Sur mesure") : candidate ? (c.orientation === "horizontal" && c.count > 1 ? c.count + " × " : "") + family : t("Avec Standex")}</h2>
      {candidate ? <p className="t-body">{t(FAMILY_LABELS[family])}</p> : null}
      <p className="t-label">{t("Moniteur de niveau")}</p>
      <h2 className="t-title-m">{t(c.mode === "continuous" ? "Mesure continue" : c.count === 1 ? "Signal de détection" : "Niveaux détectés")}</h2>
    </header>
    {!available ? <div className="lv-monitor-pending"><span className="t-display-m">—</span>
      {!c.custom ? <p className="t-title-s">{t("Lecture en attente")}</p> : null}
      <p className="t-body">{t(c.custom ? "Votre besoin reste conservé. Décrivez les contraintes pour préparer l’étude avec Standex." : "Ajustez les réglages indiqués à gauche pour activer la démonstration.")}</p></div>
      : c.mode === "continuous" ? <>
        <output className="lv-monitor-value t-display-m t-metric">{formatCm(reading.steppedMm)} <span className="t-body">cm</span></output>
        <div className="lv-gauge-wrap">
          <div className="lv-gauge-scale t-caption t-metric"><span>{formatLevel(c.tankHeightMm,c.tankHeightMm)}</span><span>{formatLevel(c.tankHeightMm / 2,c.tankHeightMm)}</span><span>0 cm · 0 %</span></div>
          <div className="lv-gauge" role="meter" aria-label={t("Hauteur du liquide")} aria-valuemin={0} aria-valuemax={cmValue(c.tankHeightMm)} aria-valuenow={cmValue(reading.steppedMm)} aria-valuetext={formatLevel(reading.steppedMm,c.tankHeightMm)}>
            <div className="lv-gauge-fill" style={{ height: `${reading.steppedMm / c.tankHeightMm * 100}%` }} />
          </div><span className="t-metric t-title-l">{percent} %</span>
        </div>
        <p className="t-caption">{t("Lecture illustrée par pas de 0,5 cm, sans garantie d’exactitude.")}</p>
      </> : c.count === 1 ? <>
        <p className="t-title-l lv-monitor-value">{t(reading.active ? "Signal actif" : "Signal inactif")}</p>
        <ContactCircuit contact={reading.active ? "closed" : "open"} />
        <div className="lv-single-level"><span className="t-caption">{t(c.closedWhen === "high" ? "Détection du niveau haut" : "Détection du niveau bas")}</span>
          <span className="t-title-l t-metric">{formatCm(c.pointsMm[0]!)} cm</span><span className="t-body t-metric">{formatPercent(c.pointsMm[0]!,c.tankHeightMm)} %</span>
          <span className="t-body">{t(reading.active ? "Niveau demandé détecté" : "Niveau demandé non détecté")}</span></div>
        <div className="lv-field t-caption"><span className="font-semibold">{family} · {t("Forme de contact proposée")}</span>
          <span>{form ? `${t("Forme")} ${form}` : t("À confirmer avec Standex")}</span></div>
      </> : <>
        <output className="lv-monitor-value t-title-l">{t(reading.pointStates[0]?.active ? "Niveau bas détecté" : reading.pointStates.at(-1)?.active ? "Niveau haut détecté" : "Entre les repères")}
          {!reading.pointStates[0]?.active && !reading.pointStates.at(-1)?.active ? <span className="t-body lv-interval">P{reading.zone} – P{reading.zone+1}</span> : null}</output>
        <ol className="lv-level-bars" aria-label={t("Repères atteints")}>
          {[...reading.pointStates].reverse().map(point => {
            const reached=point.index < reading.zone;
            return <li key={point.index} data-reached={reached} data-point={point.index + 1}>
              <span className="lv-level-bar" aria-hidden="true" />
              <div className="lv-bar-copy"><strong className="t-body">P{point.index + 1} · {t(point.index === 0 ? "Niveau bas" : point.index === c.count - 1 ? "Niveau haut" : "Niveau intermédiaire")}</strong>
                <span className="t-caption t-metric">{formatLevel(point.heightMm,c.tankHeightMm)}</span>
                <span className="t-caption">{t(reached ? "Repère atteint" : "Repère non atteint")}</span></div>
            </li>;
          })}
        </ol>
        <p className="t-caption">{t("Les barres se remplissent du bas vers le haut, à chaque repère atteint. Entre deux repères, la hauteur exacte n’est pas mesurée.")}</p>
        <details className="lv-details"><summary>{t("Signaux des contacts")}</summary>
          <ul className="lv-contact-states">{[...reading.pointStates].reverse().map(point=><li key={point.index} className="t-caption">P{point.index+1} · {t(point.active ? "Signal actif" : "Signal inactif")}</li>)}</ul>
          <p className="t-caption">{t("Le signal de niveau bas s’active sous P1 ; les autres s’activent à leur seuil.")}</p>
        </details>
        <p className="t-caption">{t(c.orientation === "horizontal" ? "Un capteur horizontal par point, avec des sorties distinctes à raccorder." : "Codage par résistances à définir avec Standex.")}</p>
      </>}
    <footer className="t-caption">{t("Illustration du besoin")} · {t("Seuils à confirmer par Standex")}</footer>
  </aside>;
}
