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
    // "Expertise & Highlights" tags shown as #hashtags under bio on the
    // public tap page (see PublicProfile.jsx). Empty means the tap page
    // falls back to its own auto-picked defaults, so older profiles that
    // predate this field don't suddenly show nothing.
    highlights: { type: [String], default: [] },

    // ---- Admin-only fields (collected at registration, editable from
    // Profile Settings) -- deliberately NEVER selected/returned by the
    // public profile route or rendered on the tap page. Internal record
    // for admin, not shown to strangers who tap the card. ----
    gender: { type: String, trim: true, enum: ['male', 'female', 'other', null], default: null },
    dateOfBirth: { type: Date, default: null },
    // URL to an already-hosted photo (Google Drive/LinkedIn/etc link) --
    // deliberately not a file upload yet, since there's no object storage
    // (S3/R2) wired up. Swap this for a real upload field later without
    // touching anything else -- the tap page just needs a URL either way.
    photoUrl: { type: String, trim: true },
    // Cover/banner image shown behind the profile photo on the tap page.
    // Direct client upload (like photoUrl) -- NOT the old admin-curated
    // "Card Designs" gallery, which was removed and stays removed.
    bannerUrl: { type: String, trim: true },
    // Client's own logo (e.g. their company logo), uploaded from Profile
    // Settings -- for print production, not the AR Logo icon system
    // (ArIcon model, admin-managed per-section icons). Admin downloads
    // this from the Clients page to send to the physical card printer,
    // same "upload now, admin fetches it later" shape as the Custom
    // plan's design-upload fields on this same model.
    logoUrl: { type: String, trim: true, default: null },
    // Green-screen video for the HuntsAR World "hologram" effect --
    // chroma-keyed in the app, not pre-processed on upload. Separate
    // from photoUrl/bannerUrl since it's optional and much larger.
    // Legacy field, read-only going forward -- superseded by
    // arBannerUrl/arBannerType below (one upload slot, video OR image).
    // Kept so clients who already uploaded a video keep working with no
    // migration; every read path falls back to this when arBannerUrl is
    // unset.
    arVideoUrl: { type: String, trim: true },
    // "HuntsAR World Banner" -- one upload slot for the AR video/photo
    // panel, holding EITHER a video or a still image (arBannerType says
    // which, set from the uploaded file's mimetype at upload time).
    arBannerUrl: { type: String, trim: true },
    arBannerType: { type: String, enum: ['video', 'image'], default: null },
    // "3D Model" slot -- a real 3D model (.glb OR .fbx, rendered as an
    // actual 3D object) OR a flat cutout image (rendered as a real 3D
    // plane, the same technique arBannerUrl/arBannerType already use for
    // the banner's own image case). arModelType says which -- 'glb' loads
    // via GLTFLoader, 'fbx' via FBXLoader, 'image' via TextureLoader onto
    // a PlaneGeometry. Null/undefined arModelType on an existing
    // arModelUrl means 'glb' (every model uploaded before .fbx support
    // existed was a real .glb).
    arModelUrl: { type: String, trim: true },
    arModelType: { type: String, enum: ['glb', 'fbx', 'image'], default: null },
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
    // Also where an AR-flagged attribute's own value lives (see
    // AttributeDefinition.arComponent) -- e.g. a client's own Google Maps
    // link for a "Map" AR component, same map, same key, no separate field.
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
    // Which of cardType's plan's variants (shape/finish) this card is --
    // an ObjectId into that CardPlan's own `variants` subarray, not a
    // copied name/shape, so an admin correcting a variant's name later
    // still shows correctly here (same "join at read time" principle as
    // cardType above). Null if the plan had no variants configured at
    // purchase time, or for pre-migration clients.
    cardVariantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Customer-uploaded front/back artwork for the Custom plan only --
    // printed on the physical card as-is. Null for every other plan.
    customDesignFrontUrl: { type: String, trim: true, default: null },
    customDesignBackUrl: { type: String, trim: true, default: null },

    // True until the client changes their admin-issued temporary
    // password for the first time. The frontend checks this right after
    // login and redirects to a forced change-password screen if true.
    mustChangePassword: { type: Boolean, default: true },

    // ---- Forgot-password, via emailed 6-digit OTP (see routes/auth.js
    // POST /forgot-password, /forgot-password/verify-otp, and
    // /reset-password). The OTP itself is short/guessable, so it's hashed
    // with bcrypt (like loginOtpHash below) and attempt-capped. Once
    // correctly entered, /verify-otp mints a resetToken (a high-entropy
    // value never typed by hand, so SHA-256 is enough -- same "never store
    // the raw secret" principle as passwordHash) that the final "set new
    // password" step submits instead of the OTP itself, so the OTP fields
    // can be cleared immediately on verification without losing the
    // client's place in the flow.
    resetOtpHash: { type: String, default: null },
    resetOtpExpiresAt: { type: Date, default: null },
    resetOtpAttempts: { type: Number, default: 0 },
    resetOtpLastSentAt: { type: Date, default: null },
    resetTokenHash: { type: String, default: null },
    resetTokenExpiresAt: { type: Date, default: null },

    // ---- Phone-only OTP login (see routes/auth.js POST /login-otp/*) --
    // a passwordless alternate sign-in method, separate from the reset
    // fields above so a login-OTP request and a password reset in flight
    // at the same time can't clobber each other. Hashed with bcrypt like
    // passwordHash (short, guessable 6-digit code). loginOtpAttempts caps
    // wrong guesses before a fresh code is required.
    loginOtpHash: { type: String, default: null },
    loginOtpExpiresAt: { type: Date, default: null },
    loginOtpAttempts: { type: Number, default: 0 },
    // When the last OTP was actually sent -- lets POST /login-otp/request
    // silently no-op a resend that arrives before the cooldown elapses
    // (button double-tap, multiple tabs, a direct API hit) without
    // regenerating/re-sending, instead of relying on the client's own
    // countdown timer alone.
    loginOtpLastSentAt: { type: Date, default: null },

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

    // Client-controlled "pause" -- distinct from `blocked` above (admin-
    // only, blocks login, explicitly leaves the public page working). ON
    // by default; toggled OFF from Settings hides the public
    // profile/vCard/AR experience/lead capture entirely, e.g. the
    // physical card was lost or stolen. Never affects the owner's own
    // authenticated dashboard access -- only the public-facing routes
    // strangers hit.
    cardActive: { type: Boolean, default: true },
  },
  { timestamps: true } // adds createdAt / updatedAt automatically
);

module.exports = mongoose.model('Client', ClientSchema);
