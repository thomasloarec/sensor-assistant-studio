/** Notes SAP : texte anglais déterministe, prêt à être collé dans SAP.
 *
 * Le serveur écrit la note qui fait foi (append-only, migration 1.8). Ce module
 * produit EXACTEMENT le même format pour l'aperçu et la copie côté écran, afin
 * qu'aucune divergence ne s'installe entre ce que l'équipe lit et ce qui est
 * enregistré.
 *
 * Format imposé, sans variante :
 *   DD/MM/YYYY - Full Name :
 *   - First line.
 *   - Second line.
 *
 * Les notes sont toujours en anglais, quelle que soit la langue de l'interface
 * ou celle du client : SAP est un outil interne partagé.
 */

export interface SapNote {
  id: string;
  createdAt: string;
  authorName: string;
  eventKey: string;
  bodyEn: string;
}

/** Date au format SAP, en UTC pour rester identique au serveur. */
export function sapDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

export function sapNoteHeader(authorName: string, date: Date): string {
  const name = authorName.replace(/\s+/g, " ").trim() || "Standex";
  return `${sapDate(date)} - ${name} :`;
}

/** Composition d'une note. Sans ligne utile, il n'y a pas de note : `null`. */
export function composeSapNote(
  authorName: string,
  bullets: readonly string[],
  date: Date = new Date(),
): string | null {
  const lines = bullets.map((b) => b.replace(/\s+/g, " ").trim()).filter((b) => b.length > 0);
  if (lines.length === 0) return null;
  return [sapNoteHeader(authorName, date), ...lines.map((l) => `- ${l}`)].join("\n");
}

/** Bloc copiable : l'historique complet, de la note la plus récente à la plus ancienne. */
export function sapNotesToText(notes: readonly SapNote[]): string {
  return [...notes]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((n) => n.bodyEn.trimEnd())
    .join("\n\n");
}

/** Deux notes de même clé d'événement sont la même note : le serveur n'en garde qu'une. */
export function dedupeSapNotes(notes: readonly SapNote[]): SapNote[] {
  const seen = new Set<string>();
  const out: SapNote[] = [];
  for (const note of notes) {
    if (seen.has(note.eventKey)) continue;
    seen.add(note.eventKey);
    out.push(note);
  }
  return out;
}
