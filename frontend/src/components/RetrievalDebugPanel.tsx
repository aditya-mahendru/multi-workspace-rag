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
      <h3 className="panel-title">Retrieval debug</h3>
      <form onSubmit={onSubmit} className="debug-form">
        <input
          className="input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Test a question against this workspace"
          style={{ flex: 1, fontSize: 12, padding: "8px 10px" }}
        />
        <button type="submit" disabled={busy} className="btn btn-ghost btn-sm">
          Run
        </button>
      </form>
      {result && (
        <div className="debug-result">
          <div>
            <span className="kv">workspace_id:</span> <code>{result.workspace_id.slice(0, 8)}...</code>
          </div>
          <div>
            <span className="kv">mode:</span> {result.mode} &middot; <span className="kv">hit:</span>{" "}
            {result.retrieval_hit ? "true" : "false"}
          </div>
          <ul className="debug-chunks">
            {result.chunks.map((c) => (
              <li key={c.id}>
                <strong style={{ color: "var(--text-0)" }}>{c.document_filename}</strong> (score {c.score?.toFixed(2)})
                <br />
                {c.content.slice(0, 80)}...
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
