import { describe, expect, test } from "bun:test";
import { demoDays, demoSlots } from "../src/components/leadmagnet/booking-dialog";
describe("demo booking calendar", () => {
  test("only future weekday slots, including month changes", () => {
    const now = new Date(2026, 8, 30, 15, 35);
    const days = demoDays(now);
    expect(days).toHaveLength(10);
    expect(days[1]!.getMonth()).toBe(9);
    for (const day of days) {
      expect([0, 6]).not.toContain(day.getDay());
      expect(demoSlots(day, now).every(s => s > now)).toBe(true);
    }
    expect(demoSlots(days[0]!, now).map(s => s.getHours())).toEqual([16]);
    expect(demoSlots(days[0]!, new Date(2026, 8, 30, 16, 0))).toEqual([]);
  });
  test("weekend and invalid input never produce slots or hang", () => {
    expect(demoSlots(new Date(2026, 8, 19), new Date(2026, 8, 17))).toEqual([]);
    expect(demoDays(new Date(NaN))).toEqual([]);
    expect(demoDays(new Date(), Infinity)).toEqual([]);
    expect(demoDays(new Date(), 0)).toEqual([]);
  });
});
