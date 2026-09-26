import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";

interface ToolCall {
  id: string;
  tool_name: string;
  arguments: unknown;
  result: unknown;
  status: "success" | "failed";
  error: string | null;
  latency_ms: number;
  created_at: string;
}

export function ToolCallLog({ workspaceId }: { workspaceId: string }) {
  const [calls, setCalls] = useState<ToolCall[]>([]);

  const load = () => {
    apiGet<{ toolCalls: ToolCall[] }>(`/workspaces/${workspaceId}/tool-calls`).then(({ toolCalls }) => setCalls(toolCalls));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [workspaceId]);

  return (
    <div>
      <h3 style={{ fontSize: 14, textTransform: "uppercase", color: "#666", marginBottom: 8 }}>Tool-call log</h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12, maxHeight: 240, overflowY: "auto" }}>
        {calls.map((c) => (
          <li key={c.id} style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}>
            <span style={{ color: c.status === "success" ? "#059669" : "#c0392b", fontWeight: 600 }}>
              {c.status === "success" ? "✓" : "✗"} {c.tool_name}
            </span>{" "}
            <span style={{ color: "#999" }}>({c.latency_ms}ms)</span>
            {c.error && <div style={{ color: "#c0392b" }}>{c.error}</div>}
          </li>
        ))}
        {calls.length === 0 && <li style={{ color: "#999" }}>No tool calls yet.</li>}
      </ul>
    </div>
  );
}
