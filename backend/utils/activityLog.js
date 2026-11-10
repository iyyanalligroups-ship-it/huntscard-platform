// Activity tracking for logged-in clients (not admins): one ActivitySession per login, with a list of
// human-readable steps. Everything here runs AFTER the response is sent and swallows every error, so
// tracking can never slow down or break a request.
const ActivitySession = require('../models/ActivitySession');

const KEEP = ActivitySession.EVENTS_KEEP;
const DEDUPE_MS = 30 * 1000; // same label + target again within this time is dropped
const POLL_DEDUPE_MS = 5 * 60 * 1000; // list / notification polls
const TOUCH_MS = 60 * 1000; // "last seen" is refreshed at most this often per session
const MAX_CACHE = 20000;
// A session with no logout that was active this recently counts as "active now" (never deleted, never purged).
const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

// [method, route regex (first group = what was touched), label | null, options]
// null label = never logged. An unknown GET is not logged (polling, lists); an unknown write is
// logged as "METHOD path".
const POLL = { windowMs: POLL_DEDUPE_MS };
const ROUTES = [
  ['POST', /^\/api\/auth\/(?:logout|refresh)$/, null],
  ['POST', /^\/api\/profile\/activity-events$/, null], // the website tracker's own upload
  // profile
  ['PUT', /^\/api\/profile\/me$/, 'Edited profile'],
  ['POST', /^\/api\/profile\/photo$/, 'Changed profile photo'],
  ['POST', /^\/api\/profile\/banner$/, 'Changed profile banner'],
  ['DELETE', /^\/api\/profile\/banner$/, 'Removed profile banner'],
  ['POST', /^\/api\/profile\/logo$/, 'Changed logo'],
  ['DELETE', /^\/api\/profile\/logo$/, 'Removed logo'],
  ['POST', /^\/api\/profile\/ar-banner$/, 'Changed AR banner'],
  ['DELETE', /^\/api\/profile\/ar-banner$/, 'Removed AR banner'],
  ['POST', /^\/api\/profile\/ar-model$/, 'Changed AR 3D model'],
  ['DELETE', /^\/api\/profile\/ar-model$/, 'Removed AR 3D model'],
  ['PUT', /^\/api\/profile\/ar-layout$/, 'Saved AR layout'],
  ['POST', /^\/api\/profile\/pause-card$/, 'Paused card'],
  ['POST', /^\/api\/profile\/unpause-card$/, 'Resumed card'],
  ['POST', /^\/api\/profile\/cards\/([^/]+)\/pause$/, 'Paused card'],
  ['POST', /^\/api\/profile\/cards\/([^/]+)\/unpause$/, 'Resumed card'],
  ['POST', /^\/api\/profile\/email-verification\/request$/, 'Asked for an email verification code'],
  ['POST', /^\/api\/profile\/email-verification\/verify$/, 'Verified email'],
  // Magic Card
  ['POST', /^\/api\/profile\/magic-card\/qr-position$/, 'Moved the QR on Magic Card'],
  ['POST', /^\/api\/profile\/magic-card\/component-position$/, 'Moved a part on Magic Card'],
  ['POST', /^\/api\/profile\/magic-card\/activate$/, 'Turned Magic Card on'],
  ['POST', /^\/api\/profile\/magic-card\/deactivate$/, 'Turned Magic Card off'],
  ['POST', /^\/api\/profile\/magic-card\/image$/, 'Uploaded Magic Card image'],
  ['DELETE', /^\/api\/profile\/magic-card\/image$/, 'Removed Magic Card image'],
  ['POST', /^\/api\/profile\/magic-card\/video$/, 'Uploaded Magic Card video'],
  ['DELETE', /^\/api\/profile\/magic-card\/video$/, 'Removed Magic Card video'],
  ['POST', /^\/api\/profile\/magic-card\/model$/, 'Uploaded Magic Card 3D model'],
  ['DELETE', /^\/api\/profile\/magic-card\/model$/, 'Removed Magic Card 3D model'],
  // orders (pricing calls are previews, not actions)
  ['POST', /^\/api\/profile\/(?:card-checkout|magic-poster)\/pricing$/, null],
  ['POST', /^\/api\/profile\/upgrade-order$/, 'Started a card upgrade order'],
  ['POST', /^\/api\/profile\/upgrade-confirm$/, 'Paid for a card upgrade'],
  ['POST', /^\/api\/profile\/new-card-order$/, 'Started a new card order'],
  ['POST', /^\/api\/profile\/new-card-confirm$/, 'Paid for a new card'],
  ['POST', /^\/api\/profile\/magic-poster\/order$/, 'Started a Magic Poster order'],
  ['POST', /^\/api\/profile\/magic-poster\/confirm$/, 'Paid for a Magic Poster order'],
  ['POST', /^\/api\/profile\/requests$/, 'Sent a card request'],
  ['GET', /^\/api\/profile\/(?:requests|magic-poster\/orders)\/([^/]+)\/invoice$/, 'Downloaded an invoice'],
  // addresses
  ['POST', /^\/api\/profile\/addresses$/, 'Added an address'],
  ['PATCH', /^\/api\/profile\/addresses\/([^/]+)$/, 'Edited an address'],
  ['DELETE', /^\/api\/profile\/addresses\/([^/]+)$/, 'Deleted an address'],
  // contacts
  ['POST', /^\/api\/profile\/contacts$/, 'Added a contact'],
  ['PUT', /^\/api\/profile\/contacts\/([^/]+)$/, 'Edited a contact'],
  ['POST', /^\/api\/profile\/contacts\/import$/, 'Imported contacts'],
  ['DELETE', /^\/api\/profile\/contacts\/([^/]+)$/, 'Deleted a contact'],
  ['POST', /^\/api\/profile\/contacts\/([^/]+)\/photo$/, 'Changed a contact photo'],
  ['DELETE', /^\/api\/profile\/contacts\/([^/]+)\/photo$/, 'Removed a contact photo'],
  ['GET', /^\/api\/profile\/contacts\/export$/, 'Exported contacts'],
  // appointments
  ['POST', /^\/api\/profile\/appointments$/, 'Sent an appointment request'],
  ['PATCH', /^\/api\/profile\/appointments\/([^/]+)$/, 'Updated an appointment request'],
  ['DELETE', /^\/api\/profile\/appointments\/([^/]+)$/, 'Deleted an appointment request'],
  // chat and notifications
  ['GET', /^\/api\/profile\/chat$/, 'Opened chat', POLL],
  ['POST', /^\/api\/profile\/chat$/, 'Sent a chat message'],
  ['PATCH', /^\/api\/profile\/chat\/([^/]+)$/, 'Edited a chat message'],
  ['DELETE', /^\/api\/profile\/chat\/([^/]+)$/, 'Deleted a chat message'],
  ['GET', /^\/api\/profile\/notifications$/, 'Opened notifications', POLL],
  ['POST', /^\/api\/profile\/notifications\/([^/]+)\/read$/, 'Read a notification'],
  ['POST', /^\/api\/profile\/push\/subscribe$/, 'Turned notifications on'],
  ['POST', /^\/api\/profile\/push\/unsubscribe$/, 'Turned notifications off'],
  // coupon
  ['POST', /^\/api\/profile\/coupon\/preview$/, 'Checked a coupon'],
  ['POST', /^\/api\/profile\/coupon\/claim$/, 'Claimed a coupon'],
];

