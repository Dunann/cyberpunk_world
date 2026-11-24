// Park ground for the land-use plan (plan.js): lawns, paved walks with lit edge lines, light pools, plazas, ponds,
// city squares, the Silk Road Garden's star plaza and the bridge approach avenues. No point lights.
//  - Lantern Park and the Silk Road Garden (the designed parks) read the layout map and the light map baked by
//    planPark.js: signed distances to walk, plaza and pond edges (LED curbs, paving, water) and the pools of the
//    pole lamps, lanterns and uplit trees.
//  - The quay walk, the city squares and the approach avenues stay analytic: layout from the water distance c, a
//    coordinate a along the river reach, the owner's street grid and a few segments computed by the plan. The CPU
//    mirror of those curves is in plan.js (walk0c, parkPath); keep them identical.
//
// parkShade() is called by groundShade (terrainShade.js) where the plan's park coverage is above zero.

import { PLAZA_IN } from './plan.js';

const f = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
const v2 = (x, z) => `vec2f(${f(+x.toFixed(2))}, ${f(+z.toFixed(2))})`;

// Nearest-segment search, unrolled in the generated code (no runtime indexing into const arrays).
function segCode(name, segs) {
  if (!segs.length) return `fn ${name}(p: vec2f) -> vec3f { return vec3f(1e9, 0.0, 0.0); }`;
  const lines = segs.map((s, i) => `  r = segNear(p, ${v2(s.ax, s.az)}, ${v2(s.bx, s.bz)}, r, ${f(i)});`).join('\n');
  return `fn ${name}(p: vec2f) -> vec3f {\n  var r = vec3f(1e9, 0.0, 0.0);\n${lines}\n  return r;\n}`;
}

// Light levels (HDR). Tuned on held-out cameras only.
export const PARK_LIGHT = { edge: 2.4, dot: 14, bollard: 40, lamp: 95, plaza: 1.0, led: 3.2, pond: 2.0 };

