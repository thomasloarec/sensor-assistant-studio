import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isSupabaseConfigured, supabase } from "@/lib/standex/supabase";
import * as db from "@/lib/standex/queries";
import { runScenario, safeOutputType, splitList } from "@/lib/standex/scenario-run";
import { composeResponse } from "@/lib/standex/response-contract";
import { evaluateRun, type ScenarioEvaluation } from "@/lib/standex/evaluate";
import {
  SECTION_LABELS,
  buildApplicationDossier,
  buildDossierMarkdown,
  type DossierSection,
} from "@/lib/standex/application-dossier";
import { buildCsv, buildMarkdown, downloadText } from "@/lib/standex/export";
import type { AssistantMode } from "@/lib/standex/baseline";
import {
  BaselineModePanel,
  BaselineStatusBadge,
} from "@/components/standex/baseline-mode";
import {
  REVIEW_PACK_SCENARIOS,
  buildReviewPack,
} from "@/lib/standex/review-pack";
import {
  REVIEWER_ROLES,
  VERDICTS,
  type ReviewerRole,
  type SensorTestInternalTrace,
  type SensorTestMessage,
  type SensorTestOutput,
  type SensorTestReview,
  type SensorTestScenario,
  type SensorTestSession,
  type Verdict,
} from "@/lib/standex/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Banc de test assistant capteur — Standex interne" },
      {
        name: "description",
        content:
          "Outil interne Standex : rejouer des scénarios de test sur l'assistant capteur, inspecter la sortie client, la trace interne, la revue et les données lead.",
      },
      { property: "og:title", content: "Banc de test assistant capteur — Standex interne" },
      {
        property: "og:description",
        content:
          "Outil interne de test : conversation, sortie client, trace interne, revue et données lead.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  ssr: false,
  component: TestBench,
});

function TestBench() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background font-sans text-foreground">
      <Header user={user} />
      {!isSupabaseConfigured ? (
        <NotConfigured />
      ) : !authReady ? (
        <CenterNote>Chargement de la session…</CenterNote>
      ) : !user ? (
        <SignIn />
      ) : (
        <Bench user={user} />
      )}
    </div>
  );
}

function Header({ user }: { user: User | null }) {
  return (
    <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
      <div className="flex items-center gap-3">
        <span className="rounded-sm bg-primary px-2 py-1 font-mono text-xs font-semibold tracking-widest text-primary-foreground">
          STANDEX
        </span>
        <h1 className="text-sm font-semibold tracking-tight">Banc de test — assistant capteur</h1>
        <Badge variant="outline" className="font-mono text-[10px] uppercase">
          interne · schéma V0.2
        </Badge>
        <BaselineStatusBadge />
      </div>
      <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            className={`size-1.5 rounded-full ${isSupabaseConfigured ? "bg-success" : "bg-warning"}`}
          />
          {isSupabaseConfigured ? "Supabase connecté" : "Supabase non configuré"}
        </span>
        {user ? (
          <>
            <Separator orientation="vertical" className="h-4" />
            <span>{user.email}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 font-mono text-xs"
              onClick={() => supabase?.auth.signOut()}
            >
              Déconnexion
            </Button>
          </>
        ) : null}
      </div>
    </header>
  );
}

function CenterNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-lg rounded-md border border-dashed border-border bg-card p-6">
        <h2 className="font-mono text-xs uppercase tracking-widest text-warning">
          Backend non relié
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Le banc pointe vers ton projet Supabase existant. Renseigne&nbsp;:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-sm bg-secondary p-3 font-mono text-xs">
          VITE_SUPABASE_URL=https://xxxx.supabase.co{"\n"}VITE_SUPABASE_PUBLISHABLE_KEY=…
        </pre>
        <p className="mt-3 text-xs text-muted-foreground">
          Le schéma V0.2 à appliquer côté Supabase est versionné dans{" "}
          <span className="font-mono">supabase/schema/schema_v0.2.sql</span>.
        </p>
      </div>
    </div>
  );
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  };

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <form onSubmit={submit} className="w-full max-w-sm rounded-md border border-border bg-card p-6">
        <h2 className="font-mono text-xs uppercase tracking-widest text-accent">
          Accès testeur Standex
        </h2>
        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="font-mono text-xs">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="font-mono text-xs">
              Mot de passe
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>
        {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}
        <Button type="submit" className="mt-4 w-full" disabled={busy}>
          {busy ? "Connexion…" : "Se connecter"}
        </Button>
      </form>
    </div>
  );
}

const PRIORITY_SCENARIOS = [
  "MVP-TS-002",
  "MVP-TS-003",
  "MVP-TS-004",
  "MVP-TS-005",
  "MVP-TS-006",
  "MVP-TS-007",
  "MVP-TS-021",
  "MVP-TS-022",
] as const;

