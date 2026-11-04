import { useEffect, useRef, useState } from "react";
import { t, getLocale } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/react";
import { COUNTRY_CODES } from "@/lib/leadmagnet/sales-contact";
import { countryDisplayName } from "@/lib/leadmagnet/country-labels";
import { searchCities, fetchSalesContact } from "@/lib/leadmagnet/territory-adapter";
import {
  cityBusiness,
  clearCityResolution,
  type GeoCity,
  type ContactResult,
} from "@/lib/leadmagnet/territories";
import type { BusinessMeta } from "@/lib/leadmagnet/dossier";
import { hasConfirmedIndustry } from "@/lib/leadmagnet/industries";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
export function SiteLocation({
  business,
  onChange,
}: {
  business: BusinessMeta;
  onChange: (patch: Partial<BusinessMeta>) => void;
}) {
  useLocale();
  const [cities, setCities] = useState<GeoCity[]>([]),
    [ready, setReady] = useState<boolean | null>(null),
    [busy, setBusy] = useState(false),
    [unavailable, setUnavailable] = useState(false);
  const [contact, setContact] = useState<ContactResult | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const gen = ++seq.current;
    setCities([]);
    setReady(null);
    setUnavailable(false);
    setBusy(false);
    if (!business.siteCountry || business.siteCityId) return;
    const timer = setTimeout(() => {
      setBusy(true);
      searchCities(business.siteCountry!, business.siteCity ?? "")
        .then((r) => {
          if (gen === seq.current) {
            setReady(r.ready);
            setCities(r.cities);
          }
        })
        .catch(() => {
          if (gen === seq.current) setUnavailable(true);
        })
        .finally(() => {
          if (gen === seq.current) setBusy(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      seq.current++;
    };
  }, [business.siteCountry, business.siteCity, business.siteCityId]);
  useEffect(() => {
    let live = true;
    setContact(null);
    if (business.siteCountry && hasConfirmedIndustry(business))
      void fetchSalesContact(business.siteCountry, business.siteCityId ?? null, business.industry ?? null)
        .then((r) => {
          if (live) setContact(r);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [business.siteCountry, business.siteCityId, business.industry, business.industryConfirmed]);
  const countries = COUNTRY_CODES.map((code) => ({
    code,
    name: countryDisplayName(code, getLocale()),
  })).sort((a, b) => a.name.localeCompare(b.name, getLocale()));
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="site-country" className="t-body">
          {t("Pays du site")} *
        </Label>
        <select
          id="site-country"
          required
          className="t-body min-h-11 w-full rounded-[var(--r-sm)] bg-[var(--surface-sunken)] p-3"
          value={business.siteCountry ?? ""}
          onChange={(e) =>
            onChange({
              siteCountry: e.target.value || null,
              siteCity: null,
              ...clearCityResolution,
            })
          }
        >
          <option value="">{t("Sélectionnez le pays de votre site")}</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="site-city" className="t-body">
          {t("Ville du site")} *
        </Label>
        <Input
          id="site-city"
          autoComplete="off"
          required
          maxLength={160}
          disabled={!business.siteCountry}
          value={business.siteCity ?? ""}
          onChange={(e) => onChange({ siteCity: e.target.value || null, ...clearCityResolution })}
          aria-describedby="city-help"
        />
        <p id="city-help" className="t-caption">
          {t("Choisissez votre ville dans les résultats pour confirmer sa région.")}
        </p>
      </div>
      {busy ? (
        <p role="status" className="t-caption">
          {t("Recherche en cours…")}
        </p>
      ) : null}
      {cities.length ? (
        <ul
          aria-label={t("Villes proposées")}
          className="panel-block max-h-64 overflow-y-auto space-y-1"
        >
          {cities.map((c) => (
            <li key={c.id}>
              <Button
                type="button"
                variant="ghost"
                className="w-full min-h-11 h-auto justify-start text-left whitespace-normal"
                onClick={() => onChange(cityBusiness(c))}
              >
                {c.name} · {c.region_name}
                {c.district ? " · " + c.district : ""}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {business.siteCityId ? (
        <p className="notice-success t-body">
          {t("Région confirmée")} : {business.siteRegionName}
        </p>
      ) : null}
      {unavailable || ready === false ? (
        <p className="notice-warning t-body">
          {t(
            "La recherche de villes est indisponible pour ce pays. Vous pouvez envoyer votre projet ; Standex vérifiera son affectation.",
          )}
        </p>
      ) : null}
      {ready &&
      !busy &&
      !cities.length &&
      !business.siteCityId &&
      (business.siteCity?.length ?? 0) >= 2 ? (
        <p className="notice-info t-body">
          {t(
            "Aucune ville trouvée. Précisez le nom ou conservez votre saisie pour une vérification par Standex.",
          )}
        </p>
      ) : null}
      {contact?.contact ? (
        <p className="t-body">
          {t("Votre responsable Standex")} : {contact.contact.name}
        </p>
      ) : contact?.reason === "region_required" ? (
        <p className="notice-info t-body">
          {t(
            "Ce pays est partagé entre plusieurs commerciaux. Confirmez votre ville pour identifier votre responsable.",
          )}
        </p>
      ) : null}
      <p className="t-caption">
        {t("Référentiel géographique")} :{" "}
        <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">
          {t("GeoNames")}
        </a>{" "}
        · CC BY 4.0
      </p>
    </div>
  );
}
