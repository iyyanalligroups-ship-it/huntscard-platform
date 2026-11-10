// Activity backup tests. Run: node --test test/*.test.js
// Uses a FAKE Google Drive in memory (no network, no Google) and a throwaway server folder, on a
// THROWAWAY database on the local MongoDB (never MONGODB_URI). Everything is deleted at the end.
// Skipped (and says so) when no local MongoDB answers.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const mongoose = require('mongoose');

process.env.JWT_SECRET = 'test-secret-not-real';
process.env.ACTIVITY_BACKUP_SETTINGS_KEY = `test-settings-${Date.now()}`;
const DB = `huntstag_backup_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const LOCAL_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'activity-backup-test-'));

const { fatal, LocalStore } = require('../utils/activityStores');
const T = require('../utils/istTime');
const B = require('../utils/activityBackup');

let dbUp = false;
let Session;
let File;
let Run;
let Settings;
let Audit;
let Client;

// ---- fake Google Drive ----
class FakeDrive {
  constructor() { this.place = 'drive'; this.files = new Map(); this.folders = new Map(); this.seq = 0; this.uploads = []; this.hooks = {}; }
  guard() { if (this.refuse) throw fatal('Google refused the saved connection (it was revoked or expired). Connect Google Drive again.'); }
  async ensureFolder(parts) {
    this.guard();
    const key = parts.join('/');
    if (!this.folders.has(key)) this.folders.set(key, `folder${++this.seq}`);
    return this.folders.get(key);
  }
  async upload({ folderId, name, buffer, existingId }) {
    this.guard();
    const folder = [...this.folders].find(([, id]) => id === folderId)[0]; // e.g. 'Activity Logs/u1 - Asha Rao'
    this.uploads.push({ name, folder, update: !!existingId });
    if (this.failUpload && this.failUpload(name, folder)) throw new Error('Google Drive said: Backend Error');
    if (this.hooks.beforeUpload) await this.hooks.beforeUpload(name, folder);
    let id = existingId;
    if (id && this.files.has(id)) Object.assign(this.files.get(id), { name, buf: buffer });
    else { id = `file${++this.seq}`; this.files.set(id, { name, folderId, buf: buffer, trashed: false }); }
    if (this.dropUploads && this.dropUploads(name, folder)) this.files.delete(id); // saved, but not there when asked
    if (this.hooks.afterUpload) await this.hooks.afterUpload(name, folder);
    return { id, size: buffer.length };
  }
  async verify(id) {
    this.guard();
    const f = this.files.get(id);
    return f ? { exists: true, trashed: f.trashed, size: f.buf.length } : { exists: false, trashed: false, size: 0 };
  }
  async findFiles(folderId, name) {
    this.guard();
    return [...this.files].filter(([, f]) => f.folderId === folderId && f.name === name && !f.trashed).map(([id, f]) => ({ id, size: f.buf.length, trashed: false }));
  }
  async trash(id) { this.guard(); const f = this.files.get(id); if (f) f.trashed = true; }
  live() { return [...this.files.values()].filter((f) => !f.trashed); }
  liveNames() { return this.live().map((f) => f.name).sort(); }
}

// ---- helpers ----
const today = () => T.todayKey();
const day = (back) => T.addDays(today(), -back);
let n = 0;
// A finished session of `user` on India day `d`: login, `steps` steps, logout.
function seed(user, d, { steps = 1, ended = true, at = 4, last, sid } = {}) {
  n += 1;
  const startedAt = new Date(T.dayStart(d).getTime() + at * 3600000);
  const events = [{ at: startedAt, label: 'Logged in' }];
  for (let i = 0; i < steps; i += 1) events.push({ at: new Date(startedAt.getTime() + (i + 1) * 60000), label: 'Edited profile', changes: [{ label: 'Headline', before: `old ${i}`, after: `new ${i}` }] });
  const endedAt = ended ? new Date(startedAt.getTime() + (steps + 2) * 60000) : null;
  if (ended) events.push({ at: endedAt, label: 'Logged out' });
  return Session.create({ sid: sid || `bk-${n}`, user, platform: 'web', startedAt, lastActivityAt: last ? new Date(last) : endedAt || new Date(startedAt.getTime() + steps * 60000), endedAt, endReason: ended ? 'logout' : null, eventCount: events.length, events });
}
async function reset() {
  await Promise.all([Session.deleteMany({}), File.deleteMany({}), Run.deleteMany({}), Audit.deleteMany({}), Settings.deleteMany({}), Client.deleteMany({})]);
  await Client.create({ clientId: 'u1', loginEmail: 'u1@example.test', fullName: 'Asha Rao', passwordHash: 'x' });
  await Client.create({ clientId: 'u2', loginEmail: 'u2@example.test', fullName: 'Bela / Das', passwordHash: 'x' });
}
async function run(drive, opts = {}) {
  B.setStoreFactory(async () => drive);
  const { done } = await B.launchBackup({ trigger: 'manual', startedBy: 'admin@example.test', fromDay: day(5), toDay: day(1), ...opts });
  return done;
}

// Reads one file out of a .docx (zip) with no zip library: central directory -> local header -> inflate.
function zipEntry(buf, name) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  assert.ok(eocd >= 0, 'zip end record');
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < buf.readUInt16LE(eocd + 10); i += 1) {
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    if (buf.toString('utf8', p + 46, p + 46 + nlen) === name) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const raw = buf.subarray(start, start + csize);
      return (method === 8 ? zlib.inflateRawSync(raw) : raw).toString('utf8');
    }
    p += 46 + nlen + elen + clen;
  }
  return null;
}

test.before(async () => {
  try {
    await mongoose.connect(`mongodb://127.0.0.1:27017/${DB}`, { serverSelectionTimeoutMS: 2500 });
    dbUp = true;
  } catch { return; }
  Session = require('../models/ActivitySession');
  File = require('../models/ActivityBackupFile');
  Run = require('../models/ActivityBackupRun');
  Settings = require('../models/ActivityBackupSettings');
  Audit = require('../models/AdminAuditLog');
  Client = require('../models/Client');
  await Promise.all([Session.init(), File.init(), Run.init()]);
});

