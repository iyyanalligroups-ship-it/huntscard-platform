// Website-tracker events (POST /api/profile/activity-events). Run: node --test test/*.test.js
// Throwaway database on the local MongoDB (never MONGODB_URI); skipped (and says so) when none answers.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

process.env.JWT_SECRET = 'test-secret-not-real';
const DB = `huntstag_events_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const A = require('../utils/activityLog');

// ---- pure cleaning (no database needed) ----
test('cleaning: labels are short, plain and free of e-mail addresses and long numbers', () => {
  const [e] = A.cleanClientEvents([{ at: Date.now(), label: '  Clicked   "Call 9876543210"\u0001 bob@example.com ', page: '/dashboard/contacts?token=abc#x' }]);
  assert.equal(e.label, 'Clicked "Call •••" (email)');
  assert.equal(e.path, '/dashboard/contacts', 'path only, never the query string');
  assert.equal(e.method, 'UI');
  assert.equal(A.cleanClientEvents([{ label: 'x'.repeat(500) }])[0].label.length, 140);
  assert.equal(A.cleanClientEvents([{ label: 'Opened page', page: '/c/some-private-id' }])[0].path, '/c/:id');
  assert.equal(A.cleanClientEvents([{ label: 'Opened page', page: 'javascript:alert(1)' }])[0].path, '');
});

test('cleaning: empty, non-object and non-list input is dropped; at most 40 per call', () => {
  assert.deepEqual(A.cleanClientEvents('nope'), []);
  assert.deepEqual(A.cleanClientEvents(null), []);
  assert.deepEqual(A.cleanClientEvents([null, 5, 'x', {}, { label: '' }, { label: '   ' }]), []);
  assert.equal(A.cleanClientEvents(Array.from({ length: 100 }, (_, i) => ({ label: `step ${i}` }))).length, 40);
});

test('cleaning: times are clamped (never in the future, never more than a day old, bad times become now)', () => {
  const now = Date.now();
  const [past, future, bad] = A.cleanClientEvents([{ label: 'a', at: now - 3 * 86400000 }, { label: 'b', at: now + 9e9 }, { label: 'c', at: 'garbage' }], now);
  assert.equal(past.at.getTime(), now - 86400000);
  assert.equal(future.at.getTime(), now);
  assert.equal(bad.at.getTime(), now);
});

test('cleaning: a typed-field step about a secret is dropped, but a plain button is kept', () => {
  const kept = A.cleanClientEvents([
    { label: 'Edited "Password"' }, { label: 'Edited "One time code"' }, { label: 'Changed "Card number"' }, { label: 'Searched for "otp"' },
    { label: 'Edited "UPI id"' }, { label: 'Clicked "Forgot password?"' }, { label: 'Edited "Pincode"' }, { label: 'Edited "Headline"' },
  ]).map((e) => e.label);
  assert.deepEqual(kept, ['Clicked "Forgot password?"', 'Edited "Pincode"', 'Edited "Headline"']);
});

// ---- endpoint ----
let dbUp = false; let server; let base; let S;
test.before(async () => {
  try { await mongoose.connect(`mongodb://127.0.0.1:27017/${DB}`, { serverSelectionTimeoutMS: 2500 }); dbUp = true; } catch { return; }
  S = require('../models/ActivitySession');
  await S.init();
  const app = express();
  app.use(express.json());
  app.use('/api/profile', require('../routes/activity'));
  await new Promise((r) => { server = http.createServer(app).listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (dbUp) { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
});

const skip = (t) => { if (!dbUp) { t.skip('no local MongoDB'); return true; } return false; };
// A login that started 10 minutes ago (so steps from the last seconds are after its start).
const tokenFor = (clientId, sid, extra = {}) => {
  const t = Math.floor(Date.now() / 1000) - 600;
  return jwt.sign({ type: 'client', clientId, loginEmail: `${clientId}@example.test`, sid, iat: t, sst: t, ...extra }, process.env.JWT_SECRET, { expiresIn: '1h' });
};
const post = (events, token, extraBody = {}) => fetch(`${base}/api/profile/activity-events`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ events, ...extraBody }) });
async function waitFor(fn, ms = 4000) { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return null; await new Promise((r) => setTimeout(r, 40)); } }
const labels = (s) => s.events.map((e) => e.label);

