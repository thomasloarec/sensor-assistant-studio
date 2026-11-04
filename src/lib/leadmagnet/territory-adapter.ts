import { supabase } from "@/lib/standex/supabase";
import { t } from "@/lib/i18n/core";
import { bookingUrl } from "./sales-contact";
import {
  PHOTO_BYTES,
  photoExtension,
  type SalesOverview,
  type ContactResult,
  type GeoCity,
  type TerritoryOperation,
} from "./territories";
export function territoryError(error: unknown): string {
  const code =
    error instanceof Error ? error.message : String((error as { message?: string })?.message ?? "");
  if (/TERRITORY_STALE/.test(code))
    return t("La répartition a changé. Rechargez puis vérifiez à nouveau le transfert.");
  if (/TRANSFER_TERRITORIES_FIRST|TRANSFER_INDUSTRIES_FIRST/.test(code))
    return t(
      "Transférez ou retirez les territoires et les industries de cette personne avant de la désactiver ou de changer sa fonction.",
    );
  if (/CITY_SELECTION_REQUIRED/.test(code))
    return t("Sélectionnez à nouveau la ville dans la liste pour confirmer sa région.");
  if (/INVALID_PHOTO/.test(code))
    return t("Choisissez une image JPEG, PNG ou WebP de moins de 2 Mo.");
  if (/INVALID_BOOKING/.test(code))
    return t("Le lien de réservation doit être une adresse HTTPS valide.");
  return t("Action impossible. Vérifiez votre connexion et vos droits, puis réessayez.");
}
async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error("UNAVAILABLE");
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data as T;
}
export const fetchSalesOverview = () => rpc<SalesOverview>("lead_sales_overview");
export const changeTerritory = (
  country: string,
  person: string,
  operation: TerritoryOperation,
  regions: string[],
  version: number,
) =>
  rpc<SalesOverview>("lead_sales_change", {
    p_country: country,
    p_person: person,
    p_operation: operation,
    p_regions: regions,
    p_version: version,
    p_confirm: true,
  });
export const searchCities = (country: string, query: string) =>
  rpc<{ ready: boolean; cities: GeoCity[] }>("lead_geo_search", {
    p_country: country,
    p_query: query
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase(),
  });
export const fetchSalesContact = (country: string, city: string | null, industry: string | null = null) =>
  rpc<ContactResult>("lead_sales_contact_for_industry", { p_country: country, p_city: city, p_industry: industry });
export const changeIndustryResponsibility = (
  country: string, industry: string, person: string, remove: boolean, version: number,
) => rpc<SalesOverview>("lead_sales_industry_change", {
  p_country: country, p_industry: industry, p_person: person,
  p_remove: remove, p_version: version, p_confirm: true,
});
export const portraitUrl = (path: string) =>
  supabase?.storage.from("sales-portraits").getPublicUrl(path).data.publicUrl ?? "";
export async function saveSalesProfile(
  person: string,
  photo: string | null,
  url: string,
  version: number,
) {
  const booking = url.trim() ? bookingUrl(url.trim()) : null;
  if (url.trim() && !booking) throw new Error("INVALID_BOOKING_URL");
  return rpc<SalesOverview>("lead_sales_profile_save", {
    p_person: person,
    p_photo: photo,
    p_booking: booking,
    p_version: version,
  });
}
/** Decode and re-encode to strip metadata and reject non-images before storage. */
export async function uploadPortrait(person: string, file: File): Promise<string> {
  if (!supabase || !photoExtension(file.type) || file.size > PHOTO_BYTES || file.size === 0)
    throw new Error("INVALID_PHOTO");
  const bitmap = await createImageBitmap(file);
  let blob: Blob | null;
  try {
    if (bitmap.width > 12000 || bitmap.height > 12000 || bitmap.width * bitmap.height > 40000000)
      throw new Error("INVALID_PHOTO");
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
  } finally {
    bitmap.close();
  }
  if (!blob || blob.size > PHOTO_BYTES) throw new Error("INVALID_PHOTO");
  const path = person + "/" + crypto.randomUUID() + ".webp";
  const { error } = await supabase.storage
    .from("sales-portraits")
    .upload(path, blob, { contentType: "image/webp", upsert: false });
  if (error) throw new Error("INVALID_PHOTO");
  return path;
}
export async function removeOrphanPortrait(path: string) {
  await supabase?.storage.from("sales-portraits").remove([path]);
}
