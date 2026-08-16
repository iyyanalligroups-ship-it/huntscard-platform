const mongoose = require('mongoose');

// One doc per PHYSICAL NFC card -- distinct from Client, which is the
// profile a card points at. Previously a client could only ever have one
// card (Client.chipEncoded/chipPasswordHash/encodedAt/encodedBy/cardActive
// were single fields on Client itself); this collection lets one profile
// have several independently-tracked cards. Those legacy Client fields
// stay in place for old, unmigrated data (see
// backend/scripts/migrate-cards.js) but every new code path reads/writes
// here instead.
const CardSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, index: true },
    // Sequential per client (1, 2, 3...), not a global card ID -- assigned
    // by POST /api/admin/clients/:clientId/cards as (max existing for this
    // client) + 1. This is also what gets written into the physical
    // chip's own URL going forward (?card=N), so the public routes can
    // tell which specific card was tapped.
    cardNumber: { type: Number, required: true },
    // Same shape as Client.cardType/cardVariantId -- a lowercase string
    // matching a CardPlan.key, plus a separate ObjectId into that plan's
    // own variants[], joined at read time rather than copied.
    cardType: { type: String, trim: true, lowercase: true, default: null },
    cardVariantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Admin's own free-text nickname for THIS specific physical card (e.g.
    // "Front desk", "Spare for Priya") -- distinct from cardType/variant,
    // which describe the plan/style, not which literal object it is. Purely
    // for telling several cards for the same client apart at a glance.
    label: { type: String, trim: true, default: null },
    // AES-256-GCM ciphertext (see backend/utils/crypto.js) -- the actual
    // chip write-password, admin-viewable on purpose (unlike every other
    // secret in this codebase, which is one-way hashed). NEVER sent to
    // client-app; only surfaced via the dedicated admin
    // GET /api/admin/cards/:cardId/password route, not the plain list.
    passwordEncrypted: { type: String, default: null },
    // Per-card active flag -- combined with the public routes' ?card=
    // query param, this is what actually blocks ONE specific physical
    // card while others for the same profile keep working. Cards encoded
    // before this feature existed have no ?card= in their URL and so
    // can't be individually targeted -- see routes/public.js.
    active: { type: Boolean, default: true },
    encoded: { type: Boolean, default: false },
    encodedAt: { type: Date, default: null },
    encodedBy: { type: String, default: null },

    // ---- Fulfillment pipeline -- same shape as the legacy Client fields
    // (see Client.js), now per physical card instead of per profile, so a
    // client with several cards can have each one independently claimed,
    // dispatched, and delivered. Card #1 is mirrored back onto Client's
    // own fields wherever it's mutated (see routes/admin.js), so anything
    // that still reads Client.* directly keeps working for a client's
    // first card. ----
    claimedBy: { type: String, default: null },
    assignedTo: { type: String, default: null },
    dispatched: { type: Boolean, default: false },
    dispatchedAt: { type: Date, default: null },
    dispatchedBy: { type: String, default: null },
    trackingId: { type: String, default: null, trim: true },
    delivered: { type: Boolean, default: false },
    deliveredAt: { type: Date, default: null },
  },
  { timestamps: true }
);

CardSchema.index({ clientId: 1, cardNumber: 1 }, { unique: true });

module.exports = mongoose.model('Card', CardSchema);
