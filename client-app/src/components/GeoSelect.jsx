import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
  const [panelRect, setPanelRect] = useState(null); // {top, left, width} in viewport px, set right before/while open
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    // Checks BOTH rootRef (the trigger) and panelRef (the portaled panel
    // below) -- the panel lives outside rootRef's own DOM subtree once
    // portaled to document.body, so a click on an option would otherwise
    // look like an "outside" click and close the menu before its own
    // onClick ever ran.
    function handleClickOutside(e) {
      if (rootRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  // Portaled to document.body (rendered below) instead of positioned
  // relative to the trigger in place -- an ancestor with its own
  // backdrop-filter/filter/transform (e.g. the checkout page's `.card`,
  // which uses backdrop-filter for its frosted-glass look) creates a new
  // CSS stacking context, and anything absolutely-positioned inside it is
  // trapped in that same context no matter how high its own z-index is.
  // A LATER sibling outside that card (like the checkout page's "Pay"
  // button, right after the address card) then paints ON TOP of the
  // dropdown wherever the two visually overlap, silently eating clicks
  // meant for an option underneath -- looked like "can't select the
  // option, and it won't close" from the outside, when the option's own
  // onClick was simply never reached. Escaping to document.body sidesteps
  // every such ancestor entirely. Position is recomputed on open and kept
  // in sync with scroll/resize while open, since fixed-position coords no
  // longer follow the trigger automatically the way `position: absolute`
  // did.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    function updateRect() {
      const r = triggerRef.current.getBoundingClientRect();
      setPanelRect({ top: r.bottom + 6, left: r.left, width: r.width });
    }
    updateRect();
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const filtered = query ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : options;

  return (
    <div className="geo-select" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="geo-select-trigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={selected ? undefined : 'geo-select-placeholder'}>{selected ? selected.label : placeholder}</span>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ flex: 'none', opacity: 0.6 }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && panelRect && createPortal(
        <div
          ref={panelRef}
          className="geo-select-panel"
          style={{ position: 'fixed', top: panelRect.top, left: panelRect.left, width: panelRect.width }}
        >
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
        </div>,
        document.body
      )}
    </div>
  );
}
