/**
 * Version anglaise du rapport — LECTURE SEULE.
 *
 * Ce module ne traduit rien et n'appelle aucun fournisseur : la traduction est
 * produite côté serveur. Il se contente de décider, à partir des lignes
 * renvoyées par le serveur, si une version anglaise EXISTE réellement pour la
 * révision exacte qu'on regarde. L'original du client n'est jamais remplacé.
 */

export type EnglishReportState = "missing" | "pending" | "ready";

export type EnglishReportOrigin =
  | "human_translation"
  | "source_is_english"
  | "machine_translation";

/** Ligne telle que la projection serveur l'expose (vue équipe uniquement). */
export interface EnglishReportRow {
  id: string;
  revision_id: string;
  content_hash: string;
  state: string;
  origin: string | null;
  producer: string | null;
  source_locale: string | null;
  body_en: string | null;
  produced_at: string | null;
  updated_at?: string | null;
}

/** Révision d'origine à laquelle une version anglaise doit correspondre. */
export interface RevisionRef {
  id: string;
  content_hash: string;
}

export type EnglishReportStatus =
  /** Texte anglais complet, lié à l'empreinte exacte de cette révision. */
  | {
      kind: "ready";
      body: string;
      origin: EnglishReportOrigin;
      producer: string | null;
      sourceLocale: string | null;
      producedAt: string | null;
    }
  /** Production demandée, rien de publiable pour l'instant. */
  | { kind: "pending" }
  /** Une version existe mais pour un AUTRE contenu : jamais affichée comme actuelle. */
  | { kind: "stale"; hash: string }
  /** Ligne incohérente (état « prêt » sans texte, origine inconnue) : refusée. */
  | { kind: "invalid"; reason: string }
  /** Rien n'existe pour cette révision. */
  | { kind: "missing" };

const ORIGINS: EnglishReportOrigin[] = [
  "human_translation",
  "source_is_english",
  "machine_translation",
];

function isOrigin(value: unknown): value is EnglishReportOrigin {
  return typeof value === "string" && (ORIGINS as string[]).includes(value);
}

/**
 * Décide l'état affichable pour UNE révision précise.
 * L'appariement se fait sur `revision_id` ET `content_hash` : une version
 * rattachée à la bonne révision mais à une autre empreinte est « périmée ».
 */
export function selectEnglishReport(
  rows: readonly EnglishReportRow[] | null | undefined,
  revision: RevisionRef | null | undefined,
): EnglishReportStatus {
  if (!revision || !revision.id || !revision.content_hash) return { kind: "missing" };
  const forRevision = (rows ?? []).filter((r) => r.revision_id === revision.id);
  if (forRevision.length === 0) return { kind: "missing" };

  const exact = forRevision.find((r) => r.content_hash === revision.content_hash);
  if (!exact) {
    const other = forRevision[0]!;
    return { kind: "stale", hash: other.content_hash };
  }

  if (exact.state === "pending") return { kind: "pending" };
  if (exact.state === "missing") return { kind: "missing" };
  if (exact.state !== "ready") return { kind: "invalid", reason: `état inconnu : ${exact.state}` };

  const body = typeof exact.body_en === "string" ? exact.body_en : "";
  if (body.trim().length === 0)
    return { kind: "invalid", reason: "version annoncée prête mais sans texte anglais" };
  if (!isOrigin(exact.origin))
    return { kind: "invalid", reason: "origine de la version anglaise non déclarée" };

  return {
    kind: "ready",
    body,
    origin: exact.origin,
    producer: exact.producer ?? null,
    sourceLocale: exact.source_locale ?? null,
    producedAt: exact.produced_at ?? null,
  };
}

/** L'export équipe en anglais n'est possible qu'avec une version anglaise valide. */
export function canExportEnglish(status: EnglishReportStatus): boolean {
  return status.kind === "ready";
}
