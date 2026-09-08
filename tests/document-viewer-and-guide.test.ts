/** Vérifications réelles du lecteur de documents et du parcours guidé.
 *
 * Aucune de ces assertions ne se contente de comparer une chaîne d'interface :
 * on vérifie le comportement (pas de HTML brut injecté, types de fichiers,
 * questions réellement reliées aux exigences du dossier existant).
 */
import { describe, expect, test } from "bun:test";
import { isValidElement, type ReactNode } from "react";
import { renderMarkdown, kindFromName } from "@/components/leadmagnet/document-viewer";
import { GUIDED_QUESTIONS } from "@/components/leadmagnet/design-space";
import { createDossier } from "@/lib/leadmagnet/dossier";

function walk(nodes: ReactNode[], visit: (el: { type: unknown; props: any }) => void) {
  for (const n of nodes) {
    if (Array.isArray(n)) walk(n, visit);
    else if (isValidElement(n)) {
      const el = n as unknown as { type: unknown; props: any };
      visit(el);
      const kids = el.props?.children;
      if (kids !== undefined) walk(Array.isArray(kids) ? kids : [kids], visit);
    }
  }
}

describe("lecteur de documents", () => {
  test("le Markdown n'injecte jamais de HTML brut", () => {
    const nodes = renderMarkdown(
      "# Titre\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n- point **gras**",
    );
    let dangerous = 0;
    let scriptElements = 0;
    walk(nodes, (el) => {
      if (el.props && "dangerouslySetInnerHTML" in el.props) dangerous += 1;
      if (el.type === "script" || el.type === "img") scriptElements += 1;
    });
    expect(dangerous).toBe(0);
    expect(scriptElements).toBe(0);

    // Le texte de la balise reste visible en tant que TEXTE, pas exécuté.
    let text = "";
    walk(nodes, (el) => {
      const k = el.props?.children;
      if (typeof k === "string") text += k;
      if (Array.isArray(k)) for (const c of k) if (typeof c === "string") text += c;
    });
    expect(text).toContain("<script>");
  });

  test("le type de document vient du nom réel du fichier", () => {
    expect(kindFromName("resume.md")).toBe("markdown");
    expect(kindFromName("NOTE.MARKDOWN")).toBe("markdown");
    expect(kindFromName("dossier.pdf")).toBe("pdf");
    expect(kindFromName("notes.txt")).toBe("text");
    // Un DOCX n'est jamais présenté comme un PDF.
    expect(kindFromName("nda.docx")).toBe("binary");
    expect(kindFromName("modele.glb")).toBe("binary");
  });
});

describe("parcours guidé", () => {
  test("chaque question pointe une exigence réelle du dossier, sans doublon", () => {
    const keys = createDossier().requirements.map((r) => r.key);
    const asked = GUIDED_QUESTIONS.map((q) => q.key);
    for (const k of asked) expect(keys).toContain(k);
    expect(new Set(asked).size).toBe(asked.length);
    // Toutes les exigences du dossier sont couvertes par le parcours guidé.
    for (const k of keys) expect(asked).toContain(k);
  });

  test("chaque question donne un exemple concret et un intitulé non technique", () => {
    for (const q of GUIDED_QUESTIONS) {
      expect(q.prompt.length).toBeGreaterThan(10);
      expect(q.example.length).toBeGreaterThan(10);
      expect(q.prompt).not.toContain("_");
    }
  });
});
