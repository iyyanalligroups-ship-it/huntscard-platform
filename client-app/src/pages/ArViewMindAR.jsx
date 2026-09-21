import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Compiler } from 'mind-ar/src/image-target/compiler.js';
import { Controller } from 'mind-ar/src/image-target/controller.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { VIDEO_BASE_FRACTION, MODEL_IMAGE_BASE_FRACTION, cardAspectFor } from '../lib/arProjection.js';
import { buildArTargetImageEl } from '../lib/arTargetImage.js';

// Real, public-facing alternative to ArView.jsx's QR-corner (POSIT)
// tracking -- tracks the whole card design (banner + QR composited
// together) instead of just the QR, using mind-ar. Reached ONLY via
// `/c/:clientId?ar=1&engine=mindar` (see PublicProfile.jsx) -- every
// existing tap/scan link (`?ar=1` alone) is completely untouched and
// keeps using ArView.jsx exactly as before. This is deliberately a
// parallel, opt-in path, not a replacement, so it can be tested against
// real traffic with zero risk to what's already working.
//
// This is the production port of `HuntsEngineTest.jsx` ("Mark 1"), which
// validated the approach end to end: no black-frame camera bug, stable
// tracking across angles on-screen AND on a real printed card, correct
// content positioning. The tracking/rendering logic below is carried
// over from there largely unchanged -- see that file's own comments for
// the deeper "why" behind the coordinate math and the mind-ar integration
// choices (Controller instead of the MindARThree wrapper, the Vite
// optimizeDeps config needed for mind-ar's own dependencies, etc.).
//
// NOT YET DECIDED / OUT OF SCOPE FOR THIS PASS: the tracking target is
// compiled fresh in the visitor's browser on every visit, same as Mark 1
// did -- there's a real multi-second delay before tracking can start.
// Pre-compiling this server-side (or caching it) whenever a banner photo
// changes is real follow-up work, deliberately deferred until this proves
// out on real traffic first.

function buildPostMatrix(markerWidth, markerHeight) {
  const position = new THREE.Vector3(markerWidth / 2, markerWidth / 2 + (markerHeight - markerWidth) / 2, 0);
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(markerWidth, markerWidth, markerWidth);
  const m = new THREE.Matrix4();
  m.compose(position, quaternion, scale);
  return m;
}

// See HuntsEngineTest.jsx's file-level comment for why this exists
// instead of arProjection.js's toLocalOffset (different tracking
// reference frame -- whole-card vs. QR-corner).
function layoutPctToLocal(pos, markerWidth, markerHeight) {
  const lx = (pos?.x ?? 50) / 100 - 0.5;
  const ly = (0.5 - (pos?.y ?? 50) / 100) * (markerHeight / markerWidth);
  const lz = ((pos?.z ?? 0) / 100) * 0.3;
  return [lx, ly, lz];
}

const ELEMENTS = [
  { key: 'contact', label: 'Contact Info', color: '#14b8a6' },
  { key: 'portfolio', label: 'Portfolio', color: '#4f8ef7' },
  { key: 'social', label: 'Social Icons', color: '#ec4899' },
  { key: 'huntsworld', label: 'Huntsworld Link', color: '#f5a524' },
];

