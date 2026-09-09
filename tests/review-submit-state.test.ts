import { describe, expect, test } from "bun:test";
import { INITIAL_NDA, type NdaState } from "../src/lib/leadmagnet/nda";
import {
  ndaTransferGuidance,
  reviewOperationLabel,
} from "../src/lib/leadmagnet/review-submit-state";

const nda = (patch: Partial<NdaState>): NdaState => ({ ...INITIAL_NDA, ...patch });

describe("retour de transmission à la revue", () => {
  test("explique chaque blocage NDA sans confondre accord et preuve", () => {
    expect(ndaTransferGuidance(nda({ status: "requested" }))).toContain("ne remplace pas cette preuve");
    expect(ndaTransferGuidance(nda({ status: "prepared" }))).toContain("préparé mais non signé");
    expect(ndaTransferGuidance(nda({ status: "awaiting_signatures" }))).toContain("attend encore");
    expect(ndaTransferGuidance(nda({ status: "in_force", proof: null }))).toContain("preuve vérifiée manque");
  });

  test("ne crée aucun faux blocage quand le NDA est non requis ou réellement vérifié", () => {
    expect(ndaTransferGuidance(nda({ required: false, status: "not_required" }))).toBeNull();
    expect(
      ndaTransferGuidance(
        nda({
          status: "in_force",
          proof: { documentSha256: "a".repeat(64), verifiedAt: "2026-09-09", verifiedBy: "staff" },
        }),
      ),
    ).toBeNull();
  });

  test("nomme l'opération réelle au lieu d'annoncer toujours un envoi", () => {
    expect(reviewOperationLabel("upload")).toContain("fichier 3D");
    expect(reviewOperationLabel("submission")).toContain("Transmission");
    expect(reviewOperationLabel("variant")).toContain("proposition");
    expect(reviewOperationLabel(null)).toBeNull();
  });
});