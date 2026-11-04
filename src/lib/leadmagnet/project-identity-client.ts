import type { IdentityInput, ProjectIdentity } from "./project-identity";
import { PROJECT_IDENTITY_ANON_KEY } from "./project-identity-public-key";
export async function requestProjectIdentity(
  input: IdentityInput,
  signal: AbortSignal,
): Promise<ProjectIdentity> {
  const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
  if (!url) throw new Error("UNAVAILABLE");
  if (typeof window === "undefined" || ![
    "https://sensor-pal-tester.lovable.app",
    "https://id-preview--9aff67a3-e0d0-4a40-95e1-da809f7ff333.lovable.app",
  ].includes(window.location.origin)) throw new Error("UNAVAILABLE");
  const response = await fetch(url + "/functions/v1/project-identity", {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      apikey: PROJECT_IDENTITY_ANON_KEY,
      Authorization: "Bearer " + PROJECT_IDENTITY_ANON_KEY,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("UNAVAILABLE");
  return response.json();
}
