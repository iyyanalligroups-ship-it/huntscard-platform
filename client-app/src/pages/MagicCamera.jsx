import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Compiler } from 'mind-ar/src/image-target/compiler.js';
import { Controller } from 'mind-ar/src/image-target/controller.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { buildCacheKey, getCachedBuffer, setCachedBuffer } from '../lib/mindCache.js';

// Magic Camera -- scans every ACTIVE admin-uploaded Magic Art pack AND
// every ACTIVE Magic Business Card at once (see backend/models/MagicArt.js
// and MagicBusinessCard.js), automatically playing whichever one's video
// matches the printed/on-screen image the camera is actually pointed at.
// Magic Art falls back to every complete pack if none have been
// explicitly marked active yet (older-setup compatibility); Magic
// Business Cards have no such fallback -- only explicitly-activated ones
// are ever scannable, since a client's draft card shouldn't be publicly
// findable just because it happens to have an image+video uploaded.
//
// Magic Business Card also optionally supports an anchored 3D model
// (doc.modelUrl/modelType, see backend/models/MagicBusinessCard.js) on
// top of its required video -- a reversal of this file's own earlier
// "video only, by explicit choice" note. Loaded straight into the
// target's existing anchorGroup (see the targets.forEach loop below),
// same box-autofit pattern as ArViewMindAR.jsx's own onModelLoaded, so it
// inherits that anchor's pose-smoothing lerp/slerp for free -- no extra
// stabilization work needed to keep a floated model from shaking.
//
// Known scaling caveat, not solved here: this compiles EVERY active
// target (art + cards) as simultaneous mind-ar targets, same approach
// Magic Art already used successfully for its own handful of pieces --
// fine at today's scale, but a global scanner checking every card at
// once will eventually need to become per-person-scoped if the number of
// active cards grows large (slower compile, more false-match risk
// between similar-looking cards).
//
// Public route (/magic-camera, see App.jsx) -- no login required. Its
// data (api.getPublicMagicArt()) was always unauthenticated; only the
// React route itself used to sit behind the dashboard's login wall. Still
// also reachable from the dashboard nav for logged-in users, at the same
// public URL (see Layout.jsx).
//
// This is a genuine multi-target tracker, not several single-target
// scanners glued together -- mind-ar's Controller supports it natively:
// `maxTrack` (default 1, left at its default here -- a phone only points
// at one physical piece at a time) limits how many targets are tracked
// SIMULTANEOUSLY, but `interestedTargetIndex` stays -1 forever
// (node_modules/mind-ar/src/image-target/controller.js) so it always
// detects/matches against every registered target that isn't already
// being tracked -- "point at any of them, auto-lock onto whichever one
// matches" is the library's default behavior, not something built here.
// `compileImageTargets(images, ...)` already compiles a whole array into
// one buffer, and `onUpdate` fires as `{type:'updateMatrix', targetIndex,
// worldMatrix}` once per registered target every frame -- this file just
// keeps one Three.js anchor group + video plane per target index instead
// of a single fixed set, everything else (camera setup, black-frame
// diagnostic, cleanup) is unchanged from the original single-target code.
//
// Replaces the earlier MagicArtTest.jsx spike, which let the user pick
// their own local files to prove the tracking mechanics worked -- that
// was never the real product. Clients can scan here but cannot upload --
// only the admin can.
//
// Not a revival of the old forked "HuntsEngine" that hit an unresolved
// black-frame getUserMedia() bug -- this uses the real mind-ar-js npm
// package, same as the validated business-card tracking spike
// (HuntsEngineTest.jsx / ArViewMindAR.jsx), which did not reproduce that
// bug. The black-frame diagnostic below is carried over to keep watching
// for it here too.
//
// Drives mind-ar's lower-level `Controller` directly rather than its
// `MindARThree` Three.js wrapper, for the same reason as the card spike:
// that wrapper imports `sRGBEncoding` from 'three', removed in the
// version this project already uses elsewhere (0.185.1).

// Same convention MindARThree itself uses -- see the card spike's
// buildPostMatrix for the full derivation. position=(W/2, H/2, 0) (the
// true center of an image spanning [0,W]x[0,H]), scale=(W,W,W) uniform
// across all three axes (not W,H,W) -- both the plane-sizing math below
// and this function only make sense together.
function buildPostMatrix(markerWidth, markerHeight) {
  const position = new THREE.Vector3(markerWidth / 2, markerWidth / 2 + (markerHeight - markerWidth) / 2, 0);
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(markerWidth, markerWidth, markerWidth);
  const m = new THREE.Matrix4();
  m.compose(position, quaternion, scale);
  return m;
}

// Starts an overlay video muted -- every target's video plays/loops in the
// background continuously from the moment tracking starts, whether or not
// its own target is currently being tracked (so it's already in sync, not
// restarting, the moment tracking picks it up), but sound should only be
// audible while its target is ACTUALLY found. Starting muted guarantees
// autoplay succeeds (no user-gesture gamble); the per-target `onUpdate`
// handler above then unmutes/re-mutes each target's own videos as it's
// found/lost.
async function startArVideo(video) {
  video.muted = true;
  await video.play();
}

// The admin's uploaded image could be a large photo. mind-ar's compiler
// runs feature extraction near input resolution, so an uncapped image
// risks slow/hung compilation on real Android hardware. Downscale via
// canvas if needed; mind-ar's Compiler accepts a canvas the same as an
// Image.
// 512 was already lowered once from 800 (>60% faster) -- but that's a
// flat PER-IMAGE cap, and compile time is really ~(dimension)^2 * target
// COUNT. It doesn't bound the TOTAL wait once enough admin-uploaded
// pieces/cards go active at once: with 11 simultaneous targets live,
// "Preparing the tracking targets..." was sitting well past 10s even at
// 512px each. targetDimFor keeps total compile work roughly constant
// instead -- shrinking each target's own cap as more of them need
// compiling together (1/sqrt(count), since work scales with dim²),
// floored at MIN_TARGET_DIM so any one image still has enough real
// detail to be recognized. A single target (e.g. scoped mode, always
// exactly one) still gets the full MAX_TARGET_DIM -- nothing lost there.
//
// Raised back to 800 (its original pre-optimization value) for tracking
// ACCURACY, not compile speed -- more real pixels means more distinct
// features for mind-ar to lock onto, which directly affects how stable/
// precise the raw tracked pose is (separate from POSE_SMOOTHING_MAX
// above, which only smooths whatever raw pose mind-ar hands over -- no
// amount of smoothing fixes a genuinely noisy/imprecise raw signal).
// This only costs compile time on a scan's FIRST visit (cached after via
// mindCache.js, see getCompiledBuffer), and only scales up scoped mode's
// single target directly -- targetDimFor's 1/sqrt(count) floor already
// keeps gallery mode's many-simultaneous-target compile time bounded
// regardless of this base value.
const MAX_TARGET_DIM = 800;
const MIN_TARGET_DIM = 260;
// A Magic Business Card's optional 3D model's longest dimension is scaled
// to this fraction of the tracked card's own width (1 local unit -- see
// buildPostMatrix), then floated slightly toward the viewer (positive
// local Z) so it stands off the flat video plane instead of clipping
// through it. Bigger than ArLayout's own MODEL_IMAGE_BASE_FRACTION (0.25,
// arProjection.js) -- that system floats a model as one small component
// alongside several others; here it's meant to read as the main AR
// sticker, closer to the card's own size.
const MODEL_SIZE_FRACTION = 0.6;
const MODEL_Z_OFFSET_FRACTION = 0.15;
function targetDimFor(targetCount) {
  if (targetCount <= 1) return MAX_TARGET_DIM;
  return Math.max(MIN_TARGET_DIM, Math.round(MAX_TARGET_DIM / Math.sqrt(targetCount)));
}

