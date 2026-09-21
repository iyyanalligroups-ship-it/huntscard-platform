import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Real-time WebGL hero background -- a drifting field of glowing points,
// standing in for the NFC induction broadcast the whole product is built
// around, with a thin constellation-style network drawn between nearby
// points -- adapted from this app's own DESIGN-scale-com.md ("ai
// platform, data deployment, machine learning" tone), reading as a data/
// neural-network graph rather than plain dust. Colors are read live from
// this app's own --holo-cyan/violet/magenta CSS custom properties (see
// styles.css's --holo-gradient) rather than hardcoded, so it
// automatically follows whichever theme (default/orange/cyber) is active.
//
// An earlier pass also added expanding "ping" rings and floating card
// panels connected by data-stream lines, but those turned out to be the
// wrong call once actually seen next to the rest of the hero: the card
// panels' wireframe edges rendered as a stray diagonal (a plain
// PlaneGeometry is two triangles, and `wireframe: true` draws every
// triangle edge, including the split down the middle -- it read as
// broken diamond/triangle shapes, not cards), and even fixed, a second
// "floating card" motif was competing with the hero's own real holo-card
// mockup rather than complementing it. The ping rings had the same
// problem from a different angle -- the hero already has its own
// localized induction-ring effect around the card (.bg-ring/.tap-ring in
// styles.css, see Home.jsx). Lesson carried into the network lines below:
// built from explicit LineSegments geometry, never `wireframe: true`, so
// there's no equivalent diagonal-artifact risk.
//
// Plain three.js + refs (no @react-three/fiber), matching every other
// Three.js usage already in this codebase (ArScanPreview.jsx,
// MagicCamera.jsx) -- kept consistent rather than introducing a second
// pattern.
const PARTICLE_COUNT = 140;
const FIELD_WIDTH = 34;
const FIELD_HEIGHT = 18;
const FIELD_DEPTH = 10;
// A point links to its nearest neighbors within this distance, capped per
// point -- keeps the network sparse (a loose constellation, not a dense
// woven mesh) regardless of how crowded any one region of the field gets.
const LINK_MAX_DIST = 4.5;
const LINK_MAX_PER_POINT = 2;

function readThemeColors() {
  // The orange/cyber theme classes get toggled on document.body (see
  // PublicLayout.jsx), not document.documentElement (<html>) -- reading
  // computed style off <html> was silently missing those themes'
  // redefined --holo-cyan/violet/magenta entirely and always falling
  // back to the default palette instead, even with cyber (this site's
  // actual active theme) turned on.
  const style = getComputedStyle(document.body);
  const read = (name, fallback) => {
    const v = style.getPropertyValue(name).trim();
    return v ? new THREE.Color(v) : new THREE.Color(fallback);
  };
  return [read('--holo-cyan', '#5eead4'), read('--holo-violet', '#a78bfa'), read('--holo-magenta', '#f472b6')];
}

export default function BroadcastField() {
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
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 20);

    // One BufferGeometry, vertex-colored so the whole field reads as the
    // app's own holo gradient rather than a flat tint. Each particle's
    // color-slot choice (0/1/2, into `colors`) is stored separately from
    // the actual RGB written into the buffer, so refreshColors() below
    // can recolor every particle in place when the theme changes without
    // reshuffling which particle got which slot.
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const particleColors = new Float32Array(PARTICLE_COUNT * 3);
    const particleColorSlot = new Uint8Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * FIELD_WIDTH;
      positions[i * 3 + 1] = (Math.random() - 0.5) * FIELD_HEIGHT;
      positions[i * 3 + 2] = (Math.random() - 0.5) * FIELD_DEPTH;
      const slot = Math.floor(Math.random() * colors.length);
      particleColorSlot[i] = slot;
      const c = colors[slot];
      particleColors[i * 3] = c.r;
      particleColors[i * 3 + 1] = c.g;
      particleColors[i * 3 + 2] = c.b;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
    // A single flat size for every point (not per-vertex) -- varying that
    // would need a custom ShaderMaterial, not worth it for one cosmetic
    // detail on an ambient background field.
    const particleMaterial = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const particleField = new THREE.Points(particleGeometry, particleMaterial);

    // Nearest-neighbor link pairs, computed once from the field's initial
    // (and, since the field only ever rotates as a rigid body below,
    // permanent) relative positions -- an O(n^2) scan is fine at this
    // point count (140) and only runs once per mount, never per frame.
    const linkPositions = [];
    const linkCounts = new Uint8Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      if (linkCounts[i] >= LINK_MAX_PER_POINT) continue;
      let bestJ = -1;
      let bestDist = LINK_MAX_DIST;
      for (let j = i + 1; j < PARTICLE_COUNT; j++) {
        if (linkCounts[j] >= LINK_MAX_PER_POINT) continue;
        const dx = positions[i * 3] - positions[j * 3];
        const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
        const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < bestDist) {
          bestDist = dist;
          bestJ = j;
        }
      }
      if (bestJ !== -1) {
        linkCounts[i]++;
        linkCounts[bestJ]++;
        linkPositions.push(
          positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2],
          positions[bestJ * 3], positions[bestJ * 3 + 1], positions[bestJ * 3 + 2]
        );
      }
    }
    const linkGeometry = new THREE.BufferGeometry();
    linkGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linkPositions), 3));
    const linkMaterial = new THREE.LineBasicMaterial({
      color: colors[0],
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const networkLines = new THREE.LineSegments(linkGeometry, linkMaterial);

    // Shared parent so the particles and the network drawn between them
    // rotate together as one composition (see animate() below) rather
    // than as two independently-moving layers.
    const fieldGroup = new THREE.Group();
    fieldGroup.add(particleField, networkLines);
    scene.add(fieldGroup);

    // PublicLayout.jsx fetches homeTheme asynchronously and only THEN
    // toggles the theme-cyber/orange class on body -- this component's
    // own mount effect (this one) runs well before that network round
    // trip resolves, so the `colors` read above is frequently still the
    // default palette even when a non-default theme is actually active.
    // Rather than guess at timing, just watch body's class list directly
    // and recolor everything already built whenever it actually changes.
    function refreshColors() {
      const next = readThemeColors();
      const colorAttr = particleGeometry.attributes.color;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const c = next[particleColorSlot[i]];
        colorAttr.setXYZ(i, c.r, c.g, c.b);
      }
      colorAttr.needsUpdate = true;
      linkMaterial.color.copy(next[0]);
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

    // Subtle parallax -- the field tilts slightly toward wherever the
    // cursor is, same "light reacts to you" idea the hero's cursor
    // spotlight (see .hero-spotlight in styles.css) already uses.
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
      fieldGroup.rotation.set(0.08, 0.1, 0);
      renderer.render(scene, camera);
    }

    function animate(time) {
      if (!visible) {
        rafId = null;
        return;
      }
      const t = time / 1000;

      fieldGroup.rotation.y = t * 0.012 + pointer.x * 0.1;
      fieldGroup.rotation.x = pointer.y * -0.06;

      camera.position.x += (pointer.x * 1.2 - camera.position.x) * 0.02;
      camera.position.y += (-pointer.y * 0.8 - camera.position.y) * 0.02;
      camera.lookAt(0, 0, 0);

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
      particleGeometry.dispose();
      particleMaterial.dispose();
      linkGeometry.dispose();
      linkMaterial.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={containerRef} className="broadcast-field" aria-hidden="true" />;
}
