// World layout: rivers, districts, bridges, transit routes, landmarks, viewpoints.
// Also generates the terrain heightmap + world info map on the GPU and reads the heightmap back
// so JS can query heights (collision, placement). All layout data here is the single source of truth.
//
// Coordinates: meters, X = east, Y = up, Z = south (north is -Z). Water surface is at Y = 0.

import { WGSL_LIB, TERRAIN, INFO, MAX_DISTRICTS } from './common.js';
import { catmullRom, rng, clamp, smoothstep } from './math.js';
import { shader } from './gpu.js';
import { LAND_WGSL, CARVE_WGSL } from './terrainLand.js';

// ---------------------------------------------------------------- layout data

// River control points: [x, z, width]. Densified with Catmull-Rom.
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

// West-Lake-style lake in the garden district (ellipse + noise; noise applied on GPU only).
export const LAKE = { cx: -2000, cz: 2350, rx: 700, rz: 500, angle: 0.25 };

export const DT = { NONE: 0, CBD: 1, HILLSIDE: 2, BUND: 3, STEPPE: 4, GARDEN: 5, URBAN: 6 };

// Districts: ellipse (cx, cz, rx, rz), street grid (angle rad, block m, road m), ground shaping.
// block = 0 means no street grid (garden).
export const DISTRICTS = [
  { name: 'Lujiazui CBD',      type: DT.CBD,      cx: 3300, cz: -1250, rx: 760, rz: 1050, angle: 0.0,  block: 125, road: 20, target: 8,  flatten: 0.96, bank: 120 },
  { name: 'Yuzhong Peninsula', type: DT.HILLSIDE, cx: -750, cz: -150,  rx: 1250, rz: 620, angle: 0.32, block: 72,  road: 11, target: 40, flatten: 0.3,  bank: 30 },
  { name: 'The Bund',          type: DT.BUND,     cx: 1760, cz: -1000, rx: 300, rz: 820,  angle: 0.0,  block: 95,  road: 16, target: 8,  flatten: 0.96, bank: 50 },
  { name: 'Steppe Quarter',    type: DT.STEPPE,   cx: 900,  cz: -2750, rx: 850, rz: 700,  angle: 0.15, block: 115, road: 16, target: 38, flatten: 0.85, bank: 90 },
  { name: 'Jiangbei',          type: DT.URBAN,    cx: 1000, cz: -1200, rx: 620, rz: 520,  angle: 0.1,  block: 85,  road: 13, target: 14, flatten: 0.7,  bank: 80 },
  { name: 'Nan\'an Old Town',  type: DT.URBAN,    cx: 650,  cz: 1350,  rx: 1250, rz: 700, angle: -0.2, block: 80,  road: 12, target: 18, flatten: 0.55, bank: 80 },
  { name: 'West Hills',        type: DT.URBAN,    cx: -2900, cz: -250, rx: 850, rz: 700,  angle: 0.5,  block: 76,  road: 12, target: 28, flatten: 0.5,  bank: 70 },
  { name: 'Lake Gardens',      type: DT.GARDEN,   cx: -1950, cz: 2300, rx: 1150, rz: 900, angle: 0.25, block: 0,   road: 0,  target: 4,  flatten: 0.35, bank: 160 },
];

// Road bridges (built by bridges module; traffic module runs cars on them). deck = deck height (m).
export const BRIDGES = [
  { name: 'Peninsula South Bridge', type: 'cable',      ax: -640, az: 230,  bx: -540, bz: 980,  deck: 30, width: 26 },
  { name: 'Chaotianmen Arch',       type: 'arch',       ax: -380, az: -880, bx: 470,  bz: -1330, deck: 30, width: 24 },
  { name: 'Bund Suspension',        type: 'suspension', ax: 1820, az: -180, bx: 2760, bz: -520, deck: 38, width: 30 },
  { name: 'Old Town Bridge',        type: 'arch',       ax: 1150, az: -40,  bx: 1250, bz: 640,  deck: 26, width: 22 },
  { name: 'North Cable Bridge',     type: 'cable',      ax: 1850, az: -2150, bx: 2800, bz: -2050, deck: 34, width: 26 },
];

