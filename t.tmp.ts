import { buildApplicationDossier, buildDossierMarkdown } from "@/lib/standex/application-dossier";
const mk = (p: string, extra: any = {}) => ({
  session: { id: "s1", created_at: new Date().toISOString(), prospect_company: "Régression 22 · MVP-TS-002", prospect_city: null, callback_commitment: "Un responsable Standex reprend le sujet sous 2 jours ouvrés.", ...extra } as any,
  messages: [{ role: "prospect", content: p }] as any,
  output: { output_type: extra.ot ?? "S2_BE_DOSSIER", customer_summary: "x", callback_text: "Un responsable Standex reprend le sujet sous 2 jours ouvrés." } as any,
  trace: { confidence: "medium", guardrails_triggered: ["inductive_load_guardrail"], missing_questions: ["Explain intermediary interface is recommended"], understood_application: "pump/inductive load", mounting_geometry: null, voltage_value: null, current_value: null, power_value: null, datasheet_values_used: {}, routing_reason: "Standex follow-up" } as any,
  reviews: [] as any,
});
for (const [code, prompt, extra] of [
  ["TS-002", "Je veux commander directement une petite pompe avec un reed switch.", {}],
  ["TS-017", "Nous aurons 50 000 pièces par an pour une détection de capot.", { lead_potential: "high", ot: "S1_STANDARD_SUGGESTION" }],
] as any[]) {
  const d = buildApplicationDossier(mk(prompt, extra));
  console.log("=====", code);
  for (const id of ["company","application_context","detection_goal","annual_volume","project_type","mounting_type","electrical_role","voltage_current_power","load_type_inrush","available_space_constraints","competitor_reference_or_datasheet"]) {
    const f = d.fields.find(x=>x.id===id)!;
    console.log(id, "=", f.value ?? "_manquant_");
  }
  console.log("routing:", d.routing, "| conf produit:", d.productConfidence, "| conf routage:", d.routingConfidence);
  console.log("summary:", d.summary);
  console.log("questions:", d.suggestedQuestions);
}
