/** Contexte de l'espace de travail interne.
 *
 * La sonde de disponibilité est INDÉPENDANTE de celle du parcours client : le
 * parcours client continue de fonctionner même si l'espace de travail n'est pas
 * installé sur le serveur, et inversement.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CRM_UNAVAILABLE, probeCrm, type CrmCapabilities } from "@/lib/leadmagnet/dashboard-adapter";
import { supabase } from "@/lib/standex/supabase";
import { fetchStaffInbox } from "@/lib/leadmagnet/supabase-adapter";

interface CrmContextValue {
  capabilities: CrmCapabilities | null;
  /** Rôle interne hérité : sert uniquement à réserver les diagnostics
   *  techniques aux administrateurs. */
  legacyRole: "rnd" | "sales" | "admin" | null;
  /** Numéro de session : il change à chaque connexion/déconnexion et permet
   *  aux écrans d'abandonner les données lues pour le compte précédent. */
  sessionGeneration: number;
  refresh: () => void;
}

const CrmContext = createContext<CrmContextValue>({
  capabilities: null,
  legacyRole: null,
  sessionGeneration: 0,
  refresh: () => {},
});

export function CrmProvider({ children }: { children: React.ReactNode }) {
  const [capabilities, setCapabilities] = useState<CrmCapabilities | null>(null);
  const [legacyRole, setLegacyRole] = useState<"rnd" | "sales" | "admin" | null>(null);
  const [sessionGeneration, setSessionGeneration] = useState(0);
  /** Génération de la dernière sonde émise : une réponse plus ancienne, même
   *  arrivée en retard, ne peut jamais rétablir les droits d'un autre compte. */
  const probeGen = useRef(0);

  const refresh = useCallback(() => {
    const gen = ++probeGen.current;
    probeCrm()
      .then((c) => {
        if (probeGen.current === gen) setCapabilities(c);
      })
      .catch(() => {
        if (probeGen.current === gen) setCapabilities(CRM_UNAVAILABLE);
      });
    fetchStaffInbox()
      .then((inbox) => {
        if (probeGen.current === gen) setLegacyRole(inbox.role ?? null);
      })
      .catch(() => {
        if (probeGen.current === gen) setLegacyRole(null);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // La connexion ou la déconnexion change les droits : l'état précédent est
  // effacé IMMÉDIATEMENT, puis la sonde est refaite pour le nouveau compte.
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") return;
      probeGen.current += 1;
      setCapabilities(null);
      setLegacyRole(null);
      setSessionGeneration((n) => n + 1);
      refresh();
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  return (
    <CrmContext.Provider value={{ capabilities, legacyRole, sessionGeneration, refresh }}>
      {children}
    </CrmContext.Provider>
  );
}


export function useCrm() {
  return useContext(CrmContext);
}
