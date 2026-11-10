// Website activity tracker. While a person is logged in (never an admin viewing as them), it notes what they
// do in the browser -- pages opened, buttons and links clicked, downloads and prints, searches, choices made,
// fields edited, leaving and returning to the tab -- and sends it in small batches to
// POST /api/profile/activity-events, where it joins the session of this login (see My Activity).
//
// What is NEVER sent:
//   - the value typed into any field except a search box (other fields only say "Edited <field name>")
//   - anything from a password, one-time-code, card, bank or ID-number field (not even that it was edited)
//   - anything inside an element marked data-no-track (or any element below it)
// The server cleans the batches again (40 per call, short labels, no e-mail addresses or long numbers).
//
// It never throws and never blocks the page: every failure is swallowed.
import { API_URL, getClientToken, refreshSession } from './api.js';

const FLUSH_MS = 4000; // batch window
const BATCH = 40; // the server keeps at most 40 per call
const MAX_QUEUE = 200;
const SAME_STEP_MS = 3000; // a double click is one step
const FIELD_REPEAT_MS = 30000; // "Edited X" at most this often per field
const SEARCH_PAUSE_MS = 1200; // a search is recorded once typing pauses

let queue = [];
let flushTimer = 0;
let started = false;
let upgradeTried = false;
const lastSeen = new Map(); // label -> time, for the repeat rules

