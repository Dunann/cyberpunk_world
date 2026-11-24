// Pedestrians: stylised low-poly people with a vertex-shader walk cycle, umbrellas (some with glowing LED rims)
// and phone screens. A compute pass evaluates every agent analytically, culls it and appends near ones to a mesh
// list (G-buffer, previous-frame pose for motion vectors) and far LED/phone glints to a sprite list (forward).
// Agent kinds: 0 sidewalk walker on a street run, 1 pacing back and forth (market shoppers), 2 standing (spectators,
// platform waiters, vendors).

import { VERTEX_LAYOUT } from './trafficGeom.js';
import { personMesh, ARM_SY, ARM_EY, HOLD_SHOULDER, HOLD_ELBOW } from './crowdMesh.js';
import { buildRuns } from './trafficCars.js';
import { DISTRICTS, DT } from './world.js';
import { rng } from './math.js';

const CROWD_STATE_WGSL = /* wgsl */ `
struct Agent { a: vec4f, b: vec4f, c: vec4f };   // a: x, z, dx, dz   b: len|0, lateral|y, s0|phase, speed   c: mode, seed, style, scale
struct Person { p: vec4f, f: vec4f, pp: vec4f, pf: vec4f }; // p: pos, seed  f: fwd xz, phase, prev phase  pp: prev pos, style  pf: prev fwd xz, amp, scale
struct AState { p: vec3f, f: vec2f, walk: f32, amp: f32, fade: f32 };

fn agentState(A: Agent, t: f32) -> AState {
  var s: AState;
  let mode = A.c.x;
  s.fade = 1.0;
  var xz: vec2f;
  if (mode < 0.5) {
    let L = A.b.x; let v = A.b.w;
    let along = fract((A.b.z + v * t) / L) * L;
    let d = A.a.zw;
    xz = A.a.xy + d * along + vec2f(-d.y, d.x) * A.b.y;
    s.f = d * sign(v);
    s.walk = abs(v) * t + A.b.z;
    s.amp = 1.0;
    s.fade = smoothstep(0.0, 5.0, along) * smoothstep(0.0, 5.0, L - along);
  } else if (mode < 1.5) {
    let L = A.b.x; let v = A.b.w;
    let u = fract(A.b.z + t * v / (2.0 * L));
    let tri = 1.0 - abs(2.0 * u - 1.0);
    let e = tri * tri * (3.0 - 2.0 * tri);
    xz = A.a.xy + A.a.zw * (e - 0.5) * L;
    s.f = A.a.zw * select(-1.0, 1.0, u < 0.5);
    s.walk = e * L;
    s.amp = saturate(tri * (1.0 - tri) * 5.0);
  } else {
    xz = A.a.xy;
    s.f = A.a.zw;
    s.walk = 0.0;
    s.amp = 0.0;
  }
  var y = terrainHeight(xz);
  if (mode > 0.5 && A.b.y > -1000.0) { y = A.b.y; }
  s.p = vec3f(xz.x, y, xz.y);
  return s;
}
`;

