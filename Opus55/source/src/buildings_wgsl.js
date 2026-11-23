// WGSL for the buildings module: GPU culling (compute), parametric part vertex shader and facade materials.
//
// Every building is a set of "parts". A part is a vertical extrusion of a footprint ring (rounded/chamfered rect,
// polygon/ellipse, lobed polar curve, triangle) along a vertical profile (linear taper, dome, sphere, onion, concave
// roof, ger roof, flare) with optional twist and lean. One shared ring mesh per LOD is instanced for all parts.

// Part record: 6 x vec4f (96 bytes). Must match buildings_gen.js.
//  a: x, y0, z, angle          b: hw, hd, h, seed
//  c: shapeKind, shapeParam, taper, twist
//  d: leanX, leanZ, profile, flags
//  e: material, floorH, winW (or mode), baseY (street level for floor grid)
//  f: r, g, b, param
export const PART_FLOATS = 24;

export const FLAG = {
  NOTOP: 1, BOTTOM: 2, LED: 4, ARCADE: 8, FLOOD: 16, EDGE: 32, ROUND: 64, CURVED: 128, PROP: 256,
  CAPFACADE: 512, BALC: 1024, BLINK: 2048, PORTAL: 4096, RIBS: 8192, NOWIN: 16384, CROWNLIT: 32768, NOBOX: 65536,
};

export const MAT = {
  CONCRETE: 0, RES: 1, OFFICE: 2, GLASS: 3, STONE: 4, SHOP: 5, BRICK: 6, TILE: 7, WOOD: 8, FELT: 9,
  METAL: 10, EMIT: 11, ROOFTILE: 12, TV: 13, CROWN: 14, HELI: 15, TRUSS: 16, CLOCK: 17, CRYSTAL: 18, CARPET: 19,
};

export const PART_WGSL = /* wgsl */ `
struct Part { a: vec4f, b: vec4f, c: vec4f, d: vec4f, e: vec4f, f: vec4f };
`;

// ------------------------------------------------------------------ culling
export const CULL_WGSL = /* wgsl */ `
@group(1) @binding(0) var<storage, read> parts: array<Part>;
@group(1) @binding(1) var<storage, read_write> vis: array<u32>;
@group(1) @binding(2) var<storage, read_write> args: array<atomic<u32>>;
@group(1) @binding(3) var<uniform> cullU: vec4f; // x part count, y list stride (entries), z lod bias, w min pixel size

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= u32(cullU.x)) { return; }
  let P = parts[i];
  let flags = u32(P.d.w);
  let hw = P.b.x; let hd = P.b.y; let h = P.b.z;
  let rxz = sqrt(hw * hw + hd * hd) * max(1.0, P.c.z) * 1.25 + length(P.d.xy) * 0.5;
  let rad = sqrt(rxz * rxz + h * h * 0.25);
  let c = vec3f(P.a.x + P.d.x * 0.5, P.a.y + h * 0.5, P.a.z + P.d.y * 0.5);
  let vp = (F.view * vec4f(c, 1.0)).xyz;
  let tanY = F.camRight.w;
  let tanX = tanY * F.camUp.w;
  let pl = normalize(vec3f(1.0, 0.0, -tanX));
  let pr = normalize(vec3f(-1.0, 0.0, -tanX));
  let pb = normalize(vec3f(0.0, 1.0, -tanY));
  let pt = normalize(vec3f(0.0, -1.0, -tanY));
  if (dot(pl, vp) < -rad || dot(pr, vp) < -rad || dot(pb, vp) < -rad || dot(pt, vp) < -rad) { return; }
  if (-vp.z < -rad) { return; }
  let dist = max(length(c - F.camPos.xyz) - rad * 0.5, 1.0);
  let pix = rad / dist * F.res.y * 0.5 / tanY * cullU.z;
  let isProp = (flags & 256u) != 0u;
  if (pix < select(0.35, cullU.w, isProp)) { return; }
  let isRound = (flags & 64u) != 0u;
  let curved = (flags & 128u) != 0u;
  let nobox = (flags & 65536u) != 0u;
  // lists: 0 box near, 1 K48, 2 K48 rows, 3 K24, 4 K24 rows, 5 box far
  var list = 5u;
  if (curved) { list = select(4u, 2u, pix > 140.0); }
  else if (isRound) {
    if (pix > 200.0) { list = 1u; }
    else if (pix > 22.0 || nobox) { list = 3u; }
  } else if (pix > 70.0) { list = 0u; }
  let k = atomicAdd(&args[list * 5u + 1u], 1u);
  vis[list * u32(cullU.y) + k] = i;
}
`;

