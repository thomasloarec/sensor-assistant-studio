/** Isolated process: mocked routing must never affect production-adapter tests. */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();
import React, { useState } from "react";
import { afterEach, expect, mock, test } from "bun:test";
const { render, fireEvent, waitFor, cleanup, act } = await import("@testing-library/react");
import { setLocale } from "../src/lib/i18n/core";
import { createDossier } from "../src/lib/leadmagnet/dossier";
setLocale("fr");
type Pending = { resolve: (value: any) => void; reject: (reason: Error) => void };
let pending: Pending[] = [];
let cityCalls = 0;
let cityMode: "unavailable" | "empty" | "error" = "unavailable";
mock.module("@/lib/leadmagnet/territory-adapter", () => ({
  fetchSalesContact: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
  portraitUrl: (path: string) => "https://example.invalid/" + path,
  searchCities: async () => {
    cityCalls++;
    if (cityMode === "error") throw new Error("unavailable");
    return { ready: cityMode !== "unavailable", cities: [] };
  },
}));
const { RoutedBooking } = await import("../src/components/leadmagnet/routed-booking");
const { SiteLocation } = await import("../src/components/leadmagnet/site-location");
const assigned = {
  reason: "assigned",
  contact: { id: "gilles", name: "Gilles Servant", country: "FR", region_code: null,
    photo_path: null, microsoft_photo_path: null, booking_url: "https://example.invalid/book" },
};
afterEach(() => { cleanup(); pending = []; cityCalls = 0; cityMode = "unavailable"; });

for (const reason of ["uncovered", "region_required"]) {
  test(`no modal, even briefly, when routing is ${reason}`, async () => {
    const changes: boolean[] = [], available: boolean[] = [];
    const ui = render(<RoutedBooking open country="FR" industry="Medical"
      onOpenChange={(value) => changes.push(value)}
      onContactAvailabilityChange={(value) => available.push(value)} />);
    expect(pending).toHaveLength(1);
    expect(ui.queryByRole("dialog")).toBeNull();
    await act(async () => pending[0]!.resolve({ reason, contact: null }));
    await waitFor(() => expect(changes).toEqual([false]));
    expect(ui.queryByRole("dialog")).toBeNull();
    expect(available.every((value) => !value)).toBe(true);
    expect(ui.queryByText(/Standex vérifiera/)).toBeNull();
  });
}

test("known contact opens the dialog only after resolution and revalidates on reopen", async () => {
  const changes: boolean[] = [], available: boolean[] = [];
  const onOpenChange = (value: boolean) => { changes.push(value); };
  const onContactAvailabilityChange = (value: boolean) => { available.push(value); };
  const props = { country: "FR", industry: "Automotive", onOpenChange, onContactAvailabilityChange };
  const ui = render(<RoutedBooking open {...props} />);
  expect(ui.queryByRole("dialog")).toBeNull();
  await act(async () => pending[0]!.resolve(assigned));
  await waitFor(() => expect(ui.getByRole("dialog")).toBeTruthy());
  expect(ui.getByText("Gilles Servant")).toBeTruthy();
  expect(ui.getByRole("link", { name: "Choisir mon rendez-vous" }).getAttribute("href"))
    .toBe("https://example.invalid/book");
  expect(available.at(-1)).toBe(true);
  ui.rerender(<RoutedBooking open={false} {...props} />);
  expect(ui.queryByRole("dialog")).toBeNull();
  ui.rerender(<RoutedBooking open {...props} />);
  expect(ui.queryByRole("dialog")).toBeNull();
  expect(pending).toHaveLength(2);
  await act(async () => pending[1]!.resolve({ reason: "uncovered", contact: null }));
  await waitFor(() => expect(available.at(-1)).toBe(false));
  expect(ui.queryByRole("dialog")).toBeNull();
});

test("lookup failures remain silent and close the booking request", async () => {
  const changes: boolean[] = [];
  const ui = render(<RoutedBooking open country="FR" onOpenChange={(v) => changes.push(v)} />);
  await act(async () => pending[0]!.reject(new Error("network error")));
  await waitFor(() => expect(changes).toEqual([false]));
  expect(ui.queryByRole("dialog")).toBeNull();
  expect(ui.queryByRole("alert")).toBeNull();
});

test("a late contact from another submitted location cannot open the dialog", async () => {
  const changes: boolean[] = [];
  const onOpenChange = (v: boolean) => { changes.push(v); };
  const ui = render(<RoutedBooking open country="FR" onOpenChange={onOpenChange} />);
  ui.rerender(<RoutedBooking open country="DE" onOpenChange={onOpenChange} />);
  expect(pending).toHaveLength(2);
  await act(async () => pending[0]!.resolve(assigned));
  expect(ui.queryByRole("dialog")).toBeNull();
  expect(changes).toEqual([]);
  await act(async () => pending[1]!.resolve({ reason: "uncovered", contact: null }));
  await waitFor(() => expect(changes).toEqual([false]));
});

for (const mode of ["unavailable", "empty", "error"] as const) {
  test(`city lookup ${mode} keeps free-text entry without internal notices`, async () => {
    cityMode = mode;
    function Form() {
      const [business, setBusiness] = useState({ ...createDossier().business, siteCountry: "FR", siteCity: "Lyon" });
      return <SiteLocation business={business} onChange={(patch) => setBusiness((b) => ({ ...b, ...patch }))} />;
    }
    const ui = render(<Form />);
    await waitFor(() => expect(cityCalls).toBe(1));
    expect((ui.getByLabelText(/Ville du site/) as HTMLInputElement).value).toBe("Lyon");
    expect(ui.queryByText(/indisponible|Standex vérifiera|Aucune ville trouvée|partagé entre plusieurs commerciaux/)).toBeNull();
    expect(ui.queryByText("GeoNames")).toBeNull();
    expect(ui.queryByText(/Choisissez votre ville dans les résultats/)).toBeNull();
    fireEvent.change(ui.getByLabelText(/Ville du site/), { target: { value: "Paris" } });
    expect((ui.getByLabelText(/Ville du site/) as HTMLInputElement).value).toBe("Paris");
  });
}
