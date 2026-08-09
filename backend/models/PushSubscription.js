const mongoose = require('mongoose');

// One doc per browser/device a card owner has granted push permission on
// (see client-app's NotificationBell.jsx) -- a client could have several
// (phone + laptop), so this is a one-to-many relationship to clientId, not
// a field on Client itself. `endpoint` is the push service's own unique
// URL for that subscription, already globally unique by construction.
const PushSubscriptionSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PushSubscription', PushSubscriptionSchema);
