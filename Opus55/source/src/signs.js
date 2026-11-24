// Neon signs: Hong Kong-style blade signs, fascia neon and lightboxes, billboards, giant LED screens with procedural
// content, and paper lanterns. Glyphs come from a Canvas2D atlas built at init (signAtlas.js). Signs are instanced
// boxes, grouped in spatial cells for CPU culling. Instance buffers are built on the first update so that signage
// requested by later modules (world.shared.signRequests) is included.

import { MeshBuilder, VERTEX_LAYOUT, makeCamTest } from './trafficGeom.js';
import { buildSignAtlas } from './signAtlas.js';
import { placeSigns, selectLights, SIGN_FLOATS } from './signPlace.js';

const SIGN_LIGHT_BUDGET = 2150;
const OWN_SIGN_LIGHTS = 64;     // separate allowance for the Hongyadong complex's sign lights

const SIGN_WGSL = /* wgsl */ `
struct Sign { a: vec4f, b: vec4f, c: vec4f, d: vec4f, e: vec4f, f: vec4f };
@group(1) @binding(0) var<storage, read> signs: array<Sign>;
@group(1) @binding(1) var atlas: texture_2d<f32>;
@group(1) @binding(2) var atlasSamp: sampler;

struct VIn { @location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) uv: vec2f, @location(3) me: vec2f };
struct VOut {
  @builtin(position) cp: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) lp: vec2f,
  @location(3) @interpolate(flat) id: u32,
  @location(4) @interpolate(flat) mat: f32,
};

@vertex fn vs(v: VIn, @builtin(instance_index) ii: u32) -> VOut {
  let Sa = signs[ii].a; let Sb = signs[ii].b; let Sf = signs[ii].f;
  let w = Sb.z; let h = Sb.w;
  let Z = vec3f(Sb.x, 0.0, Sb.y);
  let X = vec3f(Z.z, 0.0, -Z.x);
  let mat = v.me.x;
  var lp: vec3f;
  var o: VOut;
  if (mat > 2.5) {
    if (Sf.z <= 0.0) { o.cp = vec4f(0.0, 0.0, -1.0, 1.0); return o; }
    lp = vec3f(w * 0.5 + v.pos.x * Sf.z, v.pos.y * h + v.me.y, v.pos.z);
  } else {
    lp = vec3f(v.pos.x * w, v.pos.y * h, v.pos.z * Sf.x + Sf.y);
  }
  o.wp = Sa.xyz + X * lp.x + vec3f(0.0, lp.y, 0.0) + Z * lp.z;
  o.n = X * v.nrm.x + vec3f(0.0, v.nrm.y, 0.0) + Z * v.nrm.z;
  o.lp = vec2f(select(-lp.x, lp.x, mat < 0.5), lp.y);
  o.id = ii;
  o.mat = mat;
  o.cp = F.viewProj * vec4f(o.wp, 1.0);
  return o;
}

fn ledProgram(prog: i32, uv: vec2f, t: f32, c1: vec3f, c2: vec3f, S: Sign) -> vec3f {
  if (prog == 0) {
    // liquid plasma with drifting koi-like blobs
    let p = uv * vec2f(3.0, 1.7);
    var v = sin(p.x * 3.0 + t) + sin(p.y * 4.0 - t * 1.3) + sin((p.x + p.y) * 2.5 + t * 0.7) + sin(length(p - vec2f(1.5, 0.85)) * 6.0 - t * 2.0);
    let col = 0.5 + 0.5 * cos(TAU * (v * 0.12 + vec3f(0.0, 0.33, 0.67)) + t * 0.3);
    var c = mix(col, c1, 0.35);
    for (var k = 0; k < 3; k++) {
      let fk = f32(k);
      let q = vec2f(fract(0.2 + fk * 0.31 + t * (0.05 + fk * 0.02)) * 1.3 - 0.15, 0.5 + 0.28 * sin(t * 0.7 + fk * 2.1));
      let d = length((uv - q) * vec2f(1.0, 0.56) * vec2f(1.0, 2.2));
      c = mix(c, vec3f(1.0, 0.45, 0.1), smoothstep(0.06, 0.03, d));
    }
    return c;
  }
  if (prog == 1) {
    // scrolling slogan on a gradient
    var bg = mix(c1 * 0.25, c2 * 0.6, uv.y) * (0.8 + 0.2 * sin(uv.x * 20.0 + t * 3.0));
    let u = fract(uv.x * 0.55 + t * 0.09);
    let tuv = vec2f(u * 1.6 - 0.3, (uv.y - 0.15) / 0.7);
    if (all(tuv > vec2f(0.0)) && all(tuv < vec2f(1.0))) {
      let m = textureSampleLevel(atlas, atlasSamp, S.c.xy + tuv * S.c.zw, 0.0);
      bg = mix(bg, vec3f(1.0, 0.95, 0.7), m.r) + c2 * m.g * 0.5;
    }
    return bg;
  }
  if (prog == 2) {
    // equalizer bars
    let bar = floor(uv.x * 28.0);
    let bx = fract(uv.x * 28.0);
    let hgt = 0.35 + 0.3 * sin(t * 4.0 + bar * 1.7) * sin(t * 1.7 + bar * 0.45) + 0.25 * sin(t * 9.0 + bar * 3.1);
    let y = 1.0 - uv.y;
    let seg = step(0.2, fract(y * 18.0));
    let lit = step(y, hgt) * step(0.15, bx) * step(bx, 0.85) * seg;
    let col = mix(vec3f(0.1, 1.0, 0.4), vec3f(1.0, 0.1, 0.2), smoothstep(0.2, 0.8, y));
    return col * lit + c1 * 0.05;
  }
  // tunnel rings with a big glyph
  let q = (uv - 0.5) * vec2f(1.78, 1.0);
  let d = length(q);
  let a = atan2(q.y, q.x);
  let r = fract(0.35 / (d + 0.05) - t * 0.6);
  let s = step(0.5, fract(a / TAU * 12.0 + t * 0.2));
  var c = mix(c1, c2, s) * smoothstep(0.0, 0.25, r) * smoothstep(1.0, 0.6, r) * (0.3 + d);
  let tuv = (q / 0.42) * 0.5 + 0.5;
  if (all(tuv > vec2f(0.0)) && all(tuv < vec2f(1.0))) {
    let m = textureSampleLevel(atlas, atlasSamp, S.c.xy + tuv * S.c.zw, 0.0);
    c = mix(c, vec3f(1.0), m.r);
  }
  return c;
}

@fragment fn fs(i: VOut) -> GOut {
  let S = signs[i.id];
  let kind = i32(S.a.w + 0.5);
  let w = S.b.z; let h = S.b.w;
  var c1 = S.d.rgb; let seed = S.d.w;
  let c2 = S.e.rgb;
  let anim = u32(S.e.w + 0.5);
  let mode = anim & 15u;
  let nch = f32((anim >> 4u) & 15u);
  let vert = (anim & 256u) != 0u;
  let margin = S.f.w;
  let t = time();
  let n = normalize(i.n);
  var albedo = vec3f(0.05);
  var rough = 0.5;
  var metal = 0.0;
  var emis = vec3f(0.0);
  // everything that needs derivatives first (uniform control flow)
  let p = i.lp;
  let half = vec2f(w, h) * 0.5;
  let tuv = (vec2f(p.x, -p.y) + half - vec2f(margin)) / max(vec2f(w, h) - 2.0 * margin, vec2f(0.01));
  let auv = S.c.xy + clamp(tuv, vec2f(0.0), vec2f(1.0)) * S.c.zw;
  let gx = dpdx(auv); let gy = dpdy(auv);
  let d = sdBox2(p, half - vec2f(min(0.09, 0.07 * min(w, h))));
  let fwd = fwidth(d);
  let res = vec2f(w, h) / 0.11;
  let px = (vec2f(p.x, -p.y) + half) / vec2f(w, h) * res;
  let fwp = length(fwidth(px));
  if (i.mat > 2.5) {
    return gbuf(vec3f(0.05, 0.05, 0.055), 0.5, n, 0.7, vec3f(0.0), 1.0, motionVector(i.wp, i.wp), 0.0, 0.6);
  }
  if (i.mat > 1.5) {
    // frame / edges of the box
    albedo = c1 * 0.05 + vec3f(0.03);
    if (kind == 4) { albedo = vec3f(0.04); }
    return gbuf(albedo, 0.45, n, 0.5, c1 * 0.04, 1.0, motionVector(i.wp, i.wp), 0.0, 0.6);
  }
  let inside = all(tuv > vec2f(0.0)) && all(tuv < vec2f(1.0));
  var m = textureSampleGrad(atlas, atlasSamp, auv, gx, gy).rg;
  if (!inside) { m = vec2f(0.0); }
  let flick = neonFlicker(seed, t);
  if (kind == 4) {
    // giant LED screen
    let uvq = (floor(px) + 0.5) / res;
    let prog = i32(f32(mode) + floor(t / 14.0 + seed)) % 4;
    var c = ledProgram(prog, uvq, t, c1, c2, S);
    let cell = fract(px) - 0.5;
    let dotm = smoothstep(0.5, 0.25, length(cell));
    let fw = saturate(fwp * 0.9);
    c *= mix(dotm * 1.7, 1.0, fw);
    let edge = min(min(tuv.x, 1.0 - tuv.x), min(tuv.y, 1.0 - tuv.y));
    if (!inside) { return gbuf(vec3f(0.03), 0.4, n, 0.3, vec3f(0.0), 1.0, motionVector(i.wp, i.wp), 0.0, 0.5); }
    return gbuf(vec3f(0.02), 0.3, n, 0.0, c * 2.4, 1.0, motionVector(i.wp, i.wp), 0.0, 0.3);
  }
  // animation
  let ci = floor(select(tuv.x, tuv.y, vert) * nch);
  var onText = 1.0;
  var onBorder = 1.0;
  if (mode == 2u) { let k = floor(t * 2.2 + seed * 3.0) % (nch + 4.0); onText = select(0.04, 1.0, ci <= k); }
  if (mode == 3u) { let b = step(0.22, fract(t * 0.55 + seed * 0.37 + f32(i.id) * 0.013)); onText = b; onBorder = b; }
  if (mode == 4u) { if (ci == floor(hash11u(i.id) * nch)) { onText = 0.03 + 0.5 * step(0.93, hash11u(u32(t * 12.0) + i.id)); } }
  if (mode == 5u) { c1 = mix(c1, c2, 0.5 + 0.5 * sin(t * 1.3 + seed + f32(i.id))); }
  if (mode == 1u) {
    let per = atan2(p.y / h, p.x / w) / TAU;
    onBorder = 0.15 + 0.85 * step(0.45, fract(per * 14.0 - t * 1.6));
  }
  if (kind == 2) {
    // backlit lightbox: colored panel with white text, or white panel with colored text
    let whitePanel = hash11u(i.id * 7u + 3u) > 0.6;
    let grad = 1.0 + 0.3 * (1.0 - abs(tuv.y - 0.5) * 2.0);
    let rim = sdBox2(p, half - vec2f(0.05));
    var panel = select(c1 * 1.25, vec3f(1.05, 1.02, 0.95) * 1.2, whitePanel) * grad;
    var txt = select(vec3f(4.5), c1 * 0.25, whitePanel);
    if (luma(c1) > 0.8 && !whitePanel) { txt = vec3f(0.05, 0.1, 0.35); }
    emis = mix(panel, txt, m.r);
    albedo = vec3f(0.6);
    if (rim > 0.0) { emis = vec3f(0.0); albedo = vec3f(0.08); metal = 0.6; }
    return gbuf(albedo, 0.35, n, metal, emis, 1.0, motionVector(i.wp, i.wp), 0.0, 0.4);
  }
  if (kind == 3) {
    // billboard: graphic gradient with a big slogan
    let diag = fract((tuv.x * 1.6 + tuv.y) * 1.5 - t * 0.05);
    var bg = mix(c1, c2, smoothstep(0.2, 0.8, tuv.x)) * (0.55 + 0.45 * step(0.5, diag));
    bg *= 0.9 + 0.5 * smoothstep(0.6, 1.0, tuv.y);
    emis = mix(bg * 1.2, vec3f(5.0, 4.8, 4.5), m.r) + vec3f(1.0) * m.g * 0.3;
    if (!inside) { emis = c1 * 0.05; }
    return gbuf(vec3f(0.3), 0.4, n, 0.0, emis, 1.0, motionVector(i.wp, i.wp), 0.0, 0.4);
  }
  // neon on a dark backing board (kinds 0, 1, 5)
  let aa = max(fwd, 0.004);
  let tubeR = 0.022 + 0.004 * min(w, h);
  let tube = 1.0 - smoothstep(tubeR - aa, tubeR + aa, abs(d));
  let halo = exp(-abs(d) / 0.06) * 0.4;
  albedo = mix(vec3f(0.018), c1 * 0.07, 0.6);
  rough = 0.55;
  let glass = max(tube, smoothstep(0.3, 0.6, m.r));
  albedo = mix(albedo, vec3f(0.22), glass);
  let core = m.r * m.r;
  let tcol = mix(c1, vec3f(1.0), 0.3 * core);
  emis = flick * (tcol * (m.r * 9.0 + m.g * 1.4) * onText + c2 * (tube * 7.0 + halo) * onBorder);
  // a faint glow spill onto the board around the letters
  emis += flick * c1 * 0.08 * onText;
  return gbuf(albedo, rough, n, metal, emis, 1.0, motionVector(i.wp, i.wp), 0.0, 0.5);
}
`;

