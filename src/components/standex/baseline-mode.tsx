// Panneau « Mode assistant » : baseline gelée V1.0 + mode expérimental désactivé.
// Aucun appel modèle, aucune écriture Supabase : préparation d'interface seulement.

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import type { ExperimentalRun } from "@/lib/standex/experimental-run";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
    <div className="rounded-md border border-border bg-card p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {title}
      </p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function BaselineStatusBadge() {
  return (
    <Badge
      variant="outline"
      className="border-success/50 font-mono text-[10px] uppercase text-success"
      title={BASELINE_FACTS.join(" · ")}
    >
      {BASELINE_LABEL}
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
      <Card title="Statut">
        <div className="flex flex-wrap items-center gap-2">
          <BaselineStatusBadge />
          {run?.model && (
            <Badge variant="outline" className="font-mono text-[10px] uppercase">
              {run.model}
            </Badge>
          )}
        </div>
        <ul className="mt-3 space-y-1 font-mono text-xs text-muted-foreground">
          {BASELINE_FACTS.map((f) => (
            <li key={f}>· {f}</li>
          ))}
        </ul>
      </Card>

      <Card title="Mode assistant (testeur)">
        <Select value={mode} onValueChange={(v) => onModeChange(v as AssistantMode)}>
          <SelectTrigger className="h-8 font-mono text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASSISTANT_MODES.map((m) => (
              <SelectItem
                key={m.id}
                value={m.id}
                disabled={!m.available}
                className="font-mono text-xs"
              >
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-3 rounded-sm border border-warning/40 bg-warning/10 p-2 font-mono text-[11px] text-warning">
          {EXPERIMENTAL_NOTICE}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!experimentalActive || !canRun || busy}
            onClick={() => onGenerate?.()}
          >
            {busy ? "Génération…" : "Générer la réponse expérimentale"}
          </Button>
          <Button size="sm" variant="outline" disabled={!run?.payload} onClick={() => onExportPack?.()}>
            Exporter le pack comparatif
          </Button>
        </div>
        {run?.error && (
          <p className="mt-2 rounded-sm border border-destructive/50 bg-destructive/10 p-2 font-mono text-[11px] text-destructive">
            {run.error} — la baseline reste affichée et inchangée.
          </p>
        )}
        {run?.schemaWarning && (
          <p className="mt-2 rounded-sm border border-warning/40 bg-warning/10 p-2 font-mono text-[11px] text-warning">
            {run.schemaWarning}
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Réponse baseline déterministe">
          <p className="whitespace-pre-wrap break-words text-xs">
            {baselineResponse ?? "Aucune réponse baseline pour cette session."}
          </p>
        </Card>
        <Card title="Réponse assistant expérimental">
          {experimentalResponse ? (
            <p className="whitespace-pre-wrap break-words text-xs">{experimentalResponse}</p>
          ) : (
            <p className="text-xs text-muted-foreground">{EXPERIMENTAL_NOTICE}</p>
          )}
        </Card>
        <Card title="Trace interne baseline">
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
            {baselineTrace ?? "—"}
          </pre>
        </Card>
        <Card title="Trace interne générative">
          {run?.payload ? (
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
              {JSON.stringify(
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
              )}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground">Aucune génération expérimentale.</p>
          )}
        </Card>
      </div>

      <Card title="Différences baseline / expérimental">
        {experimentalResponse ? (
          <ul className="space-y-1 font-mono text-[11px]">
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
                {r.kind === "same" ? "= " : r.kind === "baseline" ? "− " : "+ "}
                {r.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            Comparaison disponible après une génération expérimentale.
          </p>
        )}
      </Card>

      <Card title="Verdict humain (comparaison)">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={!run?.payload}
          placeholder="Verdict humain sur la comparaison baseline / expérimental."
          className="min-h-20 font-mono text-xs"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!run?.payload}
            onClick={() => onVerdict?.("baseline", notes)}
          >
            Préférer la baseline
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!run?.payload}
            onClick={() => onVerdict?.("experimental", notes)}
          >
            Préférer l'expérimental
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!run?.payload}
            onClick={() => onVerdict?.("neither", notes)}
          >
            Aucun des deux
          </Button>
        </div>
      </Card>
    </div>
  );
}

