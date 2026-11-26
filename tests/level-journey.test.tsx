import { GlobalRegistrator } from "@happy-dom/global-registrator";
if (typeof document === "undefined") GlobalRegistrator.register({ url: "https://example.invalid/" });
import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { setLocale } from "../src/lib/i18n/core";
import LevelJourney, { RangeField } from "../src/components/level/level-journey";

afterEach(() => { cleanup(); setLocale("fr"); });

test("multiple level intake prepares five points in cm and percent and preserves the original endpoint objectives",async()=>{
  setLocale("fr");
  const view=render(<LevelJourney active={false}/>);
  const click=async(name:string)=>{await act(async()=>fireEvent.click(view.getByRole("button",{name,exact:true})));};
  const select=async(name:string,value:string)=>{await act(async()=>fireEvent.change(view.getByLabelText(name),{target:{value}}));};
  await click("Configurer un capteur de niveau"); await click("Continuer"); await click("Continuer");
  await select("Accès pour installer le capteur","top");
  await changeInput(view.getByRole("textbox",{name:/Hauteur utile de la cuve/}),"100");
  await click("Continuer"); await select("Niveau à détecter","multiple");
  await select("Combien de niveaux faut-il détecter ?","5");
  for(const i of [4,2,0,3,1]) {
    await changeInput(view.getByRole("textbox",{name:`Point ${i+1} (%)`}),String(i*25));
    expect((view.getByRole("textbox",{name:`Point ${i+1} (cm)`}) as HTMLInputElement).value).toBe(String(i*25));
  }
  await click("Ouvrir le configurateur");
  expect((view.getByLabelText("Points de détection souhaités") as HTMLSelectElement).value).toBe("5");
  expect(view.getByRole("heading",{name:"LS05",exact:true})).toBeTruthy();
  expect(view.getByText(/La première proposition ajuste/)).toBeTruthy();
  expect((view.getByRole("slider",{name:"Hauteur du liquide",exact:true}) as HTMLInputElement).max).toBe("100");
  expect(within(view.getByRole("complementary",{name:"Moniteur de niveau"})).getByText("50 %")).toBeTruthy();
  const cm=view.getByRole("textbox",{name:"Point 3 (cm)"}), percent=view.getByRole("textbox",{name:"Point 3 (%)"});
  await changeInput(percent,"55"); await act(async()=>fireEvent.blur(percent));
  expect((cm as HTMLInputElement).value).toBe("55");
  await click("Revoir cette configuration");
  expect(view.getByText("0 cm · 0 % ; 25 cm · 25 % ; 50 cm · 50 % ; 75 cm · 75 % ; 100 cm · 100 %")).toBeTruthy();
  expect(view.getByText(/55 cm · 55 %/)).toBeTruthy();
  await click("2. Configuration");
  expect((view.getByRole("textbox",{name:"Point 3 (cm)"}) as HTMLInputElement).value).toBe("55");
  await click("1. Mon besoin"); await click("Continuer"); await click("Continuer"); await click("Continuer");
  expect((view.getByRole("textbox",{name:"Point 3 (%)"}) as HTMLInputElement).value).toBe("50");
});

test("single target percentages require a tank height and accept a decimal comma",async()=>{
  setLocale("fr");
  const view=render(<LevelJourney active={false}/>);
  const click=async(name:string)=>{await act(async()=>fireEvent.click(view.getByRole("button",{name,exact:true})));};
  await click("Configurer un capteur de niveau"); await click("Continuer"); await click("Continuer"); await click("Continuer");
  await act(async()=>fireEvent.change(view.getByLabelText("Niveau à détecter"),{target:{value:"high"}}));
  expect((view.getByRole("textbox",{name:"Hauteur du niveau à détecter (%)"}) as HTMLInputElement).disabled).toBe(true);
  await click("Précédent");
  await changeInput(view.getByRole("textbox",{name:/Hauteur utile de la cuve/}),"200");
  await click("Continuer");
  await changeInput(view.getByRole("textbox",{name:"Hauteur du niveau à détecter (%)"}),"95,25");
  expect((view.getByRole("textbox",{name:"Hauteur du niveau à détecter (cm)"}) as HTMLInputElement).value).toBe("190,5");
  await click("Ouvrir le configurateur");
  expect((view.getByRole("textbox",{name:"Point 1 (%)"}) as HTMLInputElement).value).toBe("95,25");
  expect(view.container.querySelector(".lv-visual-title button")?.textContent).toBe("Lancer");
  expect(view.container.querySelectorAll(".lv-playback button")).toHaveLength(2);
});

