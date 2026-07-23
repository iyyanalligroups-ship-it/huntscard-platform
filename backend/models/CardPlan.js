const mongoose = require('mongoose');

// Replaces the old hardcoded ['basic','pro','elite'] enum on Client.
// Admin manages these from the Card Plans screen; Client.cardType stores
// the plan's `key` as a plain string reference, not a fixed enum -- so
// adding a new plan never requires a code change.
const CardPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "Elite"
    key: { type: String, required: true, unique: true, lowercase: true, trim: true }, // e.g. "elite" -- used as the CSS/reference tier id
    price: { type: String, trim: true }, // free-form display text ("₹2,499–3,499") -- NOT used for charging
    // Actual amount to charge via Razorpay, in whole rupees (e.g. 2999).
    // Separate from the display `price` above on purpose -- that field is
    // a human-readable range/string, Razorpay needs one fixed number.
    // Null until admin sets it; upgrade requests fall back to the manual
    // "we'll contact you" flow when this isn't set.
    priceAmount: { type: Number, default: null },
    description: { type: String, trim: true },
    // Product photos of the physical card, shown on Shop so clients can
    // see what they're actually buying. Up to 6, enforced server-side at
    // upload time. Plain URL strings, same denormalized-storage pattern
    // as everything else uploaded in this app (photoUrl on Client).
    images: { type: [String], default: [] },
    active: { type: Boolean, default: true }, // inactive plans stay assigned to existing clients but drop out of the "create client" dropdown
    // Whether cards on this plan get the AR QR code on their public tap
    // page (in addition to the regular profile QR every plan gets).
    // AR is a premium-tier feature, not something every card includes.
    arEnabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CardPlan', CardPlanSchema);
