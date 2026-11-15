// Collision and line-of-sight against the map's AABB boxes.
// Everything here works on plain arrays — no allocations in the hot path:
// callers pass reusable scratch objects.
import { MAP, groundAt } from './map.js';

// Build runtime colliders from MAP.boxes: {minX,minY,minZ,maxX,maxY,maxZ}.
export function buildColliders() {
  const out = [];
  for (const b of MAP.boxes) {
    const [cx, cz, w, d, h, y0 = 0] = b;
    out.push({
      minX: cx - w / 2, maxX: cx + w / 2,
      minY: y0, maxY: y0 + h,
      minZ: cz - d / 2, maxZ: cz + d / 2,
    });
  }
  return out;
}

// Move an AABB body (feet position p, half extents hw/hh) by (dx, dy, dz)
// with axis-separated resolution. Returns true if the body is grounded.
// `p` is mutated in place. Step-up: a low box top within stepUp of the feet
// is stepped onto instead of blocking.
export function moveBody(p, hw, hh, dx, dy, dz, colliders, stepUp, dt) {
  let grounded = false;
  // X axis
  p.x += dx;
  for (const c of colliders) {
    if (overlaps(p, hw, hh, c)) {
      if (dx > 0) p.x = c.minX - hw; else if (dx < 0) p.x = c.maxX + hw;
    }
  }
  // Z axis
  p.z += dz;
  for (const c of colliders) {
    if (overlaps(p, hw, hh, c)) {
      if (dz > 0) p.z = c.minZ - hw; else if (dz < 0) p.z = c.maxZ + hw;
    }
  }
  // Y axis: gravity / jump, then ground height (ramps and floors).
  // Landing uses the feet height BEFORE this step's Y move: a body only
  // lands on a box top when its feet were already at/above it, so falling
  // against a tall wall's side can never teleport the body onto the top.
  const feetBefore = p.y;
  p.y += dy;
  for (const c of colliders) {
    if (overlaps(p, hw, hh, c)) {
      if (dy <= 0 && feetBefore >= c.maxY - 0.05) {
        p.y = c.maxY;
        grounded = true;
      } else if (dy > 0 && feetBefore + hh <= c.minY + 0.05) {
        p.y = c.minY - hh; // bumped the ceiling
      } else if (dy <= 0 && c.maxY > p.y && c.maxY - p.y <= stepUp) {
        // Step up onto a low box top instead of being blocked by its side.
        p.y = c.maxY;
        grounded = true;
      }
    }
  }
  const g = groundAt(p.x, p.z, p.y);
  if (p.y <= g) { p.y = g; grounded = true; }
  return grounded;
}

function overlaps(p, hw, hh, c) {
  return p.x + hw > c.minX && p.x - hw < c.maxX
    && p.y + hh > c.minY && p.y < c.maxY
    && p.z + hw > c.minZ && p.z - hw < c.maxZ;
}

// Try to step up onto a low box top: returns the new feet Y or null.
export function tryStepUp(p, hw, hh, colliders, stepUp) {
  let best = null;
  for (const c of colliders) {
    if (p.x + hw > c.minX && p.x - hw < c.maxX && p.z + hw > c.minZ && p.z - hw < c.maxZ) {
      const top = c.maxY;
      if (top > p.y && top - p.y <= stepUp) {
        // Headroom above the top?
        let clear = true;
        for (const d of colliders) {
          if (d !== c && p.x + hw > d.minX && p.x - hw < d.maxX && p.z + hw > d.minZ && p.z - hw < d.maxZ
            && top + hh > d.minY && top < d.maxY) { clear = false; break; }
        }
        if (clear && (best === null || top > best)) best = top;
      }
    }
  }
  return best;
}

// Ray (origin o, direction d, max t) against AABBs. Returns the nearest
// hit {t, x, y, z, nx, ny, nz} or null. Scratch-free: writes into `hit`.
export function rayBoxes(o, d, maxT, colliders, hit) {
  let bestT = maxT;
  let found = false;
  for (const c of colliders) {
    const t = rayBox(o, d, c);
    if (t !== null && t < bestT) {
      bestT = t;
      found = true;
      hit.t = t;
      hit.x = o.x + d.x * t;
      hit.y = o.y + d.y * t;
      hit.z = o.z + d.z * t;
      // Face normal from the hit point's dominant axis offset.
      const cx = (c.minX + c.maxX) / 2, cy = (c.minY + c.maxY) / 2, cz = (c.minZ + c.maxZ) / 2;
      const ex = (c.maxX - c.minX) / 2, ey = (c.maxY - c.minY) / 2, ez = (c.maxZ - c.minZ) / 2;
      const nx = (hit.x - cx) / ex, ny = (hit.y - cy) / ey, nz = (hit.z - cz) / ez;
      const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
      hit.nx = 0; hit.ny = 0; hit.nz = 0;
      if (ax >= ay && ax >= az) hit.nx = nx > 0 ? 1 : -1;
      else if (ay >= ax && ay >= az) hit.ny = ny > 0 ? 1 : -1;
      else hit.nz = nz > 0 ? 1 : -1;
    }
  }
  return found;
}

function rayBox(o, d, c) {
  let t0 = 0, t1 = Infinity;
  const axes = [['x', c.minX, c.maxX], ['y', c.minY, c.maxY], ['z', c.minZ, c.maxZ]];
  for (const [axis, mn, mx] of axes) {
    const origin = o[axis], dir = d[axis];
    if (Math.abs(dir) < 1e-9) {
      if (origin < mn || origin > mx) return null;
    } else {
      let a = (mn - origin) / dir, b = (mx - origin) / dir;
      if (a > b) { const t = a; a = b; b = t; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) return null;
    }
  }
  return t0;
}

// Line of sight between two points, blocked by map boxes (and smoke,
// checked by the caller with spheres). Returns true when clear.
export function hasLOS(ax, ay, az, bx, by, bz, colliders) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-6) return true;
  const inv = 1 / dist;
  const o = { x: ax, y: ay, z: az };
  const d = { x: dx * inv, y: dy * inv, z: dz * inv };
  const hit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };
  return !rayBoxes(o, d, dist - 0.05, colliders, hit);
}

// Segment vs sphere (smoke clouds): true when the segment passes through.
export function segmentHitsSphere(ax, ay, az, bx, by, bz, cx, cy, cz, r) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = len2 > 0 ? ((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = ax + dx * t - cx, py = ay + dy * t - cy, pz = az + dz * t - cz;
  return px * px + py * py + pz * pz < r * r;
}