test("focusing a rounded percentage never changes the exact height; invalid text restores the current value",async()=>{
  let committed=23;
  const view=render(<RangeField label="Point" value={23} heightMm={312} min={10} max={300} onChange={v=>{committed=v;}}/>);
  const percent=view.getByRole("textbox",{name:"Point (%)"});
  await act(async()=>{fireEvent.focus(percent);fireEvent.blur(percent);});
  expect(committed).toBe(23);
  await changeInput(percent,"abc"); await act(async()=>fireEvent.blur(percent));
  expect(committed).toBe(23);
  expect((percent as HTMLInputElement).value).toBe("7,37");
});

// Same input adapter as questionnaire-render: Happy DOM may share a React DOM
// loaded before the DOM existed. Exercise the rendered handler and real state.
async function changeInput(element: HTMLElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")!.set!;
  const key = Object.keys(element).find(key => key.startsWith("__reactProps$"))!;
  const props = (element as unknown as Record<string, { onChange: (event: { target: HTMLElement }) => void }>)[key]!;
  await act(async () => { setter.call(element, value); props.onChange({ target: element }); });
}

test("level questions start with free application text; examples never fill it and fluid edits return to question two", async () => {
  setLocale("fr");
  // active=false keeps only the GPU scene asleep; the real journey and its state remain mounted.
  const view = render(<LevelJourney active={false} />);
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Configurer un capteur de niveau" })));
  expect(view.getByRole("heading", { name: "Dans quel équipement, et pour quoi faire ?" })).toBeTruthy();
  expect(view.queryByRole("button", { name: "Commander une pompe" })).toBeNull();
  const answer = view.getByRole("textbox", { name: "Votre application" }) as HTMLTextAreaElement;
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Exemple suivant" })));
  expect(view.getByText(/Dans un climatiseur/)).toBeTruthy();
  expect(answer.value).toBe("");
  await changeInput(answer, "Cuve sous la machine ; alarme avant débordement.");
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Continuer", exact: true })));
  expect(view.getByRole("heading", { name: "Quel liquide, à quelles températures ?" })).toBeTruthy();
  await changeInput(view.getByLabelText("Température minimale (°C)"), "10");
  await changeInput(view.getByLabelText("Température maximale (°C)"), "25");
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Continuer", exact: true })));
  expect(view.getByText(/seul un orifice de 2,5 cm/)).toBeTruthy();
  expect(view.queryByText(/Vous comparerez les montages/)).toBeNull();
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Continuer", exact: true })));
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Ouvrir le configurateur" })));
  await act(async () => fireEvent.change(view.getByLabelText("Points de détection souhaités"), { target: { value: "4" } }));
  expect(view.getByRole("heading", { name: "LS04", exact: true })).toBeTruthy();
  const length = view.getByRole("slider", { name: "Longueur souhaitée sous fixation" }) as HTMLInputElement;
  expect(Number(length.value)).toBe(9.9);
  await act(async () => fireEvent.click(view.getByRole("button", { name: /Modifier le liquide et les températures/ })));
  expect(view.getByRole("heading", { name: "Quel liquide, à quelles températures ?" })).toBeTruthy();
  expect((view.getByLabelText("Température maximale (°C)") as HTMLInputElement).value).toBe("25");
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Revenir au configurateur" })));
  expect((view.getByLabelText("Points de détection souhaités") as HTMLSelectElement).value).toBe("4");
  await act(async () => fireEvent.click(view.getByRole("button", { name: "1. Mon besoin" })));
  expect((view.getByRole("textbox", { name: "Votre application" }) as HTMLTextAreaElement).value).toContain("Cuve sous la machine");
});

