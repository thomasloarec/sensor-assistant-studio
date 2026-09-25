import { ILLUSTRATIVE_NOTE, GUIDE_UNPUBLISHED_NOTE } from "@/lib/standex/workshop-guide";
import { CompatibilityPanel } from "@/components/leadmagnet/compatibility-panel";
import { FIT_PANEL, type FitAssessment } from "@/lib/leadmagnet/application-fit";
import { sensorById, sizeLabel } from "@/lib/standex/sensor-catalog";
import { housingMaterial } from "@/lib/leadmagnet/product-presentation";
import { guideRange, formatGuideBound, hasGuideData, ACTIVATION_GUIDE } from "@/lib/standex/activation-guide";
/** Écran « Résultat » : ce que le test d'un couple a montré.
 *
 * Cet écran est de la PRÉSENTATION seule. Il n'appelle aucun moteur, ne calcule
 * aucun seuil et n'arrondit rien : il affiche l'essai enregistré tel que
 * l'atelier l'a remonté (`TestedPair`). Une distance absente reste absente, et
 * un verdict hors couverture reprend le message du moteur mot pour mot.
 */
import { Button } from "@/components/ui/button";
import { msg, t } from "@/lib/i18n/core";
import { materialLabelFor, pairCardFor, type PairCard } from "@/lib/leadmagnet/pair-cards";
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
  // Aucune ligne publiée pour CE couple : ce n'est pas un problème de position.
  unpublished: "Distances de ce couple non publiées",
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
  /** Un point de compatibilité du besoin reste ouvert : aucun résultat ne peut
   *  être présenté comme positif, même si la démonstration a fermé le contact. */
  applicationBlocked?: boolean;
  /** Évaluation complète, pour afficher ici le MÊME encart pédagogique que sur
   *  les couples, avec ses liens exacts vers les réponses à revoir. */
  fit?: FitAssessment | null;
  onGoToStep?: (key: string) => void;
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
  applicationBlocked = false,
  fit = null,
  onGoToStep,
  detectionGoal,
  tested,
  proposals,
  onSeePairs,
  onConfirmWithStandex,
  onRequestTrial,
  onReplaceMagnet,
  onTestPair,
}: ResultViewProps) {
  /** Le même encart qu'ailleurs, avec ses boutons d'édition : tant qu'un point
   *  reste ouvert, il s'affiche AVANT tout le reste, y compris quand aucun
   *  couple n'a été essayé — proposer « testez un couple » serait faux, puisque
   *  l'essai est justement bloqué. */
  const fitPanel =
    fit && fit.blocking && onGoToStep ? (
      <CompatibilityPanel assessment={fit} onGoToStep={onGoToStep} />
    ) : null;

  if (!pair)
    return fitPanel ? (
      <div className="space-y-5" data-testid="result-blocked-empty">
        {fitPanel}
      </div>
    ) : (
      <div className="panel-block-lg space-y-4" data-testid="result-empty">
        <p className="t-title-m">{t("Testez un couple pour voir son résultat ici.")}</p>
        <Button onClick={onSeePairs} className="min-h-11">
          {t("Voir les couples proposés")}
        </Button>
      </div>
    );


  const word = detectedObjectWord(detectionGoal);
  const card = pairCardFor(sensorById(pair.sensorId));
  // Les faits de l'aimant suivent le couple réellement testé, qui peut différer
  // du couple conseillé par défaut pour ce capteur.
  const testedMagnetMaterial = materialLabelFor(pair.magnetId);
  const couple = `${t("Le capteur")} ${pair.sensorId} + ${t("l’aimant")} ${pair.magnetId}`;
  /** Un point de compatibilité ouvert interdit tout résultat positif : une
   *  commutation obtenue en démonstration ne vérifie pas l'application. */
  const positive = pair.verdict === "expected" && !applicationBlocked;
  const guide = pair.guideReference ? guideRange(pair.sensorId, pair.guideReference, pair.magnetId, pair.approach) : null;
  /** Replacer l'aimant n'a de sens que si la POSITION est en cause. Quand aucune
   *  ligne n'est publiée pour ce couple, déplacer l'aimant ne change rien : on ne
   *  laisse donc pas entendre que la personne a bougé quelque chose. */
  const canReplace =
    !(pair.verdict === "unpublished" && !guide) &&
    (pair.verdict === "none" ||
      pair.documentedPosition === false ||
      (pair.documentedPosition === undefined && pair.verdict === "undocumented"));
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
          <span className="t-label">{t(applicationBlocked ? FIT_PANEL.resultOverline : guide ? "Plage du guide disponible" : VERDICT_OVERLINE[pair.verdict])}</span>
        </p>
        {applicationBlocked ? (
          <div className="notice-warning space-y-3" data-testid="result-application-blocked">
            <p className="t-body">{t(FIT_PANEL.demoNotApplication)}</p>
            {fitPanel ? null : (
              <Button variant="outline" className="min-h-11" onClick={onSeePairs}>
                {t("Revoir les points de compatibilité")}
              </Button>
            )}
          </div>
        ) : null}
        {/* Encart complet, avec les liens exacts vers les réponses à revoir. */}
        {fitPanel}


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
                ? msg("Course simulée : {0} → {1} mm.", [
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
              {applicationBlocked ? t(FIT_PANEL.resultHeadline) : guide ? t("Votre couple dispose de données documentées.") : pair.verdict === "unpublished"
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
            {guide ? (
              <div className="notice-info space-y-2" data-testid="result-guide">
                <p className="t-metric">{msg("Plage documentée : {0} à {1} mm — {2}, {3}", [formatGuideBound(guide.upMm, guide.upNote), formatGuideBound(guide.toMm, guide.toNote), guide.sensorReference, guide.approachId])}</p>
                <p className="t-body">{t(pair.documentedPosition ? "Position du guide sélectionnée." : "Montage différent de la position du guide : la plage reste une référence, à confirmer dans votre configuration.")}</p>
                <a href={ACTIVATION_GUIDE.source.url} target="_blank" rel="noopener noreferrer">{msg("Guide Standex, page {0}", [String(guide.page)])}</a>
              </div>
            ) : pair.illustrative ? (
              <p className="notice-warning t-body-s" data-testid="result-illustrative">
                {t(hasGuideData(pair.sensorId) ? ILLUSTRATIVE_NOTE : GUIDE_UNPUBLISHED_NOTE)}
              </p>
            ) : null}
            <div className="result-options">
              {canReplace ? <div className="panel-block space-y-3">
                <p className="t-title-s">{t("Option 1")}</p>
                <p className="t-body">{pair.verdict === "none" ? t("Rapprocher l’aimant dans cette position") : t("Revenir à une position documentée")}</p>
                <Button variant="outline" className="min-h-11" onClick={onReplaceMagnet}>
                  {t("Replacer l'aimant")}
                </Button>
              </div> : null}
              <div className="panel-block result-option-primary space-y-3">
                {canReplace ? <p className="t-title-s">{t("Option 2")}</p> : null}
                <p className="t-body">{t(guide && pair.documentedPosition ? "Faire confirmer par Standex" : "Demander un essai à Standex")}</p>
                <Button className="min-h-11" onClick={guide && pair.documentedPosition ? onConfirmWithStandex : onRequestTrial}>
                  {t(guide && pair.documentedPosition ? "Confirmer avec Standex →" : "Demander un essai →")}
                </Button>
              </div>
            </div>
            {!guide ? <p className="t-caption">
              {t(
                "Ce n'est pas une erreur : c'est la limite de ce que les données publiées permettent d'affirmer.",
              )}
            </p> : null}
          </>
        )}
      </div>

      <aside className="space-y-5">
        <div className="panel-block space-y-3">
          {/* Vue statique du couple au point de fermeture : aucun canvas animé ici. */}
          <PairThumbnail sensorId={pair.sensorId} magnetId={pair.magnetId} />
          <div className="pair-card-identities" aria-label={t("Capteur et aimant")}>
            <div><span className="t-label">{t("Capteur")}</span><strong className="t-title-m">{pair.sensorId}</strong></div>
            <div><span className="t-label">{t("Aimant")}</span><strong className="t-title-m">{pair.magnetId}</strong></div>
          </div>
          <p className="t-body">{t(sensorById(pair.sensorId).description)}</p>
          <dl className="pair-card-facts">
            {testedMagnetMaterial ? <div><dt>{t("Matériau de l'aimant")}</dt><dd>{t(testedMagnetMaterial)}</dd></div> : null}
            <div><dt>{t("Montage du capteur")}</dt><dd>{t(card.fixingLabel)}</dd></div>
            <div><dt>{t("Dimensions du capteur")}</dt><dd className="t-metric">{sizeLabel(sensorById(pair.sensorId))}</dd></div>
          </dl>
          {housingMaterial(sensorById(pair.sensorId)) ? <p className="t-caption">{t(housingMaterial(sensorById(pair.sensorId)))}</p> : null}
          <div className="pair-card-documentation">
            {guide ? <>
              <p className="t-label">{t("Plage indicative d'activation")}</p>
              <p className="t-metric">{formatGuideBound(guide.upMm, guide.upNote)} – {formatGuideBound(guide.toMm, guide.toNote)} mm</p>
              <p className="t-caption">{t("Plage documentaire indicative, sans validation de la simulation.")}</p>
              <p className="t-caption"><strong>{t("Référence documentaire")}</strong> · {guide.sensorReference} · {guide.approachId}</p>
            </> : pair.verdict === "unpublished" ? (
              <p className="t-caption">{t("Distances non publiées pour ce couple")}</p>
            ) : pair.pullInMm !== null || pair.dropOutMm !== null ? (
              <>
                <p className="t-label">{t("Valeurs typiques publiées par Standex")}</p>
                <p className="t-metric">{t("Ferme à")} {pair.pullInMm ?? "—"} mm · {t("Ouvre à")} {pair.dropOutMm ?? "—"} mm</p>
              </>
            ) : null}
          </div>
          <p className="t-caption">
            {positive ? `● ${t("Contact fermé")}` : `◐ ${t("Contact indéterminé")}`}
          </p>
        </div>
      </aside>
    </div>
  );
}
