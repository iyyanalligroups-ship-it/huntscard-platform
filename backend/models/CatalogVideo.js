const mongoose = require('mongoose');

// One video per card type (CardPlan.key), shown on the public Catalog
// page so a visitor can see what each tier actually looks/feels like
// before buying -- separate from the plan's still product photos
// (CardPlan.images), which stay where they are on Shop.
const CatalogVideoSchema = new mongoose.Schema(
  {
    cardType: { type: String, required: true, unique: true, lowercase: true, trim: true }, // matches CardPlan.key
    videoUrl: { type: String, required: true },
    uploadedBy: { type: String, trim: true }, // admin's login email, for a light audit trail
  },
  { timestamps: true }
);

module.exports = mongoose.model('CatalogVideo', CatalogVideoSchema);
