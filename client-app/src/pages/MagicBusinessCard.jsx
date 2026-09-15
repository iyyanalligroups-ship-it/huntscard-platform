import { useEffect, useRef, useState } from 'react';
import { api, API_URL } from '../api.js';
import CropBox from '../components/CropBox.jsx';
import MagicHoverPreview from '../components/MagicHoverPreview.jsx';
import { composeCardWithQr } from '../lib/cardComposite.js';

const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

// Real physical business card, 85 x 55mm either way -- 'vertical' is the
// exact same card turned 90°, not an independent shape. Pixel target at
// 300dpi (85/25.4*300 ≈ 1004, 55/25.4*300 ≈ 650) for the actual upload
// crop; a smaller DISPLAY size (below) for what's shown on screen while
// editing. Mirrors admin-app's ClientDetail.jsx Magic Business Card
// section exactly (same numbers), since both apps can now edit the same
// card and should look/behave identically while doing it.
const CARD_MM = { width: 85, height: 55 };
const CARD_UPLOAD_SIZES = {
  horizontal: { width: 1004, height: 650 },
  vertical: { width: 650, height: 1004 },
};
const CARD_PREVIEW_LONG_SIDE = 280;

// AR component editor -- the 3 rectangular buttons MagicCamera.jsx shows
// 3D-anchored to this card (see that file's own pillLayoutRef). Their
// default positions float just BELOW the card (y > 100), matching the
// reference layout this was modeled on, so the preview box below needs
// extra vertical room past the card image itself to drag into -- 180
// means "0-100 is on the card, 100-180 is the floating space below it".
const COMPONENT_Y_MAX = 180;
// Same idea horizontally -- buttons can float beside the card too, not
// just on top of it or below it. 0-100 is still "across the card" (same
// convention MagicCamera.jsx's toLocal expects, and what's already saved
// for existing positions); this just widens the DRAG AREA so -50..150 is
// reachable, giving 50 percentage-points of float space on each side.
const COMPONENT_X_MIN = -50;
const COMPONENT_X_MAX = 150;
const COMPONENT_X_RANGE = COMPONENT_X_MAX - COMPONENT_X_MIN;
// MagicCamera.jsx's live AR video plane is drawn slightly BIGGER than the
// card itself (OVERSCAN = 1.06 there, to hide a sliver of real card
// otherwise peeking past a slightly-off tracked edge) -- this flat 2D
// preview shows the card at its true 0-100 bounds with no such bleed, so
// a button placed just past the edge here can still end up overlapping
// the live video. Same 3-percentage-point margin, drawn as a guide line
// below, so "clear of the dashed line" here actually means "clear of the
// video" live too.
const COMPONENT_OVERSCAN_PCT = 3;
// A button dragged to somewhere between "on the card" and "clearly past
// the overscan line" (COMPONENT_OVERSCAN_PCT) still visually overlaps the
// live video, since the button itself has real on-screen width/height,
// not just a single point -- the dashed guide line alone still let this
// happen in practice (see the "Huntsworld"/"Call, Portfolio, Social"
// overlap reports). Snapping the drag straight past this whole margin
// the moment it crosses the card's own edge removes the judgment call
// entirely -- dragging onto the card (0-100) is unaffected and stays
// exactly where dropped, only the narrow just-past-the-edge strip is
// skipped.
const COMPONENT_SAFE_MARGIN_PCT = 12;
function snapPastCardEdge(value) {
  if (value > 100 && value < 100 + COMPONENT_SAFE_MARGIN_PCT) return 100 + COMPONENT_SAFE_MARGIN_PCT;
  if (value < 0 && value > -COMPONENT_SAFE_MARGIN_PCT) return -COMPONENT_SAFE_MARGIN_PCT;
  return value;
}
const COMPONENT_DEFS = [
  { key: 'contact', label: 'Call' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'social', label: 'Social' },
  { key: 'huntsworld', label: 'Huntsworld' },
];

// `imageWidth`/`imageHeight` (the ACTUAL uploaded image's real pixel
// size, if one exists) take priority over the assumed 85x55mm shape --
// mind-ar tracks the real image's own real proportions, whatever they
// are, not what this card's design was "supposed" to be cropped to,
// so every position editor (QR, AR components) needs to match THAT
// real shape or percentages land in a different relative spot live
// than they appeared while dragging here. Falls back to the assumed
// card shape only when there's no image yet to measure.
function cardBoxSize(cardType, imageWidth, imageHeight) {
  const assumedRatio = cardType === 'vertical' ? CARD_MM.height / CARD_MM.width : CARD_MM.width / CARD_MM.height;
  const ratio = imageWidth && imageHeight ? imageWidth / imageHeight : assumedRatio;
  const width = ratio < 1 ? CARD_PREVIEW_LONG_SIDE * ratio : CARD_PREVIEW_LONG_SIDE;
  const height = ratio < 1 ? CARD_PREVIEW_LONG_SIDE : CARD_PREVIEW_LONG_SIDE / ratio;
  return { width, height, borderRadius: Math.round(width * (3.2 / CARD_MM.width)) };
}

