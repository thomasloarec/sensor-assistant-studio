/**
 * Référence de projet lisible, et vérité sur ce qu'elle identifie.
 *
 * Deux identifiants existent réellement, et ils ne sont PAS le même :
 *
 *  - l'identifiant local du brouillon (`dossier_<temps>_<compteur>_<aléa>`),
 *    créé dans l'onglet à l'ouverture du projet. Rien n'est enregistré côté
 *    serveur à ce moment-là : aucun brouillon confidentiel n'est créé avant le
 *    consentement et, si le NDA est demandé, avant sa preuve vérifiée ;
 *  - l'identifiant du projet côté serveur (`lead.design_dossiers.id`, UUID),
 *    créé par le serveur au premier enregistrement/envoi.
 *
 * Règle tenue ici : dès qu'un projet existe côté serveur, c'est SON identifiant
 * qui fait la référence définitive. Avant cela, la référence affichée vient de
 * l'identifiant local et elle est explicitement PROVISOIRE.
 *
 * Ce que permet réellement la retrouvaille d'un brouillon téléchargé : la
 * référence provisoire voyage dans le contenu envoyé (l'identifiant local est
 * conservé tel quel dans l'instantané enregistré), donc la fiche interne d'un
 * projet transmis affiche la référence provisoire imprimée sur le PDF antérieur.
 * La LISTE interne, en revanche, ne recherche que l'identifiant serveur : la
 * recherche par référence provisoire demanderait une évolution de la base, qui
 * n'est pas faite.
 *
 * Aucune référence n'est inventée pour un projet sans identifiant.
 */
const clean = (raw: string) =>
  raw
    .normalize("NFKD")
    .replace(/[^0-9a-zA-Z]+/g, "")
    .toUpperCase();

/** Référence stable, ou null si l'identifiant est vide/inutilisable. */
export function projectReference(dossierId: string | null | undefined): string | null {
  if (typeof dossierId !== "string") return null;
  const parts = dossierId.split("_").filter(Boolean);
  const body = clean(parts[0] === "dossier" ? parts.slice(1).join("") : parts.join(""));
  if (body.length === 0) return null;
  const tail = body.slice(-12);
  return `SST-${tail.slice(0, 6)}-${tail.slice(6) || "0"}`;
}

export interface ProjectIdentity {
  /**
   * Abrégé LISIBLE de l'identifiant (`SST-…`). Ce n'est pas une clé : il ne
   * garde que la fin de l'identifiant, donc deux projets différents pourraient
   * théoriquement produire le même abrégé. Il n'est jamais utilisé seul pour
   * désigner un projet.
   */
  reference: string | null;
  /** Identifiant complet, jamais tronqué : c'est lui qui identifie le projet. */
  fullId: string | null;
  /** `server` = UUID unique en base ; `local` = brouillon de cet onglet. */
  idKind: "server" | "local" | "none";
  /** Identifiant local du brouillon, conservé même après enregistrement. */
  localId: string | null;
  /** Vrai tant que le projet n'existe pas côté serveur. */
  provisional: boolean;
}

/**
 * Identité à afficher : l'identifiant serveur gagne toujours quand il existe.
 * `serverDossierId` reste null tant que rien n'a été enregistré.
 */
export function projectIdentity(
  serverDossierId: string | null | undefined,
  localDossierId: string | null | undefined,
): ProjectIdentity {
  const local = typeof localDossierId === "string" && localDossierId.trim() ? localDossierId : null;
  const server = typeof serverDossierId === "string" && serverDossierId.trim() ? serverDossierId : null;
  const full = server ?? local;
  return {
    reference: projectReference(full),
    fullId: full,
    idKind: server ? "server" : local ? "local" : "none",
    localId: local,
    provisional: !server,
  };
}

// i18n-canonical: libellés traduits au rendu et à l'export.
export const REFERENCE_LABEL = "Référence du projet";
export const PROVISIONAL_REFERENCE_LABEL = "Référence provisoire (brouillon non enregistré)";
export const PROVISIONAL_REFERENCE_NOTE =
  "Ce projet n'est pas encore enregistré chez Standex : cette référence est provisoire. La référence définitive est attribuée à l'envoi, et cette référence provisoire est conservée dans le projet transmis pour retrouver ce brouillon.";
/** L'abrégé est un confort de lecture, jamais la clé d'un projet. */
export const SHORT_ALIAS_LABEL = "Abrégé lisible (raccourci, pas une clé unique)";
export const UNIQUE_ID_LABEL = "Identifiant unique du projet (base Standex)";
export const LOCAL_DRAFT_ID_LABEL = "Identifiant complet du brouillon local (non enregistré)";

/** Morceau de titre utilisable dans un nom de fichier, jamais vide. */
export function titleSlug(title: string | null | undefined): string {
  const slug = (title ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "projet";
}

/**
 * Nom du fichier PDF : nom du projet, IDENTIFIANT COMPLET (jamais tronqué, pour
 * que le fichier désigne un seul projet), révision. Un brouillon non enregistré
 * porte `brouillon` dans son nom : le fichier ne prétend pas désigner un projet
 * existant côté Standex.
 */
export function projectPdfFilename(
  title: string | null | undefined,
  dossierId: string | null | undefined,
  revision: number,
  serverDossierId: string | null | undefined = null,
): string {
  const identity = projectIdentity(serverDossierId, dossierId);
  const fullSlug = (identity.fullId ?? "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (
    [
      titleSlug(title),
      fullSlug || null,
      identity.provisional ? "brouillon" : null,
      `r${revision}`,
    ]
      .filter(Boolean)
      .join("-") + ".pdf"
  );
}
