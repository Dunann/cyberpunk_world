// Road traffic: tens of thousands of cars moving along the district street grids and over the bridges.
// A compute pass evaluates every car analytically (position on its road run, terrain height, pitch), culls it, and
// appends visible cars to two lists (counts checked in the vertex shaders): near cars get a low-poly mesh in the G-buffer; every visible car gets
// head/tail light sprites (and wet-road reflection streaks) in the forward pass. From afar the sprites read as
// flowing red and white rivers of light.

import { MeshBuilder, VERTEX_LAYOUT } from './trafficGeom.js';
import { DISTRICTS, BRIDGES, LANDMARKS, MONORAIL_STATION } from './world.js';
import { rng } from './math.js';

const CAR_STATE_WGSL = /* wgsl */ `
struct Run { a: vec4f, b: vec4f, c: vec4f };  // a: ax, az, dx, dz   b: len, laneW, lanesPerDir, mode   c: yA, yB, deck, ramp
struct CarIn { a: vec4f, b: vec4f };            // a: run, laneCode (+-(lane+1)), s0, speed   b: type, color, seed, 0
struct CarOut { p: vec4f, f: vec4f, pp: vec4f, pf: vec4f }; // p.w seed, f.w type, pp.w color, pf.w fade
struct State { p: vec3f, f: vec3f, fade: f32 };

fn runHeight(R: Run, xz: vec2f, along: f32) -> f32 {
  let g = terrainHeight(xz);
  if (R.b.w < 0.5) { return g; }
  let L = R.b.x; let ramp = R.c.w;
  var y = R.c.z;
  if (along < ramp) { y = mix(R.c.x, R.c.z, smoothstep(0.0, 1.0, along / ramp)); }
  if (along > L - ramp) { y = mix(R.c.y, R.c.z, smoothstep(0.0, 1.0, (L - along) / ramp)); }
  return max(y, g);
}

fn carState(ci: CarIn, R: Run, t: f32) -> State {
  var st: State;
  let L = R.b.x;
  let lc = ci.a.y;
  let dir = sign(lc);
  let lane = abs(lc) - 1.0;
  let s = fract((ci.a.z + ci.a.w * t) / L) * L;
  let along = select(L - s, s, dir > 0.0);
  let d = R.a.zw;
  let right = vec2f(-d.y, d.x);
  let off = dir * R.b.y * (lane + 0.5);
  let xz = R.a.xy + d * along + right * off;
  let fd = d * dir;
  // rest on the road plane through the wheel contact points: front and rear axles (+-1.4 m) on both sides
  let side = right * 0.75;
  let y1 = max(runHeight(R, xz + fd * 1.4 + side, along + dir * 1.4), runHeight(R, xz + fd * 1.4 - side, along + dir * 1.4));
  let y0 = max(runHeight(R, xz - fd * 1.4 + side, along - dir * 1.4), runHeight(R, xz - fd * 1.4 - side, along - dir * 1.4));
  let y = max(runHeight(R, xz, along), 0.5 * (y0 + y1));
  st.p = vec3f(xz.x, y, xz.y);
  st.f = normalize(vec3f(fd.x * 2.8, y1 - y0, fd.y * 2.8));
  st.fade = smoothstep(0.0, 10.0, s) * smoothstep(0.0, 10.0, L - s);
  // too steep for a car (a kerb or a stair street crossing the run): shrink it away instead of clipping
  st.fade *= 1.0 - smoothstep(0.32, 0.42, abs(y1 - y0) / 2.8);
  return st;
}
`;

