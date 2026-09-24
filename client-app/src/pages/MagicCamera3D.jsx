import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, getClientId, isLoggedIn } from '../api.js';
import { Compiler } from 'mind-ar/src/image-target/compiler.js';
import { Controller } from 'mind-ar/src/image-target/controller.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { buildCacheKey, getCachedBuffer, setCachedBuffer } from '../lib/mindCache.js';
import { PILL_ICONS } from '../lib/pillIcons.jsx';

// Magic Camera 3D -- a SEPARATE page from MagicCamera.jsx (the existing,
// working video scanner), deliberately not merged into it. Scans only
// Magic Art / Magic Business Card targets that have a 3D model set
// (doc.modelUrl/modelType -- see backend/models/MagicArt.js and
// MagicBusinessCard.js) and renders ONLY the model -- no video plane at
// all, unlike MagicCamera.jsx where a model plays additively alongside a
// required video. Priority rule (explicit product decision): a target with
// a model belongs here; MagicCamera.jsx's own targets.forEach loop is
// untouched by this file, so its existing "video always plays, model is
// additive" behavior for anyone NOT using this page is completely
// unaffected.
//
// Everything below the model-vs-video split (camera setup, mind-ar
// Controller/Compiler, IndexedDB compile-buffer caching, the pose-
// smoothing lerp/slerp layer, the black-frame diagnostic, the scoped-mode
// AR component pills, the "don't let a client scan someone else's card"
// restriction) is copied verbatim from MagicCamera.jsx -- same proven,
// already-tuned tracking engine, just without the video-plane code path.
// See that file's own top comment for the full rationale behind each of
// those pieces; not re-explained here to avoid the two copies drifting
// out of sync in their reasoning (only in the one real difference: no
// video).

function buildPostMatrix(markerWidth, markerHeight) {
  const position = new THREE.Vector3(markerWidth / 2, markerWidth / 2 + (markerHeight - markerWidth) / 2, 0);
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(markerWidth, markerWidth, markerWidth);
  const m = new THREE.Matrix4();
  m.compose(position, quaternion, scale);
  return m;
}

const MAX_TARGET_DIM = 800;
const MIN_TARGET_DIM = 260;
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

// Which targets this page scans -- Magic Art packs and Magic Business
// Cards that have a 3D model set, and ONLY those (no video-only piece has
// anything to show here). Magic Art still respects the admin-active-or-
// fallback rule MagicCamera.jsx uses; Street Art has no model field at
// all, so it's not part of this page.
function getModelTargets(pieces, cards) {
  const active = (pieces || []).filter((p) => p.active);
  const art = (active.length ? active : (pieces || [])).filter((p) => p.modelUrl);
  const cardModels = (cards || []).filter((c) => c.modelUrl);
  return [...art, ...cardModels];
}

