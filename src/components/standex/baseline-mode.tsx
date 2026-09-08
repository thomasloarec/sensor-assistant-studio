import { t } from "@/lib/i18n/core";
// Panneau « Mode assistant » : baseline gelée V1.0 + mode expérimental désactivé.
// Aucun appel modèle, aucune écriture Supabase : préparation d'interface seulement.

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import type { ExperimentalRun } from "@/lib/standex/experimental-run";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ASSISTANT_MODES,
  BASELINE_FACTS,
  BASELINE_LABEL,
  EXPERIMENTAL_NOTICE,
  diffLines,
  type AssistantMode,
} from "@/lib/standex/baseline";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel-block">
      <p className="t-label font-mono">{t(title)}</p>
      <div className="mt-3">{t(children)}</div>
    </div>
  );
}

export function BaselineStatusBadge() {
  return (
    <Badge
      variant="outline"
      className="font-mono t-label text-success"
      title={BASELINE_FACTS.map((f) => t(f)).join(" · ")}
    >
      {t(BASELINE_LABEL)}
    </Badge>
  );
}

export function BaselineModePanel({
  mode,
  onModeChange,
  baselineResponse,
  baselineTrace,
  run,
  busy,
  canRun,
  onGenerate,
  onVerdict,
  onExportPack,
}: {
  mode: AssistantMode;
  onModeChange: (m: AssistantMode) => void;
  baselineResponse: string | null;
  baselineTrace: string | null;
  run?: ExperimentalRun | null;
  busy?: boolean;
  canRun?: boolean;
  onGenerate?: () => void;
  onVerdict?: (preferred: "baseline" | "experimental" | "neither", notes: string) => void;
  onExportPack?: () => void;
}) {
  const [notes, setNotes] = useState("");
  const experimentalResponse = run?.payload?.customer_response ?? "";
  const rows = diffLines(baselineResponse ?? "", experimentalResponse);
  const experimentalActive = mode === "experimental";

  return (
    <div className="space-y-4 p-4">
      <Card title={t("Statut")}>
        <div className="flex flex-wrap items-center gap-2">
          <BaselineStatusBadge />
          {run?.model && (
            <Badge variant="outline" className="t-label font-mono">
              {t(run.model)}
            </Badge>
          )}
        </div>
        <ul className="mt-3 space-y-1 font-mono t-caption text-muted-foreground">
          {BASELINE_FACTS.map((f) => (
            <li key={f}>· {t(f)}</li>
          ))}
        </ul>
      </Card>

      <Card title={t("Mode assistant (testeur)")}>
        <Select value={mode} onValueChange={(v) => onModeChange(v as AssistantMode)}>
          <SelectTrigger className="min-h-11 font-mono t-caption">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASSISTANT_MODES.map((m) => (
              <SelectItem
                key={m.id}
                value={m.id}
                disabled={!m.available}
                className="font-mono t-caption"
              >
                {t(m.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="notice notice-warning mt-3 font-mono t-caption text-warning">
          {t(EXPERIMENTAL_NOTICE)}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!experimentalActive || !canRun || busy}
            onClick={() => onGenerate?.()}
          >
            {t(busy ? "Génération…" : "Générer la réponse expérimentale")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!run?.payload}
            onClick={() => onExportPack?.()}
          >
            {t("Exporter le pack comparatif")}
          </Button>
        </div>
        {run?.error && (
          <div className="notice notice-danger mt-2 t-caption text-destructive">
            <p>{t(run.error)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!canRun || busy}
                onClick={() => onGenerate?.()}
              >
                {t("Relancer Claude")}
              </Button>
            </div>
            {run.rawText ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-muted-foreground">
                  {t("Voir le fragment brut renvoyé")}
                </summary>
                <pre className="code-block mt-1 max-h-40 whitespace-pre-wrap break-words text-muted-foreground">
                  {t(run.rawText)}
                </pre>
              </details>
            ) : null}
          </div>
        )}
        {run?.schemaWarning && (
          <p className="notice notice-warning mt-2 font-mono t-caption text-warning">
            {t(run.schemaWarning)}
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("Réponse baseline déterministe")}>
          <p className="whitespace-pre-wrap break-words t-caption">
            {t(baselineResponse ?? "Aucune réponse baseline pour cette session.")}
          </p>
        </Card>
        <Card title={t("Réponse assistant expérimental")}>
          {experimentalResponse ? (
            <p className="whitespace-pre-wrap break-words t-caption">{t(experimentalResponse)}</p>
          ) : (
            <p className="t-caption text-muted-foreground">{t(EXPERIMENTAL_NOTICE)}</p>
          )}
        </Card>
      </div>

      <Accordion type="multiple" className="w-full">
        <AccordionItem value="diff">
          <AccordionTrigger className="text-sm">{t("Différences ligne à ligne")}</AccordionTrigger>
          <AccordionContent>
            {experimentalResponse ? (
              <ul className="space-y-1 font-mono t-caption">
                {rows.map((r, i) => (
                  <li
                    key={`${r.kind}-${i}`}
                    className={
                      r.kind === "same"
                        ? "text-muted-foreground"
                        : r.kind === "baseline"
                          ? "text-accent"
                          : "text-warning"
                    }
                  >
                    {t(r.kind === "same" ? "= " : r.kind === "baseline" ? "− " : "+ ")}
                    {t(r.text)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-caption text-muted-foreground">
                {t("Comparaison disponible après une génération expérimentale.")}
              </p>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="traces">
          <AccordionTrigger className="text-sm">{t("Traces internes (avancé)")}</AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title={t("Trace interne baseline")}>
                <pre className="code-block max-h-56 whitespace-pre-wrap break-words text-muted-foreground">
                  {t(baselineTrace ?? "—")}
                </pre>
              </Card>
              <Card title={t("Trace interne générative")}>
                {run?.payload ? (
                  <pre className="code-block max-h-56 whitespace-pre-wrap break-words text-muted-foreground">
                    {t(
                      JSON.stringify(
                        {
                          output_type: run.payload.output_type,
                          confidence: run.payload.confidence,
                          routing_reason: run.payload.routing_reason,
                          guardrails_triggered: run.payload.guardrails_triggered,
                          missing_questions: run.payload.missing_questions,
                          fuites: run.leaks,
                          ecarts: run.violations,
                          tokens: run.usage,
                        },
                        null,
                        2,
                      ),
                    )}
                  </pre>
                ) : (
                  <p className="t-caption text-muted-foreground">
                    {t("Aucune génération expérimentale.")}
                  </p>
                )}
              </Card>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Card title={t("Verdict humain (comparaison)")}>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={!run?.payload}
          placeholder={t("Verdict humain sur la comparaison baseline / expérimental.")}
          className="min-h-20 font-mono t-caption"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!run?.payload}
            onClick={() => onVerdict?.("baseline", notes)}
          >
            {t("Préférer la baseline")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!run?.payload}
            onClick={() => onVerdict?.("experimental", notes)}
          >
            {t("Préférer l'expérimental")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!run?.payload}
            onClick={() => onVerdict?.("neither", notes)}
          >
            {t("Aucun des deux")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
