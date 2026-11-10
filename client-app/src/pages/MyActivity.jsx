import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import ThemeDatePicker from '../components/ThemeDatePicker.jsx';
import { fmtDay, fmtTime, minutesText, plural } from '../lib/activityFormat.js';
import '../my-activity.css';

const REFRESH_MS = 15000;
// Today on this device, as YYYY-MM-DD (the latest day the date pickers allow).
function todayValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const endText = (s) => (s.endedAt ? (s.endReason === 'switched' ? 'switched account' : 'logged out') : s.active ? 'active now' : 'no logout');

// The person's own record of logins and what they did, by day -> session -> steps. It refreshes itself
// every 15 seconds and opens the session you are in right now.
export default function MyActivity() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [openDay, setOpenDay] = useState('');
  const [openSid, setOpenSid] = useState('');
  const [sessions, setSessions] = useState({}); // day -> sessions (with steps)
  const autoOpened = useRef(false);
  const view = useRef({}); // the latest values for the timer, so it never uses stale ones
  view.current = { from, to, page, openDay };

  const loadDay = useCallback(async (day) => {
    const r = await api.myActivityDay(day);
    setSessions((s) => ({ ...s, [day]: r.sessions }));
    return r.sessions;
  }, []);

  const load = useCallback(async ({ auto = false } = {}) => {
    try {
      const { from: f, to: t, page: p, openDay: od } = view.current;
      const r = await api.myActivity({ from: f, to: t, page: p });
      setData(r);
      setError('');
      if (od) loadDay(od).catch(() => {}); // keep the open day's steps current
      // First time on the newest page with no filter: open the session this very login is in.
      if (!auto && !autoOpened.current && p === 1 && !f && !t && r.currentSid) {
        autoOpened.current = true;
        const live = r.days.find((d) => d.activeNow);
        if (live) {
          const list = await loadDay(live.day);
          const mine = list.find((s) => s.current) || list.find((s) => s.active);
          setOpenDay(live.day);
          if (mine) setOpenSid(mine.sid);
        }
      }
    } catch (err) {
      // An old server that does not know this page yet answers "Not found": say that plainly.
      if (!auto) setError(err.message === 'Not found' ? 'My activity is not available right now. Please try again in a little while.' : err.message);
    }
  }, [loadDay]);

  useEffect(() => { setPage(1); }, [from, to]);
  useEffect(() => { load(); }, [load, from, to, page]);
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load({ auto: true }); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  async function toggleDay(day) {
    if (openDay === day) { setOpenDay(''); setOpenSid(''); return; }
    setOpenDay(day);
    setOpenSid('');
    try { await loadDay(day); } catch (err) { setError(err.message); }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const today = todayValue();

  return (
    <div className="myact">
      <div>
        <h1>My activity</h1>
        <p className="subtitle">Your logins and what you did while logged in. Times are India time. Passwords, OTPs and card or bank details are never recorded.</p>
      </div>

      <div className="myact-filters">
        <div className="field myact-date">
          <label htmlFor="myact-from">From</label>
          <ThemeDatePicker id="myact-from" value={from} onChange={setFrom} max={to || today} ariaLabel="From date" />
        </div>
        <div className="field myact-date">
          <label htmlFor="myact-to">To</label>
          <ThemeDatePicker id="myact-to" value={to} onChange={setTo} min={from || undefined} max={today} ariaLabel="To date" />
        </div>
        {(from || to) && <button type="button" className="secondary" onClick={() => { setFrom(''); setTo(''); }}>Clear dates</button>}
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}
      {!data && !error && <p className="subtitle">Loading…</p>}

      {data && data.days.length === 0 && (
        <div className="card myact-empty">{from || to ? 'No activity in these dates.' : 'No activity recorded yet. It will appear here after you log in and use your account.'}</div>
      )}

      <ul className="myact-days">
        {data?.days.map((d) => (
          <li key={d.day} className="myact-day">
            <button type="button" className="myact-toggle" aria-expanded={openDay === d.day} onClick={() => toggleDay(d.day)}>
              <span className="myact-chev" aria-hidden="true">{openDay === d.day ? '▾' : '▸'}</span>
              <span>
                <strong>{fmtDay(d.day)}</strong> {d.activeNow && <span className="myact-live">Active now</span>}
                <small>Logged in {plural(d.logins, 'time')}, logged out {d.logouts}, {d.things} {d.things === 1 ? 'thing' : 'things'} done, {minutesText(d.minutes)} online</small>
              </span>
            </button>
            {openDay === d.day && (
              <div className="myact-sessions">
                {!sessions[d.day] ? <p className="subtitle">Loading…</p> : sessions[d.day].map((s) => (
                  <div key={s.sid} className="myact-session">
                    <button type="button" className="myact-toggle" aria-expanded={openSid === s.sid} onClick={() => setOpenSid(openSid === s.sid ? '' : s.sid)}>
                      <span className="myact-chev" aria-hidden="true">{openSid === s.sid ? '▾' : '▸'}</span>
                      <span>
                        <strong>{fmtTime(s.startedAt)} → {s.endedAt ? fmtTime(s.endedAt) : s.active ? 'now' : fmtTime(s.lastActivityAt)}</strong>
                        {s.current && <> <span className="myact-live">This device</span></>}
                        <small>{s.platform === 'app' ? 'App' : 'Website'} · {minutesText(s.minutes)} · {plural(s.things, 'thing')} done · {endText(s)}</small>
                      </span>
                    </button>
                    {openSid === s.sid && (
                      <ol className="myact-steps">
                        {s.events.map((e, i) => (
                          <li key={i}>
                            <time>{fmtTime(e.at)}</time>
                            <div>
                              <span>{e.label}</span>
                              {e.changes.length > 0 && (
                                <ul className="myact-changes">
                                  {e.changes.map((c, k) => (
                                    <li key={k}>
                                      <span className="myact-field">{c.label}</span>
                                      <del className="myact-before">{c.before || '(empty)'}</del>
                                      <ins className="myact-after">{c.after || '(empty)'}</ins>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </li>
                        ))}
                        {s.trimmed && <li className="myact-note">Only the latest steps of a very long session are kept.</li>}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      {data && data.total > 0 && (
        <div className="myact-pager">
          <span>Days {(page - 1) * data.pageSize + 1}–{Math.min(page * data.pageSize, data.total)} of {data.total}</span>
          <div>
            <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span>Page {page} of {pages}</span>
            <button type="button" className="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
      )}
      <p className="myact-note">This page refreshes by itself every 15 seconds.</p>
    </div>
  );
}
