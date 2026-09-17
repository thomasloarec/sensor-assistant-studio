export const COUNTRY_CODES =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " ",
  );
export const validSiteCountry = (code: string | null | undefined): boolean =>
  COUNTRY_CODES.includes(code ?? "");

export interface SalesContact {
  id: "france" | "germany" | "international";
  name: string;
  territory: string;
  photo: string;
}

// i18n-canonical: territory labels are translated at render time.
const CONTACTS: Record<SalesContact["id"], SalesContact> = {
  france: {
    id: "france",
    name: "Thomas LOAREC",
    territory: "Responsable Standex — France",
    photo: "/team/thomas-loarec.jpg",
  },
  germany: {
    id: "germany",
    name: "Thomas FRANKE",
    territory: "Responsable Standex — Allemagne",
    photo: "/team/thomas-franke.jpg",
  },
  international: {
    id: "international",
    name: "Hemant SINGH",
    territory: "Responsable Standex — autres pays",
    photo: "/team/hemant-singh.jpg",
  },
};

export function salesContactFor(country: string | null | undefined): SalesContact | null {
  if (!validSiteCountry(country)) return null;
  return CONTACTS[country === "FR" ? "france" : country === "DE" ? "germany" : "international"];
}

/** Configuration only, never accept a booking target from a client dossier. */
export function bookingUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
