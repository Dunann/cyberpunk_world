// Hongyadong-style facade stack on the Jade River cliff (I-015, built from I-011).
//
// The complex is one continuous building leaning against the cliff, the way the real Hongyadong is built: each
// level (two floors, 7.2 m) stands on the roof of the level below and is set back by one gallery depth, so every
// level's roof is the next level's gallery and the top level's roof is the plaza at the crest.
//  - Site: from the steepest bank point, 4 m stations are walked both ways along the bank (water distance 10 m)
//    while the cliff rule holds (at least 35 m of rise within 60 m inland). The length is clamped to 480 m by
//    trimming the end with the lower crest. Every station gets its own section, level count and level fronts.
//  - Level 0 at the toe is an open braced stilt frame carrying the level-1 deck.
//  - Features placed by rule from the complex's own fixed seed: tower bays, stair bays, a lift, corner returns at
//    the ends and where the level count steps down. Landmark parts that float over the site get a podium and a
//    timber skirt; a clearance check narrows, splits or shortens every unit that meets an obstacle.
//  - Props (lanterns, steps, dressing) use the complex's own counter and cap, so district dressing keeps its
//    budget. ?hydaudit runs a full pairwise overlap and support audit; ?hydmask paints the complex for measuring
//    (both dev builds only).
//  - Shared state stays as it was: the complex returns its parts and sign slots instead of adding them, so the
//    caller can give the parts the earlier complex's part indices and append the rest (and the slots) after
//    everything else; its lights are tagged so they come out of their own allowance (see genLandmarks).

import { FLAG, MAT } from './buildings_wgsl.js';
import { rng, clamp } from './math.js';
import { DT } from './world.js';

const LEVEL_H = 7.2;      // one level = two floors
const FLOOR_H = 3.6;
const Y0 = 7.0;           // level 0 floor (the promenade deck is at 5.8)
const F0 = 7.0;           // level 0 front, as water distance (the promenade deck ends at 6.2)
const WD = 10;            // stations are walked at this water distance
const STEP = 4;           // station spacing along the bank (m)
const MAX_LEN = 480;
const D_TOP = 12;         // target depth of the top level, whose roof is the plaza
const D_MAX = 20;         // deepest unit; where the slope is gentler the levels become wider terraces
const G_LO = 2.4, G_HI = 3.8, G_MIN = 1.6;   // gallery depth range, and the narrowest gallery where rock is close
const SEC = 130;          // section samples (1 m) inland, as water distance
const KMAX = 14;
const PROP_CAP = [1000, 3500, 6500];   // by quality level, so the complex scales like the global prop budget
const CLEAR = 0.15;       // clearance kept from obstacles
const END_STEP = 16;
const SLOT_RECESS = 2.2;  // set-back of a dark slot (alley or stair between houses)      // at both ends the stack loses two levels every 16 m down to the end pavilion
const FACADE = 6;         // depth of a unit's facade block; deeper units continue as a core block behind it

const levelY = (k) => Y0 + LEVEL_H * k;

const WOOD_DARK = [0.2, 0.07, 0.045], TIMBER = [0.14, 0.065, 0.035], LACQUER = [0.4, 0.055, 0.035];
const GOLD = [1, 0.62, 0.25], LANTERN_RED = [1, 0.12, 0.05], LANTERN_GOLD = [1, 0.58, 0.2];
const EAVE_COLS = [[0.1, 0.1, 0.11], [0.07, 0.27, 0.25], [0.3, 0.1, 0.07]];
const STONE = [0.46, 0.39, 0.3];
const LEAF = [0.05, 0.12, 0.045];
const PAVING = [0.36, 0.33, 0.29];

// dev builds only (esbuild defines __DEV__ false in index.html and removes the dev paths)
const devQuery = (k) => typeof __DEV__ !== 'undefined' && __DEV__ && typeof location !== 'undefined' && new RegExp('[?&]' + k + '(&|=|$)').test(location.search);

// ------------------------------------------------------------------ site and stations

function bankNormal(world, x, z) {
  const e = 3;
  const nx = world.waterDist(x + e, z) - world.waterDist(x - e, z), nz = world.waterDist(x, z + e) - world.waterDist(x, z - e);
  const l = Math.hypot(nx, nz) || 1;
  return [nx / l, nz / l];
}

// moves (x, z) onto the iso-line of water distance WD; returns [x, z, nx, nz] with the inland normal
function project(world, x, z) {
  let nx = 0, nz = 0;
  for (let it = 0; it < 4; it++) {
    [nx, nz] = bankNormal(world, x, z);
    const d = world.waterDist(x, z);
    x -= nx * (d - WD); z -= nz * (d - WD);
  }
  return [x, z, nx, nz];
}

// steepest stretch of bank within 900 m of the hint point (same search as the earlier complex)
function findSeed(world, L) {
  let best = null;
  for (let x = L.x - 900; x <= L.x + 900; x += 20) for (let z = L.z - 900; z <= L.z + 900; z += 20) {
    const d = world.waterDist(x, z);
    if (d < 7 || d > 13) continue;
    const [gx, gz] = bankNormal(world, x, z);
    const rise = world.heightAt(x + gx * 55, z + gz * 55) - world.heightAt(x, z);
    const score = rise - Math.hypot(x - L.x, z - L.z) * 0.012;
    if (!best || score > best.score) best = { x, z, gx, gz, score };
  }
  return best;
}

// Walks the bank both ways in 4 m stations while the cliff rule holds (stops after 2 failures in a row), then
// clamps the length by trimming the end with the lower crest.
function walkBank(world, seed) {
  const cliff = (x, z, nx, nz) => world.heightAt(x + nx * 60, z + nz * 60) - world.heightAt(x, z) >= 35;
  const [sx, sz, snx, snz] = project(world, seed.x, seed.z);
  const side = (dir) => {
    const out = [];
    let x = sx, z = sz, nx = snx, nz = snz, fails = 0;
    for (let i = 0; i < 200 && fails < 2; i++) {
      [x, z, nx, nz] = project(world, x - nz * STEP * dir, z + nx * STEP * dir);
      const ok = cliff(x, z, nx, nz);
      out.push({ x, z, nx, nz, ok });
      fails = ok ? 0 : fails + 1;
    }
    while (out.length && !out[out.length - 1].ok) out.pop();
    return out;
  };
  const st = side(-1).reverse().concat([{ x: sx, z: sz, nx: snx, nz: snz, ok: true }], side(1));
  const crest = (s) => { let m = 0; for (let u = 0; u <= 100; u += 5) m = Math.max(m, world.heightAt(s.x + s.nx * u, s.z + s.nz * u)); return m; };
  const trimmed = { start: 0, end: 0, walked: (st.length - 1) * STEP };
  while ((st.length - 1) * STEP > MAX_LEN) {
    if (crest(st[0]) < crest(st[st.length - 1])) { st.shift(); trimmed.start++; } else { st.pop(); trimmed.end++; }
  }
  return { st, trimmed };
}

// first water distance where the section reaches height y
function riseAt(h, y) {
  if (h[5] >= y) return 5;
  for (let w = 5; w < SEC; w++) {
    if (h[w + 1] >= y) { const a = h[w], b = h[w + 1]; return w + clamp((y - a) / Math.max(b - a, 1e-3), 0, 1); }
  }
  return SEC;
}

// Per-station section, crest, level count, gallery depth and level fronts and rears (as water distances).
function buildStations(world, raw) {
  const M = raw.length;
  const S = raw.map((r) => ({ x: r.x, z: r.z, nx: r.nx, nz: r.nz }));
  // smoothed normals (5-station window) and tangents
  for (let s = 0; s < M; s++) {
    let nx = 0, nz = 0;
    for (let j = Math.max(0, s - 2); j <= Math.min(M - 1, s + 2); j++) { nx += raw[j].nx; nz += raw[j].nz; }
    const l = Math.hypot(nx, nz) || 1;
    S[s].nx = nx / l; S[s].nz = nz / l;
  }
  // sections every 1 m inland, smoothed along the bank so the stack has no kinks
  const H = S.map((p) => {
    const h = new Float32Array(SEC + 1);
    for (let w = 0; w <= SEC; w++) h[w] = world.heightAt(p.x + p.nx * (w - WD), p.z + p.nz * (w - WD));
    return h;
  });
  for (let s = 0; s < M; s++) {
    const h = new Float32Array(SEC + 1);
    let n = 0;
    for (let j = Math.max(0, s - 2); j <= Math.min(M - 1, s + 2); j++) { n++; for (let w = 0; w <= SEC; w++) h[w] += H[j][w]; }
    for (let w = 0; w <= SEC; w++) h[w] /= n;
    S[s].h = h;
  }
  // crest: the top of the main rise (first point past 25 m where the slope falls below 0.15)
  for (const p of S) {
    let w = WD + 15;
    while (w < SEC - 5 && !(p.h[w] > 25 && p.h[w + 5] - p.h[w] < 0.75)) w++;
    let c = 0;
    for (let i = WD; i <= Math.min(SEC, w + 5); i++) c = Math.max(c, p.h[i]);
    p.crest = c;
    p.nRaw = clamp(Math.floor((c - Y0) / LEVEL_H), 2, KMAX - 1);
  }
  // level count per station: eroded over +-2 stations so steps never fall on a single station, adjacent runs
  // differ by one level at most, and runs shorter than 3 stations merge into the lower neighbour
  const N = S.map((_, s) => { let m = 99; for (let j = Math.max(0, s - 2); j <= Math.min(M - 1, s + 2); j++) m = Math.min(m, S[j].nRaw); return m; });
  for (let s = 1; s < M; s++) N[s] = Math.min(N[s], N[s - 1] + 1);
  for (let s = M - 2; s >= 0; s--) N[s] = Math.min(N[s], N[s + 1] + 1);
  for (let pass = 0; pass < 4; pass++) {
    let s = 0;
    while (s < M) {
      let e = s; while (e + 1 < M && N[e + 1] === N[s]) e++;
      if (e - s + 1 < 3 && (s > 0 || e < M - 1)) {
        const lo = Math.min(s > 0 ? N[s - 1] : 99, e < M - 1 ? N[e + 1] : 99);
        if (lo < N[s]) for (let j = s; j <= e; j++) N[j] = lo;
      }
      s = e + 1;
    }
  }
  // both ends step down to the promenade in terraces: two levels less every END_STEP metres, ending in two levels
  // (a stepped end with a roof at each step, not a smooth diagonal)
  for (let s = 0; s < M; s++) N[s] = Math.min(N[s], 3 + 2 * Math.floor(Math.min(s, M - 1 - s) * STEP / END_STEP));
  S.forEach((p, s) => { p.N = N[s]; });
  // level fronts f[k] and rears r[k] (water distance). The gallery depth g makes the top level land D_TOP before the
  // rock reaches the plaza height; each front stays where the rock is still below the level's floor, and no unit
  // is deeper than D_MAX (on gentle slopes this widens the galleries into terraces).
  for (const p of S) p.g = clamp((riseAt(p.h, levelY(p.N)) - F0 - D_TOP) / Math.max(p.N - 1, 1), G_LO, G_HI);
  // the gallery depth changes slowly along the bank (+-6 stations), so the level fronts never kink where N steps
  const gs = S.map((_, s) => { let a = 0, n = 0; for (let j = Math.max(0, s - 6); j <= Math.min(M - 1, s + 6); j++) { a += S[j].g; n++; } return a / n; });
  S.forEach((p, s) => { p.g = gs[s]; });
  for (const p of S) {
    const wr = (y) => riseAt(p.h, y);
    p.f = new Float32Array(KMAX); p.r = new Float32Array(KMAX);
    p.f[0] = F0;
    for (let k = 1; k < KMAX; k++) {
      const wTop = wr(levelY(k + 1));
      const lo = Math.max(p.f[k - 1] + G_MIN, wTop < SEC ? wTop + 1 - D_MAX : 0);
      const hi = Math.max(wr(levelY(k)) - 0.3, p.f[k - 1] + G_MIN);
      p.f[k] = Math.min(Math.max(F0 + p.g * k, lo), hi);
    }
    for (let k = 0; k < KMAX; k++) p.r[k] = Math.max(wr(levelY(k + 1)) + 1, p.f[k] + 2.5);
  }
  // smooth the fronts along the bank; rears take the window maximum so they always reach the rock
  for (let k = 1; k < KMAX; k++) {
    // (only over stations that have this level, so a level never takes its front from stations without it)
    const has = (j) => S[j].N > k || S[j].N === undefined;
    const f = S.map((_, s) => { if (!has(s)) return S[s].f[k]; let a = 0, n = 0; for (let j = Math.max(0, s - 2); j <= Math.min(M - 1, s + 2); j++) if (has(j)) { a += S[j].f[k]; n++; } return a / n; });
    const r = S.map((_, s) => { let m = S[s].r[k]; if (has(s)) for (let j = Math.max(0, s - 1); j <= Math.min(M - 1, s + 1); j++) if (has(j)) m = Math.max(m, S[j].r[k]); return m; });
    S.forEach((p, s) => { p.f[k] = f[s]; p.r[k] = Math.max(r[s], f[s] + 2.5); });
  }
  return S;
}

// ------------------------------------------------------------------ geometry helpers

// Oriented box in plan plus a height range. Leaned parts are registered by their bounding box.
function obb(cx, cz, a, hw, hd, y0, y1) { return { cx, cz, c: Math.cos(a), s: Math.sin(a), hw, hd, y0, y1 }; }

function obbCorners(o) {
  const out = [];
  for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) out.push([o.cx + u * o.hw * o.c - v * o.hd * o.s, o.cz + u * o.hw * o.s + v * o.hd * o.c]);
  return out;
}

// overlap depth of two boxes in plan (separating axis test; <= 0 means apart), and in height
function overlapDepth(A, B) {
  let depth = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
  if (depth <= 0) return depth;
  const dx = B.cx - A.cx, dz = B.cz - A.cz;
  for (const [ax, az] of [[A.c, A.s], [-A.s, A.c], [B.c, B.s], [-B.s, B.c]]) {
    const ra = A.hw * Math.abs(A.c * ax + A.s * az) + A.hd * Math.abs(-A.s * ax + A.c * az);
    const rb = B.hw * Math.abs(B.c * ax + B.s * az) + B.hd * Math.abs(-B.s * ax + B.c * az);
    depth = Math.min(depth, ra + rb - Math.abs(dx * ax + dz * az));
    if (depth <= 0) return depth;
  }
  return depth;
}

