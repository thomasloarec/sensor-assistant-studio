/**
 * Une reconfirmation de session pour le MÊME compte ne doit pas être traitée
 * comme un changement de compte : les brouillons en cours des écrans internes
 * doivent survivre. Un VRAI changement de compte, lui, remet tout à zéro.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register({ url: "https://exemple.invalid/standex" });

import { afterEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";

type Handler = (event: string, session: unknown) => void;
let handler: Handler | null = null;
let currentSession: unknown = { user: { id: "u1" } };

mock.module("@/lib/standex/supabase", () => ({
  isSupabaseConfigured: true,
  requireSupabase: () => ({}),
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: currentSession } }),
      onAuthStateChange: (cb: Handler) => {
        handler = cb;
        return { data: { subscription: { unsubscribe: () => { handler = null; } } } };
      },
    },
  },
}));

mock.module("@/lib/leadmagnet/dashboard-adapter", () => ({
  CRM_UNAVAILABLE: { available: false, role: null, userId: null, detail: null },
  probeCrm: () =>
    Promise.resolve({ available: true, role: "admin", userId: "u1", detail: null }),
}));

mock.module("@/lib/leadmagnet/supabase-adapter", () => ({
  fetchStaffInbox: () => Promise.resolve({ role: "admin", dossiers: [] }),
}));

const { CrmProvider, useCrm } = await import(
  "../src/components/standex/dashboard/crm-context"
);

/** Écran interne fictif avec un brouillon en cours, remonté à chaque
 *  changement de session via la clé `sessionGeneration`. */
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

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  cleanup();
  handler = null;
  currentSession = { user: { id: "u1" } };
});

describe("identité de session interne", () => {
  test("SIGNED_IN répété pour le même compte conserve le brouillon", async () => {
    const view = render(
      <CrmProvider>
        <DraftScreen />
      </CrmProvider>,
    );
    await flush();
    act(() => {
      view.getByText("écrire").click();
    });
    expect(view.getByTestId("draft").textContent).toBe("note interne en cours");

    await act(async () => {
      handler?.("SIGNED_IN", { user: { id: "u1" } });
      handler?.("USER_UPDATED", { user: { id: "u1" } });
      await Promise.resolve();
    });
    await flush();

    expect(view.getByTestId("draft").textContent).toBe("note interne en cours");
  });

  test("un compte réellement différent efface le brouillon", async () => {
    const view = render(
      <CrmProvider>
        <DraftScreen />
      </CrmProvider>,
    );
    await flush();
    act(() => {
      view.getByText("écrire").click();
    });
    expect(view.getByTestId("draft").textContent).toBe("note interne en cours");

    await act(async () => {
      handler?.("SIGNED_IN", { user: { id: "u2" } });
      await Promise.resolve();
    });
    await flush();

    expect(view.getByTestId("draft").textContent).toBe("");
  });

  test("la déconnexion efface le brouillon", async () => {
    const view = render(
      <CrmProvider>
        <DraftScreen />
      </CrmProvider>,
    );
    await flush();
    act(() => {
      view.getByText("écrire").click();
    });

    await act(async () => {
      handler?.("SIGNED_OUT", null);
      await Promise.resolve();
    });
    await flush();

    expect(view.getByTestId("draft").textContent).toBe("");
  });
});
