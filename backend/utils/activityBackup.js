// Activity backup: saves each person's day as a small .docx to a store (server folder or Google Drive),
// confirms every file by asking the store for it, and (only if switched on) purges saved days from the
// database. Nothing here is called while serving a client request.
const path = require('path');
const ActivitySession = require('../models/ActivitySession');
const ActivityBackupFile = require('../models/ActivityBackupFile');
const ActivityBackupRun = require('../models/ActivityBackupRun');
const ActivityBackupSettings = require('../models/ActivityBackupSettings');
const AdminAuditLog = require('../models/AdminAuditLog');
const Client = require('../models/Client');
const { buildDocx } = require('./activityDocx');
const { LocalStore, DriveStore, googleTokenSource, decryptSecret, safeName, fatal } = require('./activityStores');
const { dayStart, dayEnd, daysBetween, todayKey, addDays } = require('./istTime');

const CONCURRENCY = 3;
const IDLE_CLOSED_MS = 24 * 60 * 60 * 1000; // a session with no logout counts as closed after a day of silence
const LOCK_MS = 2 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 6 * 60 * 60 * 1000;
const RETENTION_DAYS = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------------------------
// Stores
function defaultLocalDir() {
  return process.env.ACTIVITY_BACKUP_LOCAL_DIR || path.join(__dirname, '..', 'activity-backups'); // not under uploads/ or public-tap/, so never served
}

function driveStoreFor(settings) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw fatal('Google Drive is not set up on the server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are missing).');
  if (!settings.drive?.refreshTokenEnc) throw fatal('Google Drive is not connected. Press "Connect Google Drive" first.');
  const refreshToken = decryptSecret(settings.drive.refreshTokenEnc);
  return new DriveStore({
    accessToken: googleTokenSource({ clientId, clientSecret, refreshToken }),
    rootName: process.env.ACTIVITY_BACKUP_DRIVE_ROOT || 'HuntsTAG',
  });
}

// Tests replace this with a fake Drive.
let storeFactory = async (settings) => (settings.storage === 'drive' ? driveStoreFor(settings) : new LocalStore(defaultLocalDir()));
const setStoreFactory = (fn) => { storeFactory = fn || storeFactory; };

// ---------------------------------------------------------------------------------------------
// Small helpers
const sum = (arr, f) => arr.reduce((n, x) => n + f(x), 0);

// A fingerprint of the sessions a file was built from. If it is the same later, the day did not change.
function stampOf(sessions) {
  const last = sessions.reduce((m, s) => Math.max(m, new Date(s.lastActivityAt).getTime()), 0);
  return `${sessions.length}|${sum(sessions, (s) => s.eventCount || 0)}|${last}|${sum(sessions, (s) => (s.endedAt ? 1 : 0))}`;
}

async function pool(items, size, worker) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await worker(item);
    }
  }));
}

const sessionsOfDay = (user, day, select) =>
  ActivitySession.find({ user, startedAt: { $gte: dayStart(day), $lt: dayEnd(day) } }, select).sort({ startedAt: 1 }).lean();

function describeVerify(v) {
  if (!v.exists) return 'the file is not there';
  if (v.trashed) return 'the file is in the bin';
  return `the saved size (${v.size} bytes) is different from what was sent`;
}

