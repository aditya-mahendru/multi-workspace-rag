import { AuthProvider, useAuth } from "./state/AuthContext";
import { WorkspaceProvider } from "./state/WorkspaceContext";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";

function Gate() {
  const { session, loading } = useAuth();

  if (loading) return <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>Loading...</div>;
  if (!session) return <Login />;

  return (
    <WorkspaceProvider>
      <Dashboard />
    </WorkspaceProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
