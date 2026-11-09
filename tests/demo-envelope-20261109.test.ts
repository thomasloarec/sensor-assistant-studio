import { expect, test } from "bun:test";
import { detectEnvelopeFromText } from "../src/lib/leadmagnet/envelope-text";
import { t, LANGUAGES } from "../src/lib/i18n/core";

test("the exact fridge demonstration statement recognizes the available space", () => {
  const result = detectEnvelopeFromText([], "the sensor is at the top of the fridge and the magnet is on top of the moving door. I have a space of only 40x40x20mm.");
  expect(result).toMatchObject({ kind: "found", envelope: { lengthMm: 40, widthMm: 40, heightMm: 20 } });
});

test("natural space statements preserve units, ambiguity and unrelated-object protection", () => {
  for (const text of ["I only have a space of 4×4×2cm", "We have only 40x40x20mm", "J'ai un espace de seulement 40x40x20mm"]) {
    if (text.startsWith("We")) expect(detectEnvelopeFromText([], text)).toBeNull();
    else expect(detectEnvelopeFromText([], text)).toMatchObject({ kind: "found", envelope: { lengthMm: 40, widthMm: 40, heightMm: 20 } });
  }
  expect(detectEnvelopeFromText([], "I have a space of only 40x40x20")).toMatchObject({ kind: "ambiguous" });
  expect(detectEnvelopeFromText([], "I have a space of 40x40x20mm or 30x30x20mm")).toMatchObject({ kind: "ambiguous" });
  expect(detectEnvelopeFromText([], "I have a space of 40x40x20mm for the magnet")).toBeNull();
  expect(detectEnvelopeFromText([], "The fridge is 400x400x200mm")).toBeNull();
});

test("all height translations exist, including English", () => {
  expect(t("Hauteur", "en")).toBe("Height");
  for (const { id } of LANGUAGES.filter(l => l.id !== "fr")) expect(t("Hauteur", id)).not.toBe("Hauteur");
});
