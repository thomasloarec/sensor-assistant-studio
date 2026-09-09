/**
 * Bandeau de tête unique du produit.
 *
 * Un seul composant pour l'espace de travail interne, le banc et l'atelier :
 * même matière, même élévation, même ordre de lecture, et surtout le sélecteur
 * de langue toujours au même endroit — premier élément de la zone de droite.
 *
 * Il publie sa propre hauteur dans `--standex-header-h` sur
 * `document.documentElement`, dans tous les contextes : c'est ce qui permet à
 * `.workbar` et à tout autre élément collant de se caler sous lui.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/standex/brand-logo";
import { LanguagePicker } from "@/lib/i18n/react";

export type AppHeaderBack = {
  label: string;
  onClick?: () => void;
  to?: string;
  disabled?: boolean;
};

export type AppHeaderProps = {
  tone?: "light" | "reversed";
  /** Libellé de contexte de l'écran, posé après le logo. */
  context?: string;
  back?: AppHeaderBack;
  /** Fil d'Ariane ou repères d'étape, au centre. */
  center?: ReactNode;
  /** Zone de droite, après le sélecteur de langue. */
  children?: ReactNode;
  /** Contenu supplémentaire sous la rangée principale (navigation, onglets). */
  below?: ReactNode;
  className?: string;
};

/** Publie la hauteur réelle du bandeau pour les éléments collants. */
export function usePublishedHeaderHeight<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const roots: HTMLElement[] = [document.documentElement];
    const readable = node.closest("[data-readable]") as HTMLElement | null;
    if (readable) roots.push(readable);
    const publish = () => {
      const value = `${Math.round(node.getBoundingClientRect().height)}px`;
      for (const root of roots) root.style.setProperty("--standex-header-h", value);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return ref;
}

export function AppHeader({
  tone = "light",
  context,
  back,
  center,
  children,
  below,
  className,
}: AppHeaderProps) {
  const ref = usePublishedHeaderHeight<HTMLElement>();

  return (
    <header
      ref={ref}
      data-tone={tone}
      className={className ? `app-header ${className}` : "app-header"}
    >
      <div className="app-header-row">
        {back ? (
          back.to ? (
            <Link to={back.to} className="app-header-back">
              <ArrowLeft size={18} aria-hidden="true" />
              <span>{back.label}</span>
            </Link>
          ) : (
            <button
              type="button"
              className="app-header-back"
              onClick={back.onClick}
              disabled={back.disabled}
            >
              <ArrowLeft size={18} aria-hidden="true" />
              <span>{back.label}</span>
            </button>
          )
        ) : null}
        <BrandLogo tone={tone} height={44} />
        {context ? <p className="app-header-context">{context}</p> : null}
        {center ? <div className="app-header-center">{center}</div> : null}
        <div className="app-header-actions">
          <LanguagePicker />
          {children}
        </div>
      </div>
      {below}
    </header>
  );
}
