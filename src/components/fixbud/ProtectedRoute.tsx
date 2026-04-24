import { Navigate } from "react-router-dom";
import { useAuth, AppRole } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

interface Props {
  children: React.ReactNode;
  requiredRole?: AppRole;
}

export const ProtectedRoute = ({ children, requiredRole }: Props) => {
  const { session, role, loading } = useAuth();

  // Wait for auth + role resolution before enforcing routes.
  // Without this, `role === null` can incorrectly allow/route users.
  if (loading || (requiredRole && !role)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" replace />;

  if (requiredRole && role !== requiredRole) {
    return <Navigate to={role === "worker" ? "/dashboard/worker" : "/dashboard/customer"} replace />;
  }

  return <>{children}</>;
};