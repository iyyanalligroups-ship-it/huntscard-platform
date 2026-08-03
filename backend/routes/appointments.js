const express = require('express');
const { requireAuth } = require('../middleware/auth');
const Client = require('../models/Client');
const Contact = require('../models/Contact');
const AppointmentRequest = require('../models/AppointmentRequest');
const { sendSms } = require('../utils/sms');
const { sendEmail } = require('../utils/email');

const router = express.Router();

// ---------------------------------------------------------------------
// Appointment requests -- sent from a client's own Contacts list (see
// Contact.js) to a phone number, not necessarily an existing Huntstag
// account. If that phone matches a registered client, they see the
// request immediately on their own Appointment Requests page; otherwise
// an SMS invite goes out and the request gets silently claimed the
// moment someone registers with that phone (see claimAppointmentRequests
// below, called from routes/auth.js's POST /register).
// ---------------------------------------------------------------------

// Contact phone numbers in this codebase are entered in wildly
// inconsistent formats (+91XXXXXXXXXX, XXX-XXX-XXXX, spaced, etc, see
// Contacts.jsx) -- matching on the last 10 digits (a plain Indian mobile
// number, no country code) is far more reliable than an exact string
// match would be.
function normalizePhone(phone) {
  return (phone || '').toString().replace(/\D/g, '').slice(-10);
}

// Called right after a new Client is created (see routes/auth.js POST
// /register) -- claims any appointment requests that were sent to this
// phone number before the recipient had an account.
async function claimAppointmentRequests(client) {
  const normalized = normalizePhone(client.phone);
  if (!normalized || normalized.length < 10) return;
  const unclaimed = await AppointmentRequest.find({ toClientId: null });
  const toClaim = unclaimed.filter((r) => normalizePhone(r.toPhone) === normalized);
  if (toClaim.length === 0) return;
  await AppointmentRequest.updateMany(
    { _id: { $in: toClaim.map((r) => r._id) } },
    { $set: { toClientId: client.clientId } }
  );
}

