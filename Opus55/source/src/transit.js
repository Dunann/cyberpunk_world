// Transit: Monorail Line 2 (straddle monorail through the Liziba-style tower), Metro Line 6 (box-girder viaduct)
// and the Yangtze-style cableway. Static structures come from transitStatic.js; trains and cabins are instanced
// meshes whose transforms are evaluated on the CPU each frame (tens of instances) with previous-frame transforms
// for motion vectors.

import { MeshBuilder, VERTEX_LAYOUT, storageLayout, bindBuffers } from './trafficGeom.js';
import { buildTracks, STEP } from './transitLayout.js';
import { buildTransitStatic, TRANSIT_STATIC_WGSL, cablePoint, CABLE_GAUGE, HAUL_DROP } from './transitStatic.js';

// ---------------------------------------------------------------- car meshes (local: x left, y up, z forward)

const MONO_PROFILE = [[-1.30, -0.05], [1.30, -0.05], [1.42, 0.25], [1.46, 1.0], [1.46, 2.3], [1.40, 2.65], [1.15, 2.95], [0.6, 3.08], [-0.6, 3.08], [-1.15, 2.95], [-1.40, 2.65], [-1.46, 2.3], [-1.46, 1.0], [-1.42, 0.25]];
const METRO_PROFILE = [[-1.42, 0.95], [1.42, 0.95], [1.45, 1.1], [1.48, 2.5], [1.42, 3.3], [1.2, 3.65], [0.7, 3.82], [-0.7, 3.82], [-1.2, 3.65], [-1.42, 3.3], [-1.48, 2.5], [-1.45, 1.1]];
const CABIN_PROFILE = [[-1.5, -6.2], [1.5, -6.2], [1.65, -5.6], [1.65, -4.2], [1.4, -3.75], [0.9, -3.6], [-0.9, -3.6], [-1.4, -3.75], [-1.65, -4.2], [-1.65, -5.6]];

function extrudeZ(mb, profile, zs, mat, bottomMat) {
  const np = profile.length;
  for (let e = 0; e < np; e++) {
    const A = profile[e], B = profile[(e + 1) % np];
    const dl = B[0] - A[0], du = B[1] - A[1], el = Math.hypot(dl, du) || 1;
    // CCW profile in (x,y) seen from +z: outward normal = (du, -dl)
    const n = [du / el, -dl / el, 0];
    const m = e === 0 && bottomMat !== undefined ? bottomMat : mat;
    for (let k = 0; k < zs.length - 1; k++) {
      const z0 = zs[k], z1 = zs[k + 1];
      mb.quad([A[0], A[1], z0], [B[0], B[1], z0], [B[0], B[1], z1], [A[0], A[1], z1], n, [[z0, A[1]], [z0, B[1]], [z1, B[1]], [z1, A[1]]], m);
    }
  }
  // end caps (convex fan)
  let cx = 0, cy = 0;
  for (const p of profile) { cx += p[0]; cy += p[1]; }
  cx /= np; cy /= np;
  for (const [z, nz] of [[zs[zs.length - 1], 1], [zs[0], -1]]) {
    for (let e = 0; e < np; e++) {
      const A = profile[e], B = profile[(e + 1) % np];
      mb.tri([cx, cy, z], [A[0], A[1], z], [B[0], B[1], z], [0, 0, nz], [[cx, cy], [A[0], A[1]], [B[0], B[1]]], mat);
    }
  }
}

const zRings = (L) => { const h = L / 2; return [-h, -h + 0.25, -h + 0.9, -h + 1.8, -h + 2.8, h - 2.8, h - 1.8, h - 0.9, h - 0.25, h]; };
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];

function monorailCar(L) {
  const mb = new MeshBuilder();
  extrudeZ(mb, MONO_PROFILE, zRings(L), 0, 1);
  for (const s of [1, -1]) mb.box([s * 0.875, -0.68, 0], X, Y, Z, 0.375, 0.63, L / 2 - 1.3, 7);   // bogie skirts straddling the beam
  for (const z of [-L / 4, L / 4]) mb.box([0, 3.2, z], X, Y, Z, 0.7, 0.14, 1.4, 5);                   // roof units
  for (const s of [1, -1]) mb.box([0, 1.3, s * (L / 2 + 0.35)], X, Y, Z, 0.95, 1.25, 0.35, 6);          // gangways
  return mb;
}

