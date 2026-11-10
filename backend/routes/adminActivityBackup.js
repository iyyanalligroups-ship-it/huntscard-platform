// Admin "Activity backups": where the activity logs are saved (server folder / Google Drive), start/stop,
// how often, backup now, runs and history. Mounted at /api/admin/activity-backup.
// Open to Admin Prime and Admin (full admins). Sub-admins and employees are refused.
const express = require('express');
const jwt = require('jsonwebtoken');
const { requireSeniorAdmin } = require('../middleware/auth');
const ActivityBackupSettings = require('../models/ActivityBackupSettings');
const ActivityBackupRun = require('../models/ActivityBackupRun');
const ActivityBackupFile = require('../models/ActivityBackupFile');
const AdminAuditLog = require('../models/AdminAuditLog');
const Admin = require('../models/Admin');
const ActivitySession = require('../models/ActivitySession');
const B = require('../utils/activityBackup');
const { encryptSecret, decryptSecret, DriveStore, googleTokenSource, GOOGLE_TOKEN_URL } = require('../utils/activityStores');
const { isDayKey, todayKey, addDays, dayKey, dayStart } = require('../utils/istTime');

const router = express.Router();

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'; // only files this app creates
const DAY_MS = 24 * 60 * 60 * 1000;
const bad = (res, message, status = 400) => res.status(status).json({ error: message });

const googleConfig = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  redirectUri: process.env.GOOGLE_REDIRECT_URI || `${(process.env.BACKEND_URL || 'http://localhost:4000').replace(/\/$/, '')}/api/admin/activity-backup/google/callback`,
  panelUrl: (process.env.ADMIN_PANEL_URL || 'http://localhost:5174').replace(/\/$/, ''),
});

async function audit(req, kind, action, summary, details) {
  try { await AdminAuditLog.create({ kind, adminEmail: req.admin?.email || '', action, summary, details }); } catch (err) { console.error('[activity backup audit]', err.message); }
}

// ---- Google sign-in comes back here. Public on purpose (Google, not the admin app, calls it); the signed
// state proves an Admin Prime started it. ----
router.get('/google/callback', async (req, res) => {
  const cfg = googleConfig();
  const back = (params) => res.redirect(`${cfg.panelUrl}/dashboard/activity-backups?${new URLSearchParams(params)}`);
  try {
    if (req.query.error) return back({ google: 'error', reason: String(req.query.error).slice(0, 80) });
    let state;
    try { state = jwt.verify(String(req.query.state || ''), process.env.JWT_SECRET); } catch { return back({ google: 'error', reason: 'The sign-in link expired. Start again.' }); }
    if (state.type !== 'activity-google' || !req.query.code) return back({ google: 'error', reason: 'Invalid sign-in response.' });

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: String(req.query.code), client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: 'authorization_code' }),
    });
    const tokens = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokens.access_token) return back({ google: 'error', reason: `Google refused the sign-in (${tokens.error || tokenRes.status}).` });
    if (!tokens.refresh_token) return back({ google: 'error', reason: 'Google did not give a long-lived connection. Remove HuntsTAG at myaccount.google.com/permissions and connect again.' });
    if (!String(tokens.scope || DRIVE_SCOPE).split(' ').includes(DRIVE_SCOPE)) return back({ google: 'error', reason: 'Drive access was not allowed.' });

    // Prove it works: create the top folders, and learn which account was connected.
    const store = new DriveStore({ accessToken: googleTokenSource({ clientId: cfg.clientId, clientSecret: cfg.clientSecret, refreshToken: tokens.refresh_token }), rootName: process.env.ACTIVITY_BACKUP_DRIVE_ROOT || 'HuntsTAG' });
    await store.ensureFolder(['Activity Logs']);
    let email = null;
    try {
      const about = await store.json('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)');
      email = about?.user?.emailAddress || null;
    } catch { /* the account name is only for display */ }

    await ActivityBackupSettings.load();
    await ActivityBackupSettings.updateOne({ key: ActivityBackupSettings.settingsKey() }, { $set: { 'drive.refreshTokenEnc': encryptSecret(tokens.refresh_token), 'drive.email': email, 'drive.connectedAt': new Date() } });
    await AdminAuditLog.create({ kind: 'backup', adminEmail: state.adminEmail || '', action: 'google.connect', summary: `Connected Google Drive${email ? ` (${email})` : ''}`, details: { email } });
    return back({ google: 'connected' });
  } catch (err) {
    console.error('[activity backup google callback]', err.message);
    return back({ google: 'error', reason: String(err.message || 'Connection failed').slice(0, 160) });
  }
});

