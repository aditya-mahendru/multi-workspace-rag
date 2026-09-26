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

  if (loading) return <div style={{ padding: 24 }}>Loading workspaces...</div>;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", height: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 20px",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <strong>Workspace Document Assistant</strong>
          <WorkspaceSwitcher />
        </div>
        <div style={{ fontSize: 13, color: "#666", display: "flex", gap: 12, alignItems: "center" }}>
          <span>{session?.user.email}</span>
          <button onClick={signOut}>Sign out</button>
        </div>
      </header>

      {!activeWorkspaceId ? (
        <div style={{ padding: 24 }}>Create a workspace to get started.</div>
      ) : (
        <main style={{ flex: 1, display: "grid", gridTemplateColumns: "280px 1fr 300px", gap: 16, padding: 16, overflow: "hidden" }}>
          <aside style={{ overflowY: "auto" }}>
            <DocumentUpload workspaceId={activeWorkspaceId} />
          </aside>
          <section style={{ overflow: "hidden" }}>
            <ChatPanel workspaceId={activeWorkspaceId} />
          </section>
          <aside style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>
            <ToolCallLog workspaceId={activeWorkspaceId} />
            <RetrievalDebugPanel workspaceId={activeWorkspaceId} />
            <MetricsPanel workspaceId={activeWorkspaceId} />
          </aside>
        </main>
      )}
    </div>
  );
}