async function prepareTargetImage(imageUrl, maxDim) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Could not load the target image'));
    i.src = imageUrl;
  });

  const longest = Math.max(img.width, img.height);
  if (longest <= maxDim) return img;

  const scale = maxDim / longest;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// Which Magic Art packs this scans -- whatever the admin explicitly
// activated; if none have been touched yet, every complete pack (so
// nothing regresses to "scans nothing" for an untouched older setup).
// "Complete" now means an image plus at least one overlay clip with a
// video (see backend/models/MagicArt.js's overlays array) -- the public
// route already filters to this, so pieces here always qualify, but kept
// explicit for clarity/defensiveness.
function getActiveArt(pieces) {
  if (!pieces) return [];
  const active = pieces.filter((p) => p.active);
  return active.length ? active : pieces.filter((p) => p.imageUrl && p.overlays?.some((o) => o.videoUrl));
}

// Merges Magic Art's active-or-fallback list with Magic Business Cards and
// Street Art pieces -- cards and streetArt are both already active-only
// (filtered server-side, GET /api/public/magic-cards and
// /api/public/street-art), no fallback for either since a draft
// card/piece shouldn't be publicly scannable just because it has content
// uploaded.
function getActiveTargets(pieces, cards, streetArt) {
  return [...getActiveArt(pieces), ...(cards || []), ...(streetArt || [])];
}

// Normalizes a target into its list of overlay video boxes. Magic Art and
// Street Art both carry a full `overlays` array -- one positioned box per
// clip (see backend/models/MagicArt.js and StreetArt.js, identical
// shape), e.g. one box per wing of a wings mural or per animated element
// on a Magic Art piece, so each plays back independently instead of one
// video stretched across the whole image. Magic Business Card is the only
// remaining single-video case (no position field on that model at all) --
// it falls through to the full-image default below.
function getTargetOverlays(piece) {
  if (piece.overlays) {
    return piece.overlays.map((o) => ({
      videoUrl: o.videoUrl,
      crop: o.videoCrop,
      x: o.x,
      y: o.y,
      width: o.width,
      height: o.height,
    }));
  }
  return [{
    videoUrl: piece.videoUrl,
    audioUrl: piece.audioUrl,
    crop: piece.videoCrop,
    x: piece.x ?? 0,
    y: piece.y ?? 0,
    width: piece.width ?? 100,
    height: piece.height ?? 100,
  }];
}

