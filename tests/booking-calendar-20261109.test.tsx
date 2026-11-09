import { afterEach, expect, test } from "bun:test";
import React from "react";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
if (typeof document === "undefined") GlobalRegistrator.register({ url: "http://localhost/" });
const { render, cleanup, fireEvent, waitFor, act } = await import("@testing-library/react");
const { BookingCalendar } = await import("../src/components/leadmagnet/booking-calendar");
const { RoutedBooking } = await import("../src/components/leadmagnet/routed-booking");
import { setLocale } from "../src/lib/i18n/core";
import type { BookingProvider } from "../src/lib/leadmagnet/booking-provider";
afterEach(() => {
  cleanup();
  setLocale("fr");
});
test("assigned representative with no calendar restores demo, selection, confirmation and reset", async () => {
  setLocale("en");
  const loadContact = async () => ({
    reason: "assigned" as const,
    contact: {
      id: "demo",
      name: "Demo representative",
      country: "FR",
      region_code: null,
      photo_path: null,
      microsoft_photo_path: null,
      booking_url: null,
    },
  });
  const props = { country: "FR", onOpenChange: () => {}, loadContact };
  const v = render(<RoutedBooking open {...props} />);
  await waitFor(() => expect(v.getByTestId("booking-calendar")).toBeTruthy());
  expect(v.getByText(/no real calendar/)).toBeTruthy();
  fireEvent.click(v.getByRole("button", { name: "Next week" }));
  await waitFor(() =>
    expect(v.getByTestId("booking-week").querySelectorAll("button:not(:disabled)").length).toBe(5),
  );
  fireEvent.click(v.getByTestId("booking-week").querySelector("button:not(:disabled)")!);
  fireEvent.click(v.getByRole("button", { name: "09:00" }));
  expect(v.getByTestId("booking-recap").textContent).toContain("09:00");
  fireEvent.click(v.getByRole("button", { name: "Confirm this slot" }));
  await waitFor(() =>
    expect(v.getByTestId("booking-confirmation").textContent).toContain("no real booking"),
  );
  v.rerender(<RoutedBooking open={false} {...props} />);
  v.rerender(<RoutedBooking open {...props} />);
  await waitFor(() => expect(v.getByTestId("booking-calendar")).toBeTruthy());
  expect(v.queryByTestId("booking-confirmation")).toBeNull();
});
test("live provider keeps the same date/time UI and never confirms a failed reservation", async () => {
  setLocale("en");
  let calls = 0;
  const provider: BookingProvider = {
    mode: "outlook",
    async availability(monday) {
      const d = new Date(monday);
      d.setHours(10);
      return [{ start: d.toISOString(), end: new Date(+d + 1800000).toISOString() }];
    },
    async reserve() {
      calls++;
      throw Error("SLOT_UNAVAILABLE");
    },
  };
  const v = render(
    <BookingCalendar contactName="Live representative" onClose={() => {}} provider={provider} />,
  );
  await waitFor(() =>
    expect(v.getByTestId("booking-week").querySelector("button:not(:disabled)")).toBeTruthy(),
  );
  fireEvent.click(v.getByTestId("booking-week").querySelector("button:not(:disabled)")!);
  fireEvent.click(v.getByRole("button", { name: "10:00" }));
  fireEvent.click(v.getByRole("button", { name: "Confirm this slot" }));
  await waitFor(() => expect(v.getByRole("alert")).toBeTruthy());
  expect(calls).toBe(1);
  expect(v.queryByTestId("booking-confirmation")).toBeNull();
  expect(v.queryByText(/no real calendar/)).toBeNull();
});
test("late availability from another week is ignored", async () => {
  let firstResolve!: (slots: any[]) => void;
  let calls = 0;
  const provider: BookingProvider = {
    mode: "outlook",
    availability: async (monday) => {
      calls++;
      if (calls === 1)
        return new Promise((r) => {
          firstResolve = r;
        });
      return [];
    },
    reserve: async (s) => ({ ...s, mode: "outlook" }),
  };
  const v = render(<BookingCalendar contactName="Live" onClose={() => {}} provider={provider} />);
  fireEvent.click(v.getByRole("button", { name: "Semaine suivante" }));
  await act(async () =>
    firstResolve([{ start: new Date().toISOString(), end: new Date().toISOString() }]),
  );
  await waitFor(() =>
    expect(v.getByText("Aucun horaire cette semaine. Choisissez une autre semaine.")).toBeTruthy(),
  );
});
