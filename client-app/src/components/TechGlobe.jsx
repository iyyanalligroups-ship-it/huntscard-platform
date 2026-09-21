import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Real-time WebGL hero background -- a rotating point-cloud globe, in
// this app's own holo-gradient palette (its earlier great-circle "data
// transfer" arcs across the surface were removed per direct request).
// Layout/motion idea adapted from
// weevolveit.com's own hero globe (per the user's own request: borrow the
// design/animation/3D concept, never the literal colors or content) --
// this is an original build, not a copy of their asset or code, and
// intentionally does NOT attempt real continent outlines (that needs a
// real geographic dot-density dataset this project doesn't have; faking
// it without one would look sloppy) -- an evenly-speckled "network globe"
// is its own legitimate, honest version of the same "worldwide data"
// motif instead. Replaces BroadcastField.jsx on the home hero (that file
// is left on disk, just no longer referenced -- this project has no git
// history to restore from if it turns out still wanted).
//
// Plain three.js + refs (no @react-three/fiber), matching every other
// Three.js usage already in this codebase (ArScanPreview.jsx,
// MagicCamera.jsx, the BroadcastField.jsx this replaces).
const POINT_COUNT = 2200;
const GLOBE_RADIUS = 4;

function readThemeColors() {
  // Same body-not-documentElement caveat as BroadcastField.jsx -- the
  // orange/cyber theme classes toggle on document.body (see
  // PublicLayout.jsx), not <html>.
  const style = getComputedStyle(document.body);
  const read = (name, fallback) => {
    const v = style.getPropertyValue(name).trim();
    return v ? new THREE.Color(v) : new THREE.Color(fallback);
  };
  return [read('--holo-cyan', '#5eead4'), read('--holo-violet', '#a78bfa'), read('--holo-magenta', '#f472b6')];
}

// Evenly distributes `count` points across a sphere's surface -- a
// uniform random lat/lng scatter visibly clumps at the poles, the
// Fibonacci lattice doesn't.
function fibonacciSpherePoints(count, radius) {
  const points = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2; // 1..-1
    const radiusAtY = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;
    const x = Math.cos(theta) * radiusAtY;
    const z = Math.sin(theta) * radiusAtY;
    points.push(new THREE.Vector3(x, y, z).multiplyScalar(radius));
  }
  return points;
}

export default function TechGlobe() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const colors = readThemeColors();

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 11);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    // ---- Point cloud (the globe's own "surface") ----------------------
    const spherePoints = fibonacciSpherePoints(POINT_COUNT, GLOBE_RADIUS);
    const positions = new Float32Array(POINT_COUNT * 3);
    const pointColors = new Float32Array(POINT_COUNT * 3);
    const pointColorSlot = new Uint8Array(POINT_COUNT); // stored separately so refreshColors() can recolor in place on theme change, same pattern as BroadcastField.jsx
    spherePoints.forEach((p, i) => {
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      const slot = Math.floor(Math.random() * colors.length);
      pointColorSlot[i] = slot;
      const c = colors[slot];
      pointColors[i * 3] = c.r;
      pointColors[i * 3 + 1] = c.g;
      pointColors[i * 3 + 2] = c.b;
    });
    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pointGeometry.setAttribute('color', new THREE.BufferAttribute(pointColors, 3));
    const pointMaterial = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const globePoints = new THREE.Points(pointGeometry, pointMaterial);
    globeGroup.add(globePoints);

    // Same "toggled on body, arrives after this component's own mount
    // effect" caveat as BroadcastField.jsx -- watch for the theme class
    // actually landing and recolor everything already built instead of
    // guessing at timing.
    function refreshColors() {
      const next = readThemeColors();
      const colorAttr = pointGeometry.attributes.color;
      for (let i = 0; i < POINT_COUNT; i++) {
        const c = next[pointColorSlot[i]];
        colorAttr.setXYZ(i, c.r, c.g, c.b);
      }
      colorAttr.needsUpdate = true;
    }
    const themeObserver = new MutationObserver(refreshColors);
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    function resize() {
      const { clientWidth, clientHeight } = container;
      if (!clientWidth || !clientHeight) return;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    // Subtle parallax, same "light reacts to you" idea as the hero's own
    // cursor spotlight and BroadcastField.jsx's own tilt.
    const pointer = { x: 0, y: 0 };
    function handlePointerMove(e) {
      const rect = container.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    }
    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    let rafId = null;
    let visible = document.visibilityState === 'visible';
    function handleVisibility() {
      visible = document.visibilityState === 'visible';
      if (visible && !reduceMotion) start();
    }
    document.addEventListener('visibilitychange', handleVisibility);

    function renderStaticFrame() {
      globeGroup.rotation.set(0.15, 0.3, 0);
      renderer.render(scene, camera);
    }

    function animate(time) {
      if (!visible) {
        rafId = null;
        return;
      }
      const t = time / 1000;
      // Slow constant spin, like a real globe -- plus the same pointer-tilt
      // parallax BroadcastField.jsx uses, layered on top rather than
      // replacing it.
      globeGroup.rotation.y = t * 0.08 + pointer.x * 0.15;
      globeGroup.rotation.x = 0.15 + pointer.y * -0.08;

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    }

    function start() {
      if (rafId != null) return;
      rafId = requestAnimationFrame(animate);
    }

    if (reduceMotion) {
      renderStaticFrame();
    } else {
      start();
    }

    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pointermove', handlePointerMove);
      themeObserver.disconnect();
      resizeObserver.disconnect();
      pointGeometry.dispose();
      pointMaterial.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={containerRef} className="tech-globe" aria-hidden="true" />;
}
