// Times on the My activity page are India time (IST), the same zone the server uses to decide which
// "day" something belongs to.
const TZ = 'Asia/Kolkata';

export function fmtTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-IN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

// '2026-11-02' -> 'Mon, 02 Nov 2026' (the key is already an India date, so no zone maths here)
export function fmtDay(key) {
  if (!key) return '';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

export function minutesText(min) {
  const m = Math.max(0, Math.round(min || 0));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many || `${one}s`}`;
