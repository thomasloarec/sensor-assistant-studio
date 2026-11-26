import { t } from "@/lib/i18n/core";
import { finiteInput, type LevelContext } from "@/lib/level/configuration";
import { formatLevel } from "@/lib/level/dimensions";

/** Requested heights only: blank fields never masquerade as measured positions. */
export function IntakeTank({context, onSelect}: {context: LevelContext; onSelect: (index:number)=>void}) {
  const height=finiteInput(context.tankHeight), count=context.detectionCount ?? 2;
  const rows=Array.from({length:count},(_,i)=>({i,value:finiteInput(context.detectionHeights?.[i] ?? "")})).reverse();
  const h=Math.max(240,count*56);
  return <section className="lv-intake-tank" aria-label={t("Vos repères dans la cuve")}>
    <h3 className="t-title-s">{t("Vos repères dans la cuve")}</h3>
    <p className="t-caption">{t("Cliquez sur un repère pour renseigner sa hauteur.")}</p>
    <div className="lv-intake-diagram" style={{height:h}}>
      <svg viewBox={"0 0 100 " + h} preserveAspectRatio="none" aria-hidden="true">
        <path className="lv-tank-outline" d={"M 8 12 V " + (h-12) + " H 60 V 12"}/>
        {height && height>0 ? rows.map(({i,value},r)=>value!==null && value>=0 && value<=height ? <g key={i}>
          <path className="lv-tank-leader" d={"M 12 " + (12+(1-value/height)*(h-24)) + " H 60 L 96 " + ((r+.5)*h/count)} />
          <circle className="lv-tank-dot" cx="12" cy={12+(1-value/height)*(h-24)} r="3" />
        </g> : null) : null}
      </svg>
      <div className="lv-intake-labels">{rows.map(({i,value})=><button key={i} type="button" onClick={()=>onSelect(i)}>
        <strong className="t-body">P{i+1}</strong><span className="t-caption t-metric">{value!==null && height && height>0 ? formatLevel(value,height) : t("À définir")}</span>
      </button>)}</div>
    </div>
    <p className="t-caption">0 % · {t("Fond de cuve")}</p>
  </section>;
}
