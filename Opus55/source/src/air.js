// Air traffic: eVTOL air taxis and delivery drones on sky lanes (120-450 m), police drones with red/blue strobes,
// searchlight helicopters and airliners at cruise altitude. All motion is analytic in the vertex shaders.
// Also the drone light show over the river in front of the Bund (see airShapes.js for the formations).

import { MeshBuilder, VERTEX_LAYOUT } from './trafficGeom.js';
import { TRANSIT_STATIC_WGSL } from './transitStatic.js';
import { buildShapes } from './airShapes.js';
import { rng } from './math.js';
import { DISTRICTS, DT, LANDMARKS } from './world.js';

// sky lanes [ax, az, bx, bz, altitude]
export const LANES = [
  [-4500, -600, 4500, -1500, 180], [-4000, 1500, 4200, -2600, 240], [-1500, -4500, 2000, 4500, 320],
  [2500, -4500, 2800, 3500, 150], [-4500, 300, 4500, 400, 410], [500, -4500, -800, 4500, 270],
  [-3000, -3000, 4000, 2000, 450], [3800, -3800, -3500, 2500, 205], [-4500, -1800, 4500, -200, 130],
];
// holding circles [cx, cz, r, altitude, user]
export const CIRCLES = [
  [3300, -1250, 520, 300, 'taxi'], [-700, -150, 650, 230, 'taxi'], [650, 1300, 500, 260, 'taxi'], [1700, -1000, 380, 340, 'taxi'],
  [-700, -300, 260, 140, 'police'], [1000, -1200, 200, 130, 'police'], [3200, -1100, 300, 160, 'police'], [700, 1400, 240, 135, 'police'],
  [-2900, -250, 280, 150, 'police'], [900, -2750, 220, 140, 'police'],
  [-650, -250, 380, 185, 'heli'], [1500, -1500, 420, 205, 'heli'],
];
const AIRLINERS = [[-9000, -6000, 9000, 3000, 3200], [9000, -2000, -9000, 1000, 3600], [-6000, 9000, 6000, -9000, 2900], [8000, 7000, -8000, -5000, 3400]];

const FLYER_WGSL = /* wgsl */ `
struct Path { a: vec4f, b: vec4f };   // line: a = (ax, az, bx, bz); circle: a = (cx, cz, r, 0). b = (alt, isCircle, length, 0)
struct Fly { a: vec4f, b: vec4f };    // a: path, dir, phase, speed   b: type, lateral, altOffset, seed
struct FState { p: vec3f, f: vec3f, l: vec3f, fade: f32 };

fn flyerState(Fl: Fly, P: Path, t: f32) -> FState {
  var st: FState;
  let len = P.b.z;
  let s = fract((Fl.a.z + Fl.a.w * t) / len) * len;
  let dir = Fl.a.y;
  var xz: vec2f; var tg: vec2f;
  var bank = 0.0;
  if (P.b.y > 0.5) {
    let ang = s / P.a.z * dir;
    xz = P.a.xy + vec2f(cos(ang), sin(ang)) * (P.a.z + Fl.b.y);
    tg = vec2f(-sin(ang), cos(ang)) * dir;
    bank = 0.25 * dir;
    st.fade = 1.0;
  } else {
    let d = normalize(P.a.zw - P.a.xy);
    let along = select(len - s, s, dir > 0.0);
    tg = d * dir;
    xz = P.a.xy + d * along + vec2f(-tg.y, tg.x) * Fl.b.y;
    st.fade = smoothstep(0.0, 300.0, s) * smoothstep(0.0, 300.0, len - s);
  }
  let seed = Fl.b.w;
  let y = P.b.x + Fl.b.z + 3.0 * sin(t * 0.37 + seed * 6.0) + 1.5 * sin(t * 0.9 + seed * 17.0);
  st.p = vec3f(xz.x, y, xz.y);
  st.f = normalize(vec3f(tg.x, 0.02 * cos(t * 0.37 + seed * 6.0), tg.y));
  let l0 = normalize(cross(vec3f(0.0, 1.0, 0.0), st.f));
  let u0 = cross(st.f, l0);
  st.l = normalize(l0 * cos(bank) + u0 * sin(bank));
  return st;
}
`;

