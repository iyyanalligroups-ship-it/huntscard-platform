import { useEffect, useRef, useState } from 'react';
import '@google/model-viewer'; // registers <model-viewer>, used for the live 3D Model preview below
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

// How much of the card's width the QR box takes up -- must match
// QR_FRACTION in ArView.jsx, since that's what turns these saved
// percentages into real on-camera positions relative to the QR.
const QR_FRACTION = 0.15;
// ISO/IEC 7810 ID-1 -- the real physical card's shape (86mm x 54mm, same
// as a credit card). Must match CARD_ASPECT in ArView.jsx and the
// canvas's own aspectRatio style below.
const CARD_ASPECT = 86 / 54;

// Keyed per client since the same browser could be used to edit more than
// one card -- this is a per-device editing preference, not part of the
// layout that gets saved to the server.
const CARD_OFFSET_STORAGE_PREFIX = 'huntstag-ar-layout-card-offset:';

const ELEMENTS = [
  { key: 'video', label: 'AR Video / Photo', color: '#8b5cf6' },
  { key: 'contact', label: 'Contact Info', color: '#14b8a6' },
  { key: 'portfolio', label: 'Portfolio', color: '#4f8ef7' },
  { key: 'social', label: 'Social Icons', color: '#ec4899' },
  { key: 'huntsworld', label: 'Huntsworld Link', color: '#f5a524' },
  { key: 'model', label: '3D Model', color: '#22d3ee' },
];