export default function ArViewMindAR({ clientId, cardNumber }) {
  const [profile, setProfile] = useState(null);
  const [layout, setLayout] = useState(null);
  const [icons, setIcons] = useState({});
  const [arComponents, setArComponents] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [modelError, setModelError] = useState('');
  const [visible, setVisible] = useState(false);
  const [socialMenuOpen, setSocialMenuOpen] = useState(false);
  const [pillScreens, setPillScreens] = useState([]);

  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const controllerRef = useRef(null);
  const rafRef = useRef(null);
  const streamRef = useRef(null);
  const arContentVideoRef = useRef(null);
  const pillLayoutRef = useRef([]);
  const mixerRef = useRef(null); // AnimationMixer for the loaded model, if it has any clips
  const startedRef = useRef(false); // guards against double-start under StrictMode

  useEffect(() => {
    Promise.all([api.getPublicProfile(clientId, cardNumber), api.getPublicArLayout(clientId, cardNumber)])
      .then(([p, l]) => {
        setProfile(p);
        setLayout(l);
      })
      .catch((err) => setLoadError(err.message));
    api
      .getPublicArIcons()
      .then(setIcons)
      .catch(() => setIcons({}));
    api
      .getAttributeDefinitions()
      .then((all) => setArComponents(all.filter((a) => a.arComponent)))
      .catch(() => {});
  }, [clientId, cardNumber]);

  useEffect(() => {
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cleanup() {
    cancelAnimationFrame(rafRef.current);
    mixerRef.current?.stopAllAction();
    mixerRef.current = null;
    controllerRef.current?.stopProcessVideo();
    controllerRef.current?.dispose?.();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (arContentVideoRef.current) {
      arContentVideoRef.current.pause();
      arContentVideoRef.current.src = '';
      arContentVideoRef.current = null;
    }
    controllerRef.current = null;
    streamRef.current = null;
  }

  const contactRows = [
    profile?.phone && { href: `tel:${profile.phone}` },
    profile?.publicEmail && { href: `mailto:${profile.publicEmail}` },
  ].filter(Boolean);
  const socialLinks = [
    profile?.instagramUrl && { key: 'instagram', label: 'Instagram', href: profile.instagramUrl },
    profile?.twitterUrl && { key: 'twitter', label: 'Twitter / X', href: profile.twitterUrl },
    profile?.whatsapp && { key: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/${profile.whatsapp.replace(/\D/g, '')}` },
  ].filter(Boolean);
  // No Instagram/Twitter/WhatsApp set -- fall back to WhatsApp via the
  // registration phone number rather than leaving the Social icon a dead
  // end for a scanner (see ArView.jsx's own copy of this same fallback).
  if (socialLinks.length === 0 && profile?.phone) {
    socialLinks.push({ key: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/${profile.phone.replace(/\D/g, '')}` });
  }
  const linkFor = {
    portfolio: profile?.portfolioUrl,
    // Falls back to the general Huntsworld site when this client hasn't
    // set their own listing link -- see ArView.jsx's own copy of this.
    huntsworld: profile?.huntsworldUrl || 'https://huntsworld.com/',
  };

  // Auto-starts as soon as profile+layout are loaded -- matches ArView.jsx's
  // own real behavior (no button, the camera just comes on), rather than
  // Mark 1's manual "Start test" button, which only existed for controlled
  // repeat testing.
  useEffect(() => {
    if (!profile || !layout || startedRef.current) return;
    startedRef.current = true;
    start().catch((err) => setLoadError(err.message || 'Could not start AR'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, layout]);

  async function start() {
    const targetImg = await buildArTargetImageEl(profile, layout, cardNumber);

    const compiler = new Compiler();
    await compiler.compileImageTargets([targetImg], () => {});
    const buffer = compiler.exportData();

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'environment' } });
    } catch (err) {
      setCameraError(err.message);
      return;
    }
    streamRef.current = stream;
    const video = videoRef.current;
    video.srcObject = stream;
    await new Promise((resolve) => {
      video.onloadedmetadata = () => {
        video.setAttribute('width', video.videoWidth);
        video.setAttribute('height', video.videoHeight);
        resolve();
      };
    });
    await video.play();

    const canvas = canvasRef.current;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(canvas.width, canvas.height, false);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1));
    const camera = new THREE.PerspectiveCamera();
    camera.matrixAutoUpdate = false;

    const anchorGroup = new THREE.Group();
    anchorGroup.visible = false;
    anchorGroup.matrixAutoUpdate = false;
    scene.add(anchorGroup);

    const modelGroup = new THREE.Group();
    const videoGroup = new THREE.Group();
    anchorGroup.add(modelGroup, videoGroup);

    let postMatrix = new THREE.Matrix4();
    const clock = new THREE.Clock();

    // ---- Pose smoothing --------------------------------------------------
    // mind-ar's own filterMinCF/filterBeta below already smooth the raw
    // homography, but what's left over after that (marginal viewing
    // angles, motion blur, brief partial occlusion of the card) still
    // showed up as visible shake/"hanging" once turned into a world
    // matrix and copied straight onto anchorGroup every update, since
    // there was previously no smoothing at all at that layer.
    //
    // ArView.jsx (the older QR-corner/POSIT tracking engine) already
    // solved exactly this problem for its own tracker: adaptive
    // blend-in (barely-moved deltas are almost certainly detection
    // noise and get damped hard; large deltas are real motion and get
    // tracked quickly), outlier rejection (an implausible one-frame
    // jump is more likely a bad read than the phone teleporting -- freeze
    // on the last good pose and give the next frame a chance to confirm),
    // and a short coast window so a single dropped frame doesn't flicker
    // content on/off. This ports that same proven strategy onto mind-ar's
    // decomposed world matrix (position/quaternion/scale) instead of
    // POSIT's rotation-matrix/translation-vector pair.
    const COAST_MS = 600; // keep the last-known pose rendered this long after tracking drops out, instead of flickering
    const POSE_SMOOTHING_MIN = 0.05; // blend-in per update when the pose barely moved (treat as noise, damp hard)
    const POSE_SMOOTHING_MAX = 0.3; // blend-in per update when the pose moved a lot (treat as real motion, track it)
    // Both thresholds are in "anchorGroup units", where 1.0 == the
    // tracked card's own width (see buildPostMatrix/layoutPctToLocal
    // above) -- NOT the same unit system as ArView.jsx's QR-side-length
    // thresholds, since this engine tracks the whole card rather than
    // just the QR corner. Starting points; may need real-device tuning.
    const JITTER_TRANSLATION_THRESHOLD = 0.01; // below this frame-to-frame move = sub-pixel detection noise
    const MAX_PLAUSIBLE_JUMP = 0.15; // above this in one update = a bad read (motion blur/occlusion), not real movement
    const MIN_PLAUSIBLE_ROTATION_SIMILARITY = 0.5; // |quat dot| below this = a >~120 degree flip in one update -- also a bad read

    let smoothedPos = null; // THREE.Vector3 | null -- null means "no confirmed pose yet"
    let smoothedQuat = null;
    let smoothedScale = null;
    let lastSeenAt = 0;
    const rawMatrix = new THREE.Matrix4();
    const rawPos = new THREE.Vector3();
    const rawQuat = new THREE.Quaternion();
    const rawScale = new THREE.Vector3();

    const controller = new Controller({
      inputWidth: video.videoWidth,
      inputHeight: video.videoHeight,
      // mind-ar's own stock defaults (filterMinCF: 0.001, filterBeta:
      // 1000) produced a visible, persistent shake in earlier testing.
      // Mark 1's initial fix went aggressive on smoothing (0.0001/100),
      // which cured raw jitter but trades real responsiveness for it --
      // pushed too far, that reads as content "catching up" to the
      // correct orientation after a beat rather than staying glued,
      // which can look like drift depending on viewing angle even though
      // nothing is actually wrong with the underlying tracking. This is
      // a middle ground between stock and that aggressive tuning --
      // still meaningfully smoother than default, less laggy than
      // Mark 1's value. The pose-smoothing pass above is the second,
      // independent layer that further stabilizes whatever noise this
      // first layer still lets through.
      filterMinCF: 0.0005,
      filterBeta: 300,
      onUpdate: (data) => {
        if (data.type !== 'updateMatrix') return;
        const { worldMatrix } = data;
        if (worldMatrix === null) return; // no detection this update -- coast/expire is handled in renderLoop below, don't touch the smoothed pose
        rawMatrix.fromArray(worldMatrix).multiply(postMatrix);
        rawMatrix.decompose(rawPos, rawQuat, rawScale);

        if (smoothedPos) {
          const jumpDist = smoothedPos.distanceTo(rawPos);
          const rotationSimilarity = Math.abs(smoothedQuat.dot(rawQuat));
          if (jumpDist > MAX_PLAUSIBLE_JUMP || rotationSimilarity < MIN_PLAUSIBLE_ROTATION_SIMILARITY) {
            // Implausible one-update jump -- freeze on the last good
            // pose rather than snap to a probably-bad reading; the next
            // update gets another chance to confirm before anything moves.
            lastSeenAt = performance.now();
            return;
          }
          const t = Math.min(1, jumpDist / JITTER_TRANSLATION_THRESHOLD);
          const alpha = POSE_SMOOTHING_MIN + (POSE_SMOOTHING_MAX - POSE_SMOOTHING_MIN) * t;
          smoothedPos.lerp(rawPos, alpha);
          smoothedQuat.slerp(rawQuat, alpha);
          smoothedScale.lerp(rawScale, alpha);
        } else {
          // First confirmed pose (or the first one after a real loss,
          // see the expiry branch in renderLoop) -- snap straight to it
          // instead of blending in from nothing.
          smoothedPos = rawPos.clone();
          smoothedQuat = rawQuat.clone();
          smoothedScale = rawScale.clone();
        }
        anchorGroup.matrix.compose(smoothedPos, smoothedQuat, smoothedScale);
        lastSeenAt = performance.now();
      },
    });
    controllerRef.current = controller;

    const { dimensions } = controller.addImageTargetsFromBuffer(buffer);
    const [markerWidth, markerHeight] = dimensions[0];
    postMatrix = buildPostMatrix(markerWidth, markerHeight);

    camera.projectionMatrix.fromArray(controller.getProjectionMatrix());
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

    const [mlx, mly, mlz] = layoutPctToLocal(layout.model || { x: 50, y: 50 }, markerWidth, markerHeight);
    modelGroup.position.set(mlx, mly, mlz);
    const [vlx, vly, vlz] = layoutPctToLocal(layout.video || { x: 50, y: -42 }, markerWidth, markerHeight);
    videoGroup.position.set(vlx, vly, vlz);

    // Fractions of the card's own width -- shared with arProjection.js
    // (used by ArScanPreview.jsx, the editor's live "Scan preview") so a
    // saved layout renders at the same relative size here as it did while
    // editing. This engine tracks the whole card rather than the QR
    // corner, so it can't reuse that file's position math (layoutPctToLocal
    // above is the whole-card equivalent), but "how wide is the banner
    // relative to the card" is true regardless of coordinate frame -- these
    // used to be separately hardcoded here (at 0.25, vs. the true 0.15 for
    // the banner), which is exactly why the banner rendered visibly larger
    // on a real scan than the editor's own preview showed it.
    const MODEL_BASE_W = MODEL_IMAGE_BASE_FRACTION;
    if (profile.arModelUrl) {
      if (profile.arModelType === 'image') {
        new THREE.TextureLoader().load(
          profile.arModelUrl,
          (tex) => {
            const aspect = tex.image.width / tex.image.height;
            const mesh = new THREE.Mesh(
              new THREE.PlaneGeometry(MODEL_BASE_W, MODEL_BASE_W / aspect),
              new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
            );
            applyTransform(mesh, layout.modelRotationX, layout.modelRotationY, layout.modelRotationZ, layout.modelScale);
            modelGroup.add(mesh);
          },
          undefined,
          (err) => setModelError(`Could not load the 3D model image: ${err.message || err}`)
        );
      } else {
        const onModelLoaded = (scene, animations) => {
          const box = new THREE.Box3().setFromObject(scene);
          const size = new THREE.Vector3();
          box.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const autoFit = MODEL_BASE_W / maxDim;
          scene.scale.setScalar(autoFit * (layout.modelScale ?? 1));
          applyTransform(scene, layout.modelRotationX, layout.modelRotationY, layout.modelRotationZ, null);
          modelGroup.add(scene);
          // Play any baked-in animation -- driven every frame from
          // renderLoop below via the shared clock.
          if (animations?.length) {
            const mixer = new THREE.AnimationMixer(scene);
            mixer.clipAction(animations[0]).play();
            mixerRef.current = mixer;
          }
        };
        const onModelError = (err) => setModelError(`Could not load the 3D model: ${err.message || err}`);

        if (profile.arModelType === 'fbx') {
          new FBXLoader().load(profile.arModelUrl, (fbx) => onModelLoaded(fbx, fbx.animations), undefined, onModelError);
        } else {
          new GLTFLoader().load(profile.arModelUrl, (gltf) => onModelLoaded(gltf.scene, gltf.animations), undefined, onModelError);
        }
      }
    }

    // No profile-photo fallback here -- see the matching note in ArView.jsx.
    const bannerUrl = profile.arBannerUrl || profile.arVideoUrl;
    const bannerType = profile.arBannerUrl ? profile.arBannerType : profile.arVideoUrl ? 'video' : null;
    const resolvedBannerUrl = bannerUrl;
    const VIDEO_BASE_W = VIDEO_BASE_FRACTION; // see the MODEL_BASE_W comment above -- shared with arProjection.js, not hardcoded
    const VIDEO_BASE_H = VIDEO_BASE_W / cardAspectFor(profile.cardShape); // shaped like the client's actual purchased card, not always landscape
    if (resolvedBannerUrl) {
      const addPlane = (texture) => {
        const geometry = new THREE.PlaneGeometry(VIDEO_BASE_W, VIDEO_BASE_H);
        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.set(layout.videoScaleX ?? 1, layout.videoScaleY ?? 1, 1);
        applyTransform(mesh, layout.videoRotationX, layout.videoRotationY, layout.videoRotationZ, null);
        videoGroup.add(mesh);
      };
      if (bannerType === 'video') {
        const v = document.createElement('video');
        v.crossOrigin = 'anonymous';
        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        v.src = resolvedBannerUrl;
        arContentVideoRef.current = v;
        v.play()
          .then(() => addPlane(new THREE.VideoTexture(v)))
          .catch((err) => setModelError(`Could not play the AR video: ${err.message}`));
      } else {
        new THREE.TextureLoader().load(resolvedBannerUrl, addPlane, undefined, (err) =>
          setModelError(`Could not load the AR banner image: ${err.message || err}`)
        );
      }
    }

    const pillDefs = [
      ...ELEMENTS.map((el) => ({ id: el.key, pos: layout[el.key] })),
      ...arComponents.map((c) => ({ id: `custom:${c.key}`, pos: layout.customElements?.[c.key] })),
    ].filter((p) => p.pos);
    pillLayoutRef.current = pillDefs.map((p) => ({
      id: p.id,
      local: new THREE.Vector3(...layoutPctToLocal(p.pos, markerWidth, markerHeight)),
    }));

    controller.dummyRun(video);
    controller.processVideo(video);

    const ndcHelper = new THREE.Vector3();
    function renderLoop() {
      // Coast through brief tracking dropouts (a frame or two of noise/
      // occlusion) instead of hiding content the instant one update comes
      // back empty -- same COAST_MS affordance as ArView.jsx's own coast
      // timer, just driven from the render loop's real clock instead of a
      // separate setInterval, since this loop already runs continuously.
      const tracked = Boolean(smoothedPos) && performance.now() - lastSeenAt <= COAST_MS;
      if (tracked !== anchorGroup.visible) {
        anchorGroup.visible = tracked;
        setVisible(tracked);
      }
      if (!tracked && smoothedPos) {
        // Actually lost (past the coast window), not just a brief gap --
        // drop the smoothed pose too, so re-acquiring later snaps to the
        // fresh reading instead of slowly blending in from a stale one.
        smoothedPos = null;
        smoothedQuat = null;
        smoothedScale = null;
      }

      mixerRef.current?.update(clock.getDelta());
      renderer.render(scene, camera);
      if (anchorGroup.visible && pillLayoutRef.current.length) {
        const cw = window.innerWidth;
        const ch = window.innerHeight;
        const project = (v) => {
          ndcHelper.copy(v).applyMatrix4(anchorGroup.matrix).project(camera);
          return { x: ((ndcHelper.x + 1) / 2) * cw, y: ((1 - ndcHelper.y) / 2) * ch, z: ndcHelper.z };
        };
        const next = pillLayoutRef.current.map(({ id, local }) => {
          const p = project(local);
          return { id, x: p.x, y: p.y, visible: p.z <= 1 };
        });
        setPillScreens(next);
      }
      rafRef.current = requestAnimationFrame(renderLoop);
    }
    renderLoop();
  }

  function applyTransform(obj, rotX, rotY, rotZ, scaleOverride) {
    if (scaleOverride != null) obj.scale.setScalar(scaleOverride);
    obj.rotation.order = 'YXZ';
    obj.rotation.set(THREE.MathUtils.degToRad(rotX ?? 0), THREE.MathUtils.degToRad(rotY ?? 0), THREE.MathUtils.degToRad(rotZ ?? 0));
  }

  function pillContent(el, iconUrl) {
    return (
      <div
        style={
          iconUrl
            ? { width: 64, height: 64, borderRadius: '50%', background: el.color, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.4)' }
            : { background: el.color, color: '#fff', padding: '12px 18px', borderRadius: 999, fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(0,0,0,0.4)' }
        }
      >
        {iconUrl ? <img src={iconUrl} alt={el.label} style={{ width: '60%', height: '60%', objectFit: 'contain' }} /> : el.label}
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={videoRef} muted playsInline style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <canvas
        ref={canvasRef}
        style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', transition: 'opacity 150ms', opacity: visible ? 1 : 0 }}
      />

      {loadError && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, color: '#fff', textAlign: 'center', zIndex: 30 }}>
          <p style={{ maxWidth: 320 }}>{loadError}</p>
          <button onClick={() => window.location.reload()} style={{ width: 'auto' }}>
            Try again
          </button>
          <Link to={`/c/${clientId}`} style={{ color: 'var(--holo-cyan, #5eead4)' }}>
            View the normal profile instead
          </Link>
        </div>
      )}

      {cameraError && !loadError && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, color: '#fff', textAlign: 'center', zIndex: 30 }}>
          <p style={{ maxWidth: 320 }}>Camera access is needed for AR: {cameraError}</p>
          <button onClick={() => window.location.reload()} style={{ width: 'auto' }}>
            Try again
          </button>
          <Link to={`/c/${clientId}`} style={{ color: 'var(--holo-cyan, #5eead4)' }}>
            View the normal profile instead
          </Link>
        </div>
      )}

      {modelError && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(180,30,30,0.85)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 12, maxWidth: '85vw', zIndex: 15 }}>
          {modelError}
        </div>
      )}

      {!visible && !cameraError && !loadError && (
        <div style={{ position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '10px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, textAlign: 'center', zIndex: 10 }}>
          Point your camera at the HuntsTAG QR code
        </div>
      )}

      {visible &&
        pillScreens.map((s) => {
          if (!s.visible) return null;
          const style = { position: 'fixed', left: 0, top: 0, transform: `translate3d(${s.x}px, ${s.y}px, 0) translate(-50%, -50%)`, willChange: 'transform' };
          if (s.id.startsWith('custom:')) {
            const key = s.id.slice('custom:'.length);
            const def = arComponents.find((c) => c.key === key);
            if (!def) return null;
            const href = profile?.customAttributes?.[key];
            // No value filled in for this admin-defined AR link -- don't
            // show a dead pill for it.
            if (!href) return null;
            const el = { label: def.label || key, color: '#22d3ee' };
            const content = pillContent(el, icons?.[key]);
            return (
              <div key={s.id} style={style}>
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                    {content}
                  </a>
                ) : (
                  content
                )}
              </div>
            );
          }

          const el = ELEMENTS.find((e) => e.key === s.id);
          if (!el) return null;
          const iconUrl = icons?.[el.key];
          const isSocial = el.key === 'social';
          const href = el.key === 'contact' ? contactRows[0]?.href : linkFor[el.key] || undefined;
          // Nothing filled in for this built-in slot -- skip the dead
          // pill entirely (same rule as the custom: branch above).
          if (isSocial ? !socialLinks.length : !href) return null;
          const content = pillContent(el, iconUrl);

          return (
            <div key={s.id} style={style}>
              {isSocial ? (
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setSocialMenuOpen((v) => !v)} disabled={!socialLinks.length} style={{ display: 'block', width: 'auto', padding: 0, border: 'none', background: 'transparent' }}>
                    {content}
                  </button>
                  {socialMenuOpen && socialLinks.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6, background: '#171717', borderRadius: 10, overflow: 'hidden', boxShadow: '0 6px 20px rgba(0,0,0,0.5)', minWidth: 140, zIndex: 5 }}>
                      {socialLinks.map((soc) => (
                        <a key={soc.key} href={soc.href} target="_blank" rel="noopener noreferrer" onClick={() => setSocialMenuOpen(false)} style={{ display: 'block', padding: '10px 14px', color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          {soc.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ) : href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                  {content}
                </a>
              ) : (
                content
              )}
            </div>
          );
        })}

      <Link
        to={`/c/${clientId}`}
        style={{ position: 'fixed', top: 16, left: 16, zIndex: 20, width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, textDecoration: 'none' }}
        aria-label="Close AR view"
      >
        ✕
      </Link>
    </div>
  );
}
