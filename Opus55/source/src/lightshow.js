// Bund-style river light show (active while F.show.x > 0; timing from world.js showState).
//  - about ten volumetric searchlights, one per rooftop (world.shared.towerTops), each with a visible lit fixture.
//    Every beam has its own fan-out direction, elevation, sweep speed and phase, choreographed in 8 s sections
//    (rising fan, sweeps, crossing pairs, strobing pillars, rotating cones, wave, converging finale) on the beat.
//  - two laser fans from lit plinths on the east embankment, sweeping across the river
//  - outside the show: three slow ambient searchlights
// Beams are additive camera-facing quads; the fragment shader integrates a soft Gaussian beam analytically along the
// view ray, ends it softly at opaque geometry (depth) and attenuates it by the froxel fog transmittance.
// Reflections: each beam also draws a wedge on the river surface that integrates the glossy (rough water) reflection
// of points along the beam, giving long broken vertical streaks. Beams and reflections render at half resolution.

import { beamStore, WGSL_BEAMS, MAX_BEAMS, BEAM_FLOATS } from './showBeams.js';
import { WGSL_LIB, WGSL_FRAME } from './common.js';
import { shader } from './gpu.js';
import { rng } from './math.js';
import water from './water.js';

const MAX_FIXTURES = 24;

const BEAM_WGSL = /* wgsl */ `
${WGSL_BEAMS}
@group(1) @binding(0) var<storage, read> beams: Beams;
@group(1) @binding(1) var depthTex: texture_depth_2d;
@group(1) @binding(2) var waveTex: texture_2d<f32>;   // the water's tiling wave slopes (for reflections)

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) @interpolate(flat) bi: u32,
};

// Instances [0, n) draw the beams; [n, 2n) draw a wedge on the water (y = 0) where the beam's reflection can appear.
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  let n = u32(beams.info.x);
  var o: VOut;
  o.bi = ii;
  let cam = F.camPos.xyz;
  if (ii >= n && beams.b[ii - n].d.w >= 0.5) {
    let bm = beams.b[ii - n];
    let f0 = vec2f(cam.x, cam.z);
    // reflections of far beams are negligible (energy falls with distance squared): skip their wedge
    if (length(bm.o.xz - f0) > 2600.0) { o.pos = vec4f(0.0, 0.0, 0.0, 1.0); o.wp = vec3f(0.0); return o; }
    let pO = bm.o.xz;
    let pE = (bm.o.xyz + bm.d.xyz * bm.o.w * 0.6).xz;
    var dir = (pO + pE) * 0.5 - f0;
    if (dot(dir, dir) < 1.0) { dir = vec2f(F.camFwd.x, F.camFwd.z) + 1e-3; }
    dir = normalize(dir);
    let side = vec2f(-dir.y, dir.x);
    let far = max(dot(pO - f0, dir), dot(pE - f0, dir));
    let lat = max(abs(dot(pO - f0, side)), abs(dot(pE - f0, side)));
    let wf = lat + far * 0.18 + 40.0;
    var cs = array<vec2f, 6>(vec2f(0.0, -1.0), vec2f(0.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, -1.0), vec2f(0.0, 1.0), vec2f(1.0, 1.0));
    let c = cs[vi];
    let along = mix(-15.0, max(far, 50.0) * 1.25 + 60.0, c.x);
    let w = mix(30.0, wf, c.x) * c.y;
    let p = f0 + dir * along + side * w;
    o.wp = vec3f(p.x, 0.0, p.y);
    o.pos = F.viewProj * vec4f(o.wp, 1.0);
    return o;
  }
  // beams, and the mirror images (virtual beams below y = 0) of the thin lasers
  let mirrored = ii >= n;
  var bm = beams.b[select(ii, ii - n, mirrored)];
  if (mirrored) {
    bm.o = vec4f(bm.o.x, -bm.o.y, bm.o.z, bm.o.w);
    bm.d = vec4f(bm.d.x, -bm.d.y, bm.d.z, bm.d.w);
  }
  var ends = array<f32, 6>(0.0, 0.0, 1.0, 1.0, 0.0, 1.0);
  var sides = array<f32, 6>(-1.0, 1.0, -1.0, -1.0, 1.0, 1.0);
  let L = bm.o.w;
  let d0 = max(length(cam - bm.o.xyz), 1.0);
  let pixAng = 4.0 * F.camRight.w * F.res.w;
  let u = ends[vi] * L - (1.0 - ends[vi]) * max(bm.d.w * 6.0, pixAng * d0 * 10.0);
  let pe = bm.o.xyz + bm.d.xyz * u;
  let tc = cam - pe;
  let dist = max(length(tc), 1.0);
  var side = cross(bm.d.xyz, tc / dist);
  if (dot(side, side) < 1e-6) { side = vec3f(1.0, 0.0, 0.0); }
  side = normalize(side);
  let r = max(bm.d.w * select(1.0, 4.0, u <= 0.0) + bm.c.w * max(u, 0.0), pixAng * dist * select(1.2, 10.0, u <= 0.0));
  // widen when seen along the axis so the quad still covers the projected disc
  let sinT = length(cross(bm.d.xyz, tc / dist));
  let w = r * 2.3 / max(sinT, 0.25) + select(0.0, dist * 0.02 + r * 3.0, mirrored);
  o.wp = pe + side * w * sides[vi];
  o.pos = F.viewProj * vec4f(o.wp, 1.0);
  return o;
}

// Glossy reflection of a beam on rough water: points along the beam act as lights; a Beckmann lobe around the
// (pre-blurred) wave normal spreads each into a long vertical streak, broken up by the wave pattern.
fn beamReflection(P: vec3f, V: vec3f, nrm: vec3f, bm: Beam, jit: f32) -> vec3f {
  // lasers: tight lobe (thin broken lines); searchlights: wider rain-roughened lobe (long streaks)
  let sg = select(0.07, 0.04, bm.d.w < 0.5);
  let s2 = sg * sg;
  let NdotV = max(dot(nrm, V), 0.15);
  var acc = 0.0;
  let L = bm.o.w * 0.8;
  for (var k = 0; k < 5; k++) {
    let u = L * (f32(k) + jit) / 5.0;
    let B = bm.o.xyz + bm.d.xyz * u;
    if (B.y <= 0.0) { continue; }
    let dv = B - P;
    let dist = max(length(dv), 1.0);
    let h = normalize(V + dv / dist);
    let c = max(dot(nrm, h), 1e-3);
    let c2 = c * c;
    let D = exp(-(1.0 - c2) / (c2 * s2)) / (PI * s2 * c2 * c2);
    let ru = bm.d.w + bm.c.w * u;
    let haze = 0.3 + 0.7 * exp(-B.y * 0.0012);
    let fade = 1.0 - smoothstep(L * 0.4, L, u);
    acc += bm.d.w * min(bm.d.w / ru, 1.0) * haze * fade * D * (L / 5.0) / (max(dist, 450.0) * max(dist, 450.0) * 4.0 * NdotV);
  }
  // thin lasers: keep their (very close) reflections modest and narrow
  return bm.c.rgb * acc * select(1.0, 0.25, bm.d.w < 0.5);
}

// Rendered at half resolution (pixel sizes doubled); composited additively in the forward pass.
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  let cam = F.camPos.xyz;
  let rd = normalize(i.wp - cam);
  let fd = vec2i(textureDimensions(depthTex)) - 1;
  let px = min(vec2i(i.pos.xy * 2.0), fd);
  let uv = i.pos.xy * 2.0 * F.res.zw;
  let d = textureLoad(depthTex, px, 0);
  let cosF = max(dot(rd, F.camFwd.xyz), 0.05);
  var maxT = 1e5;
  if (d > 0.0) { maxT = linearDepth(d) / cosF; }
  let n = u32(beams.info.x);
  let pixAng = 4.0 * F.camRight.w * F.res.w;
  let t = time();
  var c = vec3f(0.0);
  var s = 1.0;
  if (i.bi < n) {
    // the river surface also ends a beam (water is not in the depth buffer)
    if (rd.y < 0.0 && cam.y > 0.0) { maxT = min(maxT, -cam.y / rd.y); }
    let bm = beams.b[i.bi];
    c = beamGlow(cam, rd, maxT, bm, pixAng, t);
    s = clamp(dot(bm.o.xyz + bm.d.xyz * clamp(dot(cam - bm.o.xyz, bm.d.xyz), 0.0, bm.o.w) - cam, rd), 1.0, maxT);
  } else {
    // reflection: only where the river surface is visible
    if (rd.y >= 0.0 || cam.y <= 0.0) { discard; }
    let tW = -cam.y / rd.y;
    if (tW >= maxT) { discard; }
    let P = cam + rd * tW;
    // ripple normal from the water's wave texture, pre-blurred (coarser mip than the pixel footprint)
    let foot = tW * pixAng / max(-rd.y, 0.04);
    let w1 = textureSampleLevel(waveTex, sampRepeat, P.xz / 38.0 + vec2f(t * 0.011, t * 0.004), log2(max(foot / 38.0 * 512.0, 1.0)) + 0.5);
    let w2 = textureSampleLevel(waveTex, sampRepeat, P.xz / 9.5 + vec2f(-t * 0.02, t * 0.03), log2(max(foot / 9.5 * 512.0, 1.0)) + 0.5);
    let sl = w1.xy * 0.06 + w2.xy * 0.09;
    let nrm = normalize(vec3f(-sl.x, 1.0, -sl.y));
    let V = -rd;
    let fres = 0.02 + 0.98 * pow(1.0 - saturate(dot(nrm, V)), 5.0);
    let bm = beams.b[i.bi - n];
    if (bm.d.w < 0.5) {
      // thin laser: rippled mirror reflection of the beam itself (broken wavy lines)
      c = beamGlow(P, reflect(rd, nrm), 1e5, bm, pixAng * 5.0, t) * fres * 0.85;
    } else {
      c = beamReflection(P, V, nrm, bm, ign(i.pos.xy, F.params.y)) * fres * 1500.0;
    }
    s = tW;
  }
  // fog transmittance to the beam
  let f = textureSampleLevel(fogTex, sampClamp, vec3f(uv, clamp(fogSlice(s), 0.0, 1.0)), 0.0);
  c *= f.a;
  return vec4f(min(c, vec3f(40.0)), 0.0);
}`;