const CAR_CS = /* wgsl */ `
${CAR_STATE_WGSL}
struct Lamp { a: vec4f, b: vec4f, c: vec4f, d: vec4f }; // a: pos, radius   b: color (fog applied), kind (0 sprite, 1 streak)   c: streak dir xz, length, width   d: previous-frame pos (motion vectors)
@group(1) @binding(0) var<storage, read> runs: array<Run>;
@group(1) @binding(1) var<storage, read> carsIn: array<CarIn>;
@group(1) @binding(2) var<storage, read_write> nearOut: array<CarOut>;
@group(1) @binding(3) var<storage, read_write> lamps: array<Lamp>;
@group(1) @binding(4) var<storage, read_write> args: array<atomic<u32>>;
@group(1) @binding(5) var<uniform> P: vec4f; // x car count, y near distance, z light distance, w near capacity

fn fogT(p: vec3f, dist: f32) -> f32 {
  let c = F.viewProj * vec4f(p, 1.0);
  let uv = c.xy / max(c.w, 1e-3) * vec2f(0.5, -0.5) + 0.5;
  return textureSampleLevel(fogTex, sampClamp, vec3f(clamp(uv, vec2f(0.0), vec2f(1.0)), clamp(fogSlice(dist), 0.0, 1.0)), 0.0).a;
}
fn emit(L: Lamp) {
  let k = atomicAdd(&args[6], 1u);
  if (k < arrayLength(&lamps)) { lamps[k] = L; }
}

@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= u32(P.x)) { return; }
  let ci = carsIn[i];
  let R = runs[u32(ci.a.x)];
  let t = time();
  let st = carState(ci, R, t);
  if (st.fade <= 0.001) { return; }
  let toCam = st.p - F.camPos.xyz;
  let dist = length(toCam);
  if (dist > P.z) { return; }
  let c = F.viewProjNJ * vec4f(st.p + vec3f(0.0, 1.0, 0.0), 1.0);
  let r = 8.0;
  if (c.w < -r || abs(c.x) > c.w * 1.05 + r * 1.5 || abs(c.y) > c.w * 1.05 + r * 2.0) { return; }
  let pst = carState(ci, R, t - F.camFwd.w);
  if (dist < P.y) {
    var o: CarOut;
    o.p = vec4f(st.p, ci.b.z);
    o.f = vec4f(st.f, ci.b.x);
    o.pp = vec4f(pst.p, ci.b.y);
    o.pf = vec4f(pst.f, st.fade);
    let k = atomicAdd(&args[1], 1u);
    if (k < u32(P.w)) { nearOut[k] = o; }
  }
  // head / tail light sprites
  let ty = ci.b.x;
  var hl = 2.3; var xs = 1.0; var ys = 1.0;
  if (ty > 2.5) { hl = 5.95; xs = 1.36; ys = 1.25; } else if (ty > 1.5) { hl = 2.4; xs = 1.08; ys = 1.18; }
  let f = st.f;
  let l = normalize(cross(vec3f(0.0, 1.0, 0.0), f));
  let up = cross(f, l);
  let pfw = pst.f;
  let pl = normalize(cross(vec3f(0.0, 1.0, 0.0), pfw));
  let pup = cross(pfw, pl);
  let pxk = 2.0 * F.camRight.w * F.res.w;
  let wet = F.params.z;
  for (var e = 0; e < 2; e++) {
    let head = e == 0;
    let sg = select(-1.0, 1.0, head);
    // lamp offsets shrink with the car body at the run ends (the mesh is scaled by the same fade)
    let center = st.p + (f * (hl + 0.06) * sg + up * select(0.68, 0.62, head) * ys) * st.fade;
    let pcenter = pst.p + (pfw * (hl + 0.06) * sg + pup * select(0.68, 0.62, head) * ys) * pst.fade;
    let tcv = F.camPos.xyz - center;
    let d = length(tcv);
    let vis = smoothstep(-0.15, 0.5, dot(f, tcv / d) * sg) * st.fade;
    if (vis < 0.01) { continue; }
    let base = select(vec3f(1.0, 0.04, 0.02) * 7.0, vec3f(1.0, 0.86, 0.66) * 16.0, head) * vis * mix(0.35, 1.0, smoothstep(10.0, 60.0, d));
    let fog = fogT(center, d);
    var L: Lamp;
    if (d > 320.0) {
      let rr = max(0.32, 1.15 * d * pxk);
      L.a = vec4f(center, rr);
      L.d = vec4f(pcenter, 0.0);
      L.b = vec4f(base * pow(0.32 / rr, 1.5) * fog, 0.0);
      emit(L);
    } else {
      let rr = max(0.16, 1.15 * d * pxk);
      L.b = vec4f(base * pow(0.16 / rr, 1.5) * fog, 0.0);
      let off = l * select(0.62, 0.66, head) * xs * st.fade;
      let poff = pl * select(0.62, 0.66, head) * xs * pst.fade;
      L.a = vec4f(center + off, rr); L.d = vec4f(pcenter + poff, 0.0); emit(L);
      L.a = vec4f(center - off, rr); L.d = vec4f(pcenter - poff, 0.0); emit(L);
      if (d < 450.0 && wet > 0.05) {
        // wet-road reflection streak lying on the road toward the camera (strongest at grazing angles)
        let g = st.p + f * (hl - 0.3) * sg;
        var dc = vec2f(F.camPos.x - g.x, F.camPos.z - g.z);
        let dl = max(length(dc), 0.01);
        dc /= dl;
        let graze = pow(1.0 - saturate(abs(normalize(F.camPos.xyz - g).y)), 3.0);
        var S: Lamp;
        S.a = vec4f(g.x, g.y + 0.04, g.z, 0.0);
        S.b = vec4f(base * 0.12 * wet * graze * fog, 1.0);
        S.c = vec4f(dc, clamp(dl * 0.08, 2.0, 14.0), 0.7 * xs);
        S.d = vec4f(pst.p + pfw * (hl - 0.3) * sg + vec3f(0.0, 0.04, 0.0), 0.0);
        if (graze > 0.02) { emit(S); }
      }
    }
  }
}

@compute @workgroup_size(1)
fn clampArgs() {
  let n = atomicLoad(&args[1]);
  atomicStore(&args[1], min(n, u32(P.w)));
  let m = atomicLoad(&args[6]);
  atomicStore(&args[6], min(m, arrayLength(&lamps)));
}
`;
const CAR_MESH_WGSL = /* wgsl */ `
struct CarOut { p: vec4f, f: vec4f, pp: vec4f, pf: vec4f };
@group(1) @binding(0) var<storage, read> cars: array<CarOut>;
@group(1) @binding(1) var<storage, read> counts: array<u32>;
struct VIn { @location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) uv: vec2f, @location(3) me: vec2f };
struct VOut {
  @builtin(position) cp: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) pwp: vec3f,
  @location(3) lp: vec3f,
  @location(4) @interpolate(flat) info: vec4f, // mat, type, color, seed
};
fn shape(p: vec3f, mat: f32, ty: f32) -> vec3f {
  var q = p;
  if (ty > 2.5) {
    // bus: stretch to 12 m and lift the glass house to full width
    q = vec3f(p.x * 1.36, p.y * 1.25, p.z * 2.6);
    if (mat == 1.0 || mat == 5.0) { q = vec3f(sign(p.x) * 1.2, 1.12 + (p.y - 0.88) * 3.3, select(-5.7, 5.55, p.z > -0.2)); }
  } else if (ty > 1.5) {
    q = vec3f(p.x * 1.08, p.y * 1.18, p.z * 1.04);
  }
  return q;
}
@vertex fn vs(v: VIn, @builtin(instance_index) ii: u32) -> VOut {
  var o: VOut;
  if (ii >= counts[1]) { o.cp = vec4f(0.0, 0.0, -1.0, 1.0); return o; }
  let C = cars[ii];
  let ty = C.f.w;
  let mat = v.me.x;
  var lp = shape(v.pos, mat, ty);
  if (mat == 5.0 && !(ty > 0.5 && ty < 1.5)) { lp = vec3f(0.0); }
  lp *= C.pf.w; // fade in/out at run ends
  let f = C.f.xyz; let l = normalize(cross(vec3f(0.0, 1.0, 0.0), f)); let u = cross(f, l);
  let pf = C.pf.xyz; let pl = normalize(cross(vec3f(0.0, 1.0, 0.0), pf)); let pu = cross(pf, pl);
  o.wp = C.p.xyz + l * lp.x + u * lp.y + f * lp.z;
  o.pwp = C.pp.xyz + pl * lp.x + pu * lp.y + pf * lp.z;
  o.n = l * v.nrm.x + u * v.nrm.y + f * v.nrm.z;
  o.lp = v.pos;
  o.info = vec4f(mat, ty, C.pp.w, C.p.w);
  o.cp = F.viewProj * vec4f(o.wp, 1.0);
  return o;
}
fn paint(ci: f32) -> vec3f {
  let k = i32(ci);
  if (k == 0) { return vec3f(0.015); }
  if (k == 1) { return vec3f(0.62, 0.63, 0.64); }
  if (k == 2) { return vec3f(0.32, 0.33, 0.35); }
  if (k == 3) { return vec3f(0.02, 0.04, 0.12); }
  if (k == 4) { return vec3f(0.35, 0.02, 0.02); }
  if (k == 5) { return vec3f(0.72, 0.48, 0.03); }
  if (k == 6) { return vec3f(0.07, 0.07, 0.075); }
  if (k == 7) { return vec3f(0.4, 0.33, 0.24); }
  if (k == 8) { return vec3f(0.03, 0.3, 0.3); }
  return vec3f(0.04, 0.16, 0.07);
}
@fragment fn fs(i: VOut) -> GOut {
  let mat = i.info.x; let ty = i.info.y;
  let n = normalize(i.n);
  var albedo = paint(i.info.z);
  var rough = 0.28; var metal = 0.55; var emis = vec3f(0.0); var m = 0.0;
  if (mat == 1.0) {
    // glass house: windows with a thin pillar pattern; buses get lit interiors
    let pillar = abs(n.y) < 0.6 && (fract(i.lp.z * select(1.0, 3.6, ty > 2.5) + 0.1) < select(0.08, 0.18, ty > 2.5) || (ty > 2.5 && i.lp.y < 0.95));
    if (abs(n.y) > 0.8) { albedo = paint(i.info.z); }
    else if (!pillar) {
      albedo = vec3f(0.01); rough = 0.05; metal = 0.0; m = 2.0;
      if (ty > 2.5) { emis = vec3f(1.0, 0.9, 0.75) * 0.35; }
    }
  } else if (mat == 2.0) {
    albedo = vec3f(0.02); rough = 0.8; metal = 0.0;
  } else if (mat == 3.0) {
    albedo = vec3f(1.0); emis = vec3f(1.0, 0.9, 0.75) * 10.0; metal = 0.0;
  } else if (mat == 4.0) {
    albedo = vec3f(0.5, 0.0, 0.0); emis = vec3f(1.0, 0.03, 0.02) * 6.0; metal = 0.0;
  } else if (mat == 5.0) {
    albedo = vec3f(0.8); emis = vec3f(1.0, 0.8, 0.3) * 4.0;
  }
  if (ty > 2.5 && mat == 0.0) {
    // bus livery stripe
    if (i.lp.y > 0.62 && i.lp.y < 0.72) { albedo = vec3f(0.6, 0.05, 0.1); }
  }
  return gbuf(albedo, rough, n, metal, emis, 1.0, motionVector(i.wp, i.pwp), m, 0.9);
}
`;

