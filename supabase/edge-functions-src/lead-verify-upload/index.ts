// Fonction Edge Supabase `lead-verify-upload`.
//
// IMPORTANT (contrainte de la plateforme d'édition) : la création de fichiers
// sous `supabase/functions/` est bloquée dans ce projet. Le code ci-dessous est
// donc la source EXACTE à déployer ; avant déploiement, copier ce dossier en
// `supabase/functions/lead-verify-upload/` puis :
//   supabase functions deploy lead-verify-upload --project-ref yyobodalwtsqdyrqwkjk
// avec verify_jwt = true. Les secrets SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par la plateforme :
// aucun secret à transférer ailleurs.
//
// Tant que la fonction n'est pas déployée, l'appel client échoue proprement et
// la soumission refuse le fichier : rien n'est simulé côté navigateur.
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
