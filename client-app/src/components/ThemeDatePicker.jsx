import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatValue(value) {
  const date = parseDate(value);
  return date ? `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}` : '';
}

export default function ThemeDatePicker({ id, value, onChange, min, max, ariaLabel = 'Choose date' }) {
  const selectedDate = parseDate(value);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => selectedDate || new Date());
  const [panelRect, setPanelRect] = useState(null);
  // 'days' | 'months' | 'years' -- clicking the month or year in the header drills up so either
  // can be jumped to directly (essential for a date of birth) instead of paging month by month.
  const [mode, setMode] = useState('days');
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => { if (selectedDate) setViewDate(selectedDate); }, [value]);

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      if (rootRef.current?.contains(event.target) || panelRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return undefined;
    function updatePosition() {
      const rect = triggerRef.current.getBoundingClientRect();
      const panelHeight = 340;
      const panelWidth = Math.min(310, Math.max(270, rect.width));
      const placeAbove = window.innerHeight - rect.bottom < panelHeight + 12 && rect.top > panelHeight;
      setPanelRect({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - panelWidth - 12)),
        top: placeAbove ? Math.max(12, rect.top - panelHeight - 7) : rect.bottom + 7,
        width: panelWidth,
      });
    }
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstGridDate = new Date(year, month, 1 - new Date(year, month, 1).getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstGridDate);
    date.setDate(firstGridDate.getDate() + index);
    return date;
  });
  const minDate = parseDate(min);
  const maxDate = parseDate(max);
  const todayValue = toValue(new Date());

  const yearStart = Math.floor(year / 12) * 12; // the 12-year page shown in 'years' mode

  function changeMonth(delta) {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  // Header arrows step by month, year or 12-year page depending on the mode.
  function step(delta) {
    if (mode === 'days') changeMonth(delta);
    else setViewDate((current) => new Date(current.getFullYear() + delta * (mode === 'years' ? 12 : 1), current.getMonth(), 1));
  }

  // min/max can rule out whole months or years -- grey those out in the pickers.
  const monthOutOfRange = (y, m) =>
    Boolean((minDate && new Date(y, m + 1, 0) < minDate) || (maxDate && new Date(y, m, 1) > maxDate));
  const yearOutOfRange = (y) =>
    Boolean((minDate && new Date(y, 11, 31) < minDate) || (maxDate && new Date(y, 0, 1) > maxDate));

  function toggleOpen() {
    setMode('days');
    setOpen((current) => !current);
  }

  function selectDate(date) {
    onChange(toValue(date));
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="theme-date-picker" ref={rootRef}>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className={`theme-date-trigger${open ? ' open' : ''}`}
        onClick={toggleOpen}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarDays size={18} />
        <span className={value ? '' : 'placeholder'}>{value ? formatValue(value) : 'dd-mm-yyyy'}</span>
        <ChevronDown size={16} className="theme-date-chevron" />
      </button>

      {open && panelRect && createPortal(
        <div ref={panelRef} className="theme-date-panel" role="dialog" aria-label={`${ariaLabel} calendar`} style={{ position: 'fixed', left: panelRect.left, top: panelRect.top, width: panelRect.width }}>
          <div className="theme-date-header">
            <button type="button" aria-label={mode === 'days' ? 'Previous month' : mode === 'months' ? 'Previous year' : 'Previous years'} onClick={() => step(-1)}><ChevronLeft size={17} /></button>
            {mode === 'days' ? (
              <span className="theme-date-title">
                <button type="button" onClick={() => setMode('months')}>{viewDate.toLocaleDateString(undefined, { month: 'long' })}</button>
                <button type="button" onClick={() => setMode('years')}>{year}</button>
              </span>
            ) : (
              <span className="theme-date-title">
                <button type="button" onClick={() => setMode(mode === 'months' ? 'years' : 'days')}>
                  {mode === 'months' ? year : `${yearStart} – ${yearStart + 11}`}
                </button>
              </span>
            )}
            <button type="button" aria-label={mode === 'days' ? 'Next month' : mode === 'months' ? 'Next year' : 'Next years'} onClick={() => step(1)}><ChevronRight size={17} /></button>
          </div>
          {mode === 'months' && (
            <div className="theme-date-grid theme-date-grid--picker">
              {MONTHS.map((name, index) => (
                <button
                  key={name}
                  type="button"
                  className={index === month ? 'selected' : ''}
                  disabled={monthOutOfRange(year, index)}
                  onClick={() => { setViewDate(new Date(year, index, 1)); setMode('days'); }}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          {mode === 'years' && (
            <div className="theme-date-grid theme-date-grid--picker">
              {Array.from({ length: 12 }, (_, i) => yearStart + i).map((y) => (
                <button
                  key={y}
                  type="button"
                  className={y === year ? 'selected' : ''}
                  disabled={yearOutOfRange(y)}
                  onClick={() => { setViewDate(new Date(y, month, 1)); setMode('months'); }}
                >
                  {y}
                </button>
              ))}
            </div>
          )}
          {mode === 'days' && <div className="theme-date-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>}
          {mode === 'days' && <div className="theme-date-grid">
            {days.map((date) => {
              const dateValue = toValue(date);
              const disabled = (minDate && date < minDate) || (maxDate && date > maxDate);
              const className = [date.getMonth() !== month ? 'outside' : '', dateValue === todayValue ? 'today' : '', dateValue === value ? 'selected' : ''].filter(Boolean).join(' ');
              return (
                <button key={dateValue} type="button" className={className} disabled={disabled} aria-pressed={dateValue === value} onClick={() => selectDate(date)}>
                  {date.getDate()}
                </button>
              );
            })}
          </div>}
          <div className="theme-date-footer">
            <button type="button" onClick={() => { setViewDate(new Date()); setMode('days'); }}>This month</button>
            {value && <button type="button" onClick={() => { onChange(''); setOpen(false); }}>Clear</button>}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
