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
    <div className="chat-shell">
      <div className="chat-scroll">
        {messages.length === 0 && (
          <div className="empty-hint" style={{ margin: "auto" }}>
            Ask a question about this workspace's documents to get started.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`bubble-row ${m.role}`}>
            <div style={{ maxWidth: "100%" }}>
              <div className="bubble-label" style={{ textAlign: m.role === "user" ? "right" : "left" }}>
                {m.role === "user" ? "You" : "Assistant"}
              </div>
              <div className={`bubble ${m.role}`}>
                {m.content}
                {m.toolCalls && m.toolCalls.length > 0 && (
                  <div>
                    {m.toolCalls.map((tc, i) => (
                      <span key={i} className={`tool-chip ${tc.status}`}>
                        {tc.status === "success" ? "✓" : "✗"} {tc.name}
                        {tc.error ? ` — ${tc.error}` : ""}
                      </span>
                    ))}
                  </div>
                )}
                {m.citations && m.citations.length > 0 && (
                  <details className="citations">
                    <summary>{m.citations.length} source(s)</summary>
                    <ul>
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
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input-row">
        <label className="hybrid-toggle">
          <input type="checkbox" checked={hybrid} onChange={(e) => setHybrid(e.target.checked)} />
          Hybrid search
        </label>
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask a question about this workspace's documents..."
        />
        <button onClick={send} disabled={busy} className="btn btn-primary">
          Send
        </button>
      </div>
    </div>
  );
}
