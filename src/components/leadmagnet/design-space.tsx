import { NeedExamples } from "./need-examples";
import { BookingDialog } from "./booking-dialog";
import { COUNTRY_CODES, salesContactFor } from "@/lib/leadmagnet/sales-contact";
import {
  EXTERNAL_TRANSLATION_ENABLED,
  externalTranslationAllowed,
  stripDisabledConsents,
} from "@/lib/leadmagnet/external-translation";
import { pairDemonstration } from "@/lib/standex/magnetic-workshop";
import { isPcbSensor, housingMaterial, pairCategory, suggestedProjectTitle } from "@/lib/leadmagnet/product-presentation";
import { pairCardFor } from "@/lib/leadmagnet/pair-cards";
import { useDetectionDataRevision } from "@/lib/standex/detection-data/store";
import { requirementAnswer } from "@/lib/leadmagnet/requirement-answer";
import { projectPdfFilename } from "@/lib/leadmagnet/project-reference";
import { getLocale, isLocale, msg, setLocale, t, type Locale } from "@/lib/i18n/core";
import { createNdaSync, StaleContextError } from "@/lib/leadmagnet/nda-sync";
import { Link } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
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
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CandidateThumbnail } from "@/components/leadmagnet/candidate-thumbnail";
import { PairThumbnail } from "@/components/leadmagnet/pair-thumbnail";
import { CUSTOM_SENSOR_ID, formatMm, sensorById, sizeLabel } from "@/lib/standex/sensor-catalog";
import {
  blockedBy,
  suggestionFilters,
  explorationFilters,
  mergeFilters,
  EXPLORABLE_MOUNTINGS,
  EXPLORABLE_SHAPES,
  type ExplorationChoice,
  type SuggestionFilterId,
} from "@/lib/leadmagnet/suggestion-filters";

import {
  checklistProgress,
  delegatedQuestion,
  isDelegated,
  projectChecklist,
  DELEGATED_CABLE,
  DELEGATED_CONNECTOR,
  CHOSEN_BARE_LEADS,
  DELEGATED_CONTEXT,
  DELEGATED_MOUNTING,
  TRIAL_REQUEST,
  DELEGATED_SENSOR,
} from "@/lib/leadmagnet/project-checklist";
import SensorCard from "@/components/standex/workshop/sensor-card";
import { ConnectorPreview } from "@/components/leadmagnet/connector-preview";
import SensorCatalog from "@/components/standex/workshop/sensor-catalog";
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
  currentMounting,
  confirmRequirement,
  proposeRequirement,
  parseAnnualVolume,
  toClientDto,
  REQUIREMENT_ORDER,
  REQUIREMENT_LABELS,
  type DesignDossier,
  type MountingChoice,
} from "@/lib/leadmagnet/dossier";
import { detectMountingIntent } from "@/lib/leadmagnet/mounting-intent";
import { CANDIDATE_DISCLAIMER, evaluateCandidates } from "@/lib/leadmagnet/candidates";
import { assessApplicationFit } from "@/lib/leadmagnet/application-fit";
import { CompatibilityPanel } from "./compatibility-panel";
import {
  applyRoutingPick,
  compareStandardLengths,
  estimateCableLength,
  resetRouting,
  routingPoints,
  rangeCableLengthNote,
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
  type PrivacyState,
} from "@/lib/leadmagnet/privacy";
import {
  APPROVED_NDA_TEMPLATE,
  INITIAL_NDA,
  NDA_FIELD_LABELS,
  NDA_DISABLE_CONFIRMATION,
  disableNda,
  enableNda,
  ndaDisableNeedsConfirmation,
  planNdaToggle,
  ndaAllowsConfidentialTransfer,
  ndaDisableBlockedReason,
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

import { checkSubmission, submissionBinding } from "@/lib/leadmagnet/submission";
import { submit, technicalSummary } from "@/lib/leadmagnet/submission";
import { applyBindingCycle, consentNoticeFor } from "@/lib/leadmagnet/submission-cycle";
import {
  sentHistory,
  statusDetail,
  statusHeadline,
  submissionStatusKind,
  submitButtonLabel,
  type SentRevisionRecord,
} from "@/lib/leadmagnet/submission-status";
import { checkLeadBackend, type LeadBackendStatus } from "@/lib/leadmagnet/backend";
import { requestEnglishReport } from "@/lib/leadmagnet/english-report.functions";
import { englishReportMessage } from "@/lib/leadmagnet/english-report-messages";
import { EnglishRunLock } from "@/lib/leadmagnet/english-run-lock";
import {
  ndaTransferGuidance,
  runGuardedSubmit,
  submitFailureMessage,
  type SubmitPhase,
  type ReviewOperation,
} from "@/lib/leadmagnet/review-submit-state";

import {
  createDossier as createServerDossier,
  createSupabaseSubmissionBackend,
  uploadDesignFile,
  downloadDesignFile,
  prepareNdaOnServer,
  fetchNdaStatus,
  setNdaRequirement,
  type NdaStatusView,
  type UploadedFile,
} from "@/lib/leadmagnet/supabase-adapter";
import { supabase } from "@/lib/standex/supabase";
import { applyVariant } from "@/lib/leadmagnet/variant";
import { AuthPanel } from "@/components/leadmagnet/auth-panel";
import { ClientFollowUp } from "@/components/leadmagnet/client-followup";
import { WorkspacePanel } from "@/components/leadmagnet/workspace-panel";
import { ReviewSubmitControl } from "@/components/leadmagnet/review-submit-control";
import {
  DocumentViewer,
  documentFromBytes,
  documentFromFile,
  renderMarkdown,
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
import { DEFAULT_WORKSHOP, applyPairSelection } from "@/lib/standex/magnetic-workshop";
import { reviewIllustrativeNote } from "@/lib/standex/workshop-guide";
import type { WorkshopConfig } from "@/lib/standex/magnetic-workshop";
import { ProjectContextFields } from "./project-context-fields";
import { standardLengthsMm, customLengthMm } from "@/lib/leadmagnet/cable-options";
import { BrandLogo, documentLogoSource } from "@/components/standex/brand-logo";
import { usePublishedHeaderHeight } from "@/components/standex/app-header";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { pairCards, type PairCard } from "@/lib/leadmagnet/pair-cards";
import { ResultView } from "@/components/leadmagnet/result-view";
import {
  latestTestedPair,
  recordTestedPair,
  type TestedPair,
} from "@/lib/leadmagnet/tested-pairs";
import { testedPairGuideFact } from "@/lib/leadmagnet/tested-pair-guide";

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
          {t(
            "Rien de ce que vous avez saisi n'a été transmis. Le détail de l'incident reste sur votre appareil : seul un code d'incident anonyme a été signalé.",
          )}
        </p>
        <Button onClick={reset}>{t("Réessayer")}</Button>
      </div>
    </div>
  );
}

/* i18n-canonical : libellés courts de la carte « Votre projet », traduits au
   rendu. Ils ne remplacent PAS les libellés d'exigence du dossier : l'export,
   le résumé technique et l'envoi gardent les libellés techniques complets. */
const REVIEW_SHORT_LABELS: Record<string, string> = {
  detection_goal: "Besoin",
  states_motion: "Mouvement",
  mounting: "Montage",
  envelope: "Place disponible",
  electrical: "Électrique",
  environment: "Environnement",
};


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
            className="t-metric h-11 min-w-0 w-32 text-right"
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
      <div className="project-title-display flex min-w-0 flex-1 items-center gap-2">
        <h1 className="t-title-l min-w-0" title={title}>
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
/** Six étapes : une catégorie claire, puis une question précise. Aucune question
 *  de volume, de durée de série ou de calendrier ici : ces sujets restent dans
 *  « Avec Standex ». Les dimensions ne sont demandées qu'une fois, en saisie
 *  structurée sous Montage. */
