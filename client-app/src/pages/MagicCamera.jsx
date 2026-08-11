import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Compiler } from 'mind-ar/src/image-target/compiler.js';
import { Controller } from 'mind-ar/src/image-target/controller.js';
import * as THREE from 'three';

// Magic Camera -- scans every ACTIVE admin-uploaded Magic Art pack at
// once (see backend/models/MagicArt.js, "Set as active" on the admin
// app's Magic Art page) and automatically plays whichever pack's video
// matches the printed/on-screen image the camera is actually pointed at.
// Falls back to every complete pack if none have been explicitly marked
// active yet, so older setups keep working unchanged.
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

// The admin's uploaded image could be a large photo. mind-ar's compiler
// runs feature extraction near input resolution, so an uncapped image
// risks slow/hung compilation on real Android hardware. Downscale via
// canvas if needed; mind-ar's Compiler accepts a canvas the same as an
// Image.
const MAX_TARGET_DIM = 1200;

async function prepareTargetImage(imageUrl) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Could not load the target image'));
    i.src = imageUrl;
  });

  const longest = Math.max(img.width, img.height);
  if (longest <= MAX_TARGET_DIM) return img;

  const scale = MAX_TARGET_DIM / longest;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// Which packs this scans -- whatever the admin explicitly activated; if
// none have been touched yet, every complete pack (so nothing regresses
// to "scans nothing" for an untouched older setup).
function getActiveTargets(pieces) {
  if (!pieces) return [];
  const active = pieces.filter((p) => p.active);
  return active.length ? active : pieces.filter((p) => p.imageUrl && p.videoUrl);
}

