// Mesh builder for the garden: static geometry with per-vertex material.
// Vertex: pos.xyz, normal.xyz, albedo.rgb, pattern, emissive, uv.xy  (13 floats)
// Patterns: 0 plain, 1 plaster, 2 roof tiles, 3 lacquered wood, 4 stone blocks, 5 glowing lattice window,
//           6 mirror pond, 7 paper lantern, 8 lit pagoda wall, 9 gravel path

export const STRIDE = 13;
export const PAT = { PLAIN: 0, PLASTER: 1, TILE: 2, WOOD: 3, STONE: 4, LATTICE: 5, POND: 6, LANTERN: 7, PAGODA: 8, GRAVEL: 9 };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const V3 = { sub, add, mul, cross, dot, norm };

export class GardenMesh {
  constructor() { this.v = []; this.i = []; this.mat = { col: [0.5, 0.5, 0.5], pat: 0, em: 0 }; this.pieces = []; this._p = null; }
  // pieces: contiguous index ranges with a bounding sphere, culled per frame by distance and view cone
  begin() { this.end(); this._p = { first: this.i.length, v0: this.count }; }
  end(maxDist = 1e9) {
    const p = this._p; if (!p) return; this._p = null;
    const count = this.i.length - p.first; if (!count) return;
    let a = [1e9, 1e9, 1e9], b = [-1e9, -1e9, -1e9];
    for (let k = p.v0; k < this.count; k++) for (let c = 0; c < 3; c++) { const x = this.v[k * STRIDE + c]; if (x < a[c]) a[c] = x; if (x > b[c]) b[c] = x; }
    const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    this.pieces.push({ first: p.first, count, c, r: Math.hypot(b[0] - c[0], b[1] - c[1], b[2] - c[2]), maxDist });
  }
  get count() { return this.v.length / STRIDE; }
  set(col, pat = 0, em = 0) { this.mat = { col, pat, em }; return this; }
  vtx(p, n, uv) { const m = this.mat; this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], m.col[0], m.col[1], m.col[2], m.pat, m.em, uv[0], uv[1]); return this.count - 1; }
  // triangle with winding fixed to face along n
  tri(a, b, c, n) {
    const V = this.v, A = a * STRIDE, B = b * STRIDE, C = c * STRIDE;
    const cr = cross([V[B] - V[A], V[B + 1] - V[A + 1], V[B + 2] - V[A + 2]], [V[C] - V[A], V[C + 1] - V[A + 1], V[C + 2] - V[A + 2]]);
    if (dot(cr, n) < 0) this.i.push(a, c, b); else this.i.push(a, b, c);
  }
  // quad p0..p3 (in order around the face); uv in meters along the given axes
  quad(p0, p1, p2, p3, n, uvs = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    n = n || norm(cross(sub(p1, p0), sub(p3, p0)));
    const a = this.vtx(p0, n, uvs[0]), b = this.vtx(p1, n, uvs[1]), c = this.vtx(p2, n, uvs[2]), d = this.vtx(p3, n, uvs[3]);
    this.tri(a, b, c, n); this.tri(a, c, d, n);
  }
  // planar quad with world-scale uvs (u along p0->p1, v along p0->p3)
  wquad(p0, p1, p2, p3, n) {
    const lu = Math.hypot(...sub(p1, p0)), lv = Math.hypot(...sub(p3, p0));
    this.quad(p0, p1, p2, p3, n, [[0, 0], [lu, 0], [lu, lv], [0, lv]]);
  }
  // oriented box: center c (bottom center), half sizes hx, hz, height h, yaw a
  box(c, hx, hz, h, a = 0, top = true) {
    const ca = Math.cos(a), sa = Math.sin(a);
    const P = (x, y, z) => [c[0] + x * ca - z * sa, c[1] + y, c[2] + x * sa + z * ca];
    const R = (x, z) => norm([x * ca - z * sa, 0, x * sa + z * ca]);
    const p = [P(-hx, 0, -hz), P(hx, 0, -hz), P(hx, 0, hz), P(-hx, 0, hz), P(-hx, h, -hz), P(hx, h, -hz), P(hx, h, hz), P(-hx, h, hz)];
    this.wquad(p[0], p[1], p[5], p[4], R(0, -1));
    this.wquad(p[1], p[2], p[6], p[5], R(1, 0));
    this.wquad(p[2], p[3], p[7], p[6], R(0, 1));
    this.wquad(p[3], p[0], p[4], p[7], R(-1, 0));
    if (top) this.wquad(p[4], p[5], p[6], p[7], [0, 1, 0]);
  }
  // vertical prism (polygon with `sides`), radius r, from y0 to y1, rotation a
  prism(c, r, sides, y0, y1, a = 0, cap = true, r1 = r) {
    for (let k = 0; k < sides; k++) {
      const a0 = a + (k / sides) * Math.PI * 2, a1 = a + ((k + 1) / sides) * Math.PI * 2;
      const p0 = [c[0] + Math.cos(a0) * r, c[1] + y0, c[2] + Math.sin(a0) * r], p1 = [c[0] + Math.cos(a1) * r, c[1] + y0, c[2] + Math.sin(a1) * r];
      const p2 = [c[0] + Math.cos(a1) * r1, c[1] + y1, c[2] + Math.sin(a1) * r1], p3 = [c[0] + Math.cos(a0) * r1, c[1] + y1, c[2] + Math.sin(a0) * r1];
      const am = (a0 + a1) / 2;
      const w = Math.hypot(...sub(p1, p0)), h = y1 - y0;
      this.quad(p0, p1, p2, p3, norm([Math.cos(am) * h, (r - r1), Math.sin(am) * h]), [[k * w, 0], [(k + 1) * w, 0], [(k + 1) * w, h], [k * w, h]]);
    }
    if (cap) {
      const ctr = this.vtx([c[0], c[1] + y1, c[2]], [0, 1, 0], [0, 0]);
      for (let k = 0; k < sides; k++) {
        const a0 = a + (k / sides) * Math.PI * 2, a1 = a + ((k + 1) / sides) * Math.PI * 2;
        const v0 = this.vtx([c[0] + Math.cos(a0) * r1, c[1] + y1, c[2] + Math.sin(a0) * r1], [0, 1, 0], [Math.cos(a0) * r1, Math.sin(a0) * r1]);
        const v1 = this.vtx([c[0] + Math.cos(a1) * r1, c[1] + y1, c[2] + Math.sin(a1) * r1], [0, 1, 0], [Math.cos(a1) * r1, Math.sin(a1) * r1]);
        this.tri(ctr, v0, v1, [0, 1, 0]);
      }
    }
  }
  // Chinese roof over a regular polygon: eave ring radius rE at height yE with upturned corners, concave slope to
  // the apex (or to an inner ring rTop at yTop for stacked pagoda eaves). Includes a soffit underneath.
  roof(c, sides, rE, yE, rTop, yTop, a = 0, lift = 0.9, flare = 0.12, M = 6, rings = 5) {
    const ring = (t) => {      // t: 0 eave .. 1 top
      const pts = [];
      for (let k = 0; k < sides; k++) for (let m = 0; m < M; m++) {
        const s = m / M;
        const a0 = a + (k / sides) * Math.PI * 2, a1 = a + ((k + 1) / sides) * Math.PI * 2;
        const x0 = Math.cos(a0), z0 = Math.sin(a0), x1 = Math.cos(a1), z1 = Math.sin(a1);
        const corner = Math.pow(Math.abs(Math.cos(Math.PI * s)), 3);   // 1 at the corners
        const rr = (rE * (1 + flare * corner)) * (1 - t) + rTop * t;
        const x = x0 + (x1 - x0) * s, z = z0 + (z1 - z0) * s;
        const y = yE + (yTop - yE) * Math.pow(t, 1.7) + lift * corner * (1 - t) * (1 - t);
        pts.push([c[0] + x * rr, c[1] + y, c[2] + z * rr, k * M + m]);
      }
      return pts;
    };
    const N = sides * M;
    const R = [];
    for (let j = 0; j <= rings; j++) R.push(ring(j / rings));
    for (let j = 0; j < rings; j++) for (let q = 0; q < N; q++) {
      const a0 = R[j][q], a1 = R[j][(q + 1) % N], b1 = R[j + 1][(q + 1) % N], b0 = R[j + 1][q];
      const mid = [(a0[0] + b1[0]) / 2 - c[0], 0, (a0[2] + b1[2]) / 2 - c[2]];
      let n = norm(cross(sub(a1, a0), sub(b0, a0)));
      if (dot(n, [mid[0], 1, mid[2]]) < 0) n = mul(n, -1);
      const u0 = q * 0.9, u1 = (q + 1) * 0.9, v0 = j / rings * 4, v1 = (j + 1) / rings * 4;
      this.quad(a0.slice(0, 3), a1.slice(0, 3), b1.slice(0, 3), b0.slice(0, 3), n, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    }
    // soffit (underside), slightly below the eave ring, back to the wall line
    const inner = rTop > 0 ? rTop : rE * 0.6;
    for (let q = 0; q < N; q++) {
      const a0 = R[0][q], a1 = R[0][(q + 1) % N];
      const i0 = [c[0] + (a0[0] - c[0]) / rE * inner * 0.95, a0[1] - 0.25, c[2] + (a0[2] - c[2]) / rE * inner * 0.95];
      const i1 = [c[0] + (a1[0] - c[0]) / rE * inner * 0.95, a1[1] - 0.25, c[2] + (a1[2] - c[2]) / rE * inner * 0.95];
      this.quad([a0[0], a0[1] - 0.2, a0[2]], [a1[0], a1[1] - 0.2, a1[2]], i1, i0, [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
      // eave fascia
      this.quad([a0[0], a0[1] - 0.2, a0[2]], [a1[0], a1[1] - 0.2, a1[2]], a1.slice(0, 3), a0.slice(0, 3), norm([a0[0] - c[0], 0, a0[2] - c[2]]));
    }
    return R[0];   // eave ring points (for hanging lanterns)
  }
  // Taihu rockery stone: a tall eroded mass with smooth folds, deep pits (pushed in and darkened) and a
  // few ridges, smooth-shaded so it reads as worn limestone rather than a faceted crystal.
  rock(c, r, R, sq = 1, subdiv = 2) {
    const t = (1 + Math.sqrt(5)) / 2;
    let pos = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm);
    let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (let s = 0; s < subdiv; s++) {
      const mid = new Map();
      const m = (a, b) => { const k = a < b ? a * 1e5 + b : b * 1e5 + a; if (!mid.has(k)) { pos.push(norm(add(pos[a], pos[b]))); mid.set(k, pos.length - 1); } return mid.get(k); };
      const nf = [];
      for (const [a, b, d] of faces) { const ab = m(a, b), bd = m(b, d), da = m(d, a); nf.push([a, ab, da], [b, bd, ab], [d, da, bd], [ab, bd, da]); }
      faces = nf;
    }
    const ph = [R() * 9, R() * 9, R() * 9, R() * 9, R() * 9, R() * 9];
    const pit = [];
    const P = pos.map((p) => {
      // folds (low frequency), worn ridges (|sin|), pits where a mid-frequency pattern peaks
      let n = 1 + 0.3 * Math.sin(p[0] * 3 + ph[0]) * Math.sin(p[1] * 3.5 + ph[1]) + 0.18 * Math.sin(p[2] * 4 + p[0] * 2 + ph[2]);
      n -= 0.12 * Math.abs(Math.sin(p[1] * 7 + p[0] * 3 + ph[3]));
      const h = Math.sin(p[0] * 8.5 + ph[3]) * Math.sin(p[1] * 7.5 + ph[4]) * Math.sin(p[2] * 8.5 + ph[5]);
      const k = Math.max(0, (h - 0.25) / 0.75);
      n -= 0.5 * k;
      pit.push(k);
      const w = 0.72 + 0.12 * Math.sin(p[1] * 2.5 + ph[2]);   // waist: narrower in places
      return [c[0] + p[0] * r * n * w, c[1] + (p[1] + 0.75) * r * n * sq, c[2] + p[2] * r * n * w];
    });
    // smooth vertex normals
    const N = P.map(() => [0, 0, 0]);
    for (const [a, b, d] of faces) {
      const fn = cross(sub(P[b], P[a]), sub(P[d], P[a]));
      const out = sub(P[a], c);
      const s = dot(fn, out) < 0 ? -1 : 1;
      for (const v of [a, b, d]) { N[v][0] += fn[0] * s; N[v][1] += fn[1] * s; N[v][2] += fn[2] * s; }
    }
    const base = this.mat.col, idx = [];
    for (let i = 0; i < P.length; i++) {
      const g = 1 - 0.75 * Math.min(1, pit[i] * 1.6);
      this.mat = { ...this.mat, col: [base[0] * g, base[1] * g, base[2] * g] };
      idx.push(this.vtx(P[i], norm(N[i]), [P[i][0] + P[i][2], P[i][1]]));
    }
    this.mat = { ...this.mat, col: base };
    for (const [a, b, d] of faces) this.tri(idx[a], idx[b], idx[d], norm(add(add(N[a], N[b]), N[d])));
  }
}
