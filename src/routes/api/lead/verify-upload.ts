/** Vérification SERVEUR d'un fichier déposé dans le bucket privé Standex.
 *
 * Pourquoi cette route existe : l'empreinte annoncée par le navigateur ne
 * prouve rien sur les octets réellement stockés. Seule une relecture côté
 * serveur, suivie d'un appel à `public.lead_finalize_upload` (réservée au
 * service_role), autorise ensuite l'annonce du fichier à la soumission ou son
 * usage comme preuve NDA.
 *
 * Deux garde-fous non négociables :
 *  - la LECTURE du fichier se fait avec le jeton de l'appelant, donc sous les
 *    policies du bucket privé : personne ne fait relire le fichier d'un autre ;
 *  - l'ÉCRITURE du constat se fait avec la clé de service, qui ne quitte jamais
 *    le serveur et n'est jamais exposée au navigateur.
 *
 * Tant que la clé de service du projet Standex n'est pas configurée en secret,
 * cette route répond franchement 503 : aucune vérification n'est simulée.
 */
import { createFileRoute } from "@tanstack/react-router";

const BUCKET = "lead-design-files";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const Route = createFileRoute("/api/lead/verify-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = process.env["STANDEX_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
        const serviceKey =
          process.env["STANDEX_SUPABASE_SERVICE_ROLE_KEY"] ??
          process.env["SUPABASE_SERVICE_ROLE_KEY"];
        if (!url || !serviceKey) {
          return json(
            {
              error: "NOT_CONFIGURED",
              message:
                "La vérification serveur des fichiers n'est pas activée : la clé de service du projet Standex n'est pas configurée.",
            },
            503,
          );
        }

        const authorization = request.headers.get("authorization") ?? "";
        if (!authorization.toLowerCase().startsWith("bearer ")) {
          return json({ error: "UNAUTHENTICATED" }, 401);
        }

        let body: { session_id?: unknown; path?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return json({ error: "BAD_REQUEST" }, 400);
        }
        const sessionId = typeof body.session_id === "string" ? body.session_id : "";
        const path = typeof body.path === "string" ? body.path : "";
        if (!sessionId || !path) return json({ error: "BAD_REQUEST" }, 400);

        // 1. Lecture SOUS LES DROITS DE L'APPELANT : les policies du bucket décident.
        const objectResponse = await fetch(
          `${url}/storage/v1/object/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`,
          { headers: { Authorization: authorization, apikey: serviceKey } },
        );
        if (!objectResponse.ok) return json({ error: "OBJECT_NOT_READABLE" }, 403);
        const bytes = new Uint8Array(await objectResponse.arrayBuffer());
        const sha256 = await sha256Hex(bytes);
        const mime =
          objectResponse.headers.get("content-type")?.split(";")[0]?.trim() ||
          "application/octet-stream";

        // 2. Constat écrit par la seule fonction habilitée : elle recompare
        //    session, chemin, empreinte, taille et type, et refuse tout écart.
        const rpcResponse = await fetch(`${url}/rest/v1/rpc/lead_finalize_upload`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            p_session: sessionId,
            p_path: path,
            p_sha: sha256,
            p_bytes: bytes.byteLength,
            p_mime: mime,
          }),
        });
        const payload = await rpcResponse.text();
        if (!rpcResponse.ok) {
          let message = "UPLOAD_NOT_VERIFIED";
          try {
            message = (JSON.parse(payload) as { message?: string }).message ?? message;
          } catch {
            /* réponse non JSON : on ne réécrit pas le message serveur. */
          }
          return json({ error: message }, 409);
        }
        return new Response(payload, {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
