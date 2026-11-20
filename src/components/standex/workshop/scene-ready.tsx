import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
/** First actual rendered frame, not the suspense fallback or the import button. */
export function SceneReady({ onReady }: { onReady?: (() => void) | undefined }) {
  const ready = useRef(false);
  useFrame(() => {
    if (!ready.current) {
      ready.current = true;
      onReady?.();
    }
  });
  return null;
}
