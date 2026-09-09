import { useEffect, useRef, useState } from "react";
import { Search, X, ArrowUpRight, Check } from "lucide-react";
import { sizeLabel, sensorSource } from "@/lib/standex/sensor-catalog";
import {
  CATALOG_ALL,
  documentedCount,
  filterCatalog,
} from "@/lib/standex/catalog-filters";
import SensorCard from "./sensor-card";
import { useLocale } from "@/lib/i18n/react";
import { msg, t } from "@/lib/i18n/core";
import { SensorPlan } from "./sensor-plan";
import "./workshop.css";

/** Filtres construits UNIQUEMENT sur des données réellement présentes dans le
 * catalogue. Une donnée absente reste « inconnu » : elle n'est jamais comptée
 * comme compatible. Aucun critère électrique, thermique ou d'étanchéité n'est
 * proposé ici : ces valeurs ne sont pas documentées modèle par modèle.
 *
 * IMPORTANT : la VALEUR de chaque option est canonique et stable (identifiant
 * ou catégorie brute du catalogue). Seul le libellé passe par t() au rendu :
 * sinon le filtre ne correspond plus à rien hors français, et changer de langue
 * viderait la liste. */
/* i18n-canonical : dictionnaire de libellés, traduits par t() au rendu. */
const CATEGORY_OPTIONS = [
  [CATALOG_ALL, "Tous"],
  ["Cylindrique", "Cylindrique"],
  ["À visser", "À visser"],
  ["À encastrer", "À encastrer"],
  ["CMS", "CMS"],
  ["Pédagogique", "Pédagogique"],
  ["Sur mesure", "Sur mesure"],
] as const;

/* i18n-canonical : dictionnaire de libellés, traduits par t() au rendu. */
const FIXING_OPTIONS = [
  [CATALOG_ALL, "Toutes les fixations"],
  ["screw", "Fixation par vis"],
  ["threaded", "Corps fileté"],
  ["pressfit", "À emmancher"],
  ["pcb", "Report sur circuit imprimé"],
  ["unknown", "Fixation non documentée"],
] as const;

/* i18n-canonical : dictionnaire de libellés, traduits par t() au rendu. */
const WIRING_OPTIONS = [
  [CATALOG_ALL, "Tous les raccordements"],
  ["cable", "Sortie câble"],
  ["smd", "Broches CMS"],
  ["leads", "Pattes nues"],
  ["unknown", "Raccordement non documenté"],
] as const;

