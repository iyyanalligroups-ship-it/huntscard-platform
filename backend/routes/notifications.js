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
    const notifications = await Notification.find({ clientId: req.user.clientId }).sort({ createdAt: -1 }).limit(50);
    const unreadCount = await Notification.countDocuments({ clientId: req.user.clientId, read: false });
    res.json({ notifications, unreadCount });
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
