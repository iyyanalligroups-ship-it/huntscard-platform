// Admin "Activity logs": browse what each client did, by person -> day -> session -> steps, and delete.
// Mounted at /api/admin/activity. Open to admins and sub-admins (requireAdmin), not to employees.
const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const ActivitySession = require('../models/ActivitySession');
const ActivityBackupSettings = require('../models/ActivityBackupSettings');
const AdminAuditLog = require('../models/AdminAuditLog');
const Client = require('../models/Client');
const { isDayKey, dayStart, dayEnd } = require('../utils/istTime');
const { IST_TZ, activeCut, thingsExpr, minutesExpr, sessionRow } = require('../utils/activityQueries');

const router = express.Router();
router.use(requireAdmin);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const text = (v, max = 100) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const bad = (res, message) => res.status(400).json({ error: message });

// Optional From/To (YYYY-MM-DD, India) as a startedAt filter. Returns null when a value is malformed.
function rangeFilter(from, to) {
  if (from && !isDayKey(from)) return null;
  if (to && !isDayKey(to)) return null;
  const f = {};
  if (from) f.$gte = dayStart(from);
  if (to) f.$lt = dayEnd(to);
  return f;
}

async function audit(req, action, summary, details) {
  try {
    await AdminAuditLog.create({ kind: 'activity', adminEmail: req.admin?.email || '', action, summary, details });
  } catch (err) {
    console.error('[adminActivity audit]', err.message);
  }
}

// GET /people?search&role&platform&from&to&page&limit -- one row per person.
router.get('/people', async (req, res) => {
  try {
    const match = {};
    const role = text(req.query.role, 20);
    const platform = text(req.query.platform, 10);
    if (role) match.role = role;
    if (platform) {
      if (!['web', 'app'].includes(platform)) return bad(res, 'platform must be web or app');
      match.platform = platform;
    }
    const range = rangeFilter(text(req.query.from, 10), text(req.query.to, 10));
    if (range === null) return bad(res, 'From and To must be dates like 2026-11-30');
    if (Object.keys(range).length) match.startedAt = range;

    const search = text(req.query.search, 80);
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      const found = await Client.find({ $or: [{ fullName: rx }, { clientId: rx }, { phone: rx }, { loginEmail: rx }] }).select('clientId').limit(500).lean();
      // also match the id stored on the session, so a person whose account was deleted can still be found
      match.$or = [{ user: { $in: found.map((c) => c.clientId) } }, { user: rx }];
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const [agg] = await ActivitySession.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$user',
          sessions: { $sum: 1 },
          things: { $sum: thingsExpr },
          lastLogin: { $max: '$startedAt' },
          lastSeen: { $max: '$lastActivityAt' },
          platforms: { $addToSet: '$platform' },
          active: { $max: { $cond: [{ $and: [{ $eq: ['$endedAt', null] }, { $gt: ['$lastActivityAt', activeCut()] }] }, 1, 0] } },
        },
      },
      { $sort: { lastSeen: -1, _id: 1 } },
      { $facet: { rows: [{ $skip: (page - 1) * limit }, { $limit: limit }], total: [{ $count: 'n' }] } },
    ]);
    const rows = agg.rows;
    const clients = await Client.find({ clientId: { $in: rows.map((r) => r._id) } }).select('clientId fullName phone loginEmail blocked').lean();
    const byId = new Map(clients.map((c) => [c.clientId, c]));
    res.json({
      page,
      limit,
      total: agg.total[0]?.n || 0,
      people: rows.map((r) => {
        const c = byId.get(r._id);
        return {
          clientId: r._id,
          name: c?.fullName || '(deleted account)',
          phone: c?.phone || '',
          email: c?.loginEmail || '',
          sessions: r.sessions,
          things: r.things,
          lastLogin: r.lastLogin,
          lastSeen: r.lastSeen,
          activeNow: r.active === 1,
          platform: r.platforms.length > 1 ? 'both' : r.platforms[0] || 'web',
        };
      }),
    });
  } catch (err) {
    console.error('[adminActivity people]', err);
    res.status(500).json({ error: 'Could not load activity' });
  }
});

