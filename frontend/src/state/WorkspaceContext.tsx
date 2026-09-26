import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiGet, apiPost } from "../lib/api";
import { useAuth } from "./AuthContext";

export interface Workspace {
  id: string;
  name: string;
  role: string;
  created_at: string;
}

interface WorkspaceContextValue {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string) => void;
  createWorkspace: (name: string) => Promise<void>;
  refresh: () => Promise<void>;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(
    () => localStorage.getItem("activeWorkspaceId"),
  );
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const { workspaces: list } = await apiGet<{ workspaces: Workspace[] }>("/workspaces");
      setWorkspaces(list);
      setActiveWorkspaceIdState((current) => {
        if (current && list.some((w) => w.id === current)) return current;
        return list[0]?.id ?? null;
      });
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setActiveWorkspaceId = (id: string) => {
    setActiveWorkspaceIdState(id);
    localStorage.setItem("activeWorkspaceId", id);
  };

  const createWorkspace = async (name: string) => {
    await apiPost("/workspaces", { name });
    await refresh();
  };

  return (
    <WorkspaceContext.Provider
      value={{ workspaces, activeWorkspaceId, setActiveWorkspaceId, createWorkspace, refresh, loading }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
