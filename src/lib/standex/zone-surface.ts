/** Display geometry only; never used to classify a placement. */
import { BufferAttribute, BufferGeometry, Float32BufferAttribute } from 'three';
import type { VolumeField } from './catalogue-pedagogical';
/** Smooth threshold surface (surface nets) over the SAME sampled field: shared vertices, smooth
 * normals, local spatial interpolation at constant threshold only. Null or blocked nodes are
 * outside, so nothing bridges the central zero gap, obstacles stay masked and the domain
 * boundary is never closed. Rendering only — the verdict never reads this mesh. */
export function smoothSurface(field:VolumeField,threshold:number):BufferGeometry {
  const {xs,ys,zs,values,blocked}=field,nx=xs.length,ny=ys.length,nz=zs.length;
  const at=(i:number,j:number,k:number)=>(k*ny+j)*nx+i;
  const value=(idx:number)=>blocked[idx]?null:values[idx]??null;
  const inside=(idx:number)=>{const v=value(idx);return v!==null&&v>=threshold;};
  const coord=(i:number,j:number,k:number):[number,number,number]=>[xs[i]??0,ys[j]??0,zs[k]??0];
  const EDGES:[number,number,number][][]=[[[0,0,0],[1,0,0]],[[0,1,0],[1,1,0]],[[0,0,1],[1,0,1]],[[0,1,1],[1,1,1]],[[0,0,0],[0,1,0]],[[1,0,0],[1,1,0]],[[0,0,1],[0,1,1]],[[1,0,1],[1,1,1]],[[0,0,0],[0,0,1]],[[1,0,0],[1,0,1]],[[0,1,0],[0,1,1]],[[1,1,0],[1,1,1]]];
  const cellVertex=new Map<number,number>(),positions:number[]=[];
  for(let k=0;k<nz-1;k++)for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){
    const corners=[0,1,0,1,0,1,0,1].map((_,e)=>at(i+(e&1),j+((e>>1)&1),k+((e>>2)&1)));
    const mask=corners.map(inside);
    if(mask.every(Boolean)||mask.every(m=>!m))continue;
    let px=0,py=0,pz=0,crossings=0;
    for(const [ca,cb] of EDGES){
      const ia=at(i+(ca?.[0]??0),j+(ca?.[1]??0),k+(ca?.[2]??0)),ib=at(i+(cb?.[0]??0),j+(cb?.[1]??0),k+(cb?.[2]??0));
      if(inside(ia)===inside(ib))continue;
      const va=value(ia),vb=value(ib);
      const pa=coord(i+(ca?.[0]??0),j+(ca?.[1]??0),k+(ca?.[2]??0)),pb=coord(i+(cb?.[0]??0),j+(cb?.[1]??0),k+(cb?.[2]??0));
      const f=va!==null&&vb!==null&&vb!==va?Math.min(1,Math.max(0,(threshold-va)/(vb-va))):.5;
      px+=pa[0]+f*(pb[0]-pa[0]);py+=pa[1]+f*(pb[1]-pa[1]);pz+=pa[2]+f*(pb[2]-pa[2]);crossings++;
    }
    if(!crossings)continue;
    cellVertex.set((k*(ny-1)+j)*(nx-1)+i,positions.length/3);
    positions.push(px/crossings,py/crossings,pz/crossings);
  }
  const indices:number[]=[];
  const quad=(cells:(number|undefined)[],flip:boolean)=>{
    const vs=cells.flatMap(c=>c===undefined?[]:[cellVertex.get(c)]).filter((v):v is number=>v!==undefined);
    if(vs.length!==4)return;
    const [a,b,c,d]=vs as [number,number,number,number];
    if(flip)indices.push(a,c,b,a,d,c);else indices.push(a,b,c,a,c,d);
  };
  const cell=(i:number,j:number,k:number)=>i>=0&&j>=0&&k>=0&&i<nx-1&&j<ny-1&&k<nz-1?(k*(ny-1)+j)*(nx-1)+i:undefined;
  for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx-1;i++){
    const a=at(i,j,k),b=at(i+1,j,k);if(inside(a)===inside(b))continue;
    quad([cell(i,j-1,k-1),cell(i,j,k-1),cell(i,j,k),cell(i,j-1,k)],inside(a));
  }
  for(let k=0;k<nz;k++)for(let j=0;j<ny-1;j++)for(let i=0;i<nx;i++){
    const a=at(i,j,k),b=at(i,j+1,k);if(inside(a)===inside(b))continue;
    quad([cell(i-1,j,k-1),cell(i-1,j,k),cell(i,j,k),cell(i,j,k-1)],inside(a));
  }
  for(let k=0;k<nz-1;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    const a=at(i,j,k),b=at(i,j,k+1);if(inside(a)===inside(b))continue;
    quad([cell(i-1,j-1,k),cell(i,j-1,k),cell(i,j,k),cell(i-1,j,k)],inside(a));
  }
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

export type PackedSurface={positions:Float32Array;normals:Float32Array;indices:Uint32Array};
export function packSurface(field:VolumeField,threshold:number):PackedSurface {
 const g=smoothSurface(field,threshold);
 const out={positions:new Float32Array(g.getAttribute('position').array),normals:new Float32Array(g.getAttribute('normal').array),indices:new Uint32Array(g.index?.array??[])};g.dispose();return out;
}
export function unpackSurface(p:PackedSurface):BufferGeometry {const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(p.positions,3));g.setAttribute('normal',new BufferAttribute(p.normals,3));g.setIndex(new BufferAttribute(p.indices,1));return g;}