test.after(async () => {
  B.stopScheduler();
  fs.rmSync(LOCAL_DIR, { recursive: true, force: true });
  if (dbUp) { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
});

const skip = (t) => { if (!dbUp) { t.skip('no local MongoDB'); return true; } return false; };

test('schedule maths: India time, due slot, next cycle', () => {
  assert.equal(B.dueAt('2026-11-10', '02:00').toISOString(), '2026-11-09T20:30:00.000Z');
  assert.equal(B.nextSlot(new Date('2026-11-09T20:00:00Z'), '02:00').toISOString(), '2026-11-09T20:30:00.000Z'); // 01:30 IST -> 02:00 IST today
  assert.equal(B.nextSlot(new Date('2026-11-09T21:00:00Z'), '02:00').toISOString(), '2026-11-10T20:30:00.000Z'); // 02:30 IST -> tomorrow
  assert.equal(B.nextCycle(new Date('2026-11-09T21:00:00Z'), 15, '02:00').toISOString(), '2026-11-24T20:30:00.000Z');
});

test('first run saves one file per person per day, in <Root>/Activity Logs/<ID - Name>/<day>.docx, and confirms each', async (t) => {
  if (skip(t)) return;
  await reset();
  await seed('u1', day(3)); await seed('u1', day(3), { at: 9 }); await seed('u1', day(2)); await seed('u2', day(3)); await seed('u2', day(2));
  const drive = new FakeDrive();
  const r = await run(drive);
  assert.equal(r.status, 'ok');
  assert.deepEqual([r.created, r.replaced, r.unchanged, r.failed, r.people], [4, 0, 0, 0, 2]); // two sessions of u1 on one day = one file
  assert.deepEqual(drive.liveNames(), [`${day(3)}.docx`, `${day(3)}.docx`, `${day(2)}.docx`, `${day(2)}.docx`].sort());
  assert.deepEqual([...drive.folders.keys()].sort(), ['Activity Logs', 'Activity Logs/u1 - Asha Rao', 'Activity Logs/u2 - Bela Das'].sort().filter((k) => k !== 'Activity Logs'));
  const recs = await File.find({}).lean();
  assert.equal(recs.length, 4);
  assert.ok(recs.every((x) => x.confirmedAt && x.place === 'drive' && x.size > 0 && x.fileId));
  assert.ok(r.bytes > 0 && r.finishedAt);
  const sizes = drive.live().map((f) => f.buf.length);
  assert.ok(Math.max(...sizes) < 4000, `files are small: ${sizes}`);
});

test('running again makes no duplicates; a changed day is replaced in place; a day with no change is "unchanged"', async (t) => {
  if (skip(t)) return;
  await reset();
  await seed('u1', day(3)); await seed('u2', day(3)); await seed('u1', day(2));
  const drive = new FakeDrive();
  await run(drive);
  const ids = [...drive.files.keys()].sort();
  const again = await run(drive);
  assert.deepEqual([again.created, again.replaced, again.unchanged, again.failed], [0, 0, 3, 0]);
  assert.deepEqual([...drive.files.keys()].sort(), ids, 'same files, nothing new');
  assert.equal(drive.uploads.length, 3, 'nothing was uploaded the second time');

  await seed('u1', day(3), { at: 10, steps: 3 }); // u1 did more on that day
  const third = await run(drive);
  assert.deepEqual([third.created, third.replaced, third.unchanged], [0, 1, 2]);
  assert.deepEqual([...drive.files.keys()].sort(), ids, 'updated in place, still no duplicate');
  assert.equal(drive.live().length, 3);
  const rec = await File.findOne({ user: 'u1', day: day(3) });
  assert.equal(rec.sessionCount, 2);
});

test('two same-name files already in Drive: one is kept, the extra goes to the bin', async (t) => {
  if (skip(t)) return;
  await reset();
  await seed('u1', day(3));
  const drive = new FakeDrive();
  const folder = await drive.ensureFolder(['Activity Logs', 'u1 - Asha Rao']);
  for (let i = 0; i < 2; i += 1) drive.files.set(`old${i}`, { name: `${day(3)}.docx`, folderId: folder, buf: Buffer.from('x'), trashed: false });
  const r = await run(drive);
  assert.equal(r.status, 'ok');
  assert.equal(drive.live().length, 1);
  assert.equal([...drive.files.values()].filter((f) => f.trashed).length, 1);
});

test('a remembered file that was moved to the Drive bin or deleted is written again as a fresh file', async (t) => {
  if (skip(t)) return;
  await reset();
  await seed('u1', day(3)); await seed('u2', day(3));
  const drive = new FakeDrive();
  await run(drive);
  const r1 = await File.findOne({ user: 'u1' });
  const r2 = await File.findOne({ user: 'u2' });
  drive.files.get(r1.fileId).trashed = true; // someone binned it
  drive.files.delete(r2.fileId); // someone deleted it for good
  const r = await run(drive);
  assert.equal(r.status, 'ok');
  assert.deepEqual([r.replaced, r.unchanged, r.failed], [2, 0, 0]);
  assert.equal(drive.live().length, 2);
  for (const u of ['u1', 'u2']) {
    const rec = await File.findOne({ user: u });
    assert.ok(drive.files.has(rec.fileId) && !drive.files.get(rec.fileId).trashed, `${u} has a live file`);
  }
});

test('a file that cannot be confirmed is written once more, then fails with a clear reason', async (t) => {
  if (skip(t)) return;
  await reset();
  await seed('u1', day(3)); await seed('u2', day(3));
  const drive = new FakeDrive();
  drive.dropUploads = (name, folder) => folder.includes('u2'); // u2's files vanish after saving
  const r = await run(drive);
  assert.equal(r.status, 'partial');
  assert.deepEqual([r.created, r.failed], [1, 1]);
  assert.equal(r.failures[0].user, 'u2');
  assert.match(r.failures[0].reason, /Could not confirm .*after saving it twice: the file is not there/);
  assert.equal(drive.uploads.filter((u) => u.folder.includes('u1')).length, 1);
  assert.equal(drive.uploads.filter((u) => u.folder.includes('u2')).length, 2, 'written once more before giving up');
  assert.equal(await File.countDocuments({ user: 'u2' }), 0, 'an unconfirmed file is never remembered as saved');
});

test('one failed person -> partial, alert, "saved through" does NOT move; retry redoes only that file and then it moves', async (t) => {
  if (skip(t)) return;
  await reset();
  const s = await Settings.load();
  await Settings.updateOne({ key: s.key }, { $set: { enabled: true, intervalDays: 7, nextDueAt: new Date(Date.now() - 3600000), storage: 'drive' } });
  await seed('u1', day(2)); await seed('u2', day(2)); await seed('u1', day(1));
  const drive = new FakeDrive();
  B.setStoreFactory(async () => drive);
  drive.failUpload = (name, folder) => folder.includes('u2') && name === `${day(2)}.docx`;

  const out = await B.scheduleTick(new Date());
  assert.equal(out.run.status, 'partial');
  assert.deepEqual([out.run.created, out.run.failed], [2, 1]);
  assert.match(out.run.failures[0].reason, /Backend Error/);
  let st = await Settings.findOne({ key: s.key }).lean();
  assert.equal(st.lastSavedThrough, null, 'not marked saved');
  assert.equal(st.lastRunStatus, 'partial');
  assert.ok(st.retryAt > new Date(Date.now() + 5 * 3600000), 'try again in about 6 hours');
  const alerts = await Audit.find({ kind: 'alert' }).lean();
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].summary, /finished with failures: 1 file/);
  assert.deepEqual((await B.scheduleTick(new Date())).skipped, 'not due', 'no new attempt before the retry time');

  drive.failUpload = null; // the problem is fixed
  const before = drive.uploads.length;
  const { done } = await B.retryFailed(out.run._id, 'admin@example.test');
  const retried = await done;
  assert.equal(retried.status, 'ok');
  assert.deepEqual([retried.created, retried.unchanged, retried.people], [1, 0, 1]);
  assert.equal(drive.uploads.length - before, 1, 'only the failed file was uploaded');
  assert.equal(retried.trigger, 'retry');
  assert.equal(drive.live().length, 3);

  await Settings.updateOne({ key: s.key }, { $set: { retryAt: null } }); // now the next scheduled run saves everything
  const again = await B.scheduleTick(new Date());
  assert.equal(again.run.status, 'ok');
  assert.equal(again.run.unchanged, 3);
  st = await Settings.findOne({ key: s.key }).lean();
  assert.equal(st.lastSavedThrough, day(1), 'moves forward only now, to yesterday');
  assert.ok(st.nextDueAt > new Date(Date.now() + 6 * 86400000), 'next run in about 7 days');
  assert.equal(st.retryAt, null);
});

