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
      <h3 className="panel-title">Observability</h3>
      <div className="metrics-summary">
        <span>
          avg latency <b>{avgLatency}ms</b>
        </span>
        <span>&middot;</span>
        <span>
          hit rate <b>{hitRate}%</b>
        </span>
        <span>&middot;</span>
        <span>{metrics.length} requests</span>
      </div>
      <ul className="metrics-list">
        {metrics.map((m, i) => (
          <li key={i}>
            {m.endpoint}: {m.latency_ms}ms, hit={String(m.retrieval_hit)}
          </li>
        ))}
      </ul>
    </div>
  );
}
