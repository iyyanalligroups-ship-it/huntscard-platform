const mongoose = require('mongoose');

// This is the MVP field set we scoped in chat: name, phone, whatsapp, email,
// one social link, portfolio URL, Huntsworld link. Expand toward the full
// 30+ field spec later without changing anything else in the app -- routes
// and auth logic don't care how many fields live on the document.
const ClientSchema = new mongoose.Schema(
  {
    // Used in the public tap/QR URL: huntstag.com/c/{clientId}
    // This is the ONLY thing ever written to the physical NFC chip.
    clientId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Login identity. Deliberately separate from the "public contact email"
    // field below -- we flagged earlier that some clients won't want their
    // login email visible on a card tapped by strangers.
    loginEmail: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },

    // ---- Public profile fields (shown on the tap page) ----
    fullName: { type: String, required: true, trim: true },
    jobTitle: { type: String, trim: true }, // e.g. "Designer @ Huntsworld"
    bio: { type: String, trim: true, maxlength: 280 }, // short "About" text
    // URL to an already-hosted photo (Google Drive/LinkedIn/etc link) --
    // deliberately not a file upload yet, since there's no object storage
    // (S3/R2) wired up. Swap this for a real upload field later without
    // touching anything else -- the tap page just needs a URL either way.
    photoUrl: { type: String, trim: true },
    // Cover/banner image shown behind the profile photo on the tap page.
    // Direct client upload (like photoUrl) -- NOT the old admin-curated
    // "Card Designs" gallery, which was removed and stays removed.
    bannerUrl: { type: String, trim: true },
    // Green-screen video for the HuntsAR World "hologram" effect --
    // chroma-keyed in the app, not pre-processed on upload. Separate
    // from photoUrl/bannerUrl since it's optional and much larger.
    arVideoUrl: { type: String, trim: true },
    // Real 3D model (.glb) rendered in HuntsAR World instead of the flat
    // photo/video panel, when set. Same "just a URL" pattern as the
    // other upload fields.
    arModelUrl: { type: String, trim: true },
    phone: { type: String, trim: true },
    whatsapp: { type: String, trim: true },
    publicEmail: { type: String, trim: true, lowercase: true },
    instagramUrl: { type: String, trim: true },
    twitterUrl: { type: String, trim: true },
    portfolioUrl: { type: String, trim: true },
    huntsworldUrl: { type: String, trim: true },
    // Values for admin-defined custom fields (see AttributeDefinition) --
    // keyed by AttributeDefinition.key. The fixed fields above stay exactly
    // as they are; this is purely for whatever fields an admin adds later
    // without needing a schema change here.
    customAttributes: { type: Map, of: String, default: {} },

    // Set by admin at account-creation time, read-only for the client.
    // References a CardPlan.key (e.g. "basic", "pro", "elite", or any
    // custom plan added later) -- deliberately NOT a hardcoded enum
    // anymore, so new plans never require a code change here.
    cardType: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },

    // True until the client changes their admin-issued temporary
    // password for the first time. The frontend checks this right after
    // login and redirects to a forced change-password screen if true.
    mustChangePassword: { type: Boolean, default: true },

    // ---- Admin-only fields, never editable via the client PUT route ----
    paid: { type: Boolean, default: false },
    blocked: { type: Boolean, default: false }, // blocks login only -- their public tap page keeps working
    chipEncoded: { type: Boolean, default: false },
    chipPasswordHash: { type: String, default: null },
    encodedAt: { type: Date, default: null },
    encodedBy: { type: String, default: null }, // admin email, for audit trail

    // ---- Fulfillment pipeline (new card purchases only -- upgrades
    // never need this, the chip's URL never changes) ----
    // Paid -> claimedBy set -> assignedTo set -> chipEncoded true (the
    // "Created" stage -- literally the same flag the encode tool already
    // sets, not a separate status to keep in sync) -> dispatched true.
    claimedBy: { type: String, default: null }, // admin email who took responsibility
    assignedTo: { type: String, default: null }, // subadmin email doing the physical encoding
    dispatched: { type: Boolean, default: false },
    dispatchedAt: { type: Date, default: null },
    dispatchedBy: { type: String, default: null },
    trackingId: { type: String, default: null, trim: true }, // set by admin when dispatching
    delivered: { type: Boolean, default: false },
    deliveredAt: { type: Date, default: null },

    // Simple counters -- increment these in the public profile / vcard
    // routes later if you want tap/scan analytics.
    tapCount: { type: Number, default: 0 },
  },
  { timestamps: true } // adds createdAt / updatedAt automatically
);

module.exports = mongoose.model('Client', ClientSchema);