const COMP_WGSL = /* wgsl */ `
@group(2) @binding(0) var beamTex: texture_2d<f32>;
struct FOut { @location(0) color: vec4f, @location(1) motion: vec4f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let x = f32((i << 1u) & 2u); let y = f32(i & 2u);
  return vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
}
// small tent blur while upsampling the half-resolution beams (softens thin lasers and their reflections)
@fragment fn fs(@builtin(position) pos: vec4f) -> FOut {
  let uv = pos.xy * F.res.zw;
  let o = F.res.zw * 2.0;
  var c = textureSampleLevel(beamTex, sampClamp, uv + vec2f(o.x, o.y), 0.0).rgb;
  c += textureSampleLevel(beamTex, sampClamp, uv + vec2f(-o.x, o.y), 0.0).rgb;
  c += textureSampleLevel(beamTex, sampClamp, uv + vec2f(o.x, -o.y), 0.0).rgb;
  c += textureSampleLevel(beamTex, sampClamp, uv + vec2f(-o.x, -o.y), 0.0).rgb;
  c *= 0.25;
  if (max(c.r, max(c.g, c.b)) < 2e-4) { discard; }
  var r: FOut;
  r.color = vec4f(c, 0.0);
  r.motion = vec4f(0.0);
  return r;
}
`;

