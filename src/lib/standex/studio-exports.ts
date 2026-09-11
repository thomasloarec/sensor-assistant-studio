import { SENSOR_CATALOG } from "./sensor-catalog";
import { SENSOR_SPECIFICATIONS } from "./sensor-specifications";
import { strToU8, zipSync } from "fflate";
import messages from "@/lib/i18n/messages.json";
import type { DesignFreeze } from "./design-freeze";
import { VERDICT_LABELS } from "./design-freeze";
import { DOSSIER_FIELDS } from "./application-dossier";
import type { StudioStudy } from "./studio-dossier";
import type { WorkshopConfig } from "./magnetic-workshop";
import { exploreSolutions } from "./magnetics/solutions";
import { PUBLISHED_REGISTRY } from "./magnetics/registries";

const en = (s: string) => (messages as Record<string, string[]>)[s]?.[0] ?? s;
type Cell = string | number | boolean | null;
export interface ExportSheet {
  name: string;
  rows: Cell[][];
}
/** A technical snapshot. No formula strings, macros, server authority, or external requests. */
export function studioExportSheets(
  f: DesignFreeze,
  study: StudioStudy,
  config: WorkshopConfig,
): ExportSheet[] {
  const sheets: ExportSheet[] = [
    {
      name: "Revue",
      rows: [
        ["Section", "Champ français", "Field English", "Valeur / Value"],
        ...f.sections.flatMap((s) =>
          s.entries.map((e) => [s.title, e.label, en(e.label), e.value]),
        ),
        ["Empreinte", "SHA-256", "SHA-256", f.hash],
        ["Statut", "Contre-signature", "Countersignature", "Non contre-signée / Unsigned"],
      ],
    },
    {
      name: "Hypotheses",
      rows: [
        [
          "Identifiant",
          "Champ français",
          "Field English",
          "Valeur / Value",
          "État / Status",
          "Source",
          "Proposition / Proposal",
        ],
        ...DOSSIER_FIELDS.filter((d) => d.section !== "commercial").map((d) => {
          const v = study.fields[d.id];
          return [
            d.id,
            d.labelFr,
            en(d.labelFr),
            v?.value ?? null,
            v?.state ?? "missing",
            v?.source ?? null,
            v?.proposal ?? null,
          ];
        }),
      ],
    },
    {
      name: "Comparaisons",
      rows: [
        [
          "Capteur / Sensor",
          "Classe / Class",
          "Aimant / Magnet",
          "Position",
          "Fermeture / Pull-in (mm)",
          "Ouverture / Drop-out (mm)",
          "Écart fermeture / Closing margin (mm)",
          "Écart ouverture / Opening margin (mm)",
          "Verdict",
          "Motif / Reason",
          "Source",
        ],
        ...exploreSolutions(study.need, study.comparisonApproach ?? "D1", {
          referencePose: true,
          ferrous: config.ferromagnetic,
        }).map((s) => [
          s.sensorFamily,
          s.sensitivityClass,
          s.magnetId,
          s.approachId,
          s.reference.pullMm,
          s.reference.dropMm,
          s.reference.closingMm,
          s.reference.openingMm,
          VERDICT_LABELS[s.reference.verdict],
          s.reference.reason,
          s.reference.provenance.map((p) => p.sourceRef).join(" ; "),
        ]),
      ],
    },
    {
      name: "Registre",
      rows: [
        [
          "Capteur / Sensor",
          "Référence / Part number",
          "Classe / Class",
          "Aimant / Magnet",
          "Position",
          "Fermeture / Pull-in (mm)",
          "Ouverture / Drop-out (mm)",
          "Source",
        ],
        ...PUBLISHED_REGISTRY.rows.map((r) => [
          r.sensorFamily,
          r.sensorReference,
          r.sensitivityClass,
          r.magnetId,
          r.approachId,
          r.pullInMm,
          r.dropOutMm,
          r.provenance.sourceRef,
        ]),
      ],
    },
    {
      name: "Catalogue",
      rows: [
        ["Capteur / Sensor", "Champ français", "Field English", "Valeur / Value", "Source"],
        ...SENSOR_CATALOG.filter((m) => m.sourceFile).flatMap((m) => {
          const spec = SENSOR_SPECIFICATIONS[m.id];
          const source = m.sourceFile!;
          const row = (fr: string, english: string, value: Cell): Cell[] => [
            m.id,
            fr,
            english,
            value,
            source,
          ];
          return [
            row("Longueur du corps (mm)", "Body length (mm)", m.body[0]),
            row("Hauteur du corps (mm)", "Body height (mm)", m.body[1]),
            row("Largeur du corps (mm)", "Body width (mm)", m.body[2]),
            row("Matériau du boîtier", "Housing material", spec?.material ?? null),
            ...(spec?.electrical.flatMap((e) => [
              row(
                "Puissance maximale · " + e.model + " (W)",
                "Maximum power · " + e.model + " (W)",
                e.power,
              ),
              row(
                "Tension de commutation · " + e.model + " (V)",
                "Switching voltage · " + e.model + " (V)",
                e.voltage,
              ),
              row(
                "Courant commuté · " + e.model + " (A)",
                "Switching current · " + e.model + " (A)",
                e.switching,
              ),
              row(
                "Courant permanent · " + e.model + " (A)",
                "Carry current · " + e.model + " (A)",
                e.carry,
              ),
            ]) ?? []),
            ...(spec?.temperatures.flatMap((t) => [
              row(
                "Température minimale · " + t.condition + " (°C)",
                "Minimum temperature · " + en(t.condition) + " (°C)",
                t.min,
              ),
              row(
                "Température maximale · " + t.condition + " (°C)",
                "Maximum temperature · " + en(t.condition) + " (°C)",
                t.max,
              ),
            ]) ?? []),
            row(
              "Qualification",
              "Qualification",
              "Valeurs de série : vérifier la référence commandable et ne pas combiner les maxima. / Series ratings: verify the order code; do not combine maxima.",
            ),
          ];
        }),
      ],
    },
    {
      name: "Reglages",
      rows: [
        ["Champ français", "Field English / Path", "Valeur / Value"],
        [
          "Instantané",
          "Snapshot",
          "Valeurs figées : modifier ce fichier ne relance pas le moteur. / Snapshot: editing this file does not rerun the engine.",
        ],
        ["Fichier 3D", "GLB", "Fichier 3D non inclus / 3D file not included"],
        ...flatten({
          need: study.need,
          comparisonApproach: study.comparisonApproach,
          selectedSolutionId: study.selectedSolutionId,
          montage: config,
        }).map(([path, value]) => [frenchPath(String(path)), path ?? null, value ?? null]),
      ],
    },
  ];
  return sheets;
}
const PATH_FR: Record<string, string> = {
  need: "Besoin",
  montage: "Montage",
  gapClosedMm: "Entrefer fermé (mm)",
  gapOpenMm: "Entrefer ouvert (mm)",
  gapToleranceMm: "Tolérance (mm)",
  temperatureMinC: "Température minimale (°C)",
  temperatureMaxC: "Température maximale (°C)",
  agingAllowancePct: "Perte au vieillissement (%)",
  comparisonApproach: "Position de comparaison",
  selectedSolutionId: "Solution retenue",
  version: "Version",
  demoReach: "Portée pédagogique (mm)",
  lateralShift: "Décalage latéral (mm)",
  magnetTilt: "Inclinaison aimant (°)",
  magnetModel: "Modèle aimant",
  machine: "Objet 3D",
  sensorId: "Capteur",
  mode: "Mode",
  sensitivity: "Classe de sensibilité",
  geometry: "Trajet",
  motion: "Mouvement",
  start: "Départ (mm)",
  end: "Arrivée (mm)",
  offset: "Décalage (mm)",
  travel: "Course (mm)",
  span: "Amplitude",
  sensorAngle: "Angle capteur (°)",
  magnetAngle: "Angle aimant (°)",
  magnetization: "Aimantation",
  polarity: "Polarité",
  mountAngle: "Angle montage (°)",
  mountX: "Montage X (mm)",
  mountZ: "Montage Z (mm)",
  ferromagnetic: "Matière ferromagnétique",
  temperature: "Environnement thermique",
  initialContact: "Contact initial",
  targetStart: "Début fenêtre souhaitée (%)",
  targetEnd: "Fin fenêtre souhaitée (%)",
  assetKey: "Identifiant objet",
  fileName: "Nom fichier",
  unitScale: "Facteur vers mm",
  movingNode: "Pièce mobile",
  sensorPosition: "Position capteur (mm)",
  sensorRotation: "Rotation capteur (°)",
  magnetPosition: "Position aimant (mm)",
  magnetRotation: "Rotation aimant (°)",
  sensorMount: "Support capteur",
  magnetMount: "Support aimant",
  pivot: "Pivot (mm)",
  rotationAxis: "Axe de rotation",
  openingAngle: "Angle ouvert (°)",
  space: "Gabarit (mm)",
};
const frenchPath = (path: string) =>
  path
    .split(".")
    .map((p) => PATH_FR[p] ?? ({ 0: "X", 1: "Y", 2: "Z" } as Record<string, string>)[p] ?? p)
    .join(" · ");
