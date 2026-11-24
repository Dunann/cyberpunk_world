// Terrain WGSL: height access for the far field, CDLOD vertex shader and the ground material.

import { FAR } from './terrainGen.js';

// Height including the far field. Needs `farH` (r32float texture) declared by the including shader.
export const THEIGHT_WGSL = /* wgsl */ `
const FAR_SIZE = ${FAR.SIZE}.0;
const FAR_RES = ${FAR.RES}.0;
const FAR_ORIGIN = ${FAR.ORIGIN}.0;
const NEAR_EDGE0 = 5600.0;
const NEAR_EDGE1 = 6100.0;
fn farHeight(xz: vec2f) -> f32 {
  let t = (xz - FAR_ORIGIN) / FAR_SIZE * FAR_RES - 0.5;
  let i = vec2i(floor(t));
  let f = t - floor(t);
  let m = i32(FAR_RES) - 1;
  let h00 = textureLoad(farH, clamp(i, vec2i(0), vec2i(m)), 0).x;
  let h10 = textureLoad(farH, clamp(i + vec2i(1, 0), vec2i(0), vec2i(m)), 0).x;
  let h01 = textureLoad(farH, clamp(i + vec2i(0, 1), vec2i(0), vec2i(m)), 0).x;
  let h11 = textureLoad(farH, clamp(i + vec2i(1, 1), vec2i(0), vec2i(m)), 0).x;
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}
fn nearWeight(xz: vec2f) -> f32 {
  let m = max(abs(xz.x), abs(xz.y));
  return 1.0 - smoothstep(NEAR_EDGE0, NEAR_EDGE1, m);
}
fn tHeight(xz: vec2f) -> f32 {
  let w = nearWeight(xz);
  if (w >= 1.0) { return terrainHeight(xz); }
  let hf = farHeight(xz);
  if (w <= 0.0) { return hf; }
  return mix(hf, terrainHeight(xz), w);
}
`;

// Street layout + street lamp placement rules, shared by the terrain shader and the lamp validation pass.
// Moonlit mist lying in the valley south of the city (seen from the cliff-top viewpoint, pose 9).
// valleyMist() returns the mist cover of a surface point; shaders replace that much of the surface with
// mistColor() (albedo scaled down, emissive mixed toward the mist), so terrain and trees share one layer.
export const MIST_WGSL = /* wgsl */ `
const MIST_O = vec2f(700.0, 4560.0);
const MIST_D = vec2f(0.188, 0.9822);
fn valleyMist(p: vec3f, dist: f32, nse: f32) -> f32 {
  if (dist < 200.0) { return 0.0; }
  // thin mist on the lower slopes of the hills around West Lake
  let lk = length((p.xz - vec2f(-1990.0, 2330.0)) * vec2f(1.0, 1.2));
  let lake = (1.0 - smoothstep(1100.0, 1800.0, lk)) * (1.0 - smoothstep(4.0, 40.0 + nse * 30.0, p.y)) * smoothstep(250.0, 700.0, dist) * 0.45;
  let q = p.xz - MIST_O;
  let s = dot(q, MIST_D);
  if (s < -300.0) { return lake; }
  let c = abs(dot(q, vec2f(MIST_D.y, -MIST_D.x)));
  // the valley floor climbs about 75 m per km; the mist top follows it, with soft billows
  let top = 120.0 + 0.08 * max(s, 0.0) + (nse - 0.5) * 70.0;
  let m = 1.0 - smoothstep(top - 110.0, top, p.y);
  return max(lake, m * smoothstep(-300.0, 500.0, s) * smoothstep(200.0, 900.0, dist) * (1.0 - smoothstep(4000.0, 6500.0, c)) * 0.88);
}
fn mistColor(dir: vec3f) -> vec3f {
  return skyHorizon(normalize(vec3f(dir.x, 0.02, dir.z))) * 1.35 + SKY_MOON_COL * F.moon.w * 0.01;
}
`;