// GET /people/:clientId?from&to -- totals and one card per day.
router.get('/people/:clientId', async (req, res) => {
  try {
    const clientId = text(req.params.clientId, 64);
    const range = rangeFilter(text(req.query.from, 10), text(req.query.to, 10));
    if (range === null) return bad(res, 'From and To must be dates like 2026-11-30');
    const match = { user: clientId };
    if (Object.keys(range).length) match.startedAt = range;

    const [client, days] = await Promise.all([
      Client.findOne({ clientId }).select('clientId fullName phone loginEmail blocked').lean(),
      ActivitySession.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt', timezone: IST_TZ } },
            logins: { $sum: 1 },
            logouts: { $sum: { $cond: [{ $ifNull: ['$endedAt', false] }, 1, 0] } },
            things: { $sum: thingsExpr },
            minutes: { $sum: minutesExpr },
            lastSeen: { $max: '$lastActivityAt' },
            active: { $max: { $cond: [{ $and: [{ $eq: ['$endedAt', null] }, { $gt: ['$lastActivityAt', activeCut()] }] }, 1, 0] } },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 400 },
      ]),
    ]);
    if (!client && !days.length) return res.status(404).json({ error: 'No activity found for this person' });
    const settings = await ActivityBackupSettings.load().catch(() => null);
    res.json({
      person: { clientId, name: client?.fullName || '(deleted account)', phone: client?.phone || '', email: client?.loginEmail || '', blocked: !!client?.blocked },
      totals: {
        logins: days.reduce((n, d) => n + d.logins, 0),
        logouts: days.reduce((n, d) => n + d.logouts, 0),
        things: days.reduce((n, d) => n + d.things, 0),
      },
      days: days.map((d) => ({ day: d._id, logins: d.logins, logouts: d.logouts, things: d.things, minutes: Math.round(d.minutes), lastSeen: d.lastSeen, activeNow: d.active === 1 })),
      backup: { purgeOn: !!settings?.purgeAfterBackup, savedThrough: settings?.lastSavedThrough || null },
    });
  } catch (err) {
    console.error('[adminActivity person]', err);
    res.status(500).json({ error: 'Could not load this person' });
  }
});

// GET /people/:clientId/days/:day -- the sessions of one day (no steps yet).
router.get('/people/:clientId/days/:day', async (req, res) => {
  try {
    if (!isDayKey(req.params.day)) return bad(res, 'day must look like 2026-11-30');
    const sessions = await ActivitySession.find({ user: text(req.params.clientId, 64), startedAt: { $gte: dayStart(req.params.day), $lt: dayEnd(req.params.day) } })
      .select('-events')
      .sort({ startedAt: 1 })
      .lean();
    res.json({ day: req.params.day, sessions: sessions.map(sessionRow) });
  } catch (err) {
    console.error('[adminActivity day]', err);
    res.status(500).json({ error: 'Could not load this day' });
  }
});

// GET /sessions/:sid -- the step-by-step list.
router.get('/sessions/:sid', async (req, res) => {
  try {
    const s = await ActivitySession.findOne({ sid: text(req.params.sid, 64) }).lean();
    if (!s) return res.status(404).json({ error: 'Session not found' });
    res.json({
      ...sessionRow(s),
      user: s.user,
      ip: s.ip,
      userAgent: s.userAgent,
      eventCount: s.eventCount,
      trimmed: s.eventCount > s.events.length,
      events: s.events.map((e) => ({ at: e.at, label: e.label, method: e.method, path: e.path, status: e.status, changes: e.changes || [] })),
    });
  } catch (err) {
    console.error('[adminActivity session]', err);
    res.status(500).json({ error: 'Could not load this session' });
  }
});

// ---- deletes: never touch a session that is active right now ----
async function deleteSessions(filter) {
  const active = { endedAt: null, lastActivityAt: { $gt: activeCut() } };
  const skippedActive = await ActivitySession.countDocuments({ ...filter, ...active });
  const r = await ActivitySession.deleteMany({ ...filter, $nor: [active] });
  return { deleted: r.deletedCount, skippedActive };
}

// DELETE /people/:clientId?from&to -- all of a person's sessions (optionally only inside the dates).
router.delete('/people/:clientId', async (req, res) => {
  try {
    const clientId = text(req.params.clientId, 64);
    const range = rangeFilter(text(req.query.from, 10), text(req.query.to, 10));
    if (range === null) return bad(res, 'From and To must be dates like 2026-11-30');
    const filter = { user: clientId };
    if (Object.keys(range).length) filter.startedAt = range;
    const out = await deleteSessions(filter);
    await audit(req, 'activity.delete.person', `Deleted ${out.deleted} session(s) of ${clientId}`, { clientId, from: req.query.from || null, to: req.query.to || null, ...out });
    res.json(out);
  } catch (err) {
    console.error('[adminActivity delete person]', err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// DELETE /people/:clientId/days/:day
router.delete('/people/:clientId/days/:day', async (req, res) => {
  try {
    if (!isDayKey(req.params.day)) return bad(res, 'day must look like 2026-11-30');
    const clientId = text(req.params.clientId, 64);
    const out = await deleteSessions({ user: clientId, startedAt: { $gte: dayStart(req.params.day), $lt: dayEnd(req.params.day) } });
    await audit(req, 'activity.delete.day', `Deleted ${out.deleted} session(s) of ${clientId} on ${req.params.day}`, { clientId, day: req.params.day, ...out });
    res.json(out);
  } catch (err) {
    console.error('[adminActivity delete day]', err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// DELETE /sessions/:sid
router.delete('/sessions/:sid', async (req, res) => {
  try {
    const sid = text(req.params.sid, 64);
    const s = await ActivitySession.findOne({ sid }).select('user').lean();
    if (!s) return res.status(404).json({ error: 'Session not found' });
    const out = await deleteSessions({ sid });
    await audit(req, 'activity.delete.session', `Deleted ${out.deleted} session(s) of ${s.user}`, { clientId: s.user, sid, ...out });
    res.json(out);
  } catch (err) {
    console.error('[adminActivity delete session]', err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
