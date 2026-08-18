const mongoose = require('mongoose');

// Admin-managed question/answer pairs for the public FAQ page (see
// client-app's Faq.jsx) -- previously a hardcoded array in that file,
// now editable without a code change/redeploy. `order` drives display
// order (lower first); `active` hides an entry from the public page
// without deleting it.
const FaqEntrySchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true, trim: true },
    order: { type: Number, required: true, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

FaqEntrySchema.index({ order: 1 });

module.exports = mongoose.model('FaqEntry', FaqEntrySchema);
