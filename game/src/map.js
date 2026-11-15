// CINDERGATE WORKS — map data: colliders, ground height, spawns, sites,
// waypoints and the nav graph the bots walk. All units are metres; x runs
// east, z runs south (attacker spawn is south, z positive). y is up.
//
// Layout (64 x 48 m): attacker spawn south, site A Furnace west,
// site B Silo east, Foundry Hall mid with an overhead catwalk.
export const MAP = {
  bounds: { x0: -32, x1: 32, z0: -24, z1: 24 },
  sites: {
    A: { name: 'A — FURNACE', cx: -24, cz: -14, r: 5.5 },
    B: { name: 'B — SILO', cx: 24, cz: -14, r: 5.5 },
  },
  spawns: {
    ember: [
      [-20, 20], [-12, 21], [-4, 20], [4, 21], [12, 20],
    ],
    ashen: [
      [-26, -18], [-18, -20], [0, -20], [18, -20], [26, -18],
    ],
  },
  // Axis-aligned solid boxes: [cx, cz, w, d, h, y0]. y0 defaults to 0.
  // The outer walls are h=6; everything else is cover or structure.
  boxes: [
    // Outer walls
    [0, -25.5, 68, 3, 6], [0, 25.5, 68, 3, 6],
    [-33.5, 0, 3, 51, 6], [33.5, 0, 3, 51, 6],
    // Furnace block (site A): big furnace + chimney base + platform edge
    [-28, -18, 8, 8, 5], [-24, -21, 4, 3, 7], [-19, -15, 3, 6, 2.4],
    // Silo (site B): cylinder approximated by a box + feed hopper
    [26, -18, 7, 7, 6], [21, -13, 3, 3, 2.2],
    // Mid hall: furnace columns and a long rail car
    [-6, -2, 2, 2, 5], [6, -2, 2, 2, 5],
    [14, 4, 10, 2.6, 2.8], // rail car, east mid
    [-14, 6, 8, 2.4, 2.4], // container stack, west mid
    // A-long cover: crates and a pipe run
    [-28, -6, 3, 3, 1.6], [-28, 2, 2.4, 2.4, 1.2], [-26, 10, 4, 2, 2.6],
    // B-long cover
    [28, -6, 3, 3, 1.6], [28, 2, 2.4, 2.4, 1.2], [26, 10, 4, 2, 2.6],
    // Mid doors: two pillars leaving a 3 m gap at x=0
    [-2.2, -8, 1.6, 1.6, 4.4], [2.2, -8, 1.6, 1.6, 4.4],
    // Connector walls with gaps (spawn -> mid)
    [-16, 12, 12, 1.6, 3.2], [16, 12, 12, 1.6, 3.2],
    // Crates near sites
    [-20, -10, 2.2, 2.2, 1.2], [-28, -10, 2.2, 2.2, 1.4],
    [20, -10, 2.2, 2.2, 1.2], [28, -10, 2.2, 2.2, 1.4],
    [-18.5, -13.5, 3, 3, 1.2, 0, 'steel'], // furnace platform slab (side blocks ground-level walking)
    [-10, -16, 3, 2, 1.1], [10, -16, 3, 2, 1.1],
    // Sandbag lines at site mouths
    [-22, -6, 5, 1, 1.1], [22, -6, 5, 1, 1.1],
  ],
  // Ramps: [x0, z0, x1, z1, topH]. Height rises linearly along the long axis.
  // West ramp climbs eastward onto the catwalk; east ramp climbs westward.
  ramps: [
    [-17, -3.5, -12, -0.5, 3],
    [12, -3.5, 17, -0.5, 3],
    // Furnace platform ramp (site A), climbs northward
    [-20, -9, -17, -12, 1.2],
  ],
  // Elevated floor regions: [x0, z0, x1, z1, h]. Walking here sets the
  // ground height; the slab itself is not a collider (3 m clearance below).
  floors: [
    [-12, -3.5, 12, -0.5, 3], // catwalk over mid
    [-20, -15, -17, -12, 1.2], // furnace platform, north of its ramp
  ],
  // Waypoints the bots navigate on: [x, z]. Edges are auto-built between
  // nodes closer than 11 m with a clear 2D line of sight.
  waypoints: [
    [-20, 20], [-12, 21], [-4, 20], [4, 21], [12, 20], // spawn
    [-16, 14], [0, 14], [16, 14], // spawn exits
    [-26, 10], [-28, 2], [-28, -6], [-24, -12], // A-long
    [26, 10], [28, 2], [28, -6], [24, -12], // B-long
    [-12, 6], [0, 6], [12, 6], // mid approach
    [-6, -4], [0, -4], [6, -4], // mid doors
    [-14, -2], [14, -2], // catwalk ramps (ground level)
    [-12, -2], [0, -2], [12, -2], // catwalk (h=3)
    [-16, -14], [-24, -16], [-28, -14], // site A (east node clear of the platform)
    [18, -14], [24, -16], [28, -14], // site B
    [-10, -16], [10, -16], [0, -12], [0, -20], // defenders
    [-20, -6], [20, -6], [-4, -12], [4, -12],
  ],
};

