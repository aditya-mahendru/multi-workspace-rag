import { supabase } from "../db/client.js";

interface RecordMetricParams {
  workspaceId: string | null;
  endpoint: string;
  latencyMs: number;
  retrievalHit?: boolean;
  tokenCountIn?: number;
  tokenCountOut?: number;
}

// Best-effort observability write; never let a metrics failure break a request.
export async function recordMetric(params: RecordMetricParams): Promise<void> {
  try {
    await supabase.from("request_metrics").insert({
      workspace_id: params.workspaceId,
      endpoint: params.endpoint,
      latency_ms: params.latencyMs,
      retrieval_hit: params.retrievalHit ?? null,
      token_count_in: params.tokenCountIn ?? null,
      token_count_out: params.tokenCountOut ?? null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to record metric", err);
  }
}