test("intake seeds a top-mounted low level with a local float range; subsequent edits retain manual settings", async () => {
  setLocale("fr");
  const view = render(<LevelJourney active={false} />);
  const click = async (name: string) => { await act(async () => fireEvent.click(view.getByRole("button", { name, exact: true }))); };
  const select = async (name: string, value: string) => { await act(async () => fireEvent.change(view.getByLabelText(name), { target: { value } })); };
  await click("Configurer un capteur de niveau"); await click("Continuer"); await click("Continuer");
  await select("Accès pour installer le capteur", "top");
  await changeInput(view.getByRole("textbox", { name: /Hauteur utile de la cuve \(cm\)/ }), "18");
  await click("Continuer"); await select("Niveau à détecter", "low");
  await changeInput(view.getByRole("textbox", { name: "Hauteur du niveau à détecter (cm)" }), "3");
  await click("Ouvrir le configurateur");
  expect(view.getByRole("heading", { name: "LS04", exact: true })).toBeTruthy();
  expect((view.getByLabelText("Fixation dans la cuve") as HTMLSelectElement).value).toBe("top");
  expect(Number((view.getByRole("slider", { name: "Point 1" }) as HTMLInputElement).value)).toBe(3);
  expect(Number((view.getByRole("slider", { name: "Course du flotteur entre les butées" }) as HTMLInputElement).value)).toBe(1.05);
  await changeInput(view.getByRole("slider", { name: "Course du flotteur entre les butées" }), "2");
  await click("1. Mon besoin"); await click("2. Configuration");
  expect(Number((view.getByRole("slider", { name: "Course du flotteur entre les butées" }) as HTMLInputElement).value)).toBe(2);
  await click("1. Mon besoin"); await click("Continuer"); await click("Continuer");
  await select("Accès pour installer le capteur", "free"); await click("Continuer"); await click("Ouvrir le configurateur");
  expect(view.getByRole("heading", { name: "LS01", exact: true })).toBeTruthy();
  const monitor = within(view.getByRole("complementary", { name: "Moniteur de niveau" }));
  expect(monitor.getByText("Forme A")).toBeTruthy();
  await click("Niveau haut"); expect(monitor.getByText("Forme B")).toBeTruthy();
  await changeInput(view.getByRole("slider", { name: "Hauteur du liquide", exact: true }), "17.2");
  expect(monitor.getByText("Signal inactif")).toBeTruthy();
  await changeInput(view.getByRole("slider", { name: "Hauteur du liquide", exact: true }), "17.3");
  expect(monitor.getByText("Signal actif")).toBeTruthy();
});

test("operator monitor follows resizes and explicit repairs across point, horizontal and continuous modes", async () => {
  setLocale("fr");
  const view = render(<LevelJourney active={false} />);
  const click = async (name: string) => { await act(async () => fireEvent.click(view.getByRole("button", { name, exact: true }))); };
  await click("Configurer un capteur de niveau");
  await click("Continuer"); await click("Continuer"); await click("Continuer"); await click("Ouvrir le configurateur");
  await act(async () => fireEvent.change(view.getByLabelText("Points de détection souhaités"), { target: { value: "4" } }));
  const monitor = view.getByRole("complementary", { name: "Moniteur de niveau" });
  expect(monitor.querySelectorAll("input, select, textarea, button")).toHaveLength(0);
  expect([...monitor.querySelectorAll("li .t-body")].map(el => el.textContent)).toEqual(["P4 · Niveau haut", "P3 · Niveau intermédiaire", "P2 · Niveau intermédiaire", "P1 · Niveau bas"]);
  for (const height of [60, 200, 6]) {
    await changeInput(view.getByRole("slider", { name: "Hauteur utile de la cuve" }), String(height));
    expect(view.queryByText("Lecture en attente")).toBeNull();
    const points = [1,2,3,4].map(n => Number((view.getByRole("slider", { name: `Point ${n}`, exact: true }) as HTMLInputElement).value));
    expect(points.every((p, i) => p <= height && (i === 0 || p > points[i - 1]!))).toBe(true);
  }
  await changeInput(view.getByRole("slider", { name: "Hauteur du liquide", exact: true }), "6");
  expect(monitor.querySelector('[data-point="4"]')?.getAttribute("data-active")).toBe("true");
  expect(monitor.querySelector('[data-point="1"]')?.getAttribute("data-active")).toBe("false");
  await changeInput(view.getByRole("slider", { name: "Hauteur du liquide", exact: true }), "0");
  expect(monitor.querySelector('[data-point="1"]')?.getAttribute("data-active")).toBe("true");
  expect(monitor.querySelector('[data-point="4"]')?.getAttribute("data-active")).toBe("false");
  await click("Horizontale");
  expect(within(monitor).getByText("Lecture en attente")).toBeTruthy();
  expect((view.getByLabelText("Points de détection souhaités") as HTMLSelectElement).value).toBe("4");
  await act(async () => fireEvent.change(view.getByLabelText("Points de détection souhaités"), { target: { value: "1" } }));
  expect(view.queryByRole("button", {name:"Recentrer le point"}) === null).toBe(true);
  expect(view.getByRole("heading", { name: "LS03", exact: true })).toBeTruthy();
  expect(monitor.querySelector('[data-contact="open"]')).toBeTruthy();
  await click("En continu");
  await click("Passer en vertical");
  expect(Number((view.getByRole("slider", { name: "Longueur souhaitée sous fixation" }) as HTMLInputElement).value)).toBe(6);
  await changeInput(view.getByRole("slider", { name: "Hauteur du liquide", exact: true }), "4.3");
  const meter = within(monitor).getByRole("meter");
  expect(meter.getAttribute("aria-valuenow")).toBe("4");
  expect(within(monitor).getByText("67 %")).toBeTruthy();
  await click("Prévoir une forme spécifique");
  expect(within(monitor).queryByText("Lecture en attente")).toBeNull();
  expect(within(monitor).getByText("Sur mesure")).toBeTruthy();
  await changeInput(view.getByLabelText("Votre forme et vos contraintes"), "Corps coudé pour accès latéral.");
  await click("Préparer la demande");
  expect(view.getByRole("heading", { name: "Résultat", exact: true })).toBeTruthy();
  expect(view.getByText("Corps coudé pour accès latéral.")).toBeTruthy();
});


