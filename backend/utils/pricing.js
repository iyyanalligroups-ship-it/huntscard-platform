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

module.exports = { getChargeAmount };
