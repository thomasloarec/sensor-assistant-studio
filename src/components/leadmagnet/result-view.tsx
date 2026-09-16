/** Écran « Résultat » : ce que le test d'un couple a montré.
 *
 * Cet écran est de la PRÉSENTATION seule. Il n'appelle aucun moteur, ne calcule
 * aucun seuil et n'arrondit rien : il affiche l'essai enregistré tel que
 * l'atelier l'a remonté (`TestedPair`). Une distance absente reste absente, et
 * un verdict hors couverture reprend le message du moteur mot pour mot.
 */
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { msg, t } from "@/lib/i18n/core";
import type { PairCard } from "@/lib/leadmagnet/pair-cards";
import type { TestedPair } from "@/lib/leadmagnet/tested-pairs";
import { PairThumbnail } from "./pair-thumbnail";

/** Un seul mot, et seulement s'il est déjà seul dans la réponse : on ne découpe
 *  pas une phrase pour en extraire un sujet (huit langues, aucune grammaire
 *  fiable ici).
 *
 *  Une seule tournure est reconnue en plus, parce qu'elle est celle de la
 *  question posée : « … si le/la/un/une <mot> … » (« Savoir si le capot d'une
 *  machine est fermé » → « capot »). Aucun autre découpage n'est tenté ; sans
 *  correspondance, la phrase parle de « votre pièce ». */
