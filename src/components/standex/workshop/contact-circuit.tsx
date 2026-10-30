import { t } from "@/lib/i18n/core";
import type { Contact } from "@/lib/standex/magnetic-workshop";

/** A readout of the simulation's contact, never a second electrical model. */
export default function ContactCircuit({ contact, unavailable=false, formC=false }: { contact: Contact;unavailable?:boolean;formC?:boolean }) {
  if(formC)return <ChangeoverCircuit contact={contact} unavailable={unavailable}/>;
  const closed = contact === "closed";
  const unknown = contact === "unknown"&&!unavailable;
  const label = t(unavailable?'Simulation indisponible à cette position':unknown
    ? "Circuit indéterminé : lampe grisée"
    : closed
      ? "Circuit illustré fermé : lampe allumée"
      : "Circuit illustré ouvert : lampe éteinte");

  return (
    <div className="mw-contact-circuit" data-contact={unavailable?'unavailable':contact} role="img" aria-label={label}>
      <svg viewBox="0 0 208 86" aria-hidden="true">
        {/* The source, reed and lamp are in series, with gaps at each symbol. */}
        <path className="mw-mini-wire" d="M24 39 V20 H78 M130 20 H178 V35 M178 61 V74 H24 V53" />
        <path className="mw-mini-source" d="M14 39 H34 M18 46 H30 M14 53 H34" />
        <rect className="mw-mini-capsule" x="71" y="8" width="66" height="25" rx="12" />
        {!unknown && <path className="mw-mini-switch" d="M78 20 H114" />}
        <path className="mw-mini-wire" d="M115 20 H130" />
        <circle className="mw-mini-terminal" cx="78" cy="20" r="2.5" />
        <circle className="mw-mini-terminal" cx="114" cy="20" r="2.5" />
        {closed && <path className="mw-mini-current" d="M24 20 H178 V74 H24 Z" />}
        <circle className="mw-mini-bulb" cx="178" cy="48" r="13" />
        <path className="mw-mini-filament" d="M172 42 L184 54 M184 42 L172 54" />
        {closed && <path className="mw-mini-rays" d="M178 28 V25 M198 48 H201 M194 32 L197 29 M194 64 L197 67 M158 48 H155" />}
        {unknown ? <text x="104" y="25" textAnchor="middle">?</text> : null}
        <text x="104" y="57" textAnchor="middle">{t("Reed")}</text>
      </svg>
      <span className="t-caption">{t(unavailable ? 'Simulation indisponible à cette position' : unknown ? "État indéterminé" : closed ? "Contact fermé" : "Contact ouvert")}</span>
    </div>
  );
}

/** NC/rest is A, NO/actuated is B, using the same state as the three blades.
 * Unknown/unavailable positions energize neither branch. No second threshold. */
function ChangeoverCircuit({contact,unavailable}:{contact:Contact;unavailable:boolean}) {
  const active=unavailable||contact==='unknown'?null:contact==='closed'?'B':'A';
  const label=t(unavailable?'Simulation indisponible à cette position':active==='A'?'Circuit A actif':active==='B'?'Circuit B actif':'État indéterminé');
  return <div className="mw-contact-circuit mw-changeover-circuit" data-contact={unavailable?'unavailable':contact} data-active-circuit={active??'none'} role="img" aria-label={label}>
    <svg viewBox="0 0 208 116" aria-hidden="true">
      <path className="mw-mini-wire" d="M20 56 V40 H66 M20 70 V104 H182"/>
      <path className="mw-mini-source" d="M10 56 H30 M14 63 H26 M10 70 H30"/>
      <rect className="mw-mini-capsule" x="59" y="10" width="60" height="61" rx="12"/>
      {(['A','B'] as const).map((branch)=>{
        const x=branch==='A'?142:182,y=branch==='A'?24:56;
        return <g key={branch} data-branch={branch} data-active={active===branch}>
          <path className="mw-mini-wire" d={`M108 ${y} H${x} V69 M${x} 95 V104`}/>
          <circle className="mw-mini-terminal" cx="108" cy={y} r="2.5"/>
          <circle className="mw-mini-bulb" cx={x} cy="82" r="13"/>
          <path className="mw-mini-filament" d={`M${x-6} 76 L${x+6} 88 M${x+6} 76 L${x-6} 88`}/>
          <text x={x} y="18" textAnchor="middle">{branch}</text>
        </g>;
      })}
      <path className="mw-changeover-blade" d={`M66 40 L108 ${active==='A'?24:active==='B'?56:40}`}/>
      <circle className="mw-mini-terminal" cx="66" cy="40" r="2.5"/>
      <text x="86" y="87" textAnchor="middle">{t('Reed')}</text>
    </svg>
    <span className="t-caption">{label}</span>
    <span className="t-caption mw-changeover-legend">{t('A : au repos · B : aimant détecté')}</span>
  </div>;
}
