import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

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
  component: TestBench,
});

type Message = { id: string; role: "user" | "assistant"; content: string; at: string };

function TestBench() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((m) => [
      ...m,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        at: new Date().toISOString().slice(11, 19),
      },
    ]);
    setDraft("");
  };

  return (
    <div className="flex h-screen flex-col bg-background font-sans text-foreground">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="rounded-sm bg-primary px-2 py-1 font-mono text-xs font-semibold tracking-widest text-primary-foreground">
            STANDEX
          </span>
          <h1 className="text-sm font-semibold tracking-tight">
            Banc de test — assistant capteur
          </h1>
          <Badge variant="outline" className="font-mono text-[10px] uppercase">
            interne
          </Badge>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-warning" />
            backend Supabase : non connecté
          </span>
          <Separator orientation="vertical" className="h-4" />
          <span>schéma V0.2 en attente</span>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Conversation */}
        <section className="flex min-h-0 flex-col border-border lg:border-r">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Conversation
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 font-mono text-xs"
              onClick={() => setMessages([])}
            >
              Réinitialiser
            </Button>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-3 p-4">
              {messages.length === 0 ? (
                <p className="max-w-sm text-sm text-muted-foreground">
                  Aucun tour de conversation. Saisis un message pour démarrer un scénario de
                  test.
                </p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={
                      m.role === "user"
                        ? "max-w-[85%] self-end rounded-md rounded-br-sm bg-secondary px-3 py-2"
                        : "max-w-[85%] self-start rounded-md rounded-bl-sm border border-border bg-card px-3 py-2"
                    }
                  >
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {m.role === "user" ? "opérateur" : "assistant"} · {m.at}
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
                  send();
                }
              }}
              placeholder="Message de test… (Entrée pour envoyer)"
              className="min-h-20 resize-none bg-card font-mono text-sm"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="font-mono text-[10px] text-muted-foreground">
                {messages.length} tour(s)
              </span>
              <Button size="sm" onClick={send} disabled={!draft.trim()}>
                Envoyer
              </Button>
            </div>
          </div>
        </section>

        {/* Inspecteur */}
        <section className="flex min-h-0 flex-col">
          <Tabs defaultValue="client" className="flex min-h-0 flex-1 flex-col gap-0">
            <TabsList className="h-auto w-full justify-start rounded-none border-b border-border bg-transparent p-0">
              {(
                [
                  { v: "client", label: "Sortie client" },
                  { v: "trace", label: "Trace interne" },
                  { v: "revue", label: "Revue" },
                  { v: "lead", label: "Données lead" },
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
                <Panel
                  title="Sortie client"
                  hint="Réponse visible par le client, telle que définie par le contrat de réponse."
                />
              </TabsContent>
              <TabsContent value="trace" className="m-0 h-full">
                <Panel
                  title="Trace interne"
                  hint="Étapes de raisonnement, requêtes catalogue, règles déclenchées et latences."
                />
              </TabsContent>
              <TabsContent value="revue" className="m-0 h-full">
                <Panel
                  title="Revue"
                  hint="Verdict de l'évaluateur : conformité au contrat, écarts, commentaires."
                />
              </TabsContent>
              <TabsContent value="lead" className="m-0 h-full">
                <Panel
                  title="Données lead"
                  hint="Champs qualifiés extraits de la conversation (application, contraintes, contact)."
                />
              </TabsContent>
            </div>
          </Tabs>
        </section>
      </main>
    </div>
  );
}

function Panel({ title, hint }: { title: string; hint: string }) {
  return (
    <ScrollArea className="h-full">
      <div className="p-4">
        <div className="rounded-md border border-dashed border-border bg-card/50 p-6">
          <h3 className="font-mono text-xs uppercase tracking-widest text-accent">{title}</h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">{hint}</p>
          <p className="mt-4 font-mono text-xs text-muted-foreground">
            En attente : schéma Supabase V0.2, scénarios de test, contrat de réponse.
          </p>
        </div>
      </div>
    </ScrollArea>
  );
}
