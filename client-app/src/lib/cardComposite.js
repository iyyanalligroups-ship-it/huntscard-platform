// Shared by MagicBusinessCard.jsx's "Download card (with QR)" button and
// DashboardHome.jsx's hero card preview, so both render literally the same
// composite (real card design + the client's AR QR baked in at whatever
// position they last dragged it to) instead of two separately-maintained
// copies of this canvas math.
const CARD_MM = { width: 85, height: 55 };
// The long edge's print resolution -- orientation-invariant (a vertical
// card is the same physical card just rotated, so its long edge is still
// 85mm), so this one constant covers both shapes.
const CARD_LONG_EDGE_PX = 1004;
const CARD_CORNER_MM = 3.2; // standard card-corner radius, same ratio the on-screen preview boxes use

function loadImage(src, { crossOrigin } = {}) {
  return new Promise((resolve, reject) => {
    const el = new Image();
    if (crossOrigin) el.crossOrigin = crossOrigin;
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not load image'));
    el.src = src;
  });
}

// Returns a <canvas> with the card design (rounded corners baked in) and,
// if qrUrl resolves, the QR composited at qrPos (0-100 percentages). A
// missing/blocked QR degrades to just the rounded card image rather than
// throwing -- same behavior as the original download button.
export async function composeCardWithQr({ imageUrl, qrUrl, qrPos }) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error('Could not download the card image');
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  let img;
  try {
    img = await loadImage(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  const qrImg = qrUrl ? await loadImage(qrUrl, { crossOrigin: 'anonymous' }).catch(() => null) : null;

  const pxPerMm = CARD_LONG_EDGE_PX / CARD_MM.width;
  const radius = CARD_CORNER_MM * pxPerMm;
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.arcTo(canvas.width, 0, canvas.width, canvas.height, radius);
  ctx.arcTo(canvas.width, canvas.height, 0, canvas.height, radius);
  ctx.arcTo(0, canvas.height, 0, 0, radius);
  ctx.arcTo(0, 0, canvas.width, 0, radius);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, 0, 0);

  if (qrImg) {
    // ~21.2mm real QR size (see arTargetImage.js's own derivation), as a
    // fraction of the card's short side, placed at its saved (x%, y%).
    const qrSizePx = Math.round(Math.min(canvas.width, canvas.height) * (21.2 / 55));
    const qrCenterX = (qrPos.x / 100) * canvas.width;
    const qrCenterY = (qrPos.y / 100) * canvas.height;
    ctx.drawImage(qrImg, qrCenterX - qrSizePx / 2, qrCenterY - qrSizePx / 2, qrSizePx, qrSizePx);
  }

  return canvas;
}