router.use(requireSeniorAdmin);

// ---- status ----
function healthOf(s, lastRun, now = new Date()) {
  if (!s.enabled) return { code: 'stopped', level: 'bad', message: 'STOPPED: scheduled backups are switched off.' };
  if (s.nextDueAt && now.getTime() > s.nextDueAt.getTime() + DAY_MS) return { code: 'overdue', level: 'bad', message: `OVERDUE: the backup was due ${s.nextDueAt.toISOString().slice(0, 10)} and has not completed.` };
  if (lastRun && lastRun.status === 'failed') return { code: 'failed', level: 'bad', message: 'The last run failed. See "Why?" in the runs table below.' };
  if (lastRun && lastRun.status === 'partial') return { code: 'partial', level: 'warn', message: `The last run saved some files but ${lastRun.failed} failed. Use "Retry failed".` };
  return { code: 'up_to_date', level: 'ok', message: s.lastSavedThrough ? `Up to date: every finished day through ${s.lastSavedThrough} is saved.` : 'Up to date: nothing has needed saving yet.' };
}

const runView = (r) => ({
  id: r._id, startedAt: r.startedAt, finishedAt: r.finishedAt, trigger: r.trigger, startedBy: r.startedBy, place: r.place,
  fromDay: r.fromDay, toDay: r.toDay, status: r.status, people: r.people, created: r.created, replaced: r.replaced,
  unchanged: r.unchanged, failed: r.failed, removed: r.removed, bytes: r.bytes, failures: r.failures || [],
});

router.get('/status', async (req, res) => {
  try {
    const s = await ActivityBackupSettings.load();
    const cfg = googleConfig();
    const now = new Date();
    const [lastRun, statRows, alerts] = await Promise.all([
      s.lastRunId ? ActivityBackupRun.findById(s.lastRunId).lean() : null,
      ActivityBackupFile.aggregate([{ $match: { place: s.storage, confirmedAt: { $ne: null } } }, { $group: { _id: null, files: { $sum: 1 }, people: { $addToSet: '$user' }, bytes: { $sum: '$size' } } }]),
      AdminAuditLog.find({ kind: 'alert', at: { $gt: new Date(now.getTime() - 7 * DAY_MS) } }).sort({ at: -1 }).limit(3).lean(),
    ]);
    const stat = statRows[0] || { files: 0, people: [], bytes: 0 };
    res.json({
      settings: { enabled: s.enabled, intervalDays: s.intervalDays, timeOfDay: s.timeOfDay, storage: s.storage, purgeAfterBackup: s.purgeAfterBackup },
      lastSavedThrough: s.lastSavedThrough,
      nextDueAt: s.enabled ? s.nextDueAt : null,
      today: todayKey(now),
      running: !!(s.lockUntil && s.lockUntil > now),
      lastRun: lastRun ? runView(lastRun) : null,
      health: healthOf(s, lastRun, now),
      google: { configured: !!(cfg.clientId && cfg.clientSecret), connected: !!s.drive?.refreshTokenEnc, email: s.drive?.email || null, connectedAt: s.drive?.connectedAt || null, redirectUri: cfg.redirectUri },
      stats: { files: stat.files, people: stat.people.length, bytes: stat.bytes },
      alerts: alerts.map((a) => ({ at: a.at, summary: a.summary })),
    });
  } catch (err) {
    console.error('[activity backup status]', err);
    bad(res, 'Could not load the backup status', 500);
  }
});

