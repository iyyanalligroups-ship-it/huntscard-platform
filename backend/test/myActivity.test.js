// "My activity" (client's own view) tests. Run: node --test test/*.test.js
// Throwaway database on the local MongoDB (never MONGODB_URI); skipped (and says so) when none answers.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

process.env.JWT_SECRET = 'test-secret-not-real';
const DB = `huntstag_my_activity_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const T = require('../utils/istTime');

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
const tokenFor = (clientId, sid, extra = {}) => jwt.sign({ type: 'client', clientId, loginEmail: `${clientId}@example.test`, sid, ...extra }, process.env.JWT_SECRET, { expiresIn: '1h' });
const get = (path, token) => fetch(base + path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
const day = (back) => T.addDays(T.todayKey(), -back);
let n = 0;
function seed(user, d, o = {}) {
  n += 1;
  const startedAt = new Date(T.dayStart(d).getTime() + (o.at ?? 4) * 3600000);
  const endedAt = o.open ? null : new Date(startedAt.getTime() + 20 * 60000);
  const events = [{ at: startedAt, label: 'Logged in' }, { at: new Date(startedAt.getTime() + 60000), label: 'Edited profile', method: 'PUT', path: '/api/profile/me', changes: [{ label: 'Headline', before: 'a', after: 'b' }] }];
  if (endedAt) events.push({ at: endedAt, label: 'Logged out' });
  return S.create({ sid: o.sid || `my-${n}`, user, platform: 'web', ip: '203.0.113.9', userAgent: 'secret-agent', startedAt, lastActivityAt: endedAt || new Date(), endedAt, endReason: endedAt ? 'logout' : null, eventCount: events.length, events });
}

test('only the logged-in client can read, and only their own activity', async (t) => {
  if (skip(t)) return;
  assert.equal((await get('/api/profile/activity')).status, 401);
  assert.equal((await get('/api/profile/activity', jwt.sign({ type: 'admin', adminId: 'x', email: 'a@example.test' }, process.env.JWT_SECRET))).status, 403);
  await seed('me-a', day(1), { sid: 'a-1' });
  await seed('me-b', day(1), { sid: 'b-1' });
  const a = await (await get('/api/profile/activity', tokenFor('me-a'))).json();
  assert.equal(a.total, 1);
  assert.equal(a.days[0].day, day(1));
  assert.deepEqual([a.days[0].logins, a.days[0].logouts, a.days[0].things], [1, 1, 1]);
  // an id in the query or the URL changes nothing: the person comes from the token
  const sneaky = await (await get('/api/profile/activity?clientId=me-b&user=me-b', tokenFor('me-a'))).json();
  assert.equal(sneaky.total, 1);
  const dayData = await (await get(`/api/profile/activity/days/${day(1)}`, tokenFor('me-a'))).json();
  assert.deepEqual(dayData.sessions.map((s) => s.sid), ['a-1']);
  const b = await (await get(`/api/profile/activity/days/${day(1)}`, tokenFor('me-b'))).json();
  assert.deepEqual(b.sessions.map((s) => s.sid), ['b-1']);
});

test('7 days per page, newest first, with a date filter', async (t) => {
  if (skip(t)) return;
  for (let i = 2; i <= 10; i += 1) await seed('me-pager', day(i));
  const tok = tokenFor('me-pager');
  const p1 = await (await get('/api/profile/activity', tok)).json();
  const p2 = await (await get('/api/profile/activity?page=2', tok)).json();
  assert.deepEqual([p1.total, p1.pageSize, p1.days.length, p2.days.length], [9, 7, 7, 2]);
  assert.equal(p1.days[0].day, day(2));
  assert.equal(p2.days.at(-1).day, day(10));
  const some = await (await get(`/api/profile/activity?from=${day(6)}&to=${day(4)}`, tok)).json();
  assert.deepEqual(some.days.map((d) => d.day), [day(4), day(5), day(6)]);
  assert.equal((await get('/api/profile/activity?from=2026-13-40', tok)).status, 400);
  assert.equal((await get('/api/profile/activity/days/not-a-day', tok)).status, 400);
});

test('a day returns sessions with steps and before/after, but no IP, user-agent, path or method; the live session is marked', async (t) => {
  if (skip(t)) return;
  await seed('me-live', day(1), { sid: 'live-old' });
  await seed('me-live', T.todayKey(), { sid: 'live-now', open: true, at: 0 });
  const tok = tokenFor('me-live', 'live-now');
  const list = await (await get('/api/profile/activity', tok)).json();
  assert.equal(list.currentSid, 'live-now');
  assert.equal(list.days[0].day, T.todayKey());
  assert.equal(list.days[0].activeNow, true);
  const d = await (await get(`/api/profile/activity/days/${T.todayKey()}`, tok)).json();
  assert.equal(d.sessions[0].current, true);
  assert.equal(d.sessions[0].active, true);
  assert.deepEqual(d.sessions[0].events.map((e) => e.label), ['Logged in', 'Edited profile']);
  assert.deepEqual(d.sessions[0].events[1].changes, [{ label: 'Headline', before: 'a', after: 'b' }]);
  const text = JSON.stringify(d);
  assert.ok(!/203\.0\.113\.9|secret-agent|\/api\/profile\/me|"method"|"ip"|"userAgent"/.test(text), 'no technical details are sent');
  const old = await (await get(`/api/profile/activity/days/${day(1)}`, tok)).json();
  assert.equal(old.sessions[0].current, false);
});

test('reading My activity (and its auto-refresh) is not logged as a step', async (t) => {
  if (skip(t)) return;
  await seed('me-quiet', day(1), { sid: 'quiet-1', open: true });
  const before = await S.findOne({ sid: 'quiet-1' }).lean();
  const tok = tokenFor('me-quiet', 'quiet-1');
  for (let i = 0; i < 3; i += 1) { await get('/api/profile/activity', tok); await get(`/api/profile/activity/days/${day(1)}`, tok); }
  await new Promise((r) => setTimeout(r, 300));
  const after = await S.findOne({ sid: 'quiet-1' }).lean();
  assert.equal(after.events.length, before.events.length);
  assert.equal(after.eventCount, before.eventCount);
});