const CROWD_CS = /* wgsl */ `
${CROWD_STATE_WGSL}
struct Glint { a: vec4f, b: vec4f }; // a: pos, radius   b: color (fog applied), 0
@group(1) @binding(0) var<storage, read> agents: array<Agent>;
@group(1) @binding(1) var<storage, read_write> near: array<Person>;
@group(1) @binding(2) var<storage, read_write> glints: array<Glint>;
@group(1) @binding(3) var<storage, read_write> args: array<atomic<u32>>;
struct Params { a: vec4f, b: vec4f };
// a: x count, y mesh distance, z glint distance, w far-mesh capacity   b: x LOD0 distance, y LOD1 distance, z/w LOD0/LOD1 capacity
@group(1) @binding(4) var<uniform> P: Params;

fn ledColor(k: u32) -> vec3f {
  if (k == 0u) { return vec3f(0.1, 0.9, 1.0); }
  if (k == 1u) { return vec3f(1.0, 0.15, 0.6); }
  if (k == 2u) { return vec3f(0.6, 0.25, 1.0); }
  return vec3f(1.0, 0.6, 0.15);
}

@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= u32(P.a.x)) { return; }
  let A = agents[i];
  let t = time();
  let st = agentState(A, t);
  if (st.fade < 0.02) { return; }
  let dist = length(st.p - F.camPos.xyz);
  if (dist > P.a.z) { return; }
  let c = F.viewProjNJ * vec4f(st.p + vec3f(0.0, 1.0, 0.0), 1.0);
  if (c.w < -2.0 || abs(c.x) > c.w * 1.05 + 3.0 || abs(c.y) > c.w * 1.05 + 3.0) { return; }
  let style = u32(A.c.z);
  var show = dist < P.a.y;
  if (dist < 25.0) {
    // people right next to or behind the lens, or whose umbrella top is in the bottom fifth of the frame, would only
    // show a clipped sliver of canopy at the frame edge: leave them out
    let top = F.viewProjNJ * vec4f(st.p + vec3f(0.0, 2.3 * A.c.w, 0.0), 1.0);
    if (top.w < 1.0 || top.y < -0.6 * top.w) { show = false; }
  }
  if (show) {
    let ps = agentState(A, t - F.camFwd.w);
    var o: Person;
    o.p = vec4f(st.p, A.c.y);
    o.f = vec4f(st.f, st.walk * 4.2, ps.walk * 4.2);
    o.pp = vec4f(ps.p, A.c.z);
    o.pf = vec4f(ps.f, st.amp, A.c.w * st.fade * smoothstep(2.0, 4.5, dist));
    // level of detail by distance; a full list spills into the next coarser one
    var lod = 2u;
    if (dist < P.b.x) { lod = 0u; } else if (dist < P.b.y) { lod = 1u; }
    if (lod == 0u) {
      let k = atomicAdd(&args[1], 1u);
      if (k < u32(P.b.z)) { near[k] = o; } else { lod = 1u; }
    }
    if (lod == 1u) {
      let k = atomicAdd(&args[6], 1u);
      if (k < u32(P.b.w)) { near[u32(P.b.z) + k] = o; } else { lod = 2u; }
    }
    if (lod == 2u) {
      let k = atomicAdd(&args[11], 1u);
      if (k < u32(P.a.w)) { near[u32(P.b.z + P.b.w) + k] = o; }
    }
  }
  // far glints: LED umbrella rims and raised phones
  if (dist > P.a.y * 0.6) {
    var col = vec3f(0.0); var h = 0.0;
    if ((style & 2u) != 0u) { col = ledColor((style >> 11u) & 3u) * 4.0; h = 1.97; }
    else if ((style & 8u) != 0u) { col = vec3f(0.6, 0.8, 1.0) * 3.0; h = 1.85; }
    if (h > 0.0) {
      let pos = st.p + vec3f(0.0, h * A.c.w, 0.0);
      let px = dist * 2.0 * F.camRight.w * F.res.w;
      let r = 0.35;
      let rr = max(r, 1.1 * px);
      let cc = F.viewProj * vec4f(pos, 1.0);
      let uv = cc.xy / max(cc.w, 1e-3) * vec2f(0.5, -0.5) + 0.5;
      let fog = textureSampleLevel(fogTex, sampClamp, vec3f(clamp(uv, vec2f(0.0), vec2f(1.0)), clamp(fogSlice(dist), 0.0, 1.0)), 0.0).a;
      var g: Glint;
      g.a = vec4f(pos, rr);
      g.b = vec4f(col * pow(r / rr, 1.3) * fog * st.fade, 0.0);
      let k = atomicAdd(&args[15], 1u);
      if (k < arrayLength(&glints)) { glints[k] = g; }
    }
  }
}

@compute @workgroup_size(1)
fn clampArgs() {
  atomicStore(&args[1], min(atomicLoad(&args[1]), u32(P.b.z)));
  atomicStore(&args[6], min(atomicLoad(&args[6]), u32(P.b.w)));
  atomicStore(&args[11], min(atomicLoad(&args[11]), u32(P.a.w)));
  atomicStore(&args[15], min(atomicLoad(&args[15]), arrayLength(&glints)));
}
`;

