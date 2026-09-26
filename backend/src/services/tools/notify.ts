import { z } from "zod";
import { env } from "../../config/env.js";
import type { ToolDefinition } from "../../types/index.js";

const argsSchema = z.object({
  message: z.string().min(1).max(1000),
});

function buildPayload(message: string): unknown {
  if (env.NOTIFY_WEBHOOK_KIND === "slack") {
    return { text: message };
  }
  return { content: message }; // Discord webhook shape
}

export const notifyChannelTool: ToolDefinition = {
  name: "notify_channel",
  description:
    "Send a short summary or alert to the team's Slack/Discord channel. Use this when the user asks you to notify, alert, or share something with the team.",
  schema: {
    type: "object",
    properties: {
      message: { type: "string", description: "The message to post to the channel" },
    },
    required: ["message"],
    additionalProperties: false,
  },
  validate: (args: unknown) => {
    const parsed = argsSchema.safeParse(args);
    if (!parsed.success) return { ok: false, error: parsed.error.message };
    return { ok: true, data: parsed.data };
  },
  execute: async (args) => {
    const { message } = args as z.infer<typeof argsSchema>;

    if (!env.NOTIFY_WEBHOOK_URL) {
      throw new Error("Notification webhook is not configured");
    }

    const res = await fetch(env.NOTIFY_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(message)),
    });

    if (!res.ok) {
      throw new Error(`Webhook responded with status ${res.status}`);
    }

    return { delivered: true };
  },
};
