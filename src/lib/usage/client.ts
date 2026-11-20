import { supabase } from "@/lib/standex/supabase";
import { getLocale } from "@/lib/i18n/core";
import { UUID, safeProps, type UsageEvent, type UsageProps, type UsageEntry } from "./model";
export const USAGE_CHOICE_KEY = "standex.usage.choice.v1";
const CHOICE = USAGE_CHOICE_KEY,
  VISITOR = "standex.usage.visitor.v1",
  SESSION = "standex.usage.session.v1",
  OUTBOX = "standex.usage.outbox.v1";
const listeners = new Set<() => void>();
let choice: "yes" | "no" | null = null,
  loaded = false,
  flow: string = crypto.randomUUID(),
  queue: { session: Session; event: UsageEntry }[] = [],
  timer: ReturnType<typeof setTimeout> | undefined,
  sending: Promise<void> | null = null,
  lastTime = 0;
type Session = { id: string; token: string; visitor: string; last: number };
let session: Session | null = null;
let excluded = false;
export function usageAllowedHost(host = typeof location === "undefined" ? "" : location.hostname) {
  return host === "sensor-pal-tester.lovable.app";
}
export function usageChoice() {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    try {
      if (new URLSearchParams(location.search).get("usage") === "off") {
        sessionStorage.setItem("standex.usage.internal", "true");
        excludeUsage();
      }
      const v = localStorage.getItem(CHOICE);
      choice = v === "yes" || v === "no" ? v : null;
    } catch {}
  }
  return choice;
}
export function subscribeUsage(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function setUsageChoice(value: "yes" | "no") {
  choice = value;
  loaded = true;
  try {
    localStorage.setItem(CHOICE, value);
    if (value === "no") {
      localStorage.removeItem(VISITOR);
      sessionStorage.removeItem(SESSION);
      sessionStorage.removeItem(OUTBOX);
    }
  } catch {}
  if (value === "no") {
    queue = [];
    session = null;
  }
  listeners.forEach((fn) => fn());
  if (value === "yes") trackUsage("visit");
}
export function excludeUsage() {
  excluded = true;
  queue = [];
  session = null;
  try {
    sessionStorage.removeItem(SESSION);
    sessionStorage.removeItem(OUTBOX);
  } catch {}
}
export function setUsageFlow(id: string) {
  flow = id;
}
function current(): Session | null {
  if (
    !supabase ||
    typeof window === "undefined" ||
    !usageAllowedHost() ||
    excluded ||
    usageChoice() !== "yes"
  )
    return null;
  try {
    if (
      new URLSearchParams(location.search).get("usage") === "off" ||
      sessionStorage.getItem("standex.usage.internal") === "true"
    ) {
      sessionStorage.setItem("standex.usage.internal", "true");
      excludeUsage();
      return null;
    }
  } catch {}
  if (!session) {
    try {
      const raw = JSON.parse(sessionStorage.getItem(SESSION) ?? "null");
      if (
        raw &&
        UUID.test(raw.id) &&
        UUID.test(raw.token) &&
        UUID.test(raw.visitor) &&
        typeof raw.last === "number"
      )
        session = raw;
    } catch {}
  }
  if (!session || Date.now() - session.last > 30 * 60_000) {
    let visitor: string = crypto.randomUUID();
    try {
      const stored = JSON.parse(localStorage.getItem(VISITOR) ?? "null");
      if (stored && stored.expires > Date.now() && UUID.test(stored.id)) visitor = stored.id;
      localStorage.setItem(
        VISITOR,
        JSON.stringify({
          id: visitor,
          expires: stored?.expires > Date.now() ? stored.expires : Date.now() + 90 * 86400_000,
        }),
      );
    } catch {}
    session = { id: crypto.randomUUID(), token: crypto.randomUUID(), visitor, last: Date.now() };
  }
  session.last = Date.now();
  try {
    sessionStorage.setItem(SESSION, JSON.stringify(session));
  } catch {}
  return session;
}
const dedup = new Set<string>();
let restored = false;
function persistQueue() {
  try {
    sessionStorage.setItem(OUTBOX, JSON.stringify(queue));
  } catch {}
}
function restoreQueue() {
  if (restored) return;
  restored = true;
  try {
    const saved = JSON.parse(sessionStorage.getItem(OUTBOX) ?? "[]");
    if (Array.isArray(saved))
      queue = saved
        .filter(
          (x) =>
            UUID.test(x?.session?.id) &&
            UUID.test(x?.session?.token) &&
            UUID.test(x?.session?.visitor) &&
            Date.parse(x?.event?.at) > Date.now() - 23 * 3600_000,
        )
        .slice(0, 100);
  } catch {}
}
export function trackUsage(name: UsageEvent, props: UsageProps = {}, once = false) {
  const s = current();
  if (!s) return;
  restoreQueue();
  if (name !== "visit") trackUsage("visit", {}, true);
  if (!["visit", "heartbeat", "project_started"].includes(name))
    trackUsage("project_started", {}, true);
  const p = safeProps(props),
    key = JSON.stringify([s.id, flow, name, p]);
  if (once && dedup.has(key)) return;
  dedup.add(key);
  if (queue.length >= 100) return;
  lastTime = Math.max(Date.now(), lastTime + 1);
  queue.push({
    session: { ...s },
    event: { id: crypto.randomUUID(), name, at: new Date(lastTime).toISOString(), flow, ...p },
  });
  persistQueue();
  if (!timer)
    timer = setTimeout(() => {
      timer = undefined;
      void flushUsage();
    }, 400);
}
export async function flushUsage() {
  if (sending) return sending;
  const s = queue[0]?.session;
  if (!s || !supabase || choice !== "yes" || excluded) return;
  const batch = queue.filter((x) => x.session.id === s.id).slice(0, 50);
  const ids = new Set(batch.map((x) => x.event.id));
  queue = queue.filter((x) => !ids.has(x.event.id));
  sending = (async () => {
    try {
      const { error } = await supabase!.rpc("product_usage_ingest", {
        _session: s.id,
        _token: s.token,
        _visitor: s.visitor,
        _locale: getLocale(),
        _device: matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop",
        _events: batch.map((x) => x.event),
      });
      if (
        error &&
        !/BAD_|NOT_ALLOWED|RATE_LIMITED|invalid input/.test(error.message) &&
        choice === "yes" &&
        !excluded
      )
        queue = [...batch, ...queue].slice(0, 100);
    } catch {
      if (choice === "yes" && !excluded) queue = [...batch, ...queue].slice(0, 100);
    } finally {
      sending = null;
      persistQueue();
    }
  })();
  return sending;
}
/** Separate proof-checked RPC: the public event endpoint cannot declare a transmission. */
export async function bindUsageSubmission(dossierId: string, receipt?: string) {
  const s = current(),
    submissionFlow = flow;
  if (!s || !supabase) return;
  try {
    // Drain an already-running batch as well as the batch containing the attempt.
    for (let i = 0; i < 4; i++) {
      await flushUsage();
      if (!queue.length) break;
    }
    if (choice !== "yes" || excluded) return;
    let hash: string | null = null;
    if (receipt) {
      const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(receipt));
      hash = Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
    }
    await supabase.rpc("product_usage_bind", {
      _session: s.id,
      _token: s.token,
      _flow: submissionFlow,
      _dossier: dossierId,
      _receipt_hash: hash,
    });
  } catch {
    /* Measurement never changes submission success. */
  }
}
