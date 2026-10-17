const mongoose = require('mongoose');

// Temporary OTP state for phone verification before a Client document exists.
// MongoDB removes expired records automatically; routes still check expiresAt
// explicitly because TTL cleanup is asynchronous.
const RegistrationOtpSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, index: true, trim: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RegistrationOtp', RegistrationOtpSchema);