function metroCar(L) {
  const mb = new MeshBuilder();
  extrudeZ(mb, METRO_PROFILE, zRings(L), 0, 1);
  for (const s of [1, -1]) mb.box([0, 0.52, s * (L / 2 - 3.3)], X, Y, Z, 1.15, 0.42, 1.4, 1);           // bogies
  mb.box([0, 0.72, 0], X, Y, Z, 1.2, 0.24, L / 2 - 5.2, 1);                                             // underfloor equipment
  for (const z of [-L / 3, 0, L / 3]) mb.box([0, 3.92, z], X, Y, Z, 0.75, 0.12, 1.3, 5);
  for (const s of [1, -1]) mb.box([0, 2.3, s * (L / 2 + 0.4)], X, Y, Z, 1.0, 1.3, 0.4, 6);
  // pantograph (collapsed unless the car carries one)
  mb.box([0, 3.98, L / 4], X, Y, Z, 0.6, 0.08, 0.5, 8);
  mb.beam([0.5, 4.0, L / 4 - 0.4], [0.0, 4.75, L / 4 + 0.6], 0.04, 0.04, 8);
  mb.beam([-0.5, 4.0, L / 4 - 0.4], [0.0, 4.75, L / 4 + 0.6], 0.04, 0.04, 8);
  mb.beam([0.0, 4.75, L / 4 + 0.6], [0.0, 5.25, L / 4 - 0.2], 0.04, 0.04, 8);
  mb.box([0, 5.28, L / 4 - 0.2], X, Y, Z, 0.85, 0.04, 0.08, 8);
  return mb;
}

// Wheel (cylinder) with its axis along x: centre, radius, half width, sides.
function wheelX(mb, cx, cy, cz, r, hw, n, mat) {
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
    const p = (a, x) => [x, cy + Math.cos(a) * r, cz + Math.sin(a) * r];
    const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
    mb.quad(p(a0, cx - hw), p(a1, cx - hw), p(a1, cx + hw), p(a0, cx + hw), [0, Math.cos(am), Math.sin(am)], uv, mat);
    mb.tri([cx + hw, cy, cz], p(a0, cx + hw), p(a1, cx + hw), [1, 0, 0], uv, mat);
    mb.tri([cx - hw, cy, cz], p(a1, cx - hw), p(a0, cx - hw), [-1, 0, 0], uv, mat);
  }
}

function cabinMesh() {
  const mb = new MeshBuilder();
  extrudeZ(mb, CABIN_PROFILE, [-3.2, -3.0, 3.0, 3.2], 9, 1);
  // Carriage: y = 0 is the centre of the two track ropes (x = +-gauge/2). Each rope carries a bogie with two
  // grooved wheels resting on top of it; side plates wrap around the outside of the ropes down to a crossbar, and
  // a grip clamps the haul rope below.
  const g = CABLE_GAUGE / 2, wr = 0.2, ry = 0.055 + wr;
  for (const sx of [-1, 1]) {
    const x = sx * g;
    for (const z of [-0.75, 0.75]) wheelX(mb, x, ry, z, wr, 0.05, 10, 1);
    mb.box([x, ry + 0.12, 0], X, Y, Z, 0.05, 0.07, 1.05, 1);                 // bogie beam over the wheels
    mb.box([x + sx * 0.12, 0.05, 0], X, Y, Z, 0.03, 0.32, 0.9, 1);           // outer side plate down past the rope
  }
  mb.box([0, -0.3, 0], X, Y, Z, g + 0.15, 0.06, 0.7, 1);                    // crossbar under the ropes
  mb.box([0, -HAUL_DROP, 0], X, Y, Z, 0.12, 0.1, 0.35, 1);                  // grip on the haul rope
  mb.beam([0, -0.3, 0], [0, -3.4, 0], 0.1, 0.1, 1);                        // hanger
  mb.box([0, -3.45, 0], X, Y, Z, 1.2, 0.12, 0.25, 1);
  mb.beam([0, -3.45, -0.3], [0, -3.45, -2.4], 0.08, 0.08, 1);
  mb.beam([0, -3.45, 0.3], [0, -3.45, 2.4], 0.08, 0.08, 1);
  mb.box([0, -3.52, 0], X, Y, Z, 1.0, 0.06, 2.6, 5);                    // roof equipment
  return mb;
}

