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
  const [role, setRoleState] = useState<UserRole | null>(
    () => localStorage.getItem("userRole") as UserRole | null
  );
  const [authenticated, setAuthenticated] = useState(
    () => localStorage.getItem("authenticated") === "true"
  );
  const [supabaseUser, setSupabaseUser] = useState<SupaUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // IMPORTANT: Set up listener BEFORE getSession to avoid race conditions
    // Do NOT await inside onAuthStateChange callback to prevent deadlocks
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth state change:", event, session?.user?.email);

      if (session?.user) {
        setSupabaseUser(session.user);
        setAuthenticated(true);
        localStorage.setItem("authenticated", "true");

        // Use setTimeout to avoid deadlock - fetch role outside the callback
        setTimeout(async () => {
          const userRole = await fetchUserRole(session.user.id);
          if (userRole) {
            setRoleState(userRole);
            localStorage.setItem("userRole", userRole);
          }
          setLoading(false);
        }, 0);
      } else {
        setSupabaseUser(null);
        setAuthenticated(false);
        setRoleState(null);
        localStorage.removeItem("authenticated");
        localStorage.removeItem("userRole");
        setLoading(false);
      }
    });

    // Check existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setSupabaseUser(session.user);
        setAuthenticated(true);
        localStorage.setItem("authenticated", "true");

        const userRole = await fetchUserRole(session.user.id);
        if (userRole) {
          setRoleState(userRole);
          localStorage.setItem("userRole", userRole);
        }
      }
      setLoading(false);
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
