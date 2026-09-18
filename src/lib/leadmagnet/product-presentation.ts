import { sensorById, type SensorModel } from "@/lib/standex/sensor-catalog";

/** Shared by forms, reports and product drawings. No cable on board components. */
export function isPcbSensor(id: string | null | undefined): boolean {
  if (!id) return false;
  const m = sensorById(id);
  return ["smd", "glass", "custom_pcb"].includes(m.shape) || m.category === "THT";
}

export function cableConstruction(model: SensorModel): "none" | "wires" | "jacket" | "metal" {
  if (model.magnet || isPcbSensor(model.id)) return "none";
  return model.id === "MK18" ? "wires" : model.id === "MK27" ? "metal" : "jacket";
}

// i18n-canonical: labels translated by callers.
export function housingMaterial(model: SensorModel): string | null {
  if (model.id.startsWith("MK11-P")) return "Boîtier en plastique";
  if (model.id.startsWith("MK11-B")) return "Boîtier en laiton";
  if (model.id.startsWith("MK11")) return "Boîtier en acier inoxydable";
  return null;
}

// i18n-canonical: grouping is descriptive, never a suitability verdict.
export function pairCategory(model: SensorModel): string {
  if (isPcbSensor(model.id)) return "Capteurs sur PCB et sur mesure";
  if (["cylinder", "pressfit", "threaded"].includes(model.shape))
    return "Capteurs cylindriques et filetés";
  return "Capteurs à visser";
}

/* --------------------------------------------------------------------------
 * Titre automatique : le NOM DE LA PIÈCE, pas le début de la phrase.
 *
 * « Détecter automatiquement la présence du réservoir d'eau amovible d'une
 * machine à café professionnelle. » donne « Réservoir d'eau amovible », et
 * « Détecter la fermeture de la porte du lave-vaisselle. » donne « Porte de
 * lave-vaisselle ». Le verbe d'intention et le nom d'état (présence,
 * fermeture…) sont retirés, le complément d'équipement introduit par « d'un /
 * d'une / dans / sur / pour » s'arrête là. Rien n'est inventé : si la phrase ne
 * laisse aucun groupe nominal, on retombe sur ses premiers mots. Un titre déjà
 * saisi à la main n'est jamais réécrit par cette fonction.
 * ------------------------------------------------------------------------ */
/** Mots d'intention en tête de phrase, sans valeur descriptive. */
const LEAD_NOISE =
  /^(?:je|nous|il|on|veux|voudrais|souhaite|souhaitons|aimerais|faut|besoin|de|pouvoir|savoir|connaître|détecter|detecter|détection|detection|contrôler|controler|vérifier|verifier|surveiller|mesurer|identifier|signaler|repérer|reperer|capter|automatiquement|précisément|precisement|si|que|faut-il)$/i;
/** Nom d'état : ce n'est pas la pièce, c'est ce qu'on en observe. */
const STATE_HEAD =
  /^(?:la\s+|le\s+|l['’])?(présence|presence|absence|fermeture|ouverture|position|passage|état|etat|niveau|verrouillage|arrivée|arrivee|fin\s+de\s+course)\s+(?:de\s+la\s+|de\s+l['’]|du\s+|des\s+|de\s+|d['’])?/i;
/** Ce qui introduit l'ÉQUIPEMENT hôte, donc la fin du nom de la pièce. */
const HOST_LEAD = /^(?:d['’](?:un|une)|dans|sur|pour|afin|avec|quand|lorsque|au|aux|en|à|a)$/i;
const TRAILING_STOP =
  /^(?:de|du|des|d['’]|la|le|les|l['’]|un|une|et|ou|à|a|en|pour|avec|dans|sur|par)$/i;

export function suggestedProjectTitle(goal: string): string {
  const sentence = (goal ?? "").trim().replace(/\s+/g, " ").replace(/[.!?].*$/, "");
  const fallback = capFortyEight(sentence.split(" ").filter(Boolean).slice(0, 6));
  let rest = sentence;
  // 1. Retirer les mots d'intention en tête, un par un.
  for (;;) {
    const [first = "", ...others] = rest.split(" ");
    if (first && LEAD_NOISE.test(first)) rest = others.join(" ");
    else break;
  }
  // 2. Retirer le nom d'état (« la présence du », « la fermeture de la »…).
  rest = rest.replace(STATE_HEAD, "");
  // 3. Retirer l'article restant devant la pièce.
  rest = rest.replace(/^(?:la|le|les|un|une|des|du|de\s+la|l['’]|d['’])\s*/i, "");
  // 4. Garder le groupe nominal jusqu'au complément d'équipement.
  const kept: string[] = [];
  for (const word of rest.split(" ").filter(Boolean)) {
    if (kept.length > 0 && HOST_LEAD.test(word)) break;
    kept.push(word);
  }
  while (kept.length > 0 && TRAILING_STOP.test(kept[kept.length - 1]!)) kept.pop();
  if (kept.length === 0) return fallback;
  // Style de titre : « porte du lave-vaisselle » se lit « Porte de lave-vaisselle ».
  const title = capFortyEight(kept)
    .replace(/\bdu\b/gi, "de")
    .replace(/\bde\s+la\b/gi, "de")
    .replace(/\bdes\b/gi, "de");
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** Assemblage borné à 48 caractères, jamais coupé en milieu de mot. */
function capFortyEight(words: string[]): string {
  const out: string[] = [];
  for (const word of words) {
    const next = out.length === 0 ? word : `${out.join(" ")} ${word}`;
    if (next.length > 48) break;
    out.push(word);
  }
  const joined = out.join(" ") || (words[0] ?? "").slice(0, 48);
  return joined.replace(/[\s,;:]+$/, "");
}
