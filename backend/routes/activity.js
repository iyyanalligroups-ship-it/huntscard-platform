// "My activity": the logged-in client's own login sessions and steps, by day. Mounted at /api/profile.
// The person is always req.user.clientId from the verified token, never an id from the URL, so nobody can
// read someone else's activity here. These reads are not logged as steps (unknown GETs are skipped), so
// the page's auto-refresh does not fill the log.
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ActivitySession = require('../models/ActivitySession');
const { isDayKey, dayStart, dayEnd } = require('../utils/istTime');
const { dayCardsPipeline, dayCardView, sessionRow } = require('../utils/activityQueries');
const { appendClientEvents } = require('../utils/activityLog');

const router = express.Router();
const PAGE_DAYS = 7;

// GET /api/profile/activity?from&to&page -- 7 days per page, newest first.
router.get('/activity', requireAuth, async (req, res) => {
  try {
    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';
    if ((from && !isDayKey(from)) || (to && !isDayKey(to))) return res.status(400).json({ error: 'From and To must be dates like 2026-11-30' });
    const match = { user: req.user.clientId };
    if (from || to) match.startedAt = { ...(from ? { $gte: dayStart(from) } : {}), ...(to ? { $lt: dayEnd(to) } : {}) };
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const [agg] = await ActivitySession.aggregate(dayCardsPipeline(match, { skip: (page - 1) * PAGE_DAYS, limit: PAGE_DAYS }));
    res.json({
      page,
      pageSize: PAGE_DAYS,
      total: agg.total[0]?.n || 0,
      currentSid: req.user.sid || null, // the live session of this very login, so the page can open it
      days: agg.days.map(dayCardView),
    });
  } catch (err) {
    console.error('[activity GET]', err);
    res.status(500).json({ error: 'Could not load your activity' });
  }
});

// GET /api/profile/activity/days/:day -- that day's sessions, with their steps.
router.get('/activity/days/:day', requireAuth, async (req, res) => {
  try {
    if (!isDayKey(req.params.day)) return res.status(400).json({ error: 'day must look like 2026-11-30' });
    const sessions = await ActivitySession.find({ user: req.user.clientId, startedAt: { $gte: dayStart(req.params.day), $lt: dayEnd(req.params.day) } })
      .sort({ startedAt: 1 })
      .lean();
    res.json({
      day: req.params.day,
      sessions: sessions.map((s) => ({
        ...sessionRow(s),
        current: !!req.user.sid && s.sid === req.user.sid,
        trimmed: s.eventCount > s.events.length,
        events: s.events.map((e) => ({ at: e.at, label: e.label, changes: e.changes || [] })), // no paths, methods or IPs
      })),
    });
  } catch (err) {
    console.error('[activity day GET]', err);
    res.status(500).json({ error: 'Could not load your activity' });
  }
});

// POST /api/profile/activity-events { events: [{ at, label, page }] } -- what the website tracker saw in the
// browser (page opened, button clicked, search typed...). The answer is sent first; the write never blocks.
router.post('/activity-events', requireAuth, (req, res) => {
  res.status(204).end();
  appendClientEvents(req, req.user, req.body && req.body.events).catch(() => {});
});

module.exports = router;
