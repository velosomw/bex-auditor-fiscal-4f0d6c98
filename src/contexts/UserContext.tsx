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

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [role, setRoleState] = useState<UserRole | null>(
    () => localStorage.getItem("userRole") as UserRole | null
  );
  const [authenticated, setAuthenticated] = useState(
    () => localStorage.getItem("authenticated") === "true"
  );
  const [supabaseUser, setSupabaseUser] = useState<SupaUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setSupabaseUser(session.user);
        setAuthenticated(true);
        localStorage.setItem("authenticated", "true");

        // Fetch user role
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .limit(1);

        if (roles && roles.length > 0) {
          const userRole = roles[0].role as UserRole;
          setRoleState(userRole);
          localStorage.setItem("userRole", userRole);
        }
      } else {
        setSupabaseUser(null);
        setAuthenticated(false);
        setRoleState(null);
        localStorage.removeItem("authenticated");
        localStorage.removeItem("userRole");
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setSupabaseUser(session.user);
        setAuthenticated(true);
        localStorage.setItem("authenticated", "true");
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .limit(1)
          .then(({ data: roles }) => {
            if (roles && roles.length > 0) {
              const userRole = roles[0].role as UserRole;
              setRoleState(userRole);
              localStorage.setItem("userRole", userRole);
            }
            setLoading(false);
          });
      } else {
        setLoading(false);
      }
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
