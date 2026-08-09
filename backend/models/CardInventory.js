const mongoose = require('mongoose');

// Blank physical card stock sitting on hand, before any card is ever
// assigned to a client -- distinct from the Card model (models/Card.js),
// which only ever represents a card already tied to one specific client.
// Prime-only (see requireAdminPrime in middleware/auth.js) -- other
// admins don't see this at all.
const CardInventorySchema = new mongoose.Schema(
  {
    color: { type: String, required: true, trim: true, lowercase: true }, // e.g. "black", "white", "gold"
    quantity: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true }
);

CardInventorySchema.index({ color: 1 }, { unique: true });

module.exports = mongoose.model('CardInventory', CardInventorySchema);