test('a refused Google connection fails clearly, saves nothing, and does not hammer every file', async (t) => {
  if (skip(t)) return;
  await reset();
  await seed('u1', day(3)); await seed('u2', day(3)); await seed('u1', day(2)); await seed('u2', day(2)); await seed('u1', day(4));
  const drive = new FakeDrive();
  drive.refuse = true;
  const r = await run(drive);
  assert.equal(r.status, 'failed');
  assert.equal(r.created + r.replaced + r.unchanged, 0);
  assert.equal(r.failed, 5);
  assert.match(r.failures[0].reason, /Connect Google Drive again/);
  assert.ok(r.failures.every((f) => /Connect Google Drive again/.test(f.reason)));
  assert.equal(await File.countDocuments({}), 0);
  assert.equal(drive.files.size, 0);
});

test('the scheduler: stopped does nothing; today is never included; overdue alerts once a day', async (t) => {
  if (skip(t)) return;
  await reset();
  const s = await Settings.load();
  await seed('u1', day(1));
  await Session.create({ sid: 'today-1', user: 'u2', platform: 'web', startedAt: new Date(), lastActivityAt: new Date(), endedAt: null, eventCount: 1, events: [{ at: new Date(), label: 'Logged in' }] });
  const drive = new FakeDrive();
  B.setStoreFactory(async () => drive);
  assert.equal((await B.scheduleTick()).skipped, 'stopped');
  await Settings.updateOne({ key: s.key }, { $set: { enabled: true } });
  assert.equal((await B.scheduleTick()).skipped, 'scheduled'); // first time: sets the due time
  assert.equal((await B.scheduleTick()).skipped, 'not due');
  await Settings.updateOne({ key: s.key }, { $set: { nextDueAt: new Date(Date.now() - 2 * 86400000), retryAt: new Date(Date.now() + 3600000) } });
  assert.equal((await B.scheduleTick()).skipped, 'not due'); // overdue but waiting for the retry time
  assert.equal((await B.scheduleTick()).skipped, 'not due');
  assert.equal(await Audit.countDocuments({ kind: 'alert', action: 'backup.overdue' }), 1, 'one overdue alert per day');
  await Settings.updateOne({ key: s.key }, { $set: { retryAt: null } });
  const ran = await B.scheduleTick();
  assert.equal(ran.run.status, 'ok');
  assert.equal(ran.run.toDay, day(1));
  assert.equal(drive.live().length, 1, 'only the finished day is saved, not today');
  assert.equal(await File.countDocuments({ user: 'u2' }), 0);
});

