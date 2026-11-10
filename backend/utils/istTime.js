// India time (IST, UTC+05:30, no daylight saving) for every "day" in the activity logs and backups.
// One place, so listing, grouping, deleting and backing up a day always mean the same 24 hours.
const OFFSET_MIN = 330;
const OFFSET_MS = OFFSET_MIN * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function isDayKey(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// 'YYYY-MM-DD' of an instant, as seen in India.
function dayKey(date) {
  return new Date(new Date(date).getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

function todayKey(now = new Date()) {
  return dayKey(now);
}

// The instant India's day starts (inclusive) and the next day starts (exclusive).
function dayStart(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - OFFSET_MS);
}
function dayEnd(key) {
  return new Date(dayStart(key).getTime() + DAY_MS);
}

function addDays(key, n) {
  return dayKey(new Date(dayStart(key).getTime() + n * DAY_MS + 60 * 1000));
}

// ['2026-11-01', ..., '2026-11-03'] (empty when from is after to)
function daysBetween(from, to) {
  const out = [];
  for (let k = from; k <= to && out.length < 4000; k = addDays(k, 1)) out.push(k);
  return out;
}

// 'HH:MM' (India) of an instant
function clock(date) {
  return new Date(new Date(date).getTime() + OFFSET_MS).toISOString().slice(11, 16);
}

module.exports = { OFFSET_MIN, OFFSET_MS, DAY_MS, isDayKey, dayKey, todayKey, dayStart, dayEnd, addDays, daysBetween, clock };