export const STREET_WGSL = /* wgsl */ `
struct Road { across: f32, along: f32, axis: f32, hw: f32, cross: f32, blk: f32, line: f32 };

// Street layout at p for district di (grid lines at multiples of the block size).
fn roadLayout(p: vec2f, di: i32) -> Road {
  let D = W.d[di];
  let lp = rot2(-D.b.x) * (p - D.a.xy);
  let blk = D.b.y;
  let fq = (fract(lp / blk + 0.5) - 0.5) * blk;
  let ax = abs(fq.x); let az = abs(fq.y);
  var r: Road;
  r.hw = D.b.z * 0.5;
  r.blk = blk;
  let alongZ = ax < az;           // nearest road runs along local z (x = const)
  r.axis = select(0.0, 1.0, alongZ);
  r.across = select(fq.y, fq.x, alongZ);
  r.along = select(lp.x, lp.y, alongZ);
  r.cross = select(ax, az, alongZ);   // distance to the crossing road centre line
  r.line = round(select(lp.y, lp.x, alongZ) / blk);
  return r;
}

// Lamps per block edge and their along-road spacing.
fn lampCount(blk: f32) -> f32 { return max(round(blk / 34.0), 1.0); }

// World position (xz) of lamp j (global index along the road) on road line 'line' of district di.
fn lampPos(di: i32, axis: f32, line: f32, j: f32, hw: f32) -> vec3f {
  let D = W.d[di];
  let blk = D.b.y;
  let n = lampCount(blk);
  let sp = blk / n;
  let along = (j + 0.5) * sp;
  let side = select(-1.0, 1.0, (i32(j) + i32(line)) % 2 == 0);
  let off = line * blk + side * (hw + 0.7);
  let lp = select(vec2f(along, off), vec2f(off, along), axis > 0.5);
  return vec3f(rot2(D.b.x) * lp + D.a.xy, side);
}

fn lampValid(p: vec2f, di: i32) -> bool {
  let info = worldInfo(p);
  return i32(info.y + 0.5) == di && info.z > 0.55 && info.x > 14.0;
}

// 0 = warm sodium, 1 = cool LED (per road line)
fn lampKind(di: i32, axis: f32, line: f32) -> f32 {
  let h = hash21(vec2f(line * 3.0 + axis * 101.0, f32(di) * 17.0));
  let t = W.d[di].b.w;
  let ledBias = select(0.25, 0.75, t == 1.0 || t == 3.0);   // CBD and Bund prefer LED
  return select(0.0, 1.0, h < ledBias);
}
fn lampColor(kind: f32) -> vec3f { return select(vec3f(1.0, 0.52, 0.18), vec3f(0.72, 0.84, 1.0), kind > 0.5); }
const LAMP_H = 6.9;
const LAMP_I = 95.0;
const LAMP_R = 24.0;
`;

// Street lamps on the plan's infill streets (needs STREET_WGSL): a lamp slot of the owner's grid is valid where the
// plan's built coverage is full and owned by that district, away from the water, and only where the existing rule
// (lampValid, unchanged) does not already place a lamp. Shared by the ground's analytic pools and the infill lamp
// validation pass (terrainLamps.js), so the two always agree.
export const INFILL_LAMP_WGSL = /* wgsl */ `
fn infillLampValid(p: vec2f, di: i32) -> bool {
  if (!inPlan(p)) { return false; }
  let c = coverAt(p);
  if (c.y < 0.0 || i32(c.y + 0.5) != di || c.x < 0.9) { return false; }
  return worldInfo(p).x > 14.0 && !lampValid(p, di);
}
`;

export function terrainDrawWGSL({ N, K, LEAF, MORPH0, simple, park }) {
  return /* wgsl */ `
@group(1) @binding(0) var<storage, read> patches: array<vec4f>;
@group(1) @binding(1) var farH: texture_2d<f32>;
@group(1) @binding(2) var nearA: texture_2d<f32>;
@group(1) @binding(3) var nearN: texture_2d<f32>;
@group(1) @binding(4) var farA: texture_2d<f32>;
@group(1) @binding(5) var farN: texture_2d<f32>;
@group(1) @binding(6) var tSamp: sampler;
@group(1) @binding(7) var tNoise: texture_2d<f32>;
@group(1) @binding(8) var tCanopy: texture_2d<f32>;
@group(1) @binding(9) var sRep: sampler;
@group(1) @binding(10) var<uniform> TU: vec4f;   // x = real street-lamp light range (m), y = same for the plan's infill lamps
${THEIGHT_WGSL}
${STREET_WGSL}
${INFILL_LAMP_WGSL}
${MIST_WGSL}
${park}

const GRID_N = ${N}.0;
const LOD_K = ${K};
const LEAF = ${LEAF}.0;
const MORPH0 = ${MORPH0};

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
};

@vertex fn vs(@location(0) g: vec2f, @builtin(instance_index) inst: u32) -> VOut {
  let P = patches[inst];
  let spacing = P.z / GRID_N;
  var xz = P.xy + g * spacing;
  let h0 = tHeight(xz);
  let d = distance(vec3f(xz.x, h0, xz.y), F.camPos.xyz);
  let R = LOD_K * LEAF * exp2(P.w);
  let morph = saturate((d - MORPH0 * R) / ((1.0 - MORPH0) * R));
  xz -= fract(g * 0.5) * 2.0 * spacing * morph;
  var o: VOut;
  o.wp = vec3f(xz.x, tHeight(xz), xz.y);
  o.pos = F.viewProj * vec4f(o.wp, 1.0);
  return o;
}

${GROUND_WGSL}

@fragment fn fs(i: VOut) -> GOut {
  let p = i.wp;
  // texture gradients (computed in uniform control flow)
  let dX = dpdx(p.xz); let dY = dpdy(p.xz);
  ${simple ? 'return gbuf(vec3f(0.05), 0.8, vec3f(0.0, 1.0, 0.0), 0.0, vec3f(0.0), 1.0, vec2f(0.0), 3.0, 0.3);' : 'return groundShade(p, dX, dY);'}
}
`;
}

