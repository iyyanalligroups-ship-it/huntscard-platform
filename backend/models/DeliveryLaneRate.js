const mongoose = require('mongoose');

// One row per DTDC delivery "lane" (see utils/deliveryRates.js -- regional/
// zonal/metro/roi/splDest/ne, NOT one row per state; a destination state
// maps to exactly one of these via STATE_LANE). Weight-tiered, per the
// courier rate card (huntscard-platform/quotation.doc) this was seeded
// from: under250/under500/under3000 are flat rupee amounts for a shipment
// under that many grams, perKgAbove3kg is a per-kilogram rate for
// anything heavier. A lane's row is seeded from
// utils/deliveryRates.js's DEFAULT_LANE_RATES the first time it's
// requested (routes/admin.js's GET /delivery-rates) -- admin can edit any
// value afterward via admin-huntscard's Magic Poster Settings page, and
// that edit is never overwritten back to the default.
const deliveryLaneRateSchema = new mongoose.Schema(
  {
    lane: {
      type: String,
      required: true,
      unique: true,
      enum: ['regional', 'zonal', 'metro', 'roi', 'splDest', 'ne'],
    },
    under250: { type: Number, required: true, default: 0 },
    under500: { type: Number, required: true, default: 0 },
    under3000: { type: Number, required: true, default: 0 },
    perKgAbove3kg: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DeliveryLaneRate', deliveryLaneRateSchema);
