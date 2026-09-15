import { useMemo, useState } from "react";
import { t, msg, number } from "@/lib/i18n/core";
import {
  ACTIVATION_GUIDE,
  formatGuideBound,
  guideMagnetsFor,
  guideMaterialsFor,
  guideRangesFor,
  guideReferencesFor,
  type GuideMagnetOption,
} from "@/lib/standex/activation-guide";

/**
 * Choix du matériau de l'aimant dans l'atelier, d'après le guide d'activation
 * officiel Standex.
 *
 * Trois garde-fous portés par ce composant :
 * - le choix change réellement l'aimant simulé (`magnetModel`), donc sa
 *   géométrie 3D et ses cotes, puisque les références du guide sont les mêmes
 *   que celles du catalogue ;
 * - les colonnes « up » et « to » sont annoncées comme des PLAGES publiées, avec
 *   la référence de ligne et l'approche : elles ne sont jamais présentées comme
 *   un seuil d'enclenchement ou de relâchement, et jamais réutilisées par le
 *   moteur de couverture ;
 * - un matériau ou une combinaison absent de la brochure n'apparaît pas : rien
 *   n'est extrapolé d'un autre matériau ni d'une autre taille.
 */
/* Repère qualitatif de lecture, jamais un prix ni une performance chiffrée :
   aucun tarif n'est publié par le guide et rien n'est annoncé « moins cher ». */
function materialHint(material: string): string {
  if (material === "Ferrite") return t("Matériau économique courant, portée plus courte");
  if (material === "AlNiCo") return t("Stable en température, portée moyenne");
  if (material === "NdFeB") return t("Portée longue, sensible à la température");
  if (material === "SmCo") return t("Portée courte ici, tenue en température élevée");
  return "";
}

export function GuideMaterials({
  sensorFamily,
  magnetModel,
  onSelect,
}: {
  sensorFamily: string;
  magnetModel: string;
  onSelect: (magnetId: string) => void;
}) {
  const materials = useMemo(() => guideMaterialsFor(sensorFamily), [sensorFamily]);
  const guideMagnets = useMemo(() => guideMagnetsFor(sensorFamily), [sensorFamily]);
  const current = guideMagnets.find((m) => m.id === magnetModel) ?? null;
  const [openMaterial, setOpenMaterial] = useState<string | null>(null);
  if (materials.length === 0) return null;
  const activeMaterial = openMaterial ?? current?.material ?? materials[0]!.material;
  const shown = materials.find((m) => m.material === activeMaterial) ?? materials[0]!;
  return (
    <section className="panel-block" data-testid="guide-materials">
      <h4 className="t-label">{t("Matériau de l'aimant (guide d'activation Standex)")}</h4>
      <div className="mw-guide-materials" role="group" aria-label={t("Matériau de l'aimant")}>
        {materials.map((m) => (
          <button
            key={m.material}
            type="button"
            className="mw-guide-material"
            aria-pressed={m.material === activeMaterial}
            onClick={() => {
              setOpenMaterial(m.material);
              const first = m.magnets[0];
              if (first && !m.magnets.some((x) => x.id === magnetModel)) onSelect(first.id);
            }}
          >
            <strong>{m.material}</strong>
            <span>{materialHint(m.material)}</span>
          </button>
        ))}
      </div>
      <div className="mw-guide-references">
        {shown.magnets.map((m: GuideMagnetOption) => (
          <button
            key={m.id}
            type="button"
            className="mw-guide-reference"
            aria-pressed={m.id === magnetModel}
            onClick={() => onSelect(m.id)}
          >
            <strong>{m.label}</strong>
            <span className="t-metric">
              {m.shape === "cylinder" ? t("Cylindre") : t("Bloc")}
              {m.body
                ? " · " +
                  m.body.map((v) => number(v)).join(" × ") +
                  " mm"
                : ""}
            </span>
            <span className="t-caption">
              {msg("Moment publié : {0} × 10⁻⁶ Vs·cm", [
                number(m.momentE6Vscm),
              ])}
            </span>
          </button>
        ))}
      </div>
      {current ? (
        <GuideRangeTable sensorFamily={sensorFamily} magnet={current} />
      ) : (
        <p className="mw-help">
          {t(
            "L'aimant sélectionné n'est pas l'un des aimants standard du guide : choisissez un matériau ci-dessus pour lire ses plages publiées.",
          )}
        </p>
      )}
      {ACTIVATION_GUIDE.source.url && (
        <a href={ACTIVATION_GUIDE.source.url} target="_blank" rel="noreferrer">
          {t("Voir le guide d'activation Standex ↗")}
        </a>
      )}
    </section>
  );
}

function GuideRangeTable({
  sensorFamily,
  magnet,
}: {
  sensorFamily: string;
  magnet: GuideMagnetOption;
}) {
  const rows = useMemo(() => guideRangesFor(sensorFamily, magnet.id), [sensorFamily, magnet.id]);
  const references = useMemo(
    () => guideReferencesFor(sensorFamily, magnet.id),
    [sensorFamily, magnet.id],
  );
  const approaches = useMemo(() => [...new Set(rows.map((r) => r.approachId))], [rows]);
  if (rows.length === 0) return null;
  return (
    <details className="panel-block" data-testid="guide-ranges" open>
      <summary className="t-label">
        {msg("Plages publiées avec {0}", [magnet.label])}
      </summary>
      <p className="mw-help">
        {t(
          "Ces deux colonnes sont les bornes d'une plage mesurée par Standex sur une série de capteurs. Ce ne sont pas des seuils de fermeture et de réouverture : la démonstration de portée dans la scène reste indicative tant que le couple n'a pas de distances caractérisées.",
        )}
      </p>
      <div className="mw-guide-scroll">
        <table className="mw-published-table">
          <thead>
            <tr>
              <th scope="col">{t("Référence du guide")}</th>
              {approaches.map((a) => (
                <th key={a} scope="col">
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {references.map((ref) => (
              <tr key={ref}>
                <th scope="row">{ref}</th>
                {approaches.map((a) => {
                  const row = rows.find((r) => r.sensorReference === ref && r.approachId === a);
                  return (
                    <td key={a} className="t-metric">
                      {row
                        ? formatGuideBound(row.upMm, row.upNote) +
                          " – " +
                          formatGuideBound(row.toMm, row.toNote)
                        : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="t-caption">
        {msg("Guide d'activation Standex, page {0} · plages en mm", [
          String(rows[0]!.page),
        ])}
      </p>
    </details>
  );
}
