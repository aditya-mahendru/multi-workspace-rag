export interface AuthedUser {
  id: string;
  email?: string;
}

export interface RetrievedChunk {
  id: string;
  document_id: string;
  workspace_id: string;
  chunk_index: number;
  content: string;
  section_label: string | null;
  score: number;
  document_filename?: string;
}

export interface RetrievalDebugInfo {
  workspace_id: string;
  question: string;
  mode: "vector" | "hybrid";
  chunks: RetrievedChunk[];
  retrieval_hit: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  schema: Record<string, unknown>; // JSON schema passed to the LLM
  execute: (args: unknown, ctx: ToolExecutionContext) => Promise<unknown>;
  validate: (args: unknown) => { ok: true; data: unknown } | { ok: false; error: string };
}

export interface ToolExecutionContext {
  workspaceId: string;
  userId: string;
  messageId?: string;
}
