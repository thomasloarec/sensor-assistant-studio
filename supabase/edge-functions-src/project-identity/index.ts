import { identityHandler, claudeProjectIdentity } from "./project-identity.server.ts";
const url = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
const model =
  Deno.env.get("ANTHROPIC_PROJECT_IDENTITY_MODEL") ??
  Deno.env.get("ANTHROPIC_MODEL") ??
  "claude-sonnet-4-5";
const origins = [
  "https://sensor-pal-tester.lovable.app",
  "https://id-preview--9aff67a3-e0d0-4a40-95e1-da809f7ff333.lovable.app",
];
// JWT verification is enabled at the gateway. Anonymous prospects use the project's
// public anon JWT; no sign-in or dossier access is required for this bounded service.
Deno.serve(
  identityHandler({
    origins,
    configured: () => Boolean(url && serviceKey && apiKey),
    generate: (input) => claudeProjectIdentity(input, apiKey!, model),
    allow: async (request) => {
      const hmacKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(serviceKey!),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
      for (const [value, isGlobal] of [
        ["global", true],
        ["ip:" + ip, false],
      ] as const) {
        const digest = await crypto.subtle.sign(
          "HMAC",
          hmacKey,
          new TextEncoder().encode("project-identity:" + value),
        );
        const key = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join(
          "",
        );
        const response = await fetch(url + "/rest/v1/rpc/lead_project_identity_rate", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            apikey: serviceKey!,
            Authorization: "Bearer " + serviceKey,
          },
          body: JSON.stringify({ p_key: key, p_global: isGlobal }),
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error("RATE_SERVICE_UNAVAILABLE");
        if ((await response.json()) !== true) return false;
      }
      return true;
    },
  }),
);
