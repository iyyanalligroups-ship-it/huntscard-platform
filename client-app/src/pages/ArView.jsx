import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import jsQR from 'jsqr';
import posit1 from 'js-aruco2/src/posit1.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { api } from '../api.js';

const { POS } = posit1;

/**
 * The live camera AR view -- what actually opens when someone scans the AR
 * QR code (PublicProfile.jsx renders this instead of the plain profile
 * when ?ar=1 is present). Tracks the QR code itself as the marker (no
 * per-client image-marker setup needed, see plan notes) and floats the
 * same elements/positions the client set up in ArLayout.jsx on top of the
 * live camera feed.
 *
 * Coordinate model: real 3D, not a flat 2D overlay. The QR's 4 detected
 * corners feed js-aruco2's POSIT implementation (the same algorithm
 * square-marker AR libraries use) to recover the marker plane's actual
 * rotation + translation relative to the camera each frame. Each saved
 * element position (x/y percent, same convention ArLayout.jsx's card
 * editor uses, with the QR occupying QR_FRACTION of the card's width) is
 * converted to a point on that plane and perspective-projected to real
 * screen coordinates -- so panels respond correctly to the camera moving
 * in 3D (walking around the card), not just rotating in the image plane.
 */

const REF_W = 300; // baseline CSS pixel sizing for panels at "1x" (QR-plane) depth -- not used for positioning anymore
const QR_FRACTION = 0.15; // must match QR_FRACTION in ArLayout.jsx
const MODEL_SIZE = 1; // treat the QR's own side length as 1 unit -- everything else is relative to it
// Matches the real physical card -- ISO/IEC 7810 ID-1 (86mm x 54mm, the
// standard credit-card-shaped size, same as the actual NFC tap card),
// NOT a paper business card (3.5in x 2in, which is what this used to be
// set to -- wrong reference for this product). Must stay in sync with
// both editors' own canvas aspect ratio, since saved percentage positions
// are only meaningful relative to the same shape.
const CARD_ASPECT = 86 / 54;
const CARD_W_UNITS = 1 / QR_FRACTION;
const CARD_H_UNITS = CARD_W_UNITS / CARD_ASPECT;
// Base size (before the panel's own saved videoScale) for the AR
// Video/Photo 3D card -- shaped like the real card (CARD_ASPECT) but a
// bit smaller than the full card, so it reads as its own floating object
// next to the card rather than an exact overlapping duplicate.
const VIDEO_PLANE_BASE_W = CARD_W_UNITS * 0.4;
const VIDEO_PLANE_BASE_H = VIDEO_PLANE_BASE_W / CARD_ASPECT;

// Converts a saved (x%, y%) into a local offset (in the same QR-plane
// units as MODEL_SIZE) relative to the QR's OWN saved position -- not a
// fixed 50/50 center. The QR's own detected corners already define local
// (0,0), so this just expresses "how far is this element from wherever
// the QR itself is," matching what ArLayout.jsx's editor shows.
function toLocalOffset(pos, qrPos) {
  return [((pos.x - qrPos.x) / 100) * CARD_W_UNITS, -((pos.y - qrPos.y) / 100) * CARD_H_UNITS];
}
const ASSUMED_FOV_DEG = 62; // typical phone rear-camera vertical FOV -- not a real calibration, see plan notes
const COAST_MS = 600; // keep last-known position visible this long after the QR drops out of frame
// How much of each new pose reading to blend in per frame (0-1). Raw
// per-frame POSIT output is noisy enough (small QR-corner pixel jitter)
// that panels visibly shake without this -- lower = smoother but laggier.
const POSE_SMOOTHING = 0.35;

// Rotation can't be smoothed by averaging matrix cells directly (that
// produces a non-orthogonal, warped matrix) -- convert to a quaternion,
// SLERP that, then convert back for use in projectLocalPoint.
function matrixToQuaternion(m) {
  const [[m00, m01, m02], [m10, m11, m12], [m20, m21, m22]] = m;
  const trace = m00 + m11 + m22;
  let x, y, z, w, s;
  if (trace > 0) {
    s = 0.5 / Math.sqrt(trace + 1);
    w = 0.25 / s;
    x = (m21 - m12) * s;
    y = (m02 - m20) * s;
    z = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  return [x, y, z, w];
}

function quaternionToMatrix([x, y, z, w]) {
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    [1 - (yy + zz), xy - wz, xz + wy],
    [xy + wz, 1 - (xx + zz), yz - wx],
    [xz - wy, yz + wx, 1 - (xx + yy)],
  ];
}

