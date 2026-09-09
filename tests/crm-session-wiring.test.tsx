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
mock.module("@/components/standex/dashboard/crm-context", () => ({
  useCrm: () => crmState,
  CrmProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// --- Routeur minimal --------------------------------------------------------
let currentDossier = "d1";
mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useParams: () => ({ dossierId: currentDossier }),
  }),
  Link: ({ children }: { children: React.ReactNode }) =>
    React.createElement("span", null, children),
}));

const { Route: ProjectRoute } = await import("../src/routes/standex.projects.$dossierId");
const { Route: AdminRoute } = await import("../src/routes/standex.admin");

afterEach(() => {
  cleanup();
  projectDeferred = null;
  adminDeferred = null;
});

function Screen({ Component }: { Component: React.ComponentType }) {
  return React.createElement(Component, null);
}

describe("la fiche projet appartient au compte connecté", () => {
  test("une réponse partie avant le changement de compte ne repeuple pas l'écran", async () => {
    crmState = { ...crmState, sessionGeneration: 0 };
    const Component = ProjectRoute.component as React.ComponentType;
    const view = render(<Screen Component={Component} />);

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
      view.rerender(<Screen Component={Component} />);
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
    const Component = AdminRoute.component as React.ComponentType;
    const view = render(<Screen Component={Component} />);

    const first = adminDeferred!;
    await act(async () => {
      first.resolve({
        staff: [
          {
            userId: "u1",
            role: "admin",
            active: true,
            firstName: "Ancien",
            lastName: "Compte",
            email: null,
          },
        ],
        directory: [],
        accounts: [],
      });
    });
    expect(document.body.textContent).toContain("Ancien");

    const late = adminDeferred!;
    crmState = { ...crmState, sessionGeneration: 11 };
    await act(async () => {
      view.rerender(<Screen Component={Component} />);
    });
    expect(document.body.textContent).not.toContain("Ancien");

    await act(async () => {
      late?.resolve({
        staff: [
          {
            userId: "u1",
            role: "admin",
            active: true,
            firstName: "Ancien",
            lastName: "Compte",
            email: null,
          },
        ],
        directory: [],
        accounts: [],
      });
    });
    expect(document.body.textContent).not.toContain("Ancien");
  });
});
