import {DEFAULT_WORKSHOP} from '../src/lib/standex/magnetic-workshop';
import {defaultMagnetFor} from '../src/lib/standex/default-pairs';
import {catalogueClasses,catalogueFrame,cataloguePlacement} from '../src/lib/standex/catalogue-pedagogical';
import {publishedClasses} from '../src/lib/standex/magnetics/registries';
for(const sensorId of ['MK15','MK04']){
 const magnetModel=defaultMagnetFor(sensorId);
 console.log(JSON.stringify({sensorId,magnetModel,classes:catalogueClasses(sensorId,magnetModel,publishedClasses(sensorId,magnetModel))}));
 for(const geometry of ['D1','D3'] as const){
  const rows=[];
  for(let lateralShift=0;lateralShift<=20;lateralShift+=2){
   const c={...DEFAULT_WORKSHOP,sensorId,magnetModel,geometry,magnetAngle:90,end:.5,lateralShift};
   const f=catalogueFrame(c,.5),p=cataloguePlacement(c,f.pose);
   rows.push({shift:lateralShift,center:f.pose.center,state:p.state,zone:p.zone,cause:p.cause});
  }
  console.log(JSON.stringify({sensorId,geometry,rows}));
 }
}
