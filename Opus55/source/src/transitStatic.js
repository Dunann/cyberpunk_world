// Static transit geometry: monorail guideway on T pillars, metro box-girder viaduct with stations and piers,
// tunnel portals, terminal sheds, the Liziba-style residential tower the monorail passes through, and the cableway
// stations + cables. Everything is merged into one world-space mesh drawn with TRANSIT_STATIC_WGSL.

import { MeshBuilder } from './trafficGeom.js';
import { STEP } from './transitLayout.js';
import { CABLEWAY } from './world.js';
import { rng } from './math.js';

// material ids (see TRANSIT_STATIC_WGSL)
export const M = {
  CONCRETE: 0, METAL: 1, RESID: 2, STATIONFACADE: 3, CEILING: 4, PLATFORM: 5, LED: 6, PORTAL: 7, TRACKBED: 8, RAIL: 9,
  CABLETOWER: 10, CABLE: 11, INWALL: 12, GLASS: 13, ROOF: 14, SLAB: 15, ACUNIT: 16, BLACK: 17, SHED: 18, YELLOW: 19,
};

export const TRANSIT_STATIC_WGSL = /* wgsl */ `
struct VIn { @location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) uv: vec2f, @location(3) me: vec2f };
struct VOut {
  @builtin(position) cp: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) uv: vec2f,
  @location(3) @interpolate(flat) me: vec2f,
};
@vertex fn vs(v: VIn) -> VOut {
  var o: VOut;
  o.wp = v.pos; o.n = v.nrm; o.uv = v.uv; o.me = v.me;
  o.cp = F.viewProj * vec4f(v.pos, 1.0);
  return o;
}

fn ledColor(k: f32) -> vec3f {
  if (k < 0.5) { return vec3f(0.1, 0.85, 1.0); }
  if (k < 1.5) { return vec3f(1.0, 0.12, 0.55); }
  if (k < 2.5) { return vec3f(1.0, 0.55, 0.12); }
  return vec3f(0.6, 0.3, 1.0);
}

// Residential facade: floors 3 m, bays 3.4 m. Returns albedo/rough via out params packed in a struct.
struct Surf { albedo: vec3f, rough: f32, emis: vec3f, metal: f32, mat: f32, wet: f32 };

fn residential(uv: vec2f, n: vec3f, seed: f32, dist: f32) -> Surf {
  var s: Surf;
  let fl = floor(uv.y / 3.0);
  let fy = fract(uv.y / 3.0) * 3.0;
  let bay = floor(uv.x / 3.4);
  let fx = fract(uv.x / 3.4) * 3.4;
  let faceId = floor(n.x * 2.0 + 3.0) * 7.0 + floor(n.z * 2.0 + 3.0) * 13.0;
  let h = hash21(vec2f(bay + faceId * 31.0 + seed, fl));
  let h2 = hash21(vec2f(bay * 1.7 + 5.0 + seed, fl * 3.1 + faceId));
  let grime = vnoise2(vec2f(uv.x * 0.15, uv.y * 0.04));
  var albedo = mix(vec3f(0.36, 0.34, 0.31), vec3f(0.22, 0.21, 0.2), grime) * (0.85 + 0.3 * hash21(vec2f(bay, 99.0 + seed)) * 0.4);
  var rough = 0.8;
  var emis = vec3f(0.0);
  var mat = 0.0;
  // slab band
  if (fy < 0.32) { albedo = vec3f(0.42, 0.41, 0.4) * (0.8 + grime * 0.3); }
  let inWin = fx > 0.45 && fx < 2.95 && fy > 0.95 && fy < 2.65;
  if (inWin) {
    let frame = min(min(fx - 0.45, 2.95 - fx), min(fy - 0.95, 2.65 - fy));
    let mull = abs(fx - 1.7) < 0.04;
    if (frame < 0.06 || mull) {
      albedo = vec3f(0.08, 0.085, 0.09); rough = 0.4;
    } else {
      albedo = vec3f(0.02, 0.025, 0.03); rough = 0.08; mat = 2.0;
      let lit = h < 0.48;
      if (lit) {
        var c = mix(vec3f(1.0, 0.62, 0.32), vec3f(1.0, 0.82, 0.55), h2);
        if (h2 > 0.82) { c = vec3f(0.55, 0.75, 1.0); }
        if (h2 > 0.95) { c = vec3f(1.0, 0.35, 0.55); }
        // curtains / interior depth: darker toward the frame and lower part
        let u = (fx - 0.45) / 2.5; let v = (fy - 0.95) / 1.7;
        let curtain = select(1.0, 0.45, (u < 0.22 || u > 0.78) && h2 > 0.4);
        let depth = 0.55 + 0.45 * smoothstep(0.0, 0.5, v) * (1.0 - abs(u - 0.5));
        // TV flicker
        let tv = select(1.0, 0.75 + 0.25 * sin(time() * 9.0 + h * 60.0) * sin(time() * 3.3 + h2 * 20.0), h2 > 0.88 && h2 < 0.95);
        emis = c * (0.7 + 1.1 * h2) * curtain * depth * tv;
      }
    }
  }
  s.albedo = albedo; s.rough = rough; s.emis = emis; s.metal = 0.0; s.mat = mat; s.wet = 0.5;
  return s;
}

fn concrete(p: vec3f, uv: vec2f) -> vec3f {
  let n1 = vnoise2(uv * vec2f(0.35, 0.5));
  let n2 = vnoise2(uv * vec2f(2.5, 0.2) + 7.0);
  let stain = smoothstep(0.3, 0.9, vnoise2(vec2f(uv.x * 0.3, uv.y * 0.05) + 3.0));
  return vec3f(0.30, 0.295, 0.285) * (0.8 + 0.3 * n1) * (1.0 - 0.25 * stain) * (0.92 + 0.12 * n2);
}

@fragment fn fs(i: VOut) -> GOut {
  let m = i32(i.me.x + 0.5);
  let ex = i.me.y;
  var n = normalize(i.n);
  let uv = i.uv;
  let p = i.wp;
  let dist = length(p - F.camPos.xyz);
  var albedo = vec3f(0.3);
  var rough = 0.8;
  var metal = 0.0;
  var emis = vec3f(0.0);
  var mat = 0.0;
  var wet = 0.7;
  if (m == 0) { // concrete
    albedo = concrete(p, uv);
  } else if (m == 1) { // dark painted metal
    albedo = vec3f(0.07, 0.075, 0.08); rough = 0.45; metal = 0.6;
  } else if (m == 2) {
    let s = residential(uv, n, ex, dist);
    albedo = s.albedo; rough = s.rough; emis = s.emis; mat = s.mat; wet = s.wet;
  } else if (m == 3) { // station glass facade: big lit windows with mullions
    // station glazing: dark reflective glass, glowing ceiling band and soft interior light below
    let fx = fract(uv.x / 2.4) * 2.4;
    let fy = uv.y;
    let mull = fx < 0.1 || fy < 0.9 || fy > 8.2 || abs(fy - 4.1) < 0.06;
    if (mull) { albedo = vec3f(0.1, 0.11, 0.12); rough = 0.35; metal = 0.7; }
    else {
      albedo = vec3f(0.01, 0.012, 0.016); rough = 0.04; mat = 2.0;
      let g = 0.7 + 0.3 * vnoise2(uv * vec2f(0.15, 0.6));
      let ceilBand = smoothstep(6.6, 7.4, fy) * (1.0 - smoothstep(7.6, 8.1, fy));
      let interior = mix(0.35, 0.8, smoothstep(1.0, 6.0, fy));
      emis = vec3f(0.78, 0.9, 1.0) * (interior * g + ceilBand * 2.6);
    }
  } else if (m == 4) { // ceiling with light strips
    albedo = vec3f(0.5, 0.5, 0.52); rough = 0.6;
    let strip = 1.0 - smoothstep(0.08, 0.14, abs(fract(uv.y / 3.0) * 3.0 - 1.5));
    let gap = step(0.15, fract(uv.x / 4.0));
    emis = vec3f(0.85, 0.93, 1.0) * strip * gap * 7.0;
  } else if (m == 5) { // platform floor tiles + yellow safety line
    let t = fract(uv * 0.8);
    let grout = step(0.95, max(t.x, t.y));
    albedo = mix(vec3f(0.32, 0.31, 0.3), vec3f(0.12), grout);
    rough = 0.35;

  } else if (m == 6) { // LED strip
    albedo = vec3f(0.05); rough = 0.3;
    let pulse = 0.75 + 0.25 * sin(uv.x * 0.05 - time() * 2.0);
    emis = ledColor(ex) * 3.5 * pulse;
  } else if (m == 7) { // tunnel portal / shed doors: concrete with dark openings
    albedo = concrete(p, uv) * 0.9;
    let metroW = ex > 500.0;
    let u = uv.x - (ex - select(0.0, 1000.0, metroW)); // ex = half width of the wall (+1000 for metro)
    let tr = select(2.0, 2.2, metroW);
    let open1 = abs(abs(u) - tr) < 1.85 && uv.y > 2.2 && uv.y < 9.6;
    if (open1) { albedo = vec3f(0.0); rough = 1.0; emis = vec3f(0.004, 0.004, 0.006); wet = 0.0; }
    if (uv.y > 10.6 && uv.y < 11.2) { emis = vec3f(1.0, 0.5, 0.1) * 2.0; }
  } else if (m == 8) { // track bed
    albedo = vec3f(0.06, 0.06, 0.065) * (0.8 + 0.4 * vnoise2(uv * 3.0)); rough = 0.9;
  } else if (m == 9) { // rail
    albedo = vec3f(0.5, 0.5, 0.52); rough = 0.25; metal = 1.0;
  } else if (m == 10) { // cableway tower / station: red and white bands
    let band = fract(uv.y / 9.0);
    albedo = select(vec3f(0.55, 0.53, 0.5), vec3f(0.45, 0.04, 0.03), band > 0.5);
    rough = 0.5;
    // lit windows on the station building
    if (ex > 0.5) {
      let wx = fract(uv.x / 3.0); let wy = fract(uv.y / 4.5);
      if (wx > 0.15 && wx < 0.85 && wy > 0.35 && wy < 0.75 && uv.y > 4.0) {
        albedo = vec3f(0.02); rough = 0.1; mat = 2.0;
        emis = vec3f(1.0, 0.78, 0.5) * 1.4 * (0.6 + 0.4 * hash21(floor(uv / vec2f(3.0, 4.5))));
      }
    }
  } else if (m == 11) { // cable
    albedo = vec3f(0.12, 0.12, 0.13); rough = 0.35; metal = 0.9;
    emis = vec3f(0.02, 0.025, 0.03);
  } else if (m == 12) { // station interior wall with backlit ad panels
    albedo = vec3f(0.55, 0.55, 0.56); rough = 0.5;
    let fx = fract(uv.x / 9.0) * 9.0;
    if (fx > 1.0 && fx < 5.0 && uv.y > 1.0 && uv.y < 3.4) {
      let id = hash21(vec2f(floor(uv.x / 9.0), ex));
      let c = select(select(vec3f(1.0, 0.3, 0.5), vec3f(0.3, 0.8, 1.0), id > 0.33), vec3f(1.0, 0.75, 0.3), id > 0.66);
      let v = (uv.y - 1.0) / 2.4; let u = (fx - 1.0) / 4.0;
      let pat = 0.6 + 0.4 * sin(u * 9.0 + id * 20.0) * sin(v * 5.0 + id * 7.0);
      emis = c * pat * 2.2; albedo = vec3f(0.05);
    }
  } else if (m == 13) { // glass
    albedo = vec3f(0.03, 0.04, 0.05); rough = 0.04; mat = 2.0; metal = 0.0;
    emis = vec3f(0.02, 0.03, 0.04);
  } else if (m == 14) { // metal roof
    albedo = vec3f(0.2, 0.21, 0.22) * (0.85 + 0.15 * step(0.5, fract(uv.x * 1.5))); rough = 0.4; metal = 0.6;
  } else if (m == 15) { // balcony slab / light concrete
    albedo = vec3f(0.45, 0.44, 0.42) * (0.85 + 0.2 * vnoise2(uv * 0.5)); rough = 0.75;
  } else if (m == 16) { // AC unit
    albedo = vec3f(0.5, 0.52, 0.53); rough = 0.5; metal = 0.3;
    let grill = step(0.5, fract(uv.y * 12.0));
    albedo *= 0.8 + 0.2 * grill;
  } else if (m == 17) { // black void (inside of tunnels and doors)
    albedo = vec3f(0.0); rough = 1.0; wet = 0.0;
  } else if (m == 18) { // terminal shed: corrugated metal with a lit window strip
    albedo = vec3f(0.16, 0.17, 0.19) * (0.85 + 0.15 * step(0.5, fract(uv.x * 2.0))); rough = 0.5; metal = 0.5;
    if (abs(n.y) < 0.5 && uv.y > 6.0 && uv.y < 7.6) {
      let wx = fract(uv.x / 3.0);
      if (wx > 0.1) { albedo = vec3f(0.02); mat = 2.0; rough = 0.1; emis = vec3f(0.8, 0.9, 1.0) * 1.3; }
    }
  } else if (m == 19) { // yellow safety paint
    albedo = vec3f(0.55, 0.42, 0.04); rough = 0.5;
    emis = vec3f(0.08, 0.05, 0.0);
  }
  let fade = 1.0 - smoothstep(2000.0, 4500.0, dist);
  return gbuf(albedo, rough, n, metal, emis, 1.0, motionVector(p, p), mat, wet);
}
`;

