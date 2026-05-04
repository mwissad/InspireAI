import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';

/* ─────────────────────────────────────────────
   Databricks-inspired 3D hero scene
   - Red cubes + spheres explode outward from center
   - Central glowing energy core
   - Slow orbit camera for depth
   ───────────────────────────────────────────── */

const DB_RED     = 0xff3621;
const DB_RED_D   = 0xcc2a1a;
const DB_RED_L   = 0xff6b50;
const WHITE      = 0xffffff;
const LIGHT_GRAY = 0xf5f5f5;

export default function HeroScene3D({ className = '' }) {
  const containerRef = useRef(null);
  const sceneRef     = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    /* ── Renderer ── */
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0); // transparent
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    /* ── Scene ── */
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    /* ── Camera ── */
    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.1,
      200
    );
    camera.position.set(0, 0, 28);

    /* ── Lights ── */
    const ambient = new THREE.AmbientLight(WHITE, 0.6);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(WHITE, 1.0);
    dirLight.position.set(5, 10, 8);
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(DB_RED, 3, 40);
    pointLight.position.set(0, 0, 0);
    scene.add(pointLight);

    const rimLight = new THREE.PointLight(DB_RED_L, 1.5, 50);
    rimLight.position.set(-8, 5, -5);
    scene.add(rimLight);

    /* ── Central glowing core ── */
    const coreMat = new THREE.MeshBasicMaterial({ color: DB_RED, transparent: true, opacity: 0.9 });
    const coreGeo = new THREE.SphereGeometry(0.6, 32, 32);
    const core = new THREE.Mesh(coreGeo, coreMat);
    scene.add(core);

    // Outer glow shell
    const glowMat = new THREE.MeshBasicMaterial({
      color: DB_RED_L,
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide,
    });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(2.0, 32, 32), glowMat);
    scene.add(glow);

    // Second glow layer
    const glow2Mat = new THREE.MeshBasicMaterial({
      color: DB_RED,
      transparent: true,
      opacity: 0.06,
      side: THREE.BackSide,
    });
    const glow2 = new THREE.Mesh(new THREE.SphereGeometry(3.5, 32, 32), glow2Mat);
    scene.add(glow2);

    /* ── Geometry pool ── */
    const cubeGeo   = new THREE.BoxGeometry(1, 1, 1);
    const sphereGeo = new THREE.SphereGeometry(0.5, 16, 16);
    const octaGeo   = new THREE.OctahedronGeometry(0.5);

    /* ── Materials ── */
    const makeMat = (color, metalness = 0.3, roughness = 0.4) =>
      new THREE.MeshStandardMaterial({ color, metalness, roughness });

    const mats = [
      makeMat(DB_RED, 0.4, 0.3),
      makeMat(DB_RED_D, 0.5, 0.2),
      makeMat(DB_RED_L, 0.3, 0.5),
      makeMat(0xffffff, 0.1, 0.7),
      makeMat(0xe0e0e0, 0.1, 0.8),
    ];

    /* ── Floating objects (cubes, spheres, octahedra) ── */
    const objects = [];
    const NUM_OBJECTS = 120;

    for (let i = 0; i < NUM_OBJECTS; i++) {
      const geoChoice = Math.random();
      const geo =
        geoChoice < 0.45 ? cubeGeo :
        geoChoice < 0.75 ? sphereGeo : octaGeo;

      const isWhite = Math.random() > 0.65;
      const mat = isWhite ? mats[3 + Math.floor(Math.random() * 2)] : mats[Math.floor(Math.random() * 3)];

      const mesh = new THREE.Mesh(geo, mat);

      // Spherical distribution outward from center — keep clear zone in middle for text
      const phi   = Math.random() * Math.PI * 2;
      const theta = Math.acos(2 * Math.random() - 1);
      const r     = 7 + Math.random() * 16;

      mesh.position.set(
        r * Math.sin(theta) * Math.cos(phi),
        r * Math.sin(theta) * Math.sin(phi),
        r * Math.cos(theta)
      );

      const scale = 0.2 + Math.random() * 1.2;
      mesh.scale.setScalar(scale);

      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );

      scene.add(mesh);

      objects.push({
        mesh,
        // Initial position (for explosion animation)
        originR: r,
        phi,
        theta,
        // Rotation speeds
        rx: (Math.random() - 0.5) * 0.02,
        ry: (Math.random() - 0.5) * 0.02,
        rz: (Math.random() - 0.5) * 0.01,
        // Floating bob
        bobSpeed: 0.3 + Math.random() * 0.8,
        bobAmp: 0.1 + Math.random() * 0.4,
        bobOffset: Math.random() * Math.PI * 2,
        // Radial drift
        driftSpeed: 0.1 + Math.random() * 0.3,
        driftAmp: 0.3 + Math.random() * 0.6,
        driftOffset: Math.random() * Math.PI * 2,
      });
    }

    /* ── Particle trails (small dots flying outward like the video) ── */
    const PARTICLE_COUNT = 300;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const velocities = [];
    const particleColors = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const phi   = Math.random() * Math.PI * 2;
      const theta = Math.acos(2 * Math.random() - 1);
      const r     = Math.random() * 2;

      positions[i * 3]     = r * Math.sin(theta) * Math.cos(phi);
      positions[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
      positions[i * 3 + 2] = r * Math.cos(theta);

      const speed = 0.02 + Math.random() * 0.08;
      velocities.push({
        x: Math.sin(theta) * Math.cos(phi) * speed,
        y: Math.sin(theta) * Math.sin(phi) * speed,
        z: Math.cos(theta) * speed,
        maxDist: 5 + Math.random() * 20,
      });

      // Red or white particles
      if (Math.random() > 0.4) {
        particleColors[i * 3]     = 1.0;
        particleColors[i * 3 + 1] = 0.21 + Math.random() * 0.2;
        particleColors[i * 3 + 2] = 0.13 + Math.random() * 0.1;
      } else {
        particleColors[i * 3]     = 0.8 + Math.random() * 0.2;
        particleColors[i * 3 + 1] = 0.8 + Math.random() * 0.2;
        particleColors[i * 3 + 2] = 0.8 + Math.random() * 0.2;
      }
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
    });

    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    /* ── Connecting lines (energy rays from center) ── */
    const lineCount = 40;
    const lineMat = new THREE.LineBasicMaterial({
      color: DB_RED,
      transparent: true,
      opacity: 0.12,
    });

    for (let i = 0; i < lineCount; i++) {
      const phi   = Math.random() * Math.PI * 2;
      const theta = Math.acos(2 * Math.random() - 1);
      const r     = 8 + Math.random() * 15;

      const points = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(
          r * Math.sin(theta) * Math.cos(phi),
          r * Math.sin(theta) * Math.sin(phi),
          r * Math.cos(theta)
        ),
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(lineGeo, lineMat);
      scene.add(line);
    }

    /* ── Animation ── */
    let animId;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // Slow camera orbit
      camera.position.x = Math.sin(t * 0.15) * 5;
      camera.position.y = Math.cos(t * 0.1) * 3;
      camera.position.z = 25 + Math.sin(t * 0.08) * 3;
      camera.lookAt(0, 0, 0);

      // Core pulse
      const pulse = 1 + Math.sin(t * 3) * 0.15;
      core.scale.setScalar(pulse);
      glow.scale.setScalar(pulse * 1.5);
      glow2.scale.setScalar(pulse * 2.0);
      glowMat.opacity = 0.1 + Math.sin(t * 2) * 0.08;
      pointLight.intensity = 2.5 + Math.sin(t * 3) * 1.0;

      // Animate floating objects
      for (const obj of objects) {
        obj.mesh.rotation.x += obj.rx;
        obj.mesh.rotation.y += obj.ry;
        obj.mesh.rotation.z += obj.rz;

        // Gentle bob
        const bob = Math.sin(t * obj.bobSpeed + obj.bobOffset) * obj.bobAmp;
        const drift = Math.sin(t * obj.driftSpeed + obj.driftOffset) * obj.driftAmp;
        const r = obj.originR + drift;

        obj.mesh.position.x = r * Math.sin(obj.theta) * Math.cos(obj.phi) + bob * 0.3;
        obj.mesh.position.y = r * Math.sin(obj.theta) * Math.sin(obj.phi) + bob;
        obj.mesh.position.z = r * Math.cos(obj.theta) + bob * 0.2;
      }

      // Animate particles outward
      const posArr = particles.geometry.attributes.position.array;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const vel = velocities[i];
        posArr[i * 3]     += vel.x;
        posArr[i * 3 + 1] += vel.y;
        posArr[i * 3 + 2] += vel.z;

        // Reset when too far
        const dist = Math.sqrt(
          posArr[i * 3] ** 2 + posArr[i * 3 + 1] ** 2 + posArr[i * 3 + 2] ** 2
        );
        if (dist > vel.maxDist) {
          posArr[i * 3]     = 0;
          posArr[i * 3 + 1] = 0;
          posArr[i * 3 + 2] = 0;
        }
      }
      particles.geometry.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
    };

    animate();

    /* ── Resize ── */
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', onResize);

    /* ── Cleanup ── */
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animId);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
    />
  );
}
