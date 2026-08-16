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
  const edgeStartRef = useRef(null);

  function widthToHeight(width) {
    return (width * naturalWidth) / (naturalHeight * aspectRatio);
  }
  // Inverse of the above -- corner drags always derive height FROM width
  // (dx is the only input that matters when locked), but a north/south
  // edge handle only gives a vertical delta, so it needs to go the other
  // direction: derive width from the height it just picked.
  function heightToWidth(height) {
    return (height * naturalHeight * aspectRatio) / naturalWidth;
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

  // Edge (mid-side) handles -- resize from one side at a time instead of
  // always having to grab a corner. When locked to an aspect ratio, the
  // other dimension still has to move to match (a pure single-axis resize
  // isn't possible under a fixed ratio), so e/w derive height from the
  // width they just picked (same direction corners already use) while
  // n/s go the other way via heightToWidth, re-centering horizontally
  // since a vertical-only drag has no natural left/right anchor of its
  // own the way a corner drag does.
  function handleEdgePointerDown(edge, e) {
    e.preventDefault();
    e.stopPropagation(); // don't also trigger the whole-box move handler
    e.currentTarget.setPointerCapture(e.pointerId);
    edgeStartRef.current = { edge, x: e.clientX, y: e.clientY, crop: { ...crop } };
  }
  function handleEdgePointerMove(e) {
    const start = edgeStartRef.current;
    if (!start || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dxPct = (e.clientX - start.x) / rect.width;
    const dyPct = (e.clientY - start.y) / rect.height;
    const s = start.crop;
    let { x, y, width, height } = s;

    if (start.edge === 'e') {
      width = s.width + dxPct;
      height = aspectRatio ? widthToHeight(width) : s.height;
    } else if (start.edge === 'w') {
      width = s.width - dxPct;
      height = aspectRatio ? widthToHeight(width) : s.height;
      x = s.x + s.width - width;
    } else if (start.edge === 's') {
      height = s.height + dyPct;
      width = aspectRatio ? heightToWidth(height) : s.width;
      if (aspectRatio) x = s.x + (s.width - width) / 2;
    } else if (start.edge === 'n') {
      height = s.height - dyPct;
      width = aspectRatio ? heightToWidth(height) : s.width;
      y = s.y + s.height - height;
      if (aspectRatio) x = s.x + (s.width - width) / 2;
    }

    width = clamp(width, MIN_SIZE, 1);
    height = clamp(height, MIN_SIZE, 1);
    x = clamp(x, 0, 1 - width);
    y = clamp(y, 0, 1 - height);
    onCropChange({ x, y, width, height });
  }
  function handleEdgePointerUp() {
    edgeStartRef.current = null;
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
  // Two-part handles: a big invisible TOUCH target (real mobile-usable
  // size, ~44px per Apple/Google's own touch-target guidance) around a
  // small VISUAL indicator centered inside it -- so dragging is actually
  // easy to grab precisely on a phone without the handles themselves
  // looking like huge blobs on screen. The previous version made the
  // 14px visual dot ALSO the clickable area, which is what made this
  // hard to use accurately on a touchscreen.
  const TOUCH_SIZE = 40;
  const touchTargetStyle = (cursor) => ({
    position: 'absolute',
    width: TOUCH_SIZE,
    height: TOUCH_SIZE,
    marginLeft: -TOUCH_SIZE / 2,
    marginTop: -TOUCH_SIZE / 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor,
    touchAction: 'none',
  });
  const cornerDotStyle = {
    width: 18,
    height: 18,
    background: '#fff',
    border: '2px solid var(--holo-cyan, #5eead4)',
    borderRadius: '50%',
    boxShadow: '0 1px 5px rgba(0,0,0,0.5)',
  };
  // Oriented ALONG the edge they sit on (a wide short bar for the
  // top/bottom edges, a narrow tall bar for the left/right edges) --
  // reads as "drag this side" rather than a generic dot, matching how
  // most photo-crop tools distinguish edge handles from corner ones.
  const edgeBarStyle = (vertical) => ({
    width: vertical ? 6 : 24,
    height: vertical ? 24 : 6,
    background: '#fff',
    border: '2px solid var(--holo-cyan, #5eead4)',
    borderRadius: 4,
    boxShadow: '0 1px 5px rgba(0,0,0,0.5)',
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
          style={{ ...touchTargetStyle('nwse-resize'), left: 0, top: 0 }}
          onPointerDown={(e) => handleCornerPointerDown('nw', e)}
          onPointerMove={handleCornerPointerMove}
          onPointerUp={handleCornerPointerUp}
          onPointerCancel={handleCornerPointerUp}
        >
          <div style={cornerDotStyle} />
        </div>
        <div
          style={{ ...touchTargetStyle('nesw-resize'), left: '100%', top: 0 }}
          onPointerDown={(e) => handleCornerPointerDown('ne', e)}
          onPointerMove={handleCornerPointerMove}
          onPointerUp={handleCornerPointerUp}
          onPointerCancel={handleCornerPointerUp}
        >
          <div style={cornerDotStyle} />
        </div>
        <div
          style={{ ...touchTargetStyle('nesw-resize'), left: 0, top: '100%' }}
          onPointerDown={(e) => handleCornerPointerDown('sw', e)}
          onPointerMove={handleCornerPointerMove}
          onPointerUp={handleCornerPointerUp}
          onPointerCancel={handleCornerPointerUp}
        >
          <div style={cornerDotStyle} />
        </div>
        <div
          style={{ ...touchTargetStyle('nwse-resize'), left: '100%', top: '100%' }}
          onPointerDown={(e) => handleCornerPointerDown('se', e)}
          onPointerMove={handleCornerPointerMove}
          onPointerUp={handleCornerPointerUp}
          onPointerCancel={handleCornerPointerUp}
        >
          <div style={cornerDotStyle} />
        </div>

        <div
          style={{ ...touchTargetStyle('ns-resize'), left: '50%', top: 0 }}
          onPointerDown={(e) => handleEdgePointerDown('n', e)}
          onPointerMove={handleEdgePointerMove}
          onPointerUp={handleEdgePointerUp}
          onPointerCancel={handleEdgePointerUp}
        >
          <div style={edgeBarStyle(false)} />
        </div>
        <div
          style={{ ...touchTargetStyle('ns-resize'), left: '50%', top: '100%' }}
          onPointerDown={(e) => handleEdgePointerDown('s', e)}
          onPointerMove={handleEdgePointerMove}
          onPointerUp={handleEdgePointerUp}
          onPointerCancel={handleEdgePointerUp}
        >
          <div style={edgeBarStyle(false)} />
        </div>
        <div
          style={{ ...touchTargetStyle('ew-resize'), left: 0, top: '50%' }}
          onPointerDown={(e) => handleEdgePointerDown('w', e)}
          onPointerMove={handleEdgePointerMove}
          onPointerUp={handleEdgePointerUp}
          onPointerCancel={handleEdgePointerUp}
        >
          <div style={edgeBarStyle(true)} />
        </div>
        <div
          style={{ ...touchTargetStyle('ew-resize'), left: '100%', top: '50%' }}
          onPointerDown={(e) => handleEdgePointerDown('e', e)}
          onPointerMove={handleEdgePointerMove}
          onPointerUp={handleEdgePointerUp}
          onPointerCancel={handleEdgePointerUp}
        >
          <div style={edgeBarStyle(true)} />
        </div>
      </div>
    </div>
  );
}
