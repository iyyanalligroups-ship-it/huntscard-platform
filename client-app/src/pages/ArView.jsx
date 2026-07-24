import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import jsQR from 'jsqr';
import { api } from '../api.js';

/**
 * The live camera AR view -- what actually opens when someone scans the AR
 * QR code (PublicProfile.jsx renders this instead of the plain profile
 * when ?ar=1 is present). Tracks the QR code itself as the marker (no
 * per-client image-marker setup needed, see plan notes) and floats the
 * same elements/positions the client set up in ArLayout.jsx on top of the
 * live camera feed.
 *
 * Coordinate model: everything is positioned inside a fixed REF_W x
 * REF_H reference box (same 9:16 "card" aspect ArLayout.jsx uses, with
 * the QR occupying QR_FRACTION of its width, centered) -- identical
 * convention to the editor, so a layout saved there maps here unchanged.
 * That whole reference box is then rigidly transformed (translate +
 * rotate + scale) each frame so its center lands exactly on the QR's
 * detected on-screen center, at the QR's detected size/rotation.
 */

const REF_W = 300;
const REF_H = REF_W * (16 / 9);
const QR_FRACTION = 0.3;
const COAST_MS = 600; // keep last-known position visible this long after the QR drops out of frame

const ELEMENTS = [
  { key: 'video', label: 'AR Video / Photo', color: '#8b5cf6' },
  { key: 'contact', label: 'Contact Info', color: '#14b8a6' },
  { key: 'portfolio', label: 'Portfolio', color: '#4f8ef7' },
  { key: 'social', label: 'Social Icons', color: '#ec4899' },
  { key: 'huntsworld', label: 'Huntsworld Link', color: '#f5a524' },
];

// Fills [cw,ch] from the video's native frame the same way CSS
// object-fit:cover would, so the canvas always shows a full-bleed feed.
function drawCover(ctx, video, cw, ch) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  const videoRatio = vw / vh;
  const canvasRatio = cw / ch;
  let sx, sy, sw, sh;
  if (videoRatio > canvasRatio) {
    sh = vh;
    sw = vh * canvasRatio;
    sx = (vw - sw) / 2;
    sy = 0;
  } else {
    sw = vw;
    sh = vw / canvasRatio;
    sx = 0;
    sy = (vh - sh) / 2;
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
}

