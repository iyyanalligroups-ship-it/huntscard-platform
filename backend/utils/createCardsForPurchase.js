const Card = require('../models/Card');

// One trackable physical Card record per unit paid for -- shared by every
// paid-purchase path (self-service Razorpay checkout, and the HuntsWorld
// coupon claim), so a purchase always leaves something for AR Layout /
// Magic Business Card / admin's Card Fulfillment queue to actually show,
// instead of only updating Client.cardType with nothing physical behind
// it. Extracted out of routes/profile.js (where it originally lived,
// used only by /upgrade-confirm) so routes/coupon.js's free-claim path
// can create the exact same kind of record instead of silently skipping
// this step.
async function createCardsForPurchase({ clientId, cardType, quantity, variantBreakdown, purchaseRequestId, orderNumber }) {
  const lastCard = await Card.findOne({ clientId }).sort({ cardNumber: -1 }).select('cardNumber');
  let nextNumber = (lastCard?.cardNumber || 0) + 1;
  const units = variantBreakdown && variantBreakdown.length > 0
    ? variantBreakdown.flatMap((entry) => Array(entry.quantity).fill(entry.variantId))
    : Array(quantity).fill(null);
  const cardDocs = units.map((variantId) => ({
    clientId,
    cardNumber: nextNumber++,
    cardType,
    cardVariantId: variantId,
    purchaseRequestId: purchaseRequestId || null,
    orderNumber: orderNumber || null,
  }));
  if (cardDocs.length === 0) return [];
  return Card.insertMany(cardDocs);
}

module.exports = createCardsForPurchase;
