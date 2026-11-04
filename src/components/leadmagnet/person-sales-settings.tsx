import { useEffect, useRef, useState } from "react";
import { t, getLocale } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { personFullName, type CrmPerson } from "@/lib/leadmagnet/crm";
import { COUNTRY_CODES } from "@/lib/leadmagnet/sales-contact";
import { countryDisplayName } from "@/lib/leadmagnet/country-labels";
import {
  changeTerritory,
  fetchSalesOverview,
  saveSalesProfile,
  territoryError,
  uploadPortrait,
  removeOrphanPortrait,
} from "@/lib/leadmagnet/territory-adapter";
import {
  territoryPreview,
  type SalesOverview,
  type Territory,
  type TerritoryOperation,
} from "@/lib/leadmagnet/territories";
import { SalesAvatar } from "./sales-avatar";
import { IndustrySettings } from "./industry-settings";

export function PersonSalesSettings({
  person,
  people,
  onSaved,
}: {
  person: CrmPerson;
  people: CrmPerson[];
  onSaved: () => void;
}) {
  useLocale();
  const [data, setData] = useState<SalesOverview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [country, setCountry] = useState(""),
    [regional, setRegional] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [booking, setBooking] = useState("");
  const [review, setReview] = useState<{
    operation: TerritoryOperation;
    before: Territory;
    after: Territory;
    regions: string[];
  } | null>(null);
  const [notice, setNotice] = useState("");
  const active = useRef(true),
    locked = useRef(false);
  const load = () => {
    setError("");
    fetchSalesOverview()
      .then((d) => {
        if (active.current) {
          setData(d);
          setBooking(d.profiles.find((p) => p.person_id === person.id)?.booking_url ?? "");
        }
      })
      .catch(() => {
        if (active.current)
          setError(
            t(
              "La gestion des territoires n’est pas encore disponible. Contactez votre administrateur technique.",
            ),
          );
      });
  };
  useEffect(() => {
    active.current = true;
    load();
    return () => {
      active.current = false;
    };
  }, [person.id]);
  async function run(action: () => Promise<SalesOverview>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const d = await action();
      if (active.current) {
        setData(d);
        setReview(null);
        setNotice(t("Modifications enregistrées."));
        onSaved();
      }
    } catch (e) {
      if (active.current) {
        setError(territoryError(e));
        setReview(null);
      }
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  }
  if (!data)
    return (
      <div className="notice-info t-body">
        {error || t("Chargement…")}{" "}
        {error ? (
          <Button variant="outline" onClick={load}>
            {t("Réessayer")}
          </Button>
        ) : null}
      </div>
    );
  const profile = data.profiles.find((p) => p.person_id === person.id);
  const regions = data.regions.filter((r) => r.country === country);
  const current = data.territories.find((s) => s.country === country) ?? {
    country,
    version: 0,
    owner: null,
    region_owners: {},
  };
  const ownerName = (id: string | null | undefined) =>
    id
      ? personFullName(
          people.find((p) => p.id === id) ?? {
            firstName: t("Personne indisponible"),
            lastName: "",
          },
        )
      : t("Non attribué");
  const countryName = (code: string) =>
    countryDisplayName(code, getLocale());
  const owned = data.territories.filter(
    (s) => s.owner === person.id || Object.values(s.region_owners).includes(person.id),
  );
  const prepare = (operation: TerritoryOperation) => {
    setError("");
    try {
      setReview({
        operation,
        before: current,
        after: territoryPreview(current, person.id, operation, selected, data.regions),
        regions: [...selected],
      });
    } catch (e) {
      setError(territoryError(e));
    }
  };
  const reviewRows = review
    ? (regions.length ? regions : [{ code: country, country, name: countryName(country) }]).map(
        (r) => ({
          region: r,
          old: review.before.owner ?? review.before.region_owners[r.code] ?? null,
          next: review.after.owner ?? review.after.region_owners[r.code] ?? null,
        }),
      )
    : [];
  return (
    <div className="space-y-4 panel-block-lg">
      <h4 className="t-title-s">{t("Photo et territoires")}</h4>
      {error ? (
        <div role="alert" className="notice-warning t-body">
          {error}{" "}
          <Button
            variant="outline"
            onClick={() => {
              setReview(null);
              load();
            }}
          >
            {t("Recharger")}
          </Button>
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="notice-success t-body">
          {notice}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <SalesAvatar
          name={personFullName(person)}
          photo={profile?.photo_path}
          microsoftPhoto={
            person.userId && profile?.microsoft_user_id === person.userId
              ? profile?.microsoft_photo_path
              : null
          }
          large
        />
        <div className="space-y-2">
          <Label htmlFor={"portrait-" + person.id} className="t-body">
            {t("Photo de profil")}
          </Label>
          <Input
            id={"portrait-" + person.id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              void run(async () => {
                const path = await uploadPortrait(person.id, file);
                try {
                  return await saveSalesProfile(person.id, path, booking, profile?.version ?? 0);
                } catch (error) {
                  await removeOrphanPortrait(path);
                  throw error;
                }
              });
            }}
          />
          <p className="t-caption">
            {t(
              "JPEG, PNG ou WebP, 2 Mo maximum. La photo ajoutée ici est prioritaire sur la photo Microsoft.",
            )}
          </p>
          {profile?.photo_path ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(() => saveSalesProfile(person.id, null, booking, profile.version))
              }
            >
              {t("Retirer la photo ajoutée")}
            </Button>
          ) : null}
          <p className="t-caption">
            {profile?.microsoft_photo_path
              ? t("Photo Microsoft disponible en remplacement.")
              : t(
                  "Sans photo ajoutée, les initiales sont affichées tant que la photo Microsoft n’est pas synchronisée.",
                )}
          </p>
        </div>
      </div>
      {person.role === "sales" ? (
        <div className="space-y-2">
          <Label className="t-body" htmlFor={"booking-" + person.id}>
            {t("Lien de réservation")}
          </Label>
          <Input
            id={"booking-" + person.id}
            type="url"
            value={booking}
            onChange={(e) => setBooking(e.target.value)}
            placeholder="https://…"
          />
          <Button
            disabled={busy}
            variant="outline"
            onClick={() =>
              void run(() =>
                saveSalesProfile(
                  person.id,
                  profile?.photo_path ?? null,
                  booking,
                  profile?.version ?? 0,
                ),
              )
            }
          >
            {t("Enregistrer le lien")}
          </Button>
        </div>
      ) : null}
      {person.role === "sales" && person.active ? (
        <>
          <IndustrySettings person={person} people={people} data={data} busy={busy} run={run} />
          <h4 className="t-title-s">{t("Territoires commerciaux")}</h4>
          {owned.length ? (
            <ul className="space-y-2">
              {owned.map((s) => (
                <li key={s.country} className="t-body">
                  <strong>{countryName(s.country)}</strong> :{" "}
                  {s.owner === person.id
                    ? t("Pays entier")
                    : data.regions
                        .filter((r) => s.region_owners[r.code] === person.id)
                        .map((r) => r.name)
                        .join(", ")}
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-body">{t("Aucun territoire attribué.")}</p>
          )}
          <Label className="t-body" htmlFor={"territory-country-" + person.id}>
            {t("Pays à gérer")}
          </Label>
          <select
            id={"territory-country-" + person.id}
            className="t-body min-h-11 w-full rounded-[var(--r-sm)] bg-[var(--surface-sunken)] p-3"
            value={country}
            disabled={busy}
            onChange={(e) => {
              setCountry(e.target.value);
              setSelected([]);
              setRegional(false);
              setReview(null);
            }}
          >
            <option value="">{t("Pays à gérer")}</option>
            {COUNTRY_CODES.map((code) => ({ code, name: countryName(code) }))
              .sort((a, b) => a.name.localeCompare(b.name, getLocale()))
              .map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
          </select>
          {country ? (
            <>
              <p className="t-body">
                {current.owner
                  ? t("Responsable du pays") + " : " + ownerName(current.owner)
                  : Object.keys(current.region_owners).length
                    ? t("Ce pays est réparti par région.")
                    : t("Ce pays n’a pas encore de responsable.")}
              </p>
              {!data.imports.some((i) => i.country === country) ? (
                <p className="notice-info t-body">
                  {t(
                    "Le référentiel des villes de ce pays reste à importer. Une affectation par région nécessitera cette importation.",
                  )}
                </p>
              ) : null}
              <label className="t-body flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  checked={regional}
                  disabled={busy || !regions.length}
                  onChange={(e) => {
                    setRegional(e.target.checked);
                    setReview(null);
                    setSelected([]);
                  }}
                />
                {t("Gérer ce pays par régions")}
              </label>
              {!regions.length ? (
                <p className="notice-info t-body">
                  {t("Les régions de ce pays ne sont pas encore disponibles.")}
                </p>
              ) : null}
              {regional ? (
                <fieldset className="max-h-80 overflow-y-auto space-y-1">
                  <legend className="t-body">{t("Régions à attribuer ou à retirer")}</legend>
                  {regions.map((r) => {
                    const owner = current.owner ?? current.region_owners[r.code];
                    return (
                      <label key={r.code} className="flex min-h-11 items-center gap-3 t-body">
                        <input
                          type="checkbox"
                          checked={selected.includes(r.code)}
                          disabled={busy}
                          onChange={(e) => {
                            setSelected((s) =>
                              e.target.checked ? [...s, r.code] : s.filter((c) => c !== r.code),
                            );
                            setReview(null);
                          }}
                        />
                        <span>
                          {r.name} <span className="t-caption">— {ownerName(owner)}</span>
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy || (regional && !selected.length)}
                  onClick={() => prepare(regional ? "regions" : "country")}
                >
                  {regional ? t("Préparer la répartition") : t("Attribuer le pays entier")}
                </Button>
                {owned.some((s) => s.country === country) ? (
                  <Button
                    variant="outline"
                    disabled={busy || (regional && (!selected.length || !!current.owner))}
                    onClick={() => prepare(regional ? "remove_regions" : "remove_country")}
                  >
                    {t("Retirer de cette personne")}
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
          {review ? (
            <div
              className="panel-block notice-warning space-y-3"
              role="region"
              aria-label={t("Vérifier la répartition")}
            >
              <h4 className="t-title-s">{t("Vérifier la répartition")}</h4>
              <p className="t-body">
                {t(
                  "Vérifiez les transferts avant de confirmer. Les autres régions conservent leur responsable.",
                )}
              </p>
              <div className="max-h-72 overflow-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t("Région")}</th>
                      <th>{t("Responsable actuel")}</th>
                      <th>{t("Après validation")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewRows.map((r) => (
                      <tr key={r.region.code}>
                        <td>{r.region.name}</td>
                        <td>{ownerName(r.old)}</td>
                        <td>{ownerName(r.next)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="t-body">
                {t("Régions sans responsable")} : {reviewRows.filter((r) => !r.next).length}
              </p>
              <div className="flex gap-2">
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      changeTerritory(
                        country,
                        person.id,
                        review.operation,
                        review.regions,
                        review.before.version,
                      ),
                    )
                  }
                >
                  {t("Confirmer cette répartition")}
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setReview(null)}>
                  {t("Annuler")}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
