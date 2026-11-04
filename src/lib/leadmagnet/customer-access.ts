import { supabase } from "@/lib/standex/supabase";
import type { SubmissionSnapshot } from "./submission";

export const CUSTOMER_EMAIL_ACCESS =
  import.meta.env["VITE_CUSTOMER_EMAIL_ACCESS_ENABLED"] === "true";
export const CUSTOMER_API = "/api/customer-access";
export type PendingIdentity = { id: string; receipt: string };
export type PendingProject = { id: string; title: string; expires_at: string; created_at: string };
export type CustomerProfile = {
  contact_name: string | null;
  company: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
};
export type CustomerAccessResult = {
  id?: string;
  expires_at?: string;
  emailRequested?: boolean;
  pending?: PendingProject[];
  profile?: CustomerProfile | null;
  dossier_id?: string;
  uploadToken?: string;
  file?: { path: string; fileName: string; sha256: string; bytes: number; mimeType: string };
};
export function newPendingIdentity(): PendingIdentity {
  return { id: crypto.randomUUID(), receipt: crypto.randomUUID() + crypto.randomUUID() };
}
export async function customerRequest(
  body: Record<string, unknown> | FormData,
  authenticated = false,
): Promise<CustomerAccessResult> {
  const headers = new Headers();
  if (authenticated) {
    const { data } = await supabase!.auth.getSession();
    if (!data.session) throw new Error("AUTH_REQUIRED");
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }
  if (!(body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(CUSTOMER_API, {
    method: "POST",
    headers,
    credentials: "same-origin",
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.code === "string" ? data.code : "UNAVAILABLE");
  return data as CustomerAccessResult;
}
export function savePendingProject(identity: PendingIdentity, snapshot: SubmissionSnapshot) {
  return customerRequest({ action: "submit", ...identity, snapshot });
}
export async function preparePendingFile(
  identity: PendingIdentity,
  email: string | null,
  bytes: ArrayBuffer,
  fileName: string,
) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  const result = await customerRequest({
    action: "prepare_file",
    ...identity,
    email,
    ndaRequired: false,
    consent: true,
    fileName,
    bytes: bytes.byteLength,
    sha256,
  });
  if (!result.file || !supabase) throw new Error("UNAVAILABLE");
  if (result.uploadToken) {
    // The signed grant only allows a new object at this exact reserved path.
    // A retry may find an already uploaded object; the server independently checks it.
    await supabase.storage
      .from("lead-design-files")
      .uploadToSignedUrl(
        result.file.path,
        result.uploadToken,
        new Blob([bytes], { type: "model/gltf-binary" }),
        { contentType: "model/gltf-binary", upsert: false },
      );
  }
  return customerRequest({ action: "verify_file", ...identity, email });
}

/* i18n-canonical: safe application messages; provider/database errors stay private. */
export function customerAccessMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "LINK_EXPIRED")
    return "Ce lien est expiré ou a déjà été utilisé. Demandez un nouveau lien de connexion.";
  if (code === "RATE_LIMITED") return "Trop de demandes. Patientez avant de réessayer.";
  if (code === "EXPIRED")
    return "Cet envoi a expiré. Rouvrez votre projet et confirmez à nouveau son envoi.";
  if (code === "BAD_EMAIL") return "Vérifiez votre adresse email avant de continuer.";
  if (code === "INDUSTRY_REQUIRED") return "Sélectionnez et confirmez l’industrie de l’application finale.";
  if (code === "BAD_FILE") return "Le fichier 3D doit être un GLB valide de 30 Mo maximum.";
  if (code === "AUTH_REQUIRED") return "Connectez-vous pour retrouver vos projets.";
  if (code === "SEALED_SUBMISSION")
    return "Cet envoi est déjà enregistré. Retrouvez-le depuis votre email avant de le modifier.";
  return "Cette opération n'a pas abouti. Réessayez dans quelques instants.";
}
