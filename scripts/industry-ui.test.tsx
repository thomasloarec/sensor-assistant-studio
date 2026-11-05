/** Run separately: request mocks must never affect the main test suite. */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();
import { test, expect, mock, afterEach } from "bun:test";
import React, { useState } from "react";
const { render, fireEvent, waitFor, cleanup, act } = await import("@testing-library/react");
import { createDossier, type DesignDossier } from "../src/lib/leadmagnet/dossier";
import { setLocale, LANGUAGES, t } from "../src/lib/i18n/core";
import { INDUSTRIES } from "../src/lib/leadmagnet/industries";
import { industryDisplayName } from "../src/lib/leadmagnet/industry-labels";
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
  setLocale("fr");
  requests = [];
  writes = [];
});
test("changing locale translates all options while preserving the canonical selected industry", async () => {
  const business = { ...createDossier().business, industry: "Industrial Applications" as const, industrySource: "ai" as const };
  const changes: unknown[] = [];
  const ui = render(<IndustryField business={business} onChange={patch => changes.push(patch)} />);
  const select = ui.getByRole("combobox") as HTMLSelectElement;
  for (const { id } of LANGUAGES) {
    await act(async () => setLocale(id));
    const options = [...select.options].slice(1);
    expect(options.map(o => o.value)).toEqual([...INDUSTRIES]);
    expect(options.map(o => o.textContent)).toEqual(INDUSTRIES.map(i => industryDisplayName(i, s => t(s, id))));
    expect(select.value).toBe("Industrial Applications");
    expect(select.selectedOptions[0]!.textContent).toBe(industryDisplayName("Industrial Applications", s => t(s, id)));
    expect(changes).toHaveLength(0);
  }
  await act(async () => setLocale("fr"));
  expect(select.selectedOptions[0]!.textContent).toBe("Applications industrielles");
  fireEvent.change(select, { target: { value: "Automotive" } });
  expect(changes).toEqual([{ industry: "Automotive", industryConfirmed: true, industrySource: "user" }]);
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
test("AI industry stays editable in a plain required dropdown without confirmation controls", async () => {
  const ui = render(<Harness />);
  await waitFor(() => expect(requests).toHaveLength(1));
  requests[0]!.resolve({ title: "Détection de trappe de recharge", industry: "Automotive" });
  await waitFor(() => expect(current.title).toBe("Détection de trappe de recharge"));
  expect(current.business.industryConfirmed).toBe(false);
  const select = ui.getByRole("combobox", { name: /Industrie/ }) as HTMLSelectElement;
  expect(select.value).toBe("Automotive");
  expect(select.required).toBe(true);
  expect(select.hasAttribute("aria-describedby")).toBe(false);
  expect(ui.queryByRole("button", { name: "Confirmer cette industrie" })).toBeNull();
  expect(select.parentElement!.querySelectorAll("p, button")).toHaveLength(0);
  fireEvent.click(ui.getByText("Change answers"));
  await waitFor(() => expect(requests).toHaveLength(2));
  requests[1]!.resolve({ title: "Détection de pompe", industry: "Medical" });
  await waitFor(() => expect(select.value).toBe("Medical"));
  fireEvent.change(select, { target: { value: "HVAC" } });
  expect(current.business.industry).toBe("HVAC");
  expect(select.parentElement!.querySelectorAll("p, button")).toHaveLength(0);
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
  expect(ui.getByRole("region", { name: "Vérifier la responsabilité" }).textContent).toContain("Automobile");
  expect(writes).toHaveLength(0);
  expect(ui.getByRole("region", { name: "Vérifier la responsabilité" }).textContent).toContain(
    "Thomas Test",
  );
  fireEvent.click(ui.getByText("Confirmer cette responsabilité"));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual(["FR", "Automotive", "b", false, 2]);
});
