import { hasConfirmedIndustry } from "./industries";
/** Server-only boundary. Never import from a browser component. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, createHmac } from "node:crypto";
import { dossierHash } from "./dossier";
import { parseServerSnapshot } from "./dossier-io";
import type { SubmissionSnapshot } from "./submission";
import { missingBusinessContext } from "./submission";
import { sameBinding } from "./privacy";

const MAX_FILE = 30 * 1024 * 1024;
const MAX_JSON = 2 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export class CustomerAccessError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
  }
}
const fail = (code: string, status = 400): never => {
  throw new CustomerAccessError(code, status);
};
export function normalizeCustomerEmail(value: unknown): string {
  if (typeof value !== "string") return fail("BAD_EMAIL");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("BAD_EMAIL");
  return email;
}
export function validateGlb(bytes: Uint8Array): void {
  if (bytes.length < 20 || bytes.length > MAX_FILE) fail("BAD_FILE");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.length
  )
    fail("BAD_FILE");
  const jsonLength = view.getUint32(12, true);
  if (
    view.getUint32(16, true) !== 0x4e4f534a ||
    jsonLength > MAX_JSON ||
    jsonLength + 20 > bytes.length ||
    jsonLength % 4
  )
    fail("BAD_FILE");
  try {
    const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
    if (gltf.asset?.version !== "2.0") fail("BAD_FILE");
    // Prevent later viewers from fetching external resources from a submitted model.
    for (const resource of [...(gltf.buffers ?? []), ...(gltf.images ?? [])])
      if (resource.uri) fail("BAD_FILE");
    let offset = 20 + jsonLength;
    while (offset < bytes.length) {
      if (offset + 8 > bytes.length) fail("BAD_FILE");
      const size = view.getUint32(offset, true);
      if (
        size % 4 ||
        offset + 8 + size > bytes.length ||
        view.getUint32(offset + 4, true) !== 0x004e4942
      )
        fail("BAD_FILE");
      offset += 8 + size;
    }
  } catch {
    fail("BAD_FILE");
  }
}
export async function validatePendingSnapshot(raw: unknown): Promise<SubmissionSnapshot> {
  if (!raw || typeof raw !== "object") return fail("BAD_INPUT");
  const s = raw as SubmissionSnapshot;
  if (
    s.ndaStatus !== "not_required" ||
    !s.binding ||
    s.binding.serverDossierId !== null ||
    s.binding.revision !== 1
  )
    fail("BAD_INPUT");
  const parsed = parseServerSnapshot(s.dto);
  if (!parsed.ok) return fail("BAD_INPUT");
  if (missingBusinessContext(parsed.dossier).length) fail("BAD_INPUT");
  if (!hasConfirmedIndustry(parsed.dossier.business)) fail("INDUSTRY_REQUIRED");
  if (
    "internalNotes" in s.dto ||
    !Array.isArray(s.consents) ||
    !Array.isArray(s.transferredFiles) ||
    s.transferredFiles.length > 1
  )
    fail("BAD_INPUT");
  const hash = await dossierHash(s.dto);
  if (s.hash !== hash || s.binding.contentHash !== hash) fail("BAD_INPUT");
  const consent = s.consents.find((c) => c.kind === "supabase_dossier");
  if (!consent || !sameBinding(consent.binding, s.binding) || !consent.contentSummary?.trim())
    fail("BAD_INPUT");
  normalizeCustomerEmail(s.dto.business.contactEmail);
  if (
    !s.dto.requirements.some(
      (r) =>
        r.key === "detection_goal" &&
        r.value.trim() &&
        ["confirmed", "hypothesis"].includes(r.state),
    )
  )
    fail("BAD_INPUT");
  return s;
}

type Config = {
  url: string;
  key: string;
  secret: string;
  site: string;
  rateSecret: string;
  trustedIpHeader?: string | undefined;
};
export function customerServerConfig(): Config | null {
  const url = process.env["STANDEX_SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  const secret =
    process.env["standex_supabase_secret_key"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const site = process.env["STANDEX_SITE_URL"];
  const rateSecret = process.env["CUSTOMER_RATE_LIMIT_SECRET"];
  if (
    process.env["CUSTOMER_EMAIL_ACCESS_ENABLED"] !== "true" ||
    !url ||
    !key ||
    !secret ||
    !site ||
    !rateSecret ||
    rateSecret.length < 32
  )
    return null;
  try {
    if (new URL(url).protocol !== "https:" || new URL(site).protocol !== "https:") return null;
    return {
      url,
      key,
      secret,
      site: new URL(site).origin,
      rateSecret,
      trustedIpHeader: process.env["CUSTOMER_TRUSTED_IP_HEADER"],
    };
  } catch {
    return null;
  }
}
export type CustomerDependencies = {
  config: Config;
  admin: SupabaseClient;
  publicClient: SupabaseClient;
};
export function createCustomerDependencies(config: Config): CustomerDependencies {
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  };
  return {
    config,
    admin: createClient(config.url, config.secret, options),
    publicClient: createClient(config.url, config.key, options),
  };
}
async function boundedBody(request: Request, limit: number): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length")) > limit) fail("TOO_LARGE", 413);
  const reader = request.body?.getReader();
  if (!reader) fail("BAD_INPUT");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader!.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader!.cancel();
      fail("TOO_LARGE", 413);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
export async function handleCustomerAccess(
  request: Request,
  supplied?: CustomerDependencies,
): Promise<Response> {
  const reply = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  if (request.method !== "POST") return reply({ code: "METHOD_NOT_ALLOWED" }, 405);
  const config = supplied?.config ?? customerServerConfig();
  if (!config) return reply({ code: "UNAVAILABLE" }, 503);
  if (request.headers.get("origin") !== config.site) return reply({ code: "NOT_ALLOWED" }, 403);
  const { admin, publicClient } = supplied ?? createCustomerDependencies(config);
  const rpc = async (action: string, args: Record<string, unknown>): Promise<any> => {
    const { data, error } = await admin.rpc("lead_customer_access", {
      p_action: action,
      p_args: args,
    });
    if (error) {
      if (["EXPIRED", "SEALED_SUBMISSION", "NOT_ALLOWED"].includes(error.message))
        fail(error.message, 409);
      fail("UNAVAILABLE", 503);
    }
    return data;
  };
  const rate = async (key: string, limit: number) => {
    const digest = createHmac("sha256", config.rateSecret).update(key).digest("hex");
    if (!(await rpc("rate", { key: digest, limit })).allowed) fail("RATE_LIMITED", 429);
  };
  try {
    // Shared database counters apply across instances. Only trust a header configured
    // and overwritten by the hosting proxy; otherwise use the conservative global cap.
    await rate("global", 200);
    if (config.trustedIpHeader)
      await rate("ip:" + (request.headers.get(config.trustedIpHeader) ?? "unknown"), 30);
    const bytes = await boundedBody(request, MAX_JSON);
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== "object") fail("BAD_INPUT");
    if (body.action === "list" || body.action === "claim") {
      const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
      if (!token || token.length > 8192) fail("AUTH_REQUIRED", 401);
      const { data, error } = await publicClient.auth.getUser(token);
      if (error || !data.user?.email_confirmed_at || data.user.is_anonymous)
        fail("AUTH_REQUIRED", 401);
      if (body.action === "claim" && !UUID.test(body.id)) fail("BAD_INPUT");
      return reply(await rpc(body.action, { user_id: data.user!.id, id: body.id }));
    }
    if (body.action === "login" || body.action === "register") {
      const email = normalizeCustomerEmail(body.email);
      await rate("email:" + email, 8);
      // Always the same response, including unknown accounts on the returning-user path.
      await publicClient.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: body.action === "register",
          emailRedirectTo: config.site + "/account",
        },
      });
      return reply({ emailRequested: true });
    }
    if (
      !UUID.test(body.id) ||
      typeof body.receipt !== "string" ||
      !/^[a-f0-9-]{72}$/i.test(body.receipt)
    )
      fail("BAD_INPUT");
    const snapshot = body.action === "submit" ? await validatePendingSnapshot(body.snapshot) : null;
    const email = normalizeCustomerEmail(snapshot?.dto.business.contactEmail ?? body.email);
    await rate("email:" + email, 8);
    const args = { id: body.id, email, receipt_hash: sha(body.receipt) };
    if (body.action === "prepare_file") {
      await rate("file-reservations", 20);
      if (body.ndaRequired !== false || body.consent !== true) fail("BAD_INPUT");
      if (
        typeof body.fileName !== "string" ||
        !body.fileName.toLowerCase().endsWith(".glb") ||
        body.fileName.length > 255 ||
        !Number.isInteger(body.bytes) ||
        body.bytes < 20 ||
        body.bytes > MAX_FILE ||
        typeof body.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(body.sha256)
      )
        fail("BAD_FILE");
      const info = {
        path: body.id + "/pending/model.glb",
        fileName: body.fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 180),
        bytes: body.bytes,
        sha256: body.sha256,
        mimeType: "model/gltf-binary",
      };
      const reservation = await rpc("reserve_file", { ...args, file: info });
      if (reservation.verified) return reply({ file: info });
      const bucket = admin.storage.from("lead-design-files");
      const existing = await bucket.info(info.path);
      if (existing.data) return reply({ file: info });
      const { data, error } = await bucket.createSignedUploadUrl(info.path, { upsert: false });
      if (error || !data) fail("UNAVAILABLE", 503);
      return reply({ file: info, uploadToken: data!.token });
    }
    if (body.action === "verify_file") {
      const info = await rpc("file_info", args);
      const { data: stored, error } = await admin.storage
        .from("lead-design-files")
        .download(info.path);
      if (error || !stored || stored.size !== info.bytes || stored.size > MAX_FILE)
        fail("BAD_FILE");
      const fileBytes = new Uint8Array(await stored!.arrayBuffer());
      validateGlb(fileBytes);
      if (sha(fileBytes) !== info.sha256) fail("BAD_FILE");
      await rpc("file_verified", args);
      return reply({ file: info });
    }
    if (body.action !== "submit" || !snapshot) fail("BAD_INPUT");
    const staged = await rpc("save", {
      ...args,
      snapshot: snapshot!.dto,
      content_hash: snapshot!.hash,
      consents: snapshot!.consents,
    });
    // Persist first. An email outage must not lose the submitted snapshot.
    let emailRequested = false;
    try {
      const { error } = await publicClient.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: config.site + "/account?pending=" + body.id,
        },
      });
      emailRequested = !error;
    } catch {
      /* The saved receipt remains available; no provider error is exposed. */
    }
    return reply({ ...staged, emailRequested });
  } catch (error) {
    if (error instanceof CustomerAccessError) return reply({ code: error.code }, error.status);
    return reply({ code: "UNAVAILABLE" }, 503);
  }
}
