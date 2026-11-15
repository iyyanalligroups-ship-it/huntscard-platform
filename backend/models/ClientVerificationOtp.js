const mongoose = require('mongoose');

// One-time codes for verifying a phone number or email BEFORE an admin creates a client account for someone
// (Clients page -> Create account). The client receives the code and reads it out to the admin. Expired
// records are removed by MongoDB; the routes still check expiresAt explicitly.
const ClientVerificationOtpSchema = new mongoose.Schema(
  {
    channel: { type: String, enum: ['phone', 'email'], required: true },
    target: { type: String, required: true, trim: true, lowercase: true }, // 10-digit phone, or the email
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, required: true },
  },
  { timestamps: true }
);
ClientVerificationOtpSchema.index({ channel: 1, target: 1 }, { unique: true });

module.exports = mongoose.model('ClientVerificationOtp', ClientVerificationOtpSchema);
