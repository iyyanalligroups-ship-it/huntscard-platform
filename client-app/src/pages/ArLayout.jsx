import { useEffect, useRef, useState } from 'react';
import { api, API_URL } from '../api.js';
import ArScanPreview from '../components/ArScanPreview.jsx';
import ArModelPreview from '../components/ArModelPreview.jsx';
import { clampHeight } from '../lib/arProjection.js';

/**
 * Lets a client visually position where each element appears in their
 * own HuntsAR World floating panel -- video/photo, contact info,
 * portfolio, social icons, Huntsworld link. This is the client's own
 * arrangement, separate from anyone else's -- if they've never set one,
 * it starts from the admin's default template, but saving here only
 * changes their own card, not anyone else's.
 *
 * Both panels below are the SAME real 3D renderer (ArScanPreview, the
 * exact Three.js/projection code the live AR view uses) -- not a flat
 * top-down mockup. Drag either one to reposition anything EXCEPT the QR
 * itself, which is fixed (not client-editable) -- every other element's
 * position is stored relative to it. Orbit either preview freely to see
 * the arrangement from any angle, same as a real phone scanning at a
 * tilt would. Rotation/height/scale for the 3D model and AR Video/Photo
 * panel live in the controls
 * section below the previews instead of on-canvas handles, since those
 * wouldn't have a fixed screen position to attach to once the model/video
 * can be viewed from any orbit angle.
 *
 * Live scanning uses ArView.jsx (QR-corner/POSIT tracking, see that
 * file), not the mind-ar whole-card engine -- the downloaded QR below
 * deliberately omits `&engine=mindar`, so only the printed QR itself
 * needs to be recognizable; the card's own design/color can be anything.
 */