test('events are stored on the session of this login, in time order, marked as browser steps', async (t) => {
  if (skip(t)) return;
  const tok = tokenFor('ev-a', 'ev-sid-1');
  const now = Date.now();
  const res = await post([
    { at: now - 1000, label: 'Clicked "Save"', page: '/dashboard/profile' },
    { at: now - 5000, label: 'Opened page: Contacts', page: '/dashboard/contacts' },
  ], tok);
  assert.equal(res.status, 204, 'answered at once');
  const s = await waitFor(async () => { const x = await S.findOne({ sid: 'ev-sid-1' }).lean(); return x && x.events.length >= 3 ? x : null; });
  assert.ok(s, 'stored');
  assert.deepEqual(labels(s), ['Logged in', 'Opened page: Contacts', 'Clicked "Save"'], 'oldest first, even though the later one arrived first');
  assert.equal(s.user, 'ev-a');
  assert.equal(s.eventCount, 3);
  assert.deepEqual([s.events[1].method, s.events[1].path], ['UI', '/dashboard/contacts']);
  assert.ok(!labels(s).some((l) => /activity-events/.test(l)), 'the upload itself is not a step');
  // more batches add to the same session
  await post([{ label: 'Left the tab' }], tok);
  const s2 = await waitFor(async () => { const x = await S.findOne({ sid: 'ev-sid-1' }).lean(); return x.events.length >= 4 ? x : null; });
  assert.equal(s2.events.at(-1).label, 'Left the tab');
  assert.equal(await S.countDocuments({ user: 'ev-a' }), 1);
});

test('a step older than its own session is moved to the session start', async (t) => {
  if (skip(t)) return;
  await post([{ label: 'Clicked "Early"', at: Date.now() - 3600000 }], tokenFor('ev-early', 'ev-sid-early'));
  const s = await waitFor(async () => { const x = await S.findOne({ sid: 'ev-sid-early' }).lean(); return x && x.events.length > 1 ? x : null; });
  assert.deepEqual(labels(s), ['Logged in', 'Clicked "Early"']);
  assert.ok(s.events[1].at >= s.events[0].at);
});

test('a sid sent in the body is ignored: events go only to the session in the token', async (t) => {
  if (skip(t)) return;
  await S.create({ sid: 'victim-sid', user: 'victim', platform: 'web', startedAt: new Date(), lastActivityAt: new Date(), eventCount: 1, events: [{ at: new Date(), label: 'Logged in' }] });
  await post([{ label: 'Clicked "Evil"' }], tokenFor('ev-b', 'ev-sid-2'), { sid: 'victim-sid', user: 'victim', clientId: 'victim' });
  await waitFor(async () => { const x = await S.findOne({ sid: 'ev-sid-2' }).lean(); return x && x.events.length > 1; });
  const victim = await S.findOne({ sid: 'victim-sid' }).lean();
  assert.deepEqual(labels(victim), ['Logged in']);
  assert.ok((await S.findOne({ sid: 'ev-sid-2' }).lean()).events.some((e) => e.label === 'Clicked "Evil"'));
});

test('no session id (old login), admin viewing as the user, a long-ended session, admin or no token: nothing is stored', async (t) => {
  if (skip(t)) return;
  assert.equal((await post([{ label: 'x' }], tokenFor('ev-old', undefined))).status, 204);
  assert.equal((await post([{ label: 'x' }], tokenFor('ev-imp', 'imp-sid', { impersonatedBy: 'admin@example.test' }))).status, 204);
  const longAgo = new Date(Date.now() - 10 * 60000);
  await S.create({ sid: 'ended-sid', user: 'ev-end', platform: 'web', startedAt: new Date(longAgo.getTime() - 60000), lastActivityAt: longAgo, endedAt: longAgo, endReason: 'logout', eventCount: 2, events: [{ at: new Date(longAgo.getTime() - 60000), label: 'Logged in' }, { at: longAgo, label: 'Logged out' }] });
  assert.equal((await post([{ label: 'late click' }], tokenFor('ev-end', 'ended-sid'))).status, 204);
  assert.equal((await post([{ label: 'x' }], jwt.sign({ type: 'admin', adminId: 'a', email: 'a@example.test' }, process.env.JWT_SECRET))).status, 403);
  assert.equal((await post([{ label: 'x' }], null)).status, 401);
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(await S.countDocuments({ user: { $in: ['ev-old', 'ev-imp'] } }), 0);
  assert.equal(await S.countDocuments({ sid: 'imp-sid' }), 0);
  assert.deepEqual(labels(await S.findOne({ sid: 'ended-sid' }).lean()), ['Logged in', 'Logged out'], 'a session that ended long ago is not reopened');
});

