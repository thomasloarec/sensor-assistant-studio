import { afterEach, expect, test } from "bun:test";
import React from "react";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
if (typeof document === "undefined") GlobalRegistrator.register({ url: "http://localhost/" });
const { render, fireEvent, cleanup, waitFor } = await import("@testing-library/react");
const { RoutedBooking } = await import("../src/components/leadmagnet/routed-booking");
import { setLocale } from "../src/lib/i18n/core";
import type { ContactResult } from "../src/lib/leadmagnet/territories";
afterEach(() => { cleanup(); setLocale("fr"); });
const assigned: ContactResult = { reason: "assigned", contact: {
  id: "contact", name: "Thomas Franke", country: "DE", region_code: "DE.02",
  booking_url: "https://example.com/meeting", photo_path: null, microsoft_photo_path: null,
} };

test("Munich without assignment keeps the submitted-project dialog visible and retryable", async () => {
  setLocale("en");
  let calls = 0;
  const changes: boolean[] = [];
  const loadContact = async (country: string, city: string | null) => {
    expect([country, city]).toEqual(["DE", "2867714"]);
    calls++;
    return calls === 1 ? { reason: "uncovered", contact: null } as ContactResult : assigned;
  };
  const view = render(<RoutedBooking open country="DE" cityId="2867714" onOpenChange={v => changes.push(v)} loadContact={loadContact} />);
  await waitFor(() => expect(view.getByRole("dialog").textContent).toContain("Your project remains saved"));
  expect(changes).toEqual([]);
  fireEvent.click(view.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(view.getByRole("link").getAttribute("href")).toBe("https://example.com/meeting"));
  expect(view.getByRole("dialog").textContent).toContain("Thomas Franke");
});

test("lookup failure stays visible; a missing calendar never fabricates a booking", async () => {
  setLocale("en");
  const view = render(<RoutedBooking open country="DE" onOpenChange={() => {}} loadContact={async () => { throw Error("network"); }} />);
  await waitFor(() => expect(view.getByRole("dialog").textContent).toContain("No time slot has been reserved"));
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
  expect(view.getByRole("dialog").textContent).toContain("Finding your Standex contact");
  view.rerender(<RoutedBooking open country="FR" onOpenChange={() => {}} loadContact={loadContact} />);
  resolve(assigned);
  await waitFor(() => expect(view.getByRole("dialog").textContent).toContain("Your project remains saved"));
  expect(view.queryByText("Thomas Franke")).toBeNull();
  view.rerender(<RoutedBooking open country={null} onOpenChange={() => {}} loadContact={loadContact} />);
  expect(view.getByRole("dialog").textContent).toContain("Your project remains saved");
});
