/** Lecture de documents : un fichier markdown obtenu en octets doit vraiment
 * s'afficher, et un fichier trop lourd ne doit pas être décodé silencieusement.
 */
import { describe, expect, test } from "bun:test";
import {
  documentFromBytes,
  kindFromName,
  MAX_DOCUMENT_BYTES,
} from "@/components/leadmagnet/document-viewer";

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe("Documents réellement transmis", () => {
  test("un .md obtenu en octets est décodé et affichable", () => {
    const doc = documentFromBytes("revue.md", enc("# Titre\n\nTexte"), "id-1");
    expect(doc.kind).toBe("markdown");
    expect(doc.text).toBe("# Titre\n\nTexte");
    expect(doc.bytes).toBeUndefined();
  });

  test("un .txt est décodé de la même façon", () => {
    const doc = documentFromBytes("note.txt", enc("bonjour"), "id-2");
    expect(doc.kind).toBe("text");
    expect(doc.text).toBe("bonjour");
  });

  test("un PDF conserve ses octets, sans décodage", () => {
    const doc = documentFromBytes("dossier.pdf", enc("%PDF-1.4"), "id-3");
    expect(doc.kind).toBe("pdf");
    expect(doc.text).toBeUndefined();
    expect(doc.bytes).toBeDefined();
  });

  test("au-delà de 30 Mio le contenu n'est pas rendu, avec explication", () => {
    const big = new ArrayBuffer(MAX_DOCUMENT_BYTES + 1);
    const doc = documentFromBytes("gros.md", big, "id-4");
    expect(doc.kind).toBe("binary");
    expect(doc.text).toBeUndefined();
    expect(doc.note).toContain("30 Mio");
  });

  test("le type est déduit du nom, sans invention", () => {
    expect(kindFromName("a.markdown")).toBe("markdown");
    expect(kindFromName("a.glb")).toBe("binary");
  });
});