// The card's design image is derived now (a purchased variant's own
// front image, or Custom Card's checkout design -- see
// backend/utils/cardVariant.js), never a client upload here, so there's
// no File to read natural dimensions from anymore. Loads them from the
// resolved URL instead -- needed for the preview box's true aspect ratio
// and for locking the video crop to match it (mind-ar tracks the real
// image's real proportions live, not an assumed card shape).
function loadImageDimsFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not read the card image'));
    img.src = url;
  });
}

// Custom Card only (see card.requiresDesignUpload) -- every other plan's
// image is derived, never a client upload, see backend/utils/cardVariant.js.
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = url;
  });
}

// Crops to the SAME print-resolution target CARD_UPLOAD_SIZES already
// defines for this card's shape, same idea as handleDownloadImage's own
// rounded-corner canvas redraw just without the rounding (that's applied
// on download, not on the stored upload).
function cropImageToBlob(img, crop, targetWidth, targetHeight) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(
      img,
      crop.x * img.naturalWidth,
      crop.y * img.naturalHeight,
      crop.width * img.naturalWidth,
      crop.height * img.naturalHeight,
      0,
      0,
      targetWidth,
      targetHeight
    );
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('Could not process that image'));
      resolve(blob);
    }, 'image/jpeg', 0.92);
  });
}

function loadVideoFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.onloadedmetadata = () => resolve({ video, url, width: video.videoWidth, height: video.videoHeight });
    video.onerror = () => reject(new Error('Could not read that video'));
    video.src = url;
  });
}

function initialCropForAspect(naturalWidth, naturalHeight, aspectRatio) {
  const heightIfFullWidth = naturalWidth / (naturalHeight * aspectRatio);
  if (heightIfFullWidth <= 1) {
    return { x: 0, y: (1 - heightIfFullWidth) / 2, width: 1, height: heightIfFullWidth };
  }
  const widthIfFullHeight = (naturalHeight * aspectRatio) / naturalWidth;
  return { x: (1 - widthIfFullHeight) / 2, y: 0, width: widthIfFullHeight, height: 1 };
}

