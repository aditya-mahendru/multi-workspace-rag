import { supabase } from "../db/client.js";
import { embedText } from "./embeddings.js";
import type { RetrievalDebugInfo, RetrievedChunk } from "../types/index.js";

const SIMILARITY_THRESHOLD = 0.55; // below this, we treat retrieval as a miss
const MATCH_COUNT = 6;

/**
 * Documents explicitly shared INTO the active workspace (opt-in, stretch
 * goal). Passed as a second predicate branch inside the same RPC query —
 * never a separate unscoped fetch — so default isolation is unaffected when
 * no document has been shared.
 */
async function resolveSharedDocumentIds(activeWorkspaceId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("shared_documents")
    .select("document_id")
    .eq("shared_with_workspace_id", activeWorkspaceId);
  if (error) return [];
  return (data ?? []).map((row) => row.document_id);
}

async function attachFilenames(chunks: RetrievedChunk[]): Promise<RetrievedChunk[]> {
  if (chunks.length === 0) return chunks;
  const docIds = [...new Set(chunks.map((c) => c.document_id))];
  const { data: docs } = await supabase.from("documents").select("id, filename").in("id", docIds);
  const byId = new Map((docs ?? []).map((d) => [d.id, d.filename]));
  return chunks.map((c) => ({ ...c, document_filename: byId.get(c.document_id) }));
}

export async function retrieve(
  question: string,
  activeWorkspaceId: string,
  opts: { hybrid?: boolean } = {},
): Promise<RetrievalDebugInfo> {
  const [sharedDocumentIds, queryEmbedding] = await Promise.all([
    resolveSharedDocumentIds(activeWorkspaceId),
    embedText(question),
  ]);

  let chunks: RetrievedChunk[];
  const mode: "vector" | "hybrid" = opts.hybrid ? "hybrid" : "vector";

  if (opts.hybrid) {
    const { data, error } = await supabase.rpc("match_chunks_hybrid", {
      query_embedding: queryEmbedding,
      query_text: question,
      p_workspace_ids: [activeWorkspaceId],
      match_count: MATCH_COUNT,
      p_shared_document_ids: sharedDocumentIds,
    });
    if (error) throw new Error(`Hybrid retrieval failed: ${error.message}`);
    chunks = (data ?? []).map((row: any) => ({ ...row, score: row.score }));
  } else {
    const { data, error } = await supabase.rpc("match_chunks", {
      query_embedding: queryEmbedding,
      p_workspace_ids: [activeWorkspaceId],
      match_count: MATCH_COUNT,
      p_shared_document_ids: sharedDocumentIds,
    });
    if (error) throw new Error(`Retrieval failed: ${error.message}`);
    chunks = (data ?? []).map((row: any) => ({ ...row, score: row.similarity }));
  }

  chunks = await attachFilenames(chunks);

  const retrievalHit = mode === "vector" ? chunks.some((c) => c.score >= SIMILARITY_THRESHOLD) : chunks.length > 0;

  return {
    workspace_id: activeWorkspaceId,
    question,
    mode,
    chunks: retrievalHit ? chunks : [],
    retrieval_hit: retrievalHit,
  };
}
