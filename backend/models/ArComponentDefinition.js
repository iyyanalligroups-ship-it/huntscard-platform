const mongoose = require('mongoose');

// Admin-defined extra AR Layout panel elements -- lets an admin add a new
// simple "icon + link" draggable component (e.g. "Map") to HuntsAR World
// at any time without a code change, the same pattern AttributeDefinition
// already uses for the flat profile page's custom fields. This is the
// DEFINITION only: each client's own link value lives in
// Client.arComponentValues (keyed by this doc's `key`), and its position
// in the floating panel lives in ArLayout.customElements (same key).
// Icons reuse the existing ArIcon.sectionIcons store -- see
// getValidArIconKeys() in routes/admin.js.
//
// Deliberately scoped to simple link-style components only -- something
// like the 3D Model or AR Video/Photo panels needs real rendering code
// (GLTFLoader, a Three.js plane) no admin UI can substitute for, so this
// schema only describes "an icon that opens a link," not arbitrary AR
// behavior. valueType stays an enum (not hardcoded to 'url') so a future
// text-only component doesn't need a schema change either.
const arComponentDefinitionSchema = new mongoose.Schema(
  {
    // Auto-slugified from `label` when created -- stable even if the
    // label is edited later, since it's what keys every client's saved
    // value and position.
    key: { type: String, required: true, unique: true, trim: true },
    label: { type: String, required: true, trim: true },
    valueType: { type: String, enum: ['url'], default: 'url' },
    order: { type: Number, default: 0 },
    // Lets an admin retire a component without deleting clients' saved
    // values/positions for it -- it just stops being shown anywhere.
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ArComponentDefinition', arComponentDefinitionSchema);
