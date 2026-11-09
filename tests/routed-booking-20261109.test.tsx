import { afterEach, expect, test } from "bun:test";
import React from "react";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
if (typeof document === "undefined") GlobalRegistrator.register({ url: "http://localhost/" });
const { render, cleanup, waitFor, act } = await import("@testing-library/react");
const { RoutedBooking } = await import("../src/components/leadmagnet/routed-booking");
import { setLocale } from "../src/lib/i18n/core";
import type { ContactResult } from "../src/lib/leadmagnet/territories";
afterEach(() => { cleanup(); setLocale("fr"); });
const assigned: ContactResult = { reason: "assigned", contact: {
  id: "contact", name: "Thomas Franke", country: "DE", region_code: "DE.02",
  booking_url: "https://example.com/meeting", photo_path: null, microsoft_photo_path: null,
} };

test("Munich without assignment only shows completion; reopening can resolve a contact", async () => {
  setLocale("en");
  let calls = 0;
  const changes: boolean[] = [];
  const loadContact = async (country: string, city: string | null) => {
    expect([country, city]).toEqual(["DE", "2867714"]);
    calls++;
    return calls === 1 ? { reason: "uncovered", contact: null } as ContactResult : assigned;
  };
  const view = render(<RoutedBooking open country="DE" cityId="2867714" onOpenChange={v => changes.push(v)} loadContact={loadContact} />);
  await act(async () => {});
  expect(view.getByRole("dialog").textContent).toContain("Thank you! Standex has received your project.");
  expect(view.getByRole("dialog").textContent).not.toMatch(/unavailable|Finding|reserved|meeting|zone|territor/i);
  expect(view.queryByRole("link")).toBeNull();
  expect(view.queryByRole("button", {name: "Try again"})).toBeNull();
  expect(changes).toEqual([]);
  view.rerender(<RoutedBooking open={false} country="DE" cityId="2867714" onOpenChange={v => changes.push(v)} loadContact={loadContact} />);
  view.rerender(<RoutedBooking open country="DE" cityId="2867714" onOpenChange={v => changes.push(v)} loadContact={loadContact} />);
  await waitFor(() => expect(view.getByRole("link").getAttribute("href")).toBe("https://example.com/meeting"));
  expect(view.getByRole("dialog").textContent).toContain("Thomas Franke");
});

test("lookup failure stays invisible; a missing calendar never fabricates a booking", async () => {
  setLocale("en");
  const view = render(<RoutedBooking open country="DE" onOpenChange={() => {}} loadContact={async () => { throw Error("network"); }} />);
  await act(async () => {});
  expect(view.getByRole("dialog").textContent).toContain("Thank you! Standex has received your project.");
  expect(view.getByRole("dialog").textContent).not.toMatch(/unavailable|network|retry/i);
  expect(view.queryByRole("link")).toBeNull();
  view.rerender(<RoutedBooking open country="DE" onOpenChange={() => {}} loadContact={async () => ({ ...assigned, contact: { ...assigned.contact!, booking_url: null } })} />);
  await waitFor(() => expect(view.getByRole("dialog").textContent).toContain("Thomas Franke"));
  expect(view.queryByRole("link")).toBeNull();
});

test("late contact from a previous country is ignored, and no country still shows confirmation", async () => {
  setLocale("en");
  let resolve!: (value: ContactResult) => void;
  const deferred = new Promise<ContactResult>(r => { resolve = r; });
  const loadContact = async (country: string) => country === "DE" ? deferred : { reason: "uncovered", contact: null } as ContactResult;
  const view = render(<RoutedBooking open country="DE" onOpenChange={() => {}} loadContact={loadContact} />);
  expect(view.getByRole("dialog").textContent).toContain("Thank you! Standex has received your project.");
  view.rerender(<RoutedBooking open country="FR" onOpenChange={() => {}} loadContact={loadContact} />);
  await act(async () => resolve(assigned));
  expect(view.queryByText("Thomas Franke")).toBeNull();
  view.rerender(<RoutedBooking open country={null} onOpenChange={() => {}} loadContact={loadContact} />);
  expect(view.getByRole("dialog").textContent).toContain("Thank you! Standex has received your project.");
});