// Dijkstra over the waypoint graph. Nodes are indices into MAP.waypoints.
// Returns an array of node indices from `from` to `to` (inclusive).
export function buildGraph(boxes) {
  const pts = MAP.waypoints;
  const n = pts.length;
  const adj = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = pts[j][0] - pts[i][0];
      const dz = pts[j][1] - pts[i][1];
      const d = Math.hypot(dx, dz);
      if (d > 11 || d < 0.01) continue;
      if (segmentBlocked(pts[i][0], pts[i][1], pts[j][0], pts[j][1], boxes)) continue;
      adj[i].push([j, d]);
      adj[j].push([i, d]);
    }
  }
  return adj;
}

export function findPath(adj, from, to) {
  const n = adj.length;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  dist[from] = 0;
  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    }
    if (u === -1 || u === to) break;
    done[u] = true;
    for (const [v, w] of adj[u]) {
      if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    }
  }
  if (!Number.isFinite(dist[to])) return [from];
  const path = [];
  let cur = to;
  while (cur !== -1) { path.push(cur); cur = prev[cur]; }
  return path.reverse();
}

// 2D segment vs AABB test (footprint only; y is ignored for routing).
export function segmentBlocked(x0, z0, x1, z1, boxes) {
  for (const b of boxes) {
    const [cx, cz, w, d] = b;
    const minX = cx - w / 2, maxX = cx + w / 2;
    const minZ = cz - d / 2, maxZ = cz + d / 2;
    if (segmentHitsBox(x0, z0, x1, z1, minX, minZ, maxX, maxZ)) return true;
  }
  return false;
}

export function segmentHitsBox(x0, z0, x1, z1, minX, minZ, maxX, maxZ) {
  const dx = x1 - x0, dz = z1 - z0;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x0 < minX || x0 > maxX) return false;
  } else {
    let a = (minX - x0) / dx, c = (maxX - x0) / dx;
    if (a > c) { const t = a; a = c; c = t; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (z0 < minZ || z0 > maxZ) return false;
  } else {
    let a = (minZ - z0) / dz, c = (maxZ - z0) / dz;
    if (a > c) { const t = a; a = c; c = t; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    if (t0 > t1) return false;
  }
  return true;
}

// Ground height at (x, z) for a body whose feet are at height y: ramps rise
// linearly, elevated floors are flat — but a floor only counts when the
// feet are near or above it, so walking UNDER the catwalk stays at y=0.
export function groundAt(x, z, y = 0) {
  let h = 0;
  for (const r of MAP.ramps) {
    const [x0, z0, x1, z1, top] = r;
    if (x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && z >= Math.min(z0, z1) && z <= Math.max(z0, z1)) {
      const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      const t = alongX ? (x - x0) / (x1 - x0) : (z - z0) / (z1 - z0);
      h = Math.max(h, top * Math.max(0, Math.min(1, t)));
    }
  }
  for (const f of MAP.floors) {
    const [x0, z0, x1, z1, top] = f;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1 && y > top - 0.6) h = Math.max(h, top);
  }
  return h;
}
