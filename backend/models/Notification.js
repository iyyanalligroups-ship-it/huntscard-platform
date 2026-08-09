const mongoose = require('mongoose');

// In-app alerts for a card owner -- currently only fired when a visitor
// shares their own contact back via the public profile's "Exchange
// Contact" flow (see routes/public.js's POST /leads/:clientId), not on
// every raw card tap (no per-tap log/throttling exists to do that without
// risking feeling spammy). Read by the dashboard's NotificationBell.
const NotificationSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, index: true },
    message: { type: String, required: true },
    // Links back to the Contact this notification is about, so a future
    // click-through could jump straight to it -- not required, since this
    // model may grow other notification types later that aren't tied to a
    // specific contact.
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', NotificationSchema);