// ---------------------------------------------------------------- geometry

function frames(T, i0, i1, lat = 0) {
  const f = [];
  for (let i = i0; i <= i1; i++) {
    const lx = T.tz[i], lz = -T.tx[i];
    f.push({ p: [T.x[i] + lx * lat, T.y[i], T.z[i] + lz * lat], l: [lx, 0, lz], s: i * STEP });
  }
  return f;
}

// split [a,b] into runs where pred(i) is true
function runs(a, b, pred) {
  const out = [];
  let start = -1;
  for (let i = a; i <= b; i++) {
    const ok = pred(i);
    if (ok && start < 0) start = i;
    if ((!ok || i === b) && start >= 0) { const end = ok ? i : i - 1; if (end > start) out.push([start, end]); start = -1; }
  }
  return out;
}

const rect = (l0, l1, u0, u1) => [[l0, u0], [l1, u0], [l1, u1], [l0, u1]];

export function buildTransitStatic(ctx, tracks) {
  const world = ctx.world;
  const mb = new MeshBuilder();
  const lights = [];
  const signs = [];
  const R = rng(4242);
  const col = (cx, cy, cz, hx, hy, hz, a = 0) => world.addCollider(cx, cy, cz, hx, hy, hz, a);
  const angleAt = (T, i) => Math.atan2(T.tz[i], T.tx[i]);

  for (const T of tracks) {
    const metro = T.kind === 'metro';
    const tr = T.cfg.track;
    const inStation = (i) => T.stations.some((s) => Math.abs(i - s.i) * STEP < T.cfg.stationLen / 2 + 2);
    const visible = (i) => T.depthAt(i) < 3.5 || T.depthAt(Math.min(i + 1, T.n - 1)) < 3.5;
    const segs = runs(T.iA, T.iB, visible);
    for (const [a, b] of segs) {
      const F = frames(T, a, b);
      if (!metro) {
        for (const o of [tr, -tr]) {
          mb.sweep(F, rect(o - 0.425, o + 0.425, -1.6, 0), M.CONCRETE);
          const out = Math.sign(o);
          mb.sweep(F, out > 0 ? rect(o + 0.425, o + 0.45, -1.4, -1.28) : rect(o - 0.45, o - 0.425, -1.4, -1.28), M.LED, 0);
        }
      } else {
        // box girder (deck top at -0.5 relative to rail top)
        mb.sweep(F, [[-2.5, -3.2], [2.5, -3.2], [3.1, -1.6], [5.2, -1.0], [5.2, -0.5], [-5.2, -0.5], [-5.2, -1.0], [-3.1, -1.6]], M.CONCRETE);
        for (const o of [tr, -tr]) {
          mb.sweep(F, rect(o - 1.3, o + 1.3, -0.5, -0.3), M.TRACKBED);
          for (const r of [o - 0.7175, o + 0.7175]) mb.sweep(F, rect(r - 0.04, r + 0.04, -0.3, 0), M.RAIL);
        }
        mb.sweep(F, rect(5.2, 5.24, -0.95, -0.8), M.LED, 1);
        mb.sweep(F, rect(-5.24, -5.2, -0.95, -0.8), M.LED, 1);
      }
      // walkable deck colliders (chunks of 5 samples)
      for (let i = a; i < b; i += 5) {
        const j = Math.min(i + 5, b);
        const cx = (T.x[i] + T.x[j]) / 2, cz = (T.z[i] + T.z[j]) / 2, cy = (T.y[i] + T.y[j]) / 2;
        const len = Math.hypot(T.x[j] - T.x[i], T.z[j] - T.z[i]);
        if (T.depthAt(i) > 0) continue;
        if (metro) col(cx, cy - 1.85, cz, len / 2 + 0.5, 1.35, 5.2, angleAt(T, i));
        else for (const o of [tr, -tr]) col(cx + T.tz[i] * o, cy - 0.8, cz - T.tx[i] * o, len / 2 + 0.3, 0.8, 0.425, angleAt(T, i));
      }
      // metro parapets (not through stations)
      if (metro) {
        for (const [c, d] of runs(a, b, (i) => !inStation(i))) {
          const F2 = frames(T, c, d);
          mb.sweep(F2, rect(4.95, 5.2, -0.5, 0.65), M.CONCRETE);
          mb.sweep(F2, rect(-5.2, -4.95, -0.5, 0.65), M.CONCRETE);
        }
      }
    }

    // pillars / piers
    for (let i = T.iA + 2; i <= T.iB - 2; i++) {
      const g = T.g[i], y = T.y[i];
      if (inStation(i)) continue;
      const ang = angleAt(T, i);
      if (!metro) {
        if (i % 4 !== 0) continue;
        const capTop = y - 1.6, capBot = capTop - 1.25;
        if (capBot - g < 3) continue;
        mb.ybox(T.x[i], capTop - 0.625, T.z[i], 0.9, 0.625, tr + 1.25, ang, M.CONCRETE);
        const top = capBot, bot = g - 3;
        const w = capBot - g > 30 ? 0.95 : 0.75;
        mb.ybox(T.x[i], (top + bot) / 2, T.z[i], w, (top - bot) / 2, w, ang, M.CONCRETE, 0, 63, bot - g);
        // tapered haunch under the cap
        mb.ybox(T.x[i], capBot - 0.6, T.z[i], w + 0.15, 0.6, w + 0.6, ang, M.CONCRETE);
        col(T.x[i], (top + g) / 2, T.z[i], w, (top - g) / 2 + 0.5, w, ang);
      } else {
        const water = g < 1;
        if (water ? i % 15 !== 0 : i % 5 !== 0) continue;
        const gb = y - 3.2;
        if (gb - g < 3) continue;
        const r = water ? 2.0 : 1.15;
        const capH = water ? 2.0 : 1.5;
        mb.ybox(T.x[i], gb - capH / 2, T.z[i], water ? 2.2 : 1.3, capH / 2, water ? 3.6 : 2.7, ang, M.CONCRETE);
        mb.prism(T.x[i], T.z[i], g - 3, gb - capH + 0.01, r, 8, M.CONCRETE, 0, false, Math.PI / 8 + ang);
        if (water) mb.prism(T.x[i], T.z[i], -3, 1.2, r + 1.2, 8, M.CONCRETE, 0, true, Math.PI / 8 + ang); // pier footing at the waterline
        col(T.x[i], (gb + g) / 2, T.z[i], r * 0.9, (gb - g) / 2 + 0.5, r * 0.9, ang);
      }
    }

    // metro catenary portal frames + wires
    if (metro) {
      let prev = -1;
      for (let i = T.iA + 4; i <= T.iB - 4; i += 8) {
        if (T.depthAt(i) > -2) { prev = -1; continue; }
        const lx = T.tz[i], lz = -T.tx[i], y = T.y[i];
        for (const o of [5.45, -5.45]) mb.beam([T.x[i] + lx * o, y - 1.0, T.z[i] + lz * o], [T.x[i] + lx * o, y + 6.6, T.z[i] + lz * o], 0.13, 0.13, M.METAL);
        mb.beam([T.x[i] + lx * 5.6, y + 6.3, T.z[i] + lz * 5.6], [T.x[i] - lx * 5.6, y + 6.3, T.z[i] - lz * 5.6], 0.1, 0.14, M.METAL);
        if (prev >= 0) {
          for (const o of [tr, -tr]) {
            const plx = T.tz[prev], plz = -T.tx[prev];
            mb.beam([T.x[prev] + plx * o, T.y[prev] + 5.3, T.z[prev] + plz * o], [T.x[i] + lx * o, y + 5.3, T.z[i] + lz * o], 0.035, 0.035, M.CABLE);
            mb.beam([T.x[prev] + plx * o, T.y[prev] + 6.25, T.z[prev] + plz * o], [T.x[i] + lx * o, y + 6.25, T.z[i] + lz * o], 0.03, 0.03, M.CABLE);
          }
        }
        prev = i;
      }
    }

    // tunnel portals where the track dives into a hill
    for (let i = T.iA + 1; i <= T.iB; i++) {
      const d0 = T.depthAt(i - 1), d1 = T.depthAt(i);
      if ((d0 < 3.5) === (d1 < 3.5)) continue;
      const k = d1 >= 3.5 ? i : i - 1;
      const hw = tr + 5.0;
      const ang = angleAt(T, k);
      const y = T.y[k];
      // wall across the track; uv.x runs along the wall from 0..2*hw; ex = hw centers it
      mb.ybox(T.x[k], y + 2.0, T.z[k], 1.0, 9.5, hw, ang, M.PORTAL, hw + (metro ? 1000 : 0), 63, -2.8);
      lights.push([T.x[k] - T.tx[k] * 6 * Math.sign(d1 - d0), y + 8.5, T.z[k] - T.tz[k] * 6 * Math.sign(d1 - d0), 18, 30, 16, 5, 0]);
    }

    // terminal sheds
    for (const term of T.terminals) {
      if (term.tunnel) continue;
      const sh = T.cfg.shedLen;
      const iIn = term.end === 0 ? term.i : term.i - Math.round(sh / STEP);
      const iOut = term.end === 0 ? term.i + Math.round(sh / STEP) : term.i;
      const i0 = Math.max(0, iIn - (term.end === 0 ? 2 : 0)), i1 = Math.min(T.n - 1, iOut + (term.end === 1 ? 2 : 0));
      const W = tr + 4.8;
      const lo = metro ? -4.0 : -2.6, hi = metro ? 8.2 : 6.8;
      const F = frames(T, i0, i1);
      mb.sweep(F, rect(-W, W, lo, hi), M.SHED, 0, true, (e) => (e === 0 ? M.CONCRETE : M.SHED));
      // end walls: the one facing the line has dark door openings (trains pass "through" it)
      for (const [k, sign] of [[i0, -1], [i1, 1]]) {
        const ang = angleAt(T, k);
        const lineSide = (term.end === 0 && sign === 1) || (term.end === 1 && sign === -1);
        mb.ybox(T.x[k] + T.tx[k] * sign * 0.3, (lo + hi) / 2 + T.y[k], T.z[k] + T.tz[k] * sign * 0.3, 0.3, (hi - lo) / 2, W, ang, lineSide ? M.PORTAL : M.SHED, W + (metro ? 1000 : 0), 63, lineSide ? 4.7 + lo : 0);
      }
      const mid = Math.round((i0 + i1) / 2);
      col(T.x[mid], T.y[mid] + (lo + hi) / 2, T.z[mid], (i1 - i0) * STEP / 2, (hi - lo) / 2, W, angleAt(T, mid));
      // support columns down to the ground
      for (let i = i0; i <= i1; i += 3) {
        const g = T.g[i];
        if (T.y[i] + lo - g < 2) continue;
        for (const o of [W - 1, -(W - 1)]) mb.ybox(T.x[i] + T.tz[i] * o, (T.y[i] + lo + g - 2) / 2, T.z[i] - T.tx[i] * o, 0.6, (T.y[i] + lo - g + 2) / 2, 0.6, angleAt(T, i), M.CONCRETE);
      }
      lights.push([T.x[mid], T.y[mid] + hi + 2, T.z[mid], 20, 20, 26, 34, 0]);
      signs.push({ x: T.x[term.i] - T.tx[term.i] * (term.end === 0 ? -1 : 1) * 0, y: T.y[term.i] + hi - 1.2, z: T.z[term.i], nx: T.tz[term.i], nz: -T.tx[term.i], w: 9, h: 2.2, text: T.kind === 'metro' ? '6号线' : '2号线', kind: 'fascia', color: metro ? [1.0, 0.2, 0.6] : [0.2, 0.9, 1.0], offset: W + 0.05 });
    }

    // stations
    for (const st of T.stations) {
      if (st.liziba) continue;
      buildStation(mb, T, st, lights, signs, col);
    }
  }

  // the Liziba tower
  const mono = tracks.find((t) => t.lizibaIndex !== undefined);
  if (mono) buildLizibaTower(mb, world, mono, lights, signs, col, R);

  buildCableway(mb, world, lights, signs, col);

  return { mesh: mb, lights, signs };
}