const TRAIN_WGSL = /* wgsl */ `
struct Car { p: vec4f, f: vec4f, pp: vec4f, pf: vec4f }; // p.w flags, f.w seed, pp.w kind (0 mono, 1 metro, 2 cabin), pf.w half length
@group(1) @binding(0) var<storage, read> cars: array<Car>;

struct VIn { @location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) uv: vec2f, @location(3) me: vec2f };
struct VOut {
  @builtin(position) cp: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) lp: vec3f,
  @location(3) pwp: vec3f,
  @location(4) @interpolate(flat) info: vec4f, // mat, flags, kind, seed
  @location(5) @interpolate(flat) halfL: f32,
};

struct Def { p: vec3f, n: vec3f };
fn deform(lp: vec3f, n: vec3f, flags: u32, kind: f32, halfL: f32, mat: f32) -> Def {
  var d: Def; d.p = lp; d.n = n;
  if (kind > 1.5) { return d; }
  let noseLen = select(2.6, 3.0, kind > 0.5);
  let yb = select(-0.05, 0.95, kind > 0.5);
  let ka = select(0.15, 0.07, kind > 0.5);
  let kb = select(0.42, 0.14, kind > 0.5);
  let front = (flags & 1u) != 0u && lp.z > halfL - noseLen;
  let rear = (flags & 2u) != 0u && lp.z < -halfL + noseLen;
  // gangways vanish at nose ends; pantographs only where flagged
  if (mat == 6.0 && (((flags & 1u) != 0u && lp.z > 0.0) || ((flags & 2u) != 0u && lp.z < 0.0))) { d.p = vec3f(0.0); return d; }
  if (mat == 8.0 && (flags & 4u) == 0u) { d.p = vec3f(0.0); return d; }
  if (mat == 7.0 || mat == 6.0) { return d; }
  if (front || rear) {
    let sg = select(-1.0, 1.0, front);
    let t = saturate((abs(lp.z) - (halfL - noseLen)) / noseLen);
    let a = 1.0 - ka * t * t;
    let b = 1.0 - kb * t * t;
    let da = -2.0 * ka * t / noseLen * sg;
    let db = -2.0 * kb * t / noseLen * sg;
    d.p = vec3f(lp.x * a, yb + (lp.y - yb) * b, lp.z);
    d.n = normalize(vec3f(n.x / a, n.y / b, -lp.x * da / a * n.x - (lp.y - yb) * db / b * n.y + n.z));
  }
  return d;
}

@vertex fn vs(v: VIn, @builtin(instance_index) ii: u32) -> VOut {
  let C = cars[ii];
  let flags = u32(C.p.w + 0.5);
  let kind = C.pp.w;
  let halfL = C.pf.w;
  let d = deform(v.pos, v.nrm, flags, kind, halfL, v.me.x);
  let f = C.f.xyz;
  let l = normalize(cross(vec3f(0.0, 1.0, 0.0), f));
  let u = cross(f, l);
  let pf = C.pf.xyz;
  let pl = normalize(cross(vec3f(0.0, 1.0, 0.0), pf));
  let pu = cross(pf, pl);
  var o: VOut;
  o.wp = C.p.xyz + l * d.p.x + u * d.p.y + f * d.p.z;
  o.pwp = C.pp.xyz + pl * d.p.x + pu * d.p.y + pf * d.p.z;
  o.n = l * d.n.x + u * d.n.y + f * d.n.z;
  o.lp = v.pos;
  o.info = vec4f(v.me.x, C.p.w, kind, C.f.w);
  o.halfL = halfL;
  o.cp = F.viewProj * vec4f(o.wp, 1.0);
  return o;
}

// Head-and-shoulder silhouettes of standing / seated passengers against the lit interior (floorY = car floor).
fn passengers(z: f32, y: f32, seed: f32, floorY: f32) -> f32 {
  var k = 1.0;
  for (var o = -1; o <= 1; o++) {
    let cell = floor(z / 0.7) + f32(o);
    let h = hash21(vec2f(cell, seed * 97.0));
    if (h < 0.4) { continue; }
    let h2 = hash21(vec2f(cell + 13.0, seed * 31.0));
    let cx = (cell + 0.5 + (h2 - 0.5) * 0.4) * 0.7;
    let seated = h > 0.75;
    let hy = floorY + select(1.58, 1.22, seated) + h2 * 0.12;
    let dz = z - cx;
    let head = length(vec2f(dz, (y - hy) * 0.85)) < 0.12;
    let body = abs(dz) < 0.2 - max(y - (hy - 0.2), 0.0) * 0.6 && y < hy - 0.13;
    if (head || body) { k = min(k, 0.12 + 0.1 * h2); }
  }
  return k;
}

@fragment fn fs(i: VOut) -> GOut {
  let mat = i.info.x;
  let flags = u32(i.info.y + 0.5);
  let kind = i.info.z;
  let seed = i.info.w;
  let lp = i.lp;
  let hl = i.halfL;
  var n = normalize(i.n);
  var albedo = vec3f(0.7);
  var rough = 0.35;
  var metal = 0.3;
  var emis = vec3f(0.0);
  var mtl = 0.0;
  let t = time();
  let side = abs(i.lp.x) > 1.2 && abs(n.y) < 0.75;
  let isFront = (flags & 1u) != 0u && lp.z > hl - 2.6;
  let isRear = (flags & 2u) != 0u && lp.z < -hl + 2.6;
  let capF = lp.z > hl - 0.01;
  let capR = lp.z < -hl + 0.01;
  if (mat == 0.0) {
    if (kind < 0.5) {
      // straddle monorail: pearl white body, glowing teal stripe, ribbon windows
      albedo = vec3f(0.78, 0.8, 0.82); metal = 0.35; rough = 0.3;
      if (lp.y > 0.5 && lp.y < 0.72) { albedo = vec3f(0.05, 0.6, 0.5); emis = vec3f(0.1, 1.0, 0.75) * 2.5; }
      if (lp.y > 0.78 && lp.y < 0.86) { albedo = vec3f(0.1, 0.12, 0.14); }
      let doorZ = abs(abs(lp.z) - hl * 0.45);
      let isDoor = doorZ < 0.7 && lp.y > 0.1 && lp.y < 2.45 && side;
      if (isDoor) { albedo = vec3f(0.55, 0.57, 0.6); if (doorZ > 0.66 || abs(doorZ) < 0.02) { albedo = vec3f(0.05); } }
      let winY = lp.y > 1.15 && lp.y < 2.3;
      if (side && winY && !isFront && !isRear) {
        let wz = fract(lp.z / 1.6);
        let inWin = (wz > 0.08 && wz < 0.92) || isDoor;
        if (inWin && (!isDoor || (doorZ < 0.55 && doorZ > 0.05))) {
          albedo = vec3f(0.02); rough = 0.06; metal = 0.0; mtl = 2.0;
          emis = vec3f(0.82, 0.9, 1.0) * 2.1 * passengers(lp.z, lp.y, seed, 0.0) * (0.85 + 0.15 * smoothstep(1.2, 2.2, lp.y));
        }
      }
    } else if (kind < 1.5) {
      // metro: brushed silver, magenta line stripe
      albedo = vec3f(0.55, 0.57, 0.6); metal = 0.75; rough = 0.28;
      if (lp.y > 1.45 && lp.y < 1.68) { albedo = vec3f(0.6, 0.05, 0.3); emis = vec3f(1.0, 0.1, 0.5) * 2.2; }
      if (lp.y > 3.18 && lp.y < 3.26) { albedo = vec3f(0.6, 0.05, 0.3); }
      let dz = min(min(abs(lp.z - hl * 0.38), abs(lp.z + hl * 0.38)), min(abs(lp.z - hl * 0.13), abs(lp.z + hl * 0.13)));
      let isDoor = dz < 0.72 && lp.y > 1.15 && lp.y < 3.15 && side;
      if (isDoor) { albedo = vec3f(0.45, 0.47, 0.5); if (dz > 0.68 || dz < 0.02) { albedo = vec3f(0.03); } }
      let winY = lp.y > 1.95 && lp.y < 3.0;
      if (side && winY && !isFront && !isRear) {
        let wz = fract((lp.z + 0.4) / 2.1);
        let inWin = (wz > 0.1 && wz < 0.9 && !isDoor) || (isDoor && dz < 0.58 && dz > 0.06);
        if (inWin) {
          albedo = vec3f(0.02); rough = 0.06; metal = 0.0; mtl = 2.0;
          emis = vec3f(0.85, 0.92, 1.0) * 2.0 * passengers(lp.z, lp.y, seed, 1.1);
        }
      }
    }
    // front / rear ends
    let wsY0 = select(1.25, 2.05, kind > 0.5);
    let wsY1 = select(2.75, 3.45, kind > 0.5);
    let hlY0 = select(0.42, 1.25, kind > 0.5);
    if ((isFront || isRear) && lp.y > wsY0 && lp.y < wsY1 && abs(lp.x) < 1.38 && abs(lp.z) > hl - 2.0) {
      albedo = vec3f(0.01, 0.012, 0.015); rough = 0.04; metal = 0.0; mtl = 2.0;
      emis = vec3f(0.05, 0.08, 0.1) * select(0.2, 1.0, isFront);
    }
    if (capF || capR) {
      let lamp = lp.y > hlY0 && lp.y < hlY0 + 0.32 && abs(lp.x) > 0.5 && abs(lp.x) < 1.12;
      if (lamp && ((flags & 1u) != 0u) && capF) { emis = vec3f(1.0, 0.92, 0.8) * 45.0; albedo = vec3f(1.0); }
      if (lamp && ((flags & 2u) != 0u) && capR) { emis = vec3f(1.0, 0.04, 0.02) * 16.0; albedo = vec3f(0.5, 0.0, 0.0); }
      // LED light bar and destination display
      if (abs(lp.y - (hlY0 + 0.5)) < 0.05 && abs(lp.x) < 1.0 && ((flags & 3u) != 0u)) {
        emis = select(vec3f(1.0, 0.1, 0.05) * 6.0, select(vec3f(0.1, 1.0, 0.8), vec3f(1.0, 0.2, 0.6), kind > 0.5) * 6.0, capF && (flags & 1u) != 0u);
      }
      if (abs(lp.y - (wsY1 + 0.12)) < 0.1 && abs(lp.x) < 0.75 && ((flags & 3u) != 0u)) {
        let seg = step(0.4, fract(lp.x * 7.0)) * step(0.3, fract(lp.y * 25.0 + 0.2));
        emis = vec3f(1.0, 0.55, 0.05) * 5.0 * seg; albedo = vec3f(0.02);
      }
    }
  } else if (mat == 1.0) {
    albedo = vec3f(0.06, 0.06, 0.065); rough = 0.6; metal = 0.4;
  } else if (mat == 5.0) {
    albedo = vec3f(0.35, 0.36, 0.38); rough = 0.5; metal = 0.5;
  } else if (mat == 6.0) {
    albedo = vec3f(0.03); rough = 0.9; metal = 0.0;
  } else if (mat == 7.0) {
    albedo = vec3f(0.62, 0.64, 0.66) * select(1.0, 0.6, lp.y < -0.9); metal = 0.3; rough = 0.4;
  } else if (mat == 8.0) {
    albedo = vec3f(0.1); metal = 0.8; rough = 0.4;
  } else if (mat == 9.0) {
    // cable cabin: red body, white band, lit panoramic windows
    albedo = select(vec3f(0.6, 0.03, 0.03), vec3f(0.85, 0.85, 0.84), lp.y > -4.0);
    rough = 0.35; metal = 0.2;
    if (lp.y > -5.35 && lp.y < -4.08 && abs(n.y) < 0.6) {
      let fr = fract(lp.z / 1.25);
      let post = fr < 0.06 && abs(lp.z) < 3.1;
      if (!post) {
        albedo = vec3f(0.02); rough = 0.05; metal = 0.0; mtl = 2.0;
        emis = vec3f(1.0, 0.8, 0.55) * 1.4 * passengers(lp.z + lp.x * 0.5, lp.y, seed, -6.15);
      }
    }
    if (lp.y < -6.1) { albedo = vec3f(0.08); }
  }
  return gbuf(albedo, rough, n, metal, emis, 1.0, motionVector(i.wp, i.pwp), mtl, 0.8);
}
`;

