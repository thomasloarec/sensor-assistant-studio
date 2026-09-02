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
  scenario?: SensorTestScenario;
  evaluation?: ScenarioEvaluation;
  outputType?: string;
  guardrails?: string[];
  customerText?: string;
  sessionId?: string;
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
            prospect_company: `Scénario ${scenario.scenario_id}`,
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

  // Lot prioritaire : une session dédiée par scénario, tout est persisté.
  const runBatch = () =>
    guard(async () => {
      if (batchBusy) return;
      setBatchBusy(true);
      setBatch([]);
      try {
        for (const code of PRIORITY_SCENARIOS) {
          const sc = scenarios.find((s) => s.scenario_id === code);
          if (!sc) {
            setBatch((prev) => [...prev, { code, missing: true }]);
            continue;
          }
          const composed = composeResponse(sc);
          const evaluation = evaluateRun(sc, composed);
          const session = await db.createSession(user.id, {
            prospect_company: `Lot prioritaire · ${sc.scenario_id}`,
            channel: "lovable_test",
            status: "in_review",
          });
          const res = await runScenario({
            sessionId: session.id,
            reviewerId: user.id,
            scenario: sc,
            startTurnIndex: 0,
            verdict: evaluation.verdict === "OK" ? "good" : "needs_revision",
            notes: `Lot prioritaire · ${evaluation.verdict}${
              evaluation.failures.length ? ` · ${evaluation.failures.join(" ; ")}` : ""
            }`,
          });
          setSessions((prev) => [session, ...prev]);
          setBatch((prev) => [
            ...prev,
            {
              code,
              scenario: sc,
              evaluation,
              outputType: res.output.output_type,
              guardrails: composed.guardrails,
              customerText: composed.customerText,
              sessionId: session.id,
            },
          ]);
        }
      } finally {
        setBatchBusy(false);
      }
    });

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
                    <div className="truncate">{s.prospect_company ?? s.id.slice(0, 8)}</div>
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
            <TabsList className="h-auto w-full justify-start rounded-none border-b border-border bg-transparent p-0">
              {(
                [
                  { v: "client", label: "Sortie client" },
                  { v: "trace", label: "Trace interne" },
                  { v: "revue", label: "Revue" },
                  { v: "lead", label: "Données lead" },
                  { v: "batch", label: "Synthèse P0" },
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

              <TabsContent value="batch" className="m-0 h-full">
                <ScrollArea className="h-full">
                  <BatchPanel
                    rows={batch}
                    busy={batchBusy}
                    onRun={() => void runBatch()}
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
