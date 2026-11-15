// CINDERGATE — boot and the one loop: a fixed 60 Hz simulation feeding a
// render at the display's rate. ?shot=buy|play|plant|end with &seed=N sets
// up a deterministic frame for a capture, renders it twice, then freezes
// it and sets window.__shotReady.
import * as THREE from 'three';
import { GAME, WEAPONS, GRENADES, BODY } from './config.js';
import { mulberry32, clamp } from './rng.js';
import { MAP } from './map.js';
import { createWorld } from './world.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import {
  freshLoadout, giveWeapon, canFire, fire, spreadFor, decayBloom,
  startReload, updateReload, switchTo, buyItem, throwVelocity, currentDef,
} from './weapons.js';
import { createCombat } from './combat.js';
import { createBots } from './bots.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';
import { stageShot } from './shot.js';
import { hasLOS } from './collide.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const rng = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2230);
scene.fog = new THREE.Fog(0x1b2230, 26, 85);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);
// Warm fill riding the camera: keeps the viewmodel and near field readable.
const camFill = new THREE.PointLight(0xfff2dd, 5, 7, 1.7);
camFill.position.set(0.2, 0.3, 0.3);
camera.add(camFill);

const world = createWorld(scene);
const combat = createCombat(scene, world.colliders);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(world.colliders, MAP.spawns.ember[2]);
const playerLoadout = freshLoadout();

// The player as a fighter, the same shape bots have, so combat and the
// rounds treat everyone alike. Live getters mirror the player state.
const playerFighter = {
  team: 'ember',
  isBot: false,
  name: 'Drope',
  get pos() { return player.state.pos; },
  get vel() { return player.state.vel; },
  get crouched() { return player.state.crouched; },
  get hp() { return player.state.hp; },
  set hp(v) { player.state.hp = v; },
  get armor() { return player.state.armor; },
  set armor(v) { player.state.armor = v; },
  get alive() { return player.state.alive; },
  set alive(v) { player.state.alive = v; },
  loadout: playerLoadout,
  money: GAME.startMoney,
  kills: 0,
  deaths: 0,
};

const bots = createBots(scene, world.colliders, combat);
const rounds = createRounds({ player, bots, combat, audio, hud, rng, playerFighter });
const input = createInput(renderer.domElement, onLockChange);

// --- viewmodel: a low-poly rifle built from boxes, riding the camera ---
const gun = new THREE.Group();
{
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.5, metalness: 0.3 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x6a7076, roughness: 0.55, metalness: 0.3 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xf07830, roughness: 0.5, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.5), dark);
  gun.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 8), mid);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.4);
  gun.add(barrel);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.1), mid);
  sight.position.set(0, 0.1, -0.05);
  gun.add(sight);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.09), dark);
  mag.position.set(0, -0.13, 0.02);
  mag.rotation.x = 0.15;
  gun.add(mag);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.02, 0.2), accent);
  stripe.position.set(0, 0.02, 0.1);
  gun.add(stripe);
  gun.position.set(0.26, -0.24, -0.45);
  camera.add(gun);
}
let gunKick = 0;
let gunReloadT = 0;
let walkCycle = 0;

// --- shared state ---
let now = 0;
let started = false;
let frozen = false;
let flashUntil = 0;
let shake = 0;
let spectateIdx = 0;
let minimapAt = -1; // draw on the first sync, then at 10 Hz
let fovTarget = 74;
const eyePos = { x: 0, y: 0, z: 0 };
const viewDir = { x: 0, y: 0, z: -1 };
const muzzlePos = { x: 0, y: 0, z: 0 };
const tmpV = new THREE.Vector3();

function fighters() {
  return bots.bots.concat([playerFighter]);
}

function onKill(victim, killer, how) {
  if (!killer) return;
  killer.money += GAME.killReward;
  killer.kills += 1;
  victim.deaths += 1;
  const headshot = how === 'head';
  hud.killfeed(killer, victim, how === 'frag' ? 'FRAG' : WEAPONS[killer.loadout.current].name, headshot);
  if (killer === playerFighter) audio.hit(true);
  if (victim === playerFighter) {
    audio.hurt();
    hud.damageFlash();
  }
  if (victim === playerFighter) {
    hud.showBanner('YOU ARE DOWN', 'Spectating a teammate — next round in a moment.', 3);
  }
}

