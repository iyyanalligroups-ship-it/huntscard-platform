// Photographic imagery for the public site (black & white theme).
//
// This file used to hold vector illustrations. The client asked for real photos in black and
// white, so every component keeps its old name (so no page had to change) but now renders a
// photo from /assets/photos:
//   wolf.jpg        studio photo of the HuntsTAG wolf sculpture + signal arcs on concrete
//   card-black.jpg  / card-orange.jpg / card-art.jpg / card-teal.jpg   real card designs
//   launch.jpg      the product launch poster (card, AR panels, QR)
// Colour is removed in CSS (grayscale), so any future colourful upload still fits the theme.
// Different crops (object-position / zoom) keep one photo from looking repeated.

const BASE = '/assets/photos/';

function Photo({ src, alt = '', pos = '50% 50%', zoom = 1, className = '' }) {
  return (
    <div className={`av-photo ${className}`} aria-hidden={alt ? undefined : 'true'}>
      <img src={BASE + src} alt={alt} loading="lazy" decoding="async" style={{ objectPosition: pos, '--zoom': zoom }} />
    </div>
  );
}

// A product-shot: one card on a soft grey backdrop
function CardShot({ src, className = '', tilt = 0 }) {
  return (
    <div className={`av-photo av-cardshot ${className}`} aria-hidden="true">
      <img src={BASE + src} alt="" loading="lazy" decoding="async" style={{ '--tilt': tilt + 'deg' }} />
    </div>
  );
}

// Three real cards fanned out
function CardFan({ srcs, className = '' }) {
  return (
    <div className={`av-photo av-cardfan ${className}`} aria-hidden="true">
      {srcs.map((s, i) => (
        <img key={s} src={BASE + s} alt="" loading="lazy" decoding="async" className={`fan-${i}`} />
      ))}
    </div>
  );
}

// HOME hero: the wide studio photograph
export function HeroScene({ className = '' }) {
  return <Photo src="wolf.jpg" alt="The HuntsTAG wolf broadcasting a tap signal" pos="50% 42%" className={`av-hero-photo ${className}`} />;
}

export const IlloChooseCard = ({ className = '' }) => <CardFan srcs={['card-black.jpg', 'card-art.jpg', 'card-orange.jpg']} className={className} />;
export const IlloDesign = ({ className = '' }) => <CardFan srcs={['card-teal.jpg', 'card-black.jpg', 'card-art.jpg']} className={className} />;
export const IlloTap = ({ className = '' }) => <Photo src="wolf.jpg" pos="62% 40%" zoom={1.25} className={className} />;
export const IlloUpdate = ({ className = '' }) => <CardShot src="card-art.jpg" className={className} tilt={-4} />;
export const IlloLock = ({ className = '' }) => <CardShot src="card-orange.jpg" className={className} tilt={3} />;
export const IlloProfile = ({ className = '' }) => <Photo src="launch.jpg" pos="50% 38%" zoom={1.1} className={className} />;
export const IlloSync = ({ className = '' }) => <Photo src="launch.jpg" pos="50% 82%" zoom={1.35} className={className} />;
export const IlloAR = ({ className = '' }) => <Photo src="launch.jpg" pos="85% 22%" zoom={1.6} className={className} />;
export const IlloQR = ({ className = '' }) => <CardShot src="card-black.jpg" className={className} tilt={-2} />;
export const IlloListing = ({ className = '' }) => <Photo src="wolf.jpg" pos="20% 60%" zoom={1.35} className={className} />;
export const IlloMail = ({ className = '' }) => <Photo src="wolf.jpg" pos="85% 25%" zoom={1.45} className={className} />;
export const IlloQuestion = ({ className = '' }) => <Photo src="wolf.jpg" pos="45% 30%" zoom={1.5} className={className} />;
export const IlloChat = ({ className = '' }) => <Photo src="wolf.jpg" pos="70% 70%" zoom={1.4} className={className} />;

// empty / no-photo placeholder: a plain grey card outline (kept as a tiny vector, neutral only)
export function IlloCardEmpty({ className = '' }) {
  return (
    <svg className={`av-illo ${className}`} viewBox="0 0 320 200" fill="none" aria-hidden="true" focusable="false">
      <rect x="40" y="36" width="240" height="140" rx="20" fill="#ececec" />
      <rect x="40" y="36" width="240" height="140" rx="20" stroke="#111" strokeWidth="2" strokeDasharray="3 10" strokeLinecap="round" />
      <rect x="66" y="62" width="46" height="36" rx="9" fill="#d6d6d6" stroke="#111" strokeWidth="2" />
      <rect x="66" y="128" width="104" height="10" rx="5" fill="#111" opacity="0.35" />
    </svg>
  );
}

// soft concentric rings (neutral grey) used as a quiet flourish
export function TapRings({ className = '' }) {
  return (
    <svg className={`av-illo ${className}`} viewBox="0 0 400 400" fill="none" aria-hidden="true" focusable="false">
      {[180, 140, 100, 60].map((r, i) => (
        <circle key={r} cx="200" cy="200" r={r} stroke="#111" strokeWidth={i === 3 ? 0 : 1.5} fill={i === 3 ? '#111' : 'none'} opacity={i === 3 ? 0.08 : 0.1 + i * 0.05} />
      ))}
    </svg>
  );
}
