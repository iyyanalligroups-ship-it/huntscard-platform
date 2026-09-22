const mongoose = require('mongoose');

// One line item in a Magic Poster cart order -- name/unitPrice are a
// SNAPSHOT of the MagicArt piece at purchase time (same reasoning as
// CardRequest.variantBreakdown storing a reference but resolving the
// display name at read time would be wrong here: a later admin price/name
// edit must not rewrite what this client actually paid for).
const magicPosterOrderItemSchema = new mongoose.Schema(
  {
    magicArtId: { type: mongoose.Schema.Types.ObjectId, ref: 'MagicArt', required: true },
    name: { type: String, trim: true },
    unitPrice: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

// A cart checkout for one or more Magic Poster pieces, unlike CardRequest
// this is created UP FRONT at checkout-start (paymentStatus 'unpaid'),
// not only after payment confirms -- a cart's items + delivery address
// don't fit safely in Razorpay's own small `notes` fields the way
// upgrade-order's single plan/quantity does, so there's nowhere else to
// stash them across the create-order -> confirm gap. An abandoned/unpaid
// doc is harmless: admin's order list only ever shows paymentStatus
// 'paid' rows.
const MagicPosterOrderSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, index: true },
    items: { type: [magicPosterOrderItemSchema], default: [] },
    amount: { type: Number, required: true }, // expected total, whole rupees, set at order-creation
    amountPaid: { type: Number, default: null }, // set once confirmed
    paymentStatus: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' },
    // Delivery tracking -- Pending -> Delivery -> Completed, forward-only
    // (see admin.js's PATCH /magic-poster-orders/:id).
    status: { type: String, enum: ['pending', 'delivery', 'completed'], default: 'pending' },
    razorpayOrderId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
    // Snapshot of the ClientAddress the buyer picked (or newly added) at
    // checkout -- same field shape as ClientAddress.js, copied rather
    // than referenced so a later edit/delete of the saved address never
    // rewrites what this order actually shipped to.
    delivery: {
      name: { type: String, trim: true, required: true },
      phone: { type: String, trim: true, required: true },
      line1: { type: String, trim: true, required: true },
      line2: { type: String, trim: true, default: '' },
      country: { type: String, trim: true, required: true },
      state: { type: String, trim: true, required: true },
      city: { type: String, trim: true, required: true },
      pincode: { type: String, trim: true, required: true },
    },
    trackingId: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MagicPosterOrder', MagicPosterOrderSchema);