// Searchlight fixtures on the rooftops (G-buffer): drum housing on a mast, lens lit in the beam colour.
const FIX_WGSL = /* wgsl */ `
struct Fix { a: vec4f, b: vec4f };   // a: x, y, z, scale   b: lens colour (HDR), mast length
@group(1) @binding(0) var<storage, read> fx: array<Fix>;
struct VOut { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) @interpolate(flat) k: vec2u };
@vertex fn vs(@location(0) p: vec3f, @location(1) nr: vec3f, @location(2) kind: f32, @builtin(instance_index) ii: u32) -> VOut {
  let F0 = fx[ii];
  var q = p * F0.a.w;
  if (kind > 1.5 && kind < 2.5) { q.y = -F0.a.w + p.y * F0.b.w; }   // mast reaches down to the roof
  var o: VOut;
  o.wp = F0.a.xyz + q;
  o.n = nr;
  o.k = vec2u(u32(kind + 0.5), ii);
  o.pos = F.viewProj * vec4f(o.wp, 1.0);
  return o;
}
@fragment fn fs(i: VOut) -> GOut {
  let F0 = fx[i.k.y];
  var albedo = vec3f(0.08, 0.085, 0.09);
  var emis = vec3f(0.0);
  if (i.k.x == 1u) { emis = F0.b.rgb; albedo = vec3f(0.3); }
  if (i.k.x == 3u) { emis = F0.b.rgb * 0.25; }
  return gbuf(albedo, 0.4, normalize(i.n), 0.6, emis, 1.0, motionVector(i.wp, i.wp), 0.0, 0.5);
}
`;