// Elevated transit routes: control points [x, z]; elevation is computed (ground + clearance, min over water).
export const ROUTES = [
  { name: 'Monorail Line 2', kind: 'monorail', clearance: 16, points: [
    [-3500, -700], [-2700, -420], [-2000, -560], [-1450, -760], [-1050, -770], [-650, -640], [-250, -420], [120, -120]] },
  { name: 'Metro Line 6', kind: 'metro', clearance: 24, points: [
    [-200, 2050], [250, 1550], [700, 1000], [980, 520], [1180, 0], [1350, -650], [1600, -1350], [2000, -1620],
    [2700, -1620], [3350, -1450], [3950, -900]] },
];
// Station where the monorail passes through a residential tower (Liziba-style).
export const MONORAIL_STATION = { x: -1050, z: -770, route: 0 };

// Cable car across the Great River (peninsula to old town).
export const CABLEWAY = { ax: -1250, az: 330, bx: -1150, bz: 1080, towerH: 45 };

// Landmark sites. Buildings module builds these; lot generation keeps clear of them.
export const LANDMARKS = [
  { id: 'twist',     x: 3250, z: -1350, r: 70,  h: 620, district: 0 },
  { id: 'twin',      x: 3560, z: -880,  r: 95,  h: 452, district: 0 },
  { id: 'truss',     x: 3020, z: -1780, r: 70,  h: 380, district: 0 },
  { id: 'tvtower',   x: 2870, z: -2200, r: 80,  h: 470, district: 0 },
  { id: 'crown',     x: 3650, z: -1650, r: 75,  h: 520, district: 0 },
  { id: 'raffles',   x: 220,  z: -60,   r: 190, h: 350, district: 1 },   // row of towers + horizontal skybridge at the peninsula tip
  { id: 'ridge',     x: -600, z: -260,  r: 70,  h: 340, district: 1 },
  { id: 'stilts',    x: -280, z: -900,  r: 0,   h: 0,   district: 1 },   // Hongyadong-style cliff (placed along the Jade River bank by buildings module)
  { id: 'gerdome',   x: 900,  z: -2780, r: 150, h: 120, district: 3 },
  { id: 'registan',  x: 1250, z: -2430, r: 120, h: 70,  district: 3 },
  { id: 'pagoda',    x: -1980, z: 3020, r: 40,  h: 60,  district: 7 },
  { id: 'crystal',   x: 900,  z: -1150, r: 75,  h: 670, district: 4 },   // faceted crystalline supertall (Merdeka 118-inspired), Jiangbei
  { id: 'beacon',    x: -1250, z: -900, r: 45,  h: 420, district: 1 },   // hilltop telecom tower (KL Tower-inspired), on the hill west of the peninsula
];

// Viewpoints (keys 1-0) and the 10 verification poses. y is meters above ground when rel is true.
// t = scene time used for captures (light show is active for 20 s < (t mod 180) < 80 s).
export const POSES = [
  { name: 'Nanshan overlook',      pos: [200, 325, 2400], rel: false, target: [568, 205, 1478],  t: 40 },
  { name: 'Bund light show',       pos: [2080, 8, -880],  rel: false, target: [3051, 187, -725], t: 45 },
  { name: 'Hillside neon street',  pos: [-1162, 1.7, -255], rel: true, target: [-1058, 98, -568], t: 100 },
  { name: 'Monorail station',      pos: [-991.7, 141, -752], rel: false, target: [-1027.9, 142, -766.6], t: 15 },
  { name: 'Lake gardens',          pos: [-2625.1, 2.7, 2594.5], rel: true, target: [-2227.2, -14, 2636.3], t: 120, look: [[-1980, 3020]] },
  { name: 'Steppe night market',   pos: [760, 2, -2560],  rel: true, target: [900, 60, -2780],   t: 130 },
  { name: 'Among the supertalls',  pos: [2950, 280, -820], rel: false, target: [3450, 220, -1550], t: 50 },
  { name: 'Under the bridge',      pos: [-588, 2.5, 670], rel: false, target: [-609, 46, 464],   t: 60 },
  { name: 'Mountain edge',         pos: [708.6, 2.2, 4605.2], rel: true, target: [1272.5, -255, 7544], t: 140 },
  { name: 'Cableway over river',   pos: [-1208.6, 64, 760.6], rel: false, target: [-600, 92, 690], t: 70 },
];

