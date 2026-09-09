import { t } from "@/lib/i18n/core";
/** Console interne Standex : boîte de réception, revue R&D, offre, échantillons, preuve NDA.
 *
 * Écran privé : chaque action est refusée côté serveur si le rôle et l'affectation
 * ne sont pas ceux enregistrés en base. Rien n'est décidé côté navigateur.
 *
 * Ce composant était la route `/standex` ; il est désormais réutilisé tel quel
 * dans la fiche projet de l'espace de travail. Aucun de ses flux (revue,
 * variantes, offres, échantillons, NDA, documents, 3D) n'a été retiré.
 */
import { Link } from "@tanstack/react-router";

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
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
  downloadDesignFile,
  sha256Hex,
  signedFileUrl,
  type DossierView,
  type StaffInbox,
} from "@/lib/leadmagnet/supabase-adapter";
import { APPROVED_NDA_TEMPLATE } from "@/lib/leadmagnet/nda";
import { parseServerSnapshot } from "@/lib/leadmagnet/dossier-io";
import {
  applyRoutingPick,
  estimateCableLength,
  resetRouting,
  routingPoints,
  undoRoutingPick,
  type CablingConfig,
  type RoutingSlot,
  type RoutingTarget,
} from "@/lib/leadmagnet/cabling";
import { technicalSummary } from "@/lib/leadmagnet/submission";
import { canExportEnglish, selectEnglishReport } from "@/lib/leadmagnet/english-report";
import { WorkspacePanel } from "@/components/leadmagnet/workspace-panel";
import {
  DocumentViewer,
  documentFromBytes,
  kindFromName,
  type ViewerDocument,
} from "@/components/leadmagnet/document-viewer";
import { parseWorkshopConfig, type WorkshopConfig } from "@/lib/standex/magnetic-workshop";
import { storeMachineFileInMemory } from "@/lib/standex/machine-assets";
import { AuthPanel } from "@/components/leadmagnet/auth-panel";
import { supabase } from "@/lib/standex/supabase";

const MAIN_EMBEDDED = "grid gap-6";
const MAIN_STANDALONE = "mx-auto grid max-w-6xl gap-6 p-4";
const MAIN_WITH_SIDEBAR = " lg:grid-cols-[320px_1fr]";

const MagneticWorkshop = lazy(() => import("@/components/standex/workshop/workshop"));

export interface DossierConsoleProps {
  /** Dossier à ouvrir d'emblée : la fiche projet impose le sien. */
  initialDossierId?: string;
  /** Intégrée dans une fiche projet : l'en-tête général n'est pas répété. */
  embedded?: boolean;
  /** Masque l'en-tête. Par défaut : masqué en intégration. */
  hideHeader?: boolean;
  /** Masque la liste de dossiers (tri et dossiers confiés). Par défaut, elle
   *  n'est masquée que lorsqu'un dossier précis est imposé : sans elle et sans
   *  dossier imposé, l'écran n'offrirait aucun moyen d'en choisir un. */
  hideSidebar?: boolean;
}


/* i18n-canonical : libellés stockés en français, traduits au rendu par t(). */
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

