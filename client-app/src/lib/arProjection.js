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

// Converts a saved (x%, y%) into a local offset (in the same QR-plane
// units as MODEL_SIZE) relative to the QR's OWN saved position -- not a
// fixed 50/50 center. The QR's own detected (or, for a static preview,
// assumed) corners already define local (0,0), so this just expresses
// "how far is this element from wherever the QR itself is."
export function toLocalOffset(pos, qrPos) {
  return [((pos.x - qrPos.x) / 100) * CARD_W_UNITS, -((pos.y - qrPos.y) / 100) * CARD_H_UNITS];
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

// A fixed, non-tracked pose looking straight at the card from
// ASSUMED_PREVIEW_DISTANCE -- identity rotation, translation pushed back
// along +Z. Used wherever there's no live camera to track (see above).
export const STATIC_PREVIEW_POSE = {
  rotation: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  translation: [0, 0, ASSUMED_PREVIEW_DISTANCE],
};
