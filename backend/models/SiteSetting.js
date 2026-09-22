const mongoose = require('mongoose');

// Single-document collection (one row, key: 'global') for site-wide
// toggles that don't belong to any one client -- currently just which
// homepage design client-app's App.jsx renders. Modeled as a singleton
// rather than a plain key-value table since there's only this one
// setting so far; if more show up later, this is where they'd go.
const siteSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    // 'default' = Home.jsx (original hero), 'orange' = HomeD1.jsx (the
    // orange-theme redesign) -- see client-app's App.jsx for the switch.
    // 'cyber' doesn't swap the homepage component (see HomeSwitch.jsx --
    // it renders Home.jsx same as 'default'); it only applies the
    // .theme-cyber dashboard palette, same scope theme-orange had at
    // first before HomeD1.jsx existed.
    homeTheme: { type: String, enum: ['default', 'orange', 'cyber'], default: 'default' },
    // Magic Poster checkout -- flat rupee delivery charge + GST percentage,
    // both admin-editable any time (see admin-huntscard's Magic Poster
    // Settings page). GST is applied to (subtotal + deliveryFee). Each
    // MagicPosterOrder snapshots these at creation time -- changing these
    // here never rewrites a past order's charged amount.
    deliveryFee: { type: Number, default: 0 },
    gstPercent: { type: Number, default: 0 },
    updatedBy: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SiteSetting', siteSettingSchema);
