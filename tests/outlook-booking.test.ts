import { ReadableStream } from "node:stream/web";
import { describe, test, expect } from "bun:test";
import {
  createOutlookGateway,
  handleBooking,
  withinOfficeHours,
  outlookConfig,
  type OutlookConfig,
  type BookingDependencies,
  BookingError,
  resolveBookingContext,
} from "../src/lib/leadmagnet/booking.server";
const TestRequest = class {
  method: string;
  headers: { get: (key: string) => string | null };
  body: ReadableStream;
  constructor(url: string, init: any) {
    this.method = init.method;
    this.headers = { get: (key) => init.headers[key] ?? null };
    this.body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(init.body));
        c.close();
      },
    });
  }
} as unknown as typeof Request;
const id = "10000000-0000-4000-8000-000000000001",
  contactId = "20000000-0000-4000-8000-000000000002";
const mailbox = {
  mailbox: "sales@example.invalid",
  timeZone: "Europe/Berlin",
  days: [1, 2, 3, 4, 5],
  windows: [
    [540, 720],
    [840, 1020],
  ] as [number, number][],
};
const config: OutlookConfig = {
  tenant: id,
  client: id,
  secret: "test-only",
  site: "https://sensor.example.invalid",
  supabaseUrl: "https://backend.example.invalid",
  supabaseKey: "public",
  mailboxes: { [contactId]: mailbox },
};
const nextMonday = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
  d.setUTCHours(8, 0, 0, 0);
  return d;
};
describe("Outlook connection boundary", () => {
  test("reads real free/busy and excludes busy intervals and office closures", async () => {
    const calls: { url: string; body: any }[] = [];
    const gateway = createOutlookGateway(config, (async (url, init) => {
      calls.push({
        url: String(url),
        body: init?.body instanceof URLSearchParams ? {} : JSON.parse(String(init?.body)),
      });
      return new Response(
        JSON.stringify(
          String(url).includes("oauth2")
            ? { access_token: "fake", expires_in: 3600 }
            : { value: [{ availabilityView: "00220000" }] },
        ),
      );
    }) as typeof fetch);
    const from = new Date("2027-01-11T08:00:00Z"),
      to = new Date("2027-01-11T10:00:00Z");
    const slots = await gateway.availability(mailbox, from, to, new Date("2027-01-10"));
    expect(slots.map((s) => s.start)).toEqual([
      "2027-01-11T08:00:00.000Z",
      "2027-01-11T09:00:00.000Z",
      "2027-01-11T09:30:00.000Z",
    ]);
    expect(calls[1]!.body.schedules).toEqual([mailbox.mailbox]);
    expect(withinOfficeHours(new Date("2027-01-11T12:00:00Z"), mailbox)).toBe(false);
    expect(withinOfficeHours(new Date("2027-07-12T07:00:00Z"), mailbox)).toBe(true);
    expect(withinOfficeHours(new Date("2027-01-10T10:00:00Z"), mailbox)).toBe(false);
  });
  test("busy slot is rechecked before writing and Graph errors never turn into success", async () => {
    let writes = 0;
    const gateway = createOutlookGateway(config, (async (url) => {
      if (String(url).endsWith("/events")) writes++;
      return new Response(
        JSON.stringify(
          String(url).includes("oauth2")
            ? { access_token: "fake" }
            : { value: [{ availabilityView: "22" }] },
        ),
      );
    }) as typeof fetch);
    const start = nextMonday(),
      slot = { start: start.toISOString(), end: new Date(+start + 1800000).toISOString() };
    await expect(gateway.reserve(mailbox, slot, id, "customer@example.invalid")).rejects.toThrow(
      "SLOT_UNAVAILABLE",
    );
    expect(writes).toBe(0);
  });
  test("creates invitation only after recheck with deterministic transaction identity", async () => {
    const bodies: any[] = [];
    const gateway = createOutlookGateway(config, (async (url, init) => {
      if (String(url).endsWith("/events")) {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ id: "event" }), { status: 201 });
      }
      return new Response(
        JSON.stringify(
          String(url).includes("oauth2")
            ? { access_token: "fake" }
            : { value: [{ availabilityView: "00" }] },
        ),
      );
    }) as typeof fetch);
    const start = nextMonday(),
      slot = { start: start.toISOString(), end: new Date(+start + 1800000).toISOString() };
    expect((await gateway.reserve(mailbox, slot, id, "customer@example.invalid")).mode).toBe(
      "outlook",
    );
    await gateway.reserve(mailbox, slot, id, "customer@example.invalid");
    expect(bodies[0].transactionId).toBe(bodies[1].transactionId);
    expect(bodies[0].attendees[0].emailAddress.address).toBe("customer@example.invalid");
  });
  test("server rejects missing authentication, foreign origins and forged routing before calendar access", async () => {
    let reads = 0;
    const deps: BookingDependencies = {
      config,
      resolve: async () => ({ email: "verified@example.invalid", contactId }),
      gateway: {
        availability: async () => {
          reads++;
          return [];
        },
        reserve: async (s) => {
          throw Error("unexpected");
        },
      },
    };
    const request = (patch: object = {}, origin = config.site, auth = "Bearer user") =>
      new TestRequest(config.site + "/api/booking", {
        method: "POST",
        headers: { origin, authorization: auth },
        body: JSON.stringify({
          action: "availability",
          dossierId: id,
          contactId,
          from: nextMonday().toISOString(),
          to: new Date(+nextMonday() + 3600000).toISOString(),
          ...patch,
        }),
      });
    expect((await handleBooking(request({}, config.site, ""), deps)).status).toBe(401);
    expect((await handleBooking(request({}, "https://other.invalid"), deps)).status).toBe(403);
    expect((await handleBooking(request({ contactId: id }), deps)).status).toBe(403);
    expect(reads).toBe(0);
    expect((await handleBooking(request(), deps)).status).toBe(200);
    expect(reads).toBe(1);
  });
  test("server does not use client email or mailbox to create invitations", async () => {
    let seen = "";
    const deps: BookingDependencies = {
      config,
      resolve: async () => ({ email: "verified@example.invalid", contactId }),
      gateway: {
        availability: async () => [],
        reserve: async (mailbox, slot, dossier, email) => {
          seen = email;
          return { ...slot, mode: "outlook" };
        },
      },
    };
    const start = nextMonday();
    const slot = { start: start.toISOString(), end: new Date(+start + 1800000).toISOString() };
    const request = new TestRequest(config.site + "/api/booking", {
      method: "POST",
      headers: { origin: config.site, authorization: "Bearer user" },
      body: JSON.stringify({
        action: "reserve",
        dossierId: id,
        contactId,
        slot,
        email: "forged@example.invalid",
        mailbox: "forged@example.invalid",
      }),
    });
    expect((await handleBooking(request, deps)).status).toBe(200);
    expect(seen).toBe("verified@example.invalid");
  });
});
