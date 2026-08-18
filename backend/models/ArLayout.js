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
// How far an element can float off the card's own surface, toward the
// viewer -- 0 sits flat on the card (the only value most elements ever
// use), 100 is roughly one card-height's worth of lift. Only the 3D
// model and AR Video/Photo panel currently expose a control for this
// (see ArLayout.jsx); every other element simply stays at the default.
const HEIGHT_MIN = 0;
const HEIGHT_MAX = 100;
const elementPositionSchema = new mongoose.Schema(
  {
    x: { type: Number, min: POSITION_MIN, max: POSITION_MAX, default: 50 },
    y: { type: Number, min: POSITION_MIN, max: POSITION_MAX, default: 50 },
    z: { type: Number, min: HEIGHT_MIN, max: HEIGHT_MAX, default: 0 },
  },
  { _id: false }
);

const arLayoutSchema = new mongoose.Schema(
  {
    // Set ONLY on the one global default doc.
    key: { type: String, unique: true, sparse: true },
    // Set on every per-client doc; absent on the global default doc.
    clientId: { type: String },
    // Which of that client's PHYSICAL cards this doc belongs to (see
    // models/Card.js's own cardNumber) -- set on every per-client doc
    // alongside clientId, absent on the global default doc. A client with
    // several physical cards (different purchased variants/shapes) gets
    // one AR Layout doc per card, not one shared arrangement for all of
    // them -- see the schema-level unique index below.
    cardNumber: { type: Number, default: null },
    // The QR's own position -- NOT always dead-center, since the real
    // printed QR might not be. Every other element's position is
    // interpreted relative to this, not to a fixed 50/50 assumption.
    qr: { type: elementPositionSchema, default: () => ({ x: 50, y: 50 }) },
    // Slide/dashboard panel floats centered above the model, like an
    // upright screen standing behind it -- not stacked directly over the QR.
    video: { type: elementPositionSchema, default: () => ({ x: 50, y: -42 }) },
    // Link icons sit in a single row just past the card's bottom edge.
    contact: { type: elementPositionSchema, default: () => ({ x: 30, y: 96 }) },
    portfolio: { type: elementPositionSchema, default: () => ({ x: 45, y: 96 }) },
    social: { type: elementPositionSchema, default: () => ({ x: 60, y: 96 }) },
    huntsworld: { type: elementPositionSchema, default: () => ({ x: 75, y: 96 }) },
    // Real 3D model (arModelUrl) -- sits inside the card itself, toward
    // the left edge and vertically centered, out of the QR/icon's way.
    model: { type: elementPositionSchema, default: () => ({ x: 20, y: 50 }) },
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
    // Independent width ("length") / height ("breadth") scale, unlike the
    // model's single uniform modelScale -- the banner is a rectangular
    // card image/video, so stretching it non-uniformly is a real, useful
    // adjustment the model (usually a roughly-centered figure) doesn't need.
    videoScaleX: { type: Number, min: 0.3, max: 10, default: 1 },
    videoScaleY: { type: Number, min: 0.3, max: 10, default: 1 },
    // Positions for admin-defined custom AR Layout components (see
    // ArComponentDefinition) -- same idea as the named position fields
    // above (contact, portfolio, etc.), but keyed dynamically since the
    // set of custom components can grow without a schema change.
    customElements: { type: Map, of: elementPositionSchema, default: {} },
    updatedBy: { type: String, trim: true },
  },
  { timestamps: true }
);

// One doc per (clientId, cardNumber) pair -- replaces the old bare
// clientId-unique index now that a client can have several physical
// cards, each with their own arrangement. Sparse so the key:'global'
// singleton (neither field set) never collides with anything -- Mongo's
// sparse-compound semantics only exclude a doc from the index when ALL
// indexed fields are absent.
arLayoutSchema.index({ clientId: 1, cardNumber: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('ArLayout', arLayoutSchema);
