import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewSubmitControl } from "../src/components/leadmagnet/review-submit-control";
import { createDossier } from "../src/lib/leadmagnet/dossier";
import { INITIAL_NDA } from "../src/lib/leadmagnet/nda";
import { INITIAL_PRIVACY, grantConsent, sameBinding } from "../src/lib/leadmagnet/privacy";
import { submissionBinding, type SubmissionInput } from "../src/lib/leadmagnet/submission";
import { applyBindingCycle } from "../src/lib/leadmagnet/submission-cycle";
import {
  sameSentContent,
  submissionStatusKind,
  type SentRevisionRecord,
} from "../src/lib/leadmagnet/submission-status";

const noop = () => undefined;

/** Rend EXACTEMENT ce que l'écran affiche pour cet état : le bandeau vient du
 * statut dérivé, pas d'un texte écrit à la main dans le test. */
function banner(status: ReturnType<typeof submissionStatusKind>, lastSent: SentRevisionRecord) {
  return renderToStaticMarkup(
    <ReviewSubmitControl
      busy={false}
      operation={null}
      ndaGuidance={null}
      canRefreshNda={false}
      authenticated
      message={null}
      messageTone="info"
      status={status}
      lastSent={lastSent}
      onSubmit={noop}
      onOpenNda={noop}
      onRefreshNda={noop}
    />,
  );
}

const baseInput = (patch: Partial<SubmissionInput> = {}): SubmissionInput => ({
  dossier: {
    ...createDossier("2026-09-09T08:00:00.000Z"),
    freeConstraints: "Course 12 mm, montage vissé",
  },
  nda: INITIAL_NDA,
  consents: [],
  reviewAcknowledged: false,
  additionalConstraints: "",
  serverDossierId: "dossier-serveur-1",
  ...patch,
});

/** Enchaînement RÉEL : accord lié → envoi confirmé → incrément de version →
 * recalcul de la liaison → statut → texte du bandeau. */
async function afterConfirmedSend(patch: Partial<SubmissionInput> = {}) {
  const input = baseInput();
  const serverRevision = 1;
  const sentBinding = await submissionBinding({ ...input, serverRevision: serverRevision + 1 });
  const privacy = grantConsent(INITIAL_PRIVACY, {
    kind: "review_submission",
    contentSummary: "résumé relu",
    recipients: ["Standex"],
    binding: sentBinding,
  });
  const lastSent: SentRevisionRecord = {
    dossierId: input.serverDossierId ?? null,
    revisionId: "rev-serveur-2",
    revisionNumber: serverRevision + 1,
    submittedAt: "2026-09-09T09:00:00.000Z",
    binding: sentBinding,
  };
  // Le serveur a confirmé : le compteur passe à la version suivante.
  const cycle = await applyBindingCycle({
    input: { ...input, ...patch },
    serverRevision: serverRevision + 1,
    committedRevision: serverRevision + 1,
    privacy,
  });
  return { input, lastSent, cycle, sentBinding };
}

