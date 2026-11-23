// Boats on the rivers: ferries, Chongqing-style night-cruise tour boats with LED outlines, cargo barges and small
// sightseeing boats circling in front of the Bund. Driven by the water module (init / update / gbuffer).
//  - motion along dense river centerlines (lanes keep to the right of travel), loops for the Bund boats
//  - instanced procedural meshes, bobbing with correct motion vectors
//  - dynamic point lights for the larger boats, wake data for the water shader, audio sources

import { RIVERS } from './world.js';
import { catmullRom, rng } from './math.js';

export const MAX_BOATS = 32;

// Read by the water shader (wakes): a = x, z, dir x, dir z   b = speed, half length, half beam, active
export const WGSL_BOAT_STRUCT = /* wgsl */ `
struct Boat { a: vec4f, b: vec4f };
struct Wakes { info: vec4f, b: array<Boat, ${MAX_BOATS}> }; // info.x = number of boats near the camera
`;

const TYPES = [
  { name: 'ferry', L: 36, B: 9, lights: 1, gain: 0.6, speed: 5.0 },
  { name: 'tour', L: 58, B: 13, lights: 2, gain: 0.75, speed: 3.2 },
  { name: 'cargo', L: 80, B: 14, lights: 1, gain: 0.9, speed: 3.0 },
  { name: 'sight', L: 24, B: 6.5, lights: 1, gain: 0.4, speed: 4.0 },
];

