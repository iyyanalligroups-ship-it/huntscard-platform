import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import jsQR from 'jsqr';
import { POS } from '../lib/posit.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { api } from '../api.js';
import {
  MODEL_SIZE,
  VIDEO_PLANE_BASE_W,
  videoPlaneBaseHFor,
  MODEL_IMAGE_BASE_W,
  ASSUMED_FOV_DEG,
  cardAspectFor,
  toLocalOffset,
  heightToLocalZ,
  projectLocalPoint,
  focalPxFor,
} from '../lib/arProjection.js';

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

// QR_FRACTION, MODEL_SIZE, CARD_ASPECT, CARD_W_UNITS, VIDEO_PLANE_BASE_W/H,
// ASSUMED_FOV_DEG, toLocalOffset, and projectLocalPoint all live in
// lib/arProjection.js now -- shared with ArScanPreview.jsx (the AR Layout
// editors' static preview of this exact view) so the two can't silently
// drift out of sync the way "must match X in file Y" comments used to
// only hope for.
const COAST_MS = 600; // keep last-known position visible this long after the QR drops out of frame
// How much of each new pose reading to blend in per frame (0-1) -- lower
// = smoother but laggier. Adaptive, not fixed: a flat value forces a
// choice between "shakes when the phone is held still" (too responsive)
// and "visibly lags behind real movement" (too damped). Instead, blend
// LESS when the pose barely changed since last frame (that's sub-pixel
// QR-corner detection noise, not real motion -- heavily damp it out) and
// MORE when it changed a lot (that's the phone actually moving -- track
// it quickly, don't lag).
// Tuned toward smoothness over responsiveness -- ordinary handheld shake
// while pointing a phone at a card is bigger and more continuous than
// pure QR-corner detection noise, so it needs a wider "treat as noise"
// band and a lower ceiling than the detection-noise-only case alone would.
const POSE_SMOOTHING_MIN = 0.05;
const POSE_SMOOTHING_MAX = 0.3;
// Translation change (in QR-side-length units, MODEL_SIZE=1) below which
// a frame-to-frame pose delta is treated as pure noise rather than real
// movement, for the adaptive blend above.
const JITTER_TRANSLATION_THRESHOLD = 0.08;

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

