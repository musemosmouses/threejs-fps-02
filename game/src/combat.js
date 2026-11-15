// Combat: hitscan against bodies and walls, damage with armor, pooled
// tracers and sparks, and grenades (frag / smoke / flash). All hot-loop
// work reuses scratch objects; nothing allocates per frame except the
// occasional tracer line reset.
import * as THREE from 'three';
import { GRENADES } from './config.js';
import { rayBoxes, hasLOS, segmentHitsSphere } from './collide.js';
import { clamp } from './rng.js';

// Hit spheres relative to a fighter's feet. Crouched fighters shrink.
function hitSpheres(f, out) {
  const c = f.crouched ? 0.68 : 1;
  out[0] = { x: f.pos.x, y: f.pos.y + 1.52 * c, z: f.pos.z, r: 0.17, part: 'head' };
  out[1] = { x: f.pos.x, y: f.pos.y + 1.02 * c, z: f.pos.z, r: 0.37, part: 'torso' };
  out[2] = { x: f.pos.x, y: f.pos.y + 0.45 * c, z: f.pos.z, r: 0.39, part: 'legs' };
  return out;
}

function raySphere(ox, oy, oz, dx, dy, dz, s) {
  const cx = s.x - ox, cy = s.y - oy, cz = s.z - oz;
  const tca = cx * dx + cy * dy + cz * dz;
  if (tca < 0) return null;
  const d2 = cx * cx + cy * cy + cz * cz - tca * tca;
  const r2 = s.r * s.r;
  if (d2 > r2) return null;
  const t = tca - Math.sqrt(r2 - d2);
  return t < 0 ? 0 : t;
}