test('purge: only finished, confirmed, closed, unchanged days of the Drive backup are removed from the database', async (t) => {
  if (skip(t)) return;
  await reset();
  await seed('u1', day(3), { steps: 2 }); // closed -> purged
  await seed('u2', day(3), { ended: false, last: Date.now() - 3 * 86400000 }); // no logout, idle 3 days -> counts as closed
  await seed('u1', day(2), { ended: false, last: Date.now() - 600000 }); // no logout, active 10 minutes ago -> kept
  await seed('u2', day(2)); // closed, but changed while the file was being saved -> kept
  const drive = new FakeDrive();
  // while u2's day-2 file is being saved, u2 does one more thing that day
  drive.hooks.afterUpload = async (name, folder) => {
    if (drive.addLate && folder.includes('u2') && name === `${day(2)}.docx`) { await seed('u2', day(2), { at: 12 }); drive.addLate = false; }
  };
  drive.addLate = true;
  const s = await Settings.load();
  await Settings.updateOne({ key: s.key }, { $set: { purgeAfterBackup: true, storage: 'drive' } });
  const r = await run(drive);
  assert.equal(r.status, 'ok');
  const left = (await Session.find({}).lean()).map((x) => `${x.user}:${T.dayKey(x.startedAt)}`).sort();
  assert.deepEqual(left, [`u1:${day(2)}`, `u2:${day(2)}`, `u2:${day(2)}`].sort(), 'only u1/day3 and u2/day3 were removed');
  assert.equal(r.removed, 2 + 0);
  assert.equal((await File.findOne({ user: 'u1', day: day(3) })).purged, true);
  assert.equal((await File.findOne({ user: 'u1', day: day(2) })).purged, false);
  assert.equal((await File.findOne({ user: 'u2', day: day(2) })).purged, false);
  assert.equal(drive.live().length, 4, 'every file is still in Drive');
});

