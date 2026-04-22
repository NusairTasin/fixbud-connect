import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

const DashboardRouter = () => {
  const { session, role, loading } = useAuth();
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (!session) return <Navigate to="/auth" replace />;
  if (role === "worker") return <Navigate to="/dashboard/worker" replace />;
  return <Navigate to="/dashboard/customer" replace />;
};

export default DashboardRouter;