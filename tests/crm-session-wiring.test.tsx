/**
 * Câblage réel des écrans internes au compte connecté.
 *
 * Ce contrôle monte VRAIMENT les composants, avec des réponses retardées : il
 * échoue si un écran garde à l'affichage les données du compte précédent, ou si
 * une lecture/écriture partie avant la déconnexion repeuple l'écran ensuite.
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
let authHandler: AuthHandler | null = null;
mock.module("@/lib/standex/supabase", () => ({
  isSupabaseConfigured: true,
  requireSupabase: () => ({}),
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: "u1" } } } }),
      onAuthStateChange: (cb: AuthHandler) => {
        authHandler = cb;
        return {
          data: { subscription: { unsubscribe: () => { authHandler = null; } } },
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

// --- Contexte compte piloté par le test ------------------------------------
let crmState = {
  capabilities: { available: true, role: "admin", userId: "u1", detail: null } as unknown,
  legacyRole: "admin" as string | null,
  sessionGeneration: 0,
  refresh: () => undefined,
};
const realSupabaseAdapter = await import("../src/lib/leadmagnet/supabase-adapter");
mock.module("@/lib/leadmagnet/supabase-adapter", () => ({
  ...realSupabaseAdapter,
  fetchStaffInbox: () => Promise.resolve({ role: "admin", dossiers: [] }),
}));

const realCrmContext = await import("../src/components/standex/dashboard/crm-context");
mock.module("@/components/standex/dashboard/crm-context", () => ({
  useCrm: () => crmState,
  CrmProvider: ({ children }: { children: React.ReactNode }) => children,
}));


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
  return <RouterContextProvider router={router}>{children}</RouterContextProvider>;
}

describe("la fiche projet appartient au compte connecté", () => {
  test("une réponse partie avant le changement de compte ne repeuple pas l'écran", async () => {
    crmState = { ...crmState, sessionGeneration: 0 };
    const view = render(<Screen><ProjectDetail dossierId="d1" /></Screen>);

    // Réponse du PREMIER compte : elle arrive normalement.
    const first = projectDeferred!;
    await act(async () => {
      first.resolve(projectFor("Société A"));
    });
    expect(document.body.textContent).toContain("Société A");

    // Déconnexion puis connexion d'un autre compte, même écran monté.
    const late = projectDeferred!;
    crmState = { ...crmState, sessionGeneration: 1 };
    await act(async () => {
      view.rerender(<Screen><ProjectDetail dossierId="d1" /></Screen>);
    });
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

describe("l'administration appartient au compte connecté", () => {
  test("l'annuaire de l'ancien compte disparaît et ne revient pas", async () => {
    crmState = { ...crmState, sessionGeneration: 10 };
    const view = render(<Screen><AdminScreen /></Screen>);

    const first = adminDeferred!;
    await act(async () => {
      first.resolve({
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
      });
    });
    expect(document.body.textContent).toContain("Ancien");

    const late = adminDeferred!;
    crmState = { ...crmState, sessionGeneration: 11 };
    await act(async () => {
      view.rerender(<Screen><AdminScreen /></Screen>);
    });
    expect(document.body.textContent).not.toContain("Ancien");

    await act(async () => {
      late?.resolve({
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
      });
    });
    expect(document.body.textContent).not.toContain("Ancien");
  });
});


/** Écran interne fictif portant un brouillon en cours, remonté quand le
 *  contexte signale un changement de compte. */
function DraftScreen() {
  const { sessionGeneration } = realCrmContext.useCrm();
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
  const { CrmProvider } = realCrmContext;
  const view = render(
    <CrmProvider>
      <DraftScreen />
    </CrmProvider>,
  );
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  act(() => {
    view.getByText("écrire").click();
  });
  expect(view.getByTestId("draft").textContent).toBe("note interne en cours");
  return view;
}

function dbg(){
  console.log("DBG handler", authHandler !== null);
  void import("@/lib/standex/supabase").then((m) => console.log("DBG sb", Boolean(m.supabase), typeof (m as any).supabase?.auth?.onAuthStateChange));
}
async function emitAuth(event: string, session: unknown) {
  await act(async () => {
    authHandler?.(event, session);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("identité du compte connecté", () => {
  test("SIGNED_IN réémis pour le MÊME compte conserve le brouillon en cours", async () => {
    const view = await renderDraft();
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
    dbg();
  await emitAuth("SIGNED_OUT", null);
    expect(view.getByTestId("draft").textContent).toBe("");
  });
});