const BOAT_WGSL = /* wgsl */ `
struct Inst { a: vec4f, b: vec4f, c: vec4f, d: vec4f };
// a: x, z, heading, type   b: prev x, prev z, prev heading, seed   c: led A rgb, lit fraction   d: led B rgb, led mode
@group(1) @binding(0) var<storage, read> inst: array<Inst>;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) lp: vec3f,
  @location(3) col: vec3f,
  @location(4) @interpolate(flat) kind: f32,
  @location(5) @interpolate(flat) ii: u32,
  @location(6) pwp: vec3f,
  @location(7) ln: vec3f,
};

fn bob(v: vec3f, seed: f32, t: f32) -> vec3f {
  let pitch = sin(t * 0.71 + seed) * 0.010;
  let roll = sin(t * 0.53 + seed * 1.7) * 0.016;
  let cp = cos(pitch); let sp = sin(pitch);
  var q = vec3f(v.x * cp - v.y * sp, v.x * sp + v.y * cp, v.z);
  let cr = cos(roll); let sr = sin(roll);
  q = vec3f(q.x, q.y * cr - q.z * sr, q.y * sr + q.z * cr);
  return q;
}
fn heave(seed: f32, t: f32) -> f32 { return sin(t * 0.9 + seed * 2.3) * 0.07; }

@vertex fn vs(@location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) col: vec3f, @location(3) kind: f32,
              @builtin(instance_index) ii: u32) -> VOut {
  let I = inst[ii];
  let t = time();
  let tp = t - F.camFwd.w;
  let seed = I.b.w;
  let q = bob(pos, seed, t);
  let xz = rot2(I.a.z) * q.xz;
  let wp = vec3f(I.a.x + xz.x, q.y + heave(seed, t), I.a.y + xz.y);
  let qp = bob(pos, seed, tp);
  let pxz = rot2(I.b.z) * qp.xz;
  let pwp = vec3f(I.b.x + pxz.x, qp.y + heave(seed, tp), I.b.y + pxz.y);
  let qn = bob(nrm, seed, t);
  let nxz = rot2(I.a.z) * qn.xz;
  var o: VOut;
  o.pos = F.viewProj * vec4f(wp, 1.0);
  o.wp = wp; o.pwp = pwp;
  o.n = vec3f(nxz.x, qn.y, nxz.y);
  o.ln = nrm;
  o.lp = pos; o.col = col; o.kind = kind; o.ii = ii;
  return o;
}

// Thin emissive band that never gets thinner than a pixel (energy-preserving widening: no shimmer).
fn band(y: f32, y0: f32, y1: f32, fw: f32) -> f32 {
  let w = max(fw, 1e-4);
  let c = 0.5 * (y0 + y1); let h = 0.5 * (y1 - y0);
  let hw = max(h, w * 0.75);
  return (1.0 - smoothstep(hw - w * 0.5, hw + w * 0.5, abs(y - c))) * (h / hw);
}

@fragment fn fs(i: VOut) -> GOut {
  let I = inst[i.ii];
  let t = time();
  let n = normalize(i.n);
  let lp = i.lp;
  let seed = I.b.w;
  var albedo = i.col;
  var emis = vec3f(0.0);
  var rough = 0.45;
  var metal = 0.0;
  let k = i.kind;
  let showPulse = 1.0 + F.show.x * (0.6 + 1.6 * exp(-F.show.z * 5.0));
  let mode = I.d.w;
  // LED color: chase along the length between the two instance colors
  let chase = 0.5 + 0.5 * sin(lp.x * 0.35 - t * 2.4 + seed + F.show.w * 1.7 * F.show.x);
  let led = mix(I.c.rgb, I.d.rgb, chase) * 7.0 * showPulse * select(0.0, 1.0, mode > 0.5);
  let side = abs(i.ln.y) < 0.5;
  let fwy = fwidth(lp.y);
  if (k < 0.5) {
    // plain painted steel
  } else if (k < 1.5) {
    // cabin walls: storeys of 2.4 m starting at the deck, windows + LED eave band
    rough = 0.3;
    if (side) {
      let u = select(lp.z, lp.x, abs(i.ln.z) > 0.5);
      let sy = (lp.y - 1.4) / 2.4;
      let fy = fract(sy);
      let row = floor(sy);
      let fu = fract(u / 1.5);
      let win = smoothstep(0.08, 0.14, fu) * (1.0 - smoothstep(0.86, 0.92, fu)) * smoothstep(0.2, 0.26, fy) * (1.0 - smoothstep(0.78, 0.84, fy));
      let h = hash21(vec2f(floor(u / 1.5), row) + seed * 13.0);
      let lit = step(h, I.c.w);
      let warm = mix(vec3f(1.0, 0.62, 0.3), vec3f(1.0, 0.85, 0.65), hash21(vec2f(row, seed)));
      emis = warm * win * lit * 2.6;
      albedo = mix(albedo, vec3f(0.02, 0.025, 0.03), win);
      emis += led * band(fy, 0.9, 0.97, fwy / 2.4) * 0.8;
    }
  } else if (k < 2.5) {
    // hull: LED band below the gunwale, dark boot-top at the waterline
    rough = 0.4;
    if (side) {
      emis = led * band(lp.y, 0.95, 1.2, fwy);
      albedo = mix(albedo, vec3f(0.25, 0.03, 0.03), 1.0 - smoothstep(0.1, 0.25, lp.y));
    }
  } else if (k < 3.5) {
    // lamps (vertex color is the emission color)
    emis = i.col * 9.0;
    albedo = vec3f(0.1);
  } else {
    // roof slab: LED edge band on its sides
    rough = 0.35;
    if (side) { emis = led * 1.2; }
  }
  return gbuf(albedo, rough, n, metal, emis, 1.0, motionVector(i.wp, i.pwp), 0.0, 0.7);
}
`;

// ---------------------------------------------------------------- mesh building (local frame: +x bow, +y up, z beam)

