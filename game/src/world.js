// CINDERGATE WORKS — the static scene: dusk foundry yard built from the
// map data. Canvas-generated textures only (no external assets), one
// chosen palette, sodium lamps and a glowing furnace.
import * as THREE from 'three';
import { MAP } from './map.js';
import { buildColliders } from './collide.js';
import { mulberry32 } from './rng.js';

export const PALETTE = {
  sky: 0x1b2230,
  fog: 0x1b2230,
  ground: 0x2a2d31,
  brick: 0x6e4a38,
  brickDark: 0x4c3428,
  steel: 0x3a4148,
  steelDark: 0x272d34,
  rust: 0x8a4a2a,
  amber: 0xf0a830,
  ember: 0xf07830,
  concrete: 0x5d6167,
  wood: 0x7a5c38,
  sand: 0x9a8a6a,
  teal: 0x6f9fb8,
  lampGlow: 0xffc46b,
};

function canvasTexture(size, draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function noiseOn(ctx, size, n, alpha, light, dark) {
  const rng = mulberry32(1234);
  for (let i = 0; i < n; i++) {
    const g = Math.floor(rng() * 60);
    ctx.fillStyle = rng() > 0.5 ? `rgba(${light},${alpha})` : `rgba(${dark},${alpha})`;
    ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 3, 1 + rng() * 3);
  }
}

function brickTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#6e4a38';
    ctx.fillRect(0, 0, s, s);
    noiseOn(ctx, s, 900, 0.16, '255,220,190', '20,10,5');
    ctx.strokeStyle = 'rgba(30,18,12,0.55)';
    ctx.lineWidth = 2;
    const row = 32;
    for (let y = 0; y <= s; y += row) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
      const off = (y / row) % 2 === 0 ? 0 : 32;
      for (let x = off; x <= s; x += 64) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + row); ctx.stroke();
      }
    }
  }, 4, 2);
}

function concreteTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#5d6167';
    ctx.fillRect(0, 0, s, s);
    noiseOn(ctx, s, 1400, 0.12, '220,225,230', '10,10,12');
    ctx.strokeStyle = 'rgba(20,20,22,0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      let x = Math.random() * s, y = Math.random() * s;
      ctx.moveTo(x, y);
      for (let j = 0; j < 6; j++) { x += 14 - Math.random() * 28; y += 14 - Math.random() * 28; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }, 8, 8);
}

function hazardTexture() {
  return canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#d8a020';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#1c1c1c';
    for (let i = -s; i < s * 2; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0); ctx.lineTo(i + 16, 0); ctx.lineTo(i + 16 - s, s); ctx.lineTo(i - s, s);
      ctx.closePath(); ctx.fill();
    }
  }, 6, 1);
}