const PERSON_WGSL = /* wgsl */ `
struct Person { p: vec4f, f: vec4f, pp: vec4f, pf: vec4f };
@group(1) @binding(0) var<storage, read> people: array<Person>;
struct VIn { @location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) uv: vec2f, @location(3) me: vec2f };
struct VOut {
  @builtin(position) cp: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) pwp: vec3f,
  @location(3) lp: vec3f,
  @location(4) @interpolate(flat) info: vec4f, // part, style, seed, 0
};

const ARM_SY = ${ARM_SY};
const ARM_EY = ${ARM_EY};

fn rotX(p: vec3f, py: f32, a: f32) -> vec3f {
  let qy = p.y - py;
  let c = cos(a); let s = sin(a);
  return vec3f(p.x, py + qy * c - p.z * s, qy * s + p.z * c);
}
// Two-bone arm: bend the forearm at the elbow, then swing the whole arm at the shoulder.
fn arm(p: vec3f, fore: bool, shoulder: f32, elbow: f32) -> vec3f {
  var q = p;
  if (fore) { q = rotX(q, ARM_EY, elbow); }
  return rotX(q, ARM_SY, shoulder);
}

// Animate one vertex of the person mesh in local space (x left, y up, z forward).
// style bits: 1 umbrella, 2 LED rim, 4 phone, 8 raised phone, 4-6 coat colour, 8-10 umbrella colour, 11-12 LED colour,
// 13-14 clothes (0 jacket, 1 long coat, 2 poncho, 3 deel), 15-16 headwear (0 hair, 1 hood, 2 beanie, 3 steppe hat),
// 17 long hair
fn pose(p: vec3f, part: f32, style: u32, phase: f32, amp: f32) -> vec3f {
  let pi = u32(part);
  let umb = (style & 1u) != 0u;
  let phone = (style & 4u) != 0u;
  let raised = (style & 8u) != 0u;
  let cloth = (style >> 13u) & 3u;
  let head = (style >> 15u) & 3u;
  let longHair = ((style >> 17u) & 1u) != 0u;
  let sitting = ((style >> 18u) & 1u) != 0u;
  var hide = false;
  switch (pi) {
    case 6u, 7u, 9u: { hide = !umb; }
    case 8u: { hide = !phone && !raised; }
    case 15u: { hide = head != 0u; }
    case 25u: { hide = !longHair || head == 1u || head == 3u; }
    case 16u: { hide = head != 1u; }
    case 17u: { hide = head != 2u; }
    case 18u: { hide = head != 3u; }
    case 19u: { hide = cloth != 1u; }
    case 20u: { hide = cloth != 2u; }
    case 21u: { hide = cloth != 3u; }
    case 26u: { hide = !sitting; }
    default: {}
  }
  if (hide) { return vec3f(0.0, -1000.0, 0.0); }
  if (pi == 26u) { return p; } // stool stays on the ground
  let sw = sin(phase) * 0.55 * amp;
  let armSw = sw * select(0.8, 0.3, cloth == 2u);
  var q = p;
  if (sitting && (pi == 2u || pi == 3u)) { q = rotX(p, 0.84, select(-1.05, -1.25, pi == 2u)); }
  else if (sitting && (pi == 4u || pi == 23u || ((pi == 5u || pi == 24u || pi == 8u) && !phone))) {
    // hands resting on the lap
    q = arm(p, pi != 4u && pi != 5u, -0.45, -0.95);
  }
  else if (pi == 2u) { q = rotX(p, 0.84, sw); }
  else if (pi == 3u) { q = rotX(p, 0.84, -sw); }
  else if (pi == 4u || pi == 23u) {
    // left arm: swings, or grips the umbrella pole in front of the chest
    var s = -armSw; var e = -0.25 - max(0.0, sw) * 0.3;
    if (umb) { s = ${HOLD_SHOULDER}; e = ${HOLD_ELBOW}; }
    q = arm(p, pi == 23u, s, e);
  } else if (pi == 5u || pi == 24u || pi == 8u) {
    // right arm: swings, holds a phone at chest height, or films over the crowd
    var s = armSw; var e = -0.25 - max(0.0, -sw) * 0.3;
    if (phone) { s = -0.25; e = -1.35; }
    if (raised) { s = -2.2; e = -0.5; }
    q = arm(p, pi != 5u, s, e);
  } else if (pi == 19u || pi == 21u) {
    // coat and robe hems swing a little with the legs
    let k = saturate((0.95 - p.y) / 0.8);
    q.z += sin(phase) * 0.06 * amp * k * sign(p.x) * select(1.0, 0.6, pi == 21u);
  }
  // gentle body bob while walking; sitters drop onto the stool (hips at 0.44 m)
  q.y += abs(sin(phase)) * 0.035 * amp;
  if (sitting) { q.y -= 0.4; }
  return q;
}

@vertex fn vs(v: VIn, @builtin(instance_index) ii: u32) -> VOut {
  var o: VOut;
  let P = people[ii];
  let style = u32(P.pp.w);
  let part = v.me.x;
  let sc = P.pf.w;
  let lp = pose(v.pos, part, style, P.f.z, P.pf.z) * sc;
  if (lp.y < -100.0) { o.cp = vec4f(0.0, 0.0, -1.0, 1.0); return o; }
  let plp = pose(v.pos, part, style, P.f.w, P.pf.z) * sc;
  let f = vec3f(P.f.x, 0.0, P.f.y);
  let l = vec3f(f.z, 0.0, -f.x);
  let pf = vec3f(P.pf.x, 0.0, P.pf.y);
  let pl = vec3f(pf.z, 0.0, -pf.x);
  // limbs rotate their normals too (pose the point one normal-length away); the rest of the body only bobs
  let pi = u32(part);
  var pn = v.nrm;
  if (pi == 2u || pi == 3u || pi == 4u || pi == 5u || pi == 8u || pi == 23u || pi == 24u) {
    pn = pose(v.pos + v.nrm * 0.05, part, style, P.f.z, P.pf.z) * sc - lp;
  }
  o.wp = P.p.xyz + l * lp.x + vec3f(0.0, lp.y, 0.0) + f * lp.z;
  o.pwp = P.pp.xyz + pl * plp.x + vec3f(0.0, plp.y, 0.0) + pf * plp.z;
  o.n = l * pn.x + vec3f(0.0, pn.y, 0.0) + f * pn.z;
  o.lp = v.pos;
  o.info = vec4f(part, P.pp.w, P.p.w, 0.0);
  o.cp = F.viewProj * vec4f(o.wp, 1.0);
  return o;
}

fn coat(k: u32) -> vec3f {
  switch (k) {
    case 0u: { return vec3f(0.035, 0.035, 0.04); }   // black
    case 1u: { return vec3f(0.18, 0.18, 0.2); }      // charcoal
    case 2u: { return vec3f(0.06, 0.09, 0.24); }     // navy
    case 3u: { return vec3f(0.38, 0.06, 0.06); }     // burgundy
    case 4u: { return vec3f(0.5, 0.36, 0.12); }      // camel
    case 5u: { return vec3f(0.12, 0.2, 0.09); }      // olive
    case 6u: { return vec3f(0.05, 0.26, 0.3); }      // teal
    default: { return vec3f(0.55, 0.52, 0.46); }     // stone
  }
}
fn poncho(k: u32) -> vec3f {
  switch (k & 3u) {
    case 0u: { return vec3f(0.75, 0.62, 0.05); }     // safety yellow
    case 1u: { return vec3f(0.08, 0.32, 0.55); }     // blue
    case 2u: { return vec3f(0.6, 0.08, 0.3); }       // magenta
    default: { return vec3f(0.35, 0.42, 0.45); }     // clear grey
  }
}
fn deel(k: u32) -> vec3f {
  switch (k) {
    case 0u: { return vec3f(0.06, 0.12, 0.42); }     // royal blue
    case 1u: { return vec3f(0.42, 0.05, 0.08); }     // crimson
    case 2u: { return vec3f(0.05, 0.28, 0.2); }      // jade
    case 3u: { return vec3f(0.55, 0.38, 0.06); }     // gold
    case 4u: { return vec3f(0.25, 0.08, 0.3); }      // purple
    case 5u: { return vec3f(0.1, 0.25, 0.4); }       // sky blue
    case 6u: { return vec3f(0.32, 0.2, 0.12); }      // brown
    default: { return vec3f(0.06, 0.06, 0.08); }     // black
  }
}
fn umbCol(k: u32) -> vec3f {
  switch (k) {
    case 0u: { return vec3f(0.04); }
    case 1u: { return vec3f(0.55, 0.04, 0.07); }
    case 2u: { return vec3f(0.06, 0.1, 0.32); }
    case 3u: { return vec3f(0.6, 0.62, 0.66); }
    case 4u: { return vec3f(0.06, 0.32, 0.3); }
    case 5u: { return vec3f(0.45, 0.06, 0.35); }
    case 6u: { return vec3f(0.65, 0.5, 0.06); }
    default: { return vec3f(0.18); }
  }
}
fn ledCol(k: u32) -> vec3f {
  if (k == 0u) { return vec3f(0.1, 0.9, 1.0); }
  if (k == 1u) { return vec3f(1.0, 0.15, 0.6); }
  if (k == 2u) { return vec3f(0.6, 0.25, 1.0); }
  return vec3f(1.0, 0.6, 0.15);
}
fn hairCol(h: f32) -> vec3f {
  if (h < 0.55) { return vec3f(0.018, 0.016, 0.015); }
  if (h < 0.8) { return vec3f(0.07, 0.04, 0.025); }
  if (h < 0.88) { return vec3f(0.5, 0.5, 0.52); }
  if (h < 0.94) { return vec3f(0.55, 0.08, 0.35); }
  return vec3f(0.06, 0.35, 0.5);
}

@fragment fn fs(i: VOut) -> GOut {
  let pi = u32(i.info.x);
  let style = u32(i.info.y);
  let seed = i.info.z;
  let n = normalize(i.n);
  let ci = (style >> 4u) & 7u;
  let cloth = (style >> 13u) & 3u;
  let h = fract(seed * 7.13);
  let h2 = fract(seed * 31.7);
  let h3 = fract(seed * 113.1);
  let lp = i.lp;
  // garment colour: coat palette with a per-person shade, or a silk deel
  var garment = coat(ci) * (0.75 + 0.5 * h2);
  if (cloth == 3u) { garment = deel(ci); }
  let trim = select(vec3f(0.75, 0.52, 0.12), vec3f(0.85, 0.82, 0.75), h3 > 0.5);
  var albedo = garment;
  var rough = 0.65; var metal = 0.0; var emis = vec3f(0.0);
  switch (pi) {
    case 1u: {
      albedo = mix(vec3f(0.42, 0.27, 0.19), vec3f(0.66, 0.48, 0.37), h);
      rough = 0.5;
    }
    case 15u, 25u: { albedo = hairCol(h3); rough = 0.45; }
    case 2u, 3u, 10u: {
      let tr = u32(h2 * 4.0);
      albedo = select(select(vec3f(0.04, 0.045, 0.06), vec3f(0.06, 0.08, 0.16), tr == 1u), select(vec3f(0.14, 0.13, 0.11), vec3f(0.3, 0.25, 0.16), tr == 3u), tr >= 2u);
      if (lp.y < 0.09) { albedo = vec3f(0.02); rough = 0.3; }
      if (cloth == 3u && lp.y < 0.36) { albedo = vec3f(0.12, 0.05, 0.03); rough = 0.4; } // leather boots
    }
    case 23u, 24u: {
      if (lp.y < 0.9) { albedo = mix(vec3f(0.42, 0.27, 0.19), vec3f(0.66, 0.48, 0.37), h); rough = 0.5; }
      if (cloth == 3u && lp.y > 0.9 && lp.y < 0.94) { albedo = trim; }
    }
    case 0u, 4u, 5u, 19u, 21u: {
      if (cloth == 3u) {
        rough = 0.35;
        // sash at the waist, diagonal collar trim and hem trim
        if (lp.y > 0.92 && lp.y < 0.99) { albedo = select(vec3f(0.7, 0.35, 0.05), vec3f(0.75, 0.6, 0.08), h > 0.5); }
        if (lp.z > 0.0 && lp.y > 1.12 && abs(lp.x + (lp.y - 1.45) * 0.55) < 0.016) { albedo = trim; }
        if (lp.y < 0.2) { albedo = trim * 0.8; }
      } else {
        // zip line and hem band
        if (lp.z > 0.06 && abs(lp.x) < 0.006 && lp.y > 0.95) { albedo = garment * 0.4; }
        if (pi == 0u && lp.y < 1.0 && lp.y > 0.95) { albedo = garment * 0.7; }
        // a few jackets have LED piping
        if (h3 < 0.08 && pi == 0u && abs(lp.y - 1.0) < 0.012) { emis = ledCol(u32(h * 4.0)) * 3.0; }
      }
    }
    case 20u: { albedo = poncho(ci); rough = 0.15; }
    case 16u: { albedo = garment * 0.9; }
    case 17u: {
      albedo = select(select(vec3f(0.5, 0.06, 0.05), vec3f(0.55, 0.42, 0.08), h > 0.5), vec3f(0.12), h2 > 0.6);
      rough = 0.9;
    }
    case 18u: {
      if (lp.y > 1.732) { albedo = select(vec3f(0.5, 0.05, 0.05), vec3f(0.08, 0.12, 0.42), h > 0.6); rough = 0.35; if (lp.y > 1.855) { albedo = vec3f(0.7, 0.5, 0.1); } }
      else { albedo = select(vec3f(0.06, 0.04, 0.03), vec3f(0.22, 0.15, 0.09), h2 > 0.5); rough = 0.95; }
    }
    case 6u: { albedo = umbCol((style >> 8u) & 7u); rough = 0.25; }
    case 7u: { albedo = vec3f(0.05); metal = 0.8; rough = 0.3; }
    case 26u: { albedo = select(vec3f(0.3, 0.18, 0.09), vec3f(0.5, 0.08, 0.06), h2 > 0.6); rough = 0.6; }
    case 8u: { albedo = vec3f(0.02); emis = vec3f(0.6, 0.8, 1.0) * 3.0; }
    case 9u: {
      albedo = vec3f(0.1);
      if ((style & 2u) != 0u) { emis = ledCol((style >> 11u) & 3u) * 6.0; albedo = vec3f(0.6); }
    }
    default: {}
  }
  return gbuf(albedo, rough, n, metal, emis, 1.0, motionVector(i.wp, i.pwp), 0.0, 0.8);
}
`;

