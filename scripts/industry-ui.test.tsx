/** Run separately: request mocks must never affect the main test suite. */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();
import { test, expect, mock, afterEach } from "bun:test";
import React, { useState } from "react";
const { render, fireEvent, waitFor, cleanup } = await import("@testing-library/react");
import { createDossier, type DesignDossier } from "../src/lib/leadmagnet/dossier";
import { setLocale } from "../src/lib/i18n/core";
setLocale("fr");
let requests: { resolve: (v: any) => void; reject: () => void }[] = [];
mock.module("@/lib/leadmagnet/project-identity-client", () => ({
  requestProjectIdentity: () =>
    new Promise((resolve, reject) =>
      requests.push({ resolve, reject: () => reject(Error("unavailable")) }),
    ),
}));
let writes: any[] = [];
mock.module("@/lib/leadmagnet/territory-adapter", () => ({
  changeIndustryResponsibility: async (...args: any[]) => {
    writes.push(args);
    return { industries: [] };
  },
}));
const { IndustryField } = await import("../src/components/leadmagnet/industry-field");
const { IndustrySettings } = await import("../src/components/leadmagnet/industry-settings");
const { useProjectIdentity } = await import("../src/components/leadmagnet/use-project-identity");
let current: DesignDossier;
function Harness() {
  const [d, setD] = useState(() => {
    const d = createDossier();
    d.requirements[0]!.value = "Trappe de recharge automobile";
    return d;
  });
  current = d;
  const state = useProjectIdentity(d, setD, true);
  return (
    <>
      <span>{state}</span>
      <IndustryField
        business={d.business}
        onChange={(patch) => setD((d) => ({ ...d, business: { ...d.business, ...patch } }))}
      />
      <button
        onClick={() => setD((d) => ({ ...d, title: "Titre personnel", titleSource: "user" }))}
      >
        Rename
      </button>
      <button
        onClick={() =>
          setD((d) => ({
            ...d,
            requirements: d.requirements.map((r, i) =>
              i === 0 ? { ...r, value: "Pompe à perfusion médicale" } : r,
            ),
          }))
        }
      >
        Change answers
      </button>
      <button onClick={() => setD(createDossier())}>Other project</button>
    </>
  );
}
afterEach(() => {
  cleanup();
  requests = [];
  writes = [];
});
test("provider failure leaves an empty industry for manual selection", async () => {
  const ui=render(<Harness/>);
  await waitFor(()=>expect(requests).toHaveLength(1));
  requests[0]!.reject();
  await waitFor(()=>expect(ui.getByText("unavailable")).toBeTruthy());
  expect(current.business.industry).toBeUndefined();
  fireEvent.change(ui.getByLabelText(/Industrie/),{target:{value:"HVAC"}});
  expect(current.business.industryConfirmed).toBe(true);
});
test("AI industry needs explicit confirmation, title synthesizes answers, edits invalidate confirmation", async () => {
  const ui = render(<Harness />);
  await waitFor(() => expect(requests).toHaveLength(1));
  requests[0]!.resolve({ title: "Détection de trappe de recharge", industry: "Automotive" });
  await waitFor(() => expect(current.title).toBe("Détection de trappe de recharge"));
  expect(current.business.industryConfirmed).toBe(false);
  fireEvent.click(ui.getByRole("button", { name: "Confirmer cette industrie" }));
  expect(current.business.industryConfirmed).toBe(true);
  fireEvent.click(ui.getByText("Change answers"));
  await waitFor(() => expect(current.business.industryConfirmed).toBe(false));
});
test("late provider responses preserve manual industry and title", async () => {
  const ui = render(<Harness />);
  await waitFor(() => expect(requests).toHaveLength(1));
  fireEvent.click(ui.getByText("Rename"));
  fireEvent.change(ui.getByLabelText(/Industrie/), { target: { value: "Medical" } });
  requests[0]!.resolve({ title: "AI title", industry: "Automotive" });
  await waitFor(() => expect(ui.getByText("ready")).toBeTruthy());
  expect(current.title).toBe("Titre personnel");
  expect(current.business.industry).toBe("Medical");
  expect(current.business.industryConfirmed).toBe(true);
});
test("switching project ignores stale AI output, failure leaves manual choice usable", async () => {
  const ui = render(<Harness />);
  await waitFor(() => expect(requests).toHaveLength(1));
  fireEvent.click(ui.getByText("Other project"));
  requests[0]!.resolve({ title: "Stale", industry: "Automotive" });
  await new Promise((r) => setTimeout(r, 20));
  expect(current.title).toBe("Nouveau projet");
  expect(current.business.industry).toBeUndefined();
  fireEvent.change(ui.getByLabelText(/Industrie/), { target: { value: "Security" } });
  expect(current.business.industryConfirmed).toBe(true);
});
test("admin shows national owner and writes only after transfer review", async () => {
  const people = [
    { id: "a", firstName: "Gilles", lastName: "Test", role: "sales", active: true },
    { id: "b", firstName: "Thomas", lastName: "Test", role: "sales", active: true },
  ] as any;
  const data = {
    industries: [{ country: "FR", industry: "Automotive", owner: "a", version: 2 }],
    territories: [],
    profiles: [],
    regions: [],
    imports: [],
  } as any;
  const ui = render(
    <IndustrySettings
      person={people[1]}
      people={people}
      data={data}
      busy={false}
      run={async (action) => {
        await action();
      }}
    />,
  );
  fireEvent.change(ui.getByLabelText("Pays de l’industrie"), { target: { value: "FR" } });
  fireEvent.change(ui.getByLabelText("Industrie"), { target: { value: "Automotive" } });
  expect(ui.getByText(/Responsable actuel/).textContent).toContain("Gilles Test");
  fireEvent.click(ui.getByText("Attribuer cette industrie"));
  expect(writes).toHaveLength(0);
  expect(ui.getByRole("region", { name: "Vérifier la responsabilité" }).textContent).toContain(
    "Thomas Test",
  );
  fireEvent.click(ui.getByText("Confirmer cette responsabilité"));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual(["FR", "Automotive", "b", false, 2]);
});