const FLYER_MESH_WGSL = /* wgsl */ `
${FLYER_WGSL}
@group(1) @binding(0) var<storage, read> paths: array<Path>;
@group(1) @binding(1) var<storage, read> flys: array<Fly>;
struct VIn { @location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) uv: vec2f, @location(3) me: vec2f };
struct VOut {
  @builtin(position) cp: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) pwp: vec3f,
  @location(3) lp: vec3f,
  @location(4) @interpolate(flat) info: vec4f,
};
fn place(st: FState, lp: vec3f) -> vec3f {
  let u = cross(st.f, st.l);
  return st.p + st.l * lp.x + u * lp.y + st.f * lp.z;
}
@vertex fn vs(v: VIn, @builtin(instance_index) ii: u32) -> VOut {
  let Fl = flys[ii];
  let P = paths[u32(Fl.a.x)];
  let t = time();
  let ty = Fl.b.x;
  var o: VOut;
  let st = flyerState(Fl, P, t);
  if (length(st.p - F.camPos.xyz) > 1600.0 || st.fade < 0.01) { o.cp = vec4f(0.0, 0.0, -1.0, 1.0); return o; }
  let ps = flyerState(Fl, P, t - F.camFwd.w);
  var sc = 1.0;
  if (ty > 3.5) { sc = 2.3; } else if (ty > 1.5) { sc = 0.75; }
  var lp = v.pos * sc;

  o.wp = place(st, lp);
  o.pwp = place(ps, lp);
  let u = cross(st.f, st.l);
  o.n = st.l * v.nrm.x + u * v.nrm.y + st.f * v.nrm.z;
  o.lp = v.pos;
  o.info = vec4f(v.me.x, ty, Fl.b.w, 0.0);
  o.cp = F.viewProj * vec4f(o.wp, 1.0);
  return o;
}
@fragment fn fs(i: VOut) -> GOut {
  let mat = i.info.x; let ty = i.info.y; let seed = i.info.z;
  let n = normalize(i.n);
  var albedo = vec3f(0.75, 0.76, 0.78); var rough = 0.3; var metal = 0.4; var emis = vec3f(0.0); var m = 0.0;
  if (ty > 3.5) { albedo = vec3f(0.06, 0.07, 0.08); }
  else if (ty > 1.5) { albedo = vec3f(0.05, 0.08, 0.2); }
  else if (seed > 0.5) { albedo = vec3f(0.08, 0.08, 0.09); }
  if (mat == 1.0) { albedo = vec3f(0.02); rough = 0.05; metal = 0.0; m = 2.0; emis = vec3f(1.0, 0.85, 0.65) * 1.6; }
  else if (mat == 2.0) { albedo = vec3f(0.03); rough = 0.6; metal = 0.3; }
  else if (mat == 3.0) {
    var c = select(vec3f(0.1, 0.9, 1.0), vec3f(1.0, 0.15, 0.6), seed > 0.5);
    if (ty > 1.5 && ty < 2.5) { c = vec3f(0.02, 0.03, 0.06); }
    if (ty > 3.5) { c = vec3f(0.6, 0.6, 0.6); }
    emis = c * 2.0; albedo = vec3f(0.05);
  }
  return gbuf(albedo, rough, n, metal, emis, 1.0, motionVector(i.wp, i.pwp), m, 0.5);
}
`;

const FLYER_LIGHT_WGSL = /* wgsl */ `
${FLYER_WGSL}
@group(2) @binding(0) var<storage, read> paths: array<Path>;
@group(2) @binding(1) var<storage, read> flys: array<Fly>;
struct VOut {
  @builtin(position) cp: vec4f,
  @location(0) q: vec2f,
  @location(1) @interpolate(flat) col: vec3f,
};
fn fogT(p: vec3f, dist: f32) -> f32 {
  let c = F.viewProj * vec4f(p, 1.0);
  let uv = c.xy / max(c.w, 1e-3) * vec2f(0.5, -0.5) + 0.5;
  return textureSampleLevel(fogTex, sampClamp, vec3f(clamp(uv, vec2f(0.0), vec2f(1.0)), clamp(fogSlice(dist), 0.0, 1.0)), 0.0).a;
}
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var o: VOut;
  let Fl = flys[ii];
  let P = paths[u32(Fl.a.x)];
  let t = time();
  let st = flyerState(Fl, P, t);
  let ty = Fl.b.x;
  let seed = Fl.b.w;
  let lamp = vi / 6u;
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = corners[vi % 6u];
  // per type: half span, lamp radius, min pixel radius
  var span = 2.4; var r = 0.3; var pxMin = 1.5;
  if (ty > 0.5 && ty < 1.5) { span = 0.5; r = 0.22; pxMin = 1.7; }
  if (ty > 1.5 && ty < 2.5) { span = 1.3; r = 0.35; pxMin = 1.5; }
  if (ty > 2.5 && ty < 3.5) { span = 18.0; r = 0.9; pxMin = 1.3; }
  if (ty > 3.5) { span = 1.6; r = 0.3; pxMin = 1.1; }
  let u = cross(st.f, st.l);
  var pos = st.p;
  var col = vec3f(0.0);
  let strobeF = fract(t * 1.1 + seed * 3.7);
  let strobe = select(0.0, 1.0, strobeF < 0.05 || (ty > 2.5 && ty < 3.5 && strobeF > 0.13 && strobeF < 0.17));
  if (lamp == 0u) { pos += st.l * span; col = vec3f(1.0, 0.04, 0.03) * 9.0; }
  else if (lamp == 1u) { pos -= st.l * span; col = vec3f(0.05, 1.0, 0.25) * 8.0; }
  else if (lamp == 2u) { pos += u * 0.6 - st.f * span * 0.4; col = vec3f(1.0) * 20.0 * strobe; }
  else {
    // special lamp: taxi underglow, police beacon, airliner/heli red beacon
    pos -= u * 0.5;
    if (ty < 0.5) { col = select(vec3f(0.1, 0.9, 1.0), vec3f(1.0, 0.15, 0.6), seed > 0.5) * 12.0; }
    else if (ty < 1.5) { col = vec3f(1.0, 0.9, 0.7) * 3.0; }
    else if (ty < 2.5) { col = vec3f(0.0); }
    else { col = vec3f(1.0, 0.05, 0.02) * 9.0 * smoothstep(0.6, 1.0, sin(t * 6.0 + seed * 9.0)); pos += u * 2.0; }
  }
  if (ty > 1.5 && ty < 2.5 && lamp < 2u) {
    // police: alternating red / blue strobes
    let ph = fract(t * 2.5 + seed);
    let red = lamp == 0u;
    let on = select(ph >= 0.5, ph < 0.5, red) && fract(ph * 6.0) < 0.6;
    col = select(vec3f(0.1, 0.25, 1.0), vec3f(1.0, 0.05, 0.05), red) * 14.0 * select(0.0, 1.0, on);
  }
  col *= st.fade;
  let toCam = F.camPos.xyz - pos;
  let dist = length(toCam);
  let px = dist * 2.0 * F.camRight.w * F.res.w;
  let rr = max(r, pxMin * px);
  col *= pow(r / rr, 1.2);
  if (dot(col, col) < 1e-6) { o.cp = vec4f(0.0, 0.0, -1.0, 1.0); return o; }
  col *= fogT(pos, dist);
  let p = pos + (toCam / dist) * 0.5 + (F.camRight.xyz * c.x + F.camUp.xyz * c.y) * rr * 1.7;
  o.cp = F.viewProj * vec4f(p, 1.0);
  o.q = c * 1.7;
  o.col = col;
  return o;
}
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  return vec4f(i.col * exp(-dot(i.q, i.q) * 2.2), 0.0);
}
`;

