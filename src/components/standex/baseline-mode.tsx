// Panneau « Mode assistant » : baseline gelée V1.0 + mode expérimental désactivé.
// Aucun appel modèle, aucune écriture Supabase : préparation d'interface seulement.

import { Badge } from "@/components/ui/badge";
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
}: {
  mode: AssistantMode;
  onModeChange: (m: AssistantMode) => void;
  baselineResponse: string | null;
  baselineTrace: string | null;
}) {
  const experimentalResponse = "";
  const rows = diffLines(baselineResponse ?? "", experimentalResponse);

  return (
    <div className="space-y-4 p-4">
      <Card title="Statut">
        <div className="flex flex-wrap items-center gap-2">
          <BaselineStatusBadge />
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
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Réponse baseline déterministe">
          <p className="whitespace-pre-wrap break-words text-xs">
            {baselineResponse ?? "Aucune réponse baseline pour cette session."}
          </p>
        </Card>
        <Card title="Réponse assistant expérimental">
          <p className="text-xs text-muted-foreground">{EXPERIMENTAL_NOTICE}</p>
        </Card>
        <Card title="Trace interne baseline">
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
            {baselineTrace ?? "—"}
          </pre>
        </Card>
        <Card title="Trace interne générative">
          <p className="text-xs text-muted-foreground">Non disponible (mode désactivé).</p>
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
            Comparaison disponible une fois le mode expérimental configuré.
          </p>
        )}
      </Card>

      <Card title="Verdict humain (comparaison)">
        <Textarea
          disabled
          placeholder="Verdict humain sur la comparaison — disponible avec le mode expérimental."
          className="min-h-20 font-mono text-xs"
        />
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" disabled>
            Préférer la baseline
          </Button>
          <Button size="sm" variant="outline" disabled>
            Préférer l'expérimental
          </Button>
        </div>
      </Card>
    </div>
  );
}
