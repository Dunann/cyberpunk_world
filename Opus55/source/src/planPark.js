// Designed layout of the land-use plan's two large parks (plan.js): Lantern Park on the south bank of the Great
// River and the Silk Road Garden south of the Bund. Everything is rule-based and computed once at load:
//  - walks as polylines: Lantern Park has a river walk, meandering upper walks every ~85 m of water distance,
//    curved cross walks at hashed spacing (80-160 m), and winding secondary paths added wherever lawn would be more
//    than 20 m from a lit walk, plaza or pond; the Silk Road Garden has ring walks every 35 m and 16 spokes;
//  - plazas on the flattest ground within 30 m of each cross-walk junction (full circles), lotus ponds in closed low
//    ground, 6 m pole lamps along every walk, lantern posts every 7 m along the river and cross walks, paifang gates
//    where cross walks meet the inland edge, pavilions on the plazas;
//  - baked into two small textures that the ground shader reads (terrainPark.js): a layout map (signed distances
//    to walk edges, plaza edges and pond edges, plus the LED-curb flag) and a light map (the pools of the pole
//    lamps, lanterns and uplit trees). Thin lines come from the distance fields, so they stay sharp and stable.
// No random stream of the existing city is used; the few hashed choices use their own stream rng(6262).

import { rng } from './math.js';

const LS = 2;            // layout and light-map texel (m)
const FAR = 8;           // the layout distances are exact up to this far from a feature (m)
const CS = 4;            // coarse grid of the lawn-coverage check (m)
const REACH = 44;        // coarse distances are exact up to this far (m)
export const PARK_GATE = { dist: 20, share: 0.05 };   // at most 5% of the lawn more than 20 m from a lit feature

// walk kinds: [half width, LED curb, lanterns, pole-lamp spacing]
const KIND = {
  river: [2.4, 1, 1, 26], upper: [1.8, 1, 0, 26], cross: [1.6, 1, 1, 26], link: [1.6, 1, 1, 26],
  path: [1.1, 0, 0, 30], ring: [1.8, 1, 0, 26], spoke: [1.4, 1, 0, 26], avenue: [3.0, 1, 0, 24],
};
const LAMP_H = 6;        // pole lamps (m)
const LAMP_R = 32;       // light pool cut-off (m)
const POST_SP = 7;       // lantern posts along the river and cross walks (m, alternating sides)

// ------------------------------------------------------------------ small helpers

