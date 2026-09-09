import { describe, expect, test } from "bun:test";
import {
  sentHistory,
  statusDetail,
  statusHeadline,
  submissionStatusKind,
  submitButtonLabel,
  type SentRevisionRecord,
} from "../src/lib/leadmagnet/submission-status";
import type { ConsentBinding } from "../src/lib/leadmagnet/privacy";

const binding = (patch: Partial<ConsentBinding> = {}): ConsentBinding => ({
  serverDossierId: "d1",
  revision: 3,
  contentHash: "a".repeat(64),
  fileDigests: ["f1"],
  ...patch,
});

const sent = (patch: Partial<SentRevisionRecord> = {}): SentRevisionRecord => ({
  dossierId: "d1",
  revisionId: "rev-3",
  revisionNumber: 3,
  submittedAt: "2026-09-09T08:00:00.000Z",
  binding: binding(),
  ...patch,
});

describe("état de soumission : envoi confirmé vs brouillon courant", () => {
  test("aucun envoi : ni succès ni historique", () => {
    expect(submissionStatusKind(null, binding())).toBe("draft");
    expect(statusHeadline("draft")).toBeNull();
    expect(sentHistory(null)).toBeNull();
  });

  test("succès affiché seulement pour la version exactement envoyée", () => {
    expect(submissionStatusKind(sent(), binding())).toBe("sent");
    expect(statusHeadline("sent")).toContain("transmis");
  });

  test("contenu modifié : plus de succès, message « Modifications non envoyées »", () => {
    const kind = submissionStatusKind(sent(), binding({ contentHash: "b".repeat(64) }));
    expect(kind).toBe("modified");
    expect(statusHeadline(kind)).toBe("Modifications non envoyées");
    expect(statusDetail(kind)).toContain("n'est encore parti");
  });

  test("changement de dossier visé ou de fichiers : succès invalidé aussi", () => {
    expect(submissionStatusKind(sent(), binding({ serverDossierId: "d2" }))).toBe("modified");
    expect(submissionStatusKind(sent(), binding({ fileDigests: ["f1", "f2"] }))).toBe("modified");
    expect(submissionStatusKind(sent(), binding({ revision: 4 }))).toBe("modified");
  });

  test("empreinte courante indisponible : jamais de faux succès", () => {
    expect(submissionStatusKind(sent(), null)).toBe("modified");
  });

  test("l'historique reste identifié par version et date après modification", () => {
    expect(sentHistory(sent())).toEqual({ revisionNumber: 3, date: "2026-09-09" });
  });

  test("libellé du bouton", () => {
    expect(submitButtonLabel("draft", null)).toBe("Envoyer mon dossier");
    expect(submitButtonLabel("sent", sent())).toBe("Envoyer mon dossier");
    expect(submitButtonLabel("modified", sent())).toBe("Envoyer mes modifications");
    expect(submitButtonLabel("modified", null)).toBe("Envoyer mon dossier");
  });
});
