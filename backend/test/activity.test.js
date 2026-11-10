// Activity tracking tests. Run: node --test test/
// Uses the REAL models against a THROWAWAY database on the local MongoDB (127.0.0.1), created for this
// run and dropped at the end. It never reads MONGODB_URI, so it cannot touch real data. If no local
// MongoDB answers, these tests are skipped (and say so).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

process.env.JWT_SECRET = 'test-secret-not-real';
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET = 'dummy-razorpay-secret';
process.env.BACKEND_URL = 'http://localhost:4000';
process.env.PUBLIC_BASE_URL = 'http://localhost:5173';

const DB = `huntstag_activity_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const URI = `mongodb://127.0.0.1:27017/${DB}`;

const activity = require('../utils/activityLog');

// ---- pure helpers (no database needed) ----
test('labels: known routes get a readable name, unknown GET is not logged, unknown write is logged as METHOD path', () => {
  assert.deepEqual(activity.labelFor('PUT', '/api/profile/me'), { log: true, label: 'Edited profile', ref: '', windowMs: 30000 });
  assert.equal(activity.labelFor('PUT', '/api/profile/contacts/abc123').ref, 'abc123');
  assert.equal(activity.labelFor('GET', '/api/profile/notifications').windowMs, 5 * 60 * 1000); // polls repeat less
  assert.deepEqual(activity.labelFor('GET', '/api/profile/cards'), { log: false });
  assert.deepEqual(activity.labelFor('POST', '/api/profile/card-checkout/pricing'), { log: false }); // preview, not an action
  assert.equal(activity.labelFor('POST', '/api/profile/some-new-thing').label, 'POST /api/profile/some-new-thing');
});

