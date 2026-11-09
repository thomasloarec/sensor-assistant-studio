/** Server-only Outlook adapter. No Microsoft token or mailbox reaches the browser. */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import type { BookingSlot } from "./booking-provider";
import type { DossierView } from "./supabase-adapter";
import type { ContactResult } from "./territories";
const HALF_HOUR = 30 * 60_000;
const AVAILABILITY_STEP = 15 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type OutlookMailbox = {
  mailbox: string;
  timeZone: string;
  days: number[];
  windows: [number, number][];
};
export type OutlookConfig = {
  tenant: string;
  client: string;
  secret: string;
  site: string;
  supabaseUrl: string;
  supabaseKey: string;
  mailboxes: Record<string, OutlookMailbox>;
};
export class BookingError extends Error {
  constructor(
    readonly code: string,
    readonly status = 503,
  ) {
    super(code);
  }
}
export function outlookConfig(env = process.env): OutlookConfig | null {
  const tenant = env["OUTLOOK_TENANT_ID"],
    client = env["OUTLOOK_CLIENT_ID"],
    secret = env["OUTLOOK_CLIENT_SECRET"];
  const site = env["STANDEX_SITE_URL"],
    supabaseUrl = env["STANDEX_SUPABASE_URL"],
    supabaseKey = env["SUPABASE_PUBLISHABLE_KEY"];
  if (
    !tenant ||
    !client ||
    !secret ||
    !site ||
    !supabaseUrl ||
    !supabaseKey ||
    !UUID.test(tenant) ||
    !UUID.test(client)
  )
    return null;
  try {
    if (new URL(site).protocol !== "https:" || new URL(supabaseUrl).protocol !== "https:")
      return null;
    const mailboxes: Record<string, OutlookMailbox> = JSON.parse(
      env["OUTLOOK_SALES_MAILBOXES"] ?? "{}",
    );
    for (const [id, m] of Object.entries(mailboxes)) {
      if (!UUID.test(id) || !m || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.mailbox) || !m.timeZone)
        return null;
      new Intl.DateTimeFormat("en", { timeZone: m.timeZone }).format();
      if (
        !Array.isArray(m.days) ||
        !m.days.length ||
        m.days.some((d) => !Number.isInteger(d) || d < 1 || d > 5)
      )
        return null;
      if (
        !Array.isArray(m.windows) ||
        !m.windows.length ||
        m.windows.some(
          (w) =>
            !Array.isArray(w) ||
            w.length !== 2 ||
            w.some((n) => !Number.isInteger(n) || n % 30 !== 0) ||
            w[0] < 0 ||
            w[1] > 1440 ||
            w[0] >= w[1],
        )
      )
        return null;
    }
    return {
      tenant,
      client,
      secret,
      site: new URL(site).origin,
      supabaseUrl,
      supabaseKey,
      mailboxes,
    };
  } catch {
    return null;
  }
}
export function withinOfficeHours(start: Date, mailbox: OutlookMailbox): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: mailbox.timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(start);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  const weekday = new Date(
    Date.UTC(Number(part("year")), Number(part("month")) - 1, Number(part("day"))),
  ).getUTCDay();
  const minutes = Number(part("hour")) * 60 + Number(part("minute"));
  return (
    minutes % 30 === 0 &&
    mailbox.days.includes(weekday) &&
    mailbox.windows.some(([a, b]) => minutes >= a && minutes + 30 <= b)
  );
}
export function validateRange(from: unknown, to: unknown, now: Date): [Date, Date] {
  const a = typeof from === "string" ? new Date(from) : new Date(NaN),
    b = typeof to === "string" ? new Date(to) : new Date(NaN);
  if (
    !Number.isFinite(a.getTime()) ||
    !Number.isFinite(b.getTime()) ||
    a.getTime() % AVAILABILITY_STEP ||
    b.getTime() % AVAILABILITY_STEP ||
    b <= a ||
    b.getTime() - a.getTime() > 8 * 86400_000 ||
    b <= now ||
    a.getTime() < now.getTime() - 7 * 86400_000 ||
    b.getTime() > now.getTime() + 370 * 86400_000
  )
    throw new BookingError("BAD_INPUT", 400);
  return [a, b];
}
export function createOutlookGateway(config: OutlookConfig, fetcher: typeof fetch = fetch) {
  let cached: { token: string; expires: number } | null = null;
  async function token() {
    if (cached && cached.expires > Date.now() + 60_000) return cached.token;
    const response = await fetcher(
      `https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0/token`,
      {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.client,
          client_secret: config.secret,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }),
      },
    );
    if (!response.ok) throw new BookingError("BOOKING_UNAVAILABLE");
    const data = await response.json();
    if (typeof data.access_token !== "string") throw new BookingError("BOOKING_UNAVAILABLE");
    cached = {
      token: data.access_token,
      expires: Date.now() + Math.min(Number(data.expires_in) || 300, 3600) * 1000,
    };
    return cached.token;
  }
  async function graph(mailbox: OutlookMailbox, path: string, body: object) {
    const response = await fetcher(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox.mailbox)}/${path}`,
      {
        method: "POST",
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${await token()}`,
          "Content-Type": "application/json",
          Prefer: 'outlook.timezone="UTC"',
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) throw new BookingError("BOOKING_UNAVAILABLE");
    return response.json();
  }
  const utc = (date: Date) => ({ dateTime: date.toISOString().slice(0, -1), timeZone: "UTC" });
  async function availability(
    mailbox: OutlookMailbox,
    from: Date,
    to: Date,
    now = new Date(),
  ): Promise<BookingSlot[]> {
    const data = await graph(mailbox, "calendar/getSchedule", {
      schedules: [mailbox.mailbox],
      startTime: utc(from),
      endTime: utc(to),
      availabilityViewInterval: 15,
    });
    const schedule = data.value?.[0];
    const view = schedule?.availabilityView;
    if (
      schedule?.error ||
      typeof view !== "string" ||
      view.length !== Math.ceil((to.getTime() - from.getTime()) / AVAILABILITY_STEP)
    )
      throw new BookingError("BOOKING_UNAVAILABLE");
    const slots: BookingSlot[] = [];
    for (let i = 0; i + 1 < view.length; i++) {
      const start = new Date(from.getTime() + i * AVAILABILITY_STEP),
        end = new Date(start.getTime() + HALF_HOUR);
      if (
        view[i] === "0" &&
        view[i + 1] === "0" &&
        start > now &&
        withinOfficeHours(start, mailbox)
      )
        slots.push({ start: start.toISOString(), end: end.toISOString() });
    }
    return slots;
  }
  return {
    availability,
    async reserve(mailbox: OutlookMailbox, slot: BookingSlot, dossierId: string, email: string) {
      const [from, to] = validateRange(slot.start, slot.end, new Date());
      if (
        to.getTime() - from.getTime() !== HALF_HOUR ||
        from <= new Date() ||
        !(await availability(mailbox, from, to)).length
      )
        throw new BookingError("SLOT_UNAVAILABLE", 409);
      const event = await graph(mailbox, "events", {
        subject: "Sensor Studio",
        start: utc(from),
        end: utc(to),
        showAs: "busy",
        body: { contentType: "text", content: `Sensor Studio project ${dossierId}` },
        attendees: [{ emailAddress: { address: email }, type: "required" }],
        transactionId: createHash("sha256")
          .update(`${dossierId}:${mailbox.mailbox}:${slot.start}`)
          .digest("hex"),
      });
      if (typeof event.id !== "string" || !event.id) throw new BookingError("BOOKING_UNAVAILABLE");
      return { ...slot, mode: "outlook" as const };
    },
  };
}
export type BookingContext = { email: string; contactId: string };
export async function resolveBookingContext(
  config: OutlookConfig,
  token: string,
  dossierId: string,
): Promise<BookingContext> {
  // User-scoped RPC keeps the existing dossier ownership rules. No service key.
  const client = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const user = await client.auth.getUser(token);
  if (
    user.error ||
    !user.data.user?.email_confirmed_at ||
    user.data.user.is_anonymous ||
    !user.data.user.email
  )
    throw new BookingError("AUTH_REQUIRED", 401);
  const view = await client.rpc("lead_client_view", { p_dossier: dossierId });
  if (view.error || !view.data) throw new BookingError("NOT_ALLOWED", 403);
  const data = view.data as DossierView;
  const revision = data.revisions.find((r) => r.revision === data.dossier.current_revision);
  const business = revision?.snapshot["business"] as Record<string, unknown> | undefined;
  if (!revision?.submitted_at || !business || typeof business["siteCountry"] !== "string")
    throw new BookingError("NOT_ALLOWED", 403);
  const routing = await client.rpc("lead_sales_contact_for_industry", {
    p_country: business["siteCountry"],
    p_city: business["siteCityId"] ?? null,
    p_industry: business["industry"] ?? null,
  });
  const result = routing.data as ContactResult | null;
  if (routing.error || result?.reason !== "assigned" || !result.contact?.id)
    throw new BookingError("NOT_ALLOWED", 403);
  return { email: user.data.user.email, contactId: result.contact.id };
}
export type BookingDependencies = {
  config: OutlookConfig;
  resolve: typeof resolveBookingContext;
  gateway: ReturnType<typeof createOutlookGateway>;
};
export async function handleBooking(
  request: Request,
  dependencies?: BookingDependencies,
): Promise<Response> {
  const reply = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  const config = dependencies?.config ?? outlookConfig();
  if (request.method !== "POST") return reply({ code: "METHOD_NOT_ALLOWED" }, 405);
  if (!config) return reply({ code: "BOOKING_UNAVAILABLE" }, 503);
  if (request.headers.get("origin") !== config.site) return reply({ code: "NOT_ALLOWED" }, 403);
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
    if (!token || token.length > 8192) throw new BookingError("AUTH_REQUIRED", 401);
    const reader = request.body?.getReader();
    if (!reader) throw new BookingError("BAD_INPUT", 400);
    let text = "";
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length > 4096) {
        await reader.cancel();
        throw new BookingError("BAD_INPUT", 413);
      }
    }
    const body = JSON.parse(text);
    if (
      !UUID.test(body.dossierId) ||
      !UUID.test(body.contactId) ||
      !["availability", "reserve"].includes(body.action)
    )
      throw new BookingError("BAD_INPUT", 400);
    const context = await (dependencies?.resolve ?? resolveBookingContext)(
      config,
      token,
      body.dossierId,
    );
    if (context.contactId !== body.contactId) throw new BookingError("NOT_ALLOWED", 403);
    const mailbox = config.mailboxes[context.contactId];
    if (!mailbox) throw new BookingError("BOOKING_UNAVAILABLE");
    const gateway = dependencies?.gateway ?? createOutlookGateway(config);
    if (body.action === "availability") {
      const [from, to] = validateRange(body.from, body.to, new Date());
      return reply({ slots: await gateway.availability(mailbox, from, to) });
    }
    if (!body.slot || typeof body.slot.start !== "string" || typeof body.slot.end !== "string")
      throw new BookingError("BAD_INPUT", 400);
    return reply(await gateway.reserve(mailbox, body.slot, body.dossierId, context.email));
  } catch (error) {
    return reply(
      { code: error instanceof BookingError ? error.code : "BOOKING_UNAVAILABLE" },
      error instanceof BookingError ? error.status : 503,
    );
  }
}
