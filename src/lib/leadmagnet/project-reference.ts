/**
 * Référence de projet lisible, dérivée de l'identifiant unique du dossier.
 *
 * L'identifiant du dossier (`dossier_<temps>_<compteur>_<aléa>`) est créé une
 * seule fois, à la création du projet, et il est conservé tel quel dans le
 * contenu enregistré côté serveur à chaque soumission. La référence n'est donc
 * PAS un nouvel identifiant : c'est une écriture lisible du même identifiant.
 *
 * Conséquences voulues :
 *  - un même projet garde la même référence avant l'envoi, après l'envoi, à
 *    chaque export et à chaque révision ;
 *  - un brouillon téléchargé avant l'envoi se retrouve sous la même référence
 *    une fois le projet transmis ;
 *  - aucune référence n'est inventée pour un dossier sans identifiant.
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

/** Nom du fichier PDF : nom du projet, référence stable, révision. */
export function projectPdfFilename(
  title: string | null | undefined,
  dossierId: string | null | undefined,
  revision: number,
): string {
  const reference = projectReference(dossierId);
  return [titleSlug(title), reference ?? null, `r${revision}`].filter(Boolean).join("-") + ".pdf";
}
