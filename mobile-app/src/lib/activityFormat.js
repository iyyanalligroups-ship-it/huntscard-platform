// Formatting for the My activity screen. Everything is India time (IST, UTC+05:30, no daylight saving),
// the same zone the server uses to decide which "day" something belongs to. Done by hand, not with Intl,
// so it looks the same on every phone.
const OFFSET_MS = 330 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n) => String(n).padStart(2, '0');

// '10:00:00 am'
export function fmtTime(value) {
  if (!value) return '—';
  const d = new Date(new Date(value).getTime() + OFFSET_MS);
  const h = d.getUTCHours();
  return `${pad(h % 12 || 12)}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${h >= 12 ? 'pm' : 'am'}`;
}

// '2026-11-02' (already an India date) -> 'Mon, 02 Nov 2026'
export function fmtDay(key) {
  if (!key) return '';
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[dt.getUTCDay()]}, ${pad(d)} ${MONTHS[m - 1]} ${y}`;
}

export function minutesText(min) {
  const m = Math.max(0, Math.round(min || 0));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many || `${one}s`}`;

// A Date picked on the phone -> 'YYYY-MM-DD' for the server (the person's own calendar date).
export function dayKeyOf(date) {
  return date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : '';
}
