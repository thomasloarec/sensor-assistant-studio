import { GlobalRegistrator } from "@happy-dom/global-registrator";
if(typeof document === "undefined") GlobalRegistrator.register({url:"https://example.invalid/"});
import { afterEach, expect, test } from "bun:test";
import { act,cleanup,fireEvent,render,within } from "@testing-library/react";
import LevelJourney from "../src/components/level/level-journey";
import { setLocale,t,type Locale } from "../src/lib/i18n/core";
import { LEVEL_REQUIREMENT_MESSAGES } from "../src/lib/level/requirements";
afterEach(()=>{cleanup();setLocale("fr");});
async function change(element:HTMLElement,value:string){
  const setter=Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,"value")!.set!;
  const key=Object.keys(element).find(k=>k.startsWith("__reactProps$"))!;
  await act(async()=>{setter.call(element,value);(element as any)[key].onChange({target:element});});
}
async function journey(){
  setLocale("fr");const view=render(<LevelJourney active={false}/>);
  const click=async(name:string)=>{await act(async()=>fireEvent.click(view.getByRole("button",{name,exact:true})));};
  await click("Configurer un capteur de niveau");await change(view.getByLabelText("Votre application"),"TEST — Niveau bas d’eau dans un réservoir industriel.");
  return {view,click};
}
test("CFG007/CFG008/CFG009: invalid cable cannot bypass through the stepper, and unknown is an explicit recovery",async()=>{
  const {view,click}=await journey();await click("3. Résultat");await click("Sur mesure");
  const field=view.getByRole("textbox",{name:"Longueur sur mesure (cm)"});
  for(const value of ["-10","0","abc"]) {
    await change(field,value);await click("4. Avec Standex");
    expect((view.getByRole("button",{name:"Continuer avec Standex →"}) as HTMLButtonElement).disabled).toBe(true);
    expect(view.queryByRole("heading",{name:"Détails du projet"})).toBeNull();
    expect(view.getByRole("alert").textContent).toContain("longueur positive");
  }
  await act(async()=>fireEvent.click(within(view.getByRole("group",{name:"Longueur de câble"})).getByRole("button",{name:"Je ne sais pas"})));
  await click("4. Avec Standex");expect(await view.findByRole("heading",{name:"Détails du projet"})).toBeTruthy();
});
test("NDA001/SUB001: level review exposes confidentiality and incomplete submission feedback",async()=>{
  const {view,click}=await journey();await click("4. Avec Standex");
  expect(await view.findByRole("checkbox",{name:/Mon projet est confidentiel/})).toBeTruthy();
  await click("Envoyer mon projet");
  const dialog=await view.findByRole("dialog");expect(dialog.textContent).toContain("Choisissez une industrie");
  expect(dialog.textContent).toContain("Consentement");
});
test("CFG001: manual level project name survives configuration and review navigation",async()=>{
  const {view,click}=await journey();await click("Renommer le projet « Nouveau projet »");
  const title=view.getByRole("textbox",{name:/Nom du projet/}); await change(title,"TEST — Mon nom manuel");
  await act(async()=>fireEvent.keyDown(title,{key:"Enter"}));await click("3. Résultat");
  expect(view.getByRole("heading",{name:"TEST — Mon nom manuel",exact:true})).toBeTruthy();
});
for(const [index,locale] of (["en","de","es","it","ru","zh","ja"] as Locale[]).entries()) test(`I18N00${index+1}: level review and constraint messages in ${locale} preserve the request`,async()=>{
  const {view,click}=await journey();await click("4. Avec Standex");await view.findByRole("heading",{name:"Détails du projet"});
  await act(async()=>setLocale(locale));
  expect(view.getByRole("heading",{name:t("Détails du projet"),exact:true})).toBeTruthy();
  expect(view.getByText("TEST — Niveau bas d’eau dans un réservoir industriel.")).toBeTruthy();
  for(const message of Object.values(LEVEL_REQUIREMENT_MESSAGES)) expect(t(message)).not.toBe(message);
  await act(async()=>setLocale("fr"));expect(view.getByRole("heading",{name:"Détails du projet"})).toBeTruthy();
});