const BEAM_WGSL = /* wgsl */ `
struct Beam { apex: vec4f, tgt: vec4f }; // apex xyz, intensity; target xyz, radius
@group(2) @binding(0) var<uniform> beams: array<Beam, 2>;
struct VOut { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) t: f32, @location(3) @interpolate(flat) k: f32 };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  let B = beams[ii];
  let seg = vi / 6u; let k = vi % 6u;
  var qa = array<vec2f, 6>(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0));
  let q = qa[k];
  let N = 20.0;
  let ang = (f32(seg) + q.x) / N * TAU;
  let axis = B.tgt.xyz - B.apex.xyz;
  let L = length(axis);
  let d = axis / L;
  let s = normalize(cross(d, select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(d.y) > 0.9)));
  let t2 = cross(d, s);
  let radial = s * cos(ang) + t2 * sin(ang);
  let rad = mix(0.35, B.tgt.w, q.y);
  var o: VOut;
  o.wp = B.apex.xyz + d * L * q.y + radial * rad;
  o.n = normalize(radial - d * (B.tgt.w - 0.35) / L);
  o.t = q.y;
  o.k = B.apex.w;
  o.cp = F.viewProj * vec4f(o.wp, 1.0);
  return o;
}
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  let v = normalize(F.camPos.xyz - i.wp);
  let facing = abs(dot(normalize(i.n), v));
  let core = pow(facing, 2.5);
  let along = (1.0 - i.t * 0.75) * smoothstep(0.0, 0.04, i.t);
  // soft fade where the beam meets geometry
  let px = vec2i(i.cp.xy);
  let sd = linearDepth(max(sceneDepthAt(px), 1e-7));
  let dist = length(F.camPos.xyz - i.wp);
  let soft = saturate((sd - dist) / 8.0);
  let uv = i.cp.xy * F.res.zw;
  let fg = textureSampleLevel(fogTex, sampClamp, vec3f(uv, clamp(fogSlice(dist), 0.0, 1.0)), 0.0);
  let c = vec3f(0.8, 0.88, 1.0) * 0.09 * i.k * core * along * soft * fg.a;
  return vec4f(c, 0.0);
}
`;

