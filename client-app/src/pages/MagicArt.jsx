import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, API_URL } from '../api.js';
import MagicHoverPreview from '../components/MagicHoverPreview.jsx';

// Fixed target (no dynamic input), rendered server-side by
// backend/routes/public.js's GET /qr/magic-camera -- just a QR for
// /magic-camera, same idea as a real Artivive "Scan the image with the
// Artivive App" popup, but scanning it lands straight on our own public
// Magic Camera page (no app install needed) instead of an app-store link.
const MAGIC_CAMERA_QR_URL = `${API_URL}/api/public/qr/magic-camera`;

// Public display of the admin's Magic Art packs (see
// backend/models/MagicArt.js) -- what a visitor prints or displays on a
// screen and points a phone camera at, using the now-public Magic Camera
// page (see App.jsx/MagicCamera.jsx, no login needed there either). One
// admin can manage several packs now (an "Add Art" gallery), so this
// shows a grid. Each card explains itself (name, an "AR" badge, a Magic
// Camera link, description, and a fixed "how to scan" explainer) rather
// than just being a bare thumbnail. Hovering the thumbnail
// (MagicHoverPreview.jsx) plays the actual AR video positioned exactly as
// it will be when scanned, so a visitor can see the effect before ever
// touching their phone. Clicking the thumbnail (or the "Open Magic
// Camera" link) opens a popup with that piece's image + a QR code to
// Magic Camera -- modeled on the real Artivive product's own "scan this"
// popup (see the reference screenshot this was built from), except
// scanning this QR opens straight in the browser, no app install.
export default function MagicArt() {
  const [pieces, setPieces] = useState(null);
  const [error, setError] = useState('');
  // Which piece's "scan to see the effect" popup is open, if any -- shows
  // that piece's own image alongside the (fixed) Magic Camera QR, so the
  // popup always reflects the artwork the visitor actually clicked.
  const [qrTarget, setQrTarget] = useState(null);

  useEffect(() => {
    api
      .getPublicMagicArt()
      .then(setPieces)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <h1 className="section-heading" style={{ marginTop: 0 }}>Magic Poster</h1>
      <p className="section-subheading">
        Open Magic Camera -- no login needed -- and point it at one of the images below to see it come alive.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {!pieces ? (
        <p className="subtitle">Loading…</p>
      ) : pieces.length === 0 ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="subtitle" style={{ margin: 0 }}>Nothing here yet — check back soon.</p>
        </div>
      ) : (
        <div className="magic-art-gallery">
          {pieces.map((piece, i) => (
            <div key={piece._id} className="magic-art-card card">
              <div className="magic-art-card-media">
                <span className="magic-art-badge">✨ Scan with Magic Camera</span>
                <MagicHoverPreview
                  className="magic-art-lightbox-trigger"
                  imageUrl={piece.imageUrl}
                  videoUrl={piece.videoUrl}
                  videoCrop={piece.videoCrop}
                  alt={piece.name || `Magic Art ${i + 1}`}
                  onClick={() => setQrTarget(piece)}
                />
              </div>

              <h3 className="magic-art-card-title">{piece.name || `Art ${i + 1}`}</h3>

              <button
                type="button"
                className="magic-art-card-camera-link"
                style={{ width: 'auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                onClick={() => setQrTarget(piece)}
              >
                Open Magic Camera →
              </button>

              {piece.description && <p className="magic-art-card-description">{piece.description}</p>}

              <div className="magic-art-card-steps">
                <p className="magic-art-card-steps-title">How it works</p>
                <ol>
                  <li>On your mobile phone, open Magic Camera -- no login needed.</li>
                  <li>Point your phone's camera at this image.</li>
                  <li>Watch the video come alive on it.</li>
                </ol>
              </div>
            </div>
          ))}
        </div>
      )}

      {qrTarget && (
        <div className="auth-modal-backdrop" onClick={(e) => e.target === e.currentTarget && setQrTarget(null)}>
          <div className="auth-modal-card" style={{ textAlign: 'center' }}>
            <button className="auth-modal-close" onClick={() => setQrTarget(null)} aria-label="Close">
              ×
            </button>
            <h1 style={{ fontSize: 18, marginTop: 0 }}>Scan the image with Magic Camera</h1>

            <img
              src={qrTarget.imageUrl}
              alt={qrTarget.name || 'Magic Art'}
              style={{ width: '100%', maxWidth: 220, borderRadius: 10, margin: '12px auto', display: 'block' }}
            />

            <img
              src={MAGIC_CAMERA_QR_URL}
              alt="QR code to open Magic Camera"
              style={{ width: 140, height: 140, margin: '16px auto 8px', display: 'block', borderRadius: 8, background: '#fff', padding: 8 }}
            />
            <p className="hint" style={{ margin: '0 0 4px' }}>Scan this with your phone's camera to open Magic Camera.</p>
            <p className="hint" style={{ margin: '0 0 16px' }}>No app to install -- it opens straight in your phone's browser.</p>

            <Link to="/magic-camera" className="auth-modal-link">
              Already on your phone? Open Magic Camera directly →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
