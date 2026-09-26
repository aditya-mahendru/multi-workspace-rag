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
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
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
        setMessage({
          text: result.reused
            ? `${result.filename}: already ingested (idempotent skip)`
            : `${result.filename}: ${result.chunkCount} chunks ingested`,
        });
      }
      await load();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Upload failed", error: true });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <h3 className="panel-title">Documents</h3>

      <label className="upload-drop">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md"
          disabled={uploading}
          onChange={(e) => onFileChange(e.target.files)}
        />
        <div className="upload-drop-label">{uploading ? "Uploading..." : "Click to upload PDF / TXT / MD"}</div>
      </label>

      {message && <div className={`status-msg ${message.error ? "error" : ""}`}>{message.text}</div>}

      <ul className="doc-list">
        {documents.map((doc) => (
          <li key={doc.id} className="doc-item">
            <strong>{doc.filename}</strong>
            <span className="doc-meta">
              {doc.status} &middot; {doc.chunk_count} chunks
            </span>
          </li>
        ))}
        {documents.length === 0 && <li className="empty-hint">No documents yet.</li>}
      </ul>
    </div>
  );
}
