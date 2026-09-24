import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Browser-native option menus cannot be styled consistently across
// platforms. This controlled select keeps the same value/onChange API
// while rendering an accessible, portaled panel that follows the global
// HuntsTAG accent theme.
export default function ThemedSelect({
  id,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  className = '',
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const [panelRect, setPanelRect] = useState(null);
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const selectedIndex = options.findIndex((option) => String(option.value) === String(value));
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    if (!open) return undefined;
    setHighlighted(selectedIndex >= 0 ? selectedIndex : 0);
    function handleOutside(event) {
      if (rootRef.current?.contains(event.target) || panelRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open, selectedIndex]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return undefined;
    function updatePosition() {
      const rect = triggerRef.current.getBoundingClientRect();
      const estimatedHeight = Math.min(options.length * 42 + 14, 286);
      const spaceBelow = window.innerHeight - rect.bottom;
      const placeAbove = spaceBelow < estimatedHeight + 12 && rect.top > estimatedHeight;
      setPanelRect({
        left: rect.left,
        width: rect.width,
        top: placeAbove ? rect.top - estimatedHeight - 6 : rect.bottom + 6,
      });
    }
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, options.length]);

  function choose(option) {
    onChange(option.value, option);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event) {
    if (disabled) return;
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((index) => Math.min(options.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((index) => Math.max(0, index - 1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setHighlighted(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setHighlighted(options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (options[highlighted]) choose(options[highlighted]);
    }
  }

  return (
    <div className={`theme-select${className ? ` ${className}` : ''}`} ref={rootRef}>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className={`theme-select-trigger${open ? ' open' : ''}`}
        onClick={() => !disabled && setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={!selected ? 'theme-select-placeholder' : undefined}>{selected?.label || placeholder}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
      </button>

      {open && panelRect && createPortal(
        <div
          ref={panelRef}
          className="theme-select-panel"
          role="listbox"
          aria-label={ariaLabel}
          style={{ position: 'fixed', left: panelRect.left, top: panelRect.top, width: panelRect.width }}
          onKeyDown={handleKeyDown}
        >
          {options.map((option, index) => {
            const isSelected = String(option.value) === String(value);
            return (
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`${isSelected ? 'selected' : ''}${highlighted === index ? ' highlighted' : ''}`}
                key={option.value}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => choose(option)}
              >
                <span>{option.label}</span>
                {isSelected && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
