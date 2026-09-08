/** Console interne Standex : boîte de réception, revue R&D, offre, échantillons, preuve NDA.
 *
 * Écran privé : chaque action est refusée côté serveur si le rôle et l'affectation
 * ne sont pas ceux enregistrés en base. Rien n'est décidé côté navigateur.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { checkLeadBackend, type LeadBackendStatus } from "@/lib/leadmagnet/backend";
import {
  addInternalNote,
  assignDossier,
  createOffer,
  fetchStaffInbox,
  fetchStaffView,
  publishReview,
  recordNdaProof,
  revalidateSample,
  updateSample,
  uploadDesignFile,
  signedFileUrl,
  type DossierView,
  type StaffInbox,
} from "@/lib/leadmagnet/supabase-adapter";
import { APPROVED_NDA_TEMPLATE } from "@/lib/leadmagnet/nda";
import { parseServerSnapshot } from "@/lib/leadmagnet/dossier-io";
import { technicalSummary } from "@/lib/leadmagnet/submission";
import { AuthPanel } from "@/components/leadmagnet/auth-panel";
import { supabase } from "@/lib/standex/supabase";

export const Route = createFileRoute("/standex")({
  component: StandexConsole,
  head: () => ({
    meta: [
      { title: "Console Standex — revue et suivi des dossiers" },
      {
        name: "description",
        content:
          "Espace interne Standex : revue R&D des dossiers de conception, offres, échantillons et preuves de confidentialité.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Console Standex" },
      {
        property: "og:description",
        content: "Espace interne de revue des dossiers de conception capteur.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const emptyReview = {
  scope: "Revue complète du dossier",
  conditions: "",
  verdict: "validated" as "validated" | "variant_proposed" | "more_info",
  clientMessage: "",
  internalNote: "",
  exactPartNumber: "",
  designation: "standard" as "standard" | "custom",
  variantCable: "",
  variantReserveMm: "",
  variantToleranceMm: "",
  variantLengthChoice: "" as "" | "standard_to_confirm" | "custom_to_confirm",
  variantConnector: "",
  variantConnectorMaker: "",
  variantConnectorMpn: "",
  variantConnectorPositions: "",
  variantPcb: "",
  variantDescription: "",
};

const emptyOffer = {
  currency: "EUR",
  tiers: "100:4.20\n1000:3.10",
  moq: "100",
  nre: "",
  incoterm: "EXW",
  leadTimeWeeks: "8",
  validUntil: "",
};

function parseTiers(raw: string): { quantity: number; unit_price: number }[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [q, p] = l.split(":");
      return { quantity: Number(q), unit_price: Number(p) };
    });
}

function StandexConsole() {
  const [backend, setBackend] = useState<LeadBackendStatus | null>(null);
  const [inbox, setInbox] = useState<StaffInbox | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<DossierView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [review, setReview] = useState(emptyReview);
  const [offer, setOffer] = useState(emptyOffer);
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState("");
  const [nda, setNda] = useState({
    documentSha256: "",
    signedObjectPath: "",
    proofReference: "",
    partyA: "Standex Electronics",
    partyB: "",
    signedAt: "",
    source: "Vérification manuelle du document signé",
    evidenceKind: "stored_object" as "stored_object" | "external_archive",
    signedFileName: "",
  });
  /** Lecture 3D du modèle réellement envoyé : uniquement en mémoire de l'onglet. */
  const [viewer, setViewer] = useState<{
    config: WorkshopConfig;
    revision: number;
    sha256: string;
  } | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);

  /** Ouvre le GLB réellement transféré, jamais un montage par défaut.
   * Le binaire est retéléchargé, son empreinte est comparée à celle annoncée à
   * la soumission, puis il est chargé en mémoire avec la configuration exacte
   * de la version envoyée. Si quoi que ce soit manque, on refuse et on le dit.
   */
  const openTransferredModel = useCallback(
    async (file: { path?: string; file_name?: string; sha256?: string }) => {
      setViewerError(null);
      setViewer(null);
      const revisions = view?.revisions ?? [];
      const last = [...revisions].sort((a, b) => b.revision - a.revision)[0];
      if (!last) {
        setViewerError("Aucune version envoyée : rien à ouvrir.");
        return;
      }
      const parsed = parseServerSnapshot(last.snapshot as Record<string, unknown>);
      if (!parsed.ok) {
        setViewerError(
          `La configuration envoyée n'est pas lisible (${parsed.reason}) : le modèle n'est pas ouvert.`,
        );
        return;
      }
      const config = parseWorkshopConfig(parsed.dossier.workshop);
      if (!config || !config.machine) {
        setViewerError(
          "Cette version ne contient pas de montage 3D exploitable : aucun montage par défaut n'est affiché à la place.",
        );
        return;
      }
      const path = String(file.path ?? "");
      if (!path) {
        setViewerError("Ce fichier n'a pas de chemin de stockage : il ne peut pas être relu.");
        return;
      }
      try {
        const bytes = await downloadDesignFile(path);
        const digest = await sha256Hex(bytes);
        const expected =
          file.sha256 ??
          parsed.dossier.attachments.find(
            (a) => a.storagePath === path || a.fileName === file.file_name,
          )?.sha256 ??
          null;
        if (!expected) {
          setViewerError(
            "Aucune empreinte n'a été enregistrée pour ce fichier : il n'est pas ouvert, faute de pouvoir prouver qu'il s'agit du fichier envoyé.",
          );
          return;
        }
        if (expected.toLowerCase() !== digest.toLowerCase()) {
          setViewerError(
            "Le contenu téléchargé ne correspond pas à l'empreinte enregistrée à l'envoi : le fichier n'est pas ouvert.",
          );
          return;
        }
        const name = String(file.file_name ?? config.machine.fileName ?? "modele.glb");
        const assetKey = await storeMachineFileInMemory(
          new File([bytes], name, { type: "model/gltf-binary" }),
        );
        setViewer({
          config: { ...config, machine: { ...config.machine, assetKey, fileName: name } },
          revision: last.revision,
          sha256: digest,
        });
      } catch (error) {
        setViewerError(
          error instanceof Error ? error.message : "Le modèle 3D n'a pas pu être ouvert.",
        );
      }
    },
    [view],
  );


  useEffect(() => {
    checkLeadBackend()
      .then(setBackend)
      .catch(() => setBackend(null));
  }, []);

  // Le statut de liaison suit la session : après connexion, l'accès s'ouvre sans rechargement.
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange(() => {
      checkLeadBackend()
        .then(setBackend)
        .catch(() => setBackend(null));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const loadInbox = useCallback(async () => {
    try {
      setInbox(await fetchStaffInbox());
    } catch (error) {
      setInbox(null);
      setMessage(error instanceof Error ? error.message : null);
    }
  }, []);

  const loadView = useCallback(async (id: string) => {
    try {
      setView(await fetchStaffView(id));
      setSelected(id);
    } catch (error) {
      setView(null);
      setMessage(error instanceof Error ? error.message : null);
    }
  }, []);

  useEffect(() => {
    if (backend?.ready) void loadInbox();
  }, [backend?.ready, loadInbox]);

  const run = async (fn: () => Promise<string>) => {
    try {
      setMessage(await fn());
      if (selected) await loadView(selected);
      await loadInbox();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action refusée.");
    }
  };

  if (!backend?.ready)
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-6">
        <Link to="/design" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Espace de conception
        </Link>
        <h1 className="text-xl font-semibold">Console Standex</h1>
        <p className="text-sm">{backend?.message ?? "Connexion en cours…"}</p>
        <AuthPanel
          backend={backend}
          onChanged={() => {
            checkLeadBackend()
              .then(setBackend)
              .catch(() => setBackend(null));
          }}
        />
      </div>
    );

  if (!inbox)
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-6">
        <h1 className="text-xl font-semibold">Console Standex</h1>
        <p className="text-sm">
          {message ??
            "Cet espace est réservé aux membres de l'équipe Standex habilités. Votre compte n'y donne pas accès."}
        </p>
      </div>
    );

  const revisions = view?.revisions ?? [];
  const lastRevision = revisions[revisions.length - 1] ?? null;
  const currentReview =
    (view?.reviews ?? []).filter((r) => r.published && !r.superseded).slice(-1)[0] ?? null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link
            to="/design"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Espace de conception
          </Link>
          <h1 className="text-lg font-semibold">Console Standex</h1>
          <Badge variant="secondary">
            {inbox.role === "rnd" ? "R&D" : inbox.role === "sales" ? "Commerce" : "Administration"}
          </Badge>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 p-4 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <section>
            <h2 className="mb-2 font-medium">Dossiers qui me sont confiés</h2>
            {inbox.assigned.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun dossier ne vous est confié.</p>
            ) : (
              <ul className="space-y-1">
                {inbox.assigned.map((d) => (
                  <li key={d.id}>
                    <Button
                      variant={d.id === selected ? "default" : "outline"}
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => void loadView(d.id)}
                    >
                      <span className="truncate">{d.title}</span>
                    </Button>
                    <p className="px-1 text-xs text-muted-foreground">
                      version {d.current_revision}
                      {d.awaiting_review ? " — en attente de retour" : " — retour publié"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {inbox.role === "admin" ? (
            <section className="space-y-2">
              <h2 className="font-medium">Tri et affectation</h2>
              <p className="text-xs text-muted-foreground">
                Cette liste ne contient que des informations générales : aucun contenu technique
                n'est visible sans affectation.
              </p>
              {inbox.triage.map((d) => (
                <div key={d.id} className="rounded border p-2 text-sm">
                  <p className="font-medium">{d.title}</p>
                  <p className="text-xs text-muted-foreground">
                    version {d.current_revision} — {d.assignees.length} personne(s) affectée(s)
                  </p>
                  <div className="mt-1 flex gap-1">
                    <Select value={assignee} onValueChange={setAssignee}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Choisir un collègue" />
                      </SelectTrigger>
                      <SelectContent>
                        {inbox.staff_directory.map((m) => (
                          <SelectItem key={m.user_id} value={m.user_id}>
                            {m.display_name ?? m.email ?? "Membre Standex"} — {m.role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!assignee}
                      onClick={() =>
                        run(async () => {
                          await assignDossier(d.id, assignee);
                          return "Dossier confié à ce collègue.";
                        })
                      }
                    >
                      Confier
                    </Button>
                  </div>
                </div>
              ))}
            </section>
          ) : null}
        </aside>

        <section className="space-y-4">
          {message ? <p className="rounded border p-2 text-sm">{message}</p> : null}
          {!view ? (
            <p className="text-sm text-muted-foreground">
              Choisissez un dossier pour lire la conception envoyée et publier un retour.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{view.dossier.title}</h2>
                <Badge variant="outline">version {view.dossier.current_revision}</Badge>
                <Badge variant="secondary">
                  {view.dossier.nda_status === "in_force"
                    ? "Confidentialité en vigueur"
                    : view.dossier.nda_required
                      ? "Confidentialité en attente"
                      : "Sans accord de confidentialité"}
                </Badge>
              </div>

              <Accordion type="multiple" defaultValue={["design", "review"]}>
                <AccordionItem value="design">
                  <AccordionTrigger>Conception réellement envoyée</AccordionTrigger>
                  <AccordionContent className="space-y-2">
                    {lastRevision ? (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Envoyée le {new Date(lastRevision.submitted_at).toLocaleString("fr-FR")} —
                          empreinte {lastRevision.content_hash.slice(0, 16)}… — fichiers joints :{" "}
                          {lastRevision.transferred_files.length}
                        </p>
                        {(() => {
                          const parsed = parseServerSnapshot(
                            lastRevision.snapshot as Record<string, unknown>,
                          );
                          return parsed.ok ? (
                            <pre className="max-h-96 overflow-auto rounded bg-muted p-3 text-xs whitespace-pre-wrap">
                              {technicalSummary(parsed.dossier)}
                            </pre>
                          ) : (
                            <p className="text-xs text-destructive">
                              Cette version n'est pas lisible sous forme de résumé technique :{" "}
                              {parsed.reason} Contenu brut ci-dessous.
                            </p>
                          );
                        })()}
                        <details>
                          <summary className="cursor-pointer text-xs text-muted-foreground">
                            Contenu complet envoyé (brut)
                          </summary>
                          <pre className="max-h-96 overflow-auto rounded bg-muted p-3 text-xs">
                            {JSON.stringify(lastRevision.snapshot, null, 2)}
                          </pre>
                        </details>
                        <ul className="list-disc pl-5 text-xs">
                          {lastRevision.transferred_files.map((f, i) => (
                            <li key={i} className="flex flex-wrap items-center gap-2">
                              <span>{f.file_name ?? f.path}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  run(async () => {
                                    const url = await signedFileUrl(String(f.path));
                                    if (!url) return "Fichier indisponible pour ce compte.";
                                    window.open(url, "_blank", "noopener");
                                    return "Lien de téléchargement ouvert (valable quelques minutes).";
                                  })
                                }
                              >
                                Télécharger
                              </Button>
                              {/^.+\.glb$/i.test(String(f.file_name ?? f.path ?? "")) ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void openTransferredModel(f)}
                                >
                                  Ouvrir en 3D
                                </Button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                        {viewerError ? (
                          <p className="text-xs text-destructive">{viewerError}</p>
                        ) : null}
                        {viewer ? (
                          <div className="mt-2">
                            <p className="mb-2 text-xs text-muted-foreground">
                              Modèle ouvert en mémoire de cet onglet uniquement, avec la
                              configuration exacte de la version {viewer.revision} et son câble.
                              Empreinte contrôlée : {viewer.sha256.slice(0, 16)}…. Une modification
                              faite ici ne vaut jamais retour publié.
                            </p>
                            <Suspense fallback={<p className="text-sm">Chargement de l'atelier…</p>}>
                              <MagneticWorkshop
                                initialConfig={viewer.config}
                                storageLabel="cette lecture, en mémoire de l'onglet"
                                storageMode="memory"
                                onClose={() => setViewer(null)}
                                onSave={async () => {
                                  setMessage(
                                    "Cette modification reste locale à votre écran : publiez un retour R&D pour qu'elle compte.",
                                  );
                                }}
                              />
                            </Suspense>
                          </div>
                        ) : null}

                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Aucune version envoyée.</p>
                    )}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="review">
                  <AccordionTrigger>Retour R&D</AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Portée de la revue</Label>
                        <Input
                          value={review.scope}
                          onChange={(e) => setReview({ ...review, scope: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Conclusion</Label>
                        <Select
                          value={review.verdict}
                          onValueChange={(v) =>
                            setReview({ ...review, verdict: v as typeof review.verdict })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="validated">Validé</SelectItem>
                            <SelectItem value="variant_proposed">Variante proposée</SelectItem>
                            <SelectItem value="more_info">Informations manquantes</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Référence exacte (obligatoire si validé)</Label>
                        <Input
                          value={review.exactPartNumber}
                          onChange={(e) =>
                            setReview({ ...review, exactPartNumber: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Type</Label>
                        <Select
                          value={review.designation}
                          onValueChange={(v) =>
                            setReview({ ...review, designation: v as "standard" | "custom" })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="standard">Standard</SelectItem>
                            <SelectItem value="custom">Spécifique</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Conditions</Label>
                      <Textarea
                        rows={2}
                        value={review.conditions}
                        onChange={(e) => setReview({ ...review, conditions: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div>
                        <Label className="text-xs">Variante — câble (note)</Label>
                        <Input
                          value={review.variantCable}
                          onChange={(e) => setReview({ ...review, variantCable: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Réserve de service proposée (mm)</Label>
                        <Input
                          inputMode="decimal"
                          value={review.variantReserveMm}
                          onChange={(e) => setReview({ ...review, variantReserveMm: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Tolérance proposée (± mm)</Label>
                        <Input
                          inputMode="decimal"
                          value={review.variantToleranceMm}
                          onChange={(e) =>
                            setReview({ ...review, variantToleranceMm: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Connecteur — fabricant</Label>
                        <Input
                          value={review.variantConnectorMaker}
                          onChange={(e) =>
                            setReview({ ...review, variantConnectorMaker: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Connecteur — référence exacte</Label>
                        <Input
                          value={review.variantConnectorMpn}
                          onChange={(e) =>
                            setReview({ ...review, variantConnectorMpn: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Connecteur — voies</Label>
                        <Input
                          inputMode="numeric"
                          value={review.variantConnectorPositions}
                          onChange={(e) =>
                            setReview({ ...review, variantConnectorPositions: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Variante — carte (note)</Label>
                        <Input
                          value={review.variantPcb}
                          onChange={(e) => setReview({ ...review, variantPcb: e.target.value })}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Les valeurs chiffrées et la référence exacte sont réellement reprises dans le
                      dossier du client ; les notes restent descriptives. Un connecteur proposé
                      reste « à vérifier » : ce n'est pas une qualification Standex.
                    </p>
                    <div>
                      <Label className="text-xs">Variante — description</Label>
                      <Textarea
                        rows={2}
                        value={review.variantDescription}
                        onChange={(e) =>
                          setReview({ ...review, variantDescription: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Message publié au client</Label>
                      <Textarea
                        rows={3}
                        value={review.clientMessage}
                        onChange={(e) => setReview({ ...review, clientMessage: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Note interne (jamais visible du client)</Label>
                      <Textarea
                        rows={2}
                        value={review.internalNote}
                        onChange={(e) => setReview({ ...review, internalNote: e.target.value })}
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={!lastRevision}
                      onClick={() =>
                        run(async () => {
                          await publishReview({
                            revisionId: lastRevision?.id as string,
                            scope: review.scope,
                            conditions: review.conditions,
                            verdict: review.verdict,
                            clientMessage: review.clientMessage || null,
                            internalNote: review.internalNote || null,
                            exactPartNumber: review.exactPartNumber.trim() || null,
                            designation: review.exactPartNumber.trim() ? review.designation : null,
                            variant: {
                              cable: {
                                ...(review.variantReserveMm.trim()
                                  ? { serviceReserveMm: Number(review.variantReserveMm) }
                                  : {}),
                                ...(review.variantToleranceMm.trim()
                                  ? { toleranceMm: Number(review.variantToleranceMm) }
                                  : {}),
                                ...(review.variantLengthChoice
                                  ? { lengthChoice: review.variantLengthChoice }
                                  : {}),
                                ...(review.variantCable.trim()
                                  ? { text: review.variantCable.trim() }
                                  : {}),
                              },
                              connector: {
                                ...(review.variantConnectorMaker.trim()
                                  ? { manufacturer: review.variantConnectorMaker.trim() }
                                  : {}),
                                ...(review.variantConnectorMpn.trim()
                                  ? { mpn: review.variantConnectorMpn.trim() }
                                  : {}),
                                ...(review.variantConnectorPositions.trim()
                                  ? { positions: Number(review.variantConnectorPositions) }
                                  : {}),
                                ...(review.variantConnector.trim()
                                  ? { text: review.variantConnector.trim() }
                                  : {}),
                              },
                              pcb: review.variantPcb,
                              description: review.variantDescription,
                            },
                          });
                          setReview(emptyReview);
                          return "Retour publié : le client le voit, la note interne reste chez Standex.";
                        })
                      }
                    >
                      Publier ce retour au client
                    </Button>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="notes">
                  <AccordionTrigger>Notes internes</AccordionTrigger>
                  <AccordionContent className="space-y-2">
                    <ul className="space-y-1 text-sm">
                      {(view.internal_notes ?? []).map((n) => (
                        <li key={n.id} className="rounded border p-2">
                          <span className="text-xs text-muted-foreground">
                            {new Date(n.created_at).toLocaleString("fr-FR")}
                          </span>
                          <p className="whitespace-pre-wrap">{n.body}</p>
                        </li>
                      ))}
                    </ul>
                    <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        run(async () => {
                          await addInternalNote(view.dossier.id, note);
                          setNote("");
                          return "Note interne enregistrée.";
                        })
                      }
                    >
                      Ajouter une note interne
                    </Button>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="offer">
                  <AccordionTrigger>Offre commerciale</AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    {currentReview?.verdict === "validated" && currentReview.exact_part_number ? (
                      <p className="text-sm">
                        Base : {currentReview.exact_part_number} (
                        {currentReview.designation === "custom" ? "spécifique" : "standard"}),
                        version {currentReview.revision}, volume annuel déclaré{" "}
                        {String(
                          (lastRevision?.snapshot as Record<string, unknown> | undefined)?.[
                            "business"
                          ] ?? "",
                        ).slice(0, 0) || "repris du dossier envoyé"}
                        .
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Aucun prix tant qu'un retour validé avec référence exacte n'est pas publié
                        sur la version en cours.
                      </p>
                    )}
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div>
                        <Label className="text-xs">Devise</Label>
                        <Input
                          value={offer.currency}
                          onChange={(e) => setOffer({ ...offer, currency: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Quantité minimale</Label>
                        <Input
                          value={offer.moq}
                          onChange={(e) => setOffer({ ...offer, moq: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Outillage / frais fixes</Label>
                        <Input
                          value={offer.nre}
                          onChange={(e) => setOffer({ ...offer, nre: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Incoterm</Label>
                        <Input
                          value={offer.incoterm}
                          onChange={(e) => setOffer({ ...offer, incoterm: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Délai (semaines)</Label>
                        <Input
                          value={offer.leadTimeWeeks}
                          onChange={(e) => setOffer({ ...offer, leadTimeWeeks: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Valable jusqu'au</Label>
                        <Input
                          type="date"
                          value={offer.validUntil}
                          onChange={(e) => setOffer({ ...offer, validUntil: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">
                        Paliers « quantité:prix » (une ligne par palier)
                      </Label>
                      <Textarea
                        rows={3}
                        value={offer.tiers}
                        onChange={(e) => setOffer({ ...offer, tiers: e.target.value })}
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={!currentReview}
                      onClick={() =>
                        run(async () => {
                          await createOffer({
                            reviewId: currentReview?.id as string,
                            currency: offer.currency.toUpperCase(),
                            tiers: parseTiers(offer.tiers),
                            moq: Number(offer.moq),
                            nreToolingCost: offer.nre ? Number(offer.nre) : null,
                            incoterm: offer.incoterm,
                            leadTimeWeeks: offer.leadTimeWeeks ? Number(offer.leadTimeWeeks) : null,
                            validUntil: offer.validUntil,
                          });
                          return "Offre enregistrée et visible par le client à côté de la conception validée.";
                        })
                      }
                    >
                      Enregistrer l'offre
                    </Button>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="samples">
                  <AccordionTrigger>Échantillons</AccordionTrigger>
                  <AccordionContent className="space-y-2">
                    {view.samples.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Aucune demande.</p>
                    ) : (
                      view.samples.map((s) => (
                        <div
                          key={s.id}
                          className="flex flex-wrap items-center gap-2 rounded border p-2 text-sm"
                        >
                          <span className="font-medium">
                            {s.quantity} × {s.part_number}
                          </span>
                          <Badge variant="outline">{s.route}</Badge>
                          <Badge variant="secondary">{s.status}</Badge>
                          {["confirmed", "shipped", "received", "closed"].map((st) => (
                            <Button
                              key={st}
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                run(async () => {
                                  await updateSample({ sampleId: s.id, status: st });
                                  return "Suivi mis à jour.";
                                })
                              }
                            >
                              {st}
                            </Button>
                          ))}
                          {s.status === "superseded" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                run(async () => {
                                  const why = window.prompt(
                                    "Pourquoi cet échantillon reste-t-il valable malgré la nouvelle version du dossier ?",
                                  );
                                  if (!why?.trim()) return "Revalidation annulée.";
                                  await revalidateSample(s.id, why.trim());
                                  return "Échantillon revalidé explicitement.";
                                })
                              }
                            >
                              Revalider explicitement
                            </Button>
                          ) : null}
                          {s.feedback ? (
                            <p className="w-full text-xs text-muted-foreground">
                              Retour client (version {s.feedback_revision}) : {s.feedback}
                            </p>
                          ) : null}
                        </div>
                      ))
                    )}
                  </AccordionContent>
                </AccordionItem>

                {inbox.role === "admin" ? (
                  <AccordionItem value="nda">
                    <AccordionTrigger>Preuve d'accord de confidentialité</AccordionTrigger>
                    <AccordionContent className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Le document original de référence est vérifié automatiquement (empreinte{" "}
                        {APPROVED_NDA_TEMPLATE.sha256.slice(0, 16)}…). Générer un document ne vaut
                        pas signature : enregistrez ici la preuve du document réellement signé.
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <Label className="text-xs">Document signé (fichier)</Label>
                          <Input
                            type="file"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              void run(async () => {
                                const bytes = new Uint8Array(await file.arrayBuffer());
                                const uploaded = await uploadDesignFile(
                                  view.dossier.id,
                                  {
                                    name: file.name,
                                    data: bytes,
                                    mimeType: file.type || "application/pdf",
                                  },
                                  "nda_signed",
                                  {
                                    kind: "supabase_files",
                                    statement:
                                      "Dépôt du document signé pour vérification par Standex.",
                                    accepted_at: new Date().toISOString(),
                                    content_ref: file.name,
                                    revision: view.dossier.current_revision,
                                  },
                                );
                                setNda((n) => ({
                                  ...n,
                                  // Empreinte des octets RÉELLEMENT déposés, calculée au dépôt.
                                  documentSha256: uploaded.sha256,
                                  signedObjectPath: uploaded.path,
                                  signedFileName: uploaded.fileName,
                                  evidenceKind: "stored_object",
                                }));
                                return "Document déposé et empreinte calculée automatiquement.";
                              });

                            }}
                          />
                          <p className="mt-1 text-xs text-muted-foreground">
                            {nda.signedFileName
                              ? `Déposé : ${nda.signedFileName} — empreinte ${nda.documentSha256.slice(0, 16)}…`
                              : "Aucun document déposé. Vous pouvez aussi déclarer une preuve conservée dans une archive externe."}
                          </p>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="mt-1"
                            onClick={() =>
                              setNda((n) => ({
                                ...n,
                                evidenceKind:
                                  n.evidenceKind === "stored_object"
                                    ? "external_archive"
                                    : "stored_object",
                                ...(n.evidenceKind === "stored_object"
                                  ? { signedObjectPath: "", signedFileName: "" }
                                  : {}),
                              }))
                            }
                          >
                            {nda.evidenceKind === "stored_object"
                              ? "Preuve conservée hors de l'application"
                              : "Revenir à un document déposé ici"}
                          </Button>
                        </div>
                        <div>
                          <Label className="text-xs">Référence de la preuve</Label>
                          <Input
                            value={nda.proofReference}
                            onChange={(e) => setNda({ ...nda, proofReference: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Date de signature</Label>
                          <Input
                            type="date"
                            value={nda.signedAt}
                            onChange={(e) => setNda({ ...nda, signedAt: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Partie 1</Label>
                          <Input
                            value={nda.partyA}
                            onChange={(e) => setNda({ ...nda, partyA: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Partie 2</Label>
                          <Input
                            value={nda.partyB}
                            onChange={(e) => setNda({ ...nda, partyB: e.target.value })}
                          />
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() =>
                          run(async () => {
                            await recordNdaProof({
                              dossierId: view.dossier.id,
                              templateSha256: APPROVED_NDA_TEMPLATE.sha256,
                              documentSha256: nda.documentSha256.trim().toLowerCase(),
                              signedObjectPath:
                                nda.evidenceKind === "stored_object" ? nda.signedObjectPath : "",
                              proofReference: nda.proofReference,
                              counterparties: [{ party: nda.partyA }, { party: nda.partyB }],
                              signedAt: nda.signedAt,
                              source: nda.source,
                              evidenceKind: nda.evidenceKind,
                            });
                            return "Preuve enregistrée : les transferts confidentiels sont maintenant autorisés pour ce dossier.";
                          })
                        }
                      >
                        Enregistrer la preuve vérifiée
                      </Button>
                    </AccordionContent>
                  </AccordionItem>
                ) : null}
              </Accordion>

              <Separator />
              <p className="text-xs text-muted-foreground">
                Signatures électroniques, catalogues distributeurs et registres d'entreprises ne
                sont pas reliés : ces vérifications restent manuelles.
              </p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
