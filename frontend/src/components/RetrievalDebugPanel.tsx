import { useState, type FormEvent } from "react";
import { apiGet } from "../lib/api";

interface DebugChunk {
  id: string;
  workspace_id: string;
  document_filename?: string;
  section_label?: string | null;
  content: string;
  score: number;
}

interface DebugResult {
  workspace_id: string;
  question: string;
  mode: string;
  retrieval_hit: boolean;
  chunks: DebugChunk[];
}

/**
 * Stretch goal: a way to *prove* workspace isolation is holding. Runs
 * retrieval only (no LLM call) and shows exactly which workspace_id and
 * which chunks were considered.
 */
export function RetrievalDebugPanel({ workspaceId }: { workspaceId: string }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<DebugResult | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({ question });
      const data = await apiGet<DebugResult>(`/workspaces/${workspaceId}/debug/retrieval?${params.toString()}`);
      setResult(data);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h3 style={{ fontSize: 14, textTransform: "uppercase", color: "#666", marginBottom: 8 }}>Retrieval debug</h3>
      <form onSubmit={onSubmit} style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Test a question against this workspace only"
          style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}
        />
        <button type="submit" disabled={busy}>
          Run
        </button>
      </form>
      {result && (
        <div style={{ fontSize: 12 }}>
          <div>
            workspace_id: <code>{result.workspace_id}</code>
          </div>
          <div>mode: {result.mode}</div>
          <div>retrieval_hit: {result.retrieval_hit ? "true" : "false"}</div>
          <ul style={{ paddingLeft: 16 }}>
            {result.chunks.map((c) => (
              <li key={c.id}>
                <strong>{c.document_filename}</strong> (score {c.score?.toFixed(2)}) &mdash; {c.content.slice(0, 80)}...
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