// ------------------------------------------------------------------ draw
export const DRAW_WGSL = /* wgsl */ `
@group(1) @binding(0) var<storage, read> parts: array<Part>;
@group(1) @binding(1) var<storage, read> vis: array<u32>;

struct VOut {
  @builtin(position) @invariant pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) uv: vec4f,                       // face distance (m, unscaled), world y, ring scale, face length
  @location(3) @interpolate(flat) info: vec2u,  // part index, face id | cap << 8 | bottom << 9
};

struct Ring { p: vec2f, n: vec2f, fd: f32, fl: f32, fid: u32 };
fn csgn(i: u32) -> vec2f { return vec2f(select(1.0, -1.0, i == 1u || i == 2u), select(1.0, -1.0, i >= 2u)); }
fn dir2(a: f32) -> vec2f { return vec2f(cos(a), sin(a)); }

// s positions the vertex, sm (quad center) selects the ring segment so faces never straddle a corner.
fn ringEval(kind: f32, prm: f32, hw: f32, hd: f32, s: f32, sm: f32) -> Ring {
  var R: Ring;
  let k = u32(kind + 0.5);
  if (k <= 1u) {
    let r = clamp(prm, 0.0, 1.0) * min(hw, hd);
    let qi = min(u32(sm * 4.0), 3u);
    let qm = sm * 4.0 - f32(qi);
    let q = s * 4.0 - f32(qi);
    let a0 = f32(qi) * PI * 0.5; let a1 = a0 + PI * 0.5;
    let cc = csgn(qi) * vec2f(hw - r, hd - r);
    if (qm < 0.5) {
      let f = clamp(q * 2.0, 0.0, 1.0);
      if (k == 0u) { let ph = mix(a0, a1, f); R.p = cc + r * dir2(ph); R.n = dir2(ph); R.fl = r * PI * 0.5; }
      else { R.p = cc + r * mix(dir2(a0), dir2(a1), f); R.n = dir2(a0 + PI * 0.25); R.fl = r * 1.41421; }
      R.fd = f * R.fl; R.fid = qi * 2u;
    } else {
      let f = clamp((q - 0.5) * 2.0, 0.0, 1.0);
      let cn = csgn((qi + 1u) % 4u) * vec2f(hw - r, hd - r);
      let nn = dir2(a1);
      R.p = mix(cc, cn, f) + r * nn; R.n = nn;
      R.fl = length(cn - cc); R.fd = f * R.fl; R.fid = qi * 2u + 1u;
    }
  } else if (k == 2u) {
    let N = max(prm, 3.0);
    if (N >= 12.0) {
      let th = s * TAU;
      R.p = vec2f(cos(th) * hw, sin(th) * hd);
      R.n = normalize(vec2f(cos(th) / hw, sin(th) / hd));
      R.fl = TAU * sqrt(0.5 * (hw * hw + hd * hd)); R.fd = s * R.fl; R.fid = 0u;
    } else {
      let ki = min(floor(sm * N), N - 1.0);
      let f = clamp(s * N - ki, 0.0, 1.0);
      let off = PI / N;
      let sc = vec2f(hw, hd) / cos(PI / N);
      let v0 = dir2(ki / N * TAU + off) * sc;
      let v1 = dir2((ki + 1.0) / N * TAU + off) * sc;
      R.p = mix(v0, v1, f);
      let na = (ki + 0.5) / N * TAU + off;
      R.n = normalize(vec2f(cos(na) / hw, sin(na) / hd));
      R.fl = length(v1 - v0); R.fd = f * R.fl; R.fid = u32(ki);
    }
  } else if (k == 3u) {
    let N = floor(prm); let kk = fract(prm);
    let th = s * TAU;
    let rr = 1.0 + kk * cos(N * th); let dr = -kk * N * sin(N * th);
    R.p = dir2(th) * rr * vec2f(hw, hd);
    let tg = vec2f(dr * cos(th) - rr * sin(th), dr * sin(th) + rr * cos(th)) * vec2f(hw, hd);
    R.n = normalize(vec2f(tg.y, -tg.x));
    R.fl = PI * (hw + hd); R.fd = s * R.fl; R.fid = 0u;
  } else {
    let ki = min(floor(sm * 3.0), 2.0);
    let f = clamp(s * 3.0 - ki, 0.0, 1.0);
    let v0 = vec2f(hw, -hd); let v1 = vec2f(hw, hd); let v2 = vec2f(-hw, 0.0);
    var va = v0; var vb = v1;
    if (ki > 1.5) { va = v2; vb = v0; } else if (ki > 0.5) { va = v1; vb = v2; }
    let e = vb - va;
    R.p = mix(va, vb, f); R.n = normalize(vec2f(e.y, -e.x));
    R.fl = length(e); R.fd = f * R.fl; R.fid = u32(ki);
  }
  return R;
}

// Vertical profile: returns (ring scale, height fraction).
fn prof(p: f32, t: f32, taper: f32) -> vec2f {
  let k = u32(p + 0.5);
  if (k == 1u) { let a = t * PI * 0.5; return vec2f(mix(cos(a), taper, t * t * 0.0) , sin(a)); }
  if (k == 2u) { let a = t * PI; return vec2f(sin(a), 0.5 - 0.5 * cos(a)); }
  if (k == 3u) { let a = PI * (0.3 + 0.7 * t); return vec2f(sin(a) / sin(0.3 * PI) * (1.0 - 0.3 * smoothstep(0.55, 1.0, t)), t); }
  if (k == 4u) { return vec2f(taper + (1.0 - taper) * pow(max(1.0 - t, 0.0), 2.2), t); }
  if (k == 5u) { return vec2f(mix(1.0, taper, pow(max(t, 0.0), 0.85)), t); }
  if (k == 6u) { return vec2f(mix(1.0, taper, t * t), t); }
  return vec2f(mix(1.0, taper, t), t);
}

@vertex fn vs(@location(0) a: vec4f, @builtin(instance_index) ii: u32) -> VOut {
  let pid = vis[ii];
  let P = parts[pid];
  let kind = u32(a.w + 0.5);
  let flags = u32(P.d.w);
  var o: VOut;
  let top = kind == 1u || kind == 2u;
  let bot = kind == 3u || kind == 4u;
  if ((top && (flags & 1u) != 0u) || (bot && (flags & 2u) == 0u)) {
    o.pos = vec4f(0.0, 0.0, 0.0, 1.0);
    return o;
  }
  var t = a.z;
  if (top) { t = 1.0; }
  if (bot) { t = 0.0; }
  let pr = prof(P.d.z, t, P.c.z);
  let e = 0.002;
  let dp = (prof(P.d.z, t + e, P.c.z) - prof(P.d.z, t - e, P.c.z)) / (2.0 * e);
  let rg = ringEval(P.c.x, P.c.y, P.b.x, P.b.y, a.x, a.y);
  var lp = rg.p * pr.x;
  var ln = rg.n;
  if (kind == 1u || kind == 3u) { lp = vec2f(0.0); }
  let tw = P.c.w * pr.y;
  let Rt = rot2(tw);
  lp = Rt * lp; ln = Rt * ln;
  let Rb = rot2(P.a.w);
  let h = P.b.z;
  let wxz = vec2f(P.a.x, P.a.z) + Rb * lp + P.d.xy * pr.y;
  let wy = P.a.y + pr.y * h;
  let m = Rb * ln;
  var n = vec3f(m.x * h * dp.y, -(dot(rg.n, rg.p) * dp.x + dot(m, P.d.xy)), m.y * h * dp.y);
  if (top) { n = vec3f(0.0, 1.0, 0.0); }
  if (bot) { n = vec3f(0.0, -1.0, 0.0); }
  o.wp = vec3f(wxz.x, wy, wxz.y);
  o.n = normalize(n + vec3f(0.0, 1e-6, 0.0));
  o.uv = vec4f(rg.fd, wy, pr.x, rg.fl);
  o.info = vec2u(pid, rg.fid | select(0u, 256u, top || bot) | select(0u, 512u, bot));
  o.pos = F.viewProj * vec4f(o.wp, 1.0);
  return o;
}

// ------------------------------------------------------------------ materials

struct Surf { alb: vec3f, rough: f32, metal: f32, emis: vec3f, mid: f32, wet: f32, n: vec3f, ao: f32 };

fn hsv(h: f32, s: f32, v: f32) -> vec3f {
  let p = abs(fract(vec3f(h) + vec3f(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return v * mix(vec3f(1.0), saturate3(p - 1.0), s);
}

fn roomLight(h: f32) -> vec3f {
  if (h < 0.46) { return vec3f(1.0, 0.55, 0.24); }
  if (h < 0.74) { return vec3f(1.0, 0.76, 0.5); }
  if (h < 0.93) { return vec3f(0.78, 0.88, 1.0); }
  if (h < 0.96) { return vec3f(0.85, 1.0, 0.85); }
  if (h < 0.985) { return vec3f(1.0, 0.35, 0.6); }
  return vec3f(0.5, 0.45, 1.0);
}

// Box-filtered 1D pulse: 1 inside [a,b], with filter width w.
fn pulse(a: f32, b: f32, x: f32, w: f32) -> f32 {
  let ww = max(w, 1e-4);
  return saturate((min(x - a, b - x)) / ww + 0.5);
}

// Fake interior room behind a window. f: window-local [0,1]^2, d: view ray in tangent space (x along facade, y up,
// z into the building), size: room (w, h, depth) in m. mode 0 home, 1 office, 2 shop, 3 arcade.
fn interior(f: vec2f, d0: vec3f, size: vec3f, rs: f32, mode: u32) -> vec3f {
  let d = vec3f(select(d0.x, 1e-4, abs(d0.x) < 1e-4), select(d0.y, 1e-4, abs(d0.y) < 1e-4), max(d0.z, 0.04));
  let p = vec3f(f * size.xy, 0.0);
  let tx = (select(0.0, size.x, d.x > 0.0) - p.x) / d.x;
  let ty = (select(0.0, size.y, d.y > 0.0) - p.y) / d.y;
  let tz = size.z / d.z;
  let t = min(min(tx, ty), tz);
  let h = saturate3((p + d * t) / size);
  let tint = select(mix(vec3f(0.92, 0.86, 0.78), hsv(fract(rs * 3.1), 0.25, 0.9), step(0.85, fract(rs * 7.3))), vec3f(0.85, 0.87, 0.9), mode == 1u);
  var c = tint * 0.72;
  var lamp = 0.35 + 1.1 / (1.0 + 7.0 * dot(h - vec3f(0.5, 1.0, 0.55), h - vec3f(0.5, 1.0, 0.55)));
  if (t == tz) {
    c = tint * (0.55 + 0.45 * h.y);
    let fx = fract(rs * 13.7);
    if (mode == 0u && h.y < 0.32 && abs(h.x - fx) < 0.22) { c *= 0.3; }
    if (mode == 2u || mode == 3u) {
      // shop: shelves with goods
      let sh = step(0.5, fract(h.y * 4.0)) * step(0.15, h.y);
      c = mix(c, hsv(fract(rs * 5.7 + floor(h.x * 6.0) * 0.17), 0.35, 0.7), sh * 0.6);
    }
  } else if (t == ty) {
    if (d.y > 0.0) {
      c = vec3f(0.9);
      if (mode == 1u) {
        let pn = step(fract(h.z * 3.0), 0.3) * step(fract(h.x * 2.0 + 0.25), 0.55);
        c = vec3f(0.2) + vec3f(1.3) * pn; lamp = 0.85;
      }
    } else {
      c = mix(vec3f(0.22, 0.15, 0.1), vec3f(0.28, 0.28, 0.3), step(0.5, fract(rs * 5.1))) * 0.7;
      if (mode == 1u) { let desk = step(0.5, fract(h.z * 3.0 + 0.1)) * step(0.3, fract(h.x * 2.0)); c = mix(c, vec3f(0.55), desk * 0.5); }
    }
  }
  if (mode == 1u) { lamp = clamp(lamp, 0.6, 0.9); }
  if (mode >= 2u) {
    if (t != tz && t != ty) {
      // side-wall shelving
      let sh = step(0.5, fract(h.y * 5.0)) * step(0.1, h.y) * step(h.y, 0.85);
      c = mix(c, hsv(fract(rs * 2.3 + floor(h.z * 5.0) * 0.21), 0.3, 0.65), sh * 0.5);
    }
    if (t == ty && d.y < 0.0) { c = vec3f(0.16, 0.15, 0.14); }
  }
  var col = c * lamp * (1.0 - 0.45 * h.z);
  // counter / furniture silhouette at 35% depth
  let tc = 0.35 * size.z / d.z;
  if (tc < t) {
    let pc = (p + d * tc) / size;
    let x0 = fract(rs * 3.7) * 0.4 + 0.1;
    if (pc.y < select(0.3, 0.36, mode >= 2u) && pc.x > x0 && pc.x < x0 + 0.45) {
      col = select(vec3f(0.06, 0.045, 0.035), vec3f(0.12, 0.1, 0.08), mode >= 2u) * lamp + vec3f(0.5, 0.4, 0.3) * step(select(0.27, 0.33, mode >= 2u), pc.y) * 0.6;
    }
  }
  return col;
}

fn winLit(id: vec2f, seed: f32, litFrac: f32) -> vec4f {
  let h1 = hash21(id + vec2f(seed * 7.31, seed * 3.17));
  let period = 70.0 + 230.0 * h1;
  let slot = floor(time() / period + h1 * 17.0);
  let h2 = hash31(vec3f(id + vec2f(seed * 1.7, 11.0), slot));
  return vec4f(roomLight(fract(h1 * 9.7 + seed * 0.37)), step(h2, litFrac));
}

// Shared window grid. Returns emissive (rgb) and glass coverage (w).
struct Grid { e: vec3f, g: vec3f, cov: f32, det: f32, f: vec2f, id: vec2f, cw: f32 };

fn tangentView(n: vec3f, V: vec3f) -> vec3f {
  let nh = normalize(vec3f(n.x, 0.0, n.z) + vec3f(1e-5, 0.0, 0.0));
  let T = vec3f(-nh.z, 0.0, nh.x);
  let d = -V;
  return vec3f(dot(d, T), d.y, -dot(d, nh));
}

// style: 0 residential, 1 office ribbon, 2 stone tall, 3 brick arched, 4 wood lattice, 5 glass office
fn windowGrid(fd: f32, fl: f32, y: f32, floorH: f32, winW: f32, seed: f32, fid: u32, fw: vec2f,
              vt: vec3f, scale: f32, litFrac: f32, style: u32, inten: f32) -> Grid {
  var G: Grid;
  let nC = max(1.0, round(fl / winW));
  let cw = fl / nC;
  let cx = fd / cw;
  let cy = y / floorH;
  let id = floor(vec2f(cx, cy)) + vec2f(f32(fid) * 41.0, 0.0);
  let f = fract(vec2f(cx, cy));
  let fwc = vec2f(fw.x / cw, fw.y / floorH);
  let cp = max(fwc.x, fwc.y);
  let det = 1.0 - smoothstep(0.18, 0.5, cp);
  let hs = hash11u(u32(seed * 13.0) + 7u);
  var ww = 0.42 + 0.3 * hs;
  var wh = 0.46 + 0.16 * fract(hs * 7.3);
  var y0 = 0.3;
  var mode = 0u;
  if (style == 1u) { ww = 0.94; wh = 0.5 + 0.12 * hs; y0 = 0.32; mode = 1u; }
  if (style == 2u) { ww = 0.38; wh = 0.6; y0 = 0.22; }
  if (style == 3u) { ww = 0.34; wh = 0.5; y0 = 0.25; }
  if (style == 4u) { ww = 0.64; wh = 0.56; y0 = 0.22; }
  if (style == 5u) { ww = 1.0; wh = 0.74; y0 = 0.22; mode = 1u; }
  let x0 = 0.5 - ww * 0.5;
  var mask = pulse(x0, x0 + ww, f.x, fwc.x) * pulse(y0, y0 + wh, f.y, fwc.y);
  if (style == 2u || style == 3u) {
    // arched top: semicircle of the window width
    let rm = ww * cw * 0.5;
    let cyc = (y0 + wh) * floorH - rm;
    let pxm = (f.x - 0.5) * cw; let pym = f.y * floorH;
    let inArch = select(1.0, 1.0 - smoothstep(rm - fw.x, rm + fw.x, length(vec2f(pxm, pym - cyc))), pym > cyc);
    mask *= mix(1.0, inArch, det);
  }
  // lit state: offices light whole floors / bays; homes light whole apartments (2-3 windows) with
  // per-floor activity so lit and dark storeys read as coherent bands instead of noise
  var lid = id;
  var lf = litFrac;
  let floorOn = step(hash21(vec2f(id.y + f32(fid) * 0.0, seed * 1.31 + 5.0)), litFrac * 1.1);
  if (mode == 1u) { lid = vec2f(floor(id.x / 3.0), id.y); lf = mix(0.05, 0.85, floorOn); }
  if (mode == 0u) {
    let uw = 2.0 + floor(hs * 1.99);
    lid = vec2f(floor(id.x / uw), id.y);
    let fa = hash21(vec2f(id.y * 0.37, seed + 9.0));
    lf = clamp(litFrac * (0.3 + 1.4 * fa), 0.03, 0.95);
  }
  let L0 = winLit(lid, seed, lf);
  let offC = mix(vec3f(0.8, 0.9, 1.0), vec3f(1.0, 0.84, 0.62), step(0.62, fract(seed * 0.37 + lid.y * 0.0137)));
  let warmOnly = style == 2u || style == 3u || style == 4u;
  let L = vec4f(select(select(L0.rgb, roomLight(fract(hash21(lid + seed) * 7.0) * 0.72), warmOnly), offC, mode == 1u), L0.a);
  var room = vec3f(0.0);
  if (det > 0.01 && L.a > 0.5 && mask > 0.0 && F.params.w > 0.5) {
    let fr = vec2f((f.x - x0) / ww, (f.y - y0) / wh);
    room = interior(fr, vt, vec3f(cw * ww * scale, floorH * wh, select(4.5, 8.0, mode == 1u)), hash21(id + seed), mode);
    if (mode == 0u) {
      // per-apartment furnishing: curtains (muted fabric palette), blinds or a TV glow
      let hc = hash21(lid * 1.3 + seed * 3.0);
      var fabric = array<vec3f, 5>(vec3f(0.85, 0.74, 0.58), vec3f(0.7, 0.58, 0.42), vec3f(0.62, 0.28, 0.22), vec3f(0.46, 0.46, 0.32), vec3f(0.38, 0.42, 0.52));
      let fc = fabric[u32(fract(hc * 11.0) * 4.99)];
      if (hc < 0.42) {
        let cl = select(0.3, 0.5, hc < 0.12);
        let cur = 1.0 - pulse(cl, 1.0 - cl, fr.x, fwc.x / ww);
        room = mix(room, fc * (0.6 + 0.25 * sin(fr.x * 60.0)), cur * 0.92);
      } else if (hc < 0.6) {
        let slat = step(0.45, fract(fr.y * 14.0));
        room = mix(room, room * 0.25 + fc * 0.25, slat * mix(1.0, 0.4, step(0.55, fr.y)));
      } else if (hc > 0.95) {
        room = mix(room, vec3f(0.35, 0.45, 1.0) * (0.6 + 0.4 * sin(time() * 9.0 + hc * 40.0)), 0.55);
      }
    }
  }
  // security cages on low floors (Chongqing/HK style) and on some upper flats
  if (mode == 0u && det > 0.01) {
    let pc = select(0.12, 0.6, id.y < 6.0);
    if (hash21(lid + vec2f(77.0, seed)) < pc) {
      let fr2 = vec2f((f.x - x0) / ww, (f.y - y0) / wh);
      let bars = max(1.0 - pulse(0.1, 0.9, fract(fr2.x * 6.0), fwc.x * 6.0 / ww), 1.0 - pulse(0.08, 0.92, fract(fr2.y * 4.0), fwc.y * 4.0 / wh));
      let inWin = pulse(-0.06, 1.06, fr2.x, fwc.x / ww) * pulse(-0.06, 1.06, fr2.y, fwc.y / wh);
      G.g.z = bars * inWin * det;
    }
  }
  let nearE = room * L.rgb * L.a * mask * inten;
  // far: averaged emission; lit/dark floor runs stay visible while floors are larger than ~1.5 px
  let run = floor(vec2f(cx / 4.0, cy)) + vec2f(f32(fid) * 13.0, seed);
  let runLit = select(step(hash21(run), litFrac), mix(0.1, 1.0, floorOn) * 0.9, mode == 1u);
  let bandK = 1.0 - smoothstep(0.35, 0.7, fwc.y);
  let bv = mix(1.0, (0.3 + 1.4 * runLit) / (0.3 + 1.4 * litFrac), bandK * (1.0 - det));
  let avgCol = mix(vec3f(1.0, 0.66, 0.36), vec3f(0.85, 0.9, 1.0), select(0.3, 0.7, mode == 1u));
  let farE = avgCol * litFrac * ww * wh * inten * 0.5 * bv;
  G.e = mix(farE, nearE, det);
  G.cov = mix(ww * wh, mask, det);
  G.det = det; G.f = f; G.id = id; G.cw = cw;
  G.g = vec3f(L.a, mask, G.g.z);
  return G;
}

// Procedural "reflected city" for glass: a skyline band of reflected towers (lit window dots, a few neon strips)
// below a height-dependent horizon, street glow further down. R = reflection vector, blur = its screen derivative.
fn cityRefl(R: vec3f, wpy: f32, blur: f32) -> vec3f {
  let az = atan2(R.x, R.z) / TAU + 0.5;   // 0..1 around
  let el = R.y;
  let hz = clamp(0.22 - wpy * 0.00045, -0.08, 0.22);
  let colI = floor(az * 360.0);
  let hb = hash11u(u32(colI) + 1000u);
  let top = hz * (0.25 + 1.3 * hb) - 0.01;
  let soft = 0.006 + blur * 2.0;
  let inB = 1.0 - smoothstep(top - soft, top + soft, el);
  let detail = 1.0 - smoothstep(0.004, 0.02, blur);
  let wu = fract(az * 360.0 * 7.0); let wv = fract(el * 160.0);
  let win = pulse(0.3, 0.75, wu, blur * 2520.0) * pulse(0.35, 0.8, wv, blur * 160.0);
  let litw = step(0.55, hash21(vec2f(floor(az * 2520.0), floor(el * 160.0) + 50.0)));
  let wcol = mix(vec3f(1.0, 0.66, 0.36), vec3f(0.7, 0.85, 1.0), step(0.6, hb));
  var c = mix(wcol * 0.16, wcol * win * litw * 0.9, detail) * inB;
  // neon strips on some reflected towers
  let ns = hash11u(u32(floor(az * 150.0)) + 500u);
  let strip = pulse(0.42, 0.58, fract(az * 150.0), blur * 150.0 + 0.02);
  c += hsv(fract(ns * 7.31), 0.8, 1.0) * step(0.78, ns) * strip * inB * 1.4;
  // street glow far below
  c += vec3f(0.55, 0.28, 0.32) * smoothstep(-0.1, -0.45, el) * 0.35;
  return c;
}

fn ledColor(wp: vec3f, seedB: f32, hf: f32) -> vec3f {
  let I = F.show.x;
  let st = F.show.y; let beat = F.show.w; let bp = F.show.z;
  let pl = exp(-bp * 4.0);
  let c = wp.xz - vec2f(3300.0, -1250.0);
  let mode = u32(beat / 16.0) % 4u;
  var hue = 0.0; var k = 1.0;
  if (mode == 0u) {
    let ph = wp.y * 0.012 - st * 0.55;
    hue = fract(ph * 0.08 + st * 0.03);
    k = 0.25 + 0.75 * smoothstep(0.32, 0.0, abs(fract(ph) - 0.5) - 0.1);
  } else if (mode == 1u) {
    let ph = length(c) * 0.006 - st * 0.9;
    hue = fract(0.55 + ph * 0.05);
    k = 0.2 + 0.8 * pow(0.5 + 0.5 * sin(ph * TAU), 3.0);
  } else if (mode == 2u) {
    let ph = (c.x * 0.8 - c.y * 0.6) * 0.004 + wp.y * 0.003 - st * 0.7;
    hue = fract(0.82 + 0.18 * sin(ph * 0.7));
    k = 0.25 + 0.75 * step(0.5, fract(ph));
  } else {
    let lvl = 0.25 + 0.75 * hash11u(u32(beat) * 31u + u32(seedB * 10.0));
    hue = fract(seedB * 0.137 + beat * 0.0625);
    k = step(hf, lvl * (0.7 + 0.3 * pl)) * (0.6 + 0.4 * step(lvl * (0.7 + 0.3 * pl) - 0.04, hf));
  }
  let showC = hsv(hue, 0.8, 1.0) * k * (0.55 + 0.45 * pl) * 1.6;
  let amb = hsv(fract(seedB * 0.071 + 0.5), 0.6, 1.0) * max(0.0, 0.04 * sin(wp.y * 0.02 - time() * 0.35 + seedB));
  return mix(amb, showC, I);
}

fn girih(p: vec2f) -> f32 {
  // simple 8-fold star lattice: returns line mask 0..1
  let q = fract(p) - 0.5;
  let a = atan2(q.y, q.x);
  let r = length(q);
  let star = 0.28 + 0.07 * cos(8.0 * a);
  let l1 = 1.0 - smoothstep(0.0, 0.035, abs(r - star));
  let d = abs(q);
  let l2 = 1.0 - smoothstep(0.0, 0.03, abs(max(d.x, d.y) - 0.5));
  let l3 = 1.0 - smoothstep(0.0, 0.03, abs(d.x + d.y - 0.5));
  return max(l1, max(l2 * 0.8, l3 * 0.7));
}

fn carpet(p: vec2f) -> vec3f {
  // repeating carpet medallion band: deep red / indigo / gold
  let q = fract(p) - 0.5;
  let dm = abs(q.x) + abs(q.y);
  let ring = step(0.5, fract(dm * 6.0));
  var c = mix(vec3f(0.45, 0.04, 0.05), vec3f(0.06, 0.08, 0.3), ring);
  c = mix(c, vec3f(0.8, 0.55, 0.15), step(dm, 0.12));
  c = mix(c, vec3f(0.85, 0.75, 0.55), step(0.47, max(abs(q.x), abs(q.y))));
  return c;
}

// Depth-only prepass (colour writes masked): lets the main pass shade each visible facade pixel once.
@fragment fn fsDepth(i: VOut) -> GOut { var o: GOut; return o; }

@fragment fn fs(i: VOut) -> GOut {
  let P = parts[i.info.x];
  let fid = i.info.y & 255u;
  let isCap = (i.info.y & 256u) != 0u;
  let flags = u32(P.d.w);
  let mat = u32(P.e.x + 0.5);
  let fw = vec2f(fwidth(i.uv.x), fwidth(i.uv.y));
  let fwp = length(fwidth(i.wp));
  let wp = i.wp;
  var n = normalize(i.n);
  let V = normalize(F.camPos.xyz - wp);
  let seed = P.b.w;
  let floorH = max(P.e.y, 0.5);
  let winW = max(P.e.z, 0.5);
  let baseY = P.e.w;
  let yRel = wp.y - baseY;
  let topY = P.a.y + P.b.z;
  let fd = i.uv.x; let fl = i.uv.w; let scale = max(i.uv.z, 0.05);
  let col = P.f.rgb;
  let prm = P.f.w;
  let vt = tangentView(n, V);
  let Rv = reflect(-V, n);
  let dR = length(fwidth(Rv));

  var S: Surf;
  S.alb = col; S.rough = 0.8; S.metal = 0.0; S.emis = vec3f(0.0); S.mid = 0.0; S.wet = 0.6; S.n = n; S.ao = 1.0;
  S.ao = mix(0.55, 1.0, saturate(yRel / 6.0 + 0.2));

  let roofCap = isCap && (flags & 512u) == 0u && n.y > 0.5;
  if (roofCap) {
    // flat roof: gravel / membrane with drains and grime
    let nz = vnoise2(wp.xz * 0.35);
    S.alb = vec3f(0.07, 0.07, 0.075) * (0.75 + 0.5 * nz);
    S.rough = 0.85; S.wet = 1.0;
    if (mat == 15u) {
      // helipad
      let lp = rot2(-P.a.w) * (wp.xz - P.a.xz);
      let r = length(lp) / max(P.b.x, 1.0);
      S.alb = vec3f(0.05);
      let ring = 1.0 - smoothstep(0.0, 0.025 + fwp * 0.02, abs(r - 0.78));
      let hx = abs(lp.x) / P.b.x; let hz = abs(lp.y) / P.b.x;
      let H = (step(hx, 0.32) * step(0.2, hx) * step(hz, 0.38)) + step(hx, 0.2) * step(hz, 0.05);
      S.emis = vec3f(0.2, 1.0, 0.4) * ring * 3.0 + vec3f(1.0) * saturate(H) * 1.2;
      let edge = smoothstep(0.93, 0.97, r) * step(0.5, fract(atan2(lp.y, lp.x) * 4.0));
      S.emis += vec3f(1.0, 0.8, 0.2) * edge * 4.0;
    } else if (mat == 11u || mat == 14u || mat == 13u) {
      S.emis = col * prm * 0.6;
    } else if (mat == 7u || mat == 12u) {
      S.alb = col * 0.6;
    }
  } else if (isCap && n.y < -0.5) {
    S.alb = vec3f(0.05); S.rough = 0.9;
    if (mat == 11u) { S.emis = col * prm * 0.5; }
    if (mat == 0u && prm > 1.0) { S.alb = col * 0.5; S.emis = col * vec3f(1.0, 0.7, 0.45) * (prm - 1.0) * 0.4; }
    if (mat == 3u || mat == 13u) { S.alb = vec3f(0.03, 0.035, 0.045); S.emis = col * 0.15 * prm; }
  } else if (mat == 1u || mat == 0u || mat == 2u) {
    // ---------------- residential / concrete / office cladding
    let grime = 0.75 + 0.35 * vnoise2(vec2f(fd * 0.3 + seed, wp.y * 0.04)) - 0.15 * vnoise2(vec2f(fd * 2.0, wp.y * 0.15));
    S.alb = col * grime;
    S.rough = 0.85;
    if (mat != 0u && (flags & 16384u) == 0u) {
      let style = select(0u, 1u, mat == 2u);
      let G = windowGrid(fd, fl, yRel, floorH, winW, seed, fid, fw, vt, scale, prm, style, select(1.25, 0.8, mat == 2u));
      // floor slab lines and balconies
      let slab = pulse(0.0, 0.07, G.f.y, fw.y / floorH) * G.det;
      S.alb = mix(S.alb, S.alb * 0.6, slab);
      var laundry = 0.0;
      var lcol = vec3f(0.0);
      var bal = 0.0;
      if ((flags & 1024u) != 0u) {
        bal = step(0.5, fract(G.id.x * 0.5 + 0.25 * hash11u(u32(seed))));
        let rail = pulse(0.0, 0.33, G.f.y, fw.y / floorH) * bal * G.det;
        // railing balusters
        let balu = pulse(0.0, 0.25, fract(G.f.x * 14.0), fw.x * 14.0 / G.cw) * pulse(0.04, 0.3, G.f.y, fw.y / floorH);
        S.alb = mix(S.alb, vec3f(0.35, 0.36, 0.38), rail * mix(0.55, 0.9, balu));
        S.ao *= 1.0 - 0.3 * bal * G.det;
        // laundry hanging in some balconies
        let hl = hash21(G.id + vec2f(seed, 31.0));
        if (bal > 0.5 && hl < 0.38 && G.det > 0.01) {
          let gx = fract(G.f.x * 5.0 + hl * 3.0);
          laundry = step(0.36, G.f.y) * step(G.f.y, 0.36 + 0.14 + 0.12 * fract(hl * 17.0 + floor(G.f.x * 5.0) * 0.3)) * step(gx, 0.62) * G.det;
          lcol = hsv(fract(hl * 13.0 + floor(G.f.x * 5.0) * 0.27), 0.45, 0.75);
        }
      }
      S.alb = mix(S.alb, vec3f(0.02, 0.025, 0.03), G.cov);
      S.emis = G.e * (1.0 - select(0.0, pulse(0.0, 0.33, G.f.y, fw.y / floorH) * 0.85, bal > 0.5));
      S.rough = mix(S.rough, 0.1, G.cov);
      if (G.cov > 0.5 && G.det > 0.5 && G.g.x < 0.5) { S.mid = 2.0; }
      // security cage bars and laundry over the window
      S.alb = mix(S.alb, vec3f(0.1, 0.1, 0.11), G.g.z);
      S.emis *= 1.0 - 0.85 * G.g.z;
      if (G.g.z > 0.5) { S.mid = 0.0; S.metal = 0.5; S.rough = 0.45; }
      S.alb = mix(S.alb, lcol, laundry);
      S.emis = mix(S.emis, lcol * G.e * 0.6 + lcol * 0.02, laundry);
      // far facades: darker walls so the averaged window light carries the read
      S.alb *= mix(0.5, 1.0, G.det);
    }
  } else if (mat == 3u || mat == 16u || mat == 18u) {
    // ---------------- glass curtain wall
    S.alb = col * 0.1; S.rough = 0.06; S.mid = 2.0; S.wet = 0.3; S.ao = 0.55;
    let G = windowGrid(fd, fl, yRel, floorH, winW, seed, fid, fw, vt, scale, prm, 5u, 0.75);
    let spand = 1.0 - pulse(0.22, 0.96, G.f.y, fw.y / floorH);
    let mull = 1.0 - pulse(0.04, 0.96, G.f.x, fw.x / G.cw);
    let frame = max(spand * 0.85, mull * 0.7) * G.det;
    S.alb = mix(S.alb, col * 0.35 + vec3f(0.03), frame);
    S.rough = mix(S.rough, 0.35, frame);
    S.emis = G.e * (1.0 - frame);
    if (frame > 0.5) { S.mid = 0.0; }
    // glossy reflection of the surrounding city (fresnel weighted, weaker on lit office glass and frames)
    let NdV = saturate(dot(n, V));
    let fres = 0.06 + 0.94 * pow(1.0 - NdV, 4.0);
    let refl = cityRefl(Rv, wp.y, dR) * fres * (1.0 - frame * 0.7) * (1.0 - 0.6 * G.g.x * G.det);
    S.emis += refl * 0.9;
    S.ao = mix(0.55, 0.9, fres);
    if (mat == 16u) {
      // diagonal truss lattice
      let L = max(fl, 10.0);
      let tu = fd / L; let tv = yRel / L;
      let w = fw.x / L * 1.5 + 0.012;
      let d1 = abs(fract(tu + tv) - 0.5); let d2 = abs(fract(tu - tv) - 0.5);
      let tr = max(1.0 - smoothstep(0.5 - w * 2.0, 0.5, d1 + 0.0), 0.0);
      let line = max(smoothstep(0.5 - w, 0.5, d1), smoothstep(0.5 - w, 0.5, d2));
      S.alb = mix(S.alb, vec3f(0.6, 0.62, 0.65), line); S.metal = line * 0.8; S.rough = mix(S.rough, 0.3, line);
      S.emis += vec3f(0.8, 0.9, 1.0) * line * 0.35 + tr * 0.0;
      if (line > 0.5) { S.mid = 0.0; }
    }
    if (mat == 18u) {
      // crystalline facets: elongated diamond lattice with glowing seams
      let pu = max(fl, 6.0) * 0.5; let pv = max(fl, 6.0) * 1.1;
      let tu = fd / pu; let tv = yRel / pv;
      let w = fw.x / pu * 1.5 + 0.01;
      let d1 = abs(fract(tu + tv) - 0.5); let d2 = abs(fract(tu - tv) - 0.5);
      let seam = max(smoothstep(0.5 - w, 0.5, d1), smoothstep(0.5 - w, 0.5, d2));
      let fade = 1.0 - smoothstep(0.08, 0.3, max(fw.x / pu, fw.y / pv));
      // alternate facet tint so neighbouring diamonds catch the sky differently
      let cell = floor(tu + tv) + floor(tu - tv) * 3.0;
      S.alb *= 0.6 + 0.9 * hash11u(u32(cell + 500.0));
      S.emis += vec3f(0.75, 0.7, 1.0) * seam * mix(0.04, 0.22, fade);
      S.alb = mix(S.alb, vec3f(0.5, 0.5, 0.55), seam * fade);
      if (seam * fade > 0.5) { S.mid = 0.0; }
    }
    if ((flags & 4u) != 0u) {
      let hf = saturate((wp.y - P.a.y) / max(P.b.z, 1.0));
      let dots = mix(0.25, pulse(0.25, 0.75, fract(fd / 0.6), fw.x / 0.6) * pulse(0.25, 0.75, fract(yRel / 0.6), fw.y / 0.6), 1.0 - smoothstep(0.15, 0.4, max(fw.x, fw.y) / 0.6));
      S.emis += ledColor(wp, seed, hf) * dots;
    }
  } else if (mat == 4u) {
    // ---------------- Bund stone
    let st = col * (0.62 + 0.2 * vnoise2(vec2f(fd * 0.5, wp.y * 0.5)));
    S.alb = st; S.rough = 0.7; S.wet = 0.5;
    let G = windowGrid(fd, fl, yRel, floorH, winW, seed, fid, fw, vt, scale, prm, 2u, 1.25);
    // rustication at ground floor
    let gfl = smoothstep(floorH * 1.0, floorH * 0.95, yRel);
    let groove = pulse(0.0, 0.08, fract(yRel / 0.6), fw.y / 0.6) * gfl;
    // pilasters every two cells
    let pil = pulse(-0.06, 0.06, fract(G.id.x * 0.5 + G.f.x * 0.5 + 0.5) - 0.5, fw.x / (G.cw * 2.0)) * G.det;
    // cornices
    let cor = pulse(topY - 2.2, topY - 1.2, wp.y, fw.y) + pulse(baseY + floorH - 0.1, baseY + floorH + 0.6, wp.y, fw.y);
    S.alb = mix(S.alb, S.alb * 0.55, groove);
    S.alb = mix(S.alb, S.alb * 1.25, saturate(pil + cor));
    S.n = normalize(n + vec3f(0.0, cor * 0.6, 0.0));
    S.alb = mix(S.alb, vec3f(0.025, 0.02, 0.015), G.cov * (1.0 - saturate(pil + cor)));
    S.emis = G.e * (1.0 - saturate(pil + cor));
    if ((flags & 16u) != 0u) {
      let fl2 = vec3f(1.0, 0.72, 0.42);
      let up = 0.75 * exp(-max(yRel, 0.0) / 8.0) + 0.45 * smoothstep(topY - 8.0, topY - 1.0, wp.y) + 0.05;
      S.emis += S.alb * fl2 * up * (1.0 - G.cov) + fl2 * cor * 0.12;
    }
  } else if (mat == 5u || mat == 6u) {
    // ---------------- shop podium (5) and steppe patterned brick (6)
    let gl = terrainHeight(wp.xz);
    let hr = wp.y - gl;
    let brick = mat == 6u;
    var base = col * (0.8 + 0.3 * vnoise2(vec2f(fd * 0.4 + seed, wp.y * 0.3)));
    if (brick) {
      let bv = wp.y / 0.25;
      let bu = fd / 0.5 + 0.5 * floor(bv);
      let mort = max(pulse(0.0, 0.1, fract(bv), fw.y / 0.25), pulse(0.0, 0.06, fract(bu), fw.x / 0.5));
      let mf = 1.0 - smoothstep(0.1, 0.3, fw.y / 0.25);
      base = mix(base * (0.9 + 0.2 * hash21(vec2f(floor(bu), floor(bv)))), vec3f(0.35, 0.32, 0.28) * 0.5, mort * mf);
      let dm = abs(fract(fd / 3.0) - 0.5) + abs(fract(wp.y / 3.0) - 0.5);
      let dia = pulse(0.26, 0.34, dm, max(fw.x, fw.y) / 3.0) * (1.0 - smoothstep(0.15, 0.4, fw.y / 3.0));
      base = mix(base, vec3f(0.05, 0.45, 0.48), dia);
    }
    S.alb = base; S.rough = 0.75;
    if (hr < 4.6) {
      // ground-floor shopfronts
      let bwT = 4.5 + 3.0 * hash11u(u32(seed) + fid * 3u);
      let nb = max(1.0, round(fl / bwT));
      let bw = fl / nb;
      let bx = fd / bw;
      let bid = floor(bx) + f32(fid) * 17.0 + seed;
      let bf = fract(bx);
      let hb = hash11u(u32(bid * 7.0) + 3u);
      let arcade = (flags & 8u) != 0u;
      let colw = select(0.07, 0.11, arcade);
      let pillar = 1.0 - pulse(colw, 1.0 - colw, bf, fw.x / bw);
      let fasc = pulse(3.35, 4.6, hr, fw.y);
      let shut = hb < 0.2 && !arcade;
      var shopC = mix(mix(vec3f(1.0, 0.9, 0.76), vec3f(0.85, 0.92, 1.0), step(0.6, fract(hb * 9.1))), hsv(fract(hb * 5.3), 0.35, 1.0), step(0.75, fract(hb * 3.7)));
      if (brick) { shopC = mix(vec3f(1.0, 0.62, 0.3), hsv(fract(0.02 + hb * 0.1), 0.6, 1.0), step(0.5, fract(hb * 6.1))); }
      let fr = vec2f((bf - colw) / (1.0 - 2.0 * colw), saturate((hr - 0.15) / 3.2));
      let glassM = (1.0 - pillar) * pulse(0.15, 3.35, hr, fw.y);
      var room = vec3f(0.0);
      let det = 1.0 - smoothstep(0.15, 0.5, fw.x / bw);
      if (glassM > 0.0 && det > 0.01) {
        room = interior(fr, vt, vec3f(bw * (1.0 - 2.0 * colw), 3.2, select(7.0, 9.0, arcade)), hb * 31.0, select(2u, 3u, arcade));
      } else { room = vec3f(0.7); }
      room *= shopC;
      if (shut) {
        let rib = 0.75 + 0.25 * sin(hr * 40.0) * det;
        S.alb = mix(S.alb, vec3f(0.22, 0.23, 0.24) * rib, glassM);
        S.emis = vec3f(0.6, 0.5, 0.4) * 0.02 * glassM;
        S.metal = glassM * 0.6;
      } else {
        S.alb = mix(S.alb, vec3f(0.02), glassM);
        S.emis = room * glassM * 0.45;
        S.rough = mix(S.rough, 0.08, glassM);
      }
      // fascia (sign backing)
      S.alb = mix(S.alb, mix(vec3f(0.04), hsv(fract(hb * 2.1), 0.5, 0.25), step(0.5, hb)), fasc * (1.0 - pillar));
      S.emis += shopC * 0.6 * pulse(3.3, 3.42, hr, fw.y) * (1.0 - pillar) * select(1.0, 0.0, shut);
      if (arcade) { S.alb = mix(S.alb, base * 1.1, pillar); }
    } else if (brick && hr < 6.6 && hr > 4.9 && (flags & 8u) != 0u) {
      // carpet-pattern band, uplit
      let cb = carpet(vec2f(fd / 1.7, (hr - 4.9) / 1.7));
      S.alb = cb; S.emis = cb * 0.35;
    } else {
      let style = select(select(1u, 0u, hash11u(u32(seed) + 99u) < 0.55), 3u, brick);
      let G = windowGrid(fd, fl, yRel, floorH, winW, seed, fid, fw, vt, scale, prm, style, select(0.8, 1.5, brick));
      S.alb = mix(S.alb, vec3f(0.02, 0.025, 0.03), G.cov);
      S.emis = G.e; S.rough = mix(S.rough, 0.1, G.cov);
      if (brick) { S.emis *= vec3f(1.0, 0.8, 0.6); }
    }
    // spill light on the wall near the street
    S.emis += S.alb * vec3f(1.0, 0.7, 0.5) * 0.35 * exp(-max(hr - 4.6, 0.0) * 0.4) * step(4.6, hr);
  } else if (mat == 7u) {
    // ---------------- glazed tiles (domes, iwans)
    var c = col;
    if ((flags & 8192u) != 0u) {
      // ribbed dome
      let ang = fd / max(fl, 1.0) * 32.0;
      let rib = pow(abs(sin(ang * PI)), 0.5);
      S.n = normalize(n + vec3f(n.z, 0.0, -n.x) * cos(ang * TAU) * 0.15);
      c = c * (0.65 + 0.45 * rib);
      let gp = girih(vec2f(fd / 1.6, wp.y / 1.6));
      c = mix(c, vec3f(0.9, 0.85, 0.65), gp * 0.35 * (1.0 - smoothstep(0.1, 0.35, fw.x / 1.6)));
    } else {
      let gp = girih(vec2f(fd / 2.2, wp.y / 2.2)) * (1.0 - smoothstep(0.1, 0.35, max(fw.x, fw.y) / 2.2));
      c = mix(c, vec3f(0.92, 0.9, 0.8), gp * 0.6);
      c = mix(c, vec3f(0.05, 0.12, 0.45), pulse(0.4, 0.6, fract(wp.y / 7.0), fw.y / 7.0) * 0.5);
    }
    S.alb = c; S.rough = 0.22; S.wet = 0.4;
    S.emis = c * 0.18;
    if ((flags & 4096u) != 0u && f32(fid) == floor(prm + 0.5)) {
      // iwan portal: pointed arch recess with muqarnas glow and tile frame
      let ux = (fd / fl - 0.5) * 2.0;           // -1..1 across the face
      let vy = yRel / max(topY - baseY, 1.0);    // 0..1 up
      let aw = 0.62; let spring = 0.58;
      var inside = abs(ux) < aw && vy < spring;
      if (!inside && vy >= spring) {
        let r = aw * 1.6;
        let d1 = length(vec2f(ux + aw - r, (vy - spring) * 2.2));
        let d2 = length(vec2f(ux - aw + r, (vy - spring) * 2.2));
        inside = d1 < r && d2 < r && vy < spring + 0.4;
      }
      let frameB = abs(ux) > 0.82 || vy > 0.9;
      if (inside) {
        let mq = interior(vec2f(ux * 0.5 + 0.5, vy), vt, vec3f(fl * 0.62, (topY - baseY) * 0.8, 10.0), seed, 3u);
        let hc = fract(vec2f(fd / 1.1, wp.y / 0.9));
        let cell = 1.0 - smoothstep(0.25, 0.45, length(hc - 0.5));
        S.alb = vec3f(0.05, 0.12, 0.15);
        S.emis = vec3f(1.0, 0.62, 0.28) * (0.12 + cell * 0.7 * step(0.45, vy)) + mq * vec3f(0.9, 0.7, 0.45) * 0.35;
      } else if (frameB) {
        let gp = girih(vec2f(fd / 1.0, wp.y / 1.0));
        S.alb = mix(vec3f(0.03, 0.18, 0.55), vec3f(0.95, 0.9, 0.75), gp);
        S.emis = S.alb * 0.3;
      }
    }
  } else if (mat == 8u) {
    // ---------------- Hongyadong wood with glowing lattices
    let G = windowGrid(fd, fl, yRel, floorH, winW, seed, fid, fw, vt, scale, 0.8, 4u, 2.4);
    let lat = 1.0 - (1.0 - pulse(0.08, 0.92, fract(G.f.x * 5.0), fw.x * 5.0 / G.cw)) * (1.0 - pulse(0.08, 0.92, fract(G.f.y * 4.0), fw.y * 4.0 / floorH)) * G.det;
    let wood = col * (0.7 + 0.3 * vnoise2(vec2f(fd * 3.0, wp.y * 0.3)));
    S.alb = mix(wood, vec3f(0.1, 0.06, 0.02), G.cov);
    let gold = vec3f(1.0, 0.62, 0.22);
    // lit rooms behind the lattice (parallax interiors), each window a slightly different warmth
    let wv = 0.75 + 0.5 * hash21(G.id + vec2f(seed, 3.0));
    let behind = G.e * vec3f(1.0, 0.78, 0.5) * 1.6 + gold * 0.1 * G.g.x;
    S.emis = mix(gold * prm * 0.4 * G.cov, behind * mix(0.35, 1.0, lat) * wv, G.det);
    // beam lines glow
    S.emis += gold * 0.9 * pulse(0.0, 0.05, G.f.y, fw.y / floorH) * G.det;
    S.rough = 0.6;
  } else if (mat == 9u) {
    // ---------------- felt (ger), white with ornament bands
    let hf = saturate((wp.y - P.a.y) / max(P.b.z, 1.0));
    var c = col * (0.9 + 0.1 * vnoise2(vec2f(fd * 0.8, wp.y * 0.8)));
    let band = pulse(prm, prm + 0.07, hf, fw.y / max(P.b.z, 1.0)) + pulse(0.04, 0.09, hf, fw.y / max(P.b.z, 1.0));
    let key = step(0.5, fract(fd / 1.2 + step(0.5, fract(wp.y / 0.6)) * 0.5));
    c = mix(c, mix(vec3f(0.42, 0.04, 0.04), vec3f(0.75, 0.52, 0.14), key), saturate(band));
    let ribs = pulse(-0.04, 0.04, fract(fd / max(fl, 1.0) * 40.0) - 0.5, fw.x / max(fl, 1.0) * 40.0) * step(0.2, hf);
    c = mix(c, vec3f(0.5, 0.15, 0.1), ribs * 0.6 * f32((flags & 8192u) != 0u));
    S.alb = c; S.rough = 0.9; S.wet = 0.3;
    S.emis = c * vec3f(1.0, 0.82, 0.62) * (0.03 + 0.22 * exp(-hf * 5.0));
  } else if (mat == 10u) {
    S.alb = col; S.metal = 0.85; S.rough = 0.35; S.wet = 0.3;
  } else if (mat == 11u) {
    // ---------------- emissive (neon trim, lanterns, aviation lights)
    var k = prm;
    let mode = u32(P.e.z + 0.5);
    if (mode == 1u) { k *= step(fract(time() * 0.8 + seed * 0.013), 0.22); }
    if (mode == 2u) { k *= 0.85 + 0.15 * sin(time() * 3.0 + seed * 1.7) * sin(time() * 7.3 + seed); }
    if (mode == 3u) { k *= 0.6 + 0.4 * sin(time() * 1.2 + seed); }
    S.alb = col * 0.3; S.emis = col * k; S.rough = 0.4;
  } else if (mat == 12u) {
    // ---------------- glazed roof tiles with glowing eave edge
    let hf = saturate((wp.y - P.a.y) / max(P.b.z, 0.5));
    let rows = pulse(0.0, 0.25, fract(fd / 0.45), fw.x / 0.45);
    S.alb = col * (0.7 + 0.3 * rows); S.rough = 0.45; S.wet = 0.35;
    S.emis = vec3f(1.0, 0.6, 0.25) * prm * (1.0 - smoothstep(0.0, 0.12, hf));
  } else if (mat == 13u) {
    // ---------------- TV tower spheres: pink glass with LED dots
    S.alb = col * 0.3; S.metal = 0.2; S.rough = 0.12; S.mid = 2.0;
    let cu = fd / 1.6; let cv = wp.y / 1.6;
    let cell = floor(vec2f(cu, cv));
    let fr = fract(vec2f(cu, cv)) - 0.5;
    let dotm = 1.0 - smoothstep(0.15, 0.3, length(fr));
    let tw = 0.5 + 0.5 * sin(time() * (1.0 + 2.0 * hash21(cell)) + hash21(cell + 3.0) * 6.28);
    let det = 1.0 - smoothstep(0.15, 0.4, max(fw.x, fw.y) / 1.6);
    S.emis = col * prm * 0.35 + mix(col * 0.25, mix(col, vec3f(1.0), 0.45) * dotm * tw * 3.0, det) * prm;
  } else if (mat == 14u) {
    // ---------------- lit crown lantern (slats)
    let hf = saturate((wp.y - P.a.y) / max(P.b.z, 1.0));
    let sl = pulse(0.2, 0.8, fract(fd / 1.4), fw.x / 1.4);
    let slat = mix(0.6, sl, 1.0 - smoothstep(0.15, 0.4, fw.x / 1.4));
    let pulseK = 0.85 + 0.15 * sin(time() * 0.7 + seed);
    S.alb = col * 0.2; S.rough = 0.2;
    // up-lighting: bright at the foot of each crown tier, fading upward, with a hot rim at the base
    let up = 0.25 + 1.1 * exp(-hf * 3.2) + 1.2 * (1.0 - smoothstep(0.0, 0.05, hf));
    S.emis = col * prm * up * 0.55 * (0.2 + 0.8 * slat) * pulseK;
  } else if (mat == 19u) {
    // ---------------- woven carpet (market goods): medallion pattern, softly lit by the stall lamps
    let hf = (wp.y - P.a.y) / max(P.b.z, 0.1);
    let cb = carpet(vec2f(fd / max(fl, 0.3) * 1.0 + seed * 0.13, hf * 1.6));
    let hue = hsv(fract(seed * 0.071), 0.5, 1.0);
    S.alb = cb * mix(vec3f(1.0), hue, 0.35); S.rough = 0.95; S.wet = 0.2;
    S.emis = S.alb * vec3f(1.0, 0.75, 0.5) * 0.25;
  } else if (mat == 15u) {
    S.alb = vec3f(0.2); S.metal = 0.6; S.rough = 0.4;
    S.emis = vec3f(1.0, 0.85, 0.3) * 2.0 * pulse(0.0, 0.3, fract(fd / 2.0), fw.x / 2.0);
  } else if (mat == 17u) {
    // ---------------- clock face on stone
    S.alb = col; S.rough = 0.7;
    let fc = vec2f(fd / fl - 0.5, (wp.y - P.a.y) / max(P.b.z, 1.0) - 0.5) * vec2f(fl, P.b.z);
    let r = length(fc) / (min(fl, P.b.z) * 0.38);
    if (r < 1.0) {
      let t = time() / 60.0;
      let ang = atan2(fc.x, fc.y);
      let hm = 1.0 - smoothstep(0.0, 0.08, abs(fract((ang / TAU) * 12.0 + 0.5) - 0.5) * 2.0);
      let mh = abs(fract(ang / TAU - fract(t / 60.0) + 0.5) - 0.5) < 0.012 && r < 0.85;
      let hh = abs(fract(ang / TAU - fract(t / 720.0) + 0.5) - 0.5) < 0.02 && r < 0.6;
      S.alb = vec3f(0.9, 0.85, 0.7);
      S.emis = vec3f(1.0, 0.9, 0.7) * 1.4 * (1.0 - step(0.9, r) * 0.6);
      if (mh || hh || (r > 0.82 && hm > 0.5)) { S.emis = vec3f(0.0); S.alb = vec3f(0.02); }
    } else {
      S.emis = S.alb * vec3f(1.0, 0.72, 0.42) * 0.6;
    }
  }

  // edge light strips (CBD accent) and lit crowns
  if (!isCap && (flags & 32u) != 0u) {
    let ew = 0.45 + fwp * 0.5;
    var edge = max(1.0 - smoothstep(0.0, ew, fd), 1.0 - smoothstep(0.0, ew, fl - fd));
    if (u32(P.c.x + 0.5) == 3u) {
      // lobed plan: strips run along the lobe tips (they spiral with the twist)
      let per = fl / max(floor(P.c.y), 1.0);
      let dd = abs(fract(fd / per + 0.5) - 0.5) * per * scale;
      edge = 1.0 - smoothstep(0.0, ew * 1.6, dd);
    }
    let accent = hsv(fract(seed * 0.0137), select(0.55, 0.08, seed < 1.0), 1.0);
    S.emis += accent * edge * 3.0;
  }
  if (!isCap && (flags & 32768u) != 0u) {
    let k = smoothstep(topY - 14.0, topY, wp.y);
    S.emis += hsv(fract(seed * 0.0291 + 0.1), 0.3, 1.0) * k * k * 0.9;
  }
  // a touch of facade self-illumination so silhouettes read at night
  S.emis += S.alb * 0.006;
  return gbuf(S.alb, S.rough, S.n, S.metal, S.emis, S.ao, motionVector(wp, wp), S.mid, S.wet);
}
`;
