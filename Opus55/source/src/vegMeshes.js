// Procedural tree meshes for the vegetation module.
// Vertex layout: pos.xyz, normal.xyz, uv.xy, part, sway  (10 floats)
//   part: 0 trunk / culm, 1 opaque foliage core, 2 alpha-tested leaf-cluster card (normal = crown normal)
//   sway: 0 at the base .. 1 at the top (wind bend weight)
// Species: 0 broadleaf (camphor-like), 1 pine, 2 bamboo clump, 3 weeping willow. LODs: 0 full, 1 low, 2 far.

import { rng } from './math.js';

const STRIDE = 10;

function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a) { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

class MeshBuilder {
  constructor() { this.v = []; this.i = []; this.i2 = []; }
  get count() { return this.v.length / STRIDE; }
  vert(p, n, uv, part, sway) { this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], uv[0], uv[1], part, sway); return this.count - 1; }
  tri(a, b, c) { this.i.push(a, b, c); }
  // tapered cylinder from p0 (radius r0) to p1 (radius r1)
  tube(p0, p1, r0, r1, seg, part, sw0, sw1) {
    const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const ax = norm(d);
    const t = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm(cross(ax, t)), w = cross(ax, u);
    const base = this.count;
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const n = [u[0] * c + w[0] * s, u[1] * c + w[1] * s, u[2] * c + w[2] * s];
      this.vert([p0[0] + n[0] * r0, p0[1] + n[1] * r0, p0[2] + n[2] * r0], n, [k / seg, 0], part, sw0);
      this.vert([p1[0] + n[0] * r1, p1[1] + n[1] * r1, p1[2] + n[2] * r1], n, [k / seg, 1], part, sw1);
    }
    for (let k = 0; k < seg; k++) { const a = base + k * 2; this.tri(a, a + 2, a + 1); this.tri(a + 1, a + 2, a + 3); }
  }
  // lumpy blob (icosphere) with noise displacement
  blob(c, rx, ry, rz, sub, R, part, swayAt, lump = 0.22) {
    const { pos, idx } = icosphere(sub);
    const base = this.count;
    const ph = [R() * 10, R() * 10, R() * 10];
    for (let k = 0; k < pos.length; k += 3) {
      const x = pos[k], y = pos[k + 1], z = pos[k + 2];
      const n = 1 + lump * (Math.sin(x * 3.1 + ph[0]) * Math.sin(y * 2.7 + ph[1]) * Math.sin(z * 3.3 + ph[2]) + 0.4 * Math.sin(x * 7 + y * 5 + ph[1]));
      const p = [c[0] + x * rx * n, c[1] + y * ry * n, c[2] + z * rz * n];
      this.vert(p, norm([x / rx, y / ry, z / rz]), [x, z], part, swayAt(p[1]));
    }
    for (let k = 0; k < idx.length; k += 3) this.tri(base + idx[k], base + idx[k + 1], base + idx[k + 2]);
  }
  cone(c, r, h, seg, part, swayAt, droop = 0, R = Math.random) {
    const base = this.count;
    const top = this.vert([c[0], c[1] + h, c[2]], [0, 1, 0], [0, 0], part, swayAt(c[1] + h));
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2 + 0.3, x = Math.cos(a), z = Math.sin(a);
      const rr = r * (k % 2 ? 0.78 : 1.0) * (0.9 + 0.2 * R());   // jagged branch tips
      this.vert([c[0] + x * rr, c[1] - droop * (k % 2 ? 0.4 : 1), c[2] + z * rr], norm([x * h, r * 0.8, z * h]), [x, z], part, swayAt(c[1]));
    }
    for (let k = 0; k < seg; k++) this.tri(top, base + 2 + k, base + 1 + k);
    const mid = this.vert([c[0], c[1] - droop * 0.3, c[2]], [0, -1, 0], [0, 0], part, swayAt(c[1]));
    for (let k = 0; k < seg; k++) this.tri(mid, base + 1 + k, base + 2 + k);
  }
  // leaf-cluster card: quad at p with half size s, facing direction f; normal = crown normal cn
  card(p, s, f, cn, swayAt, sx = 1, sy = 1) {
    const t = Math.abs(f[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
    const u = norm(cross(f, t)), v = cross(f, u);
    const b = this.count;
    for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const q = [p[0] + (u[0] * a * sx + v[0] * c * sy) * s, p[1] + (u[1] * a * sx + v[1] * c * sy) * s, p[2] + (u[2] * a * sx + v[2] * c * sy) * s];
      this.vert(q, cn, [a, c], 2, swayAt(q[1]));
    }
    this.i2.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  // crown of leaf cards scattered in an ellipsoid (center c, radii r)
  crown(c, r, n, size, R, swayAt) {
    for (let k = 0; k < n; k++) {
      // stratified directions over the sphere, biased upward
      const y = 1 - 2 * (k + R()) / n, phi = k * 2.39996 + R() * 0.5;
      const rr = Math.sqrt(Math.max(0, 1 - y * y));
      const dir = [Math.cos(phi) * rr, y * 0.85 + 0.15, Math.sin(phi) * rr];
      const d = 0.55 + 0.4 * R();
      const p = [c[0] + dir[0] * r[0] * d, c[1] + dir[1] * r[1] * d, c[2] + dir[2] * r[2] * d];
      const f = norm([dir[0] + (R() - 0.5) * 1.2, dir[1] + (R() - 0.5) * 1.2 + 0.3, dir[2] + (R() - 0.5) * 1.2]);
      const cn = norm([(p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1] + 0.2, (p[2] - c[2]) / r[2]]);
      this.card(p, size * (0.8 + 0.4 * R()), f, cn, swayAt);
    }
  }
  // hanging strand of willow leaves (card strip with leaf mask)
  strand(p, len, wdt, swayAt) {
    const segs = 3; const base = this.count;
    const out = norm([p[0], 0, p[2]]);
    const tx = -out[2] * wdt, tz = out[0] * wdt;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs, y = p[1] - len * t;
      const q = [p[0] + out[0] * 0.6 * t * t, y, p[2] + out[2] * 0.6 * t * t];
      const cn = norm([out[0], 0.3, out[2]]);
      this.vert([q[0] - tx, q[1], q[2] - tz], cn, [-1, t * 1.8 - 0.9], 2, swayAt(y) + t * 0.9);
      this.vert([q[0] + tx, q[1], q[2] + tz], cn, [1, t * 1.8 - 0.9], 2, swayAt(y) + t * 0.9);
    }
    for (let k = 0; k < segs; k++) { const a = base + k * 2; this.i2.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  finish() {
    const V = this.v, I = this.i;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * STRIDE, b = I[t + 1] * STRIDE, c = I[t + 2] * STRIDE;
      const cr = cross([V[b] - V[a], V[b + 1] - V[a + 1], V[b + 2] - V[a + 2]], [V[c] - V[a], V[c + 1] - V[a + 1], V[c + 2] - V[a + 2]]);
      const n = [V[a + 3] + V[b + 3] + V[c + 3], V[a + 4] + V[b + 4] + V[c + 4], V[a + 5] + V[b + 5] + V[c + 5]];
      if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) { const s = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = s; }
    }
    return this;   // opaque triangles in this.i, alpha-tested cards in this.i2
  }
}

