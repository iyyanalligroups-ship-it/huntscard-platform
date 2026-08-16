const mongoose = require('mongoose');

// A support ticket raised from the public tap page when someone hits a
// temporarily-deactivated card (see routes/public.js's cardBlockReason) --
// distinct from the general Contact Us message (ContactMessage), since
// this one carries which specific client/card it's about, so admin can act
// on it directly instead of needing a follow-up just to find that out.
const CardTicketSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, index: true },
    // Which physical card triggered this, if the tap URL had one (see
    // models/Card.js) -- null for a pre-multi-card legacy tap, where only
    // the whole-profile pause could have been the reason anyway.
    cardNumber: { type: Number, default: null },
    name: { type: String, required: true, trim: true },
    contactNumber: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: null },
    issue: { type: String, required: true, trim: true },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CardTicket', CardTicketSchema);
