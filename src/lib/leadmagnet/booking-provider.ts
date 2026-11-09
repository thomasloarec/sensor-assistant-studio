import { demoSlots, workWeek } from "./booking-calendar";
import { supabase } from "@/lib/standex/supabase";
export type BookingSlot = { start: string; end: string };
export type BookingReceipt = { mode: "demo" | "outlook"; start: string; end: string };
export interface BookingProvider {
  readonly mode: "demo" | "outlook";
  availability(monday: Date, signal: AbortSignal): Promise<BookingSlot[]>;
  reserve(slot: BookingSlot, signal: AbortSignal): Promise<BookingReceipt>;
}
export const demoBookingProvider: BookingProvider = {
  mode: "demo",
  async availability(monday) {
    return workWeek(monday).flatMap((day) =>
      demoSlots(day, new Date()).map((start) => ({
        start: start.toISOString(),
        end: new Date(start.getTime() + 30 * 60_000).toISOString(),
      })),
    );
  },
  async reserve(slot) {
    const start = new Date(slot.start);
    if (!demoSlots(start, new Date()).some((d) => d.toISOString() === slot.start))
      throw Error("SLOT_UNAVAILABLE");
    return { ...slot, mode: "demo" };
  },
};
/** Same UI contract; all Microsoft credentials and routing stay on the server. */
export function outlookBookingProvider(
  dossierId: string | null,
  contactId: string,
): BookingProvider {
  async function call(action: string, input: object, signal: AbortSignal) {
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token || !dossierId) throw Error("AUTH_REQUIRED");
    const response = await fetch("/api/booking", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, dossierId, contactId, ...input }),
    });
    const data = await response.json();
    if (!response.ok)
      throw Error(data.code === "SLOT_UNAVAILABLE" ? "SLOT_UNAVAILABLE" : "BOOKING_UNAVAILABLE");
    return data;
  }
  return {
    mode: "outlook",
    async availability(monday, signal) {
      const end = new Date(monday);
      end.setDate(end.getDate() + 5);
      const data = await call(
        "availability",
        { from: monday.toISOString(), to: end.toISOString() },
        signal,
      );
      if (
        !Array.isArray(data.slots) ||
        data.slots.some(
          (s: BookingSlot) =>
            !Number.isFinite(Date.parse(s.start)) || !Number.isFinite(Date.parse(s.end)),
        )
      )
        throw Error("BOOKING_UNAVAILABLE");
      return data.slots;
    },
    async reserve(slot, signal) {
      const data = await call("reserve", { slot }, signal);
      if (data.mode !== "outlook" || data.start !== slot.start || data.end !== slot.end)
        throw Error("BOOKING_UNAVAILABLE");
      return data;
    },
  };
}
