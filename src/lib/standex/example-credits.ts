/** Crédits exacts lus dans `asset.extras` des fichiers : noms propres et
 *  licences, jamais traduits (exclus de l'inventaire i18n). */
export interface ExampleCredit { title: string; author: string; authorUrl: string; license: string; licenseUrl: string; source: string }
export const EXAMPLE_CREDITS: Record<string, ExampleCredit> = {
  "builtin:blender-v2": {
    title: "Blender",
    author: "assetfactory",
    authorUrl: "https://sketchfab.com/assetfactory",
    license: "Sketchfab Standard",
    licenseUrl: "https://sketchfab.com/licenses",
    source: "https://sketchfab.com/3d-models/blender-f731dbfce6ea486095a39a0750e656ec",
  },
  "builtin:water-meter-v2": {
    title: "Payton Water Meter Mechanism",
    author: "trinityscsp",
    authorUrl: "https://sketchfab.com/trinityscsp",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    source: "https://sketchfab.com/3d-models/payton-water-meter-mechanism-002b9cd069ea46d0bf3b27548104dc5b",
  },
  "builtin:cnc-v2": {
    title: "CNC_Meachine",
    author: "Ranjith",
    authorUrl: "https://sketchfab.com/sivaprakasamranjith",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    source: "https://sketchfab.com/3d-models/cnc-meachine-50a0040a7ef449bd9990c7795aab84f6",
  },
  "builtin:hospital-bed-v2": {
    title: "Hospital bed",
    author: "M.E.G",
    authorUrl: "https://sketchfab.com/Grind-wkrkfo",
    license: "Sketchfab Standard",
    licenseUrl: "https://sketchfab.com/licenses",
    source: "https://sketchfab.com/3d-models/hospital-bed-bcfde70e263f47149ad1a45093097da3",
  },
};
