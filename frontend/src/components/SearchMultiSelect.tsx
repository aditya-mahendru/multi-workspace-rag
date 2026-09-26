import { useEffect, useRef, useState } from "react";

interface Option {
  id: string;
  name: string;
}

interface SearchMultiSelectProps {
  options: Option[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}

/** A searchable, chip-based multiselect: type to filter, click to add, click the chip's × to remove. */
export function SearchMultiSelect({ options, selected, onChange, placeholder }: SearchMultiSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const selectedOptions = options.filter((o) => selected.includes(o.id));
  const filtered = options.filter((o) => !selected.includes(o.id) && o.name.toLowerCase().includes(query.toLowerCase()));

  const add = (id: string) => {
    onChange([...selected, id]);
    setQuery("");
  };

  const remove = (id: string) => {
    onChange(selected.filter((s) => s !== id));
  };

  return (
    <div className="ms-container" ref={containerRef}>
      {selectedOptions.length > 0 && (
        <div className="ms-chips">
          {selectedOptions.map((o) => (
            <span key={o.id} className="ms-chip">
              {o.name}
              <button type="button" className="ms-chip-remove" onClick={() => remove(o.id)} aria-label={`Remove ${o.name}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="input"
        style={{ width: "100%" }}
        value={query}
        placeholder={placeholder ?? "Search workspaces..."}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <div className="ms-dropdown">
          {filtered.length === 0 ? (
            <div className="ms-empty">{options.length === selected.length ? "All workspaces selected" : "No matches"}</div>
          ) : (
            filtered.map((o) => (
              <button type="button" key={o.id} className="ms-option" onClick={() => add(o.id)}>
                {o.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