function buildStation(mb, T, st, lights, signs, col) {
  const metro = T.kind === 'metro';
  const half = T.cfg.stationLen / 2;
  const i0 = Math.max(T.iA, st.i - Math.round(half / STEP)), i1 = Math.min(T.iB, st.i + Math.round(half / STEP));
  const F = frames(T, i0, i1);
  const pIn = metro ? 3.75 : 3.55, pOut = metro ? 10.0 : 8.6;
  const pTop = metro ? 1.05 : 0.05, pBot = metro ? -1.2 : -1.6;
  const roofY = metro ? 7.6 : 6.4, roofW = pOut + 0.8;
  for (const sgn of [1, -1]) {
    const pr = sgn > 0 ? rect(pIn, pOut, pBot, pTop) : rect(-pOut, -pIn, pBot, pTop);
    // platform: top face tiles with the safety line at the inner edge (ex = lateral distance of the edge)
    mb.sweep(F, pr, M.PLATFORM);
    mb.sweep(F, sgn > 0 ? rect(pIn + 0.25, pIn + 0.6, pTop, pTop + 0.01) : rect(-pIn - 0.6, -pIn - 0.25, pTop, pTop + 0.01), M.YELLOW);
    // back glass railing
    mb.sweep(F, sgn > 0 ? rect(pOut - 0.12, pOut, pTop, pTop + 2.6) : rect(-pOut, -pOut + 0.12, pTop, pTop + 2.6), M.GLASS);
  }
  // canopy roof (underside has light strips)
  mb.sweep(F, rect(-roofW, roofW, roofY, roofY + 0.55), M.ROOF, 0, true, (e) => (e === 0 ? M.CEILING : M.ROOF));
  mb.sweep(F, rect(roofW, roofW + 0.06, roofY, roofY + 0.5), M.LED, metro ? 1 : 0);
  mb.sweep(F, rect(-roofW - 0.06, -roofW, roofY, roofY + 0.5), M.LED, metro ? 1 : 0);
  for (let i = i0; i <= i1; i += 2) {
    const ang = Math.atan2(T.tz[i], T.tx[i]);
    for (const o of [pOut - 0.6, -(pOut - 0.6)]) {
      const x = T.x[i] + T.tz[i] * o, z = T.z[i] - T.tx[i] * o, y = T.y[i];
      mb.ybox(x, y + (pTop + roofY) / 2, z, 0.18, (roofY - pTop) / 2, 0.18, ang, M.METAL);
      // station legs down to the ground
      if ((i - i0) % 4 === 0) {
        const g = T.g[i];
        const bot = metro ? y - 12.0 : y + pBot;
        if (bot - g > 1) { mb.ybox(x, (bot + g - 2) / 2, z, 0.55, (bot - g + 2) / 2, 0.55, ang, M.CONCRETE); col(x, (bot + g) / 2, z, 0.55, (bot - g) / 2, 0.55, ang); }
      }
    }
    if (i + 2 <= i1) {
      const cx = (T.x[i] + T.x[i + 2]) / 2, cz = (T.z[i] + T.z[i + 2]) / 2, cy = (T.y[i] + T.y[i + 2]) / 2;
      const mid = (pIn + pOut) / 2, hw = (pOut - pIn) / 2;
      for (const o of [mid, -mid]) col(cx + T.tz[i] * o, cy + (pTop + pBot) / 2, cz - T.tx[i] * o, STEP + 0.1, (pTop - pBot) / 2, hw, ang);
    }
  }
  if (metro) {
    // concourse box under the platforms
    mb.sweep(F, rect(-11, 11, -11.5, -4.2), M.SHED, 0, true, (e) => (e === 1 || e === 3 ? M.SHED : M.CONCRETE), -11.5 - 1.0);
    for (const k of [i0, i1]) {
      const ang = Math.atan2(T.tz[k], T.tx[k]);
      mb.ybox(T.x[k], T.y[k] - 7.85, T.z[k], 0.2, 3.65, 11, ang, M.CONCRETE);
    }
  }
  // lights under the canopy
  const nL = metro ? 4 : 3;
  for (let k = 0; k < nL; k++) {
    const i = Math.round(i0 + (k + 0.5) / nL * (i1 - i0));
    for (const o of [(pIn + pOut) / 2, -(pIn + pOut) / 2]) lights.push([T.x[i] + T.tz[i] * o, T.y[i] + roofY - 1.0, T.z[i] - T.tx[i] * o, 16, 22, 26, 32, 0]);
  }
  // name signs hanging under the canopy edge, facing outward on both sides, and at the ends
  for (const sgn of [1, -1]) {
    const i = st.i;
    signs.push({ x: T.x[i], y: T.y[i] + roofY + 1.6, z: T.z[i], nx: T.tz[i] * sgn, nz: -T.tx[i] * sgn, w: Math.max(7, st.name.length * 2.6), h: 2.0, text: st.name, kind: 'fascia', color: metro ? [1.0, 0.25, 0.65] : [0.25, 0.95, 1.0], offset: roofW + 0.1 });
    // inner platform name boards
    for (const di of [-6, 6]) {
      const j = st.i + di;
      signs.push({ x: T.x[j], y: T.y[j] + pTop + 3.4, z: T.z[j], nx: -T.tz[j] * sgn, nz: T.tx[j] * sgn, w: 3.2, h: 0.9, text: st.name, kind: 'lightbox', color: [0.95, 0.97, 1.0], offset: -(pOut - 0.5) });
    }
  }
}