export function DossierConsole({
  initialDossierId,
  embedded = false,
  hideHeader,
  hideSidebar,
}: DossierConsoleProps) {
  const noHeader = hideHeader ?? embedded;
  const noSidebar = hideSidebar ?? Boolean(initialDossierId);
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
    partyA: t("Standex Electronics"),
    partyB: "",
    signedAt: "",
    source: t("Vérification manuelle du document signé"),
    evidenceKind: "stored_object" as "stored_object" | "external_archive",
    signedFileName: "",
  });
  /** Lecture 3D du modèle réellement envoyé : uniquement en mémoire de l'onglet. */
  const [viewer, setViewer] = useState<{
    config: WorkshopConfig;
    cabling: CablingConfig;
    revision: number;
    sha256: string;
  } | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  /** Lecture équipe : anglais par défaut, original toujours accessible. */
  const [reportView, setReportView] = useState<"en" | "original">("en");
  const selectionRequest = useRef(0);
  const modelRequest = useRef(0);
  const docGenRef = useRef(0);
  const documentDossierRef = useRef<string | null>(null);
  const [openDoc, setOpenDoc] = useState<ViewerDocument | null>(null);
  const [viewerTarget, setViewerTarget] = useState<RoutingTarget>({ kind: "base" });
  const [viewerSlot, setViewerSlot] = useState<RoutingSlot>("sensor");
  const viewerEstimate = viewer ? estimateCableLength(viewer.cabling) : null;
  const viewerCable = viewer
    ? {
        slot: viewerSlot,
        setSlot: setViewerSlot,
        points: routingPoints(viewer.cabling, viewerTarget),
        targetLabel:
          viewerTarget.kind === "base" ? t("Trajet de référence") : t("Trajet de l'état sélectionné"),
        onPick: (point: [number, number, number], cycleT: number) =>
          setViewer((v) =>
            v
              ? {
                  ...v,
                  cabling: applyRoutingPick(v.cabling, viewerTarget, viewerSlot, point, {
                    cycleT,
                    label: t("Ajustement local de revue"),
                  }),
                }
              : v,
          ),
        onUndo: () =>
          setViewer((v) => (v ? { ...v, cabling: undoRoutingPick(v.cabling, viewerTarget) } : v)),
        onReset: () =>
          setViewer((v) => (v ? { ...v, cabling: resetRouting(v.cabling, viewerTarget) } : v)),
        lengthLabel:
          viewerEstimate?.requiredMm === null || viewerEstimate === null
            ? t("Longueur inconnue : trajet incomplet.")
            : `Longueur nécessaire : ${viewerEstimate.requiredMm?.toFixed(1)} mm. Aucune validation d'ingénierie.`,
      }
    : undefined;

  /** Ouvre le GLB réellement transféré, jamais un montage par défaut.
   * Le binaire est retéléchargé, son empreinte est comparée à celle annoncée à
   * la soumission, puis il est chargé en mémoire avec la configuration exacte
   * de la version envoyée. Si quoi que ce soit manque, on refuse et on le dit.
   */
  const openTransferredModel = useCallback(
    async (file: { path?: string; file_name?: string; sha256?: string }) => {
      const request = ++modelRequest.current;
      const selection = selectionRequest.current;
      const stale = () =>
        request !== modelRequest.current || selection !== selectionRequest.current;
      setViewerError(null);
      setViewer(null);
      const revisions = view?.revisions ?? [];
      const last = [...revisions].sort((a, b) => b.revision - a.revision)[0];
      if (!last) {
        setViewerError(t("Aucune version envoyée : rien à ouvrir."));
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
          t("Cette version ne contient pas de montage 3D exploitable : aucun montage par défaut n'est affiché à la place."),
        );
        return;
      }
      const path = String(file.path ?? "");
      if (!path) {
        setViewerError(t("Ce fichier n'a pas de chemin de stockage : il ne peut pas être relu."));
        return;
      }
      try {
        const bytes = await downloadDesignFile(path);
        if (stale()) return;
        const digest = await sha256Hex(bytes);
        const expected =
          file.sha256 ??
          parsed.dossier.attachments.find(
            (a) => a.storagePath === path || a.fileName === file.file_name,
          )?.sha256 ??
          null;
        if (!expected) {
          setViewerError(
            t("Aucune empreinte n'a été enregistrée pour ce fichier : il n'est pas ouvert, faute de pouvoir prouver qu'il s'agit du fichier envoyé."),
          );
          return;
        }
        if (expected.toLowerCase() !== digest.toLowerCase()) {
          setViewerError(
            t("Le contenu téléchargé ne correspond pas à l'empreinte enregistrée à l'envoi : le fichier n'est pas ouvert."),
          );
          return;
        }
        if (config.machine.assetKey !== `sha256:${digest}`) {
          setViewerError(t("Ce fichier ne correspond pas au modèle lié à cette configuration."));
          return;
        }
        const name = String(file.file_name ?? config.machine.fileName ?? "modele.glb");
        const assetKey = await storeMachineFileInMemory(
          new File([bytes], name, { type: "model/gltf-binary" }),
        );
        if (stale()) return;
        setViewerTarget({ kind: "base" });
        setViewer({
          cabling: structuredClone(parsed.dossier.cabling),
          config: { ...config, machine: { ...config.machine, assetKey, fileName: name } },
          revision: last.revision,
          sha256: digest,
        });
      } catch (error) {
        if (stale()) return;
        setViewerError(
          error instanceof Error ? error.message : t("Le modèle 3D n'a pas pu être ouvert."),
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
    const request = ++selectionRequest.current;
    if (documentDossierRef.current !== id) {
      documentDossierRef.current = id;
      docGenRef.current += 1;
      setOpenDoc(null);
      setView(null);
    }
    modelRequest.current += 1;
    setViewer(null);
    setViewerError(null);
    // Chaque ouverture de dossier repart en anglais : la bascule vers
    // l'original ne vaut que pour la consultation en cours.
    setReportView("en");
    try {
      const loaded = await fetchStaffView(id);
      if (request !== selectionRequest.current) return;
      setView(loaded);
      setSelected(id);
    } catch (error) {
      if (request !== selectionRequest.current) return;
      setView(null);
      setMessage(error instanceof Error ? error.message : null);
    }
  }, []);

  useEffect(() => {
    if (backend?.ready) void loadInbox();
  }, [backend?.ready, loadInbox]);

  // Fiche projet : le dossier de l'adresse est ouvert, et lui seul. Un
  // changement de projet recharge, sans conserver la lecture précédente.
  useEffect(() => {
    if (!backend?.ready || !initialDossierId) return;
    void loadView(initialDossierId);
  }, [backend?.ready, initialDossierId, loadView]);


  const run = async (fn: () => Promise<string>) => {
    const request = selectionRequest.current;
    try {
      const outcome = await fn();
      if (request !== selectionRequest.current) return;
      setMessage(outcome);
      if (selected) await loadView(selected);
      await loadInbox();
    } catch (error) {
      if (request !== selectionRequest.current) return;
      setMessage(error instanceof Error ? error.message : t("Action refusée."));
    }
  };

  if (!backend?.ready)
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-6">
        <Link
          to="/design"
          className="inline-flex min-h-11 items-center gap-2 rounded-[var(--r-sm)] px-2 text-sm text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t("Espace de conception")}
        </Link>
        <h1 className="t-title-m">{t("Console Standex")}</h1>
        <p className="text-sm">{t(backend?.message ?? "Connexion en cours…")}</p>
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
        <h1 className="t-title-m">{t("Console Standex")}</h1>
        <p className="text-sm">
          {message ??
            t("Cet espace est réservé aux membres de l'équipe Standex habilités. Votre compte n'y donne pas accès.")}
        </p>
      </div>
    );

  const revisions = view?.revisions ?? [];
  const lastRevision = revisions[revisions.length - 1] ?? null;
  const currentReview =
    (view?.reviews ?? []).filter((r) => r.published && !r.superseded).slice(-1)[0] ?? null;

  const mainClassName = `${embedded ? MAIN_EMBEDDED : MAIN_STANDALONE}${
    noSidebar ? "" : MAIN_WITH_SIDEBAR
  }`;

  return (
    <div
      data-readable
      className={
        embedded ? "text-foreground" : "min-h-screen bg-background text-foreground"
      }
    >
      {noHeader ? null : (
        <header className="material sticky top-0 z-30 shadow-[var(--e-1)]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
            <Link
              to="/design"
              className="inline-flex min-h-11 items-center gap-2 rounded-[var(--r-sm)] px-2 text-sm text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> {t("Espace de conception")}
            </Link>
            <h1 className="t-title-s">{t("Console Standex")}</h1>
            <Badge variant="secondary">
              {inbox.role === "rnd" ? "R&D" : inbox.role === "sales" ? "Commerce" : "Administration"}
            </Badge>
          </div>
        </header>
      )}

      <main className={mainClassName}>
        {noSidebar ? null : (
        <aside className="space-y-4">

          <section>
            <h2 className="t-title-s mb-2">{t("Dossiers qui me sont confiés")}</h2>
            {inbox.assigned.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("Aucun dossier ne vous est confié.")}</p>
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
                    <p className="px-1 t-caption text-muted-foreground">
                      version {d.current_revision}
                      {d.awaiting_review ? t(" — en attente de retour") : t(" — retour publié")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {inbox.role === "admin" ? (
            <section className="space-y-2">
              <h2 className="t-title-s">{t("Tri et affectation")}</h2>
              <p className="t-caption text-muted-foreground">
                {t("Cette liste ne contient que des informations générales : aucun contenu technique n'est visible sans affectation.")}
              </p>
              {inbox.triage.map((d) => (
                <div
                  key={d.id}
                  className="min-h-11 rounded-[var(--r-sm)] border-0 bg-[var(--surface-sunken)] p-3 text-sm shadow-[var(--e-inset)]"
                >
                  <p className="font-medium">{d.title}</p>
                  <p className="t-caption text-muted-foreground">
                    version {d.current_revision} — {d.assignees.length} {t("personne(s) affectée(s)")}
                  </p>
                  <div className="mt-1 flex gap-1">
                    <Select value={assignee} onValueChange={setAssignee}>
                      <SelectTrigger className="min-h-11 t-caption">
                        <SelectValue placeholder={t("Choisir un collègue")} />
                      </SelectTrigger>
                      <SelectContent>
                        {inbox.staff_directory.map((m) => (
                          <SelectItem key={m.user_id} value={m.user_id}>
                            {m.display_name ?? m.email ?? t("Membre Standex")} — {m.role}
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
                          return t("Dossier confié à ce collègue.");
                        })
                      }
                    >
                      {t("Confier")}
                    </Button>
                  </div>
                </div>
              ))}
            </section>
          ) : null}
        </aside>
        )}


        <section className="space-y-4">
          {message ? (
            <p className="min-h-11 rounded-[var(--r-sm)] border-0 bg-[var(--surface-sunken)] p-3 text-sm shadow-[var(--e-inset)]">
              {message}
            </p>
          ) : null}
          {!view ? (
            <p className="text-sm text-muted-foreground">
              {t("Choisissez un dossier pour lire la conception envoyée et publier un retour.")}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="t-title-m">{view.dossier.title}</h2>
                <Badge variant="outline">version {view.dossier.current_revision}</Badge>
                <Badge variant="secondary">
                  {view.dossier.nda_status === "in_force"
                    ? t("Confidentialité en vigueur")
                    : view.dossier.nda_required
                      ? t("Confidentialité en attente")
                      : t("Sans accord de confidentialité")}
                </Badge>
              </div>

              <Accordion type="multiple" defaultValue={["design", "review"]}>
                <AccordionItem value="design">
                  <AccordionTrigger>{t("Conception réellement envoyée")}</AccordionTrigger>
                  <AccordionContent className="space-y-2">
                    {lastRevision ? (
                      <>
                        <p className="t-caption text-muted-foreground">
                          {t("Envoyée le")} {new Date(lastRevision.submitted_at).toLocaleString("fr-FR")} {t("— empreinte")} {lastRevision.content_hash.slice(0, 16)}{t("… — fichiers joints :")}{" "}
                          {lastRevision.transferred_files.length}
                        </p>
                        {(() => {
                          const parsed = parseServerSnapshot(
                            lastRevision.snapshot as Record<string, unknown>,
                          );
                          // Version anglaise : LUE, jamais produite ici. Une
                          // version absente ou liée à une autre empreinte n'est
                          // jamais présentée comme le texte courant.
                          const english = selectEnglishReport(
                            view.reports_en,
                            lastRevision,
                          );
                          const englishNotice =
                            english.kind === "ready"
                              ? null
                              : english.kind === "pending"
                                ? t("La version anglaise de cette version est demandée mais pas encore disponible.")
                                : english.kind === "stale"
                                  ? t("La version anglaise enregistrée correspond à un autre contenu que celui envoyé : elle n'est pas affichée.")
                                  : english.kind === "invalid"
                                    ? `${t("Version anglaise refusée :")} ${english.reason}`
                                    : t("Aucune version anglaise n'existe pour cette version. Aucune traduction automatique n'est branchée.");
                          return (
                            <>
                              <div
                                role="group"
                                aria-label={t("Langue de lecture du rapport")}
                                className="flex flex-wrap items-center gap-2"
                              >
                                <Button
                                  size="sm"
                                  variant={reportView === "en" ? "default" : "outline"}
                                  aria-pressed={reportView === "en"}
                                  onClick={() => setReportView("en")}
                                >
                                  {t("Version anglaise")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant={reportView === "original" ? "default" : "outline"}
                                  aria-pressed={reportView === "original"}
                                  onClick={() => setReportView("original")}
                                >
                                  {t("Original du client")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!canExportEnglish(english)}
                                  title={
                                    canExportEnglish(english)
                                      ? undefined
                                      : t("Export impossible : aucune version anglaise valide pour cette version.")
                                  }
                                  onClick={() => {
                                    if (english.kind !== "ready") return;
                                    const blob = new Blob([english.body], {
                                      type: "text/markdown",
                                    });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = `report-en-${lastRevision.content_hash.slice(0, 12)}.md`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                  }}
                                >
                                  {t("Export équipe (anglais)")}
                                </Button>
                              </div>
                              {reportView === "en" ? (
                                english.kind === "ready" ? (
                                  <>
                                    <p className="t-caption text-muted-foreground">
                                      {t("Origine de cette version anglaise :")}{" "}
                                      {english.origin === "human_translation"
                                        ? t("traduction relue par une personne")
                                        : english.origin === "source_is_english"
                                          ? t("original déjà rédigé en anglais")
                                          : t("traduction produite par un outil autorisé")}
                                      {english.producer ? ` — ${english.producer}` : ""}
                                    </p>
                                    <pre className="code-block max-h-96 whitespace-pre-wrap">
                                      {english.body}
                                    </pre>
                                  </>
                                ) : (
                                  <p className="notice-warning t-caption">{englishNotice}</p>
                                )
                              ) : parsed.ok ? (
                                <pre className="code-block max-h-96 whitespace-pre-wrap">
                                  {technicalSummary(parsed.dossier)}
                                </pre>
                              ) : (
                                <p className="t-caption text-destructive">
                                  {t("Cette version n'est pas lisible sous forme de résumé technique :")}{" "}
                                  {parsed.reason} {t("Contenu brut ci-dessous.")}
                                </p>
                              )}
                            </>
                          );
                        })()}
                        <details>
                          <summary className="cursor-pointer t-caption text-muted-foreground">
                            {t("Contenu complet envoyé (brut)")}
                          </summary>
                          <pre className="code-block max-h-96">
                            {JSON.stringify(lastRevision.snapshot, null, 2)}
                          </pre>
                        </details>
                        <ul className="list-disc pl-5 t-caption">
                          {lastRevision.transferred_files.map((f, i) => (
                            <li key={i} className="flex flex-wrap items-center gap-2">
                              <span>{f.file_name ?? f.path}</span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  run(async () => {
                                    const name = String(f.file_name ?? f.path);
                                    const gen = ++docGenRef.current;
                                    const bytes = await downloadDesignFile(String(f.path));
                                    // Une réponse tardive ne doit pas écraser un autre document.
                                    if (gen !== docGenRef.current) return "";
                                    // Markdown et texte sont DÉCODÉS, sinon un .md
                                    // venu du serveur ne s'afficherait pas.
                                    setOpenDoc(
                                      documentFromBytes(name, bytes, `${String(f.path)}-${gen}`),
                                    );
                                    return t("Document ouvert dans le lecteur (il reste en mémoire).");
                                  })
                                }
                              >
                                {t("Lire ici")}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  run(async () => {
                                    const url = await signedFileUrl(String(f.path));
                                    if (!url) return t("Fichier indisponible pour ce compte.");
                                    window.open(url, "_blank", "noopener");
                                    return t("Lien de téléchargement ouvert (valable quelques minutes).");
                                  })
                                }
                              >
                                {t("Télécharger")}
                              </Button>
                              {/^.+\.glb$/i.test(String(f.file_name ?? f.path ?? "")) ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void openTransferredModel(f)}
                                >
                                  {t("Ouvrir en 3D")}
                                </Button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                        {viewerError ? (
                          <p className="t-caption text-destructive">{viewerError}</p>
                        ) : null}
                        {viewer ? (
                          <div className="mt-2">
                            <p className="mb-2 t-caption text-muted-foreground">
                              {t("Modèle ouvert en mémoire de cet onglet uniquement, avec la configuration exacte de la version")} {viewer.revision} {t("et son câble. Empreinte contrôlée :")} {viewer.sha256.slice(0, 16)}{t("…. Une modification faite ici ne vaut jamais retour publié.")}
                            </p>
                            <Label>{t("Trajet de câble affiché")}</Label>
                            <select
                              className="min-h-11 rounded-[var(--r-sm)] border-0 bg-[var(--surface-sunken)] p-3 text-sm shadow-[var(--e-inset)]"
                              value={viewerTarget.kind === "base" ? "base" : viewerTarget.stateId}
                              onChange={(e) =>
                                setViewerTarget(
                                  e.target.value === "base"
                                    ? { kind: "base" }
                                    : { kind: "state", stateId: e.target.value },
                                )
                              }
                            >
                              <option value="base">{t("Trajet de référence")}</option>
                              {viewer.cabling.declaredMotionStates.map((state) => (
                                <option key={state.id} value={state.id}>
                                  {state.label}
                                </option>
                              ))}
                            </select>
                            <p className="t-caption text-muted-foreground">
                              {t("Les ajustements du tracé restent dans cette copie de lecture.")}
                            </p>
                            <Suspense
                              fallback={<p className="text-sm">{t("Chargement de l'atelier…")}</p>}
                            >
                              <MagneticWorkshop
                                key={`${viewer.revision}:${viewer.sha256}`}
                                initialConfig={viewer.config}
                                {...(viewerCable ? { cableRouting: viewerCable } : {})}
                                storageLabel={t("cette lecture, en mémoire de l'onglet")}
                                storageMode="memory"
                                onClose={() => {
                                  modelRequest.current += 1;
                                  setViewer(null);
                                }}
                                onSave={async () => {
                                  setMessage(
                                    t("Cette modification reste locale à votre écran : publiez un retour R&D pour qu'elle compte."),
                                  );
                                }}
                              />
                            </Suspense>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("Aucune version envoyée.")}</p>
                    )}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="review">
                  <AccordionTrigger>{t("Retour R&D")}</AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <Label className="t-caption">{t("Portée de la revue")}</Label>
                        <Input
                          value={review.scope}
                          onChange={(e) => setReview({ ...review, scope: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="t-caption">{t("Conclusion")}</Label>
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
                            <SelectItem value="validated">{t("Validé")}</SelectItem>
                            <SelectItem value="variant_proposed">{t("Variante proposée")}</SelectItem>
                            <SelectItem value="more_info">{t("Informations manquantes")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="t-caption">
                          {t("Référence exacte (obligatoire si validé)")}
                        </Label>
                        <Input
                          value={review.exactPartNumber}
                          onChange={(e) =>
                            setReview({ ...review, exactPartNumber: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label className="t-caption">{t("Type")}</Label>
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
                            <SelectItem value="standard">{t("Standard")}</SelectItem>
                            <SelectItem value="custom">{t("Spécifique")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label className="t-caption">{t("Conditions")}</Label>
                      <Textarea
                        rows={2}
                        value={review.conditions}
                        onChange={(e) => setReview({ ...review, conditions: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div>
                        <Label className="t-caption">{t("Variante — câble (note)")}</Label>
                        <Input
                          value={review.variantCable}
                          onChange={(e) => setReview({ ...review, variantCable: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="t-caption">{t("Réserve de service proposée (mm)")}</Label>
                        <Input
                          inputMode="decimal"
                          value={review.variantReserveMm}
                          onChange={(e) =>
                            setReview({ ...review, variantReserveMm: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label className="t-caption">{t("Tolérance proposée (± mm)")}</Label>
                        <Input
                          inputMode="decimal"
                          value={review.variantToleranceMm}
                          onChange={(e) =>
                            setReview({ ...review, variantToleranceMm: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label className="t-caption">{t("Connecteur — fabricant")}</Label>
                        <Input
                          value={review.variantConnectorMaker}
                          onChange={(e) =>
                            setReview({ ...review, variantConnectorMaker: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label className="t-caption">{t("Connecteur — référence exacte")}</Label>
                        <Input
                          value={review.variantConnectorMpn}
                          onChange={(e) =>
                            setReview({ ...review, variantConnectorMpn: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label className="t-caption">{t("Connecteur — voies")}</Label>
                        <Input
                          inputMode="numeric"
                          value={review.variantConnectorPositions}
                          onChange={(e) =>
                            setReview({ ...review, variantConnectorPositions: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label className="t-caption">{t("Variante — carte (note)")}</Label>
                        <Input
                          value={review.variantPcb}
                          onChange={(e) => setReview({ ...review, variantPcb: e.target.value })}
                        />
                      </div>
                    </div>
                    <p className="t-caption text-muted-foreground">
                      {t("Les valeurs chiffrées et la référence exacte sont réellement reprises dans le dossier du client ; les notes restent descriptives. Un connecteur proposé reste « à vérifier » : ce n'est pas une qualification Standex.")}
                    </p>
                    <div>
                      <Label className="t-caption">{t("Variante — description")}</Label>
                      <Textarea
                        rows={2}
                        value={review.variantDescription}
                        onChange={(e) =>
                          setReview({ ...review, variantDescription: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label className="t-caption">{t("Message publié au client")}</Label>
                      <Textarea
                        rows={3}
                        value={review.clientMessage}
                        onChange={(e) => setReview({ ...review, clientMessage: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="t-caption">{t("Note interne (jamais visible du client)")}</Label>
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
                          return t("Retour publié : le client le voit, la note interne reste chez Standex.");
                        })
                      }
                    >
                      {t("Publier ce retour au client")}
                    </Button>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="notes">
                  <AccordionTrigger>{t("Notes internes")}</AccordionTrigger>
                  <AccordionContent className="space-y-2">
                    <ul className="space-y-1 text-sm">
                      {(view.internal_notes ?? []).map((n) => (
                        <li key={n.id} className="panel-block">
                          <span className="t-caption text-muted-foreground">
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
                          return t("Note interne enregistrée.");
                        })
                      }
                    >
                      {t("Ajouter une note interne")}
                    </Button>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="offer">
                  <AccordionTrigger>{t("Offre commerciale")}</AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    {currentReview?.verdict === "validated" && currentReview.exact_part_number ? (
                      <p className="text-sm">
                        {t("Base :")} {currentReview.exact_part_number} (
                        {currentReview.designation === "custom" ? t("spécifique") : "standard"}{t("), version")} {currentReview.revision}{t(", volume annuel déclaré")}{" "}
                        {String(
                          (lastRevision?.snapshot as Record<string, unknown> | undefined)?.[
                            "business"
                          ] ?? "",
                        ).slice(0, 0) || t("repris du dossier envoyé")}
                        .
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t("Aucun prix tant qu'un retour validé avec référence exacte n'est pas publié sur la version en cours.")}
                      </p>
                    )}
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div>
                        <Label className="t-caption">{t("Devise")}</Label>
                        <Input
                          value={offer.currency}
                          onChange={(e) => setOffer({ ...offer, currency: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="t-caption">{t("Quantité minimale")}</Label>
                        <Input
                          value={offer.moq}
                          onChange={(e) => setOffer({ ...offer, moq: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="t-caption">{t("Outillage / frais fixes")}</Label>
                        <Input
                          value={offer.nre}
                          onChange={(e) => setOffer({ ...offer, nre: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="t-caption">{t("Incoterm")}</Label>
                        <Input
                          value={offer.incoterm}
                          onChange={(e) => setOffer({ ...offer, incoterm: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="t-caption">{t("Délai (semaines)")}</Label>
                        <Input
                          value={offer.leadTimeWeeks}
                          onChange={(e) => setOffer({ ...offer, leadTimeWeeks: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="t-caption">{t("Valable jusqu'au")}</Label>
                        <Input
                          type="date"
                          value={offer.validUntil}
                          onChange={(e) => setOffer({ ...offer, validUntil: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="t-caption">
                        {t("Paliers « quantité:prix » (une ligne par palier)")}
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
                          return t("Offre enregistrée et visible par le client à côté de la conception validée.");
                        })
                      }
                    >
                      {t("Enregistrer l'offre")}
                    </Button>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="samples">
                  <AccordionTrigger>{t("Échantillons")}</AccordionTrigger>
                  <AccordionContent className="space-y-2">
                    {view.samples.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("Aucune demande.")}</p>
                    ) : (
                      view.samples.map((s) => (
                        <div
                          key={s.id}
                          className="panel-block flex flex-wrap items-center gap-2 text-sm"
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
                                  return t("Suivi mis à jour.");
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
                                    t("Pourquoi cet échantillon reste-t-il valable malgré la nouvelle version du dossier ?"),
                                  );
                                  if (!why?.trim()) return t("Revalidation annulée.");
                                  await revalidateSample(s.id, why.trim());
                                  return t("Échantillon revalidé explicitement.");
                                })
                              }
                            >
                              {t("Revalider explicitement")}
                            </Button>
                          ) : null}
                          {s.feedback ? (
                            <p className="w-full t-caption text-muted-foreground">
                              {t("Retour client (version")} {s.feedback_revision}) : {s.feedback}
                            </p>
                          ) : null}
                        </div>
                      ))
                    )}
                  </AccordionContent>
                </AccordionItem>

                {inbox.role === "admin" ? (
                  <AccordionItem value="nda">
                    <AccordionTrigger>{t("Preuve d'accord de confidentialité")}</AccordionTrigger>
                    <AccordionContent className="space-y-2">
                      <p className="t-caption text-muted-foreground">
                        {t("Le document original de référence est vérifié automatiquement (empreinte")}{" "}
                        {APPROVED_NDA_TEMPLATE.sha256.slice(0, 16)}{t("…). Générer un document ne vaut pas signature : enregistrez ici la preuve du document réellement signé.")}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <Label className="t-caption">{t("Document signé (fichier)")}</Label>
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
                                      t("Dépôt du document signé pour vérification par Standex."),
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
                                return t("Document déposé et empreinte calculée automatiquement.");
                              });
                            }}
                          />
                          <p className="mt-1 t-caption text-muted-foreground">
                            {nda.signedFileName
                              ? `Déposé : ${nda.signedFileName} — empreinte ${nda.documentSha256.slice(0, 16)}…`
                              : t("Aucun document déposé. Vous pouvez aussi déclarer une preuve conservée dans une archive externe.")}
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
                              ? t("Preuve conservée hors de l'application")
                              : t("Revenir à un document déposé ici")}
                          </Button>
                        </div>
                        <div>
                          <Label className="t-caption">{t("Référence de la preuve")}</Label>
                          <Input
                            value={nda.proofReference}
                            onChange={(e) => setNda({ ...nda, proofReference: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="t-caption">{t("Date de signature")}</Label>
                          <Input
                            type="date"
                            value={nda.signedAt}
                            onChange={(e) => setNda({ ...nda, signedAt: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="t-caption">{t("Partie 1")}</Label>
                          <Input
                            value={nda.partyA}
                            onChange={(e) => setNda({ ...nda, partyA: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="t-caption">{t("Partie 2")}</Label>
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
                            return t("Preuve enregistrée : les transferts confidentiels sont maintenant autorisés pour ce dossier.");
                          })
                        }
                      >
                        {t("Enregistrer la preuve vérifiée")}
                      </Button>
                    </AccordionContent>
                  </AccordionItem>
                ) : null}
              </Accordion>

              <Separator />
              <p className="t-caption text-muted-foreground">
                {t("Signatures électroniques, catalogues distributeurs et registres d'entreprises ne sont pas reliés : ces vérifications restent manuelles.")}
              </p>
            </>
          )}
        </section>
      </main>

      <WorkspacePanel
        open={openDoc !== null}
        onOpenChange={(o) => {
          if (!o) {
            // Fermer le lecteur invalide toute lecture encore en vol.
            docGenRef.current += 1;
            setOpenDoc(null);
          }
        }}
        title={t("Document transmis")}
        description={t("Lecture en mémoire de cet onglet, via l'accès authentifié existant.")}
      >
        <DocumentViewer document={openDoc} />
      </WorkspacePanel>
    </div>
  );
}
