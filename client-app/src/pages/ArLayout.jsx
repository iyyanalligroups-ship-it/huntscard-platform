import { useEffect, useRef, useState } from 'react';
import '@google/model-viewer'; // registers <model-viewer>, used for the live 3D Model preview below
import { api, API_URL } from '../api.js';
import ArScanPreview from '../components/ArScanPreview.jsx';

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
// Base (unscaled) width of the AR Video/Photo card, as a fraction of the
// card's own width -- same base fraction as the QR itself, so it reads as
// a small floating object rather than a near-duplicate of the card. Must
// match VIDEO_PLANE_BASE_W's fraction in ArView.jsx (CARD_W_UNITS *
// QR_FRACTION there is the same 0.15 expressed in 3D scene units).
const VIDEO_BASE_FRACTION = QR_FRACTION;
// ISO/IEC 7810 ID-1 -- the real physical card's shape (86mm x 54mm, same
// as a credit card). Must match CARD_ASPECT in ArView.jsx and the
// canvas's own aspectRatio style below.
const CARD_ASPECT = 86 / 54;

// Tilt preview: a flat, straight-on editor can't show what a REAL tilted
// phone would do to an element positioned far from the QR (or scaled way
// up) -- the further out and bigger, the more a real camera angle
// foreshortens it, and a perfectly flat preview always hides that. This
// simulates a phone tilted `tiltDeg` degrees using genuine CSS 3D
// perspective (not a re-implementation of ArView.jsx's own projection
// math -- CSS perspective + rotateX IS a correct pinhole-camera
// projection for a flat plane, so leaning on the browser's own 3D
// rendering here is both simpler and more trustworthy than duplicating
// that math a third time). TILT_PREVIEW_DISTANCE is an assumed real-world
// viewing distance in QR-side-length units (same convention as
// MODEL_SIZE=1 in ArView.jsx) -- not a real calibration (ArView.jsx
// tracks the actual live distance instead), just close enough to make
// the preview's foreshortening look plausible for typical close-up phone
// photography.
const TILT_PREVIEW_DISTANCE = 18;
const MAX_TILT_DEG = 45;

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
  const [tiltDeg, setTiltDeg] = useState(0); // 0 = normal flat editing; >0 = read-only tilt preview, see TILT_PREVIEW_DISTANCE above
  const [cardWidthPx, setCardWidthPx] = useState(460); // measured, used to convert TILT_PREVIEW_DISTANCE into a CSS perspective() value
  const canvasRef = useRef(null);
  const modelRotateStartRef = useRef(null); // { x, y, rotX, rotY } at drag start, for the model's turntable rotation
  const videoRotateStartRef = useRef(null); // same, for the AR Video/Photo panel's own turntable rotation
  const videoResizeStartRef = useRef(null); // { x, y, scaleX, scaleY } at drag start, for the corner resize/crop handle
  const modelResizeStartRef = useRef(null); // { x, y, scale } at drag start, for the model's corner resize handle
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
  }, [layout?.modelRotationX, layout?.modelRotationY, layout?.modelRotationZ, layout?.modelScale]);

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

  // Tracks the card canvas's actual rendered width -- needed to convert
  // TILT_PREVIEW_DISTANCE (in QR-side-length units) into a real CSS
  // perspective() pixel value, so the tilt preview's foreshortening scales
  // correctly across different screen sizes instead of assuming a fixed
  // 460px canvas.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setCardWidthPx(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
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

  // Corner drag handle on the banner frame -- lets width/height be resized
  // (and therefore cropped/extended, since the media uses objectFit:
  // 'cover') directly by dragging, instead of only via the Size buttons.
  // Delta is measured as a fraction of the canvas's own size, then
  // converted into a scale change the same way VIDEO_BASE_FRACTION turns
  // scale into a width/height percentage in the render below.
  function handleVideoResizeDragStart(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    videoResizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scaleX: layout.videoScaleX ?? 1,
      scaleY: layout.videoScaleY ?? 1,
    };
  }
  function handleVideoResizeDragMove(e) {
    const start = videoResizeStartRef.current;
    if (!start || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const dxPct = (e.clientX - start.x) / rect.width;
    const dyPct = (e.clientY - start.y) / rect.height;
    setLayout((prev) => ({
      ...prev,
      videoScaleX: Math.round(Math.max(VIDEO_SCALE_MIN, Math.min(VIDEO_SCALE_MAX, start.scaleX + dxPct / VIDEO_BASE_FRACTION)) * 100) / 100,
      videoScaleY: Math.round(Math.max(VIDEO_SCALE_MIN, Math.min(VIDEO_SCALE_MAX, start.scaleY + dyPct / VIDEO_BASE_FRACTION)) * 100) / 100,
    }));
  }
  function handleVideoResizeDragEnd() {
    videoResizeStartRef.current = null;
  }

  // Same corner-drag resize as the video banner above, for the 3D model --
  // just one uniform scale instead of independent width/height, since the
  // model's own real size in AR (modelScale) is a single value, not a
  // rectangular width/height like the banner's plane.
  function handleModelResizeDragStart(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    modelResizeStartRef.current = { x: e.clientX, y: e.clientY, scale: layout.modelScale ?? 1 };
  }
  function handleModelResizeDragMove(e) {
    const start = modelResizeStartRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const next = Math.round(Math.max(MODEL_SCALE_MIN, Math.min(MODEL_SCALE_MAX, start.scale + dx / 100)) * 100) / 100;
    setLayout((prev) => ({ ...prev, modelScale: next }));
  }
  function handleModelResizeDragEnd() {
    modelResizeStartRef.current = null;
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
  // Higher ceiling than the model's own MODEL_SCALE_MAX -- the banner's
  // base size is only 15% of the card width (VIDEO_BASE_FRACTION), so it
  // needs more headroom to grow to a comparable on-card size.
  const VIDEO_SCALE_MAX = 10;
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
        videoScaleX,
        videoScaleY,
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
        videoScaleX,
        videoScaleY,
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
  const qrPos = layout.qr || { x: 50, y: 50 };
  // See TILT_PREVIEW_DISTANCE above -- converts that assumed distance
  // (QR-side-lengths) into a real CSS perspective() value using the
  // canvas's actual measured width (1 QR-side-length = QR_FRACTION of the
  // card's width, by definition).
  const tiltPerspectivePx = TILT_PREVIEW_DISTANCE * cardWidthPx * QR_FRACTION;

  return (
    <div>
      <h1 className="page-title">AR Layout</h1>
      <p className="subtitle">
        The QR code in the middle is the anchor a phone locks onto when scanning. Drag each block to where
        you want it to float relative to that QR — this is just for your own card.
      </p>

      {/* Tilt preview: read-only (dragging is disabled while tiltDeg > 0,
          since a CSS-rotated element's own bounding rect no longer maps
          to flat percentages the way positionFromEvent assumes) --
          switch it back to 0 to keep editing. See TILT_PREVIEW_DISTANCE
          above for why this exists at all. */}
      <div className="card" style={{ marginBottom: 20, padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label htmlFor="tiltPreview" style={{ margin: 0, whiteSpace: 'nowrap' }}>
            Tilt preview: {tiltDeg}°
          </label>
          <input
            id="tiltPreview"
            type="range"
            min={0}
            max={MAX_TILT_DEG}
            step={5}
            value={tiltDeg}
            onChange={(e) => setTiltDeg(Number(e.target.value))}
            style={{ flex: 1, minWidth: 140 }}
          />
          {tiltDeg > 0 && (
            <button type="button" className="secondary" style={{ width: 'auto' }} onClick={() => setTiltDeg(0)}>
              Back to editing
            </button>
          )}
        </div>
        <p className="hint" style={{ margin: '8px 0 0' }}>
          Approximates how this layout looks with a phone held at an angle, not straight-on -- elements far
          from the QR or scaled way up (like an oversized banner) can foreshorten a lot more than they
          appear here flat. Drag to edit at 0°; slide right to preview, then slide back to keep editing.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {/* Staging area behind the card -- a warm "tabletop" backdrop gives
          the same framing as an actual hand-held-card AR shot, without
          pretending to be a real camera view. This is the DRAG-TO-EDIT
          canvas -- flat CSS percentages, not a real rendering pipeline.
          The "Scan preview" column to its right (ArScanPreview) is the
          one that actually shows what a phone will see. */}
      <div
        style={{
          position: 'relative',
          flex: '1 1 460px',
          minWidth: 280,
          maxWidth: 640,
          margin: '32px 0 24px',
          padding: '210px 24px 56px',
          borderRadius: 'var(--radius)',
          background:
            'radial-gradient(ellipse at center, #d2a679 0%, #b98956 55%, #96703f 100%)',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 460,
            // perspective must live on an ANCESTOR of the rotated element
            // (the card itself, below) -- only set while previewing, so a
            // stray perspective doesn't change how anything renders at 0°.
            perspective: tiltDeg > 0 ? tiltPerspectivePx : undefined,
          }}
        >
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
              boxShadow: '0 20px 45px rgba(0,0,0,0.35)',
              // rotateX pivots around the QR's own position (transformOrigin
              // below), same "everything else is relative to wherever the
              // QR ends up" convention the rest of this editor -- and
              // ArView.jsx's real tracking -- already use.
              transform: `translate(${cardOffset.x}px, ${cardOffset.y}px)${tiltDeg > 0 ? ` rotateX(${tiltDeg}deg)` : ''}`,
              transformOrigin: tiltDeg > 0 ? `${qrPos.x}% ${qrPos.y}%` : undefined,
              userSelect: 'none',
              touchAction: 'none',
              // Elements can be dragged past the card's own edges (see
              // clampPercent above) -- don't clip them off when they are.
              overflow: 'visible',
              // Read-only while previewing -- a CSS-rotated element's own
              // bounding rect no longer maps to flat percentages the way
              // positionFromEvent assumes, so dragging is disabled instead
              // of producing wrong positions.
              pointerEvents: tiltDeg > 0 ? 'none' : 'auto',
            }}
          >
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
          // Resolution order: the one-slot "HuntsAR World Banner" field
          // (video or image), else the legacy video-only field, else the
          // general profile photo as a last resort -- must match
          // ArView.jsx's own real render exactly.
          const bannerUrl = profile?.arBannerUrl || profile?.arVideoUrl || profile?.photoUrl;
          const bannerType = profile?.arBannerUrl ? profile?.arBannerType : profile?.arVideoUrl ? 'video' : 'image';
          if (el.key === 'video' && bannerUrl) {
            const rotX = layout.videoRotationX ?? 0;
            const rotY = layout.videoRotationY ?? 0;
            const rotZ = layout.videoRotationZ ?? 0;
            const scaleX = layout.videoScaleX ?? 1;
            const scaleY = layout.videoScaleY ?? 1;
            // Width is a % of the canvas's own width, height a % of the
            // canvas's own height -- since the canvas is CSS-locked to
            // CARD_ASPECT, this reproduces the real card's proportions
            // exactly at scaleX=scaleY=1, and stretches independently
            // from there, matching the real Three.js plane's non-uniform
            // mesh.scale.set(scaleX, scaleY, 1) in ArView.jsx.
            const widthPct = VIDEO_BASE_FRACTION * 100 * scaleX;
            const heightPct = VIDEO_BASE_FRACTION * 100 * scaleY;
            const mediaStyle = {
              width: '100%',
              height: '100%',
              display: 'block',
              objectFit: 'cover',
              background: '#f4f4f4',
              border: `2px solid ${el.color}`,
              boxSizing: 'border-box',
              transform: `rotateZ(${rotZ}deg) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
            };
            // Every adjustment lives directly on the frame now -- grip to
            // move, top-bar arrows for yaw, left-edge arrows for pitch,
            // bottom-right corner drag to resize/crop, bottom-left corner
            // buttons for roll. No separate floating panel: one used to
            // sit here, but everything it did is now on the frame itself.
            const arrowBtnStyle = {
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: 'none',
              background: el.color,
              color: '#fff',
              fontSize: 10,
              lineHeight: 1,
              cursor: 'pointer',
              touchAction: 'none',
              flexShrink: 0,
            };
            const frame = (
              <div
                key={`${el.key}-frame`}
                style={{
                  position: 'absolute',
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  width: `${widthPct}%`,
                  height: `${heightPct}%`,
                  minWidth: 40,
                  minHeight: 40 / CARD_ASPECT,
                  transform: 'translate(-50%, -50%)',
                  zIndex: dragging === 'video' ? 30 : 4,
                }}
              >
                {/* Top bar: left/right arrows rotate yaw (left/right),
                    grip in the middle repositions the whole banner. */}
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    bottom: '100%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    // Above the media (next sibling) even if a heavy
                    // rotation makes the media's CSS 3D preview visually
                    // bleed outside its own box -- transforms aren't
                    // clipped to their layout bounds, so without an
                    // explicit z-index here the media could paint over
                    // this grip and make it unclickable.
                    zIndex: 2,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => adjustVideoRotation('y', -ROTATE_STEP)}
                    title="Rotate left"
                    style={arrowBtnStyle}
                  >
                    ◀
                  </button>
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
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 700,
                      textAlign: 'center',
                      cursor: dragging === 'video' ? 'grabbing' : 'grab',
                      touchAction: 'none',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ⠿ AR Video / Photo
                  </div>
                  <button
                    type="button"
                    onClick={() => adjustVideoRotation('y', ROTATE_STEP)}
                    title="Rotate right"
                    style={arrowBtnStyle}
                  >
                    ▶
                  </button>
                </div>
                {/* Left edge: up/down arrows rotate pitch (up/down). */}
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    right: '100%',
                    marginRight: 4,
                    transform: 'translateY(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    zIndex: 2,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => adjustVideoRotation('x', -ROTATE_STEP)}
                    disabled={rotX <= -90}
                    title="Rotate up"
                    style={arrowBtnStyle}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustVideoRotation('x', ROTATE_STEP)}
                    disabled={rotX >= 90}
                    title="Rotate down"
                    style={arrowBtnStyle}
                  >
                    ▼
                  </button>
                </div>
                {/* This is a CSS 3D preview, not the real Three.js render
                    HuntsAR World actually uses (same gap the 3D model's
                    own <model-viewer> preview already has) -- close
                    enough to judge the tilt while editing. */}
                <div style={{ position: 'relative', width: '100%', height: '100%', perspective: 900, zIndex: 1 }}>
                  {bannerType === 'video' ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video src={bannerUrl} autoPlay muted loop playsInline style={mediaStyle} />
                  ) : (
                    <img src={bannerUrl} alt={el.label} style={mediaStyle} />
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
                {/* Corner handle: drag to resize -- since the media uses
                    objectFit: 'cover', growing/shrinking the frame this
                    way crops into or extends the visible image/video. */}
                <div
                  onPointerDown={handleVideoResizeDragStart}
                  onPointerMove={handleVideoResizeDragMove}
                  onPointerUp={handleVideoResizeDragEnd}
                  onPointerCancel={handleVideoResizeDragEnd}
                  title="Drag to resize/crop"
                  style={{
                    position: 'absolute',
                    right: -8,
                    bottom: -8,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: '#fff',
                    border: `2px solid ${el.color}`,
                    cursor: 'nwse-resize',
                    touchAction: 'none',
                    zIndex: 3,
                  }}
                />
                {/* Bottom-left corner: roll (Z rotation) -- the one axis
                    the top/left/corner controls above don't cover. */}
                <div
                  style={{
                    position: 'absolute',
                    left: -8,
                    bottom: -8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    zIndex: 3,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => adjustVideoRotation('z', -ROTATE_STEP)}
                    title="Roll counter-clockwise"
                    style={{ ...arrowBtnStyle, width: 16, height: 16, fontSize: 9 }}
                  >
                    ↺
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustVideoRotation('z', ROTATE_STEP)}
                    title="Roll clockwise"
                    style={{ ...arrowBtnStyle, width: 16, height: 16, fontSize: 9 }}
                  >
                    ↻
                  </button>
                </div>
              </div>
            );
            return frame;
          }

          // The 3D model gets a live, orbitable preview of the actual
          // uploaded GLB instead of a text pill -- but <model-viewer>'s
          // own drag-to-orbit/pinch-to-zoom would fight with dragging the
          // panel itself to reposition it, so repositioning happens via a
          // small handle strip instead of the model body.
          if (el.key === 'model' && profile?.arModelUrl) {
            const modelIsImage = profile?.arModelType === 'image';
            const rotX = layout.modelRotationX ?? 0;
            const rotY = layout.modelRotationY ?? 0;
            const rotZ = layout.modelRotationZ ?? 0;
            const scale = layout.modelScale ?? 1;
            const modelArrowBtnStyle = {
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: 'none',
              background: el.color,
              color: '#fff',
              fontSize: 10,
              lineHeight: 1,
              cursor: 'pointer',
              touchAction: 'none',
              flexShrink: 0,
            };
            // Same frame pattern as the AR Video/Photo banner above: this
            // wrapper's box is exactly the model-viewer's own box, nothing
            // else lives in its normal flow, so translate(-50%, -50%)
            // centers it on (pos.x%, pos.y%) exactly where the real 3D
            // model gets positioned in HuntsAR World. Grip to move,
            // top-bar arrows for yaw, left-edge arrows for pitch,
            // bottom-right corner drag to scale, bottom-left corner for
            // roll -- no separate floating controls panel.
            // Base 130x130 box, scaled by the model's own saved
            // modelScale -- so dragging the corner handle actually
            // resizes the visible frame (matching the banner's crop
            // behavior above), instead of the box staying a fixed size
            // while only the model zooms invisibly small inside it.
            const modelBoxSize = 130 * scale;
            return (
              <div
                key={el.key}
                style={{
                  position: 'absolute',
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  width: modelBoxSize,
                  height: modelBoxSize,
                  minWidth: 40,
                  minHeight: 40,
                  transform: 'translate(-50%, -50%)',
                  zIndex: dragging === 'model' ? 30 : 4,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    bottom: '100%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    zIndex: 2,
                  }}
                >
                  <button type="button" onClick={() => adjustModelRotation('y', -ROTATE_STEP)} title="Rotate left" style={modelArrowBtnStyle}>
                    ◀
                  </button>
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
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 700,
                      textAlign: 'center',
                      cursor: dragging === 'model' ? 'grabbing' : 'grab',
                      touchAction: 'none',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ⠿ 3D Model
                  </div>
                  <button type="button" onClick={() => adjustModelRotation('y', ROTATE_STEP)} title="Rotate right" style={modelArrowBtnStyle}>
                    ▶
                  </button>
                </div>
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    right: '100%',
                    marginRight: 4,
                    transform: 'translateY(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    zIndex: 2,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => adjustModelRotation('x', -ROTATE_STEP)}
                    disabled={rotX <= -90}
                    title="Rotate up"
                    style={modelArrowBtnStyle}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustModelRotation('x', ROTATE_STEP)}
                    disabled={rotX >= 90}
                    title="Rotate down"
                    style={modelArrowBtnStyle}
                  >
                    ▼
                  </button>
                </div>
                {/* No camera-controls/auto-rotate here -- those would orbit
                    the *camera* around a fixed model, not the model
                    itself. Dragging directly sets orientation/scale
                    attributes, which really do change (and get saved as)
                    the model's own transform. */}
                <div style={{ position: 'relative', width: '100%', height: '100%', zIndex: 1, perspective: modelIsImage ? 900 : undefined }}>
                  {modelIsImage ? (
                    // Flat cutout image case: rendered as a real 3D plane in
                    // HuntsAR World (same technique as the AR Video/Photo
                    // banner's own image case above), so the editor preview
                    // uses the same CSS-3D-tilt approximation that panel
                    // uses too -- box sizing already carries the scale (see
                    // modelBoxSize above), so no separate scale transform
                    // here.
                    <img
                      src={profile.arModelUrl}
                      alt={el.label}
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'block',
                        objectFit: 'contain',
                        background: '#f4f4f4',
                        border: `2px solid ${el.color}`,
                        boxSizing: 'border-box',
                        transform: `rotateZ(${rotZ}deg) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
                      }}
                    />
                  ) : (
                    <model-viewer
                      ref={modelViewerRef}
                      src={profile.arModelUrl}
                      orientation={`${rotZ}deg ${rotX}deg ${rotY}deg`}
                      scale={`${scale} ${scale} ${scale}`}
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'block',
                        background: '#f4f4f4',
                        border: `2px solid ${el.color}`,
                        boxSizing: 'border-box',
                      }}
                    />
                  )}
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
                {/* Corner handle: drag to scale the model uniformly. */}
                <div
                  onPointerDown={handleModelResizeDragStart}
                  onPointerMove={handleModelResizeDragMove}
                  onPointerUp={handleModelResizeDragEnd}
                  onPointerCancel={handleModelResizeDragEnd}
                  title="Drag to resize"
                  style={{
                    position: 'absolute',
                    right: -8,
                    bottom: -8,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: '#fff',
                    border: `2px solid ${el.color}`,
                    cursor: 'nwse-resize',
                    touchAction: 'none',
                    zIndex: 3,
                  }}
                />
                {/* Bottom-left corner: roll (Z rotation). */}
                <div
                  style={{
                    position: 'absolute',
                    left: -8,
                    bottom: -8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    zIndex: 3,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => adjustModelRotation('z', -ROTATE_STEP)}
                    title="Roll counter-clockwise"
                    style={{ ...modelArrowBtnStyle, width: 16, height: 16, fontSize: 9 }}
                  >
                    ↺
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustModelRotation('z', ROTATE_STEP)}
                    title="Roll clockwise"
                    style={{ ...modelArrowBtnStyle, width: 16, height: 16, fontSize: 9 }}
                  >
                    ↻
                  </button>
                </div>
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
                      width: 68,
                      height: 68,
                      borderRadius: '50%',
                      background: el.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: dragging === el.key ? 'grabbing' : 'grab',
                      boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
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
      </div>

      {/* The scan preview -- reuses the real AR renderer (ArScanPreview,
          same Three.js/projection code ArView.jsx uses) instead of the
          flat editor's CSS approximation above, so this genuinely shows
          what a phone will see, not just a relative-position guess.
          Updates live as `layout` changes above. */}
      <div style={{ flex: '0 1 320px', minWidth: 260, margin: '32px 0 24px' }}>
        <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>Scan preview</h3>
        <p className="hint" style={{ margin: '0 0 10px' }}>
          What a phone actually sees when it scans this card, straight-on -- the real AR renderer, not the
          flat editor. Updates live as you drag things on the left.
        </p>
        <ArScanPreview profile={profile} layout={layout} />
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
