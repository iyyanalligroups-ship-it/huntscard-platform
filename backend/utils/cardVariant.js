const CardPlan = require('../models/CardPlan');

// Resolves a Card (or Client, which has the same cardType/cardVariantId
// shape) into its real plan/variant info -- name, shape, print images,
// and the plan-level flags that gate AR/Magic/design-upload. Generalizes
// the join routes/admin.js's GET /fulfillment used to build inline
// (`${planKey}:${variantId}` -> {name, shape}) before this existed.
//
// Batch-friendly: buildVariantMap does ONE CardPlan query for however
// many cards you're resolving, so a route handling a list of cards (like
// /fulfillment) doesn't hit the DB once per card.
async function buildVariantMap(cards) {
  const planKeys = [...new Set(cards.map((c) => c.cardType).filter(Boolean))];
  const plans = await CardPlan.find({ key: { $in: planKeys } })
    .select('key name variants requiresDesignUpload arEnabled magicEnabled');
  const variantByKey = {};
  const planByKey = {};
  for (const p of plans) {
    planByKey[p.key] = p;
    for (const v of p.variants) {
      variantByKey[`${p.key}:${v._id.toString()}`] = v;
    }
  }
  return { variantByKey, planByKey };
}

// Single-card convenience wrapper -- don't call this in a loop, use
// buildVariantMap once + resolveCardVariant per card instead.
async function resolveCardVariant(card, mapsOrNull) {
  const maps = mapsOrNull || (await buildVariantMap([card]));
  const plan = maps.planByKey[card.cardType] || null;
  let variant = card.cardVariantId ? maps.variantByKey[`${card.cardType}:${String(card.cardVariantId)}`] : null;
  // A card with no cardVariantId chosen yet (e.g. onboarded from the
  // admin's "create client" form, which only picks a PLAN, not a
  // variant) has nothing genuinely ambiguous to resolve when the plan
  // only offers ONE variant -- there's no other option it could mean.
  // Without this, a single-variant plan's already-uploaded design/video
  // never resolved for a client who hadn't separately picked "the only
  // choice" too, showing as if nothing had been uploaded at all. Only
  // kicks in when cardVariantId is genuinely unset -- an explicit but
  // stale/mismatched cardVariantId still resolves to no variant, same as
  // before, rather than silently overriding it.
  if (!variant && !card.cardVariantId && plan?.variants?.length === 1) {
    variant = plan.variants[0];
  }
  return {
    hasVariant: Boolean(variant),
    // Same 'horizontal' fallback routes/public.js's GET /profile/:clientId
    // already uses for a client with no variant chosen (older accounts
    // from before variants existed, or a plan with none configured).
    shape: variant?.shape || 'horizontal',
    variantName: variant?.name || null,
    frontImageUrl: variant?.frontImageUrl || null,
    backImageUrl: variant?.backImageUrl || null,
    requiresDesignUpload: Boolean(plan?.requiresDesignUpload),
    arEnabled: Boolean(plan?.arEnabled),
    magicEnabled: Boolean(plan?.magicEnabled),
    planName: plan?.name || null,
  };
}

module.exports = { buildVariantMap, resolveCardVariant };
