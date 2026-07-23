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
const elementPositionSchema = new mongoose.Schema(
  {
    x: { type: Number, min: 0, max: 100, default: 50 },
    y: { type: Number, min: 0, max: 100, default: 50 },
  },
  { _id: false }
);

const arLayoutSchema = new mongoose.Schema(
  {
    // Set ONLY on the one global default doc.
    key: { type: String, unique: true, sparse: true },
    // Set on every per-client doc; absent on the global default doc.
    clientId: { type: String, unique: true, sparse: true },
    video: { type: elementPositionSchema, default: () => ({ x: 50, y: 20 }) },
    contact: { type: elementPositionSchema, default: () => ({ x: 50, y: 45 }) },
    portfolio: { type: elementPositionSchema, default: () => ({ x: 15, y: 60 }) },
    social: { type: elementPositionSchema, default: () => ({ x: 85, y: 60 }) },
    huntsworld: { type: elementPositionSchema, default: () => ({ x: 50, y: 85 }) },
    updatedBy: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ArLayout', arLayoutSchema);