function buildLizibaTower(mb, world, T, lights, signs, col, R) {
  const i = T.lizibaIndex;
  const ox = T.x[i], oz = T.z[i];
  const ex = [T.tx[i], T.tz[i]];        // along track
  const ez = [T.tz[i], -T.tx[i]];       // left of track
  const ang = Math.atan2(ex[1], ex[0]);
  const W = (X, Z) => [ox + ex[0] * X + ez[0] * Z, oz + ex[1] * X + ez[1] * Z];
  const HX = 24, HZ = 14;
  let gmin = 1e9, gmax = -1e9;
  for (let a = -1; a <= 1; a += 0.5) for (let b = -1; b <= 1; b += 0.5) { const [x, z] = W(a * HX, b * HZ); const h = world.heightAt(x, z); gmin = Math.min(gmin, h); gmax = Math.max(gmax, h); }
  const yb = T.y[i];
  const y0 = gmin - 2;
  const yL = yb - 2.4, yU = yb + 6.6;
  const nLower = Math.max(1, Math.round((yL - (gmax - 1)) / 3));
  const lowerBase = yL - nLower * 3; // align floors to the station level
  const nUpper = Math.max(14, 25 - nLower - 3);
  const yTop = yU + nUpper * 3;
  const seed = 17;
  const box = (X, Y, Z, hx, hy, hz, mat, extra = 0, faces = 63, v0 = 0, u0 = 0) => {
    const [x, z] = W(X, Z);
    mb.ybox(x, Y, z, hx, hy, hz, ang, mat, extra, faces, v0, u0);
  };
  const colBox = (X, Y, Z, hx, hy, hz) => { const [x, z] = W(X, Z); col(x, Y, z, hx, hy, hz, ang); };

  // lower block (residential floors from below ground up to the station floor)
  box(0, (y0 + yL) / 2, 0, HX, (yL - y0) / 2, HZ, M.RESID, seed, 63 & ~4, y0 - lowerBase);
  box(0, yL - 0.05, 0, HX - 0.6, 0.05, HZ - 0.6, M.TRACKBED, 0, 4);
  colBox(0, (y0 + yL) / 2, 0, HX, (yL - y0) / 2, HZ);
  // upper block (its underside is the station ceiling)
  box(0, (yU + yTop) / 2, 0, HX, (yTop - yU) / 2, HZ, M.RESID, seed, 63 & ~8, (yU - lowerBase));
  box(0, yU + 0.05, 0, HX - 0.6, 0.05, HZ - 0.6, M.CEILING, 0, 8);
  colBox(0, (yU + yTop) / 2, 0, HX, (yTop - yU) / 2, HZ);
  // station level shell: side walls (glass facade outside, ad wall inside)
  for (const s of [1, -1]) {
    box(0, (yL + yU) / 2, s * (HZ - 0.3), HX, (yU - yL) / 2, 0.3, M.STATIONFACADE, 0, s > 0 ? 32 | 16 | 4 | 8 | 1 | 2 : 32 | 16 | 4 | 8 | 1 | 2, 0);
    box(0, (yL + yU) / 2, s * (HZ - 0.62), HX - 0.6, (yU - yL) / 2, 0.02, M.INWALL, s, s > 0 ? 16 : 32, -(yb + 0.05 - yL));
    colBox(0, (yL + yU) / 2, s * (HZ - 0.3), HX, (yU - yL) / 2, 0.3);
    // end wall pieces beside the opening
    for (const e of [1, -1]) {
      box(e * (HX - 0.3), (yL + yU) / 2, s * (HZ + 7) / 2, 0.3, (yU - yL) / 2, (HZ - 7) / 2, M.RESID, seed + 3, 63, yL - lowerBase);
      colBox(e * (HX - 0.3), (yL + yU) / 2, s * (HZ + 7) / 2, 0.3, (yU - yL) / 2, (HZ - 7) / 2);
    }
    // platforms
    box(0, (yL + yb + 0.05) / 2, s * (3.6 + HZ - 0.6) / 2, HX - 0.6, (yb + 0.05 - yL) / 2, (HZ - 0.6 - 3.6) / 2, M.PLATFORM, 0, 63);
    colBox(0, (yL + yb + 0.05) / 2, s * (3.6 + HZ - 0.6) / 2, HX - 0.6, (yb + 0.05 - yL) / 2, (HZ - 0.6 - 3.6) / 2);
    // safety line strip along the platform edge
    box(0, yb + 0.06, s * 4.0, HX - 0.6, 0.01, 0.2, M.YELLOW, 0, 4);
    // columns on the platforms
    for (let X = -18; X <= 18; X += 9) box(X, (yb + yU) / 2, s * 10.5, 0.4, (yU - yb) / 2, 0.4, M.SLAB);
    // benches / ticket gates
    for (let X = -14; X <= 14; X += 14) box(X, yb + 0.5, s * 12.2, 2.0, 0.45, 0.35, M.METAL);
  }
  // lintel above the opening on both end faces
  for (const e of [1, -1]) {
    box(e * (HX - 0.3), (yb + 5.4 + yU) / 2, 0, 0.3, (yU - yb - 5.4) / 2, 7, M.RESID, seed + 5, 63, yb + 5.4 - lowerBase);
  }
  // pedestals under the guideway beams inside the station
  for (let X = -20; X <= 20; X += 8) for (const o of [2.0, -2.0]) box(X, (yL + yb - 1.6) / 2, o, 0.5, (yb - 1.6 - yL) / 2, 0.45, M.CONCRETE);

  // balconies and fins on the long facades (both blocks)
  const floors = [];
  for (let y = lowerBase + 3; y < yTop - 1; y += 3) if (y < yL - 0.5 || y > yU + 0.5) floors.push(y);
  for (const s of [1, -1]) {
    for (const y of floors) {
      if (y < y0 + 1) continue;
      box(0, y - 0.12, s * (HZ + 0.55), HX - 0.5, 0.12, 0.55, M.SLAB);
      // railing glass
      box(0, y + 0.45, s * (HZ + 1.08), HX - 0.5, 0.45, 0.03, M.GLASS, 0, 16 | 32 | 4);
    }
    for (let X = -HX + 6.8; X < HX; X += 6.8) {
      box(X, (y0 + yL) / 2, s * (HZ + 0.6), 0.18, (yL - y0) / 2, 0.6, M.SLAB);
      box(X, (yU + yTop) / 2, s * (HZ + 0.6), 0.18, (yTop - yU) / 2, 0.6, M.SLAB);
    }
    // air conditioner units under some windows
    for (const y of floors) for (let X = -HX + 2; X < HX - 1; X += 3.4) {
      if (R() > 0.35) continue;
      box(X + 1.2, y + 0.3, s * (HZ + 1.35), 0.42, 0.3, 0.22, M.ACUNIT);
    }
  }
  // AC units on the end faces too
  for (const e of [1, -1]) for (const y of floors) for (let Z = -HZ + 2; Z < HZ - 1; Z += 3.4) {
    if (R() > 0.25 || Math.abs(Z) < 8 && y > yL - 4 && y < yU + 4) continue;
    box(e * (HX + 0.25), y + 0.3, Z, 0.22, 0.3, 0.42, M.ACUNIT);
  }
  // roof: parapet, machine room, water tank
  box(0, yTop + 0.6, HZ - 0.15, HX, 0.6, 0.15, M.SLAB);
  box(0, yTop + 0.6, -HZ + 0.15, HX, 0.6, 0.15, M.SLAB);
  box(HX - 0.15, yTop + 0.6, 0, 0.15, 0.6, HZ, M.SLAB);
  box(-HX + 0.15, yTop + 0.6, 0, 0.15, 0.6, HZ, M.SLAB);
  box(-8, yTop + 2.5, 2, 5, 2.5, 4, M.RESID, seed + 9, 63, 0);
  const [tx, tz] = W(10, -4);
  mb.prism(tx, tz, yTop, yTop + 4.5, 2.6, 10, M.ACUNIT);
  // rooftop sign frame
  box(6, yTop + 7, 6, 0.2, 7, 0.2, M.METAL); box(6, yTop + 7, -6, 0.2, 7, 0.2, M.METAL);

  // interior lights (cool white) and the station signage
  for (let X = -16; X <= 16; X += 10.6) for (const s of [1, -1]) {
    const [x, z] = W(X, s * 8);
    lights.push([x, yU - 1.2, z, 14, 18, 22, 28, 0]);
  }
  for (const e of [1, -1]) {
    const [x, z] = W(e * (HX + 0.05), 0);
    signs.push({ x, y: yb + 5.95, z, nx: ex[0] * e, nz: ex[1] * e, w: 9.5, h: 1.05, text: '李子坝站', kind: 'lightbox', color: [0.95, 0.98, 1.0], offset: 0 });
    signs.push({ x, y: yU + 3.2, z, nx: ex[0] * e, nz: ex[1] * e, w: 15, h: 3.0, text: '李子坝站', kind: 'fascia', color: [0.15, 1.0, 0.6], offset: 0.6 });
    const [x2, z2] = W(e * (HX + 0.05), 10.2);
    signs.push({ x: x2, y: yb + 8.5, z: z2, nx: ex[0] * e, nz: ex[1] * e, w: 2.6, h: 2.6, text: '2', kind: 'fascia', color: [0.2, 0.95, 0.5], offset: 0 });
    // tall vertical neon sign near the corner of each end face
    const [xb, zb] = W(e * (HX + 0.05), -e * (HZ - 2.5));
    signs.push({ x: xb, y: yU + 12, z: zb, nx: ex[0] * e, nz: ex[1] * e, w: 3.4, h: 13, text: '李子坝', kind: 'fascia', vertical: true, color: [1.0, 0.25, 0.4], offset: 0.35 });
    // signage bands up the residential floors (shops and guesthouses on the lower floors, a hotpot place higher up)
    const bands = [['老火锅', [1.0, 0.25, 0.1]], ['旅馆', [0.3, 0.9, 1.0]], ['麻将', [1.0, 0.75, 0.2]], ['小面', [1.0, 0.2, 0.6]]];
    bands.forEach(([text, color], k) => {
      const [xs, zs] = W(e * (HX + 0.05), e * (k % 2 ? 5 : -4));
      signs.push({ x: xs, y: yU + 4.5 + k * 6.2, z: zs, nx: ex[0] * e, nz: ex[1] * e, w: 8, h: 1.8, text, kind: k % 2 ? 'lightbox' : 'fascia', color, offset: 0.3 });
    });
    // light spill over the opening
    const [x3, z3] = W(e * (HX + 4), 0);
    lights.push([x3, yb + 4.5, z3, 16, 18, 24, 30, 0]);
  }
  for (const s of [1, -1]) {
    for (const X of [-10, 10]) {
      const [x, z] = W(X, s * (HZ - 0.66));
      signs.push({ x, y: yb + 3.6, z, nx: -ez[0] * s, nz: -ez[1] * s, w: 4.2, h: 1.1, text: '李子坝', kind: 'lightbox', color: [1.0, 1.0, 1.0], offset: 0 });
    }
    // big rooftop neon on the facades
    const [x, z] = W(0, s * (HZ + 1.15));
    signs.push({ x, y: yTop - 4.5, z, nx: ez[0] * s, nz: ez[1] * s, w: 16, h: 3.6, text: '山城人家', kind: 'fascia', color: s > 0 ? [1.0, 0.15, 0.35] : [0.2, 0.85, 1.0], offset: 0 });
  }
  const [rx, rz] = W(6, 0);
  signs.push({ x: rx, y: yTop + 10, z: rz, nx: ex[0], nz: ex[1], w: 12, h: 5, text: '重庆', kind: 'fascia', color: [1.0, 0.2, 0.1], offset: 0, both: true });
  world.shared.lizibaTower = { x: ox, z: oz, angle: ang, hx: HX, hz: HZ, y0, yTop, stationY: yb };
}