export default function ArView({ clientId }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const detectorRef = useRef(null);
  const lastSeenRef = useRef(0);

  const [profile, setProfile] = useState(null);
  const [layout, setLayout] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [transform, setTransform] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    Promise.all([api.getPublicProfile(clientId), api.getPublicArLayout(clientId)])
      .then(([p, l]) => {
        setProfile(p);
        setLayout(l);
      })
      .catch((err) => setLoadError(err.message));
  }, [clientId]);

  useEffect(() => {
    let stream;
    let cancelled = false;

    function resizeCanvas() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    function applyCorners(corners) {
      const [tl, tr, , bl] = corners;
      const cx = (tl.x + tr.x + corners[2].x + bl.x) / 4;
      const cy = (tl.y + tr.y + corners[2].y + bl.y) / 4;
      const qrWidthPx = Math.hypot(tr.x - tl.x, tr.y - tl.y);
      const deg = (Math.atan2(tr.y - tl.y, tr.x - tl.x) * 180) / Math.PI;
      const scale = qrWidthPx / (REF_W * QR_FRACTION);

      setTransform({ cx, cy, deg, scale });
      lastSeenRef.current = performance.now();
      setVisible(true);
    }

    async function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.videoWidth) {
        const ctx = canvas.getContext('2d');
        drawCover(ctx, video, canvas.width, canvas.height);

        try {
          if (detectorRef.current) {
            const codes = await detectorRef.current.detect(canvas);
            const match = codes.find((c) => c.rawValue?.includes(clientId));
            if (match) applyCorners(match.cornerPoints);
          } else {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code?.data?.includes(clientId)) {
              const l = code.location;
              applyCorners([l.topLeftCorner, l.topRightCorner, l.bottomRightCorner, l.bottomLeftCorner]);
            }
          }
        } catch {
          /* a single bad frame isn't worth surfacing -- just try again next frame */
        }
      }
      if (!cancelled) rafRef.current = requestAnimationFrame(tick);
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if ('BarcodeDetector' in window) {
          detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
        }
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        setCameraError(err.message || 'Camera access was denied.');
      }
    }

    start();
    return () => {
      cancelled = true;
      window.removeEventListener('resize', resizeCanvas);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [clientId]);

  // Coast briefly instead of flickering every single frame the QR drops
  // out of view (motion blur, phone angle, etc.).
  useEffect(() => {
    const id = setInterval(() => {
      if (visible && performance.now() - lastSeenRef.current > COAST_MS) setVisible(false);
    }, 150);
    return () => clearInterval(id);
  }, [visible]);

  const contactRows = [
    profile?.phone && { icon: '☎', label: profile.phone, href: `tel:${profile.phone}` },
    profile?.publicEmail && { icon: '✉', label: profile.publicEmail, href: `mailto:${profile.publicEmail}` },
  ].filter(Boolean);

  const linkFor = {
    portfolio: profile?.portfolioUrl,
    social: profile?.instagramUrl || profile?.twitterUrl,
    huntsworld: profile?.huntsworldUrl,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={videoRef} muted playsInline style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
      <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%' }} />

      {layout && profile && (
        <div
          style={{
            position: 'fixed',
            left: -REF_W / 2,
            top: -REF_H / 2,
            width: REF_W,
            height: REF_H,
            transformOrigin: '50% 50%',
            transform: transform
              ? `translate(${transform.cx}px, ${transform.cy}px) rotate(${transform.deg}deg) scale(${transform.scale})`
              : 'scale(0)',
            transition: 'transform 80ms linear, opacity 150ms',
            opacity: visible ? 1 : 0,
            pointerEvents: visible ? 'auto' : 'none',
          }}
        >
          {ELEMENTS.map((el) => {
            const pos = layout[el.key] || { x: 50, y: 50 };
            const isThumbnail = el.key === 'video' && profile.photoUrl;
            const href =
              el.key === 'contact' ? contactRows[0]?.href : linkFor[el.key] || undefined;

            const pill = isThumbnail ? (
              <img
                src={profile.photoUrl}
                alt={el.label}
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
              />
            ) : (
              el.label
            );

            const content = (
              <div
                style={
                  isThumbnail
                    ? { width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', border: `2px solid ${el.color}`, boxShadow: '0 4px 14px rgba(0,0,0,0.4)' }
                    : {
                        background: el.color,
                        color: '#fff',
                        padding: '8px 12px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                      }
                }
              >
                {pill}
              </div>
            );

            return (
              <div
                key={el.key}
                style={{
                  position: 'absolute',
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                    {content}
                  </a>
                ) : (
                  content
                )}
              </div>
            );
          })}
        </div>
      )}

      <Link
        to={`/c/${clientId}`}
        style={{
          position: 'fixed',
          top: 16,
          left: 16,
          zIndex: 20,
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.55)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          textDecoration: 'none',
        }}
        aria-label="Close AR view"
      >
        ✕
      </Link>

      {!visible && !cameraError && !loadError && (
        <div
          style={{
            position: 'fixed',
            bottom: 40,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            textAlign: 'center',
            zIndex: 10,
          }}
        >
          Point your camera at the HuntsTAG QR code
        </div>
      )}

      {(cameraError || loadError) && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: 24,
            textAlign: 'center',
            color: '#fff',
            background: 'rgba(0,0,0,0.85)',
          }}
        >
          <p style={{ maxWidth: 320 }}>
            {cameraError ? `Camera access is needed for AR: ${cameraError}` : loadError}
          </p>
          <button onClick={() => window.location.reload()} style={{ width: 'auto' }}>
            Try again
          </button>
          <Link to={`/c/${clientId}`} style={{ color: 'var(--holo-cyan, #5eead4)' }}>
            View the normal profile instead
          </Link>
        </div>
      )}
    </div>
  );
}