// ---------------------------------------------------------------------------------------------
// One person-day
async function backupOne(store, run, task, ctx) {
  const { user, day } = task;
  const sessions = await sessionsOfDay(user, day);
  if (!sessions.length) return { result: 'skipped' };
  const stamp = stampOf(sessions);
  const eventSum = sum(sessions, (s) => s.eventCount || 0);
  const client = await Client.findOne({ clientId: user }).select('fullName').lean();
  const name = client?.fullName || '(deleted account)';

  let variant = '';
  let rec = await ActivityBackupFile.findOne({ user, day, variant: '', place: store.place });
  // A day that was saved and then removed from the database must never be overwritten with less data.
  if (rec && rec.purged && (sessions.length < rec.sessionCount || eventSum < rec.eventCount)) {
    variant = 'more';
    rec = await ActivityBackupFile.findOne({ user, day, variant: 'more', place: store.place });
  }
  const fileName = variant ? `${day} (more).docx` : `${day}.docx`;

  // Same data as last time: only check the saved file is still there.
  if (rec && rec.confirmedAt && rec.stamp === stamp) {
    const v = await store.verify(rec.fileId);
    if (v.exists && !v.trashed && v.size > 0) {
      await ActivityBackupFile.updateOne({ _id: rec._id }, { $set: { runId: run._id, userName: name } });
      return { result: 'unchanged', variant };
    }
    // in the bin or gone: write a fresh one below
  }

  const buffer = await buildDocx({ person: { id: user, name }, day, sessions });
  const folderId = await ctx.folder(['Activity Logs', safeName(`${user} - ${name}`)]);

  // Re-running makes no duplicates: reuse the same-name file, and move extras to the bin.
  const found = (await store.findFiles(folderId, fileName)).filter((f) => !f.trashed);
  let existingId = null;
  if (found.length) {
    existingId = rec && found.some((f) => f.id === rec.fileId) ? rec.fileId : found[0].id;
    for (const f of found) if (f.id !== existingId) await store.trash(f.id);
  }

  const confirmed = (v) => v.exists && !v.trashed && v.size === buffer.length;
  let up = await store.upload({ folderId, name: fileName, buffer, existingId });
  let v = await store.verify(up.id);
  if (!confirmed(v)) {
    const firstId = up.id; // could not confirm: write once more as a fresh file, then fail with a clear reason
    up = await store.upload({ folderId, name: fileName, buffer, existingId: null });
    v = await store.verify(up.id);
    if (!confirmed(v)) throw new Error(`Could not confirm ${fileName} after saving it twice: ${describeVerify(v)}.`);
    if (firstId !== up.id) await store.trash(firstId).catch(() => {});
  }

  const now = new Date();
  await ActivityBackupFile.findOneAndUpdate(
    { user, day, variant, place: store.place },
    { $set: { userName: name, name: fileName, fileId: up.id, folderId, size: buffer.length, sessionCount: sessions.length, eventCount: eventSum, stamp, writtenAt: now, confirmedAt: now, purged: false, purgedAt: null, runId: run._id } },
    { upsert: true, new: true }
  );
  return { result: rec || existingId ? 'replaced' : 'created', bytes: buffer.length, variant };
}

// Purge: only a finished day, only after the file is confirmed, only if every session of that day is
// closed and nothing changed since the file was written. Never for the server-folder test place.
async function purgeOne(store, task, now) {
  if (store.place !== 'drive') return 0;
  const { user, day } = task;
  if (day >= todayKey(now)) return 0;
  const rec = await ActivityBackupFile.findOne({ user, day, variant: '', place: 'drive' });
  if (!rec || !rec.confirmedAt) return 0;
  const sessions = await sessionsOfDay(user, day, 'sid endedAt lastActivityAt eventCount');
  if (!sessions.length) return 0;
  const idleCut = now.getTime() - IDLE_CLOSED_MS;
  if (sessions.some((s) => !s.endedAt && new Date(s.lastActivityAt).getTime() > idleCut)) return 0;
  if (stampOf(sessions) !== rec.stamp) return 0;
  const r = await ActivitySession.deleteMany({ sid: { $in: sessions.map((s) => s.sid) }, lastActivityAt: { $lte: new Date(rec.writtenAt) } });
  if (r.deletedCount > 0) await ActivityBackupFile.updateOne({ _id: rec._id }, { $set: { purged: true, purgedAt: now } });
  return r.deletedCount;
}

// ---------------------------------------------------------------------------------------------
// One run
async function listTasks(fromDay, toDay, only) {
  if (only) return only;
  const tasks = [];
  for (const day of daysBetween(fromDay, toDay)) {
    const users = await ActivitySession.distinct('user', { startedAt: { $gte: dayStart(day), $lt: dayEnd(day) } });
    for (const user of users.sort()) tasks.push({ user, day });
  }
  return tasks;
}