function letterTexture(letter, bg, fg) {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, s - 20, s - 20);
    ctx.fillStyle = fg;
    ctx.font = `900 ${s * 0.62}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, s / 2, s / 2 + 8);
  });
}

function containerTexture(base) {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    noiseOn(ctx, s, 500, 0.14, '255,240,220', '10,5,0');
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let x = 0; x < s; x += 32) ctx.fillRect(x, 0, 6, s);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    for (let x = 16; x < s; x += 32) ctx.fillRect(x, 0, 3, s);
  }, 2, 1);
}

export function createWorld(scene) {
  const rng = mulberry32(77);
  const colliders = buildColliders();

  const mats = {
    brick: new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.92 }),
    brickDark: new THREE.MeshStandardMaterial({ color: PALETTE.brickDark, roughness: 0.95 }),
    concrete: new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.95 }),
    steel: new THREE.MeshStandardMaterial({ color: PALETTE.steel, roughness: 0.55, metalness: 0.25 }),
    steelDark: new THREE.MeshStandardMaterial({ color: PALETTE.steelDark, roughness: 0.6, metalness: 0.2 }),
    rust: new THREE.MeshStandardMaterial({ map: containerTexture('#7a4024'), roughness: 0.85, metalness: 0.25 }),
    rustBlue: new THREE.MeshStandardMaterial({ map: containerTexture('#2e4a5a'), roughness: 0.85, metalness: 0.25 }),
    wood: new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.9 }),
    sand: new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 1 }),
    hazard: new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.8 }),
    emberGlow: new THREE.MeshStandardMaterial({ color: 0x30160a, emissive: PALETTE.ember, emissiveIntensity: 2.2 }),
    lampGlow: new THREE.MeshStandardMaterial({ color: 0x33270a, emissive: PALETTE.lampGlow, emissiveIntensity: 3 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1a2a33, roughness: 0.2, metalness: 0.3 }),
  };

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 70),
    new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.96 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Sky: big gradient dome (BackSide sphere with vertex colours via canvas).
  const skyTex = canvasTexture(512, (ctx, s) => {
    const grad = ctx.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, '#0e1420');
    grad.addColorStop(0.45, '#232c3d');
    grad.addColorStop(0.72, '#4a3626');
    grad.addColorStop(1, '#8a5a30');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(160, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  // Lights: dusk — a low warm sun from the west, cool sky fill.
  const hemi = new THREE.HemisphereLight(0x4a5a78, 0x2a2019, 1.35);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xffd9a8, 1.5);
  moon.position.set(-38, 26, 12);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -40; moon.shadow.camera.right = 40;
  moon.shadow.camera.top = 40; moon.shadow.camera.bottom = -40;
  moon.shadow.camera.far = 120;
  moon.shadow.bias = -0.0004;
  scene.add(moon);
  scene.add(moon.target);
  // Cool fill from the east so shadow sides never go black.
  const fill = new THREE.DirectionalLight(0x7a8fb8, 0.45);
  fill.position.set(30, 18, -20);
  scene.add(fill);
  scene.add(fill.target);

  // Boxes from the map, material by shape/role.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const shootables = [];
  function addBox(cx, cz, w, d, h, y0, mat, castShadow = true) {
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(cx, y0 + h / 2, cz);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    shootables.push(mesh);
    return mesh;
  }
  const isWall = (w, d, h) => h >= 5.5 && (w >= 60 || d >= 45);
  for (const b of MAP.boxes) {
    const [cx, cz, w, d, h, y0 = 0, matName] = b;
    let mat = mats.concrete;
    if (matName && mats[matName]) mat = mats[matName];
    else if (isWall(w, d, h)) mat = mats.brick;
    else if (h >= 5) mat = mats.steelDark;
    else if (h <= 1.4) mat = mats.sand;
    else if (w >= 8 || d >= 8) mat = rng() > 0.5 ? mats.rust : mats.rustBlue;
    else if (h <= 2.6) mat = mats.wood;
    addBox(cx, cz, w, d, h, y0, mat);
  }

  // Silo cylinder (visual) over its box collider at B.
  const silo = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 3.4, 7, 20),
    new THREE.MeshStandardMaterial({ color: 0x7d8288, roughness: 0.5, metalness: 0.7 }),
  );
  silo.position.set(26, 3.5, -18);
  silo.castShadow = true;
  scene.add(silo);
  const siloCap = new THREE.Mesh(
    new THREE.ConeGeometry(3.6, 1.6, 20),
    new THREE.MeshStandardMaterial({ color: PALETTE.rust, roughness: 0.7, metalness: 0.4 }),
  );
  siloCap.position.set(26, 7.8, -18);
  scene.add(siloCap);

  // Furnace chimney at A.
  const chimney = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.5, 11, 12),
    mats.brickDark,
  );
  chimney.position.set(-24, 5.5, -21);
  chimney.castShadow = true;
  scene.add(chimney);
  // Furnace mouth glow.
  const furnaceGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 2.2),
    mats.emberGlow,
  );
  furnaceGlow.position.set(-28, 1.6, -13.9);
  furnaceGlow.rotation.y = 0;
  scene.add(furnaceGlow);
  const furnaceLight = new THREE.PointLight(PALETTE.ember, 60, 26, 1.8);
  furnaceLight.position.set(-27, 2.4, -12.5);
  scene.add(furnaceLight);

  // Catwalk: slab + railings (visual; the floor height comes from MAP.floors).
  const catwalk = new THREE.Mesh(boxGeo, mats.steel);
  catwalk.scale.set(24, 0.3, 3);
  catwalk.position.set(0, 2.85, -2);
  catwalk.castShadow = true;
  catwalk.receiveShadow = true;
  scene.add(catwalk);
  for (const z of [-3.4, -0.6]) {
    const rail = new THREE.Mesh(boxGeo, mats.steelDark);
    rail.scale.set(24, 0.9, 0.08);
    rail.position.set(0, 3.5, z);
    scene.add(rail);
  }
  // Hazard stripes on the catwalk edge.
  const hazard = new THREE.Mesh(boxGeo, mats.hazard);
  hazard.scale.set(24, 0.12, 0.3);
  hazard.position.set(0, 3.02, -3.45);
  scene.add(hazard);

  // Site markers: big letter boards + ground rings.
  const markers = {};
  for (const [key, site] of Object.entries(MAP.sites)) {
    const tex = letterTexture(key, '#14181d', key === 'A' ? '#f07830' : '#6f9fb8');
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 2.6),
      new THREE.MeshBasicMaterial({ map: tex, transparent: false }),
    );
    board.position.set(site.cx, 3.4, site.cz - 2);
    scene.add(board);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 8), mats.steelDark);
    post.position.set(site.cx, 1.7, site.cz - 2);
    scene.add(post);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.25, site.r, 40),
      new THREE.MeshBasicMaterial({ color: key === 'A' ? PALETTE.ember : PALETTE.teal, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.cx, 0.03, site.cz);
    scene.add(ring);
    markers[key] = { board, ring };
  }

  // Sodium lamp posts.
  const lamps = [];
  const lampSpots = [[-16, 8], [16, 8], [-8, -12], [8, -12], [0, 18], [-24, 0], [24, 0]];
  for (const [x, z] of lampSpots) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 5.4, 8), mats.steelDark);
    pole.position.set(x, 2.7, z);
    pole.castShadow = true;
    scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4), mats.lampGlow);
    head.position.set(x, 5.45, z);
    scene.add(head);
    const light = new THREE.PointLight(PALETTE.lampGlow, 26, 20, 1.9);
    light.position.set(x, 5.2, z);
    scene.add(light);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 4.6, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: PALETTE.lampGlow, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }),
    );
    cone.position.set(x, 2.9, z);
    scene.add(cone);
    lamps.push(light);
  }

  // Scattered barrels and pipes (visual, small colliders already in map).
  const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.1, 12);
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.7, metalness: 0.4 });
  const barrelMat2 = new THREE.MeshStandardMaterial({ color: 0x7a3a22, roughness: 0.7, metalness: 0.4 });
  const barrelSpots = [[-10, 10], [-9, 11], [10, 10], [18, -4], [-18, -4], [4, -18], [-4, -18]];
  for (const [x, z] of barrelSpots) {
    const b = new THREE.Mesh(barrelGeo, rng() > 0.5 ? barrelMat : barrelMat2);
    b.position.set(x, 0.55, z);
    b.castShadow = true;
    scene.add(b);
  }

  // Flicker state for the furnace light.
  let flickerT = 0;
  return {
    colliders,
    shootables,
    markers,
    update(dt, t) {
      flickerT += dt;
      furnaceLight.intensity = 55 + Math.sin(flickerT * 7.3) * 6 + Math.sin(flickerT * 13.7) * 4;
    },
  };
}