const KNOT_N = 360; // drones in the second formation
const SHOW_WGSL = /* wgsl */ `
struct Pt { p: vec4f, c: vec4f };
struct ShowU { a: vec4f, b: vec4f, c: vec4f, d: vec4f }; // a: shapeA, shapeB, morph, stagger  b: time, intensity, beatPhase, N  c: center xyz, scale  d: anim time
@group(2) @binding(0) var<storage, read> pts: array<Pt>;
@group(2) @binding(1) var<uniform> U: ShowU;
struct VOut { @builtin(position) cp: vec4f, @location(0) q: vec2f, @location(1) @interpolate(flat) col: vec3f };
fn fogT(p: vec3f, dist: f32) -> f32 {
  let c = F.viewProj * vec4f(p, 1.0);
  let uv = c.xy / max(c.w, 1e-3) * vec2f(0.5, -0.5) + 0.5;
  return textureSampleLevel(fogTex, sampClamp, vec3f(clamp(uv, vec2f(0.0), vec2f(1.0)), clamp(fogSlice(dist), 0.0, 1.0)), 0.0).a;
}

fn spine(p: f32, t: f32) -> vec3f {
  return vec3f((p - 0.5) * 235.0, 30.0 * sin(TAU * 1.1 * p - t * 1.4) + 9.0 * sin(TAU * 2.3 * p - t * 2.2), 26.0 * cos(TAU * 0.8 * p - t * 0.9));
}
fn evalPt(P: Pt, t: f32) -> vec3f {
  let mode = i32(P.p.w + 0.5);
  var q = P.p.xyz;
  if (mode == 1) {
    let p = P.c.w;
    let C = spine(p, t);
    let T = normalize(spine(p + 0.003, t) - spine(p - 0.003, t));
    let N = normalize(vec3f(0.0, 1.0, 0.0) - T * T.y);
    let B = cross(T, N);
    q = C + T * q.x + N * q.y + B * q.z;
  } else if (mode == 2) {
    q.y += 5.0 * sin(q.x * 0.045 - t * 1.6 + P.c.w);
  } else if (mode == 3) {
    let a = t * 0.22;
    q = vec3f(q.x * cos(a) - q.z * sin(a), q.y, q.x * sin(a) + q.z * cos(a));
  }
  return q;
}
struct Drone { wp: vec3f, col: vec3f };
fn drone(ii: u32) -> Drone {
  var o: Drone;
  let N = u32(U.b.w);
  let A = pts[u32(U.a.x) * N + ii];
  let B = pts[u32(U.a.y) * N + ii];
  let t = U.d.x;
  let h = hash11u(ii * 747u + 11u);
  var k = U.a.z;
  if (U.a.w > 0.5) { k = saturate(k * 1.6 - h * 0.6); }
  k = k * k * (3.0 - 2.0 * k);
  var lp = mix(evalPt(A, t), evalPt(B, t), k);
  lp.y += sin(PI * k) * (6.0 + 10.0 * h) * U.a.w;
  lp.z += sin(PI * k) * (hash11u(ii * 31u + 7u) - 0.5) * 30.0 * U.a.w;
  o.col = mix(A.c.rgb, B.c.rgb, k);
  o.wp = U.c.xyz + vec3f(-lp.z, lp.y, lp.x) * U.c.w;
  return o;
}
// Reflection of each drone in the river: mirrored about the water plane, vertically smeared by the ripples.
// Neighbouring drones would give parallel streaks of equal length that read as a lattice, so each streak gets its
// own length, sideways offset and width, the streaks are wide and faint enough to merge into a soft glow band, and
// the brightness is broken up by moving ripple noise on the water instead of a regular wave.
@vertex fn vsRefl(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var o: VOut;
  let D = drone(ii * 2u);
  let h1 = hash11u(ii * 977u + 3u);
  let h2 = hash11u(ii * 613u + 17u);
  let h3 = hash11u(ii * 389u + 29u);
  // a glitter path on rippled water: from the water surface under the drone toward its mirror image
  let dist = length(F.camPos.xyz - vec3f(D.wp.x, 0.0, D.wp.z));
  let px = dist * 2.0 * F.camRight.w * F.res.w;
  let rr = max(0.8, 1.6 * px) * (0.8 + 0.8 * h3);
  let shift = F.camRight.xyz * (h2 - 0.5) * rr * 3.0;
  let top = vec3f(D.wp.x, 0.0, D.wp.z) + shift;
  let bot = vec3f(D.wp.x, -min(D.wp.y, 30.0) * (0.35 + 0.65 * h1), D.wp.z) + shift;
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = corners[vi];
  let p = select(bot, top, c.y > 0.0) + F.camRight.xyz * c.x * rr * 1.4;
  o.cp = F.viewProj * vec4f(p, 1.0);
  o.q = vec2f(c.x * 1.6, c.y);
  // wider streaks carry the same energy spread thinner, so overlaps add up to a glow rather than bright bars
  o.col = D.col * 0.8 * U.b.y * pow(0.55 / rr, 0.8) / (0.8 + 0.8 * h3);
  return o;
}
@fragment fn fsRefl(i: VOut) -> @location(0) vec4f {
  // only where the river surface is the nearest thing at this pixel
  let uv = i.cp.xy * F.res.zw;
  let ray = viewRay(uv);
  if (ray.y > -0.0005) { discard; }
  let tw = -F.camPos.y / ray.y;
  let hit = F.camPos.xyz + ray * tw;
  if (terrainHeight(hit.xz) > -0.5) { discard; }
  let zPlane = tw * dot(ray, F.camFwd.xyz);
  let zScene = linearDepth(max(sceneDepthAt(vec2i(i.cp.xy)), 1e-7));
  if (zScene < zPlane - 2.0) { discard; }
  let fg = textureSampleLevel(fogTex, sampClamp, vec3f(uv, clamp(fogSlice(tw), 0.0, 1.0)), 0.0).a;
  let along = 0.5 + 0.5 * i.q.y; // 1 at the water line, 0 at the far end
  // ripple noise at the scales of the water's wave layers (38 m, 9.5 m, 3.3 m), drifting with the wind
  let t = time();
  let w = gnoise2(hit.xz * (1.0 / 38.0) + vec2f(t * 0.03, 0.0)) * 0.45
        + gnoise2(hit.xz * (1.0 / 9.5) + vec2f(0.0, t * 0.08)) * 0.35
        + gnoise2(hit.xz * (1.0 / 3.3) + vec2f(t * 0.17, t * 0.05)) * 0.3;
  let glitter = smoothstep(-0.35, 0.6, w);
  let a = exp(-i.q.x * i.q.x * 1.3) * along * (0.15 + 0.85 * along) * glitter;
  return vec4f(i.col * max(a, 0.0) * fg, 0.0);
}
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var o: VOut;
  let N = u32(U.b.w);
  let A = pts[u32(U.a.x) * N + ii];
  let B = pts[u32(U.a.y) * N + ii];
  let t = U.d.x;
  let pa = evalPt(A, t);
  let pb = evalPt(B, t);
  let h = hash11u(ii * 747u + 11u);
  var k = U.a.z;
  if (U.a.w > 0.5) { k = saturate(k * 1.6 - h * 0.6); }
  k = k * k * (3.0 - 2.0 * k);
  var lp = mix(pa, pb, k);
  lp.y += sin(PI * k) * (6.0 + 10.0 * h) * U.a.w;
  lp.z += sin(PI * k) * (hash11u(ii * 31u + 7u) - 0.5) * 30.0 * U.a.w;
  var col = mix(A.c.rgb, B.c.rgb, k);
  // twinkle / beat
  let mA = i32(A.p.w + 0.5); let mB = i32(B.p.w + 0.5);
  if ((mB == 4 && k > 0.5) || (mA == 4 && k <= 0.5)) {
    col *= 0.75 + 0.25 * sin(t * 6.0 + f32(ii) * 1.7) + 0.35 * pow(1.0 - U.b.z, 4.0);
  }
  // formation space -> world: u -> +z (south), v -> +y, w -> -x (toward the Bund)
  let wp = U.c.xyz + vec3f(-lp.z, lp.y, lp.x) * U.c.w;
  let toCam = F.camPos.xyz - wp;
  let dist = length(toCam);
  let px = dist * 2.0 * F.camRight.w * F.res.w;
  let r = 0.55;
  let rr = max(r, 1.25 * px);
  col *= 11.0 * U.b.y * pow(r / rr, 1.25) * fogT(wp, dist);
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = corners[vi];
  let p = wp + (F.camRight.xyz * c.x + F.camUp.xyz * c.y) * rr * 2.0;
  o.cp = F.viewProj * vec4f(p, 1.0);
  o.q = c * 2.0;
  o.col = col;
  return o;
}
// Second, smaller formation south of the main show: a slowly turning (2,3) torus knot of drones with a colour
// wave running along it (fills the southern sky seen from the Bund promenade).
const KNOT_C = vec3f(2700.0, 380.0, -300.0);
@vertex fn vsKnot(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var o: VOut;
  let t = U.d.x;
  let s = f32(ii) / ${KNOT_N}.0 * TAU;
  let R = 62.0; let r = 22.0;
  var lp = vec3f((R + r * cos(3.0 * s)) * cos(2.0 * s), (R + r * cos(3.0 * s)) * sin(2.0 * s), r * sin(3.0 * s));
  // spin in its own plane, then tilt and face north-west toward the Bund
  let a = t * 0.12;
  lp = vec3f(lp.x * cos(a) - lp.y * sin(a), lp.x * sin(a) + lp.y * cos(a), lp.z);
  let tl = 0.35;
  lp = vec3f(lp.x, lp.y * cos(tl) - lp.z * sin(tl), lp.y * sin(tl) + lp.z * cos(tl));
  let yaw = 0.75;
  let wp = KNOT_C + vec3f(lp.x * cos(yaw) + lp.z * sin(yaw), lp.y, -lp.x * sin(yaw) + lp.z * cos(yaw));
  let wave = 0.5 + 0.5 * sin(s * 2.0 - t * 1.3);
  var col = mix(vec3f(1.0, 0.25, 0.65), vec3f(0.2, 0.85, 1.0), wave);
  col = mix(col, vec3f(1.0, 0.8, 0.35), pow(0.5 + 0.5 * sin(s * 3.0 + t * 2.1), 8.0));
  let dist = length(F.camPos.xyz - wp);
  let px = dist * 2.0 * F.camRight.w * F.res.w;
  let r0 = 0.55;
  let rr = max(r0, 1.25 * px);
  col *= 9.0 * U.b.y * pow(r0 / rr, 1.25) * fogT(wp, dist);
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = corners[vi];
  o.cp = F.viewProj * vec4f(wp + (F.camRight.xyz * c.x + F.camUp.xyz * c.y) * rr * 2.0, 1.0);
  o.q = c * 2.0;
  o.col = col;
  return o;
}
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  let r2 = dot(i.q, i.q);
  return vec4f(i.col * (exp(-r2 * 1.5) + 0.06 * exp(-r2 * 0.4)), 0.0);
}
`;