const CAR_LIGHT_WGSL = /* wgsl */ `
struct Lamp { a: vec4f, b: vec4f, c: vec4f, d: vec4f };
@group(2) @binding(0) var<storage, read> lamps: array<Lamp>;
@group(2) @binding(1) var<storage, read> counts: array<u32>;
struct VOut {
  @builtin(position) cp: vec4f,
  @location(0) q: vec2f,
  @location(1) @interpolate(flat) col: vec4f,
  @location(2) mv: vec2f,
};
struct FOut { @location(0) color: vec4f, @location(1) motion: vec4f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var o: VOut;
  if (ii >= counts[6]) { o.cp = vec4f(0.0, 0.0, -1.0, 1.0); return o; }
  let L = lamps[ii];
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = corners[vi];
  var pos: vec3f;
  if (L.b.w < 0.5) {
    let tc = normalize(F.camPos.xyz - L.a.xyz);
    pos = L.a.xyz + tc * 0.35 + (F.camRight.xyz * c.x + F.camUp.xyz * c.y) * L.a.w * 1.6;
    o.q = c * 1.6;
  } else {
    let dc = L.c.xy;
    let perp = vec2f(-dc.y, dc.x);
    let u = c.y * 0.5 + 0.5;
    let p2 = L.a.xz + dc * u * L.c.z + perp * c.x * L.c.w;
    pos = vec3f(p2.x, L.a.y, p2.y);
    o.q = vec2f(c.x, u);
  }
  o.cp = F.viewProj * vec4f(pos, 1.0);
  // the glow moves with its car: motion vector from the car's previous-frame lamp position, so TAA reprojects the
  // history of these pixels with the car instead of with the road behind it
  o.mv = motionVector(pos, pos + L.d.xyz - L.a.xyz);
  o.col = L.b;
  return o;
}
@fragment fn fs(i: VOut) -> FOut {
  var a: f32;
  if (i.col.w < 0.5) { a = exp(-dot(i.q, i.q) * 1.6); }
  else { a = exp(-i.q.y * 2.5) * (1.0 - i.q.x * i.q.x) * smoothstep(0.0, 0.1, i.q.y); }
  // only the visible part of the sprite takes over the motion vector (quad corners keep the road's)
  if (a < 0.04) { discard; }
  var o: FOut;
  o.color = vec4f(i.col.rgb * a, 0.0);
  o.motion = vec4f(i.mv, 0.0, 0.0);
  return o;
}
`;
// ---------------------------------------------------------------- road network

