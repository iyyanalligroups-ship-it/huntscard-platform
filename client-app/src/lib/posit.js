// js-aruco2's posit1.js is a pre-ESM "attaches to a global" script -- it
// declares `var POS = POS || {}` and hangs methods off it, but never does
// `export`/`module.exports`. Under Vite's ESM module scope that `POS`
// binding stays private to the module, so `import posit1 from
// 'js-aruco2/src/posit1.js'` resolves to an empty object and destructuring
// `POS` off it silently gives `undefined` -- which then crashes as soon as
// `new POS.Posit(...)` runs, surfacing as a bogus "camera access" error in
// ArView (see the resizeCanvas try/catch that call sits inside).
//
// Running the raw source through `Function()` executes it as a classic,
// non-strict script body, which is the execution model the library expects,
// and lets us capture the resulting `POS` object directly. posit1.js also
// has its own internal dependency on svd.js via `this.SVD || require(...)`
// -- the `require` fallback doesn't exist in a browser, so svd.js gets the
// same Function() treatment and gets handed in as `this.SVD` explicitly
// (via .call), which is what makes the `this.SVD ||` half of that check
// succeed instead of ever reaching the `require` branch.
import svdSource from 'js-aruco2/src/svd.js?raw';
import positSource from 'js-aruco2/src/posit1.js?raw';

const SVD = new Function(`${svdSource}\nreturn SVD;`)();
const buildPos = new Function(`${positSource}\nreturn POS;`);
export const POS = buildPos.call({ SVD });
