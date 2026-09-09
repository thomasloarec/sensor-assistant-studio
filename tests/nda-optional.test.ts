/** NDA optionnel : choix exporté/réimporté, synchronisation serveur.
 * Aucune preuve, aucun statut vérifié ne voyage dans un fichier.
 */
import { describe, expect, it } from "bun:test";
import { createDossier } from "@/lib/leadmagnet/dossier";
import { buildDossierExport, parseDossierExport } from "@/lib/leadmagnet/dossier-io";
import {
  INITIAL_NDA,
  canDisableNda,
  disableNda,
  enableNda,
  planNdaToggle,
  type NdaState,
} from "@/lib/leadmagnet/nda";
import { createNdaSync } from "@/lib/leadmagnet/nda-sync";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const roundtrip = (ndaRequested: boolean) =>
  parseDossierExport(
    JSON.parse(JSON.stringify(buildDossierExport(createDossier(), undefined, { ndaRequested }))),
  );

describe("export/import du choix NDA", () => {
  it("conserve une demande de NDA à travers un aller-retour fichier", () => {
    const back = roundtrip(true);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.ndaRequested).toBe(true);
    // Le choix se rejoue sur l'état initial sans fabriquer de preuve.
    const restored = enableNda(INITIAL_NDA);
    expect(restored.required).toBe(true);
    expect(restored.status).toBe("requested");
    expect(restored.proof).toBeNull();
  });

  it("conserve l'absence de demande", () => {
    const back = roundtrip(false);
    expect(back.ok && back.ndaRequested).toBe(false);
  });

  it("ne transporte JAMAIS une preuve vérifiée", () => {
    const exported = buildDossierExport(createDossier(), undefined, { ndaRequested: true });
    expect(JSON.stringify(exported)).not.toContain("proof");
    expect(JSON.stringify(exported)).not.toContain("in_force");
  });

  it("un ancien export sans le champ ne reconstitue aucun choix", () => {
    const raw = JSON.parse(JSON.stringify(buildDossierExport(createDossier()))) as Record<
      string,
      unknown
    >;
    delete raw["ndaRequested"];
    const back = parseDossierExport(raw);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.ndaRequested).toBeNull();
  });

  it("une valeur non booléenne n'est pas un choix", () => {
    const raw = JSON.parse(JSON.stringify(buildDossierExport(createDossier()))) as Record<
      string,
      unknown
    >;
    raw["ndaRequested"] = "oui";
    const back = parseDossierExport(raw);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.ndaRequested).toBeNull();
  });
});

describe("verrous du choix NDA", () => {
  const proofState: NdaState = {
    ...INITIAL_NDA,
    required: true,
    status: "in_force",
    proof: { documentSha256: "a".repeat(64), verifiedAt: "2026-01-01", verifiedBy: "standex" },
  };

  it("une demande non signée reste annulable, y compris en attente de signatures", () => {
    for (const status of ["requested", "prepared", "awaiting_signatures"] as const) {
      const state: NdaState = { ...INITIAL_NDA, required: true, status };
      expect(canDisableNda(state)).toBe(true);
      expect(disableNda(state).required).toBe(false);
    }
  });

  it("une preuve ou un NDA en vigueur verrouille le retrait", () => {
    expect(canDisableNda(proofState)).toBe(false);
    expect(disableNda(proofState)).toEqual(proofState);
    const pretend: NdaState = { ...proofState, status: "prepared" };
    expect(canDisableNda(pretend)).toBe(false);
  });

  it("hors ligne, un dossier serveur n'affiche pas un retrait comme acquis", () => {
    const state: NdaState = { ...INITIAL_NDA, required: true, status: "requested" };
    const plan = planNdaToggle(state, false, { serverDossier: true, backendReady: false });
    expect(plan.kind).toBe("offline");
  });

  it("dossier local : le choix s'applique immédiatement, les champs sont conservés", () => {
    const filled: NdaState = {
      ...INITIAL_NDA,
      fields: { ...INITIAL_NDA.fields, clientLegalName: "K Motor" },
    };
    const on = planNdaToggle(filled, true, { serverDossier: false, backendReady: false });
    expect(on.kind).toBe("local");
    if (on.kind !== "local") return;
    expect(on.next.required).toBe(true);
    expect(on.next.fields.clientLegalName).toBe("K Motor");
    const off = planNdaToggle(on.next, false, { serverDossier: false, backendReady: false });
    expect(off.kind === "local" && off.next.required).toBe(false);
    if (off.kind === "local") expect(off.next.fields.clientLegalName).toBe("K Motor");
  });

  it("dossier serveur : activation optimiste, retrait seulement après le serveur", () => {
    const off: NdaState = { ...INITIAL_NDA };
    const activate = planNdaToggle(off, true, { serverDossier: true, backendReady: true });
    expect(activate.kind === "server" && activate.optimistic?.required).toBe(true);
    const on: NdaState = { ...INITIAL_NDA, required: true, status: "requested" };
    const remove = planNdaToggle(on, false, { serverDossier: true, backendReady: true });
    expect(remove.kind === "server" && remove.optimistic).toBeNull();
  });
});

