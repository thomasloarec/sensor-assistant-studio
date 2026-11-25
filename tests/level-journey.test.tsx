import { GlobalRegistrator } from "@happy-dom/global-registrator";
if (typeof document === "undefined") GlobalRegistrator.register({ url: "https://example.invalid/" });
import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
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
  expect(view.getByText(/Cuve ouverte à pression atmosphérique/)).toBeTruthy();
  expect(view.queryByText(/Vous comparerez les montages/)).toBeNull();
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
