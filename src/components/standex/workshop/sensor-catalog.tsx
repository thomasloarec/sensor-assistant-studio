import { useEffect, useRef, useState } from "react";
import { Search, X, ArrowUpRight, Check } from "lucide-react";
import { SENSOR_CATALOG, sizeLabel, sensorSource } from "@/lib/standex/sensor-catalog";
import { SensorPlan } from "./sensor-plan";

export default function SensorCatalog({
  selected,
  onSelect,
  onClose,
}: {
  selected: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("Tous"),
    [sameScale, setSameScale] = useState(true);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const list = SENSOR_CATALOG.filter(
    (s) =>
      (category === "Tous" || s.category === category) &&
      (s.name + " " + s.description + " " + s.id)
        .toLocaleLowerCase("fr")
        .includes(query.toLocaleLowerCase("fr")),
  );
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
      <header>
        <div>
          <p className="mw-eyebrow">CHOISIR UNE FORME ET UN FORMAT</p>
          <h2 id="catalog-title">Le catalogue des capteurs</h2>
          <p>21 modèles Standex cotés, et un reed pédagogique.</p>
        </div>
        <button aria-label="Fermer le catalogue" className="mw-icon-button" onClick={onClose}>
          <X />
        </button>
      </header>
      <div className="mw-catalog-tools">
        <label className="mw-catalog-search">
          <Search size={17} />
          <input
            autoFocus
            aria-label="Rechercher un capteur"
            placeholder="Rechercher MK24, cylindrique, miniature…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Filtrer les formats"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {["Tous", "Cylindrique", "À visser", "À encastrer", "CMS", "Pédagogique"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="mw-check">
          <input
            type="checkbox"
            checked={sameScale}
            onChange={(e) => setSameScale(e.target.checked)}
          />
          Même échelle
        </label>
      </div>
      <div className="mw-catalog-list">
        {list.map((s) => (
          <article key={s.id} className={selected === s.id ? "selected" : ""}>
            <button
              className="mw-catalog-choice"
              onClick={() => onSelect(s.id)}
              aria-label={`Choisir ${s.name}`}
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
                        50 mm
                      </text>
                    </g>
                  )}
                </svg>
              </div>
              <div className="mw-catalog-name">
                <strong>{s.name}</strong>
                {selected === s.id && <Check size={17} />}
              </div>
              <span className="mw-catalog-size">{sizeLabel(s)}</span>
              <p>{s.description}</p>
              <small>
                {s.contact === "unsupported"
                  ? "Forme disponible · activation non modélisée"
                  : s.id === "MK03"
                    ? "Exemple documenté disponible"
                    : "Contacts illustrés · réponse pédagogique"}
              </small>
            </button>
            {sensorSource(s) && (
              <a href={sensorSource(s)!} target="_blank" rel="noreferrer">
                Consulter le plan Standex <ArrowUpRight size={13} />
              </a>
            )}
          </article>
        ))}
        {!list.length && (
          <p className="mw-catalog-empty">Aucun capteur ne correspond à cette recherche.</p>
        )}
      </div>
      <footer>
        Les cotes décrivent le corps hors câbles, connexions et écrous. Les formes sont simplifiées
        d'après les plans ; les contacts internes sont symboliques. Sélectionner une forme ne valide
        pas sa portée d'activation.
      </footer>
    </dialog>
  );
}