// Straight corridors across the CBD at 150-350 m that keep 20 m clear of every tower taller than the corridor
// (tested against the building colliders and the landmark sites). Returns [ax, az, bx, bz, altitude] rows.
function cbdCorridors(world, rnd) {
  const D = DISTRICTS.find((d) => d.type === DT.CBD);
  if (!D || !world.collidersNear) return [];
  const blocked = (x, z, y) => {
    for (const L of LANDMARKS) if (L.r > 0 && L.h > y - 40 && Math.hypot(x - L.x, z - L.z) < L.r + 20) return true;
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      const cs = world.collidersNear(x + ox * 40, z + oz * 40);
      if (!cs) continue;
      for (const k of cs) {
        if (k.cy + k.hy < y - 25) continue;
        const dx = x - k.cx, dz = z - k.cz;
        const lx = dx * k.cos + dz * k.sin, lz = -dx * k.sin + dz * k.cos;
        if (Math.abs(lx) < k.hx + 20 && Math.abs(lz) < k.hz + 20) return true;
      }
    }
    return false;
  };
  // one corridor per altitude band so the traffic is layered through the skyline
  const out = [];
  for (const band of [165, 195, 225, 255, 285, 315, 345]) for (let tries = 0; tries < 300; tries++) {
    const a = rnd() * Math.PI * 2, b = a + Math.PI + (rnd() - 0.5) * 1.6;
    const ax = D.cx + Math.cos(a) * D.rx * 1.1, az = D.cz + Math.sin(a) * D.rz * 1.1;
    const bx = D.cx + Math.cos(b) * D.rx * 1.1, bz = D.cz + Math.sin(b) * D.rz * 1.1;
    const y = band + (rnd() - 0.5) * 20;
    const len = Math.hypot(bx - ax, bz - az);
    let ok = true;
    for (let s = 0; s <= len && ok; s += 15) {
      const u = s / len;
      if (blocked(ax + (bx - ax) * u, az + (bz - az) * u, y)) ok = false;
    }
    if (ok) { out.push([ax, az, bx, bz, y]); break; }
  }
  return out;
}

