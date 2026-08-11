const mongoose = require('mongoose');

// A collection of admin-managed Magic Art packs -- each a target image +
// an overlay video, tracked and played back via mind-ar-js when a
// visitor points a phone camera at the image (see client-app's
// MagicCamera.jsx). "Art 1", "Art 2", etc. in the admin UI are just this
// doc's position when sorted by createdAt -- no stored number, so
// deleting one never requires renumbering the rest.
const magicArtSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    description: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    imageWidth: Number,
    imageHeight: Number,
    videoUrl: { type: String, trim: true },
    // Display-only crop, fractional (0-1) within the ORIGINAL video's own
    // pixel size -- applied at playback via a texture UV transform
    // (MagicCamera.jsx), the uploaded file itself is never re-encoded, so
    // there's no re-encode quality loss and no video-processing
    // dependency needed here.
    videoCropX: Number,
    videoCropY: Number,
    videoCropWidth: Number,
    videoCropHeight: Number,
    // Which packs the client dashboard's Magic Camera scans -- admin picks
    // explicitly (see the /activate and /deactivate routes), NOT
    // exclusive, several packs can be active at once (Magic Camera
    // auto-detects which one it's pointed at). Defaults false; if nothing
    // has been picked yet, MagicCamera.jsx falls back to every complete
    // pack so existing setups keep working unchanged.
    active: { type: Boolean, default: false },
    updatedBy: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MagicArt', magicArtSchema);
