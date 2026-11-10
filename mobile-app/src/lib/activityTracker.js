// Mobile activity tracker. While a person is logged in (never an admin viewing as them), it notes the screens
// they open, the buttons and tabs they tap, and leaving / returning to the app, and sends them in small
// batches to POST /api/profile/activity-events, where they join the session of this login (see My Activity).
//
// It records only the NAMES of screens and buttons -- never anything typed into a field. The server cleans
// every batch again (40 per call, short labels, no e-mail addresses or long numbers).
// It never throws and never blocks the app: every failure is swallowed.
import { AppState } from 'react-native';
import { API_URL, readSession, refreshSession } from '../api/client.js';

const FLUSH_MS = 4000; // batch window
const BATCH = 40; // the server keeps at most 40 per call
const MAX_QUEUE = 200;
const SAME_STEP_MS = 3000; // a double tap is one step

let token = null;
let queue = [];
let flushTimer = null;
let upgradeTried = false;
let away = false;
const lastSeen = new Map(); // label -> time
const deps = { fetch: (...args) => fetch(...args) }; // replaced in tests

export function _setDeps(next) { Object.assign(deps, next); }
export function _reset() {
  token = null;
  queue = [];
  upgradeTried = false;
  away = false;
  lastSeen.clear();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
}
export const _queued = () => queue.map((e) => ({ ...e }));

// ---- reading the login token (no checking; the server does that) ----
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64Decode(input) {
  const s = input.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  let out = '';
  for (const ch of s) {
    const i = B64.indexOf(ch);
    if (i < 0) continue;
    value = (value << 6) | i;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((value >> bits) & 0xff);
    }
  }
  return decodeURIComponent(out.split('').map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
}

function claims() {
  try {
    return token ? JSON.parse(base64Decode(token.split('.')[1])) : null;
  } catch {
    return null;
  }
}

function tracking() {
  const c = claims();
  return !!c && !c.impersonatedBy;
}

// A login made before sessions existed has no session id: swap its token once for one that has it.
function upgradeOldLogin() {
  const c = claims();
  if (!c || c.sid || c.impersonatedBy || upgradeTried) return;
  upgradeTried = true;
  Promise.resolve(refreshSession())
    .then((ok) => (ok ? readSession() : null))
    .then((s) => { if (s && s.token) token = s.token; })
    .catch(() => {});
}

// The app tells the tracker who is logged in (see AuthContext).
export function setActivityToken(next) {
  token = next || null;
  upgradeTried = false;
  if (!token) { queue = []; return; }
  upgradeOldLogin();
}

// ---- sending ----
function schedule() {
  if (!flushTimer) {
    flushTimer = setTimeout(() => { flushTimer = null; sendBatch(); }, FLUSH_MS);
  }
}

function retryLater(batch) {
  queue = batch.concat(queue).slice(0, MAX_QUEUE);
  schedule();
}

async function sendBatch() {
  try {
    if (!queue.length) return;
    const c = claims();
    if (!token || !c || c.impersonatedBy) { queue = []; return; } // logged out: nothing to send
    if (!c.sid) { upgradeOldLogin(); schedule(); return; } // wait for the upgraded token
    const batch = queue.splice(0, BATCH);
    try {
      const res = await deps.fetch(`${API_URL}/api/profile/activity-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Client-Platform': 'app' },
        body: JSON.stringify({ events: batch }),
      });
      if (res.status >= 500) retryLater(batch); // the server had a problem: try again; other failures are dropped
    } catch {
      retryLater(batch); // offline or unreachable: try again
    }
    if (queue.length) schedule();
  } catch { /* the tracker never breaks the app */ }
}

// Sends what is waiting now (before signing out, or when the app goes to the background). Resolves when it
// has been sent, or after timeoutMs, whichever is first, so it can never hold the app up.
export function flushActivity({ timeoutMs = 1500 } = {}) {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs); });
  return Promise.race([sendBatch(), timeout]).finally(() => clearTimeout(timer));
}

// ---- recording ----
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const short = (s, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function record(label, page, repeatMs = SAME_STEP_MS) {
  try {
    if (!label || !tracking()) return;
    const now = Date.now();
    const last = lastSeen.get(label);
    if (last !== undefined && now - last < repeatMs) return;
    lastSeen.set(label, now);
    if (lastSeen.size > 500) lastSeen.clear();
    queue.push({ at: now, label, page: page || '/app' });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    upgradeOldLogin();
    schedule();
  } catch { /* ignore */ }
}

const slug = (name) => `/screen/${clean(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

export function recordScreen(name) {
  const n = clean(name);
  if (n) record(`Opened screen: ${short(n)}`, slug(n), 1000);
}

// label: the button's title (or an icon's name). Never anything the person typed.
export function recordTap(label) {
  const n = clean(typeof label === 'string' ? label : '');
  if (n) record(`Tapped "${short(n)}"`, undefined);
}

// ---- leaving and returning ----
let subscription = null;
// Starts listening to the app going to the background and coming back (once). Returns a stop function.
export function startActivityTracking() {
  if (subscription) return () => {};
  subscription = AppState.addEventListener('change', (state) => {
    try {
      if (state === 'background' || state === 'inactive') {
        if (!away) { away = true; record('Left the app', undefined, 1000); }
        flushActivity({ timeoutMs: 1000 }); // the app may be closed next: send now
      } else if (state === 'active' && away) {
        away = false;
        record('Came back to the app', undefined, 1000);
      }
    } catch { /* ignore */ }
  });
  return () => { subscription?.remove?.(); subscription = null; };
}