async function executeRun(runId, store, { purge = false, only = null } = {}) {
  const run = await ActivityBackupRun.findById(runId);
  const counts = { created: 0, replaced: 0, unchanged: 0, failed: 0, removed: 0, bytes: 0 };
  const people = new Set();
  const failures = [];
  const folders = new Map(); // one folder lookup at a time per folder, so Drive never gets two of the same name
  const ctx = { folder: (parts) => { const k = parts.join('/'); if (!folders.has(k)) folders.set(k, store.ensureFolder(parts)); return folders.get(k); } };
  const finished = [];
  let abort = null;
  try {
    const tasks = await listTasks(run.fromDay, run.toDay, only);
    await pool(tasks, CONCURRENCY, async (task) => {
      if (abort) { counts.failed++; failures.push({ ...task, reason: `Not tried: ${abort}` }); return; }
      try {
        const out = await backupOne(store, run, task, ctx);
        if (out.result === 'skipped') return;
        people.add(task.user);
        counts[out.result]++;
        counts.bytes += out.bytes || 0;
        if (!out.variant) finished.push(task);
      } catch (err) {
        people.add(task.user);
        counts.failed++;
        failures.push({ ...task, reason: String(err.message || err).slice(0, 300) });
        if (err.fatal) abort = String(err.message).slice(0, 200);
      }
    });
    if (purge) {
      const now = new Date();
      for (const task of finished) {
        try { counts.removed += await purgeOne(store, task, now); } catch (err) { console.error('[activity purge]', err.message); }
      }
    }
  } catch (err) {
    counts.failed++;
    failures.push({ user: '', day: '', reason: `The run stopped: ${String(err.message || err).slice(0, 250)}` });
  }
  const worked = counts.created + counts.replaced + counts.unchanged;
  const status = counts.failed === 0 ? 'ok' : worked > 0 ? 'partial' : 'failed';
  await ActivityBackupRun.updateOne({ _id: runId }, { $set: { finishedAt: new Date(), status, people: people.size, ...counts, failures: failures.slice(0, 200) } });
  return ActivityBackupRun.findById(runId).lean();
}

// ---------------------------------------------------------------------------------------------
// Schedule maths (India time)
function dueAt(dayKey, timeOfDay) {
  const [h, m] = String(timeOfDay || '02:00').split(':').map(Number);
  return new Date(dayStart(dayKey).getTime() + (h * 60 + m) * 60000);
}
// The next time the clock shows timeOfDay.
function nextSlot(now, timeOfDay) {
  const today = dueAt(todayKey(now), timeOfDay);
  return today > now ? today : dueAt(addDays(todayKey(now), 1), timeOfDay);
}
const nextCycle = (now, intervalDays, timeOfDay) => dueAt(addDays(todayKey(now), intervalDays), timeOfDay);

// ---------------------------------------------------------------------------------------------
// Lock + launch. Manual and scheduled runs share one lock, so two never overlap.
async function acquireLock(now = new Date()) {
  const key = ActivityBackupSettings.settingsKey();
  await ActivityBackupSettings.load();
  const got = await ActivityBackupSettings.findOneAndUpdate(
    { key, $or: [{ lockUntil: null }, { lockUntil: { $lt: now } }] },
    { $set: { lockUntil: new Date(now.getTime() + LOCK_MS) } },
    { new: true }
  );
  return got;
}
const releaseLock = () => ActivityBackupSettings.updateOne({ key: ActivityBackupSettings.settingsKey() }, { $set: { lockUntil: null } });

async function alert(action, summary, details) {
  try { await AdminAuditLog.create({ kind: 'alert', adminEmail: '', action, summary, details }); } catch { /* ignore */ }
  console.error(`[activity backup] ${summary}`);
}

