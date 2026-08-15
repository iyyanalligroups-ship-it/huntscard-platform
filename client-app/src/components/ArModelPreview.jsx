import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Replaces ArLayout.jsx's old <model-viewer> preview -- model-viewer only
// understands glTF/GLB, so it silently rendered a blank box for any .fbx
// model (arModelType === 'fbx', see backend/models/Client.js). This is a
// real Three.js scene instead, so it loads whichever loader the model
// actually needs -- same GLTFLoader/FBXLoader branch ArView.jsx's real AR
// view uses.
//
// Free-orbit (OrbitControls) rather than a turntable auto-spin --
// deliberately, this panel's own copy says "just for checking the model
// itself, not editing its position on the card", i.e. drag here moves the
// CAMERA, unlike the Layout/Scan preview panels where drag moves the
// element. The model's own saved rotation (rotationX/Y/Z, degrees) is
// still applied to the model itself, same 'YXZ' Euler order and
// autofit-then-customScale formula as ArView.jsx's applyModelTransform --
// this preview and the real AR view should always agree on how a given
// rotation/scale actually looks.
const TARGET_SIZE = 1;

export default function ArModelPreview({ modelUrl, modelType, rotationX = 0, rotationY = 0, rotationZ = 0, scale = 1, width = '100%', height = 220 }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const modelRef = useRef(null);
  const autoFitScaleRef = useRef(1);
  const rafRef = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Latest rotation/scale, readable from inside the render loop's closure
  // without needing to reload the model (and reset the camera/orbit)
  // every time a rotation button is clicked.
  const rotationXRef = useRef(rotationX);
  const rotationYRef = useRef(rotationY);
  const rotationZRef = useRef(rotationZ);
  const scaleRef = useRef(scale);
  const applyTransformRef = useRef(() => {});

  function applyTransform() {
    const model = modelRef.current;
    if (!model) return;
    model.scale.setScalar(autoFitScaleRef.current * (scaleRef.current ?? 1));
    model.rotation.order = 'YXZ';
    model.rotation.set(
      THREE.MathUtils.degToRad(rotationXRef.current ?? 0),
      THREE.MathUtils.degToRad(rotationYRef.current ?? 0),
      THREE.MathUtils.degToRad(rotationZRef.current ?? 0)
    );
  }
  applyTransformRef.current = applyTransform;

  // Load once per model -- rotation/scale changes are applied to the
  // already-loaded object in the effect below, not reloaded from scratch.
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const w = container.clientWidth;
    const h = typeof height === 'number' ? height : container.clientHeight;
    canvas.width = w;
    canvas.height = h;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h, false);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const directional = new THREE.DirectionalLight(0xffffff, 0.9);
    directional.position.set(1, 2, 2);
    scene.add(directional);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, TARGET_SIZE * 0.6, TARGET_SIZE * 2.6);

    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, TARGET_SIZE * 0.4, 0);
    controls.enableDamping = true;

    setLoading(true);
    setError('');
    modelRef.current = null;
    let mixer = null;
    const clock = new THREE.Clock();

    function onLoaded(scene3d, animations) {
      if (cancelled) return;
      const box = new THREE.Box3().setFromObject(scene3d);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      autoFitScaleRef.current = TARGET_SIZE / maxDim;
      scene.add(scene3d);
      modelRef.current = scene3d;
      applyTransformRef.current();
      if (animations?.length) {
        mixer = new THREE.AnimationMixer(scene3d);
        mixer.clipAction(animations[0]).play();
      }
      setLoading(false);
    }
    function onError(err) {
      if (!cancelled) setError(`Could not load the 3D model: ${err?.message || err}`);
    }

    if (modelType === 'fbx') {
      new FBXLoader().load(modelUrl, (fbx) => onLoaded(fbx, fbx.animations), undefined, onError);
    } else {
      new GLTFLoader().load(modelUrl, (gltf) => onLoaded(gltf.scene, gltf.animations), undefined, onError);
    }

    function renderLoop() {
      controls.update();
      mixer?.update(clock.getDelta());
      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(renderLoop);
    }
    renderLoop();

    function handleResize() {
      const rw = container.clientWidth;
      const rh = typeof height === 'number' ? height : container.clientHeight;
      renderer.setSize(rw, rh, false);
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', handleResize);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(rafRef.current);
      mixer?.stopAllAction();
      controls.dispose();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl, modelType, height]);

  useEffect(() => {
    rotationXRef.current = rotationX;
    rotationYRef.current = rotationY;
    rotationZRef.current = rotationZ;
    scaleRef.current = scale;
    applyTransformRef.current();
  }, [rotationX, rotationY, rotationZ, scale]);

  return (
    <div ref={containerRef} style={{ position: 'relative', width, height, borderRadius: 'var(--radius)', overflow: 'hidden', background: '#f4f4f4' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      {loading && !error && (
        <p className="hint" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, color: '#666' }}>
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
