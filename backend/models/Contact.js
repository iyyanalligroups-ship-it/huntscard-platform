const mongoose = require('mongoose');

// A client's personal phone-contacts backup -- imported from their phone via
// the browser Contact Picker API, an Excel/CSV upload, or added by hand (see
// routes/contacts.js) and restorable as a vCard/Excel export onto a new
// phone. Owned by clientId, never exposed across accounts.
const ContactSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, index: true },
    // Canonical full name -- kept in sync with firstName/lastName below via
    // the pre-save hook. Every existing reader (list display, sort, vCard
    // FN) uses this field unchanged; firstName/lastName exist purely to
    // back the Add/Edit form's split inputs.
    name: { type: String, required: true, trim: true },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    org: { type: String, trim: true }, // labeled "Company" in the UI -- field kept as `org` to avoid orphaning already-imported data
    address: { type: String, trim: true },
    notes: { type: String, trim: true },
    photoUrl: { type: String },
    // 'tap' -- the visitor left their own info via the public profile
    // page's "Exchange Contact" flow (see routes/public.js's POST
    // /leads/:clientId), a real lead, not something the owner typed in
    // themselves. Distinguishes those from every other row here, which
    // are all 'manual' (Contact Picker import, Excel upload, or the
    // Add/Edit form).
    source: { type: String, enum: ['manual', 'tap'], default: 'manual' },
  },
  { timestamps: true }
);

// One phone number per owner -- backs the "skip duplicates on import" /
// "reject duplicate on manual add" rules at the DB level too, not just in
// route logic.
ContactSchema.index({ clientId: 1, phone: 1 }, { unique: true });

// Whenever firstName/lastName are touched, recompute the canonical `name`
// from them (falling back to phone, same as the import route already does)
// -- so every other part of the app can keep reading `name` without caring
// whether a contact came from a picker/Excel import (name set directly) or
// the Add/Edit form (firstName/lastName set, name derived here).
ContactSchema.pre('save', function (next) {
  if (this.isModified('firstName') || this.isModified('lastName')) {
    const derived = [this.firstName, this.lastName].filter(Boolean).join(' ').trim();
    this.name = derived || this.phone; // same "fall back to phone" rule the import route uses
  }
  next();
});

module.exports = mongoose.model('Contact', ContactSchema);