export const WORLD_BOUND = 5200;     // player is softly pushed back beyond this radius from origin
export const SHOW_PERIOD = 180;       // seconds per light show cycle
export const SHOW_START = 20, SHOW_LEN = 60;

// ---------------------------------------------------------------- GPU generation shaders

const GEN_COMMON = /* wgsl */ `
struct Seg { a: vec4f, b: vec4f }; // a: ax, az, bx, bz   b: halfWidthA, halfWidthB, kind (0 river, 1 canal), 0
struct District { a: vec4f, b: vec4f, c: vec4f };
struct GenU { d: array<District, ${MAX_DISTRICTS}>, count: vec4f, lake: vec4f, lake2: vec4f };
@group(0) @binding(0) var<uniform> G: GenU;
@group(0) @binding(1) var<storage, read> segs: array<Seg>;

fn segDist(p: vec2f, a: vec2f, b: vec2f) -> vec2f {
  let pa = p - a; let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return vec2f(length(pa - ba * h), h);
}
fn lakeDist(p: vec2f) -> f32 {
  let L = G.lake;
  let q = rot2(-G.lake2.x) * (p - L.xy);
  let e = length(q / L.zw);
  let n = fbm2(p * 0.004, 3) * 70.0 + fbm2(p * 0.012, 2) * 18.0;
  return (e - 1.0) * min(L.z, L.w) + n;
}
// Signed distance to water (negative inside water). y returns 1 if nearest water is natural (lake/canal).
fn waterDist(p: vec2f) -> vec2f {
  var best = 1e9; var natural = 0.0;
  let n = arrayLength(&segs);
  for (var i = 0u; i < n; i++) {
    let s = segs[i];
    // cheap reject using bounding distance
    let r = segDist(p, s.a.xy, s.a.zw);
    let hw = mix(s.b.x, s.b.y, r.y);
    let d = r.x - hw;
    if (d < best) { best = d; natural = s.b.z; }
  }
  let ld = lakeDist(p);
  if (ld < best) { best = ld; natural = 1.0; }
  return vec2f(best, natural);
}
fn districtW(p: vec2f, i: i32) -> f32 {
  let d = G.d[i];
  let q = rot2(-d.b.x) * (p - d.a.xy);
  let e = length(q / d.a.zw) + fbm2(p * 0.003 + f32(i) * 13.0, 2) * 0.12;
  return smoothstep(1.0, 0.72, e);
}
fn ridged(p0: vec2f, oct: i32) -> f32 {
  var p = p0; var a = 0.5; var s = 0.0; var w = 1.0;
  for (var i = 0; i < oct; i++) {
    var n = 1.0 - abs(gnoise2(p));
    n = n * n * w;
    w = clamp(n * 2.0, 0.0, 1.0);
    s += a * n; p = rot2(0.5) * p * 2.1 + vec2f(3.1, 7.7); a *= 0.5;
  }
  return s;
}
fn lineDist(p: vec2f, a: vec2f, b: vec2f) -> f32 { return segDist(p, a, b).x; }
`;

const GEN_INFO = /* wgsl */ `
@group(1) @binding(0) var outInfo: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let res = ${INFO.RES}u;
  if (id.x >= res || id.y >= res) { return; }
  let p = ${TERRAIN.ORIGIN}.0 + (vec2f(id.xy) + 0.5) / f32(res) * ${TERRAIN.SIZE}.0;
  let wd = waterDist(p);
  var bestW = 0.0; var bestI = -1;
  for (var i = 0; i < i32(G.count.x); i++) {
    let w = districtW(p, i);
    if (w > bestW) { bestW = w; bestI = i; }
  }
  textureStore(outInfo, id.xy, vec4f(clamp(wd.x, -2000.0, 2000.0), f32(bestI), bestW, wd.y));
}
`;

