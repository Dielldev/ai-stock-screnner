import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { gsap } from "gsap";

/**
 * The folio bot — a ceramic-white droid with a black glass visor, built
 * entirely from primitives so it ships with zero model assets.
 * Idles with a float cycle, watches the cursor, blinks, and glances
 * around on its own when nobody moves the mouse.
 */
export default function FolioBot({ active = true, className = "" }) {
  const mountRef = useRef(null);
  const activeRef = useRef(active);
  const enteredRef = useRef(false);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 0.2, 7.4);
    camera.lookAt(0, -0.25, 0);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
    keyLight.position.set(2.5, 4, 5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.55);
    rimLight.position.set(-3, 2, -4);
    scene.add(rimLight);

    const ceramic = new THREE.MeshPhysicalMaterial({
      color: 0xf6f6f1,
      roughness: 0.34,
      metalness: 0.02,
      clearcoat: 1,
      clearcoatRoughness: 0.22,
    });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x111210,
      roughness: 0.16,
      metalness: 0.15,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    });
    const matte = new THREE.MeshStandardMaterial({ color: 0x131410, roughness: 0.5 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xdce7ff }); // baby-blue eye light
    glow.toneMapped = false;

    const root = new THREE.Group();
    root.visible = false;
    scene.add(root);

    const bot = new THREE.Group();
    root.add(bot);

    // Head: a soft ovoid with the visor pushing through its front face.
    const headGroup = new THREE.Group();
    bot.add(headGroup);

    const head = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), ceramic);
    head.scale.set(1, 0.85, 0.92);
    headGroup.add(head);

    const visor = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), glass);
    visor.scale.set(0.72, 0.48, 0.52);
    visor.position.set(0, -0.02, 0.55);
    headGroup.add(visor);

    const eyesGroup = new THREE.Group();
    eyesGroup.position.set(0, 0, 0);
    headGroup.add(eyesGroup);
    const eyeGeo = new THREE.CapsuleGeometry(0.082, 0.17, 8, 16);
    const eyeL = new THREE.Mesh(eyeGeo, glow);
    eyeL.position.set(-0.26, -0.01, 1.0);
    eyeL.scale.z = 0.45;
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.26;
    eyesGroup.add(eyeL, eyeR);

    const antenna = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.42, 12), matte);
    stem.position.y = 0.21;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), glow);
    tip.position.y = 0.45;
    antenna.add(stem, tip);
    antenna.position.set(0, 0.82, 0);
    headGroup.add(antenna);

    // Body: a smaller egg floating below the head, plus a status light.
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), ceramic);
    body.scale.set(0.56, 0.7, 0.5);
    body.position.y = -1.42;
    bot.add(body);

    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), glow);
    chest.position.set(0, -1.18, 0.47);
    bot.add(chest);

    // Arm pods, detached and hovering at the sides.
    const podGeo = new THREE.CapsuleGeometry(0.13, 0.3, 8, 16);
    const podL = new THREE.Mesh(podGeo, ceramic);
    podL.position.set(-1.18, -0.85, 0);
    podL.rotation.z = 0.32;
    const podR = new THREE.Mesh(podGeo, ceramic);
    podR.position.set(1.18, -0.85, 0);
    podR.rotation.z = -0.32;
    bot.add(podL, podR);

    // Soft blob shadow on a radial-gradient canvas, instead of real shadows.
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 128;
    const sctx = shadowCanvas.getContext("2d");
    const grad = sctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, "rgba(28,38,72,0.8)");
    grad.addColorStop(1, "rgba(28,38,72,0)");
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 128, 128);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 1.15),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(shadowCanvas),
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -2.45;
    root.add(shadow);

    // --- interaction state ---
    const startTime = performance.now();
    let lastTime = startTime;
    const nowSeconds = () => (performance.now() - startTime) / 1000;

    const pointer = { x: 0, y: 0 };
    const gaze = { x: 0, y: 0 }; // where the eyes wander when the mouse is idle
    let lastPointerMove = 0;
    let nextGlance = 2.5;
    let nextBlink = 2 + Math.random() * 3;
    let blinkStart = -1;

    const onPointerMove = (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
      lastPointerMove = nowSeconds();
    };
    if (finePointer) window.addEventListener("pointermove", onPointerMove);

    // --- sizing ---
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (reduced) renderer.render(scene, camera);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    // --- visibility-gated render loop ---
    let inView = true;
    const io = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
    });
    io.observe(mount);

    let raf = 0;

    const enter = () => {
      root.visible = true;
      enteredRef.current = true;
      if (reduced) {
        renderer.render(scene, camera);
        return;
      }
      gsap.fromTo(
        root.scale,
        { x: 0.55, y: 0.55, z: 0.55 },
        { x: 1, y: 1, z: 1, duration: 1.5, ease: "elastic.out(1, 0.6)" }
      );
      gsap.fromTo(
        root.position,
        { y: -2.4 },
        { y: 0, duration: 1.1, ease: "power3.out" }
      );
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!enteredRef.current && activeRef.current) enter();
      if (!inView || document.hidden || !enteredRef.current) return;

      const frameNow = performance.now();
      const dt = Math.min((frameNow - lastTime) / 1000, 0.05) || 0.016;
      lastTime = frameNow;
      const t = (frameNow - startTime) / 1000;

      // float cycle — every part lags the head a little
      bot.position.y = Math.sin(t * 1.4) * 0.09;
      body.position.y = -1.42 + Math.sin(t * 1.4 - 0.7) * 0.05;
      chest.position.y = -1.18 + Math.sin(t * 1.4 - 0.7) * 0.05;
      podL.position.y = -0.85 + Math.sin(t * 1.4 - 1.2) * 0.08;
      podR.position.y = -0.85 + Math.sin(t * 1.4 - 1.6) * 0.08;
      antenna.rotation.z = Math.sin(t * 2.1) * 0.07;
      shadow.material.opacity = 0.3 - Math.sin(t * 1.4) * 0.06;
      const shadowPulse = 1 - Math.sin(t * 1.4) * 0.05;
      shadow.scale.set(shadowPulse, shadowPulse, 1);

      // gaze: cursor if it moved recently, otherwise wander on a timer
      if (t - lastPointerMove > 3.2 && t > nextGlance) {
        gaze.x = (Math.random() - 0.5) * 1.4;
        gaze.y = (Math.random() - 0.5) * 0.7;
        nextGlance = t + 1.8 + Math.random() * 2.4;
      }
      const targetX = finePointer && t - lastPointerMove <= 3.2 ? pointer.x : gaze.x;
      const targetY = finePointer && t - lastPointerMove <= 3.2 ? pointer.y : gaze.y;

      const ease = 1 - Math.pow(0.0025, dt);
      headGroup.rotation.y += (targetX * 0.42 - headGroup.rotation.y) * ease;
      headGroup.rotation.x += (targetY * 0.22 - headGroup.rotation.x) * ease;
      bot.rotation.y += (targetX * 0.12 - bot.rotation.y) * ease * 0.6;
      eyesGroup.position.x += (targetX * 0.05 - eyesGroup.position.x) * ease;
      eyesGroup.position.y += (-targetY * 0.04 - eyesGroup.position.y) * ease;

      // blink
      if (blinkStart < 0 && t > nextBlink) blinkStart = t;
      if (blinkStart >= 0) {
        const p = (t - blinkStart) / 0.22;
        if (p >= 1) {
          blinkStart = -1;
          nextBlink = t + 2.2 + Math.random() * 3.4;
          eyeL.scale.y = eyeR.scale.y = 1;
        } else {
          const closed = Math.sin(Math.min(p, 1) * Math.PI);
          eyeL.scale.y = eyeR.scale.y = 1 - closed * 0.92;
        }
      }

      renderer.render(scene, camera);
    };

    if (reduced) {
      // single static frame; no loop
      root.visible = true;
      enteredRef.current = true;
      renderer.render(scene, camera);
    } else {
      raf = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      if (finePointer) window.removeEventListener("pointermove", onPointerMove);
      gsap.killTweensOf([root.scale, root.position]);
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      });
      pmrem.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      enteredRef.current = false;
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className={`folio-bot ${className}`}
      aria-hidden="true"
    />
  );
}
