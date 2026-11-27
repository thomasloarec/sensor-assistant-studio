import { GlobalRegistrator } from "@happy-dom/global-registrator";
if(typeof document === "undefined") GlobalRegistrator.register({url:"https://example.invalid/"});
import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import LevelJourney from "../src/components/level/level-journey";
import { setLocale } from "../src/lib/i18n/core";
import cases from "./fixtures/level-80-20261127.json";
import { LEVEL_REQUIREMENT_MESSAGES as messages } from "../src/lib/level/requirements";

afterEach(()=>{cleanup();setLocale("fr");});
async function input(element:HTMLElement,value:string){
  const prototype=element instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  const setter=Object.getOwnPropertyDescriptor(prototype,"value")!.set!;
  const key=Object.keys(element).find(k=>k.startsWith("__reactProps$"))!;
  const props=(element as unknown as Record<string,{onChange:(event:{target:HTMLElement})=>void}>)[key]!;
  await act(async()=>{setter.call(element,value);props.onChange({target:element});});
}
const issueById:Record<string,keyof typeof messages>={L002:"empty",L003:"inferred",L004:"empty",L005:"scope",L006:"scope",L007:"solid",L008:"magnetic",L009:"magnetic",L010:"movement",L030:"hygiene",L031:"certification",L032:"viscosity",L072:"certification",L073:"load",L074:"certification",L075:"accessClosed",L076:"precision",L078:"freezing",L079:"access",L080:"goal"};
const noFamily=new Set(["L002","L004","L005","L006","L007","L008","L009","L010","L018","L047","L060","L073","L075","L078","L079","L080"]);
const extraFamilies:Record<string,string>={L003:"LS01",L019:"LS04",L020:"LS04",L021:"LS04",L022:"LS04",L025:"LS04",L026:"LS04",L029:"LS04",L030:"LS04",L031:"LS04",L032:"LS04",L033:"LS04",L034:"LS04",L035:"LS04",L036:"LS04",L037:"LS04",L038:"LS04",L042:"LS04",L043:"LS04",L044:"LS04",L045:"LS05",L046:"LS05",L058:"LS02",L061:"LS04",L062:"LS05",L063:"LS05",L064:"2 × LS03",L068:"LS04",L071:"LS05",L072:"LS04",L074:"LS04",L076:"LS05",L077:"LS04"};

