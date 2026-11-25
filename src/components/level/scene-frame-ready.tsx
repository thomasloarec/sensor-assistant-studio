import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

/** Reveal only after framing, lighting and a complete rendered frame. */
export function SceneFrameReady({ onReady }: { onReady: () => void }) {
  const frames = useRef(0), request = useRef(0);
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => () => cancelAnimationFrame(request.current), []);
  useFrame(() => {
    frames.current += 1;
    if (frames.current === 1) invalidate();
    if (frames.current === 2) request.current = requestAnimationFrame(onReady);
  });
  return null;
}
