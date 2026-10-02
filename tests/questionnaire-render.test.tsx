/** Rendu isolé du questionnaire : seules la session et les lectures serveur sont
 * neutralisées. Le composant, ses boutons, son état et l'i18n restent réels. */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register({ url: "https://exemple.invalid/" });

import { afterEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
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
      expect(view.getByRole("button", { name: "Question précédente" })).toBeDisabled();

      const continueButton = () => view.getByRole("button", { name: "Continuer" });
      for (let question = 1; question < 5; question += 1) fireEvent.click(continueButton());

      expect(view.getByText("Question 5 sur 6")).toBeTruthy();
      expect(view.getByText("Encore 2 questions avant de découvrir les capteurs proposés.")).toBeTruthy();

      fireEvent.click(view.getByRole("button", { name: "Question précédente" }));
      expect(view.getByText("Question 4 sur 6")).toBeTruthy();
      fireEvent.click(continueButton());
      fireEvent.click(view.getByRole("button", { name: "Je ne sais pas encore" }));

      expect(view.getByText("Question 6 sur 6")).toBeTruthy();
      expect(view.getByRole("button", { name: "Voir les capteurs proposés" })).toBeTruthy();

      const locale = view.getByLabelText("Langue du site");
      fireEvent.change(locale, { target: { value: "en" } });
      expect(view.getByText("Question 6 of 6")).toBeTruthy();
      expect(view.getByText("Last question before discovering the suggested sensors.")).toBeTruthy();

      fireEvent.change(locale, { target: { value: "ja" } });
      expect(view.getByText("質問 6 / 6")).toBeTruthy();
      expect(view.getByText("提案センサーの確認まで、最後の1問です。")).toBeTruthy();

      await act(async () => Promise.resolve());
    });
  }
});