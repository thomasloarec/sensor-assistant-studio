import {DEFAULT_WORKSHOP,applySensorSelection} from '../src/lib/standex/magnetic-workshop';
import {catalogueFrame,cataloguePlacement,catalogueModel} from '../src/lib/standex/catalogue-pedagogical';
import {discoveryPatch} from '../src/lib/standex/discovery-preset';
import {slideGapLimit,slideClearance} from '../src/lib/standex/discovery-slide';
const intervals=(c:typeof DEFAULT_WORKSHOP)=>{
 let prev=false, n=0, ends:number[]=[];
 for(let i=0;i<=500;i++){const t=i/1000,e=cataloguePlacement(c,catalogueFrame(c,t).pose,[],undefined,true);const on=e.zone>0;if(on&&!prev){n++;ends.push(t);}prev=on;}
 return {n,starts:ends};
};
for(const geometry of ['D1','D3'] as const){
 let c=applySensorSelection(DEFAULT_WORKSHOP,'MK07');c={...c,...discoveryPatch(c,{geometry,motion:'approach'})};
 console.log('MK07',geometry,c.magnetModel,catalogueModel(c).centre,intervals(c));
 for(const x of [-30,-25,-20,-10,0,5]){const e=cataloguePlacement(c,{center:[x,0,10],axis:[1,0,0]},[],undefined,true);console.log(x,e.zone,e.cause);}
}
for(const id of ['MK04','MK07','MK06-4']){
 let c=applySensorSelection(DEFAULT_WORKSHOP,id);c={...c,...discoveryPatch(c,{motion:'slide'})};
 const limit=slideGapLimit(c);console.log(id,'limit',limit,'clear',slideClearance(c));
 for(const gap of [.25,1,2,4,limit])console.log(gap,intervals({...c,offset:slideClearance(c)+gap}));
}