export function buildRuns(world) {
  const runs = [];
  // A street is blocked where a building footprint (collider reaching down to the ground) covers it. Landmark site
  // circles are far larger than their towers and contain painted streets, so test the real footprints.
  const mk = world.poses && world.poses[5] && world.poses[5].resolved;
  const market = mk ? { x: mk.x, z: mk.z, ux: world.poses[5].target[0] - mk.x, uz: world.poses[5].target[2] - mk.z } : null;
  if (market) { const l = Math.hypot(market.ux, market.uz); market.ux /= l; market.uz /= l; }
  const blockedAt = (x, z) => {
    if (market) {
      // the night market lane (pose 6) is pedestrian only
      const rx = x - market.x, rz = z - market.z;
      const along = rx * market.ux + rz * market.uz, across = -rx * market.uz + rz * market.ux;
      if (along > -25 && along < 192 && Math.abs(across) < 16) return true;
    }
    const cs = world.collidersNear ? world.collidersNear(x, z) : null;
    if (cs) {
      const g = world.heightAt(x, z);
      for (const k of cs) {
        const dx = x - k.cx, dz = z - k.cz;
        const lx = dx * k.cos + dz * k.sin, lz = -dx * k.sin + dz * k.cos;
        if (Math.abs(lx) < k.hx + 1.5 && Math.abs(lz) < k.hz + 1.5 && k.cy - k.hy < g + 4) return true;
      }
    } else {
      for (const L of LANDMARKS) if (L.r > 0 && Math.hypot(x - L.x, z - L.z) < L.r + 4) return true;
    }
    if (Math.hypot(x - MONORAIL_STATION.x, z - MONORAIL_STATION.z) < 40) return true;
    const lt = world.shared.lizibaTower;
    if (lt && Math.hypot(x - lt.x, z - lt.z) < 34) return true;
    return false;
  };
  DISTRICTS.forEach((D, di) => {
    if (!D.block) return;
    const ca = Math.cos(D.angle), sa = Math.sin(D.angle);
    const toW = (lx, lz) => [D.cx + lx * ca - lz * sa, D.cz + lx * sa + lz * ca];
    const nI = Math.ceil(Math.max(D.rx, D.rz) / D.block) + 1;
    const blockOk = (bi, bj) => {
      const [x, z] = toW((bi + 0.5) * D.block, (bj + 0.5) * D.block);
      const dom = world.districtAt(x, z);
      // the terrain paints city streets from a district weight of about 0.3 (see terrainShade.js), so run cars there too
      return dom.index === di && dom.weight >= 0.3;
    };
    for (let axis = 0; axis < 2; axis++) {
      for (let i = -nI; i <= nI; i++) {
        let start = null, prevEnd = null;
        const flush = () => {
          if (start && prevEnd) {
            const L = Math.hypot(prevEnd[0] - start[0], prevEnd[1] - start[1]);
            if (L > D.block * 0.9) runs.push({ ax: start[0], az: start[1], dx: (prevEnd[0] - start[0]) / L, dz: (prevEnd[1] - start[1]) / L, len: L, laneW: D.road >= 16 ? D.road * 0.2 : D.road * 0.26, lanes: D.road >= 16 ? 2 : 1, mode: 0, type: D.type, district: di });
          }
          start = null; prevEnd = null;
        };
        for (let k = -nI; k < nI; k++) {
          // segment from k*block to (k+1)*block along the grid line at i*block
          const a = axis === 0 ? toW(i * D.block, k * D.block) : toW(k * D.block, i * D.block);
          const b = axis === 0 ? toW(i * D.block, (k + 1) * D.block) : toW((k + 1) * D.block, i * D.block);
          const adj = axis === 0 ? blockOk(i - 1, k) || blockOk(i, k) : blockOk(k, i - 1) || blockOk(k, i);
          let ok = adj;
          if (ok) {
            let hPrev = null;
            for (let s = 0; s <= 4 && ok; s++) {
              const x = a[0] + (b[0] - a[0]) * s / 4, z = a[1] + (b[1] - a[1]) * s / 4;
              const h = world.heightAt(x, z);
              if (h < 2.0 || world.waterDist(x, z) < 6 || blockedAt(x, z)) ok = false;
              // the terrain paints the streets of the dominant district only: stay on that grid
              if (world.districtAt(x, z).index !== di) ok = false;
              // cars pitch with the terrain, but very steep stretches are left to pedestrians
              if (hPrev !== null && Math.abs(h - hPrev) / (D.block / 4) > 0.4) ok = false;
              hPrev = h;
            }
          }
          if (ok) { if (!start) start = a; prevEnd = b; } else flush();
        }
        flush();
      }
    }
  });
  // bridges (deck profile with ramps); use the bridges module's deck data when present
  const decks = world.shared.bridgeDecks;
  BRIDGES.forEach((B, bi) => {
    let ax = B.ax, az = B.az, bx = B.bx, bz = B.bz, deck = B.deck;
    const dk = decks && decks[bi];
    if (dk) {
      if (dk.ax !== undefined) { ax = dk.ax; az = dk.az; bx = dk.bx; bz = dk.bz; }
      if (dk.deck !== undefined) deck = dk.deck;
      else if (dk.y !== undefined) deck = dk.y;
    }
    const L = Math.hypot(bx - ax, bz - az);
    const yA = Math.max(world.heightAt(ax, az), 0), yB = Math.max(world.heightAt(bx, bz), 0);
    runs.push({ ax, az, dx: (bx - ax) / L, dz: (bz - az) / L, len: L, laneW: B.width * 0.17, lanes: 2, mode: 1, yA, yB, deck: deck + 0.15, ramp: Math.min(120, L * 0.2), type: 0, bridge: true });
  });
  return runs;
}

