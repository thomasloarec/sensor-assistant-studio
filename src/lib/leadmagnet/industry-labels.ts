import { t } from "@/lib/i18n/core";
import { isIndustry, type Industry } from "./industries";

/** Presentation only: saved values and routing always use the Quickbase identifiers. */
const INDUSTRY_LABELS = {
  "Appliances": "Électroménager",
  "RnD University, Laboratory": "Recherche et développement, universités et laboratoires",
  "Fluid Flow": "Écoulement des fluides",
  "Distributors": "Distributeurs",
  "Alternative Energy": "Énergies alternatives",
  "SME Locations": "Sites SME",
  "Industrial Applications": "Applications industrielles",
  "HVAC": "Chauffage, ventilation et climatisation",
  "Test & Measurement": "Essais et mesures",
  "Lighting": "Éclairage",
  "Medical": "Médical",
  "Agriculture & Construction Equipment": "Équipements agricoles et de construction",
  "Contract Manufacturer": "Fabrication sous contrat",
  "Security": "Sécurité",
  "Automotive": "Automobile",
  "Mil-Aero & Space": "Défense, aéronautique et spatial",
  "Meters": "Compteurs",
  "Representatives": "Représentants",
  "Consumer Electronics & Toys": "Électronique grand public et jouets",
  "Telecommunications, IT": "Télécommunications et informatique",
  "Transportation": "Transport"
} satisfies Record<Industry, string>;

export function industryDisplayName(value: string, tr: (source: string) => string = t): string {
  return isIndustry(value) ? tr(INDUSTRY_LABELS[value]) : value;
}