async function afterRun(settings, run) {
  const set = {};
  if (run.trigger !== 'test') {
    set.lastRunAt = run.finishedAt || new Date();
    set.lastRunStatus = run.status;
    set.lastRunId = run._id;
  }
  const fullRange = (run.trigger === 'schedule' || run.trigger === 'manual') && !run.includesToday;
  if (fullRange && run.status === 'ok') {
    const last = settings.lastSavedThrough;
    // "Last saved through" moves only when every file of the run succeeded and the range joins what is
    // saved. With nothing saved yet, the range must start at the oldest data, or earlier days would be
    // wrongly counted as saved.
    const joins = last ? run.fromDay <= addDays(last, 1) && run.toDay > last : !(await ActivitySession.exists({ startedAt: { $lt: dayStart(run.fromDay) } }));
    if (joins) set.lastSavedThrough = run.toDay;
    if (run.trigger === 'schedule') { set.nextDueAt = nextCycle(new Date(), settings.intervalDays, settings.timeOfDay); set.retryAt = null; }
  }
  if (run.trigger === 'schedule' && run.status !== 'ok') set.retryAt = new Date(Date.now() + RETRY_AFTER_MS);
  if (Object.keys(set).length) await ActivityBackupSettings.updateOne({ key: settings.key }, { $set: set });
  if (run.status !== 'ok' && run.trigger !== 'test') {
    await alert('backup.run.failed', `Activity backup ${run.status === 'failed' ? 'failed' : 'finished with failures'}: ${run.failed} file(s) could not be saved.`, { runId: run._id, trigger: run.trigger, failures: (run.failures || []).slice(0, 5) });
  }
}

class BackupBusyError extends Error {
  constructor() { super('A backup is already running. Wait for it to finish.'); this.code = 'BUSY'; }
}

// Starts a run. Returns { run, done } -- `done` resolves to the finished run (routes do not wait for it).
async function launchBackup({ trigger, startedBy = '', fromDay, toDay, includesToday = false, only = null, retryOf = null, purge = null }) {
  const locked = await acquireLock();
  if (!locked) throw new BackupBusyError();
  let run;
  try {
    const settings = locked;
    const store = await storeFactory(settings);
    const doPurge = purge === null ? !!settings.purgeAfterBackup && trigger !== 'test' && !includesToday : purge;
    run = await ActivityBackupRun.create({ trigger, startedBy, place: store.place, fromDay, toDay, includesToday, retryOf });
    const done = executeRun(run._id, store, { purge: doPurge, only })
      .then(async (finished) => { await afterRun(settings, finished); return finished; })
      .catch(async (err) => {
        await ActivityBackupRun.updateOne({ _id: run._id }, { $set: { finishedAt: new Date(), status: 'failed', failed: 1, failures: [{ user: '', day: '', reason: String(err.message).slice(0, 250) }] } });
        return ActivityBackupRun.findById(run._id).lean();
      })
      .finally(() => releaseLock());
    return { run: run.toObject(), done };
  } catch (err) {
    await releaseLock();
    throw err;
  }
}

// Redo only the files that failed in an earlier run.
async function retryFailed(runId, startedBy) {
  const old = await ActivityBackupRun.findById(runId).lean();
  if (!old) throw Object.assign(new Error('Run not found'), { code: 'NOT_FOUND' });
  const only = (old.failures || []).filter((f) => f.user && f.day).map((f) => ({ user: f.user, day: f.day }));
  if (!only.length) throw Object.assign(new Error('Nothing to retry in this run.'), { code: 'NOTHING' });
  return launchBackup({ trigger: 'retry', startedBy, fromDay: old.fromDay, toDay: old.toDay, includesToday: old.includesToday, only, retryOf: old._id });
}