export default function MagicCamera3D() {
  // Present only when reached via /magic-camera-3d/:clientId -- a
  // specific client's own card, same "choose AR or Magic" entry point
  // MagicCamera.jsx's scoped mode uses.
  const { clientId } = useParams();
  const myClientId = isLoggedIn() ? getClientId() : null;
  const [searchParams] = useSearchParams();
  const cardNumber = searchParams.get('card') || undefined;
  const [pieces, setPieces] = useState(null);
  const [cards, setCards] = useState(null);
  const [scopedCard, setScopedCard] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [magicComponentDefs, setMagicComponentDefs] = useState([]);
  const [socialMenuOpen, setSocialMenuOpen] = useState(false);
  const [loadError, setLoadError] = useState('');
  const startedRef = useRef(false);

  const [status, setStatus] = useState('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [cameraDiagnostic, setCameraDiagnostic] = useState('unknown');

  const tuning = { filterMinCF: 0.0005, filterBeta: 300, warmupTolerance: 3, missTolerance: 1 };

  const containerRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const controllerRef = useRef(null);
  const rafRef = useRef(null);
  const diagnosticIntervalRef = useRef(null);
  const streamRef = useRef(null);
  const pillLayoutRef = useRef([]);
  const [pillScreens, setPillScreens] = useState([]);
  const dimensionsRef = useRef(null);
  const cameraPromiseRef = useRef(null);
  const cameraAbortedRef = useRef(false);
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
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Camera did not start within 20s -- it may be in use by another app/tab, or permission is stuck. Try closing other camera tabs and reloading.')), 20000)
      );
      cameraPromiseRef.current = Promise.race([attempt, timeout]);
    }
    return cameraPromiseRef.current;
  }

  useEffect(() => {
    ensureCameraStarted();

    if (clientId) {
      api
        .getPublicMagicCard(clientId, cardNumber)
        .then(setScopedCard)
        .catch(() => setScopedCard(null));
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
        setLoadError(err.message);
        setCards([]);
      });
  }, [clientId, cardNumber]);

  useEffect(() => {
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!clientId || scopedCard === undefined || startedRef.current) return;
    if (!scopedCard?.modelUrl) {
      cameraAbortedRef.current = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }
    startedRef.current = true;
    handleStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, scopedCard]);

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
    controllerRef.current = null;
    streamRef.current = null;
  }

  const compilePrewarmRef = useRef(null);
  function getCompiledBuffer(targets, onProgress) {
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

      const settled = await Promise.allSettled(targets.map((p) => prepareTargetImage(p.imageUrl, maxDim)));
      const targetImgs = [];
      const loadedTargets = [];
      settled.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          targetImgs.push(result.value);
          loadedTargets.push(targets[i]);
        } else {
          console.warn('[MagicCamera3D] Skipping a target whose image failed to load:', targets[i]?.imageUrl, result.reason);
        }
      });
      if (!targetImgs.length) throw new Error('Could not load the target image');
      const compiler = new Compiler();
      await compiler.compileImageTargets(targetImgs, (percent) => {
        onProgress?.(`Compiling tracking data... ${Math.round(percent)}%`);
      });
      const buffer = compiler.exportData();
      setCachedBuffer(cacheKey, buffer).catch(() => { });
      return { buffer, targets: loadedTargets };
    })();
    compilePrewarmRef.current = { key: cacheKey, promise };
    return promise;
  }

  async function handleStart() {
    const initialTargets = clientId ? (scopedCard?.modelUrl ? [scopedCard] : []) : getModelTargets(pieces, cards);
    if (!initialTargets.length || !containerRef.current) return;
    setLoadError('');
    setStatus('compiling');
    setStatusMessage('Preparing the tracking targets...');

    try {
      const compilePromise = getCompiledBuffer(initialTargets, setStatusMessage);
      const [{ buffer, targets }] = await Promise.all([compilePromise, ensureCameraStarted()]);
      const video = cameraVideoRef.current;

      setStatus('starting');
      setStatusMessage('Loading the tracker...');

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

      const targetEntries = targets.map(() => {
        const anchorGroup = new THREE.Group();
        anchorGroup.visible = false;
        anchorGroup.matrixAutoUpdate = false;
        scene.add(anchorGroup);
        return {
          anchorGroup,
          postMatrix: new THREE.Matrix4(),
          initialized: false,
          targetMatrix: new THREE.Matrix4(),
          modelMixer: null,
          stuckFrames: 0,
        };
      });

      const _tPos = new THREE.Vector3();
      const _tQuat = new THREE.Quaternion();
      const _tScale = new THREE.Vector3();
      const _cPos = new THREE.Vector3();
      const _cQuat = new THREE.Quaternion();
      const _cScale = new THREE.Vector3();
      const POSE_SMOOTHING_MIN = 0.25;
      const POSE_SMOOTHING_MAX = 1.0;
      const JITTER_TRANSLATION_THRESHOLD = 6;
      const FULL_SPEED_JUMP = 50;
      const MAX_PLAUSIBLE_JUMP = 400;
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
          const target = targets[targetIndex];
          // Same restriction as MagicCamera.jsx's own gallery mode: a
          // logged-in client can track their OWN card's model here, but
          // not someone else's -- Magic Art has no `clientId` and is
          // never affected.
          const isForeignCard = Boolean(!clientId && myClientId && target?.clientId && target.clientId !== myClientId);
          if (worldMatrix !== null && isForeignCard) {
            entry.anchorGroup.visible = false;
            if (!foundFlags[targetIndex]) {
              foundFlags[targetIndex] = true;
              setStatus('scanning');
              setStatusMessage('This Magic Business Card belongs to a different account -- you can only scan your own.');
            }
            return;
          }
          if (worldMatrix !== null) {
            const m = new THREE.Matrix4();
            m.fromArray(worldMatrix);
            m.multiply(entry.postMatrix);
            if (!entry.initialized) {
              entry.anchorGroup.matrix.copy(m);
              entry.targetMatrix.copy(m);
              entry.initialized = true;
            } else {
              entry.targetMatrix.copy(m);
            }
            entry.anchorGroup.visible = true;
            if (!foundFlags[targetIndex]) {
              foundFlags[targetIndex] = true;
              setStatus('found');
              setStatusMessage('Found -- being tracked.');
            }
          } else {
            entry.anchorGroup.visible = false;
            if (foundFlags[targetIndex]) {
              foundFlags[targetIndex] = false;
              if (!foundFlags.some(Boolean)) {
                setStatus('scanning');
                setStatusMessage(clientId ? 'Point the camera at this card to track it.' : 'Point the camera at a Magic Art image or Magic Business Card with a 3D model to track it.');
              }
            }
          }
        },
      });
      controllerRef.current = controller;

      const { dimensions } = controller.addImageTargetsFromBuffer(buffer);
      if (clientId) dimensionsRef.current = dimensions[0];

      camera.projectionMatrix.fromArray(controller.getProjectionMatrix());
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

      // ---- Per-target 3D model ONLY -- no video plane on this page at
      // all (see this file's own top comment for why). Loading logic is
      // identical to MagicCamera.jsx's own model block.
      targets.forEach((piece, i) => {
        const entry = targetEntries[i];
        const [markerWidth, markerHeight] = dimensions[i];
        entry.postMatrix = buildPostMatrix(markerWidth, markerHeight);

        if (!piece.modelUrl) return; // shouldn't happen -- getModelTargets already filters to modelUrl-having pieces
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
        const onModelError = (err) => {
          console.warn('[MagicCamera3D] Could not load a 3D model:', piece.modelUrl, err);
          setLoadError('Could not load a 3D model -- try again shortly.');
        };
        if (piece.modelType === 'fbx') {
          new FBXLoader().load(piece.modelUrl, (fbx) => onModelLoaded(fbx, fbx.animations), undefined, onModelError);
        } else {
          new GLTFLoader().load(piece.modelUrl, (gltf) => onModelLoaded(gltf.scene, gltf.animations), undefined, onModelError);
        }
      });

      controller.dummyRun(video);
      controller.processVideo(video);

      const ndcHelper = new THREE.Vector3();
      const worldHelper = new THREE.Vector3();
      const centerHelper = new THREE.Vector3();
      const modelClock = new THREE.Clock();
      function renderLoop() {
        const modelDelta = modelClock.getDelta();
        targetEntries.forEach((entry) => {
          if (entry.initialized && entry.anchorGroup.visible) {
            entry.targetMatrix.decompose(_tPos, _tQuat, _tScale);
            entry.anchorGroup.matrix.decompose(_cPos, _cQuat, _cScale);
            const jumpDist = _cPos.distanceTo(_tPos);
            const implausible = jumpDist > MAX_PLAUSIBLE_JUMP;
            if (implausible && entry.stuckFrames < MAX_CONSECUTIVE_REJECTS) {
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
      setStatusMessage(clientId ? 'Point the camera at this card to track it.' : 'Point the camera at a Magic Art image or Magic Business Card with a 3D model to track it.');

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
      setLoadError(err.message || 'Could not start Magic Camera 3D');
      cleanup();
    }
  }

  function handleStop() {
    cleanup();
    setStatus('idle');
    setCameraDiagnostic('unknown');
  }

  const activeTargets = clientId ? (scopedCard?.modelUrl ? [scopedCard] : []) : getModelTargets(pieces, cards);
  const hasArt = activeTargets.length > 0;
  const stillLoading = clientId ? scopedCard === undefined : !pieces || !cards;

  useEffect(() => {
    if (clientId || stillLoading || !hasArt) return;
    getCompiledBuffer(activeTargets).catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, stillLoading, hasArt]);

  const contactHref = profile?.phone ? `tel:${profile.phone}` : profile?.publicEmail ? `mailto:${profile.publicEmail}` : null;
  const socialLinks = [
    profile?.instagramUrl && { key: 'instagram', label: 'Instagram', href: profile.instagramUrl },
    profile?.twitterUrl && { key: 'twitter', label: 'Twitter / X', href: profile.twitterUrl },
    profile?.whatsapp && { key: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/${profile.whatsapp.replace(/\D/g, '')}` },
  ].filter(Boolean);
  const portfolioHref = profile?.portfolioUrl || null;
  const huntsworldHref = profile?.huntsworldUrl || null;

  if (clientId) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={cameraVideoRef} muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>

        {(loadError || (!stillLoading && !hasArt)) && (
          <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, color: '#fff', textAlign: 'center', zIndex: 30 }}>
            <p style={{ maxWidth: 320 }}>{loadError || "This card doesn't have a 3D model set up yet."}</p>
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
          const rotStyle = { '--rot': s.rotation ? `${s.rotation}deg` : '0deg' };
          if (s.id === 'contact' && contactHref) {
            return (
              <div key={s.id} style={style}>
                <a href={contactHref} className="magic-pill-btn" style={rotStyle}>
                  {PILL_ICONS.contact}Call
                </a>
              </div>
            );
          }
          if (s.id === 'portfolio' && portfolioHref) {
            return (
              <div key={s.id} style={style}>
                <a href={portfolioHref} target="_blank" rel="noopener noreferrer" className="magic-pill-btn" style={rotStyle}>
                  {PILL_ICONS.portfolio}Portfolio
                </a>
              </div>
            );
          }
          if (s.id === 'social' && socialLinks.length > 0) {
            return (
              <div key={s.id} style={{ ...style, textAlign: 'center' }}>
                <button type="button" onClick={() => setSocialMenuOpen((v) => !v)} className="magic-pill-btn" style={rotStyle}>
                  {PILL_ICONS.social}Social
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
                <a href={huntsworldHref} target="_blank" rel="noopener noreferrer" className="magic-pill-btn" style={rotStyle}>
                  {PILL_ICONS.huntsworld}Huntsworld
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
                <a href={href} target="_blank" rel="noopener noreferrer" className="magic-pill-btn" style={rotStyle}>
                  {PILL_ICONS.custom}{def.label}
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
          <p style={{ color: '#fff', maxWidth: 320 }}>Nothing has a 3D model set up yet -- check back soon.</p>
        </div>
      )}

      {!stillLoading && hasArt && status === 'idle' && (
        <div style={centeredOverlayStyle}>
          {loadError && <p style={{ color: '#f87171', maxWidth: 320, fontSize: 13 }}>{loadError}</p>}
          <p className="magic-camera-start-note">Point your camera at a Magic piece with a 3D model, then tap to start</p>
          <button onClick={handleStart} className="magic-camera-start-btn" aria-label="Start Magic Camera 3D" title="Start Magic Camera 3D">
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
          <p style={{ color: '#fff', maxWidth: 320 }}>{loadError || 'Could not start Magic Camera 3D'}</p>
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
