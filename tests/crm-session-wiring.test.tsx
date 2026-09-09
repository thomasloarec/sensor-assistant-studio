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
import { act, cleanup, render } from "@testing-library/react";
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
}));

const realSupabaseAdapter = await import("../src/lib/leadmagnet/supabase-adapter");
mock.module("@/lib/leadmagnet/supabase-adapter", () => ({
  ...realSupabaseAdapter,
  fetchStaffInbox: () => Promise.resolve({ role: "admin", dossiers: [] }),
}));

const { CrmProvider, useCrm } = await import(
  "../src/components/standex/dashboard/crm-context"
);
const { ProjectDetail } = await import("../src/routes/standex.projects.$dossierId");
const { AdminScreen } = await import("../src/routes/standex.admin");

afterEach(() => {
  cleanup();
  projectDeferred = null;
  adminDeferred = null;
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
