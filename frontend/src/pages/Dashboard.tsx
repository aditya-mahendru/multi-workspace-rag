import { useAuth } from "../state/AuthContext";
import { useWorkspace } from "../state/WorkspaceContext";
import { WorkspaceSwitcher } from "../components/WorkspaceSwitcher";
import { DocumentUpload } from "../components/DocumentUpload";
import { ChatPanel } from "../components/ChatPanel";
import { ToolCallLog } from "../components/ToolCallLog";
import { RetrievalDebugPanel } from "../components/RetrievalDebugPanel";
import { MetricsPanel } from "../components/MetricsPanel";

export function Dashboard() {
  const { session, signOut } = useAuth();
  const { activeWorkspaceId, loading } = useWorkspace();

  if (loading) {
    return (
      <div className="app-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <span className="empty-hint">Loading workspaces...</span>
      </div>
    );
  }

  return (
    <div className="app-shell dashboard-shell">
      <header className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div className="brand">
            <span className="brand-dot" />
            Workspace Assistant
          </div>
          <WorkspaceSwitcher />
        </div>
        <div className="topbar-user">
          <span>{session?.user.email}</span>
          <button onClick={signOut} className="btn btn-ghost btn-sm">
            Sign out
          </button>
        </div>
      </header>

      {!activeWorkspaceId ? (
        <div style={{ padding: 32 }}>
          <span className="empty-hint">Create a workspace to get started.</span>
        </div>
      ) : (
        <main className="main-grid">
          <aside className="glass panel panel-scroll">
            <DocumentUpload workspaceId={activeWorkspaceId} />
          </aside>

          <section className="glass panel" style={{ padding: 0, overflow: "hidden" }}>
            <ChatPanel workspaceId={activeWorkspaceId} />
          </section>

          <aside className="stack panel-scroll">
            <div className="glass panel">
              <ToolCallLog workspaceId={activeWorkspaceId} />
            </div>
            <div className="glass panel">
              <RetrievalDebugPanel workspaceId={activeWorkspaceId} />
            </div>
            <div className="glass panel">
              <MetricsPanel workspaceId={activeWorkspaceId} />
            </div>
          </aside>
        </main>
      )}
    </div>
  );
}
