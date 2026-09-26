import { useState, type FormEvent } from "react";
import { useWorkspace } from "../state/WorkspaceContext";

export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspaceId, setActiveWorkspaceId, createWorkspace } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await createWorkspace(name.trim());
    setName("");
    setCreating(false);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <select
        value={activeWorkspaceId ?? ""}
        onChange={(e) => setActiveWorkspaceId(e.target.value)}
        style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db" }}
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      {creating ? (
        <form onSubmit={onCreate} style={{ display: "flex", gap: 6 }}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workspace name"
            style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db" }}
          />
          <button type="submit">Add</button>
          <button type="button" onClick={() => setCreating(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button onClick={() => setCreating(true)} style={{ fontSize: 13 }}>
          + New workspace
        </button>
      )}
    </div>
  );
}
