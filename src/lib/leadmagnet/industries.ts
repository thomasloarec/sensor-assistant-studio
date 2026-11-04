/** Stable Quickbase labels: stored verbatim, independent of interface language. */
export const INDUSTRIES = [
  "Appliances",
  "RnD University, Laboratory",
  "Fluid Flow",
  "Distributors",
  "Alternative Energy",
  "SME Locations",
  "Industrial Applications",
  "HVAC",
  "Test & Measurement",
  "Lighting",
  "Medical",
  "Agriculture & Construction Equipment",
  "Contract Manufacturer",
  "Security",
  "Automotive",
  "Mil-Aero & Space",
  "Meters",
  "Representatives",
  "Consumer Electronics & Toys",
  "Telecommunications, IT",
  "Transportation",
] as const;
export type Industry = (typeof INDUSTRIES)[number];
export const isIndustry = (value: unknown): value is Industry =>
  typeof value === "string" && (INDUSTRIES as readonly string[]).includes(value);
export const hasConfirmedIndustry = (business: {
  industry?: string | null | undefined;
  industryConfirmed?: boolean | undefined;
}) => isIndustry(business.industry) && business.industryConfirmed === true;
export interface IndustryResponsibility {
  country: string;
  industry: Industry;
  owner: string | null;
  version: number;
}
