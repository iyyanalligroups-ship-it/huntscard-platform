const mongoose = require('mongoose');

// Submissions from the public Contact Us page. No email-sending
// infrastructure exists yet (no SMTP configured), so this is honestly
// what "Contact Us" can actually do right now -- save the message,
// admin checks it here. Wire up real email later without changing this.
//
// Handling: `status` tracks where the message is (new -> in progress -> resolved), `attendedBy` is the admin
// who took it, and `notes` is the running log of what was done and by whom.
const NoteSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    byName: { type: String, trim: true, default: '' },
    byEmail: { type: String, trim: true, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const ContactMessageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, default: '', trim: true },
    message: { type: String, required: true, trim: true },
    read: { type: Boolean, default: false },
    status: { type: String, enum: ['new', 'in_progress', 'resolved'], default: 'new', index: true },
    attendedBy: {
      name: { type: String, trim: true, default: '' },
      email: { type: String, trim: true, default: '' },
      at: { type: Date, default: null },
    },
    notes: { type: [NoteSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ContactMessage', ContactMessageSchema);
