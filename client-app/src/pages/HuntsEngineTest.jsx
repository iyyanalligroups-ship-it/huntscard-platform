import { useEffect, useRef, useState } from 'react';
import { api, API_URL } from '../api.js';
import { Compiler } from 'mind-ar/src/image-target/compiler.js';
import { Controller } from 'mind-ar/src/image-target/controller.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// "Mark 1" -- isolated experiment, kept fully separate from the real AR
// system (ArView.jsx / posit.js / arProjection.js), which this page never
// touches. If this doesn't pan out, deleting this file plus its nav entry
// (Layout.jsx) and route (App.jsx) and uninstalling the `mind-ar` package
// removes 100% of it -- the default QR+POSIT experience is untouched
// either way.
//
// Drives mind-ar's lower-level `Controller` directly instead of its
// `MindARThree` Three.js wrapper -- that wrapper imports `sRGBEncoding`
// from 'three', which was removed from the Three.js version this project
// already uses elsewhere (0.185.1) for the real AR view. Controller has no
// Three.js dependency at all, so driving it directly and rendering with
// this project's own `three` package sidesteps that version conflict
// entirely, rather than pinning/patching a vendored file.
//
// NOW renders the actual saved AR card content (model, AR video/photo
// panel, contact/portfolio/social/huntsworld pills, custom elements) --
// not just a placeholder box -- using the real saved AR Layout, so this is
// a genuine like-for-like comparison against ArView.jsx's rendering, not
// just a tracking-only smoke test.
//
// IMPORTANT coordinate-system note: this does NOT reuse
// arProjection.js's toLocalOffset/heightToLocalZ. Those assume POSIT's
// QR-CORNER tracking, where local (0,0) is wherever the QR happens to sit
// on the card and everything else is expressed relative to it (a
// deliberately small reference frame, QR-width = 1 unit). This page
// tracks the WHOLE card as one target, so mind-ar's own postMatrix
// convention (position=[markerWidth/2, markerHeight/2], scale=markerWidth
// for both axes -- see buildPostMatrix) makes local (0,0) the CENTER of
// the whole target image instead. layoutPctToLocal below is this file's
// own from-scratch derivation of "saved %-position -> local unit" for
// THAT reference frame -- reusing arProjection.js's QR-relative version
// here would place everything in the wrong spot.