// Self-service Magic Business Card editor -- design your own card image
// and AR video (see backend/models/MagicBusinessCard.js), choose when it
// goes live. Admin can ALSO edit the exact same card from the admin
// app's ClientDetail.jsx -- both write to the same doc/files, neither
// overrides the other, whoever touches it last wins (same as any shared
// record). Distinct from Magic Camera (now public at /magic-camera),
// which scans the shared, admin-curated Magic Art gallery, not this
// personal card.
export default function MagicBusinessCard() {
  // This client's own physical cards (see backend/models/Card.js) -- a
  // client can own several, each on a different plan/variant, so each
  // gets its OWN Magic Business Card (video + AR component layout).
  // null while loading; [] once loaded (even if empty).
  const [cards, setCards] = useState(null);
  const [selectedCardNumber, setSelectedCardNumber] = useState(null);
  const [card, setCard] = useState(null); // the selected card's MagicBusinessCard doc -- null while (re)loading
  // Natural pixel size of card.imageUrl, loaded client-side once it
  // resolves -- see loadImageDimsFromUrl's own comment for why this
  // replaced reading card.imageWidth/imageHeight directly.
  const [imageDims, setImageDims] = useState(null);
  const [clientId, setClientId] = useState(null); // this client's own id -- fetched, not read from localStorage, so it's never stale
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cropSession, setCropSession] = useState(null); // { field: 'video', url, naturalWidth, naturalHeight, aspectRatio, crop, file }
  // Admin-defined custom Magic components (see AttributeDefinition.magicComponent)
  // -- same idea as ArLayout.jsx's own arComponents, filtered for this
  // separate system instead. Their VALUES are the client's own profile
  // fields (edited in Profile Settings, same place any custom attribute
  // is), only their positions are set here.
  const [magicComponents, setMagicComponents] = useState([]);

  const videoInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const previewBoxRef = useRef(null); // the card-preview container the QR position is measured relative to
  const [draggingQr, setDraggingQr] = useState(false);
  const [qrSaveStatus, setQrSaveStatus] = useState('');
  // QR print colors -- same idea as admin's ClientDetail.jsx color
  // pickers, needed here for a real reason, not just parity: a
  // transparent-background QR composited onto a busy multi-color design
  // (see the card preview) can end up unscannable, since a real QR
  // reader needs reliable contrast between its dark/light modules, not
  // whatever happens to be underneath. Defaults to a solid white
  // background (transparent OFF) for exactly that reason -- opting into
  // transparent is a deliberate choice now, not the default that broke
  // scanning.
  const [qrFg, setQrFg] = useState('#000000');
  const [qrBg, setQrBg] = useState('#ffffff');
  const [qrTransparentBg, setQrTransparentBg] = useState(false);

  // AR component (contact/portfolio/social) positions -- own preview box,
  // own drag state, own save action, entirely independent of the QR's
  // above (and of the main AR Layout system's positions -- see
  // handleSaveComponentPositions).
  const componentsBoxRef = useRef(null);
  const [draggingComponentKey, setDraggingComponentKey] = useState(null);
  const [componentSaveStatus, setComponentSaveStatus] = useState('');

  useEffect(() => {
    api
      .getMyCards()
      .then((list) => {
        setCards(list);
        if (list.length > 0) setSelectedCardNumber(list[0].cardNumber);
      })
      .catch((err) => setError(err.message));
    api
      .getProfile()
      .then((p) => setClientId(p.clientId))
      .catch(() => {});
    api
      .getAttributeDefinitions()
      .then((all) => setMagicComponents(all.filter((a) => a.magicComponent)))
      .catch(() => {});
  }, []);

  const selectedCard = cards?.find((c) => c.cardNumber === selectedCardNumber) || null;

  useEffect(() => {
    if (!selectedCardNumber) return;
    setCard(null);
    // Apex (and any other magicEnabled: false plan) doesn't get Magic
    // Business Card at all -- same gate ArLayout.jsx applies for its own
    // arEnabled, see the render-time check below. Skipping the fetch here
    // too avoids implicitly creating a MagicBusinessCard doc (see admin's
    // findOrCreateMagicCard) for a card that was never meant to have one.
    if (!selectedCard?.magicEnabled) return;
    api
      .getMyMagicCard(selectedCardNumber)
      .then(setCard)
      .catch((err) => setError(err.message));
  }, [selectedCardNumber, selectedCard?.magicEnabled]);

  // Loads the resolved design image's real pixel size once it's known --
  // needed both for the preview box's true aspect ratio and for locking
  // the video crop to match it. Re-runs whenever the selected card (and
  // therefore its image) changes.
  useEffect(() => {
    if (!card?.imageUrl) {
      setImageDims(null);
      return;
    }
    let cancelled = false;
    loadImageDimsFromUrl(card.imageUrl)
      .then((dims) => { if (!cancelled) setImageDims(dims); })
      .catch(() => { if (!cancelled) setImageDims(null); });
    return () => {
      cancelled = true;
    };
  }, [card?.imageUrl]);

  // Plain 2D pointer drag over the flat preview image (not the 3D
  // raycasting drag the AR Layout editor needs) -- this is just a
  // percentage position on a static image, so a simple bounding-rect
  // calculation is enough.
  function qrPercentFromEvent(e) {
    if (!previewBoxRef.current) return { x: 78, y: 80 };
    const rect = previewBoxRef.current.getBoundingClientRect();
    const halfQrWFrac = (qrBoxSize / 2 / rect.width) * 100;
    const halfQrHFrac = (qrBoxSize / 2 / rect.height) * 100;
    const minX = Math.ceil(halfQrWFrac);
    const maxX = Math.floor(100 - halfQrWFrac);
    const minY = Math.ceil(halfQrHFrac);
    const maxY = Math.floor(100 - halfQrHFrac);

    const rawX = ((e.clientX - rect.left) / rect.width) * 100;
    const rawY = ((e.clientY - rect.top) / rect.height) * 100;

    return {
      x: Math.round(Math.max(minX, Math.min(maxX, rawX))),
      y: Math.round(Math.max(minY, Math.min(maxY, rawY))),
    };
  }
  function handleQrDragStart(e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingQr(true);
  }
  function handleQrDragMove(e) {
    if (!draggingQr) return;
    const pos = qrPercentFromEvent(e);
    setCard((prev) => ({ ...prev, qrPosition: pos }));
    setQrSaveStatus('');
  }
  // Dragging only updates the on-screen position locally -- nothing is
  // sent to the server until "Save position" (below) is clicked
  // explicitly, so it's clear exactly when a placement is actually saved
  // (and therefore what a later download will include).
  function handleQrDragEnd() {
    setDraggingQr(false);
  }
  async function handleSaveQrPosition() {
    setQrSaveStatus('Saving...');
    setError('');
    try {
      const updatedQr = await api.saveMyMagicCardQrPosition(qrPos.x, qrPos.y, selectedCardNumber);
      setCard((prev) => ({ ...prev, ...updatedQr }));
      // Also mirrors into the main AR Layout system's own qr position for
      // THIS SAME physical card (see ArLayout.jsx / arTargetImage.js) --
      // one QR placement, not two separately-set ones that can drift
      // apart. Sent as a partial update (just the qr field), so it can't
      // clobber any of that card's other saved AR Layout positions.
      // Best-effort: AR Layout isn't necessarily part of every plan, so a
      // failure here (e.g. AR not included) shouldn't block the Magic
      // Business Card save that already succeeded above.
      api.saveMyArLayout({ qr: { x: qrPos.x, y: qrPos.y } }, selectedCardNumber).catch(() => {});
      setQrSaveStatus('Saved.');
    } catch (err) {
      setQrSaveStatus('');
      setError(err.message);
    }
  }

  // The 3 built-in components have their own dedicated fields
  // (card.componentPositions); admin-defined custom ones (see
  // AttributeDefinition.magicComponent) live in card.magicElements
  // instead -- same "own fields + dynamic Map for the rest" split the
  // backend uses. These two helpers hide that split from the drag/save
  // logic below, which just wants "the position for this key."
  function isBuiltinComponent(key) {
    return COMPONENT_DEFS.some((d) => d.key === key);
  }
  function getComponentPosition(key) {
    return card?.componentPositions?.[key] || card?.magicElements?.[key] || { x: 50, y: 120, z: 0, rotation: 0 };
  }
  function setComponentPosition(key, patch) {
    setCard((prev) => {
      if (isBuiltinComponent(key)) {
        return { ...prev, componentPositions: { ...prev.componentPositions, [key]: { ...prev.componentPositions?.[key], ...patch } } };
      }
      return { ...prev, magicElements: { ...prev.magicElements, [key]: { ...prev.magicElements?.[key], ...patch } } };
    });
    setComponentSaveStatus('');
  }

  // Same plain 2D pointer-drag technique as the QR above, but over a
  // TALLER and WIDER box (see COMPONENT_Y_MAX / COMPONENT_X_MIN/MAX)
  // since these buttons can float beside or below the card, not just on
  // it -- x clamps to COMPONENT_X_MIN..COMPONENT_X_MAX and y clamps to
  // 0-COMPONENT_Y_MAX, both still expressed as "percent of the card's own
  // width/height" (0-100 = on the card), just allowed outside that range.
  function componentPercentFromEvent(e) {
    const rect = componentsBoxRef.current.getBoundingClientRect();
    const xFrac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const yFrac = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return {
      x: Math.round(snapPastCardEdge(COMPONENT_X_MIN + xFrac * COMPONENT_X_RANGE)),
      y: Math.round(snapPastCardEdge(yFrac * COMPONENT_Y_MAX)),
    };
  }
  function handleComponentDragStart(key, e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingComponentKey(key);
  }
  function handleComponentDragMove(e) {
    if (!draggingComponentKey) return;
    const pos = componentPercentFromEvent(e);
    setComponentPosition(draggingComponentKey, { x: pos.x, y: pos.y });
  }
  function handleComponentDragEnd() {
    setDraggingComponentKey(null);
  }
  // Height (Z) -- how far the button floats off the card's own surface,
  // toward the viewer, same "-value+" button pattern the main AR Layout
  // system uses for the model/video panel's own height.
  function adjustComponentHeight(key, delta) {
    const current = getComponentPosition(key);
    const nextZ = Math.max(0, Math.min(100, (current.z ?? 0) + delta));
    setComponentPosition(key, { z: nextZ });
  }
  // In-plane tilt, degrees -- wraps around rather than clamping, since
  // there's no reason a full spin should ever be blocked.
  function adjustComponentRotation(key, delta) {
    const current = getComponentPosition(key);
    let nextRotation = (current.rotation ?? 0) + delta;
    if (nextRotation > 180) nextRotation -= 360;
    if (nextRotation < -180) nextRotation += 360;
    setComponentPosition(key, { rotation: nextRotation });
  }
  // One save action for all of them (built-in + custom) -- simpler than a
  // separate save per button, and they're usually adjusted together in
  // one pass anyway.
  async function handleSaveComponentPositions() {
    setComponentSaveStatus('Saving...');
    setError('');
    try {
      const allKeys = [...COMPONENT_DEFS.map((d) => d.key), ...magicComponents.map((c) => c.key)];
      await Promise.all(
        allKeys.map((key) => {
          const pos = getComponentPosition(key);
          return api.saveMyMagicCardComponentPosition(key, pos.x ?? 50, pos.y ?? 120, pos.z ?? 0, pos.rotation ?? 0, selectedCardNumber);
        })
      );
      setComponentSaveStatus('Saved.');
    } catch (err) {
      setComponentSaveStatus('');
      setError(err.message);
    }
  }

  async function handlePickImage(file) {
    if (!file) return;
    setError('');
    if (file.size > MAX_IMAGE_BYTES) {
      setError('That image is over 50MB -- pick a smaller one.');
      return;
    }
    try {
      const { img, url, width, height } = await loadImageFromFile(file);
      const targetSize = CARD_UPLOAD_SIZES[card?.cardType === 'vertical' ? 'vertical' : 'horizontal'];
      const aspectRatio = targetSize.width / targetSize.height;
      setCropSession({
        field: 'image',
        url,
        naturalWidth: width,
        naturalHeight: height,
        aspectRatio,
        crop: initialCropForAspect(width, height, aspectRatio),
        file,
        img,
      });
    } catch (err) {
      setError(err.message);
    }
  }

  async function handlePickVideo(file) {
    if (!file) return;
    setError('');
    if (file.size > MAX_VIDEO_BYTES) {
      setError('That video is over 80MB -- pick a smaller one.');
      return;
    }
    if (!imageDims) {
      setError('This card has no design image to match yet.');
      return;
    }
    try {
      const { url, width, height } = await loadVideoFromFile(file);
      const aspectRatio = imageDims.width / imageDims.height;
      setCropSession({
        field: 'video',
        url,
        naturalWidth: width,
        naturalHeight: height,
        aspectRatio,
        crop: initialCropForAspect(width, height, aspectRatio),
        file,
      });
    } catch (err) {
      setError(err.message);
    }
  }

  function closeCropSession() {
    if (cropSession) URL.revokeObjectURL(cropSession.url);
    setCropSession(null);
  }

  async function handleConfirmCrop() {
    const session = cropSession;
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      let updated;
      if (session.field === 'image') {
        const targetSize = CARD_UPLOAD_SIZES[card?.cardType === 'vertical' ? 'vertical' : 'horizontal'];
        const blob = await cropImageToBlob(session.img, session.crop, targetSize.width, targetSize.height);
        updated = await api.uploadMyMagicCardImage(blob, targetSize.width, targetSize.height, selectedCardNumber);
      } else {
        updated = await api.uploadMyMagicCardVideo(session.file, session.crop, selectedCardNumber);
      }
      // Merge onto the existing state rather than replacing it wholesale
      // -- the server always returns the full current card, so this is
      // normally a no-op, but it means a response that's ever missing a
      // field it didn't actually touch (a stray/overlapping request, a
      // flaky connection) can't silently wipe already-known-good data
      // like `imageUrl`, which several OTHER sections on this page key
      // their visibility off of.
      setCard((prev) => ({ ...prev, ...updated }));
      closeCropSession();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleActive() {
    setBusy(true);
    setError('');
    try {
      const updated = card?.active
        ? await api.deactivateMyMagicCard(selectedCardNumber)
        : await api.activateMyMagicCard(selectedCardNumber);
      setCard((prev) => ({ ...prev, ...updated }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Fetch-as-blob rather than a plain <a href download> -- the image is
  // served from the backend's own origin (:4000), not client-app's
  // (:5173), and browsers silently ignore the download attribute for
  // cross-origin links. Same pattern admin-app's ClientDetail.jsx uses
  // for its own "download to print and test-scan" button.
  //
  // The raw uploaded file is a plain rectangle -- the rounded corners in
  // the on-screen preview are just CSS border-radius on the container,
  // never baked into the pixels, so a direct download came out sharp-
  // cornered. Redrawn onto a canvas through a rounded-rect clip instead,
  // at the SAME physical corner radius cardBoxSize uses for the preview
  // (3.2mm, standard card-corner radius), scaled up to the full
  // print-resolution image -- then exported as PNG so the rounded
  // corners are real transparency, not just a display effect. Pixel
  // dimensions are already the true card size (CARD_UPLOAD_SIZES is
  // 85x55mm at 300dpi), this only changes the corners.
  async function handleDownloadImage() {
    if (!card?.imageUrl) return;
    setBusy(true);
    setError('');
    try {
      // Same compositing DashboardHome.jsx's hero card preview now uses
      // (see cardComposite.js), so both show literally the same image.
      const canvas = await composeCardWithQr({ imageUrl: card.imageUrl, qrUrl, qrPos });
      const roundedBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const url = URL.createObjectURL(roundedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `huntstag-magic-business-card-${card.cardType || 'card'}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveVideo() {
    setBusy(true);
    setError('');
    try {
      const updated = await api.removeMyMagicCardVideo(selectedCardNumber);
      setCard((prev) => ({ ...prev, ...updated }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Custom Card only -- clears this override, falling back to the
  // checkout design again (see backend/routes/profile.js's
  // serializeMyMagicCard), not to no image outright.
  async function handleRemoveImage() {
    setBusy(true);
    setError('');
    try {
      const updated = await api.removeMyMagicCardImage(selectedCardNumber);
      setCard((prev) => ({ ...prev, ...updated }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Small pill row -- "Card 1 · Front desk (Apex · Horizontal)" -- same
  // idea as ArLayout.jsx's own picker, just choosing which card's Magic
  // Business Card is being edited.
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

  if (!cards) return <p className="subtitle">Loading…</p>;

  if (cards.length === 0) {
    return (
      <div>
        <h1>Magic Business Card</h1>
        <p className="subtitle">You don't have a card yet -- pick a plan to get started.</p>
        <a href="/shop">
          <button style={{ width: 'auto' }}>See plans</button>
        </a>
      </div>
    );
  }

  if (!selectedCard?.magicEnabled) {
    return (
      <div>
        <h1>Magic Business Card</h1>
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
            {selectedCard?.planName ? (
              <>Magic Business Card isn't included in this card's plan (<strong>{selectedCard.planName}</strong>).</>
            ) : (
              "Magic Business Card isn't included until you've got a card plan."
            )}
          </p>
          <a href="/shop">
            <button style={{ width: 'auto' }}>See plans</button>
          </a>
        </div>
      </div>
    );
  }

  if (!card && !error) {
    return (
      <div>
        <h1>Magic Business Card</h1>
        <CardPicker />
        <p className="subtitle">Loading…</p>
      </div>
    );
  }

  const box = cardBoxSize(card?.cardType, imageDims?.width, imageDims?.height);
  const canActivate = Boolean(card?.available && card?.videoUrl);
  // Built-in (Call/Portfolio/Social) + admin-defined custom Magic
  // components, merged into one list for the editor below.
  const allComponentDefs = [...COMPONENT_DEFS, ...magicComponents.map((c) => ({ key: c.key, label: c.label }))];
  // Same clientId AR QR as the AR Layout page -- one QR now, not a
  // separate one per effect (see PublicProfile.jsx's "choose AR or
  // Magic" screen). fg/bg/transparent are the color pickers below --
  // solid by default (not transparent) so the QR stays scannable
  // regardless of how busy the card design underneath it is.
  const qrColorParams = `fg=${qrFg.slice(1)}&bg=${qrBg.slice(1)}${qrTransparentBg ? '&transparent=1' : ''}`;
  // card=N -- which PHYSICAL card this QR actually resolves to when
  // scanned (see backend's GET /api/public/qr/:clientId). Without this
  // every one of a client's cards would print/show the exact same QR,
  // which would always land on card #1 regardless of which physical
  // card was actually tapped -- the bug that made scanning Card 2/3 show
  // "no Magic effect set up" even after activating the right one.
  const qrUrl = clientId ? `${API_URL}/api/public/qr/${clientId}?type=ar&card=${selectedCardNumber}&${qrColorParams}` : null;
  const qrPos = card?.qrPosition || { x: 78, y: 80 };
  // ~21.2mm real QR size (see arTargetImage.js's own derivation), as a
  // fraction of THIS card's short side (55mm) -- same "N% of the card's
  // short side" convention used for the main AR system's tracking target,
  // so the QR reads as a consistent, familiar size across both.
  const qrBoxSize = Math.round(Math.min(box.width, box.height) * (21.2 / 55));

  return (
    <div>
      <h1>Magic Business Card</h1>
      <CardPicker />
      <p className="subtitle">
        {card?.available
          ? "Your card's design, an AR video that plays on it, and where the AR buttons float."
          : "Magic Business Card isn't available for this card yet."}
      </p>

      {error && <div className="error-banner">{error}</div>}

      {qrUrl && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 700 }}>Scan QR</p>
          <p className="hint" style={{ margin: '0 0 12px' }}>
            The same QR as your AR Layout page -- scanning it lets people choose between this Magic effect
            and your HuntsAR World AR components.
          </p>

          {/* QR colors -- a transparent QR composited onto a busy design
              (see the card preview below) can lose the contrast a real
              scanner needs. Pick colors that actually stay readable
              against your specific card. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              Foreground
              <input type="color" value={qrFg} onChange={(e) => setQrFg(e.target.value)} style={{ width: 32, height: 24, padding: 0, border: 'none' }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              Background
              <input
                type="color"
                value={qrBg}
                disabled={qrTransparentBg}
                onChange={(e) => setQrBg(e.target.value)}
                style={{ width: 32, height: 24, padding: 0, border: 'none', opacity: qrTransparentBg ? 0.4 : 1 }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={qrTransparentBg} onChange={(e) => setQrTransparentBg(e.target.checked)} />
              Transparent background
            </label>
          </div>

          <img
            src={qrUrl}
            alt="Your AR QR"
            style={{ width: 160, height: 160, border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }}
          />
          <div style={{ marginTop: 10 }}>
            <a href={qrUrl} download={`huntstag-ar-qr-${clientId}.png`}>
              <button type="button" className="secondary" style={{ width: 'auto', fontSize: 12, padding: '6px 14px' }}>
                Download QR only
              </button>
            </a>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {card?.active ? (
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent, #22c55e)', border: '1px solid var(--accent, #22c55e)', borderRadius: 999, padding: '2px 8px' }}>
              Live -- visible now
            </span>
          ) : (
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', border: '1px solid var(--panel-border)', borderRadius: 999, padding: '2px 8px' }}>
              Draft -- not live yet
            </span>
          )}
          <button
            type="button"
            className="secondary"
            disabled={busy || (!card?.active && !canActivate)}
            title={!card?.active && !canActivate ? 'Add both an image and a video first' : undefined}
            style={{ width: 'auto', fontSize: 12, padding: '6px 14px', marginLeft: 'auto' }}
            onClick={handleToggleActive}
          >
            {card?.active ? 'Take offline' : 'Go live'}
          </button>
        </div>

        <p style={{ margin: '0 0 8px', fontWeight: 700 }}>Card type</p>
        <p className="hint" style={{ margin: '0 0 8px' }}>
          Real business card size either way (85 x 55mm) -- locked to whatever you actually purchased for this
          card, not something you choose here.
        </p>
        <p style={{ margin: '0 0 20px', fontSize: 13, fontWeight: 700, textTransform: 'capitalize' }}>
          {card?.cardType || '—'}
        </p>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: cropSession ? 20 : 0 }}>
          <div style={{ width: box.width }}>
            <p className="hint" style={{ margin: '0 0 8px' }}>
              Card preview{card?.videoUrl ? ' -- hover to see the video' : ''}
              {card?.imageUrl && qrUrl ? ', drag the QR to place it' : ''}
            </p>
            {card?.imageUrl ? (
              <div ref={previewBoxRef} style={{ position: 'relative', width: box.width, height: box.height, overflow: 'hidden', borderRadius: box.borderRadius }}>
                <MagicHoverPreview
                  imageUrl={card.imageUrl}
                  videoUrl={card.videoUrl}
                  videoCrop={card.videoCrop}
                  alt="Your Magic Business Card"
                  style={{ borderRadius: box.borderRadius, boxShadow: '0 10px 24px rgba(0,0,0,0.35)' }}
                />
                {/* Draggable QR placement -- position saved via
                    api.saveMyMagicCardQrPosition on release, then baked
                    directly into the printable download at this same
                    spot (see handleDownloadImage) instead of shipping as
                    a separate file the client has to place themselves. */}
                {qrUrl && (
                  <img
                    src={qrUrl}
                    alt="AR QR -- drag to reposition"
                    onPointerDown={handleQrDragStart}
                    onPointerMove={handleQrDragMove}
                    onPointerUp={handleQrDragEnd}
                    onPointerCancel={handleQrDragEnd}
                    style={{
                      position: 'absolute',
                      left: `${qrPos.x}%`,
                      top: `${qrPos.y}%`,
                      transform: 'translate(-50%, -50%)',
                      width: qrBoxSize,
                      height: qrBoxSize,
                      background: '#fff',
                      borderRadius: 4,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                      cursor: draggingQr ? 'grabbing' : 'grab',
                      touchAction: 'none',
                      userSelect: 'none',
                    }}
                  />
                )}
              </div>
            ) : null}
            {card?.imageUrl && qrUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  title="Save the QR's current position"
                  style={{ width: 'auto', fontSize: 12, padding: '6px 14px' }}
                  onClick={handleSaveQrPosition}
                >
                  Save position
                </button>
                {qrSaveStatus && <span className="hint" style={{ margin: 0 }}>{qrSaveStatus}</span>}
              </div>
            )}
            {card?.imageUrl && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                title="Download the card image, with the QR baked in where you placed it, at true business-card size/shape to print"
                style={{ width: 'auto', fontSize: 12, padding: '6px 14px', marginTop: 10 }}
                onClick={handleDownloadImage}
              >
                Download card (with QR)
              </button>
            )}
            {!card?.imageUrl && (
              <div style={{ position: 'relative', width: box.width, height: box.height, borderRadius: box.borderRadius, overflow: 'hidden', background: '#000' }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 12 }}>
                  <span className="hint" style={{ margin: 0 }}>
                    Magic Business Card isn't available for this card yet.
                  </span>
                </div>
              </div>
            )}
          </div>

          {cropSession && (
            <div style={{ border: '2px solid var(--holo-cyan)', borderRadius: 'var(--radius)', padding: 16 }}>
              <p style={{ margin: '0 0 10px', fontWeight: 700 }}>{cropSession.field === 'image' ? 'Crop the image' : 'Crop the video'}</p>
              <CropBox
                naturalWidth={cropSession.naturalWidth}
                naturalHeight={cropSession.naturalHeight}
                aspectRatio={cropSession.aspectRatio}
                crop={cropSession.crop}
                onCropChange={(crop) => setCropSession((s) => ({ ...s, crop }))}
              >
                {cropSession.field === 'image' ? (
                  <img src={cropSession.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }} />
                ) : (
                  <video src={cropSession.url} muted style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }} />
                )}
              </CropBox>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="button" disabled={busy} style={{ width: 'auto' }} onClick={handleConfirmCrop}>
                  {busy ? 'Uploading…' : 'Confirm crop'}
                </button>
                <button type="button" className="secondary" style={{ width: 'auto' }} onClick={closeCropSession}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {card?.imageUrl && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 700 }}>AR components</p>
          <p className="hint" style={{ margin: '0 0 12px' }}>
            Call, Portfolio, Social, and any extra fields admin has marked for Magic -- shown as rectangular
            buttons that float with your card when someone scans it in Magic mode. Same underlying info as
            your AR Layout page, but this arrangement is its own, not shared with it. Drag to place anywhere
            around the card (left, right, above, below), use the height buttons to lift a button off the
            card toward the viewer (watch it grow closer as you do), then save. The dashed line marks where
            the live AR video actually extends to (slightly past the card's own edge) -- dragging a button
            past the card automatically clears that strip, so it can't end up overlapping the video live.
          </p>
          <div
            ref={componentsBoxRef}
            style={{
              position: 'relative',
              width: Math.round(box.width * (COMPONENT_X_RANGE / 100)),
              height: Math.round(box.height * (COMPONENT_Y_MAX / 100)),
              margin: '0 auto',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: Math.round(box.width * (-COMPONENT_X_MIN / 100)),
                width: box.width,
                height: box.height,
                borderRadius: box.borderRadius,
                overflow: 'hidden',
              }}
            >
              <img src={card.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
            {/* Guide only, matches MagicCamera.jsx's real video-plane
                overscan (see COMPONENT_OVERSCAN_PCT above) -- not itself
                draggable or saved. */}
            <div
              style={{
                position: 'absolute',
                left: `${((-COMPONENT_OVERSCAN_PCT - COMPONENT_X_MIN) / COMPONENT_X_RANGE) * 100}%`,
                top: `${(-COMPONENT_OVERSCAN_PCT / COMPONENT_Y_MAX) * 100}%`,
                width: `${((100 + 2 * COMPONENT_OVERSCAN_PCT) / COMPONENT_X_RANGE) * 100}%`,
                height: `${((100 + 2 * COMPONENT_OVERSCAN_PCT) / COMPONENT_Y_MAX) * 100}%`,
                border: '1px dashed rgba(255,255,255,0.5)',
                borderRadius: box.borderRadius,
                pointerEvents: 'none',
              }}
            />
            {allComponentDefs.map(({ key, label }) => {
              const pos = getComponentPosition(key);
              const z = pos.z ?? 0;
              const rotation = pos.rotation ?? 0;
              // Height (Z) has no literal 3D perspective in this flat
              // preview, so it's simulated instead -- the button grows
              // and its shadow deepens as z increases, giving the same
              // "lifting toward you" feedback the live AR view gives,
              // right when the height buttons below are clicked.
              const scale = 1 + z / 150;
              return (
                <div
                  key={key}
                  onPointerDown={(e) => handleComponentDragStart(key, e)}
                  onPointerMove={handleComponentDragMove}
                  onPointerUp={handleComponentDragEnd}
                  onPointerCancel={handleComponentDragEnd}
                  style={{
                    position: 'absolute',
                    left: `${((pos.x - COMPONENT_X_MIN) / COMPONENT_X_RANGE) * 100}%`,
                    top: `${(pos.y / COMPONENT_Y_MAX) * 100}%`,
                    transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`,
                    zIndex: draggingComponentKey === key ? 5 : Math.round(z),
                    padding: '6px 12px',
                    background: '#2563eb',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    borderRadius: 4,
                    whiteSpace: 'nowrap',
                    boxShadow: `0 ${2 + z / 6}px ${8 + z / 3}px rgba(0,0,0,${0.3 + z / 250})`,
                    cursor: draggingComponentKey === key ? 'grabbing' : 'grab',
                    touchAction: 'none',
                    userSelect: 'none',
                  }}
                >
                  {label}
                </div>
              );
            })}
          </div>

          <p className="hint" style={{ margin: '16px 0 6px' }}>Height (toward the viewer)</p>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {allComponentDefs.map(({ key, label }) => {
              const z = getComponentPosition(key)?.z ?? 0;
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)', width: 60 }}>{label}</span>
                  <button
                    type="button"
                    className="secondary"
                    disabled={z <= 0}
                    style={{ width: 26, height: 26, borderRadius: '50%', padding: 0, fontSize: 12 }}
                    onClick={() => adjustComponentHeight(key, -5)}
                  >
                    −
                  </button>
                  <span style={{ fontSize: 12, width: 36, textAlign: 'center' }}>{z}%</span>
                  <button
                    type="button"
                    className="secondary"
                    disabled={z >= 100}
                    style={{ width: 26, height: 26, borderRadius: '50%', padding: 0, fontSize: 12 }}
                    onClick={() => adjustComponentHeight(key, 5)}
                  >
                    +
                  </button>
                </div>
              );
            })}
          </div>

          <p className="hint" style={{ margin: '16px 0 6px' }}>Rotation</p>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {allComponentDefs.map(({ key, label }) => {
              const rotation = getComponentPosition(key)?.rotation ?? 0;
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)', width: 60 }}>{label}</span>
                  <button
                    type="button"
                    className="secondary"
                    style={{ width: 26, height: 26, borderRadius: '50%', padding: 0, fontSize: 12 }}
                    onClick={() => adjustComponentRotation(key, -15)}
                  >
                    −
                  </button>
                  <span style={{ fontSize: 12, width: 36, textAlign: 'center' }}>{rotation}°</span>
                  <button
                    type="button"
                    className="secondary"
                    style={{ width: 26, height: 26, borderRadius: '50%', padding: 0, fontSize: 12 }}
                    onClick={() => adjustComponentRotation(key, 15)}
                  >
                    +
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
            <button type="button" className="secondary" disabled={busy} style={{ width: 'auto', fontSize: 12, padding: '6px 14px' }} onClick={handleSaveComponentPositions}>
              Save component positions
            </button>
            {componentSaveStatus && <span className="hint" style={{ margin: 0 }}>{componentSaveStatus}</span>}
          </div>
        </div>
      )}

      {card?.requiresDesignUpload && !card?.isSpecialEdition && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 700 }}>Image</p>
              <p className="hint" style={{ margin: '2px 0 0' }}>
                Max 50MB. Overrides the design uploaded at checkout just for this Magic effect -- cropped to
                the {card?.cardType || 'card'} shape.
              </p>
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => handlePickImage(e.target.files?.[0])}
            />
            <button type="button" className="secondary" disabled={busy} style={{ width: 'auto' }} onClick={() => imageInputRef.current?.click()}>
              {card?.imageUrl ? 'Replace' : 'Upload'}
            </button>
            {card?.imageUrl && (
              <button type="button" className="secondary" disabled={busy} style={{ width: 'auto' }} onClick={handleRemoveImage}>
                Remove
              </button>
            )}
          </div>
        </div>
      )}

      {!card?.isSpecialEdition && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontWeight: 700 }}>Video</p>
            <p className="hint" style={{ margin: '2px 0 0' }}>
              {card?.available ? 'MP4/MOV, up to 80MB. Crop is locked to the design image’s aspect ratio.' : 'This card has no design image to match yet.'}
            </p>
          </div>
          <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime" style={{ display: 'none' }} onChange={(e) => handlePickVideo(e.target.files?.[0])} />
          <button type="button" className="secondary" disabled={busy || !card?.available} style={{ width: 'auto' }} onClick={() => videoInputRef.current?.click()}>
            {card?.videoUrl ? 'Replace' : 'Upload'}
          </button>
          {card?.videoUrl && (
            <button type="button" className="secondary" disabled={busy} style={{ width: 'auto' }} onClick={handleRemoveVideo}>
              Remove
            </button>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