function flatten(value: unknown, path = ""): Cell[][] {
  if (value !== null && typeof value === "object")
    return Object.entries(value).flatMap(([k, v]) => flatten(v, path ? path + "." + k : k));
  return [
    [
      path,
      typeof value === "number" || typeof value === "boolean"
        ? value
        : value == null
          ? null
          : String(value),
    ],
  ];
}
const xml = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const col = (n: number): string =>
  n < 26 ? String.fromCharCode(65 + n) : col(Math.floor(n / 26) - 1) + col(n % 26);
/** Native OOXML packaged in the browser with the existing ZIP dependency. */
export function workbookBytes(sheets: ExportSheet[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const put = (p: string, s: string) => {
    files[p] = strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + s);
  };
  put(
    "[Content_Types].xml",
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
  );
  put(
    "_rels/.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  put(
    "xl/workbook.xml",
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
  );
  put(
    "xl/_rels/workbook.xml.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  put(
    "xl/styles.xml",
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF254061"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
  );
  sheets.forEach((s, i) => {
    const width = Math.max(...s.rows.map((r) => r.length));
    put(
      `xl/worksheets/sheet${i + 1}.xml`,
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${Array.from({ length: width }, (_, j) => `<col min="${j + 1}" max="${j + 1}" width="${j === width - 1 ? 70 : 30}" customWidth="1"/>`).join("")}</cols><sheetData>${s.rows.map((row, ri) => `<row r="${ri + 1}" ht="${ri === 0 ? 44 : Math.min(300, Math.max(32, ...row.map((v, ci) => Math.ceil(String(v ?? "").length / (ci === width - 1 ? 65 : 28)) * 15 + 8)))}" customHeight="1">${row.map((v, ci) => (v === null ? `<c r="${col(ci)}${ri + 1}" s="0"/>` : typeof v === "number" && Number.isFinite(v) ? `<c r="${col(ci)}${ri + 1}" s="0"><v>${v}</v></c>` : `<c r="${col(ci)}${ri + 1}" s="${ri === 0 ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${xml(String(v))}</t></is></c>`)).join("")}</row>`).join("")}</sheetData><autoFilter ref="A1:${col(width - 1)}${s.rows.length}"/></worksheet>`,
    );
  });
  return zipSync(files, { level: 6 });
}

export function downloadBinary(name: string, bytes: Uint8Array, type: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
