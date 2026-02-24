import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { UserRole } from "@/types/user";

interface UserContextType {
  role: UserRole | null;
  authenticated: boolean;
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

  const logout = useCallback(() => {
    clearRole();
  }, [clearRole]);

  return (
    <UserContext.Provider value={{ role, authenticated, setRole, clearRole, login, logout }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