test("dimension entry accepts exact decimals, clamps bounds and rejects empty or invalid text", async () => {
  let committed = 220;
  const view = render(<RangeField label="Dimension" value={220} min={60} max={540} step={10} onChange={v => { committed = v; }} />);
  const field = view.getByRole("textbox", {name:"Dimension (cm)"});
  for (const [text, expected] of [["22,15",221.5],["900",540],["1.2",60],["",220],["abc",220]] as const) {
    await changeInput(field,text); await act(async()=>fireEvent.blur(field)); expect(committed).toBe(expected);
  }
  await changeInput(field,"333"); await act(async()=> {
    const key=Object.keys(field).find(k=>k.startsWith("__reactProps$"))!;
    (field as unknown as Record<string,{onKeyDown:(event:{key:string})=>void}>)[key]!.onKeyDown({key:"Escape"});
  });
  expect((field as HTMLInputElement).value).toBe("22");
});

test("decimal centimetres survive intake, configuration, cable review and Standex; manual impossible points stay explicit", async()=>{
  setLocale('fr');
  const view=render(<LevelJourney active={false}/>);
  const click=async(name:string)=>{await act(async()=>fireEvent.click(view.getByRole('button',{name,exact:true})));};
  await click('Configurer un capteur de niveau'); await click('Continuer'); await click('Continuer');
  await changeInput(view.getByRole('textbox',{name:/Hauteur utile de la cuve/}),'200');
  await click('Continuer');
  await act(async()=>fireEvent.change(view.getByLabelText('Niveau à détecter'),{target:{value:'high'}}));
  await changeInput(view.getByRole('textbox',{name:'Hauteur du niveau à détecter (cm)'}),'190,5');
  await click('Ouvrir le configurateur');
  expect((view.getByRole('textbox',{name:'Point 1 (cm)'}) as HTMLInputElement).value).toBe('190,5');
  const level=view.getByRole('slider',{name:'Hauteur du liquide',exact:true}) as HTMLInputElement;
  expect(Number(level.max)).toBe(191.2);
  await changeInput(level,'200');
  expect(Number(level.value)).toBe(191.2);
  expect(view.getByText('Signal actif')).toBeTruthy();
  await click('Revoir cette configuration');
  await changeInput(view.getByRole('textbox',{name:'Longueur de câble souhaitée (cm)'}),'20,5');
  expect(view.getByText('20,5 cm')).toBeTruthy();
  expect(view.getByText(/1 point\(s\) · 190,5 cm/)).toBeTruthy();
  await click('4. Avec Standex');
  expect(view.getByText('20,5 cm')).toBeTruthy();
  expect(view.getByText(/1 point\(s\) · 190,5 cm/)).toBeTruthy();
  await click('2. Configuration'); await click('Horizontale'); await click('Niveau bas');
  const point=view.getByRole('slider',{name:'Point 1',exact:true}) as HTMLInputElement;
  expect(Number(point.min)).toBe(4.5);
  await changeInput(point,point.min);
  expect(view.queryByText('Lecture en attente')===null).toBe(true);
  const input=view.getByRole('textbox',{name:'Point 1 (cm)',exact:true});
  await changeInput(input,'0'); await act(async()=>fireEvent.blur(input));
  expect((input as HTMLInputElement).value).toBe('0');
  expect(view.getByText('Lecture en attente')).toBeTruthy();
  expect(input.getAttribute('aria-invalid')).toBe('true');
  await changeInput(input,'4,5'); await act(async()=>fireEvent.blur(input));
  expect(view.queryByText('Lecture en attente')===null).toBe(true);
});