function onHit(victim, killer) {
  if (killer === playerFighter) audio.hit(false);
  if (victim === playerFighter) {
    audio.hurt();
    hud.damageFlash();
    // Damage direction: angle of the attacker relative to the player's yaw.
    const dx = killer.pos.x - player.state.pos.x;
    const dz = killer.pos.z - player.state.pos.z;
    const worldAngle = Math.atan2(dx, dz);
    const rel = worldAngle - player.state.yaw;
    hud.damageFrom((-rel * 180) / Math.PI);
  }
}

const onShot = {
  player: playerFighter,
  kill: onKill,
  hit: onHit,
  noise(bot) {
    const d = Math.hypot(bot.pos.x - player.state.pos.x, bot.pos.z - player.state.pos.z);
    audio.shot(WEAPONS[bot.loadout.current].kind, d);
    bots.notifyShot(bot.pos, bot.team);
  },
};

function muzzleWorld(out) {
  tmpV.set(0.26, -0.18, -0.85);
  camera.localToWorld(tmpV);
  out.x = tmpV.x; out.y = tmpV.y; out.z = tmpV.z;
  return out;
}

function playerShoot(spreadOverride = null) {
  const st = rounds.state;
  if (st.phase !== 'live' && !shot) return false;
  if (!player.state.alive) return false;
  const loadout = playerLoadout;
  updateReload(loadout, now);
  if (!canFire(loadout, now)) {
    if (loadout.weapons[loadout.current].mag === 0 && startReload(loadout, now)) audio.reload();
    else if (loadout.weapons[loadout.current].mag === 0) audio.dryFire();
    return false;
  }
  const def = fire(loadout, now);
  if (!def) return false;
  player.eyePos(eyePos);
  player.viewDir(viewDir);
  const spread = spreadOverride !== null ? spreadOverride
    : spreadFor(loadout, def, player.groundSpeed(), !player.state.grounded, input.state.ads, player.state.crouched);
  const pellets = def.pellets || 1;
  muzzleWorld(muzzlePos);
  for (let p = 0; p < pellets; p++) {
    const dx = viewDir.x + (Math.random() - 0.5) * 2 * spread;
    const dy = viewDir.y + (Math.random() - 0.5) * 2 * spread;
    const dz = viewDir.z + (Math.random() - 0.5) * 2 * spread;
    const len = Math.hypot(dx, dy, dz) || 1;
    const hit = combat.hitscan(eyePos.x, eyePos.y, eyePos.z, dx / len, dy / len, dz / len, def.range, fighters(), playerFighter);
    if (hit) {
      combat.spawnTracer(muzzlePos, hit);
      if (hit.kind === 'wall') {
        combat.spawnSparks(hit, 4, hit.nx, hit.ny, hit.nz);
      } else if (hit.fighter) {
        const mult = hit.part === 'head' ? def.headMult : hit.part === 'legs' ? 0.75 : 1;
        const falloff = Math.max(0.5, 1 - Math.max(0, hit.t - def.range * 0.5) / def.range);
        const died = combat.damageFighter(hit.fighter, def.damage * mult * falloff);
        hud.hitMarker(died, died ? 4000 : 120);
        if (died) onKill(hit.fighter, playerFighter, hit.part);
        else onHit(hit.fighter, playerFighter);
      }
    } else {
      combat.spawnTracer(muzzlePos, {
        x: eyePos.x + (dx / len) * def.range,
        y: eyePos.y + (dy / len) * def.range,
        z: eyePos.z + (dz / len) * def.range,
      });
    }
  }
  combat.muzzleFlash(muzzlePos);
  audio.shot(def.kind, 0);
  player.kick(def.recoil, (Math.random() - 0.5) * def.recoil * 0.7);
  gunKick = Math.min(0.09, gunKick + def.recoil * 2.2);
  bots.notifyShot(player.state.pos, 'ember');
  hud.setAmmo(loadout.weapons[loadout.current].mag, loadout.weapons[loadout.current].reserve, def.name);
  return true;
}

function throwPlayerGrenade(kind) {
  if (playerLoadout.grenades[kind] <= 0) return;
  if (rounds.state.phase !== 'live') return;
  playerLoadout.grenades[kind] -= 1;
  player.eyePos(eyePos);
  player.viewDir(viewDir);
  const vel = throwVelocity(viewDir);
  combat.throwGrenade(kind, { x: eyePos.x + viewDir.x * 0.5, y: eyePos.y, z: eyePos.z + viewDir.z * 0.5 }, vel, playerFighter);
  audio.click();
}

