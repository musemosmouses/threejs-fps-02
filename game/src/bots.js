// Bots: 5v5 team AI. Waypoint navigation (Dijkstra), vision cones with
// line-of-sight, hearing, reaction times, burst fire, and a role plan per
// round: attackers split across the two sites with one planter, defenders
// hold sites and rotate on intel. A bot is a fighter, the same shape the
// player has, so combat treats everyone alike.
import * as THREE from 'three';
import { BOT, GAME, WEAPONS } from './config.js';
import { MAP, buildGraph, findPath } from './map.js';
import { moveBody, hasLOS } from './collide.js';
import { freshLoadout, giveWeapon, canFire, fire, spreadFor, decayBloom, startReload, updateReload, switchTo } from './weapons.js';
import { clamp, pick, range } from './rng.js';

const EMBER_NAMES = ['Vex', 'Rook', 'Fable', 'Juno'];
const ASHEN_NAMES = ['Sable', 'Mira', 'Onyx', 'Kestrel', 'Wren'];

function nearestNode(x, z) {
  let best = 0, bestD = Infinity;
  MAP.waypoints.forEach((p, i) => {
    const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

function makeMesh(scene, team) {
  const color = team === 'ember' ? 0xf07830 : 0x6f9fb8;
  const dark = team === 'ember' ? 0x5a2c12 : 0x24343e;
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
  const darkMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.62, 4, 10), bodyMat);
  torso.position.y = 1.02;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), darkMat);
  head.position.y = 1.56;
  head.castShadow = true;
  group.add(head);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.06, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 1.4 }),
  );
  visor.position.set(0, 1.58, 0.15);
  group.add(visor);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.72), darkMat);
  gun.position.set(0.22, 1.15, 0.32);
  group.add(gun);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), darkMat);
  legL.position.set(-0.13, 0.28, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.13;
  group.add(legR);
  // Team ring on the ground, for readability at a glance.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.52, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  group.add(ring);
  group.userData = { torso, head, gun, legL, legR, ring };
  scene.add(group);
  return group;
}

export function createBots(scene, colliders, combat) {
  const graph = buildGraph(MAP.boxes);
  const bots = [];
  let botSeq = 0;

  function addBot(team, name) {
    const mesh = makeMesh(scene, team);
    const bot = {
      id: botSeq++,
      name,
      team,
      isBot: true,
      pos: { x: 0, y: 0, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      yaw: 0, pitch: 0,
      crouched: false, grounded: true,
      hp: 100, armor: 0, alive: true,
      loadout: freshLoadout(),
      money: GAME.startMoney,
      kills: 0, deaths: 0,
      mesh,
      // AI state
      role: 'hold',
      site: 'A',
      path: [], pathIdx: 0,
      target: null,
      lastSeen: null,
      reactionAt: 0,
      burstLeft: 0,
      burstPauseUntil: 0,
      strafeDir: 0,
      strafeUntil: 0,
      scanYaw: 0,
      thinkAt: 0,
      hearAt: null,
      stuckAt: 0,
      stuckPos: { x: 0, z: 0 },
      planting: false,
      defusing: false,
      blindUntil: 0,
      fallT: 0,
    };
    bots.push(bot);
    return bot;
  }

  for (const n of EMBER_NAMES) addBot('ember', n);
  for (const n of ASHEN_NAMES) addBot('ashen', n);
  const emberBots = bots.filter((b) => b.team === 'ember');
  const ashenBots = bots.filter((b) => b.team === 'ashen');

  function setPath(bot, tx, tz) {
    const from = nearestNode(bot.pos.x, bot.pos.z);
    const to = nearestNode(tx, tz);
    bot.path = findPath(graph, from, to);
    bot.pathIdx = 0;
  }

  function eyeOf(b, out) {
    out.x = b.pos.x;
    out.y = b.pos.y + (b.crouched ? 1.12 : 1.62);
    out.z = b.pos.z;
    return out;
  }

  const tmpEye = { x: 0, y: 0, z: 0 };
  const tmpDir = { x: 0, y: 0, z: 0 };

  function perceive(bot, fighters, now, rng) {
    // Nearest visible enemy: in range, in FOV, line of sight, not smoked.
    let best = null, bestD = Infinity;
    eyeOf(bot, tmpEye);
    const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
    for (const f of fighters) {
      if (!f.alive || f.team === bot.team) continue;
      const dx = f.pos.x - bot.pos.x;
      const dz = f.pos.z - bot.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > BOT.seeDistance || dist < 0.01) continue;
      const dot = (dx * fx + dz * fz) / dist;
      if (dot < BOT.fovCos && dist > 4) continue;
      const chestY = f.pos.y + (f.crouched ? 0.8 : 1.1);
      if (!hasLOS(tmpEye.x, tmpEye.y, tmpEye.z, f.pos.x, chestY, f.pos.z, colliders)) continue;
      if (combat.isSmoked(tmpEye.x, tmpEye.y, tmpEye.z, f.pos.x, chestY, f.pos.z)) continue;
      if (dist < bestD) { bestD = dist; best = f; }
    }
    if (best) {
      if (bot.target !== best) {
        bot.target = best;
        bot.reactionAt = now + range(rng, BOT.reactionMin, BOT.reactionMax);
        bot.burstLeft = 0;
      }
      bot.lastSeen = { x: best.pos.x, y: best.pos.y, z: best.pos.z, t: now };
    } else if (bot.target && (!bot.lastSeen || now - bot.lastSeen.t > 1.2)) {
      bot.target = null;
    }
  }

  function aimAt(bot, tx, ty, tz, err, out) {
    const ex = bot.pos.x, ey = bot.pos.y + (bot.crouched ? 1.12 : 1.62), ez = bot.pos.z;
    let dx = tx - ex, dy = ty - ey, dz = tz - ez;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    // Small perpendicular error, scaled by the bot's current aim error.
    const px = -dz, pz = dx;
    const e1 = (Math.random() - 0.5) * 2 * err;
    const e2 = (Math.random() - 0.5) * 2 * err;
    out.x = dx + px * e1;
    out.y = dy + e2;
    out.z = dz + pz * e1;
    const l = Math.hypot(out.x, out.y, out.z) || 1;
    out.x /= l; out.y /= l; out.z /= l;
    return out;
  }

  function shootAt(bot, now, rng, onShot) {
    const def = bot.loadout.weapons[bot.loadout.current] ? WEAPONS[bot.loadout.current] : WEAPONS.p8;
    if (bot.loadout.reloading) { updateReload(bot.loadout, now); return; }
    if (!canFire(bot.loadout, now)) {
      if (bot.loadout.weapons[bot.loadout.current].mag === 0) startReload(bot.loadout, now);
      return;
    }
    const target = bot.target;
    if (!target) return;
    const dist = Math.hypot(target.pos.x - bot.pos.x, target.pos.z - bot.pos.z);
    const targetSpeed = Math.hypot(target.vel ? target.vel.x : 0, target.vel ? target.vel.z : 0);
    const err = BOT.aimErrorBase + dist * BOT.aimErrorPerMetre
      + (targetSpeed > 1 ? BOT.aimErrorMoving : 0)
      + (Math.hypot(bot.vel.x, bot.vel.z) > 1 ? 0.012 : 0);
    const chestY = target.pos.y + (target.crouched ? 0.8 : 1.05);
    // Headshot chance on a still, close target: aim at the head sometimes.
    const aimY = (dist < 12 && Math.random() < 0.25) ? target.pos.y + 1.52 : chestY;
    eyeOf(bot, tmpEye);
    const dir = aimAt(bot, target.pos.x, aimY, target.pos.z, err, tmpDir);
    const fired = fire(bot.loadout, now);
    if (!fired) return;
    const pellets = fired.pellets || 1;
    for (let p = 0; p < pellets; p++) {
      const spread = spreadFor(bot.loadout, fired, Math.hypot(bot.vel.x, bot.vel.z), !bot.grounded, false, bot.crouched);
      const d2 = {
        x: dir.x + (Math.random() - 0.5) * 2 * spread,
        y: dir.y + (Math.random() - 0.5) * 2 * spread,
        z: dir.z + (Math.random() - 0.5) * 2 * spread,
      };
      const l = Math.hypot(d2.x, d2.y, d2.z) || 1;
      d2.x /= l; d2.y /= l; d2.z /= l;
      const hit = combat.hitscan(tmpEye.x, tmpEye.y, tmpEye.z, d2.x, d2.y, d2.z, fired.range, bots.concat([onShot.player]), bot);
      if (hit) {
        combat.spawnTracer(tmpEye, hit.kind === 'wall' ? { x: hit.x, y: hit.y, z: hit.z } : { x: hit.x, y: hit.y, z: hit.z });
        if (hit.kind === 'wall') {
          combat.spawnSparks({ x: hit.x, y: hit.y, z: hit.z }, 4, hit.nx, hit.ny, hit.nz);
        } else if (hit.fighter) {
          const mult = hit.part === 'head' ? fired.headMult : hit.part === 'legs' ? 0.75 : 1;
          const falloff = Math.max(0.5, 1 - Math.max(0, hit.t - fired.range * 0.5) / fired.range);
          const died = combat.damageFighter(hit.fighter, fired.damage * mult * falloff);
          if (died) onShot.kill(hit.fighter, bot, fired.kind);
          else onShot.hit(hit.fighter, bot);
        }
      } else {
        const far = { x: tmpEye.x + d2.x * fired.range, y: tmpEye.y + d2.y * fired.range, z: tmpEye.z + d2.z * fired.range };
        combat.spawnTracer(tmpEye, far);
      }
    }
    combat.muzzleFlash({ x: tmpEye.x + dir.x * 0.6, y: tmpEye.y + dir.y * 0.6 - 0.1, z: tmpEye.z + dir.z * 0.6 });
    onShot.noise(bot);
  }

  function moveToward(bot, tx, tz, dt, speed) {
    const dx = tx - bot.pos.x, dz = tz - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.01) return true;
    const vx = (dx / dist) * speed, vz = (dz / dist) * speed;
    bot.vel.x = vx; bot.vel.z = vz;
    bot.yaw = Math.atan2(-vx, -vz);
    bot.grounded = moveBody(bot.pos, 0.34, 1.8, vx * dt, 0, vz * dt, colliders, 0.55, dt);
    return dist < 0.7;
  }

  function followPath(bot, dt, speed) {
    if (bot.pathIdx >= bot.path.length) return true;
    const node = MAP.waypoints[bot.path[bot.pathIdx]];
    if (moveToward(bot, node[0], node[1], dt, speed)) bot.pathIdx += 1;
    return bot.pathIdx >= bot.path.length;
  }

  return {
    bots,
    emberBots,
    ashenBots,
    reset(round, rng) {
      // Spawn everyone at their team's spawn points. Ember slot 2 is the
      // human player's spawn, so the four ember bots take the other four.
      const es = MAP.spawns.ember, as = MAP.spawns.ashen;
      const esIdx = [0, 1, 3, 4];
      emberBots.forEach((b, i) => {
        b.pos.x = es[esIdx[i]][0]; b.pos.y = 0; b.pos.z = es[esIdx[i]][1];
        b.hp = 100; b.alive = true; b.fallT = 0;
        b.yaw = 0; // face north, toward mid
        b.mesh.visible = true;
        b.mesh.rotation.set(0, b.yaw, 0);
        b.mesh.position.set(b.pos.x, 0, b.pos.z);
        b.target = null; b.path = []; b.pathIdx = 0;
        b.planting = false; b.defusing = false;
      });
      ashenBots.forEach((b, i) => {
        b.pos.x = as[i][0]; b.pos.y = 0; b.pos.z = as[i][1];
        b.hp = 100; b.alive = true; b.fallT = 0;
        b.yaw = Math.PI; // face south
        b.mesh.visible = true;
        b.mesh.rotation.set(0, b.yaw, 0);
        b.mesh.position.set(b.pos.x, 0, b.pos.z);
        b.target = null; b.path = []; b.pathIdx = 0;
        b.planting = false; b.defusing = false;
      });
    },
    // Round plan: attackers split across sites with one planter; defenders
    // hold 2/2/1 and rotate on intel.
    assignPlan(rng, bombPlanted) {
      const main = rng() < 0.6 ? 'A' : 'B';
      const other = main === 'A' ? 'B' : 'A';
      const planter = pick(rng, emberBots);
      emberBots.forEach((b, i) => {
        b.site = i < 3 ? main : other;
        b.role = 'push';
        b.planter = b === planter;
        const s = MAP.sites[b.site];
        setPath(b, s.cx + range(rng, -3, 3), s.cz + range(rng, -3, 3));
      });
      ashenBots.forEach((b, i) => {
        b.site = i < 2 ? 'A' : i < 4 ? 'B' : 'mid';
        b.role = 'hold';
        const s = b.site === 'mid' ? { cx: 0, cz: -4 } : MAP.sites[b.site];
        setPath(b, s.cx + range(rng, -4, 4), s.cz + range(rng, -4, 4));
      });
    },
    buy(rng) {
      for (const b of bots) {
        if (b.money >= 2700 && rng() < 0.8) giveWeapon(b.loadout, 'anvil');
        else if (b.money >= 2000 && rng() < 0.5) giveWeapon(b.loadout, 'mauler');
        else if (b.money >= 1500) giveWeapon(b.loadout, 'rasp');
        if (b.money >= 650 + 300 && rng() < 0.5) b.armor = 100;
        if (b.money >= 300 && rng() < 0.4) b.loadout.grenades.smoke = 1;
        const keys = Object.keys(b.loadout.weapons).filter((k) => k !== 'p8');
        if (keys.length) b.loadout.current = keys[keys.length - 1];
        b.loadout.weapons[b.loadout.current].mag = WEAPONS[b.loadout.current].mag;
        b.loadout.weapons[b.loadout.current].reserve = WEAPONS[b.loadout.current].reserve;
      }
    },
    notifyShot(pos, team) {
      for (const b of bots) {
        if (!b.alive || b.team === team) continue;
        const d = Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z);
        if (d < BOT.hearRadius && !b.target) {
          b.hearAt = { x: pos.x, z: pos.z, t: 0 };
        }
      }
    },
    // Send a bot somewhere right now (plant rotate, defuse rush).
    routeTo(bot, x, z) {
      if (!bot.alive) return;
      bot.role = 'rotate';
      setPath(bot, x, z);
    },
    step(dt, now, rng, ctx) {
      const { playerFighter, combat: cb, onShot, phase } = ctx;
      const fighters = bots.concat([playerFighter]);
      for (const b of bots) {
        if (!b.alive) {
          // Fall over and stay down.
          if (b.fallT < 1) {
            b.fallT = Math.min(1, b.fallT + dt * 2.5);
            b.mesh.rotation.x = -Math.PI / 2 * b.fallT;
            b.mesh.position.y = b.pos.y + 0.2 * b.fallT;
          }
          continue;
        }
        if (phase !== 'live') {
          // Buy, end and pre-match: hold at spawn — no pathing, no
          // perception, no fire. The round starts clean.
          b.mesh.position.set(b.pos.x, b.pos.y, b.pos.z);
          b.mesh.rotation.y = b.yaw;
          continue;
        }
        if (now < b.blindUntil) {
          // Blinded: freeze, aim wanders.
          b.yaw += dt * 1.5;
          b.mesh.rotation.y = b.yaw;
          continue;
        }
        decayBloom(b.loadout, dt);
        updateReload(b.loadout, now);
        if (now >= b.thinkAt) {
          b.thinkAt = now + 0.15;
          perceive(b, fighters, now, rng);
        }
        const fighting = b.target && b.target.alive && now >= b.reactionAt;
        // Role-driven movement.
        let speed = BOT.walkSpeed;
        if (fighting) {
          // Strafe while fighting.
          if (now > b.strafeUntil) {
            b.strafeUntil = now + range(rng, 0.5, 1.1);
            b.strafeDir = Math.random() < BOT.strafeChance ? (Math.random() < 0.5 ? -1 : 1) : 0;
            b.crouched = Math.random() < 0.25;
          }
          const t = b.target;
          const dx = t.pos.x - b.pos.x, dz = t.pos.z - b.pos.z;
          const dist = Math.hypot(dx, dz) || 1;
          b.yaw = Math.atan2(-dx, -dz);
          // Keep a fighting distance: back off if too close, close in if far.
          let mx = 0, mz = 0;
          if (dist > 16) { mx = dx / dist; mz = dz / dist; }
          else if (dist < 6) { mx = -dx / dist; mz = -dz / dist; }
          const px = -dz / dist, pz = dx / dist;
          mx += px * b.strafeDir * 0.7;
          mz += pz * b.strafeDir * 0.7;
          const ml = Math.hypot(mx, mz);
          if (ml > 0.01) {
            botMove(b, (mx / ml) * 2.6, (mz / ml) * 2.6, dt);
          }
          // Burst fire.
          if (b.burstLeft <= 0 && now >= b.burstPauseUntil) {
            b.burstLeft = Math.floor(range(rng, BOT.burstMin, BOT.burstMax + 1));
          }
          if (b.burstLeft > 0) {
            shootAt(b, now, rng, onShot);
            b.burstLeft -= 1;
            if (b.burstLeft === 0) b.burstPauseUntil = now + BOT.burstPause;
          }
        } else {
          b.crouched = false;
          // Follow the plan.
          if (b.role === 'hold' && b.pathIdx >= b.path.length) {
            // Hold the angle: slow scan.
            b.scanYaw += dt * 0.5;
            b.yaw += Math.sin(b.scanYaw) * dt * 0.35;
            if (b.hearAt) {
              setPath(b, b.hearAt.x, b.hearAt.z);
              b.role = 'rotate';
              b.hearAt = null;
            }
          } else {
            const arrived = followPath(b, dt, speed);
            if (arrived) {
              if (b.role === 'push') {
                // Reached the site area: hold and watch entrances.
                b.role = 'hold';
                b.scanYaw = 0;
              } else if (b.role === 'rotate') {
                b.role = 'hold';
              }
            }
          }
          // Stuck detection: no progress in 1.5 s -> jitter the path.
          const moved = Math.hypot(b.pos.x - b.stuckPos.x, b.pos.z - b.stuckPos.z);
          if (moved > 0.5) {
            b.stuckPos.x = b.pos.x; b.stuckPos.z = b.pos.z; b.stuckAt = now;
          } else if (now - b.stuckAt > 1.5 && b.pathIdx < b.path.length) {
            b.pathIdx += 1;
            b.stuckAt = now;
          }
        }
        // Mesh sync.
        b.mesh.position.set(b.pos.x, b.pos.y, b.pos.z);
        b.mesh.rotation.y = b.yaw;
        const walking = Math.hypot(b.vel.x, b.vel.z) > 0.5;
        const swing = walking ? Math.sin(now * 9) * 0.35 : 0;
        b.mesh.userData.legL.rotation.x = swing;
        b.mesh.userData.legR.rotation.x = -swing;
        b.mesh.userData.gun.rotation.x = b.pitch * 0.5;
      }

      function botMove(b, vx, vz, dt) {
        b.vel.x = vx; b.vel.z = vz;
        b.grounded = moveBody(b.pos, 0.34, 1.8, vx * dt, 0, vz * dt, colliders, 0.55, dt);
      }
    },
    syncMeshes() {
      for (const b of bots) {
        if (!b.alive) continue;
        b.mesh.position.set(b.pos.x, b.pos.y, b.pos.z);
        b.mesh.rotation.y = b.yaw;
      }
    },
  };
}
