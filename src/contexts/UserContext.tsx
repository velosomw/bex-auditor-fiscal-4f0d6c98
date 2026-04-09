import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { UserRole } from "@/types/user";
import { supabase } from "@/integrations/supabase/client";
import type { User as SupaUser } from "@supabase/supabase-js";

interface UserContextType {
  role: UserRole | null;
  authenticated: boolean;
  supabaseUser: SupaUser | null;
  loading: boolean;
  setRole: (role: UserRole) => void;
  clearRole: () => void;
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

  useEffect(() => {
    const applySession = async (sessionUser: SupaUser | null) => {
      if (!sessionUser) {
        setSupabaseUser(null);
        setAuthenticated(false);
        setRoleState(null);
        localStorage.removeItem("authenticated");
        localStorage.removeItem("userRole");
        setLoading(false);
        return;
      }

      setSupabaseUser(sessionUser);
      setAuthenticated(true);
      localStorage.setItem("authenticated", "true");

      const userRole = await fetchUserRole(sessionUser.id);
      setRoleState(userRole);

      if (userRole) localStorage.setItem("userRole", userRole);
      else localStorage.removeItem("userRole");

      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session?.user ?? null);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      void applySession(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const setRole = useCallback((r: UserRole) => {
    setRoleState(r);
    localStorage.setItem("userRole", r);
  }, []);

  const clearRole = useCallback(() => {
    setRoleState(null);
    setAuthenticated(false);
    setSupabaseUser(null);
    localStorage.removeItem("userRole");
    localStorage.removeItem("authenticated");
  }, []);

  const login = useCallback(() => {
    setAuthenticated(true);
    localStorage.setItem("authenticated", "true");
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    clearRole();
  }, [clearRole]);

  return (
    <UserContext.Provider value={{ role, authenticated, supabaseUser, loading, setRole, clearRole, login, logout }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