// Designed joints: neighbouring units of one level meet with small wedges (each unit follows its own chord of the
// curved bank), and the stack's units butt against a tower bay's sides from its base level up.
const joint = (a, b) => (a.lvl !== undefined && a.lvl === b.lvl && Math.abs(a.seq - b.seq) <= 1)
  || (a.towerKb !== undefined && b.lvl >= a.towerKb) || (b.towerKb !== undefined && a.lvl >= b.towerKb);

// dressing roles: checked for clearance before they are placed (a designed contact with a neighbour stays < 0.3 m)
const DRESS = new Set(['eave', 'strip', 'rail', 'lantern', 'oriel', 'bracket', 'plant', 'laundry', 'lamp', 'planter', 'ac', 'roof', 'pavilion', 'balcony', 'tree', 'lamphead']);

function containsXZ(o, x, z, pad = 0) {
  const dx = x - o.cx, dz = z - o.cz;
  return Math.abs(dx * o.c + dz * o.s) <= o.hw + pad && Math.abs(-dx * o.s + dz * o.c) <= o.hd + pad;
}

// ------------------------------------------------------------------ the complex

// Returns { parts, slots } (part records and sign slots for the caller to add), or null when there is no site.
export function hongyadong(B, L, world) {
  const seed = findSeed(world, L);
  if (!seed) return null;
  B.sites.stilts = { x: seed.x, z: seed.z, nx: -seed.gx, nz: -seed.gz };
  const { st: raw, trimmed } = walkBank(world, seed);
  if (raw.length < 8) return null;
  const S = buildStations(world, raw);
  const M = S.length;
  const R = rng(15015);
  const P = B.P;
  const audit = devQuery('hydaudit');
  const propCap = PROP_CAP[clamp(B.q, 0, 2)];
  const stats = { stations: M, length: (M - 1) * STEP, trimmed, parts: 0, props: 0, propsDropped: 0, lights: 0, masonry: 0, units: 0, unitsClipped: 0, unitsDropped: 0, dressSkipped: 0, dressSkippedBy: {}, dressSkipSamples: [], underpins: 0, occupancy: [0, 0, 0, 0] };
  const pieces = [];          // every placed piece (for the audit): obb + role + group
  const obstacles = [];       // obb + kind ('land', 'podium', 'skirt', 'shaft')
  const deferredSteps = [];   // step props are added last so the cap drops them first
  const p0 = P.count;          // parts placed before the complex (obstacle candidates)
  const list = [];             // the complex's part records, added to B.P by the caller
  const slots = [];            // the complex's sign slots, appended after every other slot by the caller
  let grpSeq = 0;

  // ---------------- station frame interpolation (t = continuous station index)
  const lerp = (a, b, u) => a + (b - a) * u;
  const st = (t) => { const s = clamp(Math.floor(t), 0, M - 2); return [s, clamp(t - s, 0, 1)]; };
  const frame = (t) => {
    const [s, u] = st(t), A = S[s], Bq = S[s + 1];
    let nx = lerp(A.nx, Bq.nx, u), nz = lerp(A.nz, Bq.nz, u); const l = Math.hypot(nx, nz) || 1;
    return { x: lerp(A.x, Bq.x, u), z: lerp(A.z, Bq.z, u), nx: nx / l, nz: nz / l };
  };
  const W = (t, w) => { const f = frame(t); return [f.x + f.nx * (w - WD), f.z + f.nz * (w - WD)]; };
  // between a station with level k and one without it (a run end), the level's values come from the one with it
  const pick = (s, k, u) => (S[s].N > k) === (S[s + 1].N > k) ? -1 : S[s].N > k ? 0 : 1;
  const fr = (t, k) => { const [s, u] = st(t), p = pick(s, k, u); return p < 0 ? lerp(S[s].f[k], S[s + 1].f[k], u) : S[s + p].f[k]; };
  // rear between stations: the deeper of the two, so units always reach the rock
  const rr = (t, k) => { const [s, u] = st(t), p = pick(s, k, u); if (p >= 0) return S[s + p].r[k]; return u === 0 ? S[s].r[k] : u === 1 ? S[s + 1].r[k] : Math.max(S[s].r[k], S[s + 1].r[k]); };
  const Nat = (t) => S[clamp(Math.round(t), 0, M - 1)].N;
  const gAt = (t) => S[clamp(Math.round(t), 0, M - 1)].g;
  const ground = (x, z) => world.heightAt(x, z);
  // nearest station frame position of a world point: continuous index t and water distance w
  const toBank = (x, z) => {
    let bs = 0, bd = 1e18;
    for (let s = 0; s < M; s++) { const d = (S[s].x - x) ** 2 + (S[s].z - z) ** 2; if (d < bd) { bd = d; bs = s; } }
    const p = S[bs], tx = -p.nz, tz = p.nx;
    const along = (x - p.x) * tx + (z - p.z) * tz;
    const tdir = bs < M - 1 ? Math.sign((S[bs + 1].x - p.x) * tx + (S[bs + 1].z - p.z) * tz) || 1 : -(Math.sign((S[bs - 1].x - p.x) * tx + (S[bs - 1].z - p.z) * tz) || 1);
    return { t: bs + along * tdir / STEP, w: WD + (x - p.x) * p.nx + (z - p.z) * p.nz };
  };
  // the planned stack surface (roof under a point), used before the stack exists
  const stackTop = (t, w) => {
    const p = S[clamp(Math.round(t), 0, M - 1)];
    if (t < -0.5 || t > M - 0.5 || w < F0) return -1e9;
    let k = -1;
    for (let j = 0; j < p.N; j++) if (p.f[j] <= w && w <= p.r[j]) k = j;
    return k >= 0 ? levelY(k + 1) : -1e9;
  };

  // chord frame between two front points: centre, along (tx, tz), inland (mx, mz), half width, part angle
  const chord = (t0, t1, w0, w1) => {
    const [ax, az] = W(t0, w0), [bx, bz] = W(t1, w1);
    let tx = bx - ax, tz = bz - az; const len = Math.hypot(tx, tz) || 1; tx /= len; tz /= len;
    const fm = frame((t0 + t1) / 2);
    let mx = -tz, mz = tx;
    if (mx * fm.nx + mz * fm.nz < 0) { mx = -mx; mz = -mz; }
    return { cx: (ax + bx) / 2, cz: (az + bz) / 2, tx, tz, mx, mz, hw: len / 2, a: Math.atan2(-mx, mz) };
  };
  const at = (C, u, d) => [C.cx + C.tx * u + C.mx * d, C.cz + C.tz * u + C.mz * d];

  // ---------------- part creation (every part is also registered for the audit)
  let curUnit = null;   // { lvl, seq } while a unit is being built: neighbouring units meet at designed joints
  const reg = (o, role, grp, extra) => {
    const lx = o.lx || 0, lz = o.lz || 0;
    const a = o.a || 0, c = Math.cos(a), s = Math.sin(a);
    // bounding box of a leaned part: centre moves by half the lean, extents grow by it
    const ex = Math.abs(lx * c + lz * s) / 2, ez = Math.abs(-lx * s + lz * c) / 2;
    const b = obb(o.x + lx / 2, o.z + lz / 2, a, o.hw + ex, (o.hd === undefined ? o.hw : o.hd) + ez, o.y0, o.y0 + o.h);
    Object.assign(b, { role, grp }, curUnit || {}, extra || {});
    pieces.push(b);
    forCells(b, (k) => { if (!hash.has(k)) hash.set(k, []); hash.get(k).push(b); });
    return b;
  };
  // clearance for dressing (eaves, railings, lanterns, oriels, plaza props): a piece that would cut into another
  // group's piece (other than a designed joint) is not placed
  const hash = new Map();
  const forCells = (b, fn) => {
    const ex = Math.abs(b.c) * b.hw + Math.abs(b.s) * b.hd, ez = Math.abs(b.s) * b.hw + Math.abs(b.c) * b.hd;
    for (let i = Math.floor((b.cx - ex) / 4); i <= Math.floor((b.cx + ex) / 4); i++) for (let j = Math.floor((b.cz - ez) / 4); j <= Math.floor((b.cz + ez) / 4); j++) fn(i * 100003 + j);
  };
  const blocked = (o, role, grp) => {
    if (!DRESS.has(role)) return false;
    const lx = o.lx || 0, lz = o.lz || 0, a = o.a || 0, c = Math.cos(a), s = Math.sin(a);
    const b = obb(o.x + lx / 2, o.z + lz / 2, a, o.hw + Math.abs(lx * c + lz * s) / 2, (o.hd === undefined ? o.hw : o.hd) + Math.abs(-lx * s + lz * c) / 2, o.y0, o.y0 + o.h);
    Object.assign(b, curUnit || {});
    let hit = false;
    forCells(b, (k) => { if (!hit) for (const q of hash.get(k) || []) if (q.grp !== grp) { const d = overlapDepth(b, q); if (d > 0.05 && !(joint(b, q) && d < 0.3)) { hit = `${q.role} ${q.lvl} ${d.toFixed(2)}`; break; } } });
    if (!hit) for (const ob of obstacles) if (ob.kind !== 'podium' && ob.kind !== 'tower' && ob.grp !== grp && overlapDepth(b, ob) > 0.05) { hit = ob.kind; break; }
    if (hit) { stats.dressSkipped++; stats.dressSkippedBy[role] = (stats.dressSkippedBy[role] || 0) + 1; if (audit && stats.dressSkipSamples.length < 8) stats.dressSkipSamples.push(`${role} lvl ${b.lvl} at ${b.cx.toFixed(0)},${b.y0.toFixed(1)},${b.cz.toFixed(0)} by ${hit}`); }
    return hit;
  };
  const part = (o, role, grp, extra) => {
    if (blocked(o, role, grp)) return null;
    if (o.mat === MAT.MASONRY) stats.masonry++;
    list.push(o); stats.parts++;
    return reg(o, role, grp, extra);
  };
  const prop = (o, role, grp) => {
    if (stats.props >= propCap) { stats.propsDropped++; return null; }
    if (blocked(o, role, grp)) return null;
    stats.props++;
    o.flags = (o.flags || 0) | FLAG.PROP | (o.detail ? FLAG.DETAIL : 0);
    list.push(o); stats.parts++;
    return role ? reg(o, role, grp) : null;
  };
  // lights are tagged (l[9] = 1): they come out of the complex's own allowance, not the city's light budget
  const light = (x, y, z, r, c, k) => { B.light(x, y, z, r, c, k, 3); B.lights[B.lights.length - 1][9] = 1; stats.lights++; };
  const slot = (x, y, z, nx, nz, w, h) => slots.push({ x, y, z, nx, nz, w, h, vertical: true, style: DT.HILLSIDE, roof: false, own: true });
  // box on a chord frame: u along, d inland (d0 = front)
  const box = (C, u0, u1, d0, d1, y0, y1, o) => {
    const [x, z] = at(C, (u0 + u1) / 2, (d0 + d1) / 2);
    return Object.assign({ x, z, a: C.a, hw: (u1 - u0) / 2, hd: (d1 - d0) / 2, y0, h: y1 - y0 }, o);
  };

  // pent eave on a chord frame: a leaned thin tile plate from the face (top edge at yTop) out P metres and down
  // `drop`. glow > 0: a separate emissive strip (0.32 m) along its lower front edge, so the gold line reads far
  // away (roof-edge eaves only, intensity per family); glow 0: a lighter ridge-tile edge instead, so the tile colour
  // reads. flare: upswept corners at both ends.
  const edgeCol = (c) => [c[0] * 1.7 + 0.07, c[1] * 1.7 + 0.07, c[2] * 1.7 + 0.07];
  const eave = (C, u0, u1, d, yTop, Pj, drop, col, grp, glow = 0, flare = false) => {
    const T = 0.22;
    const [x, z] = at(C, (u0 + u1) / 2, d - Pj + T / 2);
    if (!part({ x, y0: yTop - drop, z, a: C.a, hw: (u1 - u0) / 2 + 0.05, hd: T / 2, h: drop, lx: C.mx * Pj, lz: C.mz * Pj, mat: MAT.ROOFTILE, col, param: glow * 0.4, flags: FLAG.BOTTOM }, 'eave', grp)) return;
    if (glow > 0) part(box(C, u0 - 0.05, u1 + 0.05, d - Pj, d - Pj + 0.08, yTop - drop - 0.3, yTop - drop + 0.02, { mat: MAT.EMIT, col: GOLD, param: glow, flags: FLAG.BOTTOM }), 'strip', grp);
    else part(box(C, u0 - 0.05, u1 + 0.05, d - Pj, d - Pj + 0.1, yTop - drop - 0.14, yTop - drop + 0.02, { mat: MAT.ROOFTILE, col: edgeCol(col), param: 0, flags: FLAG.BOTTOM }), 'strip', grp);
    if (flare && u1 - u0 > 2.5) {
      for (const [u, sgn] of [[u0 + 0.35, -1], [u1 - 0.35, 1]]) {
        const [fx, fz] = at(C, u, d - Pj + 0.12);
        part({ x: fx, y0: yTop - drop - 0.05, z: fz, a: C.a, hw: 0.3, hd: 0.1, h: 0.8, lx: C.tx * sgn * 0.4 - C.mx * 0.3, lz: C.tz * sgn * 0.4 - C.mz * 0.3, mat: MAT.ROOFTILE, col, param: glow * 0.4, flags: FLAG.BOTTOM }, 'eave', grp);
      }
    }
  };
  // eave along the side of a block (side at u = us, facing sgn), running inland from d0 to d1
  const sideEave = (C, us, sgn, d0, d1, yTop, Pj, drop, col, grp, glow = 0) => {
    if (d1 - d0 < 0.6) return;
    const T = 0.22;
    const [x, z] = at(C, us + sgn * (Pj - T / 2), (d0 + d1) / 2);
    if (!part({ x, y0: yTop - drop, z, a: C.a, hw: T / 2, hd: (d1 - d0) / 2, h: drop, lx: -C.tx * sgn * Pj, lz: -C.tz * sgn * Pj, mat: MAT.ROOFTILE, col, param: glow * 0.4, flags: FLAG.BOTTOM }, 'eave', grp)) return;
    const u = us + sgn * Pj;
    if (glow > 0) part(box(C, Math.min(u, u - sgn * 0.08), Math.max(u, u - sgn * 0.08), d0, d1, yTop - drop - 0.3, yTop - drop + 0.02, { mat: MAT.EMIT, col: GOLD, param: glow, flags: FLAG.BOTTOM }), 'strip', grp);
    else part(box(C, Math.min(u, u - sgn * 0.1), Math.max(u, u - sgn * 0.1), d0, d1, yTop - drop - 0.14, yTop - drop + 0.02, { mat: MAT.ROOFTILE, col: edgeCol(col), param: 0, flags: FLAG.BOTTOM }), 'strip', grp);
  };
  // hip roof (concave, upswept eaves) over a block on a chord frame: overhang `over` front and back, 0.12 m along
  // the bank, so neighbouring roofs meet without cutting into each other
  const hipRoof = (C, u0, u1, d0, d1, y, h, col, glow, grp, over = 0.8, taper = 0.2) => {
    const [x, z] = at(C, (u0 + u1) / 2, (d0 + d1) / 2);
    return part({ x, y0: y, z, a: C.a, hw: (u1 - u0) / 2 + 0.12, hd: (d1 - d0) / 2 + over, h, prof: 4, taper, mat: MAT.ROOFTILE, col, param: 0.6 + glow * 0.5, flags: FLAG.BOTTOM }, 'roof', grp);
  };
  const rail = (C, u0, u1, d, y, h, lit, grp) => part(box(C, u0 - 0.04, u1 + 0.04, d, d + 0.1, y, y + h, { mat: MAT.RAIL, col: [0.16, 0.08, 0.045], param: lit ? 1.4 : 0 }), 'rail', grp);
  const sideRail = (C, us, d0, d1, y, h, lit, grp) => { if (d1 - d0 > 0.5) part(box(C, us - 0.05, us + 0.05, d0, d1, y, y + h, { mat: MAT.RAIL, col: [0.16, 0.08, 0.045], param: lit ? 1.4 : 0 }), 'rail', grp); };
  const lantern = (x, y, z, i, grp) => prop({ x, y0: y, z, hw: 0.22, h: 0.55, kind: 2, prm: 8, mat: MAT.EMIT, col: i % 2 ? LANTERN_GOLD : LANTERN_RED, param: 4.5, winW: 2, seed: x * 7.1 + z, flags: FLAG.BOTTOM }, 'lantern', grp);

  // ---------------- obstacles: solid landmark parts already placed that reach into the complex's volume
  const maxRear = Math.max(...S.map((p) => p.r[p.N - 1]));
  const yTopMax = levelY(Math.max(...S.map((p) => p.N))) + 12;
  for (let i = 0; i < p0; i++) {
    const flags = P.get(i, 15);
    if (flags & FLAG.PROP) continue;
    const hw = P.get(i, 4), hd = P.get(i, 5), h = P.get(i, 6), y0 = P.get(i, 1);
    if (Math.min(hw, hd) < 2 || h < 4 || y0 > yTopMax || y0 + h < 0) continue;
    const x = P.get(i, 0), z = P.get(i, 2), a = P.get(i, 3), lx = P.get(i, 12), lz = P.get(i, 13);
    // the part's lean over the complex's height band moves and widens its footprint there
    const fr0 = clamp((yTopMax - y0) / h, 0, 1);
    const o = obb(x + lx * fr0 / 2, z + lz * fr0 / 2, a, hw + Math.abs(lx) * fr0 / 2, hd + Math.abs(lz) * fr0 / 2, y0, y0 + h);
    o.lean = [lx / h, lz / h]; o.baseY = y0; o.part = i;
    // does it reach into the stack? test the corners, edge midpoints and centre against the planned volume
    let hit = false;
    const mid = S[M >> 1];
    if (Math.hypot(o.cx - mid.x, o.cz - mid.z) > M * STEP / 2 + 150) continue;
    const pts = obbCorners(o).concat([[o.cx, o.cz]]);
    for (const [px, pz] of pts) {
      const b = toBank(px, pz);
      if (b.t < -1 || b.t > M || b.w < 0 || b.w > maxRear + 4) continue;
      if (b.w < S[clamp(Math.round(b.t), 0, M - 1)].r[S[clamp(Math.round(b.t), 0, M - 1)].N - 1] + 3) hit = true;
    }
    if (hit) { o.kind = 'land'; obstacles.push(o); }
  }

  // floating obstacles (base above rock and stack somewhere under them): a podium down to the stack, which the
  // stack may bury into like rock, and a timber skirt in front of the river-facing faces up to plaza level so the
  // eave lines continue across
  const skirts = [];
  for (const o of obstacles.slice()) {
    let low = 1e9, high = -1e9;
    for (const [u, v] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8], [0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]]) {
      const px = o.cx + u * o.hw * o.c - v * o.hd * o.s, pz = o.cz + u * o.hw * o.s + v * o.hd * o.c;
      const b = toBank(px, pz);
      const surf = Math.max(ground(px, pz), stackTop(b.t, b.w));
      low = Math.min(low, surf); high = Math.max(high, surf);
    }
    if (low > o.baseY - 0.5) continue;
    const grp = ++grpSeq;
    const pod = { x: o.cx, z: o.cz, a: Math.atan2(o.s, o.c), hw: o.hw + 0.8, hd: o.hd + 0.8, y0: low - 0.3, h: o.baseY + 0.4 - (low - 0.3), mat: MAT.WOOD, col: WOOD_DARK, floorH: FLOOR_H, winW: 2.2, baseY: levelY(Math.floor((low - Y0) / LEVEL_H)), param: 1.3, seed: 77, solid: true };
    const pb = part(pod, 'podium', grp);
    obstacles.push(Object.assign(obb(pb.cx, pb.cz, pod.a, pod.hw, pod.hd, pod.y0, pod.y0 + pod.h), { kind: 'podium' }));
    stats.podium = { low: +low.toFixed(1), base: +o.baseY.toFixed(1) };
    // skirt: faces of the obstacle that face the river
    const faces = [[o.c, o.s, o.hw, o.hd], [-o.c, -o.s, o.hw, o.hd], [-o.s, o.c, o.hd, o.hw], [o.s, -o.c, o.hd, o.hw]];
    for (const [fx, fz, off, half] of faces) {
      const b = toBank(o.cx + fx * off, o.cz + fz * off);
      const fm = frame(clamp(b.t, 0, M - 1));
      if (-(fx * fm.nx + fz * fm.nz) < 0.3) continue;
      const yTop = levelY(Nat(b.t));
      if (yTop < o.baseY + 2) continue;
      const drift = Math.max(0, (o.lean[0] * fx + o.lean[1] * fz) * (yTop - o.baseY));
      const cx = o.cx + fx * (off + 0.3 + drift + 0.5), cz = o.cz + fz * (off + 0.3 + drift + 0.5);
      const a = Math.atan2(-fx, fz);   // local +z along the face normal
      // the skirt stands on the lowest roof (or rock) under its own line
      let yS = o.baseY;
      for (let i = -4; i <= 4; i++) {
        const px = cx + fz * (half + 1.3) * i / 4 * -1, pz = cz - fx * (half + 1.3) * i / 4 * -1;
        const bb = toBank(px, pz);
        yS = Math.min(yS, Math.max(ground(px, pz), stackTop(bb.t, bb.w)));
      }
      const sk = { x: cx, z: cz, a, hw: half + 1.3, hd: 0.5, y0: yS, h: yTop - yS, mat: MAT.WOOD, col: WOOD_DARK, floorH: FLOOR_H, winW: 2.2, baseY: levelY(Math.floor((yS - Y0) / LEVEL_H)), param: 1.3, seed: 78, solid: true };
      const sb = part(sk, 'skirt', grp);
      obstacles.push(Object.assign(obb(sb.cx, sb.cz, a, sk.hw, sk.hd, sk.y0, sk.y0 + sk.h), { kind: 'skirt', grp }));
      // chord frame of the skirt's outer face (inland = toward the obstacle)
      const C = { cx: cx + fx * 0.5, cz: cz + fz * 0.5, tx: fz, tz: -fx, mx: -fx, mz: -fz, hw: half + 1.3, a: Math.atan2(fx, -fz) };
      skirts.push({ C, y0: yS, y1: yTop, grp });
    }
  }

  // ---------------- feature layout along the bank (continuous station index t)
  const steps = [];   // level-count changes: boundary between stations s and s + 1
  for (let s = 0; s < M - 1; s++) if (S[s].N !== S[s + 1].N) steps.push(s + 0.5);
  const busy = [];    // [t0, t1] ranges taken by obstacles, steps and features
  // obstacles reaching the stack's face (not only the back of the plaza) and level-count steps keep features away
  for (const o of obstacles) {
    let t0 = 1e9, t1 = -1e9, nearFace = false;
    for (const [px, pz] of obbCorners(o).concat([[o.cx, o.cz]])) {
      const b = toBank(px, pz);
      t0 = Math.min(t0, b.t); t1 = Math.max(t1, b.t);
      const tc = clamp(b.t, 0, M - 1);
      if (b.w < fr(tc, Nat(tc) - 1) + 6) nearFace = true;
    }
    if (nearFace) busy.push([t0 - 1, t1 + 1]);
  }
  for (const t of steps) busy.push([t - 0.3, t + 0.3]);
  busy.push([-1, 1.5], [M - 2.5, M]);
  const free = (t0, t1) => busy.every(([a, b]) => t1 < a || t0 > b);
  const placeAlong = (center, half) => {
    for (let i = 0; i <= 14; i++) {
      const d = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.5;
      const c = center + d;
      if (c - half >= 0 && c + half <= M - 1 && free(c - half - 0.5, c + half + 0.5)) return c;
    }
    return null;
  };
  // families of 30-60 m: wall material (full lattice on about 40% only), eave colour, gallery offset (+-1.5 m),
  // unit width, occupancy mix, glow strip intensity, crest and dressing. Occupancy mix: shares of dark (shuttered),
  // dim, normal and bright units; q > 0.5 is a quiet family with more dark units.
  const fams = [];
  for (let t = 0; t < M - 1;) {
    const len = (30 + R() * 30) / STEP;
    const r = R();
    const wall = r < 0.4 ? 'lattice' : r < 0.65 ? 'plaster' : r < 0.8 ? 'lacquer' : 'shop';
    const e = R();
    let q = R();
    if (wall === 'lacquer') q = 0.5 + q * 0.5;        // red lacquer walls with mostly dark windows
    if (wall === 'shop') q *= 0.5;                    // shop rows are busier
    const dark = 0.06 + 0.22 * q, dim = 0.18 + 0.14 * q, bright = Math.max(0.04, 0.24 - 0.2 * q);
    const sk = R(), cr = R();
    fams.push({
      t0: t, t1: Math.min(t + len, M - 1), wall, eaveCol: EAVE_COLS[e < 0.6 ? 0 : e < 0.8 ? 1 : 2],
      off: (R() - 0.5) * 3, uw: 4.5 + R() * 5.5, litRail: R() < 0.3, winW: 2.0 + R() * 0.6, seed: R() * 900,
      occ: [dark, dark + dim, 1 - bright],          // cumulative: < occ[0] dark, < occ[1] dim, < occ[2] normal, else bright
      strip: sk < 0.3 ? 0 : sk < 0.7 ? 1.2 : 2.4,   // glow strip on the roof-edge eave
      crest: cr < 0.35 ? 'roof' : cr < 0.6 ? 'pavilion' : cr < 0.7 ? 'double' : 'terrace',
      flare: R() < 0.55,                             // upswept corners on the roof-edge eaves
      green: 0.15 + R() * 0.2,                       // share of gallery fronts with plants
      upper: R() < 0.5 ? 'plaster' : 'lacquer',      // shop families: wall of the upper floor
    });
    t += len;
  }
  fams[fams.length - 1].t1 = M - 1;
  const famAt = (t) => fams.find((f) => t >= f.t0 - 1e-6 && t <= f.t1 + 1e-6) || fams[fams.length - 1];
  // wall of a family's units (shop families: the upper floor's wall, plaster or lacquer; the lower floor is open)
  const wallOf = (f) => f.wall === 'shop' ? f.upper : f.wall;
  const wallMat = (f) => wallOf(f) === 'plaster' ? MAT.PLASTER : wallOf(f) === 'lacquer' ? MAT.LACQUER : MAT.WOOD;
  const wallCol = (f) => wallOf(f) === 'plaster' ? TIMBER : wallOf(f) === 'lacquer' ? LACQUER : WOOD_DARK;
  // the lift nearest the middle, end pavilions, tower bays every ~62 m with seeded jitter, stair bays between them
  const towers = [], stairs = [];
  const span = M - 1;
  let lift = null;
  {
    const c = placeAlong(span / 2, 1.5);
    if (c !== null && Nat(c) >= 5) {
      const N = Nat(c);
      const ws = Math.max(fr(c, N - 3) + 0.3, fr(c, N - 1) - 3 - 5.5);
      const C = chord(c - 0.375, c + 0.375, ws, ws);
      const [gx, gz] = at(C, 0, 1.5);
      const yb = Math.min(ground(gx, gz), levelY(N - 3)) - 1;
      lift = { t: c, N, ws, C, yb, yTop: levelY(N) + 6, grp: ++grpSeq };
      const o = obb(...at(C, 0, 1.5), C.a, 1.5, 1.5, yb, lift.yTop + 2.6);
      obstacles.push(Object.assign(o, { kind: 'shaft', grp: lift.grp }));
      busy.push([c - 2, c + 2]);
    }
  }
  // end pavilions: two-level towers on the deck where each end has stepped down
  for (const [t0, t1, end] of [[0, 1.5, -1], [M - 2.5, M - 1, 1]]) {
    const N = Nat((t0 + t1) / 2);
    if (N >= 3) towers.push({ t0, t1, kb: 1, N, p: Math.min(2, gAt(t0) - 0.4), end, crown: 'pavilion' });
  }
  // tower bays every 30-40 m: 3-8 levels tall, projecting up to 5 m (less where the gallery in front is narrower),
  // crowned by a pavilion, a double hip roof or a single tall hip roof
  const nT = Math.max(1, Math.round(span * STEP / 35));
  for (let i = 0; i < nT; i++) {
    const c = placeAlong((i + 0.5) * span / nT + (R() - 0.5) * 2, 1.125);
    if (c === null) continue;
    const N = Nat(c), n = 3 + Math.floor(R() * 6), kb = Math.max(2, N - n);
    if (N - kb < 2) continue;
    // no tower where a landmark part (or its podium or skirt) reaches into its volume
    let clash = false;
    for (const t of [c - 1.125, c, c + 1.125]) for (let i = 0; i <= 6 && !clash; i++) {
      const [px, pz] = W(t, fr(t, kb) - 2 + (rr(t, N - 1) - fr(t, kb) + 4) * i / 6);
      clash = obstacles.some((o) => o.kind !== 'shaft' && containsXZ(o, px, pz, 1) && o.y1 > levelY(kb) && o.y0 < levelY(N) + 9);
    }
    if (clash) continue;
    // the unit below must carry the tower's front: the gallery is measured from that unit's front (family offset)
    const gal = Math.min(...[c - 1.125, c, c + 1.125].map((t) => fr(t, kb) - fr(t, kb - 1) - Math.max(0, famAt(t).off)));
    const cr = R();
    towers.push({ t0: c - 1.125, t1: c + 1.125, kb, N, p: Math.max(0.3, Math.min(2 + R() * 3, gal - 0.5)), crown: cr < 0.45 ? 'pavilion' : cr < 0.75 ? 'double' : 'roof' });
    busy.push([c - 1.125 - 0.5, c + 1.125 + 0.5]);
  }
  // stair bays between tower bays, at least 100 m apart
  const tc = towers.filter((T) => !T.end).map((T) => (T.t0 + T.t1) / 2).sort((a, b) => a - b);
  let lastStair = -1e9;
  for (let i = 0; i <= tc.length; i++) {
    const a = i === 0 ? 0 : tc[i - 1], b = i === tc.length ? span : tc[i];
    const s0 = (a + b) / 2;
    if ((b - a) * STEP < 22 || (s0 - lastStair) * STEP < 100) continue;
    const c = placeAlong(s0, 0.8125);
    if (c === null) continue;
    stairs.push({ t0: c - 0.8125, t1: c + 0.8125, N: Nat(c) });
    busy.push([c - 0.8125 - 0.5, c + 0.8125 + 0.5]);
    lastStair = c;
  }

  // dark recessed slots (an alley or stair between houses, lit by a few lanterns) at about half of the family
  // boundaries, 2-4 m wide
  const darkSlots = [];
  for (const f of fams.slice(0, -1)) {
    if (R() >= 0.5) continue;
    const half = (2 + R() * 2) / 2 / STEP;
    const c = placeAlong(f.t1, half);   // at the boundary, or up to 3.5 stations from it where features are in the way
    if (c === null || c - half < 1.5 || c + half > M - 2.5) continue;
    darkSlots.push({ t0: c - half, t1: c + half, N: Nat(c) });
    busy.push([c - half - 0.5, c + half + 0.5]);
  }
  stats.features = { towers: towers.length, stairs: stairs.length, darkSlots: darkSlots.length, lift: !!lift, steps: steps.length, obstacles: obstacles.length, families: fams.map((f) => `${f.wall}/${f.crest}/${f.strip}`).join(' ') };

  // ---------------- clearance: split, narrow or shorten a unit against the obstacles it meets
  // piece = { u0, u1, d0, d1 } on chord frame C; returns the surviving pieces (front pieces keep d0 = 0)
  // (tower blocks are obstacles only for core blocks: only = the obstacles to test)
  const resolve = (C, pcs, y0, y1, only = null) => {
    let out = pcs;
    for (const o of only || obstacles) {
      if (!only && o.kind === 'tower') continue;
      // podiums are support like rock; an obstacle whose foot stands on this unit's roof does not clip it
      if (o.kind === 'podium' || o.y0 > y1 - 0.5 || Math.min(y1, o.y1) - Math.max(y0, o.y0) <= 0.05) continue;
      const next = [];
      for (const q of out) {
        const qb = box(C, q.u0, q.u1, q.d0, q.d1, y0, y1, {});
        const qo = obb(qb.x, qb.z, C.a, qb.hw, qb.hd, y0, y1);
        if (overlapDepth(qo, o) <= -CLEAR) { next.push(q); continue; }
        // obstacle extent in this chord frame
        let ou0 = 1e9, ou1 = -1e9, od0 = 1e9, od1 = -1e9;
        for (const [px, pz] of obbCorners(o)) {
          const dx = px - C.cx, dz = pz - C.cz;
          const u = dx * C.tx + dz * C.tz, d = dx * C.mx + dz * C.mz;
          ou0 = Math.min(ou0, u); ou1 = Math.max(ou1, u); od0 = Math.min(od0, d); od1 = Math.max(od1, d);
        }
        ou0 -= CLEAR; ou1 += CLEAR; od0 -= CLEAR; od1 += CLEAR;
        stats.unitsClipped++;
        if (od0 - q.d0 >= 2.5 && q.d0 === 0) { next.push({ ...q, d1: Math.min(q.d1, od0) }); continue; }   // shorten (face unit)
        if (ou0 - q.u0 >= 2) next.push({ ...q, u1: Math.min(q.u1, ou0) });                                // narrow from the right
        if (q.u1 - ou1 >= 2) next.push({ ...q, u0: Math.max(q.u0, ou1) });                                // narrow from the left
        const m0 = Math.max(q.u0, ou0), m1 = Math.min(q.u1, ou1);
        if (m1 - m0 >= 2) {
          if (od0 - q.d0 >= 1.0) next.push({ ...q, u0: m0, u1: m1, d1: Math.min(q.d1, od0) });                // in front of it
          if (q.d1 - od1 >= 1.0) next.push({ u0: m0, u1: m1, d0: Math.max(q.d0, od1), d1: q.d1 });           // behind it
        }
      }
      out = next;
    }
    if (!out.length) stats.unitsDropped++;
    return out;
  };

  // ---------------- units
  let lanternIdx = 0;
  // one unit at level k between t0 and t1. recess > 0: stair-bay unit set back by `recess`.
  // ends: { left, right } = side exposed (end of a level run) -> corner return
  // underpinning: where a unit's footprint is carried neither by the level below nor by rock (the terrain falls away
  // along the bank at the stepped ends), a timber mass is built down to the ground under that part
  const CARRY = new Set(['body', 'core', 'deck', 'podium', 'skirt', 'tower', 'shopwall', 'underpin']);
  const supported = (x, z, y, grp) => {
    if (ground(x, z) >= y - 0.35) return true;
    let ok = false;
    forCells({ cx: x, cz: z, c: 1, s: 0, hw: 0, hd: 0 }, (key) => {
      if (!ok) for (const q of hash.get(key) || []) if (q.grp !== grp && CARRY.has(q.role) && q.y0 < y - 0.3 && y <= q.y1 + 0.35 && containsXZ(q, x, z, 0.05)) { ok = true; break; }
    });
    return ok;
  };
  // the floor under a point: rock, or the top of the highest carrier of another group below y
  const floorUnder = (x, z, y, grp) => {
    let f = ground(x, z);
    forCells({ cx: x, cz: z, c: 1, s: 0, hw: 0, hd: 0 }, (key) => {
      for (const q of hash.get(key) || []) if (q.grp !== grp && CARRY.has(q.role) && q.y1 <= y - 0.3 && q.y1 > f && containsXZ(q, x, z, 0.05)) f = q.y1;
    });
    return f;
  };
  // underpinning: the unsupported samples (0.9 x 0.75 m grid) are grouped by the floor under them (rock or the roof
  // of a lower piece, in 0.5 m bands); each band's samples in adjacent columns get one timber mass from just below
  // the band's floor up to the unit's floor, so a mass never reaches deep into the piece it stands on.
  const underpin = (Cq, u0, u1, d0, d1, y, grp) => {
    const ds = [];
    for (let d = d0 + 0.3; d < d1 - 0.3; d += 0.75) ds.push(d);
    ds.push(d1 - 0.3);
    const us = [];
    for (let u = u0 + 0.45; u < u1 - 0.45; u += 0.9) us.push(u);
    us.push(u1 - 0.45);
    const fails = [];
    for (let i = 0; i < us.length; i++) for (let j = 0; j < ds.length; j++) {
      const [x, z] = at(Cq, us[i], ds[j]);
      if (supported(x, z, y, grp)) continue;
      const f = Math.min(...[us[i] - 0.4, us[i], us[i] + 0.4].map((uu) => floorUnder(...at(Cq, clamp(uu, u0, u1), ds[j]), y, grp)));
      if (f <= y - 0.35) fails.push({ i, j, f });
    }
    fails.sort((p, q) => p.f - q.f);
    let k = 0;
    while (k < fails.length) {
      const f0 = fails[k].f;
      let e = k;
      while (e < fails.length && fails[e].f <= f0 + 0.5) e++;
      const band = fails.slice(k, e);
      k = e;
      const cols = [...new Set(band.map((p) => p.i))].sort((a2, b2) => a2 - b2);
      for (let c = 0; c < cols.length;) {
        let c1 = c;
        while (c1 + 1 < cols.length && cols[c1 + 1] === cols[c1] + 1) c1++;
        const inG = band.filter((p) => p.i >= cols[c] && p.i <= cols[c1]);
        const j0 = Math.min(...inG.map((p) => p.j)), j1 = Math.max(...inG.map((p) => p.j));
        const ua = cols[c] === 0 ? u0 : us[cols[c]] - 0.45, ub = cols[c1] === us.length - 1 ? u1 : us[cols[c1]] + 0.45;
        const da = j0 === 0 ? d0 : ds[j0] - 0.375, db = j1 === ds.length - 1 ? d1 : ds[j1] + 0.375;
        // inset 0.25 m on every side (every sample stays covered), so the mass does not graze the sides of
        // neighbouring pieces, which meet the piece at small angles, or of the higher pieces beside its band
        part(box(Cq, ua + 0.25, ub - 0.25, da + 0.25, db - 0.25, f0 - 0.3, y, { mat: MAT.WOOD, col: WOOD_DARK, floorH: FLOOR_H, winW: 2.2, baseY: levelY(Math.max(0, Math.floor((f0 - Y0) / LEVEL_H))), param: 1.2, seed: 91, solid: true }), 'underpin', grp);
        stats.underpins++;
        c = c1 + 1;
      }
    }
  };
  const dressQueue = [];
  // occupancy of a unit: 0 dark (shuttered), 1 dim, 2 normal, 3 bright. Half of the time a unit takes the state of
  // the unit below it (or, less often, of that unit's neighbour), otherwise it draws from its family's mix, so dark
  // and lit units cluster into vertical and diagonal runs. The state sets the facade's glow (param), lanterns,
  // the eave strip and the railing light.
  const occLevels = [];
  const OCC_GLOW = [0.06, 0.5, 1.15, 1.75];
  const occupancy = (k, t0, t1, fam) => {
    const below = occLevels[k - 1] || [];
    const mid = (t0 + t1) / 2;
    let s = -1;
    const r = R();
    if (r < 0.6) {
      const i = below.findIndex((o) => mid >= o.t0 - 1e-6 && mid <= o.t1 + 1e-6);
      if (i >= 0) s = below[r < 0.45 ? i : clamp(i + (r < 0.525 ? -1 : 1), 0, below.length - 1)].s;
    }
    if (s < 0) { const u = R(); s = u < fam.occ[0] ? 0 : u < fam.occ[1] ? 1 : u < fam.occ[2] ? 2 : 3; }
    (occLevels[k] ||= []).push({ t0, t1, s });
    return s;
  };
  // narrow parts get no collider from buildings.js (min half size 1 m); the plaza paving adds its own
  const plazaCollider = (b) => { if (Math.min(b.hw, b.hd) < 1) world.addCollider(b.cx, (b.y0 + b.y1) / 2, b.cz, b.hw, (b.y1 - b.y0) / 2, b.hd, Math.atan2(b.s, b.c)); };
  // gallery depth in front of level k between t0 and t1 (the narrowest)
  const galleryAt = (k, t0, t1) => Math.min(...[t0, (t0 + t1) / 2, t1].map((t) => fr(t, k) - (k > 0 ? fr(t, k - 1) : F0 - 2)));

  // one unit at level k between t0 and t1. recess > 0: unit set back by `recess` (stair bay or dark slot).
  // kind: '' normal, 'stair' (stair bay, dressed by its own code), 'dark' (dark recessed slot).
  // ends: { left, right } = side exposed (end of a level run) -> corner return
  // underpinning: where a unit's footprint is carried neither by the level below nor by rock (the terrain falls away
  // along the bank at the stepped ends), a timber mass is built down to the ground under that part
  const offLevels = [];
  const towerBlocks = [];
  const towerUnderpins = [];
  const unit = (k, t0, t1, fam, recess, ends, seq, kind = '') => {
    const N = Nat((t0 + t1) / 2);
    const top = k === N - 1;
    // front offset: the family's (+-1.5 m) plus any recess, pushed inland where needed so the unit still stands on
    // the unit below with at least G_MIN of gallery in front (family offsets differ where families meet)
    let off = fam.off + recess;
    for (let i = 0; k >= 2 && kind !== 'stair' && i <= 4; i++) {
      const t = t0 + (t1 - t0) * i / 4;
      const u = (offLevels[k - 1] || []).find((o) => t >= o.t0 - 1e-6 && t <= o.t1 + 1e-6);
      if (u) off = Math.max(off, fr(t, k - 1) + u.off + G_MIN - fr(t, k));
    }
    (offLevels[k] ||= []).push({ t0, t1, off });
    const C = chord(t0, t1, fr(t0, k) + off, fr(t1, k) + off);
    const y0 = levelY(k), y1 = levelY(k + 1);
    // depth: to the rock behind the level top from the section, then on until the real ground under the rear edge
    // reaches the top (sections are smoothed along the bank, the ground under a unit's rear corners may be lower)
    let depth = 2.5;
    for (let i = 0; i <= 4; i++) { const t = t0 + (t1 - t0) * i / 4; depth = Math.max(depth, rr(t, k) - fr(t, k) - off + 0.3); }
    const rearLow = (d) => Math.min(...[-C.hw + 0.3, 0, C.hw - 0.3].map((u) => ground(...at(C, u, d - 0.3))));
    for (let i = 0; i < 20 && rearLow(depth) < y1 - 0.3; i++) depth += 1;
    stats.maxDepth = Math.max(stats.maxDepth || 0, +depth.toFixed(1));
    const pcs = resolve(C, [{ u0: -C.hw, u1: C.hw, d0: 0, d1: depth }], y0, y1);
    stats.units++;
    const grp = ++grpSeq;
    const extra = { lvl: k, seq };
    curUnit = extra;
    const dark = kind === 'dark';
    const occ = dark ? 0 : occupancy(k, t0, t1, fam);
    stats.occupancy[occ]++;
    const glow = dark ? 0.03 : OCC_GLOW[occ] + (occ === 2 ? R() * 0.2 : 0);
    const mat = dark ? MAT.WOOD : wallMat(fam), col = dark ? TIMBER : wallCol(fam);
    const r = R();
    const variant = recess > 0 || C.hw < 1.6 ? 'flush'
      : fam.wall === 'shop' ? (r < 0.12 ? 'oriel' : r < 0.22 ? 'balcony' : occ === 0 ? 'flush' : 'shop')
      : r < 0.45 ? 'flush' : r < 0.57 ? 'oriel' : r < 0.67 ? 'balcony' : r < 0.82 ? 'loggia' : occ === 0 ? 'flush' : 'shop';
    // crest of a top unit: hip roof, pavilion storey, two-storey pavilion, or a flat terrace with a balustrade.
    // A terrace unit at the exposed end of a run (a level-count step or the stepped end) gets a hip roof.
    const crest = !top || recess > 0 ? 'none' : fam.crest === 'terrace' && (ends.left || ends.right) ? 'roof' : fam.crest;
    // a deep unit is a facade block on its own chord plus a core block behind it on the level's shared core line
    // (6 m behind the level front), so neighbouring units meet in plane instead of in wedges deep inside the stack.
    // The top level's roof is the plaza: paved (stone tiles, dry), not planked like the galleries.
    const Cc = chord(t0, t1, fr(t0, k) + FACADE, fr(t1, k) + FACADE);
    const dF = FACADE - off;
    const opts = (m, c, g = glow) => ({ mat: m, col: c, floorH: FLOOR_H, winW: fam.winW, baseY: y0, param: g, seed: fam.seed + seq * 3.7 + k, solid: true, flags: top ? FLAG.NOTOP : 0 });
    const pave = (Cq, u0, u1, d0, d1) => { const b = part(box(Cq, u0, u1, d0, d1, y1 - 0.15, y1, { mat: MAT.TILE, col: PAVING, param: 0 }), 'paving', grp, extra); if (b) plazaCollider(b); };
    for (const q of pcs) {
      const front = q.d0 === 0;
      const split = front && q.d1 > dF + 1;
      const d1 = split ? dF : q.d1;
      const body = (ya, yb, m, c, dShift = 0) => part(box(C, q.u0, q.u1, q.d0 + dShift, d1, ya, yb, opts(m, c)), 'body', grp, extra);
      if (!front || (variant !== 'shop' && variant !== 'loggia')) body(y0, y1, mat, col);
      else if (variant === 'shop') { body(y0, y0 + FLOOR_H, MAT.SHOPWOOD, WOOD_DARK); body(y0 + FLOOR_H, y1, mat, col); }
      else { body(y0, y0 + FLOOR_H, mat, col); body(y0 + FLOOR_H, y1, mat, col, 1.2); }
      const cu0 = q.u0 * Cc.hw / C.hw, cu1 = q.u1 * Cc.hw / C.hw;
      const cores = split ? resolve(Cc, [{ u0: cu0, u1: cu1, d0: 0, d1: q.d1 - dF }], y0, y1, towerBlocks) : [];
      for (const c of cores) part(box(Cc, c.u0, c.u1, c.d0, c.d1, y0, y1, opts(mat, col)), 'core', grp, extra);
      if (top) { pave(C, q.u0, q.u1, q.d0, d1); for (const c of cores) pave(Cc, c.u0, c.u1, c.d0, c.d1); }
      if (k >= 2) {
        underpin(C, q.u0, q.u1, q.d0, d1, y0, grp);
        for (const c of cores) underpin(Cc, c.u0, c.u1, c.d0, c.d1, y0, grp);
      }
    }
    curUnit = null;
    const strip = occ === 0 ? 0 : fam.strip;
    // dressing runs after every body of the stack is placed, so its clearance check sees the levels above too
    dressQueue.push(() => {
      curUnit = extra;
      for (const q of pcs) {
        if (q.d0 !== 0) continue;
        const w = q.u1 - q.u0;
        const dR = Math.min(dF, q.d1) - 0.2;   // depth of a crest roof or pavilion (the facade block)
        const roofed = crest !== 'none' && crest !== 'terrace' && w > 2.5 && dR > 3;
        // the roof's front edge: gallery railing for the level above, or the plaza balustrade
        if (top && !roofed) rail(C, q.u0, q.u1, 0.07, y1, 1.15, true, grp);
        else if (!top) rail(C, q.u0, q.u1, 0.07, y1, 1.0, fam.litRail && occ >= 2, grp);
        if (dark) {
          // dark slot: a lantern on every other level, nothing else
          if (k % 2 === 0) { const [lx2, lz2] = at(C, (q.u0 + q.u1) / 2, -0.4); lantern(lx2, y1 - 2.2, lz2, 1, grp); }
          continue;
        }
        if (recess > 0) continue;   // stair bays carry their own lit panel and flights
        // mid-level pent eave: dark tile edge; roof-edge eave: the family's glow strip and upswept corners
        eave(C, q.u0, q.u1, 0, y0 + 3.2, 0.9, 0.45, fam.eaveCol, grp, 0);
        const dSk = variant === 'loggia' ? 1.2 : 0;
        if (!roofed) eave(C, q.u0, q.u1, dSk, y1 - 0.4, 1.3, 0.55, fam.eaveCol, grp, strip, fam.flare);
        if (variant === 'loggia') rail(C, q.u0, q.u1, 0.07, y0 + FLOOR_H, 1.0, false, grp);
        const gal = galleryAt(k, t0, t1);
        if (variant === 'oriel' && w > 3.2) {
          // upper-floor oriel projecting 1.2-1.8 m over the gallery (at most to 0.6 m from its edge)
          const po = clamp(1.2 + R() * 0.6, 0.6, gal - 0.6);
          const ou0 = q.u0 + 0.6, ou1 = q.u1 - 0.6;
          part(box(C, ou0, ou1, -po, 0.2, y0 + FLOOR_H, y1 - 1.0, { mat, col, floorH: FLOOR_H, winW: fam.winW, baseY: y0, param: Math.max(glow, 0.5) + 0.2, seed: fam.seed + seq, flags: FLAG.BOTTOM }), 'oriel', grp);
          const nb = w > 7 ? 3 : 2;
          for (let i = 0; i < nb; i++) {
            const u = ou0 + 0.3 + (ou1 - ou0 - 0.6) * i / (nb - 1);
            const [bx, bz] = at(C, u, 0.05);
            prop({ x: bx, y0: y0 + FLOOR_H - 1.1, z: bz, a: C.a, hw: 0.07, hd: 0.07, h: 1.05, lx: -C.mx * (po - 0.2), lz: -C.mz * (po - 0.2), mat: MAT.WOOD, col: TIMBER, param: 0, winW: 9, floorH: 9 }, 'bracket', grp);
          }
          if (R() < 0.12) {
            // laundry on a pole under the oriel
            for (let i = 0; i < 4; i++) {
              const [lx2, lz2] = at(C, ou0 + 0.6 + i * 0.7, -po - 0.15);
              prop({ x: lx2, y0: y0 + FLOOR_H - 0.75, z: lz2, a: C.a, hw: 0.28, hd: 0.02, h: 0.6, mat: MAT.FELT, col: [[0.7, 0.66, 0.6], [0.5, 0.12, 0.1], [0.15, 0.3, 0.5], [0.6, 0.5, 0.2]][(i + seq) % 4], param: 0.9 }, 'laundry', grp);
            }
          }
        }
        if (variant === 'balcony' && w > 3.2) {
          // upper-floor balcony projecting 1.2-1.7 m: slab on brackets, railing, a lantern
          const pb = clamp(1.2 + R() * 0.5, 0.6, gal - 0.6);
          const bu0 = q.u0 + 0.5, bu1 = q.u1 - 0.5;
          if (part(box(C, bu0, bu1, -pb, 0, y0 + FLOOR_H - 0.18, y0 + FLOOR_H, { mat: MAT.WOOD, col: [0.12, 0.06, 0.035], floorH: 9, winW: 9, baseY: y0, param: 0, flags: FLAG.BOTTOM }), 'balcony', grp)) {
            rail(C, bu0, bu1, -pb, y0 + FLOOR_H, 1.0, occ >= 2, grp);
            for (const u of [bu0 + 0.3, bu1 - 0.3]) {
              const [bx, bz] = at(C, u, 0.05);
              prop({ x: bx, y0: y0 + FLOOR_H - 1.2, z: bz, a: C.a, hw: 0.07, hd: 0.07, h: 1.05, lx: -C.mx * (pb - 0.2), lz: -C.mz * (pb - 0.2), mat: MAT.WOOD, col: TIMBER, param: 0, winW: 9, floorH: 9 }, 'bracket', grp);
            }
            if (occ >= 1) { const [lx2, lz2] = at(C, (bu0 + bu1) / 2, -pb + 0.3); lantern(lx2, y0 + FLOOR_H + 1.7, lz2, occ === 3 ? 0 : lanternIdx++, grp); }
          }
        }
        // lanterns under the roof-edge eave (not over oriels): every 2.2 m on bright units (red), 3 m on normal,
        // 6 m on dim, none on dark ones
        const lstep = [0, 6, 3, 2.2][occ];
        if (variant !== 'oriel' && lstep) {
          for (let u = q.u0 + lstep / 2; u < q.u1 - 0.5; u += lstep) {
            const [lx2, lz2] = at(C, u, dSk - 0.6);
            lantern(lx2, y1 - 1.95, lz2, occ === 3 ? 0 : lanternIdx++, grp);
          }
        }
        // greenery on the family's share of gallery fronts: potted shrubs on the gallery and a planter with
        // trailing plants on the railing
        if (!top && w > 3 && R() < fam.green) {
          for (const u of [q.u0 + 0.8, q.u1 - 0.8]) {
            const [px, pz] = at(C, u, 0.7);
            if (prop({ x: px, y0: y1, z: pz, hw: 0.3, h: 0.5, kind: 2, prm: 8, mat: MAT.TILE, col: [0.25, 0.12, 0.08], param: -1, detail: true }, 'plant', grp)) {
              prop({ x: px, y0: y1 + 0.45, z: pz, hw: 0.45, h: 1.0, kind: 2, prm: 8, taper: 0.35, mat: MAT.CONCRETE, col: LEAF, detail: true }, 'plant', grp);
            }
          }
          const pu0 = q.u0 + 0.3 + R() * w * 0.3, pu1 = Math.min(q.u1 - 0.3, pu0 + 1.5 + R() * 2);
          part(box(C, pu0, pu1, -0.24, -0.02, y1 + 0.2, y1 + 0.95, { mat: MAT.CONCRETE, col: [0.06, 0.15, 0.05], param: 0 }), 'plant', grp);
        }
        // vertical shop signs hanging over the gallery, clear of the eaves: on most shop fronts and on some other
        // lit units of the lower five levels
        if (occ > 0 && (variant === 'shop' ? R() < 0.6 : k <= 5 && R() < 0.12)) {
          const h = 2.6 + R() * 2.2, sw = 0.9 + R() * 0.6;
          const [sx, sz] = at(C, q.u0 + 0.6 + R() * (w - 1.2), -0.95);
          slot(sx, y0 + 2.4 + h / 2, sz, -C.mx, -C.mz, sw, h);
        }
        // crest of a top unit
        if (roofed) {
          const ec = fam.eaveCol;
          if (crest === 'roof') hipRoof(C, q.u0, q.u1, 0, dR, y1 - 0.3, 2.3 + R() * 0.9, ec, strip, grp, 0.9, 0.18);
          else {
            // pavilion storey (two in 'double') set back from the front, a pent eave below, hip roof on top
            const storeys = crest === 'double' && w > 5 ? 2 : 1;
            eave(C, q.u0, q.u1, 0, y1 - 0.4, 1.3, 0.55, ec, grp, strip, fam.flare);
            let yb = y1, inset = 0.4, dz0 = 0.5;
            for (let j = 0; j < storeys; j++) {
              const pv = part(box(C, q.u0 + inset, q.u1 - inset, dz0, dR - 0.3, yb, yb + 4.0, opts(mat, col, Math.max(glow, 0.5))), 'pavilion', grp);
              if (!pv) break;
              yb += 4.0;
              if (j < storeys - 1) { eave(C, q.u0 + inset, q.u1 - inset, dz0, yb - 0.2, 1.0, 0.45, ec, grp, strip); inset += 0.6; dz0 += 0.6; }
              else hipRoof(C, q.u0 + inset, q.u1 - inset, dz0, dR - 0.3, yb - 0.2, 2.2 + R() * 0.6, ec, strip, grp, 0.9, 0.16);
            }
          }
        }
        // corner returns: eaves, glow strips and railing wrap around an exposed end
        for (const [isEnd, us, sgn] of [[ends.left && q.u0 === -C.hw, q.u0, -1], [ends.right && q.u1 === C.hw, q.u1, 1]]) {
          if (!isEnd) continue;
          const tEnd = sgn < 0 ? t0 : t1;
          const exposed = Math.min(q.d1, rr(tEnd, k) - fr(tEnd, k) - off - 0.3);
          const expRoof = Math.min(q.d1, Math.max(0, riseAt(S[clamp(Math.round(tEnd), 0, M - 1)].h, y1 + 1) - fr(tEnd, k) - off));
          sideEave(C, us, sgn, 0, exposed, y0 + 3.2, 0.9, 0.45, fam.eaveCol, grp, 0);
          if (!roofed) sideEave(C, us, sgn, 0, exposed, y1 - 0.4, 1.3, 0.55, fam.eaveCol, grp, strip);
          sideRail(C, us - sgn * 0.07, roofed ? dR + 0.8 : 0.2, expRoof, y1, top ? 1.15 : 1.0, top, grp);
        }
        // plaza dressing on the top level's roof, behind a crest roof or pavilion
        if (top) plaza(C, q, y1, t0, t1, grp, roofed ? dR + 0.9 : 0);
      }
      curUnit = null;
    });
    return pcs;
  };

  // plaza: lamp posts every 12 m, planters with small trees every 18 m, lights every 24 m (arc position based),
  // from dP inland (behind a crest roof). Plaza props are detail props (culled below 8 px).
  const plaza = (C, q, y, t0, t1, grp, dP) => {
    const s0 = t0 * STEP, s1 = t1 * STEP, scale = (s1 - s0) / (2 * C.hw);
    const each = (period, phase, fn) => { for (let s = Math.ceil((s0 - phase) / period) * period + phase; s < s1; s += period) { const u = -C.hw + (s - s0) / scale; if (u > q.u0 + 0.6 && u < q.u1 - 0.6) fn(u); } };
    const room = q.d1 - dP;
    if (room < 2.5) return;
    each(12, 3, (u) => {
      const [x, z] = at(C, u, dP + 1.2);
      if (supported(x, z, y, -1) && prop({ x, y0: y, z, hw: 0.09, h: 4.2, kind: 2, prm: 8, mat: MAT.METAL, col: [0.12, 0.1, 0.08], detail: true }, 'lamp', grp)) {
        prop({ x, y0: y + 4.2, z, hw: 0.3, h: 0.6, kind: 2, prm: 8, mat: MAT.EMIT, col: LANTERN_GOLD, param: 5, flags: FLAG.BOTTOM, detail: true }, 'lamphead', grp);
      }
    });
    if (room > 5) each(18, 9, (u) => {
      const [x, z] = at(C, u, dP + Math.min(3.4, room - 1.2));
      if (supported(x, z, y, -1) && prop({ x, y0: y, z, a: C.a, hw: 0.8, hd: 0.8, h: 0.7, mat: MAT.MASONRY, col: STONE, param: 0.4, detail: true }, 'planter', grp)) {
        prop({ x, y0: y + 0.7, z, hw: 0.12, h: 1.6, kind: 2, prm: 8, mat: MAT.CONCRETE, col: [0.12, 0.08, 0.05], detail: true }, 'tree', grp);
        prop({ x, y0: y + 1.8, z, hw: 1.3, h: 2.6, kind: 2, prm: 8, taper: 0.2, mat: MAT.CONCRETE, col: LEAF, detail: true }, 'tree', grp);
      }
    });
    each(24, 15, (u) => { const [x, z] = at(C, u, dP + 2); light(x, y + 4.5, z, 16, [1, 0.66, 0.35], 18); });
  };

  // ---------------- level 0: braced stilt frame at the toe carrying the level-1 deck
  // Deck segments of 3 stations; under each, column rows every 3.4 m inland and 3.2 m along the bank stand on stone
  // footings on the slope, up to a lit shop wall where the rock comes within 4 m of the deck, whose top carries the
  // deck back to the rock. Stair bays get a river-walk stair between the first two rows through a deck opening.
  const y1d = levelY(1);
  const hAt = (t) => S[clamp(Math.round(t), 0, M - 1)].h;
  const decks = [];
  for (let t = 0; t < M - 1 - 1e-6; t += 3) {
    const t1 = Math.min(t + 3, M - 1);
    let wShop = 1e9, wRock = 0, depth = 0;
    for (const tt of [t, (t + t1) / 2, t1]) {
      wShop = Math.min(wShop, riseAt(hAt(tt), y1d - 4.0));
      wRock = Math.max(wRock, riseAt(hAt(tt), y1d - 0.9));
      depth = Math.max(depth, rr(tt, 0) - F0 + 0.3);
    }
    const C = chord(t, t1, F0, F0);
    const low = (d) => Math.min(...[-C.hw + 0.3, 0, C.hw - 0.3].map((u) => ground(...at(C, u, d - 0.3))));
    for (let i = 0; i < 15 && low(depth) < y1d - 0.35; i++) depth += 1;
    decks.push({ t0: t, t1, wShop: wShop - F0 > 3 ? wShop : null, wRock, depth });
  }
  const deckAt = (t) => decks.find((d) => t >= d.t0 - 1e-6 && t <= d.t1 + 1e-6) || decks[decks.length - 1];
  // river-walk stair of a stair bay: two flights and a landing along the bank, between the first two column rows
  for (const Sb of stairs) {
    const C = chord(Sb.t0 - 0.6, Sb.t1 + 0.6, F0 + 0.8, F0 + 0.8);
    const [gx, gz] = at(C, -C.hw, 1.2);
    const g0 = Math.max(ground(gx, gz), 5.8);
    const rise = (y1d - g0) / 2, runA = Math.min(C.hw - 1.8, rise / 0.18 * 0.28);
    Sb.walk = rise > 1 && runA > 2 ? { C, g0, rise, runA } : null;
  }
  const inWalk = (t) => stairs.some((Sb) => Sb.walk && t > Sb.t0 - 1.2 && t < Sb.t1 + 1.2);
  const frameRows = (t) => {
    // rows every 3.4 m up to the shop wall, or (without one) until the posts get shorter than 1 m; a last row closes
    // any gap of more than 2 m before that limit
    const rows = [], D = deckAt(t);
    const ok = (w) => { const [x, z] = W(t, w), g = ground(x, z); return (D.wShop === null || w <= D.wShop - 0.8) && g <= y1d - 1.6 ? { w, x, z, g } : null; };
    let last = F0 + 0.45 - 3.4;
    for (let r = 0; r < 6; r++) { const q = ok(F0 + 0.45 + 3.4 * r); if (!q) break; rows.push(q); last = q.w; }
    for (let w = last + 3.0; w > last + 2.0; w -= 0.25) { const q = ok(w); if (q) { rows.push(q); break; } }
    return rows;
  };
  {
    const bay = 0.8;   // 3.2 m between column lines
    const cols = [];
    for (let t = 0, j = 0; t <= M - 1 + 1e-6; t += bay, j++) cols.push({ t, j, rows: frameRows(t) });
    const grp = ++grpSeq;
    const timber = { mat: MAT.CONCRETE, col: [0.14, 0.07, 0.04], param: 0.5 };
    for (const c of cols) {
      c.rows.forEach((rw, r) => {
        prop({ x: rw.x, y0: rw.g - 0.4, z: rw.z, a: 0, hw: 0.45, hd: 0.45, h: 0.9, mat: MAT.MASONRY, col: STONE, param: 0.2 }, 'footing', grp);
        part({ x: rw.x, y0: rw.g + 0.5, z: rw.z, hw: 0.3, h: y1d - 0.6 - (rw.g + 0.5), kind: 2, prm: 8, mat: MAT.CONCRETE, col: [0.16, 0.075, 0.045], param: 0.5 }, 'column', grp);
        if (r === 0 && c.j % 2 === 0) {
          const f = frame(c.t);
          lantern(rw.x - f.nx * 0.5, y1d - 2.6, rw.z - f.nz * 0.5, lanternIdx++, grp);
        }
      });
      // cross tie through the rows at 3.6 m below the deck (not across a river-walk stair)
      if (c.rows.length > 1 && !inWalk(c.t)) {
        const a = c.rows[0], b = c.rows[c.rows.length - 1];
        const C = chord(c.t, c.t + 0.001, a.w, a.w);
        const yt = y1d - 3.6;
        if (Math.max(a.g, b.g) < yt - 0.5) part(box({ ...C, hw: 0 }, -0.12, 0.12, -0.15, b.w - a.w + 0.15, yt - 0.25, yt, timber), 'tie', grp);
      }
    }
    // longitudinal ties (front row every bay, other rows every 3 bays) and diagonal braces in alternate front bays
    for (let i = 0; i + 1 < cols.length; i++) {
      const A = cols[i], Bc = cols[i + 1];
      for (let r = 0; r < Math.min(A.rows.length, Bc.rows.length); r++) {
        if (i % 3 !== 0 && r > 0) continue;
        const E = cols[Math.min(cols.length - 1, i + (r === 0 ? 1 : 3))];
        if (E.rows.length <= r) continue;
        const C = chord(A.t, E.t, A.rows[r].w, E.rows[r].w);
        for (const yt of [y1d - 3.6, y1d - 6.6]) {
          if (Math.max(A.rows[r].g, E.rows[r].g) > yt - 0.6) continue;
          part(box(C, -C.hw + 0.3, C.hw - 0.3, -0.12, 0.12, yt - 0.25, yt, timber), 'tie', grp);
        }
      }
      if (i % 2 === 0 && A.rows.length && Bc.rows.length) {
        const a = A.rows[0], b = Bc.rows[0];
        const yA = Math.max(a.g + 0.6, y1d - 7.5);
        part({ x: a.x, y0: yA, z: a.z, a: Math.atan2(b.z - a.z, b.x - a.x), hw: 0.1, hd: 0.1, h: y1d - 0.9 - yA, lx: b.x - a.x, lz: b.z - a.z, ...timber }, 'brace', grp);
      }
    }
    // deck: plank top, lantern-lit underside, glowing fascia; the gallery-1 railing on the front edge; the shop wall;
    // undercroft lights every 32 m
    decks.forEach((D, di) => {
      const C = chord(D.t0, D.t1, F0, F0);
      const dg = ++grpSeq;
      curUnit = { lvl: 'deck', seq: di };
      // openings over river-walk stairs: [o0, o1] x [1.25, 2.75] in this deck's frame
      let pcs = [{ u0: -C.hw, u1: C.hw, d0: 0, d1: D.depth }];
      for (const Sb of stairs) {
        if (!Sb.walk) continue;
        const Cs = Sb.walk.C;
        const proj = (u) => { const [x, z] = at(Cs, u, 1.2); return (x - C.cx) * C.tx + (z - C.cz) * C.tz; };
        const o0 = Math.min(proj(-0.3), proj(Cs.hw)), o1 = Math.max(proj(-0.3), proj(Cs.hw));
        if (o1 < -C.hw || o0 > C.hw) continue;
        const next = [];
        for (const q of pcs) {
          if (o1 <= q.u0 || o0 >= q.u1) { next.push(q); continue; }
          if (o0 > q.u0) next.push({ ...q, u1: o0 });
          if (o1 < q.u1) next.push({ ...q, u0: o1 });
          const m0 = Math.max(q.u0, o0), m1 = Math.min(q.u1, o1);
          next.push({ u0: m0, u1: m1, d0: q.d0, d1: 1.25 }, { u0: m0, u1: m1, d0: 2.75, d1: q.d1 });
        }
        pcs = next;
      }
      for (const q of pcs) {
        if (q.u1 - q.u0 < 0.2) continue;
        const d = part(box(C, q.u0, q.u1, q.d0, q.d1, y1d - 0.6, y1d, { mat: MAT.WOOD, col: [0.12, 0.06, 0.035], floorH: 4, winW: 3, baseY: y1d - 0.6, param: 2.6, flags: FLAG.BOTTOM }), 'deck', dg);
        world.addCollider(d.cx, y1d - 0.3, d.cz, d.hw, 0.3, d.hd, C.a);
      }
      rail(C, -C.hw, C.hw, 0.07, y1d, 1.0, true, dg);
      if (D.wShop !== null) {
        const Cw = chord(D.t0, D.t1, D.wShop, D.wShop);
        const ys = y1d - 0.6 - 3.6;
        part(box(Cw, -Cw.hw + 0.05, Cw.hw - 0.05, 0, Math.max(2.5, D.wRock - D.wShop + 0.6), ys - 1.5, y1d - 0.6, { mat: MAT.SHOPWOOD, col: WOOD_DARK, floorH: FLOOR_H, winW: 2.6, baseY: ys, param: 1.3, seed: D.t0 * 13, solid: true }), 'shopwall', dg);
      }
      // one light per 32 m of bank: in the deck segment that contains each multiple of 32 m
      if (Math.floor(D.t1 * STEP / 32) > Math.floor(D.t0 * STEP / 32) || D.t0 === 0) { const [x, z] = at(C, 0, 3.5); light(x, y1d - 3, z, 14, [1, 0.6, 0.3], 26); }
      curUnit = null;
    });
    // river-walk stairs: flight, landing on a post, flight up through the deck opening
    for (const Sb of stairs) {
      if (!Sb.walk) continue;
      const { C, g0, rise, runA } = Sb.walk;
      const wg = ++grpSeq;
      const fl = (u0, y0) => {
        const [x, z] = at(C, u0 + 0.2, 1.2);
        part({ x, y0, z, a: C.a, hw: 0.2, hd: 0.7, h: rise, lx: C.tx * (runA - 0.4), lz: C.tz * (runA - 0.4), mat: MAT.MASONRY, col: STONE, winW: 1, param: 0.3, flags: FLAG.BOTTOM }, 'flight', wg);
        const n = Math.round(rise / 0.18);
        for (let j = 0; j < n; j++) {
          const [sx, sz] = at(C, u0 + runA * (j + 0.5) / n, 1.2);
          deferredSteps.push({ x: sx, y0: y0 + rise * j / n - 0.06, z: sz, a: C.a, hw: runA / n / 2, hd: 0.7, h: rise / n + 0.06, mat: MAT.MASONRY, col: [0.52, 0.45, 0.36], param: 0.2, detail: true });
        }
      };
      fl(-runA - 0.1, g0 - 0.2);
      part(box(C, -0.1, 1.5, 0.45, 1.95, g0 + rise - 0.25, g0 + rise, { mat: MAT.MASONRY, col: STONE, param: 0.3, flags: FLAG.BOTTOM }), 'landing', wg);
      const [px, pz] = at(C, 0.7, 1.2);
      part({ x: px, y0: ground(px, pz) - 0.3, z: pz, hw: 0.22, h: g0 + rise - 0.25 - ground(px, pz) + 0.3, kind: 2, prm: 8, mat: MAT.CONCRETE, col: [0.16, 0.075, 0.045], param: 0.5 }, 'column', wg);
      fl(1.5, g0 + rise);
    }
  }

  // ---------------- tower bays: project 2-4 m, rise from level kb through the top, pavilion with a double roof
  const towerSpanAt = (t, k) => towers.find((T) => k >= T.kb && t > T.t0 - 1e-6 && t < T.t1 + 1e-6);
  for (const T of towers) {
    const grp = ++grpSeq;
    curUnit = { towerKb: T.kb };   // the stack's units butt against the tower's sides from level kb up
    const fam = famAt((T.t0 + T.t1) / 2);
    // the tower's frame follows the bank normal (not the chord of the front line), so its sides run inland the same
    // way as the stack's units and cores beside it
    const Cf = chord(T.t0, T.t1, fr(T.t0, T.kb) - T.p, fr(T.t1, T.kb) - T.p);
    const fm = frame((T.t0 + T.t1) / 2);
    const C = { cx: Cf.cx, cz: Cf.cz, mx: fm.nx, mz: fm.nz, tx: -fm.nz, tz: fm.nx, hw: Cf.hw * Math.abs(Cf.tx * -fm.nz + Cf.tz * fm.nx), a: Math.atan2(-fm.nx, fm.nz) };
    let depth = 4;
    for (const t of [T.t0, (T.t0 + T.t1) / 2, T.t1]) depth = Math.max(depth, rr(t, T.N - 1) - (fr(t, T.kb) - T.p) + 0.3);
    const ya = levelY(T.kb), yb = levelY(T.N);
    // one block per level, from the tower face back to the rock behind that level's top. Walls: lattice, plaster or
    // lacquer, and an occupancy of its own, so towers read against the stack beside them
    const tw = R(), tGlow = [0.5, 1.15, 1.6][Math.floor(R() * 3)];
    const tOpts = { mat: tw < 0.45 ? MAT.WOOD : tw < 0.75 ? MAT.PLASTER : MAT.LACQUER, col: tw < 0.45 ? WOOD_DARK : tw < 0.75 ? TIMBER : LACQUER, floorH: FLOOR_H, winW: 2.2, baseY: ya, param: tGlow, seed: fam.seed + 500, solid: true };
    for (let j = T.kb; j < T.N; j++) {
      let dj = 2.5;
      for (const t of [T.t0, (T.t0 + T.t1) / 2, T.t1]) dj = Math.max(dj, rr(t, j) - (fr(t, T.kb) - T.p) + 0.3);
      const low = (d) => Math.min(...[-C.hw + 0.3, 0, C.hw - 0.3].map((u) => ground(...at(C, u, d - 0.3))));
      for (let i = 0; i < 20 && low(dj) < levelY(j + 1) - 0.3; i++) dj += 1;
      const tb = part(box(C, -C.hw, C.hw, 0, dj, levelY(j), levelY(j + 1), tOpts), 'tower', grp);
      // the cores beside the tower (on the stack's shared core line, which is not parallel to the tower's sides)
      // are clipped against its blocks
      if (tb) obstacles.push({ ...tb, kind: 'tower', grp });
      // underpinning runs after the stack is built (the units under the tower carry it)
      if (j >= 2) { const y = levelY(j); towerUnderpins.push(() => { curUnit = { towerKb: T.kb }; underpin(C, -C.hw, C.hw, 0, dj, y, grp); curUnit = null; }); }
    }
    for (let y = ya; y < yb - 1; y += FLOOR_H) eave(C, -C.hw, C.hw, 0, y + FLOOR_H - 0.4, 0.9, 0.45, fam.eaveCol, grp);
    for (let k = T.kb; k < T.N; k++) {
      // exposed side length at this level: up to the front of the stack beside the tower
      for (const [us, sgn, tOut] of [[-C.hw, -1, T.t0], [C.hw, 1, T.t1]]) {
        // beside the stack: up to the neighbouring level's front; at the complex's end: up to the rock
        const ls = T.end === sgn
          ? riseAt(S[clamp(Math.round(tOut), 0, M - 1)].h, levelY(k + 1)) - (fr(tOut, T.kb) - T.p) - 0.3
          : fr(tOut, k) + famAt(tOut).off - (fr(tOut, T.kb) - T.p) - 0.4;
        const le = T.end === sgn ? ls : ls - 1.4;   // stop short of the neighbour's projecting eaves
        sideEave(C, us, sgn, 0, Math.min(le, depth), levelY(k) + 3.2, 0.9, 0.45, fam.eaveCol, grp);
        sideEave(C, us, sgn, 0, Math.min(le, depth), levelY(k + 1) - 0.4, 1.3, 0.55, fam.eaveCol, grp);
        if (ls > 2.5 && R() < 0.6) {
          const [ax, az] = at(C, us + sgn * 0.35, Math.min(ls - 1, 1 + R() * (ls - 2)));
          prop({ x: ax, y0: levelY(k) + 1 + R() * 4, z: az, a: C.a + Math.PI / 2, hw: 0.45, hd: 0.3, h: 0.6, mat: MAT.AC, col: [0.55, 0.55, 0.52] }, 'ac', grp);
        }
      }
      const [lx2, lz2] = at(C, 0, -0.75);
      lantern(lx2, levelY(k + 1) - 1.95, lz2, lanternIdx++, grp);
    }
    // crown on the plaza: 'pavilion' (lower hip skirt roof, one lit floor, upper hip roof, finial), 'double' (two
    // stacked hip roofs) or 'roof' (one tall hip roof)
    const pd = Math.min(4.5, depth / 2);
    const [px, pz] = at(C, 0, pd);
    if (T.crown === 'roof') {
      part({ x: px, y0: yb - 0.3, z: pz, a: C.a, hw: C.hw + 0.1, hd: pd + 1.3, h: 4.2, prof: 4, taper: 0.14, mat: MAT.ROOFTILE, col: fam.eaveCol, param: 1.8, flags: FLAG.BOTTOM }, 'roof', grp);
    } else {
      part({ x: px, y0: yb - 0.3, z: pz, a: C.a, hw: C.hw + 0.1, hd: pd + 1.3, h: 2.4, prof: 4, taper: 0.55, mat: MAT.ROOFTILE, col: fam.eaveCol, param: 2.2, flags: FLAG.BOTTOM }, 'roof', grp);
      const yr = T.crown === 'pavilion' ? yb + 4.2 : yb + 1.5;
      if (T.crown === 'pavilion') part({ x: px, y0: yb, z: pz, a: C.a, hw: C.hw - 1.2, hd: pd - 1.2, h: 4.4, mat: MAT.LACQUER, col: LACQUER, floorH: 4.4, winW: 1.8, baseY: yb, param: 1.6, seed: fam.seed + 9, solid: true }, 'pavilion', grp);
      part({ x: px, y0: yr, z: pz, a: C.a, hw: C.hw - 1.2 + 1.7, hd: pd - 1.2 + 1.7, h: 3.8, prof: 4, taper: 0.12, mat: MAT.ROOFTILE, col: fam.eaveCol, param: 2.2, flags: FLAG.BOTTOM }, 'roof', grp);
      part({ x: px, y0: yr + 3.7, z: pz, hw: 0.25, h: 1.6, kind: 2, prm: 8, taper: 0.2, mat: MAT.METAL, col: [0.7, 0.55, 0.2] }, 'finial', grp);
    }
    const [ux, uz] = at(C, 0, -2.5);
    light(ux, ya + 1.5, uz, 18, [1, 0.62, 0.3], 30);
    curUnit = null;
  }

  // ---------------- stair bays: a 6.5 m recess through every level with switchback flights and a lit back panel
  const stairSpanAt = (t) => stairs.find((Sb) => t > Sb.t0 - 1e-6 && t < Sb.t1 + 1e-6);
  const stairRecess = (Sb) => clamp(Math.min(...[Sb.t0, Sb.t1].map(gAt)) - 0.1, 2.4, 3.2);
  const flight = (C, uFrom, dir, run, dLane, lw, yS, grp) => {
    const [x, z] = at(C, uFrom + dir * 0.2, dLane);
    part({ x, y0: yS, z, a: C.a, hw: 0.2, hd: lw / 2, h: 1.8, lx: C.tx * dir * (run - 0.4), lz: C.tz * dir * (run - 0.4), mat: MAT.MASONRY, col: STONE, winW: 1, param: 0.3, flags: FLAG.BOTTOM }, 'flight', grp);
    for (let j = 0; j < 10; j++) {
      const [sx, sz] = at(C, uFrom + dir * run * (j + 0.5) / 10, dLane);
      deferredSteps.push({ x: sx, y0: yS + 0.18 * j - 0.08, z: sz, a: C.a, hw: run / 20, hd: lw / 2, h: 0.26, mat: MAT.MASONRY, col: [0.52, 0.45, 0.36], param: 0.2, detail: true });
    }
  };
  for (const Sb of stairs) {
    const rd = stairRecess(Sb);
    for (let k = 1; k < Sb.N; k++) {
      const grp = ++grpSeq;
      const fam = famAt((Sb.t0 + Sb.t1) / 2);
      // the recessed unit's own chord, with its origin moved rd forward: d is measured from the unrecessed front
      const Cr = chord(Sb.t0, Sb.t1, fr(Sb.t0, k) + fam.off + rd, fr(Sb.t1, k) + fam.off + rd);
      const C = { ...Cr, cx: Cr.cx - Cr.mx * rd, cz: Cr.cz - Cr.mz * rd };
      const y = levelY(k);
      part(box(C, -C.hw + 0.95, C.hw - 0.95, rd - 0.16, rd - 0.1, y + 0.1, y + LEVEL_H - 0.5, { mat: MAT.CROWN, col: [1, 0.66, 0.32], param: 0.9 }), 'panel', grp);
      const lw = (rd - 0.6) / 2, Lw = 1.1, run = 2 * C.hw - 2 * Lw - 1.9;
      const d1 = 0.15 + lw / 2, d2 = rd - 0.25 - lw / 2;
      for (let i = 0; i < 4; i++) {
        const dir = i % 2 ? -1 : 1;
        flight(C, dir > 0 ? -C.hw + 0.95 + Lw : C.hw - 0.95 - Lw, dir, run, i % 2 ? d2 : d1, lw, y + 1.8 * i, grp);
        const ul = dir > 0 ? C.hw - 0.95 - Lw : -C.hw + 0.95;
        part(box(C, ul, ul + Lw, 0.15, rd - 0.25, y + 1.8 * (i + 1) - 0.25, y + 1.8 * (i + 1), { mat: MAT.MASONRY, col: STONE, param: 0.3, flags: FLAG.BOTTOM }), 'landing', grp);
      }
      if (k % 3 === 2) { const [lx2, lz2] = at(C, 0, rd / 2); light(lx2, y + 4, lz2, 10, [1, 0.62, 0.3], 14); }
      if (k === Sb.N - 1) {
        // pailou gate at the stair head on the plaza
        const yb = levelY(k + 1);
        for (const u of [-2.3, 2.3]) { const [gx, gz] = at(C, u, rd + 1.3); part({ x: gx, y0: yb, z: gz, hw: 0.22, h: 4.6, kind: 2, prm: 8, mat: MAT.LACQUER, col: LACQUER, floorH: 9, winW: 9, param: 0 }, 'gate', grp); }
        part(box(C, -2.9, 2.9, rd + 1.05, rd + 1.55, yb + 4.0, yb + 4.6, { mat: MAT.LACQUER, col: LACQUER, floorH: 9, winW: 9, param: 0 }), 'gatebeam', grp);
        const [gx, gz] = at(C, 0, rd + 1.3);
        part({ x: gx, y0: yb + 4.55, z: gz, a: C.a, hw: 3.4, hd: 0.9, h: 1.3, prof: 4, taper: 0.3, mat: MAT.ROOFTILE, col: fam.eaveCol, param: 2.2, flags: FLAG.BOTTOM }, 'roof', grp);
      }
    }
  }

  // ---------------- lift: glass shaft rising out of the stack (its foot is inside the lower levels) to the plaza,
  // machine room with a vertical sign, a lit cabin, short bridges to the galleries it passes
  if (lift) {
    const grp = lift.grp;
    const { C, ws, N, yb, yTop } = lift;
    part(box(C, -1.5, 1.5, 0, 3, yb, yTop, { mat: MAT.GLASS, col: [0.3, 0.5, 0.55], floorH: FLOOR_H, winW: 1.5, baseY: levelY(1), param: 0.5, flags: FLAG.EDGE, seed: 0.5, solid: true }), 'shaft', grp);
    part(box(C, -1.8, 1.8, -0.3, 3.3, yTop, yTop + 2.6, { mat: MAT.METAL, col: [0.2, 0.2, 0.22] }), 'shaft', grp);
    const [sx, sz] = at(C, 0, -0.35);
    slot(sx, yTop - 4, sz, -C.mx, -C.mz, 2.2, 6.5);
    const yv = levelY(N - 3);
    part(box(C, -1.25, 1.25, 0.25, 2.75, yv + (yTop - yv) / 3, yv + (yTop - yv) / 3 + 2.4, { mat: MAT.EMIT, col: [1, 0.8, 0.55], param: 1.8 }), 'cabin', grp);
    lift.bridges = [];
    for (const j of [N - 1, N]) {
      const wFace = fr(lift.t, j - 1) + famAt(lift.t).off;
      const len = wFace - (ws + 3);
      if (len < 0.1) continue;
      lift.bridges.push(+len.toFixed(2));
      const y = levelY(j);
      part(box(C, -0.9, 0.9, 3, 3 + len, y - 0.35, y, { mat: MAT.WOOD, col: [0.12, 0.06, 0.035], floorH: 9, winW: 9, baseY: y - 0.35, param: 1.6, flags: FLAG.BOTTOM }), 'bridge', grp);
      for (const u of [-0.9, 0.9]) part(box(C, u - 0.05, u + 0.05, 3, 3 + len, y, y + 1.0, { mat: MAT.RAIL, col: [0.16, 0.08, 0.045], param: 1.2 }), 'rail', grp);
    }
    stats.lift = { z: +C.cz.toFixed(0), bridges: lift.bridges };
  }

  // ---------------- the stack: level runs split at level-count steps, tower bays, stair bays and families
  towerBlocks.push(...obstacles.filter((o) => o.kind === 'tower'));
  const Nmax = Math.max(...S.map((p) => p.N));
  for (let k = 1; k < Nmax; k++) {
    let s = 0;
    while (s < M) {
      if (S[s].N <= k) { s++; continue; }
      let e = s; while (e + 1 < M && S[e + 1].N > k) e++;
      const ta = s === 0 ? 0 : s - 0.5, tb = e === M - 1 ? M - 1 : e + 0.5;
      // cut points: families, stair bays, dark slots, tower spans at this level
      // (family boundaries closer than 3 m to another cut are dropped, so no unit is narrower than that)
      const cuts = new Set([ta, tb]);
      for (const Sb of stairs) for (const t of [Sb.t0, Sb.t1]) if (t > ta && t < tb && k < Sb.N) cuts.add(t);
      for (const D of darkSlots) for (const t of [D.t0, D.t1]) if (t > ta && t < tb) cuts.add(t);
      for (const T of towers) if (k >= T.kb) for (const t of [T.t0, T.t1]) if (t > ta && t < tb) cuts.add(t);
      for (const t of steps) if (t > ta && t < tb) cuts.add(t);   // no unit straddles a level-count step
      const hard = [...cuts];
      for (const f of fams) for (const t of [f.t0, f.t1]) if (t > ta && t < tb && hard.every((h) => Math.abs(h - t) >= 0.75)) cuts.add(t);
      const cl = [...cuts].sort((a, b) => a - b);
      let seq = 0;
      for (let i = 0; i + 1 < cl.length; i++) {
        const c0 = cl[i], c1 = cl[i + 1], mid = (c0 + c1) / 2;
        if (c1 - c0 < 1e-3 || towerSpanAt(mid, k)) continue;
        const fam = famAt(mid);
        const Sb = stairSpanAt(mid);
        const ends = { left: c0 === ta, right: c1 === tb };
        if (Sb) { unit(k, c0, c1, famAt((Sb.t0 + Sb.t1) / 2), stairRecess(Sb), ends, seq++, 'stair'); continue; }
        if (darkSlots.some((D) => mid > D.t0 && mid < D.t1)) { unit(k, c0, c1, fam, SLOT_RECESS, ends, seq++, 'dark'); continue; }
        // split the run into units of the family's width (4-12 m)
        const len = (c1 - c0) * STEP;
        const n = Math.max(1, Math.round(len / fam.uw));
        const wts = []; let sum = 0;
        for (let j = 0; j < n; j++) { const v = 0.7 + 0.6 * R(); wts.push(v); sum += v; }
        let t = c0;
        for (let j = 0; j < n; j++) {
          const t1 = j === n - 1 ? c1 : t + (c1 - c0) * wts[j] / sum;
          unit(k, t, t1, fam, 0, { left: ends.left && j === 0, right: ends.right && j === n - 1 }, seq++);
          t = t1;
        }
      }
      s = e + 1;
    }
  }

  for (const fn of towerUnderpins) fn();
  for (const fn of dressQueue) fn();

  // ---------------- skirt dressing (eave lines across floating obstacles' faces, railing at the plaza edge)
  for (const sk of skirts) {
    for (let k = 0; k < KMAX; k++) {
      for (const yE of [levelY(k) + 3.2, levelY(k + 1) - 0.4]) if (yE > sk.y0 + 1 && yE < sk.y1 - 0.2) eave(sk.C, -sk.C.hw, sk.C.hw, 0, yE, 0.9, 0.45, EAVE_COLS[0], sk.grp);
    }
    rail(sk.C, -sk.C.hw, sk.C.hw, 0.07, sk.y1, 1.15, true, sk.grp);
  }

  // ---------------- steps last: the prop cap drops them first
  const sg = ++grpSeq;
  for (const o of deferredSteps) prop(o, 'step', sg);

  // ---------------- keep trees out of the complex (footprint + 10 m)
  const reserve = world.shared.gardenReserve || (world.shared.gardenReserve = []);
  for (let s = 0; s < M - 1; s += 4) {
    const t1 = Math.min(s + 4, M - 1);
    const fa = frame((s + t1) / 2);
    let back = 0;
    for (let j = s; j <= t1; j++) back = Math.max(back, S[j].r[S[j].N - 1]);
    const [cx, cz] = W((s + t1) / 2, back / 2 + 5);
    reserve.push({ x: cx, z: cz, hw: (t1 - s) * STEP / 2 + 10, hd: back / 2 + 10, angle: Math.atan2(fa.nx, -fa.nz) });
  }

  stats.levels = { min: Math.min(...S.map((p) => p.N)), max: Nmax, ends: [S[0].N, S[M - 1].N] };
  stats.ends = [[+S[0].x.toFixed(0), +S[0].z.toFixed(0)], [+S[M - 1].x.toFixed(0), +S[M - 1].z.toFixed(0)]];
  B.sites.stilts.stats = stats;
  if (audit) B.sites.stilts.audit = runAudit(pieces, world, stats, obstacles.filter((o) => o.kind === 'land'));
  return { parts: list, slots };
}

