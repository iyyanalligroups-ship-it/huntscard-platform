import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { api, API_URL } from '../api.js';
import {
  VIDEO_PLANE_BASE_W,
  VIDEO_PLANE_BASE_H,
  MODEL_IMAGE_BASE_W,
  MODEL_SIZE,
  CARD_W_UNITS,
  CARD_H_UNITS,
  ASSUMED_PREVIEW_DISTANCE,
  ASSUMED_FOV_DEG,
  toLocalOffset,
  fromLocalOffset,
  heightToLocalZ,
  clampPercent,
} from '../lib/arProjection.js';

/**
 * A "what will this actually look like when someone scans it" preview --
 * used by the AR Layout editor, next to the flat drag-to-position canvas.
 * Reuses the SAME Three.js model/video rendering ArView.jsx (the real live
 * camera view) uses, but with its own free-orbiting camera instead of a
 * live tracked one -- no camera permission needed, updates live as
 * `layout` changes while editing, and (when `editable`) supports dragging
 * items directly here too, via raycasting against the card's own plane.
 *
 * Every positioned item (model, video, pills) sits at real world position
 * (lx, ly, 0) -- flat on the card's own surface, z always 0, matching the
 * confirmed scope (no height-above-card concept). The camera orbits
 * *around* that flat scene; nothing about item positioning changed, only
 * how the camera views it.
 *
 * Deliberately a separate component from ArView.jsx rather than a mode
 * flag on it -- that component's whole structure is built around a live
 * camera + frame loop (getUserMedia, POSIT tracking) this has no use for.
 */

// A 2-point line whose endpoints get rewritten every time an item's
// position changes (see updateGuideLine) rather than a fresh Line per
// frame -- cheap to keep around even while hidden (z === 0, the common
// case for every element that doesn't use height).
function makeGuideLine() {
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const material = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.06, gapSize: 0.04, transparent: true, opacity: 0.6 });
  const line = new THREE.Line(geometry, material);
  line.visible = false;
  return line;
}

// Points `line` from (lx, ly, lz) down to its (lx, ly, 0) footprint, or
// hides it entirely when lz is ~0 (flat on the card -- the common case).
function updateGuideLine(line, lx, ly, lz) {
  if (!line) return;
  if (lz <= 0.0001) {
    line.visible = false;
    return;
  }
  const positions = line.geometry.attributes.position;
  positions.setXYZ(0, lx, ly, lz);
  positions.setXYZ(1, lx, ly, 0);
  positions.needsUpdate = true;
  line.computeLineDistances(); // required for LineDashedMaterial to render dashes at all -- a Line method, not a BufferGeometry one
  line.visible = true;
}

const ELEMENTS = [
  { key: 'video', label: 'AR Video / Photo', color: '#8b5cf6' },
  { key: 'contact', label: 'Contact Info', color: '#14b8a6' },
  { key: 'portfolio', label: 'Portfolio', color: '#4f8ef7' },
  { key: 'social', label: 'Social Icons', color: '#ec4899' },
  { key: 'huntsworld', label: 'Huntsworld Link', color: '#f5a524' },
];