for(const scenario of cases) test(`${scenario.id} — ${scenario.name}`,async()=>{
  setLocale("fr"); const view=render(<LevelJourney active={false}/>); const data=scenario.input;
  const click=async(name:string)=>{await act(async()=>fireEvent.click(view.getByRole("button",{name,exact:true})));};
  const select=async(label:string,text:string)=>{
    const field=view.getByLabelText(label) as HTMLSelectElement;
    const option=[...field.options].find(option=>option.textContent===text); expect(option).toBeDefined();
    await act(async()=>fireEvent.change(field,{target:{value:option!.value}}));
  };
  await click("Configurer un capteur de niveau");
  await input(view.getByLabelText("Votre application"),data.purpose); await click("Continuer");
  await select("Liquide",data.fluid);
  if(data.fluid!=="À définir") await input(view.getByLabelText(data.fluid==="Eau"?"Type d’eau et éventuels additifs":"Nom ou référence du liquide"),data.fluidName);
  await input(view.getByLabelText("Température minimale (°C)"),data.min); await input(view.getByLabelText("Température maximale (°C)"),data.max);
  const block = async(step:number) => {
    expect((view.getByRole("button",{name:step===4?"Ouvrir le configurateur":"Continuer",exact:true}) as HTMLButtonElement).disabled).toBe(true);
    expect(view.getAllByRole("alert").length).toBeGreaterThan(0);
    for(const nav of ["2. Configuration","3. Résultat","4. Avec Standex"]) {
      await click(nav); expect(view.container.querySelector(".questionnaire-count")?.textContent).toContain(String(step));
      expect(view.queryByRole("heading",{name:"Détails du projet"})).toBeNull();
    }
  };
  if(scenario.expect.blockedAt===2) {await block(2);return;}
  await click("Continuer");
  await select("Accès pour installer le capteur",data.access);
  await input(view.getByRole("textbox",{name:/^Hauteur utile de la cuve/}),data.height);
  await input(view.getByRole("textbox",{name:/^Contraintes à connaître/}),data.constraints);
  await select("Cuve",data.tank);await select("Immersion du corps du capteur",data.body);await select("Sortie de câble et câble",data.cable);
  if(scenario.expect.blockedAt===3) {await block(3);return;}
  await click("Continuer");await select("Niveau à détecter",data.goal);await select("Le liquide peut-il faire des vaguelettes ?",data.waves);
  if(data.count) {
    await select("Combien de niveaux faut-il détecter ?",String(data.count));
    const values=data.points??data.percents??[]; const unit=data.percents?"%":"cm";
    for(const [index,value] of values.entries()) await input(view.getByLabelText(`Point ${index+1} (${unit})`),value);
  }
  if(scenario.expect.blockedAt===4) {await block(4);return;}
  await click("Ouvrir le configurateur");
  const expectedFamily=scenario.expect.family??extraFamilies[scenario.id];
  if(noFamily.has(scenario.id)) {
    expect(view.getByRole("heading",{name:"Avec Standex",exact:true})).toBeTruthy();
    expect((view.getByRole("button",{name:"Lancer",exact:true}) as HTMLButtonElement).disabled).toBe(true);
  } else {
    expect(expectedFamily).toBeDefined(); expect(view.getByRole("heading",{name:expectedFamily,exact:true})).toBeTruthy();
    expect((view.getByRole("button",{name:"Lancer",exact:true}) as HTMLButtonElement).disabled).toBe(false);
  }
  const issue=issueById[scenario.id]; if(issue) expect(view.getByText(messages[issue])).toBeTruthy();
  if(scenario.id==="L003") expect(view.getByRole("button",{name:"Niveau bas",exact:true}).getAttribute("aria-pressed")).toBe("true");
  if(scenario.id==="L047") {
    expect((view.getByRole("textbox",{name:"Point 1 (cm)"}) as HTMLInputElement).value).toBe("200");
    expect((view.getByRole("textbox",{name:"Point 1 (%)"}) as HTMLInputElement).value).toBe("20");
    expect(view.getAllByText(/Un point souhaité dépasse/).length).toBeGreaterThan(0);
  }
  for(const [index,cm] of (scenario.expect.points??[]).entries()) expect((view.getByRole("textbox",{name:`Point ${index+1} (cm)`}) as HTMLInputElement).value).toBe(cm);
  if(scenario.id==="L071") {
    expect((view.getByRole("textbox",{name:"Point 1 (cm)"}) as HTMLInputElement).value).toBe("10");
    expect((view.getByRole("textbox",{name:"Point 4 (cm)"}) as HTMLInputElement).value).toBe("90");
    expect((view.getByRole("textbox",{name:"Point 2 (cm)"}) as HTMLInputElement).value).toBe("36,6667");
  }
  if(scenario.id==="L063") expect((view.getByLabelText("Points de détection souhaités") as HTMLSelectElement).value).toBe("12");
  if(scenario.expect.materialReserve) expect(view.container.textContent).toContain("Matériau à définir");
  if(scenario.id==="L027") expect(view.container.textContent).toContain("Matériau à envisager : PA");
  if(scenario.id==="L035" || scenario.id==="L038") expect(view.container.textContent).toContain("Tenue en pression");
  if(scenario.id==="L036" || scenario.id==="L038") expect(view.container.textContent).toContain("Immersion permanente");
  if(scenario.id==="L037" || scenario.id==="L038") expect(view.container.textContent).toContain("Câble immergé");
  await click("3. Résultat"); if(issue) expect(view.getByText(messages[issue])).toBeTruthy();
  expect(view.getByRole("button",{name:"Continuer avec Standex →",exact:true})).toBeTruthy();
});
