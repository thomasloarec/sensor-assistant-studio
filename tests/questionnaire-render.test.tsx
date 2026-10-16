/** Rendu isolé du questionnaire : seules la session et les lectures serveur sont
 * neutralisées. Le composant, ses boutons, son état et l'i18n restent réels. */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
if (typeof document === "undefined" || typeof window === "undefined") {
  try {
    GlobalRegistrator.register({ url: "https://exemple.invalid/" });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("already been globally registered"))
      throw error;
  }
}

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
  type RenderResult,
} from "@testing-library/react";
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
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  },
}));

// Un fichier de test précédent sans DOM peut avoir chargé Radix quand
// `document` n'existait pas : son useLayoutEffect resterait alors une fonction
// vide et les onglets ne monteraient jamais leur contenu. On rétablit le vrai
// crochet React, sans rien changer au code applicatif.
mock.module("@radix-ui/react-use-layout-effect", () => ({
  useLayoutEffect: React.useLayoutEffect,
}));

const { DesignSpace } = await import("../src/components/leadmagnet/design-space");
const { ConnectorChoices } = await import("../src/components/leadmagnet/connector-choices");
const { DOCUMENTED_HOUSINGS, terminationFromHousing } = await import("../src/lib/leadmagnet/connector-library");
const { LANGUAGES } = await import("../src/lib/i18n/core");
const { setWebGLSupportForTests } = await import("../src/hooks/use-webgl-slot");
const { setLocale } = await import("../src/lib/i18n/core");
const { createDossier, proposeRequirement, confirmRequirement } =
  await import("../src/lib/leadmagnet/dossier");
const { isPcbSensor } = await import("../src/lib/leadmagnet/product-presentation");
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

/** Retient un capteur par le chemin réel du parcours (carte de couple), puis
 * ouvre l'étape « Résultat », où vit désormais la configuration câble/connecteur. */
async function chooseFirstPairAndOpenResult(view: RenderResult, pcb = false) {
  const goal = view.container.querySelector("#guide-detection_goal");
  if (!(goal instanceof HTMLTextAreaElement)) throw new Error("Question 1 absente");
  await act(async () => changeValue(goal, "Détecter le niveau de liquide dans une cuve"));
  await act(async () => fireEvent.click(view.getByRole("button", { name: /2\. Couples proposés/ })));
  const more = await waitFor(() => view.getByRole("button", { name: /Voir tous les couples possibles/ }), { timeout: 15000 });
  await act(async () => fireEvent.click(more));
  const card = await waitFor(
    () => {
      const found = view
        .getAllByTestId("pair-card")
        .find((c) => isPcbSensor(c.getAttribute("data-sensor-id")) === pcb);
      if (!found) throw new Error("Aucune carte de couple adaptée");
      return found;
    },
    { timeout: 15000 },
  );
  await act(async () => fireEvent.click(within(card).getByRole("button", { name: "Tester ce couple →" })));
  await act(async () => fireEvent.click(view.getByRole("button", { name: /3\. Résultat/ })));
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
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error("Le champ rendu ne fournit pas de setter de valeur natif");
  const reactPropsKey = Object.keys(element).find((key) => key.startsWith("__reactProps$"));
  const reactProps = reactPropsKey
    ? (
        element as unknown as Record<
          string,
          { onChange?: (event: { target: HTMLElement }) => void }
        >
      )[reactPropsKey]
    : undefined;
  if (!reactProps?.onChange)
    throw new Error("Le champ rendu ne fournit pas son gestionnaire React");
  await act(async () => {
    setter.call(element, value);
    reactProps.onChange?.({ target: element });
    await Promise.resolve();
  });
  await waitFor(() =>
    expect((element as HTMLInputElement | HTMLTextAreaElement).value).toBe(value),
  );
}

async function flushState() {
  await act(async () => Promise.resolve());
}

beforeEach(() => {
  // Other suites unregister the shared Happy DOM globals; isolated selector
  // renders need the same restoration as renderQuestionnaire.
  if (typeof document === "undefined" || typeof window === "undefined") {
    GlobalRegistrator.unregister();
    GlobalRegistrator.register({ url: "https://exemple.invalid/" });
  }
  setLocale("fr");
});

afterEach(() => {
  cleanup();
  setLocale("fr");
  setWebGLSupportForTests(null);
});