const GLINT_WGSL = /* wgsl */ `
struct Glint { a: vec4f, b: vec4f };
@group(2) @binding(0) var<storage, read> glints: array<Glint>;
@group(2) @binding(1) var<storage, read> counts: array<u32>;
struct VOut { @builtin(position) cp: vec4f, @location(0) q: vec2f, @location(1) @interpolate(flat) col: vec3f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var o: VOut;
  if (ii >= counts[15]) { o.cp = vec4f(0.0, 0.0, -1.0, 1.0); return o; }
  let G = glints[ii];
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = corners[vi];
  let tc = normalize(F.camPos.xyz - G.a.xyz);
  let pos = G.a.xyz + tc * 0.3 + (F.camRight.xyz * c.x + F.camUp.xyz * c.y) * G.a.w * 1.6;
  o.cp = F.viewProj * vec4f(pos, 1.0);
  o.q = c * 1.6;
  o.col = G.b.rgb;
  return o;
}
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  return vec4f(i.col * exp(-dot(i.q, i.q) * 1.6), 0.0);
}
`;

// ---------------------------------------------------------------- placement

function buildAgents(world, transit, q) {
  const R = rng(8080);
  const A = [];
  const dens = [0.4, 0.7, 1.0][q];
  // clothes: 0 jacket, 1 long coat, 2 poncho, 3 deel   headwear: 0 hair, 1 hood, 2 beanie, 3 steppe hat
  // Clothes and headwear use their own random stream; umbrella, phone and colours keep drawing from the placement
  // stream in the original order so the crowd layout does not change.
  const S = rng(9191);
  const style = (o) => {
    const r = S();
    const cloth = o.steppe ? (r < 0.45 ? 3 : r < 0.65 ? 1 : r < 0.9 ? 0 : 2) : (r < 0.45 ? 0 : r < 0.8 ? 1 : 2);
    const umb = !o.indoor && R() < (cloth === 2 ? 0.15 : o.umbrella || 0.55);
    const led = umb && R() < 0.3;
    const phone = !umb && R() < 0.3;
    const coatCol = (R() * 8) | 0, umbCol = (R() * 8) | 0, ledCol = (R() * 4) | 0;
    const rh = S();
    let head = umb ? (rh < 0.12 ? 1 : rh < 0.27 ? 2 : 0) : (rh < 0.35 ? 1 : rh < 0.5 ? 2 : 0);
    if (o.steppe && S() < (cloth === 3 ? 0.65 : 0.25)) head = 3;
    const longHair = S() < 0.35;
    return (umb ? 1 : 0) | (led ? 2 : 0) | (phone ? 4 : 0) | (o.raised ? 8 : 0) | (coatCol << 4) | (umbCol << 8) |
      (ledCol << 11) | (cloth << 13) | (head << 15) | (longHair ? 1 << 17 : 0) | (o.sitting ? 1 << 18 : 0);
  };
  const isSteppe = (x, z) => {
    const d = world.districtAt(x, z);
    return d.index >= 0 && DISTRICTS[d.index].type === DT.STEPPE;
  };
  const push = (ax, az, dx, dz, b0, b1, b2, b3, mode, o = {}) => {
    if (o.steppe === undefined) o.steppe = isSteppe(ax, az);
    let scale = 0.92 + R() * 0.16;
    // the market crowd mixes heights more widely and includes children (own stream, keeps other placements)
    if (o.steppe && o.varied !== false) { const r = S(); scale = r < 0.07 ? 0.6 + S() * 0.12 : 0.86 + S() * 0.24; }
    A.push(ax, az, dx, dz, b0, b1, b2, b3, mode, R(), style(o), scale);
  };
  const blocked = (x, z) => {
    const c = world.collidersNear(x, z);
    if (!c) return false;
    for (const k of c) {
      const dx = x - k.cx, dz = z - k.cz;
      const lx = dx * k.cos + dz * k.sin, lz = -dx * k.sin + dz * k.cos;
      if (Math.abs(lx) < k.hx + 0.3 && Math.abs(lz) < k.hz + 0.3 && k.cy - k.hy < world.heightAt(x, z) + 2) return true;
    }
    return false;
  };

  // 1. sidewalk walkers along the street grids
  const runs = buildRuns(world);
  for (const r of runs) {
    if (r.bridge) continue;
    const D = DISTRICTS[r.district];
    const per100 = r.type === DT.HILLSIDE ? 7 : r.type === DT.URBAN ? 4.5 : r.type === DT.STEPPE ? 4 : r.type === DT.BUND ? 3 : 1.5;
    for (const side of [1, -1]) {
      const n = Math.round(r.len / 100 * per100 * dens);
      for (let k = 0; k < n; k++) {
        const lat = side * (D.road / 2 + 0.7 + R() * 1.6);
        const v = (0.95 + R() * 0.6) * (R() < 0.5 ? 1 : -1);
        push(r.ax, r.az, r.dx, r.dz, r.len, lat, R() * r.len, v, 0, { steppe: r.type === DT.STEPPE });
      }
    }
  }
  const walkers = A.length / 12;

  // 2. Bund promenade spectators facing the river (east)
  const nSpect = Math.round(2600 * dens);
  for (let k = 0, tries = 0; k < nSpect && tries < nSpect * 8; tries++) {
    const x = 2015 + R() * 85, z = -1500 + R() * 1200;
    const wd = world.waterDist(x, z), h = world.heightAt(x, z);
    if (wd < 4.5 || wd > 30 || h < 2.5 || blocked(x, z)) continue;
    const a = (R() - 0.5) * 0.5;
    push(x, z, Math.cos(a), Math.sin(a), 0, -2000, R(), 0, 2, { raised: R() < 0.22 });
    k++;
  }

  // 3. steppe night market (pose 6): shoppers pacing in the lane, vendors behind the stalls
  const pose6 = world.poses[5];
  if (pose6 && pose6.resolved) {
    const C = pose6.resolved, T = pose6.target;
    const dx = T[0] - C.x, dz = T[2] - C.z, len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len, px = -uz, pz = ux;
    const at = (t, o) => [C.x + ux * t + px * o, C.z + uz * t + pz * o];
    const ok = (x, z) => world.waterDist(x, z) >= 8;
    const M = { steppe: true, umbrella: 0.75 };
    const face = (a) => [Math.cos(a), Math.sin(a)];
    const lane = Math.atan2(uz, ux), cross = Math.atan2(pz, px);
    // queues in front of some stalls: a short line reaching into the lane, everyone facing the counter
    for (let t = 14; t < 175; t += 5.5) for (const side of [-1, 1]) {
      if (R() > 0.3 * dens + 0.05) continue;
      const n = 2 + ((R() * 3) | 0), ta = t + (R() - 0.5) * 1.5;
      for (let k = 0; k < n; k++) {
        const [x, z] = at(ta + (R() - 0.5) * 0.4, side * (3.7 - 0.75 * k));
        if (!ok(x, z)) continue;
        const [fx, fz] = face(cross + (side > 0 ? 0 : Math.PI) + (R() - 0.5) * 0.4);
        push(x, z, fx, fz, 0, -2000, R(), 0, 2, M);
      }
    }
    // small groups chatting in the lane: two or three people facing each other
    for (let k = 0; k < 18 * dens; k++) {
      const t = 12 + R() * 160, o = (R() - 0.5) * 5;
      const n = 2 + (R() < 0.4 ? 1 : 0);
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2 + R();
        const [x, z] = at(t + Math.cos(a) * 0.55, o + Math.sin(a) * 0.55);
        if (!ok(x, z)) continue;
        // face the group centre: local offset (cos a, sin a) in (along, across), so look back along it
        push(x, z, -(Math.cos(a) * ux + Math.sin(a) * px), -(Math.cos(a) * uz + Math.sin(a) * pz), 0, -2000, R(), 0, 2, M);
      }
    }
    // people sitting on stools between the stalls, facing the lane or each other
    for (let t = 16.75; t < 175; t += 5.5) for (const side of [-1, 1]) {
      if (R() > 0.4) continue;
      const n = 1 + ((R() * 3) | 0);
      for (let j = 0; j < n; j++) {
        const [x, z] = at(t + (j - (n - 1) / 2) * 0.8, side * (4.9 + R() * 0.4));
        if (!ok(x, z)) continue;
        const [fx, fz] = face(cross + (side > 0 ? Math.PI : 0) + (R() - 0.5) * 1.2);
        push(x, z, fx, fz, 0, -2000, R(), 0, 2, { steppe: true, indoor: true, sitting: true });
      }
    }
    // browsing: pacing a few meters along the lane or across to a stall
    for (let k = 0; k < 100 * dens; k++) {
      const t = 10 + R() * 165, o = (R() - 0.5) * 7;
      const [x, z] = at(t, o);
      if (!ok(x, z)) continue;
      const across = R() < 0.35;
      push(x, z, across ? px : ux, across ? pz : uz, 3 + R() * 7, -2000, R(), 0.5 + R() * 0.6, 1, M);
    }
    // walking through the whole market in both directions
    for (let k = 0; k < 45 * dens; k++) {
      const v = (0.9 + R() * 0.6) * (R() < 0.5 ? 1 : -1);
      const [x, z] = at(8, 0);
      push(x, z, ux, uz, 172, (R() - 0.5) * 6, R() * 172, v, 0, M);
    }
    // vendors behind the counters: half of them sit on a stool
    for (let t = 14; t < 175; t += 5.5) for (const side of [-1, 1]) {
      if (R() < 0.25) continue;
      const [x, z] = at(t + (R() - 0.5) * 2, side * 7.4);
      const sit = R() < 0.5;
      push(x, z, -px * side, -pz * side, 0, -2000, R(), 0, 2, { steppe: true, indoor: true, sitting: sit });
    }
  }
  // 4. people waiting on station platforms (facing the tracks)
  if (transit) {
    for (const T of transit.tracks) {
      const metro = T.kind === 'metro';
      for (const st of T.stations) {
        let pIn, pOut, py;
        if (st.liziba) { pIn = 4.6; pOut = 12.8; py = T.y[st.i] + 0.05; }
        else { pIn = metro ? 4.3 : 4.1; pOut = metro ? 9.4 : 8.0; py = T.y[st.i] + (metro ? 1.05 : 0.05); }
        const half = (st.liziba ? 22 : T.cfg.stationLen / 2) * 0.85;
        const nPer = Math.round((st.liziba ? 26 : metro ? 30 : 18) * dens);
        for (const side of [1, -1]) for (let k = 0; k < nPer; k++) {
          const s = st.s + (R() * 2 - 1) * half;
          const p = {};
          T.sample(s, p);
          const lat = side * (pIn + (pOut - pIn) * Math.pow(R(), 1.5));
          const x = p.x + p.tz * lat, z = p.z - p.tx * lat;
          const a = (R() - 0.5) * 0.9;
          // face the track: direction -lateral, jittered
          const fx = -p.tz * side, fz = p.tx * side;
          const cs = Math.cos(a), sn = Math.sin(a);
          if (R() < 0.2) push(x, z, p.tx, p.tz, 3 + R() * 6, py, R(), 0.7 + R() * 0.4, 1, { indoor: st.liziba });
          else push(x, z, fx * cs - fz * sn, fx * sn + fz * cs, 0, py, R(), 0, 2, { indoor: st.liziba });
        }
      }
    }
  }
  return { data: new Float32Array(A), count: A.length / 12, walkers };
}

