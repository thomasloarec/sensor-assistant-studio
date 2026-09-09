/** Contexte de l'espace de travail interne.
 *
 * La sonde de disponibilité est INDÉPENDANTE de celle du parcours client : le
 * parcours client continue de fonctionner même si l'espace de travail n'est pas
 * installé sur le serveur, et inversement.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { CRM_UNAVAILABLE, probeCrm, type CrmCapabilities } from "@/lib/leadmagnet/dashboard-adapter";
import { supabase } from "@/lib/standex/supabase";
import { fetchStaffInbox } from "@/lib/leadmagnet/supabase-adapter";

interface CrmContextValue {
  capabilities: CrmCapabilities | null;
  /** Rôle interne hérité : sert uniquement à réserver les diagnostics
   *  techniques aux administrateurs. */
  legacyRole: "rnd" | "sales" | "admin" | null;
  refresh: () => void;
}

const CrmContext = createContext<CrmContextValue>({
  capabilities: null,
  legacyRole: null,
  refresh: () => {},
});

export function CrmProvider({ children }: { children: React.ReactNode }) {
  const [capabilities, setCapabilities] = useState<CrmCapabilities | null>(null);
  const [legacyRole, setLegacyRole] = useState<"rnd" | "sales" | "admin" | null>(null);

  const refresh = useCallback(() => {
    probeCrm()
      .then(setCapabilities)
      .catch(() => setCapabilities(CRM_UNAVAILABLE));
    fetchStaffInbox()
      .then((inbox) => setLegacyRole(inbox.role ?? null))
      .catch(() => setLegacyRole(null));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // La connexion ou la déconnexion change les droits : la sonde est refaite.
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange(() => refresh());
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  return <CrmContext.Provider value={{ capabilities, legacyRole, refresh }}>{children}</CrmContext.Provider>;
}

export function useCrm() {
  return useContext(CrmContext);
}