// What to record for a request: { log: false } or { log: true, label, ref, windowMs }.
function labelFor(method, pathname) {
  const m = String(method || '').toUpperCase();
  for (const [rm, re, label, opts] of ROUTES) {
    if (rm !== m) continue;
    const hit = re.exec(pathname);
    if (!hit) continue;
    if (label === null) return { log: false };
    return { log: true, label, ref: hit[1] || '', windowMs: (opts && opts.windowMs) || DEDUPE_MS };
  }
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return { log: false };
  return { log: true, label: `${m} ${pathname}`.slice(0, 140), ref: '', windowMs: DEDUPE_MS };
}

// The mobile app sends x-client-platform: app; otherwise decide from the user-agent.
function platformOf(req) {
  const h = String((req.headers && req.headers['x-client-platform']) || '').toLowerCase();
  if (h === 'app' || h === 'web') return h;
  return /okhttp|cfnetwork|expo|react-native|dalvik/i.test(String((req.headers && req.headers['user-agent']) || '')) ? 'app' : 'web';
}

// ---- small bounded caches (per process; losing them only means a repeated step may be kept) ----
const seen = new Map(); // dedupe key -> time
const touched = new Map(); // sid -> last "last seen" write
const known = new Set(); // sids whose session row exists
function bounded(map) {
  if (map.size > MAX_CACHE) map.clear();
}
function recentlySeen(key, now, windowMs) {
  const last = seen.get(key);
  if (last !== undefined && now - last < windowMs) return true;
  seen.set(key, now);
  bounded(seen);
  return false;
}
function forget(sid) {
  known.delete(sid);
  touched.delete(sid);
  for (const k of seen.keys()) if (k.startsWith(`${sid}|`)) seen.delete(k);
}

