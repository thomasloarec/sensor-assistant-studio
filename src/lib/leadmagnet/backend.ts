/** Disponibilité du parcours serveur Lead Magnet.
 *
 * Backend unique : le projet Supabase existant du client (jamais Lovable Cloud).
 * Trois conditions, vérifiées séparément et sans jamais écrire quoi que ce soit :
 *   1. les variables Supabase existent dans cet environnement ;
 *   2. l'espace de conception est présent côté serveur (migration appliquée) ;
 *   3. une session est ouverte — et pour les actions Standex, le rôle vient du serveur.
 */
import { probeLeadSchema, fetchLeadCapabilities, type LeadCapabilities } from "./supabase-adapter";
import { REQUIRED_LEAD_SCHEMA_VERSION } from "./rpc";
import type { StaffRole } from "./review";

/** Détail technique : réservé au panneau administrateur, jamais montré au client. */
export const LEAD_MIGRATION_FILE = "supabase/schema/migration_v1.2_lead_magnet.sql";

export interface LeadBackendStatus {
  configured: boolean;
  /** Espace de conception disponible côté serveur. */
  schemaReady: boolean;
  authenticated: boolean;
  role: StaffRole | null;
  /** Le client peut réellement envoyer son dossier. */
  ready: boolean;
  version: string | null;
  /** Message client : explique ce qui est possible, sans vocabulaire technique. */
  message: string;
  /** Diagnostic technique, affiché uniquement dans un panneau administrateur. */
  adminDetail: string;
  capabilities: LeadCapabilities;
}

export const UNAVAILABLE_MESSAGE =
  "La liaison avec l'équipe Standex n'est pas encore activée : votre dossier ne peut pas être " +
  "transmis pour l'instant. Vous pouvez continuer à concevoir, préparer le NDA et exporter " +
  "votre dossier ; l'envoi sera possible dès l'activation.";

const NOT_CONFIGURED_MESSAGE =
  "La liaison avec l'équipe Standex n'est pas configurée sur cet environnement : " +
  "la conception et l'export restent disponibles, l'envoi non.";

const SIGN_IN_MESSAGE =
  "La liaison avec l'équipe Standex est active : connectez-vous pour envoyer votre dossier. " +
  "Tant que vous ne l'envoyez pas, rien ne quitte votre appareil.";

export const READY_MESSAGE =
  "La liaison avec l'équipe Standex est active : vous pouvez envoyer votre dossier pour revue.";

export async function checkLeadBackend(): Promise<LeadBackendStatus> {
  const probe = await probeLeadSchema();
  const base = {
    configured: probe.configured,
    schemaReady: probe.schemaReady,
    version: probe.version,
    capabilities: {
      authenticated: false,
      userId: null,
      role: null,
      assignedDossiers: [],
    } as LeadCapabilities,
  };
  if (!probe.configured)
    return {
      ...base,
      authenticated: false,
      role: null,
      ready: false,
      message: NOT_CONFIGURED_MESSAGE,
      adminDetail: probe.adminDetail,
    };
  if (!probe.schemaReady)
    return {
      ...base,
      authenticated: false,
      role: null,
      ready: false,
      message: UNAVAILABLE_MESSAGE,
      adminDetail: `${probe.adminDetail} Appliquer ${LEAD_MIGRATION_FILE} (version attendue ${REQUIRED_LEAD_SCHEMA_VERSION}).`,
    };

  const capabilities = await fetchLeadCapabilities();
  return {
    ...base,
    capabilities,
    authenticated: capabilities.authenticated,
    role: capabilities.role,
    ready: capabilities.authenticated,
    message: capabilities.authenticated ? READY_MESSAGE : SIGN_IN_MESSAGE,
    adminDetail:
      `${probe.adminDetail} Session : ${capabilities.authenticated ? "ouverte" : "absente"} ; ` +
      `rôle serveur : ${capabilities.role ?? "aucun"}.`,
  };
}

/** Une action réservée à Standex n'est activée que sur rôle renvoyé par le serveur. */
export function staffActionEnabled(
  status: LeadBackendStatus | null,
  roles: StaffRole[],
): boolean {
  if (!status?.ready || !status.role) return false;
  return roles.includes(status.role);
}