function segDist(ax, az, bx, bz, x, z) {
  const bax = bx - ax, baz = bz - az;
  const h = Math.min(Math.max(((x - ax) * bax + (z - az) * baz) / (bax * bax + baz * baz || 1), 0), 1);
  return Math.hypot(x - ax - bax * h, z - az - baz * h);
}
function hash1(n) { let h = Math.imul(n | 0, 374761393) ^ 0x9e3779b9; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// float32 -> float16 bits
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
function half(v) {
  f32[0] = v;
  const x = u32[0], s = (x >>> 16) & 0x8000, e = ((x >>> 23) & 0xff) - 127 + 15, m = x & 0x7fffff;
  if (e <= 0) return s;
  if (e >= 31) return s | 0x7bff;
  return s | (e << 10) | (m >>> 13);
}

// One park region on the layout grid.
function makeRegion(style, bb) {
  const X0 = Math.floor(bb[0] / LS) * LS - 6 * LS, Z0 = Math.floor(bb[1] / LS) * LS - 6 * LS;
  const W = Math.ceil((bb[2] - X0) / LS) + 6, H = Math.ceil((bb[3] - Z0) / LS) + 6;
  const cW = Math.ceil(W * LS / CS), cH = Math.ceil(H * LS / CS);
  return {
    style, X0, Z0, W, H, off: 0, cW, cH,
    mask: new Uint8Array(W * H), walk: new Float32Array(W * H).fill(FAR), led: new Uint8Array(W * H),
    plaza: new Float32Array(W * H).fill(FAR), pond: new Float32Array(W * H).fill(FAR),
    light: new Float32Array(W * H * 3),
    cMask: new Uint8Array(cW * cH), lit: new Float32Array(cW * cH).fill(99), skip: new Uint8Array(cW * cH),
  };
}
// bilinear sample of a fine-grid array
function bil(R, arr, x, z) {
  const fx = Math.min(Math.max((x - R.X0) / LS - 0.5, 0), R.W - 1.001), fz = Math.min(Math.max((z - R.Z0) / LS - 0.5, 0), R.H - 1.001);
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * R.W + i;
  return (arr[k] * (1 - u) + arr[k + 1] * u) * (1 - v) + (arr[k + R.W] * (1 - u) + arr[k + R.W + 1] * u) * v;
}
const fi = (R, x, z) => { const i = Math.floor((x - R.X0) / LS), j = Math.floor((z - R.Z0) / LS); return i < 0 || j < 0 || i >= R.W || j >= R.H ? -1 : j * R.W + i; };

// signed-distance stamping (fine layout grid + coarse coverage grid)
function stampSeg(R, ax, az, bx, bz, hw, led) {
  const reach = hw + FAR;
  const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - R.X0) / LS)), i1 = Math.min(R.W - 1, Math.ceil((Math.max(ax, bx) + reach - R.X0) / LS));
  const j0 = Math.max(0, Math.floor((Math.min(az, bz) - reach - R.Z0) / LS)), j1 = Math.min(R.H - 1, Math.ceil((Math.max(az, bz) + reach - R.Z0) / LS));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * R.W + i;
    const d = segDist(ax, az, bx, bz, R.X0 + (i + 0.5) * LS, R.Z0 + (j + 0.5) * LS) - hw;
    if (d < R.walk[k]) { R.walk[k] = d; R.led[k] = led; }
  }
  stampCoarse(R, (x, z) => segDist(ax, az, bx, bz, x, z) - hw, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
}
function stampCoarse(R, dist, x0, z0, x1, z1) {
  const i0 = Math.max(0, Math.floor((x0 - REACH - R.X0) / CS)), i1 = Math.min(R.cW - 1, Math.ceil((x1 + REACH - R.X0) / CS));
  const j0 = Math.max(0, Math.floor((z0 - REACH - R.Z0) / CS)), j1 = Math.min(R.cH - 1, Math.ceil((z1 + REACH - R.Z0) / CS));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * R.cW + i;
    const d = Math.max(dist(R.X0 + (i + 0.5) * CS, R.Z0 + (j + 0.5) * CS), 0);
    if (d < R.lit[k]) R.lit[k] = d;
  }
}
function stampDisc(R, arr, cx, cz, rad) {
  const reach = rad.max + FAR;
  const i0 = Math.max(0, Math.floor((cx - reach - R.X0) / LS)), i1 = Math.min(R.W - 1, Math.ceil((cx + reach - R.X0) / LS));
  const j0 = Math.max(0, Math.floor((cz - reach - R.Z0) / LS)), j1 = Math.min(R.H - 1, Math.ceil((cz + reach - R.Z0) / LS));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = R.X0 + (i + 0.5) * LS - cx, z = R.Z0 + (j + 0.5) * LS - cz;
    const d = Math.hypot(x, z) - rad.at(Math.atan2(z, x));
    const k = j * R.W + i;
    if (d < arr[k]) arr[k] = d;
  }
  stampCoarse(R, (x, z) => Math.hypot(x - cx, z - cz) - rad.at(Math.atan2(z - cz, x - cx)), cx - rad.max, cz - rad.max, cx + rad.max, cz + rad.max);
}
const circle = (r) => ({ max: r, at: () => r });

// light pool on flat ground: lamp at height h, soft cut-off at radius rr, exponent pw of the h^2/(d^2+h^2) falloff
function addPool(R, x, z, col, I, h, rr, pw) {
  const i0 = Math.max(0, Math.floor((x - rr - R.X0) / LS)), i1 = Math.min(R.W - 1, Math.ceil((x + rr - R.X0) / LS));
  const j0 = Math.max(0, Math.floor((z - rr - R.Z0) / LS)), j1 = Math.min(R.H - 1, Math.ceil((z + rr - R.Z0) / LS));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const dx = R.X0 + (i + 0.5) * LS - x, dz = R.Z0 + (j + 0.5) * LS - z, d2 = dx * dx + dz * dz;
    if (d2 > rr * rr) continue;
    const q = d2 / (rr * rr), win = (1 - q * q) * (1 - q * q);
    const e = I * Math.pow(h * h / (d2 + h * h), pw) * win;
    const k = (j * R.W + i) * 3;
    R.light[k] += col[0] * e; R.light[k + 1] += col[1] * e; R.light[k + 2] += col[2] * e;
  }
}

// polyline helpers
function polyLen(P) { let L = 0; for (let i = 2; i < P.length; i += 2) L += Math.hypot(P[i] - P[i - 2], P[i + 1] - P[i - 1]); return L; }
// points every `sp` metres along a polyline (starting at `s0`), with the unit tangent
function along(P, sp, s0, fn) {
  let acc = 0, next = s0;
  for (let i = 2; i < P.length; i += 2) {
    const ax = P[i - 2], az = P[i - 1], bx = P[i], bz = P[i + 1], L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-6) continue;
    while (next <= acc + L) {
      const t = (next - acc) / L;
      fn(ax + (bx - ax) * t, az + (bz - az) * t, (bx - ax) / L, (bz - az) / L, next);
      next += sp;
    }
    acc += L;
  }
}

// ------------------------------------------------------------------ layout