test('purge never runs for the server-folder test place, for a test run, or for today', async (t) => {
  if (skip(t)) return;
  await reset();
  await seed('u1', day(3));
  const s = await Settings.load();
  await Settings.updateOne({ key: s.key }, { $set: { purgeAfterBackup: true } });
  const local = new LocalStore(path.join(LOCAL_DIR, 'purge-check'));
  B.setStoreFactory(async () => local);
  const { done } = await B.launchBackup({ trigger: 'manual', fromDay: day(3), toDay: day(3), purge: true });
  const r = await done;
  assert.equal(r.status, 'ok');
  assert.equal(r.removed, 0);
  assert.equal(await Session.countDocuments({}), 1, 'server-folder place never purges');

  const drive = new FakeDrive();
  await seed('u2', today(), { ended: true });
  B.setStoreFactory(async () => drive);
  const t1 = await (await B.launchBackup({ trigger: 'test', fromDay: today(), toDay: today(), includesToday: true })).done;
  assert.equal(t1.removed, 0);
  assert.equal(drive.live().length, 1, 'today is saved by the test run');
  const forced = await (await B.launchBackup({ trigger: 'manual', fromDay: today(), toDay: today(), purge: true })).done;
  assert.equal(forced.removed, 0, 'a day that is not finished is never purged');
  assert.equal(await Session.countDocuments({ user: 'u2' }), 1);
});

test('a purged day that comes back with less data is not overwritten: it gets "<day> (more).docx"', async (t) => {
  if (skip(t)) return;
  await reset();
  await seed('u1', day(3), { steps: 4 });
  const drive = new FakeDrive();
  const s = await Settings.load();
  await Settings.updateOne({ key: s.key }, { $set: { purgeAfterBackup: true, storage: 'drive' } });
  const first = await run(drive);
  assert.equal(first.removed, 1);
  assert.equal(await Session.countDocuments({}), 0);
  const original = await File.findOne({ user: 'u1', day: day(3), variant: '' });
  const originalBytes = Buffer.from(drive.files.get(original.fileId).buf);

  await seed('u1', day(3), { at: 20, steps: 0 }); // a late, small session for the same day
  const again = await run(drive, { purge: false });
  assert.equal(again.status, 'ok');
  assert.equal(again.created, 1);
  assert.deepEqual(drive.liveNames(), [`${day(3)} (more).docx`, `${day(3)}.docx`].sort());
  assert.ok(drive.files.get(original.fileId).buf.equals(originalBytes), 'the original file was not touched');
  assert.equal(await File.countDocuments({ user: 'u1', day: day(3) }), 2);
});

