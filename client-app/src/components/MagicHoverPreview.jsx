import { useRef, useState } from 'react';

const PORTRAIT_ASPECT = 1080 / 1350; // matches admin's own fallback -- see MagicArt.jsx's PORTRAIT_SIZE

// Hover the image to preview every overlay video positioned EXACTLY as it
// will be when someone actually scans it with Magic Camera -- same math
// as admin-app's own live-preview reference (MagicArt.jsx's ScanPreview),
// kept as a separate copy since client-app and admin-app are separate
// apps/packages, not because the logic differs. A piece can have MORE
// THAN ONE overlay clip, each with its own box on the base image (x/y/
// width/height, percentages of the image's own size) -- NOT just one
// video stretched across the whole thing, so every overlay renders as
// its own positioned box, same as the real WebGL version.
//
// The container is locked to the image's real aspect ratio (imageWidth/
// imageHeight) with the image itself `object-fit: cover` -- without this,
// a plain `width:100%, height:auto` <img> can drift out of sync with the
// overlay boxes' own percentages if the rendered size doesn't exactly
// track the stored dimensions (e.g. before the image has loaded).
//
// Per-overlay crop math: `videoCrop` is a fractional (0-1) rectangle of
// the VIDEO's own natural size that gets stretched to fill its box in
// production. Scale the video up so the crop rectangle's width/height
// each become 100% of its box (scale factor 1/crop.width, 1/crop.height),
// then shift it left/up by crop.x/crop.width and crop.y/crop.height (as
// percentages) so that corner of the crop lands on the box's own
// top-left corner. `objectFit: 'fill'` matches the WebGL version's
// non-uniform stretch.
export default function MagicHoverPreview({ imageUrl, overlays, imageWidth, imageHeight, alt, onClick, className, style }) {
  const [hovering, setHovering] = useState(false);
  const videoRefs = useRef({});
  const list = (overlays || []).filter((o) => o.videoUrl);
  const showVideo = hovering && list.length > 0;
  const aspect = imageWidth && imageHeight ? imageWidth / imageHeight : PORTRAIT_ASPECT;

  function handleEnter() {
    setHovering(true);
    Object.values(videoRefs.current).forEach((v) => v?.play().catch(() => {}));
  }
  function handleLeave() {
    setHovering(false);
    Object.values(videoRefs.current).forEach((v) => {
      if (!v) return;
      v.pause();
      v.currentTime = 0;
    });
  }

  return (
    <button
      type="button"
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        aspectRatio: String(aspect),
        background: 'none',
        border: 'none',
        padding: 0,
        ...style,
      }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      onClick={onClick}
    >
      <img
        src={imageUrl}
        alt={alt}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: showVideo ? 0 : 1,
          transition: 'opacity 150ms',
        }}
      />
      {list.map((overlay) => {
        const crop = overlay.videoCrop || { x: 0, y: 0, width: 1, height: 1 };
        return (
          <div
            key={overlay.videoUrl}
            style={{
              position: 'absolute',
              left: `${overlay.x}%`,
              top: `${overlay.y}%`,
              width: `${overlay.width}%`,
              height: `${overlay.height}%`,
              overflow: 'hidden',
              pointerEvents: 'none',
            }}
          >
            <video
              // Keyed to the URL itself -- a plain `src` prop change updates
              // the DOM attribute, but an already-loaded <video> element
              // doesn't reliably reload just because that attribute changed
              // (needs an explicit .load()). Keying it forces React to mount
              // a genuinely fresh element whenever the video is replaced, so
              // the old buffered content can't keep playing on hover.
              key={overlay.videoUrl}
              ref={(el) => (videoRefs.current[overlay.videoUrl] = el)}
              src={overlay.videoUrl}
              muted
              loop
              playsInline
              style={{
                position: 'absolute',
                width: `${100 / crop.width}%`,
                height: `${100 / crop.height}%`,
                left: `${-(crop.x / crop.width) * 100}%`,
                top: `${-(crop.y / crop.height) * 100}%`,
                objectFit: 'fill',
                opacity: showVideo ? 1 : 0,
                transition: 'opacity 150ms',
              }}
            />
          </div>
        );
      })}
      {list.length > 0 && !hovering && (
        <span
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            fontSize: 11,
            fontWeight: 700,
            color: '#fff',
            background: 'rgba(0,0,0,0.55)',
            padding: '3px 9px',
            borderRadius: 999,
          }}
        >
          Hover to preview
        </span>
      )}
    </button>
  );
}
