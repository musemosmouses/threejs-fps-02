// The human player: movement with acceleration, crouch, jump, step-up,
// pointer-look with recoil, and damage with armor. Bots reuse the same
// body math through moveBody; only the input source differs.
import { BODY } from './config.js';
import { moveBody, tryStepUp } from './collide.js';
import { clamp } from './rng.js';

export function createPlayer(colliders, spawn) {
  const state = {
    pos: { x: spawn[0], y: 0, z: spawn[1] },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    crouched: false,
    grounded: true,
    hp: 100,
    armor: 0,
    alive: true,
    eye: BODY.eyeStand,
    recoilPitch: 0,
    recoilYaw: 0,
    stepTimer: 0,
  };

  function speedTarget(keys, ads) {
    if (state.crouched) return BODY.crouchSpeed;
    if (ads) return BODY.adsSpeed;
    return keys.has('ShiftLeft') || keys.has('ShiftRight') ? BODY.runSpeed : BODY.walkSpeed;
  }

  return {
    state,
    look(dx, dy, ads) {
      const sens = ads ? 0.0011 : 0.0021;
      state.yaw -= dx * sens;
      state.pitch = clamp(state.pitch - dy * sens, -1.53, 1.53);
    },
    kick(pitch, yaw) {
      state.recoilPitch += pitch;
      state.recoilYaw += yaw;
    },
    step(dt, keys, ads) {
      const s = state;
      // Crouch toggle.
      s.crouched = keys.has('ControlLeft') || keys.has('ControlRight');
      const target = speedTarget(keys, ads);
      const sin = Math.sin(s.yaw), cos = Math.cos(s.yaw);
      let ix = 0, iz = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) { ix -= sin; iz -= cos; }
      if (keys.has('KeyS') || keys.has('ArrowDown')) { ix += sin; iz += cos; }
      if (keys.has('KeyA') || keys.has('ArrowLeft')) { ix -= cos; iz += sin; }
      if (keys.has('KeyD') || keys.has('ArrowRight')) { ix += cos; iz -= sin; }
      const il = Math.hypot(ix, iz);
      if (il > 0.01) { ix /= il; iz /= il; }
      // Accelerate toward the wish velocity; friction when idle.
      const accel = il > 0.01 ? BODY.accel : BODY.friction;
      s.vel.x += (ix * target - s.vel.x) * Math.min(1, accel * dt / target * 5);
      s.vel.z += (iz * target - s.vel.z) * Math.min(1, accel * dt / target * 5);
      // Vertical: jump + gravity.
      if ((keys.has('Space')) && s.grounded) {
        s.vel.y = BODY.jumpSpeed;
        s.grounded = false;
      }
      s.vel.y -= BODY.gravity * dt;
      const dx = s.vel.x * dt, dz = s.vel.z * dt, dy = s.vel.y * dt;
      const beforeX = s.pos.x, beforeZ = s.pos.z;
      s.grounded = moveBody(s.pos, BODY.halfW, BODY.height, dx, dy, dz, colliders, BODY.stepUp, dt);
      // Step-up: if horizontal movement was fully blocked, try climbing.
      if ((Math.abs(s.pos.x - beforeX) < Math.abs(dx) * 0.2 || Math.abs(s.pos.z - beforeZ) < Math.abs(dz) * 0.2)
        && s.grounded) {
        const top = tryStepUp(s.pos, BODY.halfW, BODY.height, colliders, BODY.stepUp);
        if (top !== null) s.pos.y = top;
      }
      if (s.grounded) s.vel.y = 0;
      // Eye height eases between stand and crouch.
      const eyeTarget = s.crouched ? BODY.eyeCrouch : BODY.eyeStand;
      s.eye += (eyeTarget - s.eye) * Math.min(1, dt * 12);
      // Recoil recovery.
      s.recoilPitch *= Math.max(0, 1 - dt * 7);
      s.recoilYaw *= Math.max(0, 1 - dt * 7);
      s.stepTimer -= dt;
      if (s.stepTimer <= 0 && (Math.abs(s.vel.x) + Math.abs(s.vel.z)) > 2.5 && s.grounded) {
        s.stepTimer = s.crouched ? 0.55 : 0.38;
        s.stepped = true;
      } else {
        s.stepped = false;
      }
    },
    groundSpeed() {
      return Math.hypot(state.vel.x, state.vel.z);
    },
    eyePos(out) {
      out.x = state.pos.x;
      out.y = state.pos.y + state.eye;
      out.z = state.pos.z;
      return out;
    },
    viewDir(out) {
      const cp = Math.cos(state.pitch + state.recoilPitch);
      out.x = -Math.sin(state.yaw + state.recoilYaw) * cp;
      out.y = Math.sin(state.pitch + state.recoilPitch);
      out.z = -Math.cos(state.yaw + state.recoilYaw) * cp;
      return out;
    },
    // Damage always goes through combat.damageFighter(playerFighter, n)
    // so armor math lives in exactly one place (see combat.js).
    reset(spawn, yaw) {
      const s = state;
      s.pos.x = spawn[0]; s.pos.y = 0; s.pos.z = spawn[1];
      s.vel.x = 0; s.vel.y = 0; s.vel.z = 0;
      s.yaw = yaw; s.pitch = 0;
      s.hp = 100; s.alive = true;
      s.recoilPitch = 0; s.recoilYaw = 0;
    },
  };
}