const LANTERN_WGSL = /* wgsl */ `
struct Lan { a: vec4f, b: vec4f }; // a: hang point xyz, seed   b: scale, style, sway, heading
@group(1) @binding(0) var<storage, read> lans: array<Lan>;
struct VIn { @location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) uv: vec2f, @location(3) me: vec2f };
struct VOut {
  @builtin(position) cp: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) pwp: vec3f,
  @location(3) lp: vec3f,
  @location(4) @interpolate(flat) info: vec4f,
};
fn swing(L: Lan, t: f32) -> vec2f {
  let a = sin(t * 1.4 + L.a.w) * 0.07 * L.b.z + sin(t * 2.3 + L.a.w * 1.7) * 0.025;
  return vec2f(-sin(L.b.w), cos(L.b.w)) * a;
}
@vertex fn vs(v: VIn, @builtin(instance_index) ii: u32) -> VOut {
  let L = lans[ii];
  let s = L.b.x;
  let lp = v.pos * s;
  let t = time();
  let sw = swing(L, t);
  let psw = swing(L, t - F.camFwd.w);
  var o: VOut;
  o.wp = L.a.xyz + vec3f(lp.x - sw.x * lp.y, lp.y, lp.z - sw.y * lp.y);
  o.pwp = L.a.xyz + vec3f(lp.x - psw.x * lp.y, lp.y, lp.z - psw.y * lp.y);
  o.n = v.nrm;
  o.lp = v.pos;
  o.info = vec4f(v.me.x, L.b.y, L.a.w, 0.0);
  o.cp = F.viewProj * vec4f(o.wp, 1.0);
  return o;
}
@fragment fn fs(i: VOut) -> GOut {
  let mat = i.info.x;
  let style = i.info.y;
  let n = normalize(i.n);
  var body = vec3f(1.0, 0.16, 0.05);
  if (style > 0.5) { body = vec3f(1.0, 0.45, 0.08); }
  if (style > 1.5) { body = vec3f(1.0, 0.2, 0.6); }
  if (mat < 0.5) {
    let v = normalize(F.camPos.xyz - i.wp);
    let a = atan2(i.lp.z, i.lp.x);
    let ribs = 0.75 + 0.25 * smoothstep(0.2, 0.0, abs(fract(a / TAU * 12.0) - 0.5) - 0.3);
    let band = select(1.0, 0.35, abs(i.lp.y + 0.42) < 0.035);
    let thick = 0.5 + 0.5 * abs(dot(n, v));
    let e = body * 3.2 * ribs * band * thick * (0.92 + 0.08 * sin(time() * 7.0 + i.info.z));
    return gbuf(body * 0.4, 0.6, n, 0.0, e, 1.0, motionVector(i.wp, i.pwp), 0.0, 0.3);
  }
  if (mat < 1.5) {
    return gbuf(vec3f(0.75, 0.5, 0.15), 0.3, n, 1.0, vec3f(0.12, 0.06, 0.01), 1.0, motionVector(i.wp, i.pwp), 0.0, 0.5);
  }
  return gbuf(vec3f(0.6, 0.06, 0.03), 0.8, n, 0.0, body * 0.6, 1.0, motionVector(i.wp, i.pwp), 0.0, 0.3);
}
`;