function evtolMesh() {
  const mb = new MeshBuilder();
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
  mb.box([0, 0, 0], X, Y, Z, 0.75, 0.6, 2.1, 0);
  mb.box([0, 0.15, 1.3], X, Y, Z, 0.68, 0.45, 0.9, 1);          // canopy
  mb.box([0, -0.62, 0], X, Y, Z, 0.5, 0.03, 1.6, 3);            // underglow strip
  mb.box([0, 0.5, -2.1], X, Y, Z, 0.08, 0.6, 0.4, 0);           // tail fin
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const hub = [sx * 2.3, 0.35, sz * 1.5];
    mb.beam([sx * 0.6, 0.2, sz * 0.8], hub, 0.07, 0.07, 2);
    mb.prism(hub[0], hub[2], 0.38, 0.42, 1.05, 10, 2, 0, true);
  }
  return mb;
}

export class Air {
  init(ctx) {
    const d = ctx.device, R = ctx.renderer, q = ctx.quality.level;
    const rnd = rng(555);
    const paths = [];
    for (const L of LANES) paths.push([L[0], L[1], L[2], L[3], L[4], 0, Math.hypot(L[2] - L[0], L[3] - L[1]), 0]);
    const circ = {};
    for (const C of CIRCLES) { circ[C[4]] = circ[C[4]] || []; circ[C[4]].push(paths.length); paths.push([C[0], C[1], C[2], 0, C[3], 1, Math.PI * 2 * C[2], 0]); }
    const airBase = paths.length;
    for (const A of AIRLINERS) paths.push([A[0], A[1], A[2], A[3], A[4], 0, Math.hypot(A[2] - A[0], A[3] - A[1]), 0]);
    this.paths = paths;
    const mesh = [], other = [];
    const nTaxi = [120, 200, 320][q], nDrone = [160, 260, 380][q];
    for (let i = 0; i < nTaxi; i++) {
      const onCircle = rnd() < 0.3;
      const p = onCircle ? circ.taxi[(rnd() * circ.taxi.length) | 0] : (rnd() * LANES.length) | 0;
      const dir = rnd() < 0.5 ? 1 : -1;
      mesh.push([p, dir, rnd() * paths[p][6], 38 + rnd() * 18, 0, (onCircle ? (rnd() - 0.5) * 30 : dir * (10 + rnd() * 6)), (rnd() - 0.5) * 20, rnd()]);
    }
    for (const p of circ.police) for (let k = 0; k < 2; k++) mesh.push([p, k ? 1 : -1, rnd() * paths[p][6], 22 + rnd() * 8, 2, (rnd() - 0.5) * 20, (rnd() - 0.5) * 20, rnd()]);
    this.helis = [];
    for (const p of circ.heli) { this.helis.push({ path: p, idx: mesh.length, phase: rnd() * paths[p][6], speed: 28, dir: 1, seed: rnd() }); mesh.push([p, 1, this.helis[this.helis.length - 1].phase, 28, 4, 0, 0, this.helis[this.helis.length - 1].seed]); }
    for (let i = 0; i < nDrone; i++) {
      const p = (rnd() * LANES.length) | 0;
      const dir = rnd() < 0.5 ? 1 : -1;
      other.push([p, dir, rnd() * paths[p][6], 14 + rnd() * 10, 1, dir * (25 + rnd() * 20), -LANES[p][4] + 120 + rnd() * 80, rnd()]);
    }
    for (let i = 0; i < AIRLINERS.length; i++) other.push([airBase + i, 1, rnd() * paths[airBase + i][6], 230, 3, 0, 0, rnd()]);
    // CBD corridors: air taxis and beacon drones threading between the supertalls at 150-350 m
    const cbdBase = paths.length;
    const corridors = cbdCorridors(ctx.world, rnd);
    ctx.world.shared.airCorridors = corridors; // read by skyops (airship altitude clearance)
    for (const L of corridors) paths.push([L[0], L[1], L[2], L[3], L[4], 0, Math.hypot(L[2] - L[0], L[3] - L[1]), 0]);
    const nCbd = paths.length - cbdBase;
    if (nCbd > 0) {
      for (let i = 0; i < [24, 44, 64][q]; i++) {
        const p = cbdBase + ((rnd() * nCbd) | 0), dir = rnd() < 0.5 ? 1 : -1;
        mesh.push([p, dir, rnd() * paths[p][6], 30 + rnd() * 14, 0, dir * (6 + rnd() * 5), (rnd() - 0.5) * 12, rnd()]);
      }
      for (let i = 0; i < [60, 100, 150][q]; i++) {
        const p = cbdBase + ((rnd() * nCbd) | 0), dir = rnd() < 0.5 ? 1 : -1;
        other.push([p, dir, rnd() * paths[p][6], 10 + rnd() * 8, 1, dir * (12 + rnd() * 8), (rnd() - 0.5) * 24, rnd()]);
      }
    }
    this.meshCount = mesh.length;
    this.total = mesh.length + other.length;
    const pd = new Float32Array(paths.flat());
    const fd = new Float32Array(mesh.concat(other).flat());
    this.pathBuf = d.createBuffer({ size: pd.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.pathBuf, 0, pd);
    this.flyBuf = d.createBuffer({ size: fd.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.flyBuf, 0, fd);
    const VS = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
    this.layout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: VS, buffer: { type: 'read-only-storage' } }, { binding: 1, visibility: VS, buffer: { type: 'read-only-storage' } }] });
    this.group = d.createBindGroup({ layout: this.layout, entries: [{ binding: 0, resource: { buffer: this.pathBuf } }, { binding: 1, resource: { buffer: this.flyBuf } }] });
    this.mesh = evtolMesh().upload(d, 'evtol');
    this.meshPipe = R.gbufferPipeline({ label: 'flyers', code: FLYER_MESH_WGSL, buffers: [VERTEX_LAYOUT], groups: [this.layout] });
    this.lightPipe = R.forwardPipeline({ label: 'flyer-lights', code: FLYER_LIGHT_WGSL, groups: [this.layout], blend: 'add' });

    // searchlights
    this.beamData = new Float32Array(16);
    this.beamBuf = d.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.beamLayout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: VS, buffer: { type: 'uniform' } }] });
    this.beamGroup = d.createBindGroup({ layout: this.beamLayout, entries: [{ binding: 0, resource: { buffer: this.beamBuf } }] });
    this.beamPipe = R.forwardPipeline({ label: 'searchlights', code: BEAM_WGSL, groups: [this.beamLayout], blend: 'add' });
    this.beamLights = ctx.lights.reserve(2);

    // drone show
    this.N = q >= 2 ? 2200 : 1600;
    const sh = buildShapes(this.N);
    this.shapeIndex = sh.index;
    this.showBuf = d.createBuffer({ size: sh.shapes.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.showBuf, 0, sh.shapes);
    this.showU = new Float32Array(16);
    this.showUBuf = d.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.showLayout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: VS, buffer: { type: 'read-only-storage' } }, { binding: 1, visibility: VS, buffer: { type: 'uniform' } }] });
    this.showGroup = d.createBindGroup({ layout: this.showLayout, entries: [{ binding: 0, resource: { buffer: this.showBuf } }, { binding: 1, resource: { buffer: this.showUBuf } }] });
    this.showPipe = R.forwardPipeline({ label: 'drone-show', code: SHOW_WGSL, groups: [this.showLayout], blend: 'add' });
    this.knotPipe = R.forwardPipeline({ label: 'drone-knot', code: SHOW_WGSL, vs: 'vsKnot', groups: [this.showLayout], blend: 'add' });
    this.reflPipe = R.forwardPipeline({ label: 'drone-reflections', code: SHOW_WGSL, vs: 'vsRefl', fs: 'fsRefl', groups: [this.showLayout], blend: 'add', depthTest: false });
    this.center = [2380, 215, -1000];
    const I = sh.index;
    // timeline: [start, from, to, duration, stagger]
    this.timeline = [
      [0, I.barge, I.barge, 1, 0], [1, I.barge, I.lotusC, 4.5, 1], [5.5, I.lotusC, I.lotusO, 3, 0], [8.5, I.lotusO, I.lotusO, 1.5, 0],
      [10, I.lotusO, I.horse0, 2.5, 1], [12.5, -1, -1, 6.5, 0], [19, I.horse0, I.dragon, 2.5, 1], [21.5, I.dragon, I.dragon, 9.5, 0],
      [31, I.dragon, I.moon, 2.5, 1], [33.5, I.moon, I.moon, 6.5, 0], [40, I.moon, I.neon, 2.5, 1], [42.5, I.neon, I.neon, 7.5, 0],
      [50, I.neon, I.sphere, 2.5, 1], [52.5, I.sphere, I.burst, 2.5, 0], [55, I.burst, I.barge, 5, 1],
    ];
    // show barge (static), drawn with the transit static shader
    const bm = new MeshBuilder();
    const [cx, , cz] = this.center;
    bm.ybox(cx, 0.4, cz, 40, 1.4, 28, 0, 1);
    bm.ybox(cx, 1.85, cz, 40.2, 0.05, 28.2, 0, 6, 0, 1 | 2 | 16 | 32);
    this.barge = bm.upload(d, 'barge');
    this.bargePipe = R.gbufferPipeline({ label: 'barge', code: TRANSIT_STATIC_WGSL, buffers: [VERTEX_LAYOUT] });
    ctx.world.addCollider(cx, 0.4, cz, 40, 1.4, 28, 0);
    ctx.world.shared.droneShow = { x: cx, y: this.center[1], z: cz, drones: this.N };
    this.showOn = false;
  }

  _heli(h, t, out) {
    const P = this.paths[h.path];
    const len = P[6];
    const s = (((h.phase + h.speed * t) / len) % 1 + 1) % 1 * len;
    const ang = s / P[2] * h.dir;
    out[0] = P[0] + Math.cos(ang) * P[2]; out[2] = P[1] + Math.sin(ang) * P[2];
    out[1] = P[4] + 3 * Math.sin(t * 0.37 + h.seed * 6) + 1.5 * Math.sin(t * 0.9 + h.seed * 17);
    out[3] = -Math.sin(ang) * h.dir; out[4] = Math.cos(ang) * h.dir;
  }

  update(ctx) {
    const t = ctx.time;
    // searchlights: point ahead and down, sweeping
    const B = this.beamData, tmp = this._tmp || (this._tmp = new Float64Array(5));
    for (let k = 0; k < this.helis.length && k < 2; k++) {
      const h = this.helis[k];
      this._heli(h, t, tmp);
      const sw = Math.sin(t * 0.35 + k * 2.0) * 0.8, fwd = 70 + 40 * Math.sin(t * 0.21 + k);
      const tx = tmp[0] + tmp[3] * fwd - tmp[4] * sw * 60, tz = tmp[2] + tmp[4] * fwd + tmp[3] * sw * 60;
      const ty = Math.max(ctx.world.heightAt(tx, tz), 0);
      const o = k * 8;
      B[o] = tmp[0]; B[o + 1] = tmp[1] - 1.5; B[o + 2] = tmp[2]; B[o + 3] = 1;
      B[o + 4] = tx; B[o + 5] = ty; B[o + 6] = tz; B[o + 7] = 9;
      ctx.lights.set(this.beamLights + k, tx, ty + 6, tz, 26, 160, 175, 200, 0);
    }
    ctx.device.queue.writeBuffer(this.beamBuf, 0, B);
    // drone show timeline
    const S = ctx.show;
    this.showOn = S.intensity > 0.002;
    if (this.showOn) {
      const s = S.time;
      const TL = this.timeline;
      let k = 0;
      for (let i = 0; i < TL.length; i++) if (TL[i][0] <= s) k = i;
      const e = TL[k];
      let a = e[1], b = e[2], m = Math.min(Math.max((s - e[0]) / e[3], 0), 1), stg = e[4];
      if (a < 0) {
        // galloping: cycle the horse frames
        const f = (s - e[0]) * 11;
        const fi = Math.floor(f);
        a = this.shapeIndex.horse0 + (fi % 8); b = this.shapeIndex.horse0 + ((fi + 1) % 8); m = f - fi; stg = 0;
      }
      const U = this.showU;
      U[0] = a; U[1] = b; U[2] = m; U[3] = stg;
      U[4] = s; U[5] = S.intensity; U[6] = S.beatPhase; U[7] = this.N;
      U[8] = this.center[0]; U[9] = this.center[1]; U[10] = this.center[2]; U[11] = 1;
      U[12] = t;
      ctx.device.queue.writeBuffer(this.showUBuf, 0, U);
    }
  }

  gbuffer(ctx, pass) {
    pass.setPipeline(this.meshPipe);
    pass.setBindGroup(1, this.group);
    pass.setVertexBuffer(0, this.mesh.vb);
    pass.setIndexBuffer(this.mesh.ib, 'uint32');
    pass.drawIndexed(this.mesh.count, this.meshCount);
    pass.setPipeline(this.bargePipe);
    pass.setVertexBuffer(0, this.barge.vb);
    pass.setIndexBuffer(this.barge.ib, 'uint32');
    pass.drawIndexed(this.barge.count);
  }

  forward(ctx, pass) {
    pass.setPipeline(this.lightPipe);
    pass.setBindGroup(2, this.group);
    pass.draw(24, this.total);
    pass.setPipeline(this.beamPipe);
    pass.setBindGroup(2, this.beamGroup);
    pass.draw(120, 2);
    if (this.showOn) {
      pass.setPipeline(this.showPipe);
      pass.setBindGroup(2, this.showGroup);
      pass.draw(6, this.N);
      pass.setPipeline(this.reflPipe);
      pass.draw(6, this.N >> 1);
      pass.setPipeline(this.knotPipe);
      pass.draw(6, KNOT_N);
    }
  }
}