// Creates the session row if it is not there yet (safe to call twice). The first step is "Logged in".
async function startSession({ sid, user, platform, ip, userAgent, startedAt }) {
  if (!sid || !user || known.has(sid)) return;
  const at = startedAt instanceof Date ? startedAt : new Date(startedAt || Date.now());
  try {
    await ActivitySession.updateOne(
      { sid },
      {
        $setOnInsert: {
          user,
          role: 'client',
          platform: platform === 'app' ? 'app' : 'web',
          ip: String(ip || '').slice(0, 64),
          userAgent: String(userAgent || '').slice(0, 300),
          startedAt: at,
          lastActivityAt: at,
          endedAt: null,
          endReason: null,
          eventCount: 1,
          events: [{ at, label: 'Logged in', method: 'POST', path: '/api/auth/login', status: 200 }],
        },
      },
      { upsert: true }
    );
  } catch (err) {
    if (!(err && err.code === 11000)) throw err; // two requests created it at once: fine
  }
  known.add(sid);
  bounded(known);
}

// Fire-and-forget wrapper for login handlers.
function startSessionSafe(req, client, sid, sinceSeconds) {
  try {
    startSession({
      sid,
      user: client.clientId,
      platform: platformOf(req),
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      startedAt: sinceSeconds ? new Date(sinceSeconds * 1000) : new Date(),
    }).catch(() => {});
  } catch { /* tracking must never break a login */ }
}

async function touch(sid, now) {
  const last = touched.get(sid);
  if (last !== undefined && now - last < TOUCH_MS) return;
  touched.set(sid, now);
  bounded(touched);
  await ActivitySession.updateOne({ sid, endedAt: null }, { $set: { lastActivityAt: new Date(now) } });
}

async function record(req, res, payload) {
  const status = res.statusCode;
  if (status >= 400) return;
  const now = Date.now();
  const sid = payload.sid;
  await startSession({
    sid,
    user: payload.clientId,
    platform: platformOf(req),
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    startedAt: new Date((payload.sst || payload.iat || now / 1000) * 1000),
  });
  const pathname = String(req.originalUrl || req.url || '').split('?')[0];
  const hit = labelFor(req.method, pathname);
  const changes = Array.isArray(req.activityChanges) && req.activityChanges.length ? req.activityChanges : null;
  // A save that changed something is never treated as a repeat.
  if (!hit.log || (!changes && recentlySeen(`${sid}|${hit.label}|${hit.ref}`, now, hit.windowMs))) {
    await touch(sid, now);
    return;
  }
  const ev = { at: new Date(now), label: hit.label, method: req.method, path: pathname.slice(0, 200), ref: hit.ref.slice(0, 80), status };
  if (changes) ev.changes = changes.slice(0, 30);
  touched.set(sid, now);
  await ActivitySession.updateOne(
    { sid, endedAt: null },
    { $set: { lastActivityAt: new Date(now) }, $inc: { eventCount: 1 }, $push: { events: { $each: [ev], $sort: { at: 1 }, $slice: -KEEP } } }
  );
}

