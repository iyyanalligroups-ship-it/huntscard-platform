import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

// A pasted Video Short link is often a YouTube page URL (watch/shorts/
// youtu.be), not a direct video file -- a plain <video src> can only play
// an actual file, not a YouTube page, so that link needs to render as an
// <iframe> embed instead. Returns null for anything that isn't a
// recognizable YouTube URL, so a genuine direct file link still falls
// through to the normal <video> tag below.
function getYouTubeEmbedUrl(url) {
  if (!url) return null;
  const patterns = [/youtube\.com\/shorts\/([\w-]+)/, /youtube\.com\/watch\?v=([\w-]+)/, /youtu\.be\/([\w-]+)/, /youtube\.com\/embed\/([\w-]+)/];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return `https://www.youtube.com/embed/${m[1]}?playsinline=1&rel=0`;
  }
  return null;
}

// The name/price/bullets/CTA block, shared by both EntryRow layouts below
// -- only how it's arranged relative to the photo(s) differs between them,
// not its own content.
function EntryDetails({ entry }) {
  const hasMaterialDetails = Boolean(
    entry.printingType || entry.material || entry.nfcChipSize || entry.engravedTextColor || entry.durability || entry.colorCount
  );
  const hasFeatures = (entry.features || []).length > 0;

  return (
    <>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: '0 0 10px' }}>{entry.name}</h2>
      <p style={{ fontWeight: 700, margin: '0 0 20px' }}>
        {entry.price ? (
          <>
            Price: <span style={{ color: 'var(--holo-cyan)' }}>₹{entry.price}</span>{' '}
            <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>(Inclusive of all features)</span>
          </>
        ) : (
          <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>Contact us for pricing</span>
        )}
      </p>

      {hasMaterialDetails && (
        <>
          <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>Printing &amp; Material Details:</h3>
          <ul style={{ margin: '0 0 22px', paddingLeft: 20, color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.9 }}>
            {entry.printingType && (
              <li>
                <b style={{ color: 'var(--text)' }}>Printing Type:</b> {entry.printingType}
              </li>
            )}
            {entry.material && (
              <li>
                <b style={{ color: 'var(--text)' }}>Material:</b> {entry.material}
              </li>
            )}
            {entry.nfcChipSize && (
              <li>
                <b style={{ color: 'var(--text)' }}>NFC Chip Size:</b> {entry.nfcChipSize}
              </li>
            )}
            {entry.engravedTextColor && (
              <li>
                <b style={{ color: 'var(--text)' }}>Engraved Text Color:</b> {entry.engravedTextColor}
              </li>
            )}
            {entry.durability && (
              <li>
                <b style={{ color: 'var(--text)' }}>Durability:</b> {entry.durability}
              </li>
            )}
            {entry.colorCount && (
              <li>
                <b style={{ color: 'var(--text)' }}>Color options:</b> {entry.colorCount}
              </li>
            )}
          </ul>
        </>
      )}

      {hasFeatures && (
        <>
          <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>Digital Features Included</h3>
          <ul style={{ margin: '0 0 24px', paddingLeft: 20, color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.9 }}>
            {entry.features.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </>
      )}

      <Link
        to={entry.linkedPlanKey ? `/shop?plan=${entry.linkedPlanKey}` : '/shop'}
        style={{
          display: 'inline-block',
          padding: '12px 28px',
          borderRadius: 999,
          background: 'var(--holo-gradient)',
          color: '#06120f',
          fontWeight: 700,
          fontSize: 13,
          textDecoration: 'none',
        }}
      >
        Get free design preview
      </Link>
    </>
  );
}

// 'horizontal' layout (the original/default) -- a single ROW: stacked
// front/back photos (one above the other) on one side, the
// name/price/details block on the other. Matches the TapMo reference
// catalog's per-product layout (a row per card type, not a compact
// grid-of-cards).
function EntryRowStacked({ entry }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 40,
        flexWrap: 'wrap',
        maxWidth: 1100,
        margin: '0 auto',
        padding: '44px 24px',
        borderBottom: '1px solid var(--panel-border)',
      }}
    >
      <div style={{ flex: '1 1 320px', minWidth: 280 }}>
        <EntryDetails entry={entry} />
      </div>

      <div style={{ flex: '0 0 260px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[entry.frontImageUrl, entry.backImageUrl].filter(Boolean).length > 0 ? (
          [entry.frontImageUrl, entry.backImageUrl]
            .filter(Boolean)
            .map((img, i) => (
              // Fixed landscape aspect ratio + object-fit: cover -- this
              // "horizontal" layout's photos are horizontal card designs,
              // and several uploads have visible white margin baked into
              // the file around the actual card art. Letting the image
              // render at its own natural size (the old behavior) showed
              // that margin as-is; cover crops it away and fills the box
              // with just the card itself, same fix as the side-by-side
              // layout above already got.
              <div
                key={i}
                style={{
                  width: '100%',
                  maxWidth: 260,
                  aspectRatio: '8 / 5',
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: 'var(--panel-raised)',
                }}
              >
                <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
            ))
        ) : (
          <div
            style={{
              width: '100%',
              maxWidth: 260,
              aspectRatio: '8 / 5',
              borderRadius: 12,
              background: 'var(--panel-raised)',
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
      </div>
    </div>
  );
}

// 'vertical' layout -- same overall ROW as the stacked layout (content on
// one side, images on the other), differing only in how the two photos
// are arranged within that image side: side by side here, instead of
// stacked one above the other.
function EntryRowSideBySide({ entry }) {
  const images = [entry.frontImageUrl, entry.backImageUrl].filter(Boolean);

  return (
    <div
      style={{
        display: 'flex',
        gap: 40,
        flexWrap: 'wrap',
        maxWidth: 1100,
        margin: '0 auto',
        padding: '44px 24px',
        borderBottom: '1px solid var(--panel-border)',
      }}
    >
      <div style={{ flex: '1 1 320px', minWidth: 280 }}>
        <EntryDetails entry={entry} />
      </div>

      <div style={{ flex: '1 1 320px', maxWidth: 420, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        {images.length > 0 ? (
          images.map((img, i) => (
            // Fixed portrait aspect ratio + object-fit: cover -- without
            // this, a real uploaded photo renders at whatever its own
            // natural pixel dimensions imply once scaled to fit the flex
            // width, which for a tall/differently-cropped source photo
            // can balloon the image far taller than the card-mockup-sized
            // look every other layout on this page has. alignItems:
            // flex-start on the row above matters just as much -- flex's
            // default 'stretch' was forcing both images to match whichever
            // one's natural size made the row tallest, stretching the
            // other one out of its own aspect ratio instead of letting
            // each size itself from aspectRatio + width alone.
            <img
              key={i}
              src={img}
              alt=""
              style={{
                flex: 1,
                minWidth: 0,
                maxWidth: 200,
                aspectRatio: '3 / 4.24',
                objectFit: 'cover',
                borderRadius: 12,
                display: 'block',
                background: 'var(--panel-raised)',
              }}
            />
          ))
        ) : (
          <div
            style={{
              width: '100%',
              aspectRatio: '4 / 3',
              borderRadius: 12,
              background: 'var(--panel-raised)',
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
      </div>
    </div>
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
    <div>
      <div className="hero-section" style={{ paddingBottom: 12 }}>
        <span className="hero-eyebrow">Card variants</span>
        <h1>
          Every tier, <span className="grad">explained.</span>
        </h1>
        <p>Photos, pricing, and what's included at each level -- pick the one that fits, then see it in motion below.</p>
      </div>

      {!tiersLoading && tiers.length > 0 && (
        <div style={{ paddingBottom: 20 }}>
          {tiers.map((entry) => (
            <EntryRow key={entry.key} entry={entry} />
          ))}
        </div>
      )}

      <div className="hero-section" style={{ paddingBottom: 12, paddingTop: 0 }}>
        <span className="hero-eyebrow">See it in motion</span>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26 }}>A card actually being tapped</h2>
        <p>A short clip of each card type in use, so you know exactly what you're getting.</p>
      </div>

      {loading && <p className="muted" style={{ textAlign: 'center' }}>Loading...</p>}
      {error && <p className="error" style={{ textAlign: 'center' }}>{error}</p>}

      {!loading && !error && entries.length === 0 && (
        <div className="card" style={{ maxWidth: 380, margin: '0 auto 60px', textAlign: 'center' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'var(--panel-raised, rgba(255,255,255,0.06))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px',
              color: 'var(--holo-cyan, #5eead4)',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
              <rect x="3" y="5" width="14" height="14" rx="2" />
              <path d="M17 9.5 21 7v10l-4-2.5" />
            </svg>
          </div>
          <p className="muted" style={{ margin: 0 }}>No catalog videos yet -- check back soon.</p>
        </div>
      )}

      <div
        style={{
          // Flex-wrap instead of a grid's 1fr columns -- a grid column
          // stretches to fill the row even with just one item, which blew
          // a single 9:16 video up to almost the full page width. A fixed
          // card width keeps every clip a real "short"-sized card no
          // matter how many plans have videos uploaded.
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 20,
          maxWidth: 1000,
          margin: '0 auto',
          padding: '0 24px 60px',
        }}
      >
        {entries.map((entry) => {
          const embedUrl = getYouTubeEmbedUrl(entry.videoUrl);
          return (
          <div
            key={entry._id}
            style={{
              width: 220,
              background: 'var(--panel)',
              border: '1px solid var(--panel-border)',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
            }}
          >
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
            {entry.title && (
              <div style={{ padding: '14px 16px' }}>
                <div style={{ fontWeight: 700, fontFamily: 'var(--font-display)' }}>{entry.title}</div>
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
