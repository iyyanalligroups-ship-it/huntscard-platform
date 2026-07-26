const mongoose = require('mongoose');

// Admin-defined extra profile fields -- lets an admin add a new field (e.g.
// "Telegram") at any time without a code change. This is the DEFINITION
// only; each client's actual value for a given key lives in their own
// Client.customAttributes map, keyed by this doc's `key`.
const attributeDefinitionSchema = new mongoose.Schema(
  {
    // Auto-slugified from `label` when created -- stable even if the label
    // is edited later, since it's what keys every client's saved value.
    key: { type: String, required: true, unique: true, trim: true },
    label: { type: String, required: true, trim: true },
    // One of the four built-in section keys ('contact', 'portfolio',
    // 'social', 'huntsworld' -- "bio" is deliberately not one of these,
    // that field stays as-is), OR an admin-created custom section's slug.
    // No longer a fixed enum -- see admin.js's POST /attributes for how a
    // custom section's slug gets derived from whatever label the admin
    // typed.
    section: { type: String, required: true, trim: true },
    // Only set on whichever attribute FIRST introduced a custom section --
    // the human-readable name to show as that section's tab label. Unused
    // for the four built-in sections, which both frontends already have
    // hardcoded labels for.
    sectionLabel: { type: String, trim: true },
    // Controls the input type in Profile Settings and how PublicProfile
    // links it: tel: / external link / mailto: / plain text.
    fieldType: {
      type: String,
      enum: ['text', 'phone', 'url', 'email'],
      default: 'text',
    },
    order: { type: Number, default: 0 }, // display order within its section
    // Lets an admin retire a field without deleting clients' saved values
    // for it -- it just stops being shown anywhere.
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AttributeDefinition', attributeDefinitionSchema);
