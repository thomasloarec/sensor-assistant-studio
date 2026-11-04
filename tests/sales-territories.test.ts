import { expect, test } from "bun:test";
import {
  territoryPreview,
  profilePhotoPaths,
  cityBusiness,
  clearCityResolution,
  photoExtension,
} from "../src/lib/leadmagnet/territories";
test("split preview keeps every other region with the original owner", () => {
  const catalog = ["FR.11", "FR.53", "FR.44"].map((code) => ({ code, country: "FR", name: code }));
  const original = { country: "FR", owner: "Gilles", region_owners: {}, version: 3 };
  const next = territoryPreview(original, "Thomas", "regions", ["FR.53"], catalog);
  expect(next.region_owners).toEqual({ "FR.11": "Gilles", "FR.53": "Thomas", "FR.44": "Gilles" });
  expect(original.owner).toBe("Gilles");
  expect(territoryPreview(next, "Thomas", "country", [], catalog)).toMatchObject({
    owner: "Thomas",
    region_owners: {},
  });
});
test("photo priority, MIME filtering, and city reset", () => {
  expect(profilePhotoPaths({ photo_path: "manual", microsoft_photo_path: "microsoft" })).toEqual([
    "manual",
    "microsoft",
  ]);
  expect(profilePhotoPaths({ photo_path: null, microsoft_photo_path: "microsoft" })).toEqual([
    "microsoft",
  ]);
  expect(profilePhotoPaths(null)).toEqual([]);
  expect(photoExtension("image/svg+xml")).toBeNull();
  const b = cityBusiness({
    id: "1",
    name: "Paris",
    country: "FR",
    region_code: "FR.11",
    region_name: "Île-de-France",
    district: "75",
  });
  expect({ ...b, ...clearCityResolution, siteCity: "Lyon" }).toMatchObject({
    siteCityId: null,
    siteRegionCode: null,
    siteRegionName: null,
  });
});