// ctx: { world, coverStyle(x, z) -> style of park land (0 = none), fieldWater, slopeAt, axis, river: {pts, s}, sA, sB,
//        STYLE, silk, silkAvenues }
export function buildParkLayout(ctx) {
  const t0 = performance.now();
  const { world, STYLE } = ctx;
  const H = (x, z) => world.heightAt(x, z);
  const R6 = rng(6262);
  const out = { regions: [], walks: [], plazas: [], ponds: [], lamps: [], posts: [], gates: [], pavilions: [], stats: {} };

  // ---- regions: bounding boxes of the park land of each style
  const bbs = {};
  ctx.forEachPark((x, z, st) => {
    if (st !== STYLE.LANTERN && st !== STYLE.SILK) return;
    const b = bbs[st] || (bbs[st] = [1e9, 1e9, -1e9, -1e9]);
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], z); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], z);
  });
  const regions = {};
  let off = 0, atlasH = 1;
  for (const st of [STYLE.LANTERN, STYLE.SILK]) {
    if (!bbs[st]) continue;
    const R = makeRegion(st, bbs[st]);
    R.off = off; off += R.W; atlasH = Math.max(atlasH, R.H);
    for (let j = 0; j < R.H; j++) for (let i = 0; i < R.W; i++) R.mask[j * R.W + i] = ctx.coverStyle(R.X0 + (i + 0.5) * LS, R.Z0 + (j + 0.5) * LS) === st ? 1 : 0;
    for (let j = 0; j < R.cH; j++) for (let i = 0; i < R.cW; i++) R.cMask[j * R.cW + i] = ctx.coverStyle(R.X0 + (i + 0.5) * CS, R.Z0 + (j + 0.5) * CS) === st ? 1 : 0;
    regions[st] = R;
    out.regions.push(R);
  }
  out.atlasW = Math.max(off, 1); out.atlasH = atlasH;
  const inMask = (R, x, z) => { const k = fi(R, x, z); return k >= 0 && R.mask[k] === 1; };
  const addWalk = (R, pts, kind) => {
    if (pts.length < 6 || polyLen(pts) < 16) return null;
    const [hw, led] = KIND[kind];
    for (let i = 2; i < pts.length; i += 2) stampSeg(R, pts[i - 2], pts[i - 1], pts[i], pts[i + 1], hw, led);
    const w = { pts: Float32Array.from(pts), kind, style: R.style };
    out.walks.push(w);
    return w;
  };
  // splits a sampled curve [x, z, ...] into pieces inside the region's park land
  const pieces = (R, pts, cb) => {
    let cur = [];
    for (let i = 0; i < pts.length; i += 2) {
      if (inMask(R, pts[i], pts[i + 1])) cur.push(pts[i], pts[i + 1]);
      else { if (cur.length) cb(cur); cur = []; }
    }
    if (cur.length) cb(cur);
  };

  if (regions[STYLE.LANTERN]) lanternLayout(ctx, regions[STYLE.LANTERN], out, { H, R6, inMask, addWalk, pieces });
  if (regions[STYLE.SILK]) silkLayout(ctx, regions[STYLE.SILK], out, { H, R6, inMask, addWalk, pieces });

  // ---- secondary paths wherever lawn is still far from a lit feature, then lamps, lanterns and the base light map
  for (const R of out.regions) secondaryPaths(R, out, { H, R6, inMask, addWalk, isStreet: ctx.isStreet });
  for (const R of out.regions) {
    lampsAndPosts(R, out, inMask);
    out.stats[R.style === STYLE.LANTERN ? 'lantern' : 'silk'] = coverage(R);
  }
  out.baseLight = out.regions.map((R) => R.light.slice());
  out.stats.walks = out.walks.length;
  out.stats.walkKm = +(out.walks.reduce((s, w) => s + polyLen(w.pts), 0) / 1000).toFixed(1);
  out.stats.plazas = out.plazas.length; out.stats.ponds = out.ponds.length; out.stats.lamps = out.lamps.length;
  out.stats.posts = out.posts.length; out.stats.gates = out.gates.length; out.stats.pavilions = out.pavilions.length;
  out.stats.ms = Math.round(performance.now() - t0);

  // ---- queries for the tree placement and the structures
  out.regionAt = (x, z) => out.regions.find((R) => { const k = fi(R, x, z); return k >= 0 && R.mask[k]; }) || null;
  out.sample = (x, z) => {
    const R = out.regionAt(x, z);
    if (!R) return null;
    const k = fi(R, x, z);
    return { walk: R.walk[k], plaza: R.plaza[k], pond: R.pond[k], style: R.style };
  };
  // distance from a park point to the nearest lit walk, plaza or pond edge (coarse grid, exact up to 44 m)
  out.litDist = (x, z) => {
    const R = out.regionAt(x, z);
    if (!R) return null;
    const i = Math.floor((x - R.X0) / CS), j = Math.floor((z - R.Z0) / CS);
    return i < 0 || j < 0 || i >= R.cW || j >= R.cH ? null : R.lit[j * R.cW + i];
  };
  out.bakeTrees = (trees) => bakeTrees(out, trees);
  out.texData = (which) => texData(out, which);
  return out;
}

// ------------------------------------------------------------------ Lantern Park

