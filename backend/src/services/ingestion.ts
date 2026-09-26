import { createHash } from "node:crypto";
import { supabase } from "../db/client.js";
import { chunkText } from "./chunking.js";
import { embedBatch } from "./embeddings.js";
import { HttpError } from "../middleware/errorHandler.js";

interface IngestParams {
  workspaceId: string;
  filename: string;
  buffer: Buffer;
  mimeType: string;
}

interface IngestResult {
  documentId: string;
  filename: string;
  chunkCount: number;
  reused: boolean; // true when this exact file was already ingested (idempotent no-op)
}

async function extractText(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  if (mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    return result.text;
  }
  // Treat everything else (txt, md, etc.) as plain UTF-8 text.
  return buffer.toString("utf-8");
}

/**
 * Ingests a document into a workspace: hash -> idempotency check -> extract
 * -> chunk -> embed -> insert. Re-uploading identical bytes into the same
 * workspace is a no-op (returns the existing document, no duplicate chunks).
 */
export async function ingestDocument({ workspaceId, filename, buffer, mimeType }: IngestParams): Promise<IngestResult> {
  const contentHash = createHash("sha256").update(buffer).digest("hex");

  const { data: existing, error: lookupError } = await supabase
    .from("documents")
    .select("id, filename, chunk_count, status")
    .eq("workspace_id", workspaceId)
    .eq("content_hash", contentHash)
    .maybeSingle();

  if (lookupError) throw new HttpError(500, "Failed to check for existing document");

  // Only a successfully-ingested document counts as an idempotent no-op. A
  // row stuck in "processing" (crashed mid-run) or "failed" (e.g. a transient
  // embedding API error) must be retried, not treated as done forever.
  if (existing && existing.status === "ready") {
    return { documentId: existing.id, filename: existing.filename, chunkCount: existing.chunk_count, reused: true };
  }

  const text = await extractText(buffer, mimeType, filename);
  if (!text.trim()) {
    throw new HttpError(400, "Document appears to be empty or unreadable");
  }

  let doc: { id: string };

  if (existing) {
    // Retry path: reuse the existing row, clear any partial chunks from the
    // previous failed attempt before re-ingesting.
    await supabase.from("chunks").delete().eq("document_id", existing.id);
    const { error: updateError } = await supabase
      .from("documents")
      .update({ filename, status: "processing", chunk_count: 0 })
      .eq("id", existing.id);
    if (updateError) throw new HttpError(500, "Failed to reset document for retry");
    doc = { id: existing.id };
  } else {
    const { data: inserted, error: insertDocError } = await supabase
      .from("documents")
      .insert({ workspace_id: workspaceId, filename, content_hash: contentHash, status: "processing" })
      .select("id")
      .single();

    if (insertDocError || !inserted) {
      // Unique-constraint race: someone else started ingesting the same bytes concurrently.
      if (insertDocError?.code === "23505") {
        const { data: raceWinner } = await supabase
          .from("documents")
          .select("id, filename, chunk_count")
          .eq("workspace_id", workspaceId)
          .eq("content_hash", contentHash)
          .single();
        if (raceWinner) {
          return { documentId: raceWinner.id, filename: raceWinner.filename, chunkCount: raceWinner.chunk_count, reused: true };
        }
      }
      throw new HttpError(500, "Failed to create document record");
    }
    doc = inserted;
  }

  try {
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      throw new HttpError(400, "No extractable content in document");
    }

    const embeddings = await embedBatch(chunks.map((c) => c.content));

    const rows = chunks.map((chunk, i) => ({
      document_id: doc.id,
      workspace_id: workspaceId,
      chunk_index: chunk.index,
      content: chunk.content,
      section_label: chunk.sectionLabel,
      embedding: embeddings[i],
    }));

    const { error: chunkInsertError } = await supabase.from("chunks").insert(rows);
    if (chunkInsertError) throw new HttpError(500, "Failed to store document chunks");

    await supabase.from("documents").update({ status: "ready", chunk_count: rows.length }).eq("id", doc.id);

    return { documentId: doc.id, filename, chunkCount: rows.length, reused: false };
  } catch (err) {
    await supabase.from("documents").update({ status: "failed" }).eq("id", doc.id);
    throw err;
  }
}