export function createCombat(scene, colliders) {
  // --- pooled tracers: 32 lines, reused in order ---
  const tracerPool = [];
  for (let i = 0; i < 32; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    tracerPool.push({ line, life: 0 });
  }
  let tracerIdx = 0;

  // --- pooled sparks: one Points cloud, 240 slots ---
  const SPARKS = 240;
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkCol = new Float32Array(SPARKS * 3);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
  const sparkPoints = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    size: 0.09, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
  }));
  sparkPoints.frustumCulled = false;
  scene.add(sparkPoints);
  const sparks = [];
  for (let i = 0; i < SPARKS; i++) sparks.push({ life: 0, vx: 0, vy: 0, vz: 0 });
  let sparkIdx = 0;

  // --- smoke clouds: 3 reusable translucent spheres ---
  const smokeMeshes = [];
  const smokeGeo = new THREE.SphereGeometry(1, 18, 12);
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(smokeGeo, new THREE.MeshBasicMaterial({
      color: 0x9aa0a4, transparent: true, opacity: 0, depthWrite: false,
    }));
    m.visible = false;
    scene.add(m);
    smokeMeshes.push(m);
  }
  const smokes = []; // {x,y,z,r,until,mesh}

  const grenades = []; // {kind,pos,vel,fuse,owner}
  const muzzleLight = new THREE.PointLight(0xffc46b, 0, 14, 2);
  scene.add(muzzleLight);
  let muzzleLife = 0;

  const wallHit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };
  const sphereScratch = [{}, {}, {}];

  function spawnTracer(from, to) {
    const t = tracerPool[tracerIdx];
    tracerIdx = (tracerIdx + 1) % tracerPool.length;
    const attr = t.line.geometry.getAttribute('position');
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    t.line.material.opacity = 0.85;
    t.life = 0.07;
  }

  function spawnSparks(p, n, nx, ny, nz) {
    for (let i = 0; i < n; i++) {
      const s = sparks[sparkIdx];
      const k = sparkIdx;
      sparkIdx = (sparkIdx + 1) % SPARKS;
      s.life = 0.35 + Math.random() * 0.3;
      const sp = 2.5 + Math.random() * 4;
      s.vx = nx * sp + (Math.random() - 0.5) * 3;
      s.vy = ny * sp + Math.random() * 3;
      s.vz = nz * sp + (Math.random() - 0.5) * 3;
      sparkPos[k * 3] = p.x; sparkPos[k * 3 + 1] = p.y; sparkPos[k * 3 + 2] = p.z;
      const hot = Math.random() > 0.4;
      sparkCol[k * 3] = hot ? 1 : 0.9; sparkCol[k * 3 + 1] = hot ? 0.75 : 0.45; sparkCol[k * 3 + 2] = 0.15;
    }
    sparkGeo.getAttribute('position').needsUpdate = true;
    sparkGeo.getAttribute('color').needsUpdate = true;
  }

  // Shared damage: armor absorbs half, then health. Returns true on death.
  function damageFighter(f, amount) {
    if (!f.alive) return false;
    let rest = amount;
    if (f.armor > 0) {
      const absorbed = Math.min(f.armor, rest * 0.5);
      f.armor -= absorbed;
      rest -= absorbed;
    }
    f.hp -= rest;
    if (f.hp <= 0) { f.hp = 0; f.alive = false; return true; }
    return false;
  }

  return {
    smokes,
    grenades,
    damageFighter,
    spawnTracer,
    spawnSparks,
    muzzleFlash(pos) {
      muzzleLight.position.set(pos.x, pos.y, pos.z);
      muzzleLight.intensity = 14;
      muzzleLife = 0.06;
    },
    // Hitscan: nearest of wall vs fighter spheres. `fighters` is the live
    // list; `ignore` is skipped (the shooter). Returns a hit record or null.
    hitscan(ox, oy, oz, dx, dy, dz, maxDist, fighters, ignore) {
      let bestT = maxDist;
      let best = null;
      const o = { x: ox, y: oy, z: oz };
      const d = { x: dx, y: dy, z: dz };
      if (rayBoxes(o, d, maxDist, colliders, wallHit)) {
        bestT = wallHit.t;
        best = { kind: 'wall', t: wallHit.t, x: wallHit.x, y: wallHit.y, z: wallHit.z, nx: wallHit.nx, ny: wallHit.ny, nz: wallHit.nz };
      }
      for (const f of fighters) {
        if (!f.alive || f === ignore) continue;
        hitSpheres(f, sphereScratch);
        for (const s of sphereScratch) {
          const t = raySphere(ox, oy, oz, dx, dy, dz, s);
          if (t !== null && t < bestT) {
            bestT = t;
            best = { kind: 'fighter', fighter: f, part: s.part, t, x: ox + dx * t, y: oy + dy * t, z: oz + dz * t };
          }
        }
      }
      return best;
    },
    throwGrenade(kind, pos, vel, owner) {
      grenades.push({ kind, pos: { ...pos }, vel: { ...vel }, fuse: GRENADES[kind].fuse, owner });
    },
    isSmoked(ax, ay, az, bx, by, bz) {
      for (const s of smokes) {
        if (segmentHitsSphere(ax, ay, az, bx, by, bz, s.x, s.y, s.z, s.r)) return true;
      }
      return false;
    },
    stepGrenades(dt, fighters, now, events) {
      for (let i = grenades.length - 1; i >= 0; i--) {
        const g = grenades[i];
        g.fuse -= dt;
        g.vel.y -= 12 * dt;
        // Integrate with cheap point-vs-box bounce.
        const np = { x: g.pos.x + g.vel.x * dt, y: g.pos.y + g.vel.y * dt, z: g.pos.z + g.vel.z * dt };
        for (const c of colliders) {
          if (np.x > c.minX && np.x < c.maxX && np.y > c.minY && np.y < c.maxY && np.z > c.minZ && np.z < c.maxZ) {
            if (g.pos.x <= c.minX || g.pos.x >= c.maxX) { g.vel.x *= -0.45; np.x = g.pos.x; }
            else if (g.pos.z <= c.minZ || g.pos.z >= c.maxZ) { g.vel.z *= -0.45; np.z = g.pos.z; }
            else { g.vel.y *= -0.45; np.y = g.pos.y; }
          }
        }
        if (np.y < 0.12) { np.y = 0.12; g.vel.y = Math.abs(g.vel.y) > 1.2 ? -g.vel.y * 0.4 : 0; g.vel.x *= 0.7; g.vel.z *= 0.7; }
        g.pos = np;
        if (g.fuse <= 0) {
          grenades.splice(i, 1);
          if (g.kind === 'frag') {
            events.frag(g.pos, g.owner);
            spawnSparks(g.pos, 26, 0, 1, 0);
          } else if (g.kind === 'smoke') {
            const mesh = smokeMeshes.find((m) => !m.visible);
            if (mesh) {
              mesh.visible = true;
              mesh.position.set(g.pos.x, g.pos.y + 1.6, g.pos.z);
              mesh.scale.setScalar(GRENADES.smoke.radius);
              mesh.material.opacity = 0.32;
              smokes.push({ x: g.pos.x, y: g.pos.y + 1.6, z: g.pos.z, r: GRENADES.smoke.radius, until: now + GRENADES.smoke.duration, mesh });
            }
          } else if (g.kind === 'flash') {
            events.flash(g.pos, g.owner);
          }
        }
      }
      // Smoke expiry.
      for (let i = smokes.length - 1; i >= 0; i--) {
        if (now > smokes[i].until) {
          smokes[i].mesh.visible = false;
          smokes.splice(i, 1);
        }
      }
    },
    fragDamage(pos, fighters, owner, onKill) {
      const R = GRENADES.frag.radius;
      for (const f of fighters) {
        if (!f.alive || f === owner) continue;
        const dx = f.pos.x - pos.x, dy = (f.pos.y + 1) - pos.y, dz = f.pos.z - pos.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > R) continue;
        const los = hasLOS(pos.x, pos.y, pos.z, f.pos.x, f.pos.y + 1, f.pos.z, colliders);
        const dmg = GRENADES.frag.maxDamage * (1 - dist / R) * (los ? 1 : 0.35);
        if (dmg < 5) continue;
        const died = damageFighter(f, dmg);
        if (died && onKill) onKill(f, owner, 'frag');
      }
    },
    update(dt) {
      for (const t of tracerPool) {
        if (t.life > 0) {
          t.life -= dt;
          t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.85;
        }
      }
      for (let i = 0; i < SPARKS; i++) {
        const s = sparks[i];
        if (s.life > 0) {
          s.life -= dt;
          sparkPos[i * 3] += s.vx * dt;
          sparkPos[i * 3 + 1] += s.vy * dt;
          sparkPos[i * 3 + 2] += s.vz * dt;
          s.vy -= 9 * dt;
          if (s.life <= 0) sparkPos[i * 3 + 1] = -100;
        }
      }
      sparkGeo.getAttribute('position').needsUpdate = true;
      if (muzzleLife > 0) {
        muzzleLife -= dt;
        muzzleLight.intensity = Math.max(0, muzzleLife / 0.06) * 14;
      }
    },
    clearTransient() {
      for (const t of tracerPool) { t.life = 0; t.line.material.opacity = 0; }
      for (let i = 0; i < SPARKS; i++) { sparks[i].life = 0; sparkPos[i * 3 + 1] = -100; }
      sparkGeo.getAttribute('position').needsUpdate = true;
    },
  };
}
