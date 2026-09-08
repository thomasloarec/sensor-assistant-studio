/** Détection des capacités backend pour le parcours Lead Magnet.
 * Le seul backend autorisé est le projet Supabase existant du client.
 * Tant que l'espace de revue n'est pas activé, les actions serveur restent indisponibles.
 */
import { supabase, isSupabaseConfigured } from "@/lib/standex/supabase";

/** Détail technique : réservé au panneau administrateur, jamais montré au client. */
export const LEAD_MIGRATION_FILE = "supabase/schema/migration_v1.0_lead_magnet.sql";

export interface LeadBackendStatus {
  configured: boolean;
  ready: boolean;
  /** Message client : explique ce qui est possible, sans vocabulaire technique. */
  message: string;
  /** Diagnostic technique, affiché uniquement dans un panneau administrateur. */
  adminDetail: string;
}

/** Ni faux succès, ni jargon : la liaison est simplement à activer côté Standex. */
export const UNAVAILABLE_MESSAGE =
  "La liaison avec l'équipe Standex n'est pas encore activée : votre dossier ne peut pas être " +
  "transmis pour l'instant. Vous pouvez continuer à concevoir, préparer le NDA et exporter " +
  "votre dossier ; l'envoi sera possible dès l'activation.";

const NOT_CONFIGURED_MESSAGE =
  "La liaison avec l'équipe Standex n'est pas configurée sur cet environnement : " +
  "la conception et l'export restent disponibles, l'envoi non.";

export const READY_MESSAGE = "La liaison avec l'équipe Standex est active.";

export async function checkLeadBackend(): Promise<LeadBackendStatus> {
  if (!isSupabaseConfigured || !supabase)
    return {
      configured: false,
      ready: false,
      message: NOT_CONFIGURED_MESSAGE,
      adminDetail: "Variables Supabase absentes de cet environnement.",
    };
  const { error } = await supabase
    .schema("lead")
    .from("design_dossiers")
    .select("id")
    .limit(1);
  if (error)
    return {
      configured: true,
      ready: false,
      message: UNAVAILABLE_MESSAGE,
      adminDetail: `Schéma de conception injoignable (${LEAD_MIGRATION_FILE} non appliquée) : ${error.message}`,
    };
  return {
    configured: true,
    ready: true,
    message: READY_MESSAGE,
    adminDetail: "Schéma lead accessible avec la clé publiable.",
  };
}
