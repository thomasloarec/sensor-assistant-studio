import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ShieldCheck, Lock, Download, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  compareStandardLengths,
  estimateCableLength,
  uncoveredMotionStates,
  type CablingConfig,
  type Point,
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
} from "@/lib/leadmagnet/dossier-io";
import {
  INITIAL_PRIVACY,
  MEMORY_LOSS_WARNING,
  STORAGE_BADGE,
  LOCAL_ASSISTANT_LABEL,
  grantConsent,
  hasConsent,
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

import { checkSubmission, submit, technicalSummary } from "@/lib/leadmagnet/submission";
import { checkLeadBackend, type LeadBackendStatus } from "@/lib/leadmagnet/backend";
import {
  createDossier as createServerDossier,
  createSupabaseSubmissionBackend,
  uploadDesignFile,
} from "@/lib/leadmagnet/supabase-adapter";
import { ClientFollowUp } from "@/components/leadmagnet/client-followup";
import { memoryAssetBytes } from "@/lib/standex/machine-assets";
import {
  DOCUMENTED_HOUSINGS,
  draftFromHousing,
  housingById,
  housingLabel,
  terminationFromHousing,
} from "@/lib/leadmagnet/connector-library";
import {
  routeSamples,
  SEARCH_LINK_DISCLAIMER,
  createSampleRequest,
  type SampleRequest,
} from "@/lib/leadmagnet/samples";
import { DEFAULT_WORKSHOP } from "@/lib/standex/magnetic-workshop";
import type { WorkshopConfig } from "@/lib/standex/magnetic-workshop";

import {
  openPrivateErrorScope,
  reportPrivateError,
  PRIVATE_ERROR_CODES,
} from "@/lib/lovable-error-reporting";

const MagneticWorkshop = lazy(() => import("@/components/standex/workshop/workshop"));

export const Route = createFileRoute("/design")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Concevoir une détection — Standex DETECT" },
      {
        name: "description",
        content:
          "Espace de co-conception privé : exigences, montage, candidats, câblage et préparation de la revue Standex.",
      },
      { property: "og:title", content: "Concevoir une détection — Standex DETECT" },
      {
        property: "og:description",
        content: "Co-conception privée d'une solution de détection magnétique Standex.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DesignSpace,
  // Frontière dédiée : une erreur ici ne remonte qu'un code fixe, sans message
  // d'origine ni pile, pour qu'aucune donnée du projet privé ne parte en télémétrie.
  errorComponent: PrivateDesignError,
});

