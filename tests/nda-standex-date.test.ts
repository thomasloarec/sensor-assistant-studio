import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  EMPTY_NDA_VALUES,
  fillNdaTemplate,
  missingNdaFields,
  VARIABLE_FIELDS,
} from "../src/lib/leadmagnet/nda-docx";

const values = {
  ...EMPTY_NDA_VALUES,
  companyName: "K Motor",
  companyStreet: "1 rue des Essais",
  companyPostalCity: "13790 Peynier",
  companyCountry: "France",
  signatoryName: "Thomas Loarec",
  signatoryPosition: "Directeur",
  clientPlaceDate: "Peynier, 09.09.2026",
};

describe("date côté Standex", () => {
  test("elle n'est jamais réclamée au client", () => {
    expect(missingNdaFields(EMPTY_NDA_VALUES)).not.toContain("Date côté Standex");
    expect(VARIABLE_FIELDS.find((f) => f.key === "standexDate")?.standexOnly).toBe(true);
  });

  test("la copie client ne contient PAS la date d'origine du modèle", async () => {
    const template = readFileSync("public/legal/nda-standex-k-motor-16062026.docx");
    const filled = await fillNdaTemplate(template, values);
    const paragraph = filled.paragraphs.find((p) => p.includes("Welschingen"));
    expect(paragraph).toBeDefined();
    // La date de Standex reste vide : elle est apposée par Standex à la signature.
    expect(paragraph).not.toContain("16.06.2026");
    expect(paragraph).toContain("Welschingen, Germany");
    // Les clauses et les autres champs sont intacts.
    expect(filled.paragraphs.join("\n")).toContain("K Motor");
    expect(filled.filledFields.map((f) => f.label)).not.toContain("Date côté Standex");
  });
});
