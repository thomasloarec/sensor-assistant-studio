/**
 * Test RÉEL bout en bout de la version anglaise, sur fixtures SYNTHÉTIQUES.
 *
 * - comptes de test créés côté serveur, e-mails en `@example.invalid`
 *   (non routables : aucun message ne peut partir) ;
 * - dossier et soumission créés par les RPC NORMALES, avec empreinte et
 *   consentement `ai_assistant` exacts (aucun contournement de snapshot) ;
 * - pipeline serveur réel : auth → authorize → begin → Anthropic → finalize ;
 * - aucune valeur de secret n'est lue, affichée ni journalisée.
 *
 * Usage : bun scripts/e2e-english-report.ts
 */
import { createClient } from "@supabase/supabase-js";

import { createDossier, dossierHash, toClientDto, type DesignDossier } from "../src/lib/leadmagnet/dossier";
import {
  anthropicProvider,
  missingServerConfig,
  serviceClient,
  supabaseUrl,
  userFromAccessToken,
} from "../src/lib/leadmagnet/english-report.server";
import { runEnglishReport, type EnglishReportDeps } from "../src/lib/leadmagnet/english-report.pipeline";
import type { Locale } from "../src/lib/i18n";

const ANON =
  process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "sb_publishable__h2mt9iZvp1nuGhgVelHDg_OUiavePt";

const runId = crypto.randomUUID().slice(0, 8);
const created: { users: string[]; dossiers: string[] } = { users: [], dossiers: [] };
let failures = 0;

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
  const email = `e2e-${runId}-${tag}@example.invalid`;
  const password = `Pw-${crypto.randomUUID()}`;
  const { data, error } = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${tag}: ${error?.message ?? "sans utilisateur"}`);
  created.users.push(data.user.id);
  const client = createClient(supabaseUrl(), ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session)
    throw new Error(`signIn ${tag}: ${signed.error?.message ?? "sans session"}`);
  return { userId: data.user.id, client, token: signed.data.session.access_token };
}

/** Dossier réellement exploitable, dans la langue demandée. */
function fixtureDossier(locale: Locale, goal: string): DesignDossier {
  const base = createDossier(new Date().toISOString(), locale);
  const requirements = base.requirements.map((r) =>
    r.key === "detection_goal"
      ? { ...r, value: goal, state: "confirmed" as const, source: "user" as const }
      : r,
  );
  return {
    ...base,
    title: `E2E ${runId} ${locale}`,
    requirements,
    business: {
      ...base.business,
      projectPhase: "design",
      annualVolume: { kind: "known", sensorsPerYear: 2000 },
      contactName: "Test Fixture",
      contactEmail: `e2e-${runId}@example.invalid`,
      contactCompany: "Fixture",
    },
  };
}

async function submit(
  user: Awaited<ReturnType<typeof makeUser>>,
  locale: Locale,
  goal: string,
  opts: { ndaRequired?: boolean; withAiConsent?: boolean } = {},
) {
  const dto = toClientDto(fixtureDossier(locale, goal));
  const hash = await dossierHash(dto);
  const dossierId = (
    await user.client.rpc("lead_create_dossier", {
      p_title: `E2E ${runId}`,
      p_nda_required: opts.ndaRequired ?? false,
    })
  ).data as string | null;
  if (!dossierId) throw new Error("lead_create_dossier n'a rien renvoyé");
  created.dossiers.push(dossierId);

  const now = new Date().toISOString();
  const consent = (kind: string) => ({
    kind,
    statement: `Fixture ${kind}`,
    accepted_at: now,
    dossier_id: dossierId,
    revision: 1,
    content_hash: hash,
    content_ref: `${dossierId}@r1#${hash.slice(0, 16)}`,
    file_digests: [],
    recipients: ["Standex"],
  });
  const consents = opts.withAiConsent === false
    ? [consent("supabase_dossier")]
    : [consent("supabase_dossier"), consent("ai_assistant")];

  const res = await user.client.rpc("lead_submit_revision", {
    p_dossier: dossierId,
    p_expected_revision: 0,
    p_snapshot: dto,
    p_content_hash: hash,
    p_consents: consents,
    p_transferred_files: [],
  });
  if (res.error) throw new Error(`lead_submit_revision: ${res.error.message}`);
  const row = res.data as { revision_id: string; revision: number };
  return { dossierId, hash, dto, revisionId: row.revision_id, revision: row.revision };
}