// Roads of the land-use plan (plan.js): the owner grid's street segments around built infill cells that the
// district pass above does not already cover, and the bridge approach avenues. Appended after all other runs.
export function buildInfillRuns(world) {
  const plan = world.plan;
  const runs = [];
  if (!plan) return runs;
  const byDistrict = new Map();
  for (const c of plan.cells) { if (!byDistrict.has(c.di)) byDistrict.set(c.di, new Set()); byDistrict.get(c.di).add(`${c.i},${c.j}`); }
  for (const [di, cells] of byDistrict) {
    const D = DISTRICTS[di];
    const ca = Math.cos(D.angle), sa = Math.sin(D.angle);
    const toW = (lx, lz) => [D.cx + lx * ca - lz * sa, D.cz + lx * sa + lz * ca];
    const built = (i, j) => cells.has(`${i},${j}`);
    const blockOk = (bi, bj) => { const [x, z] = toW((bi + 0.5) * D.block, (bj + 0.5) * D.block); const dom = world.districtAt(x, z); return dom.index === di && dom.weight >= 0.3; };
    let i0 = 1e9, i1 = -1e9, j0 = 1e9, j1 = -1e9;
    for (const c of plan.cells) if (c.di === di) { i0 = Math.min(i0, c.i); i1 = Math.max(i1, c.i); j0 = Math.min(j0, c.j); j1 = Math.max(j1, c.j); }
    for (let axis = 0; axis < 2; axis++) {
      const lo = axis === 0 ? i0 : j0, hi = axis === 0 ? i1 + 1 : j1 + 1;      // grid lines
      const ka = axis === 0 ? j0 : i0, kb = axis === 0 ? j1 : i1;              // segments along a line
      for (let line = lo; line <= hi; line++) {
        let start = null, prevEnd = null;
        const flush = () => {
          if (start && prevEnd) {
            const L = Math.hypot(prevEnd[0] - start[0], prevEnd[1] - start[1]);
            if (L > D.block * 0.9) runs.push({ ax: start[0], az: start[1], dx: (prevEnd[0] - start[0]) / L, dz: (prevEnd[1] - start[1]) / L, len: L, laneW: D.road >= 16 ? D.road * 0.2 : D.road * 0.26, lanes: D.road >= 16 ? 2 : 1, mode: 0, type: D.type, district: di, infill: true });
          }
          start = null; prevEnd = null;
        };
        for (let k = ka; k <= kb; k++) {
          const a = axis === 0 ? toW(line * D.block, k * D.block) : toW(k * D.block, line * D.block);
          const b = axis === 0 ? toW(line * D.block, (k + 1) * D.block) : toW((k + 1) * D.block, line * D.block);
          const side = axis === 0 ? [[line - 1, k], [line, k]] : [[k, line - 1], [k, line]];
          let ok = built(...side[0]) || built(...side[1]);
          // the district pass already runs cars here when one side is its own block and the street is its own
          const existing = (blockOk(...side[0]) || blockOk(...side[1])) && [0, 0.5, 1].every((t) => world.districtAt(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t).index === di);
          if (existing) ok = false;
          let hPrev = null;
          for (let s = 0; s <= 4 && ok; s++) {
            const x = a[0] + (b[0] - a[0]) * s / 4, z = a[1] + (b[1] - a[1]) * s / 4;
            const h = world.heightAt(x, z);
            if (h < 2.0 || world.waterDist(x, z) < 6 || plan.coverAt(x, z).built < 0.5) ok = false;
            if (hPrev !== null && Math.abs(h - hPrev) / (D.block / 4) > 0.4) ok = false;
            hPrev = h;
          }
          if (ok) { if (!start) start = a; prevEnd = b; } else flush();
        }
        flush();
      }
    }
  }
  for (const v of plan.avenues) {
    const L = Math.hypot(v.bx - v.ax, v.bz - v.az);
    if (L > 30) runs.push({ ax: v.ax, az: v.az, dx: (v.bx - v.ax) / L, dz: (v.bz - v.az) / L, len: L, laneW: 2.8, lanes: 2, mode: 0, type: 6, district: v.di, infill: true });
  }
  // check: no run crosses a lot footprint (existing or infill); counted points every 2 m inside a lot
  let hits = 0;
  for (const r of runs) hits += plan.lotHits(r.ax, r.az, r.ax + r.dx * r.len, r.az + r.dz * r.len, 0.01);
  world.shared.planRunLotHits = hits;
  if (hits && typeof __DEV__ !== 'undefined' && __DEV__) console.error(`I-016: ${hits} traffic-run points of the plan lie inside lot footprints`);
  return runs;
}

