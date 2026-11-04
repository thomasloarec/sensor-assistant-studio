import { useEffect, useState } from "react";
import { getLocale, t } from "@/lib/i18n/core";
import { INDUSTRIES } from "@/lib/leadmagnet/industries";
import { COUNTRY_CODES } from "@/lib/leadmagnet/sales-contact";
import { countryDisplayName } from "@/lib/leadmagnet/country-labels";
import type { SalesOverview } from "@/lib/leadmagnet/territories";
import { personFullName, type CrmPerson } from "@/lib/leadmagnet/crm";
import { changeIndustryResponsibility } from "@/lib/leadmagnet/territory-adapter";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function IndustrySettings({
  person,
  people,
  data,
  busy,
  run,
}: {
  person: CrmPerson;
  people: CrmPerson[];
  data: SalesOverview;
  busy: boolean;
  run: (action: () => Promise<SalesOverview>) => Promise<void>;
}) {
  const [country, setCountry] = useState("");
  const [industry, setIndustry] = useState("");
  const [review, setReview] = useState<{
    owner: string | null;
    version: number;
    remove: boolean;
  } | null>(null);
  useEffect(() => setReview(null), [data]);
  const countryName = (c: string) => countryDisplayName(c, getLocale());
  const ownerName = (id: string | null) => {
    const p = people.find((p) => p.id === id);
    return p ? personFullName(p) : t("Responsable géographique");
  };
  const current = data.industries?.find((i) => i.country === country && i.industry === industry);
  const choices = COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) =>
    a.name.localeCompare(b.name, getLocale()),
  );
  const selectClass = "t-body min-h-11 w-full rounded-[var(--r-sm)] bg-[var(--surface-sunken)] p-3";
  return (
    <section className="panel-block space-y-3" aria-label={t("Responsabilités par industrie")}>
      <h4 className="t-title-s">{t("Responsabilités par industrie")}</h4>
      <p className="t-body">
        {t(
          "Une responsabilité par industrie s’applique au pays entier et prime sur la répartition géographique. Sans exception, le responsable géographique prend le relais.",
        )}
      </p>
      <ul className="space-y-2 t-body">
        {data.industries
          ?.filter((i) => i.owner === person.id)
          .map((i) => (
            <li key={i.country + i.industry}>
              {countryName(i.country)} · {i.industry}
            </li>
          ))}
      </ul>
      <Label className="t-body" htmlFor={"industry-country-" + person.id}>
        {t("Pays de l’industrie")}
      </Label>
      <select
        id={"industry-country-" + person.id}
        className={selectClass}
        value={country}
        disabled={busy}
        onChange={(e) => {
          setCountry(e.target.value);
          setReview(null);
        }}
      >
        <option value="">{t("Pays à gérer")}</option>
        {choices.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
      <Label className="t-body" htmlFor={"industry-choice-" + person.id}>
        {t("Industrie")}
      </Label>
      <select
        id={"industry-choice-" + person.id}
        className={selectClass}
        value={industry}
        disabled={busy}
        onChange={(e) => {
          setIndustry(e.target.value);
          setReview(null);
        }}
      >
        <option value="">{t("Choisir une industrie")}</option>
        {INDUSTRIES.map((i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </select>
      {country && industry ? (
        <>
          {current?.owner === person.id ? (
            <p role="status" className="notice-success t-body">
              {t(
                "Cette responsabilité est déjà attribuée à {0}. Vous n’avez rien à enregistrer.",
              ).replace("{0}", personFullName(person))}
            </p>
          ) : (
            <p className="t-body">
              {t("Responsable actuel")} : {ownerName(current?.owner ?? null)}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {current?.owner !== person.id ? (
              <Button
                disabled={busy}
                onClick={() =>
                  setReview({
                    owner: current?.owner ?? null,
                    version: current?.version ?? 0,
                    remove: false,
                  })
                }
              >
                {t("Attribuer cette industrie")}
              </Button>
            ) : null}
            {current?.owner === person.id ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  setReview({ owner: current.owner, version: current.version, remove: true })
                }
              >
                {t("Retirer cette responsabilité")}
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
      {review ? (
        <div
          className="panel-block notice-warning space-y-3"
          role="region"
          aria-label={t("Vérifier la responsabilité")}
        >
          <p className="t-body">
            <strong>
              {countryName(country)} · {industry}
            </strong>
          </p>
          <p className="t-body">
            {t("Responsable actuel")} : {ownerName(review.owner)}
            <br />
            {t("Après validation")} :{" "}
            {review.remove ? t("Responsable géographique") : personFullName(person)}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={() => {
                const pending = review;
                setReview(null);
                void run(() =>
                  changeIndustryResponsibility(
                    country,
                    industry,
                    person.id,
                    pending.remove,
                    pending.version,
                  ),
                );
              }}
            >
              {t("Confirmer cette responsabilité")}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setReview(null)}>
              {t("Annuler")}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
