/** Suivi client réel : dossiers envoyés, retours Standex publiés, offres, échantillons.
 *
 * Tout vient des appels serveur : aucune réussite n'est simulée localement.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { FileText, FolderOpen } from "lucide-react";
import {
  acceptVariant,
  fetchClientView,
  fetchMyDossiers,
  requestSamples,
  updateSample,
  type DossierListItem,
  type DossierView,
} from "@/lib/leadmagnet/supabase-adapter";
import type { LeadBackendStatus } from "@/lib/leadmagnet/backend";
import type { VariantProposal } from "@/lib/leadmagnet/variant";

interface Props {
  backend: LeadBackendStatus | null;
  serverDossierId: string | null;
  contextGeneration: number;
  /** Ouvre RÉELLEMENT un dossier : le dernier contenu envoyé accompagne le
   * changement de contexte, sinon l'ancien contenu resterait affiché. */
  onSelectDossier: (dossier: {
    id: string;
    revision: number;
    title: string;
    snapshot: Record<string, unknown> | null;
  }) => { ok: boolean };
  /** Reprise dans l'espace de conception à partir du dossier réellement envoyé.
   * La version d'origine et la version courante du serveur sont distinctes. */
  onReopenSnapshot?: (input: {
    dossierId: string;
    sourceRevision: number;
    currentRevision: number;
    snapshot: Record<string, unknown>;
  }) => { ok: boolean };
  /** Reprise RÉELLE de la variante, appliquée au contenu de la version relue.
   * `commit` enregistre la reprise côté serveur : il n'est appelé que si la
   * variante peut vraiment être appliquée.
   */
  onApplyVariant?: (input: {
    dossierId: string;
    revision: number;
    snapshot: Record<string, unknown>;
    variant: VariantProposal;
    commit: () => Promise<unknown>;
  }) => Promise<{
    applied: string[];
    notApplied: string[];
    refused?: string;
  }>;
  /** Ouvre un fichier RÉELLEMENT transmis pour une version donnée. */
  onOpenTransferredFile?: (file: {
    path: string;
    name: string;
    dossierId: string;
    revision: number;
  }) => void;
}

const routeLabel: Record<string, string> = {
  distributors: "Distributeurs partenaires",
  standex_direct: "Standex en direct, sous confirmation",
  manual_review: "Revue manuelle Standex",
};

const verdictLabel: Record<string, string> = {
  validated: "Validé",
  variant_proposed: "Variante proposée",
  more_info: "Informations complémentaires demandées",
};

