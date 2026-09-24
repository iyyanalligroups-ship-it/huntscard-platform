// The admin panel's Card Plans screen has two separate price fields:
// `price` (free-form display text, e.g. "499" or a range like
// "2,499-3,499") and `priceAmount` (a plain number, meant to be the one
// actually charged). In practice, plans get created with only `price`
// filled in -- so checkout falls back to parsing that as the charge
// amount rather than staying stuck on the manual "contact us" flow.
// Only falls back when `price` is unambiguously a single plain number;
// a range or any other text can't be safely auto-charged, so those plans
// correctly stay manual-only.
function getChargeAmount(plan) {
  if (plan.priceAmount) return plan.priceAmount;

  const cleaned = String(plan.price || '').replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;

  const amount = Number(cleaned);
  return amount > 0 ? amount : null;
}

// Same idea as getChargeAmount above, for MagicArt's two price fields
// instead of CardPlan's price/priceAmount pair. discountPriceAmount
// (the actual selling price) wins when set; priceAmount (the real/MRP
// price) is the fallback; null means "not for sale yet."
function getMagicArtChargeAmount(art) {
  if (art.discountPriceAmount > 0) return art.discountPriceAmount;
  if (art.priceAmount > 0) return art.priceAmount;
  return null;
}

// Magic Poster checkout total, from a cart subtotal and the current (or
// snapshotted) global delivery fee + GST%. GST is charged on the item
// subtotal ONLY, not on the delivery fee -- delivery is added after GST is
// computed, not part of the taxable value. Rounded to the nearest rupee,
// matching this model's existing whole-rupee `amount` convention.
function computeMagicPosterTotals(subtotal, deliveryFee, gstPercent) {
  const fee = Number(deliveryFee) || 0;
  const pct = Number(gstPercent) || 0;
  const gstAmount = Math.round(subtotal * (pct / 100));
  return { subtotal, deliveryFee: fee, gstPercent: pct, gstAmount, amount: subtotal + gstAmount + fee };
}

module.exports = { getChargeAmount, getMagicArtChargeAmount, computeMagicPosterTotals };