// ---- who is logged in ----
function claims() {
  try {
    const token = getClientToken();
    if (!token) return null;
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

// Tracking applies to a real client login only, never an admin viewing as the person.
function tracking() {
  const c = claims();
  return !!c && !c.impersonatedBy;
}

// A login made before sessions existed has no session id: swap its token once for one that has it.
function upgradeOldLogin() {
  const c = claims();
  if (!c || c.sid || c.impersonatedBy || upgradeTried) return;
  upgradeTried = true;
  refreshSession().catch(() => {});
}

// ---- sending ----
function schedule() {
  if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
}

function flush() {
  flushTimer = 0;
  try {
    if (!queue.length) return;
    const token = getClientToken();
    const c = claims();
    if (!token || !c || c.impersonatedBy) { queue = []; return; } // logged out: nothing to send
    if (!c.sid) { upgradeOldLogin(); schedule(); return; } // wait for the upgraded token
    const batch = queue.splice(0, BATCH);
    fetch(`${API_URL}/api/profile/activity-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ events: batch }),
      keepalive: true, // still sent while the page is closing
    }).then((res) => {
      if (res.status >= 500) retryLater(batch); // the server had a problem: try again; other failures are dropped
    }).catch(() => retryLater(batch)); // offline or unreachable: try again
    if (queue.length) schedule();
  } catch { /* the tracker never breaks the page */ }
}

// Puts a batch back at the front of the queue and tries again after the next window.
function retryLater(batch) {
  queue = batch.concat(queue).slice(0, MAX_QUEUE);
  schedule();
}

// ---- recording ----
function currentPath() {
  return window.location.pathname;
}

function record(label, { page, repeatMs = SAME_STEP_MS } = {}) {
  try {
    if (!label || !tracking()) return;
    const now = Date.now();
    const last = lastSeen.get(label);
    if (last !== undefined && now - last < repeatMs) return;
    lastSeen.set(label, now);
    if (lastSeen.size > 500) lastSeen.clear();
    queue.push({ at: now, label, page: page || currentPath() });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    upgradeOldLogin();
    schedule();
  } catch { /* ignore */ }
}

const PAGE_NAMES = {
  '/': 'Home', '/dashboard': 'Dashboard', '/dashboard/profile': 'Profile', '/dashboard/settings': 'Profile Settings',
  '/dashboard/contacts': 'Contacts', '/dashboard/appointments': 'Appointment Requests', '/dashboard/activity': 'My Activity',
  '/dashboard/ar-layout': 'AR Layout', '/dashboard/magic-business-card': 'Magic Business Card', '/dashboard/upgrade': 'Shop',
  '/dashboard/track': 'Track Orders', '/dashboard/account-settings': 'Settings', '/chat': 'Chat Support', '/shop': 'Shop',
  '/catalog': 'Catalog', '/magic-camera': 'Magic Camera', '/magic-art': 'Magic Art', '/contact': 'Contact us', '/faq': 'FAQ',
  '/about': 'About', '/login': 'Login', '/register': 'Register',
};

function pageName(pathname) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (PAGE_NAMES[path]) return PAGE_NAMES[path];
  if (path.startsWith('/c/')) return 'A public profile';
  const last = path.split('/').filter(Boolean).pop() || 'page';
  const words = last.replace(/[-_]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function trackPageOpen(pathname) {
  record(`Opened page: ${pageName(pathname)}`, { page: pathname, repeatMs: 1000 });
}

// ---- reading the page ----
const untracked = (el) => !!el.closest('[data-no-track]');
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// Words that mark a field we never report on, not even "Edited": passwords, one-time codes, card/bank/ID numbers.
// ("PIN code" / "Pincode" in an address is a postal code, so a bare "pin" / "code" / "card" / "account" is not enough.)
const SENSITIVE = /pass|\botp\b|one[- ]?time|verification code|security code|\bcvv\b|\bcvc\b|card (no|number|num)|account (no|number|num)|\bifsc\b|\bupi\b|aadhaar|aadhar|\bpan (no|number|card)\b|\bssn\b|token|secret|\bmpin\b|\batm pin\b|\bpin\b(?!\s*code)/i;

function labelFor(el) {
  if (el.id) {
    const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (l) return clean(l.textContent);
  }
  const wrapping = el.closest('label');
  if (wrapping) return clean(wrapping.textContent);
  const field = el.closest('.field');
  const inField = field && field.querySelector('label');
  if (inField) return clean(inField.textContent);
  return clean(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || el.id || el.type);
}

function sensitiveField(el) {
  const type = (el.getAttribute('type') || '').toLowerCase();
  if (type === 'password' || type === 'hidden') return true;
  const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
  if (/one-time-code|^cc-|password/.test(ac)) return true;
  return SENSITIVE.test([el.getAttribute('name'), el.id, el.getAttribute('placeholder'), el.getAttribute('aria-label'), labelFor(el)].join(' '));
}

function isSearchBox(el) {
  const type = (el.getAttribute('type') || '').toLowerCase();
  if (type === 'search' || el.getAttribute('role') === 'searchbox') return true;
  return /search/i.test([el.getAttribute('name'), el.id, el.getAttribute('placeholder'), el.getAttribute('aria-label')].join(' '));
}

const short = (s, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ---- events ----
const DOWNLOAD = /\.(pdf|xlsx?|csv|docx?|zip|vcf|png|jpe?g|webp|apk)(?:[?#]|$)/i;

function onClick(e) {
  try {
    if (!tracking() || !(e.target instanceof Element) || untracked(e.target)) return;
    const el = e.target.closest('a[href], button, [role="button"], [role="tab"], [role="menuitem"], [role="option"], summary, input[type="submit"], input[type="button"]');
    if (!el || untracked(el)) return;
    if (el.matches('input[type="checkbox"], input[type="radio"]')) return; // the change step says what was chosen
    const href = el.getAttribute('href') || '';
    if (el.hasAttribute('download') || DOWNLOAD.test(href)) {
      const name = clean(el.getAttribute('download')) || decodeURIComponent(href.split(/[?#]/)[0].split('/').pop() || 'file');
      record(`Downloaded "${short(name)}"`);
      return;
    }
    const inner = clean(el.innerText);
    if (inner.length > 200) return; // a big block, not a clear step
    const named = clean(el.getAttribute('aria-label') || el.getAttribute('title') || inner || el.value
      || el.querySelector('img[alt]')?.getAttribute('alt') || el.querySelector('svg title')?.textContent);
    if (named) {
      record(`Clicked "${short(named)}"`);
      // The person may be about to log out: send this step now so it is not lost with the page.
      if (/log ?out|sign ?out/i.test(named)) { clearTimeout(flushTimer); flush(); }
    } else if (el.matches('a[href]') && href.startsWith('/')) {
      record(`Clicked a link to ${pageName(href.split(/[?#]/)[0])}`);
    } else {
      record(`Clicked an unnamed button on "${pageName(currentPath())}"`); // an icon without a name
    }
  } catch { /* ignore */ }
}

function onChange(e) {
  try {
    const el = e.target;
    if (!tracking() || !(el instanceof Element) || !el.matches('input, select, textarea') || untracked(el) || sensitiveField(el)) return;
    const name = short(labelFor(el) || 'a field');
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (el.matches('select')) {
      record(`Changed "${name}" to "${short(clean(el.options[el.selectedIndex]?.text))}"`);
    } else if (type === 'checkbox') {
      record(`Turned ${el.checked ? 'on' : 'off'} "${name}"`);
    } else if (type === 'radio') {
      const group = el.closest('fieldset')?.querySelector('legend');
      record(`Chose "${name}" for "${short(clean(group?.textContent) || el.getAttribute('name') || 'an option')}"`);
    } else if (type === 'file') {
      record(`Chose a file for "${name}"`); // never the file name
    } else if (!isSearchBox(el)) {
      record(`Edited "${name}"`, { repeatMs: FIELD_REPEAT_MS }); // never the value
    }
  } catch { /* ignore */ }
}

const searchTimers = new WeakMap();
function onInput(e) {
  try {
    const el = e.target;
    if (!tracking() || !(el instanceof Element) || !el.matches('input, textarea') || untracked(el) || sensitiveField(el) || !isSearchBox(el)) return;
    clearTimeout(searchTimers.get(el));
    searchTimers.set(el, setTimeout(() => {
      const value = clean(el.value);
      if (value) record(`Searched for "${short(value)}"`, { repeatMs: 1000 }); // the typed words are kept for search boxes only
    }, SEARCH_PAUSE_MS));
  } catch { /* ignore */ }
}

let hiddenAt = 0;
function onVisibility() {
  try {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      record('Left the tab');
      clearTimeout(flushTimer);
      flush(); // the page may be closing: send now
    } else if (hiddenAt) {
      record('Came back to the tab');
      hiddenAt = 0;
    }
  } catch { /* ignore */ }
}

// Starts listening (once). Returns a function that stops it.
export function startActivityTracker() {
  if (started) return () => {};
  started = true;
  document.addEventListener('click', onClick, true);
  document.addEventListener('change', onChange, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeprint', () => record('Printed the page'));
  return () => {
    started = false;
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('change', onChange, true);
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', flush);
  };
}
