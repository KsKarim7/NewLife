import { Navigate, Outlet } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";

const ProtectedRoute = () => {
  const { isLoading, token } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const storedToken =
    typeof window !== "undefined"
      ? localStorage.getItem("ims_token")
      : null;

  if (!token && !storedToken) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;

