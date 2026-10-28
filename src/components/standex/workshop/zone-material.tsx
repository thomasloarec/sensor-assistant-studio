import { useEffect, useMemo } from 'react';
import { DataTexture, DoubleSide, FloatType, MeshBasicMaterial, RGBAFormat } from 'three';
import { clearanceTextureData, type ClearanceRegion } from '@/lib/standex/zone-clearance';

/** Fragment clipping avoids resampling the whole volume for every moving part.
 * Every visible fragment tests the full magnet body against CURRENT envelopes.
 * Mesh coordinates and envelope planes are both in the reed frame. */
export function ZoneMaterial({core,regions}:{core:boolean;regions:readonly ClearanceRegion[]}){
 const state=useMemo(()=>{
  const texture=new DataTexture(new Float32Array(128),32,1,RGBAFormat,FloatType);
  const uniforms={zonePlanes:{value:texture},zoneParts:{value:0},zoneRows:{value:1}};
  const material=new MeshBasicMaterial({color:core?'#32a9a8':'#d2a746',opacity:core?.22:.12,transparent:true,depthWrite:false,side:DoubleSide});
  material.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,uniforms);
   // i18n-canonical: GLSL source and Three shader hooks, never visible interface text.
   shader.vertexShader='varying vec3 zonePosition;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nzonePosition = position;');
   shader.fragmentShader='varying vec3 zonePosition;\nuniform sampler2D zonePlanes;\nuniform int zoneParts;\nuniform float zoneRows;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
    for(int part=0;part<zoneParts;part++) {
     bool overlap=true;
     for(int p=0;p<30;p++) {
      vec4 plane=texture2D(zonePlanes,vec2((float(p)+0.5)/32.0,(float(part)+0.5)/zoneRows));
      if(dot(plane.xyz,zonePosition)>=plane.w){overlap=false;break;}
     }
     if(overlap)discard;
    }`);
  };
  material.customProgramCacheKey=()=> 'zone-clearance-v1';
  return {texture,material,uniforms};
 },[core]);
 // Updating this small texture preserves the mesh and shader program during animation.
 const data=useMemo(()=>clearanceTextureData(regions),[regions]);
 state.texture.image={data,width:32,height:Math.max(1,regions.length)};
 state.texture.needsUpdate=true;
 state.uniforms.zoneParts.value=regions.length;state.uniforms.zoneRows.value=Math.max(1,regions.length);
 useEffect(()=>()=>{state.material.dispose();state.texture.dispose();},[state]);
 return <primitive object={state.material} attach="material"/>;
}
