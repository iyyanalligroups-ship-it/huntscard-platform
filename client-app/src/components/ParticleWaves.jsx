import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Full-screen particle wave field that sits behind the whole public site (Auros-style
// "bioluminescent" sheet). Motion comes from three places:
//   - time: the sheet always ripples slowly
//   - scroll: GSAP ScrollTrigger drives the camera tilt/height and how big the waves are, and the
//     scroll VELOCITY makes the sheet surge while you scroll
//   - pointer: the cursor pushes a bump into the sheet
// The wave maths runs in the vertex shader, so a dense grid costs almost nothing on the CPU.
const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  uniform vec2 uMouse;
  uniform float uSize;
  varying float vH;
  varying float vFade;
  void main() {
    vec3 p = position;
    float w = sin(p.x * 0.55 + uTime * 0.9) * 0.55
            + cos(p.z * 0.45 + uTime * 0.7) * 0.5
            + sin((p.x + p.z) * 0.28 + uTime * 0.5) * 0.7;
    float d = distance(p.xz, uMouse);
    w += exp(-d * d * 0.07) * 1.3;
    p.y += w * uAmp;
    vH = w;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (22.0 / -mv.z);
    vFade = smoothstep(46.0, 8.0, -mv.z);
  }
`;
const FRAG = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uB;
  varying float vH;
  varying float vFade;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5) discard;
    vec3 col = mix(uA, uB, smoothstep(-1.0, 2.2, vH));
    gl_FragColor = vec4(col, (1.0 - r * 2.0) * 0.85 * vFade);
  }
`;

export default function ParticleWaves() {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const small = window.matchMedia('(max-width: 760px)').matches;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);

    const cols = small ? 90 : 190;
    const rows = small ? 60 : 110;
    const spacing = 0.34;
    const pos = new Float32Array(cols * rows * 3);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const k = (i * rows + j) * 3;
        pos[k] = (i - cols / 2) * spacing;
        pos[k + 1] = 0;
        pos[k + 2] = -j * spacing * 1.1;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const uniforms = {
      uTime: { value: 0 },
      uAmp: { value: 0.7 },
      uMouse: { value: new THREE.Vector2(999, 999) },
      uSize: { value: small ? 1.6 : 1.9 },
      uA: { value: new THREE.Color('#00827c') },
      uB: { value: new THREE.Color('#fde9ff') },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    // scroll state, written by ScrollTrigger and eased into the scene every frame
    const state = { progress: 0, velocity: 0, pointerX: 0, pointerY: 0 };
    const smooth = { progress: 0, velocity: 0 };
    const st = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => {
        state.progress = self.progress;
        state.velocity = gsap.utils.clamp(-1, 1, self.getVelocity() / 2500);
      },
    });

    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    function onPointer(e) {
      state.pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      state.pointerY = (e.clientY / window.innerHeight) * 2 - 1;
    }
    window.addEventListener('pointermove', onPointer, { passive: true });

    let running = true;
    function onVisibility() {
      running = !document.hidden;
    }
    document.addEventListener('visibilitychange', onVisibility);

    const clock = new THREE.Clock();
    let time = 0;
    const ray = new THREE.Vector3();
    function tick() {
      const dt = Math.min(clock.getDelta(), 0.05);
      if (running) {
        // ease the scroll inputs so the motion never snaps
        smooth.progress += (state.progress - smooth.progress) * 0.06;
        smooth.velocity += (state.velocity - smooth.velocity) * 0.08;
        time += dt * (reduceMotion ? 0.15 : 1 + Math.abs(smooth.velocity) * 4);

        uniforms.uTime.value = time;
        uniforms.uAmp.value = 0.7 + Math.abs(smooth.velocity) * 1.4 + smooth.progress * 0.5;

        // camera drifts up and tilts as you scroll down the page
        camera.position.set(state.pointerX * 1.2, 3.4 + smooth.progress * 5.5, 7 - smooth.progress * 3);
        camera.lookAt(state.pointerX * 0.8, 0.4 - smooth.progress * 1.2, -14);
        points.rotation.y = smooth.progress * 0.5 + state.pointerX * 0.05;

        // cursor bump: project the pointer onto the sheet's plane
        ray.set(state.pointerX, -state.pointerY, 0.5).unproject(camera).sub(camera.position).normalize();
        const t = -camera.position.y / (ray.y || -0.0001);
        uniforms.uMouse.value.set(camera.position.x + ray.x * t, camera.position.z + ray.z * t);

        renderer.render(scene, camera);
      }
    }
    gsap.ticker.add(tick);

    return () => {
      gsap.ticker.remove(tick);
      st.kill();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, []);

  return <div className="particle-waves" ref={hostRef} aria-hidden="true" />;
}
