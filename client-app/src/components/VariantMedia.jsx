import { useRef, useState } from 'react';
import { Play, Volume2 } from 'lucide-react';

// Front + back of one card style, side by side in rounded tagged frames.
// Hover plays the style's preview video over the cards. Limited / Special Edition (withSound)
// plays it WITH its audio; every other plan plays it muted.
// Browsers only allow sound after the visitor has interacted with the page; if hover sound is
// blocked, a "Tap to hear" chip appears and a tap plays it.
export default function VariantMedia({ variant, withSound = false }) {
  const [hover, setHover] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const mediaRef = useRef(null);
  const hasVideo = Boolean(variant.videoUrl);

  function play() {
    const m = mediaRef.current;
    if (!m) return;
    m.currentTime = 0;
    m.muted = !withSound;
    m.play().then(() => setBlocked(false)).catch(() => { if (withSound) { m.muted = true; m.play().catch(() => {}); setBlocked(true); } });
  }
  function enter() { setHover(true); play(); }
  function leave() {
    setHover(false);
    const m = mediaRef.current;
    if (m) m.pause();
  }

  return (
    <div className={`vm${hover ? ' is-hover' : ''}${variant.shape === 'horizontal' ? ' horizontal' : ''}`}
         onMouseEnter={enter} onMouseLeave={leave} onClick={hasVideo && withSound ? play : undefined}>
      {[['Front', variant.frontImageUrl], ['Back', variant.backImageUrl]].map(([tag, url]) => (
        <div className="vm-face" key={tag}>
          {url ? <img src={url} alt={`${variant.name} ${tag.toLowerCase()}`} loading="lazy" decoding="async" /> : <span className="vm-empty">No {tag.toLowerCase()} photo</span>}
          <span className="vm-tag">{tag}</span>
        </div>
      ))}
      {hasVideo ? (
        <div className="vm-video" aria-hidden="true">
          <video ref={mediaRef} src={variant.videoUrl} loop playsInline preload="metadata" muted={!withSound} />
          <span className="vm-play"><Play size={12} fill="currentColor" />Preview</span>
        </div>
      ) : null}
      {hasVideo && withSound ? (
        <span className={`vm-sound${hover && !blocked ? ' on' : ''}`}>
          <Volume2 size={12} />
          {blocked ? 'Tap to hear' : hover ? 'Playing sound' : 'Hover to hear'}
        </span>
      ) : null}
    </div>
  );
}
