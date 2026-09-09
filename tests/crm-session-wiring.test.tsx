/**
 * Câblage réel des écrans internes au compte connecté.
 *
 * Ce contrôle monte VRAIMENT les composants, avec le VRAI fournisseur de
 * contexte interne et des réponses retardées : il échoue si un écran garde à
 * l'affichage les données du compte précédent, si une lecture partie avant le
 * changement de compte repeuple l'écran ensuite, ou si une simple
 * reconfirmation de session du MÊME compte détruit un brouillon en cours.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register({ url: "https://exemple.invalid/standex" });

import { afterEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";

// --- Session Supabase pilotée par le test ----------------------------------
type AuthHandler = (event: string, session: unknown) => void;
const authHandlers = new Set<AuthHandler>();
mock.module("@/lib/standex/supabase", () => ({
  isSupabaseConfigured: true,
  requireSupabase: () => ({}),
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: "u1" } } } }),
      onAuthStateChange: (cb: AuthHandler) => {
        authHandlers.add(cb);
        return {
          data: { subscription: { unsubscribe: () => authHandlers.delete(cb) } },
        };
      },
    },
  },
}));

// --- Réponses serveur pilotées par le test ---------------------------------
let projectDeferred: { resolve: (v: unknown) => void } | null = null;
let adminDeferred: { resolve: (v: unknown) => void } | null = null;
let mutationDeferred: { resolve: (v: unknown) => void } | null = null;
const projectFor = (company: string) => ({
  project: {
    id: "d1",
    dossierId: "d1",
    stage: "lead",
    company,
    companyEffective: company,
    projectName: "Projet",
    countryCode: "FR",
    version: 1,
  },
  tasks: [],
  notes: [],
  owners: [],
  notifications: [],
});

const realAdapter = await import("../src/lib/leadmagnet/dashboard-adapter");
mock.module("@/lib/leadmagnet/dashboard-adapter", () => ({
  ...realAdapter,
  probeCrm: () =>
    Promise.resolve({ available: true, role: "admin", userId: "u1", detail: null }),
  fetchCrmProject: () =>
    new Promise((resolve) => {
      projectDeferred = { resolve };
    }),
  fetchCrmBoard: () => Promise.resolve({ projects: [], directory: [] }),
  fetchCrmAdminOverview: () =>
    new Promise((resolve) => {
      adminDeferred = { resolve };
    }),
  upsertCrmPerson: () =>
    new Promise((resolve) => {
      mutationDeferred = { resolve };
    }),
  linkCrmPerson: () =>
    new Promise((resolve) => {
      mutationDeferred = { resolve };
    }),
}));

const realSupabaseAdapter = await import("../src/lib/leadmagnet/supabase-adapter");
mock.module("@/lib/leadmagnet/supabase-adapter", () => ({
  ...realSupabaseAdapter,
  fetchStaffInbox: () => Promise.resolve({ role: "admin", dossiers: [] }),
}));

// La langue de lecture est globale au processus de test : on la fixe pour que
// les libellés recherchés ici soient ceux du français.
const { setLocale } = await import("../src/lib/i18n/core");
setLocale("fr");

const { CrmProvider, useCrm } = await import(
  "../src/components/standex/dashboard/crm-context"
);
const { ProjectDetail } = await import("../src/routes/standex.projects.$dossierId");
const { AdminScreen } = await import("../src/routes/standex.admin");

afterEach(() => {
  cleanup();
  projectDeferred = null;
  adminDeferred = null;
  mutationDeferred = null;
});

/** Routeur minimal : les liens de navigation de l'écran ont besoin d'un contexte,
 *  mais aucun test ici ne navigue. */
const router = createRouter({
  routeTree: createRootRoute({ component: () => null }),
  history: createMemoryHistory({ initialEntries: ["/standex/projects/d1"] }),
});

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <CrmProvider>
      <RouterContextProvider router={router}>{children}</RouterContextProvider>
    </CrmProvider>
  );
}

/** Saisie dans un champ contrôlé : dans cet environnement de test, les
 *  événements de saisie simulés n'atteignent pas React, on appelle donc
 *  directement le gestionnaire réellement monté sur le champ. */
