// CPU z-buffer rasterizer for coverage measurement. Occluders: every building part as an oriented box
// (cylinders and tapers approximated by their bounding box), Liziba tower, monorail/metro beams, terrain (6 m CPU grid).
import fs from 'node:fs';
export const W = 640, H = 360, F = 310.5;   // f = 1242 px at 1440 rows, scaled to 360 rows
const here = (f) => new URL(f, import.meta.url);
export const meta = JSON.parse(fs.readFileSync(here('./meta.json')));
const pb = fs.readFileSync(here('./parts.bin'));
export const parts = new Float32Array(pb.buffer, pb.byteOffset, pb.byteLength / 4);
export const NP = meta.N, PF = meta.F;
export const tracks = JSON.parse(fs.readFileSync(here('./tracks.json')));
const gm = JSON.parse(fs.readFileSync(here('../grid_meta.json')));
const gb = fs.readFileSync(here('../grid_h.bin'));
const GH = new Float32Array(gb.buffer, gb.byteOffset, gb.byteLength / 4);
export function ground(x, z) {
  const tx = (x - gm.X0) / gm.S - 0.5, tz = (z - gm.Z0) / gm.S - 0.5;
  if (tx < 0 || tz < 0 || tx > gm.nx - 2 || tz > gm.nz - 2) return -5;
  const ix = tx | 0, iz = tz | 0, fx = tx - ix, fz = tz - iz, n = gm.nx;
  return (GH[iz * n + ix] * (1 - fx) + GH[iz * n + ix + 1] * fx) * (1 - fz) + (GH[(iz + 1) * n + ix] * (1 - fx) + GH[(iz + 1) * n + ix + 1] * fx) * fz;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
export function camera(p) {
  const pos = [p.pos[0], p.rel ? ground(p.pos[0], p.pos[2]) + p.pos[1] : p.pos[1], p.pos[2]];
  const f = norm(sub(p.target, pos)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
  return { pos, f, r, u };
}
const FACES = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
export class Frame {
  constructor(cam) { this.cam = cam; this.depth = new Float32Array(W * H).fill(1e9); this.id = new Int32Array(W * H).fill(-1); }
  toCam(w) { const d = sub(w, this.cam.pos); return [dot(d, this.cam.r), dot(d, this.cam.u), dot(d, this.cam.f)]; }
  poly(P, id) {
    const near = 0.5, Q = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      if (a[2] >= near) Q.push(a);
      if ((a[2] >= near) !== (b[2] >= near)) { const t = (near - a[2]) / (b[2] - a[2]); Q.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), near]); }
    }
    if (Q.length < 3) return;
    const S = Q.map((q) => [W / 2 + F * q[0] / q[2], H / 2 - F * q[1] / q[2], 1 / q[2]]);
    for (let k = 1; k + 1 < S.length; k++) this.tri(S[0], S[k], S[k + 1], id);
  }
  tri(a, b, c, id) {
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-9) return;
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5;
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
        const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = 1 / (w0 * a[2] + w1 * b[2] + w2 * c[2]), k = y * W + x;
        if (z < this.depth[k]) { this.depth[k] = z; this.id[k] = id; }
      }
    }
  }
  // oriented box: centre x,z, angle a (local x along (cos a, sin a)), half sizes hw (x), hd (z), y0..y1
  box(x, z, a, hw, hd, y0, y1, id) {
    const c = Math.cos(a), s = Math.sin(a);
    const C = [];
    for (const y of [y0, y1]) for (const [lx, lz] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) C.push(this.toCam([x + lx * c - lz * s, y, z + lx * s + lz * c]));
    let nIn = 0; const out = [0, 0, 0, 0];
    for (const q of C) if (q[2] > 0.5) { nIn++; const sx = F * q[0] / q[2], sy = F * q[1] / q[2]; if (sx < -W / 2) out[0]++; if (sx > W / 2) out[1]++; if (sy < -H / 2) out[2]++; if (sy > H / 2) out[3]++; }
    if (nIn === 0) return;
    if (nIn === 8 && out.some((o) => o === 8)) return;
    for (const f of FACES) this.poly(f.map((i) => C[i]), id);
  }
  terrain() {
    const { pos, f, r, u } = this.cam;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const sx = (x + 0.5 - W / 2) / F, sy = -(y + 0.5 - H / 2) / F;
      const d = [f[0] + r[0] * sx + u[0] * sy, f[1] + r[1] * sx + u[1] * sy, f[2] + r[2] * sx + u[2] * sy];
      const k = y * W + x, zmax = this.depth[k];
      let t = 1, prev = 1;   // t is camera-space z (forward component of d is 1)
      while (t < 8000 && t < zmax) {
        const py = pos[1] + d[1] * t;
        if (py < Math.max(ground(pos[0] + d[0] * t, pos[2] + d[2] * t), 0)) {
          let lo = prev, hi = t;
          for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2; if (pos[1] + d[1] * m < Math.max(ground(pos[0] + d[0] * m, pos[2] + d[2] * m), 0)) hi = m; else lo = m; }
          if (hi < this.depth[k]) { this.depth[k] = hi; this.id[k] = -2; }
          break;
        }
        prev = t; t += Math.max(1.5, t * 0.008);
      }
    }
  }
}
export function drawWorld(fr) {
  for (let i = 0; i < NP; i++) {
    const o = i * PF;
    fr.box(parts[o], parts[o + 2], parts[o + 3], parts[o + 4], parts[o + 5], parts[o + 1], parts[o + 1] + parts[o + 6], i);
  }
  for (const T of tracks) {
    const metro = T.kind === 'metro';
    for (let i = T.iA; i < T.iB; i += 2) {
      const j = Math.min(i + 2, T.iB);
      if (T.g[i] - T.y[i] > 3.5) continue;   // tunnel
      const x = (T.x[i] + T.x[j]) / 2, z = (T.z[i] + T.z[j]) / 2, y = (T.y[i] + T.y[j]) / 2;
      const len = Math.hypot(T.x[j] - T.x[i], T.z[j] - T.z[i]);
      fr.box(x, z, Math.atan2(T.tz[i], T.tx[i]), len / 2 + 0.2, metro ? 5.2 : 2.9, y - (metro ? 3.2 : 1.6), y, -3);
    }
    if (T.liz !== null && T.liz !== undefined) {
      const i = T.liz, a = Math.atan2(T.tz[i], T.tx[i]), yb = T.y[i];
      fr.box(T.x[i], T.z[i], a, 24, 14, T.g[i] - 2, yb - 2.4, -4);
      fr.box(T.x[i], T.z[i], a, 24, 14, yb + 6.6, yb + 6.6 + 14 * 3, -4);
      for (const s of [1, -1]) fr.box(T.x[i] + T.tz[i] * s * 13.7, T.z[i] - T.tx[i] * s * 13.7, a, 24, 0.3, yb - 2.4, yb + 6.6, -4);
    }
  }
  fr.terrain();
}
export function snapshot(fr) { return { depth: fr.depth.slice(), id: fr.id.slice() }; }
export function savePPM(fr, file) {
  const buf = Buffer.alloc(W * H * 3);
  for (let k = 0; k < W * H; k++) {
    const id = fr.id[k], z = fr.depth[k];
    let c = [20, 20, 40];
    if (id === -2) { const v = Math.max(25, 130 - z / 25); c = [v * 0.6, v * 0.75, v * 0.5]; }
    else if (id === -3 || id === -4) c = [210, 130, 60];
    else if (id >= 0) { const v = Math.max(40, 230 - z / 6); c = [v, v, v * 1.05]; }
    else if (id <= -10) c = [0, 255, 0];
    buf[k * 3] = c[0]; buf[k * 3 + 1] = c[1]; buf[k * 3 + 2] = Math.min(255, c[2]);
  }
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`P6 ${W} ${H} 255\n`), buf]));
}