function PrivateDesignError({ reset }: { reset: () => void }) {
  useEffect(() => {
    reportPrivateError(PRIVATE_ERROR_CODES.design_workspace);
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-xl font-semibold">L'espace de conception s'est interrompu</h1>
        <p className="text-sm text-muted-foreground">
          Rien de ce que vous avez saisi n'a été transmis. Le détail de l'incident reste sur votre
          appareil : seul un code d'incident anonyme a été signalé.
        </p>
        <Button onClick={reset}>Réessayer</Button>
      </div>
    </div>
  );
}

const stateBadge = (state: string) =>
  state === "confirmed" ? "Confirmé" : state === "hypothesis" ? "Hypothèse" : "Inconnu";

const num = (raw: string): number | null => {
  const v = Number(raw.replace(",", "."));
  return raw.trim() && Number.isFinite(v) ? v : null;
};

function pointFields(
  label: string,
  value: Point | null,
  onChange: (p: Point | null) => void,
) {
  const p = value ?? [0, 0, 0];
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label} (mm)</Label>
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <Input
            key={i}
            className="h-8"
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

function DesignSpace() {
  const [dossier, setDossier] = useState<DesignDossier>(() => createDossier());
  const [privacy, setPrivacy] = useState(INITIAL_PRIVACY);
  const [nda, setNda] = useState<NdaState>(INITIAL_NDA);
  const [ndaPreview, setNdaPreview] = useState<FilledNda | null>(null);
  const [ndaError, setNdaError] = useState<string | null>(null);

  // Câblage et terminaison vivent DANS le dossier : ils suivent export, résumé et révision.
  const cabling = dossier.cabling;
  const setCabling = useCallback(
    (update: (c: CablingConfig) => CablingConfig) =>
      setDossier((d) => ({ ...d, cabling: update(d.cabling), updatedAt: new Date().toISOString() })),
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
  const [showWorkshop, setShowWorkshop] = useState(false);
  const [workshop, setWorkshop] = useState<WorkshopConfig | null>(null);
  const [volumeRaw, setVolumeRaw] = useState("");
  const [volumeError, setVolumeError] = useState<string | null>(null);
  /** Le modèle 3D reste en mémoire tant que ce partage n'est pas explicitement demandé. */
  const [shareModel, setShareModel] = useState(false);

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
        setNdaError(error instanceof Error ? error.message : "Génération impossible.");
      }
    },
    [nda],
  );


  // Tant que cet espace est monté, la télémétrie est réduite à un code anonyme.
  useEffect(() => openPrivateErrorScope(), []);

  useEffect(() => {
    checkLeadBackend().then(setBackend).catch(() => setBackend(null));
  }, []);

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

  const importDossier = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setImportMessage(null);
    try {
      const parsed = parseDossierExport(JSON.parse(await file.text()));
      if (!parsed.ok) {
        setImportMessage(parsed.reason);
        return;
      }
      setDossier(parsed.dossier);
      setWorkshop(parsed.dossier.workshop);
      setImportMessage(parsed.notices.join(" "));
    } catch {
      setImportMessage("Ce fichier n'a pas pu être lu.");
    }
  }, []);

  const onSubmit = useCallback(async () => {
    const input = {
      dossier,
      nda,
      consents: privacy.consents,
      reviewAcknowledged: acknowledged,
      additionalConstraints: extraConstraints,
    };
    const check = checkSubmission(input);
    if (!check.ok) {
      setSubmitMessage(check.problems.join(" "));
      return;
    }
    // Partage explicite du modèle 3D : dépôt réel AVANT la soumission, jamais implicite.
    let dossierId = serverDossierId;
    let submitted = dossier;
    if (shareModel && dossier.workshopAsset && backend?.ready) {
      try {
        const bytes = memoryAssetBytes(dossier.workshopAsset.assetKey);
        if (!bytes) {
          setSubmitMessage(
            "Le fichier 3D n'est plus en mémoire de cet onglet : réimportez-le avant de le partager.",
          );
          return;
        }
        if (!dossierId) {
          dossierId = await createServerDossier(
            nda.required ? "Préparation d'un accord de confidentialité" : dossier.title,
            nda.required,
          );
          setServerDossierId(dossierId);
        }
        const uploaded = await uploadDesignFile(
          dossierId,
          { name: dossier.workshopAsset.fileName, data: new Uint8Array(bytes) },
          "design_model",
          {
            kind: "supabase_files",
            statement: "Partage du modèle 3D avec l'équipe Standex en charge du dossier.",
            accepted_at: new Date().toISOString(),
            content_ref: dossier.workshopAsset.fileName,
          },
        );
        submitted = {
          ...dossier,
          attachments: [
            ...dossier.attachments.filter((a) => a.fileName !== uploaded.fileName),
            {
              id: uploaded.path,
              fileName: uploaded.fileName,
              bytes: bytes.byteLength,
              transferred: true,
              storagePath: uploaded.path,
            },
          ],
        };
        setDossier(submitted);
      } catch (error) {
        setSubmitMessage(
          error instanceof Error ? error.message : "Le fichier 3D n'a pas pu être partagé.",
        );
        return;
      }
    }
    // Envoi réel dès que l'espace serveur est disponible et la session ouverte ;
    // sinon rien n'est transmis et rien n'est simulé.
    const outcome = await submit(
      { ...input, dossier: submitted },
      createSupabaseSubmissionBackend({
        schemaReady: Boolean(backend?.schemaReady),
        capabilities: backend?.capabilities ?? {
          authenticated: false,
          userId: null,
          role: null,
          assignedDossiers: [],
        },
        dossierId,
        expectedRevision: serverRevision,
        ndaRequired: nda.required,
        onDossierCreated: setServerDossierId,
      }),
    );
    if (outcome.status === "submitted") {
      setServerRevision((r) => r + 1);
      setSubmitMessage(
        "Dossier transmis à la revue Standex. Vous serez informé dès qu'un retour est publié.",
      );
    } else {
      setSubmitMessage(outcome.reason);
    }
  }, [
    dossier,
    nda,
    privacy.consents,
    acknowledged,
    extraConstraints,
    backend,
    serverDossierId,
    serverRevision,
    shareModel,
  ]);


  const volume = dossier.business.annualVolume;
  // La désignation standard/custom vient du retour R&D publié, jamais de cet écran.
  const sampleRoute = routeSamples({ volume, isCustom: false });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Banc de test interne
          </Link>
          <h1 className="text-lg font-semibold">Concevoir une détection</h1>
          <Badge variant="secondary" className="gap-1">
            <Lock className="h-3 w-3" /> {STORAGE_BADGE[privacy.storage]}
          </Badge>
          <Badge variant="outline">Révision {dossier.revision}</Badge>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportDossier}>
              <Download className="mr-1 h-4 w-4" /> Exporter le dossier
            </Button>
            <Button variant="outline" size="sm" asChild>
              <label className="cursor-pointer">
                Reprendre un fichier
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
            </Button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-3 text-xs text-muted-foreground">
          {MEMORY_LOSS_WARNING} {EXPORT_BINARY_NOTICE}
          {importMessage ? <span className="block text-foreground">{importMessage}</span> : null}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Tabs defaultValue="besoin">
          <TabsList className="flex-wrap">
            <TabsTrigger value="besoin">Besoin</TabsTrigger>
            <TabsTrigger value="montage">Montage &amp; 3D</TabsTrigger>
            <TabsTrigger value="candidats">Candidats</TabsTrigger>
            <TabsTrigger value="cablage">Câblage</TabsTrigger>
            <TabsTrigger value="revue">Revue Standex</TabsTrigger>
          </TabsList>

          {/* ---------------- Besoin ---------------- */}
          <TabsContent value="besoin" className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">{LOCAL_ASSISTANT_LABEL}</p>
            {dossier.requirements.map((r) => (
              <div key={r.key} className="rounded-md border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Label className="text-sm font-medium">{r.label}</Label>
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
                  <span className="text-xs text-muted-foreground">source : {r.source}</span>
                </div>
                <Textarea
                  rows={2}
                  value={r.value}
                  placeholder="Décrivez ce point ; laissez vide s'il est inconnu."
                  onChange={(e) =>
                    setDossier((d) =>
                      proposeRequirement(d, r.key, { value: e.target.value, source: "user" }),
                    )
                  }
                />
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!r.value.trim() || r.state === "confirmed"}
                    onClick={() => setDossier((d) => confirmRequirement(d, r.key))}
                  >
                    Confirmer cette exigence
                  </Button>
                  {r.note ? (
                    <span className="text-xs text-muted-foreground">{r.note}</span>
                  ) : null}
                </div>
              </div>
            ))}
            <div className="rounded-md border p-3">
              <Label className="text-sm font-medium">Contraintes libres</Label>
              <Textarea
                rows={3}
                className="mt-2"
                value={dossier.freeConstraints}
                onChange={(e) => setDossier((d) => ({ ...d, freeConstraints: e.target.value }))}
              />
            </div>
          </TabsContent>

          {/* ---------------- Montage ---------------- */}
          <TabsContent value="montage" className="space-y-4 pt-4">
            <div className="rounded-md border p-3">
              <Label className="text-sm font-medium">Choix mécanique explicite</Label>
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
                  <SelectItem value="undecided">Non décidé</SelectItem>
                  <SelectItem value="pcb_smd">PCB — report CMS</SelectItem>
                  <SelectItem value="pcb_through_hole">PCB — traversant</SelectItem>
                  <SelectItem value="screw">Fixation vissée</SelectItem>
                  <SelectItem value="press_fit">Emboîtement dans un trou</SelectItem>
                  <SelectItem value="other">Autre montage</SelectItem>
                </SelectContent>
              </Select>
              {dossier.mounting.kind === "press_fit" ? (
                <div className="mt-2 max-w-xs">
                  <Label className="text-xs">Diamètre du trou (mm)</Label>
                  <Input
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
                  placeholder="Décrivez le montage"
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

            <div className="rounded-md border p-3">
              <Label className="text-sm font-medium">Encombrement disponible</Label>
              <div className="mt-2 flex flex-wrap gap-3">
                {(["lengthMm", "widthMm", "heightMm"] as const).map((k) => (
                  <div key={k} className="w-32">
                    <Label className="text-xs">
                      {{ lengthMm: "Longueur", widthMm: "Largeur", heightMm: "Hauteur" }[k]} (mm)
                    </Label>
                    <Input
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

            <div className="rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-3">
                <Label className="text-sm font-medium">Atelier 3D (facultatif)</Label>
                <Button size="sm" variant="outline" onClick={() => setShowWorkshop((v) => !v)}>
                  {showWorkshop ? "Masquer l'atelier" : "Ouvrir l'atelier magnétique"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Formats acceptés : GLB autonome uniquement. Les fichiers STEP/IGES ne sont pas
                  lus. Unités, échelle et pièce mobile restent à confirmer par vous.
                </span>
              </div>
              {showWorkshop ? (
                <div className="mt-3">
                  <p className="mb-2 text-xs text-muted-foreground">
                    Modèle physique explicitement pédagogique : aucune validation magnétique
                    automatique. L'exemple machine à café est un exemple, il n'impose aucune
                    référence à votre projet.
                  </p>
                  <Suspense fallback={<p className="text-sm">Chargement de l'atelier…</p>}>
                    <MagneticWorkshop
                      initialConfig={workshop ?? DEFAULT_WORKSHOP}
                      storageLabel="ce dossier, en mémoire de l'onglet"
                      storageMode="memory"
                      onClose={() => setShowWorkshop(false)}
                      onSave={async (c: WorkshopConfig) => {
                        setWorkshop(c);
                        setDossier((d) => ({
                          ...d,
                          workshop: c,
                          // Provenance explicite : un vrai import n'est jamais compté comme exemple.
                          workshopSource: c.machine ? "user_asset" : "example",
                          workshopAsset: c.machine
                            ? {
                                assetKey: c.machine.assetKey,
                                fileName: c.machine.fileName,
                                storage: "memory",
                              }
                            : null,
                          workshopSensorId: c.sensorId,
                          sensorSyncConfirmed:
                            d.selectedSensorId === null || d.selectedSensorId === c.sensorId,
                          updatedAt: new Date().toISOString(),
                        }));
                      }}
                    />
                  </Suspense>
                </div>
              ) : null}
            </div>
          </TabsContent>

          {/* ---------------- Candidats ---------------- */}
          <TabsContent value="candidats" className="space-y-3 pt-4">
            <p className="text-sm text-muted-foreground">{CANDIDATE_DISCLAIMER}</p>
            {dossier.selectedSensorId && !dossier.sensorSyncConfirmed ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                <p>
                  La gamme suivie et le capteur affiché en 3D sont différents. Rien n'est changé sans
                  votre accord.
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
                  Aligner l'atelier 3D sur la gamme suivie
                </Button>
              </div>
            ) : null}
            <div className="space-y-2">
              {candidates.map((c) => (
                <div key={c.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    <Badge
                      variant={
                        c.status === "kept"
                          ? "default"
                          : c.status === "to_verify"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {c.status === "kept"
                        ? "Retenu à ce stade"
                        : c.status === "to_verify"
                          ? "À vérifier"
                          : "Écarté"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{c.size}</span>
                    {c.status !== "excluded" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setDossier((d) => ({
                            ...d,
                            selectedSensorId: c.id,
                            sensorSyncConfirmed: d.workshopSensorId === c.id,
                          }))
                        }
                      >
                        Suivre cette gamme
                      </Button>
                    ) : null}
                  </div>
                  <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                    {c.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ---------------- Câblage ---------------- */}
          <TabsContent value="cablage" className="space-y-4 pt-4">
            <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
              {pointFields("Point capteur", cabling.sensorEndpoint, (p) =>
                setCabling((c) => ({ ...c, sensorEndpoint: p })),
              )}
              {pointFields("Point de connexion", cabling.connectionEndpoint, (p) =>
                setCabling((c) => ({ ...c, connectionEndpoint: p })),
              )}
            </div>
            <div className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Waypoints du trajet</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCabling((c) => ({ ...c, waypoints: [...c.waypoints, [0, 0, 0]] }))}
                >
                  Ajouter un point
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
                      Retirer
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* États de mouvement : le trajet doit être couvert pour chaque état. */}
            <div className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">États de mouvement</Label>
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
                  Ajouter un état
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
                      <span className={covered ? "text-xs text-emerald-700" : "text-xs text-amber-700"}>
                        {covered ? "trajet renseigné" : "trajet manquant pour cet état"}
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
                          Reprendre le trajet courant
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
                        Retirer
                      </Button>
                    </div>
                  );
                })}
                {cabling.declaredMotionStates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Aucun état déclaré : si la machine bouge, déclarez chaque position extrême.
                  </p>
                ) : null}
              </div>
              <label className="mt-3 flex items-center gap-2 text-xs">
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
                Je confirme que tous les états déclarés sont couverts par un trajet.
              </label>
            </div>

            <div className="grid gap-3 rounded-md border p-3 md:grid-cols-5">
              {(
                [
                  ["serviceReserveMm", "Réserve de service"],
                  ["terminationMm", "Terminaison"],
                  ["toleranceMm", "Tolérance fournisseur"],
                  ["surplusHousingMm", "Surplus logeable"],
                  ["minBendRadiusMm", "Rayon de courbure mini"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <Label className="text-xs">{label} (mm)</Label>
                  <Input
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
            <p className="-mt-2 px-1 text-xs text-muted-foreground">
              La tolérance fournisseur et le volume disponible pour loger le surplus sont deux
              informations différentes.
            </p>
            <div className="rounded-md border p-3 text-sm">
              <p>
                Plus long trajet mesuré (polyligne) :{" "}
                <strong>
                  {estimate.longestPathMm === null
                    ? "inconnu"
                    : `${estimate.longestPathMm.toFixed(1)} mm`}
                </strong>
              </p>
              <p>
                Longueur minimale demandée, marges comprises :{" "}
                <strong>
                  {estimate.requiredMm === null
                    ? "inconnue tant que le trajet n'est pas complet"
                    : `${estimate.requiredMm.toFixed(1)} mm`}
                </strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Cette longueur n'est jamais une longueur approuvée : elle est vérifiée en revue R&D.
              </p>
              <ul className="mt-2 list-disc pl-5 text-xs text-amber-700">
                {estimate.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
              <Separator className="my-3" />
              <p className="text-sm">{lengthVerdict.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    ["standard_to_confirm", "Longueur catalogue, à confirmer"],
                    ["custom_to_confirm", "Longueur sur mesure, à confirmer"],
                    ["undecided", "Non décidé"],
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
            </div>
            <div className="rounded-md border p-3">
              <Label className="text-sm font-medium">Terminaison</Label>
              <p className="mt-1 text-sm">{terminationLabel(termination)}</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                {connectorSummaryLines(termination).map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
              <div className="mt-3">
                <Label className="text-xs">Boîtiers documentés par le fabricant</Label>
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
                <p className="mt-1 text-xs text-muted-foreground">
                  Quelques boîtiers documentés seulement, pas le marché entier. Boîtier, contacts à
                  sertir et embase restent trois références distinctes ; brochage, section de fil
                  réelle et disponibilité restent inconnus et à vérifier par la R&D.
                </p>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {CONNECTOR_FIELD_LABELS.map(([key, label]) => (
                  <div key={key}>
                    <Label className="text-xs">{label}</Label>
                    <Input
                      value={connectorDraft[key]}
                      onChange={(e) =>
                        setConnectorDraft((d) => ({ ...d, [key]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
              {connectorError ? (
                <p className="mt-2 text-xs text-destructive">{connectorError}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setConnectorError(null);
                    setDossier((d) => ({ ...d, termination: DEFAULT_TERMINATION }));
                  }}
                >
                  Fils nus
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
                  Enregistrer en « à vérifier par R&D »
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Aucune combinaison connecteur/capteur qualifiée n'est documentée dans ce projet :
                toute référence saisie, sa contrepartie et son brochage restent à vérifier par la R&D.
              </p>
            </div>
          </TabsContent>

          {/* ---------------- Revue ---------------- */}
          <TabsContent value="revue" className="space-y-4 pt-4">
            <Accordion type="multiple" defaultValue={["resume", "nda", "envoi"]}>
              <AccordionItem value="resume">
                <AccordionTrigger>Résumé technique et inconnues</AccordionTrigger>
                <AccordionContent>
                  <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                    {technicalSummary(dossier)}
                  </pre>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="projet">
                <AccordionTrigger>Contexte projet</AccordionTrigger>
                <AccordionContent className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label className="text-xs">Volume annuel de capteurs (entier ou « inconnu »)</Label>
                    <Input
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
                    {volumeError ? <p className="text-xs text-destructive">{volumeError}</p> : null}
                  </div>
                  <div>
                    <Label className="text-xs">Date de lancement série</Label>
                    <Input
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
                    <Label className="text-xs">Échantillons utiles avant</Label>
                    <Input
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
                    <Label className="text-xs">Durée de série (années)</Label>
                    <Input
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
                    <Label className="text-xs">Contact</Label>
                    <Input
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
                    <Label className="text-xs">E-mail</Label>
                    <Input
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

              <AccordionItem value="nda">
                <AccordionTrigger>Confidentialité et NDA — {ndaStatusLabel(nda)}</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <p className="text-sm">
                    Modèle juridique approuvé : <strong>{APPROVED_NDA_TEMPLATE.fileName}</strong>{" "}
                    (SHA-256 {APPROVED_NDA_TEMPLATE.sha256.slice(0, 16)}…, vérifié avant chaque
                    remplissage). L'original reste intact : seule une copie remplie est produite, sur
                    cet appareil, sans transmettre le dossier.
                  </p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {NDA_FIELD_LABELS.map(([key, label]) => (
                      <div key={key}>
                        <Label className="text-xs">{label}</Label>
                        <Input
                          value={nda.fields[key]}
                          onChange={(e) =>
                            setNda((n) => ({ ...n, fields: { ...n.fields, [key]: e.target.value } }))
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
                      Aperçu du document rempli
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
                      Télécharger le .docx non signé
                    </Button>
                  </div>
                  {ndaError ? (
                    <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      {ndaError}
                    </p>
                  ) : null}
                  {ndaPreview ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Aperçu local des clauses du document rempli (non signé) — {ndaPreview.fileName}
                      </p>
                      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                        {ndaPreview.paragraphs.filter((p) => p.trim()).join("\n\n")}
                      </pre>
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Générer un document n'est pas une signature : aucune signature ni tampon n'est
                    ajouté, le document reste non signé. Le statut « en vigueur » n'est accordé que
                    sur preuve vérifiée côté Standex ; tant qu'il n'est pas atteint, aucun contenu
                    confidentiel n'est transmis.
                  </p>
                </AccordionContent>
              </AccordionItem>


              <AccordionItem value="envoi">
                <AccordionTrigger>Préparer la revue Standex</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div>
                    <Label className="text-xs">Contraintes supplémentaires</Label>
                    <Textarea
                      rows={3}
                      value={extraConstraints}
                      onChange={(e) => setExtraConstraints(e.target.value)}
                    />
                  </div>
                  <p className="text-sm">
                    Fichiers réellement transmis :{" "}
                    {dossier.attachments.filter((a) => a.transferred).length === 0
                      ? "aucun"
                      : dossier.attachments
                          .filter((a) => a.transferred)
                          .map((a) => a.fileName)
                          .join(", ")}
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={hasConsent(privacy, "supabase_dossier")}
                      onCheckedChange={(v) =>
                        setPrivacy((p) =>
                          v
                            ? grantConsent(p, {
                                kind: "supabase_dossier",
                                contentSummary:
                                  "Exigences, montage, câblage, contraintes et contexte projet.",
                                recipients: ["Standex R&D", "Standex commercial"],
                              })
                            : { ...p, consents: p.consents.filter((c) => c.kind !== "supabase_dossier") },
                        )
                      }
                    />
                    J'autorise l'envoi de ce contenu à Standex (R&D et commercial).
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={shareModel}
                      disabled={!dossier.workshopAsset}
                      onCheckedChange={(v) => setShareModel(Boolean(v))}
                    />
                    {dossier.workshopAsset
                      ? `Je partage aussi le fichier 3D « ${dossier.workshopAsset.fileName} » avec l'équipe en charge.`
                      : "Aucun fichier 3D importé : rien à partager."}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={acknowledged}
                      onCheckedChange={(v) => setAcknowledged(Boolean(v))}
                    />
                    J'ai relu le résumé technique et les inconnues listées.
                  </label>
                  <Button onClick={onSubmit} disabled={!ndaOk}>
                    <ShieldCheck className="mr-1 h-4 w-4" /> Transmettre à la revue Standex
                  </Button>
                  {!backend?.ready ? (
                    <p className="text-xs text-muted-foreground">
                      {backend?.message ?? "Vérification du backend en cours…"}
                    </p>
                  ) : null}
                  {submitMessage ? <p className="text-sm">{submitMessage}</p> : null}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="echantillons">
                <AccordionTrigger>Échantillons et suivi</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <p className="text-sm">{sampleRoute.note}</p>
                  <p className="text-sm text-amber-700">
                    Les échantillons s'ouvrent après un retour Standex validé et publié, qui fixe la
                    référence exacte à commander. Une gamme ne suffit pas.
                  </p>
                  <p className="text-xs text-muted-foreground">{SEARCH_LINK_DISCLAIMER}</p>
                  <ClientFollowUp
                    backend={backend}
                    serverDossierId={serverDossierId}
                    onSelectDossier={setServerDossierId}
                    onReopenSnapshot={(snapshot, revision) => {
                      const parsed = snapshot as unknown as DesignDossier;
                      setDossier({ ...parsed, storage: "memory" });
                      setWorkshop(parsed.workshop ?? null);
                      setServerRevision(revision);
                      setSubmitMessage(
                        "Version reprise depuis le dossier réellement envoyé à Standex.",
                      );
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Disponibilités, MOQ et conditionnements : inconnus tant qu'aucun fournisseur
                    réel n'est connecté.
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
