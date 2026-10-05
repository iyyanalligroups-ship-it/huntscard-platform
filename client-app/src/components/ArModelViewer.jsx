import { useEffect, useRef, useState } from 'react';

// Interactive 3D model for the homepage AR panel. @google/model-viewer (~900 KB) and the
// GLB (~4.7 MB, mesh-simplified + Draco) are only fetched once the panel is near the viewport,
// so they never slow down first paint. Until then, and if WebGL/loading fails, the static
// poster image is shown. Visitors can drag to turn the model.
export default function ArModelViewer({ src, poster, label = '3D model' }) {
  const hostRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    let cancelled = false;
    let loaded = false;
    // Mount the WebGL viewer only while the panel is on or near screen, and unmount it when it
    // scrolls away, so it never renders frames (or holds a GPU context) nobody can see.
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) { setReady(false); return; }
      if (loaded) { setReady(true); return; }
      import('@google/model-viewer')
        .then(() => { loaded = true; if (!cancelled) setReady(true); })
        .catch(() => { if (!cancelled) setFailed(true); });
    }, { rootMargin: '150px' });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); };
  }, []);

  return (
    <div className="ar-mv" ref={hostRef}>
      {poster && (!ready || failed) ? <img className="ar-mv-poster" src={poster} alt="" decoding="async" /> : null}
      {ready && !failed ? (
        <model-viewer
          src={src}
          alt={label}
          camera-controls=""
          auto-rotate=""
          auto-rotate-delay="0"
          rotation-per-second="28deg"
          interaction-prompt="none"
          shadow-intensity="0.8"
          exposure="1.1"
          camera-orbit="0deg 82deg 3.7m"
          camera-target="0m 0.84m 0m"
          field-of-view="30deg"
          disable-zoom=""
          touch-action="pan-y"
          loading="eager"
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  );
}
