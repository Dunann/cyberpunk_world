// Planning measurements for I-029 and I-030. CPU only: no browser and no GPU are used.
// Run order, from this folder:
//   node lots.mjs      lots on the CPU heights (lots.json, routes.json); prints the count per district
//   node dump.mjs      6 m height grid of the city (grid_h.bin and others, about 2 minutes)
//   node bank.mjs      bank stations with the first lot along the normal (bank.json)
//   node sections.mjs  bank sections of the peninsula's south face
//   node face.mjs      the face by the spec rule and its frame share per eval pose (face_st.json)
//   node lanes.mjs     the lane field: levels, lane length, unit estimate
// I-030 (in its own measure folder, after lots.mjs and dump.mjs here): node sky2.mjs; node front.mjs
// Outputs (*.json, *.bin) are not committed.
//
// CPU port (float64) of the world height function: landHeight -> district flatten -> carveWater.
// Mirrors world.js GEN_HEIGHT / terrainLand.js. Lake landforms are left out (lake only).
// Used only for planning measurements; small differences from the GPU f32 heightmap are expected.
import { catmullRom } from '../../../../../source/src/math.js';

export const RIVERS = [
  { name: 'Great River', points: [
    [-7000, 1050, 360], [-5000, 820, 360], [-3500, 1180, 360], [-2300, 840, 350], [-1300, 690, 340],
    [-400, 560, 350], [450, 330, 380], [1250, 260, 420], [1900, 40, 420], [2250, -420, 420],
    [2300, -1150, 420], [2240, -1850, 420], [2520, -2480, 420], [3250, -2760, 420], [4400, -2950, 420], [7000, -3500, 420]] },
  { name: 'Jade River', points: [
    [-2700, -7000, 240], [-2250, -4500, 240], [-1500, -3250, 240], [-850, -2350, 230], [-260, -1550, 230],
    [160, -760, 240], [420, -40, 260], [560, 280, 300]] },
  { name: 'Garden Canal', points: [
    [-1650, 1880, 46], [-1520, 1500, 40], [-1380, 1150, 40], [-1250, 860, 46]] },
];
export const LAKE = { cx: -2000, cz: 2350, rx: 700, rz: 500, angle: 0.25 };
export const DISTRICTS = [
  { name: 'Lujiazui CBD',      type: 1, cx: 3300, cz: -1250, rx: 760, rz: 1050, angle: 0.0,  block: 125, road: 20, target: 8,  flatten: 0.96, bank: 120 },
  { name: 'Yuzhong Peninsula', type: 2, cx: -750, cz: -150,  rx: 1250, rz: 620, angle: 0.32, block: 72,  road: 11, target: 40, flatten: 0.3,  bank: 30 },
  { name: 'The Bund',          type: 3, cx: 1760, cz: -1000, rx: 300, rz: 820,  angle: 0.0,  block: 95,  road: 16, target: 8,  flatten: 0.96, bank: 50 },
  { name: 'Steppe Quarter',    type: 4, cx: 900,  cz: -2750, rx: 850, rz: 700,  angle: 0.15, block: 115, road: 16, target: 38, flatten: 0.85, bank: 90 },
  { name: 'Jiangbei',          type: 6, cx: 1000, cz: -1200, rx: 620, rz: 520,  angle: 0.1,  block: 85,  road: 13, target: 14, flatten: 0.7,  bank: 80 },
  { name: 'Nan\'an Old Town',  type: 6, cx: 650,  cz: 1350,  rx: 1250, rz: 700, angle: -0.2, block: 80,  road: 12, target: 18, flatten: 0.55, bank: 80 },
  { name: 'West Hills',        type: 6, cx: -2900, cz: -250, rx: 850, rz: 700,  angle: 0.5,  block: 76,  road: 12, target: 28, flatten: 0.5,  bank: 70 },
  { name: 'Lake Gardens',      type: 5, cx: -1950, cz: 2300, rx: 1150, rz: 900, angle: 0.25, block: 0,   road: 0,  target: 4,  flatten: 0.35, bank: 160 },
];

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

