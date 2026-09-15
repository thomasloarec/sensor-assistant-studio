import { useMemo, useState } from "react";
import { t, msg, number } from "@/lib/i18n/core";
import {
  ACTIVATION_GUIDE,
  formatGuideBound,
  guideIllustrativeMarks,
  guideMagnetsFor,
  guideMaterialsFor,
  guideRange,
  guideRangesFor,
  guideReferencesFor,
  type GuideMagnet,
  type GuideMagnetOption,
} from "@/lib/standex/activation-guide";

/**
 * Choix du matériau, de la référence et de l'approche du guide d'activation
 * officiel Standex dans l'atelier.
 *
 * Garde-fous portés par ce composant :
 * - le choix change réellement l'aimant simulé (`magnetModel`), donc sa
 *   géométrie 3D et ses cotes, puisque les références du guide sont les mêmes
 *   que celles du catalogue ;
 * - seules les formes standard du capteur sont PROPOSÉES (corps tubulaire →
 *   cylindre, autre → bloc). Le registre du guide reste entier : c'est une
 *   politique d'affichage, pas une suppression de preuve documentaire ;
 * - les colonnes « up » et « to » sont annoncées comme des PLAGES publiées, avec
 *   la référence de ligne et l'approche : elles ne sont jamais présentées comme
 *   un seuil d'enclenchement ou de relâchement, et jamais réutilisées par le
 *   moteur de couverture, la preuve ou le verdict ;
 * - la référence et l'approche choisies alimentent uniquement une démonstration
 *   ILLUSTRATIVE de portée, annoncée comme telle en permanence ;
 * - un matériau ou une combinaison absent de la brochure n'apparaît pas : rien
 *   n'est extrapolé d'un autre matériau ni d'une autre taille.
 */
/* Description NEUTRE du matériau : ni portée comparée, ni prix. La portée réelle
   dépend de la référence, de la taille et de l'approche — le guide montre que la
   ferrite peut porter PLUS LOIN que le NdFeB sur un couple donné (MK15-B-X D1 :
   15,4/20,1 en ferrite contre 10,2/13,9 en NdFeB). Seule reste une préférence
   économique INDICATIVE, sans aucun tarif publié. */
function materialHint(material: string): string {
  if (material === "Ferrite")
    return t("Matériau courant, préférence économique indicative pour les blocs");
  if (material === "AlNiCo") return t("Matériau métallique stable en température");
  if (material === "NdFeB") return t("Terre rare, sensible à la température");
  if (material === "SmCo") return t("Terre rare, tenue en température élevée");
  return "";
}