interface BatchRow {
  code: string;
  missing?: boolean;
  priority?: string | null;
  scenario?: SensorTestScenario;
  evaluation?: ScenarioEvaluation;
  outputType?: string;
  guardrails?: string[];
  customerText?: string;
  trace?: SensorTestInternalTrace;
  review?: SensorTestReview;
  session?: SensorTestSession;
  sessionId?: string;
  dossierMarkdown?: string;

}

function Bench({ user }: { user: User }) {
  const [sessions, setSessions] = useState<SensorTestSession[]>([]);
  const [scenarios, setScenarios] = useState<SensorTestScenario[]>([]);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SensorTestMessage[]>([]);
  const [outputs, setOutputs] = useState<SensorTestOutput[]>([]);
  const [traces, setTraces] = useState<SensorTestInternalTrace[]>([]);
  const [reviews, setReviews] = useState<SensorTestReview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState(false);
  const [batch, setBatch] = useState<BatchRow[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchScope, setBatchScope] = useState<"p0" | "all">("p0");
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchRunAt, setBatchRunAt] = useState<string | null>(null);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId],
  );
  const scenario = useMemo(
    () => scenarios.find((s) => s.id === scenarioId) ?? null,
    [scenarios, scenarioId],
  );

  const guard = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void guard(async () => {
      const [s, sc] = await Promise.all([db.fetchSessions(), db.fetchScenarios()]);
      setSessions(s);
      setScenarios(sc);
      setActiveId((prev) => prev ?? s[0]?.id ?? null);
    });
  }, [guard]);

  const loadSession = useCallback(
    (id: string) =>
      guard(async () => {
        const [m, o, t, r] = await Promise.all([
          db.fetchMessages(id),
          db.fetchOutputs(id),
          db.fetchTraces(id),
          db.fetchReviews(id),
        ]);
        setMessages(m);
        setOutputs(o);
        setTraces(t);
        setReviews(r);
      }),
    [guard],
  );

  useEffect(() => {
    if (activeId) void loadSession(activeId);
    else {
      setMessages([]);
      setOutputs([]);
      setTraces([]);
      setReviews([]);
    }
  }, [activeId, loadSession]);

  const newSession = () =>
    guard(async () => {
      const s = await db.createSession(user.id);
      setSessions((prev) => [s, ...prev]);
      setActiveId(s.id);
    });

  const send = (role: "prospect" | "internal" = "prospect") =>
    guard(async () => {
      const content = draft.trim();
      if (!content || !activeId) return;
      const msg = await db.insertMessage({
        session_id: activeId,
        role,
        content,
        turn_index: messages.length,
      });
      setMessages((prev) => [...prev, msg]);
      setDraft("");
    });


  const selectScenario = (id: string) => {
    setScenarioId(id);
    const sc = scenarios.find((s) => s.id === id);
    if (sc) setDraft(sc.user_prompt_fr);
  };

  // Exécute le scénario sélectionné : session (créée si besoin), messages,
  // sortie assistant, trace interne et revue sont persistés dans Supabase.
  const runSelectedScenario = () =>
    guard(async () => {
      if (!scenario || running) return;
      setRunning(true);
      try {
        let sessionId = activeId;
        if (!sessionId) {
          const s = await db.createSession(user.id, {
            // Jamais de métadonnée de test dans un champ métier lead.
            consent_notes: `Scénario ${scenario.scenario_id}`,
            channel: "lovable_test",
            status: "in_review",
          });
          setSessions((prev) => [s, ...prev]);
          setActiveId(s.id);
          sessionId = s.id;
        }
        const existing = await db.fetchMessages(sessionId);
        await runScenario({
          sessionId,
          reviewerId: user.id,
          scenario,
          startTurnIndex: existing.length,
        });
        await loadSession(sessionId);
        setDraft("");
      } finally {
        setRunning(false);
      }
    });

  // Lot de test : une session dédiée par scénario, tout est persisté.
  const runBatch = (scope: "p0" | "all") =>
    guard(async () => {
      if (batchBusy) return;
      const codes =
        scope === "p0"
          ? [...PRIORITY_SCENARIOS]
          : scenarios.map((s) => s.scenario_id).sort((a, b) => a.localeCompare(b));
      setBatchBusy(true);
      setBatchScope(scope);
      setBatchTotal(codes.length);
      setBatch([]);
      setBatchRunAt(new Date().toISOString());
      const label = scope === "p0" ? "Lot prioritaire" : "Régression 22";
      try {
        for (const code of codes) {
          const sc = scenarios.find((s) => s.scenario_id === code);
          if (!sc) {
            setBatch((prev) => [...prev, { code, missing: true }]);
            continue;
          }
          const composed = composeResponse(sc);
          const evaluation = evaluateRun(sc, composed);
          const session = await db.createSession(user.id, {
            // Métadonnée de test hors des champs métier lead.
            consent_notes: `${label} · ${sc.scenario_id}`,
            channel: "lovable_test",
            status: "in_review",
          });
          const res = await runScenario({
            sessionId: session.id,
            reviewerId: user.id,
            scenario: sc,
            startTurnIndex: 0,
            verdict:
              scope === "p0"
                ? evaluation.verdict === "OK"
                  ? "good"
                  : "needs_revision"
                : "not_reviewed",
            notes: `${label} · ${evaluation.verdict}${
              evaluation.failures.length ? ` · ${evaluation.failures.join(" ; ")}` : ""
            }`,
          });
          setSessions((prev) => [session, ...prev]);
          const dossierMarkdown = buildDossierMarkdown(
            buildApplicationDossier({
              session,
              messages: [
                {
                  id: `${session.id}-prospect`,
                  session_id: session.id,
                  role: "prospect",
                  content: sc.user_prompt_fr,
                  turn_index: 0,
                  created_at: session.created_at,
                } as SensorTestMessage,
              ],
              output: res.output,
              trace: res.trace,
              reviews: [res.review],
            }),
            { tester: user.email ?? "—", scenarioCode: code },
          );
          setBatch((prev) => [
            ...prev,
            {
              code,
              priority: sc.priority,
              scenario: sc,
              evaluation,
              outputType: res.output.output_type,
              guardrails: composed.guardrails,
              customerText: composed.customerText,
              trace: res.trace,
              review: res.review,
              session,
              sessionId: session.id,
              dossierMarkdown,
            },
          ]);
        }
      } finally {
        setBatchBusy(false);
      }
    });

  const [assistantMode, setAssistantMode] = useState<AssistantMode>("baseline");

  const lastOutput = outputs[0] ?? null;
  const lastTrace = traces[0] ?? null;

  return (
    <>
      {error ? (
        <div className="shrink-0 border-b border-destructive/40 bg-destructive/10 px-5 py-2 font-mono text-xs text-destructive">
          {error}
        </div>
      ) : null}
      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Sessions + scénarios */}
        <aside className="hidden min-h-0 flex-col border-r border-border lg:flex">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Sessions
            </h2>
            <Button size="sm" variant="ghost" className="h-7 font-mono text-xs" onClick={newSession}>
              + Nouvelle
            </Button>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-2">
              {sessions.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">Aucune session.</p>
              ) : (
                sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveId(s.id)}
                    className={`mb-1 block w-full rounded-sm px-2 py-1.5 text-left font-mono text-xs transition-colors ${
                      s.id === activeId
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-secondary/60"
                    }`}
                  >
                    <div className="truncate">
                      {s.consent_notes ?? s.prospect_company ?? s.id.slice(0, 8)}
                    </div>
                    <div className="text-[10px] opacity-70">
                      {s.status} · {new Date(s.created_at).toLocaleDateString("fr-FR")}
                    </div>
                  </button>
                ))
              )}
            </div>
            <Separator />
            <div className="p-2">
              <h3 className="px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Scénarios actifs
              </h3>
              {scenarios.map((sc) => (
                <button
                  key={sc.id}
                  onClick={() => selectScenario(sc.id)}
                  className={`mb-1 block w-full rounded-sm px-2 py-1.5 text-left font-mono text-[11px] transition-colors hover:bg-secondary/60 ${
                    sc.id === scenarioId
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground"
                  }`}
                  title={sc.expected_behavior}
                >
                  <span className="text-accent">{sc.priority}</span> {sc.scenario_id}
                </button>
              ))}
              {scenarios.length === 0 ? (
                <p className="px-2 text-xs text-muted-foreground">Aucun scénario chargé.</p>
              ) : null}
            </div>
          </ScrollArea>
        </aside>

        {/* Conversation */}
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border-border lg:border-r">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Conversation
            </h2>
            <span className="font-mono text-[10px] text-muted-foreground">
              {activeSession ? `${messages.length} tour(s)` : "aucune session"}
            </span>
          </div>
          <ScenarioPanel
            scenarios={scenarios}
            scenario={scenario}
            onSelect={selectScenario}
            onRun={() => void runSelectedScenario()}
            running={running}
          />
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-3 p-4">
              {!activeSession ? (
                <p className="text-sm text-muted-foreground">
                  Crée une session de test pour démarrer.
                </p>
              ) : messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun message. Saisis un prompt ou charge un scénario.
                </p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={
                      m.role === "prospect"
                        ? "max-w-[85%] self-end rounded-md rounded-br-sm bg-secondary px-3 py-2"
                        : m.role === "assistant"
                          ? "max-w-[85%] self-start rounded-md rounded-bl-sm border border-border bg-card px-3 py-2"
                          : "w-full rounded-md border border-dashed border-border px-3 py-2"
                    }
                  >
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      #{m.turn_index} · {m.role}
                    </div>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{m.content}</p>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
          <div className="shrink-0 border-t border-border p-3">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send("prospect");
                }
              }}
              disabled={!activeSession}
              placeholder="Message prospect… (Entrée pour envoyer)"
              className="min-h-20 resize-none bg-card font-mono text-sm"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!activeSession || !draft.trim()}
                onClick={() => void send("internal")}
              >
                Note interne
              </Button>
              <Button
                size="sm"
                disabled={!activeSession || !draft.trim()}
                onClick={() => void send("prospect")}
              >
                Envoyer
              </Button>
            </div>
          </div>
        </section>

        {/* Inspecteur */}
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <Tabs defaultValue="client" className="flex min-h-0 flex-1 flex-col gap-0">
            <TabsList className="h-auto w-full flex-wrap justify-start rounded-none border-b border-border bg-transparent p-0">
              {(
                [
                  { v: "client", label: "Sortie client" },
                  { v: "trace", label: "Trace interne" },
                  { v: "revue", label: "Revue" },
                  { v: "lead", label: "Données lead" },
                  { v: "dossier", label: "Dossier application" },
                  { v: "mode", label: "Mode assistant" },
                  { v: "batch", label: "Synthèse" },
                ] as const
              ).map(({ v, label }) => (
                <TabsTrigger
                  key={v}
                  value={v}
                  className="rounded-none border-b-2 border-transparent px-4 py-2.5 font-mono text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="min-h-0 flex-1">
              <TabsContent value="client" className="m-0 h-full">
                <ScrollArea className="h-full">
                  <div className="space-y-3 p-4">
                    {!lastOutput ? (
                      <Empty>Aucune sortie client enregistrée pour cette session.</Empty>
                    ) : (
                      <div className="rounded-md border border-border bg-card p-4">
                        <Badge className="font-mono text-[10px]">{lastOutput.output_type}</Badge>
                        <p className="mt-3 text-sm whitespace-pre-wrap">
                          {lastOutput.customer_summary}
                        </p>
                        <dl className="mt-4 grid grid-cols-2 gap-2 font-mono text-xs">
                          <Field k="Famille" v={lastOutput.suggested_product_family} />
                          <Field k="Référence" v={lastOutput.suggested_reference} />
                          <Field
                            k="Validation Standex"
                            v={lastOutput.standex_validation_required ? "requise" : "non requise"}
                          />
                          <Field
                            k="Voie distributeur"
                            v={lastOutput.distributor_path_allowed ? "autorisée" : "bloquée"}
                          />
                        </dl>
                        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                          {lastOutput.callback_text}
                        </p>
                        <JsonBlock label="be_dossier" value={lastOutput.be_dossier} />
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="trace" className="m-0 h-full">
                <ScrollArea className="h-full">
                  <div className="space-y-3 p-4">
                    {!lastTrace ? (
                      <Empty>Aucune trace interne pour cette session.</Empty>
                    ) : (
                      <div className="rounded-md border border-border bg-card p-4">
                        <dl className="grid grid-cols-2 gap-2 font-mono text-xs">
                          <Field k="Application" v={lastTrace.understood_application} />
                          <Field k="Cible détection" v={lastTrace.detection_target} />
                          <Field k="Géométrie" v={lastTrace.mounting_geometry} />
                          <Field k="Charge élec." v={lastTrace.electrical_load} />
                          <Field k="Tension" v={lastTrace.voltage_value} />
                          <Field k="Courant" v={lastTrace.current_value} />
                          <Field k="Puissance" v={lastTrace.power_value} />
                          <Field k="Volume" v={lastTrace.volume_signal} />
                          <Field k="Confiance" v={lastTrace.confidence} />
                          <Field k="Routage" v={lastTrace.routing_reason} />
                        </dl>
                        <TagList label="Guardrails" items={lastTrace.guardrails_triggered} />
                        <TagList label="Questions manquantes" items={lastTrace.missing_questions} />
                        <JsonBlock label="product_candidates" value={lastTrace.product_candidates} />
                        <JsonBlock
                          label="datasheet_values_used"
                          value={lastTrace.datasheet_values_used}
                        />
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="revue" className="m-0 h-full">
                <ScrollArea className="h-full">
                  <div className="space-y-3 p-4">
                    <div className="rounded-md border border-border bg-card p-3">
                      <ReviewPackButton
                        rows={batch}
                        tester={user.email ?? "—"}
                        runAt={batchRunAt}
                      />
                    </div>

                    {activeSession ? (
                      <ReviewForm
                        sessionId={activeSession.id}
                        reviewerId={user.id}
                        onCreated={(r) => setReviews((prev) => [r, ...prev])}
                        onError={setError}
                      />
                    ) : null}
                    {reviews.length === 0 ? (
                      <Empty>Aucune revue enregistrée.</Empty>
                    ) : (
                      reviews.map((r) => (
                        <div key={r.id} className="rounded-md border border-border bg-card p-3">
                          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {r.verdict}
                            </Badge>
                            <span>{r.reviewer_role}</span>
                            <span>{new Date(r.created_at).toLocaleString("fr-FR")}</span>
                          </div>
                          {r.notes ? <p className="mt-2 text-sm">{r.notes}</p> : null}
                          {r.corrected_output_type ? (
                            <p className="mt-2 font-mono text-xs text-accent">
                              → {r.corrected_output_type}
                            </p>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="lead" className="m-0 h-full">
                <ScrollArea className="h-full">
                  <div className="p-4">
                    {!activeSession ? (
                      <Empty>Aucune session sélectionnée.</Empty>
                    ) : (
                      <div className="rounded-md border border-border bg-card p-4">
                        <dl className="grid grid-cols-2 gap-2 font-mono text-xs">
                          <Field k="Nom" v={activeSession.prospect_name} />
                          <Field k="Société" v={activeSession.prospect_company} />
                          <Field k="Email" v={activeSession.prospect_email} />
                          <Field k="Téléphone" v={activeSession.prospect_phone} />
                          <Field k="Ville prospect" v={activeSession.prospect_city} />
                          <Field k="Ville Standex" v={activeSession.standex_city} />
                          <Field k="Bande volume" v={activeSession.volume_band} />
                          <Field k="Potentiel lead" v={activeSession.lead_potential} />
                          <Field k="Statut" v={activeSession.status} />
                          <Field k="Canal" v={activeSession.channel} />
                          <Field k="Locale" v={activeSession.locale} />
                          <Field k="Rappel" v={activeSession.callback_commitment} />
                        </dl>
                        {activeSession.consent_notes ? (
                          <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                            {activeSession.consent_notes}
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="dossier" className="m-0 h-full">
                <ScrollArea className="h-full">
                  <div className="p-4">
                    {!activeSession ? (
                      <Empty>Aucune session sélectionnée.</Empty>
                    ) : (
                      <DossierPanel
                        session={activeSession}
                        messages={messages}
                        output={lastOutput}
                        trace={lastTrace}
                        reviews={reviews}
                        tester={user.email ?? user.id}
                      />
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>



              <TabsContent value="mode" className="m-0 h-full">
                <ScrollArea className="h-full">
                  <BaselineModePanel
                    mode={assistantMode}
                    onModeChange={setAssistantMode}
                    baselineResponse={lastOutput?.customer_summary ?? null}
                    baselineTrace={
                      lastTrace
                        ? JSON.stringify(
                            {
                              understood_application: lastTrace.understood_application,
                              detection_target: lastTrace.detection_target,
                              electrical_load: lastTrace.electrical_load,
                              guardrails_triggered: lastTrace.guardrails_triggered,
                              confidence: lastTrace.confidence,
                              routing_reason: lastTrace.routing_reason,
                            },
                            null,
                            2,
                          )
                        : null
                    }
                  />
                </ScrollArea>
              </TabsContent>

              <TabsContent value="batch" className="m-0 h-full">
                <ScrollArea className="h-full">
                  <BatchPanel
                    rows={batch}
                    busy={batchBusy}
                    scope={batchScope}
                    total={batchTotal}
                    runAt={batchRunAt}
                    tester={user.email ?? user.id}
                    scenarioCount={scenarios.length}
                    onRun={(s) => void runBatch(s)}
                    onOpen={setActiveId}
                  />
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>
        </section>
      </main>
    </>
  );
}

function DossierPanel({
  session,
  messages,
  output,
  trace,
  reviews,
  tester,
}: {
  session: SensorTestSession;
  messages: SensorTestMessage[];
  output: SensorTestOutput | null;
  trace: SensorTestInternalTrace | null;
  reviews: SensorTestReview[];
  tester: string;
}) {
  const [copied, setCopied] = useState(false);
  const dossier = buildApplicationDossier({ session, messages, output, trace, reviews });
  const markdown = buildDossierMarkdown(dossier, { tester });
  const critical = dossier.missingCritical.filter((f) => f.importance === "critique");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono text-[10px]">
          {dossier.outputType ?? "sortie —"}
        </Badge>
        <Badge variant="outline" className="font-mono text-[10px]">
          confiance produit : {dossier.productConfidence ?? "—"}
        </Badge>
        <Badge variant="outline" className="font-mono text-[10px]">
          confiance routage : {dossier.routingConfidence ?? "—"}
        </Badge>
        <Badge variant="outline" className="font-mono text-[10px]">
          {dossier.fields.filter((f) => f.value).length}/24 champs
        </Badge>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(markdown);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copié" : "Copier (MD)"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadText(
                `dossier-application-${session.id.slice(0, 8)}.md`,
                markdown,
                "text/markdown",
              )
            }
          >
            Télécharger (MD)
          </Button>
        </div>
      </div>

      {(Object.keys(SECTION_LABELS) as DossierSection[]).map((section) => (
        <div key={section} className="rounded-md border border-border bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {SECTION_LABELS[section]}
          </p>
          <div className="mt-3 space-y-2">
            {dossier.fields
              .filter((f) => f.section === section)
              .map((f) => (
                <div
                  key={f.id}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 border-b border-border/50 pb-2 font-mono text-xs last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="break-words text-muted-foreground">{f.labelFr}</p>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
                      {f.importance}
                    </span>
                  </div>
                  <div className="min-w-0">
                    {f.value ? (
                      <p className="break-words">{f.value}</p>
                    ) : (
                      <p className="text-destructive">manquant</p>
                    )}
                    {f.source ? (
                      <span className="text-[10px] uppercase tracking-widest text-accent">
                        source : {f.source}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}

      <div className="rounded-md border border-border bg-card p-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Champs manquants prioritaires
        </p>
        {critical.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Aucun champ critique manquant.</p>
        ) : (
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {critical.map((f) => (
              <li key={f.id} className="break-words">
                · {f.labelFr}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-md border border-border bg-card p-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Questions conseillées (testeur)
        </p>
        {dossier.suggestedQuestions.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Aucune question prioritaire.</p>
        ) : (
          <ol className="mt-2 space-y-1 text-xs">
            {dossier.suggestedQuestions.map((q, i) => (
              <li key={q} className="break-words">
                {i + 1}. {q}
              </li>
            ))}
          </ol>
        )}
      </div>

      <TagList label="Garde-fous déclenchés" items={dossier.guardrails} />
    </div>
  );
}



function ReviewForm({
  sessionId,
  reviewerId,
  onCreated,
  onError,
}: {
  sessionId: string;
  reviewerId: string;
  onCreated: (r: SensorTestReview) => void;
  onError: (m: string) => void;
}) {
  const [verdict, setVerdict] = useState<Verdict>("not_reviewed");
  const [role, setRole] = useState<ReviewerRole>("thomas");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await db.insertReview({
        session_id: sessionId,
        reviewer_id: reviewerId,
        reviewer_role: role,
        verdict,
        notes: notes.trim() || null,
      });
      onCreated(r);
      setNotes("");
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex gap-2">
        <Select value={verdict} onValueChange={(v) => setVerdict(v as Verdict)}>
          <SelectTrigger className="h-8 font-mono text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VERDICTS.map((v) => (
              <SelectItem key={v} value={v} className="font-mono text-xs">
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={role} onValueChange={(v) => setRole(v as ReviewerRole)}>
          <SelectTrigger className="h-8 font-mono text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REVIEWER_ROLES.map((v) => (
              <SelectItem key={v} value={v} className="font-mono text-xs">
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes de revue…"
        className="mt-2 min-h-16 resize-none font-mono text-xs"
      />
      <Button size="sm" className="mt-2 w-full" disabled={busy} onClick={() => void submit()}>
        Enregistrer la revue
      </Button>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">{k}</dt>
      <dd className="truncate">{v ?? "—"}</dd>
    </div>
  );
}

function TagList({ label, items }: { label: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="mt-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        {items.map((i) => (
          <Badge key={i} variant="outline" className="font-mono text-[10px]">
            {i}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="mt-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <pre className="mt-1 whitespace-pre-wrap break-words rounded-sm bg-secondary p-2 font-mono text-[11px]">
        {JSON.stringify(value ?? null, null, 2)}
      </pre>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-card/50 p-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function ScenarioPanel({
  scenarios,
  scenario,
  onSelect,
  onRun,
  running,
}: {
  scenarios: SensorTestScenario[];
  scenario: SensorTestScenario | null;
  onSelect: (id: string) => void;
  onRun: () => void;
  running: boolean;
}) {
  const mustInclude = splitList(scenario?.must_include ?? null);
  const mustNotInclude = splitList(scenario?.must_not_include ?? null);

  return (
    <div className="w-full shrink-0 overflow-hidden border-b border-border bg-card/40 px-4 py-3">
      <div className="flex w-full min-w-0 items-center gap-2">
        <Select value={scenario?.id ?? ""} onValueChange={onSelect}>
          <SelectTrigger className="h-8 min-w-0 flex-1 font-mono text-xs">
            <SelectValue placeholder={`Scénario de test (${scenarios.length})`} />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {scenarios.map((sc) => (
              <SelectItem key={sc.id} value={sc.id} className="font-mono text-xs">
                {sc.priority} · {sc.scenario_id} — {sc.user_prompt_fr.slice(0, 60)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" disabled={!scenario || running} onClick={onRun} className="h-8 shrink-0">
          {running ? "Exécution…" : "Lancer la réponse"}
        </Button>
      </div>

      {scenario ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className="font-mono text-[10px]">{scenario.priority}</Badge>
            <Badge variant="outline" className="font-mono text-[10px]">
              attendu · {scenario.expected_output_type}
            </Badge>
            <Badge variant="outline" className="font-mono text-[10px] text-accent">
              enregistré · {safeOutputType(scenario.expected_output_type)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{scenario.expected_behavior}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <ContractList
              label="Éléments obligatoires"
              items={mustInclude}
              tone="text-success"
            />
            <ContractList
              label="Éléments interdits"
              items={mustNotInclude}
              tone="text-destructive"
            />
          </div>
          <TagList label="Garde-fous attendus" items={scenario.trace_flags ?? []} />
        </div>
      ) : (
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
          Sélectionne un scénario pour préremplir la conversation.
        </p>
      )}
    </div>
  );
}

function ContractList({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: string;
}) {
  return (
    <div className="rounded-sm border border-border bg-card p-2">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      {items.length === 0 ? (
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">—</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {items.map((i) => (
            <li key={i} className={`font-mono text-[11px] ${tone}`}>
              · {i}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


const SUPABASE_URL = import.meta.env["VITE_SUPABASE_URL"] ?? "";

function yn(v: boolean | undefined) {
  return v === undefined ? "—" : v ? "oui" : "non";
}

/** Pack de revue qualitative construit à partir du dernier lot exécuté. */
function buildPackFromBatch(rows: BatchRow[], tester: string, runAt: string | null) {
  const testedAt = runAt ?? new Date().toISOString();
  const reviewRows = rows.filter((r) => REVIEW_PACK_SCENARIOS.includes(r.code));
  const ok = rows.filter((r) => r.evaluation?.verdict === "OK").length;
  const pack = reviewRows.length
    ? buildReviewPack(reviewRows, {
        testedAt,
        tester,
        contractVersion: "Contrat de réponse V0.2 (moteur déterministe, sans modèle génératif)",
        regressionScore: `${ok}/${rows.length} OK`,
      })
    : "";
  return { testedAt, reviewRows, pack };
}

function ReviewPackButton({
  rows,
  tester,
  runAt,
}: {
  rows: BatchRow[];
  tester: string;
  runAt: string | null;
}) {
  const { testedAt, reviewRows, pack } = buildPackFromBatch(rows, tester, runAt);
  return (
    <div className="space-y-1">
      <Button
        size="sm"
        disabled={reviewRows.length === 0}
        onClick={() =>
          downloadText(
            `pack-revue-qualitative-${testedAt.slice(0, 10)}.md`,
            pack,
            "text/markdown",
          )
        }
      >
        Exporter pack de revue qualitative
      </Button>
      <p className="font-mono text-[11px] text-muted-foreground">
        {reviewRows.length === 0
          ? "Lancez un lot dans l'onglet Synthèse pour activer l'export."
          : `${reviewRows.length}/${REVIEW_PACK_SCENARIOS.length} scénarios de relecture disponibles.`}
      </p>
    </div>
  );
}


function BatchPanel({
  rows,
  busy,
  scope,
  total,
  runAt,
  tester,
  scenarioCount,
  onRun,
  onOpen,
}: {
  rows: BatchRow[];
  busy: boolean;
  scope: "p0" | "all";
  total: number;
  runAt: string | null;
  tester: string;
  scenarioCount: number;
  onRun: (scope: "p0" | "all") => void;
  onOpen: (id: string) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const ok = rows.filter((r) => r.evaluation?.verdict === "OK").length;
  const meta = {
    testedAt: runAt ?? new Date().toISOString(),
    tester,
    supabaseUrl: SUPABASE_URL,
  };
  const markdown = rows.length ? buildMarkdown(rows, meta) : "";
  const { reviewRows, pack: reviewPack } = buildPackFromBatch(rows, tester, runAt);


  const copy = async (text: string, tag: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(tag);
    setTimeout(() => setCopied(null), 2000);
  };

  const readiness =
    rows.length === 0
      ? null
      : ok === rows.length
        ? "Prêt pour revue qualitative Thomas / Claude / BE."
        : ok >= Math.ceil(rows.length * (18 / 22))
          ? "Corriger les écarts listés puis relancer le lot."
          : "Revoir le moteur déterministe avant de brancher un vrai assistant.";

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Synthèse de test
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Session, message prospect, réponse assistant, sortie, trace interne et revue sont
            persistés pour chaque scénario.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onRun("p0")}>
            {busy && scope === "p0" ? `Exécution… (${rows.length}/${total})` : "Lancer les 8 scénarios"}
          </Button>
          <Button size="sm" disabled={busy || scenarioCount === 0} onClick={() => onRun("all")}>
            {busy && scope === "all"
              ? `Exécution… (${rows.length}/${total})`
              : `Lancer les ${scenarioCount || 22} scénarios`}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={reviewRows.length === 0}
          onClick={() =>
            downloadText(
              `pack-revue-qualitative-${meta.testedAt.slice(0, 10)}.md`,
              reviewPack,
              "text/markdown",
            )
          }
        >
          Exporter pack de revue qualitative
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={reviewRows.length === 0}
          onClick={() => void copy(reviewPack, "pack")}
        >
          {copied === "pack" ? "Copié" : "Copier le pack de revue"}
        </Button>
      </div>
      <p className="font-mono text-[11px] text-muted-foreground">
        Pack de revue : {reviewRows.length}/{REVIEW_PACK_SCENARIOS.length} scénarios de relecture
        disponibles dans ce lot.
      </p>

      {rows.length === 0 ? (
        <Empty>Aucun lot exécuté pour l'instant.</Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-mono text-xs text-accent">
              {ok}/{rows.length} OK · {rows.length - ok} à corriger
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">{readiness}</p>
          </div>

          <div className="flex flex-wrap gap-2">

            <Button size="sm" variant="outline" onClick={() => void copy(markdown, "md")}>
              {copied === "md" ? "Copié" : "Copier la synthèse (Markdown)"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                downloadText(
                  `regression-capteur-${meta.testedAt.slice(0, 10)}.md`,
                  markdown,
                  "text/markdown",
                )
              }
            >
              Exporter la synthèse (MD)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                downloadText(
                  `regression-capteur-${meta.testedAt.slice(0, 10)}.csv`,
                  buildCsv(rows, meta),
                  "text/csv",
                )
              }
            >
              Exporter la synthèse (CSV)
            </Button>
          </div>


          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full border-collapse font-mono text-[11px]">
              <thead>
                <tr className="border-b border-border bg-secondary/50 text-left">
                  <th className="px-2 py-1.5">Scénario</th>
                  <th className="px-2 py-1.5">Prio</th>
                  <th className="px-2 py-1.5">Sortie attendue</th>
                  <th className="px-2 py-1.5">Sortie obtenue</th>
                  <th className="px-2 py-1.5">GF attendus</th>
                  <th className="px-2 py-1.5">GF obtenus</th>
                  <th className="px-2 py-1.5">Oblig.</th>
                  <th className="px-2 py-1.5">Interdits</th>
                  <th className="px-2 py-1.5">Ville</th>
                  <th className="px-2 py-1.5">2 j.o.</th>
                  <th className="px-2 py-1.5">Fuite</th>
                  <th className="px-2 py-1.5">Questions</th>
                  <th className="px-2 py-1.5">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code} className="border-b border-border/60 align-top">
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {r.sessionId ? (
                        <button
                          className="text-accent underline-offset-2 hover:underline"
                          onClick={() => onOpen(r.sessionId!)}
                        >
                          {r.code}
                        </button>
                      ) : (
                        r.code
                      )}
                    </td>
                    <td className="px-2 py-1.5">{r.priority ?? "—"}</td>
                    <td className="px-2 py-1.5">{r.evaluation?.expectedOutput ?? "—"}</td>
                    <td className="px-2 py-1.5">{r.outputType ?? "—"}</td>
                    <td className="max-w-[170px] px-2 py-1.5 break-words">
                      {r.evaluation?.expectedFlags.join(", ") || "—"}
                    </td>
                    <td className="max-w-[170px] px-2 py-1.5 break-words">
                      {r.guardrails?.length ? r.guardrails.join(", ") : "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      {r.evaluation ? yn(r.evaluation.missingMust.length === 0) : "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      {r.evaluation ? yn(r.evaluation.presentForbidden.length === 0) : "—"}
                    </td>
                    <td className="px-2 py-1.5">{r.evaluation ? yn(r.evaluation.cityAsked) : "—"}</td>
                    <td className="px-2 py-1.5">
                      {r.evaluation ? yn(r.evaluation.twoBusinessDays) : "—"}
                    </td>
                    <td className="max-w-[150px] px-2 py-1.5 break-words">
                      {r.evaluation
                        ? r.evaluation.leaks.length
                          ? `oui : ${r.evaluation.leaks.join(" | ")}`
                          : "non"
                        : "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      {r.evaluation ? yn(r.evaluation.realMissingQuestions) : "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      {r.missing ? (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          absent
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className={`font-mono text-[10px] ${
                            r.evaluation?.verdict === "OK" ? "text-success" : "text-destructive"
                          }`}
                        >
                          {r.evaluation?.verdict}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows
            .filter((r) => r.missing || (r.evaluation && r.evaluation.verdict !== "OK"))
            .map((r) => (
              <div key={`f-${r.code}`} className="rounded-md border border-border bg-card p-3">
                <p className="font-mono text-[11px] text-destructive">{r.code}</p>
                {r.missing ? (
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    · Scénario introuvable dans sensor_test_scenarios
                  </p>
                ) : (
                  <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-muted-foreground">
                    <li>· Éléments obligatoires absents : {r.evaluation!.missingMust.join(" | ") || "—"}</li>
                    <li>
                      · Éléments interdits présents : {r.evaluation!.presentForbidden.join(" | ") || "—"}
                    </li>
                    <li>· Garde-fous manquants : {r.evaluation!.missingFlags.join(", ") || "—"}</li>
                    <li>
                      · Sortie :{" "}
                      {r.evaluation!.outputOk
                        ? "conforme"
                        : `incorrecte (${r.outputType} vs ${r.evaluation!.expectedOutput})`}
                    </li>
                    <li>
                      · Trace interne : {r.evaluation!.traceSufficient ? "suffisante" : "insuffisante"}
                    </li>
                    <li>
                      · Règles en échec : {r.evaluation!.failures.join(" | ") || "—"}
                    </li>
                    <li>· Suggestion : {r.evaluation!.suggestion ?? "—"}</li>
                  </ul>
                )}
              </div>
            ))}

          <div className="rounded-md border border-border bg-card p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Export Markdown copiable
            </p>
            <Textarea
              readOnly
              value={markdown}
              className="mt-2 h-48 font-mono text-[11px]"
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
        </>
      )}
    </div>
  );
}
