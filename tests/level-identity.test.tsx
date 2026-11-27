import { GlobalRegistrator } from "@happy-dom/global-registrator";
if(typeof document === "undefined") GlobalRegistrator.register({url:"https://sensor-pal-tester.lovable.app/"});
import { afterEach, expect, test } from "bun:test";
import { act, cleanup, render, waitFor } from "@testing-library/react";
const { DesignSpace } = await import("../src/components/leadmagnet/design-space");
import { createDossier } from "../src/lib/leadmagnet/dossier";
import { levelDossier } from "../src/lib/level/dossier";
import { INITIAL_CONTEXT } from "../src/lib/level/configuration";
import { seedConfiguration } from "../src/lib/level/intake";
import { setLocale } from "../src/lib/i18n/core";

const originalFetch=globalThis.fetch, originalUrl=window.location.href, originalEnv=process.env["VITE_SUPABASE_URL"];
afterEach(()=>{cleanup();globalThis.fetch=originalFetch;window.location.href=originalUrl;
  if(originalEnv===undefined)delete process.env["VITE_SUPABASE_URL"];else process.env["VITE_SUPABASE_URL"]=originalEnv;setLocale("fr");});

for(const [id,industry,purpose,title] of [
  ["AUTO001/AUTO002","Automotive","Détecter le niveau de liquide de refroidissement dans un purgeur automobile.","Niveau du purgeur automobile"],
  ["AUTO003/AUTO004","Medical","Détecter le niveau d’eau dans un équipement médical de dialyse.","Niveau du réservoir de dialyse"],
] as const) test(`${id}: real level review calls identity API and forwards title; provider response is simulated`,async()=>{
  setLocale("fr");window.location.href="https://sensor-pal-tester.lovable.app/";process.env["VITE_SUPABASE_URL"]="https://identity-test.example.invalid";
  const requests:unknown[]=[];const identities:unknown[]=[];
  globalThis.fetch=(async(url,init)=>{
    if(String(url)!=="https://identity-test.example.invalid/functions/v1/project-identity")throw Error("Unexpected request");
    requests.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({title,industry}),{headers:{"content-type":"application/json"}});
  }) as typeof fetch;
  const context={...INITIAL_CONTEXT,purpose,detectionGoal:"low" as const};
  const dossier=levelDossier(createDossier(undefined,"fr"),context,seedConfiguration(context),{lengthChoice:"undecided",lengthMm:null,connectorChoice:"undecided",termination:{kind:"bare_leads"}},"Nouveau projet");
  const view=render(<DesignSpace chrome="embedded" visible reviewOnly={{dossier,onEditProject:()=>{},onEditConfiguration:()=>{},onIdentity:(...value)=>identities.push(value)}}/>);
  await waitFor(()=>expect(identities).toContainEqual([title,"ai"]),{timeout:4000});
  expect(requests).toHaveLength(1);
  expect(JSON.stringify(requests[0])).toContain(purpose);
  expect((view.getByLabelText(/^Industrie/) as HTMLSelectElement).value).toBe(industry);
});