function lanternLayout(ctx, R, out, h) {
  const { world, axis } = ctx;
  const { H, R6, inMask, addWalk, pieces } = h;
  // inland direction: perpendicular to the river chord, toward the park
  let nrm = [-axis[1], axis[0]];
  {
    let sx = 0, sz = 0, n = 0;
    for (let k = 0; k < R.mask.length; k += 7) if (R.mask[k]) { sx += R.X0 + (k % R.W + 0.5) * LS; sz += R.Z0 + (Math.floor(k / R.W) + 0.5) * LS; n++; }
    sx /= n; sz /= n;
    if (ctx.fieldWater(sx + nrm[0] * 10, sz + nrm[1] * 10) < ctx.fieldWater(sx - nrm[0] * 10, sz - nrm[1] * 10)) nrm = [-nrm[0], -nrm[1]];
  }
  const aOf = (x, z) => x * axis[0] + z * axis[1];
  let aMin = 1e9, aMax = -1e9;
  for (let k = 0; k < R.mask.length; k++) if (R.mask[k]) { const a = aOf(R.X0 + (k % R.W + 0.5) * LS, R.Z0 + (Math.floor(k / R.W) + 0.5) * LS); aMin = Math.min(aMin, a); aMax = Math.max(aMax, a); }
  // water-distance profiles: for every 2 m of a, march inland from the river centre line
  const P = ctx.river.pts, S = ctx.river.s;
  const NA = Math.ceil((aMax - aMin) / 2) + 1, NT = 450;
  const sx = new Float32Array(NA), sz = new Float32Array(NA), prof = new Float32Array(NA * NT);
  for (let ia = 0; ia < NA; ia++) {
    const a = aMin + ia * 2;
    // river centre point with this a (inside the reach between the two bridges, with a margin)
    let px = null, pz = null;
    for (let i = 0; i < P.length - 1; i++) {
      if (S[i + 1] < ctx.sA - 400 || S[i] > ctx.sB + 400) continue;
      const a0 = aOf(P[i][0], P[i][1]), a1 = aOf(P[i + 1][0], P[i + 1][1]);
      if ((a - a0) * (a - a1) > 0 || a0 === a1) continue;
      const t = (a - a0) / (a1 - a0);
      px = P[i][0] + (P[i + 1][0] - P[i][0]) * t; pz = P[i][1] + (P[i + 1][1] - P[i][1]) * t;
      break;
    }
    if (px === null) { px = a * axis[0]; pz = a * axis[1]; }
    sx[ia] = px; sz[ia] = pz;
    let run = -1e9;
    for (let it = 0; it < NT; it++) { run = Math.max(run, ctx.fieldWater(px + nrm[0] * it * 2, pz + nrm[1] * it * 2)); prof[ia * NT + it] = run; }
  }
  // world point with river coordinate a and water distance c (null beyond the profile)
  const pointAt = (a, c) => {
    const fa = Math.min(Math.max((a - aMin) / 2, 0), NA - 1.001), ia = fa | 0, u = fa - ia;
    const tOf = (col) => {
      const o = col * NT;
      if (prof[o + NT - 1] < c) return null;
      let lo = 0, hi = NT - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (prof[o + m] < c) lo = m; else hi = m; }
      const c0 = prof[o + lo], c1 = prof[o + hi];
      return (lo + (c1 > c0 ? (c - c0) / (c1 - c0) : 0)) * 2;
    };
    const t0 = tOf(ia), t1 = tOf(ia + 1);
    if (t0 === null || t1 === null) return null;
    const t = t0 + (t1 - t0) * u;
    return [sx[ia] + (sx[ia + 1] - sx[ia]) * u + nrm[0] * t, sz[ia] + (sz[ia + 1] - sz[ia]) * u + nrm[1] * t];
  };
  const curve = (n, fn) => { const pts = []; for (let i = 0; i <= n; i++) { const q = fn(i); if (q) pts.push(q[0], q[1]); else if (pts.length) break; } return pts; };

  // ---- river walk and meandering upper walks (every ~85 m of water distance)
  const c0 = (a) => 34 + 10 * Math.sin(a / 46);
  const levels = [(a) => c0(a)];
  for (let i = 1; i <= 5; i++) levels.push((a) => 34 + 85 * i + 12 * Math.sin(a / 60 + 2.1 * i) + 5 * Math.sin(a / 21 + 1.3 * i));
  const NA2 = Math.ceil((aMax - aMin) / 2);
  levels.forEach((f, li) => {
    const pts = []; for (let i = 0; i <= NA2; i++) { const a = aMin + i * 2, q = pointAt(a, f(a)); if (q) pts.push(q[0], q[1]); else { pieces(R, pts, (p) => addWalk(R, p, li ? 'upper' : 'river')); pts.length = 0; } }
    pieces(R, pts, (p) => addWalk(R, p, li ? 'upper' : 'river'));
  });

  // ---- cross walks: hashed spacing 80-160 m, curved (sine offset with a phase from the walk index)
  const cross = [];
  for (let a = aMin + 40 + 60 * R6(), k = 0; a < aMax - 30; k++) {
    const A = 9 + 7 * hash1(k * 3 + 1), lam = 34 + 16 * hash1(k * 3 + 2), ph = k * 2.39;
    const aAt = (c) => a + A * Math.sin(c / lam + ph) + 3.5 * Math.sin(c / 17 + ph * 1.7);
    const cs = c0(aAt(34));
    const pts = curve(240, (i) => { const c = cs + i * 2; return pointAt(aAt(c), c); });
    const ws = [];
    pieces(R, pts, (p) => { const w = addWalk(R, p, 'cross'); if (w) ws.push(w); });
    if (ws.length) cross.push({ k, a, aAt, ws });
    a += 80 + 80 * hash1(k * 7 + 5);
  }

  // ---- plazas: flattest ground within 30 m of each junction with the river walk (full circles), plus one at an
  // upper-walk junction of every other cross walk; a pavilion stands on each
  const flattest = (jx, jz, r) => {
    let best = null;
    for (let dx = -30; dx <= 30; dx += 3) for (let dz = -30; dz <= 30; dz += 3) {
      if (dx * dx + dz * dz > 900) continue;
      const x = jx + dx, z = jz + dz;
      let hmin = 1e9, hmax = -1e9, ok = inMask(R, x, z) && ctx.fieldWater(x, z) > r + 10;
      for (let q = 0; q < 12 && ok; q++) for (const f of [1, 0.55]) {
        const px = x + Math.cos(q * 0.5236) * r * f, pz = z + Math.sin(q * 0.5236) * r * f;
        if (!inMask(R, px, pz)) { ok = false; break; }
        const y = H(px, pz); hmin = Math.min(hmin, y); hmax = Math.max(hmax, y);
      }
      if (!ok) continue;
      const score = (hmax - hmin) + Math.hypot(dx, dz) * 0.02;
      if (!best || score < best.score) best = { x, z, score, y: (hmin + hmax) / 2 };
    }
    return best;
  };
  const plazaAt = (jx, jz, r, kind) => {
    const p = flattest(jx, jz, r);
    if (!p) return;
    stampDisc(R, R.plaza, p.x, p.z, circle(r));
    if (Math.hypot(p.x - jx, p.z - jz) > r - 3) addWalk(R, [jx, jz, (jx + p.x) / 2, (jz + p.z) / 2, p.x, p.z], 'link');
    out.plazas.push({ x: p.x, z: p.z, y: p.y, r, kind, style: R.style });
    out.pavilions.push({ x: p.x, z: p.z, y: p.y, r: kind === 'river' ? 3.8 : 3.0, sides: kind === 'river' ? 8 : 6, light: kind === 'river' });
  };
  for (const cw of cross) {
    const w = cw.ws[0];
    plazaAt(w.pts[0], w.pts[1], 14, 'river');
    if (cw.k % 2 === 0) {
      const li = 1 + (hash1(cw.k * 11) < 0.5 ? 0 : 1);
      const c = 34 + 85 * li;
      const q = pointAt(cw.aAt(c), c);
      if (q && inMask(R, q[0], q[1])) plazaAt(q[0], q[1], 10, 'upper');
    }
    // paifang gate where the cross walk reaches the inland edge of the park
    const last = cw.ws[cw.ws.length - 1].pts, n = last.length;
    const ex = last[n - 2], ez = last[n - 1];
    if (ctx.fieldWater(ex, ez) > 110) {
      const dx = ex - last[n - 6], dz = ez - last[n - 5], l = Math.hypot(dx, dz) || 1;
      out.gates.push({ x: ex - dx / l * 3, z: ez - dz / l * 3, y: H(ex - dx / l * 3, ez - dz / l * 3), dx: dx / l, dz: dz / l, span: 6.2 });
    }
  }

  // ---- lotus ponds in low ground: hollows at least 0.6 m below the mean of the ground 40 m around, and no more
  // than 0.4 m above the lowest point 20 m around (closed or nearly closed), away from walks and plazas
  const cand = [];
  for (let z = R.Z0; z < R.Z0 + R.H * LS; z += 6) for (let x = R.X0; x < R.X0 + R.W * LS; x += 6) {
    if (!inMask(R, x, z) || ctx.fieldWater(x, z) < 30) continue;
    const y = H(x, z);
    let lo = 1e9, mean = 0;
    for (let q = 0; q < 12; q++) {
      lo = Math.min(lo, H(x + Math.cos(q * 0.5236) * 20, z + Math.sin(q * 0.5236) * 20));
      mean += H(x + Math.cos(q * 0.5236) * 40, z + Math.sin(q * 0.5236) * 40) / 12;
    }
    if (mean - y >= 0.6 && y <= lo + 0.4) cand.push({ x, z, y, depth: mean - y });
  }
  cand.sort((p, q) => q.depth - p.depth);
  for (const c of cand) {
    const k = fi(R, c.x, c.z);
    const clear = Math.min(R.walk[k], R.plaza[k]);
    let r = Math.min(9 + 12 * Math.min(c.depth / 2, 1), clear - 5);
    if (r < 7 || out.ponds.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < p.r + r + 30)) continue;
    // keep the whole shape inside the park and off the walks
    let ok = true;
    for (let q = 0; q < 16 && ok; q++) {
      const px = c.x + Math.cos(q * 0.3927) * (r + 4), pz = c.z + Math.sin(q * 0.3927) * (r + 4);
      const kk = fi(R, px, pz);
      ok = kk >= 0 && R.mask[kk] && R.walk[kk] > 2 && R.plaza[kk] > 2 && ctx.fieldWater(px, pz) > 12;
    }
    if (!ok) continue;
    const p1 = R6() * 6.28, p2 = R6() * 6.28, rad = { max: r * 1.25, at: (t) => r * (1 + 0.14 * Math.sin(3 * t + p1) + 0.08 * Math.sin(5 * t + p2)) };
    stampDisc(R, R.pond, c.x, c.z, rad);
    out.ponds.push({ x: c.x, z: c.z, y: c.y, r, style: R.style });
    if (out.ponds.length >= 14) break;
  }
}

