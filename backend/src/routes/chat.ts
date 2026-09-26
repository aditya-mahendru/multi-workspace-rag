import { Router } from "express";
import { z } from "zod";
import { supabase } from "../db/client.js";
import { requireAuth, requireWorkspaceMember } from "../middleware/auth.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { retrieve } from "../services/retrieval.js";
import { runChatWithTools } from "../services/llm.js";
import { recordMetric } from "../services/metrics.js";

export const chatRouter = Router();

chatRouter.use(requireAuth);

const chatSchema = z.object({
  question: z.string().min(1).max(4000),
  hybrid: z.boolean().optional(),
});

chatRouter.post(
  "/:workspaceId/chat",
  requireWorkspaceMember,
  asyncHandler(async (req, res) => {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "A non-empty question is required");

    const workspaceId = req.params.workspaceId;
    const userId = req.user!.id;
    const { question, hybrid } = parsed.data;
    const startedAt = Date.now();

    // Persist the user's question BEFORE calling the LLM so it is never lost
    // if the model call is slow or fails.
    const { data: userMessage, error: userMsgError } = await supabase
      .from("messages")
      .insert({ workspace_id: workspaceId, user_id: userId, role: "user", content: question })
      .select("id")
      .single();
    if (userMsgError || !userMessage) throw new HttpError(500, "Failed to save your message");

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let debugInfo;
    try {
      debugInfo = await retrieve(question, workspaceId, { hybrid });
    } catch (err) {
      await recordMetric({ workspaceId, endpoint: "chat", latencyMs: Date.now() - startedAt, retrievalHit: false });
      send("error", { message: "Retrieval failed. Please try again." });
      res.end();
      return;
    }

    // Note: we deliberately do NOT short-circuit to a canned "I don't know"
    // when retrieval misses. A miss just means contextChunks is empty going
    // into the model — the system prompt (see buildSystemPrompt) instructs it
    // to refuse ungrounded factual questions, but the user's message might
    // instead be a tool request (e.g. "save a task") that has nothing to do
    // with document content and must still reach the tool-calling loop.

    const { data: historyRows } = await supabase
      .from("messages")
      .select("role, content")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(10);
    const history = (historyRows ?? [])
      .reverse()
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(0, -1) as { role: "user" | "assistant"; content: string }[];

    let fullAnswer = "";
    let sawError = false;

    await runChatWithTools({
      question,
      contextChunks: debugInfo.chunks,
      history,
      toolCtx: { workspaceId, userId, messageId: userMessage.id },
      onEvent: (event) => {
        if (event.type === "token") fullAnswer += event.text;
        if (event.type === "error") sawError = true;
        send(event.type, event);
      },
    });

    if (!sawError) {
      await supabase.from("messages").insert({
        workspace_id: workspaceId,
        user_id: userId,
        role: "assistant",
        content: fullAnswer,
        citations: debugInfo.chunks,
      });
    }

    await recordMetric({
      workspaceId,
      endpoint: "chat",
      latencyMs: Date.now() - startedAt,
      retrievalHit: debugInfo.retrieval_hit,
    });

    res.end();
  }),
);
