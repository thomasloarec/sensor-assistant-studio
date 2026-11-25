import { BrandLogo } from "@/components/standex/brand-logo";
import { usePublishedHeaderHeight } from "@/components/standex/app-header";
import { ProjectTitle } from "@/components/leadmagnet/project-title";
import { Badge } from "@/components/ui/badge";
import { LanguagePicker } from "@/lib/i18n/react";
import { t } from "@/lib/i18n/core";

export function LevelProjectHeader({ title, onRename, onChoice, onClassic }: {
  title: string; onRename: (title: string) => void; onChoice: () => void; onClassic: () => void;
}) {
  const ref = usePublishedHeaderHeight<HTMLElement>();
  return <header ref={ref} className="project-header material sticky top-0 z-30">
    <div className="project-header-row mx-auto grid max-w-[76rem] items-center gap-3 px-4">
      <div className="project-header-brand flex shrink-0 items-center gap-3 self-center">
        <button type="button" aria-label={t("Types de capteurs")} onClick={onChoice} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--r-sm)]">
          <BrandLogo variant="mark" tone="light" height={32} clearance={false} alt="" />
        </button>
        <span className="t-title-s whitespace-nowrap">Sensor Studio</span>
        <span aria-hidden="true" className="block h-6 w-px bg-[var(--hairline)]" />
      </div>
      <ProjectTitle title={title} onRename={onRename} />
      <div className="project-header-status flex flex-wrap items-center gap-2"><Badge variant="secondary" className="project-state-badge">{t("Brouillon")}</Badge></div>
      <div className="studio-header-navigation flex items-center gap-2"><LanguagePicker />
        <details className="studio-navigation"><summary>{t("Menu")}</summary><nav aria-label={t("Menu")}>
          <button type="button" onClick={e => { e.currentTarget.closest("details")?.removeAttribute("open"); onChoice(); }}>{t("Types de capteurs")}</button>
          <button type="button" onClick={onClassic}>{t("Position et mouvement")}</button>
        </nav></details>
      </div>
    </div>
  </header>;
}
