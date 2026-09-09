/**
 * Recette RÉELLE du NDA optionnel (migration 1.7), sur fixtures SYNTHÉTIQUES.
 *
 * - deux comptes de test en `@example.invalid` (non routables : aucun e-mail
 *   ne peut partir), deux dossiers au maximum ;
 * - uniquement les RPC normales du client, aucune écriture directe, aucune
 *   fausse preuve, aucun rôle staff, aucune valeur de secret lue ni affichée.
 *
 * Usage : bun scripts/e2e-nda-optional.ts
 */
import { createClient } from "@supabase/supabase-js";

import { createDossier, dossierHash, toClientDto } from "../src/lib/leadmagnet/dossier";
import { missingServerConfig, serviceClient, supabaseUrl } from "../src/lib/leadmagnet/english-report.server";

const ANON =
  process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "sb_publishable__h2mt9iZvp1nuGhgVelHDg_OUiavePt";

const runId = crypto.randomUUID().slice(0, 8);
let failures = 0;
const created: { users: string[]; dossiers: string[] } = { users: [], dossiers: [] };

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

const admin = serviceClient();
if (!admin) {
  console.error("Clé serveur absente :", missingServerConfig().join(", "));
  process.exit(1);
}

async function makeUser(tag: string) {
  const email = `e2e-nda-${runId}-${tag}@example.invalid`;
  const password = `Pw-${crypto.randomUUID()}`;
  const { data, error } = await admin!.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser ${tag}: ${error?.message ?? "sans utilisateur"}`);
  created.users.push(data.user.id);
  const client = createClient(supabaseUrl(), ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw new Error(`signIn ${tag}: ${signed.error.message}`);
  return { userId: data.user.id, client };
}

type Client = Awaited<ReturnType<typeof makeUser>>["client"];
type NdaStatus = { dossier_id: string; nda_required: boolean; nda_status: string; proof: unknown };

async function ndaStatus(c: Client, dossier: string) {
  const r = await c.rpc("lead_nda_status", { p_dossier: dossier });
  if (r.error) throw new Error(`lead_nda_status: ${r.error.message}`);
  return r.data as NdaStatus;
}

async function submitRevision(c: Client, dossier: string) {
  const base = createDossier(new Date().toISOString(), "fr");
  const dto = toClientDto({
    ...base,
    title: `E2E NDA ${runId}`,
    business: { ...base.business, projectPhase: "design", annualVolume: { kind: "known", sensorsPerYear: 2000 } },
  });
  const hash = await dossierHash(dto);
  const now = new Date().toISOString();
  const consent = {
    kind: "supabase_dossier",
    statement: "Fixture supabase_dossier",
    accepted_at: now,
    dossier_id: dossier,
    revision: 1,
    content_hash: hash,
    content_ref: `${dossier}@r1#${hash.slice(0, 16)}`,
    file_digests: [],
    recipients: ["Standex"],
  };
  return c.rpc("lead_submit_revision", {
    p_dossier: dossier,
    p_expected_revision: 0,
    p_snapshot: dto,
    p_content_hash: hash,
    p_consents: [consent],
    p_transferred_files: [],
  });
}

async function main() {
  const owner = await makeUser("owner");
  const other = await makeUser("other");

  // --- Dossier A : neuf, sans NDA -----------------------------------------
  const a = await owner.client.rpc("lead_create_dossier", { p_title: `E2E NDA ${runId} A`, p_nda_required: false });
  if (a.error || !a.data) throw new Error(`lead_create_dossier A: ${a.error?.message}`);
  const dossierA = a.data as string;
  created.dossiers.push(dossierA);
  const sA = await ndaStatus(owner.client, dossierA);
  check("A : dossier neuf sans NDA", sA.nda_required === false && sA.nda_status === "not_required", sA.nda_status);
  const subA = await submitRevision(owner.client, dossierA);
  check("A : soumission acceptée sans NDA", !subA.error, subA.error?.message ?? "");

  // --- Dossier B : NDA demandé, préparé, puis retiré par le propriétaire ----
  const b = await owner.client.rpc("lead_create_dossier", { p_title: `E2E NDA ${runId} B`, p_nda_required: true });
  if (b.error || !b.data) throw new Error(`lead_create_dossier B: ${b.error?.message}`);
  const dossierB = b.data as string;
  created.dossiers.push(dossierB);
  const prep = await owner.client.rpc("lead_prepare_nda", { p_dossier: dossierB });
  check("B : préparation NDA", !prep.error, prep.error?.message ?? "");
  const sB1 = await ndaStatus(owner.client, dossierB);
  check("B : en attente de signatures, sans preuve", sB1.nda_required === true && sB1.proof === null, sB1.nda_status);

  const denied = await other.client.rpc("lead_set_nda_requirement", { p_dossier: dossierB, p_required: false });
  check("B : un autre utilisateur est refusé", Boolean(denied.error), denied.error?.message ?? "aucune erreur");
  const sB2 = await ndaStatus(owner.client, dossierB);
  check("B : refus sans effet", sB2.nda_required === true && sB2.nda_status === sB1.nda_status);

  const off = await owner.client.rpc("lead_set_nda_requirement", { p_dossier: dossierB, p_required: false });
  check("B : le propriétaire retire une demande non signée", !off.error, off.error?.message ?? "");
  const sB3 = await ndaStatus(owner.client, dossierB);
  check("B : NDA non requis", sB3.nda_required === false && sB3.nda_status === "not_required", sB3.nda_status);
  const subB = await submitRevision(owner.client, dossierB);
  check("B : soumission acceptée après retrait", !subB.error, subB.error?.message ?? "");
}

main()
  .catch((e) => {
    failures += 1;
    console.error("ERREUR", e instanceof Error ? e.message : e);
  })
  .finally(async () => {
    console.log(`\nDossiers de test : ${created.dossiers.join(", ") || "aucun"}`);
    for (const id of created.users) {
      const { error } = await admin!.auth.admin.deleteUser(id);
      if (error) console.log(`Nettoyage compte ${id} : ${error.message}`);
    }
    console.log(failures === 0 ? "\nTOUT PASSE" : `\n${failures} ÉCHEC(S)`);
    process.exit(failures === 0 ? 0 : 1);
  });