// ---- settings ----
const clock12 = (t) => { const [h, m] = String(t).split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`; };
const placeName = (v) => (v === 'drive' ? 'Google Drive' : 'server folder');
// How each setting change reads in the "who changed it" list.
const DESCRIBE = {
  intervalDays: (a, b) => `how often: every ${a} ${a === 1 ? 'day' : 'days'} → every ${b} ${b === 1 ? 'day' : 'days'}`,
  timeOfDay: (a, b) => `time of day: ${clock12(a)} → ${clock12(b)}`,
  storage: (a, b) => `where files are saved: ${placeName(a)} → ${placeName(b)} (all days will be saved there from the start)`,
  purgeAfterBackup: (a, b) => `removing saved days from the database: ${a ? 'on' : 'off'} → ${b ? 'on' : 'off'}`,
};

router.put('/settings', async (req, res) => {
  try {
    const s = await ActivityBackupSettings.load();
    const body = req.body || {};
    const next = {};
    if ('intervalDays' in body) {
      const n = Number(body.intervalDays);
      if (!Number.isInteger(n) || n < 1 || n > 90) return bad(res, 'How often must be a whole number of days from 1 to 90.');
      next.intervalDays = n;
    }
    if ('timeOfDay' in body) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.timeOfDay))) return bad(res, 'Time of day must look like 02:00.');
      next.timeOfDay = String(body.timeOfDay);
    }
    if ('storage' in body) {
      if (!['local', 'drive'].includes(body.storage)) return bad(res, 'Where to save must be the server folder or Google Drive.');
      next.storage = body.storage;
    }
    if ('enabled' in body) next.enabled = !!body.enabled;
    if ('purgeAfterBackup' in body) next.purgeAfterBackup = !!body.purgeAfterBackup;

    const storage = next.storage ?? s.storage;
    if (storage === 'drive' && !s.drive?.refreshTokenEnc) return bad(res, 'Connect Google Drive before choosing it.');
    if (next.purgeAfterBackup === true && !s.purgeAfterBackup && body.confirmPurge !== true) return bad(res, 'Turning on "delete saved days from the database" needs confirmation.');
    if ((next.purgeAfterBackup ?? s.purgeAfterBackup) && storage !== 'drive') return bad(res, 'Deleting saved days works only with Google Drive, never with the server folder.');

    const set = { ...next };
    const now = new Date();
    const enabling = next.enabled === true && !s.enabled;
    const timeOfDay = next.timeOfDay ?? s.timeOfDay;
    const movedPlace = next.storage !== undefined && next.storage !== s.storage;
    if (movedPlace) set.lastSavedThrough = null; // the new place has nothing yet: every day is saved there from the start
    if (enabling || (movedPlace && (next.enabled ?? s.enabled))) { set.nextDueAt = B.nextSlot(now, timeOfDay); set.retryAt = null; }
    else if (next.timeOfDay && s.enabled && s.nextDueAt) set.nextDueAt = B.dueAt(dayKey(s.nextDueAt), timeOfDay);

    const changed = Object.keys(next).filter((k) => next[k] !== s[k]);
    const changes = changed.filter((k) => DESCRIBE[k]).map((k) => DESCRIBE[k](s[k], next[k]));
    if (changed.length) {
      await ActivityBackupSettings.updateOne({ key: s.key }, { $set: set });
      const action = next.enabled === true && !s.enabled ? 'backup.start' : next.enabled === false && s.enabled ? 'backup.stop' : 'backup.settings';
      await audit(req, 'backup', action, action === 'backup.start' ? 'Started the scheduled backup' : action === 'backup.stop' ? 'Stopped the scheduled backup' : `Changed ${changes.join('; ')}`, { before: Object.fromEntries(Object.keys(next).map((k) => [k, s[k]])), after: next });
    }
    res.json({ ok: true, changed: changes });
  } catch (err) {
    console.error('[activity backup settings]', err);
    bad(res, 'Could not save the settings', 500);
  }
});

// ---- running ----
function launchError(res, err) {
  if (err.code === 'BUSY') return bad(res, err.message, 409);
  if (err.fatal || err.code === 'NOTHING' || err.code === 'NOT_FOUND') return bad(res, err.message, err.code === 'NOT_FOUND' ? 404 : 400);
  console.error('[activity backup launch]', err);
  return bad(res, 'Could not start the backup', 500);
}

// POST /run { fromDay?, toDay? } -- "Backup now".
//   no dates  -> everything not saved yet, up to yesterday
//   both dates -> that period; today may be the last day (its file is replaced by a later run once the day has
//                 grown). A period that includes today never purges and never moves "saved up to".
router.post('/run', async (req, res) => {
  try {
    const { fromDay, toDay } = req.body || {};
    const today = todayKey();
    let from = fromDay || '';
    let to = toDay || '';
    if (!from && !to) {
      const s = await ActivityBackupSettings.load();
      to = addDays(today, -1);
      if (s.lastSavedThrough) from = addDays(s.lastSavedThrough, 1);
      else {
        const first = await ActivitySession.findOne({}).sort({ startedAt: 1 }).select('startedAt').lean();
        from = first ? dayKey(first.startedAt) : to;
      }
      if (from > to) return bad(res, 'Nothing new to save. Every finished day is already saved.');
    }
    if (!isDayKey(from) || !isDayKey(to)) return bad(res, 'Choose both dates, or leave both empty to save everything not yet saved.');
    if (from > to) return bad(res, 'From must not be after To.');
    if (to > today) return bad(res, 'Dates cannot be in the future.');
    if (addDays(from, 400) < to) return bad(res, 'Pick at most 400 days at a time.');
    const includesToday = to >= today;
    const { run } = await B.launchBackup({ trigger: 'manual', startedBy: req.admin?.email || '', fromDay: from, toDay: to, includesToday });
    await audit(req, 'backup', 'backup.run', `Started a backup for ${from} to ${to}`, { runId: run._id });
    res.status(202).json({ runId: run._id });
  } catch (err) { launchError(res, err); }
});

// POST /run-today -- the test button: today so far. Never purges and never moves "saved through".
router.post('/run-today', async (req, res) => {
  try {
    const t = todayKey();
    const { run } = await B.launchBackup({ trigger: 'test', startedBy: req.admin?.email || '', fromDay: t, toDay: t, includesToday: true });
    await audit(req, 'backup', 'backup.test', `Started a test backup for today (${t})`, { runId: run._id });
    res.status(202).json({ runId: run._id });
  } catch (err) { launchError(res, err); }
});

// POST /runs/:id/retry -- redo only the files that failed.
router.post('/runs/:id/retry', async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/.test(req.params.id)) return bad(res, 'Run not found', 404);
    const { run } = await B.retryFailed(req.params.id, req.admin?.email || '');
    await audit(req, 'backup', 'backup.retry', 'Retried the failed files of a run', { runId: run._id, retryOf: req.params.id });
    res.status(202).json({ runId: run._id });
  } catch (err) { launchError(res, err); }
});

// ---- lists (10 per page, fetched per page) ----
const pageOf = (req) => ({ page: Math.max(1, parseInt(req.query.page, 10) || 1), limit: Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10)) });

// email -> display name for the admins in a list
async function namesOf(emails) {
  const list = [...new Set(emails.filter(Boolean))];
  if (!list.length) return new Map();
  const admins = await Admin.find({ email: { $in: list } }).select('email name').lean();
  return new Map(admins.map((a) => [a.email, a.name || '']));
}

router.get('/runs', async (req, res) => {
  try {
    const { page, limit } = pageOf(req);
    const [total, runs] = await Promise.all([ActivityBackupRun.countDocuments({}), ActivityBackupRun.find({}).sort({ startedAt: -1 }).skip((page - 1) * limit).limit(limit).lean()]);
    const names = await namesOf(runs.map((r) => r.startedBy));
    res.json({ page, limit, total, runs: runs.map((r) => ({ ...runView(r), startedByName: names.get(r.startedBy) || '' })) });
  } catch (err) { console.error('[activity backup runs]', err); bad(res, 'Could not load the runs', 500); }
});

router.get('/history', async (req, res) => {
  try {
    const { page, limit } = pageOf(req);
    const filter = { kind: 'backup' };
    const [total, rows] = await Promise.all([AdminAuditLog.countDocuments(filter), AdminAuditLog.find(filter).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).lean()]);
    const names = await namesOf(rows.map((r) => r.adminEmail));
    res.json({ page, limit, total, entries: rows.map((r) => ({ at: r.at, by: r.adminEmail || 'system', byName: names.get(r.adminEmail) || '', action: r.action, summary: r.summary })) });
  } catch (err) { console.error('[activity backup history]', err); bad(res, 'Could not load the history', 500); }
});

// ---- Google Drive connection ----
router.post('/google/connect', (req, res) => {
  const cfg = googleConfig();
  if (!cfg.clientId || !cfg.clientSecret) return bad(res, 'Google is not set up on the server yet (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are missing).');
  const state = jwt.sign({ type: 'activity-google', adminEmail: req.admin?.email || '' }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const url = `${GOOGLE_AUTH_URL}?${new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: 'code', scope: DRIVE_SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', state })}`;
  res.json({ url });
});

router.post('/google/disconnect', async (req, res) => {
  try {
    const s = await ActivityBackupSettings.load();
    if (s.drive?.refreshTokenEnc) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decryptSecret(s.drive.refreshTokenEnc))}`, { method: 'POST' });
      } catch { /* revoking is best-effort; the saved token is removed either way */ }
    }
    const set = { 'drive.refreshTokenEnc': null, 'drive.email': null, 'drive.connectedAt': null };
    if (s.storage === 'drive') Object.assign(set, { storage: 'local', enabled: false, purgeAfterBackup: false }); // nothing to save to now
    await ActivityBackupSettings.updateOne({ key: s.key }, { $set: set });
    await audit(req, 'backup', 'google.disconnect', 'Disconnected Google Drive', { wasUsedForBackup: s.storage === 'drive' });
    res.json({ ok: true });
  } catch (err) { console.error('[activity backup disconnect]', err); bad(res, 'Could not disconnect', 500); }
});

module.exports = router;
module.exports.healthOf = healthOf;