export default function ArLayout() {
  const [profile, setProfile] = useState(null);
  const [layout, setLayout] = useState(null);
  const [icons, setIcons] = useState({}); // admin-managed logo per attribute -- see ArIcon model, read-only here
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [dragging, setDragging] = useState(null);
  const [cardOffset, setCardOffset] = useState({ x: 0, y: 0 }); // px, purely local -- repositions the editor's own canvas on the page, not saved
  const canvasRef = useRef(null);
  const modelRotateStartRef = useRef(null); // { x, y, rotX, rotY } at drag start, for the model's turntable rotation
  const videoRotateStartRef = useRef(null); // same, for the AR Video/Photo panel's own turntable rotation
  const cardMoveStartRef = useRef(null); // { x, y, offsetX, offsetY } at drag start, for moving the whole card
  const modelViewerRef = useRef(null);

  // @google/model-viewer has a bug: its own internal handler for the
  // orientation/scale attributes unconditionally touches AR-session state
  // that's null outside an actual AR session, throwing before it reaches
  // the line that actually schedules a re-render -- so the transform is
  // applied internally but the canvas never redraws. updateFraming() is a
  // separate, unrelated public method that also ends up requesting a
  // render, so calling it right after nudges model-viewer into actually
  // drawing the new orientation/scale.
  useEffect(() => {
    modelViewerRef.current?.updateFraming?.();
  }, [layout?.modelRotationX, layout?.modelRotationY, layout?.modelScale]);

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
    api
      .getPublicArIcons()
      .then(setIcons)
      .catch(() => {});
  }, []);

  // Restore where this device last left the card box, once we know which
  // client's editor this is.
  useEffect(() => {
    if (!profile?.clientId) return;
    try {
      const saved = localStorage.getItem(CARD_OFFSET_STORAGE_PREFIX + profile.clientId);
      if (saved) setCardOffset(JSON.parse(saved));
    } catch {
      // ignore malformed/unavailable storage
    }
  }, [profile?.clientId]);

  // Elements aren't confined to the printed card -- in AR they can float
  // in the space around it too, so the drag range extends well past the
  // card's own 0-100 edges. Must match POSITION_MIN/MAX in the backend's
  // ArLayout model (validation would otherwise reject an off-card save).
  const POSITION_MIN = -60;
  const POSITION_MAX = 160;
  function clampPercent(v) {
    return Math.max(POSITION_MIN, Math.min(POSITION_MAX, v));
  }

  function positionFromEvent(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = clampPercent(((e.clientX - rect.left) / rect.width) * 100);
    const y = clampPercent(((e.clientY - rect.top) / rect.height) * 100);
    return { x: Math.round(x), y: Math.round(y) };
  }

  // Pointer Events (not separate mouse/touch handlers) -- unifies
  // mouse/touch/pen, and setPointerCapture keeps move/up events targeted
  // at this element even once the pointer strays outside its small hit
  // area mid-drag, which plain onMouseMove/onTouchMove on the container
  // was prone to losing on fast drags.
  function handlePointerDown(key, e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
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

  // Turntable-style rotation for the 3D model -- drag left/right spins it
  // (yaw), drag up/down tips it (pitch). This is a SEPARATE drag target
  // from the model panel's own reposition handle, and deliberately not
  // <model-viewer>'s built-in camera-controls: that orbits the *camera*
  // around a fixed model, which wouldn't actually change the model's own
  // saved orientation the way this needs to.
  const ROTATE_SENSITIVITY = 0.5; // degrees per pixel dragged
  function handleModelRotateStart(e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    modelRotateStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      rotX: layout.modelRotationX ?? 0,
      rotY: layout.modelRotationY ?? 0,
    };
  }
  function handleModelRotateMove(e) {
    const start = modelRotateStartRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    setLayout((prev) => ({
      ...prev,
      modelRotationY: start.rotY + dx * ROTATE_SENSITIVITY,
      // Clamped -- past +/-90 the model would start flipping upside down, which never looks intentional.
      modelRotationX: Math.max(-90, Math.min(90, start.rotX + dy * ROTATE_SENSITIVITY)),
    }));
  }
  function handleModelRotateEnd() {
    modelRotateStartRef.current = null;
  }

  // Arrow keys nudge the same rotation dragging does -- much easier to
  // land on an exact angle than eyeballing a drag. Hold Shift for a finer
  // 1deg step instead of the default 5deg. Only fires while the model
  // preview itself has focus (click it first), so arrow keys don't hijack
  // page scroll the rest of the time.
  const ROTATE_KEY_STEP = 5;
  const ROTATE_KEY_STEP_FINE = 1;
  function handleModelRotateKeyDown(e) {
    const step = e.shiftKey ? ROTATE_KEY_STEP_FINE : ROTATE_KEY_STEP;
    let dYaw = 0;
    let dPitch = 0;
    if (e.key === 'ArrowLeft') dYaw = -step;
    else if (e.key === 'ArrowRight') dYaw = step;
    else if (e.key === 'ArrowUp') dPitch = -step;
    else if (e.key === 'ArrowDown') dPitch = step;
    else return;
    e.preventDefault();
    setLayout((prev) => ({
      ...prev,
      modelRotationY: (prev.modelRotationY ?? 0) + dYaw,
      modelRotationX: Math.max(-90, Math.min(90, (prev.modelRotationX ?? 0) + dPitch)),
    }));
  }

  // Same turntable-drag + arrow-key rotation as the 3D model above, for
  // the AR Video/Photo panel.
  function handleVideoRotateStart(e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    videoRotateStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      rotX: layout.videoRotationX ?? 0,
      rotY: layout.videoRotationY ?? 0,
    };
  }
  function handleVideoRotateMove(e) {
    const start = videoRotateStartRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    setLayout((prev) => ({
      ...prev,
      videoRotationY: start.rotY + dx * ROTATE_SENSITIVITY,
      videoRotationX: Math.max(-90, Math.min(90, start.rotX + dy * ROTATE_SENSITIVITY)),
    }));
  }
  function handleVideoRotateEnd() {
    videoRotateStartRef.current = null;
  }
  function handleVideoRotateKeyDown(e) {
    const step = e.shiftKey ? ROTATE_KEY_STEP_FINE : ROTATE_KEY_STEP;
    let dYaw = 0;
    let dPitch = 0;
    if (e.key === 'ArrowLeft') dYaw = -step;
    else if (e.key === 'ArrowRight') dYaw = step;
    else if (e.key === 'ArrowUp') dPitch = -step;
    else if (e.key === 'ArrowDown') dPitch = step;
    else return;
    e.preventDefault();
    setLayout((prev) => ({
      ...prev,
      videoRotationY: (prev.videoRotationY ?? 0) + dYaw,
      videoRotationX: Math.max(-90, Math.min(90, (prev.videoRotationX ?? 0) + dPitch)),
    }));
  }

  // Moving the whole white card around the page -- a separate drag handle
  // outside the canvas's own bounds (not on the canvas itself), so it
  // can't collide with dragging the QR/elements/model inside it. This is
  // purely where the editor puts the card on YOUR screen, not part of the
  // saved AR layout (it has no meaning on another device's differently-
  // sized window) -- so it's remembered in this browser's localStorage
  // instead of going through Save Layout / the backend.
  function persistCardOffset(next) {
    setCardOffset(next);
    if (profile?.clientId) {
      try {
        localStorage.setItem(CARD_OFFSET_STORAGE_PREFIX + profile.clientId, JSON.stringify(next));
      } catch {
        // localStorage unavailable (private browsing etc.) -- fine, just won't persist
      }
    }
  }
  function handleCardMoveStart(e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    cardMoveStartRef.current = { x: e.clientX, y: e.clientY, offsetX: cardOffset.x, offsetY: cardOffset.y };
  }
  function handleCardMoveMove(e) {
    const start = cardMoveStartRef.current;
    if (!start) return;
    persistCardOffset({ x: start.offsetX + (e.clientX - start.x), y: start.offsetY + (e.clientY - start.y) });
  }
  function handleCardMoveEnd() {
    cardMoveStartRef.current = null;
  }
  function resetCardPosition() {
    persistCardOffset({ x: 0, y: 0 });
  }

  const MODEL_SCALE_MIN = 0.3;
  const MODEL_SCALE_MAX = 2.5;
  function adjustModelScale(delta) {
    setLayout((prev) => {
      const current = prev.modelScale ?? 1;
      const next = Math.round(Math.max(MODEL_SCALE_MIN, Math.min(MODEL_SCALE_MAX, current + delta)) * 100) / 100;
      return { ...prev, modelScale: next };
    });
  }

  // Explicit per-axis buttons, same "- value +" pattern as scale above --
  // easier to land on an exact angle than dragging or eyeballing arrow-key
  // presses, and the only way to set Z (roll) at all, since dragging only
  // ever covered X/Y.
  const ROTATE_STEP = 5;
  const ROTATION_KEYS = { x: 'modelRotationX', y: 'modelRotationY', z: 'modelRotationZ' };
  function adjustModelRotation(axis, delta) {
    const key = ROTATION_KEYS[axis];
    setLayout((prev) => {
      const next = (prev[key] ?? 0) + delta;
      // Only pitch (X) is clamped -- past +/-90 it starts flipping upside
      // down, which never looks intentional. Yaw/roll wrap freely.
      return { ...prev, [key]: axis === 'x' ? Math.max(-90, Math.min(90, next)) : next };
    });
  }

  // Same X/Y/Z rotate + scale controls as the 3D model above, for the AR
  // Video/Photo panel -- it's rendered as a real 3D card in HuntsAR World
  // once a video or photo exists, so it gets the same orientation/resize
  // treatment.
  const VIDEO_SCALE_MIN = 0.3;
  const VIDEO_SCALE_MAX = 2.5;
  function adjustVideoScale(delta) {
    setLayout((prev) => {
      const current = prev.videoScale ?? 1;
      const next = Math.round(Math.max(VIDEO_SCALE_MIN, Math.min(VIDEO_SCALE_MAX, current + delta)) * 100) / 100;
      return { ...prev, videoScale: next };
    });
  }
  const VIDEO_ROTATION_KEYS = { x: 'videoRotationX', y: 'videoRotationY', z: 'videoRotationZ' };
  function adjustVideoRotation(axis, delta) {
    const key = VIDEO_ROTATION_KEYS[axis];
    setLayout((prev) => {
      const next = (prev[key] ?? 0) + delta;
      return { ...prev, [key]: axis === 'x' ? Math.max(-90, Math.min(90, next)) : next };
    });
  }

  async function handleSave() {
    setSaveStatus('Saving...');
    setError('');
    try {
      const {
        qr,
        video,
        contact,
        portfolio,
        social,
        huntsworld,
        model,
        modelRotationX,
        modelRotationY,
        modelRotationZ,
        modelScale,
        videoRotationX,
        videoRotationY,
        videoRotationZ,
        videoScale,
      } = layout;
      const updated = await api.saveMyArLayout({
        qr,
        video,
        contact,
        portfolio,
        social,
        huntsworld,
        model,
        modelRotationX,
        modelRotationY,
        modelRotationZ,
        modelScale,
        videoRotationX,
        videoRotationY,
        videoRotationZ,
        videoScale,
      });
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

      <div style={{ position: 'relative', width: '100%', maxWidth: 720, margin: '0 0 24px' }}>
        {/* Grip handle for moving the whole white card around the page --
            deliberately OUTSIDE the card's own bounds, not on the card
            itself, so it can't collide with dragging the QR/elements/model
            that live inside it. */}
        <div
          onPointerDown={handleCardMoveStart}
          onPointerMove={handleCardMoveMove}
          onPointerUp={handleCardMoveEnd}
          onPointerCancel={handleCardMoveEnd}
          title="Drag to move the whole card"
          style={{
            position: 'absolute',
            top: -14,
            left: -14,
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: '#f5a524',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            cursor: 'grab',
            touchAction: 'none',
            userSelect: 'none',
            zIndex: 20,
            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
          }}
        >
          ⠿
        </div>
        {(cardOffset.x !== 0 || cardOffset.y !== 0) && (
          <button
            type="button"
            className="secondary"
            onClick={resetCardPosition}
            style={{ position: 'absolute', top: -14, right: 0, width: 'auto', fontSize: 11, padding: '3px 10px', zIndex: 20 }}
          >
            Reset position
          </button>
        )}
        <div
          ref={canvasRef}
          style={{
            position: 'relative',
            width: '100%',
            // The full-width page column left a card that was much bigger
            // than the content actually needs -- cap it back down to a
            // reasonable size instead of stretching edge to edge.
            maxWidth: 720,
            // Matches the real physical card -- ISO/IEC 7810 ID-1 (86mm x
            // 54mm, standard credit-card size, same as the actual NFC tap
            // card) -- the QR gets printed on an actual card that shape,
            // so the editor needs to match it, not a paper business card
            // (3.5in x 2in, what this used to be set to) or an arbitrary
            // phone-screen shape.
            aspectRatio: '86 / 54',
            // A real card is white, not a dark placeholder grid -- this is
            // what actually gets printed, so the editor should look like it.
            background: '#fff',
            border: '2px solid #f5a524',
            borderRadius: 'var(--radius)',
            transform: `translate(${cardOffset.x}px, ${cardOffset.y}px)`,
            userSelect: 'none',
            touchAction: 'none',
            // Elements can be dragged past the card's own edges (see
            // clampPercent above) -- don't clip them off when they are.
            overflow: 'visible',
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
            color: 'rgba(0, 0, 0, 0.4)', // dark text -- the canvas itself is now a white card, not the dark theme
            fontFamily: 'var(--font-mono)',
          }}
        >
          card area (this is what a phone camera sees)
        </div>

        {/* The QR code itself -- draggable, same as every other element.
            This is the physical anchor a phone camera locks onto when
            scanning, so its position here should match where it's
            actually printed on the real card; every other element's
            position is interpreted relative to wherever this ends up,
            not a fixed center. */}
        {(() => {
          const qrPos = layout.qr || { x: 50, y: 50 };
          return (
            <div
              onPointerDown={(e) => handlePointerDown('qr', e)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              title="QR code"
              style={{
                position: 'absolute',
                left: `${qrPos.x}%`,
                top: `${qrPos.y}%`,
                transform: 'translate(-50%, -50%)',
                width: `${QR_FRACTION * 100}%`,
                aspectRatio: '1 / 1',
                cursor: dragging === 'qr' ? 'grabbing' : 'grab',
                touchAction: 'none',
                userSelect: 'none',
                zIndex: dragging === 'qr' ? 10 : 1,
              }}
            >
              <img src={qrUrl} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} />
            </div>
          );
        })()}

        {ELEMENTS.map((el) => {
          const pos = layout[el.key] || { x: 50, y: 50 };
          // Admin-uploaded logo (see ArIcon model) -- only relevant once
          // there's no real media/model to show instead, same as the
          // plain text label it replaces.
          const iconUrl = icons?.[el.key];

          // The AR Video/Photo panel gets a real, rotatable/resizable
          // preview of whichever media the client uploaded (video takes
          // priority over a plain photo, matching HuntsAR World's own
          // priority) -- shaped like the real card, since it's rendered
          // as an actual 3D card there, not a flat billboard. Same
          // reposition-via-handle-strip pattern as the 3D model below,
          // since the panel body itself is now a drag-to-rotate target.
          if (el.key === 'video' && (profile?.arVideoUrl || profile?.photoUrl)) {
            const rotX = layout.videoRotationX ?? 0;
            const rotY = layout.videoRotationY ?? 0;
            const rotZ = layout.videoRotationZ ?? 0;
            const scale = layout.videoScale ?? 1;
            const previewW = 160;
            const previewH = previewW / CARD_ASPECT;
            const rotateRow = (axis, label, value) => (
              <div key={axis} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.5)', width: 10, textAlign: 'center' }}>{label}</span>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => adjustVideoRotation(axis, -ROTATE_STEP)}
                  disabled={axis === 'x' && value <= -90}
                  style={{ width: 22, height: 22, padding: 0, fontSize: 13, lineHeight: 1 }}
                >
                  −
                </button>
                <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.5)', minWidth: 34, textAlign: 'center' }}>
                  {Math.round(value)}°
                </span>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => adjustVideoRotation(axis, ROTATE_STEP)}
                  disabled={axis === 'x' && value >= 90}
                  style={{ width: 22, height: 22, padding: 0, fontSize: 13, lineHeight: 1 }}
                >
                  +
                </button>
              </div>
            );
            const mediaStyle = {
              width: previewW,
              height: previewH,
              display: 'block',
              objectFit: 'cover',
              background: '#f4f4f4',
              border: `2px solid ${el.color}`,
              borderTop: 'none',
              transform: `rotateZ(${rotZ}deg) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(${scale})`,
            };
            return (
              <div
                key={el.key}
                style={{
                  position: 'absolute',
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  transform: 'translate(-50%, -50%)',
                  width: previewW,
                  zIndex: dragging === 'video' ? 10 : 1,
                }}
              >
                <div
                  onPointerDown={(e) => handlePointerDown('video', e)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  title="Drag to reposition"
                  style={{
                    background: el.color,
                    color: '#fff',
                    padding: '4px 10px',
                    borderRadius: '999px 999px 0 0',
                    fontSize: 11,
                    fontWeight: 700,
                    textAlign: 'center',
                    cursor: dragging === 'video' ? 'grabbing' : 'grab',
                    touchAction: 'none',
                    userSelect: 'none',
                  }}
                >
                  ⠿ AR Video / Photo
                </div>
                {/* This is a CSS 3D preview, not the real Three.js render
                    HuntsAR World actually uses (same gap the 3D model's
                    own <model-viewer> preview already has) -- close
                    enough to judge the tilt while editing. */}
                <div style={{ position: 'relative', width: previewW, height: previewH, perspective: 500 }}>
                  {profile.arVideoUrl ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video src={profile.arVideoUrl} autoPlay muted loop playsInline style={mediaStyle} />
                  ) : (
                    <img src={profile.photoUrl} alt={el.label} style={mediaStyle} />
                  )}
                  {/* A transparent overlay, not handlers on the media element
                      itself -- same reasoning as the 3D model's own overlay
                      below (a <video>/<img> can swallow pointer events in
                      ways a plain <div> doesn't). */}
                  <div
                    onPointerDown={handleVideoRotateStart}
                    onPointerMove={handleVideoRotateMove}
                    onPointerUp={handleVideoRotateEnd}
                    onPointerCancel={handleVideoRotateEnd}
                    onKeyDown={handleVideoRotateKeyDown}
                    tabIndex={0}
                    title="Drag, or click then use arrow keys, to rotate"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      cursor: 'grab',
                      touchAction: 'none',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 }}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => adjustVideoScale(-0.1)}
                    disabled={scale <= VIDEO_SCALE_MIN}
                    style={{ width: 26, height: 26, padding: 0, fontSize: 14, lineHeight: 1 }}
                  >
                    −
                  </button>
                  <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.5)', minWidth: 32, textAlign: 'center' }}>
                    {Math.round(scale * 100)}%
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => adjustVideoScale(0.1)}
                    disabled={scale >= VIDEO_SCALE_MAX}
                    style={{ width: 26, height: 26, padding: 0, fontSize: 14, lineHeight: 1 }}
                  >
                    +
                  </button>
                </div>
                {rotateRow('x', 'X', rotX)}
                {rotateRow('y', 'Y', rotY)}
                {rotateRow('z', 'Z', rotZ)}
                <p style={{ margin: '2px 0 0', fontSize: 10, textAlign: 'center', color: 'rgba(0,0,0,0.4)' }}>
                  Drag or click + arrow keys to rotate (hold Shift for finer steps) — grip to move
                </p>
              </div>
            );
          }

          // The 3D model gets a live, orbitable preview of the actual
          // uploaded GLB instead of a text pill -- but <model-viewer>'s
          // own drag-to-orbit/pinch-to-zoom would fight with dragging the
          // panel itself to reposition it, so repositioning happens via a
          // small handle strip instead of the model body.
          if (el.key === 'model' && profile?.arModelUrl) {
            const rotX = layout.modelRotationX ?? 0;
            const rotY = layout.modelRotationY ?? 0;
            const rotZ = layout.modelRotationZ ?? 0;
            const scale = layout.modelScale ?? 1;
            const rotateRow = (axis, label, value) => (
              <div key={axis} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.5)', width: 10, textAlign: 'center' }}>{label}</span>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => adjustModelRotation(axis, -ROTATE_STEP)}
                  disabled={axis === 'x' && value <= -90}
                  style={{ width: 22, height: 22, padding: 0, fontSize: 13, lineHeight: 1 }}
                >
                  −
                </button>
                <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.5)', minWidth: 34, textAlign: 'center' }}>
                  {Math.round(value)}°
                </span>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => adjustModelRotation(axis, ROTATE_STEP)}
                  disabled={axis === 'x' && value >= 90}
                  style={{ width: 22, height: 22, padding: 0, fontSize: 13, lineHeight: 1 }}
                >
                  +
                </button>
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
                  width: 140,
                  zIndex: dragging === 'model' ? 10 : 1,
                }}
              >
                <div
                  onPointerDown={(e) => handlePointerDown('model', e)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  title="Drag to reposition"
                  style={{
                    background: el.color,
                    color: '#fff',
                    padding: '4px 10px',
                    borderRadius: '999px 999px 0 0',
                    fontSize: 11,
                    fontWeight: 700,
                    textAlign: 'center',
                    cursor: dragging === 'model' ? 'grabbing' : 'grab',
                    touchAction: 'none',
                    userSelect: 'none',
                  }}
                >
                  ⠿ 3D Model
                </div>
                {/* No camera-controls/auto-rotate here -- those would orbit
                    the *camera* around a fixed model, not the model
                    itself. Dragging directly sets orientation/scale
                    attributes, which really do change (and get saved as)
                    the model's own transform. */}
                <div style={{ position: 'relative', width: 140, height: 140 }}>
                  <model-viewer
                    ref={modelViewerRef}
                    src={profile.arModelUrl}
                    orientation={`${rotZ}deg ${rotX}deg ${rotY}deg`}
                    scale={`${scale} ${scale} ${scale}`}
                    style={{
                      width: 140,
                      height: 140,
                      display: 'block',
                      background: '#f4f4f4',
                      border: `2px solid ${el.color}`,
                      borderTop: 'none',
                    }}
                  />
                  {/* A transparent overlay, not handlers on <model-viewer>
                      itself -- model-viewer's own shadow-DOM canvas swallows
                      pointer events before a listener attached directly to
                      the custom element reliably sees them, which is what
                      broke rotate/zoom last round. This div sits on top and
                      owns the gesture instead. */}
                  <div
                    onPointerDown={handleModelRotateStart}
                    onPointerMove={handleModelRotateMove}
                    onPointerUp={handleModelRotateEnd}
                    onPointerCancel={handleModelRotateEnd}
                    onKeyDown={handleModelRotateKeyDown}
                    tabIndex={0}
                    title="Drag, or click then use arrow keys, to rotate"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      cursor: 'grab',
                      touchAction: 'none',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 }}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => adjustModelScale(-0.1)}
                    disabled={scale <= MODEL_SCALE_MIN}
                    style={{ width: 26, height: 26, padding: 0, fontSize: 14, lineHeight: 1 }}
                  >
                    −
                  </button>
                  <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.5)', minWidth: 32, textAlign: 'center' }}>
                    {Math.round(scale * 100)}%
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => adjustModelScale(0.1)}
                    disabled={scale >= MODEL_SCALE_MAX}
                    style={{ width: 26, height: 26, padding: 0, fontSize: 14, lineHeight: 1 }}
                  >
                    +
                  </button>
                </div>
                {rotateRow('x', 'X', rotX)}
                {rotateRow('y', 'Y', rotY)}
                {rotateRow('z', 'Z', rotZ)}
                <p style={{ margin: '2px 0 0', fontSize: 10, textAlign: 'center', color: 'rgba(0,0,0,0.4)' }}>
                  Drag or click + arrow keys to rotate (hold Shift for finer steps) — grip to move
                </p>
              </div>
            );
          }

          return (
            <div
              key={el.key}
              onPointerDown={(e) => handlePointerDown(el.key, e)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              title={el.label}
              style={
                iconUrl
                  ? {
                      position: 'absolute',
                      left: `${pos.x}%`,
                      top: `${pos.y}%`,
                      transform: 'translate(-50%, -50%)',
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      background: el.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: dragging === el.key ? 'grabbing' : 'grab',
                      boxShadow: 'var(--shadow-md)',
                      touchAction: 'none',
                      userSelect: 'none',
                      zIndex: dragging === el.key ? 10 : 1,
                    }
                  : {
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
                      touchAction: 'none',
                      userSelect: 'none',
                      zIndex: dragging === el.key ? 10 : 1,
                    }
              }
            >
              {iconUrl ? (
                <img
                  src={iconUrl}
                  alt={el.label}
                  draggable={false}
                  style={{ width: '60%', height: '60%', objectFit: 'contain', pointerEvents: 'none' }}
                />
              ) : (
                el.label
              )}
            </div>
          );
        })}
        </div>
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
