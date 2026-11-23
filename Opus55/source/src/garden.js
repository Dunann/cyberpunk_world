// Lake Gardens: a West Lake / Suzhou inspired district.
//  - Su Causeway and Bai Causeway (raised out of the lake by the terrain carving, see terrainLand.js) with
//    stone hump bridges (walkable: stepped colliders), weeping willows and red lanterns along the paths
//  - Leifeng-style octagonal pagoda on the hill south of the lake, warmly lit, with lanterns at the eave corners
//  - Suzhou garden compounds on the shore: white walls with grey tile coping, moon gates, glowing lattice
//    windows, a hall, a hexagonal pavilion, mirror pond with a zigzag bridge, Taihu rockeries
//  - pavilions on the islands, the three stone lanterns in the lake, lotus pads on the water
// Calm warm palette (lantern light) against the neon city beyond. All geometry is built here procedurally
// into one static buffer (one draw call) plus one instanced draw for lotus pads.

import { GardenMesh, PAT, STRIDE, V3 } from './gardenMesh.js';
import { CAUSEWAYS, ISLANDS, BRIDGE_GAP, CAUSEWAY_TOP, lakeToWorld } from './terrainLand.js';
import { LANDMARKS } from './world.js';
import { rng } from './math.js';
import { lookoutTower, lakesideVignette, cragLookout, hillsideLife } from './gardenViews.js';

const C = {
  plaster: [0.58, 0.56, 0.52], tile: [0.03, 0.032, 0.036], wood: [0.17, 0.035, 0.022], dwood: [0.06, 0.035, 0.025],
  stone: [0.15, 0.145, 0.135], dstone: [0.08, 0.078, 0.074], taihu: [0.2, 0.2, 0.19], gold: [0.55, 0.36, 0.14],
  lantern: [1.0, 0.28, 0.08], paper: [1.0, 0.7, 0.4], pond: [0.01, 0.012, 0.014], gravel: [0.1, 0.095, 0.088],
};
const WARM = [1.0, 0.55, 0.22];

const GARDEN_WGSL = /* wgsl */ `
@group(1) @binding(0) var tNoise: texture_2d<f32>;
@group(1) @binding(1) var sRep: sampler;
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) col: vec3f,
  @location(3) @interpolate(flat) pe: vec2f,
  @location(4) uv: vec2f,
};
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) col: vec3f, @location(3) pat: f32, @location(4) em: f32, @location(5) uv: vec2f) -> VOut {
  var o: VOut;
  o.wp = p; o.n = n; o.col = col; o.pe = vec2f(pat, em); o.uv = uv;
  o.pos = F.viewProj * vec4f(p, 1.0);
  return o;
}
fn blk(u: vec2f, size: vec2f) -> vec2f {
  let row = floor(u.y / size.y);
  let q = vec2f(u.x / size.x + row * 0.5, u.y / size.y);
  let f = fract(q);
  let e = min(min(f.x, 1.0 - f.x) * size.x, min(f.y, 1.0 - f.y) * size.y);
  return vec2f(1.0 - smoothstep(0.012, 0.035, e), hash21(floor(q) + 0.5));
}
@fragment fn fs(i: VOut) -> GOut {
  let dx = dpdx(i.wp.xz + i.wp.y * 0.7); let dy = dpdy(i.wp.xz + i.wp.y * 0.7);
  let N = textureSampleGrad(tNoise, sRep, (i.wp.xz + i.wp.y * 0.7) * 0.15, dx * 0.15, dy * 0.15);
  var n = normalize(i.n);
  let pat = i.pe.x; let em = i.pe.y;
  var albedo = i.col; var rough = 0.6; var emis = vec3f(0.0); var wet = 0.7; var mat = 0.0; var metal = 0.0;
  let uv = i.uv;
  if (pat == 1.0) {          // plaster: soft mottling, rain grime toward the base
    albedo *= 0.82 + 0.25 * N.r;
    albedo *= mix(0.55, 1.0, smoothstep(0.0, 1.2, uv.y));
    rough = 0.85; wet = 0.5;
  } else if (pat == 2.0) {   // grey roof tiles: ribs along the slope
    let r = fract(uv.x * 3.2);
    let rib = smoothstep(0.0, 0.25, r) * smoothstep(1.0, 0.7, r);
    albedo *= 0.6 + 0.6 * rib;
    n = normalize(n + vec3f(cos(r * 6.28) * 0.25, 0.0, sin(r * 6.28) * 0.25));
    rough = 0.35; wet = 1.0;
  } else if (pat == 3.0) {   // lacquered wood
    albedo *= 0.85 + 0.2 * sin(uv.y * 30.0 + N.g * 6.0);
    rough = 0.3; wet = 0.6;
  } else if (pat == 4.0) {   // stone blocks
    let b = blk(uv, vec2f(0.8, 0.4));
    albedo *= (0.8 + 0.35 * b.y) * (1.0 - 0.5 * b.x) * (0.85 + 0.3 * N.b);
    rough = 0.55; wet = 0.9;
  } else if (pat == 5.0) {   // lattice window glowing from inside
    let q = uv * 7.0;
    let d1 = abs(fract(q.x + q.y) - 0.5); let d2 = abs(fract(q.x - q.y) - 0.5);
    let bar = 1.0 - smoothstep(0.08, 0.14, min(d1, d2));
    let frame = 1.0 - step(0.06, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
    let solid = max(bar, frame);
    albedo = mix(vec3f(0.6, 0.5, 0.35), C_DWOOD, solid);
    emis = vec3f(1.0, 0.62, 0.3) * em * (1.0 - solid) * (0.8 + 0.4 * N.r);
    rough = 0.5;
  } else if (pat == 6.0) {   // mirror pond
    albedo = vec3f(0.005, 0.007, 0.008);
    let t = time();
    let w = vec2f(sin(i.wp.x * 1.7 + t * 1.3) + sin(i.wp.z * 2.3 - t), cos(i.wp.z * 1.9 + t * 1.1)) * 0.02;
    n = normalize(vec3f(w.x, 1.0, w.y));
    rough = 0.02; wet = 1.0; mat = 3.0;
  } else if (pat == 7.0) {   // paper lantern
    let rib = 0.75 + 0.25 * smoothstep(0.0, 0.3, abs(fract(uv.x * 6.0) - 0.5));
    emis = i.col * em * rib;
    albedo = i.col * 0.3;
    rough = 0.6;
  } else if (pat == 8.0) {   // pagoda wall washed by warm floodlight
    albedo *= 0.85 + 0.2 * N.r;
    emis = i.col * em * (0.45 + 0.55 * (1.0 - smoothstep(0.0, 6.0, uv.y)));
    rough = 0.7;
  } else if (pat == 9.0) {   // gravel / paving
    let b = blk(i.wp.xz, vec2f(0.7, 0.7));
    albedo *= (0.8 + 0.4 * b.y) * (1.0 - 0.4 * b.x);
    rough = 0.6; wet = 0.9; mat = 3.0;
  } else {
    albedo *= 0.9 + 0.2 * N.g;
    emis = i.col * em;
  }
  return gbuf(albedo, rough, n, metal, emis, 1.0, motionVector(i.wp, i.wp), mat, wet);
}

// lotus pads: instanced flat discs just above the water
struct Pad { a: vec4f };   // x, z, radius, rotation(+flower flag * 10)
@group(1) @binding(2) var<storage, read> pads: array<Pad>;
struct POut { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) lp: vec2f, @location(2) @interpolate(flat) f: vec2f };
@vertex fn vsPad(@location(0) p: vec3f, @builtin(instance_index) ii: u32) -> POut {
  let P = pads[ii].a;
  let flower = floor(P.w / 10.0);
  let r = rot2(P.w - flower * 10.0);
  // flower vertices (y > 0) have a fixed size and collapse on pads without a flower
  let fl = select(P.z, select(0.0, 0.55, flower > 0.5), p.y > 0.0);
  let xz = r * (p.xz + select(vec2f(0.0), vec2f(0.35, 0.0), p.y > 0.0)) * fl;
  var o: POut;
  let bob = sin(time() * 0.8 + P.x * 0.3 + P.y * 0.2) * 0.008;
  o.wp = vec3f(P.x + xz.x, 0.03 + p.y * fl + bob, P.y + xz.y);
  o.lp = p.xz;
  o.f = vec2f(flower, p.y);
  o.pos = F.viewProj * vec4f(o.wp, 1.0);
  return o;
}
@fragment fn fsPad(i: POut) -> GOut {
  let r = length(i.lp);
  if (i.f.y > 0.01) {
    // lotus flower: pink petals paling toward the tips, a faint glow so they read at night
    let c = mix(vec3f(0.75, 0.22, 0.38), vec3f(0.95, 0.72, 0.78), saturate(i.f.y * 2.5));
    return gbuf(c, 0.5, normalize(vec3f(i.lp.x, 0.6, i.lp.y)), 0.0, c * 0.35, 1.0, motionVector(i.wp, i.wp), 1.0, 0.6);
  }
  let a = atan2(i.lp.y, i.lp.x);
  let vein = smoothstep(0.85, 1.0, abs(cos(a * 9.0))) * smoothstep(0.1, 0.4, r);
  var c = mix(vec3f(0.05, 0.11, 0.035), vec3f(0.08, 0.14, 0.045), r);
  c = mix(c, vec3f(0.12, 0.17, 0.07), vein * 0.6);
  let rim = smoothstep(0.82, 0.97, r);
  c = mix(c, vec3f(0.16, 0.2, 0.08), rim);
  let n = normalize(vec3f(i.lp.x * (0.25 + rim), 1.0, i.lp.y * (0.25 + rim)));
  let emis = c * (0.25 + 0.6 * rim) * vec3f(0.6, 0.75, 1.0);
  return gbuf(c, 0.3, n, 0.0, emis, 1.0, motionVector(i.wp, i.wp), 1.0, 1.0);
}
`.replace('C_DWOOD', 'vec3f(0.06, 0.035, 0.025)');