// |dot product| between two quaternions -- 1 means identical orientation
// (or exactly opposite-signed representations of the same one, since q
// and -q represent the same rotation), 0 means perpendicular. Used below
// purely as a similarity measure, not to combine rotations.
function quatSimilarity(a, b) {
  return Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
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

export default function ArView({ clientId, cardNumber }) {
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
  const mixerRef = useRef(null); // AnimationMixer for the loaded model, if it has any clips
  const clockRef = useRef(null); // shared THREE.Clock, created once the camera effect starts ticking
  const arContentVideoRef = useRef(null); // off-DOM <video> element feeding the VideoTexture, if arVideoUrl is set (not the camera-feed video -- that's videoRef)
  const layoutRef = useRef(null); // mirrors `layout` state -- needed inside the camera effect's stable closure, see applyCorners
  const cardAspectRef = useRef(cardAspectFor(undefined)); // mirrors cardAspectFor(profile?.cardShape) -- same reason as layoutRef, see updateModel/updateVideoPlane

  const [profile, setProfile] = useState(null);
  const [layout, setLayout] = useState(null);
  const [icons, setIcons] = useState(null); // admin-managed logo per attribute -- see ArIcon model. {} once loaded if none set.
  const [arComponents, setArComponents] = useState([]); // admin-defined extra AR Layout panel elements, see ArComponentDefinition
  const [loadError, setLoadError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [pose, setPose] = useState(null); // { rotation: number[3][3], translation: number[3] }
  const [visible, setVisible] = useState(false);
  const [socialMenuOpen, setSocialMenuOpen] = useState(false);
  const [modelError, setModelError] = useState(''); // surfaced on-screen -- a silent console.error here was impossible to diagnose on a phone with no devtools attached

  useEffect(() => {
    Promise.all([api.getPublicProfile(clientId, cardNumber), api.getPublicArLayout(clientId, cardNumber)])
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
    // Same "cosmetic nice-to-have, don't block the view" reasoning as
    // the icons fetch above. ArComponentDefinition was folded into
    // AttributeDefinition's `arComponent` flag -- filter client-side the
    // same way ArLayout.jsx does.
    api
      .getAttributeDefinitions()
      .then((all) => setArComponents(all.filter((a) => a.arComponent)))
      .catch(() => {});
  }, [clientId, cardNumber]);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    cardAspectRef.current = cardAspectFor(profile?.cardShape);
  }, [profile?.cardShape]);

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
    mixerRef.current?.stopAllAction();
    mixerRef.current = null;
    if (threeRef.current) threeRef.current.modelGroup.clear();
    setModelError('');
    if (!profile?.arModelUrl) return;
    let cancelled = false;

    if (profile?.arModelType === 'image') {
      // Flat cutout image case: same PlaneGeometry+MeshBasicMaterial
      // technique the AR Video/Photo banner plane below already uses,
      // just added to modelGroup instead of videoGroup so it inherits the
      // model's own position/rotation/scale controls (applyModelTransform
      // works unchanged here -- a Mesh has the same .scale/.rotation API
      // a loaded gltf.scene does). Sized off the image's own aspect ratio
      // so a non-square cutout doesn't stretch.
      new THREE.TextureLoader().load(
        profile.arModelUrl,
        (texture) => {
          if (cancelled) return;
          const img = texture.image;
          const aspect = img && img.width && img.height ? img.width / img.height : 1;
          const width = MODEL_IMAGE_BASE_W;
          const height = width / aspect;
          const geometry = new THREE.PlaneGeometry(width, height);
          const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
          const mesh = new THREE.Mesh(geometry, material);
          // Already sized to the target on-card fraction above, unlike the
          // GLTF case below which needs a computed autofit multiplier.
          autoFitScaleRef.current = 1;
          loadedModelRef.current = mesh;
          applyModelTransform();
          if (threeRef.current) {
            threeRef.current.modelGroup.clear();
            threeRef.current.modelGroup.add(mesh);
          }
        },
        undefined,
        (err) => {
          console.error('[ArView] failed to load 3D model image', err);
          if (!cancelled) setModelError('3D model image failed to load: ' + (err?.message || 'unknown error'));
        }
      );
    } else {
      // Shared onModelLoaded for both loaders below -- GLTFLoader hands
      // back gltf.scene, FBXLoader hands back the object3D directly, but
      // from here on (autofit, applyModelTransform, adding to
      // modelGroup) they're both just an Object3D and treated identically.
      const onModelLoaded = (scene, animations) => {
        if (cancelled) return;
        // Normalize scale roughly to the card's own unit scale so an
        // arbitrarily-authored model (could be modeled in meters, cm,
        // anything) shows up at a reasonable size relative to the QR --
        // not physically accurate, just a sane default. Computed once here
        // (before any scale is applied) and kept in autoFitScaleRef so the
        // transform effect below can re-derive scale later without ever
        // measuring an already-scaled bounding box.
        const box = new THREE.Box3().setFromObject(scene);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        autoFitScaleRef.current = MODEL_IMAGE_BASE_W / maxDim;

        loadedModelRef.current = scene;
        applyModelTransform();
        if (threeRef.current) {
          threeRef.current.modelGroup.clear();
          threeRef.current.modelGroup.add(scene);
        }
        // Play any baked-in animation -- driven every frame from the
        // camera/tick effect's render call below, via clockRef.
        if (animations?.length) {
          const mixer = new THREE.AnimationMixer(scene);
          mixer.clipAction(animations[0]).play();
          mixerRef.current = mixer;
        }
      };
      const onModelError = (err) => {
        console.error('[ArView] failed to load 3D model', err);
        if (!cancelled) setModelError('3D model failed to load: ' + (err?.message || 'unknown error'));
      };

      if (profile?.arModelType === 'fbx') {
        new FBXLoader().load(profile.arModelUrl, (fbx) => onModelLoaded(fbx, fbx.animations), undefined, onModelError);
      } else {
        new GLTFLoader().load(profile.arModelUrl, (gltf) => onModelLoaded(gltf.scene, gltf.animations), undefined, onModelError);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [profile?.arModelUrl, profile?.arModelType]);

  // Same idea as applyModelTransform above, for the AR Video/Photo panel's
  // own saved X/Y/Z rotation + scale -- static per-frame-independent
  // orientation, matching how the 3D model's own rotation already works
  // (set once here, not tracked to the camera's viewpoint every frame).
  function applyVideoTransform() {
    const mesh = videoPlaneRef.current;
    if (!mesh) return;
    // Independent X/Y scale (width/"length" vs height/"breadth"), unlike
    // the model's uniform scale -- this is a rectangular card image, so
    // stretching it non-uniformly is a real, useful adjustment.
    const scaleX = layoutRef.current?.videoScaleX ?? 1;
    const scaleY = layoutRef.current?.videoScaleY ?? 1;
    mesh.scale.set(scaleX, scaleY, 1);
    const rotX = layoutRef.current?.videoRotationX ?? 0;
    const rotY = layoutRef.current?.videoRotationY ?? 0;
    const rotZ = layoutRef.current?.videoRotationZ ?? 0;
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(THREE.MathUtils.degToRad(rotX), THREE.MathUtils.degToRad(rotY), THREE.MathUtils.degToRad(rotZ));
  }

  useEffect(() => {
    applyVideoTransform();
  }, [layout?.videoRotationX, layout?.videoRotationY, layout?.videoRotationZ, layout?.videoScaleX, layout?.videoScaleY]);

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
      const geometry = new THREE.PlaneGeometry(VIDEO_PLANE_BASE_W, videoPlaneBaseHFor(cardAspectFor(profile?.cardShape)));
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material);
      videoPlaneRef.current = mesh;
      applyVideoTransform();
      if (threeRef.current) {
        threeRef.current.videoGroup.clear();
        threeRef.current.videoGroup.add(mesh);
      }
    }

    // Resolution order: the new one-slot "HuntsAR World Banner" field
    // (video or image, arBannerType says which), else the legacy
    // video-only field for clients who uploaded before the banner slot
    // existed (implicitly 'video'), else the general profile photo as a
    // last resort (implicitly 'image').
    const bannerUrl = profile?.arBannerUrl || profile?.arVideoUrl;
    const bannerType = profile?.arBannerUrl ? profile?.arBannerType : profile?.arVideoUrl ? 'video' : profile?.photoUrl ? 'image' : null;
    const resolvedUrl = bannerUrl || profile?.photoUrl;

    if (resolvedUrl && bannerType === 'video') {
      const videoEl = document.createElement('video');
      videoEl.muted = true;
      videoEl.loop = true;
      videoEl.playsInline = true;
      videoEl.src = resolvedUrl;
      // Autoplay can be rejected before any user gesture on some browsers
      // -- the texture just stays on its first/blank frame until playback
      // actually starts, not worth surfacing as an error.
      videoEl.play().catch(() => {});
      arContentVideoRef.current = videoEl;
      addPlane(new THREE.VideoTexture(videoEl));
    } else if (resolvedUrl) {
      new THREE.TextureLoader().load(resolvedUrl, addPlane, undefined, (err) => {
        console.error('[ArView] failed to load AR banner texture', err);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [profile?.arBannerUrl, profile?.arBannerType, profile?.arVideoUrl, profile?.photoUrl, profile?.cardShape]);

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
      focalPxRef.current = focalPxFor(canvas.height);
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
            clockRef.current = new THREE.Clock();
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
    // a real 3D transform instead of a 2D projection. The GROUP's own
    // orientation is deliberately left at identity -- only position
    // tracks the detected pose. The model's own saved rotation (applied
    // to the mesh, a child of this group, in applyModelTransform) is a
    // fixed tilt in camera space, unaffected by which way the phone
    // happens to be facing the card. This was tried the other way
    // (composing with the live pose so it tilts flush with the card's
    // real surface) and reverted -- webcam-grade QR-corner tracking is
    // too noisy for that to read as anything but twitchy; a fixed
    // orientation that only re-centers as you move reads as far more
    // premium/stable, same principle most commercial AR card apps use.
    function updateModel(rotation, translation) {
      const three = threeRef.current;
      if (!three || !three.modelGroup.children.length) return;
      const qrPos = layoutRef.current?.qr || { x: 50, y: 50 };
      const modelPos = layoutRef.current?.model || { x: 50, y: 35 };
      const [lx, ly] = toLocalOffset(modelPos, qrPos, cardAspectRef.current);
      const lz = heightToLocalZ(modelPos.z, cardAspectRef.current);
      const move = [0, 1, 2].map(
        (j) => translation[j] + rotation[j][0] * lx + rotation[j][1] * ly + rotation[j][2] * lz
      );
      // Three.js's default camera looks down -Z; POSIT's +Z is "in front
      // of the camera" -- negate depth to reconcile the two conventions.
      three.modelGroup.position.set(move[0], move[1], -move[2]);
    }

    // Same positioning as updateModel above, for the AR Video/Photo 3D
    // card -- same pose data, same position-only tracking (its own
    // rotation is set once elsewhere, see applyVideoTransform, and
    // deliberately doesn't track the live pose -- see updateModel above).
    function updateVideoPlane(rotation, translation) {
      const three = threeRef.current;
      if (!three || !three.videoGroup.children.length) return;
      const qrPos = layoutRef.current?.qr || { x: 50, y: 50 };
      const videoPos = layoutRef.current?.video || { x: 50, y: 20 };
      const [lx, ly] = toLocalOffset(videoPos, qrPos, cardAspectRef.current);
      const lz = heightToLocalZ(videoPos.z, cardAspectRef.current);
      const move = [0, 1, 2].map(
        (j) => translation[j] + rotation[j][0] * lx + rotation[j][1] * ly + rotation[j][2] * lz
      );
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
      const prev = smoothRef.current;

      // POSIT is fundamentally ambiguous for a roughly-square planar
      // marker viewed at an angle -- it always computes TWO candidate
      // poses (result.bestRotation/Translation and .alternativeRotation/
      // Translation) and picks whichever fits this frame's pixels
      // better. Near the ambiguous zone the two solutions' errors are
      // nearly tied, so trusting "lower error, every single frame" flips
      // between two very different orientations on tiny detection noise
      // -- which reads as the AR content suddenly "turning" as the phone
      // tilts, even though nothing here rotates the mesh directly
      // (see applyModelTransform/applyVideoTransform). Instead, when a
      // valid alternative exists, prefer whichever candidate is closer
      // to LAST frame's actual orientation (temporal continuity) over
      // whichever merely reprojects best this instant -- the standard
      // fix for this class of two-solution PnP ambiguity.
      const bestQuat = matrixToQuaternion(result.bestRotation);
      let rawQuat = bestQuat;
      let rawTranslation = result.bestTranslation;
      if (prev && result.alternativeError >= 0) {
        const altQuat = matrixToQuaternion(result.alternativeRotation);
        if (quatSimilarity(altQuat, prev.quat) > quatSimilarity(bestQuat, prev.quat)) {
          rawQuat = altQuat;
          rawTranslation = result.alternativeTranslation;
        }
      }

      // Outlier rejection -- a second line of defense beyond the
      // disambiguation above. If even the temporally-closer candidate
      // still differs wildly from last frame (a translation jump far
      // beyond anything a hand could produce in ~33ms, or an orientation
      // more than ~120 degrees off), this frame's corner detection is
      // more likely a bad read -- motion blur, a partial/angled view of
      // the QR right at POSIT's least-reliable range -- than real
      // movement. Freeze on the last good pose (skip this frame's
      // update entirely) rather than snap to a probably-wrong one; the
      // next frame gets another chance to confirm before anything moves.
      const MAX_PLAUSIBLE_JUMP = 0.6; // QR-side-length units (MODEL_SIZE = 1) per frame
      const MIN_PLAUSIBLE_ROTATION_SIMILARITY = 0.5; // |quat dot| -- below this is >~120 degrees in one frame
      if (prev) {
        const jumpDist = Math.hypot(
          rawTranslation[0] - prev.translation[0],
          rawTranslation[1] - prev.translation[1],
          rawTranslation[2] - prev.translation[2]
        );
        if (jumpDist > MAX_PLAUSIBLE_JUMP || quatSimilarity(rawQuat, prev.quat) < MIN_PLAUSIBLE_ROTATION_SIMILARITY) {
          lastSeenRef.current = performance.now();
          setVisible(true);
          return;
        }
      }

      let smoothed;
      if (prev) {
        const dx = rawTranslation[0] - prev.translation[0];
        const dy = rawTranslation[1] - prev.translation[1];
        const dz = rawTranslation[2] - prev.translation[2];
        const moveDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const t = Math.min(1, moveDist / JITTER_TRANSLATION_THRESHOLD);
        const smoothingFactor = POSE_SMOOTHING_MIN + (POSE_SMOOTHING_MAX - POSE_SMOOTHING_MIN) * t;
        smoothed = {
          quat: slerp(prev.quat, rawQuat, smoothingFactor),
          translation: prev.translation.map((v, i) => v + (rawTranslation[i] - v) * smoothingFactor),
        };
      } else {
        smoothed = { quat: rawQuat, translation: rawTranslation };
      }
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
        mixerRef.current?.update(clockRef.current.getDelta());
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

  // The physical card's actual shape (see arProjection.js's cardAspectFor)
  // -- needed by the render-time toLocalOffset calls below (updateModel/
  // updateVideoPlane inside the camera effect use cardAspectRef instead,
  // since they run in a stable closure that doesn't re-render on its own).
  const cardAspect = cardAspectFor(profile?.cardShape);

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
            const local = [...toLocalOffset(pos, qrPos, cardAspect), 0];
            const canvas = canvasRef.current;
            const proj = projectLocalPoint(pose, focalPxRef.current, canvas.width / 2, canvas.height / 2, local);
            if (!proj) return null;
            // Once there's real media -- the new one-slot banner (video or
            // image), the legacy video-only field, or the general profile
            // photo as a last resort -- the AR Video/Photo panel is a real
            // 3D card rendered by the Three.js layer below (see
            // videoGroup/updateVideoPlane), not a flat HTML billboard --
            // same split 'model' already has between this flat loop and
            // its own Three.js layer.
            const hasBannerMedia = el.key === 'video' && (profile.arBannerUrl || profile.arVideoUrl || profile.photoUrl);
            if (hasBannerMedia) return null;
            // Admin-uploaded logo (see ArIcon model) -- only relevant once
            // neither real photo/video content applies, same as the plain
            // text label it replaces.
            const iconUrl = icons?.[el.key];
            const isSocial = el.key === 'social';
            const href = el.key === 'contact' ? contactRows[0]?.href : linkFor[el.key] || undefined;
            // Nothing filled in for this slot -- an icon with no real
            // content behind it isn't useful to a scanner, so skip it
            // entirely rather than showing a dead pill. 'video' is
            // covered above (hasBannerMedia false means no media at all).
            const hasValue =
              el.key === 'video' ? false : isSocial ? socialLinks.length > 0 : Boolean(href);
            if (!hasValue) return null;

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
                        width: 80,
                        height: 80,
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
                        padding: '12px 18px',
                        borderRadius: 999,
                        fontSize: 14,
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
                  left: 0,
                  top: 0,
                  // left/top would force the browser to recompute layout
                  // every single frame (60fps) -- moved into the transform
                  // itself (translate3d, not translate) so the browser can
                  // composite this on the GPU instead, same as the 3D
                  // layer next to it already gets "for free" from WebGL.
                  // This was the actual cause of the flat panels visibly
                  // shaking more than the 3D model/video card, even though
                  // both consume the exact same smoothed pose data.
                  // Floored (never below 0.75) so pills stay legible at a
                  // normal scanning distance -- unlike the 3D model/video
                  // card, these are meant to read as fixed-size UI, not
                  // realistic receding-with-distance geometry.
                  transform: `translate3d(${proj.x}px, ${proj.y}px, 0) translate(-50%, -50%) scale(${Math.max(proj.scale, 0.75)})`,
                  willChange: 'transform',
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

          {/* Admin-defined extra AR Layout panel elements (see
              ArComponentDefinition) -- same flat-panel treatment as the
              built-in contact/portfolio/social/huntsworld pills above,
              since that's all a simple "icon + link" component needs.
              The client's own value for each lives in
              profile.customAttributes, keyed the same way. */}
          {arComponents.map((c) => {
            const pos = layout.customElements?.[c.key] || { x: 50, y: 50 };
            const qrPos = layout.qr || { x: 50, y: 50 };
            const local = [...toLocalOffset(pos, qrPos, cardAspect), 0];
            const canvas = canvasRef.current;
            const proj = projectLocalPoint(pose, focalPxRef.current, canvas.width / 2, canvas.height / 2, local);
            if (!proj) return null;
            const iconUrl = icons?.[c.key];
            const href = profile?.customAttributes?.[c.key] || undefined;
            // Same "no value, no pill" rule as the built-in ELEMENTS loop
            // above -- an admin-defined AR link the client never filled in
            // shouldn't show up in the scan at all.
            if (!href) return null;

            const pill = iconUrl ? (
              <img src={iconUrl} alt={c.label} style={{ width: '60%', height: '60%', objectFit: 'contain' }} />
            ) : (
              c.label
            );

            const content = (
              <div
                style={
                  iconUrl
                    ? {
                        width: 80,
                        height: 80,
                        borderRadius: '50%',
                        background: '#22d3ee',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                      }
                    : {
                        background: '#22d3ee',
                        color: '#fff',
                        padding: '12px 18px',
                        borderRadius: 999,
                        fontSize: 14,
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
                key={c.key}
                style={{
                  position: 'fixed',
                  left: 0,
                  top: 0,
                  transform: `translate3d(${proj.x}px, ${proj.y}px, 0) translate(-50%, -50%) scale(${Math.max(proj.scale, 0.75)})`,
                  willChange: 'transform',
                }}
              >
                {href ? (
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
