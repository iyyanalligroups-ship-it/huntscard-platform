const mongoose = require('mongoose');

// One positioned video clip on top of a StreetArt piece's base photo -- a
// mural can need more than one (e.g. each wing of a painted wings mural
// animates separately), unlike MagicArt's single image+video pair.
// x/y are the box's TOP-LEFT corner as a percentage of the base image's
// width/height; width/height are the box's own size, same percentage units.
// videoCrop* (fractional 0-1 of the uploaded video's own natural size) is
// a display-only crop, same convention as MagicArt's videoCrop* fields --
// the file itself is stored exactly as uploaded, the crop is just applied
// at playback (once the client-side scan integration is built).
const overlayClipSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true },
    videoUrl: { type: String, trim: true },
    videoCropX: Number,
    videoCropY: Number,
    videoCropWidth: Number,
    videoCropHeight: Number,
    x: { type: Number, default: 35 },
    y: { type: Number, default: 35 },
    width: { type: Number, default: 30 },
    height: { type: Number, default: 30 },
  },
  { timestamps: true }
);

// Admin-managed street art piece -- a real-world mural/wall art photo plus
// one or more positioned overlay videos, tracked via mind-ar like MagicArt.
// Deliberately never exposed on any public listing route (see StreetArt
// routes in admin.js and its absence from public.js) -- discoverable only
// by scanning the physical wall art with Magic Camera.
const streetArtSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    description: { type: String, trim: true },
    location: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    imageWidth: Number,
    imageHeight: Number,
    overlays: [overlayClipSchema],
    active: { type: Boolean, default: false },
    updatedBy: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StreetArt', streetArtSchema);