// ------------------------------------------------------------------ Silk Road Garden

function silkLayout(ctx, R, out, h) {
  const { addWalk, pieces } = h;
  const S = ctx.silk;
  if (!S) return;
  stampDisc(R, R.plaza, S.x, S.z, circle(S.r));
  out.plazas.push({ x: S.x, z: S.z, y: h.H(S.x, S.z), r: S.r, kind: 'star', style: R.style });
  // ring walks every 35 m out to the edge of the garden, 16 straight spokes (every other one from the second ring)
  for (const rr of [80, 115, 150, 185, 220, 255, 290, 325]) {
    const n = Math.ceil(rr * Math.PI * 2 / 2.5), pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n * Math.PI * 2; pts.push(S.x + Math.cos(t) * rr, S.z + Math.sin(t) * rr); }
    pieces(R, pts, (p) => addWalk(R, p, 'ring'));
  }
  for (let k = 0; k < 16; k++) {
    const t = k / 16 * Math.PI * 2, r0 = k % 2 ? 80 : S.r - 1, pts = [];
    for (let r = r0; r <= 340; r += 2.5) pts.push(S.x + Math.cos(t) * r, S.z + Math.sin(t) * r);
    pieces(R, pts, (p) => addWalk(R, p, 'spoke'));
  }
  for (const v of ctx.silkAvenues) {
    const L = Math.hypot(v.bx - v.ax, v.bz - v.az), n = Math.ceil(L / 2.5), pts = [];
    for (let i = 0; i <= n; i++) { const x = v.ax + (v.bx - v.ax) * i / n, z = v.az + (v.bz - v.az) * i / n; if (Math.hypot(x - S.x, z - S.z) > S.r - 1) pts.push(x, z); }
    pieces(R, pts, (p) => addWalk(R, p, 'avenue'));
  }
}

