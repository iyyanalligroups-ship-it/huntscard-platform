import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { api, API_URL } from '../api.js';
import {
  MODEL_SIZE,
  VIDEO_PLANE_BASE_W,
  VIDEO_PLANE_BASE_H,
  MODEL_IMAGE_BASE_W,
  toLocalOffset,
  projectLocalPoint,
  focalPxFor,
  STATIC_PREVIEW_POSE,
} from '../lib/arProjection.js';

/**
 * A static "what will this actually look like when someone scans it"
 * preview -- used by the AR Layout editors, next to the flat drag-to-
 * position canvas. Unlike that flat canvas (plain CSS percentages, no
 * real rendering pipeline) this reuses the SAME Three.js model/video
 * rendering and the SAME projectLocalPoint math ArView.jsx (the real
 * live camera view) uses, just fed a fixed straight-on pose
 * (STATIC_PREVIEW_POSE) instead of a live tracked one -- no camera
 * permission needed, updates live as `layout` changes while editing.
 *
 * Deliberately a separate component from ArView.jsx rather than a mode
 * flag on it -- that component's whole structure is built around a live
 * camera + frame loop (getUserMedia, requestAnimationFrame, POSIT
 * tracking) that this has no use for; forking the small amount of
 * genuinely shared logic (model/video loading, the flat panel layer) was
 * safer than threading a "no camera" branch through every one of those
 * effects and risking the real live view.
 */

const ELEMENTS = [
  { key: 'video', label: 'AR Video / Photo', color: '#8b5cf6' },
  { key: 'contact', label: 'Contact Info', color: '#14b8a6' },
  { key: 'portfolio', label: 'Portfolio', color: '#4f8ef7' },
  { key: 'social', label: 'Social Icons', color: '#ec4899' },
  { key: 'huntsworld', label: 'Huntsworld Link', color: '#f5a524' },
];

