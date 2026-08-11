import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import LightGallery from 'lightgallery/react';
import lgThumbnail from 'lightgallery/plugins/thumbnail';
import lgZoom from 'lightgallery/plugins/zoom';
import lgFullscreen from 'lightgallery/plugins/fullscreen';
import lgRotate from 'lightgallery/plugins/rotate';
import lgAutoplay from 'lightgallery/plugins/autoplay';
import lgShare from 'lightgallery/plugins/share';
import 'lightgallery/css/lightgallery-bundle.css';
import { api } from '../api.js';

// Public display of the admin's Magic Art packs (see
// backend/models/MagicArt.js) -- what a visitor prints or displays on a
// screen and points a phone camera at, using the client dashboard's Magic
// Camera page (login required there, not here -- this page is just the
// art itself). One admin can manage several packs now (an "Add Art"
// gallery), so this shows a grid. Each card explains itself (name, an
// "AR" badge, a Magic Camera link, description, and a fixed "how to
// scan" explainer) rather than just being a bare thumbnail -- a plain
// small photo gives a visitor no reason to think it's anything but a
// picture. Clicking the THUMBNAIL specifically (not the whole card, since
// the card now has its own real links inside it) opens the full
// lightgalleryjs.com lightbox (thumbnail strip, zoom, fullscreen, rotate,
// autoplay, share).
export default function MagicArt() {
  const [pieces, setPieces] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getPublicMagicArt()
      .then(setPieces)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <h1 className="section-heading" style={{ marginTop: 0 }}>Magic Art</h1>
      <p className="section-subheading">
        Open Magic Camera from your dashboard and point it at one of the images below to see it come alive.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {!pieces ? (
        <p className="subtitle">Loading…</p>
      ) : pieces.length === 0 ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="subtitle" style={{ margin: 0 }}>Nothing here yet — check back soon.</p>
        </div>
      ) : (
        <LightGallery
          plugins={[lgThumbnail, lgZoom, lgFullscreen, lgRotate, lgAutoplay, lgShare]}
          elementClassNames="magic-art-gallery"
          selector=".magic-art-lightbox-trigger"
          speed={400}
        >
          {pieces.map((piece, i) => (
            <div key={piece._id} className="magic-art-card card">
              <div className="magic-art-card-media">
                <span className="magic-art-badge">✨ Scan with Magic Camera</span>
                <a href={piece.imageUrl} className="magic-art-lightbox-trigger">
                  <img src={piece.imageUrl} alt={piece.name || `Magic Art ${i + 1}`} />
                </a>
              </div>

              <h3 className="magic-art-card-title">{piece.name || `Art ${i + 1}`}</h3>

              <Link to="/dashboard/magic-camera" className="magic-art-card-camera-link">
                Open Magic Camera →
              </Link>

              {piece.description && <p className="magic-art-card-description">{piece.description}</p>}

              <div className="magic-art-card-steps">
                <p className="magic-art-card-steps-title">How it works</p>
                <ol>
                  <li>On your mobile phone, log in and open Magic Camera from your dashboard.</li>
                  <li>Point your phone's camera at this image.</li>
                  <li>Watch the video come alive on it.</li>
                </ol>
              </div>
            </div>
          ))}
        </LightGallery>
      )}
    </div>
  );
}
