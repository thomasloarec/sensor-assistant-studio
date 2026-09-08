// Fonction Edge Supabase `lead-verify-upload`.
//
// ÉTAT RÉEL (2026-09-08) : cette fonction est DÉJÀ DÉPLOYÉE et ACTIVE (v1,
// verify_jwt = true) sur le backend Standex existant yyobodalwtsqdyrqwkjk.
// Aucune copie ni redéploiement n'est nécessaire : ce fichier est la source de
// référence, identique au déploiement. Les secrets SUPABASE_URL /
// SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement
// par la plateforme ; aucun secret à transférer ailleurs. Un appel anonyme est
// refusé en 401, et la sonde de schéma répond ready=true en version 1.4.
//
// Historique : l'éditeur bloquant l'écriture sous `supabase/functions/`, la
// source a été déposée ici, puis déployée par root depuis ce contenu exact.
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return reply({ error: "METHOD_NOT_ALLOWED" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey || new URL(url).hostname !== "yyobodalwtsqdyrqwkjk.supabase.co") {
    return reply({ error: "NOT_CONFIGURED" }, 503);
  }
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return reply({ error: "UNAUTHENTICATED" }, 401);
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    // Validate the real user, never accept a decoded or client supplied identity.
    const { data: { user }, error: authError } = await caller.auth.getUser(authorization.replace(/^Bearer\s+/i, ""));
    if (authError || !user) return reply({ error: "UNAUTHENTICATED" }, 401);
    const body = await request.json().catch(() => null);
    const sessionId = body?.session_id;
    const path = body?.path;
    if (typeof sessionId !== "string" || !/^[a-f0-9-]{36}$/i.test(sessionId) ||
        typeof path !== "string" || path.length > 1000) return reply({ error: "BAD_REQUEST" }, 400);
    const parts = path.split("/");
    // Session paths are dossier/user/random-token/filename, issued by SQL.
    // The finalizer independently checks the exact session prefix.
    if (parts.length !== 4 || parts[1] !== user.id || parts.some((p: string) => !p || p === "." || p === "..")) {
      return reply({ error: "NOT_ALLOWED" }, 403);
    }
    // Read actual immutable bytes with caller JWT and Storage RLS, never service role.
    const { data: blob, error: readError } = await caller.storage.from("lead-design-files").download(path);
    if (readError || !blob) return reply({ error: "OBJECT_NOT_READABLE" }, 403);
    if (!blob.size || blob.size > 31457280) return reply({ error: "BAD_FILE_SIZE" }, 400);
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    const sha = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    const server = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await server.rpc("lead_finalize_upload", {
      p_session: sessionId, p_path: path, p_sha: sha, p_bytes: blob.size,
      p_mime: blob.type.split(";")[0].trim() || "application/octet-stream",
    });
    if (error) return reply({ error: "UPLOAD_NOT_VERIFIED" }, 409);
    return reply(data);
  } catch {
    return reply({ error: "VERIFICATION_FAILED" }, 500);
  }
});
