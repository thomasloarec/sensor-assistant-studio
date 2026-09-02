import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Projet Supabase existant du client (pas Lovable Cloud).
// Variables attendues dans l'environnement Vite :
//   VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY (ou VITE_SUPABASE_ANON_KEY)
const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const key = (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
  import.meta.env["VITE_SUPABASE_ANON_KEY"]) as string | undefined;

export const isSupabaseConfigured = Boolean(url && key);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, key as string, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "Supabase non configuré : renseigne VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return supabase;
}