function buildCableway(mb, world, lights, signs, col) {
  const C = CABLEWAY;
  const dx = C.bx - C.ax, dz = C.bz - C.az;
  const len = Math.hypot(dx, dz);
  const ex = [dx / len, dz / len], ez = [dz / len, -dx / len];
  const ang = Math.atan2(ex[1], ex[0]);
  const gA = world.heightAt(C.ax, C.az), gB = world.heightAt(C.bx, C.bz);
  const stations = [{ x: C.ax, z: C.az, g: gA, dir: 1 }, { x: C.bx, z: C.bz, g: gB, dir: -1 }];
  const HL = 14, HW = 11;
  const tops = [];
  for (const s of stations) {
    const top = s.g + C.towerH;
    // main tower building
    let gmin = 1e9;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) gmin = Math.min(gmin, world.heightAt(s.x + ex[0] * a * HL + ez[0] * b * HW, s.z + ex[1] * a * HL + ez[1] * b * HW));
    const y0 = gmin - 2, yDeck = top - 8.6;
    mb.ybox(s.x, (y0 + yDeck) / 2, s.z, HL, (yDeck - y0) / 2, HW, ang, M.CABLETOWER, 1, 63, y0 - s.g);
    col(s.x, (y0 + yDeck) / 2, s.z, HL, (yDeck - y0) / 2, HW, ang);
    // station hall at the top (cabins dock here): open toward the river
    const hallFaces = s.dir > 0 ? 63 & ~1 : 63 & ~2;
    mb.ybox(s.x, yDeck + 4.3, s.z, HL, 4.3, HW, ang, M.STATIONFACADE, 0, hallFaces & ~4 & ~8, -0.2);
    mb.ybox(s.x, top + 0.4, s.z, HL + 1.5, 0.4, HW + 1.5, ang, M.ROOF);
    // inward-facing interior walls (axes X and Z negated), river side left open
    const ca = Math.cos(ang), sa = Math.sin(ang);
    mb.box([s.x, yDeck + 4.3, s.z], [-ca, 0, -sa], [0, 1, 0], [sa, 0, -ca], HL - 0.4, 4.25, HW - 0.4, M.INWALL, 3, (s.dir > 0 ? 1 : 2) | 16 | 32, -0.2);
    mb.ybox(s.x, yDeck + 0.1, s.z, HL, 0.1, HW, ang, M.PLATFORM, 0, 4);
    mb.ybox(s.x, top - 0.1, s.z, HL, 0.1, HW, ang, M.CEILING, 0, 8);
    // red steel portal frame at the river end carrying the cables
    const fx = s.x + ex[0] * s.dir * (HL + 2), fz = s.z + ex[1] * s.dir * (HL + 2);
    for (const o of [HW - 1, -(HW - 1)]) mb.ybox(fx + ez[0] * o, (y0 + top + 5) / 2, fz + ez[1] * o, 0.6, (top + 5 - y0) / 2, 0.6, ang, M.CABLETOWER, 0);
    mb.ybox(fx, top + 4, fz, 0.7, 1.0, HW, ang, M.CABLETOWER, 0);
    tops.push({ x: s.x + ex[0] * s.dir * (HL + 2), z: s.z + ex[1] * s.dir * (HL + 2), y: top - 2.0, cx: s.x, cz: s.z });
    lights.push([s.x, yDeck + 6, s.z, 22, 30, 26, 20, 0]);
    lights.push([fx, top + 2, fz, 20, 40, 10, 8, 0]);
    signs.push({ x: s.x, y: top - 2.5, z: s.z, nx: ez[0], nz: ez[1], w: 16, h: 3.2, text: '长江索道', kind: 'fascia', color: [1.0, 0.15, 0.12], offset: HW + 0.05 });
    signs.push({ x: s.x, y: top - 2.5, z: s.z, nx: -ez[0], nz: -ez[1], w: 16, h: 3.2, text: '长江索道', kind: 'fascia', color: [1.0, 0.15, 0.12], offset: HW + 0.05 });
  }
  // cables: per path one track rope and one haul rope (catenary)
  const cable = { a: tops[0], b: tops[1], sag: 26, offsets: [5.5, -5.5], ex, ez };
  for (const o of cable.offsets) {
    for (const [dy, r] of [[0, 0.07], [-1.3, 0.05]]) {
      let prev = null;
      for (let k = 0; k <= 48; k++) {
        const u = k / 48;
        const p = cablePoint(cable, u, o);
        p[1] += dy;
        if (prev) mb.beam(prev, p, r, r, M.CABLE);
        prev = p;
      }
    }
  }
  world.shared.cableway = cable;
  return cable;
}

export function cablePoint(c, u, off) {
  const x = c.a.x + (c.b.x - c.a.x) * u + c.ez[0] * off;
  const z = c.a.z + (c.b.z - c.a.z) * u + c.ez[1] * off;
  const y = c.a.y + (c.b.y - c.a.y) * u - c.sag * 4 * u * (1 - u);
  return [x, y, z];
}
