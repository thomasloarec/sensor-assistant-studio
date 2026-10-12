import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { businessContextErrorFields, humanRpcError } from "@/lib/leadmagnet/rpc";
import { LANGUAGES, t } from "@/lib/i18n/core";
import messages from "@/lib/i18n/messages.json";
import { localizedValidationText } from "@/components/leadmagnet/localized-validation-message";

const labels = ["Volume annuel de capteurs", "Phase du projet", "Date de lancement série", "Durée de série (années)"];
const ids = ["annualVolume", "projectPhase", "seriesStartDate", "seriesDurationYears"];

describe("Refus métier : identifiants autorisés uniquement", () => {
  for (let i = 0; i < ids.length; i++) test(`champ exact ${ids[i]}`, () => {
    const text = humanRpcError({ message: `BUSINESS_CONTEXT_REQUIRED:${ids[i]}` });
    expect(text).toContain(labels[i]);
    expect(text).toContain("Non défini pour le moment");
    expect(text).not.toContain(ids[i]);
    for (let j = 0; j < labels.length; j++) if (j !== i) expect(text).not.toContain(labels[j]);
  });
  test("plusieurs champs, ordre stable et dédoublonnage", () => {
    expect(businessContextErrorFields("BUSINESS_CONTEXT_REQUIRED:seriesStartDate, annualVolume,seriesStartDate,__proto__"))
      .toEqual([labels[2], labels[0]]);
    expect(humanRpcError("BUSINESS_CONTEXT_REQUIRED:seriesStartDate,annualVolume"))
      .toContain("Date de lancement série, Volume annuel de capteurs");
  });
  for (const raw of [
    "BUSINESS_CONTEXT_REQUIRED", "BUSINESS_CONTEXT_REQUIRED:",
    "BUSINESS_CONTEXT_REQUIRED:unknown,__proto__,constructor,toString",
    "BUSINESS_CONTEXT_REQUIRED:annualVolumeSQL", "BUSINESS_CONTEXT_REQUIRED:<script>annualVolume</script>",
    "OTHER_CODE:annualVolume", "NOT_BUSINESS_CONTEXT_REQUIRED:annualVolume",
    "BUSINESS_CONTEXT_REQUIRED:annualVolume\nsecret database detail",
  ]) test(`repli sans fuite : ${JSON.stringify(raw)}`, () => {
    expect(businessContextErrorFields(raw)).toEqual([]);
    const text = humanRpcError({ message: raw });
    expect(text).not.toContain("<script>");
    expect(text).not.toContain("secret database detail");
    expect(text).not.toContain("__proto__");
  });
  test("champ inconnu ignoré à côté d'un champ valide", () => {
    const text = humanRpcError("BUSINESS_CONTEXT_REQUIRED:unknown,projectPhase,constructor");
    expect(text).toContain(labels[1]);
    expect(text).not.toContain("unknown");
    expect(text).not.toContain("constructor");
  });
  test("autres erreurs inchangées", () => {
    expect(humanRpcError("AUTH_REQUIRED")).toBe("Connectez-vous pour envoyer votre projet à Standex.");
    expect(humanRpcError("PGRST202")).toContain("pas encore disponible");
    expect(humanRpcError(null)).toContain("dossier reste intact");
    expect(localizedValidationText(humanRpcError("BUSINESS_CONTEXT_REQUIRED:projectPhase"))).toBeTruthy();
  });
  for (const { id } of LANGUAGES) for (let n = 1; n <= 4; n++) test(`${id} — ${n} champs précis traduits`, () => {
    const raw = humanRpcError(`BUSINESS_CONTEXT_REQUIRED:${ids.slice(0, n).join(",")}`);
    const translated = t(raw, id);
    for (const label of labels.slice(0, n)) expect(translated).toContain(t(label, id));
    expect(translated).not.toMatch(/\{\d+\}/);
    if (id !== "fr") expect(translated).not.toContain("Contexte projet à compléter");
  });
});

describe("Connecteurs : source et présentation partagées", () => {
  test("les deux chemins montent le même sélecteur et gardent les formulaires manuels repliés", () => {
    const src = readFileSync("src/components/leadmagnet/design-space.tsx", "utf8");
    expect(src.match(/<ConnectorChoices termination=/g)).toHaveLength(2);
    expect(src).not.toContain("<ConnectorPreview");
    expect(src.match(/t\("Saisir une référence précise"\)/g)).toHaveLength(2);
    expect(src).toContain("termination: terminationFromHousing(found)");
  });
  test("le caption d'aperçu ne répète pas le titre", () => {
    const src = readFileSync("src/components/leadmagnet/connector-preview.tsx", "utf8");
    const caption = src.slice(src.indexOf("export function ConnectorGeometryDetails"), src.indexOf("export function ConnectorPreview"));
    expect(caption).not.toContain("housingLabel");
    expect(caption).toContain("Source fabricant");
    expect(src).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });
  test("les nouveaux textes ont les sept traductions, sans repli français", () => {
    const dictionary = messages as Record<string, string[]>;
    for (const key of ["Compatibilité à confirmer par Standex", "{0} voies · pas {1} mm",
      "Détails techniques · sources et compatibilité", "Référence du contact", "Plage de fil documentée",
      "Câble, genre des contacts, sertissage et conditions d'usage restent à confirmer avant commande."]) {
      expect(dictionary[key]).toHaveLength(7);
      for (const locale of LANGUAGES) if (locale.id !== "fr") expect(t(key, locale.id)).not.toBe(key);
    }
  });
});