import { useEffect, useRef, useState } from 'react';
import { IlloCardEmpty } from '../components/Illustrations.jsx';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

// A pasted video link is often a YouTube page URL (watch/shorts/youtu.be),
// not a direct video file -- a plain <video src> can only play an actual
// file, not a YouTube page. Returns null for anything that isn't a
// recognizable YouTube URL, so a genuine direct file link still falls
// through to the normal <video> tag below.
function getYouTubeId(url) {
  if (!url) return null;
  const patterns = [/youtube\.com\/shorts\/([\w-]+)/, /youtube\.com\/watch\?v=([\w-]+)/, /youtu\.be\/([\w-]+)/, /youtube\.com\/embed\/([\w-]+)/];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}
function getYouTubeEmbedUrl(url) {
  const id = getYouTubeId(url);
  return id ? `https://www.youtube.com/embed/${id}?playsinline=1&rel=0` : null;
}

// A catalog entry's optional demo clip (see models/CatalogEntry.js), shown
// filling the front photo's own box the moment a visitor hovers over it --
// desktop-only in effect (touch devices have no hover state), so nothing
// is lost for a phone visitor beyond not getting this one bonus preview.
//
// Starts muted on purpose -- browsers block audible autoplay outright
// unless it's started by a direct user gesture, and a mouseenter doesn't
// count as one. Starting muted is what lets it autoplay at all; the small
// speaker button below then unmutes in direct response to an actual click,
// which browsers DO allow (the restriction is specifically on STARTING
// audible playback with no gesture, not on unmuting something already
// playing). Same reason Netflix/Instagram/etc. hover-previews all start
// muted with a manual unmute button rather than playing sound outright.
function HoverPlayMedia({ imageUrl, videoUrl, boxStyle }) {
  const [hovering, setHovering] = useState(false);
  const [muted, setMuted] = useState(true);
  const iframeRef = useRef(null);
  const videoRef = useRef(null);
  const youTubeId = videoUrl ? getYouTubeId(videoUrl) : null;
  const showVideo = hovering && Boolean(videoUrl);

  function stopHovering() {
    setHovering(false);
    setMuted(true); // next hover starts muted again -- a fresh iframe/video element next time, so it has to
  }

  // Plain <video> is same-origin (our own element), so toggling .muted
  // directly just works. The YouTube iframe is cross-origin -- it only
  // takes commands via postMessage (requires enablejsapi=1 on its src,
  // set below), which is YouTube's own documented control API, not a
  // workaround.
  function toggleSound(e) {
    e.stopPropagation();
    const next = !muted;
    setMuted(next);
    if (videoRef.current) videoRef.current.muted = next;
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func: next ? 'mute' : 'unMute', args: [] }),
      '*'
    );
  }

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={stopHovering}
      style={{ position: 'relative', overflow: 'hidden', background: 'var(--panel-raised)', ...boxStyle }}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-dim)',
            fontSize: 13,
          }}
        >
          No photo yet
        </div>
      )}
      {/* Hover-play isn't a control anyone would guess is there on their
          own -- shown only while the still photo is up (hidden once the
          video actually starts) and only when there's a video to find. */}
      {videoUrl && !showVideo && (
        <span
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 9px',
            borderRadius: 999,
            background: 'rgba(0, 0, 0, 0.6)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
            pointerEvents: 'none',
          }}
        >
          ▶ Hover to play video
        </span>
      )}
      {showVideo &&
        (youTubeId ? (
          // loop=1 alone doesn't loop a single (non-playlist) YouTube
          // video -- playlist=<same id> is the documented trick that
          // makes it actually repeat instead of just stopping.
          // enablejsapi=1 is what makes the mute/unMute postMessage
          // commands above actually work.
          <iframe
            ref={iframeRef}
            src={`https://www.youtube.com/embed/${youTubeId}?autoplay=1&mute=1&loop=1&playlist=${youTubeId}&controls=0&playsinline=1&rel=0&enablejsapi=1`}
            title=""
            allow="autoplay; encrypted-media"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
          />
        ) : (
          <video
            ref={videoRef}
            src={videoUrl}
            autoPlay
            muted
            loop
            playsInline
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ))}
      {showVideo && (
        <button
          type="button"
          onClick={toggleSound}
          title={muted ? 'Unmute' : 'Mute'}
          aria-label={muted ? 'Unmute video' : 'Mute video'}
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            width: 28,
            height: 28,
            padding: 0,
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(0, 0, 0, 0.6)',
            color: '#fff',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 2,
          }}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      )}
    </div>
  );
}

