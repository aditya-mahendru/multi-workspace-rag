import { Router } from "express";
import { z } from "zod";
import { supabase } from "../db/client.js";
import { requireAuth, requireWorkspaceMember } from "../middleware/auth.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { retrieve } from "../services/retrieval.js";

export const debugRouter = Router();

debugRouter.use(requireAuth);

const querySchema = z.object({ question: z.string().min(1), hybrid: z.string().optional() });

// Retrieval-debug view (stretch goal): shows exactly which workspace and
// which chunks a question would draw from, without invoking the LLM. This is
// the clean way to prove workspace isolation is actually holding.
debugRouter.get(
  "/:workspaceId/debug/retrieval",
  requireWorkspaceMember,
  asyncHandler(async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) throw new HttpError(400, "A question query param is required");

    const info = await retrieve(parsed.data.question, req.params.workspaceId, {
      hybrid: parsed.data.hybrid === "true",
    });

    res.json(info);
  }),
);

debugRouter.get(
  "/:workspaceId/debug/metrics",
  requireWorkspaceMember,
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from("request_metrics")
      .select("endpoint, token_count_in, token_count_out, latency_ms, retrieval_hit, created_at")
      .eq("workspace_id", req.params.workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw new HttpError(500, "Failed to load metrics");
    res.json({ metrics: data ?? [] });
  }),
);
