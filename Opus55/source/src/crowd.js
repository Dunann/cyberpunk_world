// Pedestrians: stylised low-poly people with a vertex-shader walk cycle, umbrellas (some with glowing LED rims)
// and phone screens. A compute pass evaluates every agent analytically, culls it and appends near ones to a mesh
// list (G-buffer, previous-frame pose for motion vectors) and far LED/phone glints to a sprite list (forward).
// Agent kinds: 0 sidewalk walker on a street run, 1 pacing back and forth (market shoppers), 2 standing (spectators,
// platform waiters, vendors).

import { MeshBuilder, VERTEX_LAYOUT } from './trafficGeom.js';
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
@group(1) @binding(4) var<uniform> P: vec4f; // x count, y near distance, z glint distance, w near capacity

fn ledColor(k: u32) -> vec3f {
  if (k == 0u) { return vec3f(0.1, 0.9, 1.0); }
  if (k == 1u) { return vec3f(1.0, 0.15, 0.6); }
  if (k == 2u) { return vec3f(0.6, 0.25, 1.0); }
  return vec3f(1.0, 0.6, 0.15);
}

@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= u32(P.x)) { return; }
  let A = agents[i];
  let t = time();
  let st = agentState(A, t);
  if (st.fade < 0.02) { return; }
  let dist = length(st.p - F.camPos.xyz);
  if (dist > P.z) { return; }
  let c = F.viewProjNJ * vec4f(st.p + vec3f(0.0, 1.0, 0.0), 1.0);
  if (c.w < -2.0 || abs(c.x) > c.w * 1.05 + 3.0 || abs(c.y) > c.w * 1.05 + 3.0) { return; }
  let style = u32(A.c.z);
  if (dist < P.y) {
    let ps = agentState(A, t - F.camFwd.w);
    var o: Person;
    o.p = vec4f(st.p, A.c.y);
    o.f = vec4f(st.f, st.walk * 4.2, ps.walk * 4.2);
    o.pp = vec4f(ps.p, A.c.z);
    o.pf = vec4f(ps.f, st.amp, A.c.w * st.fade * smoothstep(2.0, 4.5, dist));
    let k = atomicAdd(&args[1], 1u);
    if (k < u32(P.w)) { near[k] = o; }
  }
  // far glints: LED umbrella rims and raised phones
  if (dist > P.y * 0.6) {
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
      let k = atomicAdd(&args[6], 1u);
      if (k < arrayLength(&glints)) { glints[k] = g; }
    }
  }
}