// ------------------------------------------------------------------ dev audit

// Pairwise overlap audit through a 2D hash (4 m cells) over every registered piece of the complex plus the landmark
// parts it was fitted around (obstacles), and a support check on load-bearing pieces. Designed joints, reported by
// category with the deepest one of each:
//  - 'facade': neighbouring units of one level where their facades meet (each follows its own chord), up to 1 m;
//  - 'core': the same between core blocks (6 m or more behind the fronts, inside the stack), up to 2 m;
//  - 'tower side': a unit's body or core against a tower bay's block from the tower's base level up, up to 1 m;
//  - 'podium burial': a unit, tower, skirt, underpin or paving piece buried in a podium (support, like rock);
//  - 'podium on obstacle': a podium under the base of the landmark part it carries, up to 0.5 m;
//  - 'obstacle foot': a landmark part standing on a unit's roof, up to 0.5 m;
//  - 'dressing contact': a dressing piece against a neighbouring unit's or a tower's piece, under 0.3 m (the limit
//    the clearance check allows when dressing is placed);
//  - 'tread': a step prop on its flight, landing, deck or floor, under 0.3 m;
//  - 'underpin footing': an underpinning mass sunk at most 0.8 m into the roof of the piece it stands on.
// Pieces of one group (one unit, with its underpins and dressing) are not compared. Everything else is an overlap.
function runAudit(pieces, world, stats, landObstacles) {
  const CELL = 4;
  const grid = new Map();
  const key = (i, j) => i * 100003 + j;
  const all = pieces.concat(landObstacles.map((o, i) => Object.assign({}, o, { role: 'obstacle', grp: -1 - i })));
  all.forEach((p, idx) => {
    const ex = Math.abs(p.c) * p.hw + Math.abs(p.s) * p.hd, ez = Math.abs(p.s) * p.hw + Math.abs(p.c) * p.hd;
    for (let i = Math.floor((p.cx - ex) / CELL); i <= Math.floor((p.cx + ex) / CELL); i++) {
      for (let j = Math.floor((p.cz - ez) / CELL); j <= Math.floor((p.cz + ez) / CELL); j++) {
        const k = key(i, j);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(idx);
      }
    }
  });
  const seen = new Set();
  const overlaps = [];
  const joints = {};
  const addJoint = (cat, d) => { const j = joints[cat] || (joints[cat] = { n: 0, maxDepth: 0 }); j.n++; j.maxDepth = Math.max(j.maxDepth, +d.toFixed(2)); };
  const BURY = new Set(['body', 'core', 'tower', 'skirt', 'underpin', 'paving']);
  const STACK = new Set(['body', 'core', 'tower']);
  const designed = (A, Bp, d) => {
    const pair = (r1, r2) => (A.role === r1 && Bp.role === r2) || (A.role === r2 && Bp.role === r1);
    if ((A.role === 'podium' && BURY.has(Bp.role)) || (Bp.role === 'podium' && BURY.has(A.role))) return 'podium burial';
    if (pair('podium', 'obstacle')) return d <= 0.5 ? 'podium on obstacle' : null;
    if (A.role === 'obstacle' || Bp.role === 'obstacle') {
      const ob = A.role === 'obstacle' ? A : Bp, pc = ob === A ? Bp : A;
      return ob.y0 >= pc.y1 - 0.5 && BURY.has(pc.role) ? 'obstacle foot' : null;
    }
    if (A.lvl !== undefined && A.lvl === Bp.lvl && Math.abs(A.seq - Bp.seq) <= 1) {
      if (A.role === 'core' || Bp.role === 'core') return d < 2 ? 'core' : null;
      return d < 1 ? 'facade' : null;
    }
    if (pair('step', 'flight') || pair('step', 'landing') || pair('step', 'deck') || pair('step', 'body') || pair('step', 'core')) return d < 0.3 ? 'tread' : null;
    if ((DRESS.has(A.role) || DRESS.has(Bp.role)) && joint(A, Bp) && d < 0.3) return 'dressing contact';
    if (A.role === 'underpin' || Bp.role === 'underpin') {
      const up = A.role === 'underpin' ? A : Bp, q = up === A ? Bp : A;
      if (['body', 'core', 'deck', 'tower', 'shopwall', 'underpin', 'paving', 'footing', 'column', 'tie'].includes(q.role) && up.y0 >= q.y1 - 0.8) return 'underpin footing';
    }
    const tw = A.towerKb !== undefined ? A : Bp.towerKb !== undefined ? Bp : null;
    if (tw) {
      const u = tw === A ? Bp : A;
      if (tw.role === 'tower' && STACK.has(u.role) && u.lvl >= tw.towerKb && d < 1) return 'tower side';
    }
    return null;
  };
  for (const list of grid.values()) {
    for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
      const i = Math.min(list[x], list[y]), j = Math.max(list[x], list[y]);
      const pk = i * 1000003 + j;
      if (seen.has(pk)) continue;
      seen.add(pk);
      const A = all[i], Bp = all[j];
      if (A.grp === Bp.grp || (A.role === 'obstacle' && Bp.role === 'obstacle')) continue;
      const d = overlapDepth(A, Bp);
      if (d <= 0.05) continue;
      const cat = designed(A, Bp, d);
      if (cat) { addJoint(cat, d); continue; }
      overlaps.push(`${A.role}/${Bp.role} ${d.toFixed(2)} at ${A.cx.toFixed(0)},${A.y0.toFixed(0)},${A.cz.toFixed(0)} [${A.lvl}:${A.seq}|${A.towerKb} ${Bp.lvl}:${Bp.seq}|${Bp.towerKb}] ${Bp.cx.toFixed(0)},${Bp.y0.toFixed(0)},${Bp.cz.toFixed(0)}`);
    }
  }
  const carrier = new Set(['body', 'core', 'deck', 'podium', 'skirt', 'tower', 'landing', 'bridge', 'shaft', 'shopwall', 'footing', 'underpin', 'paving', 'pavilion']);
  // support: sample points under each load-bearing piece; each needs rock, a carrier top within 0.35 m (or burial
  // into a carrier), or a column under a deck; a point may overhang supported ones by up to 1 m
  const supportAt = (x, z, y, self) => {
    if (world.heightAt(x, z) >= y - 0.35) return true;
    const cell = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const idx of grid.get(key(Math.floor(x / CELL) + i, Math.floor(z / CELL) + j)) || []) cell.push(idx);
    for (const idx of cell) {
      const Q = all[idx];
      if (Q === self || Q.role === 'obstacle') continue;
      // decks and stair landings span between columns (3.2 x 3.4 m grid); landings in stair bays also bear on the
      // walls around them
      if ((self.role === 'deck' || self.role === 'landing') && Q.role === 'column' && containsXZ(Q, x, z, 2.4) && Math.abs(Q.y1 - y) < 0.4) return true;
      if (self.role === 'landing' && (carrier.has(Q.role) || Q.role === 'flight') && Q.y0 - 0.05 <= y && y <= Q.y1 + 0.35 && containsXZ(Q, x, z, 1.25)) return true;
      if (!carrier.has(Q.role)) continue;
      if (Q.y0 < y - 0.3 && y <= Q.y1 + 0.35 && containsXZ(Q, x, z, 0.05)) return true;
    }
    return false;
  };
  let unsupported = 0;
  const bad = [];
  const byRole = {};
  for (const p of pieces) {
    if (!['body', 'core', 'tower', 'deck', 'column', 'pavilion', 'shopwall', 'landing', 'planter', 'lamp', 'gate', 'skirt'].includes(p.role)) continue;
    const pts = [];
    const nu = Math.max(1, Math.ceil(2 * p.hw / 2)), nv = Math.max(1, Math.ceil(2 * p.hd / 2));
    for (let a = 0; a <= nu; a++) for (let b = 0; b <= nv; b++) {
      const u = (-1 + 2 * a / nu) * Math.max(p.hw - 0.3, 0), v = (-1 + 2 * b / nv) * Math.max(p.hd - 0.3, 0);
      pts.push([p.cx + u * p.c - v * p.s, p.cz + u * p.s + v * p.c, supportAt(p.cx + u * p.c - v * p.s, p.cz + u * p.s + v * p.c, p.y0, p)]);
    }
    const ok = pts.filter((q) => q[2]);
    // an unsupported sample may overhang a supported point (another sample, or a probe 0.9 m away) by up to 1 m
    const near = (q) => { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; if (supportAt(q[0] + Math.cos(a) * 0.9, q[1] + Math.sin(a) * 0.9, p.y0, p)) return true; } return false; };
    const fail = pts.some((q) => !q[2] && !ok.some((o) => Math.hypot(o[0] - q[0], o[1] - q[1]) <= 1.0 + 1e-3) && !near(q));
    if (fail || !ok.length) { unsupported++; byRole[p.role] = (byRole[p.role] || 0) + 1; if (bad.filter((b) => b.startsWith(p.role)).length < 4) { const q = pts.find((q2) => !q2[2]) || pts[0]; bad.push(`${p.role} ${p.lvl}:${p.seq} at ${p.cx.toFixed(0)},${p.y0.toFixed(1)},${p.cz.toFixed(0)} hw ${p.hw.toFixed(1)} hd ${p.hd.toFixed(1)}; fails at ${q[0].toFixed(1)},${q[1].toFixed(1)} ground ${world.heightAt(q[0], q[1]).toFixed(1)} wd ${world.waterDist(q[0], q[1]).toFixed(1)}`); } }
  }
  const pairs = {}, samples = {};
  for (const o of overlaps) {
    const [k, d] = o.split(' ');
    const p = pairs[k] || (pairs[k] = { n: 0, maxDepth: 0 });
    p.n++; p.maxDepth = Math.max(p.maxDepth, +d);
    if ((samples[k] = samples[k] || []).length < 3) samples[k].push(o);
  }
  return { pieces: pieces.length, obstacles: landObstacles.length, joints, overlaps: overlaps.length, overlapPairs: pairs, overlapSamples: samples, unsupported, unsupportedByRole: byRole, unsupportedList: bad, masonryParts: stats.masonry };
}

// Dev only (?hydmask): repaints the complex as flat emissive magenta (masonry green) and every other building part
// black, so a capture gives the complex's screen region and its masonry share. Runs after every part is added;
// ranges = the complex's [start, end) part index ranges.
export function devMaskComplex(B, ranges) {
  if (!devQuery('hydmask')) return;
  const P = B.P;
  const paint = (i, col) => {
    P.set(i, 16, MAT.EMIT); P.set(i, 20, col[0]); P.set(i, 21, col[1]); P.set(i, 22, col[2]); P.set(i, 23, col[0] + col[1] + col[2] > 0 ? 2 : 0);
    P.set(i, 15, P.get(i, 15) & ~(FLAG.EDGE | FLAG.LED | FLAG.CROWNLIT | FLAG.FLOOD));
    P.set(i, 18, 0);   // steady emission (EMIT mode 0)
  };
  const inside = (i) => ranges.some(([a, b]) => i >= a && i < b);
  for (let i = 0; i < P.count; i++) paint(i, !inside(i) ? [0, 0, 0] : P.get(i, 16) === MAT.MASONRY ? [0, 1, 0] : [1, 0, 1]);
}