export function ClientFollowUp({
  backend,
  serverDossierId,
  contextGeneration,
  onSelectDossier,
  onReopenSnapshot,
  onApplyVariant,
  onOpenTransferredFile,
}: Props) {
  const [list, setList] = useState<DossierListItem[]>([]);
  const [view, setView] = useState<DossierView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [qty, setQty] = useState("5");
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const ready = Boolean(backend?.ready);
  const viewRequest = useRef(0);
  useEffect(() => {
    viewRequest.current += 1;
    setView(null);
  }, [serverDossierId, contextGeneration]);

  const reloadList = useCallback(async () => {
    if (!ready) return;
    try {
      setList(await fetchMyDossiers());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : null);
    }
  }, [ready]);

  const reloadView = useCallback(async (id: string) => {
    const request = ++viewRequest.current;
    try {
      const loaded = await fetchClientView(id);
      if (request !== viewRequest.current) return;
      setView(loaded);
    } catch (error) {
      if (request !== viewRequest.current) return;
      setView(null);
      setMessage(error instanceof Error ? error.message : null);
    }
  }, []);

  useEffect(() => {
    void reloadList();
  }, [reloadList]);
  useEffect(() => {
    if (ready && serverDossierId) void reloadView(serverDossierId);
  }, [ready, serverDossierId, contextGeneration, reloadView]);

  if (!ready)
    return (
      <p className="t-caption">
        {backend?.message ??
          "La liaison avec l'équipe Standex n'est pas encore active : rien n'a été envoyé."}
      </p>
    );

  const current = view;
  const published = (current?.reviews ?? []).filter((r) => r.published);
  const active = published.find((r) => !r.superseded) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => void reloadList()}>
          Actualiser mes dossiers
        </Button>
        {list.length === 0 ? (
          <div className="flex w-full flex-col items-center px-4 py-12 text-center">
            <FolderOpen className="mb-3 h-8 w-8 text-[var(--standex-blue-25)]" aria-hidden="true" />
            <span className="t-title-s">Aucun dossier envoyé pour l'instant.</span>
          </div>
        ) : null}
      </div>

      <ul className="space-y-3">
        {list.map((d) => (
          <li key={d.id} className="surface-interactive flex flex-wrap items-center gap-3 p-5">
            <Button
              size="sm"
              variant={d.id === serverDossierId ? "default" : "outline"}
              onClick={async () => {
                // On charge le contenu réellement envoyé AVANT de changer le
                // contexte : ouvrir un dossier ne doit jamais laisser à l'écran
                // le contenu du dossier précédent.
                const request = ++viewRequest.current;
                let loaded: DossierView | null = null;
                try {
                  loaded = await fetchClientView(d.id);
                  if (request !== viewRequest.current) return;
                } catch (error) {
                  if (request !== viewRequest.current) return;
                  setMessage(error instanceof Error ? error.message : null);
                  return;
                }
                const latest = [...loaded.revisions].sort((a, b) => b.revision - a.revision)[0];
                const out = onSelectDossier({
                  id: d.id,
                  revision: loaded.dossier.current_revision,
                  title: loaded.dossier.title,
                  snapshot: latest ? latest.snapshot : null,
                });
                if (!out.ok) return;
                setView(loaded);
              }}
            >
              Ouvrir
            </Button>
            <span className="t-title-s">{d.title}</span>
            <Badge variant="outline" className="t-metric">
              version {d.current_revision}
            </Badge>
            <Badge variant="secondary">
              {d.nda_required
                ? d.nda_status === "in_force"
                  ? "Confidentialité en vigueur"
                  : "Confidentialité en attente"
                : "Sans accord de confidentialité"}
            </Badge>
            <span className="t-caption">
              {d.published_reviews} retour(s) — {d.active_offers} offre(s) valable(s)
            </span>
            <span className="t-caption t-metric sm:ml-auto">{d.updated_at}</span>
          </li>
        ))}
      </ul>

      {current ? (
        <>
          <Separator />
          <section className="space-y-2">
            <h4 className="font-medium">Retours Standex publiés</h4>
            {published.length === 0 ? (
              <p className="t-caption">
                Votre version {current.dossier.current_revision} est en cours de revue.
              </p>
            ) : (
              published.map((r) => (
                <div key={r.id} className="surface-interactive p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{verdictLabel[r.verdict] ?? r.verdict}</Badge>
                    <span className="t-metric text-[0.8125rem]">version {r.revision}</span>
                    {r.superseded ? <Badge variant="outline">remplacé</Badge> : null}
                    {r.exact_part_number ? (
                      <Badge variant="secondary">
                        {r.exact_part_number} (
                        {r.designation === "custom" ? "spécifique" : "standard"})
                      </Badge>
                    ) : null}
                  </div>
                  {r.message ? <p className="mt-2 whitespace-pre-wrap">{r.message}</p> : null}
                  {r.conditions ? (
                    <p className="t-caption mt-1">Conditions : {r.conditions}</p>
                  ) : null}
                  {r.verdict === "variant_proposed" ? (
                    <div className="mt-2 space-y-1">
                      <ul className="list-disc pl-5 text-xs">
                        {Object.entries(r.variant ?? {}).map(([k, v]) => (
                          <li key={k}>
                            {k} : {String(v)}
                          </li>
                        ))}
                      </ul>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={Boolean(r.variant_accepted_at) || Boolean(r.superseded)}
                        onClick={async () => {
                          // La variante s'applique au contenu de LA version relue
                          // par Standex, et le serveur n'enregistre la reprise que
                          // si cette application est réellement possible.
                          const reviewed = current.revisions.find(
                            (rev) => rev.revision === r.revision,
                          );
                          if (!reviewed) {
                            setMessage(
                              "La version relue par Standex n'est pas disponible ici : rien n'a été repris.",
                            );
                            return;
                          }
                          if (!onApplyVariant) return;
                          try {
                            const applied = await onApplyVariant({
                              dossierId: current.dossier.id,
                              revision: current.dossier.current_revision,
                              snapshot: reviewed.snapshot,
                              variant: (r.variant ?? {}) as VariantProposal,
                              commit: () => acceptVariant(r.id),
                            });
                            if (applied.refused) {
                              setMessage(applied.refused);
                              return;
                            }
                            setMessage(
                              [
                                "Variante reprise dans le contenu ouvert ici : la version envoyée reste intacte et rien n'est approuvé tant que vous ne renvoyez pas ce dossier.",
                                "Modifié dans votre dossier : " + applied.applied.join(" ; "),
                                applied.notApplied.length
                                  ? "À traiter vous-même : " + applied.notApplied.join(" ; ")
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" "),
                            );
                            await reloadView(current.dossier.id);
                          } catch (error) {
                            setMessage(error instanceof Error ? error.message : null);
                          }
                        }}
                      >
                        {r.variant_accepted_at
                          ? "Variante reprise"
                          : r.superseded
                            ? "Retour remplacé par un plus récent"
                            : "Reprendre cette variante"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </section>

          <section className="space-y-2">
            <h4 className="font-medium">Offres</h4>
            {current.offers.length === 0 ? (
              <p className="t-caption">
                Aucune offre : un prix n'est établi qu'après un retour validé sur la version en
                cours.
              </p>
            ) : (
              current.offers.map((o) => (
                <div
                  key={o.id}
                  className={`surface-interactive p-5 ${o.active ? "" : "opacity-60"}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={o.active ? "default" : "outline"}>
                      {o.active ? "Valable" : o.voided ? "Périmée" : "Échue"}
                    </Badge>
                    <span className="font-medium">{o.part_number}</span>
                    <span className="t-metric text-[0.8125rem]">
                      version {o.revision} —{" "}
                      {o.designation === "custom" ? "spécifique" : "standard"}
                    </span>
                  </div>
                  <ul className="t-metric mt-1 list-disc pl-5 text-[0.8125rem]">
                    {(o.tiers ?? []).map((t, i) => (
                      <li key={i}>
                        {t.quantity} pièces : {t.unit_price} {o.currency}
                      </li>
                    ))}
                  </ul>
                  <p className="t-caption t-metric mt-1">
                    Minimum {o.moq} — {o.incoterm} — délai{" "}
                    {o.lead_time_weeks ? `${o.lead_time_weeks} semaines` : "à confirmer"} — valable
                    jusqu'au {o.valid_until}
                    {o.nre_tooling_cost ? ` — outillage ${o.nre_tooling_cost} ${o.currency}` : ""}
                    {o.annual_volume_basis
                      ? ` — base ${o.annual_volume_basis} capteurs/an`
                      : " — volume annuel non renseigné"}
                  </p>
                  {o.void_reason ? <p className="t-caption mt-1">{o.void_reason}</p> : null}
                </div>
              ))
            )}
          </section>

          <section className="space-y-2">
            <h4 className="font-medium">Échantillons</h4>
            {active && active.verdict === "validated" && active.exact_part_number ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-28">
                  <Label className="t-label">Quantité</Label>
                  <Input
                    className="t-metric text-right"
                    inputMode="numeric"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      const out = await requestSamples({
                        reviewId: active.id,
                        partNumber: active.exact_part_number as string,
                        quantity: Number(qty),
                      });
                      setMessage(
                        `Demande enregistrée pour ${out.part_number} — traitement : ${
                          routeLabel[out.route] ?? out.route
                        }. La gratuité n'est jamais automatique.`,
                      );
                      await reloadView(current.dossier.id);
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : null);
                    }
                  }}
                >
                  Demander des échantillons
                </Button>
              </div>
            ) : (
              <p className="t-caption">
                Les échantillons sont possibles après un retour validé indiquant la référence
                exacte.
              </p>
            )}
            {current.samples.map((s) => (
              <div key={s.id} className="surface-interactive p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {s.quantity} × {s.part_number}
                  </span>
                  <Badge variant="outline">{routeLabel[s.route] ?? s.route}</Badge>
                  <Badge variant="secondary">
                    {s.status === "superseded" ? "conception modifiée depuis" : s.status}
                  </Badge>
                  <span className="t-metric text-[0.8125rem]">version {s.revision}</span>
                </div>
                <p className="t-caption t-metric mt-1">
                  Commandés sur la version {s.origin_revision ?? s.revision}
                  {s.revalidated_from_revision !== null && s.revalidated_from_revision !== undefined
                    ? ` — revalidés depuis la version ${s.revalidated_from_revision}`
                    : ""}
                  .
                </p>
                {s.feedback ? (
                  <p className="t-caption t-metric mt-1">
                    Votre retour (version {s.feedback_revision}) : {s.feedback}
                  </p>
                ) : null}
                <div className="mt-2 flex items-end gap-2">
                  <Textarea
                    rows={2}
                    placeholder="Retour d'essai sur ces échantillons"
                    value={feedback[s.id] ?? ""}
                    onChange={(e) => setFeedback((f) => ({ ...f, [s.id]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await updateSample({ sampleId: s.id, feedback: feedback[s.id] ?? "" });
                        setMessage(
                          "Retour d'essai enregistré et conservé avec la version concernée.",
                        );
                        await reloadView(current.dossier.id);
                      } catch (error) {
                        setMessage(error instanceof Error ? error.message : null);
                      }
                    }}
                  >
                    Envoyer
                  </Button>
                </div>
              </div>
            ))}
          </section>

          {onOpenTransferredFile &&
          current.revisions.some((r) => (r.transferred_files ?? []).length) ? (
            <section className="space-y-2">
              <h4 className="font-medium">Fichiers réellement transmis</h4>
              {current.revisions.map((r) =>
                (r.transferred_files ?? []).length ? (
                  <div
                    key={`files-${r.id}`}
                    className="surface-interactive flex flex-wrap items-center gap-3 p-5"
                  >
                    <FileText
                      className="h-5 w-5 shrink-0 text-[var(--primary)]"
                      aria-hidden="true"
                    />
                    <span className="t-caption t-metric">Version {r.revision} :</span>
                    {(r.transferred_files ?? []).map((f, i) => (
                      <Button
                        key={`${r.id}-${f.path ?? i}`}
                        size="sm"
                        variant="outline"
                        disabled={!f.path}
                        onClick={() =>
                          f.path
                            ? onOpenTransferredFile({
                                path: f.path,
                                name: f.file_name ?? "fichier",
                                dossierId: current.dossier.id,
                                revision: r.revision,
                              })
                            : undefined
                        }
                      >
                        Lire {f.file_name ?? "ce fichier"}
                      </Button>
                    ))}
                  </div>
                ) : null,
              )}
              <p className="t-caption">
                Seuls les fichiers réellement enregistrés côté Standex apparaissent ici, et leur
                lecture dépend de vos droits.
              </p>
            </section>
          ) : null}

          {onReopenSnapshot && current.revisions.length ? (
            <section className="space-y-2">
              <h4 className="font-medium">Reprendre une version envoyée</h4>
              <div className="flex flex-wrap gap-2">
                {current.revisions.map((r) => (
                  <Button
                    key={r.id}
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onReopenSnapshot({
                        dossierId: current.dossier.id,
                        sourceRevision: r.revision,
                        currentRevision: current.dossier.current_revision,
                        snapshot: r.snapshot,
                      })
                    }
                  >
                    Version {r.revision}
                  </Button>
                ))}
              </div>
              <p className="t-caption">
                La reprise ouvre exactement le contenu envoyé pour ce dossier. Votre accord d'envoi
                et la relecture sont à refaire.
              </p>
            </section>
          ) : null}
        </>
      ) : null}

      {message ? <p className="notice notice-info">{message}</p> : null}
      <p className="t-caption">
        Rien n'est décidé ici : une référence, un prix ou une livraison ne valent qu'après
        confirmation écrite de Standex.
      </p>
    </div>
  );
}
