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
    <div className="ws-switcher">
      <select
        value={activeWorkspaceId ?? ""}
        onChange={(e) => setActiveWorkspaceId(e.target.value)}
        className="input"
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      {creating ? (
        <form onSubmit={onCreate} className="ws-new-form">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workspace name"
            className="input"
          />
          <button type="submit" className="btn btn-primary btn-sm">
            Add
          </button>
          <button type="button" onClick={() => setCreating(false)} className="btn btn-ghost btn-sm">
            Cancel
          </button>
        </form>
      ) : (
        <button onClick={() => setCreating(true)} className="btn btn-ghost btn-sm">
          + New workspace
        </button>
      )}
    </div>
  );
}