const GEN_HEIGHT = /* wgsl */ `
@group(1) @binding(0) var infoIn: texture_2d<f32>;
@group(1) @binding(1) var samp: sampler;
@group(1) @binding(2) var outH: texture_storage_2d<r32float, write>;

${LAND_WGSL}
${CARVE_WGSL}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let res = ${TERRAIN.RES}u;
  if (id.x >= res || id.y >= res) { return; }
  let uv = (vec2f(id.xy) + 0.5) / f32(res);
  let p = ${TERRAIN.ORIGIN}.0 + uv * ${TERRAIN.SIZE}.0;
  let info = textureSampleLevel(infoIn, samp, uv, 0.0);
  var h = landHeight(p);

  // district shaping (flatten toward target ground height)
  var hillW = 0.0;
  for (var i = 0; i < i32(G.count.x); i++) {
    let w = districtW(p, i) * G.d[i].c.y;
    let t = G.d[i].c.x;
    // flatten keeps a little of the original relief so districts are not perfectly flat
    let flat = t + (h - t) * 0.12;
    h = mix(h, flat, w);
    if (G.d[i].b.w == 2.0) { hillW = max(hillW, districtW(p, i)); }
  }

  // water carving
  h = carveWater(h, info.x, info.w > 0.5, hillW, p);
  textureStore(outH, id.xy, vec4f(h, 0.0, 0.0, 0.0));
}
`;

// ---------------------------------------------------------------- World class

export class World {
  constructor() {
    this.rivers = RIVERS;
    this.districts = DISTRICTS;
    this.bridges = BRIDGES;
    this.routes = ROUTES;
    this.landmarks = LANDMARKS;
    this.poses = POSES;
    this.lots = [];
    this.signSlots = [];      // {x,y,z, nx,nz, w,h, vertical, style} facade anchors for neon signs (filled by buildings)
    this.audioSources = [];   // {kind, x,y,z, vx,vy,vz, gain} preallocated by producers, updated each frame
    this.shared = {};         // free-form cross-module data
    this.segs = [];           // dense river segments [ax,az,bx,bz,hwA,hwB,natural]
    this.colliderCells = new Map();
    this.colliders = [];
    this.heights = null;      // Float32Array TERRAIN.RES^2
    this._buildSegments();
    this._buildRoutes();
  }

