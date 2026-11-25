import { GlobalRegistrator } from "@happy-dom/global-registrator";
if (typeof document === "undefined") GlobalRegistrator.register({ url: "https://example.invalid/" });
import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { setLocale } from "../src/lib/i18n/core";
import LevelJourney from "../src/components/level/level-journey";

afterEach(() => { cleanup(); setLocale("fr"); });

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
  expect(view.getByText(/seul un orifice de 25 mm/)).toBeTruthy();
  expect(view.queryByText(/Vous comparerez les montages/)).toBeNull();
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Continuer", exact: true })));
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Ouvrir le configurateur" })));
  await act(async () => fireEvent.change(view.getByLabelText("Points de détection souhaités"), { target: { value: "4" } }));
  expect(view.getByRole("heading", { name: "LS04", exact: true })).toBeTruthy();
  const length = view.getByRole("slider", { name: "Longueur souhaitée sous fixation" }) as HTMLInputElement;
  expect(Number(length.value)).toBe(99);
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
  await changeInput(view.getByRole("spinbutton", { name: /Hauteur utile de la cuve/ }), "180");
  await click("Continuer"); await select("Niveau à détecter", "low");
  await changeInput(view.getByRole("spinbutton", { name: /Hauteur du niveau à détecter/ }), "30");
  await click("Ouvrir le configurateur");
  expect(view.getByRole("heading", { name: "LS04", exact: true })).toBeTruthy();
  expect((view.getByLabelText("Fixation dans la cuve") as HTMLSelectElement).value).toBe("top");
  expect(Number((view.getByRole("slider", { name: "Point 1" }) as HTMLInputElement).value)).toBe(30);
  expect(Number((view.getByRole("slider", { name: "Course du flotteur entre les butées" }) as HTMLInputElement).value)).toBe(10.5);
  await changeInput(view.getByRole("slider", { name: "Course du flotteur entre les butées" }), "20");
  await click("1. Mon besoin"); await click("2. Configuration");
  expect(Number((view.getByRole("slider", { name: "Course du flotteur entre les butées" }) as HTMLInputElement).value)).toBe(20);
  await click("1. Mon besoin"); await click("Continuer"); await click("Continuer");
  await select("Accès pour installer le capteur", "free"); await click("Continuer"); await click("Ouvrir le configurateur");
  expect(view.getByRole("heading", { name: "LS01", exact: true })).toBeTruthy();
  const monitor = within(view.getByRole("complementary", { name: "Moniteur de niveau" }));
  expect(monitor.getByText("Forme A")).toBeTruthy();
  await click("Niveau haut"); expect(monitor.getByText("Forme B")).toBeTruthy();
  await changeInput(view.getByRole("slider", { name: "Hauteur du liquide", exact: true }), "172");
  expect(monitor.getByText("Signal inactif")).toBeTruthy();
  await changeInput(view.getByRole("slider", { name: "Hauteur du liquide", exact: true }), "173");
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
  expect([...monitor.querySelectorAll("li .t-body")].map(el => el.textContent)).toEqual(["Niveau 4", "Niveau 3", "Niveau 2", "Niveau 1", "Niveau 0"]);
  for (const height of [600, 2000, 60]) {
    await changeInput(view.getByRole("slider", { name: "Hauteur utile de la cuve" }), String(height));
    expect(view.queryByText("Lecture en attente")).toBeNull();
    const points = [1,2,3,4].map(n => Number((view.getByRole("slider", { name: `Point ${n}`, exact: true }) as HTMLInputElement).value));
    expect(points.every((p, i) => p <= height && (i === 0 || p > points[i - 1]!))).toBe(true);
  }
  await changeInput(view.getByRole("slider", { name: "Hauteur du liquide", exact: true }), "60");
  expect(monitor.querySelector('[aria-current="step"]')?.textContent).toContain("Niveau 4");
  await changeInput(view.getByRole("slider", { name: "Hauteur du liquide", exact: true }), "0");
  expect(monitor.querySelector('[aria-current="step"]')?.textContent).toContain("Niveau 0");
  await click("Horizontale");
  expect(within(monitor).getByText("Lecture en attente")).toBeTruthy();
  expect((view.getByLabelText("Points de détection souhaités") as HTMLSelectElement).value).toBe("4");
  await click("Utiliser un seul point");
  expect(view.getByRole("heading", { name: "LS03", exact: true })).toBeTruthy();
  expect(monitor.querySelector('[data-contact="open"]')).toBeTruthy();
  await click("En continu");
  await click("Passer en vertical");
  expect(Number((view.getByRole("slider", { name: "Longueur souhaitée sous fixation" }) as HTMLInputElement).value)).toBe(60);
  await changeInput(view.getByRole("slider", { name: "Hauteur du liquide", exact: true }), "43");
  const meter = within(monitor).getByRole("meter");
  expect(meter.getAttribute("aria-valuenow")).toBe("40");
  expect(within(monitor).getByText("67 %")).toBeTruthy();
  await click("Prévoir une forme spécifique");
  expect(within(monitor).queryByText("Lecture en attente")).toBeNull();
  expect(within(monitor).getByText("Sur mesure")).toBeTruthy();
  await changeInput(view.getByLabelText("Votre forme et vos contraintes"), "Corps coudé pour accès latéral.");
  await click("Préparer la demande");
  expect(view.getByRole("heading", { name: "Résultat", exact: true })).toBeTruthy();
  expect(view.getByText("Corps coudé pour accès latéral.")).toBeTruthy();
});