// Called by requireAuth for every authenticated client request. Admins use another token type and
// "admin viewing as user" tokens carry impersonatedBy: both are skipped.
function trackActivity(req, res, payload) {
  try {
    if (!payload || payload.type !== 'client' || !payload.sid || payload.impersonatedBy) return;
    res.once('finish', () => {
      setImmediate(() => {
        record(req, res, payload).catch(() => {});
      });
    });
  } catch { /* tracking must never break a request */ }
}

// Ends the session and adds the closing step. Safe to call for an unknown or already ended sid.
async function endSession(sid, reason = 'logout', now = new Date()) {
  if (!sid) return false;
  const label = reason === 'switched' ? 'Switched account' : 'Logged out';
  const r = await ActivitySession.updateOne(
    { sid, endedAt: null },
    {
      $set: { endedAt: now, endReason: reason === 'switched' ? 'switched' : 'logout', lastActivityAt: now },
      $inc: { eventCount: 1 },
      $push: { events: { $each: [{ at: now, label, method: 'POST', path: '/api/auth/logout', status: 200 }], $slice: -KEEP } },
    }
  );
  forget(sid);
  return r.modifiedCount > 0;
}

// ---- before / after ----
// Values are never kept for anything that looks like a secret.
const SECRET_KEY = /pass(word)?|otp|token|secret|pin\b|cvv|aadhaar|aadhar|\bpan\b|bank|account.?number|card.?number|ifsc|upi/i;
const SHOW_MAX = 120;

function humanize(key) {
  const s = String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function show(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (Array.isArray(v)) return v.map(show).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return ''; }
  }
  return String(v);
}

// Compares two plain objects for the given keys. `labels` maps key -> label (optional);
// `hideValues` keeps only which fields changed (use it for other people's details).
function diffFields(before, after, keys, { labels = {}, hideValues = false } = {}) {
  const out = [];
  if (!before || !after) return out;
  for (const key of keys) {
    const b = show(before[key]);
    const a = show(after[key]);
    if (b === a) continue;
    const hide = hideValues || SECRET_KEY.test(key);
    out.push({
      label: labels[key] || humanize(key),
      before: hide ? (b ? '(hidden)' : '') : b.slice(0, SHOW_MAX),
      after: hide ? (a ? '(hidden)' : '') : a.slice(0, SHOW_MAX),
    });
  }
  return out;
}

// Attach changes to the current request so the tracker stores them with the step.
function noteChanges(req, changes) {
  try {
    if (Array.isArray(changes) && changes.length) req.activityChanges = changes;
  } catch { /* ignore */ }
}

// ---- steps sent by the website tracker (page opens, clicks, typing) ----
// The server cleans them again, whatever the browser sent: at most 40 per call, short labels, sane times,
// no e-mail addresses or long numbers, and no field-input step about a secret.
const MAX_CLIENT_EVENTS = 40;
const MAX_LABEL = 140;
const ENDED_GRACE_MS = 60 * 1000; // browser steps are still accepted this long after a logout
const DAY_MS = 24 * 60 * 60 * 1000;
const SECRET_WORDS = /\b(pass(word|code)?|one[- ]?time|otp|cvv|cvc|pin|card number|account number|ifsc|upi|aadhaar|aadhar|pan number|ssn|secret|token)\b/i;
const FIELD_STEP = /^(Edited|Changed|Typed|Turned|Chose|Searched)\b/;

