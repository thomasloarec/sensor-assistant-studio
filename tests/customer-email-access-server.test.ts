import { describe, expect, test } from "bun:test";
import {
  handleCustomerAccess,
  validateGlb,
  validatePendingSnapshot,
  type CustomerDependencies,
} from "../src/lib/leadmagnet/customer-access.server";
import { createDossier } from "../src/lib/leadmagnet/dossier";
import { buildSnapshot, submissionBinding } from "../src/lib/leadmagnet/submission";
import { INITIAL_NDA } from "../src/lib/leadmagnet/nda";
import { createHash } from "node:crypto";
import { Blob } from "node:buffer";
import { ReadableStream } from "node:stream/web";

const site = "https://sensor.example.invalid";
const user = {
  id: "10000000-0000-4000-8000-000000000001",
  email: "customer@example.invalid",
  email_confirmed_at: new Date().toISOString(),
  is_anonymous: false,
};
function fixture(options: { mailError?: boolean; denyRate?: boolean; authError?: boolean } = {}) {
  const events: { kind: string; value: any }[] = [];
  const stored = new Map<string, Uint8Array>();
  let fileInfo: any;
  const deps = {
    config: {
      url: "https://backend.example.invalid",
      key: "public",
      secret: "server-only",
      site,
      rateSecret: "x".repeat(32),
    },
    admin: {
      rpc: async (_name: string, input: any) => {
        events.push({ kind: input.p_action, value: input.p_args });
        if (input.p_action === "rate") return { data: { allowed: !options.denyRate }, error: null };
        if (input.p_action === "save")
          return { data: { id: input.p_args.id, expires_at: "2026-11-04T00:00:00Z" }, error: null };
        if (input.p_action === "reserve_file") {
          fileInfo = input.p_args.file;
          return { data: { verified: false }, error: null };
        }
        if (input.p_action === "file_info") return { data: fileInfo, error: null };
        return { data: { pending: [] }, error: null };
      },
      storage: {
        from: () => ({
          info: async (path: string) => ({ data: stored.has(path) ? {} : null, error: null }),
          createSignedUploadUrl: async (path: string, options: any) => {
            events.push({ kind: "upload_grant", value: { path, ...options } });
            return { data: { token: "temporary-upload-token" }, error: null };
          },
          upload: async (path: string, bytes: Uint8Array) => {
            stored.set(path, bytes);
            return { error: null };
          },
          download: async (path: string) => ({
            data: stored.has(path) ? new Blob([stored.get(path)!]) : null,
            error: null,
          }),
        }),
      },
    },
    publicClient: {
      auth: {
        signInWithOtp: async (input: any) => {
          events.push({ kind: "email", value: input });
          return { error: options.mailError ? new Error("private mail diagnostic") : null };
        },
        getUser: async (token: string) => {
          events.push({ kind: "authenticate", value: token });
          return { data: { user }, error: options.authError ? new Error("bad token") : null };
        },
      },
    },
  } as unknown as CustomerDependencies;
  return { deps, events, stored };
}
// UI suites replace the global Request with Happy DOM's browser implementation,
// which strips Origin. Model the server request explicitly, without browser globals.
function rawRequest(body: string, headers: Record<string, string> = {}): Request {
  const values = new Map(
    Object.entries({ origin: site, "content-type": "application/json", ...headers }),
  );
  return {
    method: "POST",
    headers: { get: (key: string) => values.get(key.toLowerCase()) ?? null },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    }),
  } as unknown as Request;
}
const request = (body: any, headers: Record<string, string> = {}) =>
  rawRequest(JSON.stringify(body), headers);
