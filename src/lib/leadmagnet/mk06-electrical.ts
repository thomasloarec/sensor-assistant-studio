import type { Requirement } from './dossier';
import { SENSOR_SPECIFICATIONS } from '../standex/sensor-specifications';
/** Only unambiguous, explicitly written positive signal ratings are filtered.
 * Multiple values, negations, ranges or a load/interface description stay with R&D.
 * A single contact option must satisfy all limits; never mix maxima across options. */
export function mk06ElectricalFits(id:string,requirements:readonly Requirement[]):boolean|null {
 if(!id.startsWith('MK06-'))return null;
 const text=requirements.filter(r=>r.key==='electrical'&&r.state==='confirmed').map(r=>`${r.value} ${r.unit??''}`).join(' ').toLowerCase();
 if(/\b(motor|moteur|relais|relay|contactor|contacteur|carry|traversant|sans|without|not|pas|nicht|ohne|sin|non|нет|без)\b|[<>≤≥–]|\d\s*-\s*\d/.test(text))return null;
 const read=(unit:string)=>{
  const found=[...text.matchAll(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${unit})(?:dc|ac)?\\b`,'g'))];
  if(found.length!==1)return null;
  const m=found[0]!,n=Number(m[1]!.replace(',','.'));return n*(m[2]!.startsWith('m')?.001:1);
 };
 const voltage=read('v'),current=read('ma|a'),power=read('mw|w');
 if(voltage===null&&current===null&&power===null)return null;
 const demandPower=power??(voltage!==null&&current!==null?voltage*current:null);
 return (SENSOR_SPECIFICATIONS[id]?.electrical??[]).some(o=>
  (voltage===null||voltage<=o.voltage)&&(current===null||current<=o.switching)&&
  (demandPower===null||demandPower<=o.power));
}
