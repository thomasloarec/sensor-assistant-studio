import { useState } from "react";
import { portraitUrl } from "@/lib/leadmagnet/territory-adapter";
import { profilePhotoPaths } from "@/lib/leadmagnet/territories";
export function SalesAvatar({
  name,
  photo,
  microsoftPhoto,
  large = false,
}: {
  name: string;
  photo?: string | null | undefined;
  microsoftPhoto?: string | null | undefined;
  large?: boolean;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const path = profilePhotoPaths({
    photo_path: photo ?? null,
    microsoft_photo_path: microsoftPhoto ?? null,
  }).find((p) => !failed.includes(p));
  const cls =
    (large ? "h-28 w-28" : "h-11 w-11") + " shrink-0 rounded-[var(--r-pill)] object-cover";
  return path ? (
    <img
      className={cls}
      src={portraitUrl(path)}
      alt={name}
      onError={() => setFailed((s) => [...s, path])}
    />
  ) : (
    <span
      className={
        cls + " t-title-s inline-flex items-center justify-center bg-[var(--surface-tint)]"
      }
      aria-label={name}
    >
      {name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0])
        .join("")
        .toUpperCase()}
    </span>
  );
}
