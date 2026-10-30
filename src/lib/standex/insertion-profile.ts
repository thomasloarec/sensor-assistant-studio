import type { SensorModel } from './sensor-catalog';
export interface InsertionPart { name:string; center:number; length:number; diameter:number; hexWidth?:number; metal?:boolean }
/** Axial profile shared by 3D, plan and simplified STEP. The supplied drawing fixes
 * nose/thread/overall lengths; the shoulder-to-hex split is illustrative. */
export function insertionParts(model:SensorModel):InsertionPart[] {
 const m=model.insertionMount;if(!m)return [];
 const origin=-model.body[0]/2, nose=m.insertionLength-m.threadLength;
 const part=(name:string,start:number,length:number,diameter:number):InsertionPart=>({name,center:origin+start+length/2,length,diameter});
 return [part('nose',0,nose,m.noseDiameter),part('thread',nose,m.threadLength,m.threadDiameter),
 part('shoulder',m.insertionLength,m.shoulderLength,model.body[1]),
 {...part('rear',m.insertionLength+m.shoulderLength,model.body[0]-m.insertionLength-m.shoulderLength,m.rearHexWidth*2/Math.sqrt(3)),hexWidth:m.rearHexWidth},
 {...part('nut',m.insertionLength-m.nutThickness-1,m.nutThickness,m.nutWidth*2/Math.sqrt(3)),hexWidth:m.nutWidth,metal:true}];
}
