// Magic Poster delivery pricing, modeled directly on the DTDC courier rate
// card (huntscard-platform/quotation.doc) -- genuinely WEIGHT-tiered per
// destination "lane" (DTDC's own zoning, not a straight state list, and
// nothing to do with distance/km), not a single flat number per state.
// See that doc's "Lite (Non-Documents) (Air)" table for the 3 tiers below
// 3kg, and its "D Air" table for the per-kg rate beyond that.

// Every poster's weight defaults to this (grams) if a Magic Art piece
// hasn't had its own weightGrams set yet (see models/MagicArt.js) -- keeps
// delivery pricing sane instead of treating an unset piece as 0g.
const DEFAULT_POSTER_WEIGHT_GRAMS = 200;

const LANES = ['regional', 'zonal', 'metro', 'roi', 'splDest', 'ne'];

const LANE_LABELS = {
  regional: 'Regional',
  zonal: 'Zonal',
  metro: 'Metro',
  roi: 'ROI (Rest of India)',
  splDest: 'Special Destination',
  ne: 'North East',
};

// State/UT names exactly as `country-state-city` returns them for India
// (State.getStatesOfCountry('IN')) -- same list the checkout's State
// dropdown is built from, so a lookup here always matches what a real
// delivery address carries. Per the doc's own "Definition of the lane"
// table; states it doesn't name explicitly fall back to "roi" (its own
// fallback lane) via laneForState below.
const STATE_LANE = {
  'Tamil Nadu': 'regional',
  Puducherry: 'regional',
  'Andhra Pradesh': 'zonal',
  Karnataka: 'zonal',
  Kerala: 'zonal',
  Telangana: 'zonal', // South zone, same as the doc's Andhra/Karnataka/Kerala -- carved out of Andhra Pradesh after this rate card's lane definitions were written
  Goa: 'zonal',
  Maharashtra: 'metro', // Mumbai
  Delhi: 'metro',
  'West Bengal': 'metro', // Kolkata
  'Jammu and Kashmir': 'splDest',
  Ladakh: 'splDest', // carved out of Jammu & Kashmir after this rate card's lane definitions were written
  'Himachal Pradesh': 'splDest',
  Assam: 'splDest', // Gauhati (Guwahati)
  'Arunachal Pradesh': 'ne',
  Manipur: 'ne',
  Meghalaya: 'ne',
  Mizoram: 'ne',
  Nagaland: 'ne',
  Sikkim: 'ne',
  Tripura: 'ne',
  // Every other Indian state/UT (Andaman & Nicobar Islands, Bihar,
  // Chandigarh, Chhattisgarh, Dadra & Nagar Haveli and Daman & Diu,
  // Gujarat, Haryana, Jharkhand, Lakshadweep, Madhya Pradesh, Odisha,
  // Punjab, Rajasthan, Uttar Pradesh, Uttarakhand) falls back to "roi".
};

function laneForState(stateName) {
  return STATE_LANE[stateName] || 'roi';
}

// Default per-lane rates -- the doc's "Lite (Non-Documents) (Air)" table
// for under250/under500/under3000 (all in whole rupees, flat per shipment,
// NOT per kg), and its "D Air" table's Per Kg Rate for perKgAbove3kg.
// These are only the INITIAL seed values a lane's DeliveryLaneRate row
// gets the first time it's created (see routes/admin.js's GET
// /delivery-rates) -- admin can edit any of them afterward.
//
// The doc's D Air table only lists Metro/ROI/Spl Dest/NE -- Regional and
// Zonal have no documented per-kg rate for orders over 3kg (its D Surface
// table covers them instead, but that's a slower, separate service tier
// the checkout doesn't offer a choice of). Explicit decision: fall back to
// Metro's per-kg D Air rate for Regional/Zonal above 3kg rather than
// leaving it undefined -- keeps the same Air delivery mode as every
// lighter tier already uses, at the cost of possibly overcharging a
// genuinely bulk Regional/Zonal order slightly. Admin can override this
// per-lane value directly if that turns out to matter in practice.
const DEFAULT_LANE_RATES = {
  regional: { under250: 50, under500: 60, under3000: 65, perKgAbove3kg: 180 },
  zonal: { under250: 60, under500: 70, under3000: 80, perKgAbove3kg: 180 },
  metro: { under250: 90, under500: 110, under3000: 200, perKgAbove3kg: 180 },
  roi: { under250: 100, under500: 120, under3000: 240, perKgAbove3kg: 200 },
  splDest: { under250: 125, under500: 145, under3000: 250, perKgAbove3kg: 230 },
  ne: { under250: 135, under500: 160, under3000: 260, perKgAbove3kg: 240 },
};

// D Air's own minimum chargeable weight (MCW) -- even a parcel just over
// 3kg is billed as if it were this heavy once it crosses into the per-kg
// tier below.
const D_AIR_MIN_CHARGEABLE_KG = 5;

// Pure function -- `rates` is one lane's {under250, under500, under3000,
// perKgAbove3kg} (either a live DeliveryLaneRate DB row or a
// DEFAULT_LANE_RATES fallback), `totalWeightGrams` is the WHOLE cart's
// combined poster weight (sum of each item's weightGrams * quantity).
function computeDeliveryAmount(rates, totalWeightGrams) {
  const grams = Math.max(1, Number(totalWeightGrams) || DEFAULT_POSTER_WEIGHT_GRAMS);
  if (grams <= 250) return rates.under250;
  if (grams <= 500) return rates.under500;
  if (grams <= 3000) return rates.under3000;
  // Beyond 3kg -- per-kg rate, billing weight rounded UP to the next whole
  // kg (doc: "Billing weight in decimal will be round to next weight
  // slab"), floored at D Air's 5kg minimum chargeable weight.
  const billedKg = Math.max(D_AIR_MIN_CHARGEABLE_KG, Math.ceil(grams / 1000));
  return rates.perKgAbove3kg * billedKg;
}

module.exports = {
  DEFAULT_POSTER_WEIGHT_GRAMS,
  LANES,
  LANE_LABELS,
  STATE_LANE,
  laneForState,
  DEFAULT_LANE_RATES,
  computeDeliveryAmount,
};
