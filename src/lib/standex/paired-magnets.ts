import { bareMagnetModel, packagedMagnet } from "./magnet-catalog";
import { sensorById, isKnownSensorId, type SensorModel } from "./sensor-catalog";
/** Enveloppes de boîtier lues dans Packaged-Magnets.pdf V03, 18 juin 2026.
 * Le boîtier réutilise EXACTEMENT le dessin du capteur correspondant, sans câble
 * ni contacts. Le matériau et l'axe magnétique actifs ne sont jamais déduits. */
const BODY_OVERRIDE: Readonly<Record<string, SensorModel["body"]>> = {
  M02: [32.4, 10, 16.7],
  M21: [28.5, 6.5, 19],
  "M21P/1": [28.5, 6.5, 19],
  "M21P/2": [28.5, 6.5, 19],
};
/** Trous oblongs : M21P/1 horizontaux, M21P/2 verticaux. Deux géométries 3D
 * réellement distinctes, pas deux étiquettes. */
function holesFor(
  magnetId: string,
  base: SensorModel,
): SensorModel["holes"] | undefined {
  const axis = packagedMagnet(magnetId)?.holeAxis;
  if (!axis || !base.holes) return base.holes;
  return base.holes.map(([x, z, l, w]) =>
    axis === "vertical"
      ? ([x, z, Math.min(l, w), Math.max(l, w)] as const)
      : ([x, z, Math.max(l, w), Math.min(l, w)] as const),
  );
}
/**
 * Modèle 3D d'un aimant. `sensorId` sert uniquement à choisir la géométrie de
 * boîtier quand la fiche en propose une par variante de capteur (M11S : M5 ou
 * M8). Une forme inconnue n'est JAMAIS repliée silencieusement sur un cylindre :
 * la fonction renvoie `null` et l'interface l'annonce.
 */
export function pairedMagnetModel(id: string, sensorId?: string): SensorModel | null {
  const packaged = packagedMagnet(id);
  if (!packaged) return bareMagnetModel(id);
  const housing =
    (sensorId && packaged.housingBySensor?.[sensorId]) || packaged.housing;
  if (!isKnownSensorId(housing)) return null;
  const base = sensorById(housing);
  const holes = holesFor(id, base);
  // Un boîtier d'aimant reprend uniquement l'enveloppe et les détails
  // mécaniques du capteur. Les propriétés de raccordement ne doivent pas
  // survivre au clonage, même si un rendu oublie ensuite de masquer un détail.
  const {
    cableSide: _cableSide,
    terminalSpan: _terminalSpan,
    reed: _reed,
    pcbThickness: _pcbThickness,
    ...passiveHousing
  } = base;
  return {
    ...passiveHousing,
    id,
    name: id,
    body: BODY_OVERRIDE[id] ?? base.body,
    ...(holes ? { holes } : {}),
    // Le matériau du boîtier est conservé (laiton, inox, plastique, aluminium) :
    // le repère « Aimant » assure l'identification, pas une recoloration.
    sourceFile: "Packaged-Magnets.pdf",
    contact: "unsupported",
    magnet: true,
    ...(packaged.documentedAs ? { documentedAs: packaged.documentedAs } : {}),
  };
}