function slerp(qa, qb, t) {
  let [ax, ay, az, aw] = qa;
  const [bx, by, bz, bw] = qb;
  let cosom = ax * bx + ay * by + az * bz + aw * bw;
  // Take the shorter path between the two orientations.
  if (cosom < 0) {
    cosom = -cosom;
    ax = -ax; ay = -ay; az = -az; aw = -aw;
  }
  if (cosom > 0.9995) {
    // Nearly identical -- linear interpolation is a fine approximation and avoids a divide-by-~0.
    return normalizeQuat([ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t, aw + (bw - aw) * t]);
  }
  const omega = Math.acos(cosom);
  const sinom = Math.sin(omega);
  const scaleA = Math.sin((1 - t) * omega) / sinom;
  const scaleB = Math.sin(t * omega) / sinom;
  return [ax * scaleA + bx * scaleB, ay * scaleA + by * scaleB, az * scaleA + bz * scaleB, aw * scaleA + bw * scaleB];
}

function normalizeQuat([x, y, z, w]) {
  const len = Math.hypot(x, y, z, w) || 1;
  return [x / len, y / len, z / len, w / len];
}

// Projects a point on the marker plane (in the same MODEL_SIZE units,
// z=0) through a POSIT pose into real screen pixel coordinates, plus a
// relative scale factor (1.0 at the QR's own depth, <1 further away,
// >1 closer) so panel size responds to real perspective/foreshortening.
function projectLocalPoint(pose, focalPx, centerX, centerY, [lx, ly, lz]) {
  const move = [0, 1, 2].map(
    (j) => pose.translation[j] + pose.rotation[j][0] * lx + pose.rotation[j][1] * ly + pose.rotation[j][2] * lz
  );
  if (move[2] <= 0) return null; // behind the camera -- shouldn't normally happen for a visible marker
  const screenX = (focalPx * move[0]) / move[2];
  const screenY = (focalPx * move[1]) / move[2];
  return {
    x: centerX + screenX,
    y: centerY - screenY, // POSIT's model space is Y-up; screen space is Y-down
    scale: pose.translation[2] / move[2],
  };
}

// The 3D model ('model' key) is NOT in this list -- it's rendered by a
// separate Three.js layer (see threeRef/updateModel below), not as flat
// HTML like everything here. Every other saved element is a flat
// billboarded panel positioned the same way.
const ELEMENTS = [
  { key: 'video', label: 'AR Video / Photo', color: '#8b5cf6' },
  { key: 'contact', label: 'Contact Info', color: '#14b8a6' },
  { key: 'portfolio', label: 'Portfolio', color: '#4f8ef7' },
  { key: 'social', label: 'Social Icons', color: '#ec4899' },
  { key: 'huntsworld', label: 'Huntsworld Link', color: '#f5a524' },
];

// Fills [cw,ch] from the video's native frame the same way CSS
// object-fit:cover would, so the canvas always shows a full-bleed feed.
function drawCover(ctx, video, cw, ch) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  const videoRatio = vw / vh;
  const canvasRatio = cw / ch;
  let sx, sy, sw, sh;
  if (videoRatio > canvasRatio) {
    sh = vh;
    sw = vh * canvasRatio;
    sx = (vw - sw) / 2;
    sy = 0;
  } else {
    sw = vw;
    sh = vw / canvasRatio;
    sx = 0;
    sy = (vh - sh) / 2;
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
}