function carMesh() {
  const mb = new MeshBuilder();
  const extrudeX = (prof, x0, x1, mat) => {
    const n = prof.length;
    for (let e = 0; e < n; e++) {
      const A = prof[e], B = prof[(e + 1) % n];
      const dz = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dz, dy) || 1;
      const nn = [0, -dz / l, dy / l];
      mb.quad([x0, A[1], A[0]], [x1, A[1], A[0]], [x1, B[1], B[0]], [x0, B[1], B[0]], nn, [[0, 0], [1, 0], [1, 1], [0, 1]], mat);
    }
    let cz = 0, cy = 0;
    for (const p of prof) { cz += p[0]; cy += p[1]; }
    cz /= n; cy /= n;
    for (const [x, s] of [[x0, -1], [x1, 1]]) for (let e = 0; e < n; e++) {
      const A = prof[e], B = prof[(e + 1) % n];
      mb.tri([x, cy, cz], [x, A[1], A[0]], [x, B[1], B[0]], [s, 0, 0], [[0, 0], [1, 0], [0, 1]], mat);
    }
  };
  // CCW in (z, y)
  extrudeX([[-2.25, 0.3], [2.25, 0.3], [2.28, 0.62], [2.1, 0.82], [1.0, 0.9], [-1.9, 0.92], [-2.25, 0.8]], -0.9, 0.9, 0);
  extrudeX([[-1.35, 0.88], [1.05, 0.88], [0.4, 1.36], [-1.05, 1.38]], -0.78, 0.78, 1);
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
  for (const x of [-0.8, 0.8]) for (const z of [-1.42, 1.42]) mb.box([x, 0.32, z], X, Y, Z, 0.13, 0.32, 0.32, 2);
  for (const x of [-0.66, 0.66]) mb.box([x, 0.62, 2.285], X, Y, Z, 0.16, 0.07, 0.02, 3);
  for (const x of [-0.62, 0.62]) mb.box([x, 0.68, -2.255], X, Y, Z, 0.2, 0.055, 0.02, 4);
  mb.box([0, 0.68, -2.255], X, Y, Z, 0.42, 0.022, 0.02, 4);
  mb.box([0, 1.47, -0.25], X, Y, Z, 0.26, 0.09, 0.13, 5);
  return mb;
}

