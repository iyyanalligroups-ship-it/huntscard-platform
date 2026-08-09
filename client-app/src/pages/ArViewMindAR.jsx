import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, API_URL } from '../api.js';
import { Compiler } from 'mind-ar/src/image-target/compiler.js';
import { Controller } from 'mind-ar/src/image-target/controller.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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

async function buildTargetImage(profile) {
  const bannerUrl = profile?.bannerUrl || profile?.customDesignFrontUrl || null;
  // &engine=mindar so scanning this specific printed/on-screen target's QR
  // (as a REAL QR code, not just as an AR tracking target) lands back on
  // this same engine -- otherwise it opens the default ArView.jsx, which
  // is exactly the mix-up that caused confusing "still unstable" reports
  // earlier while actually testing the wrong page.
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
    composited.onerror = () => reject(new Error('Could not finalize the tracking target'));
  });

  return composited;
}

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
  const linkFor = {
    portfolio: profile?.portfolioUrl,
    huntsworld: profile?.huntsworldUrl,
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
    const targetImg = await buildTargetImage(profile);

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
      // Mark 1's value. May need further real-device tuning either way.
      filterMinCF: 0.0005,
      filterBeta: 300,
      onUpdate: (data) => {
        if (data.type !== 'updateMatrix') return;
        const { worldMatrix } = data;
        if (worldMatrix !== null) {
          const m = new THREE.Matrix4();
          m.fromArray(worldMatrix);
          m.multiply(postMatrix);
          anchorGroup.matrix.copy(m);
          anchorGroup.visible = true;
          setVisible(true);
        } else {
          anchorGroup.visible = false;
          setVisible(false);
        }
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
          (err) => setModelError(`Could not load the 3D model image: ${err.message || err}`)
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

    const bannerUrl = profile.arBannerUrl || profile.arVideoUrl;
    const bannerType = profile.arBannerUrl ? profile.arBannerType : profile.arVideoUrl ? 'video' : profile.photoUrl ? 'image' : null;
    const resolvedBannerUrl = bannerUrl || profile.photoUrl;
    const VIDEO_BASE_W = 0.25;
    const VIDEO_BASE_H = VIDEO_BASE_W / (86 / 54);
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
      renderer.render(scene, camera);
      if (anchorGroup.visible && pillLayoutRef.current.length) {
        const cw = window.innerWidth;
        const ch = window.innerHeight;
        const next = pillLayoutRef.current.map(({ id, local }) => {
          ndcHelper.copy(local).applyMatrix4(anchorGroup.matrix).project(camera);
          return { id, x: ((ndcHelper.x + 1) / 2) * cw, y: ((1 - ndcHelper.y) / 2) * ch, visible: ndcHelper.z <= 1 };
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
