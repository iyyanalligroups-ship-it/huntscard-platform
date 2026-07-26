const mongoose = require('mongoose');

// AR layout config -- positions are stored as percentages (0-100) within
// a virtual card area, matching how the drag-and-drop canvas (admin AND
// client versions) represents them -- the mobile app converts these into
// actual 3D coordinates when rendering.
//
// Two kinds of document live in this collection:
//   1. The single doc with key: 'global' -- the admin-managed DEFAULT
//      template, used as a starting point for any client who hasn't
//      customized their own layout yet.
//   2. One doc per client (clientId set, key left unset) -- a client's
//      own customized arrangement, set from their dashboard's AR Layout
//      page. This is what HuntsAR World actually uses once it exists;
//      falls back to the global default doc if a client has none.
// Elements aren't confined to the printed card -- in AR they can float in
// the space around it too, so the range extends well past the card's own
// 0-100 edges. Must match POSITION_MIN/MAX in both editors' clampPercent().
const POSITION_MIN = -60;
const POSITION_MAX = 160;
const elementPositionSchema = new mongoose.Schema(
  {
    x: { type: Number, min: POSITION_MIN, max: POSITION_MAX, default: 50 },
    y: { type: Number, min: POSITION_MIN, max: POSITION_MAX, default: 50 },
  },
  { _id: false }
);

const arLayoutSchema = new mongoose.Schema(
  {
    // Set ONLY on the one global default doc.
    key: { type: String, unique: true, sparse: true },
    // Set on every per-client doc; absent on the global default doc.
    clientId: { type: String, unique: true, sparse: true },
    // The QR's own position -- NOT always dead-center, since the real
    // printed QR might not be. Every other element's position is
    // interpreted relative to this, not to a fixed 50/50 assumption.
    qr: { type: elementPositionSchema, default: () => ({ x: 50, y: 50 }) },
    video: { type: elementPositionSchema, default: () => ({ x: 50, y: 20 }) },
    contact: { type: elementPositionSchema, default: () => ({ x: 50, y: 45 }) },
    portfolio: { type: elementPositionSchema, default: () => ({ x: 15, y: 60 }) },
    social: { type: elementPositionSchema, default: () => ({ x: 85, y: 60 }) },
    huntsworld: { type: elementPositionSchema, default: () => ({ x: 50, y: 85 }) },
    // Real 3D model (arModelUrl) -- given open space of its own, not
    // stacked on the video/photo panel's default spot.
    model: { type: elementPositionSchema, default: () => ({ x: 50, y: 35 }) },
    // How the model itself is oriented/sized -- set via the editor's
    // turntable drag + resize controls, applied as-is when actually
    // rendering the model in HuntsAR World (not just an editor preview).
    modelRotationX: { type: Number, min: -90, max: 90, default: 0 }, // pitch, degrees
    modelRotationY: { type: Number, default: 0 }, // yaw, degrees -- unbounded, wraps freely
    modelRotationZ: { type: Number, default: 0 }, // roll, degrees -- unbounded, wraps freely like yaw
    modelScale: { type: Number, min: 0.3, max: 2.5, default: 1 },
    // Same idea as the model's own rotation/scale above, but for the AR
    // Video/Photo panel -- it's rendered as a real 3D card in HuntsAR
    // World (not a flat billboard) once a video or photo exists, so it
    // gets the same X/Y/Z orientation + resize controls.
    videoRotationX: { type: Number, min: -90, max: 90, default: 0 },
    videoRotationY: { type: Number, default: 0 },
    videoRotationZ: { type: Number, default: 0 },
    videoScale: { type: Number, min: 0.3, max: 2.5, default: 1 },
    updatedBy: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ArLayout', arLayoutSchema);
