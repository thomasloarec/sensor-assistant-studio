import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import {
  NDA_TEMPLATE_SHA256,
  VARIABLE_FIELDS,
  bodyParagraphTexts,
  fillNdaTemplate,
  missingNdaFields,
  ndaFileName,
  sha256Hex,
  type NdaVariableValues,
} from "../src/lib/leadmagnet/nda-docx";

const TEMPLATE_PATH = "public/legal/nda-standex-k-motor-16062026.docx";
const template = new Uint8Array(readFileSync(TEMPLATE_PATH));
const DOC = "word/document.xml";

const values: NdaVariableValues = {
  companyName: "Acme & Co SARL",
  companyStreet: "12 rue des Lilas",
  companyPostalCity: "75001 Paris",
  companyCountry: "Belgique",
  standexDate: "01.10.2026",
  signatoryName: "Marie Dupont",
  signatoryPosition: "Directrice technique",
  clientPlaceDate: "Paris, 01.10.2026",
};

test("le binaire livré est bien le modèle approuvé", async () => {
  expect(await sha256Hex(template)).toBe(NDA_TEMPLATE_SHA256);
});

test("un fichier qui n'est pas le modèle approuvé est refusé", async () => {
  const tampered = new Uint8Array(template);
  tampered[tampered.length - 1] = (tampered[tampered.length - 1]! + 1) % 256;
  await expect(fillNdaTemplate(tampered, values)).rejects.toThrow(/SHA-256/);
});

test("seuls les champs variables changent, toutes les autres clauses sont identiques", async () => {
  const filled = await fillNdaTemplate(template, values);
  const before = bodyParagraphTexts(new TextDecoder().decode(unzipSync(template)[DOC]!));
  const after = filled.paragraphs;
  expect(after).toHaveLength(before.length);
  const variableIndexes = new Set(VARIABLE_FIELDS.map((f) => f.paragraph));
  before.forEach((text, i) => {
    if (!variableIndexes.has(i)) expect(after[i]).toBe(text);
  });
  expect(after[11]).toBe("Acme & Co SARL");
  expect(after[12]).toBe("12 rue des Lilas");
  expect(after[13]).toBe("75001 Paris");
  expect(after[14]).toBe("Belgique");
  expect(after[84]).toBe("Name : Marie Dupont");
  expect(after[85]).toBe("Position : Directrice technique");
});

test("le lieu Standex et les mentions Stamp/Signature sont préservés, sans signature ajoutée", async () => {
  const filled = await fillNdaTemplate(template, values);
  expect(filled.paragraphs[78]).toBe(
    "Place/date:Welschingen, Germany – 01.10.2026Stamp/Signature:   ___________________",
  );
  expect(filled.paragraphs[86]).toBe(
    "Place/date:Paris, 01.10.2026Stamp/Signature:   ____________________",
  );
  const joined = filled.paragraphs.join("\n");
  expect(joined).toContain("StandexMeder Electronics GmbH");
  expect(joined).toContain("Robert-Bosch-Straße 4");
});

test("tous les autres fichiers du docx restent identiques octet pour octet", async () => {
  const filled = await fillNdaTemplate(template, values);
  const a = unzipSync(template);
  const b = unzipSync(filled.bytes);
  expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
  for (const name of Object.keys(a)) {
    if (name === DOC) continue;
    expect(Buffer.from(b[name]!).equals(Buffer.from(a[name]!))).toBe(true);
  }
  expect(Buffer.from(b[DOC]!).equals(Buffer.from(a[DOC]!))).toBe(false);
});

test("le modèle original n'est jamais modifié en mémoire ni sur disque", async () => {
  const copy = new Uint8Array(template);
  await fillNdaTemplate(template, values);
  expect(Buffer.from(template).equals(Buffer.from(copy))).toBe(true);
  expect(await sha256Hex(new Uint8Array(readFileSync(TEMPLATE_PATH)))).toBe(NDA_TEMPLATE_SHA256);
});

test("champs manquants signalés et nom de fichier explicitement non signé", () => {
  expect(missingNdaFields({ ...values, signatoryName: "  " })).toEqual([
    "Nom du signataire client",
  ]);
  expect(missingNdaFields(values)).toEqual([]);
  expect(ndaFileName(values)).toBe("NDA Standex x Acme_Co_SARL - non signe.docx");
});

test("champ lieu/date client : une seule séparation, plus de tabulations de remplissage", async () => {
  const template = new Uint8Array(readFileSync(TEMPLATE_PATH));
  const filled = await fillNdaTemplate(template, {
    ...FULL_VALUES,
    clientPlaceDate: "Caen, France — 08.09.2026",
  });
  const xml = new TextDecoder().decode(unzipSync(filled.bytes)["word/document.xml"]!);
  const p86 = (() => {
    const r = bodyParagraphRanges(xml)[86]!;
    return xml.slice(r.start, r.end);
  })();
  expect(filled.paragraphs[86]).toBe(
    "Place/date: Caen, France — 08.09.2026 Stamp/Signature:   ____________________",
  );
  expect((p86.match(/<w:tab\/>/g) ?? []).length).toBe(1);
  expect(p86.endsWith("____________________</w:t></w:r></w:p>")).toBe(true);
});

test("valeurs refusées : caractère interdit, saut de ligne, longueur excessive", async () => {
  const template = new Uint8Array(readFileSync(TEMPLATE_PATH));
  for (const bad of ["A\u0000B", "ligne1\nligne2", "x".repeat(201)]) {
    expect(validateNdaValues({ ...FULL_VALUES, clientPlaceDate: bad }).length).toBeGreaterThan(0);
    let refused = false;
    try {
      await fillNdaTemplate(template, { ...FULL_VALUES, clientPlaceDate: bad });
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
  }
  expect(validateNdaValues(FULL_VALUES)).toEqual([]);
});