export const GUIDED_QUESTIONS: {
  key: string;
  category: string;
  prompt: string;
  example: string;
  placeholder: string;
}[] = [
  {
    key: "detection_goal",
    category: "Application",
    prompt: "Dans quel équipement, et pour quoi faire ?",
    example: "machine à café professionnelle : savoir si le réservoir est bien en place",
    placeholder: "L'équipement et ce que la détection doit permettre.",
  },
  {
    key: "target_object",
    category: "Élément à détecter",
    prompt: "Quelle pièce doit être détectée ?",
    example: "un réservoir amovible en plastique, un tiroir métallique, un piston",
    placeholder: "La pièce concernée, sa matière si vous la connaissez.",
  },
  {
    key: "states_motion",
    category: "Mouvement et détection",
    prompt: "Comment cette pièce bouge-t-elle, et quels états faut-il distinguer ?",
    example: "elle coulisse de 20 mm ; présente ou retirée",
    placeholder: "Le mouvement, la course et les états à distinguer.",
  },
  {
    key: "mounting",
    category: "Montage",
    prompt: "Où placer le capteur, et comment le tenir ?",
    example: "vissé à l'intérieur du bâti, en face de la pièce mobile",
    placeholder: "Position et fixation seulement : les dimensions se saisissent juste en dessous.",
  },
  {
    key: "electrical",
    category: "Électrique",
    prompt: "À quoi le capteur sera-t-il relié ?",
    example: "une carte 5 V, un automate 24 V, un petit relais",
    placeholder: "Tension, courant ou carte de destination si vous les connaissez.",
  },
  {
    key: "environment",
    category: "Environnement",
    prompt: "Que doit-il supporter à cet endroit ?",
    example: "humidité, huile, vibrations, températures élevées, extérieur",
    placeholder: "Température, liquides, poussières, nettoyage, vibrations.",
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
  /** Projet demandé par un lien « /?dossier=… » : ouvert seulement s'il
   * appartient au compte connecté, avec la garde du brouillon en cours. */
  requestedDossierId?: string | null;
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
  requestedDossierId = null,
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

  const [privacy, setPrivacyState] = useState(INITIAL_PRIVACY);
  /** Toute écriture des accords passe par ce filtre : un accord de traduction
   *  externe restauré, importé ou hérité d'un ancien état est retiré tant que la
   *  fonction est coupée. Aucun garde-fou ne peut donc le lire ensuite. */
  const setPrivacy = useCallback(
    (update: PrivacyState | ((previous: PrivacyState) => PrivacyState)) =>
      setPrivacyState((previous) =>
        stripDisabledConsents(typeof update === "function" ? update(previous) : update),
      ),
    [],
  );
  /** Miroir synchrone de l'état des accords : l'effet de liaison est asynchrone
   * et ne doit pas relire une valeur capturée trop tôt. */
  const privacyRef = useRef(privacy);
  privacyRef.current = privacy;
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
  /**
   * Intention d'exprimer une préférence de connecteur : état d'OUVERTURE, distinct
   * de la référence technique retenue (dossier.termination) et de la délégation à
   * Standex. Cocher ouvre la sélection sans choisir de connecteur ; replier ne
   * supprime jamais la référence déjà enregistrée.
   */
  const [connectorWanted, setConnectorWanted] = useState(false);

  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [backend, setBackend] = useState<LeadBackendStatus | null>(null);
  // Dossier serveur : créé à la première transmission réussie, puis réutilisé.
  const [serverDossierId, setServerDossierId] = useState<string | null>(null);
  const [serverRevision, setServerRevision] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);
  const [extraConstraints, setExtraConstraints] = useState("");
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitMessageTone, setSubmitMessageTone] = useState<"info" | "danger" | "success">("info");
  /** Dernière révision RÉELLEMENT confirmée par le serveur. Elle décrit un
   * envoi passé, jamais le brouillon ouvert à l'écran. */
  const [lastSent, setLastSent] = useState<SentRevisionRecord | null>(null);

  /** État FACTUEL de la version anglaise du rapport : jamais « envoyé en anglais »
   * tant que le serveur n'a pas publié une version prête pour cette révision. */
  const [englishMessage, setEnglishMessage] = useState<string | null>(null);
  const [englishRetry, setEnglishRetry] = useState<{
    dossierId: string;
    revisionId: string;
    contentHash: string;
  } | null>(null);
  /** Demande de version anglaise en cours : verrou par génération unique, pour
   * qu'une réponse tardive n'écrive jamais dans un autre projet ni dans une
   * demande plus récente, et ne libère pas le verrou de cette dernière. */
  const englishLockRef = useRef(new EnglishRunLock());
  const [englishBusy, setEnglishBusy] = useState(false);
  /** Abandon SYNCHRONE de toute demande en cours + remise à zéro de l'affichage. */
  const resetEnglishReport = useCallback(() => {
    englishLockRef.current.invalidate();
    setEnglishBusy(false);
    setEnglishMessage(null);
    setEnglishRetry(null);
  }, []);
  // Écran démonté : plus aucune réponse ne doit écrire quoi que ce soit.
  useEffect(() => {
    const lock = englishLockRef.current;
    return () => lock.invalidate();
  }, []);

  const [showWorkshop, setShowWorkshop] = useState(false);
  /** État d'enregistrement du montage, affiché par la barre de l'atelier. */
  const [workshopSaveState, setWorkshopSaveState] = useState<"saved" | "saving" | "draft">("saved");
  /** Catalogue filtrable ouvert DIRECTEMENT depuis le sous-menu : il ne dépend
   * pas de l'atelier 3D et sa fermeture ne touche à rien du travail en cours. */
  const [catalogOpen, setCatalogOpen] = useState(false);
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
      const untouched = d.title === t("Nouveau projet", d.sourceLocale);
      return {
        ...d,
        sourceLocale: startLocale,
        title: untouched ? t("Nouveau projet", startLocale) : d.title,
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
  /** Critères de suggestion volontairement désactivés par l'utilisateur.
   * C'est un état d'EXPLORATION local : il n'écrase aucune réponse du dossier. */
  const [filtersOff, setFiltersOff] = useState<SuggestionFilterId[]>([]);
  /** Critères choisis à la main pour explorer d'AUTRES capteurs. Cet état est
   * distinct des réponses : il ne modifie ni les exigences ni le montage du
   * dossier, et chaque choix REMPLACE le critère de même nature (jamais
   * d'intersection impossible « vissé ET CMS »). */
  const [explore, setExplore] = useState<ExplorationChoice>({});

  const [selectionAnnounce, setSelectionAnnounce] = useState("");
  /** Fiche détaillée d'un capteur (cotes, sources, téléchargement STEP). */
  const [detailSensorId, setDetailSensorId] = useState<string | null>(null);
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

  const [ndaDialogOpen, setNdaDialogOpen] = useState(false);
  const [bookingCountry, setBookingCountry] = useState<string | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [cablePanelOpen, setCablePanelOpen] = useState(false);
  const [volumeError, setVolumeError] = useState<string | null>(null);
  /** Le modèle 3D reste en mémoire tant que ce partage n'est pas explicitement demandé. */
  const [shareModel, setShareModel] = useState(false);
  /** Pointage du câble dans la 3D : trajet visé et rôle du prochain point. */
  const [routingTarget, setRoutingTarget] = useState<RoutingTarget>({ kind: "base" });
  const [routingSlot, setRoutingSlot] = useState<RoutingSlot>("sensor");
  const [tab, setTab] = useState("besoin");
  useEffect(() => {
    if (tab !== "montage") return;
    setDossier(d => {
      if (d.title.trim() && d.title !== t("Nouveau projet", isLocale(d.sourceLocale) ? d.sourceLocale : "fr")) return d;
      const title = suggestedProjectTitle(d.requirements.find(r => r.key === "detection_goal")?.value ?? "");
      return title ? { ...d, title } : d;
    });
  }, [tab]);
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
  const [busyOperation, setBusyOperation] = useState<ReviewOperation>(null);
  // Verrou dédié au choix NDA : une seule bascule à la fois, relectures inhibées.
  const ndaToggleRef = useRef(false);
  const ndaSectionRef = useRef<HTMLButtonElement | null>(null);
  const [reviewSections, setReviewSections] = useState<string[]>(["resume", "projet", "envoi"]);

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
      setNdaDialogOpen(false);
      setSummaryMessage(t("Votre fiche NDA est prête. Ouvrez les informations NDA pour déposer votre document signé et suivre sa vérification."));
    } catch (error) {
      if (contextGenRef.current !== gen) return;
      setNdaError(
        error instanceof Error ? error.message : t("La préparation du NDA n'a pas abouti."),
      );
    }
  }, [applyNdaStatus, serverDossierId]);

  /** Contrôleur d'écriture/lecture du choix NDA : verrou unique, époques,
   * réponses périmées ignorées. La logique est isolée dans `nda-sync`. */
  const ndaSync = useMemo(
    () =>
      createNdaSync<NdaStatusView>({
        setError: (m) => setNdaError(m),
        setBusy: (b) => {
          busyRef.current = b;
          setBusy(b);
          setBusyOperation(b ? "nda" : null);
          ndaToggleRef.current = b;
        },
        apply: (status) => applyNdaStatus(status),
      }),
    [applyNdaStatus],
  );
  // Démontage : plus rien de ce qui est en vol ne doit s'appliquer.
  useEffect(() => () => ndaSync.invalidate(), [ndaSync]);

  const refreshNdaStatus = useCallback(async () => {
    if (!serverDossierId) return;
    const gen = contextGenRef.current;
    await ndaSync.refresh(
      async () => {
        const status = await fetchNdaStatus(serverDossierId);
        // Réponse née d'un autre dossier : elle ne doit pas s'appliquer ici.
        if (contextGenRef.current !== gen) throw new StaleContextError();
        return status;
      },
      (error) =>
        error instanceof StaleContextError
          ? ""
          : error instanceof Error
            ? error.message
            : t("Statut NDA indisponible."),
    );
  }, [ndaSync, serverDossierId]);

  /** Le NDA est optionnel : cette case porte le choix explicite du client.
   * Pour un dossier enregistré, le serveur fait autorité — l'écran garde le
   * dernier état connu jusqu'au succès, sauf pour une ACTIVATION, appliquée
   * immédiatement puisqu'elle ne fait que bloquer davantage. Un seul
   * changement à la fois ; pendant ce temps, envoi, dépôt et préparation sont
   * inhibés par le même verrou. */
  const toggleNdaRequirement = useCallback(
    async (next: boolean) => {
      if (ndaSync.busy || busyRef.current) return;
      setNdaError(null);
      const plan = planNdaToggle(nda, next, {
        serverDossier: Boolean(serverDossierId),
        backendReady: Boolean(backend?.ready),
      });
      if (plan.kind === "blocked" || plan.kind === "offline") {
        setNdaError(t(plan.reason));
        return;
      }
      if (!next && ndaDisableNeedsConfirmation(nda) && !window.confirm(t(NDA_DISABLE_CONFIRMATION)))
        return;
      if (plan.kind === "local") {
        setNda(plan.next);
        if (!next) setNdaPreview(null);
        return;
      }
      const gen = contextGenRef.current;
      const ok = await ndaSync.save(
        async () => {
          const status = await setNdaRequirement(serverDossierId!, next);
          if (contextGenRef.current !== gen) throw new StaleContextError();
          return status;
        },
        {
          optimistic: () => {
            if (plan.optimistic) setNda(plan.optimistic);
          },
          onSaved: (status) => {
            if (!status.nda_required) setNdaPreview(null);
          },
          errText: (error) =>
            error instanceof StaleContextError
              ? ""
              : error instanceof Error
                ? error.message
                : t("Le choix n'a pas pu être enregistré côté Standex."),
        },
      );
      // Le serveur fait autorité : après un échec, on relit plutôt que de
      // garder un état inventé.
      if (!ok && contextGenRef.current === gen) void refreshNdaStatus();
    },
    [backend?.ready, nda, ndaSync, refreshNdaStatus, serverDossierId],
  );

  /** À la reprise, le statut local est volontairement remis à zéro puis relu au
   * serveur. Une panne reste visible et ne fabrique jamais de preuve locale. */
  useEffect(() => {
    if (backend?.ready && serverDossierId) void refreshNdaStatus();
  }, [backend?.ready, serverDossierId, refreshNdaStatus]);

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
  // La décision (liaison, accords consommés, message) vit dans
  // `applyBindingCycle` : elle est testée sur l'enchaînement réel envoi →
  // incrément de version → recalcul.
  useEffect(() => {
    let alive = true;
    applyBindingCycle({
      input: {
        dossier,
        nda,
        consents: [],
        reviewAcknowledged: false,
        additionalConstraints: extraConstraints,
        serverDossierId,
      },
      serverRevision,
      committedRevision: committedRevisionRef.current,
      privacy: privacyRef.current,
    })
      .then((cycle) => {
        if (!alive) return;
        const next = cycle.binding;
        setBinding((previous) => (previous && sameBinding(previous, next) ? previous : next));
        setPrivacy((p) => {
          const pruned = pruneStaleConsents(p, next);
          if (pruned !== p) {
            setAcknowledged(false);
            setConsentNotice(consentNoticeFor(cycle.afterCommit));
          }
          return pruned;
        });
        committedRevisionRef.current = null;
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

  /** Réponse de montage écrite par le client. Une fixation NOMMÉE là (« vissé »,
   * « screw or adhesive ») est une contrainte dure, même sans case cochée. */
  const mountingAnswer =
    dossier.requirements.find((r) => r.key === "mounting")?.value?.trim() || null;
  /** Un client décrit souvent tout son besoin dans une seule réponse. Une
   * fixation NOMMÉE reste une contrainte donnée par lui, quelle que soit la
   * question où il l'a écrite : on lit donc l'ensemble de ses réponses écrites.
   * Ce n'est toujours pas une déduction depuis un nom d'application. */
  const answersText = useMemo(
    () =>
      dossier.requirements
        .map((r) => r.value?.trim())
        .filter((v): v is string => !!v)
        .join(". ") || null,
    [dossier.requirements],
  );
  /** La réponse de montage prime ; si elle ne nomme aucune fixation, on lit
   * l'ensemble des réponses écrites, sans jamais rien deviner. */
  const mountingText =
    mountingAnswer && detectMountingIntent(mountingAnswer).explicit ? mountingAnswer : answersText;
  /* Les cartes lisent les données de détection EFFECTIVES : une ligne saisie et
     validée par l'administration Standex change donc les couples annoncés sans
     rechargement. */
  const dataRevision = useDetectionDataRevision();
  const candidates = useMemo(
    () =>
      evaluateCandidates({
        mounting: dossier.mounting,
        envelope: dossier.envelope,
        mountingText,
      }),
    [dossier.mounting, dossier.envelope, mountingText, dataRevision],
  );
  /** Compatibilité pédagogique du BESOIN, indépendante du verdict géométrique :
   * une contradiction posée par la personne elle-même (puissance dans le
   * capteur, aucun aimant autorisé) bloque toute proposition de produit tant
   * qu'elle n'est pas levée. Recalculée à chaque édition de réponse. */
  const fit = useMemo(
    () => assessApplicationFit(dossier.requirements, dossier.freeConstraints),
    [dossier.requirements, dossier.freeConstraints],
  );
  const fitBlocked = fit.blocking;
  /** Un point a réellement été levé dans cette session : seule condition pour
   * afficher la confirmation. Aucune confirmation gratuite au premier écran. */
  const fitEverBlockedRef = useRef(false);
  if (fitBlocked) fitEverBlockedRef.current = true;
  /** Ouvre la question visée et y place le curseur, SANS rien réécrire. */
  const goToRequirementStep = useCallback((key: string) => {
    const index = GUIDED_QUESTIONS.findIndex((q) => q.key === key);
    if (index >= 0) setFocusIdx(index);
    setTab("besoin");
    requestAnimationFrame(() => {
      const field =
        document.getElementById(`guide-${key}`) ?? document.getElementById(`req-${key}`);
      if (field) {
        field.scrollIntoView({ behavior: "smooth", block: "center" });
        (field as HTMLTextAreaElement).focus();
      }
    });
  }, []);
  // Catalogue: la connectique produit reste visible avant tout routage projet.
  const candidatesCabled = true;
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
  const ndaGuidance = ndaTransferGuidance(nda);
  const focusNdaSection = useCallback(() => {
    setTab("revue");
    setNdaDialogOpen(true);
    setReviewSections((sections) => (sections.includes("nda") ? sections : [...sections, "nda"]));
    requestAnimationFrame(() => {
      ndaSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      ndaSectionRef.current?.focus();
    });
  }, []);

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
          ? t(
              "Longueur mesurée : inconnue tant que le trajet est incomplet (inconnu n'est pas zéro).",
            )
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
  const adoptBaseline = useCallback(
    (d: DesignDossier) => {
      // Changement de contexte (création, import, reprise, réouverture) :
      // toute demande de version anglaise en cours cesse d'être la nôtre.
      resetEnglishReport();
      baselineRef.current = fingerprint(d);
      localeCapturedRef.current = true;
      if (d.sourceLocale !== getLocale()) setLocale(d.sourceLocale);
    },
    [resetEnglishReport],
  );

  const exportDossier = useCallback(() => {
    const blob = new Blob(
      [
        JSON.stringify(
          // Seul le CHOIX « je veux un NDA » voyage. Aucune preuve, aucun statut
          // vérifié, aucun document signé ne sort dans un fichier.
          buildDossierExport(dossier, undefined, { ndaRequested: nda.required }),
          null,
          2,
        ),
      ],
      {
        type: "application/json",
      },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dossier-conception-r${dossier.revision}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [dossier, nda.required]);

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
            t(
              "Votre projet a changé pendant la lecture : relancez l'import pour remplacer ce nouveau contenu.",
            ),
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
        // Le CHOIX de NDA du fichier est repris : c'est une demande, pas une
        // preuve. Le statut vérifié, lui, n'est jamais rétabli depuis un fichier.
        if (parsed.ndaRequested === true) setNda((n) => enableNda(n));
        setImportMessage(
          [
            ...parsed.notices,
            parsed.ndaRequested === true
              ? t(
                  "La demande d'accord de confidentialité du fichier est reprise : elle devra être vérifiée à nouveau côté Standex.",
                )
              : t("Aucun accord de confidentialité n'est demandé dans ce fichier."),
            t(
              "Contenu importé dans un projet local : aucun projet Standex n'y est rattaché, et l'accord de confidentialité comme l'accord d'envoi sont à refaire.",
            ),
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
  /** Version que NOUS venons de faire confirmer. Le compteur serveur qui avance
   * de 1 après un envoi réussi est une progression normale, pas une édition. */
  const committedRevisionRef = useRef<number | null>(null);
  /** Numéro de la dernière lecture de document demandée : une lecture tardive
   * n'ouvre jamais un fichier dans un autre dossier. */
  const docGenRef = useRef(0);

  /** Remise à zéro ATOMIQUE du contexte serveur.
   * Tout ce qui dépend d'un dossier serveur précis tombe en même temps : accord
   * d'envoi, relecture, statut NDA, fichier déjà préparé, contraintes ajoutées
   * et partage du modèle. Sans cela, un accord donné pour le dossier A pourrait
   * servir au dossier B.
   */
  const resetServerContext = useCallback(
    (dossierId: string | null, revision: number) => {
      contextGenRef.current += 1;
      // Changement de dossier : une lecture ou une bascule NDA en vol devient périmée.
      ndaSync.invalidate();
      setNdaError(null);
      importRequestRef.current += 1;
      docGenRef.current += 1;
      committedRevisionRef.current = null;
      setServerDossierId(dossierId);
      setServerRevision(revision);
      setNdaServer(null);
      setNda(INITIAL_NDA);
    setNdaDialogOpen(false);
    setBookingOpen(false);
    setBookingCountry(null);
    setVolumeError(null);
      setPrivacy((p) => ({ ...p, consents: [] }));
      setAcknowledged(false);
      setPreparedUpload(null);
      setBinding(null);
      setConsentNotice(null);
      setExtraConstraints("");
      setShareModel(false);
      setReopenedFrom(null);
      // Changement de dossier : l'historique d'envoi appartient au dossier quitté.
      setLastSent(null);
      // Un document ouvert appartient au dossier d'où il vient : il ne doit pas
      // rester affiché dans un dossier différent.
      setOpenDoc(null);
      setNdaPreview(null);
      return contextGenRef.current;
    },
    [ndaSync],
  );

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
      setSubmitMessageTone("danger");
      return;
    }
    if (!backend?.ready) {
      setSubmitMessage(
        backend?.message ??
          t("La liaison avec l'équipe Standex n'est pas active : rien n'a été déposé."),
      );
      setSubmitMessageTone("danger");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setBusyOperation("upload");
    setSubmitMessage(null);
    setSubmitMessageTone("info");
    // Contexte visé au moment du dépôt : si le dossier change entre-temps,
    // ce résultat ne doit surtout pas s'écrire dans le nouveau dossier.
    const gen = contextGenRef.current;
    const stale = () => contextGenRef.current !== gen;
    try {
      const bytes = memoryAssetBytes(dossier.workshopAsset.assetKey);
      if (!bytes) {
        setSubmitMessage(
          t(
            "Le fichier 3D n'est plus en mémoire de cet onglet : réimportez-le avant de le partager.",
          ),
        );
        setSubmitMessageTone("danger");
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
          statement: t("Partage du modèle 3D avec l'équipe Standex en charge du projet."),
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
        setSubmitMessageTone("danger");
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
        t(
          "Modèle 3D déposé et vérifié par le serveur. Relisez le résumé, confirmez votre accord, puis envoyez : le fichier ne sera pas déposé une seconde fois.",
        ),
      );
      setSubmitMessageTone("success");
    } catch (error) {
      setSubmitMessage(
        error instanceof Error ? error.message : t("Le fichier 3D n'a pas pu être partagé."),
      );
      setSubmitMessageTone("danger");
    } finally {
      busyRef.current = false;
      setBusy(false);
      setBusyOperation(null);
    }
  }, [
    backend,
    dossier.workshopAsset,
    dossier.title,
    nda.required,
    serverDossierId,
    serverRevision,
  ]);

  /** Version anglaise du rapport : produite côté serveur, jamais dans ce navigateur.
   * Un nouvel appel sur la même version ne crée ni doublon ni second envoi.
   */
  const runEnglishReport = useCallback(
    async (target: { dossierId: string; revisionId: string; contentHash: string }) => {
      if (!EXTERNAL_TRANSLATION_ENABLED || !supabase) return;
      // Verrou : un double clic, ou une relance pendant qu'une autre est en
      // cours, ne déclenche pas une seconde demande au traducteur.
      const run = englishLockRef.current.start();
      if (!run) return;
      setEnglishBusy(true);
      /** Une réponse n'écrit que si elle est TOUJOURS l'exécution courante. */
      const current = () => run.isCurrent();
      try {
        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;
        if (!accessToken) {
          if (current())
            setEnglishMessage(
              t("Session expirée : reconnectez-vous pour relancer la version anglaise."),
            );
          return;
        }
        if (!current()) return;
        setEnglishMessage(
          t("Version anglaise en cours de préparation pour cette version envoyée."),
        );
        const outcome = await requestEnglishReport({ data: { accessToken, ...target } });
        if (!current()) return;
        if (outcome.state === "ready") {
          setEnglishRetry(null);
          setEnglishMessage(null);
        } else {
          setEnglishMessage(englishReportMessage(outcome.code, t));
          if (outcome.state === "pending" && !outcome.retryable) setEnglishRetry(null);
        }
      } catch {
        if (current())
          setEnglishMessage(
            t(
              "La version anglaise n'a pas pu être produite. Votre projet d'origine est bien arrivé ; vous pouvez relancer.",
            ),
          );
      } finally {
        // Ne libère QUE son propre verrou : un abandon a déjà pu en ouvrir un autre.
        if (current()) {
          run.release();
          setEnglishBusy(false);
        }
      }
    },
    [],
  );

  /** Étape 2 : envoi. Aucun dépôt ici — ce qui est joint a déjà été déposé,
   * vérifié et relu. Le verrou empêche un double clic de créer deux versions.
   */
  const onSubmit = useCallback(async () => {
    if (busyRef.current) return;
    if (volumeError) {
      setSubmitMessage(volumeError);
      setSubmitMessageTone("danger");
      return;
    }
    if (shareModel && dossier.workshopAsset && !preparedUpload) {
      setSubmitMessage(
        t(
          "Préparez d'abord le partage du modèle 3D : il doit être déposé et vérifié avant votre accord d'envoi.",
        ),
      );
      setSubmitMessageTone("danger");
      return;
    }
    if (
      preparedUpload &&
      (preparedUpload.dossierId !== serverDossierId ||
        preparedUpload.revision !== serverRevision + 1)
    ) {
      setPreparedUpload(null);
      setSubmitMessage(
        t(
          "Le projet ou la version visée a changé depuis le dépôt du fichier : préparez à nouveau le partage.",
        ),
      );
      setSubmitMessageTone("danger");
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
    // Contexte figé à l'entrée : une réponse tardive, arrivée après un
    // changement de dossier, n'écrit plus jamais un succès ici.
    const gen = contextGenRef.current;
    // Dossier serveur RÉELLEMENT visé par cet envoi : sur un premier envoi il
    // n'existe qu'à partir du rappel de création. Le garder à null puis le
    // comparer au nouvel identifiant ferait passer l'envoi pour périmé.
    let targetDossierId = serverDossierId;
    // Phase réellement atteinte : elle interdit d'annoncer « rien n'a été
    // envoyé » après une révision déjà confirmée par le serveur.
    let phase: SubmitPhase = "before_send";
    setBusy(true);
    const outcomeKind = await runGuardedSubmit({
      lock: busyRef,
      generation: () => contextGenRef.current,
      setOperation: setBusyOperation,
      validate: () => checkSubmission(input),
      onInvalid: (problems) => {
        setSubmitMessage(problems.map((problem) => t(problem)).join(" "));
        setSubmitMessageTone("danger");
        if (!ndaOk) focusNdaSection();
      },
      onError: () => {
        setSubmitMessage(t(submitFailureMessage(phase)));
        setSubmitMessageTone("danger");
      },
      submit: async () => {
        setSubmitMessage(null);
        phase = "awaiting_confirmation";
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
            // Un rappel tardif ne doit plus écrire dans un autre dossier ouvert.
            onDossierCreated: (id: string) => {
              if (contextGenRef.current !== gen) return;
              targetDossierId = id;
              setServerDossierId(id);
            },
          }),
        );
        if (contextGenRef.current !== gen) return;
        if (outcome.status === "submitted") {
          phase = "committed";
          committedRevisionRef.current = serverRevision + 1;
          // Liaison du contenu réellement confirmé, rattachée au dossier
          // serveur exact (créé par cet envoi le cas échéant).
          const bound = await submissionBinding({ ...input, serverDossierId: targetDossierId });
          if (contextGenRef.current !== gen) return;
          setServerRevision((r) => r + 1);
          setPreparedUpload(null);
          setConsentNotice(null);
          setBookingCountry(input.dossier.business.siteCountry ?? null);
          setBookingOpen(true);
          // Le succès n'est PAS un message libre : il décrit la révision
          // exactement confirmée par le serveur. Dès que le brouillon change,
          // l'écran repasse de lui-même en « Modifications non envoyées ».
          setLastSent({
            dossierId: targetDossierId,
            revisionId: outcome.submissionId,
            revisionNumber: serverRevision + 1,
            submittedAt: outcome.at,
            binding: bound,
          });
          setSubmitMessage(null);
          setSubmitMessageTone("info");
          // Traduction externe COUPÉE : aucun appel automatique, aucun texte
          // transmis à un service de traduction, et aucun message à ce sujet.
          // Réactivable par `EXTERNAL_TRANSLATION_ENABLED` sans autre changement.
          const target = {
            dossierId: targetDossierId ?? "",
            revisionId: outcome.submissionId,
            contentHash: bound.contentHash,
          };
          if (
            externalTranslationAllowed(hasBoundConsent(privacy, "ai_assistant", bound)) &&
            target.dossierId
          ) {
            setEnglishRetry(target);
            await runEnglishReport(target);
          } else {
            setEnglishRetry(null);
            setEnglishMessage(null);
          }
        } else {
          setSubmitMessage(outcome.reason);
          setSubmitMessageTone("danger");
        }
      },
    });
    void outcomeKind;
    setBusy(false);
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
    ndaOk,
    focusNdaSection,
    volumeError,
  ]);

  const volume = dossier.business.annualVolume;
  // La désignation standard/custom vient du retour R&D publié, jamais de cet écran.
  const sampleRoute = routeSamples({ volume, isCustom: false });

  const embedded = chrome === "embedded";
  const projectHeaderRef = usePublishedHeaderHeight<HTMLElement>();
  const stepIndex =
    tab === "besoin" ? 0 : tab === "revue" ? 3 : tab === "resultat" ? 2 : 1;
  const steps = [
    { id: "besoin", label: t("Mon besoin"), hint: t("Ce que vous voulez détecter") },
    { id: "montage", label: t("Couples proposés"), hint: t("À tester dans votre montage") },
    { id: "resultat", label: t("Résultat"), hint: t("Ce que le test a montré") },
    { id: "revue", label: t("Avec Standex"), hint: t("Faire confirmer par Standex") },
  ];

  const question = GUIDED_QUESTIONS[focusIdx] ?? GUIDED_QUESTIONS[0]!;
  const guidedReq = dossier.requirements.find((r) => r.key === question.key) ?? null;
  const lastQuestion = focusIdx >= GUIDED_QUESTIONS.length - 1;

  /** Bascule une décision explicitement confiée à Standex. Ajout/retrait sans
   * doublon, et sans écrire aucune valeur technique dans le dossier. */
  const toggleDelegated = (key: string) =>
    setDossier((d) => {
      const rest = (d.delegatedDecisions ?? []).filter((k) => k !== key);
      return {
        ...d,
        delegatedDecisions: (d.delegatedDecisions ?? []).includes(key) ? rest : [...rest, key],
        updatedAt: new Date().toISOString(),
      };
    });

  /** Une question mise de côté par « Je ne sais pas encore » : décision traitée,
   * jamais une valeur connue. */
  const setQuestionAside = (key: string, aside: boolean) =>
    setDossier((d) => ({
      ...d,
      delegatedDecisions: aside
        ? [
            ...(d.delegatedDecisions ?? []).filter((k) => k !== delegatedQuestion(key)),
            delegatedQuestion(key),
          ]
        : (d.delegatedDecisions ?? []).filter((k) => k !== delegatedQuestion(key)),
      updatedAt: new Date().toISOString(),
    }));

  /* Choix structurés FACULTATIFS rattachés à deux questions guidées.
   * Les six questions restent du texte libre et RIEN n'en est déduit : ni
   * fixation, ni dimension, ni négation (« pas de vis » ne vaut pas « vissé »),
   * ni interprétation d'un nom d'application ou d'une autre langue. Seul un clic
   * ou une valeur saisie ci-dessous renseigne le dossier — et donc les filtres
   * de suggestion, qui restent modifiables ensuite. */
  const mountingChips: { kind: MountingChoice["kind"]; label: string }[] = [
    { kind: "screw", label: t("Fixation vissée") },
    { kind: "press_fit", label: t("Emboîtement dans un trou") },
    { kind: "pcb_through_hole", label: t("PCB — traversant") },
    { kind: "pcb_smd", label: t("PCB — report CMS") },
    { kind: "other", label: t("Autre montage") },
  ];

  const guidedStructured =
    question.key === "mounting" ? (
      <div className="panel-block mt-6">
        <p className="t-label">{t("Facultatif : précisez d'un clic")}</p>
        <p className="t-caption mt-1">
          {t(
            "Une fixation que vous NOMMEZ ici (« vissé ou collé ») est prise comme une contrainte. Rien d'autre n'est déduit de votre texte : un nom d'application n'implique aucune fixation. Ces choix restent modifiables.",
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {mountingChips.map((c) => {
            const active = dossier.mounting.kind === c.kind;
            return (
              <button
                key={c.kind}
                type="button"
                aria-pressed={active}
                className={`answer-filter${active ? " answer-filter-on" : ""}`}
                onClick={() => {
                  setDossier((d) => ({
                    ...d,
                    mounting: active
                      ? { kind: "undecided" }
                      : c.kind === "press_fit"
                        ? { kind: "press_fit", holeDiameterMm: 0 }
                        : c.kind === "other"
                          ? { kind: "other", description: "" }
                          : ({ kind: c.kind } as MountingChoice),
                    updatedAt: new Date().toISOString(),
                  }));
                  if (!active) setQuestionAside(question.key, false);
                }}
              >
                {active ? "✓ " : "+ "}
                {c.label}
              </button>
            );
          })}
        </div>
        {dossier.mounting.kind === "press_fit" ? (
          <div className="mt-3 max-w-xs">
            <Label className="t-label" htmlFor="guided-hole">
              {t("Diamètre du trou (mm)")}
            </Label>
            <Input
              id="guided-hole"
              className="t-metric w-32 text-right"
              inputMode="decimal"
              value={dossier.mounting.holeDiameterMm || ""}
              onChange={(e) =>
                setDossier((d) => ({
                  ...d,
                  mounting: { kind: "press_fit", holeDiameterMm: num(e.target.value) ?? 0 },
                  updatedAt: new Date().toISOString(),
                }))
              }
            />
            <p className="t-caption mt-1">
              {t("Laissez vide si vous ne le connaissez pas : inconnu ne vaut pas zéro.")}
            </p>
          </div>
        ) : null}
        {/* Dimensions demandées UNE SEULE FOIS, ici, en saisie structurée : le
            texte de cette question ne parle que de position et de fixation. */}
        <p className="t-label mt-5">{t("Facultatif : place disponible pour le capteur")}</p>
        <p className="t-caption mt-1">
          {t(
            "Rien n'est déduit de votre texte. Ces valeurs servent seulement à préfiltrer les capteurs, et restent modifiables.",
          )}
        </p>
        <div className="guided-envelope-fields mt-3">
          {(
            [
              ["lengthMm", "Longueur"],
              ["widthMm", "Largeur"],
              ["heightMm", "Hauteur"],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="guided-envelope-field">
              <Label className="t-label" htmlFor={`guided-${k}`}>
                {t(label)}
              </Label>
              <div className="guided-envelope-input">
                <Input
                  id={`guided-${k}`}
                  className="t-metric text-right"
                  inputMode="decimal"
                  value={dossier.envelope[k] ?? ""}
                  onChange={(e) => {
                    const v = num(e.target.value);
                    setDossier((d) => ({
                      ...d,
                      envelope: { ...d.envelope, [k]: v },
                      updatedAt: new Date().toISOString(),
                    }));
                    if (v !== null) setQuestionAside(question.key, false);
                  }}
                />
                <span className="t-metric">mm</span>
              </div>
            </div>
          ))}
        </div>
        <p className="t-caption mt-2">
          {t("Une dimension laissée vide reste inconnue et ne filtre rien.")}
        </p>
      </div>
    ) : null;

  const resetSearch = () => {
    if (busyRef.current || !guardReplace(t("réinitialiser la recherche"))) return;
    const fresh = createDossier(undefined, getLocale());
    setDossier(fresh); adoptBaseline(fresh); loadWorkshop(null); resetServerContext(null, 0);
    setConnectorDraft(EMPTY_CONNECTOR_DRAFT); setConnectorError(null);
    setFiltersOff([]); setExplore({}); setShowAllPairs(false); setFocusIdx(0);
    setPanel(null); setTab("besoin");
  };
  const besoinSection = (
    <div className="space-y-5">
      <Button variant="ghost" onClick={resetSearch}>{t("Réinitialiser ma recherche")}</Button>
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
                <span className="t-caption">
                  {t("source :")} {r.source}
                </span>
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
          <p className="t-label mt-4 text-[var(--primary)]">{t(question.category)}</p>
          <h2 className="t-display-m mt-2">{t(question.prompt)}</h2>
          <div className="mt-4"><NeedExamples questionKey={question.key} /></div>
          <Label htmlFor={`guide-${question.key}`} className="sr-only">
            {t(question.prompt)}
          </Label>
          <Textarea
            id={`guide-${question.key}`}
            rows={4}
            className="mt-6 min-h-[8.5rem] w-full px-5 py-[1.125rem] text-lg leading-[1.6]"
            value={guidedReq?.value ?? ""}
            placeholder={t(question.placeholder)}
            onChange={(e) => {
              setDossier((d) =>
                proposeRequirement(d, question.key, { value: e.target.value, source: "user" }),
              );
              if (e.target.value.trim()) setQuestionAside(question.key, false);
            }}
          />

          {guidedStructured}

          {isDelegated(dossier, delegatedQuestion(question.key)) ? (
            <p className="t-caption mt-4">
              {t(
                "Cette question est notée « à définir avec Standex ». C'est une décision prise, pas une valeur connue.",
              )}
            </p>
          ) : null}

          {guidedReq && guidedReq.state === "hypothesis" && guidedReq.value.trim() ? (
            <div className="relative mt-5 overflow-hidden rounded-[var(--r-md)] bg-[var(--warning-soft)] p-4 pl-5 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--warning)]">
              <p className="text-base">
                {t(
                  "Cette réponse vient d'une reprise ou d'une déduction. Confirmez-la si elle est juste.",
                )}
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
                // Ne rien effacer et ne rien fabriquer : la question est notée
                // comme traitée « à définir avec Standex », sans valeur.
                setQuestionAside(question.key, true);
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
              {lastQuestion ? t("Voir les couples proposés") : t("Continuer")}
            </Button>
          </div>

          <details className="project-answer-details mt-7">
            <summary className="t-caption flex min-h-11 cursor-pointer list-none items-center gap-2 py-2">
              {t("Ajouter une précision")}
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
            <div className="mt-4 ml-4">
              <Label htmlFor="free-constraints" className="t-label">
                {t("Autre chose à nous dire")}
              </Label>
              <Textarea
                id="free-constraints"
                rows={3}
                className="mt-2 text-base"
                value={dossier.freeConstraints}
                onChange={(e) => setDossier((d) => ({ ...d, freeConstraints: e.target.value }))}
              />
            </div>
          </details>
        </div>
      )}

      {showAdvanced ? (
        <div className="panel-block">
          <Label htmlFor="free-constraints-advanced" className="t-label">
            {t("Ajouter une précision")}
          </Label>
          <Textarea
            id="free-constraints-advanced"
            rows={3}
            className="mt-2 text-base"
            value={dossier.freeConstraints}
            onChange={(e) => setDossier((d) => ({ ...d, freeConstraints: e.target.value }))}
          />
        </div>
      ) : null}
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

  /* ---------------------------------------------------------------- */
  /* Filtres déduits des réponses structurées                          */
  /* ---------------------------------------------------------------- */
  /** Ces filtres ne viennent QUE des réponses structurées (montage déclaré,
   * diamètre de trou, encombrement chiffré). Aucun nom d'application n'est
   * interprété. Les désactiver n'écrit rien dans le dossier : c'est une aide à
   * l'exploration, pas une exigence. */
  const filterInput = { mounting: dossier.mounting, envelope: dossier.envelope };
  const answerFilters = useMemo(
    () =>
      suggestionFilters({
        mounting: dossier.mounting,
        envelope: dossier.envelope,
        // La fixation NOMMÉE dans la réponse écrite compte même quand la case
        // de montage vaut « autre » ou « à décider ».
        mountingText,
      }),
    [dossier.mounting, dossier.envelope, mountingText],
  );
  /** Critères réellement affichés : les réponses, dont chaque critère peut être
   * REMPLACÉ par un critère d'exploration de même nature. */
  const shownFilters = useMemo(
    () => mergeFilters(answerFilters, explorationFilters(explore)),
    [answerFilters, explore],
  );
  const activeFilterIds = useMemo(
    () => shownFilters.map((f) => f.id).filter((id) => !filtersOff.includes(id)),
    [shownFilters, filtersOff],
  );
  /** Chaque candidat porte les filtres ACTIFS qui l'écartent. Lever un filtre
   * fait réellement réapparaître les capteurs concernés : la liste n'est pas
   * pré-réduite en amont. */
  const candidateRows = useMemo(
    () =>
      candidates
        .map((c) => ({
          candidate: c,
          blocked: blockedBy(sensorById(c.id), shownFilters, activeFilterIds, {
            mounting: dossier.mounting,
            envelope: dossier.envelope,
          }),
        }))
        .sort(
          (a, b) =>
            (a.candidate.status === "kept" ? 0 : a.candidate.status === "to_verify" ? 1 : 2) -
            (b.candidate.status === "kept" ? 0 : b.candidate.status === "to_verify" ? 1 : 2),
        ),
    [candidates, shownFilters, activeFilterIds, dossier.mounting, dossier.envelope],
  );

  /** Les critères actifs filtrent les suggestions. Les lever permet d'explorer
   * d'autres montages sans réécrire les exigences du dossier. */
  const plausibleCandidates = useMemo(
    () => candidateRows.filter((r) => r.blocked.length === 0 && r.candidate.id !== "GENERIC"),
    [candidateRows],
  );
  const otherCandidates = useMemo(
    () => candidateRows.filter((r) => r.blocked.length > 0 || r.candidate.status === "excluded"),
    [candidateRows],
  );

  /** Trois couples au maximum, dans l'ordre décidé par `pair-cards.ts` : les
   * couples documentés au registre d'abord, l'ordre du moteur ensuite. Un
   * capteur déjà choisi dans un dossier repris ouvre la liste. */
  const suggestedPairs = useMemo(
    () =>
      pairCards(
        plausibleCandidates.map((r) => r.candidate.id),
        { limit: 3, preferredSensorId: dossier.selectedSensorId ?? null },
      ),
    [plausibleCandidates, dossier.selectedSensorId],
  );
  /** Liste complète repliée : les mêmes couples, en cartes compactes. */
  const allPairs = useMemo(
    () =>
      pairCards(
        candidateRows.map((r) => r.candidate.id),
        { limit: candidateRows.length, preferredSensorId: dossier.selectedSensorId ?? null },
      ),
    [candidateRows, dossier.selectedSensorId],
  );
  const customPair = pairCardFor(sensorById(CUSTOM_SENSOR_ID));
  const offerCustom = suggestedPairs.length === 0 || dossier.mounting.kind.startsWith("pcb_") || plausibleCandidates.some(r => isPcbSensor(r.candidate.id) && r.candidate.id !== CUSTOM_SENSOR_ID);
  /** Liste complète dépliée ou non : un état explicite, pour que le lien soit
   * un vrai lien et non l'ergonomie par défaut d'un dépliant. */
  const additionalPairs = allPairs.filter((c) => !suggestedPairs.some((s) => s.sensorId === c.sensorId && s.magnetId === c.magnetId));
  const [showAllPairs, setShowAllPairs] = useState(false);

  /** Choisir un capteur = une présélection de GAMME, jamais une commande ni une
   * validation R&D. La délégation à Standex est levée par ce choix explicite. */
  const chooseSensor = (id: string, name: string, magnetId?: string) => {
    const base = workshopDraftRef.current ?? workshop ?? dossier.workshop ?? DEFAULT_WORKSHOP;
    const aligned = magnetId ? pairDemonstration(base, id, magnetId) : applyPairSelection(base, id);
    // Un montage déjà enregistré peut porter un aimant choisi volontairement.
    // La présélection du capteur aligne le reste de l'atelier sans l'écraser.
    // MAIS un couple demandé explicitement (« Tester ce couple ») impose son
    // aimant : sinon l'atelier ouvrirait un autre duo que celui de la carte.
    applyWorkshopConfig(
      magnetId
        ? { ...aligned, magnetModel: magnetId }
        : dossier.workshop
          ? { ...aligned, magnetModel: base.magnetModel }
          : aligned,
    );
    setWorkshopEpoch((e) => e + 1);

    setDossier((d) => ({
      ...d,
      selectedSensorId: id,
      sensorSyncConfirmed: true,
      delegatedDecisions: (d.delegatedDecisions ?? []).filter((k) => k !== DELEGATED_SENSOR),
    }));
    setSelectionAnnounce(
      msg("{0} est choisi pour votre projet. Le résumé du projet est mis à jour.", [name]),
    );
  };
  const delegateSensor = () => {
    setDossier((d) => ({
      ...d,
      selectedSensorId: null,
      sensorSyncConfirmed: true,
      delegatedDecisions: [
        ...(d.delegatedDecisions ?? []).filter((k) => k !== DELEGATED_SENSOR),
        DELEGATED_SENSOR,
      ],
    }));
    setSelectionAnnounce(
      t("Le choix du capteur est confié à Standex. Ce n'est pas une validation technique."),
    );
  };

  /** Rangée de puces : les critères réellement actifs, rien d'autre. Aucun
   * encadré : c'est une ligne de lecture posée sous le sous-titre. */
  const filterChips = shownFilters.length ? (
    <div className="flex flex-wrap items-center gap-2">
      {shownFilters.map((f) => {
        const on = !filtersOff.includes(f.id);
        return (
          <button
            key={f.id}
            type="button"
            className="answer-filter"
            data-source={f.source}
            aria-pressed={on}
            onClick={() =>
              setFiltersOff((off) =>
                off.includes(f.id) ? off.filter((x) => x !== f.id) : [...off, f.id],
              )
            }
          >
            <span aria-hidden="true">{on ? "✓" : "+"}</span>
            <span>{t(f.label)}</span>
            {f.source === "exploration" ? (
              <span className="t-caption">{t("· autre critère")}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  ) : null;

  /** Tout le réglage fin des critères, replié derrière un seul lien : les
   * réponses ne sont jamais modifiées ici, seule la liste affichée change. */
  const filterAdjust = (
    <details className="filter-adjust">
      <summary className="t-body min-h-11 cursor-pointer list-none py-2">
        {t("Ajuster les critères ⌄")}
      </summary>
      <div className="mt-2 space-y-3">
        {/* Résumé des critères RÉELLEMENT utilisés, avec la réponse d'origine
            telle qu'elle a été écrite. Le bouton ramène aux questions, où les
            réponses sont préremplies et modifiables : les réponses non touchées
            sont conservées, et la liste se recalcule à la validation. */}
        <div className="panel-block space-y-2" data-testid="criteria-summary">
          <p className="t-label">{t("Critères utilisés")}</p>
          <dl className="space-y-3">
            {REQUIREMENT_ORDER.map((key) => {
              const answer = dossier.requirements.find((r) => r.key === key);
              return <div key={key}><dt className="t-label">{t(REQUIREMENT_LABELS[key]!)}</dt><dd className="t-body whitespace-pre-wrap">{requirementAnswer(dossier, key, t) || t("Non défini pour le moment")}</dd></div>;
            })}
          </dl>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            data-testid="edit-answers"
            onClick={() => setTab("besoin")}
          >
            {t("Modifier mes réponses")}
          </Button>
        </div>
        <p className="t-caption">
          {shownFilters.length
            ? t(
                "Vous pouvez désactiver un critère pour voir les autres capteurs. Vos réponses ne sont pas modifiées.",
              )
            : t("Aucun critère actif : tous les capteurs de l'aperçu sont affichés.")}
        </p>
        {filtersOff.length || explore.mountingKind || explore.shape ? (
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => {
              setFiltersOff([]);
              setExplore({});
            }}
          >
            {t("Rétablir mes réponses")}
          </Button>
        ) : null}

        {/* Exploration volontaire : d'AUTRES critères que ses réponses, sans
            jamais modifier les réponses ni le montage du dossier. Un choix
            remplace le critère de même nature : pas de « vissé ET CMS ». */}
        <p className="t-caption">
          {t(
            "Ces critères servent seulement à regarder d'autres capteurs. Ils remplacent le critère correspondant de vos réponses, ils ne s'y ajoutent pas, et vos réponses restent intactes.",
          )}
        </p>
        <div>
          <Label className="t-label">{t("Autre fixation")}</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {EXPLORABLE_MOUNTINGS.map((m) => {
              const on = explore.mountingKind === m.kind;
              return (
                <button
                  key={m.kind}
                  type="button"
                  className="answer-filter"
                  aria-pressed={on}
                  onClick={() =>
                    setExplore(({ mountingKind: _drop, ...rest }) =>
                      on ? rest : { ...rest, mountingKind: m.kind },
                    )
                  }
                >
                  <span aria-hidden="true">{on ? "✓" : "+"}</span>
                  <span>{t(m.label)}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <Label className="t-label">{t("Autre forme de boîtier")}</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {EXPLORABLE_SHAPES.map((s) => {
              const on = explore.shape === s.shape;
              return (
                <button
                  key={s.shape}
                  type="button"
                  className="answer-filter"
                  aria-pressed={on}
                  onClick={() =>
                    setExplore(({ shape: _drop, ...rest }) =>
                      on ? rest : { ...rest, shape: s.shape },
                    )
                  }
                >
                  <span aria-hidden="true">{on ? "✓" : "+"}</span>
                  <span>{t(s.label)}</span>
                </button>
              );
            })}
          </div>
        </div>
        {explore.mountingKind || explore.shape ? (
          <>
            <p className="notice notice-info">
              {t(
                "Vous regardez des capteurs qui peuvent diverger de vos réponses. Rien n'est enregistré : vos exigences et votre montage sont inchangés.",
              )}
            </p>
            <Button variant="outline" size="sm" className="min-h-11" onClick={() => setExplore({})}>
              {t("Revenir à mes réponses")}
            </Button>
          </>
        ) : null}

        {shownFilters.length ? (
          <ul className="mt-2 space-y-1">
            {shownFilters.map((f) => (
              <li key={f.id} className="t-caption">
                <strong>{t(f.label)}</strong> — {t(f.technical)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  );

  /** Version encadrée, conservée pour la liste complète des candidats des
   * réglages avancés : même contenu, même comportement. */
  const filterControls = (
    <div className="panel-block space-y-3">
      {shownFilters.length ? (
        <p className="t-body">
          {answerFilters.length
            ? t("D'après vos réponses, nous ne montrons d'abord que les capteurs compatibles.")
            : t("Autres critères en cours. Vos réponses ne sont pas modifiées.")}
        </p>
      ) : null}
      {filterChips}
      {filterAdjust}
    </div>
  );

  const openWorkshopPanel = () => {
    setCablePanelOpen(false);
    setWorkshopMounted(true);
    setShowWorkshop(true);
    setPanel("atelier");
  };
  const openCableWorkshopPanel = () => {
    openWorkshopPanel();
    setCablePanelOpen(true);
    setWorkshopEpoch((e) => e + 1);
    setTab("montage");
  };
  /** Tester un couple = présélection de gamme + ouverture de l'atelier sur ce
   * couple. Ce n'est ni une commande ni une validation R&D. */
  const testPair = (card: PairCard) => {
    setCablePanelOpen(false);
    chooseSensor(card.sensorId, t(card.sensorName), card.magnetId);
    openWorkshopPanel();
  };
  /** Toutes les questions confiées à Standex : aucun critère ne vient des
   * réponses, on annonce donc les couples les plus courants. */
  const allQuestionsAside = GUIDED_QUESTIONS.every((q) =>
    isDelegated(dossier, delegatedQuestion(q.key)),
  );
  const pairsTitle = allQuestionsAside
    ? t("Couples les plus courants")
    : suggestedPairs.length >= 3
      ? t("Trois couples pour votre projet")
      : suggestedPairs.length === 2
        ? t("Deux couples pour votre projet")
        : suggestedPairs.length === 1
          ? t("Un couple pour votre projet")
          : t("Une solution sur mesure pour votre projet");
  /** Phrase de critères en langage courant, construite UNIQUEMENT à partir des
   * filtres réellement actifs : aucune contrainte n'est inventée. */
  const pairsSubtitle = activeFilterIds.length
    ? msg("{0}. Testez-les dans votre montage.", [
        shownFilters
          .filter((f) => activeFilterIds.includes(f.id))
          .map((f) => t(f.label))
          .join(", "),
      ])
    : t("Aucun critère actif : testez-les dans votre montage.");

  const pairCardView = (card: PairCard, index: number, compact = false) => {
    const chosen = dossier.selectedSensorId === card.sensorId;
    const blocked = candidateRows.find(r => r.candidate.id === card.sensorId)?.blocked ?? [];
    return (
      <div
        key={card.sensorId}
        data-testid="pair-card"
        className={`surface-interactive p-5 ${chosen ? "candidate-selected" : ""}`}
      >
        <PairThumbnail
          sensorId={card.sensorId}
          magnetId={card.magnetId}
          size={compact ? "compact" : "large"}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="t-label">
            {index === 0 && !compact ? t("Recommandé") : t(card.familyLabel)}
          </p>
          {chosen ? <Badge className="candidate-status-badge">{t("Choisi ✓")}</Badge> : null}
        </div>
        {/* Les références (MK04, M04) traversent le rendu inchangées. */}
        <p className="t-title-m">{card.couple}</p>
        {housingMaterial(sensorById(card.sensorId)) ? <p className="t-body">{t(housingMaterial(sensorById(card.sensorId))!)}</p> : null}
        {card.sensorId === CUSTOM_SENSOR_ID ? <p className="notice-info t-caption">{t("Conception sur mesure : forme, fixation et distances à définir avec Standex. Schéma illustratif, sans performance validée.")}</p> : null}
        {compact && blocked.length > 0 ? <p className="notice-warning t-caption">{t("Compromis nécessaire avec vos critères")} : {shownFilters.filter(f => blocked.includes(f.id)).map(f => t(f.label)).join(" · ")}</p> : null}
        {card.materialLabel ? (
          <p className="t-caption">{msg("Aimant {0}", [card.materialLabel])}</p>
        ) : null}
        {card.sensorId !== CUSTOM_SENSOR_ID ? <p className="t-body mt-2">{msg("{0}, {1}.", [t(card.fixingLabel), card.size])}</p> : null}
        <p className="t-body mt-2">
          {card.maxPullInMm === null ? (
            <span className="text-[var(--standex-blue-75)]">
              {card.guideUpMm !== null && card.guideToMm !== null
                ? msg("Plage du guide : {0} à {1} mm — {2} · {3}", [
                    formatMm(card.guideUpMm),
                    formatMm(card.guideToMm),
                    card.guideReference!,
                    card.guideApproach!,

                  ])
                : t(
                    card.hasGuideRange
                      ? "Plage du guide disponible"
                      : // La fiche produit existe : c'est la distance DE CE COUPLE
                        // qui n'est pas publiée. Les deux ne sont pas confondues.
                        "Fiche produit disponible · distances de ce couple non publiées",
                  )}
            </span>
          ) : (

            <strong>{msg("Détecte jusqu'à {0} mm", [formatMm(card.maxPullInMm)])}</strong>
          )}
        </p>
        <div className="mt-4">
          <Button
            variant={index === 0 && !compact ? "default" : "outline"}
            className="min-h-11 text-base"
            onClick={() => testPair(card)}
          >
            {t("Tester ce couple →")}
          </Button>
        </div>
        <button
          type="button"
          className="t-caption mt-2 min-h-11 underline"
          onClick={() => setDetailSensorId(card.sensorId)}
        >
          {t("Voir les détails")}
        </button>
      </div>
    );
  };

  const pairsSection = (
    <div className="space-y-4">
      <p className="sr-only" role="status" aria-live="polite">
        {selectionAnnounce}
      </p>
      {/* L'encart de compatibilité passe AVANT les produits. Tant qu'un point
          subsiste, aucune carte n'est proposée : ni les couples suggérés, ni la
          liste complète, ni la conception sur mesure, et aucun réglage de
          critères ne peut contourner ce point. */}
      <CompatibilityPanel
        assessment={fit}
        onGoToStep={goToRequirementStep}
        showResolved={fitEverBlockedRef.current}
      />
      {fitBlocked ? null : (
      <div className="panel-block-lg">
        <p className="t-label">{t("D'après vos réponses")}</p>
        <h2 className="t-display-m">{pairsTitle}</h2>
        <p className="t-body mt-2">{pairsSubtitle}</p>
        {/* Une seule rangée de puces sous le sous-titre ; tout le réglage fin
            est replié derrière « Ajuster les critères ». */}
        {filterChips ? <div className="mt-3">{filterChips}</div> : null}
        <div className="mt-1">{filterAdjust}</div>
      </div>
      )}
      {fitBlocked ? null : (
      <div className="pair-grid">{suggestedPairs.map((c, i) => pairCardView(c, i))}{offerCustom ? pairCardView(customPair, suggestedPairs.length) : null}</div>
      )}
      <div className="space-y-3">
        {fitBlocked ? null : (
        <p>
          <button
            type="button"
            className="text-link t-body min-h-11"
            aria-expanded={showAllPairs}
            onClick={() => setShowAllPairs((v) => !v)}
          >
            {showAllPairs
              ? t("Masquer les autres couples")
              : msg("Voir tous les couples possibles ({0})", [additionalPairs.length])}
          </button>
        </p>
        )}
        {showAllPairs && !fitBlocked ? (
          <div className="space-y-6">{[...new Set(additionalPairs.map(c => pairCategory(sensorById(c.sensorId))))].map(category => <section key={category} className="space-y-3"><h3 className="t-title-m">{t(category)}</h3><div className="pair-grid">{additionalPairs.filter(c => pairCategory(sensorById(c.sensorId)) === category).map((c, i) => pairCardView(c, i, true))}</div></section>)}</div>
        ) : null}
        {/* Deux décisions confiées à Standex : des liens discrets sur une même
            ligne. Une décision prise, jamais une valeur technique connue. */}
        <p className="t-caption flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="text-link t-caption min-h-11"
            aria-pressed={isDelegated(dossier, DELEGATED_SENSOR)}
            onClick={delegateSensor}
          >
            {t("Laisser Standex choisir pour moi")}
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            className="text-link t-caption min-h-11"
            aria-pressed={isDelegated(dossier, DELEGATED_MOUNTING)}
            onClick={() => toggleDelegated(DELEGATED_MOUNTING)}
          >
            {isDelegated(dossier, DELEGATED_MOUNTING)
              ? t("Placement confié à Standex")
              : t("Choisir le placement avec Standex")}
          </button>
        </p>
        {isDelegated(dossier, DELEGATED_SENSOR) ? (
          <p className="notice notice-info">
            {t(
              "Le choix du capteur est noté « à définir avec Standex ». C'est une décision prise, pas une validation technique.",
            )}
          </p>
        ) : null}
        {isDelegated(dossier, DELEGATED_MOUNTING) ? (
          <p className="notice notice-info">
            {t(
              "Le placement est noté « à définir avec Standex ». C'est une décision prise, pas une valeur connue ni une validation technique.",
            )}
          </p>
        ) : null}
        <p>
          <button
            type="button"
            className="text-link t-body min-h-11"
            onClick={() => setTab("revue")}
          >
            {t("Passer directement à Avec Standex")}
          </button>
        </p>
      </div>
    </div>
  );

  const candidatsSection = (
    <div className="space-y-4">
      <p className="notice notice-info">
        {t(
          "Ces capteurs sont des exemples à essayer. Les ingénieurs Standex vérifieront leur adaptation à votre projet après l'envoi.",
        )}
      </p>
      {/* Annonce lue par les lecteurs d'écran à chaque décision. */}
      <p className="sr-only" role="status" aria-live="polite">
        {selectionAnnounce}
      </p>
      {filterControls}

      <div className="panel-block flex flex-wrap items-center gap-3">
        <span className="t-body">{t("Vous n'êtes pas obligé de choisir une référence.")}</span>
        <Button
          variant={isDelegated(dossier, DELEGATED_SENSOR) ? "default" : "outline"}
          className="min-h-11 text-base"
          aria-pressed={isDelegated(dossier, DELEGATED_SENSOR)}
          onClick={delegateSensor}
        >
          {t("Choisir avec Standex")}
        </Button>
      </div>
      <div className="space-y-3">
        {plausibleCandidates.map(({ candidate: c }) => {
          const model = sensorById(c.id);
          const chosen = dossier.selectedSensorId === c.id;
          return (
            <div
              key={c.id}
              data-testid="candidate-card"
              className={`surface-interactive p-5 ${chosen ? "candidate-selected" : ""} ${
                c.status === "excluded" && c.id !== CUSTOM_SENSOR_ID ? "candidate-excluded" : ""
              }`}
            >
              <div className="grid gap-4 sm:grid-cols-[17rem_1fr]">
                <div>
                  <CandidateThumbnail
                    sensorId={c.id}
                    cabled={candidatesCabled}
                    fitToView
                    size="large"
                    scaleBar
                  />
                  <p className="t-caption mt-1">
                    {model.sourceFile
                      ? t(
                          "Aperçu 3D d'après les cotes de la fiche technique — ce n'est pas un modèle CAO de fabrication.",
                        )
                      : t("Schéma pédagogique proportionnel — ni modèle CAO ni cote validée.")}
                  </p>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Les références (MK03…) traversent t() inchangées ; seul un
                        libellé descriptif comme « Sur mesure » est traduit. */}
                    <span className="t-title-s">{t(c.name)}</span>

                    <Badge
                      className="candidate-status-badge"
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
                          : t("Hors des contraintes que vous avez déclarées")}
                    </Badge>
                    <span className="t-metric rounded-[var(--r-pill)] bg-[var(--surface-sunken)] px-2.5 py-1 t-caption">
                      {c.size}
                    </span>
                  </div>
                  {c.reasons[0] ? <p className="t-body mt-3">{t(c.reasons[0])}</p> : null}
                  {c.reasons.length > 1 ? (
                    <details className="mt-3">
                      <summary className="t-caption min-h-11 cursor-pointer py-2">
                        {t("Voir les détails")}
                      </summary>
                      <ul className="space-y-1.5 pl-5">
                        {c.reasons.slice(1).map((r, i) => (
                          <li key={i} className="t-caption list-disc">
                            {t(r)}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      className="min-h-11 text-base"
                      variant={chosen ? "default" : "secondary"}
                      aria-pressed={chosen}
                      onClick={() => chooseSensor(c.id, t(c.name))}
                    >
                      {chosen ? (
                        <>
                          <Check className="mr-1.5 size-4" aria-hidden="true" />
                          {t("Choisi ✓")}
                        </>
                      ) : c.id === CUSTOM_SENSOR_ID ? (
                        t("Partir sur du sur mesure")
                      ) : (
                        t("Choisir")
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={() => setDetailSensorId(c.id)}
                    >
                      {t("Voir les détails")}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {otherCandidates.length ? (
        <details className="panel-block">
          <summary className="t-title-s flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2">
            {msg("Voir les autres capteurs ({0}) — écartés par un critère actif", [
              String(otherCandidates.length),
            ])}
            <span className="technical-details-chevron" aria-hidden="true">
              ⌄
            </span>
          </summary>
          <ul className="mt-3 space-y-2">
            {otherCandidates.map(({ candidate: c, blocked }) => (
              <li key={c.id} className="panel-block">
                <p className="t-title-s">{t(c.name)}</p>
                <p className="t-caption t-metric">{c.size}</p>
                <ul className="mt-2 space-y-1">
                  {blocked.map((id) => {
                    const f = answerFilters.find((x) => x.id === id);
                    return f ? (
                      <li key={id} className="t-caption">
                        {msg("Écarté par le critère « {0} ». {1}", [t(f.label), t(f.technical)])}
                      </li>
                    ) : null;
                  })}
                  {c.reasons.map((r, i) => (
                    <li key={i} className="t-caption">
                      {t(r)}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="min-h-11"
                    onClick={() => chooseSensor(c.id, t(c.name))}
                  >
                    {t("Choisir ce capteur pour mon projet")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => setDetailSensorId(c.id)}
                  >
                    {t("Voir les détails")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="t-caption">{t(CANDIDATE_DISCLAIMER)}</p>
    </div>
  );

  /** Note de longueurs de la SEULE gamme choisie, jamais le catalogue entier. */
  const selectedRangeNote = dossier.selectedSensorId
    ? rangeCableLengthNote(dossier.selectedSensorId)
    : null;
  /** Le câble n'est PAS obligatoire à ce stade : tant que rien n'est demandé,
   * une longueur inconnue est un état normal, jamais une erreur. */
  const cableDefined =
    cabling.lengthChoice !== "undecided" ||
    activePoints.length > 0 ||
    cabling.declaredMotionStates.length > 0;
  /**
   * La section est ouverte si l'utilisateur l'a demandée OU si une référence est
   * déjà enregistrée (reprise d'un dossier). Aucune auto-sélection de connecteur.
   */
  /** Choix VOLONTAIRE de ne pas mettre de connecteur. Distinct du défaut d'un
   *  dossier neuf (fils nus sans décision) et distinct de « Je ne sais pas », qui
   *  confie le choix à Standex. Il persiste dans `delegatedDecisions`, donc dans
   *  l'enregistrement, l'export, la reprise et le résumé. */
  const noConnectorChosen =
    termination.kind === "bare_leads" &&
    isDelegated(dossier, CHOSEN_BARE_LEADS) &&
    !isDelegated(dossier, DELEGATED_CONNECTOR);
  const connectorPreference =
    !noConnectorChosen &&
    (connectorWanted ||
      (termination.kind !== "bare_leads" && !isDelegated(dossier, DELEGATED_CONNECTOR)));

  const cablageSection = (
    <div className="space-y-4">
      <div className="panel-block">
        <Label className="t-label">{t("Longueur du câble")}</Label>
        <p className="t-caption mt-1">
          {t(
            "Un choix non décidé reste inconnu : il ne vaut ni zéro, ni « sans câble ». Vous pouvez continuer sans le fixer.",
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {/* i18n-canonical : libellés traduits par t() au rendu. */}
          {(
            [
              ["undecided", "À définir avec Standex"],
              ["standard_to_confirm", "Longueur catalogue, à confirmer"],
              ["custom_to_confirm", "Longueur sur mesure, à confirmer"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={cabling.lengthChoice === value ? "default" : "outline"}
              className="min-h-11 text-base"
              aria-pressed={cabling.lengthChoice === value}
              onClick={() => {
                setCabling((c) => ({ ...c, lengthChoice: value }));
                const current = workshopDraftRef.current ?? workshop ?? dossier.workshop;
                if (current && value !== cabling.lengthChoice) {
                  const retained = value === "custom_to_confirm" || (value === "standard_to_confirm" && standardLengthsMm(current.sensorId).includes(current.cableLengthMm ?? -1));
                  applyWorkshopConfig({...current, cableLengthMm: retained ? current.cableLengthMm : null});
                }
                setDossier((d) => ({
                  ...d,
                  delegatedDecisions:
                    value === "undecided"
                      ? [
                          ...(d.delegatedDecisions ?? []).filter((k) => k !== DELEGATED_CABLE),
                          DELEGATED_CABLE,
                        ]
                      : (d.delegatedDecisions ?? []).filter((k) => k !== DELEGATED_CABLE),
                }));
              }}
            >
              {t(label)}
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          className="mt-3 min-h-11"
          onClick={openCableWorkshopPanel}
        >
          {t("Ouvrir l'étape câble de l'atelier 3D")}
        </Button>
      </div>

      {/* Récapitulatif automatique du VRAI montage : rien n'est ressaisi ici. */}
      <div className="panel-block">
        <Label className="t-label">{t("Ce que votre montage indique aujourd'hui")}</Label>
        <p className="t-body mt-2">
          {activePoints.length > 1
            ? msg("Longueur mesurée : {0}", [cableRouting.lengthLabel])
            : t("Longueur non mesurée : le trajet n'est pas encore tracé.")}
        </p>
        <p className="mt-1">
          {t("Longueur minimale demandée, marges comprises :")}{" "}
          <strong className="t-metric">
            {estimate.requiredMm === null
              ? cableDefined
                ? t("inconnue tant que le trajet n'est pas complet")
                : t("non demandée à ce stade")
              : `${estimate.requiredMm.toFixed(1)} mm`}
          </strong>
        </p>
        <p className="t-caption">
          {t(
            "Cette longueur n'est jamais une longueur approuvée : elle est vérifiée par les ingénieurs Standex.",
          )}
        </p>
        {cableDefined && estimate.warnings.length ? (
          <ul className="notice notice-warning mt-2 list-disc pl-8">
            {estimate.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : null}
        {cableDefined ? <p className="mt-2">{lengthVerdict.message}</p> : null}
      </div>

      {/* Connecteur : divulgation progressive. Replier ne supprime RIEN. */}
      <div className="panel-block">
        <label className="t-body flex min-h-11 items-center gap-3">
          <Checkbox
            checked={connectorPreference}
            onCheckedChange={(v) => {
              if (v === true) {
                // Ouvre la sélection, sans choisir aucun connecteur.
                setConnectorWanted(true);
                setDossier((d) => ({
                  ...d,
                  delegatedDecisions: (d.delegatedDecisions ?? []).filter(
                    (k) => k !== DELEGATED_CONNECTOR,
                  ),
                }));
                return;
              }
              // Repli volontaire : la référence enregistrée reste dans le dossier,
              // seule la décision est confiée à Standex.
              setConnectorWanted(false);
              setDossier((d) => ({
                ...d,
                delegatedDecisions: [
                  ...(d.delegatedDecisions ?? []).filter((k) => k !== DELEGATED_CONNECTOR),
                  DELEGATED_CONNECTOR,
                ],
              }));
            }}
          />
          {t("J'ai une préférence de connecteur")}
        </label>
        {!connectorPreference ? (
          <p className="t-caption mt-2">
            {t("Sans préférence, le choix du connecteur est confié à Standex.")}
          </p>
        ) : (
          <div className="mt-3">
            <p className="mt-1 text-sm">{terminationLabel(termination)}</p>
            <ul className="t-caption mt-1 list-disc pl-5">
              {connectorSummaryLines(termination, t).map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
            <Label className="t-label mt-3 block">
              {t("Boîtiers documentés par le fabricant")}
            </Label>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {DOCUMENTED_HOUSINGS.map((h) => {
                const selected =
                  termination.kind === "unqualified_connector" &&
                  termination.spec.mpn === h.housingMpn;
                return (
                  <button
                    key={h.housingMpn}
                    type="button"
                    className="connector-option surface-interactive p-4 text-left"
                    aria-pressed={selected}
                    onClick={() => {
                      const found = housingById(h.housingMpn);
                      if (!found) return;
                      setConnectorError(null);
                      setConnectorDraft((d) => draftFromHousing(found, d));
                      setDossier((d) => ({
                        ...d,
                        termination: terminationFromHousing(found),
                        delegatedDecisions: (d.delegatedDecisions ?? []).filter(
                          (k) => k !== DELEGATED_CONNECTOR,
                        ),
                      }));
                      setSelectionAnnounce(
                        msg("Connecteur {0} retenu comme préférence, à vérifier par les ingénieurs Standex.", [
                          h.housingMpn,
                        ]),
                      );
                    }}
                  >
                    <span className="t-title-s flex items-center gap-2">
                      {selected ? <Check className="size-4" aria-hidden="true" /> : null}
                      {housingLabel(h)}
                    </span>
                    <ConnectorPreview housing={h} />
                  </button>
                );
              })}
            </div>
            <p className="t-caption mt-2">
              {t(
                "Quelques boîtiers documentés seulement, pas le marché entier. Boîtier, contacts à sertir et embase restent trois références distinctes ; brochage, section de fil réelle et disponibilité restent inconnus et à vérifier par les ingénieurs Standex.",
              )}
            </p>
            <details className="mt-3">
              <summary className="t-caption min-h-11 cursor-pointer list-none py-2">
                {t("Saisir une référence précise")}
              </summary>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
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
              {connectorError ? (
                <p className="notice notice-danger mt-2">{connectorError}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11"
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
                  className="min-h-11"
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
                  {t("Enregistrer en « à vérifier par les ingénieurs Standex »")}
                </Button>
              </div>
              <p className="t-caption mt-1">
                {t(
                  "Aucune combinaison connecteur/capteur qualifiée n'est documentée dans ce projet : toute référence saisie, sa contrepartie et son brochage restent à vérifier par les ingénieurs Standex.",
                )}
              </p>
            </details>
          </div>
        )}
      </div>

      {/* Réglages avancés : coordonnées, réserves, tolérances, états. Repliés
          par défaut, JAMAIS effacés par le repli. */}
      <details className="panel-block" data-testid="routing-target-panel">
        <summary className="t-title-s flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2">
          {t("Réglages avancés du câble")}
          <span className="technical-details-chevron" aria-hidden="true">
            ⌄
          </span>
        </summary>
        <p className="t-caption mt-2">
          {t(
            "Ouvrez l'atelier 3D, activez « Pointer dans la 3D », puis cliquez la sortie de câble, les passages et le point de connexion sur les surfaces réellement affichées. Sans modèle 3D, la saisie numérique ci-dessous reste la voie exacte : une valeur inconnue reste inconnue, elle ne vaut pas zéro.",
          )}
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
            onClick={openWorkshopPanel}
          >
            {t("Vérifier la détection dans mon montage")}
          </Button>
        </div>
        {activeTarget.kind === "state" ? (
          <p className="t-caption mt-2">
            {t(
              "Chaque état déclaré a son propre trajet complet et sa pose de relevé. Les états non relevés ne sont jamais présentés comme couverts.",
            )}
          </p>
        ) : null}

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {pointFields(t("Point capteur"), cabling.sensorEndpoint, (p) =>
            setCabling((c) => ({ ...c, sensorEndpoint: p })),
          )}
          {pointFields(t("Point de connexion"), cabling.connectionEndpoint, (p) =>
            setCabling((c) => ({ ...c, connectionEndpoint: p })),
          )}
        </div>
        <div className="mt-3">
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
        <div className="mt-4">
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
                      covered
                        ? "t-caption text-[var(--success)]"
                        : "t-caption text-[var(--warning)]"
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
                cabling.declaredMotionStates.length === 0 ||
                uncoveredMotionStates(cabling).length > 0
              }
              onChange={(e) =>
                setCabling((c) => ({ ...c, motionCoverageConfirmed: e.target.checked }))
              }
            />
            {t("Je confirme que tous les états déclarés sont couverts par un trajet.")}
          </label>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
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
        <p className="t-caption mt-2">
          {t(
            "La tolérance fournisseur et le volume disponible pour loger le surplus sont deux informations différentes.",
          )}
        </p>
        <p className="mt-3">
          {t("Plus long trajet mesuré (polyligne) :")}{" "}
          <strong className="t-metric">
            {estimate.longestPathMm === null
              ? "inconnu"
              : `${estimate.longestPathMm.toFixed(1)} mm`}
          </strong>
        </p>
        {/* Uniquement la note de gamme du capteur RÉELLEMENT choisi : le
            catalogue des autres gammes n'a rien à faire dans votre projet. */}
        {selectedRangeNote ? (
          <p className="t-caption mt-2">
            {selectedRangeNote.range} : {selectedRangeNote.lengths}{" "}
            {selectedRangeNote.source.startsWith("http") ? (
              <a
                className="underline"
                href={selectedRangeNote.source}
                target="_blank"
                rel="noreferrer"
              >
                {t("voir la source fabricant")}
              </a>
            ) : (
              t("source interne Standex, à confirmer par les ingénieurs Standex")
            )}
          </p>
        ) : null}
      </details>
    </div>
  );

  /** Les couples sont dans « Couples proposés », le câble et le connecteur dans
   * « Avec Standex » : le lien mène à l'onglet où la saisie existe réellement,
   * pas dans un panneau, donc aucun cul-de-sac. */
  const goToInlineSection = (id: string) => {
    setTab(id === "section-cablage" ? "revue" : "montage");
    requestAnimationFrame(() => {
      const node = document.getElementById(id);
      if (node instanceof HTMLDetailsElement) node.open = true;
      node?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  /** Carte de résumé PARTAGÉE entre « Mon montage » et « Avec Standex ».
   * Aucun pourcentage automatique, aucune case cochée parce qu'un objet par
   * défaut existe : une délégation est une étape traitée, pas une validation. */
  const checklist = projectChecklist(dossier);
  const checklistState = checklistProgress(checklist);

  /** Onglet 2 : les COUPLES à tester, et rien au-dessus. Le placement se fait
   * dans l'atelier, le câble est dans « Avec Standex », le résumé de projet
   * reste dans « Avec Standex ». Le mode réglages détaillés garde ses champs. */
  const montageSection = (
    <div className="space-y-4">
      {pairsSection}
      {showAdvanced ? mechanicalFields : null}
      {showAdvanced ? (
        <>
          <section id="section-candidats" className="space-y-4 scroll-mt-24">
            <h2 className="t-title-m">{t("Capteurs possibles")}</h2>
            {candidatsSection}
          </section>
          <div className="panel-block">
            <div className="flex flex-wrap items-center gap-3">
              <Label className="text-base font-medium">{t("Atelier 3D (facultatif)")}</Label>
              <Button variant="outline" className="min-h-11 text-base" onClick={openWorkshopPanel}>
                {t("Vérifier la détection dans mon montage")}
              </Button>
              <span className="t-caption">
                {t(
                  "Formats acceptés : GLB autonome uniquement. Les fichiers STEP/IGES ne sont pas lus. Unités, échelle et pièce mobile restent à confirmer par vous. Vos réglages restent en mémoire même si vous refermez le panneau.",
                )}
              </span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );

  /** Libellé du couple réellement testé : reprise du verdict enregistré, jamais
   * un recalcul, jamais une validation technique. */
  const reviewTested = latestTestedPair(dossier.testedPairs);
  /** Ligne du guide réellement enregistrée avec l'essai : même source que le
   *  PDF et l'historique. Les bornes « up »/« to » restent documentaires. */
  const reviewGuideFact = reviewTested ? testedPairGuideFact(reviewTested, t, msg) : null;
  const reviewTestedLabel = reviewTested
    ? [
        `${reviewTested.sensorId} + ${reviewTested.magnetId}`,
        `${
          reviewTested.approach === "F1"
            ? t("face à face")
            : reviewTested.approach === "D3"
              ? t("perpendiculaire")
              : t("parallèle")
        } (${reviewTested.approach})`,
        ...(reviewGuideFact ? [reviewGuideFact.label] : []),
        reviewTested.verdict === "expected" && reviewTested.pullInMm !== null
          ? msg("détection prévue (ferme {0} mm, ouvre {1} mm)", [
              formatMm(reviewTested.pullInMm),
              reviewTested.dropOutMm === null ? "?" : formatMm(reviewTested.dropOutMm),
            ])
          : reviewTested.verdict === "none"
            ? t("pas de détection sur ce cycle")
            : reviewTested.verdict === "unpublished"
              ? // Aucune ligne publiée pour ce couple : on nomme l'absence, sans
                // laisser croire que la plage existe ailleurs.
                reviewGuideFact
                ? t("seuils de ce montage non caractérisés")
                : t("distances de ce couple non publiées")
              : t("position non documentée"),
        // Le mode illustratif est écrit dans le résumé du projet, jamais tu.
        // Avec une ligne du guide enregistrée, on rappelle la prudence réelle
        // (bornes « up »/« to » ≠ seuils du montage) au lieu du message
        // « distance non caractérisée », qui contredirait la plage affichée.
        ...(reviewTested.illustrative
          ? [t(reviewIllustrativeNote(reviewTested.sensorId, reviewGuideFact !== null))]
          : []),
        // La conclusion de revue dit la même vérité que l'écran Résultat.
        ...(fitBlocked ? [t(FIT_PANEL.demoNotApplication)] : []),
      ].join(" · ")
    : null;

  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);
  /** Résumé technique complet : PDF quand la fiche de revue existe réellement,
   * sinon le Markdown déjà exporté aujourd'hui. Aucun envoi. */
  const downloadTechnicalSummary = useCallback(async () => {
    setSummaryMessage(null);
    try {
      const { projectPdf } = await import("@/lib/leadmagnet/project-report");
      const bytes = await projectPdf(dossier, documentLogoSource(), {
        requis: nda.required, statut: ndaStatusLabel(nda), champs: nda.fields,
        preuve: nda.proof, contraintesComplementaires: extraConstraints,
      }, t, serverDossierId);
      const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url;
      a.download = projectPdfFilename(dossier.title, dossier.id, dossier.revision, serverDossierId); a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setSummaryMessage(t("Le rapport PDF n'a pas pu être produit sur cet appareil."));
    }
  }, [dossier, nda, extraConstraints, serverDossierId, t]);

  const projectContextFields = <ProjectContextFields key={`${dossier.id}-${contextGenRef.current}`} business={dossier.business}
    onInvalid={setVolumeError} onChange={business => setDossier(d => ({ ...d, business }))} />;

  /** Flux NDA existant, déplié sous la case de confidentialité. */
  const ndaFlow = (
    <div className="space-y-3">
            {/* Une erreur de choix reste visible même quand les champs NDA sont
                masqués : sans cela, un refus serveur passerait inaperçu. */}
            {ndaError ? (
              <p className="notice notice-warning flex items-start gap-2" role="alert">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {ndaError}
              </p>
            ) : null}

            {busyOperation === "nda" ? (
              <p className="notice notice-info" role="status">
                {t("Enregistrement de votre choix de confidentialité en cours…")}
              </p>
            ) : null}

            {!nda.required ? (
              <p className="notice notice-info" role="status">
                {t(
                  "Aucun accord de confidentialité n'est demandé pour ce projet. Cochez la case ci-dessus si vous en voulez un.",
                )}
              </p>
            ) : null}

            {nda.required ? (
              <>
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
                    disabled={busy}
                    onClick={() => {
                      void prepareNdaDocument("preview");
                    }}
                  >
                    {t("Aperçu du document rempli")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!ndaPreview || busy}
                    onClick={() => {
                      void prepareNdaDocument("download");
                    }}
                  >
                    <Download className="mr-1 h-4 w-4" />
                    {t("Télécharger le .docx non signé")}
                  </Button>
                  <Button
                    size="sm"
                    disabled={!backend?.ready || busy}
                    onClick={() => {
                      void prepareServerNda();
                    }}
                  >
                    {t("Préparer mon NDA pour vérification")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!backend?.ready || !serverDossierId || busy}
                    onClick={() => {
                      void refreshNdaStatus();
                    }}
                  >
                    {t("Actualiser le statut")}
                  </Button>
                </div>
                <p className="t-caption">
                  {t(
                    "« Préparer mon NDA » n'envoie aucune donnée de conception : seule une fiche vide est créée côté Standex pour que vous puissiez déposer le document signé et que l'équipe puisse le vérifier.",
                  )}{" "}
                  {ndaServer
                    ? `Statut côté Standex : ${ndaServer.nda_status}${
                        ndaServer.allows_transfer
                          ? t(" — transfert autorisé")
                          : t(" — transfert bloqué")
                      }.`
                    : t("Aucune fiche NDA créée pour l'instant.")}
                </p>

                {ndaPreview ? (
                  <div className="space-y-2">
                    <p className="t-caption">
                      {t("Aperçu local des clauses du document rempli (non signé) —")}{" "}
                      {ndaPreview.fileName}
                    </p>
                    <pre className="code-block max-h-80 overflow-auto whitespace-pre-wrap">
                      {ndaPreview.paragraphs.filter((p) => p.trim()).join("\n\n")}
                    </pre>
                  </div>
                ) : null}
                <p className="t-caption">
                  {t(
                    "Générer un document n'est pas une signature : aucune signature ni tampon n'est ajouté, le document reste non signé. Le statut « en vigueur » n'est accordé que sur preuve vérifiée côté Standex ; tant qu'il n'est pas atteint, aucun contenu confidentiel n'est transmis.",
                  )}
                </p>
              </>
            ) : null}
    </div>
  );

  /** Contraintes supplémentaires : champ de contexte, il vit maintenant dans le
   *  dépliant « Plus de détails sur le projet ». Même état, même écriture. */
  const extraConstraintsField = (
    <div>
      <Label className="t-label">{t("Contraintes supplémentaires")}</Label>
      <Textarea
        rows={3}
        className="mt-2"
        value={extraConstraints}
        onChange={(e) => setExtraConstraints(e.target.value)}
      />
    </div>
  );

  const transferredFiles = dossier.attachments.filter((a) => a.transferred);

  /** Accords, pièces réellement transmises et action d'envoi : logique inchangée.
   *  Seule la présentation change : deux accords courts, leur texte complet dans
   *  « Détails », et l'action d'envoi juste dessous. */
  const sendBlock = (
    <div className="space-y-3">
            {/* Aucune ligne « aucun fichier » : on ne parle des fichiers que
                lorsqu'il y en a réellement un. */}
            {transferredFiles.length > 0 ? (
              <p className="t-body">
                {t("Fichiers réellement transmis :")}{" "}
                {transferredFiles.map((a) => a.fileName).join(", ")}
              </p>
            ) : null}
            <p className="t-label">{t("Avant l'envoi")}</p>
            <label className="t-body flex min-h-11 items-center gap-3">
              <Checkbox
                checked={binding !== null && hasBoundConsent(privacy, "supabase_dossier", binding)}
                disabled={binding === null}
                onCheckedChange={(v) => {
                  setConsentNotice(null);
                  setPrivacy((p) =>
                    v && binding
                      ? grantConsent(p, {
                          kind: "supabase_dossier",
                          contentSummary: t(
                            "Exigences, montage, câblage, contraintes et contexte projet.",
                          ),
                          recipients: [t("Ingénieurs Standex"), t("Standex commercial")],
                          binding,
                        })
                      : {
                          ...p,
                          consents: p.consents.filter((c) => c.kind !== "supabase_dossier"),
                        },
                  );
                }}
              />
              {t("J'autorise l'envoi de ce projet aux ingénieurs Standex.")}
            </label>
            <details className="filter-adjust">
              <summary className="t-caption min-h-11 cursor-pointer list-none py-2">
                {t("Détails")}
              </summary>
              <p className="t-caption mt-1">
                {t("J'autorise l'envoi de ce contenu à Standex (ingénieurs et commercial).")}
              </p>
            </details>
            {consentNotice && submissionStatusKind(lastSent, binding) !== "sent" ? <p className="notice notice-warning">{consentNotice}</p> : null}

            {/* Traduction externe COUPÉE pour ce parcours : ni case d'accord, ni
                détails, ni relance, et aucun texte transmis à un service de
                traduction. Le code reste réactivable par
                `EXTERNAL_TRANSLATION_ENABLED`. */}
            {EXTERNAL_TRANSLATION_ENABLED ? (
              <>
                {englishMessage ? <p className="notice notice-info">{englishMessage}</p> : null}
                {englishRetry ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || englishBusy}
                    onClick={() => void runEnglishReport(englishRetry)}
                  >
                    {englishBusy
                      ? t("Version anglaise en cours…")
                      : t("Relancer la version anglaise")}
                  </Button>
                ) : null}
              </>
            ) : null}

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
                ? msg("Je partage aussi le fichier 3D « {0} » avec l'équipe en charge.", [
                    dossier.workshopAsset.fileName,
                  ])
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
                  {t(
                    "Le dépôt a lieu avant votre accord, pour que vous confirmiez exactement ce qui partira. Il n'est pas refait si l'envoi doit être retenté.",
                  )}
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
            {!backend?.authenticated && !backend?.ready ? (
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
            ) : !backend?.authenticated ? (
              <AuthPanel backend={backend} />
            ) : null}
            {reopenedFrom ? (
              <p className="t-caption">
                {/* Le compteur interne de versions n'est pas une information
                    utile au client : seul le fait de repartir d'un envoi l'est. */}
                {t(
                  "Contenu repris d'un envoi précédent. Le prochain envoi créera une nouvelle version de ce projet.",
                )}
              </p>
            ) : null}
            <ReviewSubmitControl
              busy={busy}
              operation={busyOperation}
              ndaGuidance={ndaGuidance}
              canRefreshNda={Boolean(serverDossierId && backend?.ready)}
              authenticated={Boolean(backend?.authenticated)}
              message={submitMessage}
              messageTone={submitMessageTone}
              status={submissionStatusKind(lastSent, binding)}
              lastSent={lastSent}
              onSubmit={() => void onSubmit()}
              onOpenNda={focusNdaSection}
              onRefreshNda={() => void refreshNdaStatus()}
            />
    </div>
  );

  /** Confidentialité : la carte NDA est posée AVANT le bloc d'envoi, pour que le
   *  choix de confidentialité soit fait avant la dernière action. La garde NDA
   *  et les états côté serveur sont inchangés : seul l'ordre de lecture change. */
  const ndaCard = (
    <div className="panel-block-lg space-y-3" data-testid="nda-card">
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <Checkbox
          ref={ndaSectionRef}
          className="mt-1"
          checked={nda.required}
          disabled={busy}
          onCheckedChange={(v) => {
            void toggleNdaRequirement(v === true);
            if (v === true) setNdaDialogOpen(true);
          }}
          aria-describedby="nda-optional-help"
        />
        <span className="space-y-1">
          <span className="t-body block font-medium">
            {t("Mon projet est confidentiel (NDA Standex)")}
          </span>
          <span id="nda-optional-help" className="t-caption block">
            {t(
              "Uniquement si votre entreprise en a besoin. Sans NDA, vous pouvez remplir et transmettre votre projet normalement : les accords de partage restent séparés et inchangés.",
            )}
          </span>
          <span className="t-caption block">{ndaStatusLabel(nda)}</span>
        </span>
      </label>
      {nda.required ? (
        <Button variant="outline" onClick={() => setNdaDialogOpen(true)}>
          {t("Ouvrir les informations NDA")}
        </Button>
      ) : null}
      <Dialog open={ndaDialogOpen} onOpenChange={setNdaDialogOpen}>
        <DialogContent
          className="max-w-3xl max-h-[85dvh] overflow-y-auto"
          aria-describedby="nda-dialog-description"
        >
          <DialogTitle>{t("Confidentialité du projet · NDA Standex")}</DialogTitle>
          <DialogDescription id="nda-dialog-description">
            {t("Complétez et vérifiez votre demande de confidentialité.")}
          </DialogDescription>
          {ndaFlow}
        </DialogContent>
      </Dialog>
    </div>
  );



  /** Trois questions facultatives : chaque puce pilote un choix DÉJÀ existant. */
  const optionalQuestions = (
    <div id="section-cablage" className="panel-block-lg space-y-5">
      <h3 className="t-title-m">{t("Câble et connexion")}</h3>

      <div>
        <Label className="t-label">{t("Longueur de câble")}</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {/* i18n-canonical : libellés traduits par t() au rendu. */}
          {(
            [
              ["undecided", "Je ne sais pas"],
              ["standard_to_confirm", "Standard"],
              ["custom_to_confirm", "Sur mesure"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={cabling.lengthChoice === value ? "default" : "outline"}
              className="min-h-11 text-base"
              aria-pressed={cabling.lengthChoice === value}
              onClick={() => {
                setCabling((c) => ({ ...c, lengthChoice: value }));
                const current = workshopDraftRef.current ?? workshop ?? dossier.workshop;
                if (current && value !== cabling.lengthChoice) {
                  const retained = value === "custom_to_confirm" || (value === "standard_to_confirm" && standardLengthsMm(current.sensorId).includes(current.cableLengthMm ?? -1));
                  applyWorkshopConfig({...current, cableLengthMm: retained ? current.cableLengthMm : null});
                }
                setDossier((d) => ({
                  ...d,
                  delegatedDecisions:
                    value === "undecided"
                      ? [
                          ...(d.delegatedDecisions ?? []).filter((k) => k !== DELEGATED_CABLE),
                          DELEGATED_CABLE,
                        ]
                      : (d.delegatedDecisions ?? []).filter((k) => k !== DELEGATED_CABLE),
                }));
              }}
            >
              {t(label)}
            </Button>
          ))}
        </div>
        {cabling.lengthChoice === "standard_to_confirm" ? <div className="mt-3">
          <Label htmlFor="standard-length">{t("Longueurs standard documentées")}</Label>
          <select id="standard-length" className="t-metric min-h-11 w-full"
            value={dossier.workshop?.cableLengthMm ?? ""}
            onChange={e => applyWorkshopConfig({...workshopDraftRef.current ?? workshop ?? dossier.workshop ?? DEFAULT_WORKSHOP, cableLengthMm:e.target.value ? Number(e.target.value) : null})}>
            <option value="">{t("Choisir une longueur")}</option>
            {standardLengthsMm(dossier.selectedSensorId ?? "").map(mm => <option key={mm} value={mm}>{mm / 10} cm</option>)}
          </select>
          <p className="t-caption">{standardLengthsMm(dossier.selectedSensorId ?? "").length ? t("Selon la version du capteur, à confirmer par Standex.") : t("Aucune longueur standard documentée pour cette gamme. À définir avec Standex.")}</p>
        </div> : null}
        {cabling.lengthChoice === "custom_to_confirm" ? <div className="mt-3">
          <Label htmlFor="custom-length">{t("Longueur sur mesure (cm)")}</Label>
          <Input id="custom-length" type="number" min="0.1" max="10000" step="0.1" value={dossier.workshop?.cableLengthMm != null ? dossier.workshop.cableLengthMm / 10 : ""}
            onChange={e => applyWorkshopConfig({...workshopDraftRef.current ?? workshop ?? dossier.workshop ?? DEFAULT_WORKSHOP, cableLengthMm:customLengthMm(e.target.value)})} />
        </div> : null}
        <button
          type="button"
          className="text-link mt-2"
          onClick={openCableWorkshopPanel}
        >
          {t("Préciser le trajet dans l'atelier câble")}
        </button>
      </div>

      <div>
        <Label className="t-label">{t("Connecteur")}</Label>
        <div className="mt-2 flex flex-wrap gap-2" data-testid="connector-choice">
          <Button
            variant={!connectorPreference && !noConnectorChosen ? "default" : "outline"}
            className="min-h-11 text-base"
            aria-pressed={!connectorPreference && !noConnectorChosen}
            onClick={() => {
              setConnectorWanted(false);
              setDossier((d) => ({
                ...d,
                delegatedDecisions: [
                  ...(d.delegatedDecisions ?? []).filter(
                    (k) => k !== DELEGATED_CONNECTOR && k !== CHOSEN_BARE_LEADS,
                  ),
                  DELEGATED_CONNECTOR,
                ],
              }));
            }}
          >
            {t("Je ne sais pas")}
          </Button>
          <Button
            variant={connectorPreference ? "default" : "outline"}
            className="min-h-11 text-base"
            aria-pressed={connectorPreference}
            onClick={() => {
              setConnectorWanted(true);
              setDossier((d) => ({
                ...d,
                delegatedDecisions: (d.delegatedDecisions ?? []).filter(
                  (k) => k !== DELEGATED_CONNECTOR && k !== CHOSEN_BARE_LEADS,
                ),
              }));
            }}
          >
            {t("J'ai une préférence")}
          </Button>
          <Button
            variant={noConnectorChosen ? "default" : "outline"}
            className="min-h-11 text-base"
            aria-pressed={noConnectorChosen}
            onClick={() => {
              // Choix volontaire : fils nus, marqueur explicite conservé, et le
              // choix n'est PAS confié à Standex.
              setConnectorWanted(false);
              setConnectorError(null);
              setDossier((d) => ({
                ...d,
                termination: DEFAULT_TERMINATION,
                delegatedDecisions: [
                  ...(d.delegatedDecisions ?? []).filter(
                    (k) => k !== DELEGATED_CONNECTOR && k !== CHOSEN_BARE_LEADS,
                  ),
                  CHOSEN_BARE_LEADS,
                ],
              }));
            }}
          >
            {t("Pas besoin de connecteur")}
          </Button>
        </div>
        {noConnectorChosen ? (
          <p className="t-caption mt-2">
            {t(
              "Vous avez choisi de rester sur des fils nus, sans connecteur. Ce choix est enregistré tel quel : il n'est pas confié à Standex et il apparaît dans le résumé de votre projet.",
            )}
          </p>
        ) : null}
        {connectorPreference ? (          <div className="mt-3">
            <p className="mt-1 text-sm">{terminationLabel(termination)}</p>
            <ul className="t-caption mt-1 list-disc pl-5">
              {connectorSummaryLines(termination, t).map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
            <Label className="t-label mt-3 block">
              {t("Boîtiers documentés par le fabricant")}
            </Label>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {DOCUMENTED_HOUSINGS.map((h) => {
                const selected =
                  termination.kind === "unqualified_connector" &&
                  termination.spec.mpn === h.housingMpn;
                return (
                  <button
                    key={h.housingMpn}
                    type="button"
                    className="connector-option surface-interactive p-4 text-left"
                    aria-pressed={selected}
                    onClick={() => {
                      const found = housingById(h.housingMpn);
                      if (!found) return;
                      setConnectorError(null);
                      setConnectorDraft((d) => draftFromHousing(found, d));
                      setDossier((d) => ({
                        ...d,
                        termination: terminationFromHousing(found),
                        delegatedDecisions: (d.delegatedDecisions ?? []).filter(
                          (k) => k !== DELEGATED_CONNECTOR,
                        ),
                      }));
                      setSelectionAnnounce(
                        msg("Connecteur {0} retenu comme préférence, à vérifier par les ingénieurs Standex.", [
                          h.housingMpn,
                        ]),
                      );
                    }}
                  >
                    <span className="t-title-s flex items-center gap-2">
                      {selected ? <Check className="size-4" aria-hidden="true" /> : null}
                      {housingLabel(h)}
                    </span>
                    <ConnectorPreview housing={h} />
                  </button>
                );
              })}
            </div>
            <p className="t-caption mt-2">
              {t(
                "Quelques boîtiers documentés seulement, pas le marché entier. Boîtier, contacts à sertir et embase restent trois références distinctes ; brochage, section de fil réelle et disponibilité restent inconnus et à vérifier par les ingénieurs Standex.",
              )}
            </p>
            <div className="mt-3">
              <Label htmlFor="connector-free-reference">{t("Autre référence de connecteur")}</Label>
              <Input id="connector-free-reference" value={termination.kind === "free_reference" ? termination.text : ""}
                onChange={e => setDossier(d => ({...d, termination: {kind:"free_reference", text:e.target.value, status:"to_verify_by_rnd"}}))} />
            </div>
            <details className="mt-3">
              <summary className="t-caption min-h-11 cursor-pointer list-none py-2">
                {t("Saisir une référence précise")}
              </summary>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
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
              {connectorError ? (
                <p className="notice notice-danger mt-2">{connectorError}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11"
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
                  className="min-h-11"
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
                  {t("Enregistrer en « à vérifier par les ingénieurs Standex »")}
                </Button>
              </div>
              <p className="t-caption mt-1">
                {t(
                  "Aucune combinaison connecteur/capteur qualifiée n'est documentée dans ce projet : toute référence saisie, sa contrepartie et son brochage restent à vérifier par les ingénieurs Standex.",
                )}
              </p>
            </details>
          </div>) : null}
      </div>

    </div>
  );

  const revueSection = (
    <div className="space-y-5">
      <div>
        <h2 className="t-display-m">{t("Envoyer à Standex pour confirmation.")}</h2>
        <p className="t-body mt-2">
          {t("Voici ce que nos ingénieurs recevront. Rien ne part sans votre clic.")}
        </p>
      </div>
      <div className="review-grid">
        <div className="space-y-4">
          <div className="panel-block-lg">
            <h3 className="t-title-m">{t("Votre projet")}</h3>
            <dl className="review-facts mt-3">
              {REQUIREMENT_ORDER.map((key) => {
                const requirement = dossier.requirements.find((r) => r.key === key);
                return (
                  <div key={key} className="review-fact">
                    {/* Libellé court À L'AFFICHAGE seulement : l'exigence garde son
                        libellé technique dans le dossier, l'export et l'envoi. */}
                    <dt className="review-fact-label">
                      {t(REVIEW_SHORT_LABELS[key] ?? REQUIREMENT_LABELS[key] ?? key)}
                    </dt>
                    <dd className="t-body">
                      {requirementAnswer(dossier, key, t) || t("Non défini pour le moment")}
                    </dd>
                  </div>
                );
              })}
              <div className="review-fact">
                <dt className="review-fact-label">{t("Couple testé")}</dt>
                <dd className="t-body">
                  {isDelegated(dossier, TRIAL_REQUEST) ? (
                    <strong>{t("Demande d'essai réel")}</strong>
                  ) : reviewTestedLabel ? (
                    reviewTestedLabel
                  ) : (
                    t("aucun couple testé pour l'instant")
                  )}
                </dd>
              </div>
            </dl>
          </div>

          {!isPcbSensor(dossier.selectedSensorId) ? optionalQuestions : null}

          <section className="panel-block-lg space-y-4">
            <h3 className="t-title-m">{t("Détails du projet")}</h3>
            {projectContextFields}
            {extraConstraintsField}
          </section>
          <Button variant="outline" disabled={Boolean(volumeError)} onClick={() => void downloadTechnicalSummary()}>{t("Télécharger le rapport complet du projet (PDF)")}</Button>
          {summaryMessage ? <p className="notice notice-info">{summaryMessage}</p> : null}
        </div>

        <div className="space-y-4">
          {/* Confidentialité d'abord, envoi ensuite. */}
          {ndaCard}
          <div className="panel-block-lg space-y-3">
            <h3 className="t-title-m">{t("Vos coordonnées")}</h3>
            <div>
              <Label className="t-label">{t("Nom")}</Label>
              <Input
                className="mt-2 w-full"
                value={dossier.business.contactName ?? ""}
                onChange={(e) =>
                  setDossier((d) => ({
                    ...d,
                    business: { ...d.business, contactName: e.target.value || null },
                  }))
                }
              />
            </div>
            <div>
              <Label className="t-label">{t("Entreprise")}</Label>
              <Input
                className="mt-2 w-full"
                value={dossier.business.contactCompany ?? ""}
                onChange={(e) =>
                  setDossier((d) => ({
                    ...d,
                    business: { ...d.business, contactCompany: e.target.value || null },
                  }))
                }
              />
            </div>
            <div>
              <Label className="t-label">{t("E-mail professionnel")}</Label>
              <Input
                className="mt-2 w-full"
                type="email"
                value={dossier.business.contactEmail ?? ""}
                onChange={(e) =>
                  setDossier((d) => ({
                    ...d,
                    business: { ...d.business, contactEmail: e.target.value || null },
                  }))
                }
              />
            </div>
            <div>
              <Label htmlFor="contact-phone" className="t-label">{t("Numéro de téléphone")}</Label>
              <Input id="contact-phone" type="tel" autoComplete="tel" maxLength={80} value={dossier.business.contactPhone ?? ""} onChange={(e) => setDossier((d) => ({ ...d, business: { ...d.business, contactPhone: e.target.value || null } }))} />
            </div>
            <div>
              <Label htmlFor="site-city" className="t-label">{t("Ville du site")} *</Label>
              <Input id="site-city" autoComplete="address-level2" required maxLength={160} value={dossier.business.siteCity ?? ""} onChange={e => setDossier(d => ({ ...d, business: { ...d.business, siteCity: e.target.value || null } }))} />
            </div>
            <div>
              <Label htmlFor="site-country" className="t-label">{t("Pays du site")} *</Label>
              <select id="site-country" required className="t-body min-h-11 w-full rounded-[var(--r-sm)] bg-[var(--surface-sunken)] p-3" value={dossier.business.siteCountry ?? ""} onChange={e => setDossier(d => ({ ...d, business: { ...d.business, siteCountry: e.target.value || null } }))}>
                <option value="">{t("Sélectionnez le pays de votre site")}</option>
                {COUNTRY_CODES.map(code => ({ code, name: new Intl.DisplayNames([getLocale()], { type: "region" }).of(code) ?? code })).sort((a,b) => a.name.localeCompare(b.name, getLocale())).map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
              {salesContactFor(dossier.business.siteCountry) ? <p className="t-caption mt-2">{salesContactFor(dossier.business.siteCountry)!.name} · {t(salesContactFor(dossier.business.siteCountry)!.territory)}</p> : null}
            </div>
            {/* La confidentialité est traitée AVANT : ici ne reste que la
                dernière action logique, l'envoi. */}
            <hr className="standex-rule" />
            {sendBlock}
            <p className="t-caption">{t("Réponse d'un ingénieur sous 2 jours ouvrés.")}</p>
          </div>

          {lastSent ? (
            <div className="panel-block-lg space-y-3" data-testid="project-followup">
              <h3 className="t-title-m">{t("Suivi de mon projet")}</h3>
              {/* Les trois actions d'après-envoi sont regroupées ici : espace,
                  rendez-vous, déconnexion. Elles ne sont plus dispersées dans le
                  formulaire. Les règles métier des échantillons restent
                  appliquées en arrière-plan, sans texte de seuil ici. */}
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  className="min-h-11 text-base"
                  onClick={() => setPanel("espace")}
                >
                  {t("Ouvrir mon espace (mes projets, suivi, variantes)")}
                </Button>
                {bookingCountry ? (
                  <Button
                    variant="outline"
                    className="min-h-11 text-base"
                    onClick={() => setBookingOpen(true)}
                  >
                    {t("Échanger avec mon responsable Standex")}
                  </Button>
                ) : null}
              </div>
              <AuthPanel backend={backend} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  /** Applique un montage 3D au dossier avec la même logique de provenance.
   * Aucun réseau, aucune écriture sur l'appareil : tout reste en mémoire. */
  const applyWorkshopConfig = useCallback((c: WorkshopConfig) => {
    setWorkshop(c);
    setDossier((d) => ({
      ...d,
      workshop: c,
      cabling: {...d.cabling, lengthChoice: c.cableLengthMm !== null &&
        (d.cabling.lengthChoice === "undecided" || (d.cabling.lengthChoice === "standard_to_confirm" && !standardLengthsMm(c.sensorId).includes(c.cableLengthMm)))
          ? "custom_to_confirm" : d.cabling.lengthChoice},
      delegatedDecisions: c.cableLengthMm !== null && c.cableLengthMm !== d.workshop?.cableLengthMm
        ? (d.delegatedDecisions ?? []).filter(k=>k!==DELEGATED_CABLE) : d.delegatedDecisions ?? [],
      // Contrat recalculé à l'enregistrement sur l'état COURANT du dossier :
      // configuration d'atelier, besoin exprimé et câble réellement relevé.
      // Jamais repris d'un import.
      guidedMounting: currentMounting({ ...d, workshop: c }),
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

  /** Essai enregistré dans le dossier : verdict et distances tels quels. */
  const recordResult = (result: TestedPair) =>
    setDossier((d) => ({
      ...d,
      testedPairs: recordTestedPair(d.testedPairs, result),
      selectedSensorId: result.sensorId,
      sensorSyncConfirmed: d.workshop?.sensorId === result.sensorId,
      updatedAt: new Date().toISOString(),
    }));

  const resultatSection = (
    <ResultView
      pair={latestTestedPair(dossier.testedPairs)}
      // Un point de compatibilité ouvert interdit un résultat positif : la
      // démonstration ne vérifie pas l'application.
      applicationBlocked={fitBlocked}
      detectionGoal={dossier.requirements.find((r) => r.key === "detection_goal")?.value ?? null}
      tested={dossier.testedPairs ?? []}
      proposals={suggestedPairs}
      onSeePairs={() => setTab("montage")}
      onConfirmWithStandex={() => setTab("revue")}
      onRequestTrial={() => {
        if (!isDelegated(dossier, TRIAL_REQUEST)) toggleDelegated(TRIAL_REQUEST);
        setTab("revue");
      }}
      // « Replacer l'aimant » rouvre l'atelier : la pose documentée y est
      // proposée par le moteur, jamais écrite ici.
      onReplaceMagnet={() => openWorkshopPanel()}
      onTestPair={(sensorId) => {
        const card = allPairs.find((c) => c.sensorId === sensorId);
        if (card) testPair(card);
      }}
    />
  );

  const workshopSection = (
    <div>
      <Suspense fallback={<p className="text-base">{t("Chargement de l'atelier…")}</p>}>
        <MagneticWorkshop
          embedded
          initialCableOpen={cablePanelOpen}
          initialStudy={dossier.studioV2}
          dossierId={dossier.id}
          revision={dossier.revision}
          onStudyChange={(studioV2, designFreeze) =>
            setDossier((d) => ({ ...d, studioV2, designFreeze }))
          }
          key={`workshop-${workshopEpoch}`}
          initialConfig={workshop ?? DEFAULT_WORKSHOP}
          storageLabel={t("ce projet, en mémoire de l'onglet")}
          storageMode="memory"
          cableRouting={cableRouting}
          onDraftChange={onWorkshopDraft}
          onSaveState={setWorkshopSaveState}
          onResult={(result) => {
            // Commit the exact draft before recording its result and leaving the workshop.
            if (workshopDraftRef.current) applyWorkshopConfig(workshopDraftRef.current);
            recordResult(result);
            setShowWorkshop(false);
            setPanel(null);
            setTab("resultat");
          }}
          onRequestTrial={(result) => {
            recordResult(result);
            if (!isDelegated(dossier, TRIAL_REQUEST)) toggleDelegated(TRIAL_REQUEST);
            setShowWorkshop(false);
            setPanel(null);
            setTab("revue");
          }}
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
      <div className="flex flex-wrap items-center gap-3">
        {!embedded ? (
          <>
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
          </>
        ) : null}
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
        <section className="surface-interactive space-y-2 rounded-[var(--r-lg)] p-4">
          <h3 className="t-title-s">{t("Espace de travail Standex")}</h3>
          <p className="t-caption">
            {msg("Projets, tâches et revues de l'équipe — accès {0}", [backend.role])}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/standex">{t("Ouvrir l'espace de travail")}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/internal">{t("Banc de test interne")}</Link>
            </Button>
          </div>
        </section>
      ) : null}
      {submitMessage ? <p className="notice notice-info">{submitMessage}</p> : null}
      <div className="panel-block-lg">
        <ClientFollowUp
          backend={backend}
          serverDossierId={serverDossierId}
          contextGeneration={contextGenRef.current}
          onOpenTransferredFile={(f) => void openTransferredFile(f)}
          requestedDossierId={requestedDossierId}
          onSelectDossier={({ id, revision, title, snapshot }) => {
            if (busyRef.current) return { ok: false };
            if (!guardReplace(t("ouvrir ce projet"))) return { ok: false };
            // Le dossier CONSULTÉ ne devient le dossier ÉDITÉ que si son
            // dernier contenu envoyé a pu être chargé : sinon l'ancien
            // contenu resterait à l'écran sous une nouvelle étiquette.
            const parsed = snapshot ? parseServerSnapshot(snapshot) : null;
            if (snapshot && (!parsed || !parsed.ok)) {
              setSubmitMessage(
                parsed && !parsed.ok
                  ? parsed.reason
                  : t(
                      "Le dernier contenu envoyé de ce projet n'a pas pu être relu : le projet ouvert ici reste inchangé.",
                    ),
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
            // La numérotation interne des versions ne s'affiche plus au client :
            // seul le nom du projet et l'état du contenu rechargé le concernent.
            setSubmitMessage(
              msg("Projet « {0} » ouvert{1}. Votre accord d'envoi et la relecture sont à refaire pour ce projet.", [
                title,
                parsed && parsed.ok
                  ? t(", contenu envoyé rechargé")
                  : t(", aucun contenu envoyé à recharger"),
              ]),
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
                refused: t(
                  "Aucune modification de cette proposition n'a pu être appliquée : rien n'a été repris.",
                ),
              };
            }
            try {
              // Le serveur enregistre la reprise AVANT que l'écran change.
              busyRef.current = true;
              setBusy(true);
              setBusyOperation("variant");
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
              setBusyOperation(null);
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
              t(
                "Proposition Standex reprise dans le contenu ouvert ici. Elle n'est ni validée ni envoyée : relisez, confirmez l'accord, puis envoyez une nouvelle version.",
              ),
            );
            return { applied: out.applied, notApplied: out.notApplied };
          }}
        />
      </div>
    </div>
  );

  const navigation = (
    <div className="studio-header-navigation">
      <LanguagePicker />
      <details className="studio-navigation">
        <summary>{t("Menu")}</summary>
        <nav aria-label={t("Navigation principale")}>
          {/* Ordre du menu : l'accueil, puis ce qui agit sur LE projet ouvert ;
              l'atelier, le catalogue, les documents et le compte après le trait. */}
          {onGoHome ? (
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.closest("details")?.removeAttribute("open");
                onGoHome();
              }}
            >
              {t("Accueil")}
            </button>
          ) : (
            <Link to="/" onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}>
              {t("Accueil")}
            </Link>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.closest("details")?.removeAttribute("open");
              exportDossier();
            }}
          >
            {t("Exporter mon projet")}
          </button>
          <label className="studio-navigation-file">
            {t("Reprendre un fichier")}
            <input
              type="file"
              accept="application/json"
              className="sr-only"
              onChange={(e) => {
                void importDossier(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <p className="studio-navigation-note">
            <strong>{t("Conservation et reprise de ce projet")}</strong>
            <span>
              {t(MEMORY_LOSS_WARNING)} {t(EXPORT_BINARY_NOTICE)}
            </span>
            {importMessage ? <span>{importMessage}</span> : null}
          </p>
          <hr className="studio-navigation-rule" />
          {(
            [
              [
                t("Atelier 3D"),
                () => {
                  setCatalogOpen(false);
                  setWorkshopMounted(true);
                  setShowWorkshop(true);
                  setPanel("atelier");
                },
              ],
              [
                t("Catalogue des capteurs"),
                () => {
                  setPanel(null);
                  setCatalogOpen(true);
                },
              ],
              [
                t("Documents"),
                () => {
                  setCatalogOpen(false);
                  setPanel("documents");
                },
              ],
              [
                t("Mon espace"),
                () => {
                  setCatalogOpen(false);
                  setPanel("espace");
                },
              ],
            ] as [string, () => void][]
          ).map(([label, action]) => (
            <button
              key={label}
              type="button"
              onClick={(e) => {
                e.currentTarget.closest("details")?.removeAttribute("open");
                action();
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      </details>
    </div>
  );
  return (
    <div
      data-readable
      className={embedded ? "text-foreground" : "min-h-screen bg-background text-foreground"}
    >
      {/* La barre publie sa hauteur réelle : c'est elle qui cale le rail des
          étapes juste en dessous, sans chevauchement. */}
      <header
        ref={projectHeaderRef}
        className={`project-header material sticky top-0 z-30${visible ? "" : " hidden"}`}
      >
        <div className="project-header-row mx-auto grid max-w-[76rem] items-center gap-3 px-4">
          <div className="project-header-brand flex shrink-0 items-center gap-3 self-center">
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
            {/* §10 : la marque n'est pas recomposée. Le nom de l'outil vit à
                côté d'elle, en texte, jamais dans le verrou logo. */}
            <span className="t-title-s whitespace-nowrap">Sensor Studio</span>
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
          <div className="project-header-status flex flex-wrap items-center gap-2">
            <Badge variant={lastSent ? "default" : "secondary"} className="project-state-badge">
              {lastSent ? t("Envoyé") : t("Brouillon")}
            </Badge>
          </div>
          {navigation}
        </div>
      </header>

      <main className={`mx-auto max-w-[76rem] px-4 py-6${visible ? "" : " hidden"}`}>
        <nav
          aria-label="Progression"
          className={`project-stepper project-stepper-${stepIndex} project-stepper-sticky mb-6`}
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
              <span className="mt-0.5 hidden pl-3 text-sm sm:block">{s.hint}</span>
            </button>
          ))}
        </nav>

        <Tabs value={tab} onValueChange={setTab}>
          {showAdvanced ? (
            <div className="mb-2">
              <Button
                variant="ghost"
                className="min-h-11 text-base"
                onClick={() => setShowAdvanced(false)}
              >
                {t("Masquer les réglages détaillés")}
              </Button>
            </div>
          ) : null}
          <TabsList className={showAdvanced ? "flex-wrap" : "hidden"}>
            <TabsTrigger value="besoin">{t("Besoin")}</TabsTrigger>
            <TabsTrigger value="montage">{t("Montage & 3D")}</TabsTrigger>
            <TabsTrigger value="resultat">{t("Résultat")}</TabsTrigger>
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

          {/* ---------------- Résultat ---------------- */}
          <TabsContent value="resultat" className="pt-4">
            {resultatSection}
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
      {/* L'atelier occupe tout l'écran et reste monté en permanence : le retour
          au projet ne perd ni réglages, ni caméra, ni fichier importé. */}
      <WorkspacePanel
        open={panel === "atelier" && workshopMounted}
        keepMounted={workshopMounted}
        fullscreen
        languagePicker
        bare
        backLabel={t("Retour aux couples")}
        onBack={() => {
          setPanel(null);
          setTab("montage");
        }}
        onOpenChange={(o) => setPanel(o ? "atelier" : null)}
        title={t("Atelier 3D")}
        badge={
          <span className="flex shrink-0 items-center gap-2">
            {/* Références portées telles quelles, jamais traduites. */}
            {workshop ? (
              <Badge className="project-state-badge">{`${workshop.sensorId} + ${workshop.magnetModel}`}</Badge>
            ) : null}
            <span className="t-caption" role="status" data-testid="workshop-save-state">
              {workshopSaveState === "saving"
                ? t("Enregistrement…")
                : workshopSaveState === "saved"
                  ? t("Enregistré")
                  : t("Brouillon")}
            </span>
          </span>
        }
      >
        {workshopMounted ? workshopSection : null}
      </WorkspacePanel>

      <WorkspacePanel
        navigation={navigation}
        open={panel === "documents"}
        keepMounted
        onOpenChange={(o) => setPanel(o ? "documents" : null)}
        title="Documents"
        description={t("Lecture sur place, en mémoire de cet onglet.")}
      >
        {documentsSection}
      </WorkspacePanel>

      <WorkspacePanel
        navigation={navigation}
        open={panel === "espace"}
        keepMounted
        onOpenChange={(o) => setPanel(o ? "espace" : null)}
        title={t("Mon espace")}
        fullscreen
        description={t("Connexion, mes projets envoyés, reprise et suivi.")}
      >
        {espaceSection}
      </WorkspacePanel>

      <BookingDialog open={bookingOpen} onOpenChange={setBookingOpen} country={bookingCountry} />
      {/* Fiche détaillée volontaire : cotes, sources et STEP d'encombrement. */}
      {detailSensorId ? (
        <SensorCard
          sensorId={detailSensorId}
          onClose={() => setDetailSensorId(null)}
          onSelect={(id) => {
            chooseSensor(id, t(sensorById(id).name));
            setDetailSensorId(null);
          }}
        />
      ) : null}

      {catalogOpen ? (
        <WorkspacePanel
          open
          fullscreen
          navigation={navigation}
          title={t("Catalogue des capteurs")}
          onOpenChange={() => setCatalogOpen(false)}
        >
          <SensorCatalog
            inline
            selected={dossier.selectedSensorId ?? dossier.workshopSensorId ?? ""}
            onClose={() => setCatalogOpen(false)}
            onSelect={(id) => {
              setDossier((d) => ({
                ...d,
                selectedSensorId: id,
                sensorSyncConfirmed: d.workshopSensorId === id,
              }));
              setCatalogOpen(false);
            }}
          />
        </WorkspacePanel>
      ) : null}
    </div>
  );
}
