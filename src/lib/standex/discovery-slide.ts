import { approachOffset, type WorkshopConfig } from './magnetic-workshop';
import { catalogueFrame, catalogueModel, cataloguePlacement } from './catalogue-pedagogical';

export const slideClearance=(c:WorkshopConfig)=>approachOffset({...c,geometry:'D1'});
/** Last accessible central-lobe position, at the same illustrative bound as the lamp.
 * Only sets a slider limit. It never changes a placement, threshold or contact result.
 * For an orientation with no central lobe, keep a simple mechanical adjustment range. */
export function slideGapLimit(c:WorkshopConfig):number {
 const clearance=slideClearance(c), model=catalogueModel(c);
 const f=catalogueFrame({...c,motion:'slide'},.25).pose;
 let last:number|null=null;
 for(let gap=.25;gap<=50;gap+=.25){
  const pose={...f,center:[model.centre[0],0,clearance+gap] as [number,number,number]};
  const e=cataloguePlacement(c,pose,[],model,true);
  if(e.zone>0)last=gap;
 }
 return last??15;
}
