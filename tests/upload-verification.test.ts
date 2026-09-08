/** Vérification serveur des fichiers déposés + garde-fous de reprise de variante.
 *
 * Ces tests portent sur les règles qui décident si un fichier peut être ANNONCÉ
 * dans une soumission. Aucun backend réel n'est contacté.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { verifyUploadedFile } from "../src/lib/leadmagnet/supabase-adapter";
import { applyVariant } from "../src/lib/leadmagnet/variant";
import { createDossier } from "../src/lib/leadmagnet/dossier";

const EDGE = readFileSync("supabase/edge-functions-src/lead-verify-upload/index.ts", "utf8");
const ADAPTER = readFileSync("src/lib/leadmagnet/supabase-adapter.ts", "utf8");
const SQL = readFileSync("supabase/schema/migration_v1.2_lead_magnet.sql", "utf8");

test("sans backend configuré, aucune vérification n'est simulée", async () => {
  const out = await verifyUploadedFile("00000000-0000-0000-0000-000000000000", "a/b.glb");
  expect(out.verified).toBe(false);
  expect(out.error).toBeTruthy();
});

test("la vérification passe par la fonction Edge Supabase, pas par une route applicative", () => {
  expect(ADAPTER).toContain('supabase.functions.invoke("lead-verify-upload"');
  expect(ADAPTER).not.toContain("/api/lead/verify-upload");
  // Sans horodatage de vérification renvoyé par le serveur, le fichier reste refusé.
  expect(ADAPTER).toContain("verified_at");
});

test("la fonction Edge refuse d'inventer un résultat sans clé de service", () => {
  expect(EDGE).toContain("NOT_CONFIGURED");
  expect(EDGE).toContain("503");
  // Lecture sous les droits de l'appelant, écriture par la seule fonction habilitée.
  expect(EDGE).toContain("Authorization: authorization");
  expect(EDGE).toContain("lead_finalize_upload");
  // Le hash est recalculé sur les octets relus, jamais repris du client.
  expect(EDGE).toContain('crypto.subtle.digest("SHA-256"');
  expect(EDGE).not.toContain("body.sha256");
  // Identité validée auprès du serveur d'authentification.
  expect(EDGE).toContain("caller.auth.getUser");
});

test("le SQL n'accepte un fichier qu'après relecture serveur", () => {
  expect(SQL).toContain("s.verified_sha256 = lower(f->>'sha256')");
  expect(SQL).toContain("s.verified_object_path = f->>'path'");
  // La finalisation est fermée au client : seul le service_role l'exécute.
  expect(SQL).toContain("lead_priv.finalize_upload");
  expect(SQL).toMatch(/lead_finalize_upload[\s\S]*?to service_role/);
  // Un fichier déposé n'est plus remplaçable : aucune policy UPDATE/DELETE client.
  expect(SQL).not.toContain("create policy lead_files_update");
  expect(SQL).not.toContain("create policy lead_files_delete");
  // La session est refermée dès la finalisation.
  expect(SQL).toContain("verified_at = now(), closed_at = now()");
});

test("le SQL conserve la version réellement commandée d'un échantillon", () => {
  expect(SQL).toContain("origin_revision");
  expect(SQL).toContain("revalidated_from_revision");
  expect(SQL).toContain("origin_revision = coalesce(origin_revision, revision)");
  // La revalidation ne mute plus la révision commandée.
  expect(SQL).toContain("revalidated_for_revision = d.current_revision");
  expect(SQL).not.toContain("revision = d.current_revision, review_id = rv.id");
});

test("une exigence sans état ni source est refusée", () => {
  expect(SQL).toContain("r->>'state' is null");
  expect(SQL).toContain("r->>'source' is null");
});


test("une variante n'écrase jamais la version d'origine du dossier", () => {
  const base = createDossier("2026-09-08T00:00:00.000Z");
  const before = JSON.stringify(base);
  const out = applyVariant(base, {
    summary: "Réserve allongée",
    cable: { serviceReserveMm: 40 },
  } as never);
  expect(JSON.stringify(base)).toBe(before);
  expect(out.dossier.cabling.serviceReserveMm).toBe(40);
});

test("une variante aux valeurs impossibles n'est pas appliquée", () => {
  const base = createDossier("2026-09-08T00:00:00.000Z");
  const out = applyVariant(base, {
    summary: "Réserve absurde",
    cable: { serviceReserveMm: -5 },
  } as never);
  expect(out.dossier.cabling.serviceReserveMm).toBe(base.cabling.serviceReserveMm);
  expect(out.notApplied.length).toBeGreaterThan(0);
});