export class Cars {
  init(ctx) {
    const d = ctx.device, world = ctx.world, R = ctx.renderer;
    const q = ctx.quality.level;
    const runs = buildRuns(world);
    const rnd = rng(31337);
    const cars = [];
    const density = [0.45, 0.7, 1.0][q];
    const addCars = (r, ri, rnd) => {
      const busy = r.bridge ? 1.6 : r.type === 1 || r.type === 3 ? 1.3 : r.type === 4 ? 0.6 : 1.0;
      for (const dir of [1, -1]) for (let lane = 0; lane < r.lanes; lane++) {
        const v = (r.bridge ? 15 : 9) + rnd() * 5 + lane * 2.5;
        let s = rnd() * 20;
        while (s < r.len - 4) {
          const ty = rnd() < (r.type === 2 ? 0 : 0.04) ? 3 : rnd() < 0.18 ? 1 : rnd() < 0.2 ? 2 : 0;
          const color = ty === 1 ? (rnd() < 0.8 ? 5 : 8) : (rnd() * 10) | 0;
          cars.push(ri, dir * (lane + 1), s, v, ty, ty === 1 ? color : color === 5 ? 1 : color, rnd(), 0);
          // platoons: short gaps, occasionally a long gap
          const gap = (ty === 3 ? 16 : 8) + (rnd() < 0.25 ? 20 + rnd() * 60 : rnd() * 14);
          s += gap / (density * busy);
        }
      }
    };
    runs.forEach((r, ri) => addCars(r, ri, rnd));
    // land-use plan infill roads (I-016): appended after every other run, cars from their own stream
    const extra = buildInfillRuns(world);
    const rnd2 = rng(31338);
    extra.forEach((r, k) => addCars(r, runs.length + k, rnd2));
    for (const r of extra) runs.push(r);
    world.shared.infillRoadRuns = extra.length;
    this.count = cars.length / 8;
    if (typeof __DEV__ !== 'undefined' && __DEV__) (world.shared.devData ||= {}).cars = cars;   // identity checks
    const runData = new Float32Array(runs.length * 12);
    runs.forEach((r, i) => runData.set([r.ax, r.az, r.dx, r.dz, r.len, r.laneW, r.lanes, r.mode, r.yA || 0, r.yB || 0, r.deck || 0, r.ramp || 1], i * 12));
    const mk = (size, usage, label) => d.createBuffer({ label, size, usage });
    this.runBuf = mk(runData.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'car-runs');
    d.queue.writeBuffer(this.runBuf, 0, runData);
    this.carBuf = mk(cars.length * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'cars-in');
    d.queue.writeBuffer(this.carBuf, 0, new Float32Array(cars));
    this.nearCap = 2600;
    this.nearBuf = mk(this.nearCap * 64, GPUBufferUsage.STORAGE, 'cars-near');
    this.lampCap = Math.max(1024, Math.min(this.count * 3, 36000));
    this.lightBuf = mk(this.lampCap * 64, GPUBufferUsage.STORAGE, 'car-lamps');
    this.mesh = carMesh().upload(d, 'car');
    this.argsInit = new Uint32Array([this.mesh.count, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0]);
    this.argsBuf = mk(48, GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, 'car-args');
    this.params = new Float32Array([this.count, [260, 380, 520][q], [1800, 2600, 3600][q], this.nearCap]);
    this.paramBuf = mk(16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'car-params');
    d.queue.writeBuffer(this.paramBuf, 0, this.params);

    const C = GPUShaderStage.COMPUTE;
    this.csLayout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: C, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: C, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: C, buffer: { type: 'storage' } },
      { binding: 3, visibility: C, buffer: { type: 'storage' } },
      { binding: 4, visibility: C, buffer: { type: 'storage' } },
      { binding: 5, visibility: C, buffer: { type: 'uniform' } },
    ] });
    this.csGroup = d.createBindGroup({ layout: this.csLayout, entries: [this.runBuf, this.carBuf, this.nearBuf, this.lightBuf, this.argsBuf, this.paramBuf].map((b, i) => ({ binding: i, resource: { buffer: b } })) });
    this.csPipe = R.computePipeline({ label: 'cars-cs', code: CAR_CS, groups: [this.csLayout] });
    this.clampPipe = R.computePipeline({ label: 'cars-clamp', code: CAR_CS, entry: 'clampArgs', groups: [this.csLayout] });
    // Direct draws with a GPU-side count check: drawIndirect in the forward pass proved expensive (indirect validation).
    this.vLayout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }] });
    this.nearGroup = d.createBindGroup({ layout: this.vLayout, entries: [{ binding: 0, resource: { buffer: this.nearBuf } }, { binding: 1, resource: { buffer: this.argsBuf } }] });
    this.lightGroup = d.createBindGroup({ layout: this.vLayout, entries: [{ binding: 0, resource: { buffer: this.lightBuf } }, { binding: 1, resource: { buffer: this.argsBuf } }] });
    this.nearDraw = [1200, 1800, 2600][q];
    this.lampDraw = Math.min(this.lampCap, [16000, 24000, 36000][q]);
    this.meshPipe = R.gbufferPipeline({ label: 'cars', code: CAR_MESH_WGSL, buffers: [VERTEX_LAYOUT], groups: [this.vLayout] });
    this.lightPipe = R.forwardPipeline({ label: 'car-lights', code: CAR_LIGHT_WGSL, groups: [this.vLayout], blend: 'add', writeMotion: true });
    this.computeDesc = { timestampWrites: undefined };
    this.wg = Math.ceil(this.count / 128);
    world.shared.roadRuns = runs.length;
    this.runs = runs;
    world.shared.carCount = this.count;
  }

  compute(ctx, enc) {
    ctx.device.queue.writeBuffer(this.argsBuf, 0, this.argsInit);
    this.computeDesc.timestampWrites = ctx.prof.ts('traffic-cs');
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
    pass.setBindGroup(1, this.nearGroup);
    pass.setVertexBuffer(0, this.mesh.vb);
    pass.setIndexBuffer(this.mesh.ib, 'uint32');
    pass.drawIndexedIndirect(this.argsBuf, 0);
  }

  forward(ctx, pass) {
    pass.setPipeline(this.lightPipe);
    pass.setBindGroup(2, this.lightGroup);
    pass.draw(6, this.lampDraw);
  }
}