export default function ArScanPreview({ profile, layout, arComponents = [], editable = false, onDragPosition }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const threeRef = useRef(null); // { renderer, scene, camera, controls, modelGroup, videoGroup, cardMesh, qrMesh }
  const loadedModelRef = useRef(null);
  const autoFitScaleRef = useRef(1);
  const videoPlaneRef = useRef(null);
  const [size, setSize] = useState({ w: 320, h: 400 });
  const [icons, setIcons] = useState({});
  const [dragging, setDragging] = useState(null); // key of whatever's being dragged, or null
  // Bumped on every OrbitControls 'change' event -- doesn't get read
  // anywhere itself, its only job is forcing a re-render so the DOM
  // overlay pills (see projectWorldPoint below) recompute their screen
  // position against the camera's new orbit, in step with the WebGL
  // canvas redrawing every frame via the render loop.
  const [, setCameraTick] = useState(0);

  const qrPos = layout?.qr || { x: 50, y: 50 };

  // Admin-managed logo icons -- same as ArLayout.jsx/ArView.jsx, purely
  // cosmetic, a failure here just falls back to plain text pills.
  useEffect(() => {
    api.getPublicArIcons().then(setIcons).catch(() => {});
  }, []);

  // Track the container's real rendered size -- the preview box is
  // responsive (width: 100%), so the canvas/projection math needs to
  // follow its actual pixel dimensions, not a hardcoded guess.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0]?.contentRect || {};
      if (width && height) setSize({ w: width, h: height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Three.js scene setup -- same lighting shape as ArView.jsx's own, so a
  // GLB model looks the same here as it will in the real AR view. Camera
  // starts at the same straight-on framing the old fixed-pose preview
  // always showed (distance ASSUMED_PREVIEW_DISTANCE, looking at the
  // origin, which is where the QR's own local (0,0) always sits) --
  // OrbitControls then lets it move away from there.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w < 10 || size.h < 10) return;
    canvas.width = size.w;
    canvas.height = size.h;

    if (!threeRef.current) {
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(ASSUMED_FOV_DEG, size.w / size.h, 0.01, 100);
      camera.position.set(0, 0, ASSUMED_PREVIEW_DISTANCE);
      camera.lookAt(0, 0, 0);

      const modelGroup = new THREE.Group();
      const videoGroup = new THREE.Group();
      scene.add(modelGroup, videoGroup);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
      dirLight.position.set(1, 1, 1);
      scene.add(dirLight);

      // Card background + QR -- real Three.js planes (not DOM overlays
      // computed via a fixed pose) specifically so they rotate together
      // with the model/video as one solid composition once the camera
      // orbits, instead of staying frozen in their original straight-on
      // screen position while everything else moves.
      const cardMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(CARD_W_UNITS, CARD_H_UNITS),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
      );
      cardMesh.position.z = -0.02;
      scene.add(cardMesh);

      const qrMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(MODEL_SIZE, MODEL_SIZE),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }) // texture applied once loaded, see below
      );
      qrMesh.position.z = -0.01; // sits just in front of the card, behind model/video content
      scene.add(qrMesh);

      // Dashed vertical guide lines -- shown only while an item is raised
      // off the card (z > 0), from its floating position straight down to
      // its (x,y) footprint on the card, so it's clear at a glance how far
      // it's lifted (same affordance as a typical 3D editor's "shadow"
      // line under a floating object).
      const modelGuide = makeGuideLine();
      const videoGuide = makeGuideLine();
      scene.add(modelGuide, videoGuide);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.12;
      controls.minDistance = ASSUMED_PREVIEW_DISTANCE * 0.4;
      controls.maxDistance = ASSUMED_PREVIEW_DISTANCE * 2.5;
      // Full horizontal rotation; polar angle clamped just short of the
      // top/bottom poles to avoid disorienting gimbal-flip, still reads
      // as "full 360" for any practical viewing purpose.
      controls.minPolarAngle = 0.15;
      controls.maxPolarAngle = Math.PI - 0.15;
      controls.enabled = editable;
      controls.update();
      controls.addEventListener('change', () => setCameraTick((t) => t + 1));

      threeRef.current = { renderer, scene, camera, controls, modelGroup, videoGroup, cardMesh, qrMesh, modelGuide, videoGuide };
      if (loadedModelRef.current) modelGroup.add(loadedModelRef.current);
      if (videoPlaneRef.current) videoGroup.add(videoPlaneRef.current);
    }
    const three = threeRef.current;
    three.controls.enabled = editable;
    three.renderer.setSize(size.w, size.h, false);
    three.camera.aspect = size.w / size.h;
    three.camera.updateProjectionMatrix();
  }, [size.w, size.h, editable]);

  // Continuous render loop -- needed for OrbitControls damping (it keeps
  // adjusting the camera for a few frames after you let go, not just
  // while actively dragging), not just a one-shot render after each state
  // change like the rest of this component's imperative updates use.
  useEffect(() => {
    let rafId;
    function tick() {
      rafId = requestAnimationFrame(tick);
      const three = threeRef.current;
      if (!three) return;
      three.controls.update();
      three.renderer.render(three.scene, three.camera);
    }
    tick();
    return () => cancelAnimationFrame(rafId);
  }, []);

  useEffect(
    () => () => {
      if (threeRef.current) {
        threeRef.current.controls.dispose();
        threeRef.current.renderer.dispose();
        threeRef.current = null;
      }
    },
    []
  );

  function renderThree() {
    const three = threeRef.current;
    if (three) three.renderer.render(three.scene, three.camera);
  }

  function resetView() {
    const three = threeRef.current;
    if (!three) return;
    three.camera.position.set(0, 0, ASSUMED_PREVIEW_DISTANCE);
    three.controls.target.set(0, 0, 0);
    three.controls.update();
    setCameraTick((t) => t + 1);
  }

  // Projects a real 3D world point (already flat on the card's z=0 plane)
  // through the *live* camera -- unlike the old fixed-pose algebra, this
  // automatically tracks wherever OrbitControls has moved the camera to,
  // which is what keeps the DOM-overlay pills glued to the right spot on
  // the card as you orbit.
  function projectWorldPoint(lx, ly, lz = 0) {
    const three = threeRef.current;
    if (!three) return null;
    const vector = new THREE.Vector3(lx, ly, lz).project(three.camera);
    if (vector.z > 1) return null; // behind the camera or past the far plane
    return { x: (vector.x * 0.5 + 0.5) * size.w, y: (-vector.y * 0.5 + 0.5) * size.h };
  }

  // The inverse: given a screen point, casts a ray from the live camera
  // and intersects it with the card's own z=0 plane -- this is what makes
  // dragging correct at *any* orbit angle, not just the original
  // straight-on view (a plain algebraic inverse, used before this change,
  // only worked for that one fixed camera position).
  function screenToLocalPoint(clientX, clientY) {
    const three = threeRef.current;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!three || !rect) return null;
    const ndc = {
      x: ((clientX - rect.left) / rect.width) * 2 - 1,
      y: -((clientY - rect.top) / rect.height) * 2 + 1,
    };
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, three.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const point = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, point) ? point : null;
  }

  function handleDragStart(key, e) {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation(); // don't also let this gesture orbit the camera
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(key);
  }
  function handleDragMove(e) {
    if (!dragging) return;
    const point = screenToLocalPoint(e.clientX, e.clientY);
    if (!point) return;
    const pos = fromLocalOffset(point.x, point.y, qrPos);
    onDragPosition?.(dragging, { x: clampPercent(Math.round(pos.x)), y: clampPercent(Math.round(pos.y)) });
  }
  function handleDragEnd() {
    setDragging(null);
  }
  const dragHandlers = (key) => ({
    onPointerDown: (e) => handleDragStart(key, e),
    onPointerMove: handleDragMove,
    onPointerUp: handleDragEnd,
    onPointerCancel: handleDragEnd,
  });

  function applyModelTransform() {
    const scene = loadedModelRef.current;
    if (!scene) return;
    const customScale = layout?.modelScale ?? 1;
    scene.scale.setScalar(autoFitScaleRef.current * customScale);
    const rotX = layout?.modelRotationX ?? 0;
    const rotY = layout?.modelRotationY ?? 0;
    const rotZ = layout?.modelRotationZ ?? 0;
    scene.rotation.order = 'YXZ';
    scene.rotation.set(THREE.MathUtils.degToRad(rotX), THREE.MathUtils.degToRad(rotY), THREE.MathUtils.degToRad(rotZ));
  }

  function applyVideoTransform() {
    const mesh = videoPlaneRef.current;
    if (!mesh) return;
    mesh.scale.set(layout?.videoScaleX ?? 1, layout?.videoScaleY ?? 1, 1);
    const rotX = layout?.videoRotationX ?? 0;
    const rotY = layout?.videoRotationY ?? 0;
    const rotZ = layout?.videoRotationZ ?? 0;
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(THREE.MathUtils.degToRad(rotX), THREE.MathUtils.degToRad(rotY), THREE.MathUtils.degToRad(rotZ));
  }

  // Positions the model/video groups at their saved (x%, y%) -- flat on
  // the card's own z=0 plane, same as everything else here.
  function positionGroups() {
    const three = threeRef.current;
    if (!three) return;
    if (three.modelGroup.children.length) {
      const modelPos = layout?.model || { x: 50, y: 35 };
      const [lx, ly] = toLocalOffset(modelPos, qrPos);
      const lz = heightToLocalZ(modelPos.z);
      three.modelGroup.position.set(lx, ly, lz);
      updateGuideLine(three.modelGuide, lx, ly, lz);
    } else {
      three.modelGuide.visible = false;
    }
    if (three.videoGroup.children.length) {
      const videoPos = layout?.video || { x: 50, y: 20 };
      const [lx, ly] = toLocalOffset(videoPos, qrPos);
      const lz = heightToLocalZ(videoPos.z);
      three.videoGroup.position.set(lx, ly, lz);
      updateGuideLine(three.videoGuide, lx, ly, lz);
    } else {
      three.videoGuide.visible = false;
    }
  }

  // The card background plane's size is fixed (CARD_W_UNITS x
  // CARD_H_UNITS never change) -- only its center shifts when the QR's
  // own saved position changes.
  function positionCard() {
    const three = threeRef.current;
    if (!three) return;
    const [x0, y0] = toLocalOffset({ x: 0, y: 0 }, qrPos);
    const [x1, y1] = toLocalOffset({ x: 100, y: 100 }, qrPos);
    three.cardMesh.position.x = (x0 + x1) / 2;
    three.cardMesh.position.y = (y0 + y1) / 2;
  }

  // Load the QR code texture -- same URL the old DOM <img> overlay used,
  // now applied to a real plane so it rotates with the rest of the card.
  useEffect(() => {
    if (!profile?.clientId) return;
    let cancelled = false;
    new THREE.TextureLoader().load(`${API_URL}/api/public/qr/${profile.clientId}?type=ar`, (texture) => {
      if (cancelled || !threeRef.current) return;
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = threeRef.current.qrMesh.material;
      material.map = texture;
      material.opacity = 1;
      material.needsUpdate = true;
      renderThree();
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.clientId, size.w, size.h]);

  // Load the 3D model (GLB or flat image, see arModelType) -- same two
  // branches as ArView.jsx's own loading effect.
  useEffect(() => {
    loadedModelRef.current = null;
    if (threeRef.current) threeRef.current.modelGroup.clear();
    if (!profile?.arModelUrl) {
      renderThree();
      return;
    }
    let cancelled = false;

    if (profile.arModelType === 'image') {
      new THREE.TextureLoader().load(profile.arModelUrl, (texture) => {
        if (cancelled) return;
        // Same fix as ArView.jsx (the real live AR view) -- without this,
        // Three.js's default sRGB output conversion double-applies against
        // untagged texture data, making photo textures look dull/washed
        // out next to the same image in a plain <img> tag.
        texture.colorSpace = THREE.SRGBColorSpace;
        const img = texture.image;
        const aspect = img && img.width && img.height ? img.width / img.height : 1;
        const width = MODEL_IMAGE_BASE_W;
        const geometry = new THREE.PlaneGeometry(width, width / aspect);
        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material);
        autoFitScaleRef.current = 1;
        loadedModelRef.current = mesh;
        applyModelTransform();
        if (threeRef.current) {
          threeRef.current.modelGroup.clear();
          threeRef.current.modelGroup.add(mesh);
        }
        positionGroups();
        renderThree();
      });
    } else {
      new GLTFLoader().load(profile.arModelUrl, (gltf) => {
        if (cancelled) return;
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size3 = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size3.x, size3.y, size3.z) || 1;
        autoFitScaleRef.current = MODEL_IMAGE_BASE_W / maxDim;
        loadedModelRef.current = gltf.scene;
        applyModelTransform();
        if (threeRef.current) {
          threeRef.current.modelGroup.clear();
          threeRef.current.modelGroup.add(gltf.scene);
        }
        positionGroups();
        renderThree();
      });
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.arModelUrl, profile?.arModelType, size.w, size.h]);

  // Load the AR Video/Photo banner -- same resolution order as ArView.jsx
  // (one-slot banner field, else legacy video field, else plain photo).
  useEffect(() => {
    videoPlaneRef.current = null;
    if (threeRef.current) threeRef.current.videoGroup.clear();
    const bannerUrl = profile?.arBannerUrl || profile?.arVideoUrl;
    const bannerType = profile?.arBannerUrl ? profile?.arBannerType : profile?.arVideoUrl ? 'video' : profile?.photoUrl ? 'image' : null;
    const resolvedUrl = bannerUrl || profile?.photoUrl;
    if (!resolvedUrl) {
      renderThree();
      return;
    }
    let cancelled = false;

    function addPlane(texture) {
      if (cancelled) return;
      // See the matching note in the 3D-model-image effect above.
      texture.colorSpace = THREE.SRGBColorSpace;
      const geometry = new THREE.PlaneGeometry(VIDEO_PLANE_BASE_W, VIDEO_PLANE_BASE_H);
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material);
      videoPlaneRef.current = mesh;
      applyVideoTransform();
      if (threeRef.current) {
        threeRef.current.videoGroup.clear();
        threeRef.current.videoGroup.add(mesh);
      }
      positionGroups();
      renderThree();
    }

    if (bannerType === 'video') {
      const videoEl = document.createElement('video');
      videoEl.muted = true;
      videoEl.loop = true;
      videoEl.playsInline = true;
      videoEl.src = resolvedUrl;
      videoEl.play().catch(() => {});
      addPlane(new THREE.VideoTexture(videoEl));
    } else {
      new THREE.TextureLoader().load(resolvedUrl, addPlane, undefined, () => {});
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.arBannerUrl, profile?.arBannerType, profile?.arVideoUrl, profile?.photoUrl, size.w, size.h]);

  // Re-apply transform/position whenever the saved layout values change --
  // this is what makes the preview update live as you drag things in the
  // flat editor (or this one) next to it.
  useEffect(() => {
    applyModelTransform();
    applyVideoTransform();
    positionGroups();
    positionCard();
    renderThree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    layout?.qr?.x,
    layout?.qr?.y,
    layout?.model?.x,
    layout?.model?.y,
    layout?.model?.z,
    layout?.modelRotationX,
    layout?.modelRotationY,
    layout?.modelRotationZ,
    layout?.modelScale,
    layout?.video?.x,
    layout?.video?.y,
    layout?.video?.z,
    layout?.videoRotationX,
    layout?.videoRotationY,
    layout?.videoRotationZ,
    layout?.videoScaleX,
    layout?.videoScaleY,
    size.w,
    size.h,
  ]);

  if (!profile || !layout) return null;

  const modelPos = layout?.model || { x: 50, y: 35 };
  const modelProj = profile?.arModelUrl
    ? projectWorldPoint(...toLocalOffset(modelPos, qrPos), heightToLocalZ(modelPos.z))
    : null;
  const videoPos = layout?.video || { x: 50, y: 20 };
  const hasVideoContent = Boolean(profile?.arBannerUrl || profile?.arVideoUrl || profile?.photoUrl);
  const videoProj = hasVideoContent
    ? projectWorldPoint(...toLocalOffset(videoPos, qrPos), heightToLocalZ(videoPos.z))
    : null;

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '3 / 4',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        background: 'radial-gradient(ellipse at center, #d2a679 0%, #b98956 55%, #96703f 100%)',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: editable ? 'auto' : 'none',
          cursor: editable ? (dragging ? 'grabbing' : 'grab') : undefined,
          touchAction: editable ? 'none' : undefined,
        }}
      />

      {ELEMENTS.map((el) => {
        // Same "no value, no pill" rule as ArView.jsx's real live view --
        // video is either rendered by the Three.js layer above (when
        // there's real media) or not at all (when there isn't); the rest
        // only show once the client has actually filled that field in.
        if (el.key === 'video') return null;
        if (el.key === 'contact' && !profile?.phone && !profile?.publicEmail) return null;
        if (el.key === 'social' && !profile?.instagramUrl && !profile?.twitterUrl && !profile?.whatsapp) return null;
        if (el.key === 'portfolio' && !profile?.portfolioUrl) return null;
        if (el.key === 'huntsworld' && !profile?.huntsworldUrl) return null;
        const pos = layout[el.key] || { x: 50, y: 50 };
        const proj = projectWorldPoint(...toLocalOffset(pos, qrPos));
        if (!proj) return null;
        const iconUrl = icons?.[el.key];
        return (
          <div
            key={el.key}
            {...(editable ? dragHandlers(el.key) : {})}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              transform: `translate3d(${proj.x}px, ${proj.y}px, 0) translate(-50%, -50%)`,
              cursor: editable ? (dragging === el.key ? 'grabbing' : 'grab') : undefined,
              touchAction: editable ? 'none' : undefined,
              zIndex: dragging === el.key ? 10 : 1,
            }}
          >
            <div
              style={
                iconUrl
                  ? {
                      width: 44,
                      height: 44,
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
                      padding: '6px 10px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                    }
              }
            >
              {iconUrl ? (
                <img src={iconUrl} alt={el.label} style={{ width: '60%', height: '60%', objectFit: 'contain' }} />
              ) : (
                el.label
              )}
            </div>
          </div>
        );
      })}

      {/* Admin-defined extra AR Layout panel elements (see
          ArComponentDefinition/AttributeDefinition.arComponent) -- same
          treatment as ArView.jsx's own arComponents loop. Positions come
          straight off the flattened `layout[c.key]` the editor already
          uses for its own drag canvas (see ArLayout.jsx), not the nested
          `layout.customElements` shape the backend stores it as. */}
      {arComponents.map((c) => {
        const pos = layout[c.key] || { x: 50, y: 50 };
        const proj = projectWorldPoint(...toLocalOffset(pos, qrPos));
        if (!proj) return null;
        const iconUrl = icons?.[c.key];
        return (
          <div
            key={c.key}
            {...(editable ? dragHandlers(c.key) : {})}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              transform: `translate3d(${proj.x}px, ${proj.y}px, 0) translate(-50%, -50%)`,
              cursor: editable ? (dragging === c.key ? 'grabbing' : 'grab') : undefined,
              touchAction: editable ? 'none' : undefined,
              zIndex: dragging === c.key ? 10 : 1,
            }}
          >
            <div
              style={
                iconUrl
                  ? {
                      width: 44,
                      height: 44,
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
                      padding: '6px 10px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                    }
              }
            >
              {iconUrl ? (
                <img src={iconUrl} alt={c.label} style={{ width: '60%', height: '60%', objectFit: 'contain' }} />
              ) : (
                c.label
              )}
            </div>
          </div>
        );
      })}

      {/* Model/video drag handles -- invisible-ish hit targets over the
          WebGL-rendered mesh (not a DOM element itself, so it can't carry
          pointer handlers directly), centered at the exact same projected
          point positionGroups() renders it at. A dashed ring instead of
          fully invisible so it's discoverable as draggable at all, since
          nothing about a 3D-rendered model visually says "drag me". */}
      {editable && modelProj && (
        <div
          {...dragHandlers('model')}
          title="Drag to reposition the 3D model"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transform: `translate3d(${modelProj.x}px, ${modelProj.y}px, 0) translate(-50%, -50%)`,
            width: 64,
            height: 64,
            borderRadius: '50%',
            border: '2px dashed rgba(255,255,255,0.7)',
            cursor: dragging === 'model' ? 'grabbing' : 'grab',
            touchAction: 'none',
            zIndex: dragging === 'model' ? 10 : 2,
          }}
        />
      )}
      {editable && videoProj && (
        <div
          {...dragHandlers('video')}
          title="Drag to reposition the AR Video/Photo panel"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transform: `translate3d(${videoProj.x}px, ${videoProj.y}px, 0) translate(-50%, -50%)`,
            width: 64,
            height: 64,
            borderRadius: '50%',
            border: '2px dashed rgba(255,255,255,0.7)',
            cursor: dragging === 'video' ? 'grabbing' : 'grab',
            touchAction: 'none',
            zIndex: dragging === 'video' ? 10 : 2,
          }}
        />
      )}

      {editable && (
        <button
          type="button"
          onClick={resetView}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 'auto',
            padding: '6px 12px',
            fontSize: 11,
            zIndex: 20,
          }}
        >
          Reset view
        </button>
      )}
    </div>
  );
}
