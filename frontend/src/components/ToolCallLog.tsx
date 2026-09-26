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
      <h3 className="panel-title">Tool-call log</h3>
      <ul className="log-list">
        {calls.map((c) => (
          <li key={c.id} className="log-item">
            <div className="log-item-head">
              <span className={`dot ${c.status}`} />
              {c.tool_name}
              <span className="log-latency">{c.latency_ms}ms</span>
            </div>
            {c.error && <div className="log-error">{c.error}</div>}
          </li>
        ))}
        {calls.length === 0 && <li className="empty-hint">No tool calls yet.</li>}
      </ul>
    </div>
  );
}