describe("bandeau d'état après un envoi confirmé", () => {
  test("l'avancement normal du compteur reste « transmis », sans « Modifications non envoyées »", async () => {
    const { lastSent, cycle } = await afterConfirmedSend();
    // La liaison courante vise bien la révision SUIVANTE.
    expect(cycle.binding.revision).toBe(lastSent.binding.revision + 1);
    const status = submissionStatusKind(lastSent, cycle.binding);
    expect(status).toBe("sent");
    const html = banner(status, lastSent);
    expect(html).toContain("Dossier transmis à la revue Standex");
    expect(html).not.toContain("Modifications non envoyées");
    expect(html).toContain("Envoyer mon dossier");
  });

  test("modifier le contenu repasse le bandeau en « Modifications non envoyées »", async () => {
    const edited = baseInput();
    const { lastSent } = await afterConfirmedSend();
    const cycle = await applyBindingCycle({
      input: { ...edited, dossier: { ...edited.dossier, freeConstraints: "Course 40 mm" } },
      serverRevision: 2,
      committedRevision: null,
      privacy: INITIAL_PRIVACY,
    });
    const status = submissionStatusKind(lastSent, cycle.binding);
    expect(status).toBe("modified");
    const html = banner(status, lastSent);
    expect(html).toContain("Modifications non envoyées");
    expect(html).not.toContain("Dossier transmis à la revue Standex.");
    expect(html).toContain("Envoyer mes modifications");
  });

  test("un fichier transféré en plus n'est jamais un succès", async () => {
    const { lastSent, cycle } = await afterConfirmedSend();
    const withFile = {
      ...cycle.binding,
      fileDigests: [...cycle.binding.fileDigests, "d".repeat(64)],
    };
    expect(submissionStatusKind(lastSent, withFile)).toBe("modified");
    expect(banner(submissionStatusKind(lastSent, withFile), lastSent)).toContain(
      "Modifications non envoyées",
    );
  });

  test("changer de dossier serveur n'est jamais un succès", async () => {
    const { lastSent, cycle } = await afterConfirmedSend();
    const elsewhere = { ...cycle.binding, serverDossierId: "dossier-serveur-2" };
    expect(submissionStatusKind(lastSent, elsewhere)).toBe("modified");
  });

  test("premier envoi : l'identifiant créé est celui comparé, pas null", async () => {
    // Le dossier n'existe pas encore à l'ouverture du formulaire.
    const input = baseInput({ serverDossierId: null });
    const createdId = "dossier-cree-par-cet-envoi";
    // Le composant capture l'identifiant réel du rappel de création et rattache
    // la liaison confirmée à CE dossier.
    const bound = await submissionBinding({
      ...input,
      serverDossierId: createdId,
      serverRevision: 2,
    });
    const lastSent: SentRevisionRecord = {
      dossierId: createdId,
      revisionId: "rev-1",
      revisionNumber: 2,
      submittedAt: "2026-09-09T09:00:00.000Z",
      binding: bound,
    };
    // Recalcul après l'envoi : l'écran connaît désormais le dossier créé.
    const cycle = await applyBindingCycle({
      input: { ...input, serverDossierId: createdId },
      serverRevision: 2,
      committedRevision: 2,
      privacy: INITIAL_PRIVACY,
    });
    expect(cycle.binding.serverDossierId).toBe(createdId);
    expect(submissionStatusKind(lastSent, cycle.binding)).toBe("sent");
    // Si l'identifiant était resté null, l'envoi serait annoncé comme périmé.
    const stale = await submissionBinding({ ...input, serverRevision: 2 });
    expect(submissionStatusKind({ ...lastSent, binding: stale }, cycle.binding)).toBe("modified");
  });
});

describe("les autorisations restent strictes", () => {
  test("sameBinding refuse toujours un accord de la révision n pour n+1", async () => {
    const input = baseInput();
    const a = await submissionBinding({ ...input, serverRevision: 2 });
    const b = await submissionBinding({ ...input, serverRevision: 3 });
    expect(a.contentHash).toBe(b.contentHash);
    expect(sameBinding(a, b)).toBe(false);
    // Le bandeau, lui, regarde le contenu envoyé : même dossier, même contenu.
    expect(sameSentContent(a, b)).toBe(true);
    // …mais pas au-delà.
    expect(sameSentContent(a, { ...b, contentHash: "0".repeat(64) })).toBe(false);
    expect(sameSentContent(a, { ...b, serverDossierId: "autre" })).toBe(false);
    expect(sameSentContent(a, null)).toBe(false);
  });

  test("après l'envoi, l'accord donné pour la version envoyée est bien consommé", async () => {
    const { cycle } = await afterConfirmedSend();
    expect(cycle.privacy.consents).toHaveLength(0);
    expect(cycle.afterCommit).toBe(true);
    expect(cycle.consentNotice).toContain("Votre envoi est confirmé");
  });
});
