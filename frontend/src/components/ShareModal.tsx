import { useState } from "react";
import { createPortal } from "react-dom";
import { SearchMultiSelect } from "./SearchMultiSelect";

interface ShareModalProps {
  filename: string;
  options: { id: string; name: string }[];
  initiallySelected: string[];
  busy: boolean;
  onCancel: () => void;
  onSave: (selectedIds: string[]) => void;
}

export function ShareModal({ filename, options, initiallySelected, busy, onCancel, onSave }: ShareModalProps) {
  const [selected, setSelected] = useState<string[]>(initiallySelected);

  return createPortal(
    <div className="share-screen">
      <div className="share-screen-header">
        <div>
          <div className="share-screen-eyebrow">Sharing</div>
          <h2 className="share-screen-title">{filename}</h2>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
          Close
        </button>
      </div>

      <div className="share-screen-body">
        <p className="modal-subtitle">
          Search and select any workspaces that should be able to retrieve and cite this document. Remove a chip to
          revoke access.
        </p>

        {options.length === 0 ? (
          <div className="empty-hint">You don't have any other workspaces yet.</div>
        ) : (
          <SearchMultiSelect options={options} selected={selected} onChange={setSelected} />
        )}
      </div>

      <div className="share-screen-footer">
        <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => onSave(selected)} disabled={busy}>
          {busy ? "Saving..." : "Save sharing"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
