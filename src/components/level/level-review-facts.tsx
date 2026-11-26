import type { DesignDossier } from "@/lib/leadmagnet/dossier";
import { levelProjectFacts, levelTechnicalFacts } from "@/lib/level/dossier";
import { t } from "@/lib/i18n/core";

/** The same facts feed the screen and the complete project PDF. */
export function LevelReviewFacts({dossier,technical=false,onEdit}:{dossier:DesignDossier;technical?:boolean;onEdit?:(()=>void)|undefined}) {
  const rows=technical?levelTechnicalFacts(dossier,t):levelProjectFacts(dossier.levelStudy!,t);
  return <section className="panel-block-lg">
    <h3 className="t-title-m">{t(technical?"Configuration technique":"Votre projet")}</h3>
    <dl className="review-facts mt-3">{rows.map(([label,value])=><div className="review-fact" key={label}><dt className="review-fact-label">{label}</dt><dd className="t-body">{value}</dd></div>)}</dl>
    {onEdit?<button type="button" className="text-link mt-3 min-h-11" onClick={onEdit}>{t(technical?"Modifier la configuration":"Modifier le liquide et les températures")}</button>:null}
  </section>;
}
