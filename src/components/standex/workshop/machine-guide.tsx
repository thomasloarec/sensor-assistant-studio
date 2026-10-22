/** Parcours guidé du modèle importé : Modèle → Pièces mobiles → Mouvement →
 *  Installation → Essai. Une seule étape développée à la fois ; la scène reste
 *  visible à côté. Les coordonnées libres restent dans les réglages avancés. */
import { useState } from "react";
import { msg, t } from "@/lib/i18n/core";
import type { MachineAsset } from "@/lib/standex/machine-assets";
import type { MachineAssembly, Marker } from "@/lib/standex/machine-assembly";
import {
  activeClip,
  cycleU,
  markerReading,
  motionAxis,
  motionDirection,
  motionProblem,
  movingSelection,
  pointAt,
  usesClip,
  norm,
  toggleMoving,
  unit,
  within,
} from "@/lib/standex/machine-assembly";
import {
  attachPose,
  axisFromTwoPoints,
  depthReading,
  openingReading,
  throughAllowed,
} from "@/lib/standex/machine-mounting";
import type { Attachment, MountKind } from "@/lib/standex/machine-mounting";
import type { CycleSample, Vec3, WorkshopConfig } from "@/lib/standex/magnetic-workshop";
import { magnetSize } from "@/lib/standex/magnetic-workshop";
import { formatMm, sensorById } from "@/lib/standex/sensor-catalog";
import { CLIP_ISSUE_TEXT } from "@/lib/standex/machine-animation";
import type { GuideOverlay, MachineTool, SceneHit } from "./machine-scene";

export type GuideStep = "model" | "parts" | "motion" | "install" | "test";
export interface GuideState {
  step: GuideStep;
  isolate: boolean;
  pick: null | {
    purpose: "axis-points" | "axis-face" | "hole-points";
    points: Vec3[];
    /** Support du PREMIER point d'un axe de trou : le second doit être solidaire. */
    support?: { path: string; moving: boolean; group?: string | undefined };
  };
  target: "sensor" | "magnet";
  kind: { sensor: MountKind; magnet: MountKind };
  freed: ("sensor" | "magnet")[];
  /** Attaches libérées parce que le produit choisi ne permet plus ce montage. */
  incompatible?: ("sensor" | "magnet")[];
  /** Explication d'un pointage refusé (points confondus, supports distincts). */
  notice?: string | null;
}
export const INITIAL_GUIDE: GuideState = {
  step: "model",
  isolate: false,
  pick: null,
  target: "sensor",
  kind: { sensor: "surface", magnet: "surface" },
  freed: [],
};
/* i18n-canonical : libellés français traduits au rendu par t(). */
const STEPS: [GuideStep, string][] = [
  ["model", "Modèle"],
  ["parts", "Pièces mobiles"],
  ["motion", "Mouvement"],
  ["install", "Installation"],
  ["test", "Essai"],
];

export function dimsFor(config: WorkshopConfig, which: "sensor" | "magnet") {
  const body = which === "sensor" ? sensorById(config.sensorId).body : magnetSize(config);
  return { lengthMm: body[0], heightMm: body[1] };
}

/** Attache construite à partir d'un point cliqué (normale de la face). */
export function attachFromHit(
  hit: SceneHit,
  kind: MountKind,
  previous: Attachment | undefined,
): Attachment {
  const same = previous?.kind === kind;
  return {
    kind,
    support: hit.moving ? "moving" : "fixed",
    partPath: hit.path,
    point: hit.point,
    normal: hit.normal,
    offsetMm: same ? previous!.offsetMm : 0,
    spinDeg: same ? previous!.spinDeg : 0,
    flip: same ? previous!.flip : false,
    depthRef: same ? previous!.depthRef : "collar",
    axisSource: "face",
  };
}
export function attachPatch(
  which: "sensor" | "magnet",
  a: Attachment,
  config: WorkshopConfig,
): Partial<MachineAssembly> {
  const pose = attachPose(a, dimsFor(config, which));
  return which === "sensor"
    ? { sensorAttach: a, sensorPosition: pose.position, sensorRotation: pose.rotation, sensorMount: a.support }
    : { magnetAttach: a, magnetPosition: pose.position, magnetRotation: pose.rotation, magnetMount: a.support };
}

/** Direction (coulisse) ou axe (pivot) fixés depuis un point/normale ou deux points. */
export function motionFromPick(
  m: MachineAssembly,
  dir: Vec3,
  origin: Vec3,
): Partial<MachineAssembly> | null {
  const u = unit(dir);
  if (!u) return null;
  if (m.motion === "translation")
    return { axisVector: u, travel: u.map((v) => v * norm(m.travel)) as Vec3, motionStatus: "draft" };
  return { axisVector: u, pivot: origin, motionStatus: "draft" };
}

function Num({
  label,
  value,
  unit: u,
  min,
  max,
  step = 0.1,
  onCommit,
  testId,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step?: number;
  onCommit: (v: number) => void;
  testId?: string;
}) {
  const [invalid, setInvalid] = useState(false);
  return (
    <label className="mw-select-label">
      {msg("{0} ({1})", [t(label), u])}
      <input
        type="number"
        inputMode="decimal"
        data-testid={testId}
        min={min}
        max={max}
        step={step}
        key={value}
        defaultValue={Math.round(value * 1000) / 1000}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        onBlur={(e) => {
          const n = Number(e.target.value.replace(",", "."));
          if (e.target.value.trim() === "" || !Number.isFinite(n) || n < min || n > max) {
            e.target.value = String(Math.round(value * 1000) / 1000);
            setInvalid(true);
            return;
          }
          setInvalid(false);
          onCommit(n);
        }}
        aria-invalid={invalid || undefined}
      />
      {invalid && (
        <span className="mw-field-error" role="alert">
          {msg("Valeur refusée : saisissez un nombre entre {0} et {1}. La valeur précédente est conservée.", [
            String(min),
            String(max),
          ])}
        </span>
      )}
    </label>
  );
}