// ---------------------------------------------------------------- module

export class Transit {
  init(ctx) {
    const d = ctx.device, world = ctx.world, R = ctx.renderer;
    this.tracks = buildTracks(world);
    const st = buildTransitStatic(ctx, this.tracks);
    this.staticGeo = st.mesh.upload(d, 'transit-static');
    for (const L of st.lights) ctx.lights.add(L[0], L[1], L[2], L[3], L[4], L[5], L[6], L[7]);
    (world.shared.signRequests ||= []).push(...st.signs);
    this.lightCount = st.lights.length;
    this.staticPipe = R.gbufferPipeline({ label: 'transit-static', code: TRANSIT_STATIC_WGSL, buffers: [VERTEX_LAYOUT] });

    // trains
    this.trains = [];
    let inst = 0;
    for (const T of this.tracks) {
      const cfg = T.cfg;
      const metro = T.kind === 'metro';
      const firstInst = inst;
      for (let k = 0; k < cfg.trains; k++) {
        this.trains.push({ T, k, base: inst, cars: cfg.cars, offset: 0, kind: metro ? 1 : 0 });
        inst += cfg.cars;
      }
      T.instRange = [firstInst, inst];
      // spread trains evenly over the cycle; train 0 of the monorail dwells at Liziba at t = 15 (pose 4)
      const liz = T.stations.find((s) => s.liziba);
      const base = liz ? T.offsetForDwell(liz, 1, 0) : 37; // train 0 pulls out of Liziba toward the pose 4 camera at t = 15
      for (const tr of this.trains) if (tr.T === T) tr.offset = base + tr.k * T.cycle / cfg.trains;
    }
    this.cabinBase = inst;
    inst += 2;
    this.instCount = inst;
    this.carData = new Float32Array(inst * 16);
    this.carBuf = d.createBuffer({ label: 'transit-cars', size: this.carData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const meshes = {
      mono: monorailCar(this.tracks.find((t) => t.kind === 'monorail').cfg.carLen).upload(d, 'mono-car'),
      metro: metroCar(this.tracks.find((t) => t.kind === 'metro').cfg.carLen).upload(d, 'metro-car'),
      cabin: cabinMesh().upload(d, 'cabin'),
    };
    this.meshes = meshes;
    this.layout = storageLayout(d, 1);
    this.group = bindBuffers(d, this.layout, [this.carBuf]);
    this.trainPipe = R.gbufferPipeline({ label: 'trains', code: TRAIN_WGSL, buffers: [VERTEX_LAYOUT], groups: [this.layout] });

    // cableway path
    const cw = world.shared.cableway;
    this.cable = cw;
    this.cableLen = Math.hypot(cw.b.x - cw.a.x, cw.b.z - cw.a.z);
    this.cableExt = Math.hypot(cw.a.x - cw.a.cx, cw.a.z - cw.a.cz);
    this.cabTravel = 92; this.cabDwell = 18;
    this.cabCycle = 2 * (this.cabTravel + this.cabDwell);
    // at t = 70 (pose 10) cabin 0 is over the river a quarter of the way out, in the middle of that view
    this.cabOffset = this.cabDwell + this.cabTravel * 0.56 - 70; // cabin 0 mid-river at t = 70 (pose 10)

    // dynamic lights: train headlights, cabin interiors
    this.lightBase = ctx.lights.reserve(this.trains.length + 2);
    // audio sources (preallocated)
    this.audio = [];
    for (let i = 0; i < this.trains.length; i++) this.audio.push({ kind: 'train', x: 0, y: -1e5, z: 0, vx: 0, vy: 0, vz: 0, gain: this.trains[i].kind ? 1.0 : 0.8 });
    for (let i = 0; i < 2; i++) this.audio.push({ kind: 'cable', x: 0, y: -1e5, z: 0, vx: 0, vy: 0, vz: 0, gain: 0.6 });
    world.audioSources.push(...this.audio);
    world.shared.transit = { tracks: this.tracks.map((T) => ({ name: T.name, kind: T.kind, x: T.x, y: T.y, z: T.z, step: STEP, stations: T.stations.map((s) => ({ name: s.name, s: s.s })) })) };
    this._u = { u: 0, v: 0 }; this._m = { s: 0, side: 1 }; this._p = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
    this._a = new Float64Array(6); this._b = new Float64Array(6);
  }

  // Track-space position for loop coordinate u (applies the lateral track offset). Writes [x,y,z] into out.
  _trackPos(T, u, out) {
    const m = T.mapU(u, this._m);
    const p = T.sample(m.s, this._p);
    const o = T.cfg.track * m.side;
    out[0] = p.x - p.tz * o; out[1] = p.y; out[2] = p.z + p.tx * o;
  }

  _writeCar(i, T, uc, halfL, prev) {
    const a = this._a, b = this._b, D = this.carData;
    this._trackPos(T, uc + halfL * 0.7, a);
    this._trackPos(T, uc - halfL * 0.7, b);
    let fx = a[0] - b[0], fy = a[1] - b[1], fz = a[2] - b[2];
    const l = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
    const o = i * 16 + (prev ? 8 : 0);
    D[o] = (a[0] + b[0]) / 2; D[o + 1] = (a[1] + b[1]) / 2; D[o + 2] = (a[2] + b[2]) / 2;
    D[o + 4] = fx / l; D[o + 5] = fy / l; D[o + 6] = fz / l;
  }

  update(ctx) {
    const t = ctx.time, dt = ctx.dt, D = this.carData;
    const L = ctx.lights;
    for (let ti = 0; ti < this.trains.length; ti++) {
      const tr = this.trains[ti], T = tr.T, cfg = T.cfg;
      const pitch = cfg.carLen + cfg.carGap, halfL = cfg.carLen / 2;
      for (let pass = 1; pass >= 0; pass--) {
        const u = T.uAt(t - pass * dt + tr.offset, this._u).u;
        for (let c = 0; c < tr.cars; c++) {
          const uc = u + ((tr.cars - 1) / 2 - c) * pitch;
          this._writeCar(tr.base + c, T, uc, halfL, pass === 1);
        }
      }
      const v = this._u.v;
      for (let c = 0; c < tr.cars; c++) {
        const o = (tr.base + c) * 16;
        let flags = (c === 0 ? 1 : 0) | (c === tr.cars - 1 ? 2 : 0);
        if (tr.kind === 1 && (c === 1 || c === tr.cars - 2)) flags |= 4;
        D[o + 3] = flags; D[o + 7] = (ti * 7 + c) * 0.37 % 1; D[o + 11] = tr.kind; D[o + 15] = halfL;
      }
      // headlight spill + audio from the head car
      const h = tr.base * 16;
      const fx = D[h + 4], fy = D[h + 5], fz = D[h + 6];
      L.set(this.lightBase + ti, D[h] + fx * (halfL + 4), D[h + 1] + 1.2, D[h + 2] + fz * (halfL + 4), 24, 30, 27, 22, 0);
      const mid = (tr.base + (tr.cars >> 1)) * 16;
      const A = this.audio[ti];
      A.x = D[mid]; A.y = D[mid + 1] + 2; A.z = D[mid + 2];
      A.vx = fx * v; A.vy = fy * v; A.vz = fz * v;
    }
    // cable cabins
    const cw = this.cable;
    for (let pass = 1; pass >= 0; pass--) {
      const tau = (((t - pass * dt + this.cabOffset) % this.cabCycle) + this.cabCycle) % this.cabCycle;
      const u = this._cabU(tau);
      for (let k = 0; k < 2; k++) {
        const uu = k === 0 ? u : 1 - u;
        const off = cw.offsets[k];
        const dTot = this.cableLen + 2 * (this.cableExt - 3);
        const dd = -(this.cableExt - 3) + uu * dTot;
        let x, y, z;
        if (dd < 0) { x = cw.a.x + cw.ex[0] * dd + cw.ez[0] * off; z = cw.a.z + cw.ex[1] * dd + cw.ez[1] * off; y = cw.a.y; }
        else if (dd > this.cableLen) { const e = dd - this.cableLen; x = cw.b.x + cw.ex[0] * e + cw.ez[0] * off; z = cw.b.z + cw.ex[1] * e + cw.ez[1] * off; y = cw.b.y; }
        else { const p = cablePoint(cw, dd / this.cableLen, off); x = p[0]; y = p[1]; z = p[2]; }
        const i = this.cabinBase + k, o = i * 16 + (pass ? 8 : 0);
        // slight pitch along the cable slope
        const slope = dd > 0 && dd < this.cableLen ? ((cw.b.y - cw.a.y) / this.cableLen - cw.sag * 4 * (1 - 2 * dd / this.cableLen) / this.cableLen) * 0.15 : 0;
        const fl = Math.hypot(1, slope);
        D[o] = x; D[o + 1] = y; D[o + 2] = z;
        D[o + 4] = cw.ex[0] / fl; D[o + 5] = 0; D[o + 6] = cw.ex[1] / fl;
        if (!pass) {
          D[o + 3] = 0; D[o + 7] = 0.3 + k * 0.4; D[o + 11] = 2; D[o + 15] = 3.2;
          L.set(this.lightBase + this.trains.length + k, x, y - 4.9, z, 14, 26, 18, 10, 0);
          const A = this.audio[this.trains.length + k];
          const inv = dt > 0 ? 1 / dt : 0;
          A.vx = (x - D[i * 16 + 8]) * inv; A.vy = (y - D[i * 16 + 9]) * inv; A.vz = (z - D[i * 16 + 10]) * inv;
          A.x = x; A.y = y - 3; A.z = z;
        }
      }
    }
    ctx.device.queue.writeBuffer(this.carBuf, 0, D);
  }

  // cabin 0 position along its path (0 = station A, 1 = station B) with eased travel and dwells
  _cabU(tau) {
    const dw = this.cabDwell, tt = this.cabTravel;
    const ease = (x) => x * x * (3 - 2 * x) * 0.35 + x * 0.65;
    if (tau < dw) return 0;
    if (tau < dw + tt) return ease((tau - dw) / tt);
    if (tau < 2 * dw + tt) return 1;
    return 1 - ease((tau - 2 * dw - tt) / tt);
  }

  gbuffer(ctx, pass) {
    pass.setPipeline(this.staticPipe);
    pass.setVertexBuffer(0, this.staticGeo.vb);
    pass.setIndexBuffer(this.staticGeo.ib, 'uint32');
    pass.drawIndexed(this.staticGeo.count);
    pass.setPipeline(this.trainPipe);
    pass.setBindGroup(1, this.group);
    for (let k = 0; k < this.tracks.length; k++) {
      const T = this.tracks[k];
      const m = T.kind === 'metro' ? this.meshes.metro : this.meshes.mono;
      pass.setVertexBuffer(0, m.vb);
      pass.setIndexBuffer(m.ib, 'uint32');
      pass.drawIndexed(m.count, T.instRange[1] - T.instRange[0], 0, 0, T.instRange[0]);
    }
    pass.setVertexBuffer(0, this.meshes.cabin.vb);
    pass.setIndexBuffer(this.meshes.cabin.ib, 'uint32');
    pass.drawIndexed(this.meshes.cabin.count, 2, 0, 0, this.cabinBase);
  }
}