// Ground material. Uses the terrain bind group textures.
const GROUND_WGSL = /* wgsl */ `
fn decodeN(t: vec4f) -> vec3f {
  let x = t.r * 2.0 - 1.0; let z = t.g * 2.0 - 1.0;
  return vec3f(x, sqrt(max(1.0 - x * x - z * z, 0.02)), z);
}
// Baked tileable noise at world scale s (cycles of the 256 tile per meter).
fn nz(p: vec2f, s: f32, dX: vec2f, dY: vec2f) -> vec4f { return textureSampleGrad(tNoise, sRep, p * s, dX * s, dY * s); }

// Rain ripples on puddles: expanding rings in a jittered grid. Returns a normal offset (xz).
fn rainRipples(p: vec2f, t: f32) -> vec2f {
  var acc = vec2f(0.0);
  for (var l = 0; l < 2; l++) {
    let sc = select(0.7, 1.13, l == 1);
    let q = p * sc + f32(l) * 17.3;
    let c = floor(q);
    let f = q - c - 0.5;
    let h = hash22(c + f32(l) * 31.0);
    let ph = fract(t * (0.9 + h.x * 0.5) + h.y);
    let o = f - (h - 0.5) * 0.6;
    let r = length(o);
    let ring = ph * 0.55;
    let w = exp(-pow((r - ring) * 22.0, 2.0)) * (1.0 - ph) * (1.0 - ph);
    acc += o / max(r, 1e-3) * w * sin((r - ring) * 60.0);
  }
  return acc * 0.35;
}

// Analytic street-lamp light for lamps beyond the real-light range (terrain only).
// Mirrors the deferred point-light model (falloff, GGX, wet-ground adjustments).
fn lampFake(p: vec3f, n: vec3f, v: vec3f, albedo: vec3f, rough: f32, lp: vec3f, kind: f32, range: f32) -> vec3f {
  let lv = lp - p;
  let d2 = dot(lv, lv);
  if (d2 > LAMP_R * LAMP_R) { return vec3f(0.0); }
  let camD = distance(lp, F.camPos.xyz);
  let fake = smoothstep(range * 0.75, range, camD);
  if (fake <= 0.0) { return vec3f(0.0); }
  let ld = sqrt(d2);
  let l = lv / ld;
  let nl = dot(n, l);
  if (nl <= 0.0) { return vec3f(0.0); }
  let x = ld / LAMP_R;
  let fall = saturate(1.0 - x * x * x * x);
  let rad = lampColor(kind) * LAMP_I * fall * fall / (d2 + 1.0);
  let h = normalize(v + l);
  let NdotH = max(dot(n, h), 0.0);
  let NdotV = max(dot(n, v), 1e-3);
  let a = rough * rough; let a2 = a * a;
  let dd = NdotH * NdotH * (a2 - 1.0) + 1.0;
  let D = a2 / (PI * dd * dd);
  let k = (rough + 1.0) * (rough + 1.0) / 8.0;
  let G = nl / (nl * (1.0 - k) + k) * NdotV / (NdotV * (1.0 - k) + k);
  let Fs = 0.04 + 0.96 * pow(1.0 - max(dot(v, h), 0.0), 5.0);
  let spec = min(D * G * Fs / (4.0 * nl * NdotV + 1e-4), 60.0);
  return (albedo / PI * (1.0 - Fs) + spec) * rad * nl * fake;
}

fn groundShade(p: vec3f, dX: vec2f, dY: vec2f) -> GOut {
  let toCam = F.camPos.xyz - p;
  let dist = length(toCam);
  let v = toCam / dist;
  let wN = nearWeight(p.xz);
  // beyond ~1.5 km the material is sampled from blurrier mips: far ridges read as clean layered forms
  let blur = 1.0 + 5.0 * smoothstep(1500.0, 5000.0, dist);
  let gX = dX * blur; let gY = dY * blur;
  var A = vec4f(0.0); var Nt = vec4f(0.5, 0.5, 0.5, 0.0);
  if (wN > 0.0) {
    let uv = (p.xz - T_ORIGIN) / T_SIZE;
    A = textureSampleGrad(nearA, tSamp, uv, gX / T_SIZE, gY / T_SIZE);
    Nt = textureSampleGrad(nearN, tSamp, uv, gX / T_SIZE, gY / T_SIZE);
  }
  if (wN < 1.0) {
    let uv = (p.xz - FAR_ORIGIN) / FAR_SIZE;
    let Af = textureSampleGrad(farA, tSamp, uv, gX / FAR_SIZE, gY / FAR_SIZE);
    let Nf = textureSampleGrad(farN, tSamp, uv, gX / FAR_SIZE, gY / FAR_SIZE);
    A = mix(Af, A, wN); Nt = mix(Nf, Nt, wN);
  }
  var albedo = A.rgb * A.rgb;
  var n = decodeN(Nt);
  let terr = A.a;
  let forest = Nt.a;
  let cav = (Nt.b - 0.5) * 50.0;
  var ao = saturate(0.75 + cav * 0.02);
  var rough = 0.85;
  var emis = vec3f(0.0);
  var mat = 3.0;
  var wet = 0.35;
  let px = max(length(dX), length(dY));     // pixel footprint in meters
  let slope = 1.0 - n.y;
  // detail noise only where it is resolvable (mip average 0.5 beyond)
  var N1 = vec4f(0.5); var N2 = vec4f(0.5);
  if (px < 6.0) { N1 = nz(p.xz, 1.0 / 40.0, dX, dY); }    // 5 m .. 0.6 m features
  if (px < 0.9) { N2 = nz(p.xz, 1.0 / 6.0, dX, dY); }     // 0.75 m .. 0.1 m features

  // ---- natural detail
  if (forest > 0.05) {
    // tree crowns (baked dome texture, mip-filtered so it fades into the canopy colour far away)
    var C = vec4f(0.5, 0.5, 0.42, 0.5);   // mip average of the crown texture
    if (px < 10.0) { C = textureSampleGrad(tCanopy, sRep, p.xz / 104.0, dX / 104.0, dY / 104.0); }
    // Close up (where real trees stand on it) the ground is a dark, matte forest floor: the baked crown
    // domes there read as a field of bulging scales. The dome relief fades in only at a distance.
    let domeK = smoothstep(220.0, 650.0, dist);
    let cf = forest * (1.0 - smoothstep(4.0, 12.0, px)) * domeK;
    let dn = (C.rg * 2.0 - 1.0) * 1.6 * cf;
    n = normalize(n + vec3f(dn.x, 0.0, dn.y));
    let tint = mix(vec3f(0.85, 1.0, 0.78), vec3f(1.2, 1.08, 0.72), C.a);
    let crowns = tint * (0.35 + 0.95 * C.b);
    let floorC = vec3f(0.17, 0.23, 0.14) * (0.75 + 0.5 * N1.g);
    albedo *= mix(vec3f(1.0), mix(floorC, crowns, domeK), forest);
    ao *= mix(1.0, mix(0.7, 0.45 + 0.55 * C.b, domeK), forest);
    rough = mix(rough, mix(0.92, 0.72, domeK), forest);
    wet = mix(wet, mix(0.15, 0.4, domeK), forest);
    if (forest > 0.5) { mat = 1.0; }
  }
  let rockW = smoothstep(0.30, 0.52, slope) * (1.0 - forest);
  if (rockW > 0.01) {
    // rock strata ledges and wet mossy stone
    let f = 1.0 - smoothstep(0.4, 2.0, px);
    let band = p.y * 1.7 + (N1.r - 0.5) * 4.0;
    let ledge = fract(band);
    let lg = smoothstep(0.0, 0.12, ledge) - smoothstep(0.85, 1.0, ledge);
    let nn = (N2.rg - 0.5) * 2.0;
    n = normalize(n + vec3f(nn.x, 0.0, nn.y) * 0.4 * f * rockW - vec3f(0.0, (lg - 0.5) * 0.35 * f * rockW, 0.0));
    albedo *= 1.0 + (hash21(vec2f(floor(band), 3.0)) - 0.5) * 0.5 * f * rockW;
    albedo = mix(albedo, vec3f(0.035, 0.05, 0.025), smoothstep(0.55, 0.7, N1.g) * rockW * 0.7); // moss
    // dark, mostly matte stone with moss (wet sheen on whole slopes reflected the sky as pale sheets)
    albedo *= mix(1.0, 0.6, rockW);
    albedo = mix(albedo, vec3f(0.03, 0.045, 0.022), smoothstep(0.35, 0.6, N1.b) * rockW * 0.5);
    rough = mix(rough, 0.85, rockW);
    wet = mix(wet, 0.3, rockW);
  }
  // lake gardens: lawns and a stone-edged shore instead of field terraces
  let gardenK = 1.0 - smoothstep(1050.0, 1350.0, length((p.xz - vec2f(-1990.0, 2330.0)) * vec2f(1.0, 1.2)));
  // far rock faces: dark ledges and gullies at a scale that survives distance, so steep mountain sides read
  // as cliffs rather than smooth pale blobs
  let rockF = smoothstep(0.22, 0.45, slope) * (1.0 - 0.7 * forest) * smoothstep(0.25, 1.0, px) * (1.0 - smoothstep(1800.0, 3000.0, dist));
  // bare high ground far away stays dark (it read as pale snow under the moon)
  albedo *= mix(1.0, 0.5, smoothstep(380.0, 900.0, p.y) * (1.0 - forest) * smoothstep(400.0, 1200.0, dist));
  if (rockF > 0.01) {
    let fl = fract(p.y / 17.0 + (A.r - 0.5) * 3.0);
    let ledge = mix(0.55, 1.2, smoothstep(0.78, 0.95, fl));
    let across = normalize(vec2f(-n.z, n.x) + vec2f(1e-4, 0.0));
    let gully = abs(sin(dot(p.xz, across) * 0.075 + A.g * 5.0));
    albedo = mix(albedo, vec3f(0.042, 0.043, 0.047) * ledge * (0.55 + 0.45 * gully), rockF);
    rough = mix(rough, 0.9, rockF);
  }
  if (terr * (1.0 - gardenK) > 0.3) {
    // terraces: flat beds (some flooded rice paddies that mirror the sky) and grassy risers
    let st = p.y / 2.6;
    let fl = fract(st);
    let flat = 1.0 - smoothstep(0.7, 0.8, fl);
    let hid = hash21(vec2f(floor(st), floor(p.x * 0.01) + floor(p.z * 0.01) * 7.0));
    let flooded = step(0.8, hid) * flat * smoothstep(0.3, 0.6, terr);
    albedo = mix(albedo, albedo * vec3f(0.6, 0.75, 0.5), 1.0 - flat);
    // tea rows on the dry beds
    let row = sin(dot(p.xz, vec2f(0.7, 0.7)) * 3.0) * 0.5 + 0.5;
    albedo *= mix(1.0, 0.75 + 0.5 * row, flat * (1.0 - flooded) * (1.0 - smoothstep(0.2, 0.6, px)));
    albedo = mix(albedo, vec3f(0.02, 0.025, 0.02), flooded);
    rough = mix(rough, 0.03, flooded);
    wet = mix(wet, 1.0, flooded);
    n = normalize(mix(n, vec3f(0.0, 1.0, 0.0), flooded));
  }
  // near-camera ground grain
  let nPre = n;
  let gn = (N2.ba - 0.5) * 2.0 * (1.0 - smoothstep(0.05, 0.3, px));
  n = normalize(n + vec3f(gn.x, 0.0, gn.y) * 0.15);
  albedo *= 0.85 + 0.3 * N1.b;

  // shore & river beds are wet
  let info = worldInfo(p.xz);
  if (wN > 0.0) {
    wet = mix(wet, 1.0, (1.0 - smoothstep(0.0, 6.0, info.x)) * (1.0 - gardenK));
    if (p.y < 0.2 && gardenK < 0.5) { rough = 0.4; wet = 1.0; mat = 3.0; }
  }
  if (gardenK > 0.0 && wN > 0.0 && info.w < 0.5) {
    // dark, matte lawn; a few small puddles just above the waterline; a dressed-stone kerb along the water
    let lawn = vec3f(0.018, 0.03, 0.014) * (0.8 + 0.4 * N1.g) * (0.85 + 0.3 * N2.r);
    let flatG = smoothstep(0.85, 0.97, n.y) * (1.0 - forest);
    albedo = mix(albedo, lawn, gardenK * flatG);
    rough = mix(rough, 0.9, gardenK * flatG);
    wet = mix(wet, 0.25, gardenK * flatG);
    let near = 1.0 - smoothstep(3.0, 9.0, info.x);
    let pud = smoothstep(0.66, 0.72, N1.g * 0.6 + N2.b * 0.55) * near * step(0.15, p.y) * gardenK;
    albedo = mix(albedo, vec3f(0.01, 0.012, 0.012), pud);
    rough = mix(rough, 0.04, pud); wet = mix(wet, 1.0, pud);
    n = normalize(mix(n, vec3f(0.0, 1.0, 0.0), pud));
    let kerb = (1.0 - smoothstep(1.2, 2.0, info.x)) * step(-0.25, p.y) * gardenK;
    if (kerb > 0.0) {
      let bq = vec2f(dot(p.xz, vec2f(0.7071, 0.7071)) * 1.4, p.y * 3.0 + dot(p.xz, vec2f(-0.7071, 0.7071)) * 1.4);
      let fb = fract(bq);
      let joint = 1.0 - smoothstep(0.0, 0.07, min(min(fb.x, 1.0 - fb.x), min(fb.y, 1.0 - fb.y)));
      let stone = vec3f(0.085, 0.082, 0.077) * (0.8 + 0.4 * hash21(floor(bq))) * (1.0 - 0.55 * joint);
      albedo = mix(albedo, stone, kerb);
      rough = mix(rough, 0.75, kerb); wet = mix(wet, 0.35, kerb);
      n = normalize(mix(n, nPre, kerb));
      mat = 3.0;
    }
  }

  // ---- West Lake causeways and islands (land raised inside the lake)
  if (wN > 0.0 && info.x < 3.0 && info.w > 0.5 && p.y > 0.15) {
    let top = smoothstep(1.32, 1.38, p.y) * (1.0 - smoothstep(0.08, 0.25, slope));
    let edge = 1.0 - smoothstep(0.55, 0.95, p.y);
    var c = mix(vec3f(0.040, 0.060, 0.028), vec3f(0.055, 0.065, 0.032), N1.r);
    let slab = fract(p.xz * 0.9);
    let sj = 1.0 - smoothstep(0.0, 0.08, min(min(slab.x, 1.0 - slab.x), min(slab.y, 1.0 - slab.y)));
    let path = vec3f(0.11, 0.105, 0.10) * (0.8 + 0.4 * hash21(floor(p.xz * 0.9))) * (1.0 - sj * 0.4);
    c = mix(c, path, top);
    let blk = fract(vec2f(dot(p.xz, vec2f(0.7, 0.7)) * 1.1, p.y * 2.5));
    let bj = 1.0 - smoothstep(0.0, 0.1, min(min(blk.x, 1.0 - blk.x), min(blk.y, 1.0 - blk.y)));
    c = mix(c, vec3f(0.09, 0.088, 0.085) * (1.0 - bj * 0.5), edge);
    let w = smoothstep(0.15, 0.3, p.y);
    albedo = mix(albedo, c, w);
    rough = mix(rough, mix(mix(0.8, 0.5, top), 0.45, edge), w);
    wet = mix(wet, mix(0.6, 0.9, max(top, edge)), w);
    mat = 3.0;
  }

  // ---- land-use plan (plan.js): infill blocks take the owner's street grid (cityInfo); parks replace the ground
  var ci = info;
  var park = 0.0;
  var cv = vec4f(0.0, -1.0, 0.0, 0.0);
  if (wN > 0.0 && inPlan(p.xz)) {
    cv = coverAt(p.xz);
    if (0.8 * cv.x > ci.z && cv.y >= 0.0) { ci.y = cv.y; ci.z = 0.8 * cv.x; }
    park = cv.z;
  }
  if (park > 0.0) {
    let po = parkShade(p, cv.w, info.x, cv.y, px, N1, N2, slope);
    albedo = mix(albedo, po.albedo, park);
    rough = mix(rough, po.rough, park);
    wet = mix(wet, po.wet, park);
    emis += po.emis * park;
    ao = mix(ao, 1.0, park);
    n = normalize(mix(n, normalize(mix(nPre, vec3f(0.0, 1.0, 0.0), po.flat)), park));
    if (park > 0.5) { mat = 3.0; }
  }

  // ---- city ground: asphalt, markings, crosswalks, sidewalks with curbs, puddles, street-lamp pools
  let di = i32(ci.y + 0.5);
  var urban = 0.0;
  var urbanAll = 0.0;
  if (wN > 0.0 && di >= 0 && di < i32(W.count.x)) {
    if (W.d[di].b.y > 0.0) { urban = smoothstep(0.16, 0.42, ci.z) * smoothstep(6.0, 14.0, ci.x) * (1.0 - smoothstep(0.35, 0.5, slope)) * (1.0 - forest * 0.85 * (1.0 - smoothstep(0.5, 0.65, ci.z))); }
  }
  urban *= 1.0 - park;
  urbanAll = max(urban, park);
  if (urban > 0.0) {
    let rd = roadLayout(p.xz, di);
    let hw = rd.hw;
    let a = abs(rd.across);
    let aa = max(px * 0.7, 0.01);     // antialias width
    let onRoad = 1.0 - smoothstep(hw - aa, hw + aa, a);
    // asphalt with aggregate and patch repairs
    var asph = vec3f(0.024, 0.024, 0.027) * (0.9 + 0.2 * N2.r) * mix(1.0, 0.72, smoothstep(0.62, 0.64, N1.a));
    var mark = 0.0; var markCol = vec3f(0.55, 0.55, 0.52);
    let notInter = smoothstep(hw - 0.2, hw + 0.4, rd.cross);
    if (hw >= 7.0) {
      let cl = 1.0 - smoothstep(0.07 - aa, 0.07 + aa, abs(a - 0.18));
      mark = max(mark, cl * notInter);
      markCol = mix(markCol, vec3f(0.6, 0.42, 0.08), cl);
      let ld = (1.0 - smoothstep(0.06 - aa, 0.06 + aa, abs(a - hw * 0.5))) * step(0.55, fract(rd.along / 9.0));
      mark = max(mark, ld * notInter);
    } else {
      let cl = (1.0 - smoothstep(0.06 - aa, 0.06 + aa, a)) * step(0.5, fract(rd.along / 6.0));
      mark = max(mark, cl * notInter);
    }
    mark = max(mark, (1.0 - smoothstep(0.06 - aa, 0.06 + aa, abs(a - (hw - 0.55)))) * notInter);
    // crosswalk zebra just outside each intersection, stop line behind it
    let cw = step(hw + 0.6, rd.cross) * (1.0 - step(hw + 4.2, rd.cross)) * step(a, hw - 0.9);
    mark = max(mark, smoothstep(0.5 - aa, 0.5 + aa, fract(rd.across / 1.1 + 0.25)) * cw);
    mark = max(mark, (1.0 - smoothstep(0.2 - aa, 0.2 + aa, abs(rd.cross - (hw + 5.0)))) * step(a, hw - 0.9));
    mark *= (1.0 - smoothstep(0.3, 1.0, px)) * (0.65 + 0.35 * N2.g);
    let road = mix(asph, markCol, mark);

    // sidewalk paving with granite curb
    let tile = fract(p.xz / 0.6);
    let joint = (1.0 - smoothstep(0.0, 0.06, min(min(tile.x, 1.0 - tile.x), min(tile.y, 1.0 - tile.y)))) * (1.0 - smoothstep(0.05, 0.2, px));
    let tid = hash21(floor(p.xz / 0.6));
    var pave = vec3f(0.075, 0.072, 0.07) * (0.85 + 0.3 * tid) * (1.0 - joint * 0.5);
    let curbW = smoothstep(hw - aa, hw + aa, a) * (1.0 - smoothstep(hw + 0.3 - aa, hw + 0.3 + aa, a));
    pave = mix(pave, vec3f(0.12, 0.115, 0.11), curbW);
    var col = mix(pave, road, onRoad);
    let interior = step(hw + 3.0, a) * step(hw + 3.0, rd.cross);
    col = mix(col, vec3f(0.06, 0.058, 0.056) * (0.8 + 0.4 * tid), interior);

    // puddles: road dips, gutters, uneven paving
    let gutter = (1.0 - smoothstep(0.0, 0.9, hw - a)) * onRoad;
    let rut = (1.0 - smoothstep(0.25, 0.6, abs(abs(a - hw * 0.5) - 0.9))) * onRoad * 0.12;
    let pn = N1.r * 0.75 + N2.b * 0.25;
    let pud = smoothstep(0.6, 0.71, pn + gutter * 0.16 + rut - interior * 0.1) * (1.0 - curbW);
    var un = normalize(nPre + vec3f(gn.x, 0.0, gn.y) * 0.03);
    // curb face tilts toward the road
    let cs = sign(rd.across);
    let cdir = rot2(W.d[di].b.x) * select(vec2f(0.0, cs), vec2f(cs, 0.0), rd.axis > 0.5);
    un = normalize(un + vec3f(cdir.x, 0.0, cdir.y) * (1.0 - smoothstep(0.0, 0.08, abs(a - hw))) * 1.5);
    var rip = vec2f(0.0);
    if (dist < 40.0) { rip = rainRipples(p.xz, time()) * F.params.x; }
    un = normalize(mix(un, normalize(vec3f(rip.x, 1.0, rip.y)), pud));
    var r = mix(mix(0.72, 0.62, 1.0 - onRoad), 0.45, mark) + (N2.g - 0.5) * 0.2;
    r = mix(r, 0.02, pud * pud);
    col = mix(col, col * 0.8, pud);
    albedo = mix(albedo, col, urban);
    rough = mix(rough, r, urban);
    n = normalize(mix(n, un, urban));
    wet = mix(wet, mix(0.85, 1.0, pud), urban);
    ao = mix(ao, 1.0, urban);
    if (urban > 0.5) { mat = 3.0; }

    // street-lamp pools beyond the real-light range: the two nearest lamps along this road
    let planLamps = cv.x > 0.0;
    if (dist > TU.x * 0.7 || (planLamps && dist > TU.y * 0.7)) {
      let blk = rd.blk;
      let sp = blk / lampCount(blk);
      let j0 = floor(rd.along / sp - 0.5);
      let kind = lampKind(di, rd.axis, rd.line);
      // effective wet surface, as the lighting pass will see it
      let wf = saturate(F.params.z * wet);
      let ea = albedo * mix(1.0, 0.55, wf);
      let er = mix(rough, 0.05, wf * smoothstep(0.6, 0.95, n.y));
      for (var k = 0; k < 2; k++) {
        let L = lampPos(di, rd.axis, rd.line, j0 + f32(k), hw);
        let headOff = rot2(W.d[di].b.x) * select(vec2f(0.0, -L.z), vec2f(-L.z, 0.0), rd.axis > 0.5) * 1.6;
        let lxz = L.xy + headOff;
        if (lampValid(L.xy, di)) {
          emis += lampFake(p, n, v, ea, er, vec3f(lxz.x, p.y + LAMP_H, lxz.y), kind, TU.x) * urban;
        } else if (planLamps && infillLampValid(L.xy, di)) {
          emis += lampFake(p, n, v, ea, er, vec3f(lxz.x, p.y + LAMP_H, lxz.y), kind, TU.y) * urban;
        }
      }
    }
  }

  // ---- far slopes are matte: glossy wet highlights at distance read as crumpled noise behind the skyline
  let farMatte = smoothstep(900.0, 2200.0, dist) * (1.0 - urbanAll);
  wet = mix(wet, 0.0, farMatte);
  rough = mix(rough, 0.92, farMatte);

  // ---- moonlit crests: convex ridges facing the moon catch a soft silver edge at distance
  let crest = smoothstep(0.6, 0.7, Nt.b) * saturate(dot(n, F.moon.xyz) * 1.5) * smoothstep(800.0, 3500.0, dist) * (1.0 - wN * urbanAll);
  emis += vec3f(0.55, 0.62, 0.85) * F.moon.w * crest * 0.045;
  // silver skyline: crests seen at grazing angles catch the moonlit sky behind them
  // (only out in the southern mountains: seen from the city the many small crests read as contour stripes)
  let skyl = pow(1.0 - saturate(dot(nPre, v)), 5.0) * smoothstep(0.35, 0.7, nPre.y) * smoothstep(500.0, 2500.0, dist) * (1.0 - urbanAll) * smoothstep(3600.0, 4600.0, F.camPos.z);
  emis += SKY_MOON_COL * F.moon.w * skyl * 0.07;

  // far natural slopes are dark masses (lit only by the faint moon), so the ranges read as layered silhouettes
  // against the haze instead of pale, mottled blobs; crests keep a moonlit edge (below)
  albedo *= mix(1.0, 0.38, smoothstep(700.0, 2600.0, dist) * (1.0 - urbanAll));
  // ---- valley mist (pose 9)
  let mist = valleyMist(p, dist, N1.r * 0.3 + A.g * 0.7);
  if (mist > 0.0) {
    albedo *= 1.0 - mist;
    emis = emis * (1.0 - mist) + mistColor(-v) * mist;
    wet *= 1.0 - mist;
  }

  // ---- aerial perspective for the far ranges: fade toward the horizon haze; thicker low down, so each
  // range stands out as a layer against the haze in the valley behind it
  // out in nature the haze starts sooner and builds faster, so successive ridges step back in tone
  let hzS = mix(2000.0, 900.0, 1.0 - urbanAll);
  let hzL = mix(11000.0, 7000.0, 1.0 - urbanAll);
  let hz = min((1.0 - exp(-max(dist - hzS, 0.0) / hzL)) * mix(1.5, 0.7, smoothstep(200.0, 1800.0, p.y)), 0.96);
  if (hz > 0.0) {
    let dir = -v;
    let sky = skyHorizon(normalize(vec3f(dir.x, max(dir.y, 0.0) * 0.5 + 0.02, dir.z)));
    emis += sky * hz * 0.9;
    albedo *= 1.0 - hz;
  }
  return gbuf(albedo, rough, n, 0.0, emis, ao, motionVector(p, p), mat, wet);
}
`;
