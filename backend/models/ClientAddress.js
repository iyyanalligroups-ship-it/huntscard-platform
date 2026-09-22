const mongoose = require('mongoose');

// A client's saved delivery address book -- separate collection keyed by
// clientId (same convention as CardTicket/ChatMessage etc.), not embedded
// on Client, since this is a growable list the client manages themselves
// (add/edit/delete/pick-one-at-checkout), not a fixed part of the profile
// record. Picked from at Magic Poster checkout (see client-app's
// MagicPosterCart.jsx) instead of retyping the same address every order;
// the order itself still SNAPSHOTS the chosen address's fields at
// purchase time (see MagicPosterOrder.delivery), so a later edit/delete
// here never rewrites what a past order shipped to.
const ClientAddressSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, index: true },
    label: { type: String, trim: true, default: '' }, // optional nickname, e.g. "Home"
    name: { type: String, trim: true, required: true },
    phone: { type: String, trim: true, required: true },
    line1: { type: String, trim: true, required: true },
    line2: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, required: true },
    state: { type: String, trim: true, required: true },
    city: { type: String, trim: true, required: true },
    // Manual entry, not looked up -- see routes/public.js's geo endpoints
    // comment for why there's no reliable free city -> pincode dataset.
    pincode: { type: String, trim: true, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ClientAddress', ClientAddressSchema);