export default {
  name: 'garden',

  init(ctx) {
    const d = ctx.device, world = ctx.world;
    const T = world.shared.terrain;
    if (!T) throw new Error('garden needs the terrain module');
    const H = (x, z) => world.heightAt(x, z);
    const R = rng(7070);
    const M = new GardenMesh();
    const lights = [];     // [x,y,z,radius,r,g,b]
    const trees = [];      // [x,y,z,scale,species]
    const reserve = [];    // vegetation exclusion {x,z,hw,hd,angle}
    this.colliders = 0;
    const col = (cx, cy, cz, hx, hy, hz, a) => { world.addCollider(cx, cy, cz, hx, hy, hz, a); this.colliders++; };

    // ---------------- hanging lantern (red paper) at p, with a static light
    const lantern = (p, s = 1, light = true, c = C.lantern) => {
      M.set(c, PAT.LANTERN, 7.5);
      M.prism([p[0], p[1], p[2]], 0.22 * s, 8, -0.3 * s, 0.3 * s, 0, false, 0.22 * s);
      M.prism([p[0], p[1], p[2]], 0.22 * s, 8, 0.3 * s, 0.42 * s, 0, true, 0.12 * s);
      M.prism([p[0], p[1], p[2]], 0.12 * s, 8, -0.42 * s, -0.3 * s, 0, false, 0.22 * s);
      if (light) lights.push([p[0], p[1] - 0.2, p[2], 9 * s, 7 * s, 2.6 * s, 0.9 * s]);
    };

    M.begin();
    // ---------------- causeway hump bridges, willows, lanterns
    const along = (cw, s) => {
      const P = cw.pts; let acc = 0;
      for (let i = 0; i < P.length - 1; i++) {
        const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
        if (acc + L >= s || i === P.length - 2) {
          const t = Math.min(Math.max((s - acc) / L, 0), 1);
          const tx = (P[i + 1][0] - P[i][0]) / L, tz = (P[i + 1][1] - P[i][1]) / L;
          return { x: P[i][0] + (P[i + 1][0] - P[i][0]) * t, z: P[i][1] + (P[i + 1][1] - P[i][1]) * t, tx, tz };
        }
        acc += L;
      }
    };
    const bridgeS = [];
    for (const cw of CAUSEWAYS) {
      const bs = cw.bridges.map((t) => t * cw.length);
      bridgeS.push(bs);
      for (const s0 of bs) this._humpBridge(M, along(cw, s0), col, lantern);
      // willows and peach trees along both sides, lanterns on posts along the path
      for (let s = 12, k = 0; s < cw.length - 12; s += 8.5, k++) {
        if (bs.some((b) => Math.abs(b - s) < 16)) continue;
        const a = along(cw, s);
        const nx = -a.tz, nz = a.tx;
        const side = k % 2 ? 1 : -1;
        const x = a.x + nx * side * (cw.half - 1.6) + (R() - 0.5) * 1.2, z = a.z + nz * side * (cw.half - 1.6) + (R() - 0.5) * 1.2;
        if (H(x, z) < 0.9) continue;
        if (Math.hypot(x + 1500, z - 2120) < 14) continue;   // keep the lake-gardens viewpoint open
        const peach = R() < 0.22;
        trees.push([x, H(x, z), z, peach ? 0.42 + R() * 0.1 : 0.75 + R() * 0.25, peach ? 0 : 3]);
      }
      for (let s = 20, k = 0; s < cw.length - 20; s += 13, k++) {
        if (bs.some((b) => Math.abs(b - s) < 14)) continue;
        const a = along(cw, s);
        const side = k % 2 ? 1 : -1;
        const x = a.x - a.tz * side * 3.2, z = a.z + a.tx * side * 3.2, y = H(x, z);
        if (y < 0.9) continue;
        M.set(C.dwood, PAT.WOOD);
        M.box([x, y, z], 0.07, 0.07, 2.4);
        M.box([x - a.tz * side * -0.3, y + 2.3, z + a.tx * side * -0.3], 0.35, 0.04, 0.08, Math.atan2(a.tx * side, -a.tz * side));
        lantern([x - a.tz * side * -0.55, y + 1.85, z + a.tx * side * -0.55], 0.9, k % 3 === 0);
      }
    }
    this.bridgeCount = bridgeS.flat().length;

    // ---------------- islands: pavilions and trees
    for (const I of ISLANDS) {
      const y = H(I.x, I.z);
      this._pavilion(M, [I.x, y, I.z], I.name === 'Three Pools' ? 6 : 8, I.name === 'Three Pools' ? 3.2 : 3.8, 0.3, col, lantern);
      reserve.push({ x: I.x, z: I.z, hw: 8, hd: 8 });
      for (let k = 0; k < (I.name === 'Three Pools' ? 7 : 16); k++) {
        const a = R() * Math.PI * 2, rr = 12 + R() * I.r * 0.55;
        const x = I.x + Math.cos(a) * rr, z = I.z + Math.sin(a) * rr, h = H(x, z);
        if (h > 1.0) trees.push([x, h, z, 0.55 + R() * 0.4, R() < 0.5 ? 3 : 0]);
      }
    }
    // the three stone lanterns standing in the lake ("Three Pools Mirroring the Moon")
    for (let k = 0; k < 3; k++) {
      const a = -0.5 + k * 0.9;
      const [x, z] = lakeToWorld([-30 + Math.cos(a) * 95, 170 + Math.sin(a) * 95 + 40]);
      M.set(C.stone, PAT.STONE);
      M.prism([x, 0, z], 0.35, 8, -2.0, 0.9, 0, false);
      M.set(C.stone, PAT.PLAIN);
      M.prism([x, 0, z], 0.65, 12, 0.9, 1.3, 0, false, 0.75);
      M.prism([x, 0, z], 0.75, 12, 1.3, 1.9, 0, false, 0.65);
      M.prism([x, 0, z], 0.65, 12, 1.9, 2.2, 0, true, 0.2);
      M.set(C.stone, PAT.PLAIN);
      M.prism([x, 0, z], 0.12, 6, 2.2, 2.7, 0, true, 0.03);
      // five round openings glowing like candle-lit moons
      for (let j = 0; j < 5; j++) {
        const b = (j / 5) * Math.PI * 2;
        M.set([1.0, 0.7, 0.35], PAT.PLAIN, 9);
        M.prism([x + Math.cos(b) * 0.76, 1.6, z + Math.sin(b) * 0.76], 0.13, 8, -0.13, 0.13, 0, true);
      }
      lights.push([x, 1.6, z, 7, 4, 2.4, 1.0]);
    }

    // ---------------- mid-lake pavilion on a stone platform, reached by boat
    {
      const [x, z] = lakeToWorld([352, -120]);
      M.set(C.stone, PAT.STONE);
      M.box([x, -2.5, z], 7.5, 7.5, 3.15, 0.25);
      col(x, -0.9, z, 7.5, 1.6, 7.5, 0.25);
      M.set(C.stone, PAT.PLAIN);
      for (const [u, v] of [[-7.3, -7.3], [7.3, -7.3], [7.3, 7.3], [-7.3, 7.3]]) {
        const c = Math.cos(0.25), s = Math.sin(0.25);
        M.box([x + u * c - v * s, 0.65, z + u * s + v * c], 0.18, 0.18, 1.0, 0.25);
        lantern([x + u * c - v * s, 2.0, z + u * s + v * c], 0.9, (u > 0) === (v > 0));
      }
      this._pavilion(M, [x, 0.65, z], 6, 3.0, 0.15, col, lantern);
    }
    // floating river lanterns drifting on the lake
    for (let k = 0; k < 90; k++) {
      const lx = 120 + R() * 520, lz = -320 + R() * 640;
      const [x, z] = lakeToWorld([lx, lz]);
      if (H(x, z) > -1.0) continue;
      const s = 0.8 + R() * 0.4;
      M.set([1.0, 0.55 + R() * 0.2, 0.25], PAT.LANTERN, 5.5);
      M.box([x, 0.02, z], 0.2 * s, 0.2 * s, 0.32 * s, R() * 3);
      M.set(C.dwood, PAT.PLAIN);
      M.box([x, 0.0, z], 0.26 * s, 0.26 * s, 0.05, R() * 3);
      if (k % 15 === 0) lights.push([x, 0.6, z, 6, 2.5, 1.3, 0.5]);
    }

    // ---------------- viewpoint set pieces (poses 1, 5, 9)
    const env = { M, H, Hf: (x, z) => T.heightAt(x, z), col, lantern, lights, trees, reserve, R,
      pavilion: (c, sides, r, plat) => this._pavilion(M, c, sides, r, plat, col, lantern),
      rock: (c, r, sq) => M.rock(c, r, R, sq) };
    M.begin(); lookoutTower(env);
    M.begin(); lakesideVignette(env);
    M.begin(); this.valleyGlows = cragLookout(env);
    this.hamlets = hillsideLife(env, world);
    M.begin();

    // ---------------- pagoda
    const PG = LANDMARKS.find((l) => l.id === 'pagoda');
    this._pagoda(M, PG, H, col, lantern, lights);
    reserve.push({ x: PG.x, z: PG.z, hw: PG.r + 6, hd: PG.r + 6 });

    // ---------------- Suzhou garden compounds
    const sites = [[880, -150, 70, 50], [330, 610, 62, 46], [-80, -650, 80, 50], [-560, -380, 56, 44]];
    this.compounds = 0;
    for (const [lx, lz, w, dd] of sites) {
      let [x, z] = lakeToWorld([lx, lz]);
      // walk away from the lake until the site is dry
      const lc = lakeToWorld([0, 0]);
      for (let k = 0; k < 20 && Math.min(H(x - w / 2, z), H(x + w / 2, z), H(x, z - dd / 2), H(x, z + dd / 2)) < 1.6; k++) {
        const vx = x - lc[0], vz = z - lc[1], l = Math.hypot(vx, vz);
        x += vx / l * 15; z += vz / l * 15;
      }
      const ang = Math.atan2(lc[1] - z, lc[0] - x);   // face the lake
      M.begin();
      this._compound(M, x, z, w, dd, ang, H, R, col, lantern, trees, lights);
      M.end(3500);
      reserve.push({ x, z, hw: w / 2 + 4, hd: dd / 2 + 4, angle: ang + Math.PI / 2 });
      this.compounds++;
      (this.sites ||= []).push([Math.round(x), Math.round(z), +ang.toFixed(2)]);
    }

    // ---------------- lotus pads
    const padData = [];
    const patches = [[0, -430, 160], [-30, 170, 140], [-460, 20, 130], [560, -120, 120], [250, 380, 120], [-600, -330, 100], [385, -280, 55], [470, -300, 40], [-575, 150, 70], [-520, 220, 50]];
    for (const [px, pz, pr] of patches) {
      for (let k = 0; k < 900; k++) {
        const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * pr;
        const lx = px + Math.cos(a) * rr * 1.3, lz = pz + Math.sin(a) * rr * 0.8;
        if (Math.sin(lx * 0.05) * Math.cos(lz * 0.06) + R() * 0.6 < 0.1) continue;
        const [x, z] = lakeToWorld([lx, lz]);
        const h = H(x, z);
        if (h > -1.2 || h < -5.2) continue;
        const flower = R() < 0.12 ? 1 : 0;
        padData.push(x, z, 0.35 + R() * 0.55, R() * 6.2 + flower * 10);
      }
    }
    this.padCount = padData.length / 4;

    M.end();
    this.pieces = M.pieces;
    this.visFirst = new Uint32Array(this.pieces.length); this.visCount = new Uint32Array(this.pieces.length); this.nVis = 0;
    // ---------------- buffers
    world.shared.gardenTrees = trees;
    world.shared.gardenReserve = reserve;
    for (const L of lights) ctx.lights.add(L[0], L[1], L[2], L[3], L[4], L[5], L[6], 0);
    this.lightCount = lights.length;
    this.verts = new Float32Array(M.v);
    this.indexCount = M.i.length;
    this.vbuf = d.createBuffer({ size: this.verts.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.vbuf, 0, this.verts);
    this.ibuf = d.createBuffer({ size: M.i.length * 4, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.ibuf, 0, new Uint32Array(M.i));
    const pd = new Float32Array(Math.max(padData.length, 4)); pd.set(padData);
    this.padBuf = d.createBuffer({ size: pd.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.padBuf, 0, pd);
    // pad mesh: notched disc + a small flower cup (y > 0 vertices)
    const pv = [], pi = [];
    const seg = 14;
    pv.push(0, 0, 0);
    for (let k = 0; k <= seg; k++) { const a = 0.35 + (k / seg) * (Math.PI * 2 - 0.5); pv.push(Math.cos(a), 0, Math.sin(a)); }
    for (let k = 0; k < seg; k++) pi.push(0, k + 2, k + 1);
    // flower: two rings of six petals (quads opening upward)
    for (let ring = 0; ring < 2; ring++) for (let k = 0; k < 6; k++) {
      const a = (k + ring * 0.5) / 6 * Math.PI * 2, w = 0.16, b = pv.length / 3;
      const ca = Math.cos(a), sa = Math.sin(a), tx = -sa * w, tz = ca * w;
      const rIn = 0.05, rOut = ring ? 0.32 : 0.24, h0 = 0.04, h1 = ring ? 0.28 : 0.42;
      pv.push(ca * rIn - tx, h0, sa * rIn - tz, ca * rIn + tx, h0, sa * rIn + tz, ca * rOut + tx, h1, sa * rOut + tz, ca * rOut - tx, h1, sa * rOut - tz);
      pi.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    this.padIndexCount = pi.length;
    this.pvbuf = d.createBuffer({ size: pv.length * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.pvbuf, 0, new Float32Array(pv));
    this.pibuf = d.createBuffer({ size: pi.length * 4, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.pibuf, 0, new Uint32Array(pi));

    this.layout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
    ] });
    this.group = d.createBindGroup({ layout: this.layout, entries: [
      { binding: 0, resource: T.tNoise.createView() }, { binding: 1, resource: T.sampRep }, { binding: 2, resource: { buffer: this.padBuf } }] });
    const r = ctx.renderer;
    const f = 4;
    this.pipe = r.gbufferPipeline({ label: 'garden', code: GARDEN_WGSL, groups: [this.layout], cull: 'none', buffers: [{ arrayStride: STRIDE * 4, attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 3 * f, format: 'float32x3' },
      { shaderLocation: 2, offset: 6 * f, format: 'float32x3' }, { shaderLocation: 3, offset: 9 * f, format: 'float32' },
      { shaderLocation: 4, offset: 10 * f, format: 'float32' }, { shaderLocation: 5, offset: 11 * f, format: 'float32x2' }] }] });
    this.padPipe = r.gbufferPipeline({ label: 'lotus', code: GARDEN_WGSL, vs: 'vsPad', fs: 'fsPad', groups: [this.layout], cull: 'none',
      buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }] });
    world.shared.garden = { lights: this.lightCount, compounds: this.compounds, hamlets: this.hamlets };
  },

  // Stone hump bridge across a causeway gap. a = {x, z, tx, tz} at the bridge centre.
  _humpBridge(M, a, col, lantern) {
    const L = 2 * (BRIDGE_GAP + 4.5), W = 5.6, RISE = 4.0, AR = 5.3, AY = -0.4;
    const top = CAUSEWAY_TOP + 0.02;
    const yT = (u) => top + RISE * Math.cos(Math.PI * u / L) ** 2;
    const yB = (u) => (Math.abs(u) < AR ? AY + Math.sqrt(AR * AR - u * u) : -2.5);
    const nx = -a.tz, nz = a.tx;
    const P = (u, v, y) => [a.x + a.tx * u + nx * v, y, a.z + a.tz * u + nz * v];
    const S = 44;
    const us = [];
    for (let k = 0; k <= S; k++) us.push(-L / 2 + (k / S) * L);
    // make sure the arch springing points are sampled
    us.push(-AR + 0.001, AR - 0.001, -AR - 0.001, AR + 0.001); us.sort((p, q) => p - q);
    M.set(C.stone, PAT.STONE);
    for (let k = 0; k < us.length - 1; k++) {
      const u0 = us[k], u1 = us[k + 1];
      for (const sd of [-1, 1]) {
        const v = sd * W / 2;
        M.quad(P(u0, v, yB(u0)), P(u1, v, yB(u1)), P(u1, v, yT(u1)), P(u0, v, yT(u0)), [nx * sd, 0, nz * sd], [[u0, yB(u0)], [u1, yB(u1)], [u1, yT(u1)], [u0, yT(u0)]]);
        // parapet
        const pv = sd * (W / 2 - 0.15);
        M.set(C.stone, PAT.PLAIN);
        M.quad(P(u0, sd * W / 2, yT(u0)), P(u1, sd * W / 2, yT(u1)), P(u1, sd * W / 2, yT(u1) + 0.8), P(u0, sd * W / 2, yT(u0) + 0.8), [nx * sd, 0, nz * sd]);
        M.quad(P(u0, pv - sd * 0.15, yT(u0) + 0.8), P(u1, pv - sd * 0.15, yT(u1) + 0.8), P(u1, sd * W / 2, yT(u1) + 0.8), P(u0, sd * W / 2, yT(u0) + 0.8), [0, 1, 0]);
        M.quad(P(u0, pv - sd * 0.15, yT(u0)), P(u1, pv - sd * 0.15, yT(u1)), P(u1, pv - sd * 0.15, yT(u1) + 0.8), P(u0, pv - sd * 0.15, yT(u0) + 0.8), [-nx * sd, 0, -nz * sd]);
        M.set(C.stone, PAT.STONE);
      }
      // deck (stepped look comes from the stone pattern)
      const du = u1 - u0, dy = yT(u1) - yT(u0);
      const dn = V3.norm([-a.tx * dy, du, -a.tz * dy]);
      M.quad(P(u0, -W / 2, yT(u0)), P(u1, -W / 2, yT(u1)), P(u1, W / 2, yT(u1)), P(u0, W / 2, yT(u0)), dn, [[u0, -W / 2], [u1, -W / 2], [u1, W / 2], [u0, W / 2]]);
      // vault
      if (Math.abs((u0 + u1) / 2) < AR) {
        const vn = V3.norm([a.tx * (u0 + u1) / 2, -(yB((u0 + u1) / 2) - AY), a.tz * (u0 + u1) / 2]);
        M.quad(P(u0, -W / 2, yB(u0)), P(u1, -W / 2, yB(u1)), P(u1, W / 2, yB(u1)), P(u0, W / 2, yB(u0)), V3.mul(vn, -1), [[u0, -W / 2], [u1, -W / 2], [u1, W / 2], [u0, W / 2]]);
      }
    }
    // stepped colliders along the hump + parapets
    const ang = Math.atan2(a.tz, a.tx);
    const NS = 26;   // step rise stays below the controller's 0.65 m step height
    for (let k = 0; k < NS; k++) {
      const u = -L / 2 + (k + 0.5) * L / NS;
      const y = yT(u);
      const [cx, , cz] = P(u, 0, 0);
      col(cx, y - 1.5, cz, L / NS / 2 + 0.05, 1.5, W / 2 - 0.3, ang);
      for (const sd of [-1, 1]) { const [px, , pz] = P(u, sd * (W / 2 - 0.15), 0); col(px, y + 0.4, pz, L / NS / 2 + 0.05, 0.4, 0.15, ang); }
    }
    // lanterns at the bridge ends
    for (const su of [-1, 1]) for (const sd of [-1, 1]) {
      const p = P(su * (L / 2 - 0.6), sd * (W / 2 - 0.15), 0);
      p[1] = yT(su * (L / 2 - 0.6)) + 0.8;
      M.set(C.dstone, PAT.PLAIN); M.box(p, 0.16, 0.16, 0.9);
      if (sd > 0) lantern([p[0], p[1] + 1.25, p[2]], 0.8, su > 0, [1.0, 0.6, 0.25]);
    }
  },

  // Open pavilion: polygon of red columns on a stone platform with an upturned-eave roof.
  _pavilion(M, c, sides, r, plat, col, lantern) {
    const y = c[1];
    M.set(C.stone, PAT.STONE);
    M.prism([c[0], y - 1.5, c[2]], r + 0.9, sides, 0, 1.5 + plat, Math.PI / sides);
    const fy = y + plat;
    M.set(C.wood, PAT.WOOD);
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2 + Math.PI / sides;
      M.prism([c[0] + Math.cos(a) * r, fy, c[2] + Math.sin(a) * r], 0.16, 6, 0, 3.1, 0, false);
    }
    // beam ring
    M.prism([c[0], fy, c[2]], r + 0.15, sides, 2.9, 3.25, Math.PI / sides, false);
    M.set(C.dwood, PAT.WOOD);
    M.prism([c[0], fy, c[2]], r - 0.15, sides, 3.25, 2.9, Math.PI / sides, false);
    // seats (bench along the rail)
    M.set(C.wood, PAT.WOOD);
    M.prism([c[0], fy, c[2]], r + 0.05, sides, 0.0, 0.45, Math.PI / sides, false);
    M.set(C.tile, PAT.TILE);
    const eave = M.roof([c[0], fy, c[2]], sides, r + 1.4, 3.25, 0, 3.25 + r * 0.85, Math.PI / sides, 0.85, 0.14);
    M.set(C.tile, PAT.PLAIN);
    M.prism([c[0], fy, c[2]], 0.18, 6, 3.25 + r * 0.85 - 0.1, 3.25 + r * 0.85 + 0.7, 0, true, 0.04);   // finial
    lantern([c[0], fy + 2.4, c[2]], 1.1);
    col(c[0], y + plat / 2 - 0.5, c[2], r * 0.75, plat / 2 + 0.5, r * 0.75, 0);
    // lanterns at alternate eave corners
    const M6 = 6;
    for (let k = 0; k < sides; k += 2) {
      const e = eave[k * M6];
      lantern([e[0], e[1] - 0.7, e[2]], 0.7, false);
    }
  },

  _pagoda(M, PG, H, col, lantern, lights) {
    const cx = PG.x, cz = PG.z;
    let y0 = 1e9; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; y0 = Math.min(y0, H(cx + Math.cos(a) * 16, cz + Math.sin(a) * 16)); }
    const yb = H(cx, cz);
    const rot = Math.PI / 8;
    // two-step stone podium
    M.set(C.stone, PAT.STONE);
    M.prism([cx, y0 - 3, cz], 16, 8, 0, yb - y0 + 4.2, rot);
    M.prism([cx, yb + 1.2, cz], 12.5, 8, 0, 1.6, rot);
    col(cx, yb - 0.5, cz, 13, 3.3, 13, 0); col(cx, yb - 0.5, cz, 13, 3.3, 13, Math.PI / 4);
    let y = yb + 2.8;
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const r = 8.4 - i * 0.75, h = i === 0 ? 7.2 : 5.6;
      // body: gold-washed walls with glowing doors on every face
      M.set(C.gold, PAT.PAGODA, 5.0 - i * 0.4);
      M.prism([cx, y, cz], r, 8, 0, h, rot, false, r * 0.97);
      M.set(C.wood, PAT.WOOD);
      for (let k = 0; k < 8; k++) {
        const a = rot + (k / 8) * Math.PI * 2;
        M.prism([cx + Math.cos(a) * r * 1.01, y, cz + Math.sin(a) * r * 1.01], 0.32, 6, 0, h, 0, false);
      }
      for (let k = 0; k < 8; k++) {
        const a = rot + ((k + 0.5) / 8) * Math.PI * 2;
        const ap = r * 0.925 * 1.012;
        const ox = Math.cos(a), oz = Math.sin(a), tx = -oz, tz = ox;
        const w = 1.1, dh = Math.min(h * 0.55, 3.2);
        const b = [cx + ox * ap, y + 0.4, cz + oz * ap];
        M.set([1, 1, 1], PAT.LATTICE, 3.2);
        M.quad([b[0] - tx * w, b[1], b[2] - tz * w], [b[0] + tx * w, b[1], b[2] + tz * w], [b[0] + tx * w, b[1] + dh, b[2] + tz * w], [b[0] - tx * w, b[1] + dh, b[2] - tz * w], [ox, 0, oz]);
      }
      // balcony floor + eave
      y += h;
      const rNext = i < tiers - 1 ? 8.4 - (i + 1) * 0.75 : 0;
      M.set(C.tile, PAT.TILE);
      const eave = M.roof([cx, y, cz], 8, r + 2.9, 0, i < tiers - 1 ? rNext * 0.98 : 0, i < tiers - 1 ? 1.9 : 6.5, rot, 1.2, 0.13, 6, 5);
      // warm lanterns at the eave corners; a few real lights
      for (let k = 0; k < 8; k++) {
        const e = eave[k * 6];
        lantern([e[0], e[1] - 0.8, e[2]], 0.9, (k + i) % 2 === 0, [1.0, 0.45, 0.12]);
      }
      // eave underside uplight glow
      lights.push([cx, y - 0.5, cz, r + 6, 8, 4.5, 1.6]);
      y += i < tiers - 1 ? 1.9 : 6.5;
    }
    // spire
    M.set(C.gold, PAT.PLAIN, 0.4);
    M.prism([cx, y - 0.4, cz], 0.35, 8, 0, 9, rot, true, 0.12);
    for (let k = 0; k < 6; k++) M.prism([cx, y + 1.5 + k * 1.1, cz], 0.75 - k * 0.07, 12, 0, 0.18, 0, true);
    // floodlights at the podium
    for (let k = 0; k < 4; k++) {
      const a = rot + (k / 4) * Math.PI * 2 + 0.3;
      lights.push([cx + Math.cos(a) * 14, yb + 3.5, cz + Math.sin(a) * 14, 38, 60, 33, 12]);
    }
  },

  // Suzhou garden compound centred at (x, z), size w x d, rotated so local -z faces the lake.
  _compound(M, x, z, w, d, ang, H, R, col, lantern, trees, lights) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    // local frame: u along the front wall, v toward the lake (front = +v)
    const fx = ca, fz = sa;           // toward the lake
    const ux = -sa, uz = ca;
    const P = (u, v, y) => [x + ux * u + fx * v, y, z + uz * u + fz * v];
    let ymin = 1e9, ymax = -1e9;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const q = P(i * w / 2, j * d / 2, 0); const h = H(q[0], q[2]); ymin = Math.min(ymin, h); ymax = Math.max(ymax, h); }
    const y0 = ymax + 0.25;
    const yaw = Math.atan2(uz, ux);
    // courtyard platform
    M.set(C.dstone, PAT.STONE);
    M.box(P(0, 0, ymin - 1.5), w / 2 + 0.6, d / 2 + 0.6, y0 - ymin + 1.5, yaw, false);
    M.set(C.gravel, PAT.GRAVEL);
    M.quad(P(-w / 2 - 0.6, -d / 2 - 0.6, y0), P(w / 2 + 0.6, -d / 2 - 0.6, y0), P(w / 2 + 0.6, d / 2 + 0.6, y0), P(-w / 2 - 0.6, d / 2 + 0.6, y0), [0, 1, 0]);
    col(...P(0, 0, (ymin - 1.5 + y0) / 2), w / 2 + 0.6, (y0 - ymin + 1.5) / 2, d / 2 + 0.6, yaw);
    // perimeter walls (front wall has a moon gate)
    const WH = 3.6, WT = 0.22;
    const wall = (u0, v0, u1, v1, gate) => {
      const L = Math.hypot(u1 - u0, v1 - v0);
      const du = (u1 - u0) / L, dv = (v1 - v0) / L;
      const nu = -dv, nv = du;    // outward normal
      const A = (s, o, y) => P(u0 + du * s + nu * o, v0 + dv * s + nv * o, y);
      const nW = V3.norm([ux * nu + fx * nv, 0, uz * nu + fz * nv]);
      const face = (o, n, s0, s1) => {
        M.set(C.plaster, PAT.PLASTER);
        M.quad(A(s0, o, y0), A(s1, o, y0), A(s1, o, y0 + WH), A(s0, o, y0 + WH), n, [[s0, 0], [s1, 0], [s1, WH], [s0, WH]]);
      };
      const segs = gate ? [[0, L / 2 - 1.6], [L / 2 + 1.6, L]] : [[0, L]];
      for (const [s0, s1] of segs) {
        face(WT, nW, s0, s1); face(-WT, V3.mul(nW, -1), s0, s1);
        const mid = (s0 + s1) / 2;
        col(...A(mid, 0, y0 + WH / 2), (s1 - s0) / 2, WH / 2 + 0.2, WT + 0.05, Math.atan2(uz * du + fz * dv, ux * du + fx * dv));
      }
      if (gate) {
        // moon gate: circular opening in a wall panel (ring between the circle and the panel rectangle)
        const rr = 1.45, cy = y0 + rr + 0.12, s0 = L / 2 - 1.6, s1 = L / 2 + 1.6, sc = L / 2;
        const N = 28;
        for (const o of [WT, -WT]) {
          const n = o > 0 ? nW : V3.mul(nW, -1);
          M.set(C.plaster, PAT.PLASTER);
          for (let k = 0; k < N; k++) {
            const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
            const ray = (a) => {   // intersect the panel rectangle from the circle centre
              const cxr = Math.cos(a), cyr = Math.sin(a);
              const tx = cxr > 0 ? (s1 - sc) / cxr : cxr < 0 ? (s0 - sc) / cxr : 1e9;
              const ty = cyr > 0 ? (y0 + WH - cy) / cyr : cyr < 0 ? (y0 - cy) / cyr : 1e9;
              const t = Math.min(tx, ty);
              return [sc + cxr * t, cy + cyr * t];
            };
            const r0 = ray(a0), r1 = ray(a1);
            const c0 = [sc + Math.cos(a0) * rr, cy + Math.sin(a0) * rr], c1 = [sc + Math.cos(a1) * rr, cy + Math.sin(a1) * rr];
            M.quad(A(c0[0], o, c0[1]), A(c1[0], o, c1[1]), A(r1[0], o, r1[1]), A(r0[0], o, r0[1]), n, [[c0[0], c0[1] - y0], [c1[0], c1[1] - y0], [r1[0], r1[1] - y0], [r0[0], r0[1] - y0]]);
          }
          // gate lanterns
          lantern(A(sc - 2.1, o * 4, y0 + 2.6), 1.0, o > 0);
          lantern(A(sc + 2.1, o * 4, y0 + 2.6), 1.0, false);
        }
        // reveal of the circle (grey stone ring)
        M.set(C.stone, PAT.PLAIN);
        for (let k = 0; k < N; k++) {
          const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
          const p0 = [sc + Math.cos(a0) * rr, cy + Math.sin(a0) * rr], p1 = [sc + Math.cos(a1) * rr, cy + Math.sin(a1) * rr];
          const am = (a0 + a1) / 2;
          const inN = V3.norm([-(ux * du + fx * dv) * Math.cos(am), -Math.sin(am), -(uz * du + fz * dv) * Math.cos(am)]);
          M.quad(A(p0[0], WT, p0[1]), A(p1[0], WT, p1[1]), A(p1[0], -WT, p1[1]), A(p0[0], -WT, p0[1]), inN);
        }
      }
      // wall top: grey tile coping (small gable) and the wall cap
      M.set(C.tile, PAT.TILE);
      const ov = 0.42, ry = y0 + WH + 0.42;
      M.quad(A(-0.2, WT + ov, y0 + WH - 0.05), A(L + 0.2, WT + ov, y0 + WH - 0.05), A(L + 0.2, 0, ry), A(-0.2, 0, ry), V3.norm([nW[0], 1.2, nW[2]]), [[0, 0], [L, 0], [L, 1], [0, 1]]);
      M.quad(A(-0.2, -WT - ov, y0 + WH - 0.05), A(L + 0.2, -WT - ov, y0 + WH - 0.05), A(L + 0.2, 0, ry), A(-0.2, 0, ry), V3.norm([-nW[0], 1.2, -nW[2]]), [[0, 0], [L, 0], [L, 1], [0, 1]]);
      // lattice windows (leak windows) along the wall, glowing on both faces
      const nwin = Math.floor(L / 9);
      for (let k = 0; k < nwin; k++) {
        const s = (k + 0.5) * L / nwin;
        if (gate && Math.abs(s - L / 2) < 3.5) continue;
        const ww = 0.6, wy = y0 + 1.4, wh = 0.9;
        M.set([1, 1, 1], PAT.LATTICE, 1.8);
        for (const o of [WT + 0.01, -WT - 0.01]) {
          const n = o > 0 ? nW : V3.mul(nW, -1);
          M.quad(A(s - ww, o, wy), A(s + ww, o, wy), A(s + ww, o, wy + wh), A(s - ww, o, wy + wh), n, [[0, 0], [1, 0], [1, 1], [0, 1]]);
        }
      }
    };
    wall(-w / 2, d / 2, w / 2, d / 2, true);        // front (lake side)
    wall(w / 2, d / 2, w / 2, -d / 2, false);
    wall(w / 2, -d / 2, -w / 2, -d / 2, false);
    wall(-w / 2, -d / 2, -w / 2, d / 2, false);

    // main hall at the back: white walls, glowing lattice front, hip roof with upturned corners
    const hc = P(-w * 0.12, -d / 2 + 7, y0);
    M.set(C.wood, PAT.WOOD);
    M.box(hc, 6.2, 4.2, 0.45, yaw);
    M.set(C.plaster, PAT.PLASTER);
    M.box([hc[0], y0 + 0.45, hc[2]], 5.8, 3.8, 4.0, yaw, false);
    M.set([1, 1, 1], PAT.LATTICE, 2.4);
    for (let k = -2; k <= 2; k++) {
      const b = P(-w * 0.12 + k * 2.2, -d / 2 + 7 + 3.82, y0 + 0.9);
      M.quad([b[0] - ux * 0.95, b[1], b[2] - uz * 0.95], [b[0] + ux * 0.95, b[1], b[2] + uz * 0.95], [b[0] + ux * 0.95, b[1] + 2.9, b[2] + uz * 0.95], [b[0] - ux * 0.95, b[1] + 2.9, b[2] - uz * 0.95], [fx, 0, fz]);
    }
    M.set(C.tile, PAT.TILE);
    M.roof([hc[0], y0 + 4.45, hc[2]], 4, 7.8, 0, 0, 3.6, yaw + Math.PI / 4, 1.1, 0.12, 8, 6);
    col(hc[0], y0 + 2.2, hc[2], 5.9, 2.2, 3.9, yaw);
    lights.push([...P(-w * 0.12, -d / 2 + 13, y0 + 2.5), 14, 6, 3.2, 1.2]);

    // mirror pond with a zigzag bridge, rockery and a hexagonal pavilion
    const pc = P(w * 0.12, 3, y0 + 0.06);
    M.set(C.pond, PAT.POND);
    const PR = Math.min(w, d) * 0.26;
    const pts = [];
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; const rr = PR * (1 + 0.18 * Math.sin(a * 3 + 1) + 0.1 * Math.sin(a * 5)); pts.push([pc[0] + (ux * Math.cos(a) * 1.4 + fx * Math.sin(a)) * rr, pc[1], pc[2] + (uz * Math.cos(a) * 1.4 + fz * Math.sin(a)) * rr]); }
    const ctr = M.vtx(pc, [0, 1, 0], [0, 0]);
    for (let k = 0; k < 24; k++) { const v0 = M.vtx(pts[k], [0, 1, 0], [0, 0]), v1 = M.vtx(pts[(k + 1) % 24], [0, 1, 0], [0, 0]); M.tri(ctr, v0, v1, [0, 1, 0]); }
    // stone edge
    M.set(C.taihu, PAT.STONE);
    for (let k = 0; k < 24; k += 2) M.rock([pts[k][0], y0 - 0.2, pts[k][2]], 0.45 + R() * 0.35, R, 0.6);
    // zigzag bridge across the pond (3 legs)
    M.set(C.stone, PAT.STONE);
    const legs = [[-PR * 1.4, -PR * 0.3], [-PR * 0.4, PR * 0.25], [PR * 0.5, -PR * 0.2], [PR * 1.45, PR * 0.3]];
    for (let k = 0; k < legs.length - 1; k++) {
      const a0 = P(w * 0.12 + legs[k][0], 3 + legs[k][1], 0), a1 = P(w * 0.12 + legs[k + 1][0], 3 + legs[k + 1][1], 0);
      const mx = (a0[0] + a1[0]) / 2, mz = (a0[2] + a1[2]) / 2, L = Math.hypot(a1[0] - a0[0], a1[2] - a0[2]);
      const by = Math.atan2(a1[2] - a0[2], a1[0] - a0[0]);
      M.box([mx, y0 + 0.25, mz], L / 2 + 0.6, 0.75, 0.15, by);
      M.set(C.wood, PAT.WOOD);
      for (const sd of [-1, 1]) M.box([mx - Math.sin(by) * 0.7 * sd, y0 + 0.4, mz + Math.cos(by) * 0.7 * sd], L / 2 + 0.6, 0.04, 0.6, by);
      M.set(C.stone, PAT.STONE);
      col(mx, y0 + 0.2, mz, L / 2 + 0.6, 0.2, 0.7, by);
    }
    // rockery: a cluster of eroded Taihu stones
    M.set(C.taihu, PAT.STONE);
    const rk = P(w * 0.34, -d * 0.12, y0);
    for (let k = 0; k < 9; k++) {
      const a = R() * Math.PI * 2, rr = R() * 3.5;
      M.rock([rk[0] + Math.cos(a) * rr, y0 - 0.3, rk[2] + Math.sin(a) * rr], 0.6 + R() * 1.1, R, 1.0 + R() * 0.9);
    }
    col(rk[0], y0 + 1.2, rk[2], 3.2, 1.2, 3.2, 0);
    // pavilion beside the pond
    this._pavilion(M, P(-w * 0.32, 4, y0), 6, 2.4, 0.4, col, lantern);
    // trees inside the walls
    trees.push([...P(w * 0.38, 8, y0), 0.7, 3]);
    trees.push([...P(-w * 0.4, -d * 0.25, y0), 0.5, 0]);
    trees.push([...P(w * 0.05, -d * 0.3, y0), 0.45, 0]);
  },

  update(ctx) {
    // cull pieces: distance and a generous view cone
    const c = ctx.cam, cp = Math.cos(c.pitch);
    const fx = -Math.sin(c.yaw) * cp, fy = Math.sin(c.pitch), fz = -Math.cos(c.yaw) * cp;
    let n = 0;
    for (const p of this.pieces) {
      const dx = p.c[0] - c.x, dy = p.c[1] - c.y, dz = p.c[2] - c.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d - p.r > p.maxDist) continue;
      if (d > p.r && (dx * fx + dy * fy + dz * fz) / d < Math.cos(1.25) - p.r / d) continue;
      this.visFirst[n] = p.first; this.visCount[n] = p.count; n++;
    }
    this.nVis = n;
  },

  gbuffer(ctx, pass) {
    if (ctx.hideA > 1) return;   // dev: measure engineer-A cost (1 = hide trees, 2 = hide everything of A)
    pass.setPipeline(this.pipe);
    pass.setBindGroup(1, this.group);
    pass.setVertexBuffer(0, this.vbuf);
    pass.setIndexBuffer(this.ibuf, 'uint32');
    for (let k = 0; k < this.nVis; k++) pass.drawIndexed(this.visCount[k], 1, this.visFirst[k]);
    if (this.padCount) {
      pass.setPipeline(this.padPipe);
      pass.setVertexBuffer(0, this.pvbuf);
      pass.setIndexBuffer(this.pibuf, 'uint32');
      pass.drawIndexed(this.padIndexCount, this.padCount);
    }
  },
};
