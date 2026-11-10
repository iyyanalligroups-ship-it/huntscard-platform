// Activity backups admin API tests. Run: node --test test/*.test.js
// Throwaway database on the local MongoDB (never MONGODB_URI), a fake Drive in memory, and a stand-in for
// Google's sign-in servers (no real Google). Skipped (and says so) when no local MongoDB answers.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

process.env.JWT_SECRET = 'test-secret-not-real';
process.env.ACTIVITY_BACKUP_SETTINGS_KEY = `test-settings-routes-${Date.now()}`;
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
process.env.BACKEND_URL = 'http://localhost:4000';
process.env.ADMIN_PANEL_URL = 'http://localhost:5174';
const DB = `huntstag_backup_routes_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

const T = require('../utils/istTime');
const B = require('../utils/activityBackup');
const { decryptSecret } = require('../utils/activityStores');
const { healthOf } = require('../routes/adminActivityBackup');

let dbUp = false;
let server;
let base;
let Session; let File; let Run; let Settings; let Audit; let Admin; let Client;
const tok = {};
const realFetch = global.fetch;

test.before(async () => {
  try {
    await mongoose.connect(`mongodb://127.0.0.1:27017/${DB}`, { serverSelectionTimeoutMS: 2500 });
    dbUp = true;
  } catch { return; }
  Session = require('../models/ActivitySession'); File = require('../models/ActivityBackupFile'); Run = require('../models/ActivityBackupRun');
  Settings = require('../models/ActivityBackupSettings'); Audit = require('../models/AdminAuditLog'); Admin = require('../models/Admin'); Client = require('../models/Client');
  await Promise.all([Session.init(), File.init(), Run.init()]);
  const app = express();
  app.use(express.json());
  app.use('/api/admin/activity-backup', require('../routes/adminActivityBackup'));
  await new Promise((r) => { server = http.createServer(app).listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
  for (const role of ['primeadmin', 'admin', 'subadmin']) {
    const a = await Admin.create({ email: `${role}@example.test`, passwordHash: 'x', role });
    tok[role] = jwt.sign({ type: 'admin', adminId: a._id.toString(), email: a.email, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  }
});

test.after(async () => {
  global.fetch = realFetch;
  B.stopScheduler();
  if (server) await new Promise((r) => server.close(r));
  if (dbUp) { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
});

const skip = (t) => { if (!dbUp) { t.skip('no local MongoDB'); return true; } return false; };
const call = (method, path, { token = tok.primeadmin, body, redirect } = {}) =>
  realFetch(base + path, { method, redirect, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
const get = async (path, token) => (await call('GET', path, { token })).json();
const put = (body) => call('PUT', '/api/admin/activity-backup/settings', { body });
async function resetAll() {
  await Promise.all([Session.deleteMany({}), File.deleteMany({}), Run.deleteMany({}), Audit.deleteMany({}), Settings.deleteMany({}), Client.deleteMany({})]);
}
async function connectDrive() { // as if sign-in had worked
  await Settings.load();
  const { encryptSecret } = require('../utils/activityStores');
  await Settings.updateOne({ key: Settings.settingsKey() }, { $set: { 'drive.refreshTokenEnc': encryptSecret('refresh-token-secret-xyz'), 'drive.email': 'owner@example.test', 'drive.connectedAt': new Date() } });
}
async function waitRun(id, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) {
    const r = await Run.findById(id).lean();
    if (r && r.status !== 'running') return r;
    if (Date.now() > end) throw new Error('run did not finish');
    await new Promise((r2) => setTimeout(r2, 30));
  }
}
class MemStore { // minimal fake Drive, same functions
  constructor() { this.place = 'drive'; this.files = new Map(); this.n = 0; this.gate = null; }
  async ensureFolder(p) { return p.join('/'); }
  async upload({ folderId, name, buffer, existingId }) { if (this.gate) await this.gate; const id = existingId || `f${++this.n}`; this.files.set(id, { folderId, name, size: buffer.length }); return { id, size: buffer.length }; }
  async verify(id) { const f = this.files.get(id); return f ? { exists: true, trashed: false, size: f.size } : { exists: false, trashed: false, size: 0 }; }
  async findFiles(folderId, name) { return [...this.files].filter(([, f]) => f.folderId === folderId && f.name === name).map(([id, f]) => ({ id, size: f.size, trashed: false })); }
  async trash() {}
}

test('Admin Prime and Admin can use the backups API; sub-admins and visitors cannot; the Google callback is public', async (t) => {
  if (skip(t)) return;
  await resetAll();
  assert.equal((await call('GET', '/api/admin/activity-backup/status')).status, 200);
  assert.equal((await call('GET', '/api/admin/activity-backup/status', { token: tok.admin })).status, 200, 'a full admin may open it');
  assert.equal((await call('GET', '/api/admin/activity-backup/status', { token: tok.subadmin })).status, 403);
  assert.equal((await call('GET', '/api/admin/activity-backup/status', { token: null })).status, 401);
  for (const [m, p] of [['PUT', 'settings'], ['POST', 'run'], ['POST', 'run-today'], ['POST', 'google/connect'], ['POST', 'google/disconnect'], ['GET', 'runs'], ['GET', 'history']]) {
    assert.equal((await call(m, `/api/admin/activity-backup/${p}`, { token: tok.subadmin })).status, 403, `${m} ${p}`);
  }
  assert.equal((await call('GET', '/api/admin/activity-backup/google/callback?error=access_denied', { token: null, redirect: 'manual' })).status, 302);
});

test('health banner: stopped / overdue / failed / partial / up to date', () => {
  const now = new Date('2026-11-10T00:00:00Z');
  const on = { enabled: true, nextDueAt: new Date('2026-11-12T00:00:00Z'), lastSavedThrough: '2026-11-08' };
  assert.equal(healthOf({ ...on, enabled: false }, null, now).code, 'stopped');
  assert.equal(healthOf({ ...on, nextDueAt: new Date('2026-11-08T00:00:00Z') }, null, now).code, 'overdue');
  assert.equal(healthOf({ ...on, nextDueAt: new Date('2026-11-09T12:00:00Z') }, null, now).code, 'up_to_date', 'less than a day late is not overdue');
  assert.equal(healthOf(on, { status: 'failed' }, now).code, 'failed');
  const partial = healthOf(on, { status: 'partial', failed: 2 }, now);
  assert.deepEqual([partial.code, partial.level], ['partial', 'warn']);
  assert.match(healthOf(on, { status: 'ok' }, now).message, /through 2026-11-08/);
});

test('status starts stopped, with Google set up on the server but not connected, and never exposes secrets', async (t) => {
  if (skip(t)) return;
  await resetAll();
  const s = await get('/api/admin/activity-backup/status');
  assert.equal(s.health.code, 'stopped');
  assert.deepEqual(s.settings, { enabled: false, intervalDays: 15, timeOfDay: '02:00', storage: 'local', purgeAfterBackup: false });
  assert.deepEqual([s.google.configured, s.google.connected], [true, false]);
  assert.equal(s.google.redirectUri, 'http://localhost:4000/api/admin/activity-backup/google/callback');
  assert.equal(s.running, false);
  await connectDrive();
  const after = JSON.stringify(await get('/api/admin/activity-backup/status'));
  assert.match(after, /owner@example\.test/);
  assert.ok(!after.includes('refresh-token-secret-xyz') && !/refreshTokenEnc|test-google-secret/.test(after));
});

test('settings: validation, start/stop, who changed what, purge needs confirmation and Google Drive', async (t) => {
  if (skip(t)) return;
  await resetAll();
  for (const bad of [{ intervalDays: 0 }, { intervalDays: 91 }, { intervalDays: 1.5 }, { intervalDays: 'x' }, { timeOfDay: '25:00' }, { timeOfDay: '2am' }, { storage: 'ftp' }]) {
    assert.equal((await put(bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await put({ storage: 'drive' })).status, 400, 'Drive needs a connection first');
  assert.equal((await put({ purgeAfterBackup: true, confirmPurge: true })).status, 400, 'purge needs Drive, not the server folder');
  let r = await put({ intervalDays: 7, timeOfDay: '03:30' });
  assert.deepEqual((await r.json()).changed.length, 2);
  r = await put({ enabled: true });
  assert.equal(r.status, 200);
  let s = await get('/api/admin/activity-backup/status');
  assert.equal(s.settings.enabled, true);
  assert.ok(s.nextDueAt && new Date(s.nextDueAt) > new Date(), 'first run is at the next 03:30 India time');
  assert.equal(T.todayKey(new Date(new Date(s.nextDueAt).getTime())) >= T.todayKey(), true);
  assert.equal(s.health.code, 'up_to_date');

  await connectDrive();
  assert.equal((await put({ storage: 'drive', purgeAfterBackup: true })).status, 400, 'no confirmation sent');
  assert.equal((await put({ storage: 'drive', purgeAfterBackup: true, confirmPurge: true })).status, 200);
  s = await get('/api/admin/activity-backup/status');
  assert.deepEqual([s.settings.storage, s.settings.purgeAfterBackup], ['drive', true]);
  assert.equal((await put({ purgeAfterBackup: false })).status, 200); // turning OFF needs no confirmation
  assert.equal((await put({ enabled: false })).status, 200);
  assert.equal((await get('/api/admin/activity-backup/status')).health.code, 'stopped');

  const h = await get('/api/admin/activity-backup/history');
  assert.deepEqual(h.entries.map((e) => e.action).reverse(), ['backup.settings', 'backup.start', 'backup.settings', 'backup.settings', 'backup.stop']);
  assert.ok(h.entries.every((e) => e.by === 'primeadmin@example.test'));
  assert.match(h.entries.at(-1).summary, /how often: every 15 days → every 7 days/);
  assert.match(h.entries.find((e) => /time of day/.test(e.summary)).summary, /time of day: 2:00 am → 3:30 am/);
});

test('Backup now: dates are checked; no dates saves everything not yet saved; today can be chosen; a second start while running is refused', async (t) => {
  if (skip(t)) return;
  await resetAll();
  await Client.create({ clientId: 'rt1', loginEmail: 'rt1@example.test', fullName: 'Route Tester', passwordHash: 'x' });
  const d = T.addDays(T.todayKey(), -2);
  const sess = (sid, day) => Session.create({ sid, user: 'rt1', platform: 'web', startedAt: new Date(T.dayStart(day).getTime() + 4 * 3600000), lastActivityAt: new Date(T.dayStart(day).getTime() + 5 * 3600000), endedAt: new Date(T.dayStart(day).getTime() + 5 * 3600000), eventCount: 2, events: [{ at: new Date(), label: 'Logged in' }, { at: new Date(), label: 'Logged out' }] });
  await sess('rt-1', d);
  const mem = new MemStore();
  B.setStoreFactory(async () => mem);
  const post = (body, p = 'run') => call('POST', `/api/admin/activity-backup/${p}`, { body });
  const status = () => get('/api/admin/activity-backup/status');
  const settled = async () => { for (let i = 0; i < 100 && (await status()).running; i += 1) await new Promise((r) => setTimeout(r, 30)); }; // the lock is released just after the run row turns Done

  // dates must be both or neither, real, in order, and not in the future
  assert.equal((await post({ fromDay: d })).status, 400, 'only one date');
  assert.equal((await post({ toDay: d })).status, 400, 'only one date');
  assert.equal((await post({ fromDay: '2026-13-01', toDay: '2026-13-02' })).status, 400);
  assert.equal((await post({ fromDay: d, toDay: T.addDays(d, -1) })).status, 400);
  const future = await post({ fromDay: d, toDay: T.addDays(T.todayKey(), 1) });
  assert.equal(future.status, 400);
  assert.match((await future.json()).error, /cannot be in the future/);

  // a period, run while another is running: refused
  let release;
  mem.gate = new Promise((r) => { release = r; });
  const started = await post({ fromDay: d, toDay: d });
  assert.equal(started.status, 202);
  const { runId } = await started.json();
  assert.equal((await status()).running, true);
  assert.equal((await post({ fromDay: d, toDay: d })).status, 409);
  release();
  const finished = await waitRun(runId);
  assert.equal(finished.status, 'ok');
  assert.equal(finished.created, 1);
  const runs = await get('/api/admin/activity-backup/runs');
  assert.deepEqual([runs.total, runs.runs[0].trigger, runs.runs[0].startedBy, runs.runs[0].people, runs.runs[0].created, runs.runs[0].fromDay], [1, 'manual', 'primeadmin@example.test', 1, 1, d]);
  await settled();
  assert.equal((await status()).running, false);
  assert.equal((await status()).lastSavedThrough, d, 'the period started at the oldest data and succeeded, so "saved up to" moves');

  // no dates: everything not saved yet, up to yesterday
  const y = T.addDays(T.todayKey(), -1);
  await sess('rt-y', y);
  const auto = await post({});
  assert.equal(auto.status, 202);
  const autoRun = await waitRun((await auto.json()).runId);
  assert.deepEqual([autoRun.fromDay, autoRun.toDay, autoRun.status, autoRun.created, autoRun.includesToday], [T.addDays(d, 1), y, 'ok', 1, false], 'starts the day after "saved up to" and stops at yesterday');
  await settled();
  assert.equal((await status()).lastSavedThrough, y);
  const nothing = await post({});
  assert.equal(nothing.status, 400);
  assert.match((await nothing.json()).error, /Nothing new to save/);

  // today can be chosen: it saves, but moves nothing and never purges
  await sess('rt-today', T.todayKey());
  const withToday = await post({ fromDay: T.todayKey(), toDay: T.todayKey() });
  assert.equal(withToday.status, 202);
  const todayRun = await waitRun((await withToday.json()).runId);
  assert.deepEqual([todayRun.includesToday, todayRun.created, todayRun.status], [true, 1, 'ok']);
  await settled();
  assert.equal((await status()).lastSavedThrough, y, 'a period that includes today does not move "saved up to"');

  // the test button covers today too
  const testRun = await post({}, 'run-today');
  assert.equal(testRun.status, 202);
  const tr = await waitRun((await testRun.json()).runId);
  assert.deepEqual([tr.trigger, tr.includesToday], ['test', true]);
  await settled();

  // a period that starts AFTER older unsaved data must not claim the older days are saved
  await Settings.updateOne({ key: Settings.settingsKey() }, { $set: { lastSavedThrough: null } });
  await sess('rt-old', T.addDays(d, -3));
  const late = await waitRun((await (await post({ fromDay: d, toDay: d })).json()).runId);
  assert.equal(late.status, 'ok');
  await settled();
  assert.equal((await status()).lastSavedThrough, null, 'the older day is still unsaved');
});

test('choosing another place restarts "saved up to" and says so in the change list; names are shown for who did it', async (t) => {
  if (skip(t)) return;
  await resetAll();
  await Admin.updateOne({ email: 'primeadmin@example.test' }, { $set: { name: 'Charles' } });
  await connectDrive();
  await Settings.updateOne({ key: Settings.settingsKey() }, { $set: { enabled: true, lastSavedThrough: '2026-11-08', storage: 'local', nextDueAt: new Date(Date.now() + 10 * 86400000) } });
  assert.equal((await put({ storage: 'drive' })).status, 200);
  const st = await get('/api/admin/activity-backup/status');
  assert.equal(st.settings.storage, 'drive');
  assert.equal(st.lastSavedThrough, null, 'nothing is saved in the new place yet');
  assert.ok(new Date(st.nextDueAt) < new Date(Date.now() + 2 * 86400000), 'the next run is soon, so the new place is filled from the start');
  const h = await get('/api/admin/activity-backup/history');
  assert.match(h.entries[0].summary, /where files are saved: server folder → Google Drive \(all days will be saved there from the start\)/);
  assert.equal(h.entries[0].byName, 'Charles');
  assert.equal(h.entries[0].by, 'primeadmin@example.test');
  // choosing the same place again changes nothing
  const again = await (await put({ storage: 'drive' })).json();
  assert.deepEqual(again.changed, []);
});

test('runs list is paged 10 at a time from the API; retry only works for runs that have failures', async (t) => {
  if (skip(t)) return;
  await resetAll();
  const rows = Array.from({ length: 12 }, (_, i) => ({ trigger: 'manual', place: 'local', status: 'ok', fromDay: '2026-10-01', toDay: '2026-10-02', startedAt: new Date(Date.now() - i * 60000) }));
  const failedRun = await Run.create({ ...rows[0], status: 'partial', failed: 1, startedAt: new Date(Date.now() + 60000), failures: [{ user: 'zzz', day: '2026-10-01', reason: 'Backend Error' }] });
  await Run.insertMany(rows);
  const p1 = await get('/api/admin/activity-backup/runs');
  const p2 = await get('/api/admin/activity-backup/runs?page=2');
  assert.deepEqual([p1.total, p1.runs.length, p2.runs.length, p1.limit], [13, 10, 3, 10]);
  assert.equal(p1.runs[0].failures[0].reason, 'Backend Error');
  const okRun = p2.runs[0];
  assert.equal((await call('POST', `/api/admin/activity-backup/runs/${okRun.id}/retry`)).status, 400);
  assert.equal((await call('POST', '/api/admin/activity-backup/runs/not-an-id/retry')).status, 404);
  B.setStoreFactory(async () => new MemStore());
  const r = await call('POST', `/api/admin/activity-backup/runs/${failedRun._id}/retry`);
  assert.equal(r.status, 202);
  await waitRun((await r.json()).runId);
});

test('Google connect: the sign-in link asks for Drive file access only, offline, with consent, and a signed state', async (t) => {
  if (skip(t)) return;
  const r = await call('POST', '/api/admin/activity-backup/google/connect');
  const { url } = await r.json();
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(u.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.file');
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.equal(u.searchParams.get('prompt'), 'consent');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('redirect_uri'), 'http://localhost:4000/api/admin/activity-backup/google/callback');
  assert.equal(u.searchParams.get('client_id'), process.env.GOOGLE_CLIENT_ID);
  assert.ok(!url.includes(process.env.GOOGLE_CLIENT_SECRET));
  assert.equal(jwt.verify(u.searchParams.get('state'), process.env.JWT_SECRET).adminEmail, 'primeadmin@example.test');
});

// A stand-in for Google: token exchange, folder search/create, and "about".
function fakeGoogle({ refresh = true, scope = 'https://www.googleapis.com/auth/drive.file', tokenOk = true } = {}) {
  const seen = [];
  global.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.startsWith('http://127.0.0.1')) return realFetch(input, init);
    seen.push({ url, method: init.method || 'GET', body: init.body ? String(init.body) : '' });
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      if (!tokenOk) return json({ error: 'invalid_grant' }, 400);
      return json({ access_token: 'access-abc', expires_in: 3600, scope, ...(refresh ? { refresh_token: 'REAL-REFRESH-TOKEN-123' } : {}) });
    }
    if (url.startsWith('https://oauth2.googleapis.com/revoke')) return json({});
    if (url.includes('/drive/v3/about')) return json({ user: { emailAddress: 'owner@example.test' } });
    if (url.includes('/drive/v3/files?') && (init.method || 'GET') === 'GET') return json({ files: [] });
    if (url.includes('/drive/v3/files?') && init.method === 'POST') return json({ id: `fld${seen.length}` });
    return json({}, 404);
  };
  return seen;
}
const state = () => jwt.sign({ type: 'activity-google', adminEmail: 'primeadmin@example.test' }, process.env.JWT_SECRET, { expiresIn: '10m' });
const callback = async (qs) => {
  const r = await realFetch(`${base}/api/admin/activity-backup/google/callback?${new URLSearchParams(qs)}`, { redirect: 'manual' });
  return r.headers.get('location');
};
const reasonOf = (location) => new URL(location).searchParams.get('reason') || ''; // decodes the '+' signs too

test('Google callback: saves the refresh token encrypted, creates the folders, shows the account; bad or denied sign-ins are refused', async (t) => {
  if (skip(t)) return;
  await resetAll();
  const seen = fakeGoogle();
  try {
    assert.match(await callback({ code: 'c1', state: 'forged.state.value' }), /google=error/);
    assert.match(await callback({ code: 'c1', state: jwt.sign({ type: 'activity-google' }, 'wrong-secret') }), /google=error/);
    assert.match(await callback({ error: 'access_denied' }), /google=error&reason=access_denied/);
    assert.match(await callback({ state: state() }), /google=error/, 'no code');
    assert.equal(seen.length, 0, 'nothing was sent to Google for any of those');

    const loc = await callback({ code: 'good-code', state: state() });
    assert.equal(loc, 'http://localhost:5174/dashboard/activity-backups?google=connected');
    const tokenCall = seen.find((c) => c.url.startsWith('https://oauth2.googleapis.com/token'));
    assert.match(tokenCall.body, /grant_type=authorization_code/);
    assert.match(tokenCall.body, /redirect_uri=http%3A%2F%2Flocalhost%3A4000%2Fapi%2Fadmin%2Factivity-backup%2Fgoogle%2Fcallback/);
    assert.ok(seen.some((c) => c.method === 'POST' && c.body.includes('application/vnd.google-apps.folder') && c.body.includes('HuntsTAG')), 'root folder created');
    assert.ok(seen.some((c) => c.body.includes('Activity Logs')), 'Activity Logs folder created');
    const st = await Settings.findOne({ key: Settings.settingsKey() }).lean();
    assert.ok(st.drive.refreshTokenEnc && !JSON.stringify(st).includes('REAL-REFRESH-TOKEN-123'), 'stored encrypted, not as plain text');
    assert.equal(decryptSecret(st.drive.refreshTokenEnc), 'REAL-REFRESH-TOKEN-123');
    assert.equal(st.drive.email, 'owner@example.test');
    const status = JSON.stringify(await get('/api/admin/activity-backup/status'));
    assert.ok(!status.includes('REAL-REFRESH-TOKEN-123'));
    assert.equal((await Audit.findOne({ action: 'google.connect' })).adminEmail, 'primeadmin@example.test');

    // Google gives no long-lived token / a wrong scope / refuses the code
    await Settings.deleteMany({});
    fakeGoogle({ refresh: false });
    assert.match(reasonOf(await callback({ code: 'c', state: state() })), /did not give a long-lived connection/);
    fakeGoogle({ scope: 'https://www.googleapis.com/auth/drive' });
    assert.match(reasonOf(await callback({ code: 'c', state: state() })), /Drive access was not allowed/);
    fakeGoogle({ tokenOk: false });
    assert.match(reasonOf(await callback({ code: 'c', state: state() })), /Google refused the sign-in \(invalid_grant\)/);
    assert.equal((await get('/api/admin/activity-backup/status')).google.connected, false);
  } finally { global.fetch = realFetch; }
});

test('disconnect removes the saved token, revokes it, and stops a schedule that used Drive', async (t) => {
  if (skip(t)) return;
  await resetAll();
  await connectDrive();
  await Settings.updateOne({ key: Settings.settingsKey() }, { $set: { storage: 'drive', enabled: true, purgeAfterBackup: true } });
  const seen = fakeGoogle();
  try {
    assert.equal((await call('POST', '/api/admin/activity-backup/google/disconnect')).status, 200);
  } finally { global.fetch = realFetch; }
  assert.ok(seen.some((c) => c.url.startsWith('https://oauth2.googleapis.com/revoke')));
  const s = await get('/api/admin/activity-backup/status');
  assert.deepEqual([s.google.connected, s.settings.storage, s.settings.enabled, s.settings.purgeAfterBackup], [false, 'local', false, false]);
  const st = await Settings.findOne({ key: Settings.settingsKey() }).lean();
  assert.equal(st.drive.refreshTokenEnc, null);
});

test('without a connection, a Drive run fails clearly and starts nothing', async (t) => {
  if (skip(t)) return;
  await resetAll();
  await Settings.load();
  await Settings.updateOne({ key: Settings.settingsKey() }, { $set: { storage: 'drive' } });
  B.setStoreFactory(null); // the real factory
  B.setStoreFactory(async (settings) => { throw Object.assign(new Error('Google Drive is not connected. Press "Connect Google Drive" first.'), { fatal: true }); });
  const d = T.addDays(T.todayKey(), -2);
  const r = await call('POST', '/api/admin/activity-backup/run', { body: { fromDay: d, toDay: d } });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /not connected/);
  assert.equal(await Run.countDocuments({}), 0);
  assert.equal((await get('/api/admin/activity-backup/status')).running, false, 'the lock was released');
});