  _buildSegments() {
    for (const r of RIVERS) {
      const natural = r.name === 'Garden Canal' ? 1 : 0;
      const pts = catmullRom(r.points, 10);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        this.segs.push([a[0], a[1], b[0], b[1], a[2] / 2, b[2] / 2, natural]);
      }
    }
  }

  // Dense route polylines with arc length. Heights are filled after the heightmap is ready.
  _buildRoutes() {
    for (const r of ROUTES) {
      const pts = catmullRom(r.points, 16);
      r.dense = pts.map((p) => ({ x: p[0], z: p[1], y: 0, s: 0 }));
      let s = 0;
      for (let i = 1; i < r.dense.length; i++) {
        const a = r.dense[i - 1], b = r.dense[i];
        s += Math.hypot(b.x - a.x, b.z - a.z);
        b.s = s;
      }
      r.length = s;
    }
  }

  // ---------------- CPU queries

  // Terrain height (bilinear) from the GPU-generated heightmap.
  heightAt(x, z) {
    const H = this.heights;
    if (!H) return 0;
    const R = TERRAIN.RES;
    let tx = (x - TERRAIN.ORIGIN) / TERRAIN.SIZE * R - 0.5;
    let tz = (z - TERRAIN.ORIGIN) / TERRAIN.SIZE * R - 0.5;
    tx = clamp(tx, 0, R - 1.001); tz = clamp(tz, 0, R - 1.001);
    const ix = tx | 0, iz = tz | 0, fx = tx - ix, fz = tz - iz;
    const i0 = iz * R + ix;
    const h00 = H[i0], h10 = H[i0 + 1], h01 = H[i0 + R], h11 = H[i0 + R + 1];
    return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
  }

  // Signed distance to river/canal water (negative = in water). Ignores the lake noise.
  waterDist(x, z) {
    let best = 1e9;
    for (let i = 0; i < this.segs.length; i++) {
      const s = this.segs[i];
      const bax = s[2] - s[0], baz = s[3] - s[1];
      const pax = x - s[0], paz = z - s[1];
      const h = clamp((pax * bax + paz * baz) / (bax * bax + baz * baz || 1), 0, 1);
      const dx = pax - bax * h, dz = paz - baz * h;
      const d = Math.sqrt(dx * dx + dz * dz) - (s[4] + (s[5] - s[4]) * h);
      if (d < best) best = d;
    }
    const L = LAKE;
    const c = Math.cos(-L.angle), sn = Math.sin(-L.angle);
    const qx = (x - L.cx) * c - (z - L.cz) * sn, qz = (x - L.cx) * sn + (z - L.cz) * c;
    const ld = (Math.hypot(qx / L.rx, qz / L.rz) - 1) * Math.min(L.rx, L.rz);
    return Math.min(best, ld);
  }

  // Weight (0..1) of district i at a point (no noise; GPU version adds edge noise).
  districtWeight(i, x, z) {
    const d = DISTRICTS[i];
    const c = Math.cos(-d.angle), s = Math.sin(-d.angle);
    const qx = (x - d.cx) * c - (z - d.cz) * s, qz = (x - d.cx) * s + (z - d.cz) * c;
    const e = Math.hypot(qx / d.rx, qz / d.rz);
    return smoothstep(1.0, 0.72, e);
  }

  // Returns {index, weight} of the dominant district or index -1.
  districtAt(x, z) {
    let bi = -1, bw = 0;
    for (let i = 0; i < DISTRICTS.length; i++) {
      const w = this.districtWeight(i, x, z);
      if (w > bw) { bw = w; bi = i; }
    }
    return { index: bi, weight: bw };
  }

  // Distance from point to a polyline of {x,z} points.
  static polyDist(pts, x, z) {
    let best = 1e9;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const bax = b.x - a.x, baz = b.z - a.z;
      const h = clamp(((x - a.x) * bax + (z - a.z) * baz) / (bax * bax + baz * baz || 1), 0, 1);
      const d = Math.hypot(x - a.x - bax * h, z - a.z - baz * h);
      if (d < best) best = d;
    }
    return best;
  }

  // Position on a route at arc length s: writes into out {x,y,z,dx,dz} (no allocation).
  routeSample(route, s, out) {
    const pts = route.dense;
    s = ((s % route.length) + route.length) % route.length;
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].s <= s) lo = m; else hi = m; }
    const a = pts[lo], b = pts[hi];
    const t = (s - a.s) / Math.max(b.s - a.s, 1e-6);
    out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t; out.z = a.z + (b.z - a.z) * t;
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    out.dx = (b.x - a.x) / len; out.dz = (b.z - a.z) / len;
    return out;
  }

  // ---------------- colliders (yaw-rotated boxes). Used for walking/flying collision.

  addCollider(cx, cy, cz, hx, hy, hz, angle = 0) {
    const c = { cx, cy, cz, hx, hy, hz, cos: Math.cos(angle), sin: Math.sin(angle) };
    this.colliders.push(c);
    const r = Math.hypot(hx, hz);
    const C = 64;
    const x0 = Math.floor((cx - r) / C), x1 = Math.floor((cx + r) / C);
    const z0 = Math.floor((cz - r) / C), z1 = Math.floor((cz + r) / C);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const k = i * 100003 + j;
      let cell = this.colliderCells.get(k);
      if (!cell) { cell = []; this.colliderCells.set(k, cell); }
      cell.push(c);
    }
    return c;
  }

  collidersNear(x, z) {
    const k = Math.floor(x / 64) * 100003 + Math.floor(z / 64);
    return this.colliderCells.get(k);
  }

  // ---------------- lots

  _isReserved(x, z, margin) {
    for (const L of LANDMARKS) if (L.r > 0 && Math.hypot(x - L.x, z - L.z) < L.r + margin) return true;
    for (const b of BRIDGES) {
      // bridge approach corridor
      const d = World.polyDist([{ x: b.ax, z: b.az }, { x: b.bx, z: b.bz }], x, z);
      if (d < b.width * 0.5 + margin + 6) return true;
    }
    for (const r of ROUTES) if (World.polyDist(r.dense, x, z) < 12 + margin) {
      // allow the monorail station building site to be handled by the traffic module
      return true;
    }
    if (World.polyDist([{ x: CABLEWAY.ax, z: CABLEWAY.az }, { x: CABLEWAY.bx, z: CABLEWAY.bz }], x, z) < 14 + margin) return true;
    if (Math.hypot(x - MONORAIL_STATION.x, z - MONORAIL_STATION.z) < 45 + margin) return true;
    return false;
  }

  _buildLots() {
    const R = rng(1234);
    const lots = this.lots;
    DISTRICTS.forEach((d, di) => {
      if (!d.block) return;
      const ca = Math.cos(d.angle), sa = Math.sin(d.angle);
      const toWorld = (lx, lz) => [d.cx + lx * ca - lz * sa, d.cz + lx * sa + lz * ca];
      const nI = Math.ceil(Math.max(d.rx, d.rz) / d.block) + 1;
      const inner = d.block - d.road - 6; // 3 m sidewalk each side
      for (let i = -nI; i < nI; i++) for (let j = -nI; j < nI; j++) {
        const lcx = (i + 0.5) * d.block, lcz = (j + 0.5) * d.block;
        const [wx, wz] = toWorld(lcx, lcz);
        const dom = this.districtAt(wx, wz);
        if (dom.index !== di || dom.weight < 0.55) continue;
        // subdivision pattern
        let nx = 1, nz = 1;
        const r = R();
        if (d.type === DT.HILLSIDE) { nx = 2; nz = r < 0.6 ? 2 : 1; }
        else if (d.type === DT.URBAN) { nx = r < 0.5 ? 2 : 1; nz = r < 0.8 ? 2 : 1; }
        else if (d.type === DT.BUND) { nx = 1; nz = r < 0.5 ? 2 : 1; }
        else if (d.type === DT.CBD) { nx = r < 0.25 ? 2 : 1; nz = 1; }
        const gap = 4;
        const sw = (inner - gap * (nx - 1)) / nx, sd = (inner - gap * (nz - 1)) / nz;
        for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
          const lx = lcx - inner / 2 + sw / 2 + a * (sw + gap);
          const lz = lcz - inner / 2 + sd / 2 + b * (sd + gap);
          const [x, z] = toWorld(lx, lz);
          if (this._isReserved(x, z, Math.max(sw, sd) * 0.5)) continue;
          let gMin = 1e9, gMax = -1e9, ok = true;
          for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) {
            const [px, pz] = toWorld(lx + u * sw * 0.5, lz + v * sd * 0.5);
            const h = this.heightAt(px, pz);
            if (h < 2.5) ok = false;
            gMin = Math.min(gMin, h); gMax = Math.max(gMax, h);
          }
          if (!ok) continue;
          const wdist = this.waterDist(x, z);
          if (wdist < 10) continue;
          lots.push({ x, z, w: sw, d: sd, angle: d.angle, district: di, type: d.type, gMin, gMax, seed: (R() * 1e9) | 0, waterDist: wdist, distFromCenter: Math.hypot(x - d.cx, z - d.cz) / Math.max(d.rx, d.rz) });
        }
      }
    });
  }

  // Resolve viewpoints with terrain heights; computes yaw/pitch toward target.
  _resolvePoses() {
    for (const p of POSES) {
      const [x, y, z] = p.pos;
      const py = p.rel ? this.heightAt(x, z) + y : y;
      const [tx, ty, tz] = p.target;
      const dx = tx - x, dy = ty - py, dz = tz - z;
      p.resolved = { x, y: py, z, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
    }
  }

  _resolveRoutes() {
    for (const r of ROUTES) {
      for (const p of r.dense) {
        const g = this.heightAt(p.x, p.z);
        p.y = Math.max(g, 0) + r.clearance;
        if (g < 3) p.y = Math.max(p.y, 32); // over water
      }
      // smooth heights so tracks do not follow every bump
      for (let pass = 0; pass < 6; pass++) {
        for (let i = 1; i < r.dense.length - 1; i++) {
          const a = r.dense[i - 1], b = r.dense[i], c = r.dense[i + 1];
          b.y = Math.max(b.y * 0.5 + (a.y + c.y) * 0.25, this.heightAt(b.x, b.z) + r.clearance * 0.7);
        }
      }
    }
  }

  // ---------------- GPU generation

  async generate(device) {
    // uniforms: districts + lake
    const u = new Float32Array(MAX_DISTRICTS * 12 + 12);
    DISTRICTS.forEach((d, i) => {
      u.set([d.cx, d.cz, d.rx, d.rz, d.angle, d.block, d.road, d.type, d.target, d.flatten, d.bank, i * 17.3], i * 12);
    });
    const o = MAX_DISTRICTS * 12;
    u[o] = DISTRICTS.length;
    u.set([LAKE.cx, LAKE.cz, LAKE.rx, LAKE.rz], o + 4);
    u[o + 8] = LAKE.angle;
    this.worldUniformData = u; // reused for the frame-level world uniform (same layout up to count)
    const ubuf = device.createBuffer({ size: u.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(ubuf, 0, u);

    const segData = new Float32Array(this.segs.length * 8);
    this.segs.forEach((s, i) => segData.set([s[0], s[1], s[2], s[3], s[4], s[5], s[6], 0], i * 8));
    const sbuf = device.createBuffer({ size: segData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(sbuf, 0, segData);

    this.infoTex = device.createTexture({ size: [INFO.RES, INFO.RES], format: 'rgba16float', usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING });
    this.heightTex = device.createTexture({ size: [TERRAIN.RES, TERRAIN.RES], format: 'r32float', usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC });

    const g0layout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    ] });
    const g0 = device.createBindGroup({ layout: g0layout, entries: [{ binding: 0, resource: { buffer: ubuf } }, { binding: 1, resource: { buffer: sbuf } }] });

    const infoLayout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float' } },
    ] });
    const heightLayout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'r32float' } },
    ] });
    const infoPipe = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [g0layout, infoLayout] }),
      compute: { module: shader(device, WGSL_LIB + GEN_COMMON + GEN_INFO, 'gen-info'), entryPoint: 'main' },
    });
    const heightPipe = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [g0layout, heightLayout] }),
      compute: { module: shader(device, WGSL_LIB + GEN_COMMON + GEN_HEIGHT, 'gen-height'), entryPoint: 'main' },
    });
    const samp = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const enc = device.createCommandEncoder();
    let pass = enc.beginComputePass();
    pass.setPipeline(infoPipe);
    pass.setBindGroup(0, g0);
    pass.setBindGroup(1, device.createBindGroup({ layout: infoLayout, entries: [{ binding: 0, resource: this.infoTex.createView() }] }));
    pass.dispatchWorkgroups(INFO.RES / 8, INFO.RES / 8);
    pass.end();
    pass = enc.beginComputePass();
    pass.setPipeline(heightPipe);
    pass.setBindGroup(0, g0);
    pass.setBindGroup(1, device.createBindGroup({ layout: heightLayout, entries: [
      { binding: 0, resource: this.infoTex.createView() }, { binding: 1, resource: samp }, { binding: 2, resource: this.heightTex.createView() }] }));
    pass.dispatchWorkgroups(TERRAIN.RES / 8, TERRAIN.RES / 8);
    pass.end();

    const bytes = TERRAIN.RES * TERRAIN.RES * 4;
    const rb = device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    enc.copyTextureToBuffer({ texture: this.heightTex }, { buffer: rb, bytesPerRow: TERRAIN.RES * 4 }, [TERRAIN.RES, TERRAIN.RES]);
    device.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ);
    this.heights = new Float32Array(rb.getMappedRange().slice(0));
    rb.unmap(); rb.destroy(); sbuf.destroy(); ubuf.destroy();

    this._resolveRoutes();
    this._buildLots();
    this._resolvePoses();
  }
}

export function showState(t) {
  // Returns light show intensity (0..1) and seconds since show start.
  const c = ((t % SHOW_PERIOD) + SHOW_PERIOD) % SHOW_PERIOD;
  const s = c - SHOW_START;
  const k = s < 0 || s > SHOW_LEN ? 0 : smoothstep(0, 3, s) * (1 - smoothstep(SHOW_LEN - 4, SHOW_LEN, s));
  return { intensity: k, time: Math.max(s, 0) };
}
