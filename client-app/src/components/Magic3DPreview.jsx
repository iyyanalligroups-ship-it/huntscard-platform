import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// "ar tech 1" -- plain (non-AR, no camera) Three.js viewer for a 3D
// model, used on the client dashboard's Profile Settings page to preview
// the "3D model" AR QR slot (Profile.jsx, arModelUrl/arModelType).
// Originally built for Magic Business Card's own 3D model slot, which
// was later removed entirely in favor of video-only cards -- kept on
// disk unused at the time specifically for this reuse. Deliberately NOT
// mind-ar-tracked like MagicCamera.jsx/ArViewMindAR.jsx -- this is just a
// standalone turntable so the owner can see their model animate/rotate
// without needing a camera at all. Reuses ArViewMindAR.jsx's proven
// bounding-box auto-fit approach (scale to a fixed target size regardless
// of the model's native scale) and GLTFLoader import pattern; FBXLoader
// is the second branch, picked via the `modelType` prop.
const TARGET_SIZE = 1; // the model's longest dimension is scaled to this many Three.js units
const ROTATE_SPEED = 0.5; // radians/sec

export default function Magic3DPreview({ modelUrl, modelType, width = 280, height = 350 }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let renderer;
    let mixer;

    const canvas = canvasRef.current;
    canvas.width = width;
    canvas.height = height;
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height, false);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const directional = new THREE.DirectionalLight(0xffffff, 0.9);
    directional.position.set(1, 2, 2);
    scene.add(directional);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, TARGET_SIZE * 0.5, TARGET_SIZE * 2.4);
    camera.lookAt(0, TARGET_SIZE * 0.4, 0);

    // Rotated as a whole -- keeps the model's own centering offsets
    // (below) simple, rather than compounding rotation with position.
    const turntable = new THREE.Group();
    scene.add(turntable);

    function onModelLoaded(model, animations) {
      if (cancelled) return;
      // Center horizontally, and sit the model's bottom at y=0 (like
      // standing on a turntable) rather than centering vertically too --
      // a naive full-center makes a standing character look like it's
      // floating at an odd height.
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const scale = TARGET_SIZE / maxDim;
      model.scale.setScalar(scale);
      model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
      turntable.add(model);

      if (animations?.length) {
        mixer = new THREE.AnimationMixer(model);
        mixer.clipAction(animations[0]).play();
      }
      setLoading(false);
    }

    if (modelType === 'fbx') {
      new FBXLoader().load(
        modelUrl,
        (fbx) => onModelLoaded(fbx, fbx.animations),
        undefined,
        (err) => !cancelled && setError(`Could not load the 3D model: ${err.message || err}`)
      );
    } else {
      new GLTFLoader().load(
        modelUrl,
        (gltf) => onModelLoaded(gltf.scene, gltf.animations),
        undefined,
        (err) => !cancelled && setError(`Could not load the 3D model: ${err.message || err}`)
      );
    }

    const clock = new THREE.Clock();
    function renderLoop() {
      const delta = clock.getDelta();
      mixer?.update(delta);
      turntable.rotation.y += delta * ROTATE_SPEED;
      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(renderLoop);
    }
    renderLoop();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      mixer?.stopAllAction();
      renderer.dispose();
    };
  }, [modelUrl, modelType, width, height]);

  return (
    <div style={{ position: 'relative', width, height, borderRadius: 10, overflow: 'hidden', background: '#000' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      {loading && !error && (
        <p className="hint" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0 }}>
          Loading 3D model…
        </p>
      )}
      {error && (
        <p className="error-banner" style={{ position: 'absolute', inset: 8, margin: 0, fontSize: 12 }}>
          {error}
        </p>
      )}
    </div>
  );
}
