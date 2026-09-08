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
  EMPTY_CABLING,
  compareStandardLengths,
  estimateCableLength,
  type CablingConfig,
  type Point,
} from "@/lib/leadmagnet/cabling";
import { DEFAULT_TERMINATION, freeReference, terminationLabel } from "@/lib/leadmagnet/connectors";
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
import { routeSamples, SEARCH_LINK_DISCLAIMER, createSampleRequest } from "@/lib/leadmagnet/samples";
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

  const [cabling, setCabling] = useState<CablingConfig>(EMPTY_CABLING);
  const [termination, setTermination] = useState(DEFAULT_TERMINATION);
  const [freeConnector, setFreeConnector] = useState("");
  const [backend, setBackend] = useState<LeadBackendStatus | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [extraConstraints, setExtraConstraints] = useState("");
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [showWorkshop, setShowWorkshop] = useState(false);
  const [workshop, setWorkshop] = useState<WorkshopConfig | null>(null);
  const [volumeRaw, setVolumeRaw] = useState("");
  const [volumeError, setVolumeError] = useState<string | null>(null);
  const [sampleQty, setSampleQty] = useState("");
  const [sampleMessage, setSampleMessage] = useState<string | null>(null);

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
        cabling.toleranceMm,
      ),
    [dossier.selectedSensorId, estimate.requiredMm, cabling.toleranceMm],
  );
  const ndaOk = ndaAllowsConfidentialTransfer(nda);

  const exportDossier = useCallback(() => {
    const blob = new Blob([JSON.stringify(toClientDto(dossier), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dossier-conception-r${dossier.revision}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [dossier]);

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
    const outcome = await submit(input, { available: Boolean(backend?.ready) });
    setSubmitMessage(
      outcome.status === "submitted"
        ? `Dossier transmis (${outcome.submissionId}).`
        : outcome.reason,
    );
  }, [dossier, nda, privacy.consents, acknowledged, extraConstraints, backend]);

  const volume = dossier.business.annualVolume;
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
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={exportDossier}>
              <Download className="mr-1 h-4 w-4" /> Exporter le dossier
            </Button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-3 text-xs text-muted-foreground">
          {MEMORY_LOSS_WARNING}
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
                      onClose={() => setShowWorkshop(false)}
                      onSave={async (c: WorkshopConfig) => {
                        setWorkshop(c);
                        setDossier((d) => ({ ...d, workshop: c, workshopIsExample: !d.workshop }));
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
                        onClick={() => setDossier((d) => ({ ...d, selectedSensorId: c.id }))}
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
                        waypoints: c.waypoints.map((q, i) => (i === index ? (p ?? [0, 0, 0]) : q)),
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
            <div className="grid gap-3 rounded-md border p-3 md:grid-cols-4">
              {(
                [
                  ["serviceReserveMm", "Réserve de service"],
                  ["terminationMm", "Terminaison"],
                  ["toleranceMm", "Tolérance"],
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
                        [key]: key === "minBendRadiusMm" ? num(e.target.value) : (num(e.target.value) ?? 0),
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <div className="rounded-md border p-3 text-sm">
              <p>
                Plus long trajet mesuré (polyligne) : <strong>{estimate.longestPathMm.toFixed(1)} mm</strong>
              </p>
              <p>
                Longueur minimale demandée, marges comprises :{" "}
                <strong>{estimate.requiredMm.toFixed(1)} mm</strong>
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
            </div>
            <div className="rounded-md border p-3">
              <Label className="text-sm font-medium">Terminaison</Label>
              <p className="mt-1 text-sm">{terminationLabel(termination)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setTermination(DEFAULT_TERMINATION)}>
                  Fils nus
                </Button>
                <Input
                  className="max-w-xs"
                  placeholder="Référence connecteur exacte fabricant"
                  value={freeConnector}
                  onChange={(e) => setFreeConnector(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!freeConnector.trim()}
                  onClick={() => setTermination(freeReference(freeConnector))}
                >
                  Ajouter en « à vérifier par R&D »
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Aucune combinaison connecteur/capteur qualifiée n'est documentée dans ce projet :
                toute référence saisie reste à vérifier par la R&D.
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
                <AccordionTrigger>Échantillons</AccordionTrigger>
                <AccordionContent className="space-y-2">
                  <p className="text-sm">{sampleRoute.note}</p>
                  {sampleRoute.kind === "distributors" ? (
                    <>
                      <ul className="list-disc pl-5 text-sm">
                        {sampleRoute.partners.map((p) => (
                          <li key={p.id}>
                            <a
                              className="underline"
                              target="_blank"
                              rel="noreferrer"
                              href={p.search + encodeURIComponent(dossier.selectedSensorId ?? "")}
                            >
                              {p.name}
                            </a>
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-muted-foreground">{SEARCH_LINK_DISCLAIMER}</p>
                    </>
                  ) : null}
                  <div className="flex items-end gap-2">
                    <div className="w-32">
                      <Label className="text-xs">Quantité</Label>
                      <Input
                        inputMode="numeric"
                        value={sampleQty}
                        onChange={(e) => setSampleQty(e.target.value)}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const result = createSampleRequest(
                          dossier.selectedSensorId ?? "",
                          Number(sampleQty),
                          sampleRoute,
                        );
                        setSampleMessage(
                          result.ok
                            ? "Demande enregistrée dans cet onglet. Aucun e-mail n'est envoyé et aucun stock n'est garanti."
                            : result.reason,
                        );
                      }}
                    >
                      Enregistrer la demande
                    </Button>
                  </div>
                  {sampleMessage ? <p className="text-sm">{sampleMessage}</p> : null}
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