describe("Connecteurs compacts — état réel du questionnaire", () => {
  for (const { id } of LANGUAGES) test(`quatre aperçus distincts avant sélection — ${id}`, () => {
    setLocale(id);
    setWebGLSupportForTests(false);
    const onSelect = mock(() => undefined);
    const view = render(<ConnectorChoices termination={{ kind: "bare_leads" }} onSelect={onSelect} />);
    const details = view.getByTestId("connector-technical-details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    const previews = view.container.querySelectorAll("[data-housing]");
    expect(previews).toHaveLength(4);
    expect(view.container.querySelector(".grid")?.className).toContain("grid-cols-2");
    for (const housing of DOCUMENTED_HOUSINGS) {
      const preview = view.container.querySelector(`[data-housing="${housing.housingMpn}"]`);
      expect(preview).toBeTruthy();
      expect(preview?.closest("details, button")).toBeNull();
      expect(preview?.getAttribute("data-live")).toBe("2d");
      expect(preview?.querySelectorAll("svg rect")).toHaveLength(housing.positions);
      const button = view.getByRole("button", { name: `${housing.manufacturer} ${housing.housingMpn}` });
      expect(button.tagName).toBe("BUTTON");
      expect(button.getAttribute("type")).toBe("button");
      expect(button.getAttribute("aria-pressed")).toBe("false");
      expect(button.parentElement).toBe(preview?.parentElement);
      button.focus();
      expect(document.activeElement).toBe(button);
      if (preview) {
        fireEvent.pointerDown(preview);
        fireEvent.pointerMove(preview);
        fireEvent.pointerUp(preview);
        fireEvent.click(preview);
      }
    }
    expect(new Set(Array.from(previews).map(p => p.querySelector("svg path")?.getAttribute("d"))).size).toBeGreaterThan(1);
    expect(onSelect).not.toHaveBeenCalled();
    expect(details.querySelector("[data-housing], canvas")).toBeNull();
  });

  test("sélection explicite unique, conservation au remontage et détails sans contexte supplémentaire", async () => {
    const initial = DOCUMENTED_HOUSINGS[0];
    const next = DOCUMENTED_HOUSINGS[3];
    if (!initial || !next) throw new Error("Documented connector fixtures missing");
    setWebGLSupportForTests(false);
    const onSelect = mock(() => undefined);
    const view = render(<ConnectorChoices termination={terminationFromHousing(initial)} onSelect={onSelect} />);
    expect(view.container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(1);
    await act(async () => fireEvent.click(view.getByRole("button", { name: `${next.manufacturer} ${next.housingMpn}` })));
    expect(onSelect).toHaveBeenCalledWith(next);
    view.rerender(<ConnectorChoices termination={terminationFromHousing(next)} onSelect={onSelect} />);
    expect(view.container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(1);
    expect(view.getByRole("button", { name: `${next.manufacturer} ${next.housingMpn}` }).getAttribute("aria-pressed")).toBe("true");
    const details = view.getByTestId("connector-technical-details") as HTMLDetailsElement;
    await act(async () => { details.open = true; fireEvent(details, new Event("toggle")); });
    expect(within(details).getAllByRole("link", { name: "Source fabricant" })).toHaveLength(4);
    expect(details.querySelector("[data-housing], canvas")).toBeNull();
    view.unmount();
    const reopened = render(<ConnectorChoices termination={terminationFromHousing(next)} onSelect={onSelect} />);
    expect(reopened.getByRole("button", { name: `${next.manufacturer} ${next.housingMpn}` }).getAttribute("aria-pressed")).toBe("true");
    expect(reopened.container.querySelectorAll("[data-housing]")).toHaveLength(4);
  });

  test("préférence, sélection, sources repliées et conservation après fermeture", async () => {
    const view = renderQuestionnaire(390);
    await chooseFirstPairAndOpenResult(view);
    const choices = within(view.getByTestId("connector-choice"));
    expect(choices.getByRole("button", { name: "Je ne sais pas" }).getAttribute("aria-pressed")).toBe("true");
    expect(view.queryByTestId("connector-choices")).toBeNull();
    await act(async () => fireEvent.click(choices.getByRole("button", { name: "J'ai une préférence" })));
    const picker = within(view.getByTestId("connector-choices"));
    expect(picker.getAllByRole("button")).toHaveLength(4);
    for (const tile of picker.getAllByRole("button")) {
      expect(tile.getAttribute("aria-pressed")).toBe("false");
      expect(tile.querySelector("a, details, canvas")).toBeNull();
    }
    const details = view.getByTestId("connector-technical-details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    // Happy DOM does not model native <details> visibility; verify containment
    // and the real closed attribute instead of weakening the disclosure check.
    const closedLinks = picker.getAllByRole("link", { name: "Source fabricant" });
    expect(closedLinks).toHaveLength(4);
    for (const link of closedLinks) expect(link.closest("details")).toBe(details);
    expect(view.getByTestId("connector-selection").textContent).toBe("Compatibilité à confirmer par Standex");
    await act(async () => fireEvent.click(picker.getByRole("button", { name: "JST PHR-2" })));
    expect(view.getByTestId("connector-selection").textContent).toContain("JST PHR-2 — Compatibilité à confirmer par Standex");
    expect(picker.getByRole("button", { name: "JST PHR-2" }).getAttribute("aria-pressed")).toBe("true");
    await act(async () => { details.open = true; fireEvent(details, new Event("toggle")); });
    const links = within(details).getAllByRole("link", { name: "Source fabricant" });
    expect(links).toHaveLength(4);
    expect(links.map(l => l.getAttribute("href"))).toContain("https://www.jst-mfg.com/product/pdf/eng/ePH.pdf#page=3");
    expect(details.textContent).toContain("Aucune combinaison connecteur/capteur qualifiée");
    expect(details.textContent).toContain("disponibilité restent inconnus");
    expect(details.textContent).toContain("Câble, genre des contacts, sertissage");
    expect(details.textContent).toContain("SPH-002T-P0.5S");
    expect(details.querySelector('[data-housing]')).toBeNull();
    expect(view.container.querySelectorAll('[data-housing]')).toHaveLength(4);
    await act(async () => { details.open = false; fireEvent(details, new Event("toggle")); });
    expect(picker.getByRole("button", { name: "JST PHR-2" }).getAttribute("aria-pressed")).toBe("true");
    await act(async () => fireEvent.click(choices.getByRole("button", { name: "Je ne sais pas" })));
    expect(view.queryByTestId("connector-choices")).toBeNull();
    await act(async () => fireEvent.click(choices.getByRole("button", { name: "J'ai une préférence" })));
    expect(view.getByRole("button", { name: "JST PHR-2" }).getAttribute("aria-pressed")).toBe("true");
    const manual = view.getByText("Saisir une référence précise").closest("details");
    expect(manual?.open).toBe(false);
    expect(manual?.querySelector<HTMLInputElement>('#connector-free-reference')?.value).toBe("");
  }, 30_000);
});

describe("rendu du questionnaire guidé", () => {
  for (const width of [390, 320] as const) {
    test(`Q1, Q5, Q6, retour, inconnue et FR→EN→JA à ${width}px`, async () => {
      setLocale("fr");
      const view = renderQuestionnaire(width);

      expect(view.getByText("Question 1 sur 6")).toBeTruthy();
      expect(
        view.queryByText("À la fin : les capteurs proposés pour votre application."),
      ).toBeNull();
      expect(view.queryByRole("button", { name: "Question précédente" })).toBeNull();

      for (let question = 1; question < 5; question += 1) fireEvent.click(continueButton(view));

      expect(view.getByText("Question 5 sur 6")).toBeTruthy();
      expect(
        view.getByText("Encore 2 questions avant de découvrir les capteurs proposés."),
      ).toBeTruthy();

      fireEvent.click(view.getByRole("button", { name: "Question précédente" }));
      expect(view.getByText("Question 4 sur 6")).toBeTruthy();
      fireEvent.click(continueButton(view));
      fireEvent.click(view.getByRole("button", { name: "Je ne sais pas encore" }));

      expect(view.getByText("Question 6 sur 6")).toBeTruthy();
      expect(view.getByRole("button", { name: "Voir les capteurs proposés" })).toBeTruthy();

      const locale = view.getByLabelText("Langue du site");
      act(() => fireEvent.change(locale, { target: { value: "en" } }));
      expect(view.getByText("Question 6 of 6")).toBeTruthy();
      expect(
        view.getByText("Last question before discovering the suggested sensors."),
      ).toBeTruthy();

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
      const first = view.getByText(/^« /).textContent;
      fireEvent.click(view.getByRole("button", { name: "Exemple suivant" }));
      expect(view.getByText(/^« /).textContent).not.toBe(first);
      fireEvent.click(view.getByRole("button", { name: "Exemple précédent" }));
      expect(view.getByText(/^« /).textContent).toBe(first);
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

  test("les solutions de fixation et dimensions sont visibles sans déplier", async () => {
    const view = renderQuestionnaire(390);
    await goToQuestion(view, 4);
    expect(view.queryByText("Précisions facultatives")).toBeNull();
    expect(view.getByText("Facultatif : comment fixer le capteur ?")).toBeTruthy();
    expect(view.queryByText(/Une fixation que vous NOMMEZ/)).toBeNull();
    expect(view.queryByText(/Rien n'est déduit de votre texte/)).toBeNull();
    expect(view.queryByText(/Une dimension laissée vide/)).toBeNull();
    expect(view.getByRole("button", { name: /Corps fileté — se visse dans un trou taraudé/ })).toBeTruthy();
    const unknown = view.getByRole("button", { name: "Montage : Je ne sais pas encore" });
    expect(unknown?.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(view.getByRole("button", { name: /Corps fileté — se visse dans un trou taraudé/ }));
    expect(unknown?.getAttribute("aria-pressed")).toBe("false");
    if (unknown) fireEvent.click(unknown);
    expect(unknown?.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(view.getByRole("button", { name: /Autre montage/ }));
    await changeValue(view.getByLabelText("Décrivez le montage"), "Collage sur support");
    fireEvent.click(view.getByRole("button", { name: "Question précédente" }));
    fireEvent.click(continueButton(view));
    expect((view.getByLabelText("Décrivez le montage") as HTMLTextAreaElement).value).toBe(
      "Collage sur support",
    );
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
    expect((view.getByLabelText("Votre réponse") as HTMLTextAreaElement).value).toBe(
      "Détecter le capot",
    );

    await goToQuestion(view, 4);
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
    await changeValue(view.getByLabelText("Votre réponse"), "Intérieur, 20 °C, lave-vaisselle.");
    fireEvent.click(view.getByRole("button", { name: "Voir les capteurs proposés" }));
    await waitFor(() => {
      expect(
        view.getByRole("button", { name: "2. Couples proposés" }).getAttribute("aria-current"),
      ).toBe("step");
    });
  });

  test("P0 vide : aucun capteur proposé, bouton final désactivé et expliqué, autre accès gardé", async () => {
    const view = renderQuestionnaire(390);
    await goToQuestion(view, 6);
    const reveal = view.getByRole("button", { name: "Voir les capteurs proposés" });
    expect((reveal as HTMLButtonElement).disabled).toBe(true);
    expect(reveal.getAttribute("aria-describedby")).toBe("intake-empty-note");
    expect(view.getByText("Répondez à au moins une question pour voir des capteurs proposés.")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "2. Couples proposés" }));
    await waitFor(() => {
      expect(
        view.getByRole("button", { name: "2. Couples proposés" }).getAttribute("aria-current"),
      ).toBe("step");
    });
    await flushState();
    // Le volet « Couples » peut se monter après un chargement différé : on
    // attend son contenu réel (cartes ou encart), jamais un délai fixe.
    await waitFor(
      () =>
        expect(
          /D'après vos réponses|à revoir avant de proposer|Décrivez votre besoin|étude d'ingénierie|Exploration du catalogue/.test(
            view.container.ownerDocument.body.textContent ?? "",
          ),
        ).toBe(true),
      { timeout: 15_000 },
    );
    expect(within(view.container.ownerDocument.body).queryAllByTestId("pair-card")).toHaveLength(0);
    expect(within(view.container.ownerDocument.body).getAllByText("Décrivez votre besoin pour voir des capteurs proposés").length).toBeGreaterThan(0);
  }, 30_000);

  async function reveal(view: RenderResult, goal: string, electrical?: string) {
    await changeValue(view.getByLabelText("Votre réponse"), goal);
    if (electrical) {
      await goToQuestion(view, 5);
      await changeValue(view.getByLabelText("Votre réponse"), electrical);
    }
    await goToQuestion(view, 6);
    fireEvent.click(view.getByRole("button", { name: "Voir les capteurs proposés" }));
    await waitFor(() => {
      expect(
        view.getByRole("button", { name: "2. Couples proposés" }).getAttribute("aria-current"),
      ).toBe("step");
    });
    await flushState();
    // Le volet « Couples » peut se monter après un chargement différé : on
    // attend son contenu réel (cartes ou encart), jamais un délai fixe.
    await waitFor(
      () =>
        expect(
          /D'après vos réponses|à revoir avant de proposer|Décrivez votre besoin|étude d'ingénierie|Exploration du catalogue/.test(
            view.container.ownerDocument.body.textContent ?? "",
          ),
        ).toBe(true),
      { timeout: 15_000 },
    );
  }

  test("P0 C01 : courant moteur direct dans le reed sans contacteur → aucune carte", async () => {
    const view = renderQuestionnaire(390);
    await reveal(
      view,
      "I want all motor current to pass directly through the reed contact, without a relay or contactor.",
      "230 VAC, 8 A motor.",
    );
    expect(within(view.container.ownerDocument.body).queryAllByTestId("pair-card")).toHaveLength(0);
    expect(within(view.container.ownerDocument.body).getAllByText("Le capteur ne peut pas couper lui-même l'alimentation du moteur").length).toBeGreaterThan(0);
  }, 30_000);

  test("P0 B02 : mesure continue de température → aucune carte", async () => {
    const view = renderQuestionnaire(390);
    await reveal(view, "Continuous temperature measurement from 20 to 250 °C.", "Analog 4-20 mA output.");
    expect(within(view.container.ownerDocument.body).queryAllByTestId("pair-card")).toHaveLength(0);
    expect(within(view.container.ownerDocument.body).getAllByText("Un capteur reed ne mesure pas une température en continu").length).toBeGreaterThan(0);
  }, 30_000);

  async function revealWithEnvironment(view: RenderResult, goal: string, environment: string) {
    await changeValue(view.getByLabelText("Votre réponse"), goal);
    await goToQuestion(view, 6);
    await changeValue(view.getByLabelText("Votre réponse"), environment);
    fireEvent.click(view.getByRole("button", { name: "Voir les capteurs proposés" }));
    await waitFor(() => {
      expect(
        view.getByRole("button", { name: "2. Couples proposés" }).getAttribute("aria-current"),
      ).toBe("step");
    });
    await waitFor(
      () =>
        expect(
          /D'après vos réponses|à revoir avant de proposer|étude d'ingénierie|Exploration du catalogue/.test(view.container.ownerDocument.body.textContent ?? ""),
        ).toBe(true),
      { timeout: 15_000 },
    );
  }

  test("A05 : place disponible écrite → proposée, appliquée seulement après clic", async () => {
    const view = renderQuestionnaire(390);
    await changeValue(view.getByLabelText("Votre réponse"), "Detect when the door is closed.");
    await goToQuestion(view, 4);
    await changeValue(view.getByLabelText("Votre réponse"), "Maximum available space: 8 × 5 × 4 mm");
    const hint = await waitFor(() => view.getByTestId("envelope-hint"));
    expect(hint.getAttribute("data-kind")).toBe("found");
    expect((view.getByLabelText("Longueur") as HTMLInputElement).value).toBe("");
    await act(async () => {
      fireEvent.click(view.getByTestId("envelope-apply"));
      await Promise.resolve();
    });
    await waitFor(() => expect((view.getByLabelText("Longueur") as HTMLInputElement).value).toBe("8"));
    expect((view.getByLabelText("Largeur") as HTMLInputElement).value).toBe("5");
    expect((view.getByLabelText("Hauteur") as HTMLInputElement).value).toBe("4");
    expect(view.queryByTestId("envelope-hint")).toBeNull();
  }, 30_000);

  test("P1 A06 : -40…+85 °C au capteur → cartes conservées avec avertissement thermique visible", async () => {
    const view = renderQuestionnaire(390);
    await revealWithEnvironment(view, "Detect when the door is closed.", "Sensor operating from -40 to +85 °C.");
    const body = within(view.container.ownerDocument.body);
    expect(body.queryAllByTestId("pair-card").length).toBeGreaterThan(0);
    const warnings = body.queryAllByTestId("thermal-warning");
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]!.textContent).toContain("-40 … 85 °C");
  }, 30_000);

  test("P1 C02 : 220 °C au capteur → aucune carte, revue d'ingénierie affichée", async () => {
    const view = renderQuestionnaire(390);
    await revealWithEnvironment(view, "Detect when the door is closed.", "Sensor operating at 220 °C.");
    const body = within(view.container.ownerDocument.body);
    expect(body.queryAllByTestId("pair-card")).toHaveLength(0);
    expect(body.getAllByText("Aucune correspondance standard documentée à cette température").length).toBeGreaterThan(0);
  }, 30_000);

  test("P1 C03 : petit aimant et ±1 mm sous le seuil → cartes + points de validation explicites", async () => {
    const view = renderQuestionnaire(390);
    await revealWithEnvironment(view, "Detect a 5 mm diameter x 2 mm magnet at 10 mm, ±1 mm.", "Indoor, 25 °C ambient.");
    const body = within(view.container.ownerDocument.body);
    expect(body.queryAllByTestId("pair-card").length).toBeGreaterThan(0);
    const points = body.getByTestId("validation-points");
    expect(points.textContent).toContain("Aimant de très petite taille");
    expect(points.textContent).toContain("Précision de position");
  }, 30_000);

  test("contrôle positif : contacteur externe dimensionné → cartes proposées", async () => {
    const view = renderQuestionnaire(390);
    await reveal(
      view,
      "Detect when the lid is closed; the reed signal goes to a 24 V PLC input.",
      "The 230 VAC 8 A motor is switched by an external properly rated contactor driven by the PLC.",
    );
    expect(within(view.container.ownerDocument.body).queryAllByTestId("pair-card").length).toBeGreaterThan(0);
  }, 30_000);

  test("les libellés de composition changent immédiatement de français à anglais puis japonais", () => {
    const view = renderQuestionnaire(390);
    const locale = view.getByLabelText("Langue du site");
    fireEvent.change(locale, { target: { value: "en" } });
    expect(view.getByText("Your answer")).toBeTruthy();
    expect(view.getByRole("button", { name: "Next example" })).toBeTruthy();
    fireEvent.change(locale, { target: { value: "ja" } });
    expect(view.getByText("回答")).toBeTruthy();
    expect(view.getByRole("button", { name: "次の例" })).toBeTruthy();
  });
});

describe("Configuration câble/connecteur déplacée à l'étape « Résultat »", () => {
  const stepButton = (view: RenderResult, re: RegExp) => view.getByRole("button", { name: re });

  test("configuration interactive en Résultat seulement ; récapitulatif en lecture seule en Avec Standex", async () => {
    const view = renderQuestionnaire(390);
    await chooseFirstPairAndOpenResult(view);
    const config = view.getByTestId("configure-sensor");
    const sensorId = config.textContent?.match(/capteur (\S+)\./)?.[1] ?? "";
    expect(sensorId).not.toBe("");
    expect(within(config).getByTestId("connector-choice")).toBeTruthy();
    expect(view.container.querySelector("#section-cablage")).not.toBeNull();
    // Longueur standard : les options viennent de standardLengthsMm pour CE capteur.
    const { standardLengthsMm } = await import("../src/lib/leadmagnet/cable-options");
    await act(async () => fireEvent.click(within(config).getByRole("button", { name: "Standard" })));
    const select = view.container.querySelector("#standard-length") as HTMLSelectElement;
    const options = [...select.options].map((o) => o.value).filter(Boolean).map(Number);
    expect(options).toEqual([...standardLengthsMm(sensorId)]);
    const first = options[0]!;
    await act(async () => fireEvent.change(select, { target: { value: String(first) } }));
    await act(async () => fireEvent.click(within(config).getByRole("button", { name: "Pas besoin de connecteur" })));
    await act(async () => fireEvent.click(within(config).getByRole("button", { name: "Continuer avec Standex →" })));
    expect(stepButton(view, /4\. Avec Standex/).getAttribute("aria-current")).toBe("step");
    // Aucun champ éditable de câble/connecteur dans l'étape 4.
    expect(view.queryByTestId("connector-choice")).toBeNull();
    expect(view.container.querySelector("#standard-length, #custom-length, #section-cablage")).toBeNull();
    const summary = view.getByTestId("review-configuration");
    expect(summary.querySelector("input, select, textarea")).toBeNull();
    expect(view.getByTestId("review-config-sensor").textContent).toContain(`Gamme ${sensorId}, pas encore une référence commandable.`);
    expect(view.getByTestId("review-config-cable").textContent).toBe(`Standard — ${first} mm, à confirmer par Standex.`);
    expect(view.getByTestId("review-config-connector").textContent).toBe("Fils nus, sans connecteur");
    // « Modifier la configuration » ramène à l'étape 3, choix conservés.
    await act(async () => fireEvent.click(within(summary).getByRole("button", { name: "Modifier la configuration" })));
    expect(stepButton(view, /3\. Résultat/).getAttribute("aria-current")).toBe("step");
    expect((view.container.querySelector("#standard-length") as HTMLSelectElement).value).toBe(String(first));
  }, 30000);

  test("trois branches connecteur, longueur sur mesure et délégation reflétées en lecture seule", async () => {
    const view = renderQuestionnaire(390);
    await chooseFirstPairAndOpenResult(view);
    const choices = () => within(view.getByTestId("connector-choice"));
    const config = () => within(view.getByTestId("configure-sensor"));
    const readConnector = async () => {
      await act(async () => fireEvent.click(stepButton(view, /4\. Avec Standex/)));
      const text = view.getByTestId("review-config-connector").textContent;
      await act(async () => fireEvent.click(stepButton(view, /3\. Résultat/)));
      return text;
    };
    // Défaut : aucune décision, jamais présenté comme « fils nus ».
    expect(await readConnector()).toBe("Aucune préférence de connecteur exprimée.");
    await act(async () => fireEvent.click(choices().getByRole("button", { name: "Je ne sais pas" })));
    expect(await readConnector()).toBe("Choix du connecteur confié à Standex.");
    await act(async () => fireEvent.click(choices().getByRole("button", { name: "J'ai une préférence" })));
    await act(async () => fireEvent.click(view.getByRole("button", { name: "JST PHR-2" })));
    expect(await readConnector()).toMatch(/^JST .*PHR-2.* — à vérifier par les ingénieurs Standex\.$/);
    await act(async () => fireEvent.click(choices().getByRole("button", { name: "Pas besoin de connecteur" })));
    expect(await readConnector()).toBe("Fils nus, sans connecteur");

    await act(async () => fireEvent.click(config().getByRole("button", { name: "Sur mesure" })));
    const custom = view.container.querySelector("#custom-length") as HTMLInputElement;
    await act(async () => changeValue(custom, "42.5"));
    await act(async () => fireEvent.click(stepButton(view, /4\. Avec Standex/)));
    expect(view.getByTestId("review-config-cable").textContent).toBe("Sur mesure — 425 mm, à confirmer par Standex.");
    await act(async () => fireEvent.click(stepButton(view, /3\. Résultat/)));
    await act(async () => fireEvent.click(config().getByRole("button", { name: "Je ne sais pas" })));
    await act(async () => fireEvent.click(stepButton(view, /4\. Avec Standex/)));
    expect(view.getByTestId("review-config-cable").textContent).toBe("Longueur à définir avec Standex.");
  }, 30000);

  test("capteur pour circuit imprimé : câble et connecteur non applicables", async () => {
    const view = renderQuestionnaire(390);
    await chooseFirstPairAndOpenResult(view, true);
    expect(view.getByTestId("configure-pcb")).toBeTruthy();
    expect(view.queryByTestId("connector-choice")).toBeNull();
    await act(async () => fireEvent.click(stepButton(view, /4\. Avec Standex/)));
    expect(view.getByTestId("review-config-pcb").textContent).toBe("Non applicable : capteur pour circuit imprimé.");
    expect(view.queryByTestId("review-config-cable")).toBeNull();
  }, 30000);

  test("sans capteur : invitation à choisir, jamais un capteur prétendu choisi", async () => {
    const view = renderQuestionnaire(390);
    await act(async () => fireEvent.click(stepButton(view, /3\. Résultat/)));
    expect(view.getByTestId("configure-no-sensor")).toBeTruthy();
    expect(view.queryByTestId("connector-choice")).toBeNull();
    expect(view.getByTestId("configure-sensor").textContent).not.toContain("Vous avez choisi");
    await act(async () => fireEvent.click(stepButton(view, /4\. Avec Standex/)));
    expect(view.getByTestId("review-config-sensor").textContent).toBe("Aucun capteur choisi, et aucun choix confié à Standex.");
  }, 30000);
});