class Mesh {
  constructor() { this.v = []; this.i = []; }
  // Quad from 4 corners (any order around the face). Winding is chosen so the face points along n.
  quad(a, b, c, d, n, col, kind) {
    const base = this.v.length / 10;
    for (const p of [a, b, c, d]) this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], kind);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] > 0) this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else this.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  box(x0, y0, z0, x1, y1, z1, col, kind, top = true) {
    const P = (x, y, z) => [x, y, z];
    this.quad(P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1), [1, 0, 0], col, kind);
    this.quad(P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1), [-1, 0, 0], col, kind);
    this.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), [0, 0, 1], col, kind);
    this.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0), [0, 0, -1], col, kind);
    if (top) this.quad(P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1), [0, 1, 0], col, kind === 1 ? 0 : kind);
  }
  // Hull: pointed bow, extruded from below the waterline to the gunwale, with a deck cap.
  hull(L, B, H, D, bow, col, deckCol) {
    const hl = L / 2, hb = B / 2;
    const pts = [[-hl, -hb * 0.9], [-hl + 2, -hb], [hl - bow, -hb], [hl - bow * 0.35, -hb * 0.55], [hl, 0],
      [hl - bow * 0.35, hb * 0.55], [hl - bow, hb], [-hl + 2, hb], [-hl, hb * 0.9]];
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k], b = pts[(k + 1) % pts.length];
      const ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez);
      // outward normal (polygon is clockwise seen from +y in x/z => outward = (ez, -ex)) with a slight flare
      let nx = ez / l, nz = -ex / l;
      const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
      if (nx * cx + nz * cz < 0) { nx = -nx; nz = -nz; }
      this.quad([a[0], -D, a[1]], [b[0], -D, b[1]], [b[0], H, b[1]], [a[0], H, a[1]], [nx, 0, nz], col, 2);
    }
    // deck cap (fan from the center)
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k], b = pts[(k + 1) % pts.length];
      const base = this.v.length / 10;
      for (const p of [[0, H, 0], [a[0], H, a[1]], [b[0], H, b[1]]]) this.v.push(p[0], p[1], p[2], 0, 1, 0, deckCol[0], deckCol[1], deckCol[2], 0);
      // check winding against +y
      const e1 = [a[0], a[1]], e2 = [b[0], b[1]];
      const cy = e1[1] * e2[0] - e1[0] * e2[1]; // y component of (a - c) x (b - c) for c = origin
      if (cy > 0) this.i.push(base, base + 1, base + 2); else this.i.push(base, base + 2, base + 1);
    }
  }
}

function buildType(type) {
  const m = new Mesh();
  const white = [0.55, 0.56, 0.58], dark = [0.06, 0.07, 0.08], deck = [0.16, 0.12, 0.09];
  const lampW = [1.0, 0.9, 0.75], red = [1.0, 0.05, 0.03], green = [0.05, 1.0, 0.2];
  if (type === 0) { // ferry
    m.hull(36, 9, 1.4, 1.8, 6, [0.08, 0.22, 0.26], deck);
    m.box(-15, 1.4, -3.9, 10, 4.0, 3.9, white, 1);
    m.box(-15.3, 4.0, -4.2, 10.3, 4.25, 4.2, white, 4);
    m.box(-11, 4.25, -3.2, 6, 6.6, 3.2, white, 1);
    m.box(-11.3, 6.6, -3.5, 6.3, 6.85, 3.5, white, 4);
    m.box(2, 6.85, -2.0, 5.5, 8.7, 2.0, white, 1);
    m.box(-6, 6.85, -0.7, -4.6, 9.6, 0.7, [0.6, 0.1, 0.08], 0);
    m.box(4.5, 8.7, -0.12, 4.75, 11.5, 0.12, dark, 0);
    m.box(4.4, 11.5, -0.22, 4.85, 11.9, 0.22, lampW, 3);
    m.box(3.5, 8.2, -2.25, 4.0, 8.6, -2.0, red, 3);
    m.box(3.5, 8.2, 2.0, 4.0, 8.6, 2.25, green, 3);
  } else if (type === 1) { // night-cruise tour boat
    m.hull(58, 13, 1.6, 2.0, 10, [0.05, 0.05, 0.07], deck);
    m.box(-26, 1.6, -5.8, 18, 4.2, 5.8, [0.35, 0.3, 0.26], 1);
    m.box(-26.6, 4.2, -6.4, 18.6, 4.5, 6.4, [0.5, 0.35, 0.12], 4);
    m.box(-22, 4.5, -5.0, 13, 7.0, 5.0, [0.35, 0.3, 0.26], 1);
    m.box(-22.6, 7.0, -5.6, 13.6, 7.3, 5.6, [0.5, 0.35, 0.12], 4);
    m.box(-15, 7.3, -3.8, 7, 9.6, 3.8, [0.35, 0.3, 0.26], 1);
    m.box(-16, 9.6, -4.6, 8, 9.95, 4.6, [0.5, 0.35, 0.12], 4);
    // pavilion roof ridge and red lanterns along the upper deck
    m.box(-12, 9.95, -1.2, 4, 10.8, 1.2, [0.45, 0.08, 0.05], 4);
    for (let k = 0; k < 8; k++) {
      const x = -20 + k * 4.6;
      m.box(x, 5.6, -5.35, x + 0.7, 6.4, -4.95, [1.0, 0.18, 0.06], 3);
      m.box(x, 5.6, 4.95, x + 0.7, 6.4, 5.35, [1.0, 0.18, 0.06], 3);
    }
    m.box(14, 10.8, -0.15, 14.3, 13, 0.15, dark, 0);
    m.box(13.9, 13, -0.25, 14.4, 13.4, 0.25, lampW, 3);
  } else if (type === 2) { // cargo barge
    m.hull(80, 14, 2.0, 3.0, 8, [0.12, 0.1, 0.09], [0.1, 0.08, 0.07]);
    const cols = [[0.45, 0.08, 0.05], [0.06, 0.18, 0.35], [0.5, 0.25, 0.05], [0.12, 0.3, 0.15]];
    let c = 0;
    for (let x = -30; x < 30; x += 12.4) {
      for (let z = -1; z <= 1; z += 2) {
        const h = 2.0 + 2.6 * (1 + ((c * 7) % 3 === 0 ? 1 : 0));
        m.box(x, 2.0, z < 0 ? -6 : 0.2, x + 12, h, z < 0 ? -0.2 : 6, cols[c % 4], 0);
        c++;
      }
    }
    m.box(-39, 2.0, -5.5, -33, 7.5, 5.5, white, 1);
    m.box(-39.3, 7.5, -5.8, -32.7, 7.75, 5.8, dark, 0);
    m.box(-37, 7.75, -0.15, -36.7, 11, 0.15, dark, 0);
    m.box(-37.1, 11, -0.25, -36.6, 11.4, 0.25, lampW, 3);
    m.box(-34, 7.0, -5.75, -33.5, 7.4, -5.5, red, 3);
    m.box(-34, 7.0, 5.5, -33.5, 7.4, 5.75, green, 3);
    m.box(38, 2.0, -0.3, 38.6, 3.6, 0.3, lampW, 3);
  } else { // small sightseeing boat
    m.hull(24, 6.5, 1.2, 1.2, 5, [0.85, 0.85, 0.88], deck);
    m.box(-9, 1.2, -2.6, 6, 3.5, 2.6, [0.25, 0.3, 0.35], 1);
    m.box(-9.4, 3.5, -3.0, 6.4, 3.75, 3.0, [0.8, 0.8, 0.82], 4);
    m.box(4, 3.75, -0.1, 4.2, 5.5, 0.1, dark, 0);
    m.box(3.9, 5.5, -0.2, 4.3, 5.8, 0.2, lampW, 3);
  }
  return m;
}