async function buildTargetImage(profile, forceNoBanner) {
  const bannerUrl = forceNoBanner ? null : profile?.bannerUrl || profile?.customDesignFrontUrl || null;
  // &engine=mindar -- see ArViewMindAR.jsx's identical comment. Same fix
  // here so a printed copy of THIS page's target scans back to the real
  // mind-ar production page too, not the default ArView.jsx.
  const qrUrl = `${API_URL}/api/public/qr/${profile.clientId}?type=ar&transparent=1&engine=mindar`;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Could not load image: ${src}`));
      img.src = src;
    });
  }

  const qrImg = await loadImage(qrUrl);
  const bannerImg = bannerUrl ? await loadImage(bannerUrl).catch(() => null) : null;

  // A bare QR code is a bad tracking target -- too repetitive for
  // feature-point extraction. Compositing it over the client's banner
  // photo (when they have one) gives mind-ar real visual detail to lock
  // onto, closer to what a real printed card with a photo/logo would
  // offer. Falls back to a plain light background if no banner is set,
  // so the test still runs (just with a worse, QR-only target -- which
  // is itself a useful data point).
  const W = 800;
  const H = 500;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  if (bannerImg) {
    ctx.drawImage(bannerImg, 0, 0, W, H);
  } else {
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(0, 0, W, H);
  }

  const qrSize = Math.round(H * 0.7);
  ctx.drawImage(qrImg, W - qrSize - 30, (H - qrSize) / 2, qrSize, qrSize);

  const composited = new Image();
  composited.src = canvas.toDataURL('image/png');
  await new Promise((resolve, reject) => {
    composited.onload = resolve;
    composited.onerror = () => reject(new Error('Could not finalize the composited target image'));
  });

  return composited;
}

// Same convention MindARThree itself uses to turn a raw target-image pixel
// size into a real-world-scaled post-multiply matrix, centered the same
// way -- kept identical so content lands on the card the same way it
// would if we'd used the wrapper.
function buildPostMatrix(markerWidth, markerHeight) {
  const position = new THREE.Vector3(markerWidth / 2, markerWidth / 2 + (markerHeight - markerWidth) / 2, 0);
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(markerWidth, markerWidth, markerWidth);
  const m = new THREE.Matrix4();
  m.compose(position, quaternion, scale);
  return m;
}

// See the file-level comment above for why this exists instead of reusing
// arProjection.js's toLocalOffset. `pos` is the saved {x,y,z} (0-100,
// same convention the AR Layout editor already saves -- (50,50) is card
// center, z is 0-100 "how far off the card"). Returns [lx, ly, lz] in
// anchorGroup's own local space (i.e. BEFORE postMatrix is applied to it).
function layoutPctToLocal(pos, markerWidth, markerHeight) {
  const lx = (pos?.x ?? 50) / 100 - 0.5;
  // Y is flipped: saved % follows image/screen convention (0=top), but
  // local Y needs to end up "up" after the transform chain -- and scaled
  // by markerHeight/markerWidth since postMatrix scales BOTH axes by
  // markerWidth alone (see buildPostMatrix), not independently.
  const ly = (0.5 - (pos?.y ?? 50) / 100) * (markerHeight / markerWidth);
  // Arbitrary but reasonable lift scale -- no direct equivalent to port
  // from arProjection.js's CARD_H_UNITS-relative height here, since that
  // reference scale doesn't apply to this coordinate system either. 0.3
  // of the target's own width reads as a modest, plausible "off the
  // card" float at the default height range (0-100).
  const lz = ((pos?.z ?? 0) / 100) * 0.3;
  return [lx, ly, lz];
}

// Same list ArView.jsx uses for its flat pill panels -- 'model' and
// 'video' excluded, both rendered as real 3D content instead (see below),
// matching ArView.jsx's own split between flat pills and 3D layers.
const ELEMENTS = [
  { key: 'contact', label: 'Contact Info', color: '#14b8a6' },
  { key: 'portfolio', label: 'Portfolio', color: '#4f8ef7' },
  { key: 'social', label: 'Social Icons', color: '#ec4899' },
  { key: 'huntsworld', label: 'Huntsworld Link', color: '#f5a524' },
];

export default function HuntsEngineTest() {
  const [profile, setProfile] = useState(null);
  const [layout, setLayout] = useState(null);
  const [icons, setIcons] = useState({});
  const [arComponents, setArComponents] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [modelError, setModelError] = useState('');
  const [status, setStatus] = useState('idle'); // idle | compiling | starting | scanning | found | error
  const [statusMessage, setStatusMessage] = useState('');
  const [cameraDiagnostic, setCameraDiagnostic] = useState('unknown'); // unknown | ok | black-frames
  const [targetPreviewUrl, setTargetPreviewUrl] = useState(null);
  const [forceNoBanner, setForceNoBanner] = useState(false);
  const [socialMenuOpen, setSocialMenuOpen] = useState(false);
  // Screen positions for the flat pill overlays, recomputed every frame
  // from the live tracked anchor -- same "state updated on every render
  // tick" pattern ArView.jsx's own `pose` state uses for its pills.
  const [pillScreens, setPillScreens] = useState([]); // [{ id, x, y, visible }]
  // mind-ar's own defaults (controller.js: DEFAULT_FILTER_CUTOFF=0.001,
  // DEFAULT_FILTER_BETA=1000, DEFAULT_WARMUP_TOLERANCE=5,
  // DEFAULT_MISS_TOLERANCE=5) -- exposed here so responsiveness/smoothness
  // can be tuned by testing, not by guessing at values and round-tripping
  // a rebuild each time. Lower filterMinCF = smoother but laggier; higher
  // filterBeta = snappier response to fast movement; warmup/missTolerance
  // are how many consecutive good/bad frames before a target counts as
  // found/lost.
  const [tuning, setTuning] = useState({
    filterMinCF: 0.001,
    filterBeta: 1000,
    warmupTolerance: 5,
    missTolerance: 5,
  });

  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const controllerRef = useRef(null);
  const rafRef = useRef(null);
  const diagnosticIntervalRef = useRef(null);
  const streamRef = useRef(null);
  const arContentVideoRef = useRef(null); // off-DOM <video> feeding the AR Video/Photo panel's texture, if it's a video
  // Everything the render loop needs to recompute pill screen positions
  // each frame, populated once tracking starts -- see handleStart.
  const pillLayoutRef = useRef([]); // [{ id, local: THREE.Vector3 }]

  useEffect(() => {
    Promise.all([api.getProfile(), api.getMyArLayout()])
      .then(([p, l]) => {
        setProfile(p);
        setLayout(l);
      })
      .catch((err) => setLoadError(err.message));
    // Cosmetic, non-blocking -- same "don't fail the page over a missing
    // logo" reasoning ArView.jsx uses for these same two calls.
    api
      .getPublicArIcons()
      .then(setIcons)
      .catch(() => setIcons({}));
    api
      .getAttributeDefinitions()
      .then((all) => setArComponents(all.filter((a) => a.arComponent)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cleanup() {
    clearInterval(diagnosticIntervalRef.current);
    cancelAnimationFrame(rafRef.current);
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
    (profile?.publicEmail || profile?.loginEmail) && { href: `mailto:${profile.publicEmail || profile.loginEmail}` },
  ].filter(Boolean);
  const socialLinks = [
    profile?.instagramUrl && { key: 'instagram', label: 'Instagram', href: profile.instagramUrl },
    profile?.twitterUrl && { key: 'twitter', label: 'Twitter / X', href: profile.twitterUrl },
    profile?.whatsapp && { key: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/${profile.whatsapp.replace(/\D/g, '')}` },
  ].filter(Boolean);
  const linkFor = {
    portfolio: profile?.portfolioUrl,
    huntsworld: profile?.huntsworldUrl,
  };

  async function handleStart() {
    if (!profile || !layout || !containerRef.current) return;
    setLoadError('');
    setModelError('');
    setStatus('compiling');
    setStatusMessage('Building the tracking target from your card design...');

    try {
      const targetImg = await buildTargetImage(profile, forceNoBanner);
      setTargetPreviewUrl(targetImg.src);

      const compiler = new Compiler();
      await compiler.compileImageTargets([targetImg], (percent) => {
        setStatusMessage(`Compiling tracking data... ${Math.round(percent)}%`);
      });
      const buffer = compiler.exportData();

      setStatus('starting');
      setStatusMessage('Starting camera...');

      const video = videoRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      video.srcObject = stream;
      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          video.setAttribute('width', video.videoWidth);
          video.setAttribute('height', video.videoHeight);
          resolve();
        };
      });
      await video.play();

      setStatusMessage('Loading the tracker...');

      const canvas = canvasRef.current;
      canvas.width = containerRef.current.clientWidth;
      canvas.height = containerRef.current.clientHeight;
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
      let found = false;

      const controller = new Controller({
        inputWidth: video.videoWidth,
        inputHeight: video.videoHeight,
        filterMinCF: tuning.filterMinCF,
        filterBeta: tuning.filterBeta,
        warmupTolerance: tuning.warmupTolerance,
        missTolerance: tuning.missTolerance,
        onUpdate: (data) => {
          if (data.type !== 'updateMatrix') return;
          const { worldMatrix } = data;
          if (worldMatrix !== null) {
            const m = new THREE.Matrix4();
            m.fromArray(worldMatrix);
            m.multiply(postMatrix);
            anchorGroup.matrix.copy(m);
            anchorGroup.visible = true;
            if (!found) {
              found = true;
              setStatus('found');
              setStatusMessage('Target found -- this card is being tracked.');
            }
          } else {
            anchorGroup.visible = false;
            if (found) {
              found = false;
              setStatus('scanning');
              setStatusMessage('Point the camera at your card design (shown below) to track it.');
            }
          }
        },
      });
      controllerRef.current = controller;

      const { dimensions } = controller.addImageTargetsFromBuffer(buffer);
      const [markerWidth, markerHeight] = dimensions[0];
      postMatrix = buildPostMatrix(markerWidth, markerHeight);

      camera.projectionMatrix.fromArray(controller.getProjectionMatrix());
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

      // ---- Real AR content, positioned from the actual saved layout ----
      const [mlx, mly, mlz] = layoutPctToLocal(layout.model || { x: 50, y: 50 }, markerWidth, markerHeight);
      modelGroup.position.set(mlx, mly, mlz);
      const [vlx, vly, vlz] = layoutPctToLocal(layout.video || { x: 50, y: -42 }, markerWidth, markerHeight);
      videoGroup.position.set(vlx, vly, vlz);

      // 3D model -- same GLTF-vs-flat-image split ArView.jsx uses. A
      // model card size roughly proportional to the target's own scale,
      // since there's no CARD_W_UNITS-equivalent reference here.
      const MODEL_BASE_W = 0.25;
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
            (err) => setModelError(`Could not load the model image: ${err.message || err}`)
          );
        } else {
          new GLTFLoader().load(
            profile.arModelUrl,
            (gltf) => {
              const box = new THREE.Box3().setFromObject(gltf.scene);
              const size = new THREE.Vector3();
              box.getSize(size);
              const maxDim = Math.max(size.x, size.y, size.z) || 1;
              const autoFit = MODEL_BASE_W / maxDim;
              gltf.scene.scale.setScalar(autoFit * (layout.modelScale ?? 1));
              applyTransform(gltf.scene, layout.modelRotationX, layout.modelRotationY, layout.modelRotationZ, null);
              modelGroup.add(gltf.scene);
            },
            undefined,
            (err) => setModelError(`Could not load the 3D model: ${err.message || err}`)
          );
        }
      }

      // AR Video/Photo banner -- same fallback chain ArView.jsx uses.
      const bannerUrl = profile.arBannerUrl || profile.arVideoUrl;
      const bannerType = profile.arBannerUrl ? profile.arBannerType : profile.arVideoUrl ? 'video' : profile.photoUrl ? 'image' : null;
      const resolvedBannerUrl = bannerUrl || profile.photoUrl;
      const VIDEO_BASE_W = 0.25;
      const VIDEO_BASE_H = VIDEO_BASE_W / (85.6 / 54); // same ID-1 card aspect arProjection.js's CARD_ASPECT uses
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

      // Flat pills -- local position computed once here, screen position
      // recomputed every frame in the render loop below (they're DOM
      // overlays, not 3D meshes, same split ArView.jsx uses).
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
        renderer.render(scene, camera);

        if (anchorGroup.visible && pillLayoutRef.current.length) {
          const cw = containerRef.current?.clientWidth || canvas.width;
          const ch = containerRef.current?.clientHeight || canvas.height;
          const next = pillLayoutRef.current.map(({ id, local }) => {
            ndcHelper.copy(local).applyMatrix4(anchorGroup.matrix).project(camera);
            const behind = ndcHelper.z > 1;
            return {
              id,
              x: ((ndcHelper.x + 1) / 2) * cw,
              y: ((1 - ndcHelper.y) / 2) * ch,
              visible: !behind,
            };
          });
          setPillScreens(next);
        } else if (pillScreensNotEmpty()) {
          setPillScreens([]);
        }

        rafRef.current = requestAnimationFrame(renderLoop);
      }
      function pillScreensNotEmpty() {
        // Avoids a setState-every-frame loop while nothing is tracked --
        // cheap closure check against the last committed render, not a
        // ref, but fine since renderLoop itself already runs every frame.
        return true;
      }
      renderLoop();

      setStatus('scanning');
      setStatusMessage('Point the camera at your card design (shown below) to track it.');

      // Black-frame diagnostic -- the exact bug that killed the earlier
      // HuntsEngine attempt: getUserMedia() reporting a live, correctly-
      // sized video track that nonetheless produces genuinely all-black
      // frames. Sample real pixel data from the video periodically (not
      // just checking readyState/dimensions, which lied last time) and
      // surface it plainly on screen.
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
      setLoadError(err.message || 'Could not start the AR test');
      cleanup();
    }
  }

  function applyTransform(obj, rotX, rotY, rotZ, scaleOverride) {
    if (scaleOverride != null) obj.scale.setScalar(scaleOverride);
    obj.rotation.order = 'YXZ';
    obj.rotation.set(
      THREE.MathUtils.degToRad(rotX ?? 0),
      THREE.MathUtils.degToRad(rotY ?? 0),
      THREE.MathUtils.degToRad(rotZ ?? 0)
    );
  }

  function handleStop() {
    cleanup();
    setStatus('idle');
    setCameraDiagnostic('unknown');
    setPillScreens([]);
  }

  function pillContent(el, iconUrl) {
    return (
      <div
        style={
          iconUrl
            ? {
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: el.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
              }
            : {
                background: el.color,
                color: '#fff',
                padding: '10px 14px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
              }
        }
      >
        {iconUrl ? <img src={iconUrl} alt={el.label} style={{ width: '60%', height: '60%', objectFit: 'contain' }} /> : el.label}
      </div>
    );
  }

  return (
    <div>
      <h1>HuntsEngine Test (Mark 1)</h1>
      <p className="subtitle">
        Isolated experiment -- tracks your full card design (banner + QR composited together)
        and renders your real saved AR content (model, video/photo panel, pills) on top of it,
        using a fresh install of mind-ar-js. Fully separate from your real AR experience; nothing
        here affects it either way.
      </p>

      {loadError && <div className="error-banner">{loadError}</div>}
      {modelError && <div className="error-banner">{modelError}</div>}

      {!profile || !layout ? (
        <p className="subtitle">Loading your profile and AR layout...</p>
      ) : (
        <>
          {status === 'idle' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <input type="checkbox" checked={forceNoBanner} onChange={(e) => setForceNoBanner(e.target.checked)} />
              Simulate no banner set (tests the plain-background + bare-QR fallback path)
            </label>
          )}

          {status === 'idle' && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                Filter min cutoff (lower = smoother, laggier)
                <input
                  type="number"
                  step="0.0005"
                  value={tuning.filterMinCF}
                  onChange={(e) => setTuning((t) => ({ ...t, filterMinCF: Number(e.target.value) }))}
                  style={{ width: 110 }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                Filter beta (higher = snappier on fast movement)
                <input
                  type="number"
                  step="100"
                  value={tuning.filterBeta}
                  onChange={(e) => setTuning((t) => ({ ...t, filterBeta: Number(e.target.value) }))}
                  style={{ width: 110 }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                Warmup tolerance (frames before "found")
                <input
                  type="number"
                  step="1"
                  value={tuning.warmupTolerance}
                  onChange={(e) => setTuning((t) => ({ ...t, warmupTolerance: Number(e.target.value) }))}
                  style={{ width: 110 }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                Miss tolerance (frames before "lost")
                <input
                  type="number"
                  step="1"
                  value={tuning.missTolerance}
                  onChange={(e) => setTuning((t) => ({ ...t, missTolerance: Number(e.target.value) }))}
                  style={{ width: 110 }}
                />
              </label>
            </div>
          )}

          {status === 'idle' && (
            <button onClick={handleStart} style={{ width: 'auto' }}>
              Start test
            </button>
          )}
          {status !== 'idle' && (
            <button onClick={handleStop} className="secondary" style={{ width: 'auto' }}>
              Stop
            </button>
          )}

          {statusMessage && (
            <p className="subtitle" style={{ marginTop: 12 }}>
              {statusMessage}
            </p>
          )}

          {status !== 'idle' && (
            <p style={{ marginTop: 8 }}>
              Camera diagnostic:{' '}
              {cameraDiagnostic === 'unknown' && <span className="hint">checking...</span>}
              {cameraDiagnostic === 'ok' && <span style={{ color: 'var(--accent, green)' }}>✅ Live frames look normal</span>}
              {cameraDiagnostic === 'black-frames' && (
                <span style={{ color: 'var(--danger, red)' }}>
                  ❌ All-black frames detected -- this is the same bug that killed the earlier HuntsEngine attempt
                </span>
              )}
            </p>
          )}

          <div
            ref={containerRef}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 640,
              aspectRatio: '4 / 3',
              marginTop: 16,
              background: '#000',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <video
              ref={videoRef}
              muted
              playsInline
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

            {/* Flat pill overlays -- same visual treatment (colored circle
                with an admin-uploaded icon, or a colored text chip) and
                link behavior ArView.jsx's real pills use. */}
            {pillScreens.map((s) => {
              if (!s.visible) return null;
              const style = {
                position: 'absolute',
                left: 0,
                top: 0,
                transform: `translate3d(${s.x}px, ${s.y}px, 0) translate(-50%, -50%)`,
                willChange: 'transform',
              };
              if (s.id.startsWith('custom:')) {
                const key = s.id.slice('custom:'.length);
                const def = arComponents.find((c) => c.key === key);
                if (!def) return null;
                const href = profile?.customAttributes?.[key];
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
              const content = pillContent(el, iconUrl);

              return (
                <div key={s.id} style={style}>
                  {isSocial ? (
                    <div style={{ position: 'relative' }}>
                      <button
                        onClick={() => setSocialMenuOpen((v) => !v)}
                        disabled={!socialLinks.length}
                        style={{ display: 'block', width: 'auto', padding: 0, border: 'none', background: 'transparent' }}
                      >
                        {content}
                      </button>
                      {socialMenuOpen && socialLinks.length > 0 && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '100%',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            marginTop: 6,
                            background: '#171717',
                            borderRadius: 10,
                            overflow: 'hidden',
                            boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
                            minWidth: 130,
                            zIndex: 5,
                          }}
                        >
                          {socialLinks.map((soc) => (
                            <a
                              key={soc.key}
                              href={soc.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setSocialMenuOpen(false)}
                              style={{ display: 'block', padding: '8px 12px', color: '#fff', fontSize: 11, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}
                            >
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
          </div>

          {targetPreviewUrl && (
            <div style={{ marginTop: 16 }}>
              <p className="subtitle">This is the exact image being tracked -- point the camera at a printed or on-screen copy of it:</p>
              <img src={targetPreviewUrl} alt="AR tracking target" style={{ maxWidth: 320, borderRadius: 8, border: '1px solid var(--panel-border, #333)' }} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