export default function MagicCamera() {
  // Present only when reached via /magic-camera/:clientId -- a specific
  // client's own AR QR, routed here through PublicProfile.jsx's "choose
  // AR or Magic" screen. Switches this whole component into scoped mode:
  // compile/track just that one client's card instead of the full
  // gallery-wide target list the bare /magic-camera route below still uses.
  const { clientId } = useParams();
  // Which of this client's PHYSICAL cards was actually tapped (see
  // PublicProfile.jsx's ?card=N -> here). Different cards can have
  // different Magic Business Card content/layout, so this has to reach
  // the fetch below, not just default to "whichever one's active."
  const [searchParams] = useSearchParams();
  const cardNumber = searchParams.get('card') || undefined;
  const [pieces, setPieces] = useState(null); // MagicArt[] | null while loading -- unscoped mode only
  const [cards, setCards] = useState(null); // MagicBusinessCard[] | null while loading -- unscoped mode only
  const [streetArt, setStreetArt] = useState(null); // StreetArt[] | null while loading -- unscoped mode only
  const [scopedCard, setScopedCard] = useState(undefined); // this client's own card object | null (none active) | undefined (still loading) -- scoped mode only
  const [profile, setProfile] = useState(null); // this client's own contact/social info -- scoped mode only, feeds the pill bar below
  const [magicComponentDefs, setMagicComponentDefs] = useState([]); // admin-defined custom components (AttributeDefinition.magicComponent) -- scoped mode only
  const [socialMenuOpen, setSocialMenuOpen] = useState(false);
  const [loadError, setLoadError] = useState('');
  const startedRef = useRef(false); // guards against double-start under StrictMode, same pattern as ArViewMindAR.jsx

  const [status, setStatus] = useState('idle'); // idle | compiling | starting | scanning | found | error
  const [statusMessage, setStatusMessage] = useState('');
  const [cameraDiagnostic, setCameraDiagnostic] = useState('unknown'); // unknown | ok | black-frames

  // mind-ar's filter is a One-Euro filter: filterMinCF is the smoothing
  // floor applied when the target is nearly still; filterBeta scales
  // smoothing back off in proportion to the tracked point's OWN measured
  // velocity (cutoff = filterMinCF + filterBeta * |velocity|).
  //
  // A previous tuning pass set filterBeta to 0 here (completely disabling
  // velocity adaptation, a pure low-pass at the filterMinCF floor) on the
  // assumption that a handheld card is held nearly still and "there are
  // no fast intentional pans to track" -- rock solid for that case, but
  // it meant ANY real movement (someone actually turning/shaking the card
  // to show it off) got the exact same heavy damping as hand tremor, so
  // the overlay visibly lagged/"caught up slowly" instead of following
  // the card. Restored to the same proven middle-ground values
  // ArViewMindAR.jsx already uses (filterMinCF: 0.0005, filterBeta: 300)
  // -- real velocity now raises the cutoff so genuine motion is tracked
  // closely, while a still card still gets the low-cutoff smoothing.
  //
  // missTolerance: was 24 (~0.8s at 30fps), lowered to 1 -- explicit
  // request that moving the camera off the card should hide the overlay
  // essentially instantly (a single missed frame is the fastest this can
  // possibly react; the tracker can't report loss faster than it
  // processes frames, ~16-33ms each). This REINTRODUCES the flicker risk
  // the 24 was originally raised to bridge: a target with a large flat/
  // low-texture region can briefly drop below detection confidence for a
  // frame or two even while still genuinely in view, which will now show
  // as a visible found/lost/found blink instead of being smoothed over.
  // If that shows up on a real card, the actual fix is more visual
  // texture/contrast on the target image, not raising this back up (that
  // would undo the instant-hide behavior that was explicitly asked for).
  //
  // The remaining jitter after this filter is handled by an ADAPTIVE
  // slerp/lerp layer in renderLoop below (see POSE_SMOOTHING_MIN/MAX)
  // rather than a fixed-rate one -- same reasoning, ported from
  // ArViewMindAR.jsx's own fix for this exact "lags behind real motion"
  // problem.
  const tuning = { filterMinCF: 0.0005, filterBeta: 300, warmupTolerance: 3, missTolerance: 1 };

  const containerRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const controllerRef = useRef(null);
  const rafRef = useRef(null);
  const diagnosticIntervalRef = useRef(null);
  const streamRef = useRef(null);
  const arVideoElsRef = useRef([]); // off-DOM <video> elements, one per video target, feeding each overlay's VideoTexture
  // Scoped mode only -- local 3D positions (relative to the tracked
  // card's own anchor) for the AR component buttons below, and their
  // current projected screen coordinates, recomputed every render frame
  // as the anchor's tracked transform changes (same "project through the
  // live tracked matrix" technique ArViewMindAR.jsx uses for its own
  // pills). Deliberately NOT the same fixed-to-screen bar the gallery
  // experience doesn't have either -- these move/rotate with the card.
  const pillLayoutRef = useRef([]); // [{ id, local: THREE.Vector3 }]
  const [pillScreens, setPillScreens] = useState([]); // [{ id, x, y, visible }]
  const dimensionsRef = useRef(null); // [markerWidth, markerHeight] for the (single, scoped-mode) tracked target, set once handleStart's compiler finishes
  // Camera acquisition (permission prompt + hardware handshake) used to
  // only start once handleStart() ran, which itself waited on the
  // scopedCard network fetch resolving first -- so the camera visibly
  // "opening" was delayed by that whole round-trip on top of its own
  // latency. Kicked off here instead, the moment scoped mode mounts, in
  // parallel with that fetch rather than after it -- ensureCameraStarted()
  // below is idempotent (only actually calls getUserMedia once), so
  // handleStart just awaits whatever this already started.
  const cameraPromiseRef = useRef(null);
  const cameraAbortedRef = useRef(false); // set if scopedCard turns out to have no active card, so a permission grant that lands after that doesn't leave the camera running for nothing
  function ensureCameraStarted() {
    if (!cameraPromiseRef.current) {
      const attempt = (async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'environment' } });
        if (cameraAbortedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = cameraVideoRef.current;
        video.srcObject = stream;
        await new Promise((resolve) => {
          video.onloadedmetadata = () => {
            video.setAttribute('width', video.videoWidth);
            video.setAttribute('height', video.videoHeight);
            resolve();
          };
        });
        await video.play();
      })();
      // getUserMedia (or a stuck permission prompt/camera-busy state on
      // some Android devices) can hang indefinitely instead of ever
      // resolving OR rejecting -- a plain try/catch in handleStart can't
      // catch a promise that never settles, so this whole page just sat
      // frozen on "compiling" forever with no visible error the one time
      // this actually happened. Racing against a timeout turns that into
      // a real, catchable rejection instead.
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Camera did not start within 20s -- it may be in use by another app/tab, or permission is stuck. Try closing other camera tabs and reloading.')), 20000)
      );
      cameraPromiseRef.current = Promise.race([attempt, timeout]);
    }
    return cameraPromiseRef.current;
  }

  useEffect(() => {
    // Warm up camera permission & stream immediately in parallel
    ensureCameraStarted();

    if (clientId) {
      api
        .getPublicMagicCard(clientId, cardNumber)
        .then(setScopedCard)
        // 404 (no active card for this client) isn't a page-level error --
        // just means there's nothing to scan yet, handled via `hasArt`
        // below the same way an empty gallery already was.
        .catch(() => setScopedCard(null));
      // Cosmetic-only for the pill bar below -- a failure here just means
      // no contact/social pills show, not worth blocking the AR effect
      // itself over.
      api.getPublicProfile(clientId, cardNumber).then(setProfile).catch(() => { });
      api
        .getAttributeDefinitions()
        .then((all) => setMagicComponentDefs(all.filter((a) => a.magicComponent)))
        .catch(() => { });
      return;
    }
    api
      .getPublicMagicArt()
      .then(setPieces)
      .catch((err) => setLoadError(err.message));
    api
      .getPublicMagicCards()
      .then(setCards)
      .catch((err) => {
        // Defaults to [] rather than leaving `cards` null forever on
        // failure -- Magic Art alone should still work even if this
        // second, newer request fails, not block on it indefinitely.
        setLoadError(err.message);
        setCards([]);
      });
    api
      .getPublicStreetArt()
      .then(setStreetArt)
      .catch((err) => {
        // Same reasoning as the cards fallback above -- Street Art is the
        // newest of the three, shouldn't block the other two if it fails.
        setLoadError(err.message);
        setStreetArt([]);
      });
  }, [clientId, cardNumber]);

  useEffect(() => {
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scoped mode (reached via a specific client's own QR -> the "choose AR
  // or Magic" screen) auto-starts the camera immediately, same as
  // ArView.jsx/ArViewMindAR.jsx do -- no separate "Start Magic Camera"
  // click needed, since choosing "Magic" was already the deliberate
  // action that got you here. The bare gallery-wide /magic-camera route
  // (no clientId) keeps its manual Start button, since that's a page
  // people can land on and browse first, not a single-purpose deep link.
  useEffect(() => {
    if (!clientId || scopedCard === undefined || startedRef.current) return;
    if (!scopedCard) {
      // No active card -- release the camera that was preemptively
      // acquired above (see ensureCameraStarted), whether it already
      // landed or is still pending permission.
      cameraAbortedRef.current = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }
    startedRef.current = true;
    handleStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, scopedCard]);

  // Builds the AR component buttons' local 3D positions -- separate from
  // handleStart (which only runs once) because `profile` (contact/social/
  // portfolio links) and `dimensionsRef.current` (only known once
  // handleStart's compiler finishes) can each become ready before the
  // other; re-running whenever any of profile/scopedCard/status changes
  // guarantees at least one correct pass after BOTH are actually ready,
  // regardless of which finished first.
  useEffect(() => {
    if (!clientId || !dimensionsRef.current) return;
    const [markerWidth, markerHeight] = dimensionsRef.current;
    const toLocal = (pos) => {
      const p = pos || { x: 50, y: 120, z: 0 };
      const lx = p.x / 100 - 0.5;
      const ly = (0.5 - p.y / 100) * (markerHeight / markerWidth);
      const lz = ((p.z ?? 0) / 100) * 0.3;
      return new THREE.Vector3(lx, ly, lz);
    };
    const positions = scopedCard?.componentPositions || {};
    const contact = profile?.phone || profile?.publicEmail;
    const social = profile?.instagramUrl || profile?.twitterUrl || profile?.whatsapp;
    const portfolio = profile?.portfolioUrl;
    const huntsworld = profile?.huntsworldUrl;
    // Admin-defined custom components (see AttributeDefinition.magicComponent)
    // -- same "no value, no pill" rule as the built-ins above and as the
    // main AR Layout system's own arComponents: only shows once the
    // client has actually filled in a value for it.
    const customPills = magicComponentDefs
      .filter((def) => profile?.customAttributes?.[def.key])
      .map((def) => ({
        id: `custom:${def.key}`,
        local: toLocal(scopedCard?.magicElements?.[def.key]),
        rotation: scopedCard?.magicElements?.[def.key]?.rotation ?? 0,
      }));
    pillLayoutRef.current = [
      contact && { id: 'contact', local: toLocal(positions.contact), rotation: positions.contact?.rotation ?? 0 },
      portfolio && { id: 'portfolio', local: toLocal(positions.portfolio), rotation: positions.portfolio?.rotation ?? 0 },
      social && { id: 'social', local: toLocal(positions.social), rotation: positions.social?.rotation ?? 0 },
      huntsworld && { id: 'huntsworld', local: toLocal(positions.huntsworld), rotation: positions.huntsworld?.rotation ?? 0 },
      ...customPills,
    ].filter(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, scopedCard, profile, magicComponentDefs, status]);

  function cleanup() {
    clearInterval(diagnosticIntervalRef.current);
    cancelAnimationFrame(rafRef.current);
    controllerRef.current?.stopProcessVideo();
    controllerRef.current?.dispose?.();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    arVideoElsRef.current.forEach((v) => {
      v.pause();
      v.src = '';
    });
    arVideoElsRef.current = [];
    controllerRef.current = null;
    streamRef.current = null;
  }

  // Compiles (or reuses an IndexedDB-cached buffer for) a target list --
  // pulled out of handleStart so the SAME in-flight/finished promise can
  // be kicked off proactively, before the user ever taps "Start Magic
  // Camera" (see the prewarm effect below), instead of only starting
  // fresh on click. compilePrewarmRef caches by target-set fingerprint,
  // so a call here with the same targets just returns the already-
  // running (or already-resolved) promise instead of double-compiling.
  // Returns { buffer, targets } since a broken target (see the
  // allSettled note below) can shrink the target list actually compiled.
  const compilePrewarmRef = useRef(null); // { key, promise }
  function getCompiledBuffer(targets, onProgress) {
    // Cache key: stable fingerprint of every target's image URL, PLUS the
    // resolution each one would compile at. If the admin changes/
    // re-uploads an image the URL changes, the key changes, and the old
    // entry is never matched -- no explicit invalidation needed. The
    // resolution has to be part of this fingerprint too, not just the
    // URLs -- without it, tuning MAX_TARGET_DIM (e.g. for tracking
    // accuracy) would silently keep serving whatever a phone already
    // cached at the OLD resolution from IndexedDB (see mindCache.js),
    // since the image URLs themselves never changed.
    const maxDim = targetDimFor(targets.length);
    const cacheKey = buildCacheKey([...targets.map((p) => p.imageUrl), `dim:${maxDim}`]);
    if (compilePrewarmRef.current?.key === cacheKey) {
      return compilePrewarmRef.current.promise;
    }
    const promise = (async () => {
      const cached = await getCachedBuffer(cacheKey);
      if (cached) {
        onProgress?.('Loading tracking data...');
        return { buffer: cached, targets };
      }

      // Cache miss -- full compile path.
      // Promise.allSettled, not Promise.all -- ONE broken target (a bad
      // stored URL, a file missing on this server, a real network blip)
      // used to reject the whole batch and take Magic Camera down for
      // every OTHER target too, gallery-wide, from a single bad record.
      // Skips just the broken one(s) instead. `maxDim` computed once
      // above, alongside the cache key -- reused here via closure.
      const settled = await Promise.allSettled(targets.map((p) => prepareTargetImage(p.imageUrl, maxDim)));
      const targetImgs = [];
      const loadedTargets = [];
      settled.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          targetImgs.push(result.value);
          loadedTargets.push(targets[i]);
        } else {
          console.warn('[MagicCamera] Skipping a target whose image failed to load:', targets[i]?.imageUrl, result.reason);
        }
      });
      if (!targetImgs.length) throw new Error('Could not load the target image');
      const compiler = new Compiler();
      await compiler.compileImageTargets(targetImgs, (percent) => {
        onProgress?.(`Compiling tracking data... ${Math.round(percent)}%`);
      });
      const buffer = compiler.exportData();
      // Save for next visit -- non-blocking, errors are logged but don't
      // affect the current session.
      setCachedBuffer(cacheKey, buffer).catch(() => { });
      return { buffer, targets: loadedTargets };
    })();
    compilePrewarmRef.current = { key: cacheKey, promise };
    return promise;
  }

  async function handleStart() {
    const initialTargets = clientId ? (scopedCard ? [scopedCard] : []) : getActiveTargets(pieces, cards, streetArt);
    if (!initialTargets.length || !containerRef.current) return;
    setLoadError('');
    setStatus('compiling');
    setStatusMessage('Preparing the tracking targets...');

    try {
      // Compiling the tracking data and getting camera permission don't
      // depend on each other -- running them at the same time instead of
      // one after the other cuts real wait time down to whichever one is
      // slower, instead of the sum of both. Camera acquisition itself was
      // ALSO already kicked off earlier (see ensureCameraStarted, called
      // the moment the page mounted) -- this just awaits whatever's
      // already in flight instead of starting it fresh here. Likewise,
      // getCompiledBuffer below may already be running (or done) via the
      // prewarm effect -- most of the real wait time users notice is now
      // absorbed before they even click Start, rather than only
      // beginning on click. Full server-side pre-compilation (skipping a
      // per-visit compile entirely) is a real but bigger follow-up,
      // deliberately deferred -- see this file's own top comment.
      const compilePromise = getCompiledBuffer(initialTargets, setStatusMessage);

      const [{ buffer, targets }] = await Promise.all([compilePromise, ensureCameraStarted()]);
      const video = cameraVideoRef.current;

      setStatus('starting');
      setStatusMessage('Loading the tracker...');

      // Buffer resolution matches the camera's REAL aspect ratio
      // (video.videoWidth/videoHeight), not the CSS container's -- mind-ar's
      // projection matrix (below) is computed for that same real aspect
      // ratio (`inputWidth`/`inputHeight`), so rendering into a
      // differently-shaped buffer would scale the AR overlay out of sync
      // with the video underneath it. The container's fixed 4:3 CSS box
      // then crops BOTH the video and canvas identically via object-fit:
      // cover (see the JSX below), so what's displayed still fits the box
      // without the two layers drifting apart.
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(canvas.width, canvas.height, false);

      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 1));
      const camera = new THREE.PerspectiveCamera();
      camera.matrixAutoUpdate = false;

      // One anchor group per target -- each gets its own tracked
      // transform (postMatrix filled in once dimensions are known below)
      // and its own video-plane child, entirely independent of the others.
      const targetEntries = targets.map(() => {
        const anchorGroup = new THREE.Group();
        anchorGroup.visible = false;
        anchorGroup.matrixAutoUpdate = false;
        scene.add(anchorGroup);
        // initialized: false -- first tracked frame snaps directly to the
        // target pose; subsequent frames lerp toward it in renderLoop.
        // targetMatrix: stores the latest raw tracker pose so the 60fps
        // renderLoop can glide the display toward it independently of the
        // ~30fps tracker cadence. stuckFrames: consecutive render frames
        // an implausible jump has been rejected for -- see
        // MAX_CONSECUTIVE_REJECTS below.
        return {
          anchorGroup,
          postMatrix: new THREE.Matrix4(),
          videoEls: [],
          initialized: false,
          targetMatrix: new THREE.Matrix4(),
          modelMixer: null,
          stuckFrames: 0,
        };
      });

      // Reusable decomposition objects for the 60fps lerp in renderLoop.
      // Allocated once, reused every frame -- avoids per-frame GC pressure.
      const _tPos = new THREE.Vector3();
      const _tQuat = new THREE.Quaternion();
      const _tScale = new THREE.Vector3();
      const _cPos = new THREE.Vector3();
      const _cQuat = new THREE.Quaternion();
      const _cScale = new THREE.Vector3();
      // Adaptive per-frame lerp alpha at 60fps, same strategy as
      // ArViewMindAR.jsx's own pose-smoothing layer (ported here for the
      // same reason): a single FIXED alpha can't be both "rock solid
      // while still" and "keeps up while moving" -- a low fixed value
      // (the previous LERP_ALPHA = 0.05, always) looked great held still
      // but visibly lagged/"caught up slowly" the moment the card was
      // actually turned or shaken, which is exactly the bug being fixed
      // here. Instead: barely-moved deltas (below JITTER_TRANSLATION_
      // THRESHOLD) are near-certainly detection jitter and get damped
      // hard at POSE_SMOOTHING_MIN; large deltas are real motion and get
      // tracked closely at up to POSE_SMOOTHING_MAX, scaled linearly
      // between the two by how big the jump actually was. A single-frame
      // jump past MAX_PLAUSIBLE_JUMP is treated as a bad read (motion
      // blur/occlusion), not the card teleporting -- held at the last
      // good pose instead of snapped to, giving the next frame a chance
      // to confirm it before following.
      //
      // Both thresholds are compared against _cPos/_tPos, which are
      // decomposed straight out of entry.anchorGroup.matrix/targetMatrix
      // -- and those already have postMatrix folded in (see onUpdate:
      // `entry.targetMatrix.copy(m)` where m = worldMatrix * postMatrix).
      // postMatrix scales by the tracked marker's own PIXEL width (see
      // buildPostMatrix above), which is hundreds of units, not the
      // "target width == 1.0" convention the comments below originally
      // assumed (copied from ArViewMindAR.jsx, which happens to use the
      // SAME buildPostMatrix but was apparently never stress-tested
      // against continuous real movement either). Confirmed live via
      // temporary debug logging (accept/held/forced counters + the raw
      // decomposed position every frame): with the old 0.35 ceiling,
      // `accepted` stayed at 2 for an entire multi-second tilt test while
      // `held`/`forced` climbed into the hundreds -- i.e. virtually every
      // real frame was being rejected as "implausible", and the display
      // only ever advanced via the MAX_CONSECUTIVE_REJECTS force-through
      // below, producing a visible stutter (jump every ~6th frame) rather
      // than smooth tracking. The real observed position range during
      // that test spanned roughly 100-500+ units per axis. Recalibrated
      // against those real numbers below, not guessed again.
      // Raised from 0.05 -- fresh timing instrumentation (onUpdateCount /
      // avgOnUpdateGapMs / worstOnUpdateGapMs, added to rule out a slow
      // detector) showed the tracker itself updates every ~30-40ms almost
      // the whole time (healthy ~25-30Hz), and a real full loss+reacquire
      // recovers in ~1.9s -- neither explains a 6-second reposition. That
      // leaves the smoothing floor: during an ordinary smooth pan, most
      // single-frame deltas legitimately land under
      // JITTER_TRANSLATION_THRESHOLD (treated as "just noise"), so alpha
      // stayed pinned at 0.05 for the ENTIRE pan, not just while genuinely
      // still -- a permanent ~5%-per-frame catch-up that reads as multi-
      // second lag while the card is moving, only catching up once it
      // stops. Raising the floor trades a little more micro-jitter while
      // perfectly still for much snappier tracking during real motion.
      const POSE_SMOOTHING_MIN = 0.25;
      // Live debug data (lagDistance, logged every ~120ms) showed a real,
      // quantifiable catch-up lag during fast movement -- up to ~270
      // units of trailing distance after a quick turn, decaying back down
      // over several frames rather than snapping. 0.25 was chosen in an
      // EARLIER tuning pass specifically to avoid "ghosting" at 0.5 -- but
      // that test ran while the jump-threshold bug above was still
      // active, when nearly every frame was being wrongly held/forced
      // instead of smoothly accepted, so that finding isn't trustworthy
      // anymore. Raised to 0.75 once acceptance was working correctly
      // (confirmed live: noticeably less lag, no ghosting), then to 0.9
      // on a follow-up request for even faster tracking -- close to the
      // top of the useful range (1.0 would mean zero smoothing, i.e. the
      // display just snaps straight to the raw tracked pose every frame,
      // which reintroduces raw sensor jitter as visible shake). Push
      // higher only after confirming this doesn't bring back
      // ghosting/shake, since headroom above this is thin.
      const POSE_SMOOTHING_MAX = 1.0; // was 0.9 -- zero catch-up lag once a jump reaches FULL_SPEED_JUMP below. Held-still damping (POSE_SMOOTHING_MIN) is unaffected.
      // Confirmed live via PER-FRAME debug logging (lastJumpDist/lastAlpha,
      // captured directly at the exact point the alpha formula uses them --
      // not inferred from 120ms-apart snapshots like the earlier, wrong
      // guesses were): real per-frame jumps during ordinary camera movement
      // are mostly in the 5-30 unit range, NOT 30-80 as first assumed. With
      // the old JITTER_TRANSLATION_THRESHOLD of 30, that meant almost every
      // real movement frame was landing AT or BELOW the "this is just
      // noise" cutoff and getting stuck at POSE_SMOOTHING_MIN (0.05) --
      // logged directly: alpha sat at exactly 0.05 for the vast majority of
      // frames even during continuous, obvious camera motion, only
      // occasionally spiking when a single frame's jump happened to exceed
      // 30. That's a persistent, non-decaying lag, not "slow to catch up"
      // -- the display was barely moving at all, continuously, while the
      // real position kept advancing. Both thresholds lowered to match
      // what real per-frame motion actually measures at.
      // Widened again after the previous values (3/20) made the alpha
      // ramp too NARROW -- similar real per-frame jumps (which naturally
      // vary a fair bit even during smooth, deliberate motion) landed on
      // very different points of a tiny 3-to-20 range, so alpha swung
      // between "barely moving" and "full snap" frame to frame, which
      // reads as jumpiness/inconsistent shape even though each individual
      // frame's math was correct. Widening the range smooths out how
      // alpha changes as the jump size varies, without changing what
      // counts as "definitely just noise" (still well above the ~2-4
      // unit noise floor measured while genuinely still).
      const JITTER_TRANSLATION_THRESHOLD = 6; // was 3
      const FULL_SPEED_JUMP = 50; // was 20
      const MAX_PLAUSIBLE_JUMP = 400; // was 0.35 -- comfortably above real per-frame movement seen while actively tilting, still well short of a wild bad-read teleport
      // How many render frames in a row an implausible jump can be held
      // for before forcibly blending toward the latest reading anyway
      // (still through the normal alpha blend below, not an instant
      // teleport) -- guarantees this self-heals within ~6 frames
      // (~100ms at 60fps) no matter how far/fast the card actually moved,
      // instead of waiting indefinitely for it to coincidentally drift
      // back within MAX_PLAUSIBLE_JUMP of wherever the display got stuck.
      const MAX_CONSECUTIVE_REJECTS = 6;
      const foundFlags = targets.map(() => false);

      const controller = new Controller({
        inputWidth: video.videoWidth,
        inputHeight: video.videoHeight,
        filterMinCF: tuning.filterMinCF,
        filterBeta: tuning.filterBeta,
        warmupTolerance: tuning.warmupTolerance,
        missTolerance: tuning.missTolerance,
        onUpdate: (data) => {
          if (data.type !== 'updateMatrix') return;
          const { targetIndex, worldMatrix } = data;
          const entry = targetEntries[targetIndex];
          if (!entry) return;
          if (worldMatrix !== null) {
            const m = new THREE.Matrix4();
            m.fromArray(worldMatrix);
            m.multiply(entry.postMatrix);
            if (!entry.initialized) {
              // Very first lock: snap both the display matrix AND the
              // target to the raw pose so the renderLoop lerp doesn't
              // slide in from (0,0,0) on the first frame.
              entry.anchorGroup.matrix.copy(m);
              entry.targetMatrix.copy(m);
              entry.initialized = true;
            } else {
              // Store raw tracker pose as the lerp target. The actual
              // visual interpolation runs in renderLoop at 60fps, not
              // here at ~30fps -- this just keeps the target fresh.
              entry.targetMatrix.copy(m);
            }
            entry.anchorGroup.visible = true;
            if (!foundFlags[targetIndex]) {
              foundFlags[targetIndex] = true;
              // Sound plays only for Special Edition cards (or Magic Art with overlays) while tracked
              const target = targets[targetIndex];
              const isSpecial = Boolean(target?.isSpecialEdition || target?.overlays);
              entry.videoEls.forEach((v) => {
                v.muted = !isSpecial;
                if (isSpecial) {
                  v.volume = 1.0;
                  const p = v.play();
                  if (p !== undefined) p.catch(() => { });
                }
              });
              setStatus('found');
              setStatusMessage('Found -- being tracked.');
            }
          } else {
            entry.anchorGroup.visible = false;
            if (foundFlags[targetIndex]) {
              foundFlags[targetIndex] = false;
              entry.videoEls.forEach((v) => { v.muted = true; });
              // Only drop back to "scanning" once NOTHING is tracked --
              // avoids flicker if tracking briefly overlaps while
              // switching between two nearby pieces.
              if (!foundFlags.some(Boolean)) {
                setStatus('scanning');
                setStatusMessage(clientId ? 'Point the camera at this card to track it.' : 'Point the camera at a Magic Art image or Magic Business Card to track it.');
              }
            }
          }
        },
      });
      controllerRef.current = controller;

      const { dimensions } = controller.addImageTargetsFromBuffer(buffer);
      if (clientId) dimensionsRef.current = dimensions[0]; // feeds the pill-layout effect below, which may run before OR after this depending on when `profile` resolves

      camera.projectionMatrix.fromArray(controller.getProjectionMatrix());
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

      // ---- Per-target overlay video plane(s) ---- buildPostMatrix scales
      // all three axes uniformly by markerWidth, so a child's local-space
      // X spans exactly 1 unit for the full image width, but Y must span
      // markerHeight/markerWidth units to represent the full image height.
      // A full-bleed box (Magic Art / Magic Business Card, see
      // getTargetOverlays) is centered at local (0,0,0), which
      // buildPostMatrix maps to the image's true center -- no offset
      // needed. A Street Art piece's own positioned sub-boxes instead each
      // get their own offset mesh.position, converted from the saved
      // top-left percentage box into this same local-unit space.
      const arVideoEls = [];
      targets.forEach((piece, i) => {
        const entry = targetEntries[i];
        const [markerWidth, markerHeight] = dimensions[i];
        entry.postMatrix = buildPostMatrix(markerWidth, markerHeight);
        const fullHeightUnits = markerHeight / markerWidth;

        // Optional anchored 3D model (Magic Business Card only, see this
        // file's own top comment) -- additive to the video overlay(s)
        // below, not a replacement, so nothing else in this loop needs to
        // change whether or not a given target has one.
        if (piece.modelUrl) {
          const onModelLoaded = (model, animations) => {
            const box = new THREE.Box3().setFromObject(model);
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            box.getSize(size);
            box.getCenter(center);
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            const autoFit = MODEL_SIZE_FRACTION / maxDim;
            model.scale.setScalar(autoFit);
            model.position.set(-center.x * autoFit, -center.y * autoFit, -center.z * autoFit + MODEL_Z_OFFSET_FRACTION);
            entry.anchorGroup.add(model);
            if (animations?.length) {
              entry.modelMixer = new THREE.AnimationMixer(model);
              entry.modelMixer.clipAction(animations[0]).play();
            }
          };
          const onModelError = (err) => console.warn('[MagicCamera] Could not load a 3D model:', piece.modelUrl, err);
          if (piece.modelType === 'fbx') {
            new FBXLoader().load(piece.modelUrl, (fbx) => onModelLoaded(fbx, fbx.animations), undefined, onModelError);
          } else {
            new GLTFLoader().load(piece.modelUrl, (gltf) => onModelLoaded(gltf.scene, gltf.animations), undefined, onModelError);
          }
        }

        getTargetOverlays(piece).forEach((overlay) => {
          if (!overlay.videoUrl) return;
          const isFullBleed = overlay.x === 0 && overlay.y === 0 && overlay.width === 100 && overlay.height === 100;
          // Overscan (bigger than the exact tracked boundary) -- mind-ar's
          // corner detection can be off by a fractional amount, which
          // otherwise shows up as a thin sliver of the real image peeking
          // out past one edge of the video. Only applied to a full-bleed
          // box (the tracked image's own outer edge) -- a Street Art
          // sub-box has no such boundary to overscan past. Centered, so it
          // grows evenly on all sides rather than shifting the video
          // off-center. Bumped from 1.03 -- a real printed-card test (not
          // just on-screen) still showed a small gap at that value.
          const OVERSCAN = isFullBleed ? 1.06 : 1;
          const planeWidth = (overlay.width / 100) * OVERSCAN;
          const planeHeight = (overlay.height / 100) * fullHeightUnits * OVERSCAN;
          // Box center, converted from image-space percentages (x/y
          // increase right/down from the top-left) into local units
          // (X increases right from center, Y increases UP from center --
          // hence the flip on Y, same reasoning as the UV-space flip
          // below).
          const centerXFrac = (overlay.x + overlay.width / 2) / 100;
          const centerYFrac = (overlay.y + overlay.height / 2) / 100;
          const localX = centerXFrac - 0.5;
          const localY = fullHeightUnits * (0.5 - centerYFrac);

          const arVideo = document.createElement('video');
          arVideo.crossOrigin = 'anonymous';
          arVideo.loop = true;
          arVideo.playsInline = true;
          arVideo.src = overlay.videoUrl;
          arVideoEls.push(arVideo);
          entry.videoEls.push(arVideo); // unmuted/muted by onUpdate above as this target is found/lost

          if (overlay.audioUrl) {
            const arAudio = document.createElement('audio');
            arAudio.crossOrigin = 'anonymous';
            arAudio.loop = true;
            arAudio.src = overlay.audioUrl;
            arVideoEls.push(arAudio);
            entry.videoEls.push(arAudio);
            startArVideo(arAudio).catch((err) => console.warn('Could not start audio:', err));
          }

          startArVideo(arVideo)
            .then(() => {
              const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
              const texture = new THREE.VideoTexture(arVideo);
              // Without this, Three.js treats the video's pixel data as
              // linear instead of standard sRGB, rendering it visibly
              // flatter/duller/desaturated than the actual file -- the
              // renderer's own output is already sRGB by default, but a
              // texture's own colorSpace is NOT auto-detected and stays
              // NoColorSpace (linear) unless set explicitly. Confirmed via
              // a real printed-mural test: the overlay video came out
              // consistently muted toward gray/olive compared to the same
              // file played in a plain <video> tag.
              texture.colorSpace = THREE.SRGBColorSpace;
              // Display-only crop, chosen in the admin's crop tool (see
              // MagicArt.jsx / StreetArt.jsx) -- a plain UV offset/repeat
              // on the texture, the video FILE itself is untouched.
              // Three.js UV space has Y=0 at the bottom, but the stored
              // crop uses image-space Y=0 at the top, hence the flip here.
              const crop = overlay.crop || { x: 0, y: 0, width: 1, height: 1 };
              texture.offset.set(crop.x, 1 - crop.y - crop.height);
              texture.repeat.set(crop.width, crop.height);
              const material = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                side: THREE.DoubleSide,
              });
              const mesh = new THREE.Mesh(geometry, material);
              mesh.position.set(localX, localY, 0);
              entry.anchorGroup.add(mesh);
            })
            .catch((err) => setLoadError(`Could not play an overlay video: ${err.message}`));
        });
      });
      arVideoElsRef.current = arVideoEls;

      controller.dummyRun(video);
      controller.processVideo(video);

      const ndcHelper = new THREE.Vector3();
      const worldHelper = new THREE.Vector3();
      const centerHelper = new THREE.Vector3();
      const modelClock = new THREE.Clock();
      function renderLoop() {
        // 60fps lerp: glide every visible anchor's display matrix toward
        // the latest raw tracker pose stored by onUpdate. Running here
        // (every rAF) rather than in onUpdate (~30fps) doubles the
        // effective smoothing rate and eliminates the residual jitter
        // that was still visible at 30fps-only interpolation.
        const modelDelta = modelClock.getDelta();
        targetEntries.forEach((entry) => {
          if (entry.initialized && entry.anchorGroup.visible) {
            entry.targetMatrix.decompose(_tPos, _tQuat, _tScale);
            entry.anchorGroup.matrix.decompose(_cPos, _cQuat, _cScale);
            const jumpDist = _cPos.distanceTo(_tPos);
            const implausible = jumpDist > MAX_PLAUSIBLE_JUMP;
            if (implausible && entry.stuckFrames < MAX_CONSECUTIVE_REJECTS) {
              // Implausible one-frame jump -- hold the last good pose,
              // let the next frame confirm before following it. Only up
              // to MAX_CONSECUTIVE_REJECTS frames in a row, though -- see
              // that constant's own comment for why this can't just keep
              // rejecting forever.
              entry.stuckFrames++;
            } else {
              entry.stuckFrames = 0;
              const alpha =
                jumpDist <= JITTER_TRANSLATION_THRESHOLD
                  ? POSE_SMOOTHING_MIN
                  : THREE.MathUtils.clamp(
                    POSE_SMOOTHING_MIN +
                    ((jumpDist - JITTER_TRANSLATION_THRESHOLD) / (FULL_SPEED_JUMP - JITTER_TRANSLATION_THRESHOLD)) *
                    (POSE_SMOOTHING_MAX - POSE_SMOOTHING_MIN),
                    POSE_SMOOTHING_MIN,
                    POSE_SMOOTHING_MAX
                  );
              _cPos.lerp(_tPos, alpha);
              _cQuat.slerp(_tQuat, alpha);
              _cScale.lerp(_tScale, alpha);
              entry.anchorGroup.matrix.compose(_cPos, _cQuat, _cScale);
            }
          }
          entry.modelMixer?.update(modelDelta);
        });
        renderer.render(scene, camera);
        const entry = targetEntries[0];
        if (clientId && entry?.anchorGroup.visible && pillLayoutRef.current.length) {
          const cw = window.innerWidth;
          const ch = window.innerHeight;
          // Real perspective scale for each button, not just its
          // projected screen POSITION -- these are flat DOM overlays with
          // a fixed CSS size, so without this a row that recedes into the
          // distance (the card viewed at even a slight tilt) compresses
          // its anchor points together on screen while the buttons stay
          // full-size, visibly overlapping (see the Call/Portfolio/Social
          // crowding report). Scaling each button by its own real depth
          // relative to the card's own center keeps size and spacing
          // proportional together, the way a true 3D object would.
          // Camera stays fixed at the world origin here (never added to
          // the scene, matrixAutoUpdate off, position never touched), so
          // distance-from-camera is just each point's own vector length.
          centerHelper.set(0, 0, 0).applyMatrix4(entry.anchorGroup.matrix);
          const centerDist = centerHelper.length();
          const next = pillLayoutRef.current.map(({ id, local, rotation }) => {
            worldHelper.copy(local).applyMatrix4(entry.anchorGroup.matrix);
            const scale = Math.max(0.4, Math.min(2.5, centerDist / worldHelper.length()));
            ndcHelper.copy(worldHelper).project(camera);
            return { id, x: ((ndcHelper.x + 1) / 2) * cw, y: ((1 - ndcHelper.y) / 2) * ch, visible: ndcHelper.z <= 1, rotation, scale };
          });
          setPillScreens(next);
        } else if (clientId && pillLayoutRef.current.length) {
          setPillScreens([]);
        }

        rafRef.current = requestAnimationFrame(renderLoop);
      }
      renderLoop();

      setStatus('scanning');
      setStatusMessage(clientId ? 'Point the camera at this card to track it.' : 'Point the camera at a Magic Art image or Magic Business Card to track it.');

      // Black-frame diagnostic -- the exact bug that killed the earlier
      // Magic Art attempt: getUserMedia() reporting a live, correctly-
      // sized video track that nonetheless produces genuinely all-black
      // frames. Sample real pixel data periodically (not just
      // readyState/dimensions, which lied last time).
      const probeCanvas = document.createElement('canvas');
      probeCanvas.width = 16;
      probeCanvas.height = 16;
      const probeCtx = probeCanvas.getContext('2d', { willReadFrequently: true });
      diagnosticIntervalRef.current = setInterval(() => {
        if (video.readyState < 2) return;
        probeCtx.drawImage(video, 0, 0, 16, 16);
        const { data } = probeCtx.getImageData(0, 0, 16, 16);
        let allBlack = true;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] > 8 || data[i + 1] > 8 || data[i + 2] > 8) {
            allBlack = false;
            break;
          }
        }
        setCameraDiagnostic(allBlack ? 'black-frames' : 'ok');
      }, 1000);
    } catch (err) {
      setStatus('error');
      setLoadError(err.message || 'Could not start Magic Camera');
      cleanup();
    }
  }

  function handleStop() {
    cleanup();
    setStatus('idle');
    setCameraDiagnostic('unknown');
  }

  const activeTargets = clientId ? (scopedCard ? [scopedCard] : []) : getActiveTargets(pieces, cards, streetArt);
  const hasArt = activeTargets.length > 0;
  const stillLoading = clientId ? scopedCard === undefined : !pieces || !cards || !streetArt;

  // Kicks off compiling the moment there's something to compile, rather
  // than waiting for the "Start Magic Camera" click -- on the gallery
  // route (no clientId) that click can land seconds after the page is
  // actually ready, time this would otherwise waste sitting idle. By the
  // time the user does tap Start, getCompiledBuffer above usually just
  // returns this same already-finished (or already-running) promise
  // instead of starting from zero. Scoped mode doesn't need this: it
  // already calls handleStart() itself the instant scopedCard resolves
  // (see that effect above), so compiling is already starting at the
  // earliest possible moment there.
  useEffect(() => {
    if (clientId || stillLoading || !hasArt) return;
    getCompiledBuffer(activeTargets).catch(() => { }); // handleStart surfaces any real error once the user actually starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, stillLoading, hasArt]);

  // Contact/social/portfolio buttons -- scoped mode only, same underlying
  // profile fields ArView.jsx/ArViewMindAR.jsx already show, but their
  // OWN independent 3D placement + rectangular shape (see
  // MagicBusinessCard.jsx's own component-position editor and
  // backend/models/MagicBusinessCard.js's contactX/portfolioX/socialX
  // etc.) -- this is its own distinct "Magic" experience, not a reskin
  // of the AR Layout one, even though the link VALUES are shared.
  const contactHref = profile?.phone ? `tel:${profile.phone}` : profile?.publicEmail ? `mailto:${profile.publicEmail}` : null;
  const socialLinks = [
    profile?.instagramUrl && { key: 'instagram', label: 'Instagram', href: profile.instagramUrl },
    profile?.twitterUrl && { key: 'twitter', label: 'Twitter / X', href: profile.twitterUrl },
    profile?.whatsapp && { key: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/${profile.whatsapp.replace(/\D/g, '')}` },
  ].filter(Boolean);
  const portfolioHref = profile?.portfolioUrl || null;
  const huntsworldHref = profile?.huntsworldUrl || null;

  // Scoped mode (a specific client's own card, reached via their AR QR ->
  // "choose AR or Magic") is deliberately NOT styled/labeled as "Magic
  // Camera" -- that name/branding, the gallery subtitle, the manual
  // Start button, and the camera diagnostic readout are all specific to
  // the shared Magic Art gallery experience below. This is its own
  // clean, full-screen tracking camera instead (same visual language as
  // ArView.jsx's live AR view: fixed full-screen, a close button, no
  // page chrome), auto-started already (see the effect above).
  if (clientId) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
        <div
          ref={containerRef}
          style={{ position: 'absolute', inset: 0 }}
        >
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={cameraVideoRef} muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>

        {(loadError || (!stillLoading && !hasArt)) && (
          <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, color: '#fff', textAlign: 'center', zIndex: 30 }}>
            <p style={{ maxWidth: 320 }}>{loadError || "This card doesn't have a Magic effect set up yet."}</p>
            <Link to={`/c/${clientId}`} style={{ color: 'var(--holo-cyan, #5eead4)' }}>
              View the normal profile instead
            </Link>
          </div>
        )}

        {status === 'scanning' && (
          <div style={{ position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '10px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, textAlign: 'center', zIndex: 10 }}>
            Point your camera at your card
          </div>
        )}

        {/* AR component buttons -- 3D-anchored to the tracked card (move
            and rotate with it, projected fresh every frame through the
            live tracked matrix, see renderLoop above), not a fixed
            on-screen bar. Rectangular, solid-color, text-labeled -- a
            deliberately different shape/style from AR Layout's round
            icon pills, per its own independent component-position
            editor in MagicBusinessCard.jsx. */}
        {pillScreens.map((s) => {
          if (!s.visible) return null;
          const style = {
            position: 'fixed',
            left: 0,
            top: 0,
            transform: `translate3d(${s.x}px, ${s.y}px, 0) translate(-50%, -50%) scale(${s.scale})`,
            willChange: 'transform',
            zIndex: 10,
          };
          // Rotation lives on the button itself, not the positioned
          // wrapper -- so it tilts the button in place without dragging
          // the "Social" dropdown menu's own absolute positioning along
          // with it (that's positioned relative to the wrapper above).
          const buttonStyle = {
            display: 'inline-block',
            padding: '10px 20px',
            background: '#2563eb',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            borderRadius: 4,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
            border: 'none',
            textDecoration: 'none',
            cursor: 'pointer',
            transform: s.rotation ? `rotate(${s.rotation}deg)` : undefined,
          };
          if (s.id === 'contact' && contactHref) {
            return (
              <div key={s.id} style={style}>
                <a href={contactHref} style={buttonStyle}>
                  Call
                </a>
              </div>
            );
          }
          if (s.id === 'portfolio' && portfolioHref) {
            return (
              <div key={s.id} style={style}>
                <a href={portfolioHref} target="_blank" rel="noopener noreferrer" style={buttonStyle}>
                  Portfolio
                </a>
              </div>
            );
          }
          if (s.id === 'social' && socialLinks.length > 0) {
            return (
              <div key={s.id} style={{ ...style, textAlign: 'center' }}>
                <button type="button" onClick={() => setSocialMenuOpen((v) => !v)} style={buttonStyle}>
                  Social
                </button>
                {socialMenuOpen && (
                  <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6, background: '#171717', borderRadius: 10, overflow: 'hidden', boxShadow: '0 6px 20px rgba(0,0,0,0.5)', minWidth: 140, zIndex: 5 }}>
                    {socialLinks.map((soc) => (
                      <a
                        key={soc.key}
                        href={soc.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setSocialMenuOpen(false)}
                        style={{ display: 'block', padding: '10px 14px', color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}
                      >
                        {soc.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          if (s.id === 'huntsworld' && huntsworldHref) {
            return (
              <div key={s.id} style={style}>
                <a href={huntsworldHref} target="_blank" rel="noopener noreferrer" style={buttonStyle}>
                  Huntsworld
                </a>
              </div>
            );
          }
          if (s.id.startsWith('custom:')) {
            const key = s.id.slice('custom:'.length);
            const def = magicComponentDefs.find((c) => c.key === key);
            const href = profile?.customAttributes?.[key];
            if (!def || !href) return null;
            return (
              <div key={s.id} style={style}>
                <a href={href} target="_blank" rel="noopener noreferrer" style={buttonStyle}>
                  {def.label}
                </a>
              </div>
            );
          }
          return null;
        })}

        <Link
          to={`/c/${clientId}`}
          style={{ position: 'fixed', top: 16, left: 16, zIndex: 20, width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, textDecoration: 'none' }}
          aria-label="Close"
        >
          ✕
        </Link>
      </div>
    );
  }

  // Full-screen, same visual language as the scoped branch above -- the
  // camera fills the entire viewport with the Start button/spinner/hint
  // floated on top of it, instead of the old page-chrome layout (title +
  // button + a boxed-in camera preview below the fold).
  const centeredOverlayStyle = {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 24,
    textAlign: 'center',
    zIndex: 20,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={cameraVideoRef} muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>

      {stillLoading && (
        <div style={centeredOverlayStyle}>
          <div className="magic-camera-spinner" />
          <p style={{ color: '#fff', fontSize: 13 }}>Loading...</p>
        </div>
      )}

      {!stillLoading && !hasArt && (
        <div style={centeredOverlayStyle}>
          <p style={{ color: '#fff', maxWidth: 320 }}>Nothing has been uploaded yet -- check back soon.</p>
        </div>
      )}

      {!stillLoading && hasArt && status === 'idle' && (
        <div style={centeredOverlayStyle}>
          {/* A background fetch (e.g. Magic Business Cards or Street Art)
              can fail without blocking the page -- see the .catch
              fallbacks in the loading effect above, which still resolve
              the OTHER lists so this can reach "idle" with content to
              scan. Surfaced here rather than silently dropped. */}
          {loadError && <p style={{ color: '#f87171', maxWidth: 320, fontSize: 13 }}>{loadError}</p>}
          <p className="magic-camera-start-note">Point your camera at any Magic piece, then tap to start</p>
          <button onClick={handleStart} className="magic-camera-start-btn" aria-label="Start Magic Camera" title="Start Magic Camera">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="30" height="30">
              <path d="M15 4V2" /><path d="M15 16v-2" /><path d="M8 9h2" /><path d="M20 9h2" /><path d="M17.8 11.8 19 13" /><path d="M15 9h0" /><path d="M17.8 6.2 19 5" /><path d="m3 21 9-9" /><path d="M12.2 6.2 13 7" />
            </svg>
          </button>
        </div>
      )}

      {!stillLoading && hasArt && (status === 'compiling' || status === 'starting') && (
        <div style={centeredOverlayStyle}>
          <div className="magic-camera-spinner" />
          {statusMessage && <p style={{ color: '#fff', fontSize: 13 }}>{statusMessage}</p>}
        </div>
      )}

      {!stillLoading && hasArt && status === 'error' && (
        <div style={centeredOverlayStyle}>
          <p style={{ color: '#fff', maxWidth: 320 }}>{loadError || 'Could not start Magic Camera'}</p>
          <button onClick={handleStart} style={{ width: 'auto' }}>
            Try again
          </button>
        </div>
      )}

      {(status === 'scanning' || status === 'found') && (
        <>
          <div style={{ position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '10px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, textAlign: 'center', zIndex: 15, maxWidth: '90%' }}>
            {statusMessage}
          </div>
          {cameraDiagnostic === 'black-frames' && (
            <div style={{ position: 'fixed', bottom: 84, left: '50%', transform: 'translateX(-50%)', color: '#f87171', fontSize: 11, zIndex: 15 }}>
              ❌ All-black frames detected
            </div>
          )}
        </>
      )}

      {status !== 'idle' && (
        <button
          onClick={handleStop}
          aria-label="Stop"
          style={{ position: 'fixed', top: 16, right: 16, zIndex: 20, width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, cursor: 'pointer' }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
