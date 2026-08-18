const mongoose = require('mongoose');

// Admin-managed DEFAULT arrangement for Magic Business Card's floating
// components (Call/Portfolio/Social/Huntsworld + custom magicComponent
// AttributeDefinitions) -- same "one global template, same field shape as
// the per-client version" split ArLayout.js already uses for the AR QR
// system, applied here for Magic Camera. A client's own MagicBusinessCard
// doc (see that model's layoutCustomized flag) still wins once they've
// customized their own arrangement from their dashboard -- this is only
// ever the STARTING POINT for a client who hasn't touched their own yet.
// True singleton -- exactly one document ever exists in this collection,
// no `key`/`clientId` discriminator needed (unlike ArLayout, which shares
// its collection with per-client docs).
const magicElementPositionSchema = new mongoose.Schema(
  {
    x: { type: Number, default: 50 },
    y: { type: Number, default: 120 },
    z: { type: Number, min: 0, max: 100, default: 0 },
    rotation: { type: Number, min: -180, max: 180, default: 0 },
  },
  { _id: false }
);

const magicLayoutDefaultSchema = new mongoose.Schema(
  {
    // Optional reference image/video admin can upload just so the drag
    // editor has a real backdrop to arrange components against instead of
    // a blank placeholder -- purely visual here, never composited/printed
    // or shown to any client (unlike MagicBusinessCard's own image/video,
    // which IS a specific client's actual card). No crop fields -- it's
    // just displayed with object-fit: cover, nothing depends on an exact
    // pixel region the way a printable card export would.
    //
    // Split Horizontal/Vertical because a plan can have variants of both
    // shapes (see utils/cardVariant.js) -- one shared backdrop would look
    // wrong for whichever shape it wasn't uploaded for. Positions
    // (contact/portfolio/social/huntsworld below) stay a single shared
    // set on purpose -- only the backdrop needs to differ per shape.
    previewImageUrlHorizontal: { type: String, trim: true, default: null },
    previewImageWidthHorizontal: Number,
    previewImageHeightHorizontal: Number,
    previewVideoUrlHorizontal: { type: String, trim: true, default: null },
    previewImageUrlVertical: { type: String, trim: true, default: null },
    previewImageWidthVertical: Number,
    previewImageHeightVertical: Number,
    previewVideoUrlVertical: { type: String, trim: true, default: null },
    contact: { type: magicElementPositionSchema, default: () => ({ x: 20, y: 120 }) },
    portfolio: { type: magicElementPositionSchema, default: () => ({ x: 50, y: 120 }) },
    social: { type: magicElementPositionSchema, default: () => ({ x: 80, y: 120 }) },
    huntsworld: { type: magicElementPositionSchema, default: () => ({ x: 50, y: 145 }) },
    // Positions for admin-defined custom Magic components (see
    // AttributeDefinition.magicComponent) -- same idea as the named
    // fields above, but for a set that can grow without a schema change.
    customElements: { type: Map, of: magicElementPositionSchema, default: {} },
    updatedBy: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MagicLayoutDefault', magicLayoutDefaultSchema);