/** Variation signée, une décimale (+ explicite). */
const signedMm = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(1);

export function guideOverlay(
  state: GuideState,
  m: MachineAssembly,
  handlers: Pick<GuideOverlay, "onPickPart" | "onPickPoint" | "onPlace">,
  extent: number,
  u = 0,
): GuideOverlay {
  const axisDir = usesClip(m) ? null : motionDirection(m);
  const origin: Vec3 =
    m.motion === "rotation"
      ? m.pivot
      : m.sensorMount === "moving"
        ? m.sensorPosition
        : m.magnetPosition;
  return {
    highlightMoving: state.step === "parts" || state.step === "motion",
    isolate: state.isolate,
    axis:
      (state.step === "motion" || state.step === "test") && axisDir
        ? { origin, dir: axisDir, length: Math.max(20, extent * 0.4) }
        : null,
    points: state.pick?.points ?? [],
    // Un repère d'attache suit exactement la transformation de son support.
    attachMarks: [m.sensorAttach, m.magnetAttach]
      .filter((a): a is Attachment => !!a)
      .map((a) => pointAt(m, a.partPath, a.point, u)),
    ...handlers,
  };
}

export default function MachineGuide({
  state,
  setState,
  config,
  asset,
  tool,
  setTool,
  onChange,
  history,
  sample,
  progress,
  setProgress,
  playing,
  setPlaying,
  reason,
  onDemo,
  onMarkers,
  reduced = false,
}: {
  state: GuideState;
  setState: (f: (s: GuideState) => GuideState) => void;
  config: WorkshopConfig;
  asset: MachineAsset | null;
  tool: MachineTool;
  setTool: (t: MachineTool) => void;
  onChange: (patch: Partial<MachineAssembly>) => void;
  history: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void };
  sample: CycleSample;
  progress: number;
  setProgress: (v: number) => void;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  reason: string | null;
  onDemo: (key: string) => void;
  onMarkers: (markers: Marker[]) => void;
  reduced?: boolean;
}) {
  const m = config.machine!;
  const selection = movingSelection(m);
  const sensor = sensorById(config.sensorId);
  const problem = motionProblem({ ...m, motionStatus: "confirmed" });
  const status = m.motionStatus ?? "confirmed";
  const go = (step: GuideStep) => {
    setTool("navigate");
    setState((s) => ({ ...s, step, pick: null }));
  };
  const startPick = (purpose: NonNullable<GuideState["pick"]>["purpose"]) => {
    setState((s) => ({ ...s, pick: { purpose, points: [] } }));
    setTool("pick");
  };
  const target = state.target;
  const attach = target === "sensor" ? m.sensorAttach : m.magnetAttach;
  const kind = state.kind[target];
  const canThrough = target === "sensor" && throughAllowed(sensor.shape);
  const editAttach = (patch: Partial<Attachment>) => {
    if (!attach) return;
    onChange(attachPatch(target, { ...attach, ...patch }, config));
  };
  const opening = openingReading(m, sample.t);
  const clips = asset?.animation?.clips ?? [];
  const supportedClips = clips.filter((c) => c.supported);
  const clipMode = usesClip(m);
  const sampler = activeClip(m);
  const u = cycleU(m, sample.t);
  const reading = markerReading(m, u);
  const stepSize = clipMode && sampler ? Math.min(0.05, 0.1 / sampler.duration) : 0.05;
  const supportName = (path: string) =>
    asset?.nodes.find((n) => n.path === path)?.name ?? path;
  const stepIndex = STEPS.findIndex(([s]) => s === state.step);

  const body: Record<GuideStep, React.ReactNode> = {
    model: (
      <>
        <p className="t-body">
          {t("Fichier :")} <strong className="mw-file-name t-metric">{m.fileName}</strong>
        </p>
        <label className="mw-select-label">
          {t("Unités du fichier")}
          <select
            value={m.unitScale}
            onChange={(e) => onChange({ unitScale: Number(e.target.value) })}
          >
            <option value={1000}>{t("Mètres · standard GLB")}</option>
            <option value={1}>{t("Millimètres")}</option>
            <option value={10}>{t("Centimètres")}</option>
          </select>
        </label>
        {asset && (
          <p className="t-body">
            {t("Objet :")}{" "}
            <span className="t-metric">{asset.size.map((n) => formatMm(n, 1)).join(" × ")} mm</span>{" "}
            {t("(X × Y × Z). Vérifiez que cette taille est réaliste.")}
          </p>
        )}
        {asset && asset.parts.length === 1 && (
          <p className="notice-warning" data-testid="guide-monobloc">
            {t(
              "Ce fichier ne contient qu'un seul bloc : aucune pièce ne peut bouger séparément. Réexportez le modèle depuis votre CAO avec la pièce mobile comme corps ou composant séparé (GLB, une pièce par nœud).",
            )}
          </p>
        )}
        {clips.length > 0 && (
          <div className="notice-info" data-testid="guide-clips">
            <p>{msg("Ce fichier contient {0} animation(s) :", [String(clips.length)])}</p>
            <ul className="mw-clip-list">
              {clips.map((c) => (
                <li key={c.index} data-testid={"guide-clip-" + c.index}>
                  <span className="mw-part-name" translate="no">
                    {c.name}
                  </span>{" "}
                  <span className="t-metric">{msg("{0} s", [c.duration.toFixed(2)])}</span>{" "}
                  {c.supported
                    ? t("· mouvement rigide pris en charge")
                    : msg("· refusée : {0}", [c.issues.map((i) => t(CLIP_ISSUE_TEXT[i])).join(" ; ")])}
                </li>
              ))}
            </ul>
            {clips.length > supportedClips.length && (
              <p className="t-caption">
                {t(
                  "Une animation refusée n'est jamais rejouée en partie : le modèle statique et les clips pris en charge restent utilisables.",
                )}
              </p>
            )}
          </div>
        )}
        <p className="t-caption">
          {t("Le fichier reste dans ce navigateur ; il n'est pas envoyé.")}
        </p>
      </>
    ),
    parts: (
      <>
        {clipMode && (
          <div className="notice-info" data-testid="guide-parts-clip">
            <p>
              {t(
                "Animation du fichier : les pièces mobiles sont celles que le clip anime. La sélection ci-dessous ne sert qu'à « Définir le mouvement » et reste conservée.",
              )}
            </p>
            {sampler && (
              <ul className="mw-clip-list">
                {clips[sampler.index]?.animatedPaths.map((p) => (
                  <li key={p} translate="no" className="mw-part-name">
                    {supportName(p)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="t-body">
          {t(
            "Tout est fixe par défaut. Cliquez une pièce dans la scène ou dans la liste pour l'ajouter ou la retirer. Choisir un groupe inclut toutes ses sous-pièces.",
          )}
        </p>
        <div className="mw-guide-row">
          <button
            className="mw-button mw-secondary"
            aria-pressed={tool === "select"}
            data-testid="guide-select-tool"
            onClick={() => setTool(tool === "select" ? "navigate" : "select")}
          >
            {t(tool === "select" ? "Terminer la sélection" : "Sélectionner dans la scène")}
          </button>
          <button
            className="mw-button mw-secondary"
            aria-pressed={state.isolate}
            onClick={() => setState((s) => ({ ...s, isolate: !s.isolate }))}
          >
            {t(state.isolate ? "Tout afficher" : "Isoler les pièces mobiles")}
          </button>
        </div>
        <ul className="mw-part-tree" aria-label={t("Pièces du fichier")}>
          {asset?.nodes.map((n) => {
            const selected = selection.includes(n.path);
            const viaGroup = !selected && selection.some((s) => within(n.path, s));
            return (
              <li key={n.path} style={{ "--depth": n.depth } as React.CSSProperties}>
                <button
                  aria-pressed={selected || viaGroup}
                  disabled={viaGroup}
                  data-path={n.path}
                  onClick={() => onChange({ ...toggleMoving(m, n.path), motionStatus: m.motionStatus === "confirmed" ? "draft" : m.motionStatus ?? "draft" })}
                >
                  <span className="mw-part-name" translate="no">
                    {n.name}
                  </span>
                  <span className="t-caption">
                    {viaGroup
                      ? t("inclus par le groupe")
                      : selected
                        ? t("mobile")
                        : n.meshCount > 1
                          ? msg("groupe · {0} pièces", [String(n.meshCount)])
                          : t("fixe")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="t-body" data-testid="guide-selection-count">
          {selection.length
            ? msg("{0} élément(s) mobile(s) sélectionné(s).", [String(selection.length)])
            : t("Aucune pièce mobile : l'ensemble est fixe.")}
        </p>
      </>
    ),
    motion: (
      <>
        {clips.length > 0 && (
          /* i18n-canonical : libellés français traduits au rendu par t(). */
          <div className="mw-segmented" role="radiogroup" aria-label={t("Source du mouvement")}>
            <button
              role="radio"
              aria-checked={!clipMode}
              data-testid="guide-source-manual"
              onClick={() => onChange({ motionSource: "manual" })}
            >
              {t("Définir le mouvement")}
            </button>
            {supportedClips.length > 0 && (
              <button
                role="radio"
                aria-checked={clipMode}
                data-testid="guide-source-clip"
                onClick={() => {
                  const c =
                    supportedClips.find((x) => x.index === m.clip?.index && x.name === m.clip?.name) ??
                    supportedClips[0]!;
                  onChange({
                    motionSource: "clip",
                    clip: { index: c.index, name: c.name, duration: c.duration },
                  });
                }}
              >
                {t("Animation du fichier")}
              </button>
            )}
          </div>
        )}
        {clips.length > 0 && supportedClips.length === 0 && (
          <p className="notice-warning" data-testid="guide-no-clip">
            {t("Aucune animation de ce fichier n'est un mouvement rigide pris en charge : définissez le mouvement.")}
          </p>
        )}
        {clipMode ? (
          <>
            <label className="mw-select-label">
              {t("Animation")}
              <select
                data-testid="guide-clip"
                value={m.clip?.index ?? ""}
                onChange={(e) => {
                  const c = supportedClips.find((x) => x.index === Number(e.target.value));
                  if (c) onChange({ clip: { index: c.index, name: c.name, duration: c.duration } });
                }}
              >
                {m.clip && !sampler && <option value={m.clip.index}>{m.clip.name}</option>}
                {supportedClips.map((c) => (
                  <option key={c.index} value={c.index} translate="no">
                    {msg("{0} — {1} s", [c.name, c.duration.toFixed(2)])}
                  </option>
                ))}
              </select>
            </label>
            {problem && <p className="notice-warning">{t(problem)}</p>}
            <p className="t-caption">
              {t(
                "Le clip est lu tel qu'il est enregistré, du début à la fin, sans aller-retour ajouté. Pose d'installation = début du clip (0 s).",
              )}
            </p>
            <p className="t-caption">
              {t(
                "Attaches et repères sont enregistrés dans la pose statique du fichier et suivent exactement leur pièce. Un composant non attaché reste fixe.",
              )}
            </p>
            <label className="mw-select-label">
              {t("Aperçu de la position")}
              <input
                type="range"
                min={0}
                max={100}
                step={0.1}
                value={progress * 100}
                aria-label={t("Aperçu de la position")}
                onChange={(e) => setProgress(Number(e.target.value) / 100)}
              />
            </label>
            {sampler && (
              <p className="t-body t-metric" data-testid="guide-clip-preview">
                {msg("Temps : {0} s / {1} s", [(u * sampler.duration).toFixed(2), sampler.duration.toFixed(2)])}
              </p>
            )}
          </>
        ) : (
          <>
          <div className="mw-segmented" role="radiogroup" aria-label={t("Type de mouvement")}>
            {(
              [
                ["translation", "Coulisse"],
                ["rotation", "Pivote"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                role="radio"
                aria-checked={m.motion === v}
                onClick={() =>
                  onChange({
                    motion: v,
                    motionStatus: "draft",
                    ...(v === "translation" && m.axisVector
                      ? { travel: m.axisVector.map((a) => a * norm(m.travel)) as Vec3 }
                      : {}),
                  })
                }
              >
                {t(label)}
              </button>
            ))}
          </div>
          <p className="t-body">
            {t(
              m.motion === "translation"
                ? "Direction : cliquez une face dont la normale donne le sens d'ouverture, ou deux points le long de la glissière."
                : "Axe : cliquez deux points sur l'axe de la charnière, ou une face dont la normale est l'axe (le point cliqué devient le pivot).",
            )}
          </p>
          <div className="mw-guide-row">
            <button
              className="mw-button mw-secondary"
              aria-pressed={state.pick?.purpose === "axis-face"}
              onClick={() => startPick("axis-face")}
            >
              {t("Normale d'une face")}
            </button>
            <button
              className="mw-button mw-secondary"
              aria-pressed={state.pick?.purpose === "axis-points"}
              data-testid="guide-axis-points"
              onClick={() => startPick("axis-points")}
            >
              {t("Deux points")}
            </button>
            <button
              className="mw-button mw-secondary"
              disabled={!motionDirection(m)}
              onClick={() => {
                // Une coulisse ancienne sans vecteur libre s'inverse selon sa course.
                const d = motionDirection(m);
                if (!d) return;
                onChange({
                  axisVector: d.map((v) => -v) as Vec3,
                  travel: m.travel.map((v) => -v) as Vec3,
                  motionStatus: "draft",
                });
              }}
            >
              {t("Inverser le sens")}
            </button>
          </div>
          {state.pick?.purpose === "axis-points" && (
            <p className="notice-info">
              {msg("Point {0} sur 2 : cliquez dans la scène.", [String(state.pick.points.length + 1)])}
            </p>
          )}
          {/* i18n-canonical : libellés français traduits au rendu par t(). */}
          {m.motion === "translation" ? (
            <Num
              label="Course d'ouverture"
              unit="mm"
              min={0}
              max={5000}
              testId="guide-stroke"
              value={norm(m.travel)}
              onCommit={(s) => {
                const d = motionDirection(m);
                if (d) onChange({ travel: d.map((v) => v * s) as Vec3, axisVector: d, motionStatus: "draft" });
              }}
            />
          ) : (
            <Num
              label="Angle d'ouverture"
              unit="°"
              min={-360}
              max={360}
              step={1}
              testId="guide-angle"
              value={m.openingAngle}
              onCommit={(openingAngle) => onChange({ openingAngle, motionStatus: "draft" })}
            />
          )}
          {m.motion === "translation" && !unit(m.travel) && !m.axisVector && (
            <p className="t-caption">{t("Choisissez d'abord une direction.")}</p>
          )}
          <p className="t-caption">
            {t("Position fermée = pose du fichier importé (0 mm / 0°). Le cycle va de la position fermée à l'ouverture complète, puis revient.")}
          </p>
          <details>
            <summary>{t("Valeurs précises")}</summary>
            <div className="mw-guide-row">
              {(["X", "Y", "Z"] as const).map((a, i) => (
                <button
                  key={a}
                  className="mw-button mw-secondary"
                  onClick={() => {
                    const d: Vec3 = [0, 0, 0];
                    d[i] = 1;
                    onChange(
                      m.motion === "translation"
                        ? { axisVector: d, travel: d.map((v) => v * norm(m.travel)) as Vec3, motionStatus: "draft" }
                        : { axisVector: d, motionStatus: "draft" },
                    );
                  }}
                >
                  {msg("Axe {0}", [a])}
                </button>
              ))}
            </div>
            {(["X", "Y", "Z"] as const).map((a, i) => (
              <Num
                key={a}
                label={msg("Direction {0}", [a])}
                unit="—"
                min={-1000}
                max={1000}
                step={0.001}
                value={motionAxis(m)[i]!}
                onCommit={(v) => {
                  const d = [...motionAxis(m)] as Vec3;
                  d[i] = v;
                  const p = motionFromPick(m, d, m.pivot);
                  if (p) onChange(p);
                }}
              />
            ))}
            {m.motion === "rotation" &&
              (["X", "Y", "Z"] as const).map((a, i) => (
                <Num
                  key={a}
                  label={msg("Pivot {0}", [a])}
                  unit="mm"
                  min={-10000}
                  max={10000}
                  value={m.pivot[i]!}
                  onCommit={(v) => {
                    const p = [...m.pivot] as Vec3;
                    p[i] = v;
                    onChange({ pivot: p, motionStatus: "draft" });
                  }}
                />
              ))}
          </details>
          <label className="mw-select-label">
            {t("Aperçu de la position")}
            <input
              type="range"
              min={0}
              max={50}
              step={0.5}
              value={Math.min(50, progress * 100)}
              aria-label={t("Aperçu de la position")}
              onChange={(e) => setProgress(Number(e.target.value) / 100)}
            />
          </label>
          <p className="t-body" data-testid="guide-opening">
            {msg("Ouverture : {0} {1}", [opening.value.toFixed(1), opening.unit])}
          </p>
          {problem && <p className="notice-warning">{t(problem)}</p>}
          <div className="mw-guide-row">
            <button
              className="mw-button"
              data-testid="guide-validate-motion"
              disabled={!!problem || status === "confirmed"}
              onClick={() => onChange({ motionStatus: "confirmed" })}
            >
              {t(status === "confirmed" ? "Mouvement validé" : "Valider le mouvement")}
            </button>
          </div>
          </>
        )}
      </>
    ),
    install: (
      <>
        {/* i18n-canonical : libellés français traduits au rendu par t(). */}
        <div className="mw-segmented" role="radiogroup" aria-label={t("Composant à installer")}>
          {(
            [
              ["sensor", "Capteur"],
              ["magnet", "Aimant"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              role="radio"
              aria-checked={target === v}
              onClick={() => {
                setTool("navigate");
                setState((s) => ({ ...s, target: v, pick: null }));
              }}
            >
              {t(label)}
            </button>
          ))}
        </div>
        <div className="mw-segmented" role="radiogroup" aria-label={t("Type de montage")}>
          {(
            [
              ["surface", "Sur une surface"],
              ["through", "À travers une paroi"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              role="radio"
              aria-checked={kind === v}
              disabled={v === "through" && !canThrough}
              onClick={() =>
                setState((s) => ({
                  ...s,
                  kind: { ...s.kind, [target]: v },
                  incompatible: (s.incompatible ?? []).filter((w) => w !== target),
                }))
              }
            >
              {t(label)}
            </button>
          ))}
        </div>
        {!canThrough && (
          <p className="t-caption">
            {t(
              target === "sensor"
                ? "« À travers une paroi » est réservé aux corps cylindriques, filetés ou à insérer."
                : "L'aimant se pose sur une surface.",
            )}
          </p>
        )}
        <div className="mw-guide-row">
          <button
            className="mw-button"
            aria-pressed={tool === target}
            data-testid="guide-place"
            onClick={() => setTool(tool === target ? "navigate" : target)}
          >
            {t(tool === target ? "Annuler le pointage" : "Cliquer la face dans la scène")}
          </button>
          {kind === "through" && (
            <button
              className="mw-button mw-secondary"
              aria-pressed={state.pick?.purpose === "hole-points"}
              onClick={() => startPick("hole-points")}
            >
              {t("Axe d'un trou existant (deux points)")}
            </button>
          )}
        </div>
        {state.pick?.purpose === "hole-points" && (
          <p className="notice-info">
            {msg(
              "Point {0} sur 2 : d'abord l'entrée du trou, puis un point plus profond sur son axe.",
              [String(state.pick.points.length + 1)],
            )}
          </p>
        )}
        {state.notice && (
          <p className="notice-warning" role="alert" data-testid="guide-notice">
            {t(state.notice)}
          </p>
        )}
        {(state.incompatible ?? []).includes(target) && !attach && (
          <p className="notice-warning" data-testid="guide-incompatible">
            {t(
              "Attache traversante libérée : le produit choisi n'a pas un corps cylindrique, fileté ou à insérer. Posez-le sur une surface ou choisissez un autre produit.",
            )}
          </p>
        )}
        {state.freed.includes(target) && !attach && !(state.incompatible ?? []).includes(target) && (
          <p className="notice-warning">
            {t("Attache libérée : la pose a été modifiée librement, elle n'est plus contrainte à une face.")}
          </p>
        )}
        {attach ? (
          <div className="mw-attach" data-testid="guide-attach">
            <p className="t-body">
              {msg("Support : {0}", [
                t(
                  clipMode
                    ? sampler?.affects(attach.partPath)
                      ? "pièce animée par le clip"
                      : "pièce fixe"
                    : attach.support === "moving"
                      ? "pièce mobile"
                      : "pièce fixe",
                ),
              ])}{" "}
              <span translate="no" className="t-metric">
                {asset?.nodes.find((n) => n.path === attach.partPath)?.name ?? attach.partPath}
              </span>
            </p>
            {attach.kind === "through" && (
              <p className="notice-info">
                {t(
                  attach.axisSource !== "face"
                    ? "Axe défini par vos points ou valeurs : le centre du trou n'est pas détecté automatiquement. Deux clics sur la paroi du trou ne donnent pas son centre : saisissez le point d'entrée et la direction précis dans « Valeurs précises de l'axe »."
                    : "Implantation d'un perçage à prévoir : le modèle n'est pas percé, l'axe suit la normale de la face cliquée.",
                )}
              </p>
            )}
            {/* i18n-canonical : libellés français traduits au rendu par t(). */}
            {attach.kind === "surface" ? (
              <Num
                label="Écart entre face d'appui et surface"
                unit="mm"
                min={-50}
                max={500}
                testId="guide-offset"
                value={attach.offsetMm}
                onCommit={(offsetMm) => editAttach({ offsetMm })}
              />
            ) : (
              <>
                <label className="mw-select-label">
                  {t("Profondeur mesurée depuis")}
                  <select
                    value={attach.depthRef}
                    onChange={(e) => editAttach({ depthRef: e.target.value as "collar" | "tip" })}
                  >
                    <option value="collar">{t("l'extrémité arrière du corps modélisé")}</option>
                    <option value="tip">{t("la pointe avant du corps modélisé")}</option>
                  </select>
                </label>
                <Num
                  label="Profondeur sous la surface"
                  unit="mm"
                  min={-500}
                  max={500}
                  testId="guide-depth"
                  value={attach.offsetMm}
                  onCommit={(offsetMm) => editAttach({ offsetMm })}
                />
                <p className="t-caption">
                  {t(
                    "Aucune collerette n'est modélisée : la profondeur se mesure depuis une extrémité du corps dessiné, pas depuis une face d'appui réelle.",
                  )}
                </p>
                <details>
                  <summary>{t("Valeurs précises de l'axe")}</summary>
                  {(["X", "Y", "Z"] as const).map((a, i) => (
                    <Num
                      key={"p" + a}
                      label={msg("Point d'entrée {0}", [a])}
                      unit="mm"
                      min={-10000}
                      max={10000}
                      testId={"guide-hole-point-" + a}
                      value={attach.point[i]!}
                      onCommit={(v) => {
                        const point = [...attach.point] as Vec3;
                        point[i] = v;
                        editAttach({ point, axisSource: "manual" });
                      }}
                    />
                  ))}
                  {(["X", "Y", "Z"] as const).map((a, i) => (
                    <Num
                      key={"n" + a}
                      label={msg("Normale sortante {0}", [a])}
                      unit="—"
                      min={-1}
                      max={1}
                      step={0.001}
                      value={attach.normal[i]!}
                      onCommit={(v) => {
                        const d = [...attach.normal] as Vec3;
                        d[i] = v;
                        const n = unit(d);
                        // i18n-canonical : message traduit au rendu par t().
                        if (!n) {
                          setState((s) => ({ ...s, notice: "Direction nulle refusée : au moins une composante doit être non nulle." }));
                          return;
                        }
                        setState((s) => ({ ...s, notice: null }));
                        editAttach({ normal: n, axisSource: "manual" });
                      }}
                    />
                  ))}
                </details>
                <p className="t-caption" data-testid="guide-depth-reading">
                  {t(
                    depthReading(attach) === "flush"
                      ? "Référence affleurante avec la surface."
                      : depthReading(attach) === "recessed"
                        ? "Référence en retrait, à l'intérieur de la paroi."
                        : "Référence qui dépasse de la surface.",
                  )}
                </p>
              </>
            )}
            {/* i18n-canonical : libellés français traduits au rendu par t(). */}
            <Num
              label="Rotation dans le plan"
              unit="°"
              min={-360}
              max={360}
              step={1}
              value={attach.spinDeg}
              onCommit={(spinDeg) => editAttach({ spinDeg })}
            />
            <label className="mw-check">
              <input
                type="checkbox"
                checked={attach.flip}
                onChange={(e) => editAttach({ flip: e.target.checked })}
              />
              {t(attach.kind === "through" ? "Inverser le sens d'insertion" : "Retourner le composant")}
            </label>
          </div>
        ) : (
          !state.freed.includes(target) && (
            <p className="t-caption">
              {t(
                clipMode
                  ? "Pose libre : aucune attache. Avec l'animation du fichier, un composant non attaché reste fixe. Les coordonnées précises restent dans Réglages avancés › Positionnement."
                  : "Pose libre : aucune attache. Les coordonnées précises restent dans Réglages avancés › Positionnement.",
              )}
            </p>
          )
        )}
        <div className="mw-guide-row">
          <button className="mw-button mw-secondary" disabled={!history.canUndo} onClick={history.undo}>
            {t("Annuler")}
          </button>
          <button className="mw-button mw-secondary" disabled={!history.canRedo} onClick={history.redo}>
            {t("Rétablir")}
          </button>
        </div>
      </>
    ),
    test: (
      <>
        {clipMode ? (
          <p className="t-body t-metric" data-testid="guide-clip-time">
            {sampler
              ? msg("Animation {0} : {1} s / {2} s ({3} %)", [
                  sampler.name,
                  (u * sampler.duration).toFixed(2),
                  sampler.duration.toFixed(2),
                  (u * 100).toFixed(0),
                ])
              : t("Animation non disponible : aucune pose animée n'est lue.")}
          </p>
        ) : (
          <p className="t-body" data-testid="guide-test-opening">
            {msg("Ouverture du mécanisme : {0} {1} · {2}", [
              opening.value.toFixed(1),
              opening.unit,
              t(
                { closed: "fermé", opening: "ouverture", open: "ouvert", return: "retour" }[
                  opening.phase
                ],
              ),
            ])}
          </p>
        )}
        <p className="t-body">
          {msg("Distance entre centres capteur–aimant : {0} mm", [formatMm(sample.distance, 1)])}
        </p>
        <div className="mw-guide-row">
          <button
            className="mw-button mw-secondary"
            data-testid="guide-start"
            aria-label={t("Revenir au début")}
            onClick={() => {
              setPlaying(false);
              setProgress(0);
            }}
          >
            ⏮
          </button>
          <button
            className="mw-button"
            data-testid="guide-play"
            disabled={reduced || (!!reason && reason === motionProblem(m))}
            onClick={() => {
              if (progress >= 1) setProgress(0);
              setPlaying(!playing);
            }}
          >
            {t(playing ? "Pause" : "Lancer le cycle")}
          </button>
          <button
            className="mw-button mw-secondary"
            aria-label={t("Reculer d'un pas")}
            onClick={() => {
              setPlaying(false);
              setProgress(Math.max(0, progress - stepSize));
            }}
          >
            ◀
          </button>
          <button
            className="mw-button mw-secondary"
            aria-label={t("Avancer d'un pas")}
            onClick={() => {
              setPlaying(false);
              setProgress(Math.min(1, progress + stepSize));
            }}
          >
            ▶
          </button>
          <button
            className="mw-button mw-secondary"
            data-testid="guide-end"
            aria-label={t("Aller à la fin")}
            onClick={() => {
              setPlaying(false);
              setProgress(1);
            }}
          >
            ⏭
          </button>
        </div>
        {reduced && (
          <p className="t-caption" data-testid="guide-reduced">
            {t("Mouvement réduit activé : la lecture automatique est désactivée. Avancez pas à pas avec ◀ ▶ ou le curseur.")}
          </p>
        )}
        <p className="t-body" data-testid="guide-contact">
          {msg("Contact : {0}", [
            t({ open: "ouvert", closed: "fermé", unknown: "indéterminé" }[sample.contact]),
          ])}
        </p>
        {reason && (
          <p className="notice-warning" data-testid="guide-reason">
            {t(reason)}
          </p>
        )}
        <div className="mw-markers" data-testid="guide-markers">
          <p className="t-body">
            <strong>{t("Distance entre les repères")}</strong>
          </p>
          <div className="mw-guide-row">
            <button
              className="mw-button mw-secondary"
              aria-pressed={tool === "measure"}
              data-testid="guide-markers-tool"
              onClick={() => setTool(tool === "measure" ? "navigate" : "measure")}
            >
              {t(tool === "measure" ? "Terminer les repères" : "Placer deux repères")}
            </button>
            <button
              className="mw-button mw-secondary"
              disabled={!m.markers?.length}
              data-testid="guide-markers-clear"
              onClick={() => onMarkers([])}
            >
              {t("Effacer les repères")}
            </button>
          </div>
          {reading ? (
            <p className="t-body t-metric" data-testid="guide-marker-reading">
              {msg("Distance entre les repères : {0} mm · variation depuis le début : {1} mm", [
                reading.distance.toFixed(1),
                signedMm(reading.change),
              ])}
            </p>
          ) : (
            <p className="t-caption">
              {t(
                m.markers?.length === 1
                  ? "Repère 1 placé : cliquez un second point sur une pièce."
                  : "Cliquez deux points sur les pièces : chaque repère suit sa pièce pendant la lecture.",
              )}
            </p>
          )}
          <p className="t-caption">
            {t(
              "Distance en ligne droite entre deux points choisis : ce n'est ni l'entrefer minimal entre surfaces, ni l'écart capteur–aimant, ni la course du mouvement.",
            )}
          </p>
        </div>
        <p className="notice-info" data-testid="guide-source">
          {sample.contact === "unknown"
            ? t("Aucun contact n'est affiché : il n'est pas prédit pour ce montage.")
            : t(
                config.mode === "education" || reason || clipMode || config.machine?.assetKey.startsWith("sha256:")
                  ? "Contact illustratif : modèle pédagogique non calibré, ce n'est pas une prédiction. Une machine importée n'est jamais validée par l'atelier."
                  : "Source : distances publiées pour ce couple, en espace libre. Une machine importée n'est jamais validée par l'atelier.",
              )}
        </p>
      </>
    ),
  };

  return (
    <section className="mw-guide" aria-label={t("Parcours du modèle importé")} data-testid="machine-guide">
      <ol className="mw-guide-steps">
        {STEPS.map(([id, label], i) => (
          <li key={id}>
            <button
              aria-current={state.step === id ? "step" : undefined}
              data-testid={"guide-step-" + id}
              onClick={() => go(id)}
            >
              <span className="t-metric">{i + 1}</span> {t(label)}
            </button>
          </li>
        ))}
      </ol>
      <div className="mw-guide-body">{body[state.step]}</div>
      <div className="mw-guide-nav">
        {stepIndex > 0 && (
          <button className="mw-text-button" onClick={() => go(STEPS[stepIndex - 1]![0])}>
            {t("← Précédent")}
          </button>
        )}
        {stepIndex < STEPS.length - 1 && (
          <button className="mw-button mw-secondary" onClick={() => go(STEPS[stepIndex + 1]![0])}>
            {t("Suivant →")}
          </button>
        )}
      </div>
      <details className="mw-guide-demos">
        <summary>{t("Modèles de démonstration")}</summary>
        <DemoButtons onDemo={onDemo} onCoffee={() => onDemo("builtin:coffee-v1")} />
      </details>
    </section>
  );
}

/* i18n-canonical : libellés français traduits au rendu par t(). */
export const DEMOS: [string, string, string][] = [
  ["builtin:drawer-v1", "Tiroir à deux pièces mobiles", "Coulisse +Z, 120 mm ; façade avec poignée et caisse séparées."],
  ["builtin:door-v1", "Porte sur axe incliné", "Pivot par l'origine, axe incliné de 15° dans le plan XY, 90°."],
  ["builtin:wall-v1", "Paroi avec alésage", "Paroi 6 mm, alésage Ø 8 mm centré X 0 / Y 60, axe Z ; volet coulissant 40 mm en X."],
  ["builtin:arm-v1", "Bras animé (animation du fichier)", "Portique incliné, chariot en translation et bras en rotation animés différemment ; trois clips dont un refusé (changement d'échelle)."],
];
/** Le raccourci de démonstration se referme après un choix : la scène reste dégagée. */
const closeShortcut = (el: HTMLElement) => {
  const d = el.closest(".mw-demo-shortcut");
  if (d instanceof HTMLDetailsElement) d.open = false;
};
export function DemoButtons({
  onDemo,
  onCoffee,
}: {
  onDemo: (key: string) => void;
  onCoffee?: () => void;
}) {
  return (
    <ul className="mw-demo-list">
      {onCoffee && (
        <li>
          <button
            className="mw-button mw-secondary"
            data-testid="demo-coffee"
            onClick={(e) => {
              closeShortcut(e.currentTarget);
              onCoffee();
            }}
          >
            {t("Machine à café")}
          </button>
          <span className="t-caption">
            {t("Exemple complet : impose le capteur MK24-A-J et son aimant documenté par défaut.")}
          </span>
        </li>
      )}
      {DEMOS.map(([key, name, detail]) => (
        <li key={key}>
          <button
            className="mw-button mw-secondary"
            data-testid={"demo-" + key}
            onClick={(e) => {
              closeShortcut(e.currentTarget);
              onDemo(key);
            }}
          >
            {t(name)}
          </button>
          <span className="t-caption">{t(detail)}</span>
        </li>
      ))}
      <li>
        <span className="t-caption">
          {t("Tiroir, porte, paroi et bras animé : le capteur et l'aimant restent votre sélection actuelle, ces exemples ne les imposent pas.")}
        </span>
      </li>
    </ul>
  );
}

/** Traitement d'un point relevé selon l'outil en cours.
 *  i18n-canonical : les messages refusés sont traduits au rendu par t(). */
export function handlePick(
  state: GuideState,
  m: MachineAssembly,
  hit: SceneHit,
  config: WorkshopConfig,
): { state: GuideState; patch: Partial<MachineAssembly> | null; done: boolean } {
  const pick = state.pick;
  const base = { ...state, notice: null };
  if (!pick) return { state: base, patch: null, done: true };
  const fail = (notice: string) => ({ state: { ...state, pick: null, notice }, patch: null, done: true });
  if (pick.purpose === "axis-face") {
    const p = motionFromPick(m, hit.normal, hit.point);
    if (!p) return fail("Normale de face illisible : cliquez une autre face.");
    return { state: { ...base, pick: null }, patch: p, done: true };
  }
  const points = [...pick.points, hit.point];
  if (points.length < 2)
    return {
      state: {
        ...base,
        pick: { ...pick, points, support: { path: hit.path, moving: hit.moving, group: hit.group } },
      },
      patch: null,
      done: false,
    };
  if (pick.purpose === "axis-points") {
    const d = points[1]!.map((v, i) => v - points[0]![i]!) as Vec3;
    const p = motionFromPick(m, d, points[0]!);
    if (!p) return fail("Les deux points sont confondus : choisissez deux points distincts sur l'axe.");
    return { state: { ...base, pick: null }, patch: p, done: true };
  }
  const first = pick.support ?? { path: hit.path, moving: hit.moving, group: hit.group };
  // Les deux points doivent appartenir au même ensemble solidaire (tous deux
  // fixes, ou tous deux emportés par la même pièce, y compris dans un clip).
  if (first.moving !== hit.moving)
    return fail(
      "Points sur deux supports non solidaires (l'un fixe, l'autre mobile) : choisissez les deux points sur la même pièce.",
    );
  if ((first.group ?? "") !== (hit.group ?? ""))
    return fail(
      "Points sur deux pièces qui ne bougent pas ensemble dans l'animation : choisissez les deux points sur la même pièce.",
    );
  const axis = axisFromTwoPoints(points[0]!, points[1]!);
  if (!axis) return fail("Les deux points sont confondus : choisissez deux points distincts sur l'axe du trou.");
  const prev = m.sensorAttach;
  const a: Attachment = {
    ...attachFromHit(
      { ...hit, path: first.path, moving: first.moving, point: axis.point, normal: axis.normal },
      "through",
      prev,
    ),
    axisSource: "two-points",
  };
  return { state: { ...base, pick: null }, patch: attachPatch("sensor", a, config), done: true };
}
