import { Router } from "express";
import { supabase } from "../db/client.js";
import { requireAuth, requireWorkspaceMember } from "../middleware/auth.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";

export const toolLogsRouter = Router();

toolLogsRouter.use(requireAuth);

toolLogsRouter.get(
  "/:workspaceId/tool-calls",
  requireWorkspaceMember,
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from("tool_calls")
      .select("id, tool_name, arguments, result, status, error, latency_ms, created_at")
      .eq("workspace_id", req.params.workspaceId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new HttpError(500, "Failed to load tool-call log");
    res.json({ toolCalls: data ?? [] });
  }),
);