function icosphere(sub) {
  const t = (1 + Math.sqrt(5)) / 2;
  const pos = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm);
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < sub; s++) {
    const mid = new Map(); const nf = [];
    const m = (a, b) => {
      const k = a < b ? a * 1e5 + b : b * 1e5 + a;
      if (!mid.has(k)) { pos.push(norm([(pos[a][0] + pos[b][0]) / 2, (pos[a][1] + pos[b][1]) / 2, (pos[a][2] + pos[b][2]) / 2])); mid.set(k, pos.length - 1); }
      return mid.get(k);
    };
    for (const [a, b, c] of faces) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    faces = nf;
  }
  return { pos: pos.flat(), idx: faces.flat() };
}

function broadleaf(lod) {
  const M = new MeshBuilder(), R = rng(11 + lod);
  const H = 13; const sw = (y) => Math.max(0, y / H) ** 1.5;
  const cc = [0, 9.0, 0], cr = [4.6, 3.4, 4.6];
  if (lod >= 2) {   // 2: mid-distance (rounder), 3: far ring (cheapest)
    M.blob(cc, cr[0] * 0.92, cr[1] * 0.9, cr[2] * 0.92, 0, R, 1, sw, 0.24);
    return M;
  }
  M.tube([0, -0.5, 0], [0, 7.5, 0], 0.34, 0.2, lod ? 4 : 6, 0, 0, sw(7.5));
  if (lod === 0) {
    M.tube([0, 4.6, 0], [2.4, 8.4, 0.7], 0.15, 0.07, 4, 0, sw(4.6), sw(8.4));
    M.tube([0, 5.2, 0], [-2.0, 8.8, -1.4], 0.14, 0.07, 4, 0, sw(5.2), sw(8.8));
    M.tube([0, 5.8, 0], [0.4, 9.5, 2.2], 0.13, 0.06, 4, 0, sw(5.8), sw(9.5));
    M.blob(cc, cr[0] * 0.8, cr[1] * 0.78, cr[2] * 0.8, 1, R, 1, sw, 0.18);
    M.crown(cc, cr, 22, 2.5, R, sw);
  } else {
    M.blob(cc, cr[0] * 0.82, cr[1] * 0.8, cr[2] * 0.82, 1, R, 1, sw, 0.15);
    M.crown(cc, cr, 6, 3.4, R, sw);
  }
  return M;
}