async function snapshot() {
  const dossier = createDossier();
  dossier.requirements[0]!.value = "Detect a door";
  dossier.requirements[0]!.state = "confirmed";
  dossier.business.contactEmail = user.email;
  dossier.business.industry = "Security";
  dossier.business.industryConfirmed = true;
  dossier.business.siteCity = "Paris";
  dossier.business.siteCountry = "FR";
  dossier.business.undefinedFields = [
    "annualVolume",
    "projectPhase",
    "seriesStartDate",
    "seriesDurationYears",
  ];
  const input = {
    dossier,
    nda: INITIAL_NDA,
    consents: [],
    reviewAcknowledged: false,
    additionalConstraints: "",
    serverRevision: 1,
  };
  const binding = await submissionBinding(input);
  return buildSnapshot({
    ...input,
    consents: [
      {
        kind: "supabase_dossier",
        binding,
        grantedAt: new Date().toISOString(),
        contentSummary: "Send to Standex",
        recipients: ["Standex"],
      },
    ],
  });
}
function glb(uri?: string) {
  let json = JSON.stringify({ asset: { version: "2.0" }, buffers: uri ? [{ uri }] : [] });
  while (json.length % 4) json += " ";
  const data = new Uint8Array(20 + json.length);
  const view = new DataView(data.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, data.length, true);
  view.setUint32(12, json.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  data.set(new TextEncoder().encode(json), 20);
  return data;
}
describe("customer access HTTP boundary", () => {
  test("cross-origin requests stop before database or email", async () => {
    const f = fixture();
    expect(
      (
        await handleCustomerAccess(
          request({ action: "login", email: user.email }, { origin: "https://evil.invalid" }),
          f.deps,
        )
      ).status,
    ).toBe(403);
    expect(f.events).toHaveLength(0);
  });
  test("submission persists before requesting email and returns no session or secret", async () => {
    const f = fixture();
    const id = crypto.randomUUID();
    const r = await handleCustomerAccess(
      request({
        action: "submit",
        id,
        receipt: crypto.randomUUID() + crypto.randomUUID(),
        snapshot: await snapshot(),
      }),
      f.deps,
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ id, emailRequested: true });
    expect(f.events.findIndex((x) => x.kind === "save")).toBeLessThan(
      f.events.findIndex((x) => x.kind === "email"),
    );
    expect(f.events.find((x) => x.kind === "email")!.value.options).toEqual({
      shouldCreateUser: true,
      emailRedirectTo: site + "/account?pending=" + id,
    });
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  test("mail failure leaves a saved receipt and does not expose provider diagnostics", async () => {
    const f = fixture({ mailError: true });
    const id = crypto.randomUUID();
    const r = await handleCustomerAccess(
      request({
        action: "submit",
        id,
        receipt: crypto.randomUUID() + crypto.randomUUID(),
        snapshot: await snapshot(),
      }),
      f.deps,
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ id, emailRequested: false });
    expect(f.events.some((x) => x.kind === "save")).toBe(true);
  });
  test("returning login does not create accounts and has a generic response", async () => {
    for (const mailError of [true, false]) {
      const f = fixture({ mailError });
      const r = await handleCustomerAccess(
        request({ action: "login", email: " Customer@EXAMPLE.INVALID " }),
        f.deps,
      );
      expect(await r.json()).toEqual({ emailRequested: true });
      expect(f.events.find((x) => x.kind === "email")!.value.options.shouldCreateUser).toBe(false);
    }
  });
  test("claim uses Auth user identity, ignoring forged caller IDs and emails", async () => {
    const f = fixture();
    await handleCustomerAccess(
      request(
        {
          action: "claim",
          id: crypto.randomUUID(),
          user_id: "victim",
          email: "victim@example.invalid",
        },
        { authorization: "Bearer real-token" },
      ),
      f.deps,
    );
    expect(f.events.find((x) => x.kind === "claim")!.value.user_id).toBe(user.id);
    expect(f.events.find((x) => x.kind === "authenticate")!.value).toBe("real-token");
  });
  test("invalid and missing sessions cannot list pending work", async () => {
    for (const headers of [{}, { authorization: "Bearer forged" }]) {
      const f = fixture({ authError: true });
      expect(
        (await handleCustomerAccess(request({ action: "list" }, headers), f.deps)).status,
      ).toBe(401);
      expect(f.events.some((x) => x.kind === "list")).toBe(false);
    }
  });
  test("rate limits stop all downstream persistence and email", async () => {
    const f = fixture({ denyRate: true });
    expect(
      (await handleCustomerAccess(request({ action: "register", email: user.email }), f.deps))
        .status,
    ).toBe(429);
    expect(f.events.map((e) => e.kind)).toEqual(["rate"]);
  });
  test("oversized streamed JSON is rejected before parsing", async () => {
    const f = fixture();
    const r = rawRequest("x".repeat(2 * 1024 * 1024 + 1));
    expect((await handleCustomerAccess(r, f.deps)).status).toBe(413);
  });
  test("NDA and existing-project claims cannot enter the anonymous path", async () => {
    const s = await snapshot();
    await expect(validatePendingSnapshot({ ...s, ndaStatus: "in_force" })).rejects.toThrow();
    await expect(
      validatePendingSnapshot({
        ...s,
        binding: { ...s.binding, serverDossierId: crypto.randomUUID() },
      }),
    ).rejects.toThrow();
  });
  test("GLB validates headers, bounds and rejects external resource fetches", () => {
    expect(() => validateGlb(glb())).not.toThrow();
    expect(() => validateGlb(glb("https://evil.invalid/model.bin"))).toThrow("BAD_FILE");
    expect(() => validateGlb(new Uint8Array(20))).toThrow("BAD_FILE");
    expect(() => validateGlb(glb().slice(0, -1))).toThrow("BAD_FILE");
  });
  test("preparation rereads stored bytes before marking a file verified", async () => {
    const f = fixture();
    const id = crypto.randomUUID();
    const bytes = glb();
    const identity = { id, receipt: crypto.randomUUID() + crypto.randomUUID(), email: user.email };
    const r = await handleCustomerAccess(
      request({
        action: "prepare_file",
        ...identity,
        ndaRequired: false,
        consent: true,
        fileName: "example.glb",
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      }),
      f.deps,
    );
    expect(r.status).toBe(200);
    expect((await r.json()).uploadToken).toBe("temporary-upload-token");
    expect(f.events.find((x) => x.kind === "upload_grant")!.value.upsert).toBe(false);
    expect(f.events.some((x) => x.kind === "file_verified")).toBe(false);
    expect(
      (await handleCustomerAccess(request({ action: "verify_file", ...identity }), f.deps)).status,
    ).toBe(400);
    f.stored.set(id + "/pending/model.glb", bytes);
    expect(
      (await handleCustomerAccess(request({ action: "verify_file", ...identity }), f.deps)).status,
    ).toBe(200);
    expect(f.events.some((x) => x.kind === "file_verified")).toBe(true);
    expect(f.events.some((x) => x.kind === "email")).toBe(false);
  });
});
