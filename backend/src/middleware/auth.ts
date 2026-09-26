import type { NextFunction, Request, Response } from "express";
import { supabase } from "../db/client.js";
import type { AuthedUser } from "../types/index.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  req.user = { id: data.user.id, email: data.user.email ?? undefined };
  next();
}

/**
 * Confirms the authenticated user is a member of :workspaceId before any
 * workspace-scoped route handler runs. This is the app-level enforcement of
 * tenant isolation — independent of, and in addition to, Postgres RLS.
 */
export async function requireWorkspaceMember(req: Request, res: Response, next: NextFunction) {
  const workspaceId = req.params.workspaceId;
  const userId = req.user?.id;

  if (!workspaceId || !userId) {
    res.status(400).json({ error: "Missing workspace id" });
    return;
  }

  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: "Failed to verify workspace membership" });
    return;
  }

  if (!data) {
    res.status(403).json({ error: "Not a member of this workspace" });
    return;
  }

  next();
}
