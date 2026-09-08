import { describe, expect, test } from "bun:test";
import { stableStringify } from "../src/lib/leadmagnet/dossier";

/**
 * PostgreSQL rend les nombres d'un `jsonb` en écriture décimale développée.
 * Le sérialiseur JS doit produire exactement la même chaîne, sinon un vrai
 * snapshot d'atelier (résidus de rotation 3D, très petites coordonnées) est
 * refusé à la soumission avec CONTENT_HASH_MISMATCH.
 * Les valeurs attendues ci-dessous ont été relevées sur PostgreSQL réel
 * (PGlite) via lead_priv.canonical_json.
 */
const CASES: Array<[number, string]> = [
  [1e-7, "0.0000001"],
  [-1e-7, "-0.0000001"],
  [6.123233995736766e-17, "0.00000000000000006123233995736766"],
  [-6.123233995736766e-17, "-0.00000000000000006123233995736766"],
  [1e21, "1000000000000000000000"],
  [-1e21, "-1000000000000000000000"],
  [1e-6, "0.000001"],
  [-0.000001, "-0.000001"],
  [0.123456789, "0.123456789"],
  [1000, "1000"],
  [0, "0"],
  [-0, "0"],
  [123456789012345680000, "123456789012345680000"],
];

describe("sérialisation canonique des nombres", () => {
  test("aucune notation exponentielle ne subsiste", () => {
    for (const [value, expected] of CASES) {
      expect(stableStringify(value)).toBe(expected);
      expect(stableStringify({ a: value })).toBe(`{"a":${expected}}`);
      expect(stableStringify([value])).toBe(`[${expected}]`);
    }
  });

  test("les valeurs ne sont ni arrondies ni modifiées", () => {
    for (const [value] of CASES) {
      expect(Number(stableStringify(value))).toBe(value === 0 ? 0 : value);
    }
  });

  test("les nombres non finis restent refusés en null", () => {
    expect(stableStringify(Number.NaN)).toBe("null");
    expect(stableStringify(Number.POSITIVE_INFINITY)).toBe("null");
    expect(stableStringify(Number.NEGATIVE_INFINITY)).toBe("null");
  });
});