function applyFlash(pos) {
  // Player blindness: facing + distance + line of sight.
  player.eyePos(eyePos);
  const dx = pos.x - eyePos.x, dy = pos.y - eyePos.y, dz = pos.z - eyePos.z;
  const dist = Math.hypot(dx, dy, dz);
  player.viewDir(viewDir);
  const facing = Math.max(0, (dx * viewDir.x + dy * viewDir.y + dz * viewDir.z) / (dist || 1));
  const los = hasLOS(eyePos.x, eyePos.y, eyePos.z, pos.x, pos.y, pos.z, world.colliders);
  if (los && dist < GRENADES.flash.radius) {
    const strength = clamp(1.7 - dist / GRENADES.flash.radius, 0.15, 1.4) * (0.35 + 0.65 * facing);
    flashUntil = Math.max(flashUntil, now + strength * 1.8);
    audio.flash();
  }
  for (const b of bots.bots) {
    if (!b.alive) continue;
    const bx = pos.x - b.pos.x, by = pos.y - (b.pos.y + 1.4), bz = pos.z - b.pos.z;
    const bd = Math.hypot(bx, by, bz);
    if (bd > GRENADES.flash.radius) continue;
    const bf = -Math.sin(b.yaw), bfz = -Math.cos(b.yaw);
    const bface = Math.max(0, (bx * bf + bz * bfz) / (bd || 1));
    const blos = hasLOS(b.pos.x, b.pos.y + 1.4, b.pos.z, pos.x, pos.y, pos.z, world.colliders);
    if (blos) b.blindUntil = Math.max(b.blindUntil, now + clamp(1.7 - bd / GRENADES.flash.radius, 0.15, 1.4) * (0.35 + 0.65 * bface) * 2);
  }
}

const grenadeEvents = {
  frag(pos, owner) {
    audio.explosion();
    combat.fragDamage(pos, fighters(), owner, (v, k) => onKill(v, k, 'frag'));
    const d = Math.hypot(pos.x - player.state.pos.x, pos.z - player.state.pos.z);
    if (d < 12) shake = Math.max(shake, 0.5 * (1 - d / 12));
    bots.notifyShot(pos, owner ? owner.team : 'ember');
  },
  flash(pos) { applyFlash(pos); },
};

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    if (!started) {
      started = true;
      rounds.startMatch();
      hud.setBuyOpen(false);
    }
    hud.hideOverlay();
  } else if (started && rounds.state.phase !== 'match' && !hudBuyOpen) {
    hud.showOverlay('paused');
  }
}

let hudBuyOpen = false;
let buyDismissed = false; // player closed the menu during this buy phase

function syncBuyMenu(st) {
  if (st.phase === 'buy') {
    if (!hudBuyOpen && !buyDismissed) {
      hudBuyOpen = true;
      hud.setBuyOpen(true, playerFighter.money, playerLoadout);
      if (input.state.locked) input.releaseLock(); // menu needs the mouse
    }
  } else {
    if (hudBuyOpen) { hudBuyOpen = false; hud.setBuyOpen(false); }
    buyDismissed = false;
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (rounds.state.phase === 'match') {
    rounds.startMatch();
    hud.hideOverlay();
  }
  input.requestLock();
});

hud.onBuy((id) => {
  const res = buyItem(playerLoadout, playerFighter.money, id);
  if (res.ok) {
    playerFighter.money = res.money;
    if (id === 'armor') player.state.armor = 100;
    audio.buy();
    hud.setMoney(playerFighter.money);
    hud.setBuyOpen(true, playerFighter.money, playerLoadout);
    const def = currentDef(playerLoadout);
    hud.setAmmo(playerLoadout.weapons[playerLoadout.current].mag, playerLoadout.weapons[playerLoadout.current].reserve, def.name);
  }
});