export function detectedObjectWord(answer: string | null | undefined): string | null {
  const value = (answer ?? "").trim();
  if (!value) return null;
  if (value.length <= 24 && !/[\s.,;:!?]/.test(value)) return value;
  const after = /\bsi\s+(?:le|la|les|un|une|des|l['’])\s*([\p{L}]{3,24})\b/iu.exec(value);
  return after?.[1] ?? null;
}

/* i18n-canonical : sur-titres traduits au rendu par t(). */
const VERDICT_OVERLINE: Readonly<Record<TestedPair["verdict"], string>> = {
  expected: "Détection prévue",
  none: "Pas de détection sur ce cycle",
  undocumented: "Position à mesurer",
  unpublished: "Position à mesurer",
};

/** Chronologie du cycle, en LECTURE SEULE, reconstruite depuis les valeurs
 *  enregistrées. Sans distances publiées, la barre entière est hachurée. */
function ResultCycle({ pair }: { pair: TestedPair }) {
  const { pullInMm, dropOutMm, travelStartMm, travelEndMm } = pair;
  const known =
    pair.verdict === "expected" &&
    pullInMm !== null &&
    dropOutMm !== null &&
    travelStartMm !== null &&
    travelEndMm !== null &&
    travelStartMm !== travelEndMm;
  // L'aller va de la position ouverte à la position fermée, le retour l'inverse.
  const ratio = (mm: number) =>
    known ? (travelStartMm! - mm) / (travelStartMm! - travelEndMm!) : 0;
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const closeAt = clamp(ratio(pullInMm ?? 0)) * 50;
  const openAt = 50 + (1 - clamp(ratio(dropOutMm ?? 0))) * 50;
  return (
    <div className="space-y-2">
      <div
        className="result-cycle"
        role="img"
        data-known={known ? "published" : "unknown"}
        aria-label={
          known
            ? msg("Contact fermé de {0} % à {1} % du cycle.", [
                String(Math.round(closeAt)),
                String(Math.round(openAt)),
              ])
            : t("Cycle indéterminé : aucune distance publiée pour cette position.")
        }
      >
        {known ? (
          <span
            className="result-cycle-closed"
            style={{ left: `${closeAt}%`, width: `${Math.max(0, openAt - closeAt)}%` }}
          />
        ) : (
          <span className="result-cycle-unknown" />
        )}
      </div>
      <p className="t-caption flex flex-wrap items-center gap-3">
        <span className="result-cycle-key result-cycle-key-closed">{t("Contact fermé")}</span>
        <span className="result-cycle-key result-cycle-key-open">{t("Contact ouvert")}</span>
        <span className="result-cycle-key result-cycle-key-unknown">{t("Indéterminé")}</span>
      </p>
    </div>
  );
}

export interface ResultViewProps {
  pair: TestedPair | null;
  /** Réponse 1, telle que saisie : jamais traduite, jamais réécrite. */
  detectionGoal: string | null;
  tested: readonly TestedPair[];
  /** Prochains couples proposés, dans l'ordre décidé par `pair-cards.ts`. */
  proposals: readonly PairCard[];
  onSeePairs: () => void;
  onConfirmWithStandex: () => void;
  onRequestTrial: () => void;
  onReplaceMagnet: () => void;
  onTestPair: (sensorId: string) => void;
}

export function ResultView({
  pair,
  detectionGoal,
  tested,
  proposals,
  onSeePairs,
  onConfirmWithStandex,
  onRequestTrial,
  onReplaceMagnet,
  onTestPair,
}: ResultViewProps) {
  if (!pair)
    return (
      <div className="panel-block-lg space-y-4" data-testid="result-empty">
        <p className="t-title-m">{t("Testez un couple pour voir son résultat ici.")}</p>
        <Button onClick={onSeePairs} className="min-h-11">
          {t("Voir les couples proposés")}
        </Button>
      </div>
    );

  const word = detectedObjectWord(detectionGoal);
  const couple = `${t("Le capteur")} ${pair.sensorId} + ${t("l’aimant")} ${pair.magnetId}`;
  const positive = pair.verdict === "expected";
  const approachLabel =
    pair.approach === "F1"
      ? t("Face à face")
      : pair.approach === "D3"
        ? t("Perpendiculaire")
        : t("Parallèle");
  const nextProposal = proposals.find(
    (c) => !tested.some((p) => p.sensorId === c.sensorId && p.magnetId === c.magnetId),
  );

  return (
    <div className="result-grid" data-testid="result-view" data-verdict={pair.verdict}>
      <div className="space-y-5">
        <p className="flex items-center gap-2">
          <span className={`result-dot result-dot-${positive ? "expected" : pair.verdict}`} aria-hidden="true" />
          <span className="t-label">{t(VERDICT_OVERLINE[pair.verdict])}</span>
        </p>

        {positive ? (
          <>
            <h2 className="t-display-m">
              {word
                ? msg("{0} devrait détecter votre {1}.", [couple, word])
                : msg("{0} devrait détecter votre pièce.", [couple])}
            </h2>
            <p className="t-body">
              {msg(
                "En position {0}, le contact se ferme quand la pièce arrive à {1} mm et se rouvre à {2} mm.",
                [
                  approachLabel.toLocaleLowerCase(),
                  String(pair.pullInMm ?? "—"),
                  String(pair.dropOutMm ?? "—"),
                ],
              )}{" "}
              {pair.travelStartMm !== null && pair.travelEndMm !== null
                ? msg("Votre course de {0} → {1} mm est entièrement couverte.", [
                    String(pair.travelStartMm),
                    String(pair.travelEndMm),
                  ])
                : null}
            </p>
            <dl className="kpi-row">
              <div className="kpi">
                <dt>{t("Ferme à")}</dt>
                <dd className="t-metric">{`${pair.pullInMm ?? "—"} mm`}</dd>
              </div>
              <div className="kpi">
                <dt>{t("Ouvre à")}</dt>
                <dd className="t-metric">{`${pair.dropOutMm ?? "—"} mm`}</dd>
              </div>
              <div className="kpi">
                <dt>{t("Position")}</dt>
                <dd>{approachLabel}</dd>
              </div>
            </dl>
            <div className="notice notice-info space-y-2">
              <p>
                {t(
                  "Valeurs typiques publiées par Standex. Un essai avec des échantillons dans votre machine reste nécessaire avant de commander.",
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button className="min-h-11" onClick={onConfirmWithStandex}>
                {t("Confirmer avec Standex →")}
              </Button>
              <Button variant="outline" className="min-h-11" onClick={onSeePairs}>
                {t("Tester un autre couple")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="t-display-m">
              {pair.verdict === "unpublished"
                ? t("Les distances de ce couple ne sont pas publiées.")
                : pair.verdict === "none"
                  ? t("Ce cycle ne referme pas le contact.")
                  : t("Cette position n'est pas documentée.")}
            </h2>
            {/* Hors couverture, le message du moteur est repris MOT POUR MOT. */}
            <p className="t-body">
              {pair.mainMessage
                ? t(pair.mainMessage)
                : t(
                    "Standex publie ses distances pour des positions précises. En dehors, seul un essai réel donne la réponse — et Standex peut le faire pour vous.",
                  )}
            </p>
            {/* L'essai a été LU sur une commutation illustrative : la mention
                suit le résultat, elle ne vaut jamais validation technique. */}
            {pair.illustrative ? (
              <p className="notice-warning t-body-s" data-testid="result-illustrative">
                {t("Simulation illustrative — distance non caractérisée, à valider par essais")}
              </p>
            ) : null}
            <div className="result-options">
              <div className="panel-block space-y-3">
                <p className="t-title-s">{t("Option 1")}</p>
                <p className="t-body">{t("Revenir à une position documentée")}</p>
                <Button variant="outline" className="min-h-11" onClick={onReplaceMagnet}>
                  {t("Replacer l'aimant")}
                </Button>
              </div>
              <div className="panel-block result-option-primary space-y-3">
                <p className="t-title-s">{t("Option 2")}</p>
                <p className="t-body">{t("Demander un essai à Standex")}</p>
                <Button className="min-h-11" onClick={onRequestTrial}>
                  {t("Demander un essai →")}
                </Button>
              </div>
            </div>
            <p className="t-caption">
              {t(
                "Ce n'est pas une erreur : c'est la limite de ce que les données publiées permettent d'affirmer.",
              )}
            </p>
          </>
        )}
      </div>

      <aside className="space-y-5">
        <div className="panel-block space-y-3">
          {/* Vue statique du couple au point de fermeture : aucun canvas animé ici. */}
          <PairThumbnail sensorId={pair.sensorId} magnetId={pair.magnetId} />
          <p className="t-caption">
            {positive ? `● ${t("Contact fermé")}` : `◐ ${t("Contact indéterminé")}`}
          </p>
        </div>
      </aside>
    </div>
  );
}