@compute @workgroup_size(1)
fn clampArgs() {
  atomicStore(&args[1], min(atomicLoad(&args[1]), u32(P.w)));
  atomicStore(&args[6], min(atomicLoad(&args[6]), arrayLength(&glints)));
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

fn rotX(p: vec3f, pivot: vec3f, a: f32) -> vec3f {
  let q = p - pivot;
  let c = cos(a); let s = sin(a);
  return pivot + vec3f(q.x, q.y * c - q.z * s, q.y * s + q.z * c);
}

// Animate one vertex of the person mesh in local space (x left, y up, z forward).
fn pose(p: vec3f, part: f32, style: u32, phase: f32, amp: f32) -> vec3f {
  let umb = (style & 1u) != 0u;
  let phone = (style & 4u) != 0u;
  let raised = (style & 8u) != 0u;
  let sw = sin(phase) * 0.55 * amp;
  var q = p;
  if (part == 2.0) { q = rotX(p, vec3f(0.1, 0.84, 0.0), sw); }
  else if (part == 3.0) { q = rotX(p, vec3f(-0.1, 0.84, 0.0), -sw); }
  else if (part == 4.0) {
    // left arm holds the umbrella
    q = select(rotX(p, vec3f(0.25, 1.44, 0.0), -sw * 0.8), rotX(p, vec3f(0.25, 1.44, 0.0), -1.25), umb);
  } else if (part == 5.0) {
    // right arm holds the phone (raised for spectators filming)
    var a = sw * 0.8;
    if (phone) { a = -1.0; }
    if (raised) { a = -2.5; }
    q = rotX(p, vec3f(-0.25, 1.44, 0.0), a);
  } else if (part == 6.0 || part == 7.0 || part == 9.0) {
    if (!umb) { return vec3f(0.0, -1000.0, 0.0); }
  } else if (part == 8.0) {
    if (!phone && !raised) { return vec3f(0.0, -1000.0, 0.0); }
    if (raised) { q = p + vec3f(0.0, 0.62, 0.22); }
  }
  // gentle body bob while walking
  q.y += abs(sin(phase)) * 0.035 * amp;
  return q;
}

@vertex fn vs(v: VIn, @builtin(instance_index) ii: u32) -> VOut {
  var o: VOut;
  let P = people[ii];
  let style = u32(P.pp.w);
  let part = v.me.x;
  let sc = P.pf.w;
  let lp = pose(v.pos, part, style, P.f.z, P.pf.z) * sc;
  let plp = pose(v.pos, part, style, P.f.w, P.pf.z) * sc;
  if (lp.y < -100.0) { o.cp = vec4f(0.0, 0.0, -1.0, 1.0); return o; }
  let f = vec3f(P.f.x, 0.0, P.f.y);
  let l = vec3f(f.z, 0.0, -f.x);
  let pf = vec3f(P.pf.x, 0.0, P.pf.y);
  let pl = vec3f(pf.z, 0.0, -pf.x);
  o.wp = P.p.xyz + l * lp.x + vec3f(0.0, lp.y, 0.0) + f * lp.z;
  o.pwp = P.pp.xyz + pl * plp.x + vec3f(0.0, plp.y, 0.0) + pf * plp.z;
  o.n = l * v.nrm.x + vec3f(0.0, v.nrm.y, 0.0) + f * v.nrm.z;
  o.lp = v.pos;
  o.info = vec4f(part, P.pp.w, P.p.w, 0.0);
  o.cp = F.viewProj * vec4f(o.wp, 1.0);
  return o;
}

fn coat(k: u32) -> vec3f {
  switch (k) {
    case 0u: { return vec3f(0.05, 0.05, 0.06); }
    case 1u: { return vec3f(0.2, 0.2, 0.22); }
    case 2u: { return vec3f(0.08, 0.1, 0.22); }
    case 3u: { return vec3f(0.4, 0.06, 0.05); }
    case 4u: { return vec3f(0.55, 0.42, 0.08); }
    case 5u: { return vec3f(0.05, 0.2, 0.15); }
    case 6u: { return vec3f(0.33, 0.28, 0.22); }
    default: { return vec3f(0.5, 0.5, 0.52); }
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

@fragment fn fs(i: VOut) -> GOut {
  let part = i.info.x;
  let style = u32(i.info.y);
  let seed = i.info.z;
  let n = normalize(i.n);
  let ci = (style >> 4u) & 7u;
  var albedo = coat(ci);
  var rough = 0.6; var metal = 0.0; var emis = vec3f(0.0);
  let h = fract(seed * 7.13);
  if (part == 1.0) {
    let skin = mix(vec3f(0.45, 0.3, 0.22), vec3f(0.62, 0.45, 0.34), h);
    albedo = select(skin, vec3f(0.03, 0.025, 0.02), i.lp.y > 1.67 || (i.lp.z < -0.05 && i.lp.y > 1.52));
  } else if (part == 2.0 || part == 3.0 || part == 10.0) {
    albedo = select(vec3f(0.04, 0.045, 0.06), vec3f(0.12, 0.12, 0.14), h > 0.6);
    if (i.lp.y < 0.08) { albedo = vec3f(0.02); }
  } else if (part == 4.0 || part == 5.0) {
    albedo = coat(ci) * 0.9;
  } else if (part == 6.0) {
    albedo = umbCol((style >> 8u) & 7u); rough = 0.25; metal = 0.0;
  } else if (part == 7.0) {
    albedo = vec3f(0.05); metal = 0.8; rough = 0.3;
  } else if (part == 8.0) {
    albedo = vec3f(0.02); emis = vec3f(0.6, 0.8, 1.0) * 3.0;
  } else if (part == 9.0) {
    albedo = vec3f(0.1);
    if ((style & 2u) != 0u) { emis = ledCol((style >> 11u) & 3u) * 6.0; albedo = vec3f(0.6); }
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
  if (ii >= counts[6]) { o.cp = vec4f(0.0, 0.0, -1.0, 1.0); return o; }
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

function personMesh() {
  const mb = new MeshBuilder();
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
  mb.box([0, 1.14, 0], X, Y, Z, 0.19, 0.31, 0.12, 0);          // torso
  mb.box([0, 0.86, 0], X, Y, Z, 0.17, 0.05, 0.11, 2.5);        // hips (static, coloured like legs)
  mb.box([0, 1.6, 0.01], X, Y, Z, 0.1, 0.12, 0.11, 1);         // head
  mb.box([0.1, 0.42, 0], X, Y, Z, 0.075, 0.42, 0.085, 2);      // left leg
  mb.box([-0.1, 0.42, 0], X, Y, Z, 0.075, 0.42, 0.085, 3);     // right leg
  mb.box([0.25, 1.15, 0], X, Y, Z, 0.05, 0.3, 0.06, 4);        // left arm
  mb.box([-0.25, 1.15, 0], X, Y, Z, 0.05, 0.3, 0.06, 5);       // right arm
  mb.box([-0.12, 1.42, 0.3], X, Y, Z, 0.04, 0.07, 0.012, 8);   // phone screen
  // umbrella: pole, canopy (both sides), LED rim
  mb.beam([0.18, 1.2, 0.3], [0.05, 2.12, 0.08], 0.015, 0.015, 7);
  const N = 8, r = 0.58, cy = 2.2, ry = 1.98, cx = 0.05, cz = 0.08;
  for (let k = 0; k < N; k++) {
    const a0 = k / N * Math.PI * 2, a1 = (k + 1) / N * Math.PI * 2, am = (a0 + a1) / 2;
    const p0 = [cx + Math.cos(a0) * r, ry, cz + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, ry, cz + Math.sin(a1) * r];
    const apex = [cx, cy, cz];
    mb.tri(apex, p0, p1, [Math.cos(am) * 0.35, 0.94, Math.sin(am) * 0.35], [[0, 0], [1, 0], [0, 1]], 6);
    mb.tri(apex, p1, p0, [0, -1, 0], [[0, 0], [1, 0], [0, 1]], 6);
    mb.quad(p0, p1, [p1[0], ry - 0.035, p1[2]], [p0[0], ry - 0.035, p0[2]], [Math.cos(am), 0, Math.sin(am)], [[0, 0], [1, 0], [1, 1], [0, 1]], 9);
  }
  // hips use the leg material id range for shading but must not swing: remap 2.5 -> 2 shading in a static way
  for (let i = 0; i < mb.vertexCount; i++) if (mb.v[i * 10 + 8] === 2.5) mb.v[i * 10 + 8] = 10;
  return mb;
}

// ---------------------------------------------------------------- placement

function buildAgents(world, transit, q) {
  const R = rng(8080);
  const A = [];
  const dens = [0.4, 0.7, 1.0][q];
  const style = (o) => {
    const umb = !o.indoor && R() < 0.55;
    const led = umb && R() < 0.3;
    const phone = !umb && R() < 0.3;
    return (umb ? 1 : 0) | (led ? 2 : 0) | (phone ? 4 : 0) | (o.raised ? 8 : 0) | (((R() * 8) | 0) << 4) | (((R() * 8) | 0) << 8) | (((R() * 4) | 0) << 11);
  };
  const push = (ax, az, dx, dz, b0, b1, b2, b3, mode, o = {}) => {
    A.push(ax, az, dx, dz, b0, b1, b2, b3, mode, R(), style(o), 0.92 + R() * 0.16);
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
        push(r.ax, r.az, r.dx, r.dz, r.len, lat, R() * r.len, v, 0);
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
    for (let k = 0; k < 420 * dens; k++) {
      const t = 10 + R() * 165, o = (R() - 0.5) * 7.5;
      const x = C.x + ux * t + px * o, z = C.z + uz * t + pz * o;
      if (world.waterDist(x, z) < 8) continue;
      const across = R() < 0.35;
      const ddx = across ? px : ux, ddz = across ? pz : uz;
      if (R() < 0.3) { const a = R() * 6.283; push(x, z, Math.cos(a), Math.sin(a), 0, -2000, R(), 0, 2); }
      else push(x, z, ddx, ddz, 3 + R() * 9, -2000, R(), 0.6 + R() * 0.6, 1);
    }
    for (let t = 14; t < 175; t += 5.5) for (const side of [-1, 1]) {
      if (R() < 0.25) continue;
      const o = side * 7.4;
      const x = C.x + ux * t + px * o, z = C.z + uz * t + pz * o;
      push(x, z, -px * side, -pz * side, 0, -2000, R(), 0, 2);
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
    this.count = ag.count;
    const mk = (size, usage, label) => d.createBuffer({ label, size, usage });
    this.agentBuf = mk(ag.data.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'crowd-agents');
    d.queue.writeBuffer(this.agentBuf, 0, ag.data);
    this.nearCap = [1500, 2500, 3500][q];
    this.nearBuf = mk(this.nearCap * 64, GPUBufferUsage.STORAGE, 'crowd-near');
    this.glintCap = 12000;
    this.glintBuf = mk(this.glintCap * 32, GPUBufferUsage.STORAGE, 'crowd-glints');
    this.mesh = personMesh().upload(d, 'person');
    this.argsInit = new Uint32Array([this.mesh.count, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0]);
    this.argsBuf = mk(48, GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST, 'crowd-args');
    this.params = new Float32Array([this.count, [110, 160, 210][q], [450, 600, 750][q], this.nearCap]);
    this.paramBuf = mk(16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'crowd-params');
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
    this.meshGroup = d.createBindGroup({ layout: this.meshLayout, entries: [{ binding: 0, resource: { buffer: this.nearBuf } }] });
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
    pass.setBindGroup(1, this.meshGroup);
    pass.setVertexBuffer(0, this.mesh.vb);
    pass.setIndexBuffer(this.mesh.ib, 'uint32');
    pass.drawIndexedIndirect(this.argsBuf, 0);
  }

  forward(ctx, pass) {
    pass.setPipeline(this.glintPipe);
    pass.setBindGroup(2, this.glintGroup);
    pass.draw(6, this.glintDraw);
  }
}
