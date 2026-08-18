const MagicLayoutDefault = require('../models/MagicLayoutDefault');

const BUILTIN_KEYS = ['contact', 'portfolio', 'social', 'huntsworld'];

// Fetch-or-create the one global admin-set default (see
// models/MagicLayoutDefault.js's own header comment for why this needs
// no key/clientId filter -- it's a true singleton).
async function getGlobalMagicLayoutDefault() {
  let doc = await MagicLayoutDefault.findOne({});
  if (!doc) doc = await MagicLayoutDefault.create({});
  return doc;
}

// Builds the componentPositions/magicElements a client's Magic Business
// Card should actually render with -- their OWN saved arrangement once
// they've customized it (cardDoc.layoutCustomized), otherwise admin's
// shared default instead of this schema's own hardcoded fallback numbers.
// Used by both routes/profile.js (the client's own editor/GET) and
// routes/public.js (the live AR view), so the two can never disagree
// about which source currently applies.
function mergeMagicLayout(cardDoc, globalDefault) {
  const componentPositions = {};
  for (const key of BUILTIN_KEYS) {
    if (cardDoc.layoutCustomized) {
      componentPositions[key] = {
        x: cardDoc[`${key}X`],
        y: cardDoc[`${key}Y`],
        z: cardDoc[`${key}Z`],
        rotation: cardDoc[`${key}Rotation`],
      };
    } else {
      const d = globalDefault[key] || {};
      componentPositions[key] = { x: d.x ?? 50, y: d.y ?? 120, z: d.z ?? 0, rotation: d.rotation ?? 0 };
    }
  }
  const magicElements = cardDoc.layoutCustomized
    ? Object.fromEntries(cardDoc.magicElements || [])
    : Object.fromEntries(globalDefault.customElements || []);
  return { componentPositions, magicElements };
}

module.exports = { getGlobalMagicLayoutDefault, mergeMagicLayout };
