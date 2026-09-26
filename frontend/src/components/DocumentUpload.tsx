import { useEffect, useRef, useState } from "react";
import { apiDelete, apiGet, apiPost, apiUpload } from "../lib/api";
import { useWorkspace } from "../state/WorkspaceContext";
import { ShareModal } from "./ShareModal";

interface Document {
  id: string;
  filename: string;
  status: string;
  chunk_count: number;
  created_at: string;
  sharedFrom: string | null;
  sharedWith: { workspaceId: string; name: string }[];
}

export function DocumentUpload({ workspaceId }: { workspaceId: string }) {
  const { workspaces } = useWorkspace();
  const otherWorkspaces = workspaces.filter((w) => w.id !== workspaceId);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [shareModalDoc, setShareModalDoc] = useState<Document | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
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

  const onSaveShares = async (doc: Document, selectedIds: string[]) => {
    const currentIds = doc.sharedWith.map((s) => s.workspaceId);
    const toAdd = selectedIds.filter((id) => !currentIds.includes(id));
    const toRemove = currentIds.filter((id) => !selectedIds.includes(id));

    setShareBusy(true);
    try {
      await Promise.all([
        ...toAdd.map((targetWorkspaceId) =>
          apiPost(`/workspaces/${workspaceId}/share`, { documentId: doc.id, targetWorkspaceId }),
        ),
        ...toRemove.map((targetWorkspaceId) =>
          apiDelete(`/workspaces/${workspaceId}/share`, { documentId: doc.id, targetWorkspaceId }),
        ),
      ]);
      setMessage({ text: `Updated sharing for ${doc.filename}.` });
      setShareModalDoc(null);
      await load();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Failed to update sharing", error: true });
    } finally {
      setShareBusy(false);
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
          <li key={doc.id} className={`doc-item ${doc.sharedFrom ? "doc-item-shared" : ""}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div>
                <strong>{doc.filename}</strong>
                <span className="doc-meta">
                  {doc.status} &middot; {doc.chunk_count} chunks
                  {!doc.sharedFrom && doc.sharedWith.length > 0 && (
                    <> &middot; shared with {doc.sharedWith.length} workspace{doc.sharedWith.length > 1 ? "s" : ""}</>
                  )}
                </span>
                {doc.sharedFrom && <span className="shared-badge">Shared from {doc.sharedFrom}</span>}
              </div>
              {!doc.sharedFrom && otherWorkspaces.length > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={() => setShareModalDoc(doc)}>
                  Share
                </button>
              )}
            </div>
          </li>
        ))}
        {documents.length === 0 && <li className="empty-hint">No documents yet.</li>}
      </ul>

      {shareModalDoc && (
        <ShareModal
          filename={shareModalDoc.filename}
          options={otherWorkspaces.map((w) => ({ id: w.id, name: w.name }))}
          initiallySelected={shareModalDoc.sharedWith.map((s) => s.workspaceId)}
          busy={shareBusy}
          onCancel={() => setShareModalDoc(null)}
          onSave={(ids) => onSaveShares(shareModalDoc, ids)}
        />
      )}
    </div>
  );
}
