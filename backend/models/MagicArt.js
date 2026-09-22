const mongoose = require('mongoose');

// One positioned video clip on top of a Magic Art pack's base image --
// same shape/convention as StreetArt.js's overlay clips (a pack can need
// more than one, e.g. separate animated elements at different spots on
// the artwork, not just one video stretched across the whole image).
// x/y are the box's TOP-LEFT corner as a percentage of the base image's
// width/height; width/height are the box's own size, same percentage
// units. videoCrop* (fractional 0-1 of the uploaded video's own natural
// size) is a display-only crop, applied at playback via a texture UV
// transform -- the file itself is stored exactly as uploaded.
const overlayClipSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true },
    videoUrl: { type: String, trim: true },
    videoCropX: Number,
    videoCropY: Number,
    videoCropWidth: Number,
    videoCropHeight: Number,
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    width: { type: Number, default: 100 },
    height: { type: Number, default: 100 },
  },
  { timestamps: true }
);

// A collection of admin-managed Magic Art packs -- each a target image +
// one or more positioned overlay video clips, tracked and played back via
// mind-ar-js when a visitor points a phone camera at the image (see
// client-app's MagicCamera.jsx). "Art 1", "Art 2", etc. in the admin UI
// are just this doc's position when sorted by createdAt -- no stored
// number, so deleting one never requires renumbering the rest.
const magicArtSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    description: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    imageWidth: Number,
    imageHeight: Number,
    overlays: [overlayClipSchema],
    // Which packs the client dashboard's Magic Camera scans -- admin picks
    // explicitly (see the /activate and /deactivate routes), NOT
    // exclusive, several packs can be active at once (Magic Camera
    // auto-detects which one it's pointed at). Defaults false; if nothing
    // has been picked yet, MagicCamera.jsx falls back to every complete
    // pack so existing setups keep working unchanged.
    active: { type: Boolean, default: false },
    // Selling price for the public Magic Poster shop -- same
    // Number/whole-rupees/null-until-set convention as CardPlan's
    // priceAmount (see utils/pricing.js). priceAmount is the real/MRP
    // price; discountPriceAmount, when set, is what's actually charged
    // (see getMagicArtChargeAmount). A piece with neither set just
    // shows no buy button on the public page.
    priceAmount: { type: Number, default: null },
    discountPriceAmount: { type: Number, default: null },
    updatedBy: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MagicArt', magicArtSchema);