// The name/price/bullets/CTA block, shared by both EntryRow layouts below
// -- only how it's arranged relative to the photo(s) differs between them,
// not its own content.
function EntryDetails({ entry }) {
  const specs = [
    ['Printing Type', entry.printingType],
    ['Material', entry.material],
    ['NFC Chip Size', entry.nfcChipSize],
    ['Engraved Text Color', entry.engravedTextColor],
    ['Durability', entry.durability],
    ['Color options', entry.colorCount],
  ].filter(([, value]) => value);
  const hasMaterialDetails = specs.length > 0;
  const hasFeatures = (entry.features || []).length > 0;

  return (
    <>
      <h2 className="au-tier-name">{entry.name}</h2>
      <p className="au-tier-price">
        {entry.price ? (
          <>
            <span className="au-tier-amount">₹{entry.price}</span>
            <span className="au-tier-note">(Inclusive of all features)</span>
          </>
        ) : (
          <span className="au-tier-note">Contact us for pricing</span>
        )}
      </p>

      {hasMaterialDetails && (
        <>
          <h3 className="au-tier-label">Printing &amp; Material Details:</h3>
          <dl className="au-tier-specs">
            {specs.map(([label, value]) => (
              <div key={label}>
                <dt>{label}:</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {hasFeatures && (
        <>
          <h3 className="au-tier-label">Digital Features Included</h3>
          <ul className="au-tier-features">
            {entry.features.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </>
      )}

      <Link to={entry.linkedPlanKey ? `/shop?plan=${entry.linkedPlanKey}` : '/shop'} className="btn-primary au-cta">
        Get free design preview
      </Link>
    </>
  );
}

// 'horizontal' layout (the original/default) -- a single ROW: stacked
// front/back photos (one above the other) on one side, the
// name/price/details block on the other.
function EntryRowStacked({ entry }) {
  return (
    <section className="au-tier au-tier-stacked">
      <div className="au-tier-info">
        <EntryDetails entry={entry} />
      </div>

      <div className="au-tier-media">
        {entry.frontImageUrl || entry.backImageUrl ? (
          <>
            {/* Fixed landscape aspect ratio + object-fit: cover -- these horizontal card photos
                often have white margin baked into the file; cover crops it away. Only the FRONT
                photo gets the hover-to-play video (see models/CatalogEntry.js's videoUrl comment). */}
            {entry.frontImageUrl && (
              <HoverPlayMedia
                imageUrl={entry.frontImageUrl}
                videoUrl={entry.videoUrl}
                boxStyle={{ width: '100%', aspectRatio: '8 / 5', borderRadius: 12 }}
              />
            )}
            {entry.backImageUrl && (
              <div className="au-tier-photo" style={{ aspectRatio: '8 / 5' }}>
                <img src={entry.backImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
            )}
          </>
        ) : (
          <div className="au-tier-photo au-tier-nophoto" style={{ aspectRatio: '8 / 5' }}><IlloCardEmpty /><span>No photo yet</span></div>
        )}
      </div>
    </section>
  );
}

// 'vertical' layout -- same overall ROW as the stacked layout, differing only in how the two
// photos are arranged within the image side: side by side here, instead of stacked.
function EntryRowSideBySide({ entry }) {
  // Fixed portrait aspect ratio + object-fit: cover so a tall/odd source photo can't balloon.
  const photoBoxStyle = { flex: 1, minWidth: 0, aspectRatio: '3 / 4.24', borderRadius: 12 };

  return (
    <section className="au-tier au-tier-side">
      <div className="au-tier-info">
        <EntryDetails entry={entry} />
      </div>

      <div className="au-tier-media au-tier-media-row">
        {entry.frontImageUrl || entry.backImageUrl ? (
          <>
            {entry.frontImageUrl && (
              <HoverPlayMedia imageUrl={entry.frontImageUrl} videoUrl={entry.videoUrl} boxStyle={photoBoxStyle} />
            )}
            {entry.backImageUrl && (
              <img
                src={entry.backImageUrl}
                alt=""
                style={{ ...photoBoxStyle, objectFit: 'cover', display: 'block' }}
              />
            )}
          </>
        ) : (
          <div className="au-tier-photo au-tier-nophoto" style={{ width: '100%', aspectRatio: '4 / 3' }}><IlloCardEmpty /><span>No photo yet</span></div>
        )}
      </div>
    </section>
  );
}

function EntryRow({ entry }) {
  return entry.viewLayout === 'vertical' ? <EntryRowSideBySide entry={entry} /> : <EntryRowStacked entry={entry} />;
}

export default function Catalog() {
  const [tiers, setTiers] = useState([]);
  const [tiersLoading, setTiersLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getCatalogEntries()
      .then(setTiers)
      .catch(() => setTiers([]))
      .finally(() => setTiersLoading(false));
    api
      .getCatalog()
      .then(setEntries)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="au-page au-catalog">
      <header className="au-page-hero">
        <span className="hero-eyebrow">Card variants</span>
        <h1 className="section-heading">
          Every tier, <span className="grad">explained.</span>
        </h1>
        <p className="section-subheading">Photos, pricing, and what's included at each level -- pick the one that fits, then see it in motion below.</p>
      </header>

      {!tiersLoading && tiers.length > 0 && (
        <div className="au-tiers">
          {tiers.map((entry) => (
            <EntryRow key={entry.key} entry={entry} />
          ))}
        </div>
      )}

      <section className="au-motion">
        <div className="au-motion-head">
          <span className="hero-eyebrow">See it in motion</span>
          <h2 className="section-heading">A card actually being tapped</h2>
          <p className="section-subheading">A short clip of each card type in use, so you know exactly what you're getting.</p>
        </div>

        {loading && <p className="muted">Loading...</p>}
        {error && <p className="error">{error}</p>}

        {!loading && !error && entries.length === 0 && (
          <div className="card au-motion-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
              <rect x="3" y="5" width="14" height="14" rx="2" />
              <path d="M17 9.5 21 7v10l-4-2.5" />
            </svg>
            <p className="muted">No catalog videos yet -- check back soon.</p>
          </div>
        )}

        <div className="au-clips">
          {entries.map((entry) => {
            const embedUrl = getYouTubeEmbedUrl(entry.videoUrl);
            return (
              <div key={entry._id} className="au-clip">
                {embedUrl ? (
                  <iframe
                    src={embedUrl}
                    title={entry.title || 'Video short'}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{ width: '100%', aspectRatio: '9 / 16', display: 'block', background: '#000', border: 'none' }}
                  />
                ) : (
                  <video
                    src={entry.videoUrl}
                    controls
                    playsInline
                    style={{ width: '100%', aspectRatio: '9 / 16', display: 'block', background: '#000', objectFit: 'cover' }}
                  />
                )}
                {entry.title && <div className="au-clip-title">{entry.title}</div>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