test('platform: the app header or an app user-agent means app, a browser means web', () => {
  assert.equal(activity.platformOf({ headers: { 'x-client-platform': 'app' } }), 'app');
  assert.equal(activity.platformOf({ headers: { 'user-agent': 'okhttp/4.12.0' } }), 'app');
  assert.equal(activity.platformOf({ headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/130' } }), 'web');
});

test('before/after: shows changes only, hides secrets, and can hide all values', () => {
  const before = { headline: 'Old', bio: '', password: 'abc', phone: '111' };
  const after = { headline: 'New', bio: '', password: 'xyz', phone: '111' };
  const d = activity.diffFields(before, after, ['headline', 'bio', 'password', 'phone']);
  assert.deepEqual(d, [
    { label: 'Headline', before: 'Old', after: 'New' },
    { label: 'Password', before: '(hidden)', after: '(hidden)' },
  ]);
  const hidden = activity.diffFields({ phone: '111' }, { phone: '222' }, ['phone'], { hideValues: true });
  assert.deepEqual(hidden, [{ label: 'Phone', before: '(hidden)', after: '(hidden)' }]);
  assert.deepEqual(activity.diffFields(before, before, ['headline']), []);
  assert.equal(activity.diffFields({ bio: '' }, { bio: 'x'.repeat(500) }, ['bio'])[0].after.length, 120);
});

// ---- database-backed tests ----
let server;
let base;
let ActivitySession;
let Client;
let dbUp = false;

test.before(async () => {
  try {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 2500 });
    dbUp = true;
  } catch {
    return;
  }
  ActivitySession = require('../models/ActivitySession');
  Client = require('../models/Client');
  await ActivitySession.init();
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/profile', require('../routes/profile'));
  app.use('/api/profile', require('../routes/contacts'));
  await new Promise((r) => { server = http.createServer(app).listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (dbUp) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

const call = (method, path, { token, body, headers } = {}) =>
  fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });

// The tracker writes after the response, so wait until the condition is true.
async function waitFor(fn, ms = 4000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await new Promise((r) => setTimeout(r, 40));
  }
}
const session = (sid) => ActivitySession.findOne({ sid }).lean();
const labels = (s) => s.events.map((e) => e.label);

async function makeClient(tag) {
  const clientId = `act-${tag}-${Math.floor(Math.random() * 1e6)}`;
  const loginEmail = `${clientId}@example.test`;
  await Client.create({ clientId, loginEmail, fullName: 'Test Person', passwordHash: await bcrypt.hash('Passw0rd!x', 4) });
  return { clientId, loginEmail };
}
async function login(c) {
  const res = await call('POST', '/api/auth/login', { body: { identifier: c.loginEmail, password: 'Passw0rd!x' }, headers: { 'user-agent': 'Mozilla/5.0 Chrome/130' } });
  assert.equal(res.status, 200);
  const { token } = await res.json();
  return { token, sid: jwt.decode(token).sid };
}

test('a login creates one session with "Logged in" and a sid in the token', async (t) => {
  if (!dbUp) return t.skip('no local MongoDB');
  const c = await makeClient('login');
  const a = await login(c);
  assert.ok(a.sid && a.sid.length >= 20);
  const s = await waitFor(() => session(a.sid));
  assert.ok(s, 'session row was written');
  assert.equal(s.user, c.clientId);
  assert.equal(s.platform, 'web');
  assert.equal(s.endedAt, null);
  assert.deepEqual(labels(s), ['Logged in']);
  const b = await login(c); // a second login is a second session
  assert.notEqual(a.sid, b.sid);
  assert.ok(await waitFor(() => session(b.sid)), 'the second session was written'); // it is written in the background
  assert.equal(await ActivitySession.countDocuments({ user: c.clientId }), 2);
});

test('steps get readable names, with before/after; polls and failed calls are not logged', async (t) => {
  if (!dbUp) return t.skip('no local MongoDB');
  const c = await makeClient('steps');
  const { token, sid } = await login(c);
  assert.equal((await call('GET', '/api/profile/me', { token })).status, 200); // read: not a step
  assert.equal((await call('PUT', '/api/profile/me', { token, body: { gender: 'bogus' } })).status, 400); // failed: not a step
  assert.equal((await call('PUT', '/api/profile/me', { token, body: { headline: 'Hello there' } })).status, 200);
  const s = await waitFor(async () => {
    const x = await session(sid);
    return x && x.events.some((e) => e.label === 'Edited profile') ? x : null;
  });
  assert.ok(s, 'edit step recorded');
  assert.deepEqual(labels(s), ['Logged in', 'Edited profile']);
  const edit = s.events[1];
  assert.deepEqual(edit.changes, [{ label: 'Headline', before: '', after: 'Hello there' }]);
  assert.equal(edit.status, 200);
  assert.equal(s.eventCount, 2);
  assert.ok(s.lastActivityAt >= s.startedAt);
});

test('the same step twice within 30 seconds is kept once', async (t) => {
  if (!dbUp) return t.skip('no local MongoDB');
  const c = await makeClient('repeat');
  const { token, sid } = await login(c);
  await call('POST', '/api/profile/pause-card', { token });
  await call('POST', '/api/profile/pause-card', { token });
  await call('POST', '/api/profile/unpause-card', { token }); // a different step is never dropped
  const s = await waitFor(async () => {
    const x = await session(sid);
    return x && x.events.some((e) => e.label === 'Resumed card') ? x : null;
  });
  assert.ok(s);
  assert.deepEqual(labels(s), ['Logged in', 'Paused card', 'Resumed card']);
});

test('refresh keeps the same sid, so it stays one session', async (t) => {
  if (!dbUp) return t.skip('no local MongoDB');
  const c = await makeClient('refresh');
  const { token, sid } = await login(c);
  const res = await call('POST', '/api/auth/refresh', { body: { token } });
  assert.equal(res.status, 200);
  const next = (await res.json()).token;
  assert.equal(jwt.decode(next).sid, sid);
  assert.equal(jwt.decode(next).sst, jwt.decode(token).sst);
  assert.equal(await ActivitySession.countDocuments({ user: c.clientId }), 1);
});

test('an old token without a sid is not tracked and keeps working', async (t) => {
  if (!dbUp) return t.skip('no local MongoDB');
  const c = await makeClient('old');
  const old = jwt.sign({ type: 'client', clientId: c.clientId, loginEmail: c.loginEmail }, process.env.JWT_SECRET, { expiresIn: '1h' });
  assert.equal((await call('GET', '/api/profile/me', { token: old })).status, 200);
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(await ActivitySession.countDocuments({ user: c.clientId }), 0);
});

test('"admin viewing as user" and admin tokens are never tracked', async (t) => {
  if (!dbUp) return t.skip('no local MongoDB');
  const c = await makeClient('imp');
  const imp = jwt.sign({ type: 'client', clientId: c.clientId, loginEmail: c.loginEmail, sid: 'imp-sid-1', impersonatedBy: 'admin@example.test' }, process.env.JWT_SECRET, { expiresIn: '20m' });
  assert.equal((await call('PUT', '/api/profile/me', { token: imp, body: { headline: 'by admin' } })).status, 200);
  const adm = jwt.sign({ type: 'admin', adminId: 'x', email: 'a@example.test', sid: 'adm-sid-1' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  assert.equal((await call('GET', '/api/profile/me', { token: adm })).status, 403);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(await ActivitySession.countDocuments({ sid: { $in: ['imp-sid-1', 'adm-sid-1'] } }), 0);
});

test('logout ends the session, adds "Logged out", and later calls add nothing', async (t) => {
  if (!dbUp) return t.skip('no local MongoDB');
  const c = await makeClient('logout');
  const { token, sid } = await login(c);
  await call('POST', '/api/profile/pause-card', { token });
  assert.ok(await waitFor(async () => (await session(sid)).events.length === 2));
  const out = await call('POST', '/api/auth/logout', { token });
  assert.equal(out.status, 200);
  const s = await waitFor(async () => {
    const x = await session(sid);
    return x.endedAt ? x : null;
  });
  assert.ok(s, 'session was ended');
  assert.equal(s.endReason, 'logout');
  assert.deepEqual(labels(s), ['Logged in', 'Paused card', 'Logged out']);
  assert.equal(s.eventCount, 3);
  // The token is still valid for a while: using it again must not reopen or extend the ended session.
  await call('POST', '/api/profile/unpause-card', { token });
  await new Promise((r) => setTimeout(r, 250));
  const after = await session(sid);
  assert.deepEqual(labels(after), ['Logged in', 'Paused card', 'Logged out']);
  assert.equal(String(after.endedAt), String(s.endedAt));
});

test('switching account ends the session as "switched"; logout with a bad token still answers ok', async (t) => {
  if (!dbUp) return t.skip('no local MongoDB');
  const c = await makeClient('switch');
  const { token, sid } = await login(c);
  await call('POST', '/api/auth/logout', { token, body: { reason: 'switched' } });
  const s = await waitFor(async () => {
    const x = await session(sid);
    return x.endedAt ? x : null;
  });
  assert.equal(s.endReason, 'switched');
  assert.equal(s.events.at(-1).label, 'Switched account');
  assert.equal((await call('POST', '/api/auth/logout', { token: 'garbage' })).status, 200);
  assert.equal((await call('POST', '/api/auth/logout')).status, 200);
});

test('tracking failures never break a request', async (t) => {
  if (!dbUp) return t.skip('no local MongoDB');
  const c = await makeClient('fail');
  const { token } = await login(c);
  const orig = ActivitySession.updateOne;
  ActivitySession.updateOne = () => Promise.reject(new Error('database write failed'));
  try {
    const res = await call('PUT', '/api/profile/me', { token, body: { headline: 'still works' } });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).headline, 'still works');
    await new Promise((r) => setTimeout(r, 200)); // the swallowed error must not crash the process
  } finally {
    ActivitySession.updateOne = orig;
  }
});