function syncCamera() {
  let px, py, pz, yaw, pitch;
  if (!player.state.alive && rounds.state.phase === 'live') {
    // Spectate the first living Ember bot.
    const mate = bots.emberBots.find((b) => b.alive);
    if (mate) {
      px = mate.pos.x; py = mate.pos.y + 1.62; pz = mate.pos.z;
      yaw = mate.yaw; pitch = 0;
    } else {
      px = player.state.pos.x; py = player.state.pos.y + player.state.eye; pz = player.state.pos.z;
      yaw = player.state.yaw; pitch = player.state.pitch;
    }
  } else {
    px = player.state.pos.x;
    py = player.state.pos.y + player.state.eye;
    pz = player.state.pos.z;
    yaw = player.state.yaw;
    pitch = player.state.pitch + player.state.recoilPitch;
  }
  if (shake > 0) {
    px += (Math.random() - 0.5) * shake * 0.15;
    py += (Math.random() - 0.5) * shake * 0.15;
  }
  camera.position.set(px, py, pz);
  camera.rotation.set(pitch, yaw + player.state.recoilYaw, 0, 'YXZ');
  // ADS zoom.
  const def = currentDef(playerLoadout);
  fovTarget = input.state.ads && player.state.alive ? 74 / (def.zoom || 1) : 74;
  if (Math.abs(camera.fov - fovTarget) > 0.1) {
    camera.fov += (fovTarget - camera.fov) * 0.25;
    camera.updateProjectionMatrix();
  }
  // Viewmodel: bob, ADS centering, recoil kick, reload dip.
  const adsK = input.state.ads ? 1 : 0;
  const speed = player.groundSpeed();
  walkCycle += 0.0016 * speed * 60 * (1 / 60) * 60;
  const bob = Math.min(1, speed / 5) * 0.008;
  const baseX = 0.26 - adsK * 0.26;
  const baseY = -0.24 + adsK * 0.085;
  gun.position.set(
    baseX + Math.sin(walkCycle * 2) * bob,
    baseY + Math.abs(Math.cos(walkCycle * 2)) * bob * 0.7 - gunReloadT * 0.12,
    -0.45 + gunKick,
  );
  gun.rotation.x = gunKick * 2.2 + gunReloadT * 0.6;
  gunKick *= 0.86;
  gunReloadT = Math.max(0, gunReloadT - 0.016);
}

function stepFixed(dt) {
  now += dt;
  const keys = input.state.keys;
  const st = rounds.state;

  // Look + movement (frozen during buy? No — movement allowed in buy).
  if (player.state.alive && st.phase !== 'match') {
    const look = input.takeLook();
    player.look(look.x, look.y, input.state.ads);
    player.step(dt, keys, input.state.ads);
    if (player.stepped) audio.step(input.state.ads);
  }
  decayBloom(playerLoadout, dt);
  if (updateReload(playerLoadout, now)) {
    const def = currentDef(playerLoadout);
    hud.setAmmo(playerLoadout.weapons[playerLoadout.current].mag, playerLoadout.weapons[playerLoadout.current].reserve, def.name);
  }

  // Firing (live phase, locked or shot mode).
  if ((input.state.locked || shot) && input.state.firing && st.phase === 'live') {
    playerShoot();
  }
  // Reload key.
  if (keys.has('KeyR') && !playerLoadout.reloading) {
    if (startReload(playerLoadout, now)) { audio.reload(); gunReloadT = 1; }
  }
  // Weapon switching: wheel + digits.
  if (keys.has('Digit1')) switchTo(playerLoadout, bestPrimary(), now);
  if (keys.has('Digit2')) switchTo(playerLoadout, 'p8', now);
  if (keys.has('KeyQ')) cycleGrenade();
  if (keys.has('KeyG')) throwPlayerGrenade(selectedGrenade);
  if (keys.has('KeyB') && st.phase === 'buy') toggleBuy();
  if (keys.has('KeyR') && st.phase === 'match') { rounds.startMatch(); hud.hideOverlay(); }

  bots.step(dt, now, rng, { playerFighter, combat, onShot, phase: st.phase });
  rounds.step(dt, now, keys);
  syncBuyMenu(st);
  combat.stepGrenades(dt, fighters(), now, grenadeEvents);
  combat.update(dt);
  world.update(dt, now);
  if (shake > 0) shake = Math.max(0, shake - dt * 1.4);
  syncHud();
}

function bestPrimary() {
  const order = ['longshot', 'anvil', 'mauler', 'rasp'];
  for (const k of order) if (playerLoadout.weapons[k]) return k;
  return 'p8';
}

let selectedGrenade = 'frag';
let lastCycleAt = 0;
function cycleGrenade() {
  if (now - lastCycleAt < 0.25) return;
  lastCycleAt = now;
  const order = ['frag', 'smoke', 'flash'];
  selectedGrenade = order[(order.indexOf(selectedGrenade) + 1) % order.length];
  hud.flashObjective(`Grenade: ${GRENADES[selectedGrenade].name}`);
}