// ---------------------------------------------------------------- river paths

function buildPath(points) {
  const pts = catmullRom(points, 14);
  const n = pts.length;
  const p = { x: new Float32Array(n), z: new Float32Array(n), w: new Float32Array(n), s: new Float32Array(n), n };
  let s = 0;
  for (let i = 0; i < n; i++) {
    p.x[i] = pts[i][0]; p.z[i] = pts[i][1]; p.w[i] = pts[i][2];
    if (i > 0) s += Math.hypot(p.x[i] - p.x[i - 1], p.z[i] - p.z[i - 1]);
    p.s[i] = s;
  }
  p.length = s;
  // usable range: inside the mountain ring
  let lo = -1, hi = -1;
  for (let i = 0; i < n; i++) if (Math.hypot(p.x[i] - 300, p.z[i] + 300) < 5300) { if (lo < 0) lo = i; hi = i; }
  p.sMin = p.s[Math.max(lo, 0)]; p.sMax = p.s[Math.max(hi, 0)];
  return p;
}

// out = [x, z, tx, tz, width]
function pathSample(p, s, out) {
  s = Math.min(Math.max(s, 0), p.length);
  let lo = 0, hi = p.n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p.s[m] <= s) lo = m; else hi = m; }
  const t = (s - p.s[lo]) / Math.max(p.s[hi] - p.s[lo], 1e-6);
  out[0] = p.x[lo] + (p.x[hi] - p.x[lo]) * t;
  out[1] = p.z[lo] + (p.z[hi] - p.z[lo]) * t;
  const dx = p.x[hi] - p.x[lo], dz = p.z[hi] - p.z[lo], l = Math.sqrt(dx * dx + dz * dz) || 1;
  out[2] = dx / l; out[3] = dz / l;
  out[4] = p.w[lo] + (p.w[hi] - p.w[lo]) * t;
  return out;
}