export default function ArScanPreview({ profile, layout }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const threeRef = useRef(null); // { renderer, scene, camera, modelGroup, videoGroup }
  const loadedModelRef = useRef(null);
  const autoFitScaleRef = useRef(1);
  const videoPlaneRef = useRef(null);
  const [size, setSize] = useState({ w: 320, h: 400 });
  const [icons, setIcons] = useState({});

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

  // Three.js scene setup -- same lighting/camera shape as ArView.jsx's own,
  // so a GLB model looks the same here as it will in the real AR view
  // (model-viewer's own camera/exposure, used elsewhere in the editor for
  // a quick spin-around preview, doesn't match this at all).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w < 10 || size.h < 10) return;
    canvas.width = size.w;
    canvas.height = size.h;

    if (!threeRef.current) {
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(62, size.w / size.h, 0.01, 100);
      const modelGroup = new THREE.Group();
      const videoGroup = new THREE.Group();
      scene.add(modelGroup, videoGroup);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
      dirLight.position.set(1, 1, 1);
      scene.add(dirLight);
      threeRef.current = { renderer, scene, camera, modelGroup, videoGroup };
      if (loadedModelRef.current) modelGroup.add(loadedModelRef.current);
      if (videoPlaneRef.current) videoGroup.add(videoPlaneRef.current);
    }
    const three = threeRef.current;
    three.renderer.setSize(size.w, size.h, false);
    three.camera.aspect = size.w / size.h;
    three.camera.fov = 62;
    three.camera.updateProjectionMatrix();

    return () => {
      // Only torn down when the component itself unmounts (see the
      // dedicated cleanup effect below) -- resizing shouldn't dispose and
      // immediately recreate the renderer.
    };
  }, [size.w, size.h]);

  useEffect(
    () => () => {
      if (threeRef.current) {
        threeRef.current.renderer.dispose();
        threeRef.current = null;
      }
    },
    []
  );

  function renderThree() {
    const three = threeRef.current;
    if (!three) return;
    if (three.modelGroup.children.length || three.videoGroup.children.length) {
      three.renderer.render(three.scene, three.camera);
    }
  }

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

  // Positions the model/video groups at the fixed STATIC_PREVIEW_POSE
  // point for their saved (x%, y%) -- same math as ArView.jsx's own
  // updateModel/updateVideoPlane, just fed a constant pose instead of a
  // per-frame tracked one.
  function positionGroups() {
    const three = threeRef.current;
    if (!three) return;
    const { rotation, translation } = STATIC_PREVIEW_POSE;
    if (three.modelGroup.children.length) {
      const modelPos = layout?.model || { x: 50, y: 35 };
      const [lx, ly] = toLocalOffset(modelPos, qrPos);
      const move = [0, 1, 2].map((j) => translation[j] + rotation[j][0] * lx + rotation[j][1] * ly);
      three.modelGroup.position.set(move[0], move[1], -move[2]);
    }
    if (three.videoGroup.children.length) {
      const videoPos = layout?.video || { x: 50, y: 20 };
      const [lx, ly] = toLocalOffset(videoPos, qrPos);
      const move = [0, 1, 2].map((j) => translation[j] + rotation[j][0] * lx + rotation[j][1] * ly);
      three.videoGroup.position.set(move[0], move[1], -move[2]);
    }
  }

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
  // flat editor next to it.
  useEffect(() => {
    applyModelTransform();
    applyVideoTransform();
    positionGroups();
    renderThree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    layout?.qr?.x,
    layout?.qr?.y,
    layout?.model?.x,
    layout?.model?.y,
    layout?.modelRotationX,
    layout?.modelRotationY,
    layout?.modelRotationZ,
    layout?.modelScale,
    layout?.video?.x,
    layout?.video?.y,
    layout?.videoRotationX,
    layout?.videoRotationY,
    layout?.videoRotationZ,
    layout?.videoScaleX,
    layout?.videoScaleY,
    size.w,
    size.h,
  ]);

  if (!profile || !layout) return null;

  const focalPx = focalPxFor(size.h);
  const centerX = size.w / 2;
  const centerY = size.h / 2;

  // The card itself, drawn as a plain white box -- positioned/sized by
  // projecting its own corners through the same static pose everything
  // else uses, not a separate hand-rolled formula.
  const cardTL = projectLocalPoint(STATIC_PREVIEW_POSE, focalPx, centerX, centerY, [...toLocalOffset({ x: 0, y: 0 }, qrPos), 0]);
  const cardBR = projectLocalPoint(STATIC_PREVIEW_POSE, focalPx, centerX, centerY, [...toLocalOffset({ x: 100, y: 100 }, qrPos), 0]);

  const bannerUrl = profile?.arBannerUrl || profile?.arVideoUrl || profile?.photoUrl;
  const hasBannerMedia = bannerUrl;

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
      {cardTL && cardBR && (
        <div
          style={{
            position: 'absolute',
            left: cardTL.x,
            top: cardTL.y,
            width: cardBR.x - cardTL.x,
            height: cardBR.y - cardTL.y,
            background: '#fff',
            border: '2px solid #f5a524',
            borderRadius: 6,
            boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
          }}
        />
      )}

      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />

      {ELEMENTS.map((el) => {
        if (el.key === 'video' && hasBannerMedia) return null; // rendered by the Three.js layer above instead
        const pos = layout[el.key] || { x: 50, y: 50 };
        const local = [...toLocalOffset(pos, qrPos), 0];
        const proj = projectLocalPoint(STATIC_PREVIEW_POSE, focalPx, centerX, centerY, local);
        if (!proj) return null;
        const iconUrl = icons?.[el.key];
        return (
          <div
            key={el.key}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              transform: `translate3d(${proj.x}px, ${proj.y}px, 0) translate(-50%, -50%)`,
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

      {profile?.clientId && (
        (() => {
          const proj = projectLocalPoint(STATIC_PREVIEW_POSE, focalPx, centerX, centerY, [...toLocalOffset(qrPos, qrPos), 0]);
          if (!proj) return null;
          const qrSizePx = focalPx * (MODEL_SIZE / STATIC_PREVIEW_POSE.translation[2]);
          return (
            <img
              src={`${API_URL}/api/public/qr/${profile.clientId}?type=ar`}
              alt=""
              style={{
                position: 'absolute',
                left: proj.x - qrSizePx / 2,
                top: proj.y - qrSizePx / 2,
                width: qrSizePx,
                height: qrSizePx,
              }}
            />
          );
        })()
      )}
    </div>
  );
}
