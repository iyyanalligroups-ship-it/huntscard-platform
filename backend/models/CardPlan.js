const mongoose = require('mongoose');

// One selectable option within a plan -- e.g. a plan might offer both a
// horizontal "Matte Black" card and a vertical "Matte Black" card as two
// separate variants. Deliberately lightweight (name + shape only): price
// and product photos stay at the CardPlan level, shared by every variant.
// Keeps its own Mongoose-assigned _id (NOT disabled) -- that ObjectId is
// what Client.cardVariantId references, so admin edits to a variant's
// name/shape here are reflected live for clients already on it (same
// "join at read time" principle as Client.cardType <-> CardPlan.key
// below), rather than clients holding a frozen copy.
const CardPlanVariantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "Matte Black"
    shape: { type: String, enum: ['horizontal', 'vertical'], required: true },
  },
  { _id: true }
);

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
    // Whether clients on this plan can use Zing (share-sheet contact
    // sharing from the dashboard). Premium-tier feature, same gating
    // pattern as arEnabled above.
    zingEnabled: { type: Boolean, default: false },
    // Selectable card options under this plan (e.g. different finishes,
    // some horizontal some vertical). Empty for a plan admin hasn't set
    // any up for yet -- checkout then skips the variant picker entirely.
    variants: { type: [CardPlanVariantSchema], default: [] },
    // True only for the Custom plan -- an explicit admin-set flag (same
    // shape as arEnabled/zingEnabled above) rather than code hardcoding
    // `key === 'custom'`, so it survives a plan rename/re-key. Gates the
    // Shop checkout's front/back design-upload step.
    requiresDesignUpload: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CardPlan', CardPlanSchema);
