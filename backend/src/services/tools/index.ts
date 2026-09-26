import type { ToolDefinition } from "../../types/index.js";
import { saveTaskTool } from "./saveTask.js";
import { notifyChannelTool } from "./notify.js";

export const toolRegistry: Record<string, ToolDefinition> = {
  [saveTaskTool.name]: saveTaskTool,
  [notifyChannelTool.name]: notifyChannelTool,
};

export function toolsForLlm() {
  return Object.values(toolRegistry).map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
    },
  }));
}
