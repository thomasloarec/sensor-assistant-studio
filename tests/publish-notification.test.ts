import { describe, expect, it } from "bun:test";
import { publishDecision, notificationPreview } from "@/lib/leadmagnet/publish-notification";
import { actionAgeDays } from "@/lib/leadmagnet/crm";
import { requestKeyFor, releaseRequestKey } from "@/lib/leadmagnet/request-key";

describe("message client facultatif à la publication", () => {
  it("publie seul quand les deux champs sont vides", () => {
    expect(publishDecision("", "   ", true)).toEqual({ kind: "plain" });
  });

  it("refuse de publier en abandonnant un objet saisi seul", () => {
    expect(publishDecision("Objet", "", true)).toEqual({ kind: "incomplete", missing: "summary" });
  });

  it("refuse de publier en abandonnant un texte saisi seul", () => {
    expect(publishDecision("", "Texte", true)).toEqual({ kind: "incomplete", missing: "subject" });
  });

  it("met en attente quand la paire est complète", () => {
    expect(publishDecision(" Objet ", " Texte ", true)).toEqual({
      kind: "atomic",
      subject: "Objet",
      summary: "Texte",
    });
  });

  it("signale l'espace interne indisponible plutôt que perdre le message", () => {
    expect(publishDecision("Objet", "Texte", false)).toEqual({ kind: "unavailable" });
  });

  it("l'aperçu porte la langue enregistrée du client et un lien absolu", () => {
    const preview = notificationPreview({
      subject: "Retour",
      summary: "Votre revue est disponible.",
      locale: "de",
      dossierId: "11111111-2222-3333-4444-555555555555",
      origin: "https://exemple.invalid",
    });
    expect(preview.locale).toBe("de");
    expect(preview.link).toBe(
      "https://exemple.invalid/?dossier=11111111-2222-3333-4444-555555555555",
    );
  });
});

describe("âge de l'action courante", () => {
  const base = { id: "t", label: "L", stage: "lead", stakeholder: "sales", status: "todo" } as never;

  it("une action pas encore courante n'a pas d'âge", () => {
    const task = {
      ...(base as object),
      activatedAt: null,
      createdAt: "2026-08-10T00:00:00.000Z",
    } as never;
    expect(actionAgeDays(task, new Date("2026-09-09T00:00:00.000Z"))).toBeNull();
  });

  it("l'âge démarre à l'activation réelle", () => {
    const task = {
      ...(base as object),
      activatedAt: "2026-09-07T00:00:00.000Z",
      createdAt: "2026-08-10T00:00:00.000Z",
    } as never;
    expect(actionAgeDays(task, new Date("2026-09-09T00:00:00.000Z"))).toBe(2);
  });
});

describe("clé de demande par compte", () => {
  it("deux comptes ne partagent jamais la même clé", () => {
    const a = requestKeyFor("publish:rev-1", "compte-a");
    const b = requestKeyFor("publish:rev-1", "compte-b");
    expect(a).not.toBe(b);
    expect(requestKeyFor("publish:rev-1", "compte-a")).toBe(a);
    releaseRequestKey("publish:rev-1", "compte-a");
    expect(requestKeyFor("publish:rev-1", "compte-a")).not.toBe(a);
    releaseRequestKey("publish:rev-1", "compte-a");
    releaseRequestKey("publish:rev-1", "compte-b");
  });
});
