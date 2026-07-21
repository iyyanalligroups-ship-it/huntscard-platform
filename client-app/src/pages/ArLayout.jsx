import { useEffect, useRef, useState } from 'react';
import { api, API_URL } from '../api.js';

/**
 * Lets a client visually position where each element appears in their
 * own HuntsAR World floating panel -- video/photo, contact info,
 * portfolio, social icons, Huntsworld link. This is the client's own
 * arrangement, separate from anyone else's -- if they've never set one,
 * it starts from the admin's default template, but saving here only
 * changes their own card, not anyone else's.
 *
 * The canvas is a flat 2D representation (percentages, 0-100 on each
 * axis) of the AR card area -- same convention the admin editor and the
 * mobile app both use, so what's dragged here maps directly and
 * predictably onto where things float in AR.
 */

const ELEMENTS = [
  { key: 'video', label: 'AR Video / Photo', color: '#8b5cf6' },
  { key: 'contact', label: 'Contact Info', color: '#14b8a6' },
  { key: 'portfolio', label: 'Portfolio', color: '#4f8ef7' },
  { key: 'social', label: 'Social Icons', color: '#ec4899' },
  { key: 'huntsworld', label: 'Huntsworld Link', color: '#f5a524' },
];

export default function ArLayout() {
  const [profile, setProfile] = useState(null);
  const [layout, setLayout] = useState(null);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [dragging, setDragging] = useState(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    api
      .getProfile()
      .then((profileData) => {
        setProfile(profileData);
        if (profileData.arEnabled) {
          return api.getMyArLayout().then(setLayout);
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  function clampPercent(v) {
    return Math.max(0, Math.min(100, v));
  }

  function positionFromEvent(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = clampPercent(((clientX - rect.left) / rect.width) * 100);
    const y = clampPercent(((clientY - rect.top) / rect.height) * 100);
    return { x: Math.round(x), y: Math.round(y) };
  }

  function handlePointerDown(key) {
    setDragging(key);
  }

  function handlePointerMove(e) {
    if (!dragging || !canvasRef.current) return;
    const pos = positionFromEvent(e);
    setLayout((prev) => ({ ...prev, [dragging]: pos }));
  }

  function handlePointerUp() {
    setDragging(null);
  }

  async function handleSave() {
    setSaveStatus('Saving...');
    setError('');
    try {
      const { video, contact, portfolio, social, huntsworld } = layout;
      const updated = await api.saveMyArLayout({ video, contact, portfolio, social, huntsworld });
      setLayout(updated);
      setSaveStatus('Saved -- this is how your card will look in HuntsAR World.');
    } catch (err) {
      setError(err.message);
      setSaveStatus('');
    }
  }

  if (error && !profile) {
    return <div className="error-banner">{error}</div>;
  }
  if (!profile) {
    return <p className="subtitle">Loading…</p>;
  }

  if (!profile.arEnabled) {
    return (
      <div>
        <h1 className="page-title">AR Layout</h1>
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '40px 24px',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 15, marginBottom: 8 }}>
            {profile.cardType
              ? <>AR isn't included in your current plan (<strong>{profile.cardType}</strong>).</>
              : "AR isn't included until you've got a card plan."}
          </p>
          <p className="subtitle" style={{ marginBottom: 24 }}>
            Upgrade to a plan with AR to get your own AR QR code and control how your video, contact info,
            and links float around it in HuntsAR World.
          </p>
          <a href="/shop">
            <button style={{ width: 'auto' }}>See plans with AR</button>
          </a>
        </div>
      </div>
    );
  }

  if (!layout) {
    return <p className="subtitle">Loading…</p>;
  }

  const qrUrl = `${API_URL}/api/public/qr/${profile.clientId}?type=ar`;

  return (
    <div>
      <h1 className="page-title">AR Layout</h1>
      <p className="subtitle">
        The QR code in the middle is the anchor a phone locks onto when scanning. Drag each block to where
        you want it to float relative to that QR — this is just for your own card.
      </p>

      <div
        ref={canvasRef}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          aspectRatio: '9 / 16',
          background:
            'repeating-linear-gradient(0deg, var(--surface-alt), var(--surface-alt) 1px, transparent 1px, transparent 10%), repeating-linear-gradient(90deg, var(--surface-alt), var(--surface-alt) 1px, transparent 1px, transparent 10%)',
          border: '2px dashed var(--border)',
          borderRadius: 'var(--radius)',
          margin: '0 0 24px',
          userSelect: 'none',
          touchAction: 'none',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 11,
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          card area (this is what a phone camera sees)
        </div>

        {/* The QR code itself -- fixed at the center, not draggable. This
            is the physical anchor a phone camera locks onto when scanning,
            so every other element's position is set relative to it, not
            to a photo that won't even be visible on the printed card. */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '30%',
            aspectRatio: '1 / 1',
            background: '#fff',
            borderRadius: 8,
            padding: '6%',
            boxShadow: 'var(--shadow-md)',
            pointerEvents: 'none',
          }}
        >
          <img src={qrUrl} alt="" style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>

        {ELEMENTS.map((el) => {
          const pos = layout[el.key] || { x: 50, y: 50 };
          return (
            <div
              key={el.key}
              onMouseDown={() => handlePointerDown(el.key)}
              onTouchStart={() => handlePointerDown(el.key)}
              style={{
                position: 'absolute',
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: 'translate(-50%, -50%)',
                background: el.color,
                color: '#fff',
                padding: '8px 12px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                cursor: dragging === el.key ? 'grabbing' : 'grab',
                boxShadow: 'var(--shadow-md)',
                whiteSpace: 'nowrap',
                zIndex: dragging === el.key ? 10 : 1,
              }}
            >
              {el.label}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
        <button onClick={handleSave} style={{ width: 'auto' }}>
          Save layout
        </button>
        {saveStatus && <span style={{ color: 'var(--holo-cyan)', fontSize: 13 }}>{saveStatus}</span>}
        {error && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</span>}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <a href={qrUrl} download={`huntstag-ar-qr-${profile.clientId}.png`}>
          <button className="secondary" style={{ width: 'auto' }}>
            Download AR QR
          </button>
        </a>
        <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          To print or share separately from your NFC tap card.
        </span>
      </div>

      <p className="hint" style={{ marginTop: 16 }}>
        Positions are percentages of the card area (0-100 on each axis), not pixels -- this keeps the
        arrangement consistent across different phone screen sizes in the AR app.
      </p>
    </div>
  );
}