function signMesh() {
  const mb = new MeshBuilder();
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
  // unit box: front (+z) mat 0, back (-z) mat 1, sides mat 2
  mb.box([0, 0, 0], X, Y, Z, 0.5, 0.5, 0.5, 0, 0, 16);
  mb.box([0, 0, 0], X, Y, Z, 0.5, 0.5, 0.5, 1, 0, 32);
  mb.box([0, 0, 0], X, Y, Z, 0.5, 0.5, 0.5, 2, 0, 1 | 2 | 4 | 8);
  // two bracket arms (mat 3): x in [0,1] along the gap, y center +-0.32 (scaled by h), thickness via extra (m)
  for (const yc of [0.32, -0.32]) {
    const start = mb.vertexCount;
    mb.box([0.5, 0, 0], X, Y, Z, 0.5, 0.035, 0.035, 3);
    for (let i = start; i < mb.vertexCount; i++) { const o = i * 10; mb.v[o + 9] = mb.v[o + 1]; mb.v[o + 1] = yc; }
  }
  return mb;
}

// Far LOD: just the two text faces.
function signFarMesh() {
  const mb = new MeshBuilder();
  mb.box([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.5, 0.5, 0.5, 0, 0, 16);
  mb.box([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.5, 0.5, 0.5, 1, 0, 32);
  return mb;
}

function lanternMesh() {
  const mb = new MeshBuilder();
  const prof = [[0.0, -0.08], [0.2, -0.12], [0.31, -0.26], [0.33, -0.42], [0.29, -0.58], [0.17, -0.69], [0.0, -0.72]];
  const N = 8;
  for (let k = 0; k < prof.length - 1; k++) {
    const [r0, y0] = prof[k], [r1, y1] = prof[k + 1];
    for (let i = 0; i < N; i++) {
      const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2, am = (a0 + a1) / 2;
      const dr = r1 - r0, dy = y1 - y0, l = Math.hypot(dr, dy) || 1;
      const nr = -dy / l, ny = dr / l;
      const n = [Math.cos(am) * nr, ny, Math.sin(am) * nr];
      // outward normal must point away from the axis
      const nn = nr < 0 ? [-n[0], -n[1], -n[2]] : n;
      if (r0 < 1e-4) mb.tri([0, y0, 0], [Math.cos(a1) * r1, y1, Math.sin(a1) * r1], [Math.cos(a0) * r1, y1, Math.sin(a0) * r1], [Math.cos(am) * Math.abs(nr), ny * Math.sign(nr || 1), Math.sin(am) * Math.abs(nr)], [[0, 0], [1, 0], [0, 1]], 0);
      else if (r1 < 1e-4) mb.tri([Math.cos(a0) * r0, y0, Math.sin(a0) * r0], [Math.cos(a1) * r0, y0, Math.sin(a1) * r0], [0, y1, 0], [Math.cos(am) * 0.3, -1, Math.sin(am) * 0.3], [[0, 0], [1, 0], [0, 1]], 0);
      else mb.quad([Math.cos(a0) * r0, y0, Math.sin(a0) * r0], [Math.cos(a1) * r0, y0, Math.sin(a1) * r0], [Math.cos(a1) * r1, y1, Math.sin(a1) * r1], [Math.cos(a0) * r1, y1, Math.sin(a0) * r1], nn, [[0, 0], [1, 0], [1, 1], [0, 1]], 0);
    }
  }
  mb.prism(0, 0, -0.13, -0.04, 0.2, 6, 1, 0, false);   // top cap
  mb.prism(0, 0, -0.77, -0.68, 0.18, 6, 1, 0, false);  // bottom cap
  mb.prism(0, 0, -1.05, -0.77, 0.04, 3, 2, 0, false);  // tassel
  mb.prism(0, 0, -0.04, 0.3, 0.015, 3, 1, 0, false);   // hook
  return mb;
}

// Spatial cells for CPU culling of instanced draws.
class Cells {
  // sizeOf(row) ranks rows inside a cell (largest first); rows with sizeOf >= big are drawn in the far tier.
  // group(i) > 0 puts row i into separate cells (kept after all others), so its rows never change other cells
  constructor(rows, size, xi, zi, reach, sizeOf = () => 1, big = 0, group = () => 0) {
    const keyed = rows.map((r, i) => ({ r, k: Math.floor(r[xi] / size) * 4096 + Math.floor(r[zi] / size) + group(i) * 1e7, s: sizeOf(r) }));
    keyed.sort((a, b) => a.k - b.k || b.s - a.s);
    this.rows = keyed.map((o) => o.r);
    const cells = [];
    let cur = null;
    keyed.forEach((o, i) => {
      if (!cur || cur.k !== o.k) { cur = { k: o.k, first: i, count: 0, big: 0, x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9, y0: 1e9, y1: -1e9 }; cells.push(cur); }
      cur.count++;
      if (o.s >= big) cur.big++;
      const r = o.r;
      cur.x0 = Math.min(cur.x0, r[xi]); cur.x1 = Math.max(cur.x1, r[xi]);
      cur.z0 = Math.min(cur.z0, r[zi]); cur.z1 = Math.max(cur.z1, r[zi]);
      cur.y0 = Math.min(cur.y0, r[1]); cur.y1 = Math.max(cur.y1, r[1]);
    });
    this.cx = new Float32Array(cells.length); this.cy = new Float32Array(cells.length); this.cz = new Float32Array(cells.length);
    this.cr = new Float32Array(cells.length); this.first = new Uint32Array(cells.length); this.count = new Uint32Array(cells.length); this.big = new Uint32Array(cells.length);
    cells.forEach((c, i) => {
      this.cx[i] = (c.x0 + c.x1) / 2; this.cz[i] = (c.z0 + c.z1) / 2; this.cy[i] = (c.y0 + c.y1) / 2;
      this.cr[i] = Math.hypot(c.x1 - c.x0, c.z1 - c.z0, c.y1 - c.y0) / 2 + reach;
      this.first[i] = c.first; this.count[i] = c.count; this.big[i] = c.big;
    });
    this.n = cells.length;
    this.drawFirst = new Uint32Array(cells.length + 1);
    this.drawCount = new Uint32Array(cells.length + 1);
    this.farFirst = new Uint32Array(cells.length + 1);
    this.farCount = new Uint32Array(cells.length + 1);
    this.draws = 0; this.farDraws = 0;
  }
  // Visible cells closer than nearDist go to the near list; the rest go to the far list, and beyond midDist
  // only the big rows of each cell are drawn.
  cull(test, maxDist, nearDist = 1e9, midDist = 1e9) {
    let d = 0, fd = 0;
    for (let i = 0; i < this.n; i++) {
      // inlined test.dist / test.visible (hot loop over all cells; avoids per-call number boxing)
      const dx = this.cx[i] - test.x, dy = this.cy[i] - test.y, dz = this.cz[i] - test.z, r = this.cr[i];
      const dc = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const dist = dc - r;
      if (dist > maxDist) continue;
      if (dc >= r) {
        const c = (dx * test.fx + dy * test.fy + dz * test.fz) / dc;
        const sr = r / dc, crr = Math.sqrt(Math.max(0, 1 - sr * sr));
        if (!(c > test.cosA * crr - test.sinA * sr)) continue;
      }
      if (dist < nearDist) {
        if (d > 0 && this.drawFirst[d - 1] + this.drawCount[d - 1] === this.first[i]) this.drawCount[d - 1] += this.count[i];
        else { this.drawFirst[d] = this.first[i]; this.drawCount[d] = this.count[i]; d++; }
      } else {
        const n = dist < midDist ? this.count[i] : this.big[i];
        if (n === 0) continue;
        if (fd > 0 && this.farFirst[fd - 1] + this.farCount[fd - 1] === this.first[i]) this.farCount[fd - 1] += n;
        else { this.farFirst[fd] = this.first[i]; this.farCount[fd] = n; fd++; }
      }
    }
    this.draws = d; this.farDraws = fd;
  }
}

export default {
  name: 'signs',
  init(ctx) {
    const d = ctx.device;
    this.atlas = buildSignAtlas(d);
    ctx.world.shared.signAtlas = { view: this.atlas.view, find: this.atlas.find };
    this.sampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: 8 });
    this.layout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, sampler: { type: 'filtering' } },
    ] });
    this.pipe = ctx.renderer.gbufferPipeline({ label: 'signs', code: SIGN_WGSL, buffers: [VERTEX_LAYOUT], groups: [this.layout] });
    this.lanLayout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }] });
    this.lanPipe = ctx.renderer.gbufferPipeline({ label: 'lanterns', code: LANTERN_WGSL, buffers: [VERTEX_LAYOUT], groups: [this.lanLayout] });
    this.mesh = signMesh().upload(d, 'sign');
    this.farMesh = signFarMesh().upload(d, 'sign-far');
    this.lanMesh = lanternMesh().upload(d, 'lantern');
    this.test = makeCamTest();
    this.ready = false;
  },

  _build(ctx) {
    const d = ctx.device;
    const q = ctx.quality.level;
    const res = placeSigns(ctx.world, this.atlas, q);
    // rank by area (screens and billboards first); far away only signs of 6 m2 and more are drawn
    // the Hongyadong complex's signs (res.ownRows) get their own cells, so the city's sign cells stay as they were
    const own = res.ownRows;
    this.cells = new Cells(res.signs, 160, 0, 2, 12, (r) => r[6] * r[7] * (r[3] === 3 || r[3] === 4 ? 10 : 1), 6, (i) => (i >= own[0] && i < own[1] ? 1 : 0));
    const arr = new Float32Array(Math.max(1, this.cells.rows.length) * SIGN_FLOATS);
    this.cells.rows.forEach((r, i) => arr.set(r, i * SIGN_FLOATS));
    this.buf = d.createBuffer({ label: 'signs', size: arr.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.buf, 0, arr);
    this.group = d.createBindGroup({ layout: this.layout, entries: [
      { binding: 0, resource: { buffer: this.buf } }, { binding: 1, resource: this.atlas.view }, { binding: 2, resource: this.sampler }] });
    this.lanCells = new Cells(res.lanterns, 160, 0, 2, 2);
    const la = new Float32Array(Math.max(1, this.lanCells.rows.length) * 8);
    this.lanCells.rows.forEach((r, i) => la.set(r, i * 8));
    this.lanBuf = d.createBuffer({ label: 'lanterns', size: la.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.lanBuf, 0, la);
    this.lanGroup = d.createBindGroup({ layout: this.lanLayout, entries: [{ binding: 0, resource: { buffer: this.lanBuf } }] });
    const budget = Math.min(SIGN_LIGHT_BUDGET, 8192 - ctx.lights.count - 64);
    // the complex's sign lights (tagged c[9]) are chosen separately, so the city's selection is unchanged
    const lights = selectLights(res.lightC.filter((c) => !c[9]), budget).concat(selectLights(res.lightC.filter((c) => c[9]), OWN_SIGN_LIGHTS));
    for (const L of lights) ctx.lights.add(L[0], L[1], L[2], L[3], L[4], L[5], L[6], L[7]);
    this.stats = { signs: res.signs.length, lanterns: res.lanterns.length, lights: lights.length };
    ctx.world.shared.signStats = this.stats;
    this.maxDist = [900, 1300, 1700][q];
    this.midDist = [350, 450, 600][q];
    this.ready = true;
  },

  update(ctx) {
    if (!this.ready) this._build(ctx);
  },

  gbuffer(ctx, pass) {
    if (!this.ready) return;
    const r = ctx.renderer;
    this.test.set(ctx.cam, r.width / r.height);
    this.cells.cull(this.test, this.maxDist, 170, this.midDist);
    pass.setPipeline(this.pipe);
    pass.setBindGroup(1, this.group);
    const c = this.cells;
    pass.setVertexBuffer(0, this.mesh.vb);
    pass.setIndexBuffer(this.mesh.ib, 'uint32');
    for (let i = 0; i < c.draws; i++) pass.drawIndexed(this.mesh.count, c.drawCount[i], 0, 0, c.drawFirst[i]);
    pass.setVertexBuffer(0, this.farMesh.vb);
    pass.setIndexBuffer(this.farMesh.ib, 'uint32');
    for (let i = 0; i < c.farDraws; i++) pass.drawIndexed(this.farMesh.count, c.farCount[i], 0, 0, c.farFirst[i]);
    const l = this.lanCells;
    l.cull(this.test, 300);
    if (l.draws) {
      pass.setPipeline(this.lanPipe);
      pass.setBindGroup(1, this.lanGroup);
      pass.setVertexBuffer(0, this.lanMesh.vb);
      pass.setIndexBuffer(this.lanMesh.ib, 'uint32');
      for (let i = 0; i < l.draws; i++) pass.drawIndexed(this.lanMesh.count, l.drawCount[i], 0, 0, l.drawFirst[i]);
    }
  },
};
