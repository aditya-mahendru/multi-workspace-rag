import { Router } from "express";
import { z } from "zod";
import { supabase } from "../db/client.js";
import { requireAuth, requireWorkspaceMember } from "../middleware/auth.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";

export const workspacesRouter = Router();

workspacesRouter.use(requireAuth);

// List workspaces the current user belongs to.
workspacesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from("workspace_members")
      .select("role, workspaces(id, name, created_at)")
      .eq("user_id", req.user!.id);

    if (error) throw new HttpError(500, "Failed to load workspaces");

    const workspaces = (data ?? []).map((row: any) => ({ ...row.workspaces, role: row.role }));
    res.json({ workspaces });
  }),
);

const createSchema = z.object({ name: z.string().min(1).max(120) });

workspacesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Workspace name is required");

    const { data: workspace, error } = await supabase
      .from("workspaces")
      .insert({ owner_id: req.user!.id, name: parsed.data.name })
      .select("id, name, created_at")
      .single();

    if (error || !workspace) throw new HttpError(500, "Failed to create workspace");

    const { error: memberError } = await supabase
      .from("workspace_members")
      .insert({ workspace_id: workspace.id, user_id: req.user!.id, role: "owner" });

    if (memberError) throw new HttpError(500, "Failed to add owner as workspace member");

    res.status(201).json({ workspace });
  }),
);

workspacesRouter.get(
  "/:workspaceId/documents",
  requireWorkspaceMember,
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from("documents")
      .select("id, filename, status, chunk_count, created_at")
      .eq("workspace_id", req.params.workspaceId)
      .order("created_at", { ascending: false });

    if (error) throw new HttpError(500, "Failed to load documents");
    res.json({ documents: data ?? [] });
  }),
);

workspacesRouter.get(
  "/:workspaceId/messages",
  requireWorkspaceMember,
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from("messages")
      .select("id, role, content, citations, created_at")
      .eq("workspace_id", req.params.workspaceId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) throw new HttpError(500, "Failed to load chat history");
    res.json({ messages: data ?? [] });
  }),
);

workspacesRouter.get(
  "/:workspaceId/tasks",
  requireWorkspaceMember,
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from("tasks")
      .select("id, title, details, created_at")
      .eq("workspace_id", req.params.workspaceId)
      .order("created_at", { ascending: false });

    if (error) throw new HttpError(500, "Failed to load tasks");
    res.json({ tasks: data ?? [] });
  }),
);

const shareSchema = z.object({ documentId: z.string().uuid(), targetWorkspaceId: z.string().uuid() });

// Explicit, opt-in cross-workspace document sharing (stretch goal).
workspacesRouter.post(
  "/:workspaceId/share",
  requireWorkspaceMember,
  asyncHandler(async (req, res) => {
    const parsed = shareSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "documentId and targetWorkspaceId are required");

    // Confirm the document actually belongs to the workspace doing the sharing.
    const { data: doc } = await supabase
      .from("documents")
      .select("id")
      .eq("id", parsed.data.documentId)
      .eq("workspace_id", req.params.workspaceId)
      .maybeSingle();
    if (!doc) throw new HttpError(404, "Document not found in this workspace");

    // Confirm the caller is also a member of the target workspace (can't share into a workspace you can't see).
    const { data: targetMembership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", parsed.data.targetWorkspaceId)
      .eq("user_id", req.user!.id)
      .maybeSingle();
    if (!targetMembership) throw new HttpError(403, "Not a member of the target workspace");

    const { error } = await supabase.from("shared_documents").upsert({
      document_id: parsed.data.documentId,
      shared_with_workspace_id: parsed.data.targetWorkspaceId,
      shared_by_user_id: req.user!.id,
    });

    if (error) throw new HttpError(500, "Failed to share document");
    res.status(201).json({ shared: true });
  }),
);