function fixtureMesh() {
  const v = [];
  const quad = (a, b, c, d, n, k) => {
    // winding: make the face point along n
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const tri = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] > 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
    for (const p of tri) v.push(p[0], p[1], p[2], n[0], n[1], n[2], k);
  };
  const prism = (r, y0, y1, k, kTop, segs) => {
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * Math.PI * 2, a1 = ((s + 1) / segs) * Math.PI * 2, am = (a0 + a1) / 2;
      const p0 = [Math.cos(a0) * r, 0, Math.sin(a0) * r], p1 = [Math.cos(a1) * r, 0, Math.sin(a1) * r];
      quad([p0[0], y0, p0[2]], [p1[0], y0, p1[2]], [p1[0], y1, p1[2]], [p0[0], y1, p0[2]], [Math.cos(am), 0, Math.sin(am)], k);
      quad([0, y1, 0], [p0[0], y1, p0[2]], [p1[0], y1, p1[2]], [0, y1, 0], [0, 1, 0], kTop);
    }
  };
  prism(1.0, -1.0, 0.0, 3, 0, 8);    // base ring (faintly lit)
  prism(0.75, 0.0, 0.9, 0, 1, 8);    // drum with glowing lens on top
  // mast (kind 2): unit length downward, scaled per instance
  const m = 0.28;
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const t = [-nz, nx];
    const c = [nx * m, nz * m];
    quad([c[0] - t[0] * m, 0, c[1] - t[1] * m], [c[0] + t[0] * m, 0, c[1] + t[1] * m], [c[0] + t[0] * m, -1, c[1] + t[1] * m], [c[0] - t[0] * m, -1, c[1] - t[1] * m], [nx, 0, nz], 2);
  }
  return new Float32Array(v);
}

const PI = Math.PI;
const LASER_COLORS = [[0.2, 1.0, 0.35], [0.15, 0.85, 1.0]];
// pattern per 8 s section: rising fan, sweep, crossing, pillars, cones, wave, crossing, converging finale
const SHOW_ORDER = [0, 1, 2, 3, 4, 5, 2, 6];
const WEST = -PI / 2;
const SECTION = 8;

function smooth(a, b, x) { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); }

