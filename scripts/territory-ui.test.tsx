/** Isolated UI process: adapter mocks must not leak into the main test suite. */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();
import { test, expect, mock } from "bun:test";
import React, { useState } from "react";
const { render, fireEvent, waitFor, cleanup } = await import("@testing-library/react");
import { createDossier, type BusinessMeta } from "../src/lib/leadmagnet/dossier";
import type { CrmPerson } from "../src/lib/leadmagnet/crm";
import type { SalesOverview } from "../src/lib/leadmagnet/territories";
import { territoryPreview } from "../src/lib/leadmagnet/territories";
const people: CrmPerson[] = ["Gilles", "Thomas"].map((name, i) => ({
  id: String(i + 1),
  firstName: name,
  lastName: "Test",
  role: "sales",
  active: true,
  userId: null,
  email: null,
  staffRole: null,
}));
const data: SalesOverview = {
  regions: [
    { country: "FR", code: "FR.11", name: "Île-de-France" },
    { country: "FR", code: "FR.53", name: "Bretagne" },
  ],
  territories: [{ country: "FR", version: 3, owner: "1", region_owners: {} }],
  profiles: [],
  imports: [{ country: "FR", place_count: 2, imported_at: "" }],
};
let calls: any[] = [];
let stale = false;
const cities = [
  {
    id: "a",
    name: "Saint-Test",
    country: "FR",
    region_code: "FR.11",
    region_name: "Île-de-France",
    district: "75",
  },
  {
    id: "b",
    name: "Saint-Test",
    country: "FR",
    region_code: "FR.53",
    region_name: "Bretagne",
    district: "35",
  },
];
mock.module("@/lib/leadmagnet/territory-adapter", () => ({
  fetchSalesOverview: async () => structuredClone(data),
  changeTerritory: async (...args: any[]) => {
    calls.push(args);
    if (stale) throw new Error("TERRITORY_STALE");
    const next = structuredClone(data);
    next.territories = [
      territoryPreview(data.territories[0]!, "2", args[2], args[3], data.regions),
    ];
    return next;
  },
  territoryError: (e: Error) => e.message,
  uploadPortrait: async () => "",
  saveSalesProfile: async () => data,
  removeOrphanPortrait: async () => {},
  portraitUrl: (p: string) => "https://example.invalid/" + p,
  searchCities: async (country: string, q: string) => ({
    ready: true,
    cities: country === "FR" && q.startsWith("Saint") ? cities : [],
  }),
  fetchSalesContact: async () => ({ reason: "region_required", contact: null }),
}));
const { PersonSalesSettings } = await import("../src/components/leadmagnet/person-sales-settings");
const { SiteLocation } = await import("../src/components/leadmagnet/site-location");
const { SalesAvatar } = await import("../src/components/leadmagnet/sales-avatar");
test("admin previews the split before writing, shows existing owner, and rejects stale confirmation", async () => {
  try {
    const ui = render(
      <PersonSalesSettings person={people[1]!} people={people} onSaved={() => {}} />,
    );
    await waitFor(() => expect(ui.getByLabelText("Pays à gérer")).toBeTruthy());
    fireEvent.change(ui.getByLabelText("Pays à gérer"), { target: { value: "FR" } });
    fireEvent.click(ui.getByLabelText("Gérer ce pays par régions"));
    fireEvent.click(ui.getByLabelText(/Bretagne/));
    fireEvent.click(ui.getByRole("button", { name: "Préparer la répartition" }));
    expect(calls).toHaveLength(0);
    const preview = ui.getByRole("region", { name: "Vérifier la répartition" });
    expect(preview.textContent).toContain("Gilles Test");
    expect(preview.textContent).toContain("Thomas Test");
    stale = true;
    fireEvent.click(ui.getByRole("button", { name: "Confirmer cette répartition" }));
    await waitFor(() => expect(ui.getByRole("alert").textContent).toContain("TERRITORY_STALE"));
    expect(calls[0]).toEqual(["FR", "2", "regions", ["FR.53"], 3]);
    expect(ui.queryByRole("button", { name: "Confirmer cette répartition" })).toBeNull();
  } finally {
    cleanup();
    stale = false;
    calls = [];
  }
});
test("homonymous city choice records its region; editing city or country clears that resolution", async () => {
  let business: BusinessMeta = createDossier().business;
  function Form() {
    const [b, setB] = useState<BusinessMeta>({ ...business, siteCountry: "FR" });
    business = b;
    return (
      <SiteLocation business={b} onChange={(patch) => setB((old) => ({ ...old, ...patch }))} />
    );
  }
  try {
    const ui = render(<Form />);
    fireEvent.change(ui.getByLabelText(/Ville du site/), { target: { value: "Saint" } });
    await waitFor(() => expect(ui.getAllByRole("button", { name: /Saint-Test/ })).toHaveLength(2));
    fireEvent.click(ui.getByRole("button", { name: /Saint-Test · Bretagne/ }));
    expect(business.siteCityId).toBe("b");
    expect(business.siteRegionCode).toBe("FR.53");
    fireEvent.change(ui.getByLabelText(/Ville du site/), { target: { value: "Lyon" } });
    expect(business.siteCityId).toBeNull();
    expect(business.siteRegionCode).toBeNull();
    fireEvent.change(ui.getByLabelText(/Pays du site/), { target: { value: "DE" } });
    expect(business.siteCity).toBeNull();
    expect(business.siteRegionCode).toBeNull();
  } finally {
    cleanup();
  }
});
test("unavailable manual image falls back to Microsoft, then initials", () => {
  try {
    const ui = render(
      <SalesAvatar name="Gilles Test" photo="manual.webp" microsoftPhoto="microsoft.webp" />,
    );
    expect(ui.getByRole("img").getAttribute("src")).toContain("manual.webp");
    fireEvent.error(ui.getByRole("img"));
    expect(ui.getByRole("img").getAttribute("src")).toContain("microsoft.webp");
    fireEvent.error(ui.getByRole("img"));
    expect(ui.queryByRole("img")).toBeNull();
    expect(ui.getByLabelText("Gilles Test").textContent).toBe("GT");
  } finally {
    cleanup();
  }
});
