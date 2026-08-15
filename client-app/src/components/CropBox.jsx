import { useRef } from 'react';

const MIN_SIZE = 0.1; // fraction of the container -- keeps a drag from collapsing the box to nothing

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Interactive crop-box overlay -- ported verbatim from the admin app's
// component (admin-huntscard-main/.../src/components/CropBox.jsx), which
// itself is dependency-free (no library, pointer-capture drag/resize), so
// no adaptation was needed to bring it into client-app. Purely
// controlled: renders `children` (an <img> or <video> the caller sizes to
// fill the box) plus a draggable/resizable rectangle on top, and reports
// the chosen crop as fractions (0-1) of the media's own natural size via
// onCropChange -- doesn't touch the file itself, doesn't have its own
// Confirm button (the caller decides when to act on the current crop).
//
// `aspectRatio` (targetWidth/targetHeight in real pixels), when given,
// locks corner drags to that ratio.
export default function CropBox({ naturalWidth, naturalHeight, aspectRatio, crop, onCropChange, children }) {
  const containerRef = useRef(null);
  const moveStartRef = useRef(null);
  const cornerStartRef = useRef(null);

  function widthToHeight(width) {
    return (width * naturalWidth) / (naturalHeight * aspectRatio);
  }

  function handleBoxPointerDown(e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    moveStartRef.current = { x: e.clientX, y: e.clientY, cropX: crop.x, cropY: crop.y };
  }
  function handleBoxPointerMove(e) {
    const start = moveStartRef.current;
    if (!start || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dxPct = (e.clientX - start.x) / rect.width;
    const dyPct = (e.clientY - start.y) / rect.height;
    onCropChange({
      ...crop,
      x: clamp(start.cropX + dxPct, 0, 1 - crop.width),
      y: clamp(start.cropY + dyPct, 0, 1 - crop.height),
    });
  }
  function handleBoxPointerUp() {
    moveStartRef.current = null;
  }

  function handleCornerPointerDown(corner, e) {
    e.preventDefault();
    e.stopPropagation(); // don't also trigger the whole-box move handler above
    e.currentTarget.setPointerCapture(e.pointerId);
    cornerStartRef.current = { corner, x: e.clientX, y: e.clientY, crop: { ...crop } };
  }
  function handleCornerPointerMove(e) {
    const start = cornerStartRef.current;
    if (!start || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dxPct = (e.clientX - start.x) / rect.width;
    const dyPct = (e.clientY - start.y) / rect.height;
    const s = start.crop;
    let { x, y, width, height } = s;

    if (start.corner === 'se') {
      width = s.width + dxPct;
      height = aspectRatio ? widthToHeight(width) : s.height + dyPct;
    } else if (start.corner === 'nw') {
      width = s.width - dxPct;
      height = aspectRatio ? widthToHeight(width) : s.height - dyPct;
      x = s.x + s.width - width;
      y = aspectRatio ? s.y + s.height - height : s.y + dyPct;
    } else if (start.corner === 'ne') {
      width = s.width + dxPct;
      height = aspectRatio ? widthToHeight(width) : s.height - dyPct;
      y = aspectRatio ? s.y + s.height - height : s.y + dyPct;
    } else if (start.corner === 'sw') {
      width = s.width - dxPct;
      height = aspectRatio ? widthToHeight(width) : s.height + dyPct;
      x = s.x + s.width - width;
    }

    width = clamp(width, MIN_SIZE, 1);
    height = clamp(height, MIN_SIZE, 1);
    x = clamp(x, 0, 1 - width);
    y = clamp(y, 0, 1 - height);
    onCropChange({ x, y, width, height });
  }
  function handleCornerPointerUp() {
    cornerStartRef.current = null;
  }

  // Fit within a bounding box (max 420 wide, max 560 tall) rather than a
  // fixed width -- a tall portrait video at a fixed 420 width would
  // render ~750px tall, awkward in-page. Picks whichever dimension is
  // actually the binding constraint; the crop math itself is unaffected
  // since crop fractions are relative to the media's own natural size.
  const MAX_DISPLAY_WIDTH = 420;
  const MAX_DISPLAY_HEIGHT = 560;
  const naturalAspect = naturalWidth / naturalHeight;
  let displayWidth = MAX_DISPLAY_WIDTH;
  let displayHeight = displayWidth / naturalAspect;
  if (displayHeight > MAX_DISPLAY_HEIGHT) {
    displayHeight = MAX_DISPLAY_HEIGHT;
    displayWidth = displayHeight * naturalAspect;
  }
  const handleStyle = (cursor) => ({
    position: 'absolute',
    width: 14,
    height: 14,
    marginLeft: -7,
    marginTop: -7,
    background: '#fff',
    border: '2px solid var(--holo-cyan, #5eead4)',
    borderRadius: '50%',
    cursor,
    touchAction: 'none',
  });

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: displayWidth, height: displayHeight, overflow: 'hidden', borderRadius: 8, background: '#000' }}
    >
      {children}
      <div
        onPointerDown={handleBoxPointerDown}
        onPointerMove={handleBoxPointerMove}
        onPointerUp={handleBoxPointerUp}
        onPointerCancel={handleBoxPointerUp}
        style={{
          position: 'absolute',
          left: `${crop.x * 100}%`,
          top: `${crop.y * 100}%`,
          width: `${crop.width * 100}%`,
          height: `${crop.height * 100}%`,
          border: '2px solid #fff',
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
          cursor: 'move',
          touchAction: 'none',
        }}
      >
        <div
          style={{ ...handleStyle('nwse-resize'), left: 0, top: 0 }}
          onPointerDown={(e) => handleCornerPointerDown('nw', e)}
          onPointerMove={handleCornerPointerMove}
          onPointerUp={handleCornerPointerUp}
          onPointerCancel={handleCornerPointerUp}
        />
        <div
          style={{ ...handleStyle('nesw-resize'), left: '100%', top: 0 }}
          onPointerDown={(e) => handleCornerPointerDown('ne', e)}
          onPointerMove={handleCornerPointerMove}
          onPointerUp={handleCornerPointerUp}
          onPointerCancel={handleCornerPointerUp}
        />
        <div
          style={{ ...handleStyle('nesw-resize'), left: 0, top: '100%' }}
          onPointerDown={(e) => handleCornerPointerDown('sw', e)}
          onPointerMove={handleCornerPointerMove}
          onPointerUp={handleCornerPointerUp}
          onPointerCancel={handleCornerPointerUp}
        />
        <div
          style={{ ...handleStyle('nwse-resize'), left: '100%', top: '100%' }}
          onPointerDown={(e) => handleCornerPointerDown('se', e)}
          onPointerMove={handleCornerPointerMove}
          onPointerUp={handleCornerPointerUp}
          onPointerCancel={handleCornerPointerUp}
        />
      </div>
    </div>
  );
}
