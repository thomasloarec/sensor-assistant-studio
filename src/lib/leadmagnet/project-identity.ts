import { isIndustry, type Industry } from "./industries.ts";
export const IDENTITY_KEYS = [
  "detection_goal",
  "target_object",
  "states_motion",
  "mounting",
  "electrical",
  "environment",
] as const;
export interface IdentityInput {
  locale: string;
  answers: { key: string; value: string; state: string }[];
}
export interface ProjectIdentity {
  title: string;
  industry: Industry | null;
}
export function identityInput(d: {
  sourceLocale: string;
  requirements: { key: string; value: string; state: string }[];
}): IdentityInput {
  return {
    locale: d.sourceLocale,
    answers: IDENTITY_KEYS.map((key) => {
      const r = d.requirements.find((r) => r.key === key);
      return { key, value: r?.value.slice(0, 3000) ?? "", state: r?.state ?? "unknown" };
    }),
  };
}
export const identityKey = (d: Parameters<typeof identityInput>[0]) =>
  JSON.stringify([
    d.sourceLocale,
    IDENTITY_KEYS.map((key) => {
      const r = d.requirements.find((r) => r.key === key);
      return [key, r?.value ?? "", r?.state ?? "unknown"];
    }),
  ]);
export function parseIdentityInput(raw: unknown): IdentityInput | null {
  const v = raw as IdentityInput | null;
  if (
    !v ||
    !["fr", "en", "de", "es", "it", "zh", "ja", "ru"].includes(v.locale) ||
    !Array.isArray(v.answers) ||
    v.answers.length !== 6
  )
    return null;
  if (
    !v.answers.every(
      (a, i) =>
        a &&
        a.key === IDENTITY_KEYS[i] &&
        typeof a.value === "string" &&
        a.value.length <= 3000 &&
        ["confirmed", "hypothesis", "unknown"].includes(a.state),
    )
  )
    return null;
  if (!v.answers.some((a) => a.value.trim().length > 3)) return null;
  return {
    locale: v.locale,
    answers: v.answers.map(({ key, value, state }) => ({ key, value, state })),
  };
}
/** Evidence is an exact excerpt, never chain-of-thought or a claimed 100% certainty. */
export function parseProjectIdentity(raw: unknown, input: IdentityInput): ProjectIdentity | null {
  const v = raw as Record<string, unknown> | null;
  if (!v || typeof v["title"] !== "string") return null;
  const title = v["title"].trim();
  if (
    !title ||
    title.length > 80 ||
    title.split(/\s+/).length > 10 ||
    /[\r\n<>]|https?:\/\//i.test(title)
  )
    return null;
  const evidence = v["evidence"] as { key?: unknown; quote?: unknown } | null;
  const supported =
    evidence &&
    typeof evidence.quote === "string" &&
    evidence.quote.length >= 4 &&
    input.answers.some((a) => a.key === evidence.key && a.value.includes(evidence.quote as string));
  return {
    title,
    industry: v["certainty"] === "clear" && isIndustry(v["industry"]) && supported ? v["industry"] : null,
  };
}
