const mongoose = require('mongoose');

// A short demo clip for the public Catalog page's "See it in motion"
// section. NOT tied to a specific card plan (replaced an earlier
// one-per-CardPlan design) -- a clip is often generic marketing footage,
// not actually filmed for one particular tier, and the admin may want
// more or fewer clips than there are plans. The admin pastes an already-
// hosted video URL directly here rather than uploading a file -- no local
// storage/multer involved, this model just stores the link.
const videoShortSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true },
    videoUrl: { type: String, trim: true },
    active: { type: Boolean, default: true },
    updatedBy: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('VideoShort', videoShortSchema);
