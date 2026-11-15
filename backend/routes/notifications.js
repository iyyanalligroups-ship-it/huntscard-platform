const express = require('express');
const { requireAuth } = require('../middleware/auth');
const Notification = require('../models/Notification');
const PushSubscription = require('../models/PushSubscription');

const router = express.Router();

// ---------------------------------------------------------------------
// In-app notifications (dashboard bell) + Web Push subscription
// management, both scoped to the logged-in client. See
// backend/utils/push.js for the actual send logic, and routes/public.js's
// POST /leads/:clientId for the only current trigger (a visitor sharing
// their contact back via the public profile's "Exchange Contact" flow).
// req.user.clientId (from the verified JWT) is the only source of
// ownership anywhere in this file, same rule contacts.js follows.
// ---------------------------------------------------------------------

// GET /api/profile/notifications -- most recent first, capped at 50 (a
// dashboard bell dropdown, not a full history page).
router.get('/notifications', requireAuth, async (req, res) => {
  try {
    // The bell asks for the default (latest 50); the "all notifications" page pages through with ?limit=&skip=.
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
    const filter = { clientId: req.user.clientId };
    const [notifications, unreadCount, total] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit),
      Notification.countDocuments({ clientId: req.user.clientId, read: false }),
      Notification.countDocuments(filter),
    ]);
    res.json({ notifications, unreadCount, total, hasMore: skip + notifications.length < total });
  } catch (err) {
    console.error('[notifications GET]', err);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

// POST /api/profile/notifications/:id/read
router.post('/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, clientId: req.user.clientId },
      { $set: { read: true } },
      { new: true }
    );
    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    res.json(notification);
  } catch (err) {
    console.error('[notifications read POST]', err);
    res.status(500).json({ error: 'Failed to mark notification read' });
  }
});

// POST /api/profile/notifications/read-all -- mark every unread notification read.
router.post('/notifications/read-all', requireAuth, async (req, res) => {
  try {
    const r = await Notification.updateMany({ clientId: req.user.clientId, read: false }, { $set: { read: true } });
    res.json({ ok: true, marked: r.modifiedCount || 0 });
  } catch (err) {
    console.error('[notifications read-all POST]', err);
    res.status(500).json({ error: 'Failed to mark notifications read' });
  }
});

// DELETE /api/profile/notifications/:id -- delete one of this client's notifications.
router.delete('/notifications/:id', requireAuth, async (req, res) => {
  try {
    const removed = await Notification.findOneAndDelete({ _id: req.params.id, clientId: req.user.clientId });
    if (!removed) return res.status(404).json({ error: 'Notification not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[notifications DELETE]', err);
    res.status(500).json({ error: 'Failed to delete the notification' });
  }
});

// DELETE /api/profile/notifications?scope=all|read -- clear them all, or only the ones already read.
router.delete('/notifications', requireAuth, async (req, res) => {
  try {
    const filter = { clientId: req.user.clientId };
    if (req.query.scope === 'read') filter.read = true;
    else if (req.query.scope !== 'all') return res.status(400).json({ error: 'scope must be "all" or "read"' });
    const r = await Notification.deleteMany(filter);
    res.json({ ok: true, deleted: r.deletedCount || 0 });
  } catch (err) {
    console.error('[notifications clear DELETE]', err);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

// GET /api/profile/push/public-key -- the VAPID public key the frontend
// needs to call pushManager.subscribe() with. Not a secret (it's baked
// into every subscribed browser's own push request), so no auth needed,
// but kept under the authenticated router file for simplicity since only
// the dashboard (already logged in) ever calls it.
router.get('/push/public-key', requireAuth, (req, res) => {
  if (!process.env.WEB_PUSH_PUBLIC_KEY) return res.status(503).json({ error: 'Push notifications are not configured' });
  res.json({ publicKey: process.env.WEB_PUSH_PUBLIC_KEY });
});

// POST /api/profile/push/subscribe -- body is exactly what the browser's
// PushSubscription.toJSON() produces: { endpoint, keys: { p256dh, auth } }.
router.post('/push/subscribe', requireAuth, async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid push subscription' });
    }
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { $set: { clientId: req.user.clientId, keys: { p256dh: keys.p256dh, auth: keys.auth } } },
      { upsert: true }
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[push subscribe POST]', err);
    res.status(500).json({ error: 'Failed to save push subscription' });
  }
});

// POST /api/profile/push/unsubscribe
router.post('/push/unsubscribe', requireAuth, async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
    await PushSubscription.deleteOne({ clientId: req.user.clientId, endpoint });
    res.json({ ok: true });
  } catch (err) {
    console.error('[push unsubscribe POST]', err);
    res.status(500).json({ error: 'Failed to remove push subscription' });
  }
});

module.exports = router;
