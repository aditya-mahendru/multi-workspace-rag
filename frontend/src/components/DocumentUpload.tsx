import { useEffect, useRef, useState } from "react";
import { apiGet, apiUpload } from "../lib/api";

interface Document {
  id: string;
  filename: string;
  status: string;
  chunk_count: number;
  created_at: string;
}

export function DocumentUpload({ workspaceId }: { workspaceId: string }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { documents: docs } = await apiGet<{ documents: Document[] }>(`/workspaces/${workspaceId}/documents`);
    setDocuments(docs);
  };

  useEffect(() => {
    load();
    setMessage(null);
  }, [workspaceId]);

  const onFileChange = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setMessage(null);
    try {
      for (const file of Array.from(files)) {
        const result = await apiUpload<{ reused: boolean; chunkCount: number; filename: string }>(
          `/workspaces/${workspaceId}/documents`,
          file,
        );
        setMessage(
          result.reused
            ? `${result.filename}: already ingested (idempotent skip)`
            : `${result.filename}: ${result.chunkCount} chunks ingested`,
        );
      }
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div>
      <h3 style={{ fontSize: 14, textTransform: "uppercase", color: "#666", marginBottom: 8 }}>Documents</h3>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.txt,.md"
        disabled={uploading}
        onChange={(e) => onFileChange(e.target.files)}
        style={{ marginBottom: 8 }}
      />
      {uploading && <div style={{ fontSize: 13, color: "#666" }}>Uploading...</div>}
      {message && <div style={{ fontSize: 13, color: "#2563eb", marginBottom: 8 }}>{message}</div>}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13 }}>
        {documents.map((doc) => (
          <li key={doc.id} style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}>
            <strong>{doc.filename}</strong>{" "}
            <span style={{ color: "#999" }}>
              ({doc.status}, {doc.chunk_count} chunks)
            </span>
          </li>
        ))}
        {documents.length === 0 && <li style={{ color: "#999" }}>No documents yet.</li>}
      </ul>
    </div>
  );
}