function pcg(v) {
  const s = (Math.imul(v, 747796405) + 2891336453) >>> 0;
  const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
}
function h22(ix, iy, out) {
  const qx = (ix + 32768) >>> 0, qy = (iy + 32768) >>> 0;
  const h = pcg((qx ^ pcg(qy)) >>> 0);
  out[0] = (h & 0xffff) / 65535; out[1] = (h >>> 16) / 65535;
}
const _g = [0, 0];
function gnoise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  h22(ix, iy, _g); const a = (_g[0] * 2 - 1) * fx + (_g[1] * 2 - 1) * fy;
  h22(ix + 1, iy, _g); const b = (_g[0] * 2 - 1) * (fx - 1) + (_g[1] * 2 - 1) * fy;
  h22(ix, iy + 1, _g); const c = (_g[0] * 2 - 1) * fx + (_g[1] * 2 - 1) * (fy - 1);
  h22(ix + 1, iy + 1, _g); const d = (_g[0] * 2 - 1) * (fx - 1) + (_g[1] * 2 - 1) * (fy - 1);
  return mix(mix(a, b, ux), mix(c, d, ux), uy) * 1.4;
}
// rot2(a) * p with WGSL column-major mat2x2f(c, s, -s, c)
function fbm2(x, y, oct) {
  let a = 0.5, s = 0; const c = Math.cos(0.6), sn = Math.sin(0.6);
  for (let i = 0; i < oct; i++) {
    s += a * gnoise2(x, y);
    const nx = (c * x - sn * y) * 2.03 + 17.1, ny = (sn * x + c * y) * 2.03 + 9.7;
    x = nx; y = ny; a *= 0.5;
  }
  return s;
}
function ridged(x, y, oct) {
  let a = 0.5, s = 0, w = 1; const c = Math.cos(0.5), sn = Math.sin(0.5);
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(gnoise2(x, y)); n = n * n * w; w = clamp(n * 2, 0, 1);
    s += a * n;
    const nx = (c * x - sn * y) * 2.1 + 3.1, ny = (sn * x + c * y) * 2.1 + 7.7;
    x = nx; y = ny; a *= 0.5;
  }
  return s;
}
function landRidged(x, y, oct) {
  let a = 0.5, s = 0, w = 1; const c = Math.cos(0.55), sn = Math.sin(0.55);
  for (let i = 0; i < oct; i++) {
    const g = gnoise2(x, y);
    let n = 1 - Math.sqrt(g * g + 0.012); n = n * n * w; w = clamp(n * 1.8, 0, 1);
    s += a * n;
    const nx = (c * x - sn * y) * 2.07 + 3.1, ny = (sn * x + c * y) * 2.07 + 7.7;
    x = nx; y = ny; a *= 0.48;
  }
  return s;
}
function lineDist(px, py, ax, ay, bx, by) {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / Math.max(bax * bax + bay * bay, 1e-6), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h);
}

