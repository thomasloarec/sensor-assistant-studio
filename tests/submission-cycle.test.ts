import { describe, expect, test } from "bun:test";
import { createDossier } from "../src/lib/leadmagnet/dossier";
import { INITIAL_NDA } from "../src/lib/leadmagnet/nda";
import { INITIAL_PRIVACY, grantConsent, hasBoundConsent } from "../src/lib/leadmagnet/privacy";
import { submissionBinding } from "../src/lib/leadmagnet/submission";
import { applyBindingCycle } from "../src/lib/leadmagnet/submission-cycle";

/** Enchaînement RÉEL : liaison courante → accord donné pour cette liaison →
 * envoi confirmé → incrément de version côté serveur → recalcul de la liaison.
 * Les empreintes sont calculées par le vrai code, pas fournies identiques. */
async function scenario() {
  const dossier = {
    ...createDossier("2026-09-09T08:00:00.000Z"),
    freeConstraints: "Course 12 mm, montage vissé",
  };
  const input = {
    dossier,
    nda: INITIAL_NDA,
    consents: [],
    reviewAcknowledged: false,
    additionalConstraints: "",
    serverDossierId: "dossier-serveur-1",
  };
  const serverRevision = 3;
  const binding = await submissionBinding({ ...input, serverRevision: serverRevision + 1 });
  const privacy = grantConsent(INITIAL_PRIVACY, {
    kind: "review_submission",
    contentSummary: "résumé relu",
    recipients: ["Standex"],
    binding,
  });
  return { input, serverRevision, binding, privacy };
}

describe("cycle de liaison : envoi confirmé puis incrément de version", () => {
  test("l'accord vaut pour la révision exactement visée", async () => {
    const { privacy, binding } = await scenario();
    expect(hasBoundConsent(privacy, "review_submission", binding)).toBe(true);
    expect(binding.revision).toBe(4);
  });

  test("après succès, la progression normale du compteur ne passe pas pour une édition", async () => {
    const { input, serverRevision, privacy } = await scenario();
    // Le composant enregistre la révision réellement confirmée, puis incrémente.
    const committedRevision = serverRevision + 1;
    const cycle = await applyBindingCycle({
      input,
      serverRevision: serverRevision + 1,
      committedRevision,
      privacy,
    });
    expect(cycle.afterCommit).toBe(true);
    expect(cycle.binding.revision).toBe(5);
    // Le contenu n'a pas bougé, seule la révision : l'accord est bien consommé…
    expect(cycle.privacy.consents).toHaveLength(0);
    expect(cycle.resetAcknowledged).toBe(true);
    // …mais le message ne parle PAS d'un contenu modifié.
    expect(cycle.consentNotice).toContain("Votre envoi est confirmé");
    expect(cycle.consentNotice).not.toContain("ont changé");
  });

  test("une vraie modification du contenu redonne le message d'édition", async () => {
    const { input, serverRevision, privacy } = await scenario();
    const edited = {
      ...input,
      dossier: { ...input.dossier, freeConstraints: "Course 25 mm, montage vissé" },
    };
    const cycle = await applyBindingCycle({
      input: edited,
      serverRevision,
      committedRevision: null,
      privacy,
    });
    expect(cycle.afterCommit).toBe(false);
    expect(cycle.binding.revision).toBe(4);
    expect(cycle.binding.contentHash).not.toBe(
      (await submissionBinding({ ...input, serverRevision: serverRevision + 1 })).contentHash,
    );
    expect(cycle.privacy.consents).toHaveLength(0);
    expect(cycle.consentNotice).toContain("ont changé");
  });

  test("une modification APRÈS l'envoi confirmé reste une édition, malgré le repère", async () => {
    const { input, serverRevision, privacy } = await scenario();
    const edited = {
      ...input,
      dossier: { ...input.dossier, freeConstraints: "Course 25 mm" },
    };
    // Le repère a déjà été consommé par le recalcul qui a suivi l'envoi.
    const cycle = await applyBindingCycle({
      input: edited,
      serverRevision: serverRevision + 1,
      committedRevision: null,
      privacy,
    });
    expect(cycle.afterCommit).toBe(false);
    expect(cycle.consentNotice).toContain("ont changé");
  });

  test("sans accord donné, aucun message n'est inventé", async () => {
    const { input, serverRevision } = await scenario();
    const cycle = await applyBindingCycle({
      input,
      serverRevision,
      committedRevision: null,
      privacy: INITIAL_PRIVACY,
    });
    expect(cycle.consentNotice).toBeNull();
    expect(cycle.resetAcknowledged).toBe(false);
  });

  test("changer de dossier serveur périme aussi l'accord", async () => {
    const { input, serverRevision, privacy } = await scenario();
    const cycle = await applyBindingCycle({
      input: { ...input, serverDossierId: "dossier-serveur-2" },
      serverRevision,
      committedRevision: null,
      privacy,
    });
    expect(cycle.binding.serverDossierId).toBe("dossier-serveur-2");
    expect(cycle.privacy.consents).toHaveLength(0);
    expect(cycle.consentNotice).toContain("ont changé");
  });
});
