/** Rendu isolé du questionnaire : seules la session et les lectures serveur sont
 * neutralisées. Le composant, ses boutons, son état et l'i18n restent réels. */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
if (typeof document === "undefined" || typeof window === "undefined") {
  GlobalRegistrator.register({ url: "https://exemple.invalid/" });
}

import { afterEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";
import { act, cleanup, fireEvent, render, type RenderResult } from "@testing-library/react";
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";

mock.module("@/lib/leadmagnet/backend", () => ({
  checkLeadBackend: () =>
    Promise.resolve({
      configured: true,
      schemaReady: true,
      authenticated: true,
      role: null,
      ready: true,
      version: "test",
      message: "",
      adminDetail: "",
      capabilities: { authenticated: true, userId: "test-user", role: null, assignedDossiers: [] },
    }),
  staffActionEnabled: () => false,
  LEAD_MIGRATION_FILE: "",
  UNAVAILABLE_MESSAGE: "",
  READY_MESSAGE: "",
}));

mock.module("@/lib/standex/supabase", () => ({
  isSupabaseConfigured: true,
  requireSupabase: () => ({}),
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  },
}));

const { DesignSpace } = await import("../src/components/leadmagnet/design-space");
const { setLocale } = await import("../src/lib/i18n/core");

const router = createRouter({
  routeTree: createRootRoute({ component: () => null }),
  history: createMemoryHistory({ initialEntries: ["/"] }),
});

function renderQuestionnaire(width: 390 | 320) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.dispatchEvent(new Event("resize"));
  return render(
    <RouterContextProvider router={router}>
      <DesignSpace visible />
    </RouterContextProvider>,
  );
}

function continueButton(view: RenderResult) {
  return view.getByRole("button", { name: "Continuer" });
}

async function answer(view: RenderResult, value: string) {
  await act(async () => {
    const field = view.getByLabelText("Votre réponse") as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(field, value);
    fireEvent.input(field, { target: { value } });
  });
}

async function typeInto(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    const prototype = field instanceof window.HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value);
    fireEvent.input(field, { target: { value } });
  });
}

function goToQuestion(view: RenderResult, target: number) {
  while (view.queryByText(`Question ${target} sur 6`) === null) {
    fireEvent.click(continueButton(view));
  }
}

async function flushState() {
  await act(async () => Promise.resolve());
}

afterEach(() => {
  cleanup();
  setLocale("fr");
});