function cleanLabel(value) {
  let s = String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '(email)').replace(/\d[\d\s-]{5,}\d/g, '•••');
  return s.slice(0, MAX_LABEL).trim();
}

// Path only (never a query string or #hash); profile pages are grouped so no client id is stored.
function cleanPath(value) {
  const s = String(value ?? '').split(/[?#]/)[0].slice(0, 200);
  if (!s.startsWith('/')) return '';
  return s.startsWith('/c/') ? '/c/:id' : s;
}

function cleanClientEvents(raw, now = Date.now()) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const e of raw.slice(0, MAX_CLIENT_EVENTS)) {
    if (!e || typeof e !== 'object') continue;
    const label = cleanLabel(e.label);
    if (!label || (FIELD_STEP.test(label) && SECRET_WORDS.test(label))) continue;
    let t = typeof e.at === 'number' || typeof e.at === 'string' ? new Date(e.at).getTime() : NaN;
    if (!Number.isFinite(t)) t = now;
    t = Math.min(now, Math.max(now - DAY_MS, t)); // never in the future, never more than a day old
    out.push({ at: new Date(t), label, method: 'UI', path: cleanPath(e.page), status: 200 });
  }
  return out;
}

// Adds browser steps to the session of this very login (the sid in the token). Nothing happens for a login
// without a session id, an admin viewing as the user, or a session that has already ended.
async function appendClientEvents(req, payload, raw) {
  if (!payload || payload.type !== 'client' || !payload.sid || payload.impersonatedBy) return 0;
  const events = cleanClientEvents(raw);
  if (!events.length) return 0;
  const startedAt = new Date((payload.sst || payload.iat || Date.now() / 1000) * 1000);
  // A step cannot be older than its own session (an old login that was just given a session id, for instance).
  for (const e of events) if (e.at < startedAt) e.at = new Date(startedAt.getTime() + 1);
  await startSession({ sid: payload.sid, user: payload.clientId, platform: platformOf(req), ip: req.ip, userAgent: req.headers['user-agent'], startedAt });
  const push = { $each: events, $sort: { at: 1 }, $slice: -KEEP };
  // Two tries: a logout can land between reading the session and writing to it (the browser sends the last
  // step and the logout together); the second try then takes the "just ended" path below.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const cur = await ActivitySession.findOne({ sid: payload.sid }).select('endedAt').lean();
    if (!cur) return 0;
    if (cur.endedAt) {
      // The last steps before a logout can arrive just after it. Keep them (for a short while), placed before
      // "Logged out"; the session stays ended and its last-seen time does not move.
      const ended = new Date(cur.endedAt).getTime();
      if (Date.now() - ended > ENDED_GRACE_MS) return 0;
      const placed = events.map((e, i) => ({ ...e, at: new Date(Math.min(e.at.getTime(), ended - 1 - (events.length - 1 - i))) }));
      const r = await ActivitySession.updateOne({ sid: payload.sid, endedAt: cur.endedAt }, { $inc: { eventCount: placed.length }, $push: { events: { ...push, $each: placed } } });
      return r.modifiedCount ? placed.length : 0;
    }
    const r = await ActivitySession.updateOne({ sid: payload.sid, endedAt: null }, { $set: { lastActivityAt: new Date() }, $inc: { eventCount: events.length }, $push: { events: push } });
    if (r.modifiedCount) return events.length;
    // nothing matched: the session ended just now; look again
  }
  return 0;
}

module.exports = { cleanClientEvents, appendClientEvents, MAX_CLIENT_EVENTS, labelFor, platformOf, startSession, startSessionSafe, trackActivity, endSession, diffFields, noteChanges, humanize, KEEP, ACTIVE_WINDOW_MS };
