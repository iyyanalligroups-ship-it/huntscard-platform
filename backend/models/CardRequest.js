const mongoose = require('mongoose');

// Client-initiated requests -- deliberately NOT an automatic purchase.
// There's no payment gateway wired up yet, so this is the honest version:
// a request lands here, admin reviews it and actions it manually (same
// pattern as the existing "Mark paid" flow). Wire up Razorpay later and
// this becomes the audit trail behind an automated version, rather than
// needing to be replaced.
const CardRequestSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, index: true }, // references Client.clientId
    type: { type: String, enum: ['upgrade', 'new_card'], required: true },
    requestedPlan: { type: String, trim: true, lowercase: true, default: null }, // plan key, only for 'upgrade'
    note: { type: String, trim: true, default: '' }, // free text, mainly for 'new_card'
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'fulfilled'],
      default: 'pending',
    },
    // Payment tracking -- only populated for requests that went through the
    // Razorpay checkout flow (upgrade requests on a plan with priceAmount
    // set). Requests created via the old manual flow have paymentStatus
    // 'unpaid' and no order/payment IDs, which is fine -- that flow is
    // still valid for plans without pricing configured yet.
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'paid'],
      default: 'unpaid',
    },
    razorpayOrderId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
    amountPaid: { type: Number, default: null }, // whole rupees, for the admin's own record
    // How many physical cards this covers -- all encoded with the SAME
    // clientId/profile URL (spare copies), not separate accounts. Shown to
    // admin so they know to encode more than one card for this request.
    quantity: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CardRequest', CardRequestSchema);
