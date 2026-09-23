const mongoose = require('mongoose');

// Submissions from the public Contact Us page. No email-sending
// infrastructure exists yet (no SMTP configured), so this is honestly
// what "Contact Us" can actually do right now -- save the message,
// admin checks it here. Wire up real email later without changing this.
const ContactMessageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ContactMessage', ContactMessageSchema);
