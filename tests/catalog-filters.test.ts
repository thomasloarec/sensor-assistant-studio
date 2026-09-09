import { afterEach, describe, expect, test } from "bun:test";
import { setLocale } from "../src/lib/i18n/core";
import {
  CATALOG_ALL,
  EMPTY_CATALOG_FILTERS,
  documentedCount,
  filterCatalog,
  fixingGroup,
  wiringGroup,
} from "../src/lib/standex/catalog-filters";
import {
  CUSTOM_SENSOR_ID,
  SENSOR_CATALOG,
  overallEnvelope,
  sensorById,
} from "../src/lib/standex/sensor-catalog";

const ids = (f = EMPTY_CATALOG_FILTERS) => filterCatalog(f).map((s) => s.id);

afterEach(() => setLocale("fr"));

describe("filtres du catalogue : valeurs canoniques, indépendantes de la langue", () => {
  test("sans filtre, tout le catalogue sort dans les huit langues", () => {
    for (const locale of ["fr", "en", "de", "zh", "es", "ru", "it", "ja"] as const) {
      setLocale(locale);
      expect(ids()).toHaveLength(SENSOR_CATALOG.length);
      expect(documentedCount(filterCatalog(EMPTY_CATALOG_FILTERS))).toBe(
        SENSOR_CATALOG.length - 1,
      );
    }
  });

  test("une catégorie brute filtre pareil en anglais, en allemand et après changement de langue", () => {
    const filters = { ...EMPTY_CATALOG_FILTERS, category: "À visser" };
    setLocale("fr");
    const french = ids(filters);
    expect(french.length).toBeGreaterThan(3);
    for (const locale of ["en", "de", "ja"] as const) {
      setLocale(locale);
      expect(ids(filters)).toEqual(french);
    }
    // Retour au français : aucun état de filtre n'a été traduit en route.
    setLocale("fr");
    expect(ids(filters)).toEqual(french);
  });

  test("le sur mesure reste listé même quand aucun capteur documenté ne passe", () => {
    const impossible = {
      ...EMPTY_CATALOG_FILTERS,
      category: "CMS",
      maxLength: "0.1",
    };
    for (const locale of ["fr", "en", "de"] as const) {
      setLocale(locale);
      const list = filterCatalog(impossible);
      expect(list.map((s) => s.id)).toEqual([CUSTOM_SENSOR_ID]);
      expect(documentedCount(list)).toBe(0);
    }
  });

  test("un champ de cote vide ne vaut pas 0 mm", () => {
    expect(ids({ ...EMPTY_CATALOG_FILTERS, maxLength: "", maxWidth: "", maxHeight: "" })).toEqual(
      ids(),
    );
    expect(ids({ ...EMPTY_CATALOG_FILTERS, maxLength: "abc" })).toEqual(ids());
  });
});

describe("encombrement : les terminaisons documentées comptent", () => {
  test("MK24-A-J occupe 5,5 mm avec ses connexions, pas 5 mm", () => {
    const mk24 = sensorById("MK24-A-J");
    expect(mk24.body[0]).toBe(5);
    expect(overallEnvelope(mk24)[0]).toBe(5.5);
    expect(ids({ ...EMPTY_CATALOG_FILTERS, maxLength: "5" })).not.toContain("MK24-A-J");
    expect(ids({ ...EMPTY_CATALOG_FILTERS, maxLength: "5,5" })).toContain("MK24-A-J");
  });

  test("sans terminaison documentée, le corps fait foi et rien n'est inventé", () => {
    const mk03 = sensorById("MK03");
    expect(mk03.terminalSpan).toBeUndefined();
    expect(overallEnvelope(mk03)).toEqual([mk03.body[0], mk03.body[1], mk03.body[2]]);
  });

  test("largeur et hauteur filtrent sur les cotes réelles du corps", () => {
    const narrow = ids({ ...EMPTY_CATALOG_FILTERS, maxWidth: "5" });
    for (const id of narrow) {
      if (id === CUSTOM_SENSOR_ID) continue;
      expect(overallEnvelope(sensorById(id))[2]).toBeLessThanOrEqual(5);
    }
    expect(narrow).toContain("MK24-A-J");
  });
});

describe("groupes de fixation et de raccordement : déduits des formes documentées", () => {
  test("chaque modèle reçoit un groupe, sans invention de sortie câble", () => {
    for (const s of SENSOR_CATALOG) {
      expect(fixingGroup(s)).not.toBe("");
      expect(wiringGroup(s)).not.toBe("");
    }
    expect(wiringGroup(sensorById("MK24-A-J"))).toBe("smd");
    expect(wiringGroup(sensorById("GENERIC"))).toBe("leads");
    expect(wiringGroup(sensorById(CUSTOM_SENSOR_ID))).toBe("leads");
    // MK21 n'a pas de `cableSide` mais sa fiche décrit bien une sortie câble,
    // comme le MK21PR qui n'en inverse que le côté.
    expect(wiringGroup(sensorById("MK21"))).toBe("cable");
    expect(wiringGroup(sensorById("MK21PR"))).toBe("cable");
    expect(wiringGroup(sensorById("MK11-M5"))).toBe("cable");
    expect(wiringGroup(sensorById("MK27"))).toBe("cable");
    // Sortie non décrite dans les sources reprises : reste « non documenté ».
    expect(wiringGroup(sensorById("MK36"))).toBe("unknown");
  });

  test("le filtre raccordement ne retient que le groupe demandé", () => {
    const cable = ids({ ...EMPTY_CATALOG_FILTERS, wiring: "cable" });
    for (const id of cable) {
      if (id === CUSTOM_SENSOR_ID) continue;
      expect(wiringGroup(sensorById(id))).toBe("cable");
    }
    expect(CATALOG_ALL).toBe("all");
  });
});
