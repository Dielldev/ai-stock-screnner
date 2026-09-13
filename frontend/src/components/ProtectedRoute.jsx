import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <span className="microlabel animate-pulse">Loading session…</span>
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  return children;
}