function pine(lod) {
  const M = new MeshBuilder(), R = rng(21 + lod);
  const H = 14; const sw = (y) => Math.max(0, y / H) ** 1.5;
  if (lod === 2) { M.cone([0, 3, 0], 2.8, 11, 6, 1, sw, 0.4, R); return M; }
  M.tube([0, -0.5, 0], [0, 12, 0], 0.28, 0.08, lod ? 4 : 5, 0, 0, sw(12));
  const tiers = lod ? 3 : 6;
  for (let k = 0; k < tiers; k++) {
    const t = k / tiers;
    const y = 3.2 + t * 8.8, r = 3.3 * (1 - t * 0.78) * (0.9 + R() * 0.2), h = 3.4 - t * 1.1;
    M.cone([0, y, 0], r, h * (lod ? 1.5 : 1), lod ? 8 : 12, 1, sw, 0.7, R);
  }
  return M;
}

function bamboo(lod) {
  const M = new MeshBuilder(), R = rng(31 + lod);
  const H = 10; const sw = (y) => Math.max(0, y / H) ** 1.2;
  if (lod >= 2) {
    M.blob([0, 6.5, 0], 2.2, 3.8, 2.2, 0, R, 1, sw, 0.2);
    return M;
  }
  const n = lod ? 6 : 14;
  for (let k = 0; k < n; k++) {
    const a = R() * Math.PI * 2, r = R() * 1.6, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = 7 + R() * 4, lean = 0.25 + R() * 0.6;
    const top = [x + Math.cos(a) * lean * 1.5, h, z + Math.sin(a) * lean * 1.5];
    M.tube([x, -0.3, z], top, 0.065, 0.035, lod ? 3 : 4, 0, 0, sw(h));
    M.crown([top[0] * 0.8, h - 2.2, top[2] * 0.8], [1.3, 2.4, 1.3], lod ? 3 : 9, lod ? 1.1 : 0.9, R, sw);
  }
  return M;
}

function willow(lod) {
  const M = new MeshBuilder(), R = rng(41 + lod);
  const H = 10; const sw = (y) => Math.max(0, y / H) ** 1.3;
  const cc = [0.2, 7.6, 0];
  if (lod === 2) {
    M.blob([0, 6.2, 0], 3.8, 3.4, 3.8, 1, R, 1, sw, 0.2);
    return M;
  }
  M.tube([0, -0.5, 0], [0.4, 5, 0.2], 0.42, 0.3, lod ? 4 : 6, 0, 0, sw(5));
  if (lod === 0) {
    M.tube([0.4, 4.6, 0.2], [2.4, 7.5, 0.8], 0.18, 0.08, 4, 0, sw(4.6), sw(7.5));
    M.tube([0.4, 4.8, 0.2], [-1.6, 7.8, -1.2], 0.18, 0.08, 4, 0, sw(4.8), sw(7.8));
  }
  M.blob(cc, 2.0, 1.6, 2.0, 0, R, 1, sw, 0.25);
  M.crown(cc, [2.9, 2.0, 2.9], lod ? 5 : 16, 1.3, R, sw);
  const n = lod ? 10 : 44;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + R() * 0.3, r = 1.4 + R() * 2.0;
    M.strand([Math.cos(a) * r, 8.2 - r * 0.35 + R() * 0.6, Math.sin(a) * r], 4.8 + R() * 2.6, lod ? 0.55 : 0.34, sw);
  }
  return M;
}

export const SPECIES = 4;
export const LODS = 4;   // 3 = far-ring clumps (same mesh as LOD 2, separate list so it draws last)

// Builds all meshes into one vertex/index buffer. Returns { verts, idx, draws: [[opaqueFirst, opaqueCount, cardFirst, cardCount] per list], stride }.
export function buildTreeMeshes() {
  const makers = [broadleaf, pine, bamboo, willow];
  const V = [], I = [], draws = [];
  for (let s = 0; s < SPECIES; s++) for (let l = 0; l < LODS; l++) {
    const M = makers[s](s === 0 || s === 2 ? l : Math.min(l, 2)).finish();
    const base = V.length / STRIDE;
    // [opaque first index, opaque count, card first index, card count]
    draws.push([I.length, M.i.length, I.length + M.i.length, M.i2.length]);
    for (const x of M.v) V.push(x);
    for (const x of M.i) I.push(x + base);
    for (const x of M.i2) I.push(x + base);
  }
  return { verts: new Float32Array(V), idx: new Uint32Array(I), draws, stride: STRIDE * 4 };
}
