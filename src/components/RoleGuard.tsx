import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { UserRole } from "@/types/user";

interface RoleGuardProps {
  allow: UserRole[];
  children: ReactNode;
}

/**
 * Restricts a route to a list of roles.
 * - Unauthenticated → /login
 * - Loading → minimal placeholder
 * - Wrong role → redirect to that role's home
 */
const RoleGuard = ({ allow, children }: RoleGuardProps) => {
  const { authenticated, loading, realRole } = useUser();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  if (!authenticated) return <Navigate to="/login" replace />;

  if (!realRole || !allow.includes(realRole)) {
    const fallback =
      realRole === "gestor_ia" ? "/gestor-ia"
      : realRole === "auditor_chefe" || realRole === "coordenadora" ? "/dashboard"
      : "/user";
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
};

export default RoleGuard;