// ---------------------------------------------------------------------------------------------
// Scheduler step (called every hour; safe to call any time)
async function scheduleTick(now = new Date()) {
  const s = await ActivityBackupSettings.load();
  if (!s.enabled) return { skipped: 'stopped' };
  if (!s.nextDueAt) {
    await ActivityBackupSettings.updateOne({ key: s.key }, { $set: { nextDueAt: nextSlot(now, s.timeOfDay) } });
    return { skipped: 'scheduled' };
  }
  // More than a day late: alert once per day.
  if (now.getTime() > s.nextDueAt.getTime() + DAY_MS && s.lastAlertDay !== todayKey(now)) {
    await ActivityBackupSettings.updateOne({ key: s.key }, { $set: { lastAlertDay: todayKey(now) } });
    await alert('backup.overdue', `Activity backup is overdue: it was due ${s.nextDueAt.toISOString()}.`, { nextDueAt: s.nextDueAt });
  }
  if (now < s.nextDueAt || (s.retryAt && now < s.retryAt)) return { skipped: 'not due' };
  const toDay = addDays(todayKey(now), -1); // today is not finished yet
  let fromDay = s.lastSavedThrough ? addDays(s.lastSavedThrough, 1) : null;
  if (!fromDay) {
    const first = await ActivitySession.findOne({}).sort({ startedAt: 1 }).select('startedAt').lean();
    fromDay = first ? require('./istTime').dayKey(first.startedAt) : toDay;
  }
  if (fromDay > toDay) {
    await ActivityBackupSettings.updateOne({ key: s.key }, { $set: { nextDueAt: nextCycle(now, s.intervalDays, s.timeOfDay), retryAt: null } });
    return { skipped: 'nothing to save' };
  }
  try {
    const { done } = await launchBackup({ trigger: 'schedule', fromDay, toDay });
    return { run: await done };
  } catch (err) {
    if (err.code === 'BUSY') return { skipped: 'busy' };
    await ActivityBackupSettings.updateOne({ key: s.key }, { $set: { retryAt: new Date(now.getTime() + RETRY_AFTER_MS), lastRunAt: now, lastRunStatus: 'failed' } });
    await alert('backup.run.failed', `Activity backup could not start: ${err.message}`, {});
    return { error: err.message };
  }
}

// Old sessions: with no backup ever set up, drop them after 120 days. Once a backup exists, only days that
// are confirmed in the Drive backup (and unchanged since) are dropped -- never a day that is not saved yet.
async function retentionSweep(now = new Date()) {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
  const s = await ActivityBackupSettings.load();
  const everBackedUp = s.enabled || s.lastSavedThrough || (await ActivityBackupFile.exists({}));
  if (!everBackedUp) {
    const r = await ActivitySession.deleteMany({ startedAt: { $lt: cutoff }, $or: [{ endedAt: { $ne: null } }, { lastActivityAt: { $lt: new Date(now.getTime() - IDLE_CLOSED_MS) } }] });
    return { deleted: r.deletedCount, mode: 'no-backup' };
  }
  const groups = await ActivitySession.aggregate([
    { $match: { startedAt: { $lt: cutoff } } },
    { $group: { _id: { user: '$user', day: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt', timezone: '+05:30' } } } } },
    { $limit: 2000 },
  ]);
  let deleted = 0;
  for (const g of groups) {
    const { user, day } = g._id;
    const rec = await ActivityBackupFile.findOne({ user, day, variant: '', place: 'drive', confirmedAt: { $ne: null } });
    if (!rec) continue;
    const sessions = await sessionsOfDay(user, day, 'sid endedAt lastActivityAt eventCount');
    if (!sessions.length || stampOf(sessions) !== rec.stamp) continue;
    const r = await ActivitySession.deleteMany({ sid: { $in: sessions.map((x) => x.sid) } });
    deleted += r.deletedCount;
  }
  return { deleted, mode: 'confirmed-only' };
}

let timer = null;
function startScheduler({ everyMs = 60 * 60 * 1000 } = {}) {
  if (timer) return;
  const step = () => {
    scheduleTick().catch((err) => console.error('[activity backup tick]', err.message));
    retentionSweep().catch((err) => console.error('[activity retention]', err.message));
  };
  timer = setInterval(step, everyMs);
  timer.unref?.();
  setTimeout(step, 60 * 1000).unref?.(); // first check a minute after start-up
}
function stopScheduler() { if (timer) clearInterval(timer); timer = null; }

module.exports = {
  launchBackup, retryFailed, scheduleTick, retentionSweep, startScheduler, stopScheduler, setStoreFactory,
  nextSlot, nextCycle, dueAt, stampOf, BackupBusyError, defaultLocalDir, RETENTION_DAYS,
};
