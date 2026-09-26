import { env } from "../config/env.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
// Must match the `vector(768)` column in the chunks table migration.
const EMBEDDING_DIMENSIONS = 768;

interface EmbedContentResponse {
  embedding: { values: number[] };
}

interface BatchEmbedResponse {
  embeddings: { values: number[] }[];
}

async function geminiFetch(path: string, body: unknown): Promise<Response> {
  const res = await fetch(`${GEMINI_BASE}${path}?key=${env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini embeddings request failed (${res.status}): ${text}`);
  }
  return res;
}

/** Embeds a single query string (e.g. a chat question). */
export async function embedText(text: string): Promise<number[]> {
  const model = `models/${env.GEMINI_EMBEDDING_MODEL}`;
  const res = await geminiFetch(`/${model}:embedContent`, {
    model,
    content: { parts: [{ text }] },
    outputDimensionality: EMBEDDING_DIMENSIONS,
  });
  const data = (await res.json()) as EmbedContentResponse;
  return data.embedding.values;
}

/** Embeds many chunks in one batched call (used during ingestion). */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const model = `models/${env.GEMINI_EMBEDDING_MODEL}`;
  const BATCH_SIZE = 20;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice = texts.slice(i, i + BATCH_SIZE);
    const res = await geminiFetch(`/${model}:batchEmbedContents`, {
      requests: slice.map((text) => ({
        model,
        content: { parts: [{ text }] },
        outputDimensionality: EMBEDDING_DIMENSIONS,
      })),
    });
    const data = (await res.json()) as BatchEmbedResponse;
    results.push(...data.embeddings.map((e) => e.values));
  }

  return results;
}