function nearestS(p, x, z) {
  let best = 1e18, bs = 0;
  for (let i = 0; i < p.n; i++) { const d = (p.x[i] - x) ** 2 + (p.z[i] - z) ** 2; if (d < best) { best = d; bs = p.s[i]; } }
  return bs;
}

// ---------------------------------------------------------------- module

const tmpA = new Float32Array(5), tmpB = new Float32Array(5);

export default {
  async init(ctx) {
    const d = ctx.device, world = ctx.world;
    const R = rng(4242);
    const great = RIVERS[0].points, jade = RIVERS[1].points;
    const pathA = buildPath(great);
    // Jade River flowing into the Great River and on downstream (east)
    const k = great.findIndex((q) => q[0] >= 1250);
    const pathB = buildPath(jade.concat(great.slice(k)));
    this.paths = [pathA, pathB];
    this.bundS = nearestS(pathA, 2290, -1000);

    const q = ctx.quality.level;
    const specs = [];
    const addPath = (pi, type, n) => { for (let i = 0; i < n; i++) specs.push({ type, path: pi, loop: false }); };
    addPath(0, 2, q >= 1 ? 4 : 2); addPath(0, 0, q >= 1 ? 4 : 2); addPath(0, 1, 3);
    addPath(1, 2, 2); addPath(1, 0, 3); addPath(1, 1, 2);
    for (let i = 0; i < (q >= 1 ? 5 : 3); i++) specs.push({ type: 3, path: 0, loop: true });
    specs.push({ type: 1, path: 0, loop: true });
    specs.sort((a, b) => a.type - b.type);
    const boats = specs.slice(0, MAX_BOATS);
    const palette = [[0.1, 0.9, 1.0], [1.0, 0.15, 0.6], [1.0, 0.7, 0.15], [0.5, 0.2, 1.0], [0.2, 1.0, 0.45], [1.0, 0.25, 0.1]];
    const loopCount = boats.filter((b) => b.loop).length;
    let li = 0;
    boats.forEach((b, i) => {
      const T = TYPES[b.type];
      const p = this.paths[b.path];
      b.seed = R() * 100;
      b.dir = R() < 0.5 ? 1 : -1;
      b.speed = T.speed * (0.85 + R() * 0.3) + (b.dir > 0 ? 1.0 : -0.6);
      b.s0 = p.sMin + (i * 0.618 + R() * 0.2) % 1 * (p.sMax - p.sMin);
      b.lane = 0.16 + R() * 0.12;
      if (b.loop) {
        b.theta0 = (li / loopCount) * Math.PI * 2 + R() * 0.5;
        b.Lh = 300 + R() * 250; b.Rl = 30 + R() * 25; b.base = -55 + R() * 30;
        b.sMid = this.bundS + (R() - 0.5) * 300;
        b.omega = (T.speed * 0.8) / Math.sqrt((b.Lh * b.Lh + b.Rl * b.Rl) / 2) * (li % 2 ? 1 : -1);
        li++;
      }
      const ca = palette[(R() * palette.length) | 0], cb = palette[(R() * palette.length) | 0];
      b.ledA = ca; b.ledB = cb;
      b.ledMode = b.type === 1 || b.type === 3 ? 1 : b.type === 0 ? (R() < 0.5 ? 1 : 0) : 0;
      if (b.type === 0) { b.ledA = [0.1, 0.8, 1.0]; b.ledB = [0.1, 0.4, 1.0]; }
      if (b.type === 1) { b.ledA = [1.0, 0.65, 0.12]; b.ledB = R() < 0.5 ? [1.0, 0.1, 0.2] : [0.15, 0.8, 1.0]; }
      b.lit = b.type === 1 ? 0.95 : b.type === 3 ? 0.9 : b.type === 0 ? 0.75 : 0.35;
      b.x = 0; b.z = 0; b.h = 0; b.vx = 0; b.vz = 0;
      b.audio = { kind: 'boat', x: 0, y: 2, z: 0, vx: 0, vy: 0, vz: 0, gain: T.gain };
      world.audioSources.push(b.audio);
    });
    this.boats = boats;
    this.count = boats.length;
    // keep boats from sitting on top of a viewpoint camera at its capture time
    const tmp = new Float32Array(3);
    for (const b of boats) {
      for (let tries = 0; tries < 12; tries++) {
        let clash = false;
        for (const p of world.poses) {
          const r = p.resolved;
          if (!r) continue;
          this._pose(b, p.t, tmp);
          if (Math.hypot(tmp[0] - r.x, tmp[1] - r.z) < 110) { clash = true; break; }
        }
        if (!clash) break;
        if (b.loop) b.theta0 += 0.5; else b.s0 += 180;
      }
    }

    // meshes (one shared vertex buffer, one range per type)
    const V = [], I = [];
    this.ranges = [];
    for (let t = 0; t < 4; t++) {
      const m = buildType(t);
      const baseV = V.length / 10;
      this.ranges.push({ first: I.length, count: m.i.length, base: baseV });
      for (const x of m.v) V.push(x);
      for (const x of m.i) I.push(x);
    }
    this.vbuf = d.createBuffer({ size: V.length * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.vbuf, 0, new Float32Array(V));
    this.ibuf = d.createBuffer({ size: I.length * 4, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.ibuf, 0, new Uint32Array(I));
    // instances per type
    this.typeFirst = [0, 0, 0, 0]; this.typeCount = [0, 0, 0, 0];
    for (let t = 3; t >= 0; t--) {
      const f = boats.findIndex((b) => b.type === t);
      this.typeFirst[t] = f < 0 ? 0 : f;
      this.typeCount[t] = boats.filter((b) => b.type === t).length;
    }

    this.instData = new Float32Array(MAX_BOATS * 16);
    this.instBuf = d.createBuffer({ size: this.instData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.wakeData = new Float32Array(4 + MAX_BOATS * 8);
    this.wakeBuf = d.createBuffer({ size: this.wakeData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.wakeBuf, 0, this.wakeData);
    this.layout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }] });
    this.group = d.createBindGroup({ layout: this.layout, entries: [{ binding: 0, resource: { buffer: this.instBuf } }] });
    this.pipe = ctx.renderer.gbufferPipeline({
      label: 'boats', code: BOAT_WGSL, groups: [this.layout],
      buffers: [{ arrayStride: 40, attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x3' }, { shaderLocation: 3, offset: 36, format: 'float32' }] }],
    });

    // dynamic lights
    let nl = 0;
    for (const b of boats) nl += TYPES[b.type].lights;
    this.lightBase = ctx.lights.reserve(nl);
    this.lightCount = nl;
  },

  // Boat placement at time t: writes x, z, heading into out [x, z, heading].
  _pose(b, t, out) {
    const p = this.paths[b.path];
    if (b.loop) {
      const th = b.theta0 + t * b.omega;
      pathSample(p, b.sMid + b.Lh * Math.cos(th), tmpA);
      const lat = b.base + b.Rl * Math.sin(th);
      out[0] = tmpA[0] - tmpA[3] * lat; out[1] = tmpA[1] + tmpA[2] * lat;
      pathSample(p, b.sMid + b.Lh * Math.cos(th + 0.02 * Math.sign(b.omega)), tmpB);
      const lat2 = b.base + b.Rl * Math.sin(th + 0.02 * Math.sign(b.omega));
      const x2 = tmpB[0] - tmpB[3] * lat2, z2 = tmpB[1] + tmpB[2] * lat2;
      out[2] = Math.atan2(z2 - out[1], x2 - out[0]);
      return;
    }
    const span = p.sMax - p.sMin;
    let s = b.s0 + b.dir * b.speed * t - p.sMin;
    s = ((s % span) + span) % span + p.sMin;
    pathSample(p, s, tmpA);
    pathSample(p, s + b.dir * 25, tmpB);
    // lane to the right of travel
    const tx = tmpA[2] * b.dir, tz = tmpA[3] * b.dir;
    const lat = tmpA[4] * b.lane;
    out[0] = tmpA[0] - tz * lat; out[1] = tmpA[1] + tx * lat;
    const tx2 = tmpB[2] * b.dir, tz2 = tmpB[3] * b.dir, lat2 = tmpB[4] * b.lane;
    const x2 = tmpB[0] - tz2 * lat2, z2 = tmpB[1] + tx2 * lat2;
    out[2] = Math.atan2(z2 - out[1], x2 - out[0]);
  },

  update(ctx) {
    const t = ctx.time, dt = ctx.dt;
    const D = this.instData, W = this.wakeData;
    const cur = this._cur || (this._cur = new Float32Array(3));
    const prv = this._prv || (this._prv = new Float32Array(3));
    const lights = ctx.lights;
    let li = this.lightBase;
    const show = ctx.show.intensity;
    const cam = ctx.cam;
    let nw = 0;
    for (let i = 0; i < this.count; i++) {
      const b = this.boats[i];
      const T = TYPES[b.type];
      this._pose(b, t, cur);
      this._pose(b, t - (dt > 0 ? dt : 1 / 60), prv);
      const o = i * 16;
      D[o] = cur[0]; D[o + 1] = cur[1]; D[o + 2] = cur[2]; D[o + 3] = b.type;
      if (dt > 0) { D[o + 4] = prv[0]; D[o + 5] = prv[1]; D[o + 6] = prv[2]; }
      else { D[o + 4] = cur[0]; D[o + 5] = cur[1]; D[o + 6] = cur[2]; }
      D[o + 7] = b.seed;
      D[o + 8] = b.ledA[0]; D[o + 9] = b.ledA[1]; D[o + 10] = b.ledA[2]; D[o + 11] = b.lit;
      D[o + 12] = b.ledB[0]; D[o + 13] = b.ledB[1]; D[o + 14] = b.ledB[2]; D[o + 15] = b.ledMode;
      const ch = Math.cos(cur[2]), sh = Math.sin(cur[2]);
      const idt = 1 / (dt > 0 ? dt : 1 / 60);
      const vx = (cur[0] - prv[0]) * idt, vz = (cur[1] - prv[1]) * idt;
      const spd = Math.sqrt(vx * vx + vz * vz);
      // wakes: only boats near the camera are sent to the water shader
      if ((cur[0] - cam.x) * (cur[0] - cam.x) + (cur[1] - cam.z) * (cur[1] - cam.z) < 1700 * 1700) {
        const w = 4 + (nw++) * 8;
        W[w] = cur[0]; W[w + 1] = cur[1]; W[w + 2] = ch; W[w + 3] = sh;
        W[w + 4] = Math.min(spd, 12); W[w + 5] = T.L * 0.5; W[w + 6] = T.B * 0.5; W[w + 7] = 1;
      }
      const a = b.audio;
      a.x = cur[0]; a.z = cur[1]; a.vx = vx; a.vz = vz;
      // lights above the decks
      if (b.type === 0) {
        lights.set(li++, cur[0] - ch * 2, 9.5, cur[1] - sh * 2, 26, 7, 5.5, 4);
      } else if (b.type === 1) {
        const c = b.ledB, pulse = 1 + show * 0.8;
        lights.set(li++, cur[0] + ch * 8, 12, cur[1] + sh * 8, 34, 9 * pulse, 6 * pulse, 2.5 * pulse);
        lights.set(li++, cur[0] - ch * 16, 8, cur[1] - sh * 16, 30, c[0] * 9 * pulse, c[1] * 9 * pulse, c[2] * 9 * pulse);
      } else if (b.type === 2) {
        lights.set(li++, cur[0] - ch * 34, 10, cur[1] - sh * 34, 22, 4, 3.4, 2.6);
      } else {
        const c = b.ledA;
        lights.set(li++, cur[0], 5.5, cur[1], 20, c[0] * 5 + 1, c[1] * 5 + 1, c[2] * 5 + 1);
      }
    }
    ctx.device.queue.writeBuffer(this.instBuf, 0, D.buffer, 0, this.count * 64);
    W[0] = nw;
    ctx.device.queue.writeBuffer(this.wakeBuf, 0, W.buffer, 0, 16 + nw * 32);
  },

  gbuffer(ctx, pass) {
    pass.setPipeline(this.pipe);
    pass.setBindGroup(1, this.group);
    pass.setVertexBuffer(0, this.vbuf);
    pass.setIndexBuffer(this.ibuf, 'uint32');
    for (let t = 0; t < 4; t++) {
      const n = this.typeCount[t];
      if (!n) continue;
      const r = this.ranges[t];
      pass.drawIndexed(r.count, n, r.first, r.base, this.typeFirst[t]);
    }
  },
};