export default function MagicCamera() {
  const [pieces, setPieces] = useState(null); // MagicArt[] | null while loading
  const [loadError, setLoadError] = useState('');

  const [status, setStatus] = useState('idle'); // idle | compiling | starting | scanning | found | error
  const [statusMessage, setStatusMessage] = useState('');
  const [cameraDiagnostic, setCameraDiagnostic] = useState('unknown'); // unknown | ok | black-frames

  // ArViewMindAR.jsx's already-tuned "middle ground" values, not mind-ar's
  // jitterier stock defaults (filterMinCF 0.001 / filterBeta 1000). Fixed,
  // not user-editable -- the tuning UI was test-only.
  const tuning = { filterMinCF: 0.0005, filterBeta: 300, warmupTolerance: 5, missTolerance: 5 };

  const containerRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const controllerRef = useRef(null);
  const rafRef = useRef(null);
  const diagnosticIntervalRef = useRef(null);
  const streamRef = useRef(null);
  const arVideoElsRef = useRef([]); // off-DOM <video> elements, one per active target, feeding each overlay's VideoTexture

  useEffect(() => {
    api
      .getPublicMagicArt()
      .then(setPieces)
      .catch((err) => setLoadError(err.message));
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
    arVideoElsRef.current.forEach((v) => {
      v.pause();
      v.src = '';
    });
    arVideoElsRef.current = [];
    controllerRef.current = null;
    streamRef.current = null;
  }

  async function handleStart() {
    const targets = getActiveTargets(pieces);
    if (!targets.length || !containerRef.current) return;
    setLoadError('');
    setStatus('compiling');
    setStatusMessage('Preparing the tracking targets...');

    try {
      const targetImgs = await Promise.all(targets.map((p) => prepareTargetImage(p.imageUrl)));

      const compiler = new Compiler();
      await compiler.compileImageTargets(targetImgs, (percent) => {
        setStatusMessage(`Compiling tracking data... ${Math.round(percent)}%`);
      });
      const buffer = compiler.exportData();

      setStatus('starting');
      setStatusMessage('Starting camera...');

      const video = cameraVideoRef.current;
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

      // One anchor group per target -- each gets its own tracked
      // transform (postMatrix filled in once dimensions are known below)
      // and its own video-plane child, entirely independent of the others.
      const targetEntries = targets.map(() => {
        const anchorGroup = new THREE.Group();
        anchorGroup.visible = false;
        anchorGroup.matrixAutoUpdate = false;
        scene.add(anchorGroup);
        return { anchorGroup, postMatrix: new THREE.Matrix4() };
      });
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
            entry.anchorGroup.matrix.copy(m);
            entry.anchorGroup.visible = true;
            if (!foundFlags[targetIndex]) {
              foundFlags[targetIndex] = true;
              setStatus('found');
              setStatusMessage(`Art ${targetIndex + 1} found -- being tracked.`);
            }
          } else {
            entry.anchorGroup.visible = false;
            if (foundFlags[targetIndex]) {
              foundFlags[targetIndex] = false;
              // Only drop back to "scanning" once NOTHING is tracked --
              // avoids flicker if tracking briefly overlaps while
              // switching between two nearby pieces.
              if (!foundFlags.some(Boolean)) {
                setStatus('scanning');
                setStatusMessage('Point the camera at a Magic Art image to track it.');
              }
            }
          }
        },
      });
      controllerRef.current = controller;

      const { dimensions } = controller.addImageTargetsFromBuffer(buffer);

      camera.projectionMatrix.fromArray(controller.getProjectionMatrix());
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

      // ---- Per-target overlay video plane, sized to cover the FULL
      // target image ---- buildPostMatrix scales all three axes uniformly
      // by markerWidth, so a child's local-space X spans exactly 1 unit
      // for the full image width, but Y must span markerHeight/markerWidth
      // units to represent the full image height. Centered at local
      // (0,0,0), which buildPostMatrix maps to the image's true center --
      // no offset group needed.
      const arVideoEls = [];
      targets.forEach((piece, i) => {
        const entry = targetEntries[i];
        const [markerWidth, markerHeight] = dimensions[i];
        entry.postMatrix = buildPostMatrix(markerWidth, markerHeight);

        const planeWidth = 1;
        const planeHeight = markerHeight / markerWidth;

        const arVideo = document.createElement('video');
        arVideo.crossOrigin = 'anonymous';
        arVideo.muted = true;
        arVideo.loop = true;
        arVideo.playsInline = true;
        arVideo.src = piece.videoUrl;
        arVideoEls.push(arVideo);
        arVideo
          .play()
          .then(() => {
            const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
            const texture = new THREE.VideoTexture(arVideo);
            // Display-only crop, chosen in the admin's crop tool (see
            // MagicArt.jsx) -- a plain UV offset/repeat on the texture,
            // the video FILE itself is untouched. Three.js UV space has
            // Y=0 at the bottom, but the stored crop uses image-space
            // Y=0 at the top, hence the flip here.
            const crop = piece.videoCrop || { x: 0, y: 0, width: 1, height: 1 };
            texture.offset.set(crop.x, 1 - crop.y - crop.height);
            texture.repeat.set(crop.width, crop.height);
            const material = new THREE.MeshBasicMaterial({
              map: texture,
              transparent: true,
              side: THREE.DoubleSide,
            });
            entry.anchorGroup.add(new THREE.Mesh(geometry, material));
          })
          .catch((err) => setLoadError(`Could not play the overlay video for Art ${i + 1}: ${err.message}`));
      });
      arVideoElsRef.current = arVideoEls;

      controller.dummyRun(video);
      controller.processVideo(video);

      function renderLoop() {
        renderer.render(scene, camera);
        rafRef.current = requestAnimationFrame(renderLoop);
      }
      renderLoop();

      setStatus('scanning');
      setStatusMessage('Point the camera at a Magic Art image to track it.');

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

  const activeTargets = getActiveTargets(pieces);
  const hasArt = activeTargets.length > 0;

  return (
    <div>
      <h1>Magic Camera</h1>
      <p className="subtitle">
        Point your camera at any Magic Art image (see the Magic Art page on the home site) to see it come
        alive -- it automatically recognizes which one you're pointed at.
      </p>

      {loadError && <div className="error-banner">{loadError}</div>}

      {!pieces ? (
        <p className="subtitle">Loading Magic Art...</p>
      ) : !hasArt ? (
        <p className="subtitle">Nothing has been uploaded yet -- check back soon.</p>
      ) : (
        <>
          {status === 'idle' && (
            <button onClick={handleStart} style={{ width: 'auto' }}>
              Start Magic Camera
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
                <span style={{ color: 'var(--danger, red)' }}>❌ All-black frames detected</span>
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
              ref={cameraVideoRef}
              muted
              playsInline
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          </div>
        </>
      )}
    </div>
  );
}
