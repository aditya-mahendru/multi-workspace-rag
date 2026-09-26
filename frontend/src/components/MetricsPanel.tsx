import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";

interface Metric {
  endpoint: string;
  token_count_in: number | null;
  token_count_out: number | null;
  latency_ms: number;
  retrieval_hit: boolean | null;
  created_at: string;
}

/** Stretch goal: per-request latency and retrieval hit/miss observability. */
export function MetricsPanel({ workspaceId }: { workspaceId: string }) {
  const [metrics, setMetrics] = useState<Metric[]>([]);

  useEffect(() => {
    apiGet<{ metrics: Metric[] }>(`/workspaces/${workspaceId}/debug/metrics`).then(({ metrics: m }) => setMetrics(m));
  }, [workspaceId]);

  const avgLatency = metrics.length ? Math.round(metrics.reduce((s, m) => s + m.latency_ms, 0) / metrics.length) : 0;
  const hitRate = metrics.length
    ? Math.round((metrics.filter((m) => m.retrieval_hit).length / metrics.length) * 100)
    : 0;

  return (
    <div>
      <h3 style={{ fontSize: 14, textTransform: "uppercase", color: "#666", marginBottom: 8 }}>Observability</h3>
      <div style={{ fontSize: 12, marginBottom: 6 }}>
        avg latency: {avgLatency}ms &middot; retrieval hit rate: {hitRate}% &middot; {metrics.length} requests logged
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 11, maxHeight: 150, overflowY: "auto", color: "#666" }}>
        {metrics.map((m, i) => (
          <li key={i}>
            {m.endpoint}: {m.latency_ms}ms, hit={String(m.retrieval_hit)}
          </li>
        ))}
      </ul>
    </div>
  );
}
