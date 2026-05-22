import { createContext, useContext, useState, useCallback, useEffect, useMemo, ReactNode } from "react";
import { UserRole } from "@/types/user";
import { supabase } from "@/integrations/supabase/client";
import type { User as SupaUser } from "@supabase/supabase-js";
import { prefetchUserRoutes, prefetchStaffRoutes, prefetchGestorRoutes } from "@/lib/routePrefetch";

interface UserContextType {
  role: UserRole | null;
  /** Real role from DB (never overridden by impersonation) */
  realRole: UserRole | null;
  /** Effective role used by the UI (= viewAsRole when set, else realRole) */
  effectiveRole: UserRole | null;
  /** When set, the current user is impersonating this role (read-only). */
  viewAsRole: UserRole | null;
  /** True when impersonating: writes/edits must be blocked in the UI. */
  isReadOnly: boolean;
  authenticated: boolean;
  supabaseUser: SupaUser | null;
  loading: boolean;
  setRole: (role: UserRole) => void;
  clearRole: () => void;
  setViewAsRole: (role: UserRole | null) => void;
  login: () => void;
  logout: () => void;
}

const UserContext = createContext<UserContextType>({} as UserContextType);

async function fetchUserRole(userId: string): Promise<UserRole | null> {
  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .limit(1);

  if (error) {
    console.error("Error fetching user role:", error);
    return null;
  }
  if (roles && roles.length > 0) {
    return roles[0].role as UserRole;
  }
  return null;
}

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [role, setRoleState] = useState<UserRole | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [supabaseUser, setSupabaseUser] = useState<SupaUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewAsRole, setViewAsRoleState] = useState<UserRole | null>(() => {
    const v = localStorage.getItem("viewAsRole");
    return (v as UserRole) || null;
  });

  useEffect(() => {
    // Dedup: evita refetch da role para o mesmo usuário (onAuthStateChange dispara várias vezes:
    // INITIAL_SESSION, TOKEN_REFRESHED, USER_UPDATED, etc.)
    let lastAppliedUserId: string | null = null;
    let cancelled = false;

    const applySession = async (sessionUser: SupaUser | null) => {
      if (cancelled) return;

      if (!sessionUser) {
        lastAppliedUserId = null;
        setSupabaseUser(null);
        setAuthenticated(false);
        setRoleState(null);
        setViewAsRoleState(null);
        localStorage.removeItem("authenticated");
        localStorage.removeItem("userRole");
        localStorage.removeItem("viewAsRole");
        setLoading(false);
        return;
      }

      // Mesmo usuário já processado → não refaz fetch
      if (lastAppliedUserId === sessionUser.id) {
        setLoading(false);
        return;
      }
      lastAppliedUserId = sessionUser.id;

      setSupabaseUser(sessionUser);
      setAuthenticated(true);
      localStorage.setItem("authenticated", "true");

      // Fast-path: usa role em cache (localStorage) enquanto faz fetch em background
      const cached = localStorage.getItem("userRole") as UserRole | null;
      if (cached) setRoleState(cached);
      setLoading(false);

      const userRole = await fetchUserRole(sessionUser.id);
      if (cancelled) return;
      setRoleState(userRole);
      if (userRole) localStorage.setItem("userRole", userRole);
      else localStorage.removeItem("userRole");

      // Prefetch idle das rotas mais usadas por perfil — chunks ficam em cache
      // antes do clique, eliminando o "Carregando…" na navegação.
      const r = userRole || cached;
      if (r === "usuario" || r === "empresa" || r === "contabilidade") prefetchUserRoutes();
      else if (r === "auditor_chefe" || r === "coordenadora") prefetchStaffRoutes();
      else if (r === "gestor_ia") prefetchGestorRoutes();
    };

    // onAuthStateChange dispara INITIAL_SESSION automaticamente — não precisa de getSession() separado.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const setRole = useCallback((r: UserRole) => {
    setRoleState(r);
    localStorage.setItem("userRole", r);
  }, []);

  const clearRole = useCallback(() => {
    setRoleState(null);
    setAuthenticated(false);
    setSupabaseUser(null);
    setViewAsRoleState(null);
    localStorage.removeItem("userRole");
    localStorage.removeItem("authenticated");
    localStorage.removeItem("viewAsRole");
  }, []);

  const setViewAsRole = useCallback((r: UserRole | null) => {
    setViewAsRoleState(r);
    if (r) localStorage.setItem("viewAsRole", r);
    else localStorage.removeItem("viewAsRole");
  }, []);

  const login = useCallback(() => {
    setAuthenticated(true);
    localStorage.setItem("authenticated", "true");
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    clearRole();
  }, [clearRole]);

  // Only auditor_chefe is allowed to impersonate (read-only "view as").
  const effectiveViewAs = role === "auditor_chefe" ? viewAsRole : null;
  const effectiveRole: UserRole | null = effectiveViewAs ?? role;
  const isReadOnly = !!effectiveViewAs;

  const value = useMemo<UserContextType>(() => ({
    role: effectiveRole,
    realRole: role,
    effectiveRole,
    viewAsRole: effectiveViewAs,
    isReadOnly,
    authenticated,
    supabaseUser,
    loading,
    setRole,
    clearRole,
    setViewAsRole,
    login,
    logout,
  }), [effectiveRole, role, effectiveViewAs, isReadOnly, authenticated, supabaseUser, loading, setRole, clearRole, setViewAsRole, login, logout]);

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
