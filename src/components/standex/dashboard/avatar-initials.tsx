/** Pastille d'initiales partagée de l'espace de travail interne.
 *
 * Elle ne porte jamais l'information seule : les initiales sont décoratives
 * (`aria-hidden`) et le nom lisible est toujours affiché à côté ou repris en
 * `aria-label` par le contrôle qui la monte.
 */
import { cn } from "@/lib/utils";

/** Une ou deux lettres tirées du nom, sans transformation de casse forcée. */
export function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/[\s@._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  const first = [...parts[0]!][0] ?? "";
  const second = parts.length > 1 ? ([...parts[parts.length - 1]!][0] ?? "") : "";
  return (first + second).toLocaleUpperCase();
}

export function AvatarInitials({
  name,
  interactive = false,
  className,
}: {
  name: string;
  /** Cible cliquable isolée : la pastille passe à 2,75rem. */
  interactive?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "t-label inline-flex shrink-0 items-center justify-center rounded-[var(--r-pill)] bg-[var(--surface-tint)] normal-case tracking-normal text-[var(--standex-blue)]",
        interactive ? "h-11 w-11" : "h-8 w-8",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