export class Crowd {
  constructor(transit) { this.transit = transit; }

  init(ctx) {
    const d = ctx.device, R = ctx.renderer, q = ctx.quality.level;
    const ag = buildAgents(ctx.world, this.transit, q);
    if (typeof __DEV__ !== 'undefined' && __DEV__) (ctx.world.shared.devData ||= {}).crowd = ag.data;   // identity checks
    this.count = ag.count;
    const mk = (size, usage, label) => d.createBuffer({ label, size, usage });
    this.agentBuf = mk(ag.data.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'crowd-agents');
    d.queue.writeBuffer(this.agentBuf, 0, ag.data);
    // three mesh levels of detail share one instance buffer: [LOD0 | LOD1 | LOD2], capacities multiples of 4 so each
    // region starts on a 256-byte boundary for its bind group
    const caps = [[200, 800, 1500], [300, 1200, 2500], [400, 1600, 3500]][q];
    this.nearBuf = mk((caps[0] + caps[1] + caps[2]) * 64, GPUBufferUsage.STORAGE, 'crowd-near');
    this.glintCap = 12000;
    this.glintBuf = mk(this.glintCap * 32, GPUBufferUsage.STORAGE, 'crowd-glints');
    this.meshes = [0, 1, 2].map((l) => personMesh(l).upload(d, 'person' + l));
    this.argsInit = new Uint32Array([this.meshes[0].count, 0, 0, 0, 0, this.meshes[1].count, 0, 0, 0, 0, this.meshes[2].count, 0, 0, 0, 0, 0]);
    this.argsBuf = mk(64, GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST, 'crowd-args');
    this.params = new Float32Array([this.count, [110, 160, 210][q], [450, 600, 750][q], caps[2], [14, 18, 22][q], [40, 50, 60][q], caps[0], caps[1]]);
    this.paramBuf = mk(32, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'crowd-params');
    d.queue.writeBuffer(this.paramBuf, 0, this.params);
    const C = GPUShaderStage.COMPUTE;
    this.csLayout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: C, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: C, buffer: { type: 'storage' } },
      { binding: 2, visibility: C, buffer: { type: 'storage' } },
      { binding: 3, visibility: C, buffer: { type: 'storage' } },
      { binding: 4, visibility: C, buffer: { type: 'uniform' } },
    ] });
    this.csGroup = d.createBindGroup({ layout: this.csLayout, entries: [this.agentBuf, this.nearBuf, this.glintBuf, this.argsBuf, this.paramBuf].map((b, i) => ({ binding: i, resource: { buffer: b } })) });
    this.csPipe = R.computePipeline({ label: 'crowd-cs', code: CROWD_CS, groups: [this.csLayout] });
    this.clampPipe = R.computePipeline({ label: 'crowd-clamp', code: CROWD_CS, entry: 'clampArgs', groups: [this.csLayout] });
    const V = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
    this.meshLayout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: V, buffer: { type: 'read-only-storage' } }] });
    const offs = [0, caps[0], caps[0] + caps[1]];
    this.meshGroups = [0, 1, 2].map((l) => d.createBindGroup({ layout: this.meshLayout,
      entries: [{ binding: 0, resource: { buffer: this.nearBuf, offset: offs[l] * 64, size: caps[l] * 64 } }] }));
    this.meshPipe = R.gbufferPipeline({ label: 'people', code: PERSON_WGSL, buffers: [VERTEX_LAYOUT], groups: [this.meshLayout] });
    this.glintLayout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: V, buffer: { type: 'read-only-storage' } }, { binding: 1, visibility: V, buffer: { type: 'read-only-storage' } }] });
    this.glintGroup = d.createBindGroup({ layout: this.glintLayout, entries: [{ binding: 0, resource: { buffer: this.glintBuf } }, { binding: 1, resource: { buffer: this.argsBuf } }] });
    this.glintPipe = R.forwardPipeline({ label: 'people-glints', code: GLINT_WGSL, groups: [this.glintLayout], blend: 'add' });
    this.glintDraw = [4000, 8000, 12000][q];
    this.computeDesc = { timestampWrites: undefined };
    this.wg = Math.ceil(this.count / 128);
    ctx.world.shared.people = { agents: this.count, walkers: ag.walkers };
  }

  compute(ctx, enc) {
    ctx.device.queue.writeBuffer(this.argsBuf, 0, this.argsInit);
    this.computeDesc.timestampWrites = ctx.prof.ts('crowd-cs');
    const p = enc.beginComputePass(this.computeDesc);
    p.setPipeline(this.csPipe);
    p.setBindGroup(0, ctx.renderer.frameGroup);
    p.setBindGroup(1, this.csGroup);
    p.dispatchWorkgroups(this.wg);
    p.setPipeline(this.clampPipe);
    p.dispatchWorkgroups(1);
    p.end();
  }

  gbuffer(ctx, pass) {
    pass.setPipeline(this.meshPipe);
    for (let l = 0; l < 3; l++) {
      const m = this.meshes[l];
      pass.setBindGroup(1, this.meshGroups[l]);
      pass.setVertexBuffer(0, m.vb);
      pass.setIndexBuffer(m.ib, 'uint32');
      pass.drawIndexedIndirect(this.argsBuf, l * 20);
    }
  }

  forward(ctx, pass) {
    pass.setPipeline(this.glintPipe);
    pass.setBindGroup(2, this.glintGroup);
    pass.draw(6, this.glintDraw);
  }
}
