import { useState } from "react";

interface ShareModalProps {
  filename: string;
  options: { id: string; name: string }[];
  initiallySelected: string[];
  busy: boolean;
  onCancel: () => void;
  onSave: (selectedIds: string[]) => void;
}

export function ShareModal({ filename, options, initiallySelected, busy, onCancel, onSave }: ShareModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initiallySelected));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="glass-strong modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Share "{filename}"</h3>
        <p className="modal-subtitle">Choose which workspaces can retrieve and cite this document.</p>

        <div className="modal-options">
          {options.length === 0 && <div className="empty-hint">You don't have any other workspaces yet.</div>}
          {options.map((opt) => (
            <label key={opt.id} className="modal-option">
              <input type="checkbox" checked={selected.has(opt.id)} onChange={() => toggle(opt.id)} />
              {opt.name}
            </label>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => onSave([...selected])} disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
