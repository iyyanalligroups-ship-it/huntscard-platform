// City / area suggestions for a state + district, from the India Post office directory (data.gov.in).
// The directory is large (about 150,000 offices), so it is read once, on first use, and indexed in memory.
// It lists the post offices of each district; their names are the towns and areas people write in an address.
// If a district cannot be matched (a district created after the directory was published, or a spelling that
// differs), the caller falls back to the state's full list of cities.
let index = null; // Map<"stateKey|districtKey", Set<area name>>

const norm = (v) => String(v || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');

// The directory predates a few renames and the split of Telangana from Andhra Pradesh.
const STATE_ALIASES = { pondicherry: 'puducherry', chattisgarh: 'chhattisgarh', uttaranchal: 'uttarakhand', orissa: 'odisha' };
const stateKey = (v) => {
  const k = norm(v);
  return STATE_ALIASES[k] || k;
};

// "Vennala S.O" / "Arjun Guri B.O" / "Adyar S.O (Chennai)" / "Chennai G.P.O." -> "Vennala", "Arjun Guri", ...
function cleanOffice(name) {
  return String(name || '')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .trim()
    .replace(/\s+(?:EDB|G\.?P|B|S|H|P)\.?\s?O\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function build() {
  const rows = require('india-pincode-lookup/pincodes.json');
  const map = new Map();
  for (const r of rows) {
    const area = cleanOffice(r.officeName);
    if (!area) continue;
    const key = `${stateKey(r.stateName)}|${norm(r.districtName)}`;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(area);
  }
  return map;
}

// Areas of a district, sorted. [] when the district is not in the directory.
function localitiesFor(stateName, districtName) {
  if (!index) index = build();
  const d = norm(districtName);
  if (!d) return [];
  const states = [stateKey(stateName)];
  // Telangana's districts are filed under Andhra Pradesh in the older directory.
  if (stateKey(stateName) === 'telangana') states.push('andhrapradesh');
  const found = new Set();
  for (const s of states) for (const a of index.get(`${s}|${d}`) || []) found.add(a);
  return [...found].sort((a, b) => a.localeCompare(b));
}

module.exports = { localitiesFor };
