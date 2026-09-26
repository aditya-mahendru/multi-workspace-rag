import { z } from "zod";
import { supabase } from "../../db/client.js";
import type { ToolDefinition } from "../../types/index.js";

const argsSchema = z.object({
  title: z.string().min(1).max(200),
  details: z.string().max(2000).optional(),
});

export const saveTaskTool: ToolDefinition = {
  name: "save_task",
  description:
    "Save a follow-up task into the current workspace. Use this when the user explicitly asks you to remember, save, log, or track an action item.",
  schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short title for the task" },
      details: { type: "string", description: "Optional extra detail" },
    },
    required: ["title"],
    additionalProperties: false,
  },
  validate: (args: unknown) => {
    const parsed = argsSchema.safeParse(args);
    if (!parsed.success) return { ok: false, error: parsed.error.message };
    return { ok: true, data: parsed.data };
  },
  execute: async (args, ctx) => {
    const { title, details } = args as z.infer<typeof argsSchema>;
    const { data, error } = await supabase
      .from("tasks")
      .insert({ workspace_id: ctx.workspaceId, title, details })
      .select("id, title, details, created_at")
      .single();

    if (error) throw new Error(`Failed to save task: ${error.message}`);
    return data;
  },
};
