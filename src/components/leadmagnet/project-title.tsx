import { useEffect, useRef, useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t, msg } from "@/lib/i18n/core";

/** Shared project title: explicit rename, Enter commits, Escape cancels. */
export function ProjectTitle({ title, onRename }: { title: string; onRename: (next: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const start = () => {
    setDraft(title);
    setError(null);
    setEditing(true);
  };
  const cancel = () => {
    setError(null);
    setEditing(false);
  };
  const commit = () => {
    const next = draft.trim();
    if (!next) {
      setError(t("Le nom du projet ne peut pas être vide."));
      inputRef.current?.focus();
      return;
    }
    onRename(next);
    setEditing(false);
    setError(null);
  };

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (!editing)
    return (
      <div className="project-header-title project-title-display flex min-w-0 flex-1 items-center gap-2">
        <h1 className="t-title-l min-w-0" title={title}>
          {title}
        </h1>
        <Button
          variant="ghost"
          className="min-h-11 min-w-11 shrink-0 px-3 text-base"
          onClick={start}
          aria-label={msg("Renommer le projet « {0} »", [title])}
        >
          <Pencil className="h-4 w-4" />
          <span className="hidden sm:inline">{t("Renommer")}</span>
        </Button>
      </div>
    );

  return (
    <div className="project-header-title min-w-0 flex-1">
      <Label htmlFor="project-title" className="t-label">
        {t("Nom du projet")}
      </Label>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Input
          id="project-title"
          ref={inputRef}
          value={draft}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "project-title-error" : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          className="project-title-input h-auto min-h-11 max-w-lg"
        />
        <Button className="min-h-11 text-base" onClick={commit}>
          <Check className="h-4 w-4" /> {t("Valider")}
        </Button>
        <Button variant="ghost" className="min-h-11 text-base" onClick={cancel}>
          <X className="h-4 w-4" /> {t("Annuler")}
        </Button>
      </div>
      {error ? (
        <p id="project-title-error" className="notice notice-danger mt-2">
          {error}
        </p>
      ) : null}
    </div>
  );
}
