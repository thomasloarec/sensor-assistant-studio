import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { msg, t } from "@/lib/i18n/core";
import type { MachineAsset } from "@/lib/standex/machine-assets";
import type { MachineAssembly } from "@/lib/standex/machine-assembly";
import type { WorkshopConfig } from "@/lib/standex/magnetic-workshop";
import {
  findDetectionPositions,
  POSITION_MESSAGES,
  type DetectionPositions,
} from "@/lib/standex/machine-detection-positions";
import { attachPatch } from "./machine-guide";

/** Results belong to the loaded geometry and exact configuration. Navigation,
 * edits, undo, product changes and reimports cancel pending work. */
export function MachineDetectionPlacement({
  config,
  asset,
  ready,
  onApply,
  onPause,
}: {
  config: WorkshopConfig;
  asset: MachineAsset | null;
  ready: boolean;
  onApply: (patch: Partial<MachineAssembly>, t: number) => void;
  onPause: () => void;
}) {
  const key = JSON.stringify(config);
  const pending = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [session, setSession] = useState<{
    key: string;
    asset: MachineAsset;
    result: DetectionPositions;
    index: number;
  } | null>(null);
  const current = session?.key === key && session.asset === asset ? session : null;
  useEffect(() => {
    setNotice(null);
    setBusy(false);
    return () => {
      pending.current?.abort();
      pending.current = null;
    };
  }, [key, asset]);
  const apply = (result: DetectionPositions, index: number) => {
    const position = result.positions[index];
    if (!position || !asset || !config.machine) return;
    const patch = attachPatch("magnet", position.attach, config);
    setSession({
      key: JSON.stringify({ ...config, machine: { ...config.machine, ...patch } }),
      asset,
      result,
      index,
    });
    onApply(patch, result.t);
  };
  const search = async () => {
    if (busy) {
      pending.current?.abort();
      pending.current = null;
      setBusy(false);
      return;
    }
    if (!asset || !ready) return;
    onPause();
    setNotice(null);
    if (current) {
      apply(current.result, (current.index + 1) % current.result.positions.length);
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    try {
      const result = await findDetectionPositions(config, asset, controller.signal);
      if (controller.signal.aborted) return;
      if (result.positions.length) apply(result, 0);
      else setNotice(result.reason ?? POSITION_MESSAGES.none);
    } catch (error) {
      if (!controller.signal.aborted) setNotice(POSITION_MESSAGES.failed);
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  };
  return (
    <div className="mw-align" data-testid="guide-detection-positions" aria-busy={busy}>
      <Button
        className="mw-button mw-run"
        disabled={!ready || !asset}
        onClick={() => void search()}
        data-testid="guide-find-position"
      >
        {t(
          busy
            ? "Annuler la recherche"
            : current && current.result.positions.length > 1
              ? "Position suivante"
              : "Trouver une position de détection",
        )}
      </Button>
      <p className="t-caption">
        {t(
          "Recherche au plus près du capteur, sur la face de fixation actuelle. L’orientation et l’écart de pose sont conservés.",
        )}
      </p>
      <div role="status" aria-live="polite">
        {busy && <p className="t-caption">{t("Recherche des zones de détection…")}</p>}
        {current && (
          <p className="t-body t-metric">
            {msg("Position {0} / {1}", [
              String(current.index + 1),
              String(current.result.positions.length),
            ])}
          </p>
        )}
        {notice && <p className="notice-info">{t(notice)}</p>}
      </div>
      <p className="t-caption">
        {t(
          "Positions indicatives selon les zones simulées. La recherche conserve la surface d’appui et évite les zones mortes détectées.",
        )}
      </p>
    </div>
  );
}
