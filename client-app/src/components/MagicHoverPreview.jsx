import { useRef, useState } from 'react';

// Hover the image to preview the video positioned EXACTLY as it will be
// when someone actually scans it with Magic Camera -- same crop math as
// the real WebGL texture UV transform (MagicCamera.jsx), just expressed
// as a CSS scale+translate on a plain <video> instead. Lets a public
// visitor see what the effect looks like before ever picking up their
// phone. Mirrors admin-app's own MagicHoverPreview.jsx (same math, kept
// as a separate copy since client-app and admin-app are separate apps/
// packages, not because the logic differs).
//
// The crop math: `crop` is a fractional (0-1) rectangle of the VIDEO's
// own natural size that gets stretched to fill the target plane in
// production. Scale the video up so the crop rectangle's width/height
// each become 100% of the container (scale factor 1/crop.width,
// 1/crop.height), then shift it left/up by crop.x/crop.width and
// crop.y/crop.height (as percentages) so that corner of the crop lands
// on the container's own top-left corner. `objectFit: 'fill'` matches
// the WebGL version's non-uniform stretch.
export default function MagicHoverPreview({ imageUrl, videoUrl, videoCrop, alt, onClick, className, style }) {
  const [hovering, setHovering] = useState(false);
  const videoRef = useRef(null);
  const crop = videoCrop || { x: 0, y: 0, width: 1, height: 1 };
  const showVideo = hovering && Boolean(videoUrl);

  function handleEnter() {
    setHovering(true);
    videoRef.current?.play().catch(() => {});
  }
  function handleLeave() {
    setHovering(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }

  return (
    <button
      type="button"
      className={className}
      style={{ position: 'relative', overflow: 'hidden', width: '100%', background: 'none', border: 'none', padding: 0, ...style }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      onClick={onClick}
    >
      <img
        src={imageUrl}
        alt={alt}
        style={{ display: 'block', width: '100%', opacity: showVideo ? 0 : 1, transition: 'opacity 150ms' }}
      />
      {videoUrl && (
        <video
          // Keyed to the URL itself -- a plain `src` prop change updates
          // the DOM attribute, but an already-loaded <video> element
          // doesn't reliably reload just because that attribute changed
          // (needs an explicit .load()). Keying it forces React to mount
          // a genuinely fresh element whenever the video is replaced, so
          // the old buffered content can't keep playing on hover.
          key={videoUrl}
          ref={videoRef}
          src={videoUrl}
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
            pointerEvents: 'none',
          }}
        />
      )}
      {videoUrl && !hovering && (
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