// ------------------------------------------------------------------ secondary paths (lawn coverage)

// Share of the region's lawn (park land that is not walk, plaza or pond) farther than PARK_GATE.dist from a lit walk,
// plaza or pond edge, measured on the coarse grid.
function coverage(R) {
  let lawn = 0, far = 0;
  for (let j = 0; j < R.cH; j++) for (let i = 0; i < R.cW; i++) {
    const k = j * R.cW + i;
    if (!R.cMask[k]) continue;
    const f = fi(R, R.X0 + (i + 0.5) * CS, R.Z0 + (j + 0.5) * CS);
    if (f < 0 || R.walk[f] < 0 || R.plaza[f] < 0 || R.pond[f] < 0) continue;
    lawn++;
    if (R.lit[k] > PARK_GATE.dist) far++;
  }
  return { lawnM2: lawn * CS * CS, farM2: far * CS * CS, farShare: +(far / Math.max(lawn, 1)).toFixed(4) };
}

function secondaryPaths(R, out, h) {
  const { inMask, addWalk, R6 } = h;
  const onWalk = (x, z) => { const k = fi(R, x, z); return k >= 0 && (R.walk[k] < 0 || R.plaza[k] < 0); };
  const inPond = (x, z) => { const k = fi(R, x, z); return k >= 0 && R.pond[k] < 2; };
  const meander = R.style === 1;
  let added = 0;
  for (let it = 0; it < 600; it++) {
    if (it % 8 === 0 && coverage(R).farShare <= PARK_GATE.share * 0.8) break;
    // the lawn point farthest from any lit feature
    let best = -1, bd = PARK_GATE.dist;
    for (let k = 0; k < R.lit.length; k++) if (R.cMask[k] && !R.skip[k] && R.lit[k] > bd) { bd = R.lit[k]; best = k; }
    if (best < 0) break;
    const fx = R.X0 + (best % R.cW + 0.5) * CS, fz = R.Z0 + (Math.floor(best / R.cW) + 0.5) * CS;
    // shortest straight reach to a walk in 32 directions; then the best one at least 100 degrees away from it
    const hits = [];
    for (let q = 0; q < 32; q++) {
      const t = q / 32 * Math.PI * 2, dx = Math.cos(t), dz = Math.sin(t);
      for (let s = 2; s < 150; s += 2) {
        const x = fx + dx * s, z = fz + dz * s;
        // a path may also end at a city street that bounds the park (an entrance from the sidewalk)
        if (!inMask(R, x, z)) { if (h.isStreet(x, z) && s > 6) hits.push({ t, s: s - 2, x: fx + dx * (s - 2), z: fz + dz * (s - 2) }); break; }
        if (inPond(x, z)) break;
        if (onWalk(x, z)) { hits.push({ t, s, x, z }); break; }
      }
    }
    hits.sort((p, q) => p.s - q.s);
    const h1 = hits[0];
    const h2 = h1 && hits.find((p) => Math.abs(Math.atan2(Math.sin(p.t - h1.t), Math.cos(p.t - h1.t))) > 1.75);
    let ok = false;
    if (h1) {
      const ctrl = h2 ? [[h1.x, h1.z], [fx, fz], [h2.x, h2.z]] : [[h1.x, h1.z], [fx, fz]];
      for (const amp of meander ? [4.5, 0] : [0]) {
        const pts = curvePath(ctrl, amp, R6() * 6.28, 26 + 14 * R6());
        let valid = true;
        for (let i = 0; i < pts.length && valid; i += 2) valid = inMask(R, pts[i], pts[i + 1]) && !inPond(pts[i], pts[i + 1]);
        if (!valid) continue;
        addWalk(R, pts, 'path');
        if (!h2) {
          // a spur ends at a small round terrace
          stampDisc(R, R.plaza, fx, fz, circle(4.5));
          out.plazas.push({ x: fx, z: fz, y: h.H(fx, fz), r: 4.5, kind: 'terrace', style: R.style });
        }
        ok = true; added++;
        break;
      }
    }
    if (!ok) {
      // nothing reachable from here: leave this spot (and its surroundings) as lawn
      const ci = best % R.cW, cj = Math.floor(best / R.cW);
      for (let j = cj - 3; j <= cj + 3; j++) for (let i = ci - 3; i <= ci + 3; i++) if (i >= 0 && j >= 0 && i < R.cW && j < R.cH) R.skip[j * R.cW + i] = 1;
    }
  }
  out.stats['paths' + R.style] = added;
}

