// Admin "Activity logs" API tests. Run: node --test test/*.test.js
// Real models on a THROWAWAY database on the local MongoDB (never MONGODB_URI); dropped at the end.
// Skipped (and says so) when no local MongoDB answers.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

process.env.JWT_SECRET = 'test-secret-not-real';
const DB = `huntstag_admin_activity_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server;
let base;
let dbUp = false;
let S;
let Admin;
let Client;
let Audit;
const tokens = {};

test.before(async () => {
  try {
    await mongoose.connect(`mongodb://127.0.0.1:27017/${DB}`, { serverSelectionTimeoutMS: 2500 });
    dbUp = true;
  } catch {
    return;
  }
  S = require('../models/ActivitySession');
  Admin = require('../models/Admin');
  Client = require('../models/Client');
  Audit = require('../models/AdminAuditLog');
  await S.init();
  const app = express();
  app.use(express.json());
  app.use('/api/admin/activity', require('../routes/adminActivity'));
  await new Promise((r) => { server = http.createServer(app).listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
  for (const role of ['admin', 'subadmin', 'employee']) {
    const a = await Admin.create({ email: `${role}@example.test`, passwordHash: 'x', role });
    tokens[role] = jwt.sign({ type: 'admin', adminId: a._id.toString(), email: a.email, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  }
  tokens.client = jwt.sign({ type: 'client', clientId: 'adm-alice', loginEmail: 'a@example.test', sid: 'x' }, process.env.JWT_SECRET, { expiresIn: '1h' });
});

test.after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (dbUp) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

const call = (method, path, token = tokens.admin) =>
  fetch(base + path, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });
const getJson = async (path, token) => (await call('GET', path, token)).json();

let n = 0;
// IST is UTC+05:30. Times below are given in UTC.
function seed(user, o = {}) {
  n += 1;
  const startedAt = new Date(o.start);
  const lastActivityAt = new Date(o.last || o.end || o.start);
  const endedAt = o.end ? new Date(o.end) : null;
  const events = o.events || [{ at: startedAt, label: 'Logged in' }];
  return S.create({
    sid: o.sid || `adm-sid-${n}`, user, platform: o.platform || 'web', startedAt, lastActivityAt, endedAt, endReason: endedAt ? 'logout' : null,
    eventCount: o.eventCount ?? events.length, events,
  });
}

// Alice: three sessions across two India days (the day changes at 18:30 UTC); Bob: one on the app.
test('admins and sub-admins can read; employees, clients and visitors cannot', async (t) => {
  if (!dbUp) return t.skip('no local MongoDB');
  assert.equal((await call('GET', '/api/admin/activity/people', tokens.admin)).status, 200);
  assert.equal((await call('GET', '/api/admin/activity/people', tokens.subadmin)).status, 200);
  assert.equal((await call('GET', '/api/admin/activity/people', tokens.employee)).status, 403);
  assert.equal((await call('GET', '/api/admin/activity/people', tokens.client)).status, 403);
  assert.equal((await call('GET', '/api/admin/activity/people', null)).status, 401);
  assert.equal((await call('DELETE', '/api/admin/activity/people/adm-alice', tokens.client)).status, 403);
});

test('list: one row per person with totals, platform, search and filters', async (t) => {
  if (!dbUp) return t.skip('no local MongoDB');
  await Client.create({ clientId: 'adm-alice', loginEmail: 'alice@example.test', fullName: 'Alice Rao', phone: '9000000001', passwordHash: 'x' });
  await Client.create({ clientId: 'adm-bob', loginEmail: 'bob@example.test', fullName: 'Bob Das', phone: '9000000002', passwordHash: 'x' });
  const edit = (at) => ({ at: new Date(at), label: 'Edited profile', changes: [{ label: 'Headline', before: '', after: 'Hi' }] });
  // Nov 1 India: 10:00-10:30 IST = 04:30-05:00 UTC. 3 events (login, 1 step, logout) -> 1 thing.
  await seed('adm-alice', { sid: 'a1', start: '2026-11-01T04:30:00Z', end: '2026-11-01T05:00:00Z', events: [{ at: new Date('2026-11-01T04:30:00Z'), label: 'Logged in' }, edit('2026-11-01T04:40:00Z'), { at: new Date('2026-11-01T05:00:00Z'), label: 'Logged out' }] });
  // 23:50 IST Nov 1 (= 18:20 UTC) and 00:10 IST Nov 2 (= 18:40 UTC): two different India days.
  await seed('adm-alice', { sid: 'a2', start: '2026-11-01T18:20:00Z', end: '2026-11-01T18:25:00Z', events: [{ at: new Date('2026-11-01T18:20:00Z'), label: 'Logged in' }, { at: new Date('2026-11-01T18:25:00Z'), label: 'Logged out' }] });
  await seed('adm-alice', { sid: 'a3', start: '2026-11-01T18:40:00Z', last: '2026-11-01T19:10:00Z', eventCount: 3, events: [{ at: new Date('2026-11-01T18:40:00Z'), label: 'Logged in' }, edit('2026-11-01T18:50:00Z'), edit('2026-11-01T19:10:00Z')] });
  await seed('adm-alice', { sid: 'a4', platform: 'app', start: '2026-11-03T05:00:00Z', end: '2026-11-03T05:10:00Z' });
  await seed('adm-bob', { sid: 'b1', platform: 'app', start: '2026-11-02T05:00:00Z', end: '2026-11-02T05:20:00Z' });

  const all = await getJson('/api/admin/activity/people');
  assert.equal(all.total, 2, 'each person appears once');
  const alice = all.people.find((p) => p.clientId === 'adm-alice');
  assert.equal(alice.name, 'Alice Rao');
  assert.equal(alice.sessions, 4);
  assert.equal(alice.things, 1 + 0 + 2 + 0); // a1: 1, a2: 0, a3 (open): 3-1 = 2, a4: 0
  assert.equal(alice.platform, 'both');
  assert.equal(all.people.find((p) => p.clientId === 'adm-bob').platform, 'app');
  assert.equal(alice.activeNow, false); // her open session was last active in 2026, long ago

  for (const q of ['alice', 'adm-bob', '9000000002', 'bob@example', 'RAO']) {
    const r = await getJson(`/api/admin/activity/people?search=${encodeURIComponent(q)}`);
    assert.equal(r.total, 1, `search "${q}"`);
  }
  assert.equal((await getJson('/api/admin/activity/people?search=nobody-here')).total, 0);
  assert.equal((await getJson('/api/admin/activity/people?platform=app')).total, 2);
  assert.equal((await getJson('/api/admin/activity/people?platform=web')).total, 1);
  assert.equal((await getJson('/api/admin/activity/people?role=client')).total, 2);
  assert.equal((await getJson('/api/admin/activity/people?role=other')).total, 0);
  // date filter uses India days: Nov 2 only holds Alice's a3 (00:10 IST) and Bob's b1
  const nov2 = await getJson('/api/admin/activity/people?from=2026-11-02&to=2026-11-02');
  assert.deepEqual(nov2.people.map((p) => [p.clientId, p.sessions]).sort(), [['adm-alice', 1], ['adm-bob', 1]]);
  const page = await getJson('/api/admin/activity/people?limit=1&page=2');
  assert.equal(page.people.length, 1);
  assert.equal(page.total, 2);
  assert.equal((await call('GET', '/api/admin/activity/people?from=2026-13-40')).status, 400);
  assert.equal((await call('GET', '/api/admin/activity/people?platform=tv')).status, 400);
});

test('person: totals and one card per India day (the day changes at 00:00 IST)', async (t) => {
  if (!dbUp) return t.skip('no local MongoDB');
  const p = await getJson('/api/admin/activity/people/adm-alice');
  assert.equal(p.person.name, 'Alice Rao');
  assert.deepEqual(p.totals, { logins: 4, logouts: 3, things: 3 });
  assert.deepEqual(p.days.map((d) => d.day), ['2026-11-03', '2026-11-02', '2026-11-01']);
  const nov1 = p.days.find((d) => d.day === '2026-11-01');
  assert.deepEqual([nov1.logins, nov1.logouts, nov1.things], [2, 2, 1]); // a1 (10:00 IST) and a2 (23:50 IST)
  assert.equal(nov1.minutes, 30 + 5);
  const nov2 = p.days.find((d) => d.day === '2026-11-02');
  assert.deepEqual([nov2.logins, nov2.logouts, nov2.things, nov2.minutes], [1, 0, 2, 30]); // a3 began 00:10 IST
  assert.equal((await getJson('/api/admin/activity/people/adm-alice?from=2026-11-02&to=2026-11-03')).totals.logins, 2);
  assert.equal((await call('GET', '/api/admin/activity/people/nobody-at-all')).status, 404);
});

test('day and session: sessions of the day, then the steps with before/after', async (t) => {
  if (!dbUp) return t.skip('no local MongoDB');
  const d = await getJson('/api/admin/activity/people/adm-alice/days/2026-11-01');
  assert.deepEqual(d.sessions.map((s) => s.sid), ['a1', 'a2']);
  assert.deepEqual([d.sessions[0].things, d.sessions[0].minutes, d.sessions[0].active, d.sessions[0].endReason], [1, 30, false, 'logout']);
  assert.equal((await call('GET', '/api/admin/activity/people/adm-alice/days/not-a-day')).status, 400);
  const s = await getJson('/api/admin/activity/sessions/a1');
  assert.deepEqual(s.events.map((e) => e.label), ['Logged in', 'Edited profile', 'Logged out']);
  assert.deepEqual(s.events[1].changes, [{ label: 'Headline', before: '', after: 'Hi' }]);
  assert.equal(s.user, 'adm-alice');
  assert.equal((await call('GET', '/api/admin/activity/sessions/nope')).status, 404);
});

test('delete: an active session is refused; a day, a date range, a session and a person are deleted with an audit entry', async (t) => {
  if (!dbUp) return t.skip('no local MongoDB');
  const now = Date.now();
  await seed('adm-carol', { sid: 'c-live', start: new Date(now - 10 * 60000).toISOString(), last: new Date(now - 60000).toISOString() }); // active now
  await seed('adm-carol', { sid: 'c-stale', start: new Date(now - 5 * 3600000).toISOString(), last: new Date(now - 4 * 3600000).toISOString() }); // never logged out, idle
  const live = await getJson('/api/admin/activity/sessions/c-live');
  assert.equal(live.active, true);
  assert.deepEqual(await (await call('DELETE', '/api/admin/activity/sessions/c-live')).json(), { deleted: 0, skippedActive: 1 });
  assert.ok(await S.exists({ sid: 'c-live' }));
  assert.equal((await getJson('/api/admin/activity/people?search=adm-carol')).people[0].activeNow, true);

  // person delete skips the live one but removes the idle one
  assert.deepEqual(await (await call('DELETE', '/api/admin/activity/people/adm-carol')).json(), { deleted: 1, skippedActive: 1 });
  assert.ok(await S.exists({ sid: 'c-live' }));
  assert.equal(await S.exists({ sid: 'c-stale' }), null);

  // one day only
  const day = await (await call('DELETE', '/api/admin/activity/people/adm-alice/days/2026-11-01')).json();
  assert.deepEqual(day, { deleted: 2, skippedActive: 0 });
  assert.deepEqual((await getJson('/api/admin/activity/people/adm-alice')).days.map((d) => d.day), ['2026-11-03', '2026-11-02']);
  // one session
  assert.deepEqual(await (await call('DELETE', '/api/admin/activity/sessions/a4')).json(), { deleted: 1, skippedActive: 0 });
  assert.equal((await call('DELETE', '/api/admin/activity/sessions/a4')).status, 404);
  // a person inside dates only
  assert.deepEqual(await (await call('DELETE', '/api/admin/activity/people/adm-bob?from=2026-11-05&to=2026-11-06')).json(), { deleted: 0, skippedActive: 0 });
  assert.ok(await S.exists({ sid: 'b1' }));
  assert.deepEqual(await (await call('DELETE', '/api/admin/activity/people/adm-bob?from=2026-11-02&to=2026-11-02')).json(), { deleted: 1, skippedActive: 0 });
  assert.equal(await S.exists({ sid: 'b1' }), null);

  const log = await Audit.find({ kind: 'activity' }).sort({ at: 1 }).lean();
  assert.ok(log.length >= 6);
  assert.ok(log.every((l) => l.adminEmail === 'admin@example.test'));
  const personDelete = log.find((l) => l.action === 'activity.delete.person' && l.details.clientId === 'adm-carol');
  assert.deepEqual([personDelete.details.deleted, personDelete.details.skippedActive], [1, 1]);
});
