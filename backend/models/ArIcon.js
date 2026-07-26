const mongoose = require('mongoose');

// One shared, admin-managed set of icons -- when one's uploaded for a
// given attribute (Contact Info, Portfolio, Social Icons, Huntsworld
// Link, or the AR Video/Photo panel's own default state), HuntsAR World
// shows that logo image inside the panel instead of its plain colored
// text label, for every client's card at once (not per-client, same as
// the admin's default AR Layout template).
const arIconSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: 'global' }, // singleton doc, like ArLayout's 'global' template
    video: { type: String, trim: true },
    contact: { type: String, trim: true },
    portfolio: { type: String, trim: true },
    social: { type: String, trim: true },
    huntsworld: { type: String, trim: true },
    // Every upload goes here from now on, including for the five keys
    // above -- those stay only as a fallback for whatever was already
    // uploaded before this existed, so nothing already live gets lost.
    // Lets a new section (see AttributeDefinition) get a logo without a
    // schema change, the same way Client.customAttributes does.
    sectionIcons: { type: Map, of: String, default: {} },
    updatedBy: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ArIcon', arIconSchema);
