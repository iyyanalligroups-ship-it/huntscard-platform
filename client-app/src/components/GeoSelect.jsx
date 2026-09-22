import { useEffect, useRef, useState } from 'react';

// A themed dropdown for the address form's Country/State/City pickers
// (see MagicPosterCart.jsx) -- a plain <select>'s OPEN option list is
// rendered by the OS/browser and can't be fully restyled (see styles.css's
// own comment on that), which looks jarring against this app's dark theme
// -- especially for Country's 250-entry list, hence the search box.
// `options`: [{ value, label }]. `value`/`onChange` work like a normal
// controlled input, but onChange receives the whole matching option.
export default function GeoSelect({ value, options, onChange, placeholder = 'Select…', disabled, searchPlaceholder = 'Search…' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const filtered = query ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : options;

  return (
    <div className="geo-select" ref={rootRef}>
      <button
        type="button"
        className="geo-select-trigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={selected ? undefined : 'geo-select-placeholder'}>{selected ? selected.label : placeholder}</span>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ flex: 'none', opacity: 0.6 }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="geo-select-panel">
          <input
            type="text"
            autoFocus
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="geo-select-search"
          />
          <div className="geo-select-list">
            {filtered.length === 0 && <div className="geo-select-empty">No matches</div>}
            {filtered.map((o) => (
              <div
                key={o.value}
                className={`geo-select-option${o.value === value ? ' selected' : ''}`}
                onClick={() => {
                  onChange(o);
                  setOpen(false);
                }}
              >
                {o.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