export default function ArLayout() {
  const [profile, setProfile] = useState(null);
  // This client's own physical cards (see backend/models/Card.js) -- a
  // client can own several, each on a different plan/variant, so each
  // gets its OWN AR Layout arrangement + a locked shape derived from
  // whatever was actually purchased for it (see utils/cardVariant.js).
  // null while loading; [] once loaded (even if empty).
  const [cards, setCards] = useState(null);
  const [selectedCardNumber, setSelectedCardNumber] = useState(null);
  const [layout, setLayout] = useState(null);
  const [arComponents, setArComponents] = useState([]); // AR-flagged attributes (AttributeDefinition.arComponent) -- extra AR Layout panel elements
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    api.getProfile().then(setProfile).catch((err) => setError(err.message));
    api
      .getMyCards()
      .then((list) => {
        setCards(list);
        if (list.length > 0) setSelectedCardNumber(list[0].cardNumber);
      })
      .catch((err) => setError(err.message));
    api
      .getAttributeDefinitions()
      .then((all) => setArComponents(all.filter((a) => a.arComponent)))
      .catch(() => {});
  }, []);

  const selectedCard = cards?.find((c) => c.cardNumber === selectedCardNumber) || null;

  useEffect(() => {
    if (!selectedCard) return;
    setLayout(null);
    if (!selectedCard.arEnabled) return;
    // Custom AR component positions come back nested under customElements
    // (see ArLayout model) -- flattened onto the layout's own top level
    // here so every existing position handler works on a custom
    // component's key exactly like a built-in one, with zero changes to
    // that logic. Reassembled back into customElements on save, see
    // handleSave below.
    api
      .getMyArLayout(selectedCardNumber)
      .then((raw) => setLayout({ ...raw, ...(raw.customElements || {}) }))
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCardNumber, selectedCard?.arEnabled]);

  const MODEL_SCALE_MIN = 0.3;
  const MODEL_SCALE_MAX = 2.5;
  const VIDEO_SCALE_MIN = 0.3;
  // Higher ceiling than the model's own MODEL_SCALE_MAX -- the banner's
  // base size is only 15% of the card width, so it needs more headroom to
  // grow to a comparable on-card size.
  const VIDEO_SCALE_MAX = 10;

  // Explicit per-axis buttons -- easier to land on an exact angle than
  // dragging or eyeballing, and the only way to set Z (roll) at all.
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
  const VIDEO_ROTATION_KEYS = { x: 'videoRotationX', y: 'videoRotationY', z: 'videoRotationZ' };
  function adjustVideoRotation(axis, delta) {
    const key = VIDEO_ROTATION_KEYS[axis];
    setLayout((prev) => {
      const next = (prev[key] ?? 0) + delta;
      return { ...prev, [key]: axis === 'x' ? Math.max(-90, Math.min(90, next)) : next };
    });
  }

  // Height (Z) -- how far the model/video floats off the card's own
  // surface, toward the viewer. Same "- value +" button pattern as
  // rotation above (this codebase has no slider UI anywhere), but lives
  // on the position object itself (model.z / video.z) rather than a
  // separate flat key, since it's part of the same {x,y,z} the 3D Scan
  // preview reads via toLocalOffset/heightToLocalZ.
  const HEIGHT_STEP = 5;
  function adjustModelHeight(delta) {
    setLayout((prev) => ({ ...prev, model: { ...prev.model, z: clampHeight((prev.model?.z ?? 0) + delta) } }));
  }
  function adjustVideoHeight(delta) {
    setLayout((prev) => ({ ...prev, video: { ...prev.video, z: clampHeight((prev.video?.z ?? 0) + delta) } }));
  }

  // Scale -- previously only adjustable by dragging a corner-resize handle
  // on the flat editor's own model/video boxes. Now that both preview
  // panels are real 3D views (no fixed on-canvas position for a handle to
  // live at, since the model can be viewed from any orbit angle), this is
  // the only way to adjust size, so it gets the same button treatment as
  // rotation/height above rather than being dropped.
  const SCALE_STEP = 0.1;
  function adjustModelScale(delta) {
    setLayout((prev) => ({
      ...prev,
      modelScale: Math.round(Math.max(MODEL_SCALE_MIN, Math.min(MODEL_SCALE_MAX, (prev.modelScale ?? 1) + delta)) * 100) / 100,
    }));
  }
  // Width/height scale independently (matches the real Three.js plane's
  // non-uniform mesh.scale.set(scaleX, scaleY, 1) in ArView.jsx) -- the
  // old corner-drag handle changed both at once via dx/dy, but as
  // separate buttons each axis needs its own control.
  function adjustVideoScale(axis, delta) {
    const key = axis === 'x' ? 'videoScaleX' : 'videoScaleY';
    setLayout((prev) => ({
      ...prev,
      [key]: Math.round(Math.max(VIDEO_SCALE_MIN, Math.min(VIDEO_SCALE_MAX, (prev[key] ?? 1) + delta)) * 100) / 100,
    }));
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
      // Reassemble the flattened custom-component positions (see the
      // load effect above) back into the nested shape the server
      // expects -- one entry per currently-active component, pulled
      // straight off the same top-level layout keys everything else
      // reads from.
      const customElements = {};
      for (const c of arComponents) {
        if (layout[c.key]) customElements[c.key] = layout[c.key];
      }
      const updated = await api.saveMyArLayout(
        {
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
          customElements,
        },
        selectedCardNumber
      );
      setLayout({ ...updated, ...(updated.customElements || {}) });
      // Mirrors into Magic Business Card's own QR position for THIS SAME
      // physical card -- the reverse direction of the mirror
      // MagicBusinessCard.jsx's own handleSaveQrPosition already does.
      // One QR placement, not two separately-set ones that can drift
      // apart: whichever page the AR video/image/effect gets projected
      // against, it needs to line up with wherever the QR is actually
      // printed, and that's a single shared fact, not a per-page one.
      // Best-effort, same reasoning as the other direction -- Magic
      // Business Card isn't necessarily available for every plan, so a
      // failure here shouldn't block the AR Layout save that already
      // succeeded above.
      if (qr) api.saveMyMagicCardQrPosition(qr.x, qr.y, selectedCardNumber).catch(() => {});
      setSaveStatus('Saved -- this is how your card will look in HuntsAR World.');
    } catch (err) {
      setError(err.message);
      setSaveStatus('');
    }
  }


  // Small pill row -- "Card 1 · Front desk (Apex · Horizontal)" -- same
  // idea as Track.jsx/Settings.jsx's own per-card lists, just picking
  // which card's AR Layout is being edited rather than showing status.
  function CardPicker() {
    if (!cards || cards.length < 2) return null; // nothing to pick between with 0-1 cards
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 20px' }}>
        {cards.map((c) => (
          <button
            key={c.cardNumber}
            type="button"
            className={c.cardNumber === selectedCardNumber ? undefined : 'secondary'}
            style={{ width: 'auto', fontSize: 13, padding: '8px 14px' }}
            onClick={() => setSelectedCardNumber(c.cardNumber)}
          >
            Card {c.cardNumber}
            {c.label ? ` · ${c.label}` : c.variantName ? ` · ${c.variantName}` : ''}
          </button>
        ))}
      </div>
    );
  }

  if (error && !profile) {
    return <div className="error-banner">{error}</div>;
  }
  if (!profile || !cards) {
    return <p className="subtitle">Loading…</p>;
  }

  if (cards.length === 0) {
    return (
      <div>
        <h1 className="page-title">AR Layout</h1>
        <p className="subtitle">You don't have a card yet -- pick a plan to get started.</p>
        <a href="/shop">
          <button style={{ width: 'auto' }}>See plans</button>
        </a>
      </div>
    );
  }

  if (!selectedCard?.arEnabled) {
    return (
      <div>
        <h1 className="page-title">AR Layout</h1>
        <CardPicker />
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '40px 24px',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 15, marginBottom: 8 }}>
            {selectedCard?.planName
              ? <>AR isn't included in this card's plan (<strong>{selectedCard.planName}</strong>).</>
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
    return (
      <div>
        <h1 className="page-title">AR Layout</h1>
        <CardPicker />
        <p className="subtitle">Loading…</p>
      </div>
    );
  }

  // No &engine=mindar -- this deliberately opens ArView.jsx (QR-corner/
  // POSIT tracking) on scan, not the whole-card mind-ar engine, so only
  // the printed QR itself needs to be recognizable; the card's own
  // design/color is free to be anything. &transparent=1 -- no opaque
  // white box behind the QR modules, so it sits cleanly on whatever the
  // card design actually is.
  // card=N -- which PHYSICAL card this QR resolves to when scanned (see
  // backend's GET /api/public/qr/:clientId). Without this every card
  // would encode the identical QR, always landing on card #1 no matter
  // which physical card was actually tapped.
  const qrUrl = `${API_URL}/api/public/qr/${profile.clientId}?type=ar&transparent=1&card=${selectedCardNumber}`;
  // ArScanPreview reads profile.cardShape to size its 3D card mockup --
  // that field on the raw profile is really just Client.cardVariantId's
  // shape (card #1's, per the legacy mirror), so it's overridden here
  // with the SELECTED card's own locked shape instead of always showing
  // card #1's regardless of which card is actually being edited.
  //
  // Same story for the card's backdrop image: ArScanPreview reads
  // profile.cardDesignUrl (see public.js's GET /profile/:clientId, which
  // the real live scan resolves the same way) -- never profile.bannerUrl,
  // the client's own unrelated cover-photo upload. selectedCard.cardDesignUrl
  // is already THIS card's fully resolved image (its own Magic Business
  // Card override if it has one, else the checkout design, else -- for
  // every other plan -- the purchased variant's own image), same
  // resolution GET /cards worked out. Reading it straight from the
  // selected card (not re-deriving it here) is what makes two Custom
  // Cards with different Magic Business Card images actually show
  // differently in AR Layout too, instead of both falling back to the
  // one shared checkout design.
  const previewProfile = {
    ...profile,
    cardShape: selectedCard.shape,
    cardDesignUrl: selectedCard.cardDesignUrl,
    // So ArScanPreview's own QR texture (cosmetic mockup only, see that
    // file's comment) matches the SELECTED card too, not whatever
    // profile.cardNumber happened to be on the raw account-level profile.
    cardNumber: selectedCardNumber,
  };

  const panelBtnStyle = {
    width: 26,
    height: 26,
    borderRadius: '50%',
    border: 'none',
    background: 'var(--panel-border, #333)',
    color: '#fff',
    fontSize: 12,
    lineHeight: 1,
    cursor: 'pointer',
  };

  // One "label, -, value, +" row -- shared shape for every rotation/
  // height/scale control below so they all read the same way.
  function ControlRow({ label, value, onDecrement, onIncrement, decrementDisabled, incrementDisabled }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', width: 90, flexShrink: 0 }}>{label}</span>
        <button type="button" onClick={onDecrement} disabled={decrementDisabled} style={panelBtnStyle}>
          −
        </button>
        <span style={{ fontSize: 12, width: 44, textAlign: 'center' }}>{value}</span>
        <button type="button" onClick={onIncrement} disabled={incrementDisabled} style={panelBtnStyle}>
          +
        </button>
      </div>
    );
  }

  const hasVideoContent = Boolean(profile?.arBannerUrl || profile?.arVideoUrl);
  const hasModel = Boolean(profile?.arModelUrl);

  return (
    <div>
      <h1 className="page-title">AR Layout</h1>
      <CardPicker />
      <p className="subtitle">
        The QR code is the anchor a phone locks onto when scanning -- its position is fixed, not something
        you can move here. Drag anything else, in either preview below, to where you want it to float relative
        to that QR; orbit either preview (drag empty space) to check the arrangement from any angle.
      </p>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 20 }}>
        <div style={{ flex: '1 1 320px', minWidth: 260, maxWidth: 420 }}>
          <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>Layout</h3>
          <p className="hint" style={{ margin: '0 0 10px' }}>
            Drag empty space to rotate the view -- drag an icon or handle to reposition it.
          </p>
          <ArScanPreview
            profile={previewProfile}
            layout={layout}
            arComponents={arComponents}
            editable
            onDragPosition={(key, pos) => setLayout((prev) => ({ ...prev, [key]: pos }))}
          />
        </div>

        {/* Same real AR renderer as the panel on the left, a second
            independent view -- both stay in sync with the same `layout`
            state either way, so this is genuinely two simultaneous
            angles on one arrangement, not two separate configs. */}
        <div style={{ flex: '1 1 320px', minWidth: 260, maxWidth: 420 }}>
          <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>Scan preview</h3>
          <p className="hint" style={{ margin: '0 0 10px' }}>
            What a phone actually sees when it scans this card -- the real AR renderer. Drag things directly
            here too -- both panels stay in sync either way.
          </p>
          <ArScanPreview
            profile={previewProfile}
            layout={layout}
            arComponents={arComponents}
            editable
            onDragPosition={(key, pos) => setLayout((prev) => ({ ...prev, [key]: pos }))}
          />
        </div>
      </div>

      <ul className="subtitle" style={{ marginTop: 12, paddingLeft: 18 }}>
        <li>Scroll -- pans the view left/right.</li>
        <li>
          <strong>Shift</strong> + scroll -- pans up/down.
        </li>
        <li>
          <strong>Ctrl</strong> + scroll (or pinch on a trackpad) -- zooms in/out.
        </li>
        <li>Drag -- still rotates, unchanged.</li>
      </ul>

      {(hasModel || hasVideoContent) && (
        <div className="card" style={{ marginTop: 20, padding: '16px 18px', display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          {hasModel && (
            <div style={{ minWidth: 200 }}>
              <h3 style={{ fontSize: 14, margin: '0 0 10px' }}>3D Model controls</h3>
              <ControlRow
                label="Rotate left/right"
                value={`${Math.round(layout.modelRotationY ?? 0)}°`}
                onDecrement={() => adjustModelRotation('y', -ROTATE_STEP)}
                onIncrement={() => adjustModelRotation('y', ROTATE_STEP)}
              />
              <ControlRow
                label="Rotate up/down"
                value={`${Math.round(layout.modelRotationX ?? 0)}°`}
                onDecrement={() => adjustModelRotation('x', -ROTATE_STEP)}
                onIncrement={() => adjustModelRotation('x', ROTATE_STEP)}
                decrementDisabled={(layout.modelRotationX ?? 0) <= -90}
                incrementDisabled={(layout.modelRotationX ?? 0) >= 90}
              />
              <ControlRow
                label="Roll"
                value={`${Math.round(layout.modelRotationZ ?? 0)}°`}
                onDecrement={() => adjustModelRotation('z', -ROTATE_STEP)}
                onIncrement={() => adjustModelRotation('z', ROTATE_STEP)}
              />
              <ControlRow
                label="Height off card"
                value={`${layout.model?.z ?? 0}%`}
                onDecrement={() => adjustModelHeight(-HEIGHT_STEP)}
                onIncrement={() => adjustModelHeight(HEIGHT_STEP)}
                decrementDisabled={(layout.model?.z ?? 0) <= 0}
                incrementDisabled={(layout.model?.z ?? 0) >= 100}
              />
              <ControlRow
                label="Size"
                value={(layout.modelScale ?? 1).toFixed(1)}
                onDecrement={() => adjustModelScale(-SCALE_STEP)}
                onIncrement={() => adjustModelScale(SCALE_STEP)}
                decrementDisabled={(layout.modelScale ?? 1) <= MODEL_SCALE_MIN}
                incrementDisabled={(layout.modelScale ?? 1) >= MODEL_SCALE_MAX}
              />
            </div>
          )}

          {hasVideoContent && (
            <div style={{ minWidth: 200 }}>
              <h3 style={{ fontSize: 14, margin: '0 0 10px' }}>AR Video / Photo controls</h3>
              <ControlRow
                label="Rotate left/right"
                value={`${Math.round(layout.videoRotationY ?? 0)}°`}
                onDecrement={() => adjustVideoRotation('y', -ROTATE_STEP)}
                onIncrement={() => adjustVideoRotation('y', ROTATE_STEP)}
              />
              <ControlRow
                label="Rotate up/down"
                value={`${Math.round(layout.videoRotationX ?? 0)}°`}
                onDecrement={() => adjustVideoRotation('x', -ROTATE_STEP)}
                onIncrement={() => adjustVideoRotation('x', ROTATE_STEP)}
                decrementDisabled={(layout.videoRotationX ?? 0) <= -90}
                incrementDisabled={(layout.videoRotationX ?? 0) >= 90}
              />
              <ControlRow
                label="Roll"
                value={`${Math.round(layout.videoRotationZ ?? 0)}°`}
                onDecrement={() => adjustVideoRotation('z', -ROTATE_STEP)}
                onIncrement={() => adjustVideoRotation('z', ROTATE_STEP)}
              />
              <ControlRow
                label="Height off card"
                value={`${layout.video?.z ?? 0}%`}
                onDecrement={() => adjustVideoHeight(-HEIGHT_STEP)}
                onIncrement={() => adjustVideoHeight(HEIGHT_STEP)}
                decrementDisabled={(layout.video?.z ?? 0) <= 0}
                incrementDisabled={(layout.video?.z ?? 0) >= 100}
              />
              <ControlRow
                label="Width"
                value={(layout.videoScaleX ?? 1).toFixed(1)}
                onDecrement={() => adjustVideoScale('x', -SCALE_STEP)}
                onIncrement={() => adjustVideoScale('x', SCALE_STEP)}
                decrementDisabled={(layout.videoScaleX ?? 1) <= VIDEO_SCALE_MIN}
                incrementDisabled={(layout.videoScaleX ?? 1) >= VIDEO_SCALE_MAX}
              />
              <ControlRow
                label="Height"
                value={(layout.videoScaleY ?? 1).toFixed(1)}
                onDecrement={() => adjustVideoScale('y', -SCALE_STEP)}
                onIncrement={() => adjustVideoScale('y', SCALE_STEP)}
                decrementDisabled={(layout.videoScaleY ?? 1) <= VIDEO_SCALE_MIN}
                incrementDisabled={(layout.videoScaleY ?? 1) >= VIDEO_SCALE_MAX}
              />
            </div>
          )}
        </div>
      )}

      {hasModel && profile?.arModelType !== 'image' && (
        <div className="card" style={{ marginTop: 16, padding: '16px 18px' }}>
          <h3 style={{ fontSize: 14, margin: '0 0 10px' }}>3D Model preview</h3>
          <ArModelPreview
            modelUrl={profile.arModelUrl}
            modelType={profile.arModelType}
            rotationX={layout.modelRotationX ?? 0}
            rotationY={layout.modelRotationY ?? 0}
            rotationZ={layout.modelRotationZ ?? 0}
            scale={layout.modelScale ?? 1}
            height={220}
          />
          <p className="hint" style={{ marginTop: 6 }}>
            Freely orbit-able here (unlike the Layout/Scan preview panels) since this is just for checking
            the model itself, not editing its position on the card.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 24, marginBottom: 24 }}>
        <button onClick={handleSave} style={{ width: 'auto' }}>
          Save layout
        </button>
        {saveStatus && <span style={{ color: 'var(--holo-cyan)', fontSize: 13 }}>{saveStatus}</span>}
        {error && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</span>}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <a href={qrUrl} download={`huntsTAG-ar-qr-${profile.clientId}.png`}>
          <button className="secondary" style={{ width: 'auto' }}>
            Download AR QR
          </button>
        </a>
        <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          To print or share separately from your NFC tap card -- your card's own design/color can be
          anything, since scanning only needs to recognize this QR, not the whole card.
        </span>
      </div>

      <p className="hint" style={{ marginTop: 16 }}>
        Positions are percentages of the card area (0-100 on each axis), not pixels -- this keeps the
        arrangement consistent across different phone screen sizes in the AR app.
      </p>
    </div>
  );
}