let lastBuyToggle = 0;
function toggleBuy() {
  if (now - lastBuyToggle < 0.3) return;
  lastBuyToggle = now;
  hudBuyOpen = !hudBuyOpen;
  if (!hudBuyOpen) buyDismissed = true;
  hud.setBuyOpen(hudBuyOpen, playerFighter.money, playerLoadout);
  if (hudBuyOpen) input.releaseLock();
  else input.requestLock();
}

function syncHud() {
  const st = rounds.state;
  hud.setHealth(player.state.hp, player.state.armor);
  const def = currentDef(playerLoadout);
  const slot = playerLoadout.weapons[playerLoadout.current];
  hud.setAmmo(slot.mag, slot.reserve, def.name);
  hud.setMoney(playerFighter.money);
  hud.setScore(st.score.ember, st.score.ashen);
  hud.setRound(Math.max(1, st.round));
  const emberAlive = bots.emberBots.filter((b) => b.alive).length + (player.state.alive ? 1 : 0);
  const ashenAlive = bots.ashenBots.filter((b) => b.alive).length;
  hud.setAlive(emberAlive, ashenAlive);
  if (st.phase === 'buy') hud.setTimer(st.buyTimer);
  else if (st.bomb.planted) hud.setTimer(st.bomb.fuse);
  else hud.setTimer(Math.max(0, st.timer));
  // Crosshair gap follows current spread.
  const spread = spreadFor(playerLoadout, def, player.groundSpeed(), !player.state.grounded, input.state.ads, player.state.crouched);
  hud.setCrosshairGap(4 + spread * 900);
  // Bomb status line.
  const b = st.bomb;
  if (b.planted) hud.setBombStatus(`CHARGE PLANTED — SITE ${b.site}  ${Math.ceil(b.fuse)}s`);
  else if (b.holder === playerFighter) hud.setBombStatus('YOU HAVE THE CHARGE — hold E at A or B');
  else if (b.holder) hud.setBombStatus(`CHARGE WITH ${b.holder.name.toUpperCase()}`);
  else if (b.dropped) hud.setBombStatus('CHARGE DROPPED — pick it up');
  else hud.setBombStatus('');
  // Plant/defuse progress.
  if (b.planter) hud.setPlantProgress(b.plantProgress / GAME.plantTime, 'PLANTING…');
  else if (b.defuser) hud.setPlantProgress(b.defuseProgress / GAME.defuseTime, 'DEFUSING…');
  else hud.setPlantProgress(0, '');
  // Flash blindness.
  hud.setFlash(now < flashUntil ? Math.min(1, (flashUntil - now) * 0.9) : 0);
  // Minimap, throttled to 10 Hz.
  if (now - minimapAt > 0.1) {
    minimapAt = now;
    const enemies = [];
    player.eyePos(eyePos);
    for (const e of bots.ashenBots) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - player.state.pos.x, e.pos.z - player.state.pos.z);
      if (d < 42 && hasLOS(eyePos.x, eyePos.y, eyePos.z, e.pos.x, e.pos.y + 1.1, e.pos.z, world.colliders)) {
        enemies.push({ x: e.pos.x, z: e.pos.z });
      }
    }
    const bombPos = b.planted ? { x: MAP.sites[b.site].cx, z: MAP.sites[b.site].cz }
      : b.dropped ? { x: b.dropped.x, z: b.dropped.z }
      : b.holder && b.holder !== playerFighter ? { x: b.holder.pos.x, z: b.holder.pos.z } : null;
    hud.drawMinimap({
      player: { x: player.state.pos.x, z: player.state.pos.z, yaw: player.state.yaw },
      teammates: bots.emberBots.filter((x) => x.alive).map((x) => ({ x: x.pos.x, z: x.pos.z })),
      enemies,
      bomb: bombPos,
    });
  }
}

let accumulator = 0;
let lastTime = performance.now();
let rafId = 0;

function frame(time) {
  rafId = requestAnimationFrame(frame);
  const dt = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      stepFixed(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- boot ---
syncCamera();
hud.setHealth(100, 0);
hud.setAmmo(12, 36, 'P8 Sidearm');
hud.setMoney(GAME.startMoney);
hud.setScore(0, 0);
hud.setRound(1);
hud.showOverlay('start');

const G = {
  player, playerFighter, bots, rounds, combat, hud, rng,
  stepFixed, playerShoot: (s) => playerShoot(s), syncCamera,
};

if (shot) {
  stageShot(shot, G);
  syncHud();
  paintTwiceThenReady();
} else {
  requestAnimationFrame(frame);
}
