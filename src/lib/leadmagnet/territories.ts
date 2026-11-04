export interface GeoRegion {
  code: string;
  country: string;
  name: string;
}
export interface GeoCity {
  id: string;
  name: string;
  country: string;
  region_code: string;
  region_name: string;
  district: string;
}
export interface Territory {
  country: string;
  version: number;
  owner: string | null;
  region_owners: Record<string, string>;
}
export interface SalesProfile {
  person_id: string;
  photo_path: string | null;
  microsoft_photo_path: string | null;
  microsoft_user_id: string | null;
  booking_url: string | null;
  version: number;
}
export interface SalesOverview {
  industries?: import("./industries").IndustryResponsibility[];
  territories: Territory[];
  regions: GeoRegion[];
  imports: { country: string; place_count: number; imported_at: string }[];
  profiles: SalesProfile[];
}
export interface RoutedContact {
  id: string;
  name: string;
  photo_path: string | null;
  microsoft_photo_path: string | null;
  booking_url: string | null;
  country: string;
  region_code: string | null;
}
export interface ContactResult {
  reason: "assigned" | "region_required" | "uncovered";
  contact: RoutedContact | null;
}
export type TerritoryOperation = "country" | "regions" | "remove_country" | "remove_regions";
/** Review only: the authoritative transaction repeats these rules under a lock. */
export function territoryPreview(
  current: Territory,
  person: string,
  operation: TerritoryOperation,
  regions: string[],
  catalog: GeoRegion[],
): Territory {
  const next: Territory = { ...current, region_owners: { ...current.region_owners } };
  if (operation === "country") return { ...next, owner: person, region_owners: {} };
  if (operation === "remove_country")
    return {
      ...next,
      owner: next.owner === person ? null : next.owner,
      region_owners: Object.fromEntries(
        Object.entries(next.region_owners).filter(([, owner]) => owner !== person),
      ),
    };
  if (
    !regions.length ||
    regions.some((code) => !catalog.some((r) => r.country === current.country && r.code === code))
  )
    throw new Error("BAD_REGIONS");
  if (operation === "regions") {
    if (next.owner) {
      next.region_owners = Object.fromEntries(
        catalog.filter((r) => r.country === current.country).map((r) => [r.code, next.owner!]),
      );
      next.owner = null;
    }
    for (const code of regions) next.region_owners[code] = person;
  } else {
    if (next.owner) throw new Error("SPLIT_FIRST");
    for (const code of regions)
      if (next.region_owners[code] === person) delete next.region_owners[code];
  }
  return next;
}
export function profilePhotoPaths(
  profile: Pick<SalesProfile, "photo_path" | "microsoft_photo_path"> | null,
): string[] {
  return [
    ...new Set(
      [profile?.photo_path, profile?.microsoft_photo_path].filter((p): p is string => !!p),
    ),
  ];
}
export const PHOTO_BYTES = 2 * 1024 * 1024;
export function photoExtension(type: string): string | null {
  return (
    ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[
      type
    ] ?? null
  );
}
export function cityBusiness(city: GeoCity) {
  return {
    siteCity: city.name,
    siteCountry: city.country,
    siteCityId: city.id,
    siteRegionCode: city.region_code,
    siteRegionName: city.region_name,
  };
}
export const clearCityResolution = { siteCityId: null, siteRegionCode: null, siteRegionName: null };
