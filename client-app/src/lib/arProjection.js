// Shared position/scale math for everything that needs to agree on "where
// does this saved (x%, y%) actually end up relative to the QR" -- the real
// live AR camera view (ArView.jsx), and any static preview of it (see
// ArScanPreview.jsx, used by the AR Layout editors). Previously each
// consumer kept its own copy in sync by convention ("must match X in
// file Y" comments) -- centralizing it here means they provably can't
// drift apart instead.

export const QR_FRACTION = 0.15; // how much of the card's width the QR box takes up
// ISO/IEC 7810 ID-1 -- the real physical card's shape (85.6mm x 54mm,
// same as a credit card / the actual NFC tap card) held LANDSCAPE. A
// "vertical" card variant (see CardPlanVariantSchema.shape) is the exact
// same physical card, just the printed design rotated 90 degrees -- same
// dimensions with width/height swapped, not a different-shaped card.
export const CARD_ASPECT = 85.6 / 54;
// The aspect ratio to actually use for a given client, based on which
// variant they purchased -- everything below that depends on the card's
// shape (CARD_H_UNITS, the video/model planes, position math) needs to
// call this instead of assuming CARD_ASPECT directly, or it'll render
// every card as landscape regardless of what was actually bought. `shape`
// is the client/profile's own `cardShape` field ('horizontal' | 'vertical'
// | undefined -- undefined treated as horizontal, matching the backend's
// own fallback for pre-variant accounts).
export function cardAspectFor(shape) {
  return shape === 'vertical' ? 1 / CARD_ASPECT : CARD_ASPECT;
}
export const MODEL_SIZE = 1; // treat the QR's own side length as 1 unit -- everything else is relative to it
export const CARD_W_UNITS = 1 / QR_FRACTION;
// The card's height, in the same units as CARD_W_UNITS -- depends on
// orientation (see cardAspectFor), so this takes an aspect ratio rather
// than being a fixed constant the way CARD_W_UNITS can be (the card's
// WIDTH-as-a-multiple-of-the-QR is the same either way; only its height
// relative to that width flips).
export function cardHUnitsFor(aspect) {
  return CARD_W_UNITS / aspect;
}
// Base sizes, as a FRACTION OF THE CARD'S OWN WIDTH (frame-agnostic --
// true regardless of which coordinate frame a given renderer measures
// positions in). Exported so every renderer's base size agrees even when
// it can't share the position math above -- ArViewMindAR.jsx tracks the
// whole card, not the QR corner, so it can't reuse toLocalOffset (see
// that file's own comment for why), but "the banner is 15% of the card's
// width" is true either way. These went out of sync once already (that
// file had its own hardcoded 0.25 for the banner instead of QR_FRACTION's
// 0.15, making it render visibly larger live than in this file's own
// preview) -- centralizing them here is what makes that provably
// impossible instead of just documented.
export const VIDEO_BASE_FRACTION = QR_FRACTION; // AR Video/Photo banner's base width -- same fraction as the QR itself
export const MODEL_IMAGE_BASE_FRACTION = 0.25; // 3D model's flat-image case (and GLB autofit target) -- arbitrary, chosen to look reasonable next to the QR/banner
// Base size (before the panel's own saved videoScaleX/videoScaleY) for the
// AR Video/Photo 3D card -- shaped like the real card, same base fraction
// of the card's width as the QR itself. Width doesn't depend on
// orientation (same reasoning as CARD_W_UNITS above); height does, same
// as cardHUnitsFor.
export const VIDEO_PLANE_BASE_W = CARD_W_UNITS * VIDEO_BASE_FRACTION;
export function videoPlaneBaseHFor(aspect) {
  return VIDEO_PLANE_BASE_W / aspect;
}
// Base size for the 3D model's own flat-image case (see ArView.jsx) --
// arbitrary target fraction of the card's width, same for the GLB
// autofit case.
export const MODEL_IMAGE_BASE_W = CARD_W_UNITS * MODEL_IMAGE_BASE_FRACTION;

export const ASSUMED_FOV_DEG = 55; // typical phone MAIN (non-ultrawide) rear-camera vertical FOV -- not a real calibration, tune against a real device if the gap is still off
// Assumed real-world viewing distance (in QR-side-length units) used by
// anything that needs to simulate a camera without a live tracked pose
// (the tilt-preview slider and ArScanPreview's static render) -- ArView.jsx
// tracks the actual live distance instead, this is only for the editor's
// own mockup. Calibrated against a real measured live scan (a phone held
// at a natural, comfortable scanning distance measured pose.translation[2]
// at 6.4 QR-units) -- previously 18, nearly 3x too far, which made the
// editor's preview render everything (the 3D model especially, since it's
// a real mesh with size dependent on perspective, unlike the flat
// fixed-CSS-size element pills) noticeably SMALLER than a real scan would
// show, so a model sized to "look right" in the editor came out
// oversized on an actual phone.
export const ASSUMED_PREVIEW_DISTANCE = 6.4;

