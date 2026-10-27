/** Accès « Laboratoire de détection » : rendu UNIQUEMENT après un rôle staff renvoyé
 * par le serveur (RPC de capacités). Aucun rôle local, metadata ou paramètre d'URL.
 * Fermé par défaut : chargement, erreur, non-staff ou changement de session
 * démontent le module et n'en chargent même pas le code. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FlaskConical, ArrowUpRight } from "lucide-react";
import { t } from "@/lib/i18n/core";
import { Button } from "@/components/ui/button";

export type StaffAccess = "loading" | "staff" | "denied" | "error";
export type StaffCheck = () => Promise<boolean>;
export type SessionSubscribe = (onChange: () => void) => () => void;

export async function serverStaffCheck(): Promise<boolean> {
  const { checkLeadBackend, staffActionEnabled } = await import("@/lib/leadmagnet/backend");
  const status = await checkLeadBackend();
  return staffActionEnabled(status, ["rnd", "sales", "admin"]);
}

export function useStaffAccess(check: StaffCheck, subscribe?: SessionSubscribe): StaffAccess {
  const [access, setAccess] = useState<StaffAccess>("loading");
  const seq = useRef(0);
  useEffect(() => {
    let alive = true;
    const run = () => {
      const mine = ++seq.current;
      setAccess("loading");
      check().then(
        (ok) => { if (alive && mine === seq.current) setAccess(ok === true ? "staff" : "denied"); },
        () => { if (alive && mine === seq.current) setAccess("error"); },
      );
    };
    run();
    const unsubscribe = subscribe?.(run);
    return () => { alive = false; seq.current++; unsubscribe?.(); };
  }, [check, subscribe]);
  return access;
}

export function StaffLabEntry({ check, subscribe, renderLab, pedagogical = false, onResetDraft }: { check: StaffCheck; subscribe?: SessionSubscribe; renderLab: (close: () => void) => ReactNode; pedagogical?: boolean; onResetDraft?: () => void }) {
  const access = useStaffAccess(check, subscribe);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (access === "denied" || access === "error") {setOpen(false);onResetDraft?.();} }, [access, onResetDraft]);
  if (access !== "staff") return null;
  if (open)
    return <div className="fixed inset-0 z-50 overflow-auto bg-background" data-testid="detection-lab-overlay">{renderLab(() => setOpen(false))}</div>;
  return (
    <Button type="button" variant="ghost" className="studio-workshop-link" onClick={() => setOpen(true)}>
      <span className="studio-workshop-icon"><FlaskConical size={25} /></span>
      <span>
        <strong>{t(pedagogical ? "Atelier pédagogique" : "Laboratoire de détection")}</strong>
        <small>{t(pedagogical ? "Interne staff · volumes 3D et coupe 2D" : "Interne staff · tableau de cohérence et six coupes")}</small>
      </span>
      <ArrowUpRight size={19} />
    </Button>
  );
}
