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
import { createGenerationGuard } from "@/lib/leadmagnet/session-guard";

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
  const probeGen = useRef(createGenerationGuard());
  /** Identité du compte observée en dernier. `undefined` = pas encore connue.
   *  Sert à distinguer un VRAI changement de compte d'une simple
   *  reconfirmation de la session du MÊME compte. */
  const lastUserId = useRef<string | null | undefined>(undefined);

  const refresh = useCallback(() => {
    const gen = probeGen.current.next();
    probeCrm()
      .then((c) => {
        if (probeGen.current.accepts(gen)) setCapabilities(c);
      })
      .catch(() => {
        if (probeGen.current.accepts(gen)) setCapabilities(CRM_UNAVAILABLE);
      });
    fetchStaffInbox()
      .then((inbox) => {
        if (probeGen.current.accepts(gen)) setLegacyRole(inbox.role ?? null);
      })
      .catch(() => {
        if (probeGen.current.accepts(gen)) setLegacyRole(null);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Identité de départ : connue avant tout événement, pour qu'une simple
  // reconfirmation de session au chargement ne passe pas pour une bascule
  // de compte. Ne remplace jamais une identité déjà observée.
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive && lastUserId.current === undefined) {
        lastUserId.current = data.session?.user?.id ?? null;
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Un CHANGEMENT DE COMPTE (ou une déconnexion) change les droits : l'état
  // précédent est effacé IMMÉDIATEMENT, puis la sonde est refaite. En revanche
  // Supabase réémet `SIGNED_IN` pour un compte DÉJÀ connecté (retour d'onglet,
  // reconfirmation, mise à jour du profil) : dans ce cas les brouillons en
  // cours sont conservés, seuls les droits sont resondés.
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const id = session?.user?.id ?? null;
      if (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
        if (lastUserId.current === undefined) lastUserId.current = id;
        return;
      }
      const known = lastUserId.current;
      lastUserId.current = id;
      const sameAccount = known !== undefined && known !== null && id === known;
      if (sameAccount) {
        // Même compte : aucune remise à zéro, aucun remontage d'écran.
        refresh();
        return;
      }
      probeGen.current.invalidate();
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
