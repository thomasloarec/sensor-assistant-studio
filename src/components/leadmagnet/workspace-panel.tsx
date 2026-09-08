/** Panneau contextuel de l'espace projet.
 *
 * Le projet reste visible et accessible derrière : on n'utilise PAS de dialogue
 * modal force-monté, qui masquerait tout le reste de la page aux technologies
 * d'assistance même refermé. Quand le panneau est fermé, son contenu reste
 * monté mais caché (`hidden`) : un brouillon en cours n'est jamais perdu.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { X, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface WorkspacePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Conserve le contenu monté une fois ouvert (brouillons préservés). */
  keepMounted?: boolean;
  onBack?: () => void;
  children: ReactNode;
}

export function WorkspacePanel({
  open,
  onOpenChange,
  title,
  description,
  keepMounted = false,
  onBack,
  children,
}: WorkspacePanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openedOnce = useRef(false);
  const restoreTo = useRef<HTMLElement | null>(null);
  if (open) openedOnce.current = true;

  useEffect(() => {
    if (!open) return;
    restoreTo.current = (document.activeElement as HTMLElement | null) ?? null;
    const node = panelRef.current;
    node?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      restoreTo.current?.focus?.();
    };
  }, [open, onOpenChange]);

  // Rien à rendre tant que le panneau n'a jamais été ouvert.
  if (!open && !(keepMounted && openedOnce.current)) return null;

  return (
    <div data-readable>
      {open ? (
        <button
          type="button"
          aria-label="Fermer le panneau"
          tabIndex={-1}
          className="fixed inset-0 z-40 cursor-default bg-foreground/20"
          onClick={() => onOpenChange(false)}
        />
      ) : null}
      <div
        ref={panelRef}
        role="region"
        aria-label={title}
        tabIndex={-1}
        hidden={!open}
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-background shadow-2xl outline-none sm:max-w-3xl lg:max-w-4xl"
      >
        <div className="flex items-start gap-3 border-b px-4 py-4 sm:px-6">
          {onBack ? (
            <Button variant="ghost" className="min-h-11 text-base" onClick={onBack}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Retour
            </Button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-semibold leading-tight">{title}</h2>
            {description ? (
              <p className="mt-1 text-base text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <Button
            variant="outline"
            className="min-h-11 text-base"
            onClick={() => onOpenChange(false)}
          >
            <X className="mr-1 h-4 w-4" /> Fermer
          </Button>
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