export function parkWGSL(plan) {
  const silk = plan.silk || { x: 0, z: 0, r: 0, rings: [0, 0, 0], spokeR: 0 };
  const L = PARK_LIGHT;
  const lay = plan.layout;
  const reg = (st) => lay.regions.find((r) => r.style === st) || { X0: 0, Z0: 0, off: 0 };
  const rl = reg(1), rs = reg(2);
  return /* wgsl */ `
@group(1) @binding(11) var parkLay: texture_2d<f32>;   // x walk edge distance, y plaza, z pond (m, negative inside), w LED curb
@group(1) @binding(12) var parkLit: texture_2d<f32>;   // rgb light pools of lamps, lanterns and uplit trees
const PL_ATLAS = vec2f(${f(lay.atlasW)}, ${f(lay.atlasH)});
const PL_O1 = ${v2(rl.X0, rl.Z0)};
const PL_OFF1 = ${f(rl.off)};
const PL_O2 = ${v2(rs.X0, rs.Z0)};
const PL_OFF2 = ${f(rs.off)};
const PL_TEX = 2.0;
const PK_AXIS = ${v2(plan.axis[0], plan.axis[1])};
const PLAZA_IN = ${f(PLAZA_IN)};
const SILK_C = ${v2(silk.x, silk.z)};
const SILK_R = ${f(silk.r)};
const SILK_RING = vec3f(${silk.rings.map(f).join(', ')});
const SILK_SPOKE = ${f(silk.spokeR)};
const PK_LAWN = vec3f(0.058, 0.082, 0.042);
const PK_GOLD = vec3f(1.0, 0.62, 0.26);
const PK_JADE = vec3f(0.35, 1.0, 0.62);
const PK_TURQ = vec3f(0.15, 0.85, 0.9);
const PK_MAG = vec3f(0.95, 0.2, 0.75);
const PK_WARM = vec3f(1.0, 0.72, 0.42);
const PK_EDGE = ${f(L.edge)};
const PK_DOT = ${f(L.dot)};
const PK_BOLLARD = ${f(L.bollard)};
const PK_LAMP = ${f(L.lamp)};
const PK_PLAZA = ${f(L.plaza)};
const PK_LED = ${f(L.led)};
const PK_POND = ${f(L.pond)};

// nearest point on segment a-b: keeps (distance, along, index) of the closest so far
fn segNear(p: vec2f, a: vec2f, b: vec2f, r: vec3f, idx: f32) -> vec3f {
  let pa = p - a; let ba = b - a;
  let L = max(length(ba), 1e-3);
  let h = clamp(dot(pa, ba) / (L * L), 0.0, 1.0);
  let d = length(pa - ba * h);
  return select(r, vec3f(d, h * L, idx), d < r.x);
}
${segCode('avenueNear', plan.avenues)}
${segCode('gardenAvenueNear', plan.silkAvenues)}

// Antialiased band |d| < w, softened over one pixel footprint.
fn pkBand(d: f32, w: f32, px: f32) -> f32 { return 1.0 - smoothstep(w - px * 0.5, w + px * 0.5, abs(d)); }
// Thin emissive line of half-width w centred at d = 0: widened to at least about one pixel at distance, with its
// brightness scaled down by the same factor, so it neither vanishes nor shimmers.
fn pkLine(d: f32, w: f32, px: f32) -> f32 {
  let we = max(w, px * 0.6);
  return (1.0 - smoothstep(we * 0.5, we, abs(d))) * (w / we);
}
// Small light seen from above (radius r) at distance d, widened like pkLine (energy kept).
fn pkDot(d: f32, r: f32, px: f32) -> f32 {
  let re = max(r, px * 0.7);
  return (1.0 - smoothstep(re * 0.4, re, d)) * (r * r) / (re * re);
}
// Irradiance factor on flat ground from a lamp at horizontal distance d and height h, with a soft cut-off at R.
fn pkPool(d: f32, h: f32, R: f32) -> f32 {
  let d2 = d * d + h * h;
  let x = d / R;
  let fall = saturate(1.0 - x * x * x * x);
  return h / (d2 * sqrt(d2)) * fall * fall;
}

struct PathHit { mask: f32, edge: f32, dot: f32, pool: f32 };
// One walk: d = signed distance across the centre line, s = coordinate along it, hw = half width, sp = bollard
// spacing. Bollards alternate sides at the path edge; their pools light the path and the lawn beside it.
fn pkWalk(h0: PathHit, d: f32, s: f32, hw: f32, sp: f32, px: f32) -> PathHit {
  var h = h0;
  if (abs(d) > hw + 15.0) { return h; }
  h.mask = max(h.mask, pkBand(d, hw, px));
  h.edge += pkLine(abs(d) - hw + 0.1, 0.07, px);
  // lamp posts on alternating sides: the nearest three light this point
  let k = round(s / sp);
  for (var j = -1; j <= 1; j++) {
    let kk = k + f32(j);
    let side = select(-1.0, 1.0, (i32(kk) & 1) == 0);
    let bd = length(vec2f(s - kk * sp, d - side * (hw + 0.35)));
    if (j == 0) { h.dot += pkDot(bd, 0.16, px); }
    h.pool += pkPool(bd, 3.5, 15.0);
  }
  return h;
}

struct ParkOut { albedo: vec3f, rough: f32, emis: vec3f, wet: f32, flat: f32 };

// Lantern Park (style 1) and the Silk Road Garden (style 2): layout and light from the baked maps.
fn designedPark(p: vec3f, style: f32, px: f32, near: f32, lawn: vec3f) -> ParkOut {
  var o: ParkOut;
  let xz = p.xz;
  let lantern = style < 1.5;
  let uv = select((vec2f(PL_OFF2, 0.0) + (xz - PL_O2) / PL_TEX) / PL_ATLAS, (vec2f(PL_OFF1, 0.0) + (xz - PL_O1) / PL_TEX) / PL_ATLAS, lantern);
  let Ly = textureSampleLevel(parkLay, sampClamp, uv, 0.0);
  let E = textureSampleLevel(parkLit, sampClamp, uv, 0.0).rgb;
  let edgeCol = select(PK_TURQ, PK_GOLD, lantern);
  o.albedo = lawn; o.rough = 0.9; o.wet = 0.25; o.flat = 0.0;
  // walks and plazas: stone slabs with joints, wet
  let walkM = 1.0 - smoothstep(-px * 0.5, px * 0.5, Ly.x);
  let plazaM = 1.0 - smoothstep(-px * 0.5, px * 0.5, Ly.y);
  let pm = max(walkM, plazaM);
  if (pm > 0.0) {
    let cell = xz / vec2f(1.2, 0.8);
    let sl = fract(cell);
    let jt = (1.0 - smoothstep(0.0, 0.05, min(min(sl.x, 1.0 - sl.x), min(sl.y, 1.0 - sl.y)))) * near;
    let stone = vec3f(0.11, 0.104, 0.098) * (0.85 + 0.3 * hash21(floor(cell))) * (1.0 - 0.45 * jt);
    o.albedo = mix(o.albedo, stone, pm);
    o.rough = mix(o.rough, 0.45, pm);
    o.wet = mix(o.wet, 0.85, pm);
  }
  // LED curb (0.22 m) along the main walks; LED ring around the plazas
  var em = edgeCol * pkLine(Ly.x - 0.11, 0.11, px) * saturate(Ly.w) * (1.0 - plazaM) * PK_LED;
  em += edgeCol * pkLine(Ly.y - 0.12, 0.12, px) * PK_LED * 1.2;
  // plaza floor: slow waves of LED tiles (gold and jade), livelier during the light show
  if (plazaM > 0.0 && lantern) {
    let tq = xz / 1.4;
    let tf = abs(fract(tq) - 0.5);
    let tile = 1.0 - smoothstep(0.36, 0.42, max(tf.x, tf.y));
    let ph = time() * (0.35 + F.show.x * 1.6) + Ly.y * 0.18 + hash21(floor(tq)) * 0.6;
    let wave = 0.5 + 0.5 * sin(ph * 2.0);
    em += mix(PK_GOLD, PK_JADE, wave) * (0.2 + 0.5 * wave) * mix(0.55, tile, near) * plazaM * smoothstep(0.5, 1.5, -Ly.y) * PK_PLAZA;
  }
  if (!lantern) {
    // the garden's star plaza (analytic, centred on SILK_C)
    let q = xz - SILK_C;
    let r = length(q);
    if (r < SILK_R + 1.0) {
      let g1 = abs(fract(q / 4.5) - 0.5);
      let q2 = vec2f(q.x + q.y, q.y - q.x) * 0.70710678;
      let g2 = abs(fract(q2 / 4.5) - 0.5);
      let lat = max(pkLine((0.5 - max(g1.x, g1.y)) * 4.5, 0.05, px), pkLine((0.5 - max(g2.x, g2.y)) * 4.5, 0.05, px));
      let s1 = max(abs(q.x), abs(q.y)) - 17.0;
      let s2 = max(abs(q2.x), abs(q2.y)) - 17.0;
      let star = pkLine(min(s1, s2), 0.14, px);
      let pulse = 0.75 + 0.25 * sin(time() * 0.8 - r * 0.15) + F.show.x * 0.4 * sin(time() * 4.0 - r * 0.3);
      em += (PK_TURQ * lat * 0.8 + PK_MAG * star * 2.2 * pulse) * pkBand(r, SILK_R, px) * PK_PLAZA;
    }
    // water channel down the middle of the garden avenues
    let ga = gardenAvenueNear(xz);
    if (ga.x < 3.0 && r > SILK_R - 1.0) { o.flat = max(o.flat, pkBand(ga.x, 0.8, px)); }
  }
  // lotus ponds: dark mirror water with pads and a few glowing flowers, a stone rim with a warm lit edge
  let pondM = 1.0 - smoothstep(-px * 0.5, px * 0.5, Ly.z);
  if (Ly.z < 1.2) {
    let rim = pkBand(Ly.z - 0.55, 0.55, px);
    o.albedo = mix(o.albedo, vec3f(0.13, 0.125, 0.115), rim);
    o.rough = mix(o.rough, 0.5, rim);
    em += PK_WARM * pkLine(Ly.z - 0.1, 0.09, px) * PK_POND;
    o.flat = max(o.flat, pondM);
    if (Ly.z < -1.0 && near > 0.0) {
      let pc = xz / 2.3;
      let ce = floor(pc);
      let h = hash21(ce);
      let d = length(fract(pc) - 0.5 - (vec2f(hash21(ce + 3.1), hash21(ce + 7.7)) - 0.5) * 0.3) * 2.3;
      let pad = (1.0 - smoothstep(0.38 + 0.3 * h, 0.45 + 0.3 * h, d)) * step(h, 0.55) * near;
      o.flat *= 1.0 - pad;
      o.albedo = mix(o.albedo, vec3f(0.06, 0.12, 0.04), pad);
      em += vec3f(1.0, 0.35, 0.55) * (1.0 - smoothstep(0.08, 0.16, d)) * step(h, 0.08) * 2.0 * near;
    }
  }
  if (o.flat > 0.0) {
    o.albedo = mix(o.albedo, vec3f(0.01, 0.012, 0.013), o.flat);
    o.rough = mix(o.rough, 0.03, o.flat);
    o.wet = mix(o.wet, 1.0, o.flat);
  }
  o.emis = em + E * o.albedo / PI;
  return o;
}

fn parkShade(p: vec3f, style: f32, c: f32, owner: f32, px: f32, N1: vec4f, N2: vec4f, slope: f32) -> ParkOut {
  var o: ParkOut;
  let xz = p.xz;
  let near = 1.0 - smoothstep(0.3, 1.5, px);
  let a = dot(xz, PK_AXIS);
  // lawn: mown stripes close up, darker clover patches
  var lawn = PK_LAWN * (0.8 + 0.4 * N1.g) * (0.85 + 0.3 * N2.r);
  lawn *= 1.0 + 0.06 * (1.0 - smoothstep(0.05, 0.25, px)) * sign(sin(a * 0.65));
  o.albedo = lawn; o.rough = 0.9; o.wet = 0.25; o.emis = vec3f(0.0); o.flat = 0.0;
  var h = PathHit(0.0, 0.0, 0.0, 0.0);
  var edgeCol = PK_GOLD;
  var lightCol = PK_WARM;
  var plaza = 0.0;
  var plazaEm = vec3f(0.0);
  if (style < 2.5) { return designedPark(p, style, px, near, lawn); }
  if (style > 4.5) {
    // ---- bridge approach avenue: asphalt, centre line, lane dashes, sidewalks, street-lamp pools
    let av = avenueNear(xz);
    let hw = 7.0;
    let road = pkBand(av.x, hw, px);
    let side = pkBand(av.x, hw + 3.2, px) - road;
    var asph = vec3f(0.024, 0.024, 0.027) * (0.9 + 0.2 * N2.r);
    let cl = pkLine(av.x, 0.09, px) * near;
    let dash = pkLine(abs(av.x) - hw * 0.5, 0.06, px) * step(0.55, fract(av.y / 9.0)) * near;
    asph = mix(asph, vec3f(0.6, 0.45, 0.1), cl);
    asph = mix(asph, vec3f(0.55), dash);
    let tile = fract(xz / 0.6);
    let joint = (1.0 - smoothstep(0.0, 0.06, min(min(tile.x, 1.0 - tile.x), min(tile.y, 1.0 - tile.y)))) * near;
    let pave = vec3f(0.075, 0.072, 0.07) * (1.0 - joint * 0.5);
    o.albedo = mix(o.albedo, asph, road);
    o.albedo = mix(o.albedo, pave, side);
    o.rough = mix(o.rough, 0.62, road + side);
    o.wet = mix(o.wet, 0.9, road + side);
    // street lamps every 26 m, staggered on both sides: pools on the road and the sidewalks
    let sp = 26.0;
    var E = 0.0;
    for (var k = 0; k < 2; k++) {
      let s0 = (floor(av.y / sp) + f32(k)) * sp;
      E += pkPool(length(vec2f(av.y - s0, av.x - (hw + 0.8))), 6.9, 24.0);
      E += pkPool(length(vec2f(av.y - s0 - sp * 0.5, av.x + (hw + 0.8))), 6.9, 24.0);
    }
    o.emis = vec3f(1.0, 0.55, 0.2) * PK_LAMP * E * o.albedo / PI;
    return o;
  }
  if (style < 1.5 || (style > 2.5 && style < 3.5)) {
    // ---- Lantern Park (1) and the quay walk (3): river walk, upper walks, cross walks, plazas
    let lantern = style < 1.5;
    let c0 = select(17.0 + 3.0 * sin(a / 46.0), 34.0 + 10.0 * sin(a / 46.0), lantern);
    h = pkWalk(h, c - c0, a, select(2.0, 2.4, lantern), 9.0, px);
    if (lantern) {
      h = pkWalk(h, c - (110.0 + 12.0 * sin(a / 60.0 + 2.0)), a, 1.6, 11.0, px);
      h = pkWalk(h, c - (200.0 + 14.0 * sin(a / 75.0)), a, 1.6, 11.0, px);
    }
    let ak = round(a / 120.0) * 120.0;
    if (c > c0) { h = pkWalk(h, a - ak, c, 1.4, 10.0, px); }
    if (lantern) {
      // round plaza where each cross walk meets the river walk (flat ground only)
      let pc = vec2f(ak, 34.0 + 10.0 * sin(ak / 46.0) + PLAZA_IN);
      let pd = length(vec2f(a, c) - pc);
      if (pd < 16.0 && slope < 0.1) {
        plaza = pkBand(pd, 14.0, px);
        h.edge += pkLine(pd - 13.9, 0.1, px) * 1.5;
        // LED floor tiles: slow colour waves, livelier during the light show
        let tq = (vec2f(a, c) - pc) / 1.4;
        let tf = abs(fract(tq) - 0.5);
        let tile = 1.0 - smoothstep(0.36, 0.42, max(tf.x, tf.y));
        let ph = time() * (0.35 + F.show.x * 1.6) - pd * 0.18 + hash21(floor(tq)) * 0.6;
        let wave = 0.5 + 0.5 * sin(ph * 2.0);
        let ring = 1.0 - smoothstep(12.5, 13.5, pd);
        plazaEm = mix(PK_GOLD, PK_JADE, wave) * (0.25 + 0.55 * wave) * mix(0.55, tile, near) * plaza * ring * PK_PLAZA;
      }
    }
  } else if (style < 2.5) {
    // ---- Silk Road Garden: star plaza, ring walk, avenues with water channels
    edgeCol = PK_TURQ;
    lightCol = vec3f(0.85, 0.95, 1.0);
    let q = xz - SILK_C;
    let r = length(q);
    let ga = gardenAvenueNear(xz);
    if (ga.x < 12.0 && r > SILK_R - 1.0) {
      h = pkWalk(h, ga.x, ga.y, 3.0, 8.0, px);
      o.flat = max(o.flat, pkBand(ga.x, 0.8, px));   // central water channel
    }
    let th = atan2(q.y, q.x);
    h = pkWalk(h, r - SILK_RING.x, th * SILK_RING.x, 1.8, 10.0, px);
    h = pkWalk(h, r - SILK_RING.y, th * SILK_RING.y, 1.8, 10.0, px);
    h = pkWalk(h, r - SILK_RING.z, th * SILK_RING.z, 1.8, 10.0, px);
    if (r > SILK_R && r < SILK_SPOKE) {
      // eight straight walks radiating from the plaza
      let k = round(th / (PI * 0.25));
      h = pkWalk(h, r * sin(th - k * PI * 0.25), r, 1.4, 9.0, px);
    }
    if (r < SILK_R + 1.0) {
      plaza = pkBand(r, SILK_R, px);
      h.edge += pkLine(r - SILK_R + 0.1, 0.1, px) * 1.5;
      // eight-point star lattice: two square grids, one turned by 45 degrees
      let g1 = abs(fract(q / 4.5) - 0.5);
      let q2 = vec2f(q.x + q.y, q.y - q.x) * 0.70710678;
      let g2 = abs(fract(q2 / 4.5) - 0.5);
      let lat = max(pkLine((0.5 - max(g1.x, g1.y)) * 4.5, 0.05, px), pkLine((0.5 - max(g2.x, g2.y)) * 4.5, 0.05, px));
      // the big eight-point star (khatam) in the middle: outline of two overlapping squares
      let s1 = max(abs(q.x), abs(q.y)) - 17.0;
      let s2 = max(abs(q2.x), abs(q2.y)) - 17.0;
      let star = pkLine(min(s1, s2), 0.14, px);
      let pulse = 0.75 + 0.25 * sin(time() * 0.8 - r * 0.15) + F.show.x * 0.4 * sin(time() * 4.0 - r * 0.3);
      plazaEm = (PK_TURQ * lat * 0.8 + PK_MAG * star * 2.2 * pulse) * plaza * PK_PLAZA;
    }
  } else {
    // ---- city square on the owner's street grid: ring walk, diagonals, round centre with a basin
    edgeCol = vec3f(1.0, 0.82, 0.55);
    let di = i32(owner + 0.5);
    if (di >= 0 && di < i32(W.count.x)) {
      let D = W.d[di];
      let lp = rot2(-D.b.x) * (xz - D.a.xy);
      let blk = D.b.y;
      let qq = (fract(lp / blk + 0.5) - 0.5) * blk;
      let ring = blk * 0.5 - D.b.z * 0.5 - 7.0;
      let m = max(abs(qq.x), abs(qq.y));
      let along = select(qq.y, qq.x, abs(qq.y) > abs(qq.x));
      h = pkWalk(h, m - ring, along, 1.2, 9.0, px);
      if (m < ring) { h = pkWalk(h, (abs(qq.x) - abs(qq.y)) * 0.70710678, m, 1.0, 9.0, px); }
      let rc = length(qq);
      if (rc < 9.0) {
        plaza = pkBand(rc, 7.0, px);
        h.edge += pkLine(rc - 6.9, 0.1, px) * 1.2;
        o.flat = max(o.flat, pkBand(rc, 3.2, px));   // fountain basin
        plazaEm = PK_WARM * pkLine(rc - 3.3, 0.08, px) * 2.0 * PK_PLAZA;
      }
    }
  }

  // paving for walks and plazas: large slabs with joints, wet stone
  let pm = max(h.mask, plaza);
  if (pm > 0.0) {
    let cell = xz / vec2f(1.2, 0.8);
    let sl = fract(cell);
    let jt = (1.0 - smoothstep(0.0, 0.05, min(min(sl.x, 1.0 - sl.x), min(sl.y, 1.0 - sl.y)))) * near;
    let stone = vec3f(0.095, 0.09, 0.085) * (0.85 + 0.3 * hash21(floor(cell))) * (1.0 - 0.45 * jt);
    o.albedo = mix(o.albedo, stone, pm);
    o.rough = mix(o.rough, 0.45, pm);
    o.wet = mix(o.wet, 0.85, pm);
  }
  // water channels and basins: dark, mirror-flat
  if (o.flat > 0.0) {
    o.albedo = mix(o.albedo, vec3f(0.01, 0.012, 0.013), o.flat);
    o.rough = mix(o.rough, 0.03, o.flat);
    o.wet = mix(o.wet, 1.0, o.flat);
  }
  // light: edge lines, bollard heads and the pools they cast on the surface around them
  o.emis = edgeCol * h.edge * PK_EDGE + lightCol * (h.dot * PK_DOT + h.pool * PK_BOLLARD * o.albedo / PI) + plazaEm;
  return o;
}
`;
}