export function GuideMaterials({
  sensorFamily,
  shape,
  magnetModel,
  guideReference,
  guideApproach,
  onSelect,
  onSelectDemo,
}: {
  sensorFamily: string;
  /** Forme standard du capteur : seule cette forme est proposée. */
  shape?: GuideMagnet["shape"] | null;
  magnetModel: string;
  guideReference?: string | null;
  guideApproach?: string | null;
  onSelect: (magnetId: string) => void;
  /** Référence + approche retenues pour la démonstration illustrative. */
  onSelectDemo?: (reference: string, approachId: string) => void;
}) {
  const materials = useMemo(
    () => guideMaterialsFor(sensorFamily, undefined, shape ?? null),
    [sensorFamily, shape],
  );
  const guideMagnets = useMemo(
    () => guideMagnetsFor(sensorFamily, undefined, shape ?? null),
    [sensorFamily, shape],
  );
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
              {m.body ? " · " + m.body.map((v) => number(v)).join(" × ") + " mm" : ""}
            </span>
            <span className="t-caption">
              {msg("Moment publié : {0} × 10⁻⁶ Vs·cm", [number(m.momentE6Vscm)])}
            </span>
          </button>
        ))}
      </div>
      {current ? (
        <>
          <GuideDemoPicker
            sensorFamily={sensorFamily}
            magnet={current}
            guideReference={guideReference ?? null}
            guideApproach={guideApproach ?? null}
            onSelectDemo={onSelectDemo}
          />
          <GuideRangeTable sensorFamily={sensorFamily} magnet={current} />
        </>
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

/**
 * Choix EXPLICITE de la ligne du guide et de l'approche qui servent de repères à
 * la démonstration illustrative. Les bornes affichées ici restent les colonnes
 * imprimées : la borne basse sert de repère de proximité, la borne haute de
 * repère d'éloignement, et le texte le dit sans détour.
 */
function GuideDemoPicker({
  sensorFamily,
  magnet,
  guideReference,
  guideApproach,
  onSelectDemo,
}: {
  sensorFamily: string;
  magnet: GuideMagnetOption;
  guideReference: string | null;
  guideApproach: string | null;
  onSelectDemo: ((reference: string, approachId: string) => void) | undefined;
}) {
  const rows = useMemo(() => guideRangesFor(sensorFamily, magnet.id), [sensorFamily, magnet.id]);
  const references = useMemo(
    () => guideReferencesFor(sensorFamily, magnet.id),
    [sensorFamily, magnet.id],
  );
  if (!onSelectDemo || references.length === 0) return null;
  const reference =
    guideReference && references.includes(guideReference) ? guideReference : references[0]!;
  const approaches = [
    ...new Set(rows.filter((r) => r.sensorReference === reference).map((r) => r.approachId)),
  ];
  const approach =
    guideApproach && approaches.includes(guideApproach) ? guideApproach : approaches[0]!;
  const range = guideRange(sensorFamily, reference, magnet.id, approach);
  const marks = guideIllustrativeMarks(range);
  return (
    <div className="panel-block" data-testid="guide-demo-picker">
      <label className="mw-select-label">
        {t("Référence du guide utilisée pour la démonstration")}
        <select value={reference} onChange={(e) => onSelectDemo(e.target.value, approach)}>
          {references.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label className="mw-select-label">
        {t("Approche du guide")}
        <select value={approach} onChange={(e) => onSelectDemo(reference, e.target.value)}>
          {approaches.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
      <p className="notice-warning t-body-s" data-testid="guide-demo-note">
        {marks
          ? msg(
              "Animation indicative : la scène se rapproche du repère bas {0} mm et s'éloigne du repère haut {1} mm de la plage publiée. Ce ne sont pas des seuils de fermeture et de réouverture, et rien n'est validé.",
              [number(marks.nearMm), number(marks.farMm)],
            )
          : range?.orderAtypical
            ? t(
                "Cette ligne du guide est imprimée dans un ordre inhabituel (« up » supérieur à « to ») : elle reste lisible telle quelle dans le tableau, à confirmer par Standex, mais elle ne sert pas de repère. L'animation indicative retombe sur 15 mm et 18 mm.",
              )
            : t(
                "Aucune plage exploitable pour cette combinaison : l'animation indicative retombe sur 15 mm et 18 mm, deux repères de lecture qui ne sont pas des seuils.",
              )}
      </p>
    </div>
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
    <details className="panel-block" data-testid="guide-ranges">
      <summary className="t-label">{msg("Plages publiées avec {0}", [magnet.label])}</summary>
      <p className="mw-help">
        {t(
          "Ces deux colonnes sont les bornes d'une plage mesurée par Standex sur une série de capteurs. Ce ne sont pas des seuils de fermeture et de réouverture : la démonstration de portée dans la scène reste indicative tant que le couple n'a pas de distances caractérisées.",
        )}
      </p>
      <p className="mw-help">
        {t(
          "Les deux valeurs sont les colonnes « up » et « to » de la brochure, dans cet ordre imprimé : elles ne sont ni triées ni recalculées.",
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
                          " / " +
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
        {msg("Guide d'activation Standex, page {0} · plages en mm", [String(rows[0]!.page)])}
      </p>
    </details>
  );
}
