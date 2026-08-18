import { API_URL } from '../api.js';
import { CARD_ASPECT } from './arProjection.js';

// Builds the exact banner+QR composite ArViewMindAR.jsx tracks as its AR
// target -- shared here (not just a local function in that file) so the
// dashboard's "Download tracking target" button can hand a client the
// literal same image to print/display, instead of them having to guess
// at matching this layout by hand (which is what "the QR isn't quite in
// the right spot" test failures kept coming from). Returns the raw
// <canvas> -- callers that need a loaded <img> (the mind-ar compiler) or
// a downloadable file (the dashboard button) each convert it themselves,
// see buildArTargetImageEl / canvasToDownloadUrl below.
export async function buildArTargetCanvas(profile, layout, cardNumber) {
  // The actual purchased card design (see public.js's GET /profile/:clientId)
  // -- NOT profile.bannerUrl, which is a separate cover-photo upload most
  // plans (Apex included) don't even let the client set, and isn't the
  // client's real card design in any case.
  const bannerUrl = profile?.cardDesignUrl || profile?.customDesignFrontUrl || null;
  // &engine=mindar so scanning this specific printed/on-screen target's QR
  // (as a REAL QR code, not just as an AR tracking target) lands back on
  // this same engine -- otherwise it opens the default ArView.jsx, which
  // is exactly the mix-up that caused confusing "still unstable" reports
  // earlier while actually testing the wrong page. &card=N -- which
  // PHYSICAL card this baked-in QR resolves to; without it every card's
  // downloaded/printed target encodes the same QR, always landing on
  // card #1 no matter which physical card was actually scanned.
  const qrUrl = `${API_URL}/api/public/qr/${profile.clientId}?type=ar&transparent=1&engine=mindar${cardNumber ? `&card=${cardNumber}` : ''}`;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Could not load image: ${src}`));
      img.src = src;
    });
  }

  const qrImg = await loadImage(qrUrl);
  const bannerImg = bannerUrl ? await loadImage(bannerUrl).catch(() => null) : null;

  // The physical card this client actually purchased (see
  // CardPlanVariantSchema.shape / profile.cardShape) -- the composited
  // tracking target has to match its real proportions, or mind-ar is
  // tracking a shape that doesn't match what the camera actually sees,
  // and everything positioned on it comes out wrong. 800px landscape
  // width, height derived from the real ISO ID-1 aspect (85.6:54, same
  // constant as CARD_ASPECT) rather than a rounded approximation; a
  // vertical card gets the same treatment rotated.
  const vertical = profile?.cardShape === 'vertical';
  const landscapeH = Math.round(800 / CARD_ASPECT);
  const W = vertical ? landscapeH : 800;
  const H = vertical ? 800 : landscapeH;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  if (bannerImg) {
    ctx.drawImage(bannerImg, 0, 0, W, H);
  } else {
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(0, 0, W, H);
  }

  // The real printed QR's physical size -- measured at 250px on a 300 DPI
  // design (250 / 300in * 25.4mm/in ~= 21.2mm), as a fraction of the
  // card's real short side (54mm, fixed regardless of orientation -- see
  // CARD_ASPECT). Was previously guessed at 70% of the card's shorter
  // side (~37.8mm), nearly double the real QR -- that mismatch between
  // the tracking target and the actual printed card was a real
  // contributor to unreliable tracking, not just a cosmetic difference.
  const QR_SIZE_MM = (250 / 300) * 25.4;
  const CARD_SHORT_SIDE_MM = 54;
  // Applied against the SHORTER canvas side either way (was always H in
  // landscape, which happens to be the shorter side -- Math.min keeps
  // that unchanged for horizontal cards while giving the right answer
  // for vertical ones too, where W is now the shorter side instead).
  const qrSize = Math.round(Math.min(W, H) * (QR_SIZE_MM / CARD_SHORT_SIDE_MM));
  // Centered on the client's own saved layout.qr (x%, y%) -- the SAME
  // field every other element's position is measured against everywhere
  // else in the app (ArScanPreview.jsx's editor preview, ArLayout.jsx's
  // Scan preview). This used to be a hardcoded corner position instead,
  // completely disconnected from layout.qr -- so the editor was showing
  // the QR at the card's center while the real tracked composite had it
  // pinned near an edge, throwing off how far every other element (which
  // IS positioned relative to the real QR) appeared to be from it on an
  // actual scan. Falls back to dead-center (50, 50) -- the schema's own
  // default -- if a layout hasn't loaded for some reason.
  const qrPos = layout?.qr || { x: 50, y: 50 };
  const qrCenterX = (qrPos.x / 100) * W;
  const qrCenterY = (qrPos.y / 100) * H;
  const qrX = qrCenterX - qrSize / 2;
  const qrY = qrCenterY - qrSize / 2;
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  return canvas;
}

// mind-ar's Compiler wants a loaded <img>, not a <canvas> -- same
// dataURL round-trip ArViewMindAR.jsx always did, just factored out so
// both callers share it.
export async function buildArTargetImageEl(profile, layout, cardNumber) {
  const canvas = await buildArTargetCanvas(profile, layout, cardNumber);
  const composited = new Image();
  composited.src = canvas.toDataURL('image/png');
  await new Promise((resolve, reject) => {
    composited.onload = resolve;
    composited.onerror = () => reject(new Error('Could not finalize the tracking target'));
  });
  return composited;
}
