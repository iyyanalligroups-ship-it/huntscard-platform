import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

// Requests to meet -- sent from someone's own Contacts list (see
// Contacts.jsx's arrow-icon button), in-app if the recipient already has
// a Huntstag account, an SMS invite otherwise (see routes/appointments.js
// for the claim-on-register flow that links an SMS invite to an account
// the moment the recipient signs up).
const STATUS_LABEL = { pending: 'Pending', accepted: 'Accepted', declined: 'Declined' };
const STATUS_COLOR = { pending: 'var(--holo-cyan)', accepted: '#22c58b', declined: 'var(--danger)' };

// Local (not UTC) YYYY-MM-DD -- this keys both the calendar's day cells
// and each appointment's proposedAt, so "Aug 10" means the same thing in
// both places regardless of what timezone offset a raw ISO string carries.
function dateKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // back to Sunday
  return d;
}

function formatTimeLabel(minutesFromMidnight) {
  const h24 = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

const INTERVAL_OPTIONS = [15, 30, 60];
const DEFAULT_WINDOW_START_HOUR = 9;
const DEFAULT_WINDOW_END_HOUR = 18;

// A week-view time grid -- time slots down the side, days across the
// top, each booked slot shown as a colored block -- rather than the
// plain "which days have something on them" dot-calendar this replaced.
// No external calendar library (this app has none to share one with);
// the time window auto-expands beyond the default 9-6 business hours if
// an actual appointment in the visible week falls outside it, so nothing
// this week is ever silently off-grid.
function WeekScheduleGrid({ weekStart, onWeekChange, appointments, intervalMinutes, onIntervalChange, selectedDay, onSelectDay, onSelectAppointment }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const weekKeys = new Set(days.map(dateKey));
  const todayKey = dateKey(new Date());

  // Pass 1: figure out the actual window for this week -- default
  // business hours, expanded to cover any appointment that falls
  // outside them so nothing this week is ever silently off-grid.
  let windowStart = DEFAULT_WINDOW_START_HOUR * 60;
  let windowEnd = DEFAULT_WINDOW_END_HOUR * 60;
  const weekAppointments = appointments.filter((a) => a.proposedAt && weekKeys.has(dateKey(new Date(a.proposedAt))));
  for (const a of weekAppointments) {
    const mins = new Date(a.proposedAt).getHours() * 60 + new Date(a.proposedAt).getMinutes();
    windowStart = Math.min(windowStart, Math.floor(mins / 60) * 60);
    windowEnd = Math.max(windowEnd, Math.ceil((mins + 1) / 60) * 60);
  }

  // Pass 2: bucket into slots now that the window is final.
  const byDaySlot = new Map(); // `${dayKey}|${slotStartMinutes}` -> appointments[]
  for (const a of weekAppointments) {
    const d = new Date(a.proposedAt);
    const mins = d.getHours() * 60 + d.getMinutes();
    const slotStart = windowStart + Math.floor((mins - windowStart) / intervalMinutes) * intervalMinutes;
    const cellKey = `${dateKey(d)}|${slotStart}`;
    if (!byDaySlot.has(cellKey)) byDaySlot.set(cellKey, []);
    byDaySlot.get(cellKey).push(a);
  }

  const slots = [];
  for (let m = windowStart; m < windowEnd; m += intervalMinutes) slots.push(m);

  return (
    <div className="card" style={{ marginBottom: 20, overflowX: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="secondary"
            style={{ width: 32, height: 32, padding: 0 }}
            onClick={() => onWeekChange(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - 7))}
            aria-label="Previous week"
          >
            ‹
          </button>
          <strong style={{ fontSize: 14, whiteSpace: 'nowrap' }}>
            {days[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} –{' '}
            {days[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </strong>
          <button
            type="button"
            className="secondary"
            style={{ width: 32, height: 32, padding: 0 }}
            onClick={() => onWeekChange(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7))}
            aria-label="Next week"
          >
            ›
          </button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>
          Interval
          <select value={intervalMinutes} onChange={(e) => onIntervalChange(Number(e.target.value))} style={{ width: 'auto', padding: '4px 8px' }}>
            {INTERVAL_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ minWidth: 640 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '64px repeat(7, 1fr)', gap: 1 }}>
          <div />
          {days.map((d) => {
            const key = dateKey(d);
            const isToday = key === todayKey;
            const isSelected = key === selectedDay;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectDay(isSelected ? null : key)}
                style={{
                  width: '100%',
                  padding: '6px 4px',
                  background: isSelected ? 'var(--holo-gradient)' : 'transparent',
                  border: 'none',
                  borderBottom: isToday && !isSelected ? '2px solid var(--holo-cyan)' : '2px solid transparent',
                  color: isSelected ? '#06120f' : 'var(--text)',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.8 }}>
                  {d.toLocaleDateString(undefined, { weekday: 'short' })}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{d.getDate()}</div>
              </button>
            );
          })}
        </div>

        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {slots.map((slotStart) => (
            <div
              key={slotStart}
              style={{ display: 'grid', gridTemplateColumns: '64px repeat(7, 1fr)', gap: 1, borderTop: '1px solid var(--panel-border)' }}
            >
              <div style={{ fontSize: 10, color: 'var(--text-dim)', padding: '6px 4px', whiteSpace: 'nowrap' }}>{formatTimeLabel(slotStart)}</div>
              {days.map((d) => {
                const key = dateKey(d);
                const cellItems = byDaySlot.get(`${key}|${slotStart}`) || [];
                return (
                  <div key={key} style={{ minHeight: 32, padding: 2 }}>
                    {cellItems.map((a) => (
                      <button
                        type="button"
                        key={a._id}
                        onClick={() => onSelectAppointment(a)}
                        title={`${a.fromName || a.toName} — ${STATUS_LABEL[a.status]}`}
                        style={{
                          width: '100%',
                          display: 'block',
                          background: STATUS_COLOR[a.status],
                          color: a.status === 'pending' ? '#06120f' : '#fff',
                          border: 'none',
                          borderRadius: 5,
                          padding: '3px 6px',
                          fontSize: 10,
                          fontWeight: 700,
                          textAlign: 'left',
                          marginBottom: 2,
                          cursor: 'pointer',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {a.fromName || a.toName}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {selectedDay && (
        <button type="button" className="secondary" style={{ width: 'auto', marginTop: 12, fontSize: 12, padding: '5px 12px' }} onClick={() => onSelectDay(null)}>
          Clear date filter
        </button>
      )}
    </div>
  );
}

export default function Appointments() {
  const [tab, setTab] = useState('received'); // 'received' | 'sent'
  const [received, setReceived] = useState([]);
  const [sent, setSent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [respondingId, setRespondingId] = useState(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [selectedDay, setSelectedDay] = useState(null); // YYYY-MM-DD or null

  // Profile preview popup -- opened by clicking a name, only when that
  // side of the request actually has a real Huntstag account attached
  // (always true for a request's sender; only true for a request's
  // recipient once they've registered/claimed it, see toClientId).
  const [previewClientId, setPreviewClientId] = useState(null);
  const [previewProfile, setPreviewProfile] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  function load() {
    return Promise.all([api.getReceivedAppointments(), api.getSentAppointments()])
      .then(([r, s]) => {
        setReceived(r);
        setSent(s);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!previewClientId) return;
    setPreviewLoading(true);
    setPreviewError('');
    setPreviewProfile(null);
    api
      .getPublicProfile(previewClientId)
      .then(setPreviewProfile)
      .catch((err) => setPreviewError(err.message))
      .finally(() => setPreviewLoading(false));
  }, [previewClientId]);

  async function handleRespond(id, status) {
    setRespondingId(id);
    setError('');
    try {
      await api.respondToAppointment(id, status);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRespondingId(null);
    }
  }

  // Combined for the grid -- "what's on my plate" spans both directions,
  // not scoped to whichever tab is active below. Tagged with __dir so a
  // clicked block knows whether fromClientId or toClientId is the real
  // "other person" to preview.
  const combinedForGrid = useMemo(
    () => [
      ...received.map((r) => ({ ...r, __dir: 'received' })),
      ...sent.map((r) => ({ ...r, __dir: 'sent' })),
    ],
    [received, sent]
  );

  function handleSelectAppointment(a) {
    const clickableClientId = a.__dir === 'received' ? a.fromClientId : a.toClientId;
    if (clickableClientId) {
      setPreviewClientId(clickableClientId);
    } else if (a.proposedAt) {
      setSelectedDay(dateKey(new Date(a.proposedAt)));
    }
  }

  const pendingCount = received.filter((r) => r.status === 'pending').length;
  const baseList = tab === 'received' ? received : sent;
  const list = selectedDay ? baseList.filter((r) => r.proposedAt && dateKey(new Date(r.proposedAt)) === selectedDay) : baseList;

  return (
    <div>
      <h1 className="page-title">Appointment Requests</h1>
      <p className="subtitle">
        Requests to meet, sent from someone's Contacts list -- accept or decline the ones sent to you, or track
        the ones you've sent out.
      </p>

      <WeekScheduleGrid
        weekStart={weekStart}
        onWeekChange={setWeekStart}
        appointments={combinedForGrid}
        intervalMinutes={intervalMinutes}
        onIntervalChange={setIntervalMinutes}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        onSelectAppointment={handleSelectAppointment}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setTab('received')}
          className={tab === 'received' ? undefined : 'secondary'}
          style={{ width: 'auto', padding: '8px 16px' }}
        >
          Received {pendingCount > 0 && `(${pendingCount})`}
        </button>
        <button
          type="button"
          onClick={() => setTab('sent')}
          className={tab === 'sent' ? undefined : 'secondary'}
          style={{ width: 'auto', padding: '8px 16px' }}
        >
          Sent
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : list.length === 0 ? (
        <p className="subtitle">
          {selectedDay
            ? 'Nothing on this day.'
            : tab === 'received'
              ? 'No appointment requests yet.'
              : "You haven't sent any appointment requests yet -- try the arrow icon on a contact."}
        </p>
      ) : (
        <div className="contact-list">
          {list.map((r) => {
            const name = tab === 'received' ? r.fromName : r.toName;
            // A received request's sender is always a real account (you
            // can't send one while logged out); a sent request's
            // recipient only has one once toClientId is set.
            const clickableClientId = tab === 'received' ? r.fromClientId : r.toClientId;
            return (
              <div className="contact-row" key={r._id}>
                <div className="contact-row-avatar">
                  {tab === 'received' && r.fromPhotoUrl ? (
                    <img src={r.fromPhotoUrl} alt="" />
                  ) : (
                    name?.charAt(0).toUpperCase() || '?'
                  )}
                </div>
                <div className="contact-row-info">
                  <div className="contact-row-name">
                    {clickableClientId ? (
                      <button
                        type="button"
                        onClick={() => setPreviewClientId(clickableClientId)}
                        style={{
                          width: 'auto',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: 'inherit',
                          font: 'inherit',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          textUnderlineOffset: 3,
                        }}
                      >
                        {name}
                      </button>
                    ) : (
                      name
                    )}
                  </div>
                  <div className="contact-row-meta">
                    {tab === 'sent' && r.toPhone}
                    {tab === 'sent' && r.invitedViaSms && !r.toClientId && (
                      <span style={{ marginLeft: 8, color: 'var(--text-dim)' }}>· Invited via SMS, not on HuntsTAG yet</span>
                    )}
                    {r.proposedAt && (
                      <span style={{ display: 'block', marginTop: 2, color: 'var(--holo-cyan)', fontWeight: 600 }}>
                        {new Date(r.proposedAt).toLocaleString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                    {r.note && <span style={{ display: 'block', marginTop: 2 }}>"{r.note}"</span>}
                  </div>
                </div>
                {tab === 'received' && r.status === 'pending' ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      style={{ width: 'auto' }}
                      disabled={respondingId === r._id}
                      onClick={() => handleRespond(r._id, 'accepted')}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      style={{ width: 'auto' }}
                      disabled={respondingId === r._id}
                      onClick={() => handleRespond(r._id, 'declined')}
                    >
                      Decline
                    </button>
                  </div>
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[r.status] }}>{STATUS_LABEL[r.status]}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {previewClientId && (
        <div className="auth-modal-backdrop" onClick={(e) => e.target === e.currentTarget && setPreviewClientId(null)}>
          <div className="auth-modal-card">
            <button className="auth-modal-close" onClick={() => setPreviewClientId(null)} aria-label="Close">
              ×
            </button>
            {previewLoading ? (
              <p className="subtitle">Loading…</p>
            ) : previewError ? (
              <div className="error-banner">{previewError}</div>
            ) : previewProfile ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      overflow: 'hidden',
                      flexShrink: 0,
                      background: 'var(--holo-gradient)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 20,
                      fontWeight: 700,
                      color: '#06120f',
                    }}
                  >
                    {previewProfile.photoUrl ? (
                      <img src={previewProfile.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      (previewProfile.fullName || '?').charAt(0).toUpperCase()
                    )}
                  </div>
                  <div>
                    <h1 style={{ fontSize: 18, margin: 0 }}>{previewProfile.fullName}</h1>
                    {previewProfile.jobTitle && <p className="subtitle" style={{ margin: 0 }}>{previewProfile.jobTitle}</p>}
                  </div>
                </div>
                {previewProfile.bio && <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>{previewProfile.bio}</p>}
                <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
                  {previewProfile.phone && (
                    <a href={`tel:${previewProfile.phone}`} className="contact-row" style={{ textDecoration: 'none', color: 'var(--text)' }}>
                      ☎ {previewProfile.phone}
                    </a>
                  )}
                  {previewProfile.publicEmail && (
                    <a href={`mailto:${previewProfile.publicEmail}`} className="contact-row" style={{ textDecoration: 'none', color: 'var(--text)' }}>
                      ✉ {previewProfile.publicEmail}
                    </a>
                  )}
                </div>
                <Link to={`/c/${previewClientId}`} target="_blank" rel="noopener noreferrer">
                  <button type="button">View full profile</button>
                </Link>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
