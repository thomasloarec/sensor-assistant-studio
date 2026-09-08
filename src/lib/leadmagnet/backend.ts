/** Détection des capacités backend pour le parcours Lead Magnet.
 * Le seul backend autorisé est le projet Supabase existant du client.
 * Tant que la migration V1.0 n'est pas appliquée, les actions serveur restent indisponibles.
 */
import { supabase, isSupabaseConfigured } from "@/lib/standex/supabase";

export const LEAD_MIGRATION_FILE = "supabase/schema/migration_v1.0_lead_magnet.sql";

export interface LeadBackendStatus {
  configured: boolean;
  ready: boolean;
  message: string;
}

export const UNAVAILABLE_MESSAGE =
  "Les tables de conception ne sont pas encore créées sur le backend Standex. Appliquez la migration " +
  LEAD_MIGRATION_FILE +
  " dans le projet Supabase du client, puis rechargez cette page. Aucune soumission n'est simulée.";

export async function checkLeadBackend(): Promise<LeadBackendStatus> {
  if (!isSupabaseConfigured || !supabase)
    return { configured: false, ready: false, message: "Backend Supabase non configuré." };
  const { error } = await supabase
    .schema("lead")
    .from("design_dossiers")
    .select("id")
    .limit(1);
  if (error) return { configured: true, ready: false, message: UNAVAILABLE_MESSAGE };
  return { configured: true, ready: true, message: "Backend de conception disponible." };
}
