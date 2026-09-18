const mongoose = require('mongoose');

// One showcase card variant on the public Catalog page (client-app's
// Catalog.jsx) -- e.g. "Premium", "Elite", "Custom v2". Deliberately its
// own model, not reusing CardPlan directly, even though the fields
// overlap a lot (name/price/images): a Catalog entry is a marketing
// showcase (material, color count, a free-form feature checklist) and
// doesn't have to correspond 1:1 to a real purchasable CardPlan -- some
// tiers here may exist only informationally before Shop sells them.
// `linkedPlanKey` is the optional bridge between the two: when set (and
// matching a real CardPlan.key), the Catalog card's CTA deep-links into
// Shop with that plan pre-selected instead of just linking to Shop
// generally.
const CatalogEntrySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true }, // slug, e.g. "custom-2"
    name: { type: String, required: true, trim: true }, // e.g. "Custom Variant 2"
    price: { type: Number, default: null }, // whole rupees, display only -- not a checkout amount
    // "Printing & Material Details" bullets -- matches the TapMo reference
    // catalog's exact field set (Printing Type / Material / NFC Chip Size /
    // Engraved Text Color / Durability), each rendered as its own bullet
    // on the public page, skipped individually when blank.
    printingType: { type: String, trim: true }, // e.g. "Laser Engraving", "UV"
    material: { type: String, trim: true }, // e.g. "PVC", "Premium Black Metal", "Wood"
    nfcChipSize: { type: String, trim: true }, // e.g. "Small (Square)", "Big"
    engravedTextColor: { type: String, trim: true }, // e.g. "Silver", "Gold", "Any Colour"
    durability: { type: String, trim: true }, // e.g. "Long Lasting", "Moderate / Reliable"
    colorCount: { type: Number, default: null }, // number of color options offered -- extra, not part of the TapMo bullet set
    // Free-form checklist (e.g. "NFC", "Vcard", "QR", "Zing feature",
    // "Qr AR", "Magic card", "20MB storage") -- unlike CardPlan's fixed
    // arEnabled/zingEnabled booleans, this is just display text, so a new
    // feature line never needs a schema change.
    features: { type: [String], default: [] },
    // Card photos -- two fixed, named slots (not a growable array like
    // CardPlan.images) since a real card only ever has a front and a
    // back, and the public page always shows them in that order.
    frontImageUrl: { type: String, trim: true, default: null },
    backImageUrl: { type: String, trim: true, default: null },
    // Optional demo clip for this specific variant -- an already-hosted
    // link (YouTube page URL or a direct video file), same "admin pastes
    // a link, no upload" pattern as VideoShort.videoUrl. Shown on hover
    // over the front photo on the public Catalog page (Catalog.jsx),
    // filling the exact same box the photo does, rather than in the
    // separate "See it in motion" section below (which pulls from the
    // VideoShort model instead, unrelated to any one variant).
    videoUrl: { type: String, trim: true, default: null },
    // Optional CardPlan.key this entry represents for checkout purposes.
    // Joined at read time (not copied), same "reference by key" principle
    // as Client.cardType <-> CardPlan.key elsewhere in this app.
    linkedPlanKey: { type: String, trim: true, lowercase: true, default: null },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }, // lower shows first
    updatedBy: { type: String, trim: true },
    // Both options are the same overall row on the public Catalog page
    // (name/price/details on one side, front+back photos on the other) --
    // they only differ in how the two photos are arranged within that
    // image side. 'horizontal' (default, the original/only layout before
    // this field existed): front above back, stacked. 'vertical': front
    // next to back, side by side.
    viewLayout: { type: String, enum: ['vertical', 'horizontal'], default: 'horizontal' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CatalogEntry', CatalogEntrySchema);
