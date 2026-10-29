/** Physical flat-face plane XY (z=0), not a rotation of the housing dimensions. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {DEFAULT_WORKSHOP,type Vec3} from '../src/lib/standex/magnetic-workshop';
import {catalogueModel,catalogueEvaluate,catalogueBodyObb} from '../src/lib/standex/catalogue-pedagogical';
import {catalogueNominalScenario,CATALOGUE_RESPONSE,catalogueThresholds} from '../src/lib/standex/catalogue-response';
import {obbOverlap} from '../src/lib/detection-lab/obstacles';
const out=resolve(process.argv[2]??'../detection-c1-flat-20261029');mkdirSync(out,{recursive:true});
for(const magnetModel of ['SMCO5-5X4','N45-4X19','M04'])for(const perpendicular of [false,true]){
 const config={...DEFAULT_WORKSHOP,sensorId:'MK04',sensitivity:'C',magnetModel,guideReference:'MK04-1A66C-X'},m=catalogueModel(config);
 const frame:[Vec3,Vec3,Vec3]=perpendicular?[[0,1,0],[-1,0,0],[0,0,1]]:[[1,0,0],[0,1,0],[0,0,1]],axis=frame[0];
 const xs=Array.from({length:321},(_,i)=>-40+i*.25),ys=Array.from({length:121},(_,i)=>i*.25),m1:(number|null)[]=[],m2:(number|null)[]=[],blocked:boolean[]=[];
 for(const y of ys)for(const x of xs){const center:Vec3=[x,y,0],e=catalogueEvaluate(m,{center,axis,frame},catalogueNominalScenario(),frame,24);
  m1.push(e.ok?e.m1:null);m2.push(e.ok?e.m2:null);blocked.push(obbOverlap({path:'magnet',c:center,a:frame,h:m.magnetBody.map(n=>n/2) as Vec3},catalogueBodyObb(config)));
 }
 const projectedHalf=m.magnetBody.reduce((sum,n,i)=>sum+Math.abs(frame[i]![1])*n/2,0);
 const r={magnetModel,orientation:perpendicular?'perpendicular':'parallel',plane:'XY, z=0; normal Y to 23 x 13.9 mm face',body:m.body,magnetBody:m.magnetBody,axis,frame,firstCentralClearanceMm:m.body[1]/2+projectedHalf,parameters:CATALOGUE_RESPONSE,thresholds:catalogueThresholds('C'),xs,ys,m1,m2,blocked};
 writeFileSync(resolve(out,`${magnetModel}-${r.orientation}.json`),JSON.stringify(r));console.log(magnetModel,r.orientation,r.firstCentralClearanceMm);
}