export default function ArView({ clientId }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const detectorRef = useRef(null);
  const lastSeenRef = useRef(0);
  const positRef = useRef(null); // POS.Posit instance, rebuilt on resize (focal length depends on canvas size)
  const focalPxRef = useRef(0);
  const smoothRef = useRef(null); // { quat: [x,y,z,w], translation: [x,y,z] } -- previous smoothed pose
  const threeCanvasRef = useRef(null);
  const threeRef = useRef(null); // { renderer, scene, camera, modelGroup }, created once the canvas is sized
  const loadedModelRef = useRef(null); // the loaded gltf.scene, kept here in case it arrives before threeRef does
  const autoFitScaleRef = useRef(1); // baseline targetSize/maxDim computed once at load -- lets the transform effect below re-apply modelScale without re-deriving it from an already-scaled bounding box
  const videoPlaneRef = useRef(null); // the THREE.Mesh for the AR Video/Photo 3D card, once arVideoUrl/photoUrl exists
  const arContentVideoRef = useRef(null); // off-DOM <video> element feeding the VideoTexture, if arVideoUrl is set (not the camera-feed video -- that's videoRef)
  const layoutRef = useRef(null); // mirrors `layout` state -- needed inside the camera effect's stable closure, see applyCorners

  const [profile, setProfile] = useState(null);
  const [layout, setLayout] = useState(null);
  const [icons, setIcons] = useState(null); // admin-managed logo per attribute -- see ArIcon model. {} once loaded if none set.
  const [loadError, setLoadError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [pose, setPose] = useState(null); // { rotation: number[3][3], translation: number[3] }
  const [visible, setVisible] = useState(false);
  const [socialMenuOpen, setSocialMenuOpen] = useState(false);
  const [modelError, setModelError] = useState(''); // surfaced on-screen -- a silent console.error here was impossible to diagnose on a phone with no devtools attached

  useEffect(() => {
    Promise.all([api.getPublicProfile(clientId), api.getPublicArLayout(clientId)])
      .then(([p, l]) => {
        setProfile(p);
        setLayout(l);
      })
      .catch((err) => setLoadError(err.message));
    // Separate from the critical profile/layout fetch above -- a logo is a
    // cosmetic nice-to-have, so a failure here shouldn't block the AR view
    // (falls back to the plain colored text pills instead).
    api
      .getPublicArIcons()
      .then(setIcons)
      .catch(() => setIcons({}));
  }, [clientId]);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // This view fetches its layout once on mount -- fine for a fresh scan,
  // but a tab left open across an edit-in-another-tab session (very much
  // how this got tested) would otherwise keep showing whatever was saved
  // when IT loaded, which looks exactly like "my save didn't apply".
  // Re-check periodically and whenever the tab regains focus so an
  // already-open AR view self-heals without a manual reload.
  useEffect(() => {
    function refetchLayout() {
      api.getPublicArLayout(clientId).then(setLayout).catch(() => {});
    }
    function onVisible() {
      if (document.visibilityState === 'visible') refetchLayout();
    }
    const id = setInterval(refetchLayout, 5000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [clientId]);

  // Applies the CURRENT saved rotation/scale to whatever model is already
  // loaded -- separate from the loading effect below so a layout re-fetch
  // (see the polling effect above) can update orientation/scale on an
  // already-loaded model without needing to reload the whole GLB. Same
  // rotation the editor's X/Y/Z buttons set via <model-viewer>'s
  // orientation="{roll}deg {pitch}deg {yaw}deg" -- model-viewer applies
  // yaw(Y) then pitch(X) then roll(Z), which is Three.js's 'YXZ' Euler
  // order, not the default 'XYZ'.
  function applyModelTransform() {
    const scene = loadedModelRef.current;
    if (!scene) return;
    const customScale = layoutRef.current?.modelScale ?? 1;
    scene.scale.setScalar(autoFitScaleRef.current * customScale);
    const rotX = layoutRef.current?.modelRotationX ?? 0;
    const rotY = layoutRef.current?.modelRotationY ?? 0;
    const rotZ = layoutRef.current?.modelRotationZ ?? 0;
    scene.rotation.order = 'YXZ';
    scene.rotation.set(THREE.MathUtils.degToRad(rotX), THREE.MathUtils.degToRad(rotY), THREE.MathUtils.degToRad(rotZ));
  }

  useEffect(() => {
    applyModelTransform();
  }, [layout?.modelRotationX, layout?.modelRotationY, layout?.modelRotationZ, layout?.modelScale]);

  // Load the 3D model once its URL is known -- independent of the camera
  // effect below, and of whichever order camera-permission vs.
  // profile-fetch happen to resolve in.
  useEffect(() => {
    // Clear whatever was there before immediately, not just on success --
    // otherwise a re-upload that's slow to load (or fails, e.g. a dropped
    // network mid-load) leaves the OLD model rendering, which looks
    // exactly like "my new model didn't take" even though it's actually
    // just still loading (or genuinely failed, surfaced below).
    loadedModelRef.current = null;
    if (threeRef.current) threeRef.current.modelGroup.clear();
    setModelError('');
    if (!profile?.arModelUrl) return;
    let cancelled = false;
    new GLTFLoader().load(
      profile.arModelUrl,
      (gltf) => {
        if (cancelled) return;
        // Normalize scale roughly to the card's own unit scale so an
        // arbitrarily-authored GLB (could be modeled in meters, cm,
        // anything) shows up at a reasonable size relative to the QR --
        // not physically accurate, just a sane default. Computed once here
        // (before any scale is applied) and kept in autoFitScaleRef so the
        // transform effect below can re-derive scale later without ever
        // measuring an already-scaled bounding box.
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        autoFitScaleRef.current = CARD_W_UNITS * 0.25 / maxDim;

        loadedModelRef.current = gltf.scene;
        applyModelTransform();
        if (threeRef.current) {
          threeRef.current.modelGroup.clear();
          threeRef.current.modelGroup.add(gltf.scene);
        }
      },
      undefined,
      (err) => {
        console.error('[ArView] failed to load 3D model', err);
        if (!cancelled) setModelError('3D model failed to load: ' + (err?.message || 'unknown error'));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [profile?.arModelUrl]);

  // Same idea as applyModelTransform above, for the AR Video/Photo panel's
  // own saved X/Y/Z rotation + scale -- static per-frame-independent
  // orientation, matching how the 3D model's own rotation already works
  // (set once here, not tracked to the camera's viewpoint every frame).
  function applyVideoTransform() {
    const mesh = videoPlaneRef.current;
    if (!mesh) return;
    const scale = layoutRef.current?.videoScale ?? 1;
    mesh.scale.setScalar(scale);
    const rotX = layoutRef.current?.videoRotationX ?? 0;
    const rotY = layoutRef.current?.videoRotationY ?? 0;
    const rotZ = layoutRef.current?.videoRotationZ ?? 0;
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(THREE.MathUtils.degToRad(rotX), THREE.MathUtils.degToRad(rotY), THREE.MathUtils.degToRad(rotZ));
  }

  useEffect(() => {
    applyVideoTransform();
  }, [layout?.videoRotationX, layout?.videoRotationY, layout?.videoRotationZ, layout?.videoScale]);

  // Loads whichever media exists as a real 3D card -- a video (fed by an
  // off-DOM <video> element via VideoTexture) or a static photo, in that
  // priority order, same as the flat-panel fallback used to. No media at
  // all -> the flat icon/text pill (ELEMENTS.map below) handles it instead,
  // this effect leaves videoGroup empty and does nothing further.
  useEffect(() => {
    videoPlaneRef.current = null;
    if (threeRef.current) threeRef.current.videoGroup.clear();
    if (arContentVideoRef.current) {
      arContentVideoRef.current.pause();
      arContentVideoRef.current.src = '';
      arContentVideoRef.current = null;
    }
    let cancelled = false;

    function addPlane(texture) {
      if (cancelled) return;
      const geometry = new THREE.PlaneGeometry(VIDEO_PLANE_BASE_W, VIDEO_PLANE_BASE_H);
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material);
      videoPlaneRef.current = mesh;
      applyVideoTransform();
      if (threeRef.current) {
        threeRef.current.videoGroup.clear();
        threeRef.current.videoGroup.add(mesh);
      }
    }

    if (profile?.arVideoUrl) {
      const videoEl = document.createElement('video');
      videoEl.muted = true;
      videoEl.loop = true;
      videoEl.playsInline = true;
      videoEl.src = profile.arVideoUrl;
      // Autoplay can be rejected before any user gesture on some browsers
      // -- the texture just stays on its first/blank frame until playback
      // actually starts, not worth surfacing as an error.
      videoEl.play().catch(() => {});
      arContentVideoRef.current = videoEl;
      addPlane(new THREE.VideoTexture(videoEl));
    } else if (profile?.photoUrl) {
      new THREE.TextureLoader().load(profile.photoUrl, addPlane, undefined, (err) => {
        console.error('[ArView] failed to load AR photo texture', err);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [profile?.arVideoUrl, profile?.photoUrl]);

  useEffect(() => {
    let stream;
    let cancelled = false;

    function resizeCanvas() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      // Focal length (in pixels) depends on canvas size, so the Posit
      // instance -- which is constructed with a fixed focal length --
      // needs rebuilding whenever the canvas resizes.
      const fovRad = (ASSUMED_FOV_DEG * Math.PI) / 180;
      focalPxRef.current = canvas.height / (2 * Math.tan(fovRad / 2));
      positRef.current = new POS.Posit(MODEL_SIZE, focalPxRef.current);

      // Keep the (optional) 3D model layer's renderer/camera in sync with
      // the same canvas size and FOV assumption the flat panels' own
      // projection math uses, so both layers agree on one virtual camera.
      const threeCanvas = threeCanvasRef.current;
      if (threeCanvas) {
        if (!threeRef.current) {
          try {
            const renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, alpha: true, antialias: true });
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(ASSUMED_FOV_DEG, canvas.width / canvas.height, 0.01, 100);
            const modelGroup = new THREE.Group();
            scene.add(modelGroup);
            const videoGroup = new THREE.Group();
            scene.add(videoGroup);
            // Basic lighting so a GLB with a standard/PBR material isn't rendered pitch black.
            scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
            const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
            dirLight.position.set(1, 1, 1);
            scene.add(dirLight);
            threeRef.current = { renderer, scene, camera, modelGroup, videoGroup };
            if (loadedModelRef.current) modelGroup.add(loadedModelRef.current);
            if (videoPlaneRef.current) videoGroup.add(videoPlaneRef.current);
          } catch (err) {
            // A WebGL context can fail to create on some devices/browsers
            // (context limit already hit, GPU blocklisted, etc.) -- without
            // this, that failure was silent and looked identical to "the
            // model just isn't there."
            console.error('[ArView] failed to create 3D renderer', err);
            setModelError('3D rendering unavailable on this browser: ' + (err.message || err));
            return;
          }
        }
        const { renderer, camera } = threeRef.current;
        renderer.setSize(canvas.width, canvas.height, false);
        camera.aspect = canvas.width / canvas.height;
        camera.fov = ASSUMED_FOV_DEG;
        camera.updateProjectionMatrix();
      }
    }

    // Positions the 3D model at the same camera-space point the flat
    // panels' projectLocalPoint would compute for its saved (x%, y%), and
    // renders the scene -- same pose data as the flat panels, consumed as
    // a real 3D transform instead of a 2D projection. The model's own
    // rotation is left at identity (billboard-style, like the flat
    // panels and the reference videos' avatar) -- only its position
    // responds to the pose, which still produces correct parallax/depth
    // as the camera moves, since the object's position relative to the
    // fixed virtual camera changes correctly every frame.
    function updateModel(rotation, translation) {
      const three = threeRef.current;
      if (!three || !three.modelGroup.children.length) return;
      const qrPos = layoutRef.current?.qr || { x: 50, y: 50 };
      const modelPos = layoutRef.current?.model || { x: 50, y: 35 };
      const [lx, ly] = toLocalOffset(modelPos, qrPos);
      const move = [0, 1, 2].map((j) => translation[j] + rotation[j][0] * lx + rotation[j][1] * ly);
      // Three.js's default camera looks down -Z; POSIT's +Z is "in front
      // of the camera" -- negate depth to reconcile the two conventions.
      three.modelGroup.position.set(move[0], move[1], -move[2]);
    }

    // Same positioning as updateModel above, for the AR Video/Photo 3D
    // card -- same pose data, same position-only tracking (its own
    // rotation is set once elsewhere, see applyVideoTransform).
    function updateVideoPlane(rotation, translation) {
      const three = threeRef.current;
      if (!three || !three.videoGroup.children.length) return;
      const qrPos = layoutRef.current?.qr || { x: 50, y: 50 };
      const videoPos = layoutRef.current?.video || { x: 50, y: 20 };
      const [lx, ly] = toLocalOffset(videoPos, qrPos);
      const move = [0, 1, 2].map((j) => translation[j] + rotation[j][0] * lx + rotation[j][1] * ly);
      three.videoGroup.position.set(move[0], move[1], -move[2]);
    }

    // Corners must be ordered top-left, top-right, bottom-right,
    // bottom-left -- both BarcodeDetector and the jsQR call below already
    // supply them in that order (matches POSIT's expected point order).
    function applyCorners(corners) {
      const canvas = canvasRef.current;
      if (!canvas || !positRef.current) return;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      // POSIT's model space is centered on the principal point and Y-up;
      // screen/canvas pixels are top-left-origin and Y-down.
      const imagePoints = corners.map((c) => ({ x: c.x - cx, y: -(c.y - cy) }));

      const result = positRef.current.pose(imagePoints);
      const rawQuat = matrixToQuaternion(result.bestRotation);

      const prev = smoothRef.current;
      const smoothed = prev
        ? {
            quat: slerp(prev.quat, rawQuat, POSE_SMOOTHING),
            translation: prev.translation.map((v, i) => v + (result.bestTranslation[i] - v) * POSE_SMOOTHING),
          }
        : { quat: rawQuat, translation: result.bestTranslation };
      smoothRef.current = smoothed;

      const smoothedRotation = quaternionToMatrix(smoothed.quat);
      setPose({ rotation: smoothedRotation, translation: smoothed.translation });
      updateModel(smoothedRotation, smoothed.translation);
      updateVideoPlane(smoothedRotation, smoothed.translation);
      // One shared render for both 3D layers -- either update above is a
      // no-op (and skips rendering) if its own group has no children, so
      // this only actually draws when at least one of them has content.
      const three = threeRef.current;
      if (three && (three.modelGroup.children.length || three.videoGroup.children.length)) {
        three.renderer.render(three.scene, three.camera);
      }
      lastSeenRef.current = performance.now();
      setVisible(true);
    }

    async function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.videoWidth) {
        const ctx = canvas.getContext('2d');
        drawCover(ctx, video, canvas.width, canvas.height);

        try {
          if (detectorRef.current) {
            const codes = await detectorRef.current.detect(canvas);
            const match = codes.find((c) => c.rawValue?.includes(clientId));
            if (match) applyCorners(match.cornerPoints);
          } else {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code?.data?.includes(clientId)) {
              const l = code.location;
              applyCorners([l.topLeftCorner, l.topRightCorner, l.bottomRightCorner, l.bottomLeftCorner]);
            }
          }
        } catch {
          /* a single bad frame isn't worth surfacing -- just try again next frame */
        }
      }
      if (!cancelled) rafRef.current = requestAnimationFrame(tick);
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if ('BarcodeDetector' in window) {
          detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
        }
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        setCameraError(err.message || 'Camera access was denied.');
      }
    }

    start();
    return () => {
      cancelled = true;
      window.removeEventListener('resize', resizeCanvas);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (threeRef.current) {
        threeRef.current.renderer.dispose();
        threeRef.current = null;
      }
      if (arContentVideoRef.current) {
        arContentVideoRef.current.pause();
        arContentVideoRef.current.src = '';
      }
    };
  }, [clientId]);

  // Coast briefly instead of flickering every single frame the QR drops
  // out of view (motion blur, phone angle, etc.). Once actually lost,
  // drop the smoothing state too -- otherwise re-acquiring the QR later
  // slowly blends in from a now-stale pose instead of snapping to the
  // (correct) fresh reading.
  useEffect(() => {
    const id = setInterval(() => {
      if (visible && performance.now() - lastSeenRef.current > COAST_MS) {
        setVisible(false);
        smoothRef.current = null;
      }
    }, 150);
    return () => clearInterval(id);
  }, [visible]);

  const contactRows = [
    profile?.phone && { icon: '☎', label: profile.phone, href: `tel:${profile.phone}` },
    profile?.publicEmail && { icon: '✉', label: profile.publicEmail, href: `mailto:${profile.publicEmail}` },
  ].filter(Boolean);

  // Same set/shape PublicProfile.jsx's own "Social" tab uses -- there can
  // be more than one platform set, so Social Icons opens a small picker
  // instead of guessing which single link to jump to.
  const socialLinks = [
    profile?.instagramUrl && { key: 'instagram', label: 'Instagram', href: profile.instagramUrl },
    profile?.twitterUrl && { key: 'twitter', label: 'Twitter / X', href: profile.twitterUrl },
    profile?.whatsapp && {
      key: 'whatsapp',
      label: 'WhatsApp',
      href: `https://wa.me/${profile.whatsapp.replace(/\D/g, '')}`,
    },
  ].filter(Boolean);

  const linkFor = {
    portfolio: profile?.portfolioUrl,
    huntsworld: profile?.huntsworldUrl,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={videoRef} muted playsInline style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
      <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%' }} />
      {/* The real 3D model layer -- stacked above the camera feed, below
          the flat HTML panels, transparent, and non-interactive. Fades
          with the same `visible` flag as the flat layer so a lost QR
          doesn't leave a frozen last-rendered frame on screen. */}
      <canvas
        ref={threeCanvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          transition: 'opacity 150ms',
          opacity: visible ? 1 : 0,
        }}
      />

      {layout && profile && pose && canvasRef.current && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            transition: 'opacity 150ms',
            opacity: visible ? 1 : 0,
            pointerEvents: visible ? 'auto' : 'none',
          }}
        >
          {ELEMENTS.map((el) => {
            const pos = layout[el.key] || { x: 50, y: 50 };
            const qrPos = layout.qr || { x: 50, y: 50 };
            const local = [...toLocalOffset(pos, qrPos), 0];
            const canvas = canvasRef.current;
            const proj = projectLocalPoint(pose, focalPxRef.current, canvas.width / 2, canvas.height / 2, local);
            if (!proj) return null;
            const hasVideo = el.key === 'video' && profile.arVideoUrl;
            const hasPhoto = el.key === 'video' && !hasVideo && profile.photoUrl;
            // Once there's real media, the AR Video/Photo panel is a real
            // 3D card rendered by the Three.js layer below (see
            // videoGroup/updateVideoPlane), not a flat HTML billboard --
            // same split 'model' already has between this flat loop and
            // its own Three.js layer.
            if (hasVideo || hasPhoto) return null;
            // Admin-uploaded logo (see ArIcon model) -- only relevant once
            // neither real photo/video content applies, same as the plain
            // text label it replaces.
            const iconUrl = icons?.[el.key];
            const isSocial = el.key === 'social';
            const href = el.key === 'contact' ? contactRows[0]?.href : linkFor[el.key] || undefined;

            const pill = iconUrl ? (
              <img src={iconUrl} alt={el.label} style={{ width: '60%', height: '60%', objectFit: 'contain' }} />
            ) : (
              el.label
            );

            const content = (
              <div
                style={
                  iconUrl
                    ? {
                        width: 56,
                        height: 56,
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
                        padding: '8px 12px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                      }
                }
              >
                {pill}
              </div>
            );

            return (
              <div
                key={el.key}
                style={{
                  position: 'fixed',
                  left: proj.x,
                  top: proj.y,
                  transform: `translate(-50%, -50%) scale(${proj.scale})`,
                }}
              >
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
                          minWidth: 140,
                          zIndex: 5,
                        }}
                      >
                        {socialLinks.map((s) => (
                          <a
                            key={s.key}
                            href={s.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setSocialMenuOpen(false)}
                            style={{
                              display: 'block',
                              padding: '10px 14px',
                              color: '#fff',
                              fontSize: 12,
                              fontWeight: 600,
                              textDecoration: 'none',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {s.label}
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
      )}

      {modelError && (
        <div
          style={{
            position: 'fixed',
            top: 60,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(180,30,30,0.85)',
            color: '#fff',
            padding: '6px 14px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            textAlign: 'center',
            maxWidth: '85vw',
            zIndex: 15,
          }}
        >
          {modelError}
        </div>
      )}

      <Link
        to={`/c/${clientId}`}
        style={{
          position: 'fixed',
          top: 16,
          left: 16,
          zIndex: 20,
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.55)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          textDecoration: 'none',
        }}
        aria-label="Close AR view"
      >
        ✕
      </Link>

      {!visible && !cameraError && !loadError && (
        <div
          style={{
            position: 'fixed',
            bottom: 40,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            textAlign: 'center',
            zIndex: 10,
          }}
        >
          Point your camera at the HuntsTAG QR code
        </div>
      )}

      {(cameraError || loadError) && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: 24,
            textAlign: 'center',
            color: '#fff',
            background: 'rgba(0,0,0,0.85)',
          }}
        >
          <p style={{ maxWidth: 320 }}>
            {cameraError ? `Camera access is needed for AR: ${cameraError}` : loadError}
          </p>
          <button onClick={() => window.location.reload()} style={{ width: 'auto' }}>
            Try again
          </button>
          <Link to={`/c/${clientId}`} style={{ color: 'var(--holo-cyan, #5eead4)' }}>
            View the normal profile instead
          </Link>
        </div>
      )}
    </div>
  );
}
