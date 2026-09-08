/** Suivi client réel : dossiers envoyés, retours Standex publiés, offres, échantillons.
 *
 * Tout vient des appels serveur : aucune réussite n'est simulée localement.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
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
  /** Changer de dossier change TOUT le contexte serveur, jamais l'identifiant seul. */
  onSelectDossier: (dossier: { id: string; revision: number; title: string }) => void;
  /** Reprise dans l'espace de conception à partir du dossier réellement envoyé. */
  onReopenSnapshot?: (input: {
    dossierId: string;
    revision: number;
    snapshot: Record<string, unknown>;
  }) => void;
  /** Reprise RÉELLE de la variante dans le dossier en cours de conception.
   * Le dossier visé est transmis : une variante du dossier A ne peut jamais
   * atterrir dans le dossier B ouvert à l'écran.
   */
  onApplyVariant?: (input: { dossierId: string; variant: VariantProposal }) => {
    applied: string[];
    notApplied: string[];
    refused?: string;
  };
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
  onSelectDossier,
  onReopenSnapshot,
  onApplyVariant,
}: Props) {
  const [list, setList] = useState<DossierListItem[]>([]);
  const [view, setView] = useState<DossierView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [qty, setQty] = useState("5");
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const ready = Boolean(backend?.ready);

  const reloadList = useCallback(async () => {
    if (!ready) return;
    try {
      setList(await fetchMyDossiers());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : null);
    }
  }, [ready]);

  const reloadView = useCallback(async (id: string) => {
    try {
      setView(await fetchClientView(id));
    } catch (error) {
      setView(null);
      setMessage(error instanceof Error ? error.message : null);
    }
  }, []);

  useEffect(() => {
    void reloadList();
  }, [reloadList]);
  useEffect(() => {
    if (ready && serverDossierId) void reloadView(serverDossierId);
  }, [ready, serverDossierId, reloadView]);

  if (!ready)
    return (
      <p className="text-sm text-muted-foreground">
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
          <span className="text-sm text-muted-foreground">
            Aucun dossier envoyé pour l'instant.
          </span>
        ) : null}
      </div>

      <ul className="space-y-1">
        {list.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
            <Button
              size="sm"
              variant={d.id === serverDossierId ? "default" : "outline"}
              onClick={() => {
                onSelectDossier({ id: d.id, revision: d.current_revision, title: d.title });
                void reloadView(d.id);
              }}
            >

              Ouvrir
            </Button>
            <span className="font-medium">{d.title}</span>
            <Badge variant="outline">version {d.current_revision}</Badge>
            <Badge variant="secondary">
              {d.nda_required
                ? d.nda_status === "in_force"
                  ? "Confidentialité en vigueur"
                  : "Confidentialité en attente"
                : "Sans accord de confidentialité"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {d.published_reviews} retour(s) — {d.active_offers} offre(s) valable(s)
            </span>
          </li>
        ))}
      </ul>

      {current ? (
        <>
          <Separator />
          <section className="space-y-2">
            <h4 className="font-medium">Retours Standex publiés</h4>
            {published.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Votre version {current.dossier.current_revision} est en cours de revue.
              </p>
            ) : (
              published.map((r) => (
                <div key={r.id} className="rounded border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{verdictLabel[r.verdict] ?? r.verdict}</Badge>
                    <span className="text-xs text-muted-foreground">version {r.revision}</span>
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
                    <p className="mt-1 text-xs text-muted-foreground">
                      Conditions : {r.conditions}
                    </p>
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
                          try {
                            const out = await acceptVariant(r.id);
                            const applied = onApplyVariant?.(
                              (r.variant ?? {}) as VariantProposal,
                            );
                            setMessage(
                              [
                                `Variante reprise dans votre version ${out.next_revision} : la version envoyée reste intacte et rien n'est approuvé tant que vous ne renvoyez pas ce dossier.`,
                                applied?.applied.length
                                  ? "Modifié dans votre dossier : " + applied.applied.join(" ; ")
                                  : "Aucune valeur chiffrée à appliquer : la proposition reste descriptive.",
                                applied?.notApplied.length
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
              <p className="text-sm text-muted-foreground">
                Aucune offre : un prix n'est établi qu'après un retour validé sur la version en
                cours.
              </p>
            ) : (
              current.offers.map((o) => (
                <div
                  key={o.id}
                  className={`rounded border p-3 text-sm ${o.active ? "" : "opacity-60"}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={o.active ? "default" : "outline"}>
                      {o.active ? "Valable" : o.voided ? "Périmée" : "Échue"}
                    </Badge>
                    <span className="font-medium">{o.part_number}</span>
                    <span className="text-xs text-muted-foreground">
                      version {o.revision} —{" "}
                      {o.designation === "custom" ? "spécifique" : "standard"}
                    </span>
                  </div>
                  <ul className="mt-1 list-disc pl-5 text-xs">
                    {(o.tiers ?? []).map((t, i) => (
                      <li key={i}>
                        {t.quantity} pièces : {t.unit_price} {o.currency}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Minimum {o.moq} — {o.incoterm} — délai{" "}
                    {o.lead_time_weeks ? `${o.lead_time_weeks} semaines` : "à confirmer"} — valable
                    jusqu'au {o.valid_until}
                    {o.nre_tooling_cost ? ` — outillage ${o.nre_tooling_cost} ${o.currency}` : ""}
                    {o.annual_volume_basis
                      ? ` — base ${o.annual_volume_basis} capteurs/an`
                      : " — volume annuel non renseigné"}
                  </p>
                  {o.void_reason ? (
                    <p className="mt-1 text-xs text-muted-foreground">{o.void_reason}</p>
                  ) : null}
                </div>
              ))
            )}
          </section>

          <section className="space-y-2">
            <h4 className="font-medium">Échantillons</h4>
            {active && active.verdict === "validated" && active.exact_part_number ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-28">
                  <Label className="text-xs">Quantité</Label>
                  <Input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
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
              <p className="text-sm text-muted-foreground">
                Les échantillons sont possibles après un retour validé indiquant la référence
                exacte.
              </p>
            )}
            {current.samples.map((s) => (
              <div key={s.id} className="rounded border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {s.quantity} × {s.part_number}
                  </span>
                  <Badge variant="outline">{routeLabel[s.route] ?? s.route}</Badge>
                  <Badge variant="secondary">
                    {s.status === "superseded" ? "conception modifiée depuis" : s.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">version {s.revision}</span>
                </div>
                {s.feedback ? (
                  <p className="mt-1 text-xs text-muted-foreground">
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

          {onReopenSnapshot && current.revisions.length ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const last = current.revisions[current.revisions.length - 1];
                if (last)
                  onReopenSnapshot({
                    dossierId: current.dossier.id,
                    revision: last.revision,
                    snapshot: last.snapshot,
                  });
              }}

            >
              Reprendre la dernière version envoyée
            </Button>
          ) : null}
        </>
      ) : null}

      {message ? <p className="text-sm">{message}</p> : null}
      <p className="text-xs text-muted-foreground">
        Rien n'est décidé ici : une référence, un prix ou une livraison ne valent qu'après
        confirmation écrite de Standex.
      </p>
    </div>
  );
}