// Elements aren't confined to the printed card -- in AR they can float in
// the space around it too, so drag ranges extend well past the card's own
// 0-100 edges. Must match POSITION_MIN/MAX in the backend's ArLayout model
// (validation would otherwise reject an off-card save). Shared here so the
// flat 2D editor and the 3D-preview drag (ArScanPreview.jsx) can't drift
// apart on what counts as a valid position.
export const POSITION_MIN = -60;
export const POSITION_MAX = 160;
export function clampPercent(v) {
  return Math.max(POSITION_MIN, Math.min(POSITION_MAX, v));
}

// How far an element can float off the card's own surface (toward the
// viewer) -- 0 is flat on the card, 100 is roughly one card-height's
// worth of lift. Must match HEIGHT_MIN/MAX in the backend's ArLayout
// model. Only the 3D model and AR Video/Photo panel expose a control for
// this today (see ArLayout.jsx's Raise/Lower buttons).
export const HEIGHT_MIN = 0;
export const HEIGHT_MAX = 100;
export function clampHeight(v) {
  return Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, v));
}
// Converts a saved height (0-100) into the same local units as
// toLocalOffset's (lx, ly) -- cardHUnitsFor(aspect) is an arbitrary but
// already-shared reference scale, so every consumer's "how tall is 100"
// agrees. `aspect` defaults to the landscape CARD_ASPECT so any caller
// that genuinely has no client to ask (there wasn't one before card
// shape was purchasable) keeps the historical behavior unchanged.
export function heightToLocalZ(z, aspect = CARD_ASPECT) {
  return ((z ?? 0) / 100) * cardHUnitsFor(aspect);
}
// The inverse: given a local z (e.g. from a live pose or a 3D scene),
// recovers the saved height it was derived from.
export function localZToHeight(lz, aspect = CARD_ASPECT) {
  return clampHeight((lz / cardHUnitsFor(aspect)) * 100);
}

// Converts a saved (x%, y%) into a local offset (in the same QR-plane
// units as MODEL_SIZE) relative to the QR's OWN saved position -- not a
// fixed 50/50 center. The QR's own detected (or, for a static preview,
// assumed) corners already define local (0,0), so this just expresses
// "how far is this element from wherever the QR itself is." `aspect`
// (see cardAspectFor) defaults to landscape for the same reason as above.
export function toLocalOffset(pos, qrPos, aspect = CARD_ASPECT) {
  return [((pos.x - qrPos.x) / 100) * CARD_W_UNITS, -((pos.y - qrPos.y) / 100) * cardHUnitsFor(aspect)];
}

// The exact inverse of toLocalOffset -- given a local (lx, ly) point (e.g.
// from raycasting a 3D scene against the card's own plane, see
// ArScanPreview.jsx), recovers the (x%, y%) it was derived from.
export function fromLocalOffset(lx, ly, qrPos, aspect = CARD_ASPECT) {
  return {
    x: qrPos.x + (lx / CARD_W_UNITS) * 100,
    y: qrPos.y - (ly / cardHUnitsFor(aspect)) * 100,
  };
}

// Projects a point on the marker plane (in the same MODEL_SIZE units,
// z=0) through a pose (rotation matrix + translation, same shape POSIT
// returns) into real screen pixel coordinates, plus a relative scale
// factor (1.0 at the QR's own depth, <1 further away, >1 closer) so panel
// size responds to real perspective/foreshortening.
export function projectLocalPoint(pose, focalPx, centerX, centerY, [lx, ly, lz]) {
  const move = [0, 1, 2].map(
    (j) => pose.translation[j] + pose.rotation[j][0] * lx + pose.rotation[j][1] * ly + pose.rotation[j][2] * lz
  );
  if (move[2] <= 0) return null; // behind the camera -- shouldn't normally happen for a visible marker
  const screenX = (focalPx * move[0]) / move[2];
  const screenY = (focalPx * move[1]) / move[2];
  return {
    x: centerX + screenX,
    y: centerY - screenY, // model space is Y-up; screen space is Y-down
    scale: pose.translation[2] / move[2],
  };
}

// Focal length (in pixels) for a canvas of the given height, assuming
// ASSUMED_FOV_DEG -- shared so every consumer's "camera" agrees.
export function focalPxFor(canvasHeightPx) {
  const fovRad = (ASSUMED_FOV_DEG * Math.PI) / 180;
  return canvasHeightPx / (2 * Math.tan(fovRad / 2));
}