// Smooth path through control points (Catmull-Rom), with a sideways meander of amplitude amp (zero at both ends),
// sampled every 2 m.
function curvePath(ctrl, amp, ph, lam) {
  const P = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]];
  const raw = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 2));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      raw.push(f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]));
    }
  }
  if (!amp) return raw;
  const L = polyLen(raw), outp = [];
  let s = 0;
  for (let i = 0; i < raw.length; i += 2) {
    if (i) s += Math.hypot(raw[i] - raw[i - 2], raw[i + 1] - raw[i - 1]);
    const j = Math.min(Math.max(i, 2), raw.length - 2);
    let tx = raw[j] - raw[j - 2], tz = raw[j + 1] - raw[j - 1];
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const m = amp * Math.sin(s / lam * 6.283 + ph) * Math.sin(Math.PI * s / Math.max(L, 1));
    outp.push(raw[i] - tz * m, raw[i + 1] + tx * m);
  }
  return outp;
}

// ------------------------------------------------------------------ lamps, lantern posts, light map

const WARM = [1.0, 0.74, 0.46], COOL = [0.78, 0.94, 1.0], RED = [1.0, 0.24, 0.08];
export const PARK_LIGHTS = { lamp: 3.0, lantern: 2.2, tree: 0.9, plaza: 2.5 };

