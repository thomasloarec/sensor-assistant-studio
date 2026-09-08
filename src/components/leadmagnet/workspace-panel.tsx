/** Panneau contextuel de l'espace projet.
 *
 * Le projet reste visible et accessible derrière : on n'utilise PAS de dialogue
 * modal force-monté, qui masquerait tout le reste de la page aux technologies
 * d'assistance même refermé. Quand le panneau est fermé, son contenu reste
 * monté mais réellement masqué (`hidden` ET `display:none`) : un brouillon en
 * cours n'est jamais perdu, et rien de caché ne reste atteignable au clavier.
 *
 * Le rappel de focus ne dépend QUE de l'ouverture : la fonction `onOpenChange`
 * est conservée dans une ref, sinon chaque frappe recréant la fonction dans le
 * parent relancerait l'effet et volerait le focus du champ en cours de saisie.
 */
import { useCallback, useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { X, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface WorkspacePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Conserve le contenu monté une fois ouvert (brouillons préservés). */
  keepMounted?: boolean;
  /** Occupe tout l'écran disponible au lieu d'un panneau latéral.
   * Le contenu reste le MÊME et reste monté : rien n'est réinitialisé. */
  fullscreen?: boolean;
  /** Libellé de l'action de retour, quand elle diffère de « Retour ». */
  backLabel?: string;
  onBack?: () => void;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

function focusableIn(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el.getClientRects().length > 0,
  );
}

export function WorkspacePanel({
  open,
  onOpenChange,
  title,
  description,
  keepMounted = false,
  fullscreen = false,
  backLabel,
  onBack,
  children,
}: WorkspacePanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openedOnce = useRef(false);
  const restoreTo = useRef<HTMLElement | null>(null);
  // La callback vit dans une ref : l'effet ne doit pas se relancer quand le
  // parent recrée la fonction à chaque frappe.
  const changeRef = useRef(onOpenChange);
  changeRef.current = onOpenChange;
  if (open) openedOnce.current = true;

  useEffect(() => {
    if (!open) return;
    restoreTo.current = (document.activeElement as HTMLElement | null) ?? null;
    panelRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        changeRef.current(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const back = restoreTo.current;
      if (back && document.contains(back)) back.focus();
    };
  }, [open]);

  /** Tab reste DANS le panneau : rien derrière le fond n'est atteignable.
   * Les contenus portalisés (Radix Select, menus) gèrent eux-mêmes leur focus
   * et leurs évènements ne remontent pas ici : ils ne sont pas perturbés. */
  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const nodes = focusableIn(panelRef.current);
    if (nodes.length === 0) {
      e.preventDefault();
      panelRef.current?.focus();
      return;
    }
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  // Rien à rendre tant que le panneau n'a jamais été ouvert.
  if (!open && !(keepMounted && openedOnce.current)) return null;

  return (
    <div data-readable>
      {open ? (
        <button
          type="button"
          aria-label="Fermer le panneau"
          tabIndex={-1}
          className="workspace-panel-backdrop fixed inset-0 z-40 cursor-default"
          onClick={() => changeRef.current(false)}
        />
      ) : null}
      <div
        ref={panelRef}
        role="region"
        aria-label={title}
        tabIndex={-1}
        hidden={!open}
        onKeyDown={onKeyDown}
        className={
          open
            ? `workspace-panel-shell fixed z-50 flex flex-col bg-background outline-none ${
                fullscreen ? "inset-0 w-full" : "inset-y-0 right-0 w-full sm:max-w-3xl lg:max-w-4xl"
              }`
            : "hidden"
        }
      >
        <div className="material sticky top-0 z-10 flex items-start gap-3 border-b border-[var(--hairline)] px-4 py-4 sm:px-6">
          {onBack ? (
            <Button
              variant="ghost"
              className="min-h-11 text-base"
              aria-label={backLabel ?? "Retour"}
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4" />{" "}
              <span className="hidden sm:inline">{backLabel ?? "Retour"}</span>
            </Button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="t-title-l">{title}</h2>
            {description ? <p className="t-caption mt-1">{description}</p> : null}
          </div>
          <Button
            variant="ghost"
            className="min-h-11 text-base"
            aria-label="Fermer"
            onClick={() => changeRef.current(false)}
          >
            <X className="h-4 w-4" /> <span className="hidden sm:inline">Fermer</span>
          </Button>
        </div>
        <div className="min-w-0 flex-1 scroll-smooth overflow-y-auto px-4 py-7 sm:px-6">
          {children}
        </div>
      </div>
    </div>
  );
}