export function landBase(x, z, opt = {}) {
  let h = 24 + fbm2(x * 0.0011, z * 0.0011, 5) * 60 + fbm2(x * 0.0045 + 3, z * 0.0045 + 3, 4) * 9;
  const sp = lineDist(x, z, -2000, -180, 250, -80);
  h += 85 * Math.exp(-Math.pow(sp / 360, 2));
  const ns = lineDist(x, z, -900, 2950, 2800, 2550);
  const nsw = Math.exp(-Math.pow(ns / 650, 2));
  if (nsw > 1e-5) h += (220 + ridged(x * 0.0016, z * 0.0016, 4) * 260) * nsw;
  const lk = Math.hypot((x + 2250) / 1250, (z - 2350) / 1050);
  const lkw = ss(0.75, 1.25, lk) * ss(-1400, -2200, x + (z - 2350) * 0.3);
  if (lkw > 0) h += lkw * (60 + ridged(x * 0.0025, z * 0.0025, 4) * 110);
  const pg = Math.hypot(x + 1980, (z - 3040) * 1.25);
  h += 46 * (1 - ss(25, 260, pg));

  const qx = x - 300, qz = z + 300;
  const lakePush = 1300 * (1 - ss(1600, 3600, Math.hypot(x + 2100, z - 2500)));
  const r = Math.hypot(qx, qz * 0.92) + fbm2(x * 0.00035, z * 0.00035, 4) * 900 - lakePush;
  const foot = ss(3500, 4600, r);
  let wpx = x, wpz = z, massif = 0.5;
  if (foot > 0) {
    wpx = x + fbm2(x * 0.00042 + 11, z * 0.00042 + 11, 3) * 700;
    wpz = z + fbm2(x * 0.00042 - 7, z * 0.00042 - 7, 3) * 700;
    massif = ss(-0.45, 0.45, fbm2(x * 0.00019 + 3.3, z * 0.00019 + 3.3, 3));
    h += foot * (fbm2(wpx * 0.0016 + 2, wpz * 0.0016 + 2, 4) * 70 + 45);
  }
  const vd = lineDist(x, z, 650, 4300, 2700, 15000);
  const valley = Math.exp(-Math.pow(vd / 1100, 2)) * ss(3600, 5200, z);
  const ring = ss(4000, 7200, r) * (1 - 0.78 * valley);
  let ringH = 0, farH = 0;
  if (ring > 0) {
    const rg = landRidged(wpx * 0.00055, wpz * 0.00055, 5);
    ringH = ring * (120 + (rg * 1000 + 80) * (0.45 + 0.75 * massif) + fbm2(x * 0.004, z * 0.004, 3) * 22);
    h += ringH;
  }
  const farW = ss(6500, 15000, r);
  if (farW > 0) {
    farH = farW * (450 + landRidged(wpx * 0.00022 + 5, wpz * 0.00022 + 5, 6) * 1900 * (0.6 + 0.6 * massif)) * (1 - 0.6 * valley * (1 - ss(9000, 15000, r)));
    h += farH;
  }
  if (opt.extra) h += opt.extra(x, z, r, wpx, wpz, massif, valley);
  if (valley > 1e-4) {
    const dcx = x - 700, dcz = z - 4560;
    const al = dcx * 0.188 + dcz * 0.9822, ac = dcx * 0.9822 - dcz * 0.188;
    for (let i = 0; i < 3; i++) {
      const cr = 2300 + i * 1150 + 220 * Math.sin(ac * (0.0019 - i * 0.0004) + 1 + i * 2.1) + fbm2(x * 0.0009 + i * 7, z * 0.0009 + i * 7, 3) * 160;
      const k = Math.exp(-Math.pow((al - cr) / (340 + i * 90), 2)) * valley;
      const crest = 600 + i * 240 + landRidged(x * 0.0012 + i * 3, z * 0.0012 + i * 3, 4) * (240 + i * 60) - 120 * Math.exp(-Math.pow((ac - 150 + i * 500) / 450, 2));
      h = Math.max(h, mix(h, crest, k));
    }
  }
  {
    const dcx = x - 700, dcz = z - 4560, dl = Math.hypot(dcx, dcz);
    if (dl < 800) {
      const along = dcx * 0.188 + dcz * 0.9822;
      const dd = dl + Math.max(along - 40, 0) * 7 + fbm2(x * 0.025, z * 0.025, 3) * 14 * ss(40, 90, dl);
      const crag = 1 - ss(48, 380, dd);
      h = Math.max(h, mix(h, 322, crag * crag * (3 - 2 * crag)));
    }
  }
  return h;
}
// terraces are a small local quantization on rural foothills; ignored here (|dh| < 2.6 m, outside the city)
export const landHeight = landBase;