describe("synchronisation serveur du choix NDA", () => {
  function harness() {
    const applied: string[] = [];
    const errors: (string | null)[] = [];
    const busy: boolean[] = [];
    const sync = createNdaSync<string>({
      apply: (s) => applied.push(s),
      setError: (m) => errors.push(m),
      setBusy: (b) => busy.push(b),
    });
    return { sync, applied, errors, busy };
  }

  it("un double clic ne déclenche qu'un seul appel serveur", async () => {
    const h = harness();
    const d = deferred<string>();
    let calls = 0;
    const run = () => {
      calls += 1;
      return d.promise;
    };
    const first = h.sync.save(run, { errText: () => "err" });
    const second = h.sync.save(run, { errText: () => "err" });
    expect(await second).toBe(false);
    d.resolve("required=true");
    expect(await first).toBe(true);
    expect(calls).toBe(1);
    expect(h.applied).toEqual(["required=true"]);
    expect(h.busy).toEqual([true, false]);
  });

  it("une relecture commencée AVANT la bascule n'écrase pas le choix", async () => {
    const h = harness();
    const stale = deferred<string>();
    const write = deferred<string>();
    const refresh = h.sync.refresh(() => stale.promise, () => "lecture");
    const save = h.sync.save(() => write.promise, { errText: () => "ecriture" });
    write.resolve("required=false");
    await save;
    stale.resolve("required=true"); // réponse périmée
    await refresh;
    expect(h.applied).toEqual(["required=false"]);
  });

  it("une réponse périmée ne déverrouille pas une opération plus récente", async () => {
    const h = harness();
    const slow = deferred<string>();
    const save = h.sync.save(() => slow.promise, { errText: () => "err" });
    h.sync.invalidate(); // changement de dossier
    const fresh = deferred<string>();
    const other = h.sync.save(() => fresh.promise, { errText: () => "err" });
    slow.resolve("perimee");
    expect(await save).toBe(false);
    expect(h.sync.busy).toBe(true); // la nouvelle opération tient toujours le verrou
    fresh.resolve("courante");
    expect(await other).toBe(true);
    expect(h.applied).toEqual(["courante"]);
  });

  it("une erreur réseau est visible et libère le verrou", async () => {
    const h = harness();
    const ok = await h.sync.save(() => Promise.reject(new Error("réseau")), {
      errText: (e) => (e instanceof Error ? e.message : "err"),
    });
    expect(ok).toBe(false);
    expect(h.errors).toContain("réseau");
    expect(h.sync.busy).toBe(false);
    expect(h.busy).toEqual([true, false]);
  });

  it("une relecture est ignorée pendant une écriture en cours", async () => {
    const h = harness();
    const write = deferred<string>();
    const save = h.sync.save(() => write.promise, { errText: () => "err" });
    let refreshCalls = 0;
    await h.sync.refresh(
      () => {
        refreshCalls += 1;
        return Promise.resolve("lecture");
      },
      () => "err",
    );
    expect(refreshCalls).toBe(0);
    write.resolve("ecriture");
    await save;
    expect(h.applied).toEqual(["ecriture"]);
  });
});
