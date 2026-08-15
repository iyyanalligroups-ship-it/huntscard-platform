const mongoose = require('mongoose');

// Position for ONE admin-defined custom Magic component (see
// AttributeDefinition.magicComponent) -- same {x,y,z} shape as the
// built-in contactX/Y/Z etc. fields below, just keyed dynamically since
// the set of custom components can grow without a schema change (same
// "own Map, own system" pattern ArLayout.customElements already uses for
// the main AR Layout's own custom components).
const magicElementPositionSchema = new mongoose.Schema(
  {
    x: { type: Number, default: 50 },
    y: { type: Number, default: 120 },
    z: { type: Number, min: 0, max: 100, default: 0 },
    // In-plane rotation, degrees, -180..180 -- how the button itself is
    // tilted, independent of its x/y/z placement.
    rotation: { type: Number, min: -180, max: 180, default: 0 },
  },
  { _id: false }
);

// One doc per client -- unlike MagicArt's shared gallery, this is a
// personal AR image+video pair admin assigns to an individual client
// (their own "Magic Business Card"). No name/description fields, unlike
// MagicArt -- there's nothing to label, it's already known whose card
// this is. Same crop-metadata shape as MagicArt otherwise, so the admin
// upload UI (ClientDetail.jsx) and playback logic can mirror MagicArt's
// proven pattern exactly.
const magicBusinessCardSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, unique: true, trim: true },
    // A real physical business card is 85x55mm -- 'horizontal' (85mm
    // wide, 55mm tall) or 'vertical' (55mm wide, 85mm tall). Chosen
    // BEFORE the image, since it determines the crop aspect ratio the
    // image gets locked to (see admin's ClientDetail.jsx) -- changing it
    // after an image is already uploaded doesn't retroactively re-crop
    // the existing file, admin just re-uploads to match.
    cardType: { type: String, enum: ['vertical', 'horizontal'] },
    imageUrl: { type: String, trim: true },
    imageWidth: Number,
    imageHeight: Number,
    videoUrl: { type: String, trim: true },
    // Display-only crop, fractional (0-1) within the ORIGINAL video's own
    // pixel size -- same as MagicArt.js, applied at playback via a
    // texture UV transform, the uploaded file itself is never re-encoded.
    videoCropX: Number,
    videoCropY: Number,
    videoCropWidth: Number,
    videoCropHeight: Number,
    // Lets admin upload/crop in draft before it's visible on the client's
    // dashboard -- the client-facing GET only returns data when active.
    active: { type: Boolean, default: false },
    // Where the client dragged the AR QR onto their own card design (see
    // MagicBusinessCard.jsx) -- percentages of the card image (0-100 on
    // each axis), same convention the main AR Layout system already uses
    // for element positions, so this stays visually intuitive if either
    // ever needs to be cross-referenced. Composited into the printable
    // download at this exact spot (see handleDownloadImage) rather than
    // shipping as a separate QR file the client has to place themselves.
    // Defaults to the bottom-right corner, clear of a typically-centered
    // design.
    qrX: { type: Number, min: 0, max: 100, default: 82 },
    qrY: { type: Number, min: 0, max: 100, default: 82 },
    // AR component positions (contact/portfolio/social/huntsworld -- the
    // same 4 built-ins the main AR Layout system has) -- deliberately
    // separate from that system's own positions, not derived/synced from
    // them (only the underlying link VALUES, e.g. a client's phone
    // number or Instagram URL, are shared -- see MagicCamera.jsx, which
    // reads those from the client's public profile). This system has its
    // own shapes (rectangular buttons, not AR Layout's round pills) and
    // its own 3D placement relative to THIS card's tracked image, so it
    // needs its own saved arrangement.
    // x/y are percentages of the card image (0-100 = on the card; can go
    // outside that range to float above/below/beside it, same permissive
    // range as the main AR Layout system). z is height off the card's
    // own surface, toward the viewer, 0-100 (0 = flat on the card).
    // rotation: in-plane tilt, degrees (-180..180), independent of x/y/z --
    // same "own field per built-in" pattern, defaults to 0 (upright).
    contactX: { type: Number, default: 20 },
    contactY: { type: Number, default: 120 },
    contactZ: { type: Number, min: 0, max: 100, default: 0 },
    contactRotation: { type: Number, min: -180, max: 180, default: 0 },
    portfolioX: { type: Number, default: 50 },
    portfolioY: { type: Number, default: 120 },
    portfolioZ: { type: Number, min: 0, max: 100, default: 0 },
    portfolioRotation: { type: Number, min: -180, max: 180, default: 0 },
    socialX: { type: Number, default: 80 },
    socialY: { type: Number, default: 120 },
    socialZ: { type: Number, min: 0, max: 100, default: 0 },
    socialRotation: { type: Number, min: -180, max: 180, default: 0 },
    // Own row below the other three by default, so it doesn't start out
    // crowding/overlapping them.
    huntsworldX: { type: Number, default: 50 },
    huntsworldY: { type: Number, default: 145 },
    huntsworldZ: { type: Number, min: 0, max: 100, default: 0 },
    huntsworldRotation: { type: Number, min: -180, max: 180, default: 0 },
    // Positions for admin-defined custom Magic components (see
    // AttributeDefinition.magicComponent) -- same idea as the named
    // fields above, but for a set that can grow without a schema change.
    magicElements: { type: Map, of: magicElementPositionSchema, default: {} },
    updatedBy: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MagicBusinessCard', magicBusinessCardSchema);
