/**
 * Test réel minimal de la clé serveur et des RPC V1.6.
 * Lecture seule : utilise des UUIDs aléatoires, aucune donnée client.
 */
import { serviceClient } from "../src/lib/leadmagnet/english-report.server";

async function main() {
  const admin = serviceClient();
  if (!admin) {
    console.error("FAIL: serviceClient() n'a pas pu être créé (clé absente ?)");
    process.exit(1);
  }

  const randomUuid = crypto.randomUUID();
  const randomHash = "a".repeat(64);

  try {
    const { data, error } = await admin.rpc("lead_report_en_authorize", {
      p_user: randomUuid,
      p_dossier: randomUuid,
      p_revision_id: randomUuid,
      p_content_hash: randomHash,
    });

    if (error) {
      console.error("FAIL: RPC a renvoyé une erreur", error.message);
      process.exit(1);
    }

    console.log("OK: clé serveur active et RPC V1.6 atteignable.");
    console.log("Réponse (synthétique):", JSON.stringify(data));
  } catch (err) {
    console.error("FAIL: exception lors de l'appel RPC", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