export default function SensorCatalog({
  selected,
  onSelect,
  onClose,
}: {
  selected: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  useLocale();
  const [card, setCard] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState(CATALOG_ALL),
    [fixing, setFixing] = useState(CATALOG_ALL),
    [wiring, setWiring] = useState(CATALOG_ALL),
    [maxLength, setMaxLength] = useState(""),
    [maxWidth, setMaxWidth] = useState(""),
    [maxHeight, setMaxHeight] = useState(""),
    [sameScale, setSameScale] = useState(true);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const list = filterCatalog({
    query,
    category,
    fixing,
    wiring,
    maxLength,
    maxWidth,
    maxHeight,
  });
  const documented = documentedCount(list);

  const resetFilters = () => {
    setQuery("");
    setCategory(CATALOG_ALL);
    setFixing(CATALOG_ALL);
    setWiring(CATALOG_ALL);
    setMaxLength("");
    setMaxWidth("");
    setMaxHeight("");
  };

  return (
    <dialog
      ref={ref}
      className="mw-catalog"
      aria-labelledby="catalog-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {card && (
        <SensorCard
          key={card}
          sensorId={card}
          onClose={() => setCard(null)}
          onSelect={(id) => {
            setCard(null);
            onSelect(id);
          }}
        />
      )}
      <header>
        <div>
          <p className="mw-eyebrow">{t("CHOISIR UNE FORME ET UN FORMAT")}</p>
          <h2 id="catalog-title">{t("Le catalogue des capteurs")}</h2>
          <p>{t("21 modèles Standex cotés, et un reed pédagogique.")}</p>
        </div>
        <button aria-label={t("Fermer le catalogue")} className="mw-icon-button" onClick={onClose}>
          <X />
        </button>
      </header>
      <div className="mw-catalog-tools">
        <label className="mw-catalog-search">
          <Search size={17} />
          <input
            autoFocus
            aria-label={t("Rechercher un capteur")}
            placeholder={t("Rechercher MK24, cylindrique, miniature…")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label={t("Filtrer les formats")}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {CATEGORY_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {t(label)}
            </option>
          ))}

        </select>
        <select
          aria-label={t("Filtrer par fixation")}
          value={fixing}
          onChange={(e) => setFixing(e.target.value)}
        >
          {FIXING_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {t(label)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("Filtrer par raccordement")}
          value={wiring}
          onChange={(e) => setWiring(e.target.value)}
        >
          {WIRING_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {t(label)}
            </option>
          ))}
        </select>
        <label className="mw-catalog-size-filter">
          {t("Longueur max (mm)")}
          <input
            inputMode="decimal"
            aria-label={t("Longueur maximale en millimètres, terminaisons comprises")}
            value={maxLength}
            onChange={(e) => setMaxLength(e.target.value)}
            placeholder="—"
          />
        </label>
        <label className="mw-catalog-size-filter">
          {t("Largeur max (mm)")}
          <input
            inputMode="decimal"
            aria-label={t("Largeur maximale du corps en millimètres")}
            value={maxWidth}
            onChange={(e) => setMaxWidth(e.target.value)}
            placeholder="—"
          />
        </label>
        <label className="mw-catalog-size-filter">
          {t("Hauteur max (mm)")}
          <input
            inputMode="decimal"
            aria-label={t("Hauteur maximale du corps en millimètres")}
            value={maxHeight}
            onChange={(e) => setMaxHeight(e.target.value)}
            placeholder="—"
          />
        </label>

        <label className="mw-check">
          <input
            type="checkbox"
            checked={sameScale}
            onChange={(e) => setSameScale(e.target.checked)}
          />
          {t("Même échelle")}
        </label>
        <button type="button" className="mw-secondary" onClick={resetFilters}>
          {t("Réinitialiser les filtres")}
        </button>
      </div>
      <p className="mw-catalog-count" role="status" aria-live="polite">
        {msg("{0} capteur(s) documenté(s) affiché(s), plus l'option sur mesure.", [
          String(documented),
        ])}
      </p>
      <p className="mw-catalog-count">
        {t("La longueur comparée inclut les terminaisons quand la fiche les cote (MK24-A-J : 5,5 mm avec ses connexions, et non 5 mm). Un champ laissé vide ne filtre rien : une cote non documentée n'est jamais ramenée à zéro.")}
      </p>

      <div className="mw-catalog-list">
        {list.map((s) => (
          <article
            key={s.id}
            className={`surface-interactive ${selected === s.id ? "selected" : ""}`}
          >
            <button
              className="mw-catalog-choice"
              onClick={() => onSelect(s.id)}
              aria-label={t(`Choisir ${s.name}`)}
              aria-pressed={selected === s.id}
            >
              <div className="mw-catalog-drawing">
                <svg
                  viewBox={
                    sameScale
                      ? "-34 -19 68 38"
                      : `${-s.body[0] / 2 - 9} ${-Math.max(s.body[2], s.nutWidth ?? 0) / 2 - 5} ${s.body[0] + 18} ${Math.max(s.body[2], s.nutWidth ?? 0) + 10}`
                  }
                  aria-hidden="true"
                >
                  <SensorPlan model={s} xray={false} />
                  {sameScale && (
                    <g stroke="#a3b2bd" strokeWidth={0.25}>
                      <path d="M-25 14 H25 M-25 13 V15 M25 13 V15" />
                      <text
                        x="0"
                        y="17.5"
                        fontSize="2.3"
                        textAnchor="middle"
                        fill="#667f91"
                        stroke="none"
                      >
                        {t("50 mm")}
                      </text>
                    </g>
                  )}
                </svg>
              </div>
              <div className="mw-catalog-name">
                <strong className="t-title-s">{t(s.name)}</strong>
                {selected === s.id && <Check size={17} />}
              </div>
              <span className="mw-catalog-size t-metric">{t(sizeLabel(s))}</span>
              <p>{t(s.description)}</p>
              <small>
                {t(
                  s.contact === "unsupported"
                    ? "Forme disponible · activation non modélisée"
                    : s.id === "MK03"
                      ? "Exemple documenté disponible"
                      : "Contacts illustrés · réponse pédagogique",
                )}
              </small>
            </button>
            <button className="mw-product-card-button" onClick={() => setCard(s.id)}>
              {t("Découvrir ce capteur")}
            </button>
            {sensorSource(s) && (
              <a href={sensorSource(s)!} target="_blank" rel="noreferrer">
                {t("Consulter le plan Standex")}
                <ArrowUpRight size={13} />
              </a>
            )}
          </article>
        ))}
        {!documented && (
          <p className="mw-catalog-empty">
            {t("Aucun capteur documenté ne correspond à ces filtres. L'option sur mesure reste ouverte.")}
          </p>
        )}
      </div>
      <footer>
        {t(
          "Les cotes décrivent le corps hors câbles, connexions et écrous. Les formes sont simplifiées d'après les plans ; les contacts internes sont symboliques. Sélectionner une forme ne valide pas sa portée d'activation.",
        )}
      </footer>
    </dialog>
  );
}