function lampsAndPosts(R, out, inMask) {
  const L = PARK_LIGHTS;
  const lantern = R.style === 1;
  const near = (arr, x, z, d) => arr.some((p) => Math.abs(p.x - x) < d && Math.abs(p.z - z) < d && Math.hypot(p.x - x, p.z - z) < d);
  const lamps = [], posts = [];
  const okSpot = (x, z) => { const k = fi(R, x, z); return k >= 0 && R.mask[k] && bil(R, R.walk, x, z) > 0.25 && bil(R, R.plaza, x, z) > 0.5 && bil(R, R.pond, x, z) > 1; };
  for (const w of out.walks) {
    if (w.style !== R.style) continue;
    const [hw, , lan, sp] = KIND[w.kind];
    let side = 1;
    along(w.pts, sp, sp * 0.5, (x, z, tx, tz) => {
      const px = x - tz * side * (hw + 0.7), pz = z + tx * side * (hw + 0.7);
      side = -side;
      if (!okSpot(px, pz) || near(lamps, px, pz, 11)) return;
      lamps.push({ x: px, z: pz, y: 0, style: R.style });
    });
    if (!lan || !lantern) continue;
    side = 1;
    along(w.pts, POST_SP, 3, (x, z, tx, tz) => {
      const px = x - tz * side * (hw + 0.45), pz = z + tx * side * (hw + 0.45);
      const s = side; side = -side;
      if (!okSpot(px, pz) || near(lamps, px, pz, 2.5) || near(posts, px, pz, 3)) return;
      posts.push({ x: px, z: pz, y: 0, nx: tz * s, nz: -tx * s });
    });
  }
  // a ring of lantern posts around each Lantern Park plaza (about every 8 m, lanterns hanging outward)
  if (lantern) for (const pl of out.plazas) {
    if (pl.style !== R.style || (pl.kind !== 'river' && pl.kind !== 'upper')) continue;
    const rr = pl.r + 0.8, n = Math.max(6, Math.round(rr * Math.PI * 2 / 8));
    for (let q = 0; q < n; q++) {
      const t = (q + 0.5) / n * Math.PI * 2, cx = Math.cos(t), cz = Math.sin(t);
      const px = pl.x + cx * rr, pz = pl.z + cz * rr;
      const k = fi(R, px, pz);
      if (k < 0 || !R.mask[k] || bil(R, R.walk, px, pz) < 0.4 || near(posts, px, pz, 2.5)) continue;
      posts.push({ x: px, z: pz, y: 0, nx: cx, nz: cz });
    }
  }
  for (const p of lamps) { out.lamps.push(p); addPool(R, p.x, p.z, lantern ? WARM : COOL, L.lamp, LAMP_H, LAMP_R, 0.95); }
  for (const p of posts) { out.posts.push(p); addPool(R, p.x + p.nx * 0.5, p.z + p.nz * 0.5, RED, L.lantern, 2.6, 8, 1.2); }
  for (const pl of out.plazas) if (pl.style === R.style && pl.kind !== 'terrace') addPool(R, pl.x, pl.z, lantern ? WARM : COOL, L.plaza, 4, pl.r + 6, 0.6);
  for (const g of out.gates) if (R.style === 1) addPool(R, g.x, g.z, RED, L.lantern * 1.6, 3.5, 10, 1.0);
}

// glow colours of uplit trees (index as in vegetation.js glowColor)
const GLOW = [null, [1.0, 0.66, 0.32], [0.62, 1.0, 0.86], [0.35, 0.88, 1.0], [1.0, 0.42, 0.85], [1.0, 0.84, 0.66]];
function bakeTrees(out, trees) {
  out.regions.forEach((R, i) => R.light.set(out.baseLight[i]));
  for (const t of trees) {
    const g = Math.round((t[4] % 1) * 8);
    if (!g) continue;
    const R = out.regionAt(t[0], t[2]);
    if (!R) continue;
    const rr = 5, I = PARK_LIGHTS.tree, col = GLOW[g] || GLOW[1];
    const i0 = Math.max(0, Math.floor((t[0] - rr - R.X0) / LS)), i1 = Math.min(R.W - 1, Math.ceil((t[0] + rr - R.X0) / LS));
    const j0 = Math.max(0, Math.floor((t[2] - rr - R.Z0) / LS)), j1 = Math.min(R.H - 1, Math.ceil((t[2] + rr - R.Z0) / LS));
    for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
      const dx = R.X0 + (ii + 0.5) * LS - t[0], dz = R.Z0 + (j + 0.5) * LS - t[2], q = (dx * dx + dz * dz) / (rr * rr);
      if (q >= 1) continue;
      const e = I * (1 - q) * (1 - q), k = (j * R.W + ii) * 3;
      R.light[k] += col[0] * e; R.light[k + 1] += col[1] * e; R.light[k + 2] += col[2] * e;
    }
  }
}

// rgba16float texel data of the atlas: 'layout' (walk, plaza, pond distances, LED flag) or 'light'
function texData(out, which) {
  const W = out.atlasW, Hh = out.atlasH, d = new Uint16Array(W * Hh * 4);
  const farH = half(FAR);
  for (let k = 0; k < W * Hh; k++) if (which === 'layout') { d[k * 4] = farH; d[k * 4 + 1] = farH; d[k * 4 + 2] = farH; }
  for (const R of out.regions) for (let j = 0; j < R.H; j++) for (let i = 0; i < R.W; i++) {
    const k = j * R.W + i, o = (j * W + R.off + i) * 4;
    if (which === 'layout') { d[o] = half(R.walk[k]); d[o + 1] = half(R.plaza[k]); d[o + 2] = half(R.pond[k]); d[o + 3] = half(R.led[k]); }
    else { d[o] = half(R.light[k * 3]); d[o + 1] = half(R.light[k * 3 + 1]); d[o + 2] = half(R.light[k * 3 + 2]); d[o + 3] = half(1); }
  }
  return d;
}
