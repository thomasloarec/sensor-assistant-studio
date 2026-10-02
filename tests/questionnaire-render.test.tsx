/** Rendu isolé du questionnaire : seules la session et les lectures serveur sont
 * neutralisées. Le composant, ses boutons, son état et l'i18n restent réels. */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
if (typeof document === "undefined" || typeof window === "undefined") {
  try {
    GlobalRegistrator.register({ url: "https://exemple.invalid/" });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("already been globally registered")) throw error;
  }
}

import { afterEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";
import { act, cleanup, fireEvent, render, waitFor, type RenderResult } from "@testing-library/react";
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
const { createDossier, proposeRequirement, confirmRequirement } = await import("../src/lib/leadmagnet/dossier");
const { buildDossierExport } = await import("../src/lib/leadmagnet/dossier-io");

const router = createRouter({
  routeTree: createRootRoute({ component: () => null }),
  history: createMemoryHistory({ initialEntries: ["/"] }),
  origin: "https://exemple.invalid",
});

function renderQuestionnaire(width: 390 | 320) {
  if (typeof document === "undefined" || typeof window === "undefined") {
    GlobalRegistrator.unregister();
    GlobalRegistrator.register({ url: "https://exemple.invalid/" });
  }
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

async function goToQuestion(view: RenderResult, target: number) {
  for (let click = 0; click < 6; click += 1) {
    if (view.queryByText(`Question ${target} sur 6`) !== null) return;
    await act(async () => {
      fireEvent.click(continueButton(view));
      await Promise.resolve();
    });
  }
  throw new Error(`Question ${target} inaccessible après six clics au maximum`);
}

async function changeValue(element: HTMLElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error("Le champ rendu ne fournit pas de setter de valeur natif");
  const reactPropsKey = Object.keys(element).find((key) => key.startsWith("__reactProps$"));
  const reactProps = reactPropsKey
    ? (element as unknown as Record<string, { onChange?: (event: { target: HTMLElement }) => void }>)[reactPropsKey]
    : undefined;
  if (!reactProps?.onChange) throw new Error("Le champ rendu ne fournit pas son gestionnaire React");
  await act(async () => {
    setter.call(element, value);
    reactProps.onChange?.({ target: element });
    await Promise.resolve();
  });
  await waitFor(() => expect((element as HTMLInputElement | HTMLTextAreaElement).value).toBe(value));
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

  test("les six questions gardent leurs exemples et la progression réelle", async () => {
    const view = renderQuestionnaire(390);
    for (let index = 0; index < 6; index += 1) {
      expect(view.getByText(`Question ${index + 1} sur 6`)).toBeTruthy();
      expect(view.getByText("Votre réponse")).toBeTruthy();
      expect(view.getByRole("button", { name: "Afficher l'exemple 1" }).getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(view.getByRole("button", { name: "Afficher l'exemple 2" }));
      expect(view.getByRole("button", { name: "Afficher l'exemple 2" }).getAttribute("aria-pressed")).toBe("true");
      if (index < 5) {
        fireEvent.click(continueButton(view));
        await flushState();
      }
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

  test("le montage et ses dimensions restent dans le dépliant facultatif", async () => {
    const view = renderQuestionnaire(390);
    await goToQuestion(view, 4);
    const optional = view.getByText("Précisions facultatives");
    fireEvent.click(optional);
    expect(view.getByRole("button", { name: /Fixation vissée/ })).toBeTruthy();
    expect(view.getByLabelText("Longueur")).toBeTruthy();
    expect(view.getByLabelText("Largeur")).toBeTruthy();
    expect(view.getByLabelText("Hauteur")).toBeTruthy();
    expect(view.getByText("Ajouter une précision")).toBeTruthy();
  });

  test("la saisie réelle, le retour et la sortie conservent les données de référence", async () => {
    const view = renderQuestionnaire(390);

    const answer = view.getByLabelText("Votre réponse");
    await changeValue(answer, "Détecter le capot");
    fireEvent.click(continueButton(view));
    await flushState();
    fireEvent.click(view.getByRole("button", { name: "Question précédente" }));
    await flushState();
    expect((view.getByLabelText("Votre réponse") as HTMLTextAreaElement).value).toBe("Détecter le capot");

    await goToQuestion(view, 4);
    fireEvent.click(view.getByText("Précisions facultatives"));
    fireEvent.click(view.getByRole("button", { name: /Emboîtement dans un trou/ }));
    await flushState();
    await changeValue(view.getByLabelText("Diamètre du trou (mm)"), "5.5");
    await changeValue(view.getByLabelText("Longueur"), "15.5");
    await changeValue(view.getByLabelText("Largeur"), "8");

    fireEvent.click(view.getByText("Ajouter une précision"));
    await changeValue(view.getByLabelText("Autre chose à nous dire"), "Câble vers l'arrière");

    fireEvent.click(continueButton(view));
    await flushState();
    fireEvent.click(view.getByRole("button", { name: "Je ne sais pas encore" }));
    await flushState();
    expect(view.getByText("Question 6 sur 6")).toBeTruthy();

    const blobs: Blob[] = [];
    const previousCreateObjectURL = URL.createObjectURL;
    const previousRevokeObjectURL = URL.revokeObjectURL;
    const previousAnchorClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = (blob) => {
      blobs.push(blob);
      return "blob:questionnaire-export";
    };
    URL.revokeObjectURL = () => undefined;
    HTMLAnchorElement.prototype.click = () => undefined;
    try {
      fireEvent.click(view.getByText("Menu"));
      fireEvent.click(view.getByRole("button", { name: "Exporter mon projet" }));
    } finally {
      URL.createObjectURL = previousCreateObjectURL;
      URL.revokeObjectURL = previousRevokeObjectURL;
      HTMLAnchorElement.prototype.click = previousAnchorClick;
    }

    expect(blobs).toHaveLength(1);
    const exported = JSON.parse(await blobs[0].text()) as ReturnType<typeof buildDossierExport>;

    // Référence fonctionnelle antérieure à la refonte de présentation : mêmes
    // opérations de domaine, comparées à la sortie réellement téléchargée.
    let baseline = createDossier(exported.dossier.createdAt, "fr");
    baseline = proposeRequirement(baseline, "detection_goal", {
      value: "Détecter le capot",
      source: "user",
    });
    baseline = {
      ...baseline,
      mounting: { kind: "press_fit", holeDiameterMm: 5.5 },
      envelope: { lengthMm: 15.5, widthMm: 8, heightMm: null },
      freeConstraints: "Câble vers l'arrière",
      delegatedDecisions: ["question:electrical"],
    };
    const expected = buildDossierExport(baseline);

    expect(exported.dossier.requirements).toEqual(expected.dossier.requirements);
    expect(exported.dossier.mounting).toEqual(expected.dossier.mounting);
    expect(exported.dossier.envelope).toEqual(expected.dossier.envelope);
    expect(exported.dossier.freeConstraints).toBe(expected.dossier.freeConstraints);
    expect(exported.dossier.delegatedDecisions).toEqual(expected.dossier.delegatedDecisions);
  });

  test("le dernier passage révèle les capteurs sans ajouter de validation", async () => {
    const view = renderQuestionnaire(320);
    await goToQuestion(view, 6);
    fireEvent.click(view.getByRole("button", { name: "Voir les capteurs proposés" }));
    await waitFor(() => {
      expect(view.getByRole("button", { name: "2. Couples proposés" }).getAttribute("aria-current")).toBe("step");
    });
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