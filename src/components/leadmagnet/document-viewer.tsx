/** Lecteur de documents intégré : MD, texte brut et PDF, lus SUR PLACE.
 *
 * - Aucun envoi : un fichier ouvert depuis l'appareil reste en mémoire.
 * - Markdown rendu par un petit convertisseur sûr : aucun HTML brut n'est
 *   interprété, tout est produit sous forme d'éléments React.
 * - PDF affiché via <object> sur une URL blob, avec téléchargement de secours
 *   si le navigateur refuse l'affichage.
 * - Les URLs blob sont libérées, et les réponses tardives sont ignorées.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Download } from "lucide-react";

export type DocumentKind = "markdown" | "text" | "pdf" | "binary";

export interface ViewerDocument {
  /** Identité stable : sert à ignorer une réponse asynchrone périmée. */
  id: string;
  name: string;
  kind: DocumentKind;
  /** Contenu texte, pour markdown et text. */
  text?: string;
  /** Contenu binaire, pour pdf et binary. */
  bytes?: ArrayBuffer;
  /** Message affiché quand le contenu ne peut pas être montré ici. */
  note?: string;
}

/** Rendu Markdown minimal et sûr : titres, listes, gras, code, paragraphes. */
export function renderMarkdown(md: string): ReactNode[] {
  const out: ReactNode[] = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let list: string[] = [];
  let code: string[] | null = null;

  const flushList = () => {
    if (!list.length) return;
    out.push(
      <ul key={`ul-${out.length}`} className="my-3 list-disc space-y-1 pl-6 text-base">
        {list.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  for (const raw of lines) {
    if (raw.trim().startsWith("```")) {
      if (code) {
        out.push(
          <pre
            key={`pre-${out.length}`}
            className="my-3 overflow-x-auto rounded-md bg-muted p-3 text-base"
          >
            {code.join("\n")}
          </pre>,
        );
        code = null;
      } else {
        flushList();
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(raw);
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(raw);
    if (heading) {
      flushList();
      const level = heading[1]!.length;
      const text = heading[2]!;
      const size = ["text-3xl", "text-2xl", "text-xl", "text-lg"][level - 1]!;
      out.push(
        <p key={`h-${out.length}`} className={`mt-5 mb-2 font-semibold ${size}`}>
          {inline(text)}
        </p>,
      );
      continue;
    }
    if (/^\s*[-*]\s+/.test(raw)) {
      list.push(raw.replace(/^\s*[-*]\s+/, ""));
      continue;
    }
    if (!raw.trim()) {
      flushList();
      continue;
    }
    flushList();
    out.push(
      <p key={`p-${out.length}`} className="my-2 text-base leading-relaxed">
        {inline(raw)}
      </p>,
    );
  }
  flushList();
  if (code) {
    out.push(
      <pre key={`pre-${out.length}`} className="my-3 overflow-x-auto rounded-md bg-muted p-3">
        {code.join("\n")}
      </pre>,
    );
  }
  return out;
}

/** Gras, italique et code court, en texte uniquement. */
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**"))
      parts.push(<strong key={m.index}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`"))
      parts.push(
        <code key={m.index} className="rounded bg-muted px-1">
          {token.slice(1, -1)}
        </code>,
      );
    else parts.push(<em key={m.index}>{token.slice(1, -1)}</em>);
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function kindFromName(name: string): DocumentKind {
  const lower = name.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".txt") || lower.endsWith(".json") || lower.endsWith(".csv")) return "text";
  return "binary";
}

export function DocumentViewer({
  document: doc,
  onOpenLocalFile,
}: {
  document: ViewerDocument | null;
  /** Ouverture d'un fichier local, en mémoire : aucun envoi. */
  onOpenLocalFile?: (file: File) => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [embedFailed, setEmbedFailed] = useState(false);
  const genRef = useRef(0);

  useEffect(() => {
    const gen = ++genRef.current;
    setEmbedFailed(false);
    if (!doc?.bytes) {
      setBlobUrl(null);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([doc.bytes], { type: doc.kind === "pdf" ? "application/pdf" : "application/octet-stream" }),
    );
    // Réponse périmée : un autre document a été demandé entre-temps.
    if (gen !== genRef.current) {
      URL.revokeObjectURL(url);
      return;
    }
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [doc?.id, doc?.bytes, doc?.kind]);

  const body = useMemo(() => {
    if (!doc) return null;
    if (doc.kind === "markdown" && doc.text != null) return <div>{renderMarkdown(doc.text)}</div>;
    if (doc.kind === "text" && doc.text != null)
      return (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-base">
          {doc.text}
        </pre>
      );
    if (doc.kind === "pdf" && blobUrl && !embedFailed)
      return (
        <object
          data={blobUrl}
          type="application/pdf"
          className="h-[70vh] w-full rounded-md border"
          aria-label={`Aperçu de ${doc.name}`}
          onError={() => setEmbedFailed(true)}
        >
          <p className="p-4 text-base">
            Ce navigateur n'affiche pas ce PDF ici. Utilisez le téléchargement ci-dessous.
          </p>
        </object>
      );
    return (
      <p className="text-base text-muted-foreground">
        {doc.note ??
          "Ce format ne peut pas être affiché ici. Vous pouvez le télécharger pour l'ouvrir avec votre logiciel habituel."}
      </p>
    );
  }, [doc, blobUrl, embedFailed]);

  return (
    <div className="space-y-4">
      {onOpenLocalFile ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="min-h-11 text-base" asChild>
            <label className="cursor-pointer">
              Ouvrir un document de mon appareil
              <input
                type="file"
                accept=".md,.markdown,.txt,.pdf,text/markdown,text/plain,application/pdf"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onOpenLocalFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          </Button>
          <span className="text-base text-muted-foreground">
            Lu dans cet onglet uniquement, jamais envoyé.
          </span>
        </div>
      ) : null}

      {doc ? (
        <>
          <div className="flex flex-wrap items-center gap-3 border-b pb-3">
            <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-lg font-medium">{doc.name}</span>
            {blobUrl ? (
              <Button variant="outline" className="min-h-11 text-base" asChild>
                <a href={blobUrl} download={doc.name}>
                  <Download className="mr-1 h-4 w-4" /> Télécharger
                </a>
              </Button>
            ) : null}
          </div>
          {body}
        </>
      ) : (
        <p className="text-base text-muted-foreground">Aucun document ouvert pour l'instant.</p>
      )}
    </div>
  );
}

/** Lit un fichier local et en fait un document affichable, sans upload. */
export async function documentFromFile(file: File): Promise<ViewerDocument> {
  const kind = kindFromName(file.name);
  const base = { id: `${file.name}:${file.size}:${file.lastModified}`, name: file.name, kind };
  if (kind === "markdown" || kind === "text") return { ...base, text: await file.text() };
  return { ...base, bytes: await file.arrayBuffer() };
}