let providerCalls = 0;
function deps(): EnglishReportDeps {
  return {
    missingConfig: missingServerConfig,
    userFromAccessToken,
    provider: () => {
      const real = anthropicProvider();
      if (!real) return null;
      return {
        producer: real.producer,
        translate: async (segments) => {
          providerCalls += 1;
          return real.translate(segments);
        },
      };
    },
    authorize: async (a) =>
      await admin!.rpc("lead_report_en_authorize", {
        p_user: a.userId,
        p_dossier: a.dossierId,
        p_revision_id: a.revisionId,
        p_content_hash: a.contentHash,
      }),
    begin: async (a) =>
      await admin!.rpc("lead_report_en_begin", {
        p_dossier: a.dossierId,
        p_revision_id: a.revisionId,
        p_content_hash: a.contentHash,
      }),
    finalize: async (a) =>
      await admin!.rpc("lead_report_en_finalize", {
        p_dossier: a.dossierId,
        p_revision_id: a.revisionId,
        p_content_hash: a.contentHash,
        p_body: a.body,
        p_origin: "machine_translation",
        p_producer: a.producer,
        p_source_locale: a.sourceLocale,
      }),
  };
}

async function main() {
  console.log(`run ${runId} — configurations manquantes : ${missingServerConfig().join(", ") || "aucune"}`);

  const owner = await makeUser("owner");
  const other = await makeUser("other");

  // 1. Chemin nominal, projet en français.
  const fr = await submit(owner, "fr", "Détecter la position fermée du capot de la machine.");
  const out = await runEnglishReport(deps(), {
    accessToken: owner.token,
    dossierId: fr.dossierId,
    revisionId: fr.revisionId,
    contentHash: fr.hash,
  });
  check("pipeline réel FR → ready", out.state === "ready", JSON.stringify(out));

  // 2. Retry : aucun second appel fournisseur, aucun doublon.
  const before = providerCalls;
  const again = await runEnglishReport(deps(), {
    accessToken: owner.token,
    dossierId: fr.dossierId,
    revisionId: fr.revisionId,
    contentHash: fr.hash,
  });
  check("retry idempotent → ready", again.state === "ready", JSON.stringify(again));
  check("retry sans appel fournisseur", providerCalls === before, `appels=${providerCalls - before}`);

  // 3. Lecture stockée : état ready confirmé par la base, pour CE couple.
  const stored = await admin!.rpc("lead_report_en_begin", {
    p_dossier: fr.dossierId,
    p_revision_id: fr.revisionId,
    p_content_hash: fr.hash,
  });
  check("état stocké = ready", (stored.data as { state?: string } | null)?.state === "ready");

  // 4. Original client intact : snapshot et sourceLocale inchangés.
  const view = await owner.client.rpc("lead_client_view", { p_dossier: fr.dossierId });
  const snap = ((view.data as { revisions?: { snapshot?: Record<string, unknown> }[] } | null)?.revisions ??
    [])[0]?.snapshot;
  check("original conservé (sourceLocale fr)", snap?.["sourceLocale"] === "fr");
  check(
    "original conservé (texte source non traduit)",
    typeof snap?.["title"] === "string" && (snap["title"] as string).includes("E2E"),
  );
  check("vue client sans version anglaise", !(view.data as Record<string, unknown>)?.["reports_en"]);

  // 5. Autres langues source : JA et RU.
  for (const [loc, goal] of [
    ["ja", "機械のカバーが閉じた位置を検出すること。"],
    ["ru", "Определять закрытое положение крышки машины."],
  ] as const) {
    const s = await submit(owner, loc, goal);
    const r = await runEnglishReport(deps(), {
      accessToken: owner.token,
      dossierId: s.dossierId,
      revisionId: s.revisionId,
      contentHash: s.hash,
    });
    check(`pipeline réel ${loc.toUpperCase()} → ready`, r.state === "ready", JSON.stringify(r));
    const v = await owner.client.rpc("lead_client_view", { p_dossier: s.dossierId });
    const sn = ((v.data as { revisions?: { snapshot?: Record<string, unknown> }[] } | null)?.revisions ??
      [])[0]?.snapshot;
    check(`original ${loc} immuable`, sn?.["sourceLocale"] === loc);
  }

  // 6. Refus : autre utilisateur, mauvais hash, consentement absent, NDA exigé.
  const calls = providerCalls;
  const wrongUser = await runEnglishReport(deps(), {
    accessToken: other.token,
    dossierId: fr.dossierId,
    revisionId: fr.revisionId,
    contentHash: fr.hash,
  });
  check(
    "autre utilisateur refusé",
    wrongUser.state === "pending" && wrongUser.code === "NOT_ALLOWED",
    JSON.stringify(wrongUser),
  );

  const badHash = await runEnglishReport(deps(), {
    accessToken: owner.token,
    dossierId: fr.dossierId,
    revisionId: fr.revisionId,
    contentHash: "b".repeat(64),
  });
  check(
    "empreinte fausse refusée",
    badHash.state === "pending" && badHash.code === "CONTENT_HASH_MISMATCH",
    JSON.stringify(badHash),
  );

  const noConsent = await submit(owner, "fr", "Détecter l'ouverture du capot.", {
    withAiConsent: false,
  });
  const noConsentOut = await runEnglishReport(deps(), {
    accessToken: owner.token,
    dossierId: noConsent.dossierId,
    revisionId: noConsent.revisionId,
    contentHash: noConsent.hash,
  });
  check(
    "consentement ai_assistant absent → refus",
    noConsentOut.state === "pending" && noConsentOut.code === "AI_CONSENT_MISSING",
    JSON.stringify(noConsentOut),
  );

  let ndaChecked = "non testé";
  try {
    const nda = await submit(owner, "fr", "Détecter la présence de la pièce.", { ndaRequired: true });
    const ndaOut = await runEnglishReport(deps(), {
      accessToken: owner.token,
      dossierId: nda.dossierId,
      revisionId: nda.revisionId,
      contentHash: nda.hash,
    });
    check(
      "NDA exigé sans preuve → refus",
      ndaOut.state === "pending" && ndaOut.code === "NDA_NOT_IN_FORCE",
      JSON.stringify(ndaOut),
    );
    ndaChecked = "testé au niveau traduction";
  } catch (err) {
    // La soumission elle-même est déjà bloquée par NDA_NOT_IN_FORCE : le refus
    // se produit AVANT toute révision, donc avant toute traduction possible.
    const msg = err instanceof Error ? err.message : String(err);
    check("NDA exigé bloque déjà la soumission", msg.includes("NDA_NOT_IN_FORCE"), msg);
    ndaChecked = "bloqué dès la soumission";
  }
  check("aucun appel fournisseur sur les refus", providerCalls === calls, `appels=${providerCalls - calls}`);

  // 7. Projection staff : nécessite un rôle staff affecté, non attribuable ici.
  const staffTry = await owner.client.rpc("lead_staff_view", { p_dossier: fr.dossierId });
  check("vue staff refusée à un non-staff", Boolean(staffTry.error), staffTry.error?.message ?? "");

  console.log(`\nNDA : ${ndaChecked}`);
  console.log(`appels fournisseur réels : ${providerCalls}`);
}

async function cleanup() {
  for (const id of created.users) {
    const { error } = await admin!.auth.admin.deleteUser(id);
    if (error) console.log(`nettoyage utilisateur ${id} impossible : ${error.message}`);
  }
  console.log(`dossiers synthétiques créés : ${created.dossiers.join(", ") || "aucun"}`);
}

main()
  .catch((err) => {
    failures += 1;
    console.error("ERREUR:", err instanceof Error ? err.message : String(err));
  })
  .then(cleanup)
  .then(() => {
    console.log(failures === 0 ? "\nRÉSULTAT: tout est passé" : `\nRÉSULTAT: ${failures} échec(s)`);
    process.exit(failures === 0 ? 0 : 1);
  });