function typeInto(el: HTMLInputElement, value: string) {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  const props = (el as unknown as Record<string, { onChange?: (e: unknown) => void }>)[key!];
  el.value = value;
  props.onChange?.({ target: el, currentTarget: el });
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Émission d'un événement d'authentification, comme le fait Supabase. */
async function emitAuth(event: string, session: unknown) {
  await act(async () => {
    for (const cb of [...authHandlers]) cb(event, session);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("la fiche projet appartient au compte connecté", () => {
  test("une réponse partie avant le changement de compte ne repeuple pas l'écran", async () => {
    render(
      <Screen>
        <ProjectDetail dossierId="d1" />
      </Screen>,
    );
    await settle();

    // Réponse du PREMIER compte : elle arrive normalement.
    const first = projectDeferred!;
    await act(async () => {
      first.resolve(projectFor("Société A"));
    });
    expect(document.body.textContent).toContain("Société A");

    // Connexion d'un AUTRE compte, même écran monté.
    const late = projectDeferred!;
    await emitAuth("SIGNED_IN", { user: { id: "u2" } });
    await settle();
    expect(document.body.textContent).not.toContain("Société A");

    // La lecture partie pour l'ancien compte revient en retard : elle est ignorée.
    await act(async () => {
      late.resolve(projectFor("Société A"));
    });
    expect(document.body.textContent).not.toContain("Société A");

    // La lecture du NOUVEAU compte, elle, s'affiche.
    await act(async () => {
      projectDeferred!.resolve(projectFor("Société B"));
    });
    expect(document.body.textContent).toContain("Société B");
  });
});

/** Onglet « Comptes et droits » des réglages. */
function openAccountsTab() {
  const tab = document.querySelectorAll('[role="tab"]')[1] as HTMLButtonElement;
  act(() => {
    tab.click();
  });
}



const adminOverview = {
  staff: [
    {
      userId: "u1",
      role: "admin",
      active: true,
      displayName: "Ancien Compte",
      email: null,
    },
  ],
  directory: [],
  accounts: [],
  audit: [],
};

describe("l'administration appartient au compte connecté", () => {
  test("l'annuaire de l'ancien compte disparaît et ne revient pas", async () => {
    render(
      <Screen>
        <AdminScreen />
      </Screen>,
    );
    await settle();

    const first = adminDeferred!;
    await act(async () => {
      first.resolve(adminOverview);
    });
    openAccountsTab();
    expect(document.body.textContent).toContain("Ancien");

    const late = adminDeferred!;
    await emitAuth("SIGNED_IN", { user: { id: "u2" } });
    await settle();
    expect(document.body.textContent).not.toContain("Ancien");

    await act(async () => {
      late?.resolve(adminOverview);
    });
    expect(document.body.textContent).not.toContain("Ancien");
  });

  test("une écriture en vol puis un changement de compte libère l'écran et vide les saisies", async () => {
    const view = render(
      <Screen>
        <AdminScreen />
      </Screen>,
    );
    await settle();
    await act(async () => {
      adminDeferred!.resolve(adminOverview);
    });

    const byId = <T extends HTMLElement>(id: string) =>
      view.container.querySelector(`#${id}`) as T | null;

    // Saisie en cours dans le formulaire d'ajout.
    await act(async () => {
      byId<HTMLButtonElement>("add-person-toggle")!.click();
    });
    await act(async () => {
      typeInto(byId<HTMLInputElement>("new-first")!, "Marie");
      typeInto(byId<HTMLInputElement>("new-last")!, "Durand");
    });
    expect(byId<HTMLInputElement>("new-first")!.value).toBe("Marie");

    // Écriture lancée : l'écran est occupé.
    await act(async () => {
      byId<HTMLButtonElement>("new-person-submit")!.click();
    });
    expect(mutationDeferred).not.toBeNull();
    expect(byId<HTMLButtonElement>("new-person-submit")!.disabled).toBe(true);

    // Même compte : la saisie et l'écriture en cours sont conservées.
    await emitAuth("SIGNED_IN", { user: { id: "u1" } });
    expect(byId<HTMLInputElement>("new-first")!.value).toBe("Marie");
    expect(byId<HTMLButtonElement>("new-person-submit")!.disabled).toBe(true);

    // Compte réellement différent : écran libéré, saisies effacées.
    const inFlight = mutationDeferred!;
    await emitAuth("SIGNED_IN", { user: { id: "u2" } });
    await settle();
    await act(async () => {
      adminDeferred!.resolve(adminOverview);
    });
    expect(byId("new-first")).toBeNull();
    await act(async () => {
      byId<HTMLButtonElement>("add-person-toggle")!.click();
    });
    expect(byId<HTMLInputElement>("new-first")!.value).toBe("");

    // L'écriture de l'ancien compte revient en retard : sans effet.
    await act(async () => {
      inFlight.resolve(adminOverview);
    });
    expect(byId<HTMLInputElement>("new-first")!.value).toBe("");
    await act(async () => {
      typeInto(byId<HTMLInputElement>("new-first")!, "Paul");
      typeInto(byId<HTMLInputElement>("new-last")!, "Martin");
    });
    expect(byId<HTMLButtonElement>("new-person-submit")!.disabled).toBe(false);
  });
});

/** Écran interne fictif portant un brouillon en cours, remonté seulement quand
 *  le contexte signale un VRAI changement de compte. */
function DraftScreen() {
  const { sessionGeneration } = useCrm();
  return <Draft key={sessionGeneration} />;
}
function Draft() {
  const [text, setText] = React.useState("");
  return (
    <div>
      <span data-testid="draft">{text}</span>
      <button type="button" onClick={() => setText("note interne en cours")}>
        écrire
      </button>
    </div>
  );
}

async function renderDraft() {
  const view = render(
    <CrmProvider>
      <DraftScreen />
    </CrmProvider>,
  );
  await settle();
  act(() => {
    view.getByText("écrire").click();
  });
  expect(view.getByTestId("draft").textContent).toBe("note interne en cours");
  return view;
}

describe("identité du compte connecté", () => {
  test("SIGNED_IN réémis pour le MÊME compte conserve le brouillon en cours", async () => {
    const view = await renderDraft();
    await emitAuth("SIGNED_IN", { user: { id: "u1" } });
    await emitAuth("SIGNED_IN", { user: { id: "u1" } });
    await emitAuth("USER_UPDATED", { user: { id: "u1" } });
    expect(view.getByTestId("draft").textContent).toBe("note interne en cours");
  });

  test("un compte réellement différent efface le brouillon", async () => {
    const view = await renderDraft();
    await emitAuth("SIGNED_IN", { user: { id: "u2" } });
    expect(view.getByTestId("draft").textContent).toBe("");
  });

  test("la déconnexion efface le brouillon", async () => {
    const view = await renderDraft();
    await emitAuth("SIGNED_OUT", null);
    expect(view.getByTestId("draft").textContent).toBe("");
  });
});