const PALETTES = [
  [[0.75, 0.85, 1.0], [0.75, 0.85, 1.0]],
  [[0.1, 0.85, 1.0], [0.9, 0.95, 1.0]],
  [[1.0, 0.15, 0.6], [0.1, 0.8, 1.0]],
  [[1.0, 0.72, 0.25], [1.0, 0.5, 0.15]],
  [[0.6, 0.25, 1.0], [0.1, 1.0, 0.7]],
  [[1.0, 0.2, 0.5], [1.0, 0.75, 0.3]],
  [[0.95, 0.95, 1.0], [0.6, 0.8, 1.0]],
];

export default {
  name: 'lightshow',
  init(ctx) {
    const d = ctx.device, world = ctx.world;
    this.store = beamStore(d);
    const R = rng(808);
    // searchlight sources: rooftops from the buildings module (landmarks first), one beam each, spaced apart
    const cand = [];
    const tops = world.shared.towerTops;
    if (Array.isArray(tops)) for (const t of tops) {
      const x = t.x ?? t[0], y = t.y ?? t[1], z = t.z ?? t[2];
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) cand.push({ x, y, z });
    }
    if (!cand.length) {
      for (const id of ['twist', 'twin', 'truss', 'tvtower', 'crown']) {
        const L = world.landmarks.find((l) => l.id === id);
        if (L) cand.push({ x: L.x, y: world.heightAt(L.x, L.z) + L.h, z: L.z });
      }
    }
    const sources = [];
    let nWest = 0;
    for (const c of cand) {
      if (sources.length >= 10) break;
      if (sources.some((s) => Math.hypot(s.x - c.x, s.z - c.z) < 160)) continue;
      const west = c.x < 2200 && c.x > 1400; // Bund side
      if (west && nWest >= 2) continue;
      if (west) nWest++;
      sources.push({ x: c.x, y: c.y + 2.5, z: c.z, mast: Math.min(Math.max(c.y - world.heightAt(c.x, c.z) - 20, 4), 40) });
    }
    // per-beam personality: fan outward from the city centre, own elevation, sweep speed and phase
    let cx = 0, cz = 0;
    for (const s of sources) { cx += s.x; cz += s.z; }
    cx /= Math.max(sources.length, 1); cz /= Math.max(sources.length, 1);
    sources.forEach((s, j) => {
      let ox = s.x - cx, oz = s.z - cz;
      if (Math.hypot(ox, oz) < 50) { ox = Math.cos(j * 2.4); oz = Math.sin(j * 2.4); }
      s.az = Math.atan2(ox, -oz) + (R() - 0.5) * 0.7;
      s.el = 0.95 + R() * 0.45;
      s.w = 0.45 + R() * 0.6;
      s.ph = R() * PI * 2;
      s.spin = R() < 0.5 ? -1 : 1;
    });
    this.sources = sources;
    this.nSearch = sources.length;
    // laser emitters: lit plinths on the east embankment, low over the river
    this.lasers = [];
    for (const z of [-1250, -700]) {
      let x = 2380;
      for (let k = 0; k < 60 && world.waterDist(x, z) < 4; k++) x += 5;
      this.lasers.push({ x, y: Math.max(world.heightAt(x, z), 0.5) + 6, z, mast: 5 });
    }
    this.laserFan = 5;
    this.ambient = sources.length ? [sources[0], sources[Math.min(1, sources.length - 1)], sources[Math.min(2, sources.length - 1)]] : [];
    this.lightBase = ctx.lights.reserve(this.lasers.length);

    // fixtures (static positions, lens colours per frame)
    this.fixtures = sources.concat(this.lasers).slice(0, MAX_FIXTURES);
    this.fixData = new Float32Array(MAX_FIXTURES * 8);
    this.fixtures.forEach((f, i) => {
      const lz = this.lasers.includes(f);
      this.fixData.set([f.x, f.y - (lz ? 0 : 1.6), f.z, lz ? 0.9 : 2.2, 0, 0, 0, f.mast], i * 8);
    });
    this.fixBuf = d.createBuffer({ size: this.fixData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const fm = fixtureMesh();
    this.fixVerts = fm.length / 7;
    this.fixVbuf = d.createBuffer({ size: fm.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.fixVbuf, 0, fm);
    this.fixLayout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }] });
    this.fixGroup = d.createBindGroup({ layout: this.fixLayout, entries: [{ binding: 0, resource: { buffer: this.fixBuf } }] });
    this.fixPipe = ctx.renderer.gbufferPipeline({ label: 'show-fixtures', code: FIX_WGSL, groups: [this.fixLayout], cull: 'none',
      buffers: [{ arrayStride: 28, attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32' }] }] });

    const VF = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
    this.layout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: VF, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: VF, texture: { sampleType: 'depth' } },
      { binding: 2, visibility: VF, texture: { sampleType: 'float' } }] });
    const r = ctx.renderer;
    this.waveView = water.waveView || (water.waveView = ctx.device.createTexture({ size: [4, 4], format: 'rgba16float', usage: GPUTextureUsage.TEXTURE_BINDING }).createView());
    const mod = shader(d, WGSL_LIB + WGSL_FRAME + BEAM_WGSL, 'lightshow-beams');
    const add = { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } };
    this.pipe = d.createRenderPipeline({
      label: 'lightshow-beams',
      layout: d.createPipelineLayout({ bindGroupLayouts: [r.frameLayout, this.layout] }),
      vertex: { module: mod, entryPoint: 'vs' },
      fragment: { module: mod, entryPoint: 'fs', targets: [{ format: 'rgba16float', blend: add }] },
      primitive: { topology: 'triangle-list' },
    });
    this.compLayout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: VF, texture: { sampleType: 'float' } }] });
    this.compPipe = r.forwardPipeline({ label: 'lightshow-composite', code: COMP_WGSL, groups: [this.compLayout], blend: 'add', depthTest: false });
    this.att = [{ view: null, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }];
    this.desc = { colorAttachments: this.att, timestampWrites: undefined };
    this.dir = new Float64Array(3);
    this.dirB = new Float64Array(3);
  },

  // Direction for searchlight s (index j) in pattern p at show time ts. Writes out (unit vector).
  _pattern(p, j, s, ts, out) {
    const beat = ts * 2;
    let az = s.az, el = s.el;
    const odd = j % 2 ? 1 : -1;
    switch (p) {
      case 0: // rising fan: beams lift one after another
        el = 0.35 + (s.el - 0.35) * smooth(0, 4, ts - j * 0.3); az += 0.25 * Math.sin(ts * s.w + s.ph); break;
      case 1: // independent sweeps
        az += 0.75 * Math.sin(ts * s.w + s.ph); el += 0.15 * Math.sin(ts * 0.5 * s.w + s.ph * 1.7); break;
      case 2: // crossing pairs, one cross per beat
        az += odd * 0.6 * Math.sin(beat * PI * 0.5) + 0.2 * Math.sin(ts * s.w + s.ph); el -= 0.1 * Math.cos(beat * PI * 0.5); break;
      case 3: // strobing pillars, slightly splayed
        el = 1.42 + 0.06 * Math.sin(s.ph); az += 0.3 * Math.sin(ts * 0.3 + s.ph); break;
      case 4: // rotating cones, alternating directions
        az += ts * 1.2 * s.spin * s.w * 1.5; el = 1.1 + 0.1 * Math.sin(s.ph); break;
      case 5: // wave
        az += 0.35 * Math.sin(ts * 1.3 + j); el = s.el - 0.2 + 0.35 * Math.sin(ts * 2.2 - j * 0.9); break;
      default: { // converge on a point high above the river, wobbling
        const dx = 2300 + 120 * Math.sin(ts * 0.9 + s.ph) - s.x, dy = 650 + 120 * Math.sin(ts * 0.7) - s.y;
        const dz = -1100 + 120 * Math.cos(ts * 0.8 + s.ph) - s.z, l = Math.hypot(dx, dy, dz);
        out[0] = dx / l; out[1] = dy / l; out[2] = dz / l;
        return out;
      }
    }
    el = Math.min(el, 1.5);
    const ce = Math.cos(el);
    out[0] = Math.sin(az) * ce; out[1] = Math.sin(el); out[2] = -Math.cos(az) * ce;
    return out;
  },

  _write(idx, ox, oy, oz, len, dx, dy, dz, r0, r, g, b, spread) {
    const D = this.store.data, o = 4 + idx * BEAM_FLOATS;
    D[o] = ox; D[o + 1] = oy; D[o + 2] = oz; D[o + 3] = len;
    D[o + 4] = dx; D[o + 5] = dy; D[o + 6] = dz; D[o + 7] = r0;
    D[o + 8] = r; D[o + 9] = g; D[o + 10] = b; D[o + 11] = spread;
  },

  _lens(i, r, g, b) {
    if (i >= MAX_FIXTURES) return;
    const F = this.fixData, o = i * 8 + 4;
    F[o] = r; F[o + 1] = g; F[o + 2] = b;
  },

  update(ctx) {
    const show = ctx.show;
    const x = show.intensity, ts = show.time, t = ctx.time;
    const phase = show.beatPhase;
    const pulse = 1 + 0.6 * Math.exp(-phase * 6);
    let count = 0;
    const lights = ctx.lights;
    const ns = this.nSearch;
    for (let i = 0; i < this.fixtures.length; i++) this._lens(i, 0.6, 0.7, 0.9); // idle lens glow

    // ambient searchlights (fade out while the show runs)
    const amb = 1 - x;
    if (amb > 0.01) {
      for (let i = 0; i < this.ambient.length; i++) {
        const s = this.ambient[i];
        const az = s.az + t * 0.09 * s.spin + 0.6 * Math.sin(t * 0.05 + s.ph);
        const el = 1.0 + 0.25 * Math.sin(t * 0.07 + s.ph);
        const ce = Math.cos(el);
        const k = 0.5 * amb;
        this._write(count++, s.x, s.y, s.z, 2200, Math.sin(az) * ce, Math.sin(el), -Math.cos(az) * ce, 1.4,
          0.75 * k, 0.85 * k, 1.0 * k, 0.011);
        this._lens(this.sources.indexOf(s), 6, 7, 8);
      }
    }

    if (x > 0.001) {
      const sec = Math.floor(ts / SECTION);
      const local = ts - sec * SECTION;
      const pA = SHOW_ORDER[Math.min(sec, SHOW_ORDER.length - 1)];
      const pB = SHOW_ORDER[Math.min(sec + 1, SHOW_ORDER.length - 1)];
      const blend = smooth(SECTION - 1.2, SECTION, local);
      const pal = PALETTES[(sec + 1) % PALETTES.length];
      for (let j = 0; j < ns; j++) {
        const s = this.sources[j];
        this._pattern(pA, j, s, ts, this.dir);
        if (blend > 0) {
          this._pattern(pB, j, s, ts, this.dirB);
          for (let c = 0; c < 3; c++) this.dir[c] = this.dir[c] * (1 - blend) + this.dirB[c] * blend;
        }
        const dl = Math.hypot(this.dir[0], this.dir[1], this.dir[2]) || 1;
        let k = x * smooth(j * 0.3, j * 0.3 + 0.4, ts);
        if (pA === 3) k *= (j + show.beat) % 2 ? 0.35 + 1.2 * Math.exp(-phase * 5) : 0.9; // strobing pillars
        else k *= pulse;
        const col = pal[j % 2];
        const g = 0.8;
        this._write(count++, s.x, s.y, s.z, 2400, this.dir[0] / dl, this.dir[1] / dl, this.dir[2] / dl,
          1.8, col[0] * k * g, col[1] * k * g, col[2] * k * g, 0.014);
        this._lens(j, 0.6 + col[0] * 14 * k, 0.6 + col[1] * 14 * k, 0.6 + col[2] * 14 * k);
      }
      // laser fans across the river (from the third section on)
      const lk = x * smooth(SECTION * 2, SECTION * 2 + 1, ts);
      if (lk > 0.001) {
        const m = this.laserFan;
        for (let e = 0; e < this.lasers.length; e++) {
          const L = this.lasers[e];
          const g = LASER_COLORS[e % 2];
          for (let j = 0; j < m && count < MAX_BEAMS; j++) {
            const f = j / (m - 1) - 0.5;
            const az = WEST + f * (0.7 + 0.4 * Math.sin(ts * 0.8 + e)) + 0.35 * Math.sin(ts * 1.1 + e * 2.0);
            const el = 0.07 + 0.04 * Math.sin(ts * 2.0 + j * 0.7 + e) + 0.03 * (1 - Math.abs(f) * 2);
            const ce = Math.cos(el);
            const on = (show.beat + j) % 4 === 0 ? 1.6 : 1.0;
            const kk = lk * on * 5;
            this._write(count++, L.x, L.y, L.z, 1500, Math.sin(az) * ce, Math.sin(el), -Math.cos(az) * ce, 0.12,
              g[0] * kk, g[1] * kk, g[2] * kk, 0.0006);
          }
          this._lens(ns + e, g[0] * 20 * lk + 0.4, g[1] * 20 * lk + 0.4, g[2] * 20 * lk + 0.4);
          lights.set(this.lightBase + e, L.x - 3, L.y + 2, L.z, 24, 8 * lk, 30 * lk, 14 * lk);
        }
      } else {
        for (let e = 0; e < this.lasers.length; e++) lights.set(this.lightBase + e, 0, -1e5, 0, 0, 0, 0, 0);
      }
    } else if (this._lightsOn !== false) {
      for (let e = 0; e < this.lasers.length; e++) lights.set(this.lightBase + e, 0, -1e5, 0, 0, 0, 0, 0);
      this._lightsOn = false;
    }
    if (x > 0.001) this._lightsOn = true;
    this.count = count;
    const D = this.store.data;
    D[0] = count;
    this.store.count = count;
    ctx.device.queue.writeBuffer(this.store.buffer, 0, D.buffer, 0, (4 + count * BEAM_FLOATS) * 4);
    ctx.device.queue.writeBuffer(this.fixBuf, 0, this.fixData.buffer, 0, this.fixtures.length * 32);
  },

  gbuffer(ctx, pass) {
    if (!this.fixtures.length) return;
    pass.setPipeline(this.fixPipe);
    pass.setBindGroup(1, this.fixGroup);
    pass.setVertexBuffer(0, this.fixVbuf);
    pass.draw(this.fixVerts, this.fixtures.length);
  },

  resize(ctx) {
    const d = ctx.device;
    if (this.tex) this.tex.destroy();
    const w = Math.max(1, Math.ceil(ctx.renderer.width / 2)), h = Math.max(1, Math.ceil(ctx.renderer.height / 2));
    this.tex = d.createTexture({ size: [w, h], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING, label: 'beamsHalf' });
    this.att[0].view = this.tex.createView();
    this.group = d.createBindGroup({ layout: this.layout, entries: [
      { binding: 0, resource: { buffer: this.store.buffer } }, { binding: 1, resource: ctx.views.depth },
      { binding: 2, resource: this.waveView }] });
    this.compGroup = d.createBindGroup({ layout: this.compLayout, entries: [{ binding: 0, resource: this.att[0].view }] });
  },

  // beams are drawn at half resolution before the forward pass (they only need the opaque depth)
  afterLighting(ctx, enc) {
    if (!this.count || !this.group) return;
    this.desc.timestampWrites = ctx.prof.ts('lightshow');
    const p = enc.beginRenderPass(this.desc);
    p.setPipeline(this.pipe);
    p.setBindGroup(0, ctx.renderer.frameGroup);
    p.setBindGroup(1, this.group);
    p.draw(6, this.count * 2);
    p.end();
  },

  forward(ctx, pass) {
    if (!this.count || !this.compGroup) return;
    pass.setPipeline(this.compPipe);
    pass.setBindGroup(2, this.compGroup);
    pass.draw(3);
  },
};