// ---- water
export const segs = [];
for (const R of RIVERS) {
  const natural = R.name === 'Garden Canal' ? 1 : 0;
  const pts = catmullRom(R.points, 10);
  for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], pts[i][2] / 2, pts[i + 1][2] / 2, natural, R.name]);
}
// returns [dist, natural, riverIndex(0 great, 1 jade, 2 canal, 3 lake)]
export function waterDistEx(x, z, lakeNoise = true) {
  let best = 1e9, nat = 0, ri = -1;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const bax = s[2] - s[0], baz = s[3] - s[1], pax = x - s[0], paz = z - s[1];
    const h = clamp((pax * bax + paz * baz) / (bax * bax + baz * baz || 1), 0, 1);
    const d = Math.hypot(pax - bax * h, paz - baz * h) - (s[4] + (s[5] - s[4]) * h);
    if (d < best) { best = d; nat = s[6]; ri = s[7] === 'Great River' ? 0 : s[7] === 'Jade River' ? 1 : 2; }
  }
  const L = LAKE, c = Math.cos(-L.angle), sn = Math.sin(-L.angle);
  const qx = (x - L.cx) * c - (z - L.cz) * sn, qz = (x - L.cx) * sn + (z - L.cz) * c;
  let ld = (Math.hypot(qx / L.rx, qz / L.rz) - 1) * Math.min(L.rx, L.rz);
  if (lakeNoise && ld < 400) ld += fbm2(x * 0.004, z * 0.004, 3) * 70 + fbm2(x * 0.012, z * 0.012, 2) * 18;
  if (ld < best) { best = ld; nat = 1; ri = 3; }
  return [best, nat, ri];
}
// distance to one river only (0 great, 1 jade)
export function waterDistTo(x, z, river) {
  const name = river === 0 ? 'Great River' : 'Jade River';
  let best = 1e9;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]; if (s[7] !== name) continue;
    const bax = s[2] - s[0], baz = s[3] - s[1], pax = x - s[0], paz = z - s[1];
    const h = clamp((pax * bax + paz * baz) / (bax * bax + baz * baz || 1), 0, 1);
    const d = Math.hypot(pax - bax * h, paz - baz * h) - (s[4] + (s[5] - s[4]) * h);
    if (d < best) best = d;
  }
  return best;
}
export function districtWn(i, x, z) {   // GPU version (with edge noise)
  const d = DISTRICTS[i];
  const c = Math.cos(-d.angle), s = Math.sin(-d.angle);
  const qx = (x - d.cx) * c - (z - d.cz) * s, qz = (x - d.cx) * s + (z - d.cz) * c;
  const e = Math.hypot(qx / d.rx, qz / d.rz);
  if (e > 1.2) return 0;
  return ss(1.0, 0.72, e + fbm2(x * 0.003 + i * 13, z * 0.003 + i * 13, 2) * 0.12);
}
export function carveWater(h0, wd, natural, hillW) {
  let h = h0;
  const shore = natural ? 1.0 : 5.5, wall = natural ? 26 : 5;
  const soft = mix(natural ? 220 : 120, 28, hillW);
  if (wd > 0) {
    const landH = Math.max(h, shore + 0.5);
    const land = mix(shore, landH, ss(wall, wall + soft, wd));
    const wallH = mix(-1.5, shore, ss(0, wall, wd));
    h = wd < wall ? wallH : land;
  } else {
    const depth = natural ? 4 : 14;
    h = -1.5 - depth * ss(0, natural ? 40 : 90, -wd);
  }
  return h;
}
// full height at a point. Returns also the pre-carve height and hillW when detail = true.
export function heightFull(x, z, detail = false, opt = {}) {
  let h = landBase(x, z, opt);
  let hillW = 0;
  for (let i = 0; i < DISTRICTS.length; i++) {
    const dw = districtWn(i, x, z);
    if (dw > 0) {
      const d = DISTRICTS[i];
      const flat = d.target + (h - d.target) * 0.12;
      h = mix(h, flat, dw * d.flatten);
      if (d.type === 2) hillW = Math.max(hillW, dw);
    }
  }
  const pre = h;
  const [wd, nat, ri] = waterDistEx(x, z);
  h = carveWater(h, wd, nat > 0.5, hillW);
  return detail ? { h, pre, wd, nat, ri, hillW } : h;
}

// lazy 3 m grid cache with bilinear lookup, same layout as the GPU heightmap
export const TERRAIN = { SIZE: 12288, RES: 4096, ORIGIN: -6144 };
export class HeightCache {
  constructor(opt = {}) { this.H = new Float32Array(TERRAIN.RES * TERRAIN.RES).fill(NaN); this.opt = opt; this.count = 0; }
  texel(ix, iz) {
    const k = iz * TERRAIN.RES + ix;
    let v = this.H[k];
    if (v !== v) {
      const x = TERRAIN.ORIGIN + (ix + 0.5) * TERRAIN.SIZE / TERRAIN.RES, z = TERRAIN.ORIGIN + (iz + 0.5) * TERRAIN.SIZE / TERRAIN.RES;
      v = heightFull(x, z, false, this.opt); this.H[k] = v; this.count++;
    }
    return v;
  }
  heightAt(x, z) {
    const R = TERRAIN.RES;
    let tx = (x - TERRAIN.ORIGIN) / TERRAIN.SIZE * R - 0.5, tz = (z - TERRAIN.ORIGIN) / TERRAIN.SIZE * R - 0.5;
    tx = clamp(tx, 0, R - 1.001); tz = clamp(tz, 0, R - 1.001);
    const ix = tx | 0, iz = tz | 0, fx = tx - ix, fz = tz - iz;
    const h00 = this.texel(ix, iz), h10 = this.texel(ix + 1, iz), h01 = this.texel(ix, iz + 1), h11 = this.texel(ix + 1, iz + 1);
    return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
  }
}
export { ss, mix, clamp, fbm2, gnoise2, landRidged, ridged, lineDist };