test('a step that arrives just after logout is kept, placed before "Logged out"; the session stays ended', async (t) => {
  if (skip(t)) return;
  const t0 = Date.now() - 20000;
  const endedAt = new Date(Date.now() - 2000);
  await S.create({ sid: 'just-ended', user: 'ev-just', platform: 'web', startedAt: new Date(t0), lastActivityAt: endedAt, endedAt, endReason: 'logout', eventCount: 2, events: [{ at: new Date(t0), label: 'Logged in' }, { at: endedAt, label: 'Logged out' }] });
  const tok = jwt.sign({ type: 'client', clientId: 'ev-just', sid: 'just-ended', iat: Math.floor(t0 / 1000), sst: Math.floor(t0 / 1000) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  // the person clicked "Log out", and the browser sent these steps a moment after the logout arrived
  await post([{ label: 'Clicked "A"', at: Date.now() - 2500 }, { label: 'Clicked "Log out"', at: Date.now() }], tok);
  const s = await waitFor(async () => { const x = await S.findOne({ sid: 'just-ended' }).lean(); return x.events.length === 4 ? x : null; });
  assert.ok(s, 'both steps were kept');
  assert.deepEqual(labels(s), ['Logged in', 'Clicked "A"', 'Clicked "Log out"', 'Logged out'], 'in order, "Logged out" last');
  assert.equal(String(s.endedAt), String(endedAt), 'still ended at the same time');
  assert.equal(String(s.lastActivityAt), String(endedAt), 'last seen did not move');
  assert.equal(s.eventCount, 4);
});

test('at most 40 steps per call are kept; junk in the list never breaks the call', async (t) => {
  if (skip(t)) return;
  const tok = tokenFor('ev-many', 'ev-sid-many');
  const res = await post([null, 7, { label: '' }, ...Array.from({ length: 60 }, (_, i) => ({ label: `Clicked "Button ${i}"`, at: Date.now() - (60 - i) * 1000 }))], tok);
  assert.equal(res.status, 204);
  const s = await waitFor(async () => { const x = await S.findOne({ sid: 'ev-sid-many' }).lean(); return x && x.events.length > 1 ? x : null; });
  assert.equal(s.events.length, 1 + 37, 'the 40-step cap applies to the list as sent, junk entries included');
  assert.equal((await fetch(`${base}/api/profile/activity-events`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify({ events: 'not a list' }) })).status, 204);
  assert.equal((await fetch(`${base}/api/profile/activity-events`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: '{}' })).status, 204);
});

test('a logout landing between reading the session and writing to it does not lose the step', async (t) => {
  if (skip(t)) return;
  const t0 = Date.now() - 20000;
  const endedAt = new Date(Date.now() - 1000);
  await S.create({ sid: 'race-sid', user: 'ev-race', platform: 'web', startedAt: new Date(t0), lastActivityAt: endedAt, endedAt, endReason: 'logout', eventCount: 2, events: [{ at: new Date(t0), label: 'Logged in' }, { at: endedAt, label: 'Logged out' }] });
  const tok = jwt.sign({ type: 'client', clientId: 'ev-race', sid: 'race-sid', iat: Math.floor(t0 / 1000), sst: Math.floor(t0 / 1000) }, process.env.JWT_SECRET, { expiresIn: '1h' });
  // The first read says "still open" (the logout had not landed yet); the write then finds it ended.
  const orig = S.findOne;
  let stale = true;
  S.findOne = function findOne(q, ...rest) {
    if (stale && q && q.sid === 'race-sid') { stale = false; return { select: () => ({ lean: async () => ({ endedAt: null }) }) }; }
    return orig.call(this, q, ...rest);
  };
  try {
    await post([{ label: 'Clicked "Log out"', at: Date.now() }], tok);
    const s = await waitFor(async () => { const x = await orig.call(S, { sid: 'race-sid' }).lean(); return x.events.length === 3 ? x : null; });
    assert.ok(s, 'the step was kept');
    assert.deepEqual(labels(s), ['Logged in', 'Clicked "Log out"', 'Logged out']);
  } finally {
    S.findOne = orig;
  }
});
