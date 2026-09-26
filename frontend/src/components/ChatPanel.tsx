import { useEffect, useRef, useState } from "react";
import { apiGet, streamChat, type ChatStreamEvent } from "../lib/api";

interface Citation {
  id: string;
  content: string;
  document_filename?: string;
  section_label?: string | null;
  score: number;
}

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  toolCalls?: { name: string; status: "success" | "failed"; error?: string }[];
}

export function ChatPanel({ workspaceId }: { workspaceId: string }) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [hybrid, setHybrid] = useState(false);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([]);
    apiGet<{ messages: any[] }>(`/workspaces/${workspaceId}/messages`).then(({ messages: history }) => {
      setMessages(
        history.map((m) => ({ id: m.id, role: m.role, content: m.content, citations: m.citations ?? [] })),
      );
    });
  }, [workspaceId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);

    const userMsg: DisplayMessage = { id: `local-${Date.now()}`, role: "user", content: question };
    const assistantMsg: DisplayMessage = { id: `local-assistant-${Date.now()}`, role: "assistant", content: "", citations: [], toolCalls: [] };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    const applyToAssistant = (updater: (m: DisplayMessage) => DisplayMessage) => {
      setMessages((prev) => {
        const next = [...prev];
        const idx = next.length - 1;
        next[idx] = updater(next[idx]);
        return next;
      });
    };

    try {
      await streamChat(workspaceId, question, hybrid, (event: ChatStreamEvent) => {
        if (event.type === "token") {
          applyToAssistant((m) => ({ ...m, content: m.content + event.text }));
        } else if (event.type === "citations") {
          applyToAssistant((m) => ({ ...m, citations: event.chunks as Citation[] }));
        } else if (event.type === "tool_call") {
          applyToAssistant((m) => ({
            ...m,
            toolCalls: [...(m.toolCalls ?? []), { name: event.name, status: event.status, error: event.error }],
          }));
        } else if (event.type === "error") {
          applyToAssistant((m) => ({ ...m, content: m.content || `⚠️ ${event.message}` }));
        }
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: 12, background: "#fafafa", borderRadius: 8, minHeight: 300 }}>
        {messages.map((m) => (
          <div key={m.id} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: m.role === "user" ? "#111827" : "#2563eb", marginBottom: 2 }}>
              {m.role === "user" ? "You" : "Assistant"}
            </div>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{m.content}</div>
            {m.toolCalls && m.toolCalls.length > 0 && (
              <div style={{ marginTop: 4 }}>
                {m.toolCalls.map((tc, i) => (
                  <div key={i} style={{ fontSize: 12, color: tc.status === "success" ? "#059669" : "#c0392b" }}>
                    {tc.status === "success" ? "✓" : "✗"} tool: {tc.name}
                    {tc.error ? ` (${tc.error})` : ""}
                  </div>
                ))}
              </div>
            )}
            {m.citations && m.citations.length > 0 && (
              <details style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
                <summary style={{ cursor: "pointer" }}>{m.citations.length} source(s)</summary>
                <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                  {m.citations.map((c) => (
                    <li key={c.id}>
                      {c.document_filename}
                      {c.section_label ? ` — ${c.section_label}` : ""} (score {c.score?.toFixed(2)})
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
        <label style={{ fontSize: 12, color: "#666", display: "flex", gap: 4, alignItems: "center" }}>
          <input type="checkbox" checked={hybrid} onChange={(e) => setHybrid(e.target.checked)} />
          Hybrid search
        </label>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask a question about this workspace's documents..."
          style={{ flex: 1, padding: "10px 12px", borderRadius: 6, border: "1px solid #d1d5db" }}
        />
        <button onClick={send} disabled={busy} style={{ padding: "10px 16px", borderRadius: 6, border: "none", background: "#111827", color: "white" }}>
          Send
        </button>
      </div>
    </div>
  );
}