describe("rendu du questionnaire guidé", () => {
  for (const width of [390, 320] as const) {
    test(`Q1, Q5, Q6, retour, inconnue et FR→EN→JA à ${width}px`, async () => {
      setLocale("fr");
      const view = renderQuestionnaire(width);

      expect(view.getByText("Question 1 sur 6")).toBeTruthy();
      expect(view.getByText("À la fin : les capteurs proposés pour votre application.")).toBeTruthy();
      expect((view.getByRole("button", { name: "Question précédente" }) as HTMLButtonElement).disabled).toBe(true);

       for (let question = 1; question < 5; question += 1) fireEvent.click(continueButton(view));

      expect(view.getByText("Question 5 sur 6")).toBeTruthy();
      expect(view.getByText("Encore 2 questions avant de découvrir les capteurs proposés.")).toBeTruthy();

      fireEvent.click(view.getByRole("button", { name: "Question précédente" }));
      expect(view.getByText("Question 4 sur 6")).toBeTruthy();
       fireEvent.click(continueButton(view));
      fireEvent.click(view.getByRole("button", { name: "Je ne sais pas encore" }));

      expect(view.getByText("Question 6 sur 6")).toBeTruthy();
      expect(view.getByRole("button", { name: "Voir les capteurs proposés" })).toBeTruthy();

      const locale = view.getByLabelText("Langue du site");
      act(() => fireEvent.change(locale, { target: { value: "en" } }));
      expect(view.getByText("Question 6 of 6")).toBeTruthy();
      expect(view.getByText("Last question before discovering the suggested sensors.")).toBeTruthy();

      act(() => fireEvent.change(locale, { target: { value: "ja" } }));
      expect(view.getByText("質問 6 / 6")).toBeTruthy();
      expect(view.getByText("提案センサーの確認まで、最後の1問です。")).toBeTruthy();

      await act(async () => Promise.resolve());
    });
  }

  test("les six questions gardent leurs réponses, leurs exemples et la progression réelle", async () => {
    const view = renderQuestionnaire(390);
    const values = [
      "Détecter le capot",
      "Capot en aluminium",
      "Translation de 20 mm",
      "Fixation intérieure",
      "Signal 24 VDC",
      "Projections d'eau",
    ];

    for (const [index, value] of values.entries()) {
      expect(view.getByText(`Question ${index + 1} sur 6`)).toBeTruthy();
      expect(view.getByText("Votre réponse")).toBeTruthy();
      expect(view.getByRole("button", { name: "Afficher l'exemple 1" }).getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(view.getByRole("button", { name: "Afficher l'exemple 2" }));
      expect(view.getByRole("button", { name: "Afficher l'exemple 2" }).getAttribute("aria-pressed")).toBe("true");
      await answer(view, value);
      if (index < values.length - 1) {
        fireEvent.click(continueButton(view));
        await flushState();
      }
    }

    for (let index = values.length - 2; index >= 0; index -= 1) {
      fireEvent.click(view.getByRole("button", { name: "Question précédente" }));
      await flushState();
      expect((view.getByLabelText("Votre réponse") as HTMLTextAreaElement).value).toBe(values[index]);
    }
  });

  test("continuer vide et déléguer restent deux comportements distincts", async () => {
    const view = renderQuestionnaire(390);
    fireEvent.click(continueButton(view));
    expect(view.getByText("Question 2 sur 6")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Question précédente" }));
    expect(view.queryByText(/Cette question est notée/)).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Je ne sais pas encore" }));
    await flushState();
    fireEvent.click(view.getByRole("button", { name: "Question précédente" }));
    expect(view.getByText(/Cette question est notée/)).toBeTruthy();
    expect((view.getByLabelText("Votre réponse") as HTMLTextAreaElement).value).toBe("");
  });

  test("le montage, les dimensions et la précision libre survivent aux allers-retours", async () => {
    const view = renderQuestionnaire(390);
    goToQuestion(view, 4);
    const optional = view.getByText("Précisions facultatives");
    fireEvent.click(optional);
    fireEvent.click(view.getByRole("button", { name: /Fixation vissée/ }));
    await typeInto(view.getByLabelText("Longueur") as HTMLInputElement, "15,5");
    await typeInto(view.getByLabelText("Largeur") as HTMLInputElement, "8");
    fireEvent.click(view.getByText("Ajouter une précision"));
    await typeInto(view.getByLabelText("Autre chose à nous dire") as HTMLTextAreaElement, "Câble vers l'arrière");
    fireEvent.click(continueButton(view));
    await flushState();
    fireEvent.click(view.getByRole("button", { name: "Question précédente" }));
    await flushState();
    expect(view.getByRole("button", { name: /Fixation vissée/ }).getAttribute("aria-pressed")).toBe("true");
    expect((view.getByLabelText("Longueur") as HTMLInputElement).value).toBe("15.5");
    expect((view.getByLabelText("Largeur") as HTMLInputElement).value).toBe("8");
    expect((view.getByLabelText("Autre chose à nous dire") as HTMLTextAreaElement).value).toBe("Câble vers l'arrière");
  });

  test("le dernier passage révèle les capteurs sans ajouter de validation", async () => {
    const view = renderQuestionnaire(320);
    goToQuestion(view, 6);
    fireEvent.click(view.getByRole("button", { name: "Voir les capteurs proposés" }));
    await flushState();
    expect(view.queryByText("Question 6 sur 6")).toBeNull();
    expect(view.getByRole("button", { name: "2. Couples proposés" }).getAttribute("aria-current")).toBe("step");
  });

  test("les libellés de composition changent immédiatement de français à anglais puis japonais", () => {
    const view = renderQuestionnaire(390);
    const locale = view.getByLabelText("Langue du site");
    fireEvent.change(locale, { target: { value: "en" } });
    expect(view.getByText("Your answer")).toBeTruthy();
    expect(view.getByRole("button", { name: "Show example 1" })).toBeTruthy();
    fireEvent.change(locale, { target: { value: "ja" } });
    expect(view.getByText("回答")).toBeTruthy();
    expect(view.getByRole("button", { name: "例 1 を表示" })).toBeTruthy();
  });
});