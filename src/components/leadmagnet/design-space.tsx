import { getLocale, msg, setLocale, t, type Locale } from "@/lib/i18n/core";
import { Link } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ShieldCheck,
  Lock,
  Download,
  Upload,
  AlertTriangle,
  Info,
  UserRound,
  FileText,
  Box,
  Cpu,
  Cable,
  Loader2,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CandidateThumbnail } from "@/components/leadmagnet/candidate-thumbnail";
import { CUSTOM_SENSOR_ID, sensorById } from "@/lib/standex/sensor-catalog";
import { LanguagePicker, useLocale } from "@/lib/i18n/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  createDossier,
  confirmRequirement,
  proposeRequirement,
  parseAnnualVolume,
  toClientDto,
  type DesignDossier,
  type MountingChoice,
} from "@/lib/leadmagnet/dossier";
import { CANDIDATE_DISCLAIMER, evaluateCandidates } from "@/lib/leadmagnet/candidates";
import {
  applyRoutingPick,
  compareStandardLengths,
  estimateCableLength,
  resetRouting,
  routingPoints,
  RANGE_CABLE_LENGTH_NOTES,
  uncoveredMotionStates,
  undoRoutingPick,
  type CablingConfig,
  type Point,
  type RoutingSlot,
  type RoutingTarget,
} from "@/lib/leadmagnet/cabling";

import {
  CONNECTOR_FIELD_LABELS,
  DEFAULT_TERMINATION,
  EMPTY_CONNECTOR_DRAFT,
  connectorSummaryLines,
  terminationFromDraft,
  terminationLabel,
  type ConnectorDraft,
} from "@/lib/leadmagnet/connectors";
import {
  EXPORT_BINARY_NOTICE,
  buildDossierExport,
  parseDossierExport,
  parseServerSnapshot,
} from "@/lib/leadmagnet/dossier-io";
import {
  INITIAL_PRIVACY,
  MEMORY_LOSS_WARNING,
  STORAGE_BADGE,
  LOCAL_ASSISTANT_LABEL,
  grantConsent,
  hasBoundConsent,
  pruneStaleConsents,
  sameBinding,
  type ConsentBinding,
} from "@/lib/leadmagnet/privacy";
import {
  APPROVED_NDA_TEMPLATE,
  INITIAL_NDA,
  NDA_FIELD_LABELS,
  ndaAllowsConfidentialTransfer,
  ndaStatusLabel,
  prepareNda,
  type NdaState,
} from "@/lib/leadmagnet/nda";
import {
  fillNdaTemplate,
  loadNdaTemplate,
  missingNdaFields,
  type FilledNda,
} from "@/lib/leadmagnet/nda-docx";

import {
  checkSubmission,
  submissionBinding,
  submit,
  technicalSummary,
} from "@/lib/leadmagnet/submission";
import { checkLeadBackend, type LeadBackendStatus } from "@/lib/leadmagnet/backend";
import { requestEnglishReport } from "@/lib/leadmagnet/english-report.functions";

import {
  createDossier as createServerDossier,
  createSupabaseSubmissionBackend,
  uploadDesignFile,
  downloadDesignFile,
  prepareNdaOnServer,
  fetchNdaStatus,
  type NdaStatusView,
  type UploadedFile,
} from "@/lib/leadmagnet/supabase-adapter";
import { supabase } from "@/lib/standex/supabase";
import { applyVariant } from "@/lib/leadmagnet/variant";
import { AuthPanel } from "@/components/leadmagnet/auth-panel";
import { ClientFollowUp } from "@/components/leadmagnet/client-followup";
import { WorkspacePanel } from "@/components/leadmagnet/workspace-panel";
import {
  DocumentViewer,
  documentFromBytes,
  documentFromFile,
  type ViewerDocument,
} from "@/components/leadmagnet/document-viewer";
import { memoryAssetBytes } from "@/lib/standex/machine-assets";
import {
  DOCUMENTED_HOUSINGS,
  draftFromHousing,
  housingById,
  housingLabel,
  terminationFromHousing,
} from "@/lib/leadmagnet/connector-library";
import { routeSamples, SEARCH_LINK_DISCLAIMER } from "@/lib/leadmagnet/samples";
import { DEFAULT_WORKSHOP } from "@/lib/standex/magnetic-workshop";
import type { WorkshopConfig } from "@/lib/standex/magnetic-workshop";
import { BrandLogo } from "@/components/standex/brand-logo";

import {
  openPrivateErrorScope,
  reportPrivateError,
  PRIVATE_ERROR_CODES,
} from "@/lib/lovable-error-reporting";

const MagneticWorkshop = lazy(() => import("@/components/standex/workshop/workshop"));

export function PrivateDesignError({ reset }: { reset: () => void }) {
  useLocale();
  useEffect(() => {
    reportPrivateError(PRIVATE_ERROR_CODES.design_workspace);
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-xl font-semibold">{t("L'espace de conception s'est interrompu")}</h1>
        <p className="t-caption">
          {t("Rien de ce que vous avez saisi n'a été transmis. Le détail de l'incident reste sur votre appareil : seul un code d'incident anonyme a été signalé.")}
        </p>
        <Button onClick={reset}>{t("Réessayer")}</Button>
      </div>
    </div>
  );
}

const stateBadge = (state: string) =>
  state === "confirmed" ? t("Confirmé") : state === "hypothesis" ? t("Hypothèse") : "Inconnu";

const num = (raw: string): number | null => {
  const v = Number(raw.replace(",", "."));
  return raw.trim() && Number.isFinite(v) ? v : null;
};

function pointFields(label: string, value: Point | null, onChange: (p: Point | null) => void) {
  const p = value ?? [0, 0, 0];
  return (
    <div className="space-y-1">
      <Label className="t-label">{label} (mm)</Label>
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <Input
            key={i}
            className="t-metric h-11 w-32 text-right"
            inputMode="decimal"
            value={value ? String(p[i]) : ""}
            placeholder={["X", "Y", "Z"][i]!}
            onChange={(e) => {
              const v = num(e.target.value);
              const next: Point = [p[0], p[1], p[2]];
              next[i] = v ?? 0;
              onChange(e.target.value.trim() === "" && !value ? null : next);
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Titre du projet : UN SEUL nom affiché, renommé par une action explicite.
 * Lecture par défaut, crayon pour renommer, Entrée valide, Échap annule, un
 * nom vide est refusé. Le dossier n'est modifié qu'à la validation. */
function ProjectTitle({ title, onRename }: { title: string; onRename: (next: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const start = () => {
    setDraft(title);
    setError(null);
    setEditing(true);
  };
  const cancel = () => {
    setError(null);
    setEditing(false);
  };
  const commit = () => {
    const next = draft.trim();
    if (!next) {
      setError(t("Le nom du projet ne peut pas être vide."));
      inputRef.current?.focus();
      return;
    }
    onRename(next);
    setEditing(false);
    setError(null);
  };

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (!editing)
    return (
      <div className="flex min-w-[min(100%,20rem)] flex-1 basis-80 items-center gap-2">
        <h1 className="t-title-l min-w-0 truncate" title={title}>
          {title}
        </h1>
        <Button
          variant="ghost"
          className="min-h-11 min-w-11 shrink-0 px-3 text-base"
          onClick={start}
          aria-label={msg("Renommer le projet « {0} »", [title])}
        >
          <Pencil className="h-4 w-4" />
          <span className="hidden sm:inline">{t("Renommer")}</span>
        </Button>
      </div>
    );

  return (
    <div className="min-w-[min(100%,18rem)] flex-1">
      <Label htmlFor="project-title" className="t-label">
        {t("Nom du projet")}
      </Label>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Input
          id="project-title"
          ref={inputRef}
          value={draft}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "project-title-error" : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          className="project-title-input h-auto min-h-11 max-w-lg"
        />
        <Button className="min-h-11 text-base" onClick={commit}>
          <Check className="h-4 w-4" /> {t("Valider")}
        </Button>
        <Button variant="ghost" className="min-h-11 text-base" onClick={cancel}>
          <X className="h-4 w-4" /> {t("Annuler")}
        </Button>
      </div>
      {error ? (
        <p id="project-title-error" className="notice notice-danger mt-2">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Questions du parcours guidé : une intention simple par écran, reliée à la
 * MÊME exigence du dossier que le mode détaillé (aucun second état). */
/* i18n-canonical : libellés stockés en français, traduits au rendu par t(). */
export const GUIDED_QUESTIONS: {
  key: string;
  prompt: string;
  example: string;
  placeholder: string;
}[] = [
  {
    key: "detection_goal",
    prompt: "Que voulez-vous détecter ?",
    example: "savoir si une trappe est bien fermée, compter des passages, repérer une position",
    placeholder: "Décrivez-le avec vos mots.",
  },
  {
    key: "states_motion",
    prompt: "Que se passe-t-il quand la pièce bouge ?",
    example: "elle coulisse de 20 mm, elle pivote, elle est retirée puis remise",
    placeholder: "Décrivez le mouvement et les positions à distinguer.",
  },
  {
    key: "mounting",
    prompt: "Où le capteur pourrait-il se placer ?",
    example: "collé sous le couvercle, inséré dans un trou du bâti, vissé sur une équerre",
    placeholder: "Même une idée approximative nous aide.",
  },
  {
    key: "envelope",
    prompt: "Quelle place avez-vous à cet endroit ?",
    example: "un logement d'environ 6 mm de diamètre et 25 mm de long",
    placeholder: "Dimensions disponibles, même approximatives.",
  },
  {
    key: "electrical",
    prompt: "À quoi le capteur sera-t-il relié ?",
    example: "une carte 5 V, un automate 24 V, un petit relais",
    placeholder: "Tension, courant ou carte de destination si vous les connaissez.",
  },
  {
    key: "environment",
    prompt: "Dans quel environnement travaille-t-il ?",
    example: "humidité, huile, vibrations, températures élevées, extérieur",
    placeholder: "Ce que le capteur devra supporter.",
  },
];

export interface DesignSpaceProps {
  /** "page" : route /design autonome. "embedded" : monté dans l'espace projet de l'accueil. */
  chrome?: "page" | "embedded";
  /** false : l'accueil est affiché devant. Les panneaux, eux, restent utilisables :
   * il n'existe qu'UN seul espace, jamais un second compte parallèle. */
  visible?: boolean;
  /** Compteur incrémenté par l'accueil quand l'utilisateur demande « Mon espace ». */
  accountRequest?: number;
  /** Appelé quand un projet est réellement ouvert, créé ou repris ici. */
  onWorkspaceOpen?: () => void;
  /** Retour à l'accueil depuis le logo, SANS démonter cet espace : le brouillon
   * en mémoire, les panneaux et l'atelier restent intacts et on peut revenir. */
  onGoHome?: () => void;
}

export function DesignSpace({
  chrome = "page",
  visible = true,
  accountRequest = 0,
  onWorkspaceOpen,
  onGoHome,
}: DesignSpaceProps) {
  useLocale();
  const [dossier, setDossier] = useState<DesignDossier>(() => createDossier());
  /** L'espace est monté CACHÉ dès l'accueil : la langue d'origine du projet
   * n'est capturée qu'au démarrage réel, jamais à ce montage silencieux. */
  const localeCapturedRef = useRef(false);
  /** Langue d'origine du projet courant, suivie hors rendu pour pouvoir la
   * rétablir quand on revient au projet depuis l'accueil. */
  const dossierLocaleRef = useRef<Locale>("fr");

  useEffect(() => {
    dossierLocaleRef.current = dossier.sourceLocale;
  }, [dossier.sourceLocale]);

  const [privacy, setPrivacy] = useState(INITIAL_PRIVACY);
  const [nda, setNda] = useState<NdaState>(INITIAL_NDA);
  const [ndaPreview, setNdaPreview] = useState<FilledNda | null>(null);
  const [ndaError, setNdaError] = useState<string | null>(null);
  /** Statut NDA faisant autorité : lu au serveur, jamais déduit d'une case cochée. */
  const [ndaServer, setNdaServer] = useState<NdaStatusView | null>(null);

  // Câblage et terminaison vivent DANS le dossier : ils suivent export, résumé et révision.
  const cabling = dossier.cabling;
  const setCabling = useCallback(
    (update: (c: CablingConfig) => CablingConfig) =>
      setDossier((d) => ({
        ...d,
        cabling: update(d.cabling),
        updatedAt: new Date().toISOString(),
      })),
    [],
  );
  const termination = dossier.termination;
  const [connectorDraft, setConnectorDraft] = useState<ConnectorDraft>(EMPTY_CONNECTOR_DRAFT);
  const [connectorError, setConnectorError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [backend, setBackend] = useState<LeadBackendStatus | null>(null);
  // Dossier serveur : créé à la première transmission réussie, puis réutilisé.
  const [serverDossierId, setServerDossierId] = useState<string | null>(null);
  const [serverRevision, setServerRevision] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);
  const [extraConstraints, setExtraConstraints] = useState("");
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  /** État FACTUEL de la version anglaise du rapport : jamais « envoyé en anglais »
   * tant que le serveur n'a pas publié une version prête pour cette révision. */
  const [englishMessage, setEnglishMessage] = useState<string | null>(null);
  const [englishRetry, setEnglishRetry] = useState<{
    dossierId: string;
    revisionId: string;
    contentHash: string;
  } | null>(null);

  const [showWorkshop, setShowWorkshop] = useState(false);
  /** Démarrage RÉEL du projet : c'est ici, et pas au montage caché de
   * l'espace, que la langue d'origine du projet est fixée. Changer ensuite la
   * langue de l'interface ne réécrit pas rétrospectivement celle du projet. */
  const wasVisibleRef = useRef(false);
  useEffect(() => {
    const becameVisible = visible && !wasVisibleRef.current;
    wasVisibleRef.current = visible;
    if (!visible) return;
    if (localeCapturedRef.current) {
      // Projet déjà démarré ou repris : le revoir depuis l'accueil rétablit SA
      // langue d'origine, même si la langue du site a changé entre-temps.
      if (becameVisible && dossierLocaleRef.current !== getLocale())
        setLocale(dossierLocaleRef.current);
      return;
    }
    localeCapturedRef.current = true;
    const startLocale = getLocale();
    setDossier((d) => {
      if (d.sourceLocale === startLocale) return d;
      // Le titre par défaut, écrit au montage caché, suit la langue de départ ;
      // un titre déjà saisi par l'utilisateur n'est jamais réécrit.
      const untouched = d.title === t("Nouveau projet d'exploration", d.sourceLocale);
      return {
        ...d,
        sourceLocale: startLocale,
        title: untouched ? t("Nouveau projet d'exploration", startLocale) : d.title,
      };
    });
  }, [visible]);



  /** Panneau contextuel : le projet reste visible derrière, rien n'est démonté. */
  const [panel, setPanel] = useState<
    null | "atelier" | "candidats" | "cablage" | "documents" | "espace"
  >(null);
  /** Une fois l'atelier ouvert, il reste monté (masqué) : un réglage 3D non
   * enregistré n'est jamais perdu en fermant le panneau. */
  const [workshopMounted, setWorkshopMounted] = useState(false);
  const [openDoc, setOpenDoc] = useState<ViewerDocument | null>(null);
  const [workshop, setWorkshop] = useState<WorkshopConfig | null>(null);
  /** Remonté à chaque chargement d'un AUTRE contenu (import, dossier serveur,
   * variante) : l'atelier est alors réellement remplacé, sans modèle fantôme. */
  const [workshopEpoch, setWorkshopEpoch] = useState(0);
  const workshopDraftRef = useRef<WorkshopConfig | null>(null);
  /** Un réglage 3D non enregistré est un vrai travail : il compte comme
   * modification, et il est signalé avant tout export ou remplacement. */
  const [workshopDraftPending, setWorkshopDraftPending] = useState(false);
  const draftPendingRef = useRef(false);
  const onWorkshopDraft = useCallback((c: WorkshopConfig) => {
    workshopDraftRef.current = c;
    if (draftPendingRef.current) return; // pas de boucle de rendu
    draftPendingRef.current = true;
    setWorkshopDraftPending(true);
  }, []);

  const [volumeRaw, setVolumeRaw] = useState("");
  const [volumeError, setVolumeError] = useState<string | null>(null);
  /** Le modèle 3D reste en mémoire tant que ce partage n'est pas explicitement demandé. */
  const [shareModel, setShareModel] = useState(false);
  /** Pointage du câble dans la 3D : trajet visé et rôle du prochain point. */
  const [routingTarget, setRoutingTarget] = useState<RoutingTarget>({ kind: "base" });
  const [routingSlot, setRoutingSlot] = useState<RoutingSlot>("sensor");
  const [tab, setTab] = useState("besoin");
  /** Divulgation progressive : les onglets détaillés restent accessibles à la demande. */
  const [showAdvanced, setShowAdvanced] = useState(false);
  /** Mode guidé : une seule question à la fois, sans rien retirer du dossier. */
  const [focusIdx, setFocusIdx] = useState(0);
  /** Ce à quoi un accord d'envoi se rattache à cet instant : dossier serveur visé,
   * révision suivante, empreinte du contenu relu et empreintes des fichiers déjà déposés.
   * Dès qu'un de ces éléments change, l'accord précédent et la relecture tombent.
   */
  const [binding, setBinding] = useState<ConsentBinding | null>(null);
  const [consentNotice, setConsentNotice] = useState<string | null>(null);
  /** Fichier RÉELLEMENT déposé et vérifié par le serveur, pour ce dossier et
   * cette version précise. Il est réutilisé tel quel si l'envoi doit être
   * retenté : jamais de second dépôt du même fichier.
   */
  const [preparedUpload, setPreparedUpload] = useState<{
    dossierId: string;
    revision: number;
    assetKey: string;
    file: UploadedFile;
  } | null>(null);
  /** Version d'origine d'un contenu repris, conservée à part : elle sert à
   * l'affichage, jamais de numéro de version attendu par le serveur. */
  const [reopenedFrom, setReopenedFrom] = useState<{
    dossierId: string;
    revision: number;
  } | null>(null);
  /** Verrou d'action : empêche un double clic de créer deux versions. */
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  /** Remplissage local du NDA : aperçu puis téléchargement, sans aucune transmission. */
  const prepareNdaDocument = useCallback(
    async (action: "preview" | "download") => {
      setNdaError(null);
      const missing = missingNdaFields(nda.fields);
      if (missing.length) {
        setNdaError(`Champs à compléter avant génération : ${missing.join(", ")}.`);
        return;
      }
      try {
        const filled = await fillNdaTemplate(await loadNdaTemplate(), nda.fields);
        setNdaPreview(filled);
        const result = prepareNda(nda);
        if (result.ok) setNda((n) => ({ ...n, status: "prepared" }));
        if (action === "download") {
          const blob = new Blob([filled.bytes as unknown as BlobPart], {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filled.fileName;
          a.click();
          URL.revokeObjectURL(url);
        }
      } catch (error) {
        setNdaPreview(null);
        setNdaError(error instanceof Error ? error.message : t("Génération impossible."));
      }
    },
    [nda],
  );

  /** Statut NDA appliqué à l'état local : le serveur fait autorité, pas cet écran. */
  const applyNdaStatus = useCallback((status: NdaStatusView) => {
    setNdaServer(status);
    setServerDossierId(status.dossier_id);
    setNda((n) => ({
      ...n,
      required: status.nda_required,
      status: status.nda_status,
      proof: status.proof
        ? {
            documentSha256: status.proof.document_sha256,
            verifiedAt: status.proof.verified_at,
            verifiedBy: status.proof.proof_reference,
          }
        : null,
    }));
  }, []);

  /** Crée UNIQUEMENT la fiche NDA côté Standex : aucune donnée de conception. */
  const prepareServerNda = useCallback(async () => {
    setNdaError(null);
    const gen = contextGenRef.current;
    try {
      const status = await prepareNdaOnServer(serverDossierId);
      // Réponse née d'un autre dossier : elle ne doit pas s'appliquer ici.
      if (contextGenRef.current !== gen) return;
      applyNdaStatus(status);
    } catch (error) {
      if (contextGenRef.current !== gen) return;
      setNdaError(error instanceof Error ? error.message : t("La préparation du NDA n'a pas abouti."));
    }
  }, [applyNdaStatus, serverDossierId]);

  const refreshNdaStatus = useCallback(async () => {
    if (!serverDossierId) return;
    setNdaError(null);
    const gen = contextGenRef.current;
    try {
      const status = await fetchNdaStatus(serverDossierId);
      if (contextGenRef.current !== gen) return;
      applyNdaStatus(status);
    } catch (error) {
      if (contextGenRef.current !== gen) return;
      setNdaError(error instanceof Error ? error.message : t("Statut NDA indisponible."));
    }
  }, [applyNdaStatus, serverDossierId]);

  // Tant que cet espace est monté, la télémétrie est réduite à un code anonyme.
  useEffect(() => openPrivateErrorScope(), []);

  // Un SEUL espace : « Mon espace » de l'accueil ouvre ce panneau-ci, avec les
  // mêmes états, la même session et la même liste de projets.
  useEffect(() => {
    if (accountRequest > 0) setPanel("espace");
  }, [accountRequest]);

  useEffect(() => {
    checkLeadBackend()
      .then(setBackend)
      .catch(() => setBackend(null));
  }, []);

  // Le statut de liaison doit suivre la connexion : sans cela, un client qui vient
  // de se connecter continue de voir « connectez-vous ».
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange(() => {
      checkLeadBackend()
        .then(setBackend)
        .catch(() => setBackend(null));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Un accord d'envoi ne vaut que pour le contenu exact qui a été relu.
  useEffect(() => {
    let alive = true;
    submissionBinding({
      dossier,
      nda,
      consents: [],
      reviewAcknowledged: false,
      additionalConstraints: extraConstraints,
      serverDossierId,
      serverRevision: serverRevision + 1,
    })
      .then((next) => {
        if (!alive) return;
        setBinding((previous) => (previous && sameBinding(previous, next) ? previous : next));
        setPrivacy((p) => {
          const pruned = pruneStaleConsents(p, next);
          if (pruned !== p) {
            setAcknowledged(false);
            setConsentNotice(
              t("Le contenu, le dossier visé ou les fichiers ont changé : relisez le résumé et confirmez à nouveau votre accord d'envoi."),
            );
          }
          return pruned;
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [dossier, extraConstraints, serverDossierId, serverRevision, nda]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const candidates = useMemo(
    () => evaluateCandidates({ mounting: dossier.mounting, envelope: dossier.envelope }),
    [dossier.mounting, dossier.envelope],
  );
  // Le câble n'est montré sur les vignettes que s'il existe réellement un tracé.
  const candidatesCabled =
    cabling.sensorEndpoint !== null ||
    cabling.connectionEndpoint !== null ||
    cabling.waypoints.length > 0;
  const estimate = useMemo(() => estimateCableLength(cabling), [cabling]);
  const lengthVerdict = useMemo(
    () =>
      compareStandardLengths(
        dossier.selectedSensorId ?? "",
        estimate.requiredMm,
        cabling.surplusHousingMm,
      ),
    [dossier.selectedSensorId, estimate.requiredMm, cabling.surplusHousingMm],
  );
  const ndaOk = ndaAllowsConfidentialTransfer(nda);

  // Le trajet visé retombe sur le trajet de référence si l'état déclaré a disparu.
  const activeTarget: RoutingTarget = useMemo(
    () =>
      routingTarget.kind === "state" &&
      !cabling.declaredMotionStates.some((s) => s.id === routingTarget.stateId)
        ? { kind: "base" }
        : routingTarget,
    [routingTarget, cabling.declaredMotionStates],
  );
  const activeTargetLabel =
    activeTarget.kind === "base"
      ? t("Trajet de référence")
      : `État : ${cabling.declaredMotionStates.find((s) => s.id === activeTarget.stateId)?.label ?? activeTarget.stateId}`;
  const activePoints = useMemo(() => routingPoints(cabling, activeTarget), [cabling, activeTarget]);
  const cableRouting = useMemo(
    () => ({
      slot: routingSlot,
      setSlot: setRoutingSlot,
      points: activePoints as [number, number, number][],
      targetLabel: activeTargetLabel,
      onPick: (point: [number, number, number], cycleT: number) =>
        setCabling((c) =>
          applyRoutingPick(c, activeTarget, routingSlot, point, {
            cycleT,
            label: `Pose relevée à ${(cycleT * 100).toFixed(0)} % du cycle`,
          }),
        ),
      onUndo: () => setCabling((c) => undoRoutingPick(c, activeTarget)),
      onReset: () => setCabling((c) => resetRouting(c, activeTarget)),
      lengthLabel:
        estimate.requiredMm === null
          ? t("Longueur mesurée : inconnue tant que le trajet est incomplet (inconnu n'est pas zéro).")
          : `Longueur mesurée du tracé : ${estimate.requiredMm.toFixed(0)} mm. Aucune validation d'ingénierie n'en découle.`,
    }),
    [routingSlot, activePoints, activeTargetLabel, activeTarget, estimate.requiredMm, setCabling],
  );

  /** Remplacer un travail en cours exige un choix explicite de l'utilisateur. */
  const confirmReplaceWork = useCallback(
    (action: string) =>
      typeof window === "undefined" ||
      window.confirm(
        `Le projet ouvert ici n'est enregistré nulle part. Exportez-le d'abord si vous voulez le garder.\n\nRemplacer le travail en cours pour ${action} ?`,
      ),
    [],
  );

  /** Empreinte du travail courant, hors horodatage : elle sert uniquement à
   * savoir s'il y a quelque chose à perdre avant un remplacement. */
  const fingerprint = (d: DesignDossier) => JSON.stringify({ ...d, updatedAt: "" });
  const dossierRef = useRef(dossier);
  dossierRef.current = dossier;
  const connectorDraftRef = useRef(connectorDraft);
  connectorDraftRef.current = connectorDraft;
  const extraConstraintsRef = useRef(extraConstraints);
  extraConstraintsRef.current = extraConstraints;
  const ndaDraftRef = useRef(nda);
  ndaDraftRef.current = nda;
  const importRequestRef = useRef(0);
  const baselineRef = useRef<string | null>(null);
  if (baselineRef.current === null) baselineRef.current = fingerprint(dossier);

  /** Y a-t-il un travail réellement modifié à protéger ? */
  const workDirty = useCallback(() => {
    if (draftPendingRef.current) return true;
    if (
      ndaDraftRef.current.required !== INITIAL_NDA.required ||
      JSON.stringify(ndaDraftRef.current.fields) !== JSON.stringify(INITIAL_NDA.fields)
    )
      return true;
    if (extraConstraintsRef.current.trim() !== "") return true;
    if (JSON.stringify(connectorDraftRef.current) !== JSON.stringify(EMPTY_CONNECTOR_DRAFT))
      return true;
    return fingerprint(dossierRef.current) !== baselineRef.current;
  }, []);

  /** Garde unique de TOUS les chemins destructifs : elle ne demande rien quand
   * il n'y a rien à perdre, et « Annuler » ne modifie aucun état. */
  const guardReplace = useCallback(
    (action: string) => !workDirty() || confirmReplaceWork(action),
    [confirmReplaceWork, workDirty],
  );

  const loadWorkshop = useCallback((c: WorkshopConfig | null) => {
    setWorkshop(c);
    setWorkshopEpoch((e) => e + 1);
    // Un contenu remplacé ne doit JAMAIS laisser derrière lui l'ancien
    // brouillon 3D : il serait repris à tort dans le nouveau dossier.
    workshopDraftRef.current = null;
    draftPendingRef.current = false;
    setWorkshopDraftPending(false);
  }, []);

  /** Adopte un nouveau contenu comme référence : plus rien n'est « modifié ».
   * Ouvrir ou reprendre un projet rétablit AUSSI la langue dans laquelle il a
   * démarré : les textes déjà saisis restent lisibles dans leur contexte. */
  const adoptBaseline = useCallback((d: DesignDossier) => {
    baselineRef.current = fingerprint(d);
    localeCapturedRef.current = true;
    if (d.sourceLocale !== getLocale()) setLocale(d.sourceLocale);
  }, []);


  const exportDossier = useCallback(() => {
    const blob = new Blob([JSON.stringify(buildDossierExport(dossier), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dossier-conception-r${dossier.revision}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [dossier]);

  const importDossier = useCallback(
    async (file: File | undefined) => {
      if (!file || busyRef.current) return;
      // Garde unique : elle protège TOUS les imports, d'où qu'ils partent.
      if (!guardReplace(t("reprendre ce fichier"))) return;
      const request = ++importRequestRef.current;
      const context = contextGenRef.current;
      const beforeRead = fingerprint(dossierRef.current);
      setImportMessage(null);
      try {
        const source = await file.text();
        if (
          request !== importRequestRef.current ||
          context !== contextGenRef.current ||
          busyRef.current
        )
          return;
        if (beforeRead !== fingerprint(dossierRef.current)) {
          setImportMessage(
            t("Votre projet a changé pendant la lecture : relancez l'import pour remplacer ce nouveau contenu."),
          );
          return;
        }
        const parsed = parseDossierExport(JSON.parse(source));
        if (!parsed.ok) {
          setImportMessage(parsed.reason);
          return;
        }
        // Un fichier importé n'est RATTACHÉ à aucun dossier Standex : tout le
        // contexte serveur, l'atelier, le NDA et les accords repartent de zéro.
        setDossier(parsed.dossier);
        adoptBaseline(parsed.dossier);
        loadWorkshop(parsed.dossier.workshop);
        setConnectorDraft(EMPTY_CONNECTOR_DRAFT);
        setConnectorError(null);
        resetServerContext(null, 0);
        setImportMessage(
          [
            ...parsed.notices,
            t("Contenu importé dans un dossier local : aucun dossier Standex n'y est rattaché, et l'accord de confidentialité comme l'accord d'envoi sont à refaire."),
          ].join(" "),
        );
        return true;
      } catch {
        if (request !== importRequestRef.current || context !== contextGenRef.current) return;
        setImportMessage(t("Ce fichier n'a pas pu être lu."));
      }
      return false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [guardReplace, adoptBaseline, loadWorkshop],
  );

  /** Numéro du contexte en cours. Toute réponse asynchrone née d'un contexte
   * précédent est ignorée : sans cela, le résultat du dossier A pourrait
   * s'écrire dans le dossier B ouvert entre-temps.
   */
  const contextGenRef = useRef(0);
  /** Numéro de la dernière lecture de document demandée : une lecture tardive
   * n'ouvre jamais un fichier dans un autre dossier. */
  const docGenRef = useRef(0);

  /** Remise à zéro ATOMIQUE du contexte serveur.
   * Tout ce qui dépend d'un dossier serveur précis tombe en même temps : accord
   * d'envoi, relecture, statut NDA, fichier déjà préparé, contraintes ajoutées
   * et partage du modèle. Sans cela, un accord donné pour le dossier A pourrait
   * servir au dossier B.
   */
  const resetServerContext = useCallback((dossierId: string | null, revision: number) => {
    contextGenRef.current += 1;
    importRequestRef.current += 1;
    docGenRef.current += 1;
    setServerDossierId(dossierId);
    setServerRevision(revision);
    setNdaServer(null);
    setNda(INITIAL_NDA);
    setPrivacy((p) => ({ ...p, consents: [] }));
    setAcknowledged(false);
    setPreparedUpload(null);
    setBinding(null);
    setConsentNotice(null);
    setExtraConstraints("");
    setShareModel(false);
    setReopenedFrom(null);
    // Un document ouvert appartient au dossier d'où il vient : il ne doit pas
    // rester affiché dans un dossier différent.
    setOpenDoc(null);
    setNdaPreview(null);
    return contextGenRef.current;
  }, []);

  /** Ouvre un fichier RÉELLEMENT transmis, pour une version précise, via
   * l'accès authentifié existant. Rien n'est inventé : sans chemin valable ou
   * sans droit de lecture, l'erreur est affichée telle quelle. */
  const openTransferredFile = useCallback(
    async (input: { path: string; name: string; dossierId: string; revision: number }) => {
      const path = input.path.trim();
      if (!path) {
        setSubmitMessage(t("Ce fichier n'a pas de chemin de stockage : il ne peut pas être relu."));
        return;
      }
      const gen = ++docGenRef.current;
      const ctx = contextGenRef.current;
      setPanel("documents");
      setOpenDoc(null);
      try {
        const bytes = await downloadDesignFile(path);
        if (gen !== docGenRef.current || ctx !== contextGenRef.current) return;
        setOpenDoc(
          documentFromBytes(input.name, bytes, `${input.dossierId}:r${input.revision}:${path}`),
        );
      } catch (error) {
        if (gen !== docGenRef.current || ctx !== contextGenRef.current) return;
        setSubmitMessage(
          error instanceof Error ? error.message : t("Ce fichier n'a pas pu être relu."),
        );
      }
    },
    [],
  );

  /** Étape 1 : préparer le partage du modèle 3D.
   * Le dépôt a lieu ICI, AVANT la relecture et l'accord, une seule fois. Le
   * dossier contient ensuite le fichier réellement déposé, donc l'accord porte
   * sur ce qui partira vraiment — c'est ce qui supprime la boucle « accord
   * périmé » constatée quand le dépôt avait lieu après la case à cocher.
   */
  const prepareShare = useCallback(async () => {
    if (busyRef.current) return;
    if (!dossier.workshopAsset) {
      setSubmitMessage(t("Aucun modèle 3D à partager dans cet onglet."));
      return;
    }
    if (!backend?.ready) {
      setSubmitMessage(
        backend?.message ??
          t("La liaison avec l'équipe Standex n'est pas active : rien n'a été déposé."),
      );
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setSubmitMessage(null);
    // Contexte visé au moment du dépôt : si le dossier change entre-temps,
    // ce résultat ne doit surtout pas s'écrire dans le nouveau dossier.
    const gen = contextGenRef.current;
    const stale = () => contextGenRef.current !== gen;
    try {
      const bytes = memoryAssetBytes(dossier.workshopAsset.assetKey);
      if (!bytes) {
        setSubmitMessage(
          t("Le fichier 3D n'est plus en mémoire de cet onglet : réimportez-le avant de le partager."),
        );
        return;
      }
      let dossierId = serverDossierId;
      if (!dossierId) {
        dossierId = await createServerDossier(
          nda.required ? t("Préparation d'un accord de confidentialité") : dossier.title,
          nda.required,
        );
        if (stale()) return;
        setServerDossierId(dossierId);
      }
      const uploaded = await uploadDesignFile(
        dossierId,
        { name: dossier.workshopAsset.fileName, data: new Uint8Array(bytes) },
        "design_model",
        {
          kind: "supabase_files",
          statement: t("Partage du modèle 3D avec l'équipe Standex en charge du dossier."),
          accepted_at: new Date().toISOString(),
          content_ref: dossier.workshopAsset.fileName,
          revision: serverRevision + 1,
        },
      );
      if (stale()) return;
      if (!uploaded.verified) {
        // Un fichier non relu par le serveur ne peut PAS être annoncé : il
        // resterait refusé à la soumission. On le dit franchement ici.
        setPreparedUpload(null);
        setSubmitMessage(
          `Le fichier a été déposé mais le serveur n'a pas pu en vérifier le contenu (${
            uploaded.verificationError ?? t("raison inconnue")
          }). Il n'est donc pas joint à votre envoi.`,
        );
        return;
      }
      setPreparedUpload({
        dossierId,
        revision: serverRevision + 1,
        assetKey: dossier.workshopAsset.assetKey,
        file: uploaded,
      });
      setDossier((d) => ({
        ...d,
        attachments: [
          ...d.attachments.filter((a) => a.fileName !== uploaded.fileName),
          {
            id: uploaded.path,
            fileName: uploaded.fileName,
            bytes: uploaded.bytes,
            transferred: true,
            storagePath: uploaded.path,
            sha256: uploaded.sha256,
            mimeType: uploaded.mimeType,
          },
        ],
        updatedAt: new Date().toISOString(),
      }));
      setSubmitMessage(
        t("Modèle 3D déposé et vérifié par le serveur. Relisez le résumé, confirmez votre accord, puis envoyez : le fichier ne sera pas déposé une seconde fois."),
      );
    } catch (error) {
      setSubmitMessage(
        error instanceof Error ? error.message : t("Le fichier 3D n'a pas pu être partagé."),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [
    backend,
    dossier.workshopAsset,
    dossier.title,
    nda.required,
    serverDossierId,
    serverRevision,
  ]);

  /** Étape 2 : envoi. Aucun dépôt ici — ce qui est joint a déjà été déposé,
   * vérifié et relu. Le verrou empêche un double clic de créer deux versions.
   */
  const onSubmit = useCallback(async () => {
    if (busyRef.current) return;
    if (shareModel && dossier.workshopAsset && !preparedUpload) {
      setSubmitMessage(
        t("Préparez d'abord le partage du modèle 3D : il doit être déposé et vérifié avant votre accord d'envoi."),
      );
      return;
    }
    if (
      preparedUpload &&
      (preparedUpload.dossierId !== serverDossierId ||
        preparedUpload.revision !== serverRevision + 1)
    ) {
      setPreparedUpload(null);
      setSubmitMessage(
        t("Le dossier ou la version visée a changé depuis le dépôt du fichier : préparez à nouveau le partage."),
      );
      return;
    }
    const input = {
      dossier,
      nda,
      consents: privacy.consents,
      reviewAcknowledged: acknowledged,
      additionalConstraints: extraConstraints,
      serverDossierId,
      serverRevision: serverRevision + 1,
    };
    busyRef.current = true;
    setBusy(true);
    try {
      const check = await checkSubmission(input);
      if (!check.ok) {
        setSubmitMessage(check.problems.join(" "));
        return;
      }
      // Envoi réel dès que l'espace serveur est disponible et la session ouverte ;
      // sinon rien n'est transmis et rien n'est simulé.
      const outcome = await submit(
        input,
        createSupabaseSubmissionBackend({
          schemaReady: Boolean(backend?.schemaReady),
          capabilities: backend?.capabilities ?? {
            authenticated: false,
            userId: null,
            role: null,
            assignedDossiers: [],
          },
          dossierId: serverDossierId,
          expectedRevision: serverRevision,
          ndaRequired: nda.required,
          onDossierCreated: setServerDossierId,
        }),
      );
      if (outcome.status === "submitted") {
        setServerRevision((r) => r + 1);
        setPreparedUpload(null);
        setSubmitMessage(
          t("Dossier transmis à la revue Standex. Vous serez informé dès qu'un retour est publié."),
        );
        // Version anglaise : demandée UNIQUEMENT si l'accord de traduction a été
        // donné pour ce contenu exact. Sans accord, rien n'est transmis et on le dit.
        const bound = await submissionBinding(input);
        const target = {
          dossierId: serverDossierId ?? "",
          revisionId: outcome.submissionId,
          contentHash: bound.contentHash,
        };
        if (hasBoundConsent(privacy, "ai_assistant", bound) && target.dossierId) {
          setEnglishRetry(target);
          await runEnglishReport(target);
        } else {
          setEnglishRetry(null);
          setEnglishMessage(
            t("Version anglaise non demandée : votre accord de traduction n'a pas été donné pour cette version. Le dossier d'origine est bien arrivé."),
          );
        }
      } else {
        setSubmitMessage(outcome.reason);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [
    dossier,
    nda,
    privacy,
    acknowledged,
    extraConstraints,
    backend,
    serverDossierId,
    serverRevision,
    shareModel,
    preparedUpload,
    runEnglishReport,
  ]);


  const volume = dossier.business.annualVolume;
  // La désignation standard/custom vient du retour R&D publié, jamais de cet écran.
  const sampleRoute = routeSamples({ volume, isCustom: false });

  const embedded = chrome === "embedded";
  const stepIndex = tab === "besoin" ? 0 : tab === "revue" ? 2 : 1;
  const steps = [
    { id: "besoin", label: t("Mon besoin"), hint: t("Ce que vous voulez détecter") },
    { id: "montage", label: t("Mon montage"), hint: t("Où le capteur se place") },
    { id: "revue", label: t("Avec Standex"), hint: t("Faire relire votre projet") },
  ];

  const question = GUIDED_QUESTIONS[focusIdx] ?? GUIDED_QUESTIONS[0]!;
  const guidedReq = dossier.requirements.find((r) => r.key === question.key) ?? null;
  const lastQuestion = focusIdx >= GUIDED_QUESTIONS.length - 1;

  const besoinSection = (
    <div className="space-y-5">
      {showAdvanced ? (
        <>
          <p className="text-base text-muted-foreground">{t(LOCAL_ASSISTANT_LABEL)}</p>
          {dossier.requirements.map((r) => (
            <div
              key={r.key}
              className={`panel-block-lg ${r.state === "confirmed" ? "requirement-confirmed" : ""}`}
            >
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <Label htmlFor={`req-${r.key}`} className="t-title-s">
                  {t(r.label)}
                </Label>
                <Badge
                  variant={
                    r.state === "confirmed"
                      ? "default"
                      : r.state === "hypothesis"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {stateBadge(r.state)}
                </Badge>
                <span className="t-caption">{t("source :")} {r.source}</span>
              </div>
              <Textarea
                id={`req-${r.key}`}
                rows={2}
                className="text-base"
                value={r.value}
                placeholder={t("Décrivez ce point avec vos mots ; laissez vide s'il est inconnu.")}
                onChange={(e) =>
                  setDossier((d) =>
                    proposeRequirement(d, r.key, { value: e.target.value, source: "user" }),
                  )
                }
              />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-h-11 text-base"
                  disabled={!r.value.trim() || r.state === "confirmed"}
                  onClick={() => setDossier((d) => confirmRequirement(d, r.key))}
                >
                  {t("Confirmer cette exigence")}
                </Button>
                {r.note ? <span className="t-caption">{r.note}</span> : null}
              </div>
            </div>
          ))}
        </>
      ) : (
        <div
          key={question.key}
          className="step-enter mx-auto max-w-[46rem] rounded-[var(--r-xl)] bg-[var(--surface)] p-10 shadow-[var(--e-2)] sm:p-14"
        >
          <div
            className="h-[3px] w-full overflow-hidden rounded-[var(--r-pill)] bg-[var(--surface-sunken)]"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-[var(--r-pill)] bg-[var(--primary)] transition-[width] duration-[var(--d-page)] ease-[var(--ease-out)]"
              style={{ width: `${((focusIdx + 1) / GUIDED_QUESTIONS.length) * 100}%` }}
            />
          </div>
          <p className="t-label mt-5">
            {msg("Question {0} sur {1}", [focusIdx + 1, GUIDED_QUESTIONS.length])}
          </p>
          <h2 className="t-display-m mt-3">{t(question.prompt)}</h2>
          <p className="t-caption mt-4 max-w-[44ch]">{msg("Par exemple : {0}", [t(question.example)])}</p>
          <Label htmlFor={`guide-${question.key}`} className="sr-only">
            {t(question.prompt)}
          </Label>
          <Textarea
            id={`guide-${question.key}`}
            rows={4}
            className="mt-6 min-h-[8.5rem] w-full px-5 py-[1.125rem] text-lg leading-[1.6]"
            value={guidedReq?.value ?? ""}
            placeholder={t(question.placeholder)}
            onChange={(e) =>
              setDossier((d) =>
                proposeRequirement(d, question.key, { value: e.target.value, source: "user" }),
              )
            }
          />

          {guidedReq && guidedReq.state === "hypothesis" && guidedReq.value.trim() ? (
            <div className="relative mt-5 overflow-hidden rounded-[var(--r-md)] bg-[var(--warning-soft)] p-4 pl-5 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--warning)]">
              <p className="text-base">
                {t("Cette réponse vient d'une reprise ou d'une déduction. Confirmez-la si elle est juste.")}
              </p>
              <Button
                variant="outline"
                className="mt-3 min-h-11 text-base"
                onClick={() => setDossier((d) => confirmRequirement(d, question.key))}
              >
                {t("Oui, c'est bien cela")}
              </Button>
            </div>
          ) : null}

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              className="min-h-12 text-base"
              disabled={focusIdx === 0}
              onClick={() => setFocusIdx((i) => Math.max(0, i - 1))}
            >
              {t("Question précédente")}
            </Button>
            <Button
              variant="ghost"
              className="ml-auto min-h-12 text-base text-[var(--muted-foreground)]"
              onClick={() => {
                // Ne rien effacer : passer sans réponse laisse simplement ce point inconnu.
                if (!lastQuestion) setFocusIdx((i) => i + 1);
                else setTab("montage");
              }}
            >
              {t("Je ne sais pas encore")}
            </Button>
            <Button
              size="lg"
              className="min-h-12 px-6 text-base"
              onClick={() => {
                if (!lastQuestion) setFocusIdx((i) => i + 1);
                else setTab("montage");
              }}
            >
              {lastQuestion ? t("Passer à mon montage") : t("Continuer")}
            </Button>
          </div>

          <details className="project-answer-details mt-7">
            <summary className="t-caption flex min-h-11 cursor-pointer list-none items-center gap-2 py-2">
              {t("Détails de cette réponse")}
              <span className="project-answer-chevron" aria-hidden="true">
                ↓
              </span>
            </summary>
            <div className="mt-2 ml-4 flex flex-wrap items-center gap-3">
              <Badge variant="outline">{stateBadge(guidedReq?.state ?? "unknown")}</Badge>
              <span className="text-base text-muted-foreground">
                {t("intitulé technique :")} {guidedReq?.label} {t("· source :")} {guidedReq?.source}
              </span>
              <Button
                variant="outline"
                className="min-h-11 text-base"
                disabled={!guidedReq?.value.trim() || guidedReq?.state === "confirmed"}
                onClick={() => setDossier((d) => confirmRequirement(d, question.key))}
              >
                {t("Confirmer cette réponse")}
              </Button>
            </div>
          </details>
        </div>
      )}

      <details className="rounded-xl border p-4" open={showAdvanced}>
        <summary className="min-h-11 cursor-pointer py-2 text-base font-medium">
          {t("Autre chose à nous dire ? (facultatif)")}
        </summary>
        <Label htmlFor="free-constraints" className="sr-only">
          {t("Autre chose à nous dire")}
        </Label>
        <Textarea
          id="free-constraints"
          rows={3}
          className="mt-2 text-base"
          value={dossier.freeConstraints}
          onChange={(e) => setDossier((d) => ({ ...d, freeConstraints: e.target.value }))}
        />
      </details>
    </div>
  );

  /** Champs mécaniques détaillés : identiques en mode guidé et détaillé,
   * simplement repliés tant que le client ne les demande pas. */
  const mechanicalFields = (
    <>
      <div className="panel-block">
        <Label className="t-label">{t("Choix mécanique explicite")}</Label>
        <Select
          value={dossier.mounting.kind}
          onValueChange={(kind) =>
            setDossier((d) => ({
              ...d,
              mounting:
                kind === "press_fit"
                  ? { kind: "press_fit", holeDiameterMm: 0 }
                  : kind === "other"
                    ? { kind: "other", description: "" }
                    : ({ kind } as MountingChoice),
            }))
          }
        >
          <SelectTrigger className="mt-2 w-full max-w-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="undecided">{t("Non décidé")}</SelectItem>
            <SelectItem value="pcb_smd">{t("PCB — report CMS")}</SelectItem>
            <SelectItem value="pcb_through_hole">{t("PCB — traversant")}</SelectItem>
            <SelectItem value="screw">{t("Fixation vissée")}</SelectItem>
            <SelectItem value="press_fit">{t("Emboîtement dans un trou")}</SelectItem>
            <SelectItem value="other">{t("Autre montage")}</SelectItem>
          </SelectContent>
        </Select>
        {dossier.mounting.kind === "press_fit" ? (
          <div className="mt-2 max-w-xs">
            <Label className="t-label">{t("Diamètre du trou (mm)")}</Label>
            <Input
              className="t-metric w-32 text-right"
              inputMode="decimal"
              value={dossier.mounting.holeDiameterMm || ""}
              onChange={(e) =>
                setDossier((d) => ({
                  ...d,
                  mounting: { kind: "press_fit", holeDiameterMm: num(e.target.value) ?? 0 },
                }))
              }
            />
          </div>
        ) : null}
        {dossier.mounting.kind === "other" ? (
          <Textarea
            className="mt-2"
            rows={2}
            placeholder={t("Décrivez le montage")}
            value={dossier.mounting.description}
            onChange={(e) =>
              setDossier((d) => ({
                ...d,
                mounting: { kind: "other", description: e.target.value },
              }))
            }
          />
        ) : null}
      </div>

      <div className="panel-block">
        <Label className="t-label">{t("Encombrement disponible")}</Label>
        <div className="mt-2 flex flex-wrap gap-3">
          {(["lengthMm", "widthMm", "heightMm"] as const).map((k) => (
            <div key={k} className="w-32">
              <Label className="t-label">
                {{ lengthMm: "Longueur", widthMm: "Largeur", heightMm: "Hauteur" }[k]} (mm)
              </Label>
              <Input
                className="t-metric w-32 text-right"
                inputMode="decimal"
                value={dossier.envelope[k] ?? ""}
                onChange={(e) =>
                  setDossier((d) => ({
                    ...d,
                    envelope: { ...d.envelope, [k]: num(e.target.value) },
                  }))
                }
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );

  const montageSection = (
    <div className="space-y-4">
      {showAdvanced ? null : (
        <div className="panel-block-lg">
          <h2 className="t-title-m">{t("Où le capteur se place-t-il ?")}</h2>
          <p className="t-caption mt-3">
            {t("Montrez-le en 3D si c'est plus simple, ou donnez seulement les dimensions disponibles. Rien n'est obligatoire : ce qui reste inconnu reste inconnu.")}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              className="min-h-12 px-6 text-base"
              onClick={() => {
                setWorkshopMounted(true);
                setShowWorkshop(true);
                setPanel("atelier");
              }}
            >
              {t("Placer en 3D")}
            </Button>
            <Button variant="ghost" className="min-h-12 text-base" onClick={() => setTab("besoin")}>
              {t("Revenir à mon besoin")}
            </Button>
          </div>
        </div>
      )}

      {showAdvanced ? (
        mechanicalFields
      ) : (
        <details className="panel-block">
          <summary className="t-title-s flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2">
            {t("Préciser la mécanique et la place disponible (facultatif)")}
            <span className="technical-details-chevron" aria-hidden="true">
              ⌄
            </span>
          </summary>
          <div className="mt-3 space-y-4">{mechanicalFields}</div>
        </details>
      )}

      <div className="panel-block">
        <div className="flex flex-wrap items-center gap-3">
          <Label className="text-base font-medium">{t("Atelier 3D (facultatif)")}</Label>
          {/* En mode guidé, « Placer en 3D » ci-dessus ouvre déjà l'atelier :
                    pas de second bouton pour la même action. */}
          {showAdvanced ? (
            <Button
              variant="outline"
              className="min-h-11 text-base"
              onClick={() => {
                setWorkshopMounted(true);
                setShowWorkshop(true);
                setPanel("atelier");
              }}
            >
              {t("Ouvrir l'atelier magnétique")}
            </Button>
          ) : null}
          <span className="t-caption">
            {t("Formats acceptés : GLB autonome uniquement. Les fichiers STEP/IGES ne sont pas lus. Unités, échelle et pièce mobile restent à confirmer par vous. Vos réglages restent en mémoire même si vous refermez le panneau.")}
          </span>
        </div>
      </div>
    </div>
  );

  const candidatsSection = (
    <div className="space-y-4">
      {showAdvanced ? null : (
        <Button variant="outline" className="min-h-11 text-base" onClick={() => setTab("montage")}>
          {t("Revenir à mon montage")}
        </Button>
      )}
      <p className="t-caption">{t(CANDIDATE_DISCLAIMER)}</p>
      {dossier.selectedSensorId && !dossier.sensorSyncConfirmed ? (
        <div className="notice notice-warning">
          <p>
            {t("La gamme suivie et le capteur affiché en 3D sont différents. Rien n'est changé sans votre accord.")}
          </p>
          <Button
            size="sm"
            className="mt-2"
            onClick={() =>
              setDossier((d) => {
                const next = d.selectedSensorId;
                if (!next) return d;
                return {
                  ...d,
                  workshopSensorId: next,
                  sensorSyncConfirmed: true,
                  workshop: d.workshop ? { ...d.workshop, sensorId: next } : d.workshop,
                };
              })
            }
          >
            {t("Aligner l'atelier 3D sur la gamme suivie")}
          </Button>
        </div>
      ) : null}
      <div className="space-y-3">
        {candidates.map((c) => (
          <div
            key={c.id}
            className={`surface-interactive p-5 ${
              dossier.selectedSensorId === c.id ? "candidate-selected" : ""
            } ${c.status === "excluded" ? "candidate-excluded" : ""}`}
          >
            <div className="grid gap-4 sm:grid-cols-[13rem_1fr]">
              <div>
                <CandidateThumbnail sensorId={c.id} cabled={candidatesCabled} />
                <p className="t-caption mt-2">
                  {sensorById(c.id).sourceFile
                    ? t("Aperçu 3D d'après les cotes de la fiche technique — ce n'est pas un modèle CAO de fabrication.")
                    : t("Schéma pédagogique proportionnel — ni modèle CAO ni cote validée.")}
                </p>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Les références (MK03…) traversent t() inchangées ; seul un
                      libellé descriptif comme « Sur mesure » est traduit. */}
                  <span className="t-title-s">{t(c.name)}</span>

                  <Badge
                    variant={
                      c.status === "kept"
                        ? "default"
                        : c.status === "to_verify"
                          ? "warning"
                          : "secondary"
                    }
                  >
                    {c.status === "kept"
                      ? t("Retenu à ce stade")
                      : c.status === "to_verify"
                        ? t("À vérifier")
                        : t("Écarté")}
                  </Badge>
                  <span className="t-metric rounded-[var(--r-pill)] bg-[var(--surface-sunken)] px-2.5 py-1 t-caption">
                    {c.size}
                  </span>
                  {c.status !== "excluded" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="sm:ml-auto"
                      onClick={() =>
                        setDossier((d) => ({
                          ...d,
                          selectedSensorId: c.id,
                          sensorSyncConfirmed: d.workshopSensorId === c.id,
                        }))
                      }
                    >
                      {c.id === CUSTOM_SENSOR_ID ? t("Partir sur du sur mesure") : t("Suivre cette gamme")}
                    </Button>
                  ) : null}
                </div>
                <ul className="mt-3 space-y-1.5">
                  {c.reasons.map((r, i) => (
                    <li key={i} className="t-caption flex gap-2 leading-[1.6]">
                      <span
                        className="mt-[0.62em] h-1 w-1 shrink-0 rounded-full bg-[var(--standex-blue-50)]"
                        aria-hidden="true"
                      />
                      <span>{t(r)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const cablageSection = (
    <div className="space-y-4">
      {showAdvanced ? null : (
        <Button variant="outline" className="min-h-11 text-base" onClick={() => setTab("montage")}>
          {t("Revenir à mon montage")}
        </Button>
      )}
      <div className="panel-block" data-testid="routing-target-panel">
        <Label className="t-label">{t("Tracé dans la 3D (facultatif)")}</Label>
        <p className="t-caption mt-1">
          {t("Ouvrez l'atelier 3D, activez « Pointer dans la 3D », puis cliquez la sortie de câble, les passages et le point de connexion sur les surfaces réellement affichées. Sans modèle 3D, la saisie numérique ci-dessous reste la voie exacte : une valeur inconnue reste inconnue, elle ne vaut pas zéro.")}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={activeTarget.kind === "base" ? "default" : "outline"}
            onClick={() => setRoutingTarget({ kind: "base" })}
          >
            {t("Trajet de référence")}
          </Button>
          {cabling.declaredMotionStates.map((st) => (
            <Button
              key={st.id}
              size="sm"
              variant={
                activeTarget.kind === "state" && activeTarget.stateId === st.id
                  ? "default"
                  : "outline"
              }
              onClick={() => setRoutingTarget({ kind: "state", stateId: st.id })}
            >
              {st.label || st.id}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setShowWorkshop(true);
              setTab("montage");
            }}
          >
            {t("Ouvrir l'atelier 3D")}
          </Button>
        </div>
        <p className="t-caption t-metric mt-2">
          {t("Trajet visé :")} {activeTargetLabel} · {activePoints.length} {t("point(s) ·")}{" "}
          {cableRouting.lengthLabel}
        </p>
        {activeTarget.kind === "state" ? (
          <p className="t-caption">
            {t("Chaque état déclaré a son propre trajet complet et sa pose de relevé. Les états non relevés ne sont jamais présentés comme couverts.")}
          </p>
        ) : null}
      </div>

      <div className="panel-block grid gap-3 md:grid-cols-2">
        {pointFields(t("Point capteur"), cabling.sensorEndpoint, (p) =>
          setCabling((c) => ({ ...c, sensorEndpoint: p })),
        )}
        {pointFields(t("Point de connexion"), cabling.connectionEndpoint, (p) =>
          setCabling((c) => ({ ...c, connectionEndpoint: p })),
        )}
      </div>
      <div className="panel-block">
        <div className="flex items-center justify-between">
          <Label className="t-label">{t("Waypoints du trajet")}</Label>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCabling((c) => ({ ...c, waypoints: [...c.waypoints, [0, 0, 0]] }))}
          >
            {t("Ajouter un point")}
          </Button>
        </div>
        <div className="mt-2 space-y-2">
          {cabling.waypoints.map((w, index) => (
            <div key={index} className="flex items-end gap-2">
              {pointFields(`Point ${index + 1}`, w, (p) =>
                setCabling((c) => ({
                  ...c,
                  // Un point effacé rend le trajet incomplet : il n'est jamais remplacé par 0,0,0.
                  waypoints: p
                    ? c.waypoints.map((q, i) => (i === index ? p : q))
                    : c.waypoints.filter((_, i) => i !== index),
                })),
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setCabling((c) => ({
                    ...c,
                    waypoints: c.waypoints.filter((_, i) => i !== index),
                  }))
                }
              >
                {t("Retirer")}
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* États de mouvement : le trajet doit être couvert pour chaque état. */}
      <div className="panel-block">
        <div className="flex items-center justify-between">
          <Label className="t-label">{t("États de mouvement")}</Label>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setCabling((c) => ({
                ...c,
                declaredMotionStates: [
                  ...c.declaredMotionStates,
                  {
                    id: `etat-${c.declaredMotionStates.length + 1}-${Date.now()}`,
                    label: `État ${c.declaredMotionStates.length + 1}`,
                  },
                ],
                motionCoverageConfirmed: false,
              }))
            }
          >
            {t("Ajouter un état")}
          </Button>
        </div>
        <div className="mt-2 space-y-2">
          {cabling.declaredMotionStates.map((st) => {
            const covered = !uncoveredMotionStates(cabling).some((u) => u.id === st.id);
            return (
              <div key={st.id} className="flex flex-wrap items-center gap-2">
                <Input
                  className="max-w-xs"
                  value={st.label}
                  onChange={(e) =>
                    setCabling((c) => ({
                      ...c,
                      declaredMotionStates: c.declaredMotionStates.map((m) =>
                        m.id === st.id ? { ...m, label: e.target.value } : m,
                      ),
                    }))
                  }
                />
                <span
                  className={
                    covered ? "t-caption text-[var(--success)]" : "t-caption text-[var(--warning)]"
                  }
                >
                  {covered ? t("trajet renseigné") : t("trajet manquant pour cet état")}
                </span>
                {!covered ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setCabling((c) => ({
                        ...c,
                        statePaths: [
                          ...c.statePaths,
                          {
                            stateId: st.id,
                            label: st.label,
                            points: [
                              ...(c.sensorEndpoint ? [c.sensorEndpoint] : []),
                              ...c.waypoints,
                              ...(c.connectionEndpoint ? [c.connectionEndpoint] : []),
                            ],
                          },
                        ],
                        motionCoverageConfirmed: false,
                      }))
                    }
                  >
                    {t("Reprendre le trajet courant")}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setCabling((c) => ({
                      ...c,
                      declaredMotionStates: c.declaredMotionStates.filter((m) => m.id !== st.id),
                      statePaths: c.statePaths.filter((sp) => sp.stateId !== st.id),
                      motionCoverageConfirmed: false,
                    }))
                  }
                >
                  {t("Retirer")}
                </Button>
              </div>
            );
          })}
          {cabling.declaredMotionStates.length === 0 ? (
            <p className="t-caption">
              {t("Aucun état déclaré : si la machine bouge, déclarez chaque position extrême.")}
            </p>
          ) : null}
        </div>
        <label className="t-caption mt-3 flex items-center gap-2">
          <input
            type="checkbox"
            checked={cabling.motionCoverageConfirmed}
            disabled={
              cabling.declaredMotionStates.length === 0 || uncoveredMotionStates(cabling).length > 0
            }
            onChange={(e) =>
              setCabling((c) => ({ ...c, motionCoverageConfirmed: e.target.checked }))
            }
          />
          {t("Je confirme que tous les états déclarés sont couverts par un trajet.")}
        </label>
      </div>

      <div className="panel-block grid gap-3 md:grid-cols-5">
        {(
          [
            ["serviceReserveMm", t("Réserve de service")],
            ["terminationMm", "Terminaison"],
            ["toleranceMm", t("Tolérance fournisseur")],
            ["surplusHousingMm", t("Surplus logeable")],
            ["minBendRadiusMm", t("Rayon de courbure mini")],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="w-32">
            <Label className="t-label">{label} (mm)</Label>
            <Input
              className="t-metric w-32 text-right"
              inputMode="decimal"
              value={cabling[key] ?? ""}
              onChange={(e) =>
                setCabling((c) => ({
                  ...c,
                  [key]:
                    key === "minBendRadiusMm"
                      ? num(e.target.value)
                      : Math.max(0, num(e.target.value) ?? 0),
                }))
              }
            />
          </div>
        ))}
      </div>
      <p className="t-caption -mt-2 px-1">
        {t("La tolérance fournisseur et le volume disponible pour loger le surplus sont deux informations différentes.")}
      </p>
      <div className="panel-block">
        <p>
          {t("Plus long trajet mesuré (polyligne) :")}{" "}
          <strong className="t-metric">
            {estimate.longestPathMm === null
              ? "inconnu"
              : `${estimate.longestPathMm.toFixed(1)} mm`}
          </strong>
        </p>
        <p>
          {t("Longueur minimale demandée, marges comprises :")}{" "}
          <strong className="t-metric">
            {estimate.requiredMm === null
              ? t("inconnue tant que le trajet n'est pas complet")
              : `${estimate.requiredMm.toFixed(1)} mm`}
          </strong>
        </p>
        <p className="t-caption">
          {t("Cette longueur n'est jamais une longueur approuvée : elle est vérifiée en revue R&D.")}
        </p>
        <ul className="notice notice-warning mt-2 list-disc pl-8">
          {estimate.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
        <Separator className="my-3" />
        <p>{lengthVerdict.message}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["standard_to_confirm", t("Longueur catalogue, à confirmer")],
              ["custom_to_confirm", t("Longueur sur mesure, à confirmer")],
              ["undecided", t("Non décidé")],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={cabling.lengthChoice === value ? "default" : "outline"}
              onClick={() => setCabling((c) => ({ ...c, lengthChoice: value }))}
            >
              {label}
            </Button>
          ))}
        </div>
        <ul className="t-caption mt-2 list-disc pl-5">
          {RANGE_CABLE_LENGTH_NOTES.map((n) => (
            <li key={n.range}>
              {n.range} : {n.lengths} {t("(source :")} {n.source})
            </li>
          ))}
        </ul>
      </div>

      <div className="panel-block">
        <Label className="t-label">{t("Terminaison")}</Label>
        <p className="mt-1 text-sm">{terminationLabel(termination)}</p>
        <ul className="t-caption mt-1 list-disc pl-5">
          {connectorSummaryLines(termination, t).map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
        <div className="mt-3">
          <Label className="t-label">{t("Boîtiers documentés par le fabricant")}</Label>
          <div className="mt-1 flex flex-wrap gap-2">
            {DOCUMENTED_HOUSINGS.map((h) => (
              <Button
                key={h.housingMpn}
                size="sm"
                variant="outline"
                onClick={() => {
                  const found = housingById(h.housingMpn);
                  if (!found) return;
                  setConnectorError(null);
                  setConnectorDraft((d) => draftFromHousing(found, d));
                  setDossier((d) => ({ ...d, termination: terminationFromHousing(found) }));
                }}
              >
                {housingLabel(h)}
              </Button>
            ))}
          </div>
          <p className="t-caption mt-1">
            {t("Quelques boîtiers documentés seulement, pas le marché entier. Boîtier, contacts à sertir et embase restent trois références distinctes ; brochage, section de fil réelle et disponibilité restent inconnus et à vérifier par la R&D.")}
          </p>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {CONNECTOR_FIELD_LABELS.map(([key, label]) => (
            <div key={key}>
              <Label className="t-label">{label}</Label>
              <Input
                value={connectorDraft[key]}
                onChange={(e) => setConnectorDraft((d) => ({ ...d, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        {connectorError ? <p className="notice notice-danger mt-2">{connectorError}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setConnectorError(null);
              setDossier((d) => ({ ...d, termination: DEFAULT_TERMINATION }));
            }}
          >
            {t("Fils nus")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const result = terminationFromDraft(connectorDraft);
              if (!result.ok) {
                setConnectorError(`Champs requis : ${result.missing.join(", ")}.`);
                return;
              }
              setConnectorError(null);
              setDossier((d) => ({ ...d, termination: result.termination }));
            }}
          >
            {t("Enregistrer en « à vérifier par R&D »")}
          </Button>
        </div>
        <p className="t-caption mt-1">
          {t("Aucune combinaison connecteur/capteur qualifiée n'est documentée dans ce projet : toute référence saisie, sa contrepartie et son brochage restent à vérifier par la R&D.")}
        </p>
      </div>
    </div>
  );

  const revueSection = (
    <div className="space-y-4">
      <Accordion type="multiple" defaultValue={["resume", "nda", "envoi"]} className="space-y-3">
        <AccordionItem value="resume" className="panel-block-lg border-0">
          <AccordionTrigger className="business-accordion-trigger t-title-s gap-3 hover:no-underline">
            <span className="standex-bar !h-5 !w-1" aria-hidden="true" />
            <span className="flex-1">{t("Résumé technique et inconnues")}</span>
          </AccordionTrigger>
          <AccordionContent>
            <pre className="code-block max-h-[28rem] overflow-y-auto whitespace-pre-wrap">
              {technicalSummary(dossier, (x) => t(x))}
            </pre>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="projet" className="panel-block-lg border-0">
          <AccordionTrigger className="business-accordion-trigger t-title-s gap-3 hover:no-underline">
            <span className="standex-bar !h-5 !w-1" aria-hidden="true" />
            <span className="flex-1">{t("Contexte projet")}</span>
          </AccordionTrigger>
          <AccordionContent className="grid gap-5 md:grid-cols-2">
            <div>
              <Label className="t-label">{t("Volume annuel de capteurs (entier ou « inconnu »)")}</Label>
              <Input
                className="t-metric mt-2 w-full text-right"
                value={volumeRaw}
                placeholder="inconnu"
                onChange={(e) => {
                  setVolumeRaw(e.target.value);
                  const parsed = parseAnnualVolume(e.target.value);
                  if ("error" in parsed) {
                    setVolumeError(parsed.error);
                  } else {
                    setVolumeError(null);
                    setDossier((d) => ({
                      ...d,
                      business: { ...d.business, annualVolume: parsed },
                    }));
                  }
                }}
              />
              {volumeError ? (
                <p className="notice notice-danger mt-2 w-full">{volumeError}</p>
              ) : null}
            </div>
            <div>
              <Label className="t-label">{t("Date de lancement série")}</Label>
              <Input
                className="t-metric mt-2 w-full"
                type="date"
                onChange={(e) =>
                  setDossier((d) => ({
                    ...d,
                    business: { ...d.business, seriesStartDate: e.target.value || null },
                  }))
                }
              />
            </div>
            <div>
              <Label className="t-label">{t("Échantillons utiles avant")}</Label>
              <Input
                className="t-metric mt-2 w-full"
                type="date"
                onChange={(e) =>
                  setDossier((d) => ({
                    ...d,
                    business: { ...d.business, samplesNeededBy: e.target.value || null },
                  }))
                }
              />
            </div>
            <div>
              <Label className="t-label">{t("Durée de série (années)")}</Label>
              <Input
                className="t-metric mt-2 w-full text-right"
                inputMode="numeric"
                onChange={(e) =>
                  setDossier((d) => ({
                    ...d,
                    business: { ...d.business, seriesDurationYears: num(e.target.value) },
                  }))
                }
              />
            </div>
            <div>
              <Label className="t-label">{t("Contact")}</Label>
              <Input
                className="mt-2 w-full"
                placeholder="Nom"
                onChange={(e) =>
                  setDossier((d) => ({
                    ...d,
                    business: { ...d.business, contactName: e.target.value || null },
                  }))
                }
              />
            </div>
            <div>
              <Label className="t-label">{t("E-mail")}</Label>
              <Input
                className="mt-2 w-full"
                type="email"
                onChange={(e) =>
                  setDossier((d) => ({
                    ...d,
                    business: { ...d.business, contactEmail: e.target.value || null },
                  }))
                }
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="nda" className="panel-block-lg border-0">
          <AccordionTrigger className="business-accordion-trigger t-title-s gap-3 hover:no-underline">
            <span className="standex-bar !h-5 !w-1" aria-hidden="true" />
            <span className="flex-1">{t("Confidentialité et NDA —")} {ndaStatusLabel(nda)}</span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3">
            <p className="text-sm">
              {t("Modèle juridique approuvé :")} <strong>{APPROVED_NDA_TEMPLATE.fileName}</strong> (SHA-256{" "}
              {APPROVED_NDA_TEMPLATE.sha256.slice(0, 16)}{t("…, vérifié avant chaque remplissage). L'original reste intact : seule une copie remplie est produite, sur cet appareil, sans transmettre le dossier.")}
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {NDA_FIELD_LABELS.map(([key, label]) => (
                <div key={key}>
                  <Label className="t-label">{label}</Label>
                  <Input
                    value={nda.fields[key]}
                    onChange={(e) =>
                      setNda((n) => ({
                        ...n,
                        fields: { ...n.fields, [key]: e.target.value },
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void prepareNdaDocument("preview");
                }}
              >
                {t("Aperçu du document rempli")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!ndaPreview}
                onClick={() => {
                  void prepareNdaDocument("download");
                }}
              >
                <Download className="mr-1 h-4 w-4" />
                {t("Télécharger le .docx non signé")}
              </Button>
              <Button
                size="sm"
                disabled={!backend?.ready}
                onClick={() => {
                  void prepareServerNda();
                }}
              >
                {t("Préparer mon NDA pour vérification")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!backend?.ready || !serverDossierId}
                onClick={() => {
                  void refreshNdaStatus();
                }}
              >
                {t("Actualiser le statut")}
              </Button>
            </div>
            <p className="t-caption">
              {t("« Préparer mon NDA » n'envoie aucune donnée de conception : seule une fiche vide est créée côté Standex pour que vous puissiez déposer le document signé et que l'équipe puisse le vérifier.")}{" "}
              {ndaServer
                ? `Statut côté Standex : ${ndaServer.nda_status}${
                    ndaServer.allows_transfer ? t(" — transfert autorisé") : t(" — transfert bloqué")
                  }.`
                : t("Aucune fiche NDA créée pour l'instant.")}
            </p>

            {ndaError ? (
              <p className="notice notice-warning flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {ndaError}
              </p>
            ) : null}
            {ndaPreview ? (
              <div className="space-y-2">
                <p className="t-caption">
                  {t("Aperçu local des clauses du document rempli (non signé) —")} {ndaPreview.fileName}
                </p>
                <pre className="code-block max-h-80 overflow-auto whitespace-pre-wrap">
                  {ndaPreview.paragraphs.filter((p) => p.trim()).join("\n\n")}
                </pre>
              </div>
            ) : null}
            <p className="t-caption">
              {t("Générer un document n'est pas une signature : aucune signature ni tampon n'est ajouté, le document reste non signé. Le statut « en vigueur » n'est accordé que sur preuve vérifiée côté Standex ; tant qu'il n'est pas atteint, aucun contenu confidentiel n'est transmis.")}
            </p>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="envoi" className="panel-block-lg border-0">
          <AccordionTrigger className="business-accordion-trigger t-title-s gap-3 hover:no-underline">
            <span className="standex-bar !h-5 !w-1" aria-hidden="true" />
            <span className="flex-1">{t("Préparer la revue Standex")}</span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3">
            <div>
              <Label className="t-label">{t("Contraintes supplémentaires")}</Label>
              <Textarea
                rows={3}
                value={extraConstraints}
                onChange={(e) => setExtraConstraints(e.target.value)}
              />
            </div>
            <p className="text-sm">
              {t("Fichiers réellement transmis :")}{" "}
              {dossier.attachments.filter((a) => a.transferred).length === 0
                ? "aucun"
                : dossier.attachments
                    .filter((a) => a.transferred)
                    .map((a) => a.fileName)
                    .join(", ")}
            </p>
            <label className="t-caption flex items-center gap-2">
              <Checkbox
                checked={binding !== null && hasBoundConsent(privacy, "supabase_dossier", binding)}
                disabled={binding === null}
                onCheckedChange={(v) => {
                  setConsentNotice(null);
                  setPrivacy((p) =>
                    v && binding
                      ? grantConsent(p, {
                          kind: "supabase_dossier",
                          contentSummary:
                            t("Exigences, montage, câblage, contraintes et contexte projet."),
                          recipients: [t("Standex R&D"), t("Standex commercial")],
                          binding,
                        })
                      : {
                          ...p,
                          consents: p.consents.filter((c) => c.kind !== "supabase_dossier"),
                        },
                  );
                }}
              />
              {t("J'autorise l'envoi de ce contenu à Standex (R&D et commercial).")}
            </label>
            {consentNotice ? <p className="notice notice-warning">{consentNotice}</p> : null}

            <label className="t-caption flex items-center gap-2">
              <Checkbox
                checked={shareModel}
                disabled={!dossier.workshopAsset}
                onCheckedChange={(v) => {
                  setShareModel(Boolean(v));
                  if (!v) setPreparedUpload(null);
                }}
              />
              {dossier.workshopAsset
                ? `Je partage aussi le fichier 3D « ${dossier.workshopAsset.fileName} » avec l'équipe en charge.`
                : t("Aucun fichier 3D importé : rien à partager.")}
            </label>
            {shareModel && dossier.workshopAsset ? (
              <div className="space-y-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || preparedUpload?.assetKey === dossier.workshopAsset.assetKey}
                  onClick={() => void prepareShare()}
                  aria-busy={busy ? "true" : undefined}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {preparedUpload?.assetKey === dossier.workshopAsset.assetKey
                    ? t("Fichier 3D déposé et vérifié")
                    : t("1. Déposer le fichier 3D")}
                </Button>
                <p className="t-caption">
                  {t("Le dépôt a lieu avant votre accord, pour que vous confirmiez exactement ce qui partira. Il n'est pas refait si l'envoi doit être retenté.")}
                </p>
              </div>
            ) : null}
            <hr className="standex-rule" />
            <label className="t-caption flex items-center gap-2">
              <Checkbox
                checked={acknowledged}
                onCheckedChange={(v) => setAcknowledged(Boolean(v))}
              />
              {t("J'ai relu le résumé technique et les inconnues listées.")}
            </label>
            <div className="space-y-3">
              <Button
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => void onSubmit()}
                disabled={!ndaOk || busy}
                aria-busy={busy ? "true" : undefined}
              >
                {busy ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-1 h-4 w-4" />
                )}{" "}
                {busy ? t("Envoi en cours…") : t("Transmettre à la revue Standex")}
              </Button>
            </div>
            {!backend?.ready ? (
              <div className="space-y-2">
                <p className="t-caption">
                  {t(backend?.message ?? "Vérification du backend en cours…")}
                </p>
                <AuthPanel
                  backend={backend}
                  onChanged={() => {
                    checkLeadBackend()
                      .then(setBackend)
                      .catch(() => setBackend(null));
                  }}
                />
              </div>
            ) : (
              <AuthPanel backend={backend} />
            )}
            {reopenedFrom ? (
              <p className="t-caption">
                {msg(
                  "Contenu repris de la version {0}. Le prochain envoi créera la version {1} de ce dossier.",
                  [reopenedFrom.revision, serverRevision + 1],
                )}
              </p>
            ) : null}
            {submitMessage ? (
              <p className="notice notice-success notice-success-sweep">{submitMessage}</p>
            ) : null}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="echantillons" className="panel-block-lg border-0">
          <AccordionTrigger className="business-accordion-trigger t-title-s gap-3 hover:no-underline">
            <span className="standex-bar !h-5 !w-1" aria-hidden="true" />
            <span className="flex-1">{t("Échantillons et suivi")}</span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3">
            <p className="text-sm">{sampleRoute.note}</p>
            <p className="notice notice-warning">
              {t("Les échantillons s'ouvrent après un retour Standex validé et publié, qui fixe la référence exacte à commander. Une gamme ne suffit pas.")}
            </p>
            <p className="t-caption">{t(SEARCH_LINK_DISCLAIMER)}</p>
            <Button
              variant="outline"
              className="min-h-11 text-base"
              onClick={() => setPanel("espace")}
            >
              {t("Ouvrir mon espace (mes projets, suivi, variantes)")}
            </Button>

            <p className="t-caption">
              {t("Disponibilités, MOQ et conditionnements : inconnus tant qu'aucun fournisseur réel n'est connecté.")}
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );

  /** Applique un montage 3D au dossier, avec la MÊME logique de provenance,
   * qu'il vienne de « Enregistrer » ou de « Utiliser ce montage ».
   * Aucun réseau, aucune écriture sur l'appareil : tout reste en mémoire. */
  const applyWorkshopConfig = useCallback((c: WorkshopConfig) => {
    setWorkshop(c);
    setDossier((d) => ({
      ...d,
      workshop: c,
      // Provenance explicite : un vrai import n'est jamais compté comme exemple.
      workshopSource: c.machine ? "user_asset" : "example",
      workshopAsset: c.machine
        ? { assetKey: c.machine.assetKey, fileName: c.machine.fileName, storage: "memory" }
        : null,
      workshopSensorId: c.sensorId,
      sensorSyncConfirmed: d.selectedSensorId === null || d.selectedSensorId === c.sensorId,
      updatedAt: new Date().toISOString(),
    }));
    workshopDraftRef.current = null;
    draftPendingRef.current = false;
    setWorkshopDraftPending(false);
  }, []);

  const useCurrentDraft = useCallback(() => {
    const draft = workshopDraftRef.current;
    if (!draft) return;
    applyWorkshopConfig(draft);
    setSubmitMessage(
      t("Montage 3D repris dans votre projet : il suivra désormais l'export, le résumé et l'envoi."),
    );
  }, [applyWorkshopConfig]);

  const draftBanner = workshopDraftPending ? (
    <div className="notice notice-warning">
      <p className="text-base">
        {t("Des réglages 3D ne sont pas encore repris dans votre projet : ils ne partiraient ni dans l'export ni dans le résumé.")}
      </p>
      <Button className="mt-3 min-h-11 text-base" onClick={useCurrentDraft}>
        {t("Utiliser ce montage")}
      </Button>
    </div>
  ) : null;

  const workshopSection = (
    <div className="space-y-3">
      <p className="text-base text-muted-foreground">
        {t("Modèle physique explicitement pédagogique : aucune validation magnétique automatique. L'exemple machine à café est un exemple, il n'impose aucune référence à votre projet.")}
      </p>
      {draftBanner}
      <Suspense fallback={<p className="text-base">{t("Chargement de l'atelier…")}</p>}>
        <MagneticWorkshop
          key={`workshop-${workshopEpoch}`}
          initialConfig={workshop ?? DEFAULT_WORKSHOP}
          storageLabel={t("ce dossier, en mémoire de l'onglet")}
          storageMode="memory"
          cableRouting={cableRouting}
          onDraftChange={onWorkshopDraft}
          onClose={() => {
            setShowWorkshop(false);
            setPanel(null);
          }}
          onSave={async (c: WorkshopConfig) => {
            applyWorkshopConfig(c);
          }}
        />
      </Suspense>
    </div>
  );

  const documentsSection = (
    <div className="space-y-5">
      <div className="space-y-3">
        <Button
          variant="outline"
          className="surface-interactive min-h-11 w-full justify-start gap-3 p-5 text-left text-base"
          onClick={() => {
            docGenRef.current += 1;
            setOpenDoc({
              id: `summary-${Date.now()}`,
              name: t("Résumé de mon projet.md"),
              kind: "markdown",
              text: technicalSummary(dossier, (x) => t(x)),
            });
          }}
        >
          <FileText className="h-5 w-5 shrink-0 text-[var(--primary)]" aria-hidden="true" />
          {t("Résumé de mon projet")}
        </Button>
        {ndaPreview ? (
          <Button
            variant="outline"
            className="surface-interactive min-h-11 w-full justify-start gap-3 p-5 text-left text-base"
            onClick={() => {
              docGenRef.current += 1;
              setOpenDoc({
                id: `nda-${ndaPreview.fileName}`,
                name: ndaPreview.fileName.replace(/\.docx$/i, "-apercu.txt"),
                kind: "text",
                text: ndaPreview.paragraphs.filter((p) => p.trim()).join("\n\n"),
              });
            }}
          >
            <FileText className="h-5 w-5 shrink-0 text-[var(--primary)]" aria-hidden="true" />
            {t("Aperçu de l'accord de confidentialité")}
          </Button>
        ) : null}
        <Button
          variant="outline"
          className="surface-interactive min-h-11 max-w-full justify-start whitespace-normal p-5 text-base"
          asChild
        >
          <label className="block w-full max-w-full cursor-pointer text-center sm:w-auto">
            <span className="flex items-center gap-3">
              <Upload className="h-5 w-5 shrink-0 text-[var(--primary)]" aria-hidden="true" />
              {t("Ouvrir un fichier de mon appareil")}
            </span>
            <input
              type="file"
              accept=".md,.markdown,.txt,application/pdf"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                // Lecture locale : numérotée et rattachée au dossier courant,
                // pour qu'un fichier lu lentement n'apparaisse pas ailleurs.
                const gen = ++docGenRef.current;
                const ctx = contextGenRef.current;
                setOpenDoc(null);
                void documentFromFile(f)
                  .then((doc) => {
                    if (gen !== docGenRef.current || ctx !== contextGenRef.current) return;
                    setOpenDoc(doc);
                  })
                  .catch((error: unknown) => {
                    if (gen !== docGenRef.current || ctx !== contextGenRef.current) return;
                    setOpenDoc({
                      id: `local-error-${gen}`,
                      name: f.name,
                      kind: "binary",
                      note:
                        error instanceof Error
                          ? error.message
                          : t("Ce fichier n'a pas pu être lu dans cet onglet."),
                    });
                  });
              }}
            />
          </label>
        </Button>
      </div>
      <p className="t-caption">
        {t("Les fichiers ouverts ici restent en mémoire de cet onglet : rien n'est envoyé.")}
      </p>
      <div className="panel-block">
        <DocumentViewer document={openDoc} />
      </div>
    </div>
  );

  const espaceSection = (
    <div className="space-y-5">
      <div className="panel-block-lg">
        <AuthPanel
          backend={backend}
          onChanged={() => {
            checkLeadBackend()
              .then(setBackend)
              .catch(() => setBackend(null));
          }}
        />
      </div>
      {draftBanner}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" className="min-h-11 text-base" onClick={exportDossier}>
          <Download className="mr-1 h-4 w-4" /> {t("Exporter mon projet")}
        </Button>
        <Button
          variant="outline"
          className="min-h-11 max-w-full whitespace-normal text-base"
          asChild
        >
          <label className="block w-full max-w-full cursor-pointer text-center sm:w-auto">
            {t("Reprendre un fichier")}
            <input
              type="file"
              accept="application/json"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                // La garde vit DANS importDossier : tous les chemins protégés.
                void importDossier(f).then((imported) => {
                  if (imported && !busyRef.current) {
                    setPanel(null);
                    onWorkspaceOpen?.();
                  }
                });
              }}
            />
          </label>
        </Button>
        <Button
          variant="ghost"
          className="min-h-11 text-base"
          onClick={() => {
            if (busyRef.current) return;
            if (!guardReplace(t("démarrer un nouveau projet"))) return;
            const fresh = createDossier(undefined, getLocale());
            setDossier(fresh);
            adoptBaseline(fresh);
            setConnectorDraft(EMPTY_CONNECTOR_DRAFT);
            setConnectorError(null);
            loadWorkshop(null);
            resetServerContext(null, 0);
            setPanel(null);
            onWorkspaceOpen?.();
            setSubmitMessage(t("Nouveau projet ouvert en mémoire de cet onglet."));
          }}
        >
          {t("Nouveau projet")}
        </Button>
      </div>

      {backend?.role ? (
        <p className="text-base text-muted-foreground">
          {t("Accès équipe Standex (")}{backend.role}) :{" "}
          <Link to="/standex" className="underline underline-offset-4">
            {t("console R&amp;D")}
          </Link>{" "}
          ·{" "}
          <Link to="/internal" className="underline underline-offset-4">
            {t("banc de test interne")}
          </Link>
        </p>
      ) : null}
      {submitMessage ? <p className="notice notice-info">{submitMessage}</p> : null}
      <div className="panel-block-lg">
        <ClientFollowUp
          backend={backend}
          serverDossierId={serverDossierId}
          contextGeneration={contextGenRef.current}
          onOpenTransferredFile={(f) => void openTransferredFile(f)}
          onSelectDossier={({ id, revision, title, snapshot }) => {
            if (busyRef.current) return { ok: false };
            if (!guardReplace(t("ouvrir ce dossier"))) return { ok: false };
            // Le dossier CONSULTÉ ne devient le dossier ÉDITÉ que si son
            // dernier contenu envoyé a pu être chargé : sinon l'ancien
            // contenu resterait à l'écran sous une nouvelle étiquette.
            const parsed = snapshot ? parseServerSnapshot(snapshot) : null;
            if (snapshot && (!parsed || !parsed.ok)) {
              setSubmitMessage(
                parsed && !parsed.ok
                  ? parsed.reason
                  : t("Le dernier contenu envoyé de ce dossier n'a pas pu être relu : le dossier ouvert ici reste inchangé."),
              );
              return { ok: false };
            }
            if (parsed && parsed.ok) {
              const next = { ...parsed.dossier, storage: "memory" as const };
              setDossier(next);
              adoptBaseline(next);
              loadWorkshop(parsed.dossier.workshop ?? null);
            } else {
              // Dossier sans contenu envoyé : contenu VIDE, jamais l'ancien.
              const next = { ...createDossier(undefined, getLocale()), title };
              setDossier(next);
              adoptBaseline(next);
              loadWorkshop(null);
            }
            setConnectorDraft(EMPTY_CONNECTOR_DRAFT);
            setConnectorError(null);
            resetServerContext(id, revision);
            setPanel(null);
            onWorkspaceOpen?.();
            setSubmitMessage(
              `Dossier « ${title} » ouvert à la version ${revision}${
                parsed && parsed.ok
                  ? t(", contenu envoyé rechargé")
                  : t(", aucun contenu envoyé à recharger")
              }. Votre accord d'envoi et la relecture sont à refaire pour ce dossier.`,
            );
            return { ok: true };
          }}
          onReopenSnapshot={({ dossierId, sourceRevision, currentRevision, snapshot }) => {
            if (busyRef.current) return { ok: false };
            if (!guardReplace(t("reprendre cette version"))) return { ok: false };
            const parsed = parseServerSnapshot(snapshot);
            if (!parsed.ok) {
              setSubmitMessage(parsed.reason);
              return { ok: false };
            }
            // Reprise ATOMIQUE : contenu, contexte serveur, accords,
            // relecture et partage de fichier changent d'un seul tenant.
            // La version attendue par le serveur est la version COURANTE
            // du dossier, pas l'ancienne version reprise.
            const reopened = { ...parsed.dossier, storage: "memory" as const };
            setDossier(reopened);
            adoptBaseline(reopened);
            loadWorkshop(parsed.dossier.workshop ?? null);
            setConnectorDraft(EMPTY_CONNECTOR_DRAFT);
            setConnectorError(null);
            resetServerContext(dossierId, currentRevision);
            setReopenedFrom({ dossierId, revision: sourceRevision });
            setPanel(null);
            onWorkspaceOpen?.();
            setSubmitMessage(
              `Contenu de la version ${sourceRevision} repris. Le prochain envoi créera la version ${currentRevision + 1} du dossier. ${parsed.notices.join(" ")}`,
            );
            return { ok: true };
          }}
          onApplyVariant={async ({ dossierId, revision, snapshot, variant, commit }) => {
            if (busyRef.current)
              return {
                applied: [],
                notApplied: [],
                refused: t("Une opération est en cours. Réessayez après sa fin."),
              };
            if (!guardReplace(t("reprendre cette proposition")))
              return {
                applied: [],
                notApplied: [],
                refused: t("Reprise annulée : votre travail en cours est intact."),
              };
            // La variante s'applique au contenu de LA version relue par
            // Standex, jamais à un contenu resté d'un autre dossier.
            const parsed = parseServerSnapshot(snapshot);
            if (!parsed.ok) {
              return { applied: [], notApplied: [], refused: parsed.reason };
            }
            const out = applyVariant({ ...parsed.dossier, storage: "memory" }, variant);
            if (!out.applied.length) {
              return {
                applied: [],
                notApplied: out.notApplied,
                refused:
                  t("Aucune modification de cette proposition n'a pu être appliquée : rien n'a été repris."),
              };
            }
            try {
              // Le serveur enregistre la reprise AVANT que l'écran change.
              busyRef.current = true;
              setBusy(true);
              await commit();
            } catch (error) {
              return {
                applied: [],
                notApplied: out.notApplied,
                refused:
                  error instanceof Error
                    ? error.message
                    : t("La reprise de cette proposition n'a pas été enregistrée."),
              };
            } finally {
              busyRef.current = false;
              setBusy(false);
            }
            setDossier(out.dossier);
            adoptBaseline(out.dossier);
            loadWorkshop(out.dossier.workshop ?? null);
            setConnectorDraft(EMPTY_CONNECTOR_DRAFT);
            setConnectorError(null);
            resetServerContext(dossierId, revision);
            setReopenedFrom({ dossierId, revision });
            setPanel(null);
            onWorkspaceOpen?.();
            setSubmitMessage(
              t("Proposition Standex reprise dans le contenu ouvert ici. Elle n'est ni validée ni envoyée : relisez, confirmez l'accord, puis envoyez une nouvelle version."),
            );
            return { applied: out.applied, notApplied: out.notApplied };
          }}
        />
      </div>
    </div>
  );

  return (
    <div
      data-readable
      className={embedded ? "text-foreground" : "min-h-screen bg-background text-foreground"}
    >
      <header
        className={`material sticky top-0 z-20 border-b border-[var(--hairline)]${visible ? "" : " hidden"}`}
      >
        <div className="mx-auto flex max-w-[76rem] flex-wrap items-center gap-4 px-4 py-4">
          <div className="flex shrink-0 items-center gap-3 self-center">
            {onGoHome ? (
              <button
                type="button"
                onClick={onGoHome}
                aria-label={t("Revenir à l'accueil Standex DETECT")}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--r-sm)] transition-colors duration-[var(--d-fast)] hover:bg-[var(--surface-tint)]"
              >
                <BrandLogo variant="mark" tone="light" height={32} clearance={false} alt="" />
              </button>
            ) : (
              <Link
                to="/"
                aria-label={t("Revenir à l'accueil Standex DETECT")}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--r-sm)] transition-colors duration-[var(--d-fast)] hover:bg-[var(--surface-tint)]"
              >
                <BrandLogo variant="mark" tone="light" height={32} clearance={false} alt="" />
              </Link>
            )}
            <span aria-hidden="true" className="block h-6 w-px bg-[var(--hairline)]" />
          </div>
          <ProjectTitle
            // Changer de dossier pendant un renommage abandonne le brouillon de
            // nom de l'ancien dossier : il ne doit jamais renommer le nouveau.
            key={dossier.id}
            title={dossier.title}
            onRename={(next) =>
              setDossier((d) => ({ ...d, title: next, updatedAt: new Date().toISOString() }))
            }
          />
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1 px-2.5 py-1 text-sm">
              <Lock className="h-3 w-3" /> {t(STORAGE_BADGE[privacy.storage])}
            </Badge>
            <span className="text-muted-foreground" aria-hidden="true">
              ·
            </span>
            <Badge variant="secondary" className="px-2.5 py-1 text-sm">
              {t("Révision")} {dossier.revision}
            </Badge>
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-1 rounded-[var(--r-sm)] bg-[var(--surface-sunken)] p-1">
            <LanguagePicker />
            <Button
              variant="ghost"
              className="min-h-11 px-3"
              onClick={exportDossier}
              aria-label={t("Exporter")}
            >
              <Download className="h-4 w-4" /> <span className="hidden sm:inline">{t("Exporter")}</span>
            </Button>
            <Button variant="ghost" className="min-h-11 max-w-full px-3 whitespace-normal" asChild>
              <label
                className="inline-flex w-auto max-w-full cursor-pointer text-center"
                aria-label={t("Reprendre un fichier")}
              >
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">{t("Reprendre un fichier")}</span>
                <input
                  type="file"
                  accept="application/json"
                  className="sr-only"
                  onChange={(e) => {
                    // Même garde que partout ailleurs : importDossier la porte.
                    void importDossier(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </Button>
          </div>
        </div>
        <div className="mx-auto max-w-[76rem] px-4 pb-4">
          <div className="flex items-start gap-3 rounded-[var(--r-md)] bg-[var(--surface-tint)] px-[1.125rem] py-[0.875rem]">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="t-caption !text-[var(--foreground)]">
              {t(MEMORY_LOSS_WARNING)} {t(EXPORT_BINARY_NOTICE)}
              {importMessage ? <span className="block font-semibold">{importMessage}</span> : null}
            </div>
          </div>
        </div>
      </header>

      <main className={`mx-auto max-w-[76rem] px-4 py-6${visible ? "" : " hidden"}`}>
        <nav
          aria-label="Progression"
          className={`project-stepper project-stepper-${stepIndex} mb-6`}
        >
          <span className="project-stepper-thumb" aria-hidden="true" />
          {steps.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-current={stepIndex === i ? "step" : undefined}
              onClick={() => setTab(s.id)}
              className={`relative z-10 min-h-11 bg-transparent px-4 py-3 text-left transition-colors duration-[var(--d-base)] ${stepIndex === i ? "text-[var(--heading)]" : "text-[var(--muted-foreground)]"}`}
            >
              <span className="flex items-center gap-2 text-base font-semibold">
                <span
                  className={`standex-bar !h-3 !w-1 transition-opacity duration-[var(--d-base)] ${stepIndex === i ? "opacity-100" : "opacity-25"}`}
                  aria-hidden="true"
                />
                <span>
                  {i + 1}. {s.label}
                </span>
              </span>
              <span className="mt-0.5 block pl-3 text-sm">{s.hint}</span>
            </button>
          ))}
        </nav>

        {/* Outils contextuels : ils apparaissent à l'étape où ils servent. */}
        <hr className="standex-rule mb-4" />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 rounded-[var(--r-pill)] text-base hover:bg-[var(--surface-tint)]"
            onClick={() => setPanel("espace")}
          >
            <UserRound />
            {t("Mon espace")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 rounded-[var(--r-pill)] text-base hover:bg-[var(--surface-tint)]"
            onClick={() => setPanel("documents")}
          >
            <FileText />
            {t("Documents")}
          </Button>
          {tab !== "besoin" ? (
            <div className="anim-fade contents">
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11 rounded-[var(--r-pill)] text-base hover:bg-[var(--surface-tint)]"
                onClick={() => {
                  setWorkshopMounted(true);
                  setShowWorkshop(true);
                  setPanel("atelier");
                }}
              >
                <Box />
                {t("Atelier 3D")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11 rounded-[var(--r-pill)] text-base hover:bg-[var(--surface-tint)]"
                onClick={() => (showAdvanced ? setTab("candidats") : setPanel("candidats"))}
              >
                <Cpu />
                {t("Capteurs possibles")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11 rounded-[var(--r-pill)] text-base hover:bg-[var(--surface-tint)]"
                onClick={() => (showAdvanced ? setTab("cablage") : setPanel("cablage"))}
              >
                <Cable />
                {t("Câble et connecteur")}
              </Button>
            </div>
          ) : null}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              className="min-h-11 text-base"
              aria-expanded={showAdvanced}
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? t("Masquer les réglages détaillés") : t("Ouvrir les réglages détaillés")}
            </Button>
            {showAdvanced ? null : (
              <span className="text-base text-muted-foreground">
                {t("Tous les réglages avancés restent disponibles, sans rien perdre.")}
              </span>
            )}
          </div>
          <TabsList className={showAdvanced ? "flex-wrap" : "hidden"}>
            <TabsTrigger value="besoin">{t("Besoin")}</TabsTrigger>
            <TabsTrigger value="montage">{t("Montage &amp; 3D")}</TabsTrigger>
            <TabsTrigger value="candidats">{t("Candidats")}</TabsTrigger>
            <TabsTrigger value="cablage">{t("Câblage")}</TabsTrigger>
            <TabsTrigger value="revue">{t("Revue Standex")}</TabsTrigger>
          </TabsList>

          {/* ---------------- Besoin ---------------- */}
          <TabsContent value="besoin" className="pt-4">
            {besoinSection}
          </TabsContent>

          {/* ---------------- Montage ---------------- */}
          <TabsContent value="montage" className="pt-4">
            {montageSection}
          </TabsContent>

          {showAdvanced ? (
            <>
              {/* ---------------- Candidats ---------------- */}
              <TabsContent value="candidats" className="pt-4">
                {candidatsSection}
              </TabsContent>

              {/* ---------------- Câblage ---------------- */}
              <TabsContent value="cablage" className="pt-4">
                {cablageSection}
              </TabsContent>
            </>
          ) : null}

          {/* ---------------- Revue ---------------- */}
          <TabsContent value="revue" className="pt-4">
            {revueSection}
          </TabsContent>
        </Tabs>
      </main>

      {/* Panneaux contextuels : le projet reste derrière, la saisie est conservée. */}
      {/* L'atelier occupe tout l'écran : il reste MONTÉ en permanence, donc le
          retour au projet ne perd ni réglages, ni caméra, ni fichier importé,
          et n'applique aucun montage non validé (« Utiliser ce montage » reste
          la seule action qui reprend le montage dans le dossier). */}
      <WorkspacePanel
        open={panel === "atelier" && workshopMounted}
        keepMounted={workshopMounted}
        fullscreen
        backLabel={t("Retour au projet")}
        onBack={() => setPanel(null)}
        onOpenChange={(o) => setPanel(o ? "atelier" : null)}
        title={t("Atelier 3D")}
        description={t("Vos réglages restent en mémoire même si vous refermez ce panneau. Enregistrer reste une action explicite.")}
      >
        {workshopMounted ? workshopSection : null}
      </WorkspacePanel>

      <WorkspacePanel
        open={panel === "candidats"}
        keepMounted
        onOpenChange={(o) => setPanel(o ? "candidats" : null)}
        title={t("Capteurs possibles")}
        description={t("Proposés à partir de vos contraintes et de votre montage, jamais du secteur d'activité.")}
      >
        {showAdvanced ? null : candidatsSection}
      </WorkspacePanel>

      <WorkspacePanel
        open={panel === "cablage"}
        keepMounted
        onOpenChange={(o) => setPanel(o ? "cablage" : null)}
        title={t("Câble et connecteur")}
        description={t("Longueurs, réserves et connecteurs documentés. Rien n'est perdu en fermant.")}
      >
        {showAdvanced ? null : cablageSection}
      </WorkspacePanel>

      <WorkspacePanel
        open={panel === "documents"}
        keepMounted
        onOpenChange={(o) => setPanel(o ? "documents" : null)}
        title="Documents"
        description={t("Lecture sur place, en mémoire de cet onglet.")}
      >
        {documentsSection}
      </WorkspacePanel>

      <WorkspacePanel
        open={panel === "espace"}
        keepMounted
        onOpenChange={(o) => setPanel(o ? "espace" : null)}
        title={t("Mon espace")}
        description={t("Connexion, mes projets envoyés, reprise et suivi.")}
      >
        {espaceSection}
      </WorkspacePanel>
    </div>
  );
}
