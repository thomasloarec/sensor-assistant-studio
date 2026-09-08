/**
 * Logo officiel Standex DETECT.
 *
 * Seul endroit du code qui référence les fichiers de `public/brand/`.
 * Les fichiers livrés sont des PNG ; la charte recommande le SVG pour le web.
 * Le jour où les SVG officiels arrivent, seul ce composant change.
 */

const NATIVE = {
  lockup: { width: 600, height: 141 },
  mark: { width: 120, height: 117 },
} as const;

const SOURCES = {
  lockup: { light: "/brand/logo-lockup.png", reversed: "/brand/logo-lockup-reversed.png" },
  mark: { light: "/brand/logo-mark.png", reversed: "/brand/logo-mark-reversed.png" },
} as const;

export type BrandLogoProps = {
  variant?: "lockup" | "mark";
  tone?: "light" | "reversed";
  height?: number;
  /** Zone de protection de la charte ; activée par défaut. */
  clearance?: boolean;
  className?: string;
  alt?: string;
};

export function BrandLogo({
  variant = "lockup",
  tone = "light",
  height,
  clearance = true,
  className,
  alt = "Standex DETECT Electronics",
}: BrandLogoProps) {
  const requested = height ?? (variant === "lockup" ? 44 : 32);
  /* Plancher de charte : le logo primaire (lockup) ne doit jamais descendre
     sous 185 px de large. Le ratio natif 600/141 donne 187 px à 44 px de haut,
     donc toute hauteur inférieure à 44 est remontée à 44. */
  const h = variant === "lockup" ? Math.max(44, requested) : requested;
  const native = NATIVE[variant];
  const w = Math.round((h * native.width) / native.height);
  const empty = alt === "";

  return (
    <img
      src={SOURCES[variant][tone]}
      alt={alt}
      {...(empty ? { "aria-hidden": "true" as const } : {})}
      width={w}
      height={h}
      decoding="async"
      className={className}
      style={
        clearance
          ? {
              // Charte : côtés = demi-largeur du bloc « S », haut/bas = hauteur
              // de son plus petit segment.
              paddingInline: `${0.51 * h}px`,
              paddingBlock: `${0.34 * h}px`,
              boxSizing: "content-box",
            }
          : undefined
      }
    />
  );
}
