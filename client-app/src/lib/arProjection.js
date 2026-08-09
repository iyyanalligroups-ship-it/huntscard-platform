// Shared position/scale math for everything that needs to agree on "where
// does this saved (x%, y%) actually end up relative to the QR" -- the real
// live AR camera view (ArView.jsx), and any static preview of it (see
// ArScanPreview.jsx, used by the AR Layout editors). Previously each
// consumer kept its own copy in sync by convention ("must match X in
// file Y" comments) -- centralizing it here means they provably can't
// drift apart instead.

export const QR_FRACTION = 0.15; // how much of the card's width the QR box takes up
// ISO/IEC 7810 ID-1 -- the real physical card's shape (85.6mm x 54mm,
// same as a credit card / the actual NFC tap card).
export const CARD_ASPECT = 86 / 54;
export const MODEL_SIZE = 1; // treat the QR's own side length as 1 unit -- everything else is relative to it
export const CARD_W_UNITS = 1 / QR_FRACTION;
export const CARD_H_UNITS = CARD_W_UNITS / CARD_ASPECT;
// Base size (before the panel's own saved videoScaleX/videoScaleY) for the
// AR Video/Photo 3D card -- shaped like the real card (CARD_ASPECT), same
// base fraction of the card's width as the QR itself.
export const VIDEO_PLANE_BASE_W = CARD_W_UNITS * QR_FRACTION;
export const VIDEO_PLANE_BASE_H = VIDEO_PLANE_BASE_W / CARD_ASPECT;
// Base size for the 3D model's own flat-image case (see ArView.jsx) --
// arbitrary target fraction of the card's width, same for the GLB
// autofit case.
export const MODEL_IMAGE_BASE_W = CARD_W_UNITS * 0.25;

export const ASSUMED_FOV_DEG = 62; // typical phone rear-camera vertical FOV -- not a real calibration
// Assumed real-world viewing distance (in QR-side-length units) used by
// anything that needs to simulate a camera without a live tracked pose
// (the tilt-preview slider and ArScanPreview's static render) -- not a
// real calibration either (ArView.jsx tracks the actual live distance
// instead), just close enough to look plausible for typical close-up
// phone photography of a card-sized object.
export const ASSUMED_PREVIEW_DISTANCE = 18;

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
// toLocalOffset's (lx, ly) -- CARD_H_UNITS is an arbitrary but already-
// shared reference scale, so every consumer's "how tall is 100" agrees.
export function heightToLocalZ(z) {
  return ((z ?? 0) / 100) * CARD_H_UNITS;
}
// The inverse: given a local z (e.g. from a live pose or a 3D scene),
// recovers the saved height it was derived from.
export function localZToHeight(lz) {
  return clampHeight((lz / CARD_H_UNITS) * 100);
}

// Converts a saved (x%, y%) into a local offset (in the same QR-plane
// units as MODEL_SIZE) relative to the QR's OWN saved position -- not a
// fixed 50/50 center. The QR's own detected (or, for a static preview,
// assumed) corners already define local (0,0), so this just expresses
// "how far is this element from wherever the QR itself is."
export function toLocalOffset(pos, qrPos) {
  return [((pos.x - qrPos.x) / 100) * CARD_W_UNITS, -((pos.y - qrPos.y) / 100) * CARD_H_UNITS];
}

// The exact inverse of toLocalOffset -- given a local (lx, ly) point (e.g.
// from raycasting a 3D scene against the card's own plane, see
// ArScanPreview.jsx), recovers the (x%, y%) it was derived from.
export function fromLocalOffset(lx, ly, qrPos) {
  return {
    x: qrPos.x + (lx / CARD_W_UNITS) * 100,
    y: qrPos.y - (ly / CARD_H_UNITS) * 100,
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