// POST /api/profile/appointments -- body: { contactId, note? }. Sends a
// request to that contact's saved phone number -- in-app if it matches a
// registered account, an SMS invite otherwise.
router.post('/appointments', requireAuth, async (req, res) => {
  try {
    const { contactId, note, proposedAt } = req.body || {};
    if (!contactId) return res.status(400).json({ error: 'contactId is required' });
    let parsedProposedAt = null;
    if (proposedAt) {
      const d = new Date(proposedAt);
      if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid proposed date/time' });
      // Server-side backstop for the same rule the client's own date
      // picker enforces (min={now}) -- never trust the client alone for
      // "this can't be in the past."
      if (d.getTime() < Date.now()) return res.status(400).json({ error: 'Proposed time cannot be in the past' });
      parsedProposedAt = d;
    }

    const contact = await Contact.findOne({ _id: contactId, clientId: req.user.clientId });
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    // Regex match on the last 10 digits, not an exact string compare --
    // phone numbers in this codebase get typed in wildly inconsistent
    // formats (see normalizePhone above), so this catches "+91 99525
    // 47474" matching a Client.phone stored as "9952547474" or vice
    // versa. Digits-only input, safe to drop straight into a regex.
    const normalized = normalizePhone(contact.phone);
    const matchedClient =
      normalized.length === 10
        ? await Client.findOne({ phone: { $regex: normalized + '$' } }).select('clientId phone loginEmail')
        : null;

    const request = await AppointmentRequest.create({
      fromClientId: req.user.clientId,
      toClientId: matchedClient?.clientId || null,
      toPhone: contact.phone,
      toName: contact.name,
      note: (note || '').toString().trim(),
      proposedAt: parsedProposedAt,
      invitedViaSms: !matchedClient,
    });

    const sender = await Client.findOne({ clientId: req.user.clientId }).select('fullName');
    if (!matchedClient) {
      const link = `${process.env.PUBLIC_BASE_URL}/register`;
      // NOTE: this exact wording needs to be a DLT-approved template on
      // the ChennaiSMS account before it will actually deliver in India
      // (see utils/sms.js / the login-OTP text for why) -- swap in
      // whatever text gets approved, this is a placeholder.
      await sendSms(
        contact.phone,
        `${sender?.fullName || 'Someone'} wants to schedule an appointment with you on HuntsTAG. Create your free account to view it: ${link}`
      );
    } else if (matchedClient.loginEmail) {
      // The recipient already has an account -- nothing about creating
      // the AppointmentRequest doc itself would ever notify them (they'd
      // only find out by happening to open their own Appointment
      // Requests page), so this is the actual "someone requested a
      // meeting" alert for that path. Best-effort, never blocks the
      // response -- see utils/email.js for what happens if SMTP isn't
      // reachable from this machine.
      const link = `${process.env.PUBLIC_BASE_URL}/dashboard/appointments`;
      const when = parsedProposedAt ? ` for ${parsedProposedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : '';
      sendEmail(
        matchedClient.loginEmail,
        'New appointment request on HuntsTAG',
        `${sender?.fullName || 'Someone'} requested an appointment with you${when}.${note ? `\n\n"${note}"` : ''}\n\nView it: ${link}`
      ).catch((err) => console.error('[appointments email notify]', err));
    }

    res.status(201).json(request);
  } catch (err) {
    console.error('[appointments POST]', err);
    res.status(500).json({ error: 'Failed to send appointment request' });
  }
});

// GET /api/profile/appointments/busy?phone=... -- free/busy check before
// proposing a time, NOT a real calendar (no availability schedule exists
// in this system) -- just "does this phone's matching account already
// have accepted appointments coming up," so a sender can avoid an
// obvious double-book. Only ever returns bare timestamps, never who
// with/notes -- same privacy level as a calendar's free/busy sharing,
// not the full appointment. Each accepted appointment is treated as
// blocking a flat 1-hour window (there's no duration field on
// AppointmentRequest), a simplification, not a real scheduling engine.
router.get('/appointments/busy', requireAuth, async (req, res) => {
  try {
    const normalized = normalizePhone(req.query.phone);
    if (normalized.length !== 10) return res.json({ matched: false, busy: [] });

    const matchedClient = await Client.findOne({ phone: { $regex: normalized + '$' } }).select('clientId');
    if (!matchedClient) return res.json({ matched: false, busy: [] });

    const upcoming = await AppointmentRequest.find({
      toClientId: matchedClient.clientId,
      status: 'accepted',
      proposedAt: { $gte: new Date(), $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    }).select('proposedAt');

    res.json({ matched: true, busy: upcoming.map((r) => r.proposedAt) });
  } catch (err) {
    console.error('[appointments busy GET]', err);
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

// GET /api/profile/appointments/received -- requests sent TO me.
router.get('/appointments/received', requireAuth, async (req, res) => {
  try {
    const requests = await AppointmentRequest.find({ toClientId: req.user.clientId }).sort({ createdAt: -1 });
    const senderIds = [...new Set(requests.map((r) => r.fromClientId))];
    const senders = await Client.find({ clientId: { $in: senderIds } }).select('clientId fullName photoUrl');
    const senderById = new Map(senders.map((s) => [s.clientId, s]));
    res.json(
      requests.map((r) => ({
        ...r.toObject(),
        fromName: senderById.get(r.fromClientId)?.fullName || 'Unknown',
        fromPhotoUrl: senderById.get(r.fromClientId)?.photoUrl || null,
      }))
    );
  } catch (err) {
    console.error('[appointments received GET]', err);
    res.status(500).json({ error: 'Failed to load appointment requests' });
  }
});

// GET /api/profile/appointments/sent -- requests I've sent out.
router.get('/appointments/sent', requireAuth, async (req, res) => {
  try {
    const requests = await AppointmentRequest.find({ fromClientId: req.user.clientId }).sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    console.error('[appointments sent GET]', err);
    res.status(500).json({ error: 'Failed to load appointment requests' });
  }
});

// PATCH /api/profile/appointments/:id -- accept or decline. Only the
// recipient can respond -- the sender's own copy is read-only, they just
// watch its status change.
router.patch('/appointments/:id', requireAuth, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!['accepted', 'declined'].includes(status)) {
      return res.status(400).json({ error: 'status must be "accepted" or "declined"' });
    }
    const request = await AppointmentRequest.findOneAndUpdate(
      { _id: req.params.id, toClientId: req.user.clientId },
      { $set: { status } },
      { new: true }
    );
    if (!request) return res.status(404).json({ error: 'Appointment request not found' });
    res.json(request);
  } catch (err) {
    console.error('[appointments PATCH]', err);
    res.status(500).json({ error: 'Failed to update appointment request' });
  }
});

module.exports = router;
module.exports.claimAppointmentRequests = claimAppointmentRequests;
module.exports.normalizePhone = normalizePhone;