test('server-folder run writes real files; the .docx is a valid, small Word file with the steps in it', async (t) => {
  if (skip(t)) return;
  await reset();
  await seed('u1', day(2), { steps: 2 });
  const local = new LocalStore(path.join(LOCAL_DIR, 'real'));
  B.setStoreFactory(async () => local);
  const r = await (await B.launchBackup({ trigger: 'manual', fromDay: day(2), toDay: day(2) })).done;
  assert.equal(r.status, 'ok');
  const file = path.join(LOCAL_DIR, 'real', 'Activity Logs', 'u1 - Asha Rao', `${day(2)}.docx`);
  assert.ok(fs.existsSync(file), file);
  const buf = fs.readFileSync(file);
  assert.equal(buf.toString('latin1', 0, 2), 'PK');
  assert.ok(buf.length < 3000, `size ${buf.length}`);
  const xml = zipEntry(buf, 'word/document.xml');
  assert.match(xml, /Activity log - Asha Rao \(u1\)/);
  assert.match(xml, /Edited profile/);
  assert.match(xml, /Headline: /);
  assert.match(xml, /old 0/);
  assert.match(xml, /new 1/);
  assert.match(xml, /Logged out/);
  assert.match(zipEntry(buf, '[Content_Types].xml'), /wordprocessingml\.document\.main\+xml/);
  assert.match(zipEntry(buf, '_rels/.rels'), /word\/document\.xml/);
  assert.equal(zipEntry(buf, 'word/styles.xml'), null, 'lean: no styles, theme or footnotes');
  assert.equal(fs.readdirSync(path.join(LOCAL_DIR, 'real', 'Activity Logs', 'u1 - Asha Rao')).length, 1);
  // keep one sample next to the test output so it can be opened in real Word by hand
  if (process.env.KEEP_SAMPLE_DOCX) fs.copyFileSync(file, process.env.KEEP_SAMPLE_DOCX);
});

test('a folder name cannot escape the backup folder', async (t) => {
  if (skip(t)) return;
  const local = new LocalStore(path.join(LOCAL_DIR, 'safe'));
  const id = await local.ensureFolder(['Activity Logs', '../../evil: <name>']);
  assert.ok(path.resolve(LOCAL_DIR, 'safe', id).startsWith(path.resolve(LOCAL_DIR, 'safe')));
  assert.throws(() => local.inside('../outside'), /outside the backup folder/);
});

test('only one run at a time: a second start is refused while one is running', async (t) => {
  if (skip(t)) return;
  await reset();
  await seed('u1', day(3));
  const drive = new FakeDrive();
  let release;
  drive.hooks.beforeUpload = () => new Promise((r) => { release = r; });
  B.setStoreFactory(async () => drive);
  const first = await B.launchBackup({ trigger: 'manual', fromDay: day(3), toDay: day(3) });
  await assert.rejects(() => B.launchBackup({ trigger: 'manual', fromDay: day(3), toDay: day(3) }), (e) => e.code === 'BUSY');
  while (!release) await new Promise((r) => setTimeout(r, 10));
  release();
  assert.equal((await first.done).status, 'ok');
  const again = await B.launchBackup({ trigger: 'manual', fromDay: day(3), toDay: day(3) }); // the lock was released
  drive.hooks.beforeUpload = null;
  assert.equal((await again.done).status, 'ok');
});

test('retention: nothing is dropped before 120 days; with no backup ever, old days go; with a backup, only confirmed days go', async (t) => {
  if (skip(t)) return;
  await reset();
  await seed('u1', day(100)); // young
  await seed('u1', day(130)); // old
  let r = await B.retentionSweep();
  assert.equal(r.mode, 'no-backup');
  assert.deepEqual(r.deleted, 1);
  assert.equal(await Session.countDocuments({}), 1);

  // a backup exists now: an old day that was NOT saved stays; a saved one goes
  await seed('u1', day(131)); await seed('u2', day(132));
  await File.create({ user: 'u1', day: day(131), variant: '', place: 'drive', fileId: 'f', stamp: B.stampOf(await Session.find({ user: 'u1', startedAt: { $gte: T.dayStart(day(131)), $lt: T.dayEnd(day(131)) } }).lean()), confirmedAt: new Date(), writtenAt: new Date() });
  r = await B.retentionSweep();
  assert.equal(r.mode, 'confirmed-only');
  assert.equal(r.deleted, 1);
  const left = (await Session.find({}).lean()).map((x) => `${x.user}:${T.dayKey(x.startedAt)}`).sort();
  assert.deepEqual(left, [`u1:${day(100)}`, `u2:${day(132)}`].sort());
});
