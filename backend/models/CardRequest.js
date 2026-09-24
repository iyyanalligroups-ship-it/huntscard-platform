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
    // Plan key -- always set for 'upgrade'; also set for 'new_card' now
    // (needed to resolve variantBreakdown's variantId back to a real
    // name/shape for admin display, see admin.js's GET /requests).
    requestedPlan: { type: String, trim: true, lowercase: true, default: null },
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
    // Paid card checkouts use the same immutable pricing/address snapshot
    // as MagicPosterOrder. Older/manual requests intentionally leave these
    // fields empty and therefore do not advertise a GST invoice.
    // No null default: a sparse unique index must omit this field entirely
    // on manual/legacy requests, otherwise multiple explicit nulls would
    // collide in MongoDB's unique index.
    orderNumber: { type: String, unique: true, sparse: true, index: true },
    // Retained when the one-off HTyyNNN migration replaces a legacy HC/MO
    // identifier, so support can still reconcile an old receipt if needed.
    legacyOrderNumber: { type: String, default: null },
    invoiceItems: {
      type: [
        {
          name: { type: String, trim: true, required: true },
          unitPrice: { type: Number, required: true },
          quantity: { type: Number, required: true, min: 1 },
        },
      ],
      default: [],
    },
    subtotal: { type: Number, default: null },
    deliveryFee: { type: Number, default: null },
    gstPercent: { type: Number, default: null },
    gstAmount: { type: Number, default: null },
    amount: { type: Number, default: null },
    delivery: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      line1: { type: String, trim: true },
      line2: { type: String, trim: true, default: '' },
      country: { type: String, trim: true },
      state: { type: String, trim: true },
      city: { type: String, trim: true },
      pincode: { type: String, trim: true },
    },
    // Shipment state belongs to this purchase, not to the client account as
    // a whole. This stops a repeat purchase showing an older card's tracking.
    trackingId: { type: String, trim: true, maxlength: 100, default: null },
    dispatchedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    // How many physical cards this covers -- all encoded with the SAME
    // clientId/profile URL (spare copies), not separate accounts. Shown to
    // admin so they know to encode more than one card for this request.
    // Always the TOTAL across variantBreakdown below when that's set.
    quantity: { type: Number, default: 1, min: 1 },
    // How that quantity splits across the plan's own variants when it has
    // any (e.g. 1x "White Night" + 1x "Revenge Red" in one order) --
    // empty for a plan with no variants, or a request from before this
    // existed. variantId is an ObjectId into that plan's own
    // CardPlan.variants subarray (see Client.cardVariantId's own comment
    // for why it's a reference, not a copied name), joined at read time.
    variantBreakdown: {
      type: [
        {
          variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
          quantity: { type: Number, required: true, min: 1 },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CardRequest', CardRequestSchema);
