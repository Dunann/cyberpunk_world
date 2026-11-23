// Terrain init-time GPU work: far-field heightmap (endless mountains beyond the world heightmap),
// baked material textures (albedo / normal / cavity / forest masks, with mip chains).

import { WGSL_LIB, TERRAIN } from './common.js';
import { LAKE } from './world.js';
import { LAND_WGSL, CARVE_WGSL } from './terrainLand.js';
import { shader } from './gpu.js';

export const FAR = { SIZE: 65536, RES: 2048, ORIGIN: -32768 };

// Copies of the world.js GEN_COMMON helpers needed by LAND_WGSL / CARVE_WGSL.
const GEN_HELPERS = /* wgsl */ `
struct Seg { a: vec4f, b: vec4f };
fn segDist(p: vec2f, a: vec2f, b: vec2f) -> vec2f {
  let pa = p - a; let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return vec2f(length(pa - ba * h), h);
}
fn lineDist(p: vec2f, a: vec2f, b: vec2f) -> f32 { return segDist(p, a, b).x; }
fn ridged(p0: vec2f, oct: i32) -> f32 {
  var p = p0; var a = 0.5; var s = 0.0; var w = 1.0;
  for (var i = 0; i < oct; i++) {
    var n = 1.0 - abs(gnoise2(p));
    n = n * n * w;
    w = clamp(n * 2.0, 0.0, 1.0);
    s += a * n; p = rot2(0.5) * p * 2.1 + vec2f(3.1, 7.7); a *= 0.5;
  }
  return s;
}
fn lakeDistG(p: vec2f) -> f32 {
  let q = rot2(-${LAKE.angle}) * (p - vec2f(${LAKE.cx}.0, ${LAKE.cz}.0));
  let e = length(q / vec2f(${LAKE.rx}.0, ${LAKE.rz}.0));
  let n = fbm2(p * 0.004, 3) * 70.0 + fbm2(p * 0.012, 2) * 18.0;
  return (e - 1.0) * ${Math.min(LAKE.rx, LAKE.rz)}.0 + n;
}
fn waterDistG(p: vec2f) -> vec2f {
  var best = 1e9; var natural = 0.0;
  let n = arrayLength(&segs);
  for (var i = 0u; i < n; i++) {
    let s = segs[i];
    let r = segDist(p, s.a.xy, s.a.zw);
    let d = r.x - mix(s.b.x, s.b.y, r.y);
    if (d < best) { best = d; natural = s.b.z; }
  }
  let ld = lakeDistG(p);
  if (ld < best) { best = ld; natural = 1.0; }
  return vec2f(clamp(best, -2000.0, 2000.0), natural);
}
`;

const FARGEN_WGSL = /* wgsl */ `
@group(0) @binding(0) var<storage, read> segs: array<Seg>;
@group(0) @binding(1) var outH: texture_storage_2d<r32float, write>;
${GEN_HELPERS}
${LAND_WGSL}
${CARVE_WGSL}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let res = ${FAR.RES}u;
  if (id.x >= res || id.y >= res) { return; }
  let p = ${FAR.ORIGIN}.0 + (vec2f(id.xy) + 0.5) / f32(res) * ${FAR.SIZE}.0;
  let wd = waterDistG(p);
  let h = carveWater(landHeight(p), wd.x, wd.y > 0.5, 0.0, p);
  textureStore(outH, id.xy, vec4f(h, 0.0, 0.0, 0.0));
}
`;

// Natural ground material, shared by the near and far bakes.
// Returns albedo (linear) in rgb and forest cover in a.
export const NATMAT_WGSL = /* wgsl */ `
fn natMaterial(p: vec2f, h: f32, n: vec3f, cav: f32, wd: f32, natural: f32, terr: f32) -> vec4f {
  let slope = 1.0 - n.y;
  let n1 = fbm2(p * 0.006, 4);
  let n2 = fbm2(p * 0.03 + 7.0, 3);
  let n3 = gnoise2(p * 0.11);
  // forest: dense subtropical broadleaf; thins on cliffs, high crests and meadows
  var forest = 1.0 - smoothstep(0.30, 0.48, slope + n2 * 0.08);
  forest *= 1.0 - 0.75 * smoothstep(0.25, 0.55, n1 + cav * 0.004 - 0.1) * smoothstep(0.0, 0.2, slope + 0.1); // glades
  forest *= 1.0 - smoothstep(900.0, 1500.0, h + n1 * 300.0) * smoothstep(-0.1, 0.4, cav * 0.02 + 0.2); // bald crests
  forest *= smoothstep(4.0, 22.0, wd + n3 * 5.0);   // keep shores open
  forest *= 1.0 - terr;
  // exposed rock outcrops and cliff bands on steeper forested slopes
  let outcrop = smoothstep(0.62, 0.74, n2 * 0.5 + 0.5 + slope * 0.9 + n1 * 0.15) * smoothstep(0.14, 0.26, slope);
  forest *= 1.0 - outcrop;
  // canopy colours: dark greens with olive / blue-green clumps at large scale
  var canopy = mix(vec3f(0.024, 0.044, 0.020), vec3f(0.040, 0.058, 0.024), smoothstep(-0.3, 0.4, n1));
  canopy = mix(canopy, vec3f(0.020, 0.040, 0.032), smoothstep(0.1, 0.5, n2) * 0.6);
  canopy *= 0.85 + 0.3 * smoothstep(-20.0, 20.0, cav);   // valleys darker, ridges catch light
  // understory / meadow
  var grass = mix(vec3f(0.045, 0.058, 0.028), vec3f(0.060, 0.058, 0.034), smoothstep(-0.2, 0.5, n2));
  // rock with strata: horizontal bands warped by noise
  let strata = sin((h + n1 * 18.0 + n3 * 2.0) * 0.85) * 0.5 + 0.5;
  let strata2 = sin((h + n1 * 9.0) * 3.1) * 0.5 + 0.5;
  var rock = mix(vec3f(0.075, 0.072, 0.068), vec3f(0.125, 0.112, 0.092), strata);
  rock *= 0.8 + 0.35 * strata2;
  rock = mix(rock, vec3f(0.040, 0.056, 0.030), smoothstep(0.2, 0.7, n2 + cav * 0.01) * 0.6);  // moss in hollows
  let rockW = max(smoothstep(0.32, 0.55, slope + n2 * 0.1), outcrop);
  var col = mix(grass, canopy, forest);
  col = mix(col, rock, rockW * (1.0 - forest * 0.8));
  // terraces (tea / rice): fresh green
  col = mix(col, vec3f(0.050, 0.075, 0.030), terr);
  // shores: sand and mud along lake / canal, rocky mud along wild river banks
  let shoreW = 1.0 - smoothstep(1.0, 9.0 + n3 * 4.0, wd);
  let sand = mix(vec3f(0.12, 0.105, 0.080), vec3f(0.065, 0.055, 0.042), smoothstep(4.0, 0.5, wd));
  let mud = mix(vec3f(0.07, 0.065, 0.058), vec3f(0.045, 0.040, 0.035), n2 * 0.5 + 0.5);
  col = mix(col, mix(mud, sand, natural), shoreW);
  // underwater beds
  if (h < -0.3) { col = mix(vec3f(0.045, 0.042, 0.036), vec3f(0.03, 0.03, 0.028), smoothstep(-0.3, -6.0, h)); forest = 0.0; }
  return vec4f(col, forest);
}
`;

const BAKE_WGSL = /* wgsl */ `
@group(1) @binding(0) var oA: texture_storage_2d<rgba8unorm, write>;
@group(1) @binding(1) var oN: texture_storage_2d<rgba8unorm, write>;
@group(1) @binding(2) var farHt: texture_2d<f32>;
@group(1) @binding(3) var<storage, read> segs: array<Seg>;
${GEN_HELPERS}
${LAND_WGSL}
${NATMAT_WGSL}

fn hNear(i: vec2i) -> f32 { return textureLoad(heightTex, clamp(i, vec2i(0), vec2i(${TERRAIN.RES - 1})), 0).x; }
fn hFar(i: vec2i) -> f32 { return textureLoad(farHt, clamp(i, vec2i(0), vec2i(${FAR.RES - 1})), 0).x; }

fn terrW(p: vec2f, h: f32, slope: f32) -> f32 {
  let tm = landTerraceMask(p);
  return tm * smoothstep(0.05, 0.12, slope) * (1.0 - smoothstep(0.38, 0.6, slope)) * smoothstep(12.0, 25.0, h) * (1.0 - smoothstep(300.0, 360.0, h));
}

fn writeOut(id: vec2u, col: vec3f, n: vec3f, cav: f32, forest: f32, terr: f32) {
  textureStore(oA, id, vec4f(sqrt(saturate3(col)), terr));
  textureStore(oN, id, vec4f(n.x * 0.5 + 0.5, n.z * 0.5 + 0.5, saturate(0.5 + cav * 0.02), forest));
}

@compute @workgroup_size(8, 8)
fn bakeNear(@builtin(global_invocation_id) id: vec3u) {
  let res = ${TERRAIN.RES}u;
  if (id.x >= res || id.y >= res) { return; }
  let ii = vec2i(id.xy);
  let p = T_ORIGIN + (vec2f(id.xy) + 0.5) * (T_SIZE / T_RES);
  let h = hNear(ii);
  let e = T_SIZE / T_RES;
  let n = normalize(vec3f(hNear(ii - vec2i(1, 0)) - hNear(ii + vec2i(1, 0)), 2.0 * e, hNear(ii - vec2i(0, 1)) - hNear(ii + vec2i(0, 1))));
  // smoother normal (for slope classification across terrace steps)
  let ns = normalize(vec3f(hNear(ii - vec2i(3, 0)) - hNear(ii + vec2i(3, 0)), 6.0 * e, hNear(ii - vec2i(0, 3)) - hNear(ii + vec2i(0, 3))));
  var avg = 0.0;
  for (var k = 0; k < 8; k++) {
    let a = f32(k) * 0.785398;
    avg += hNear(ii + vec2i(vec2f(cos(a), sin(a)) * 4.0)) + hNear(ii + vec2i(vec2f(cos(a + 0.39), sin(a + 0.39)) * 13.0));
  }
  let cav = h - avg / 16.0;
  let info = worldInfo(p);
  let terr = terrW(p, h, length(ns.xz) / max(ns.y, 0.05));
  var m = natMaterial(p, h, ns, cav, info.x, info.w, terr);
  // city ground base (roads are drawn live): grey paving, no forest
  let di = i32(info.y + 0.5);
  var urban = 0.0;
  if (di >= 0 && di < i32(W.count.x) && W.d[di].b.y > 0.0) { urban = smoothstep(0.35, 0.6, info.z) * smoothstep(6.0, 14.0, info.x); }
  let pave = vec3f(0.07, 0.068, 0.068) * (0.9 + 0.2 * gnoise2(p * 0.05));
  // no forest in the downtown districts (street trees are placed separately); hillside districts keep some
  var city = 0.0;
  if (di >= 0 && di < i32(W.count.x)) {
    let t = W.d[di].b.w;
    if (t == 2.0) { city = 0.6 * smoothstep(0.3, 0.6, info.z); }
    else if (t != 5.0) { city = smoothstep(0.08, 0.35, info.z); }
  }
  m = vec4f(mix(m.rgb, pave, urban), m.a * (1.0 - smoothstep(0.0, 0.5, urban)) * (1.0 - city));
  writeOut(id.xy, m.rgb, n, cav, m.a, terr * (1.0 - urban));
}

@compute @workgroup_size(8, 8)
fn bakeFar(@builtin(global_invocation_id) id: vec3u) {
  let res = ${FAR.RES}u;
  if (id.x >= res || id.y >= res) { return; }
  let ii = vec2i(id.xy);
  let e = ${FAR.SIZE / FAR.RES}.0;
  let p = ${FAR.ORIGIN}.0 + (vec2f(id.xy) + 0.5) * e;
  let h = hFar(ii);
  let n = normalize(vec3f(hFar(ii - vec2i(1, 0)) - hFar(ii + vec2i(1, 0)), 2.0 * e, hFar(ii - vec2i(0, 1)) - hFar(ii + vec2i(0, 1))));
  var avg = 0.0;
  for (var k = 0; k < 8; k++) {
    let a = f32(k) * 0.785398;
    avg += hFar(ii + vec2i(vec2f(cos(a), sin(a)) * 2.0)) + hFar(ii + vec2i(vec2f(cos(a + 0.39), sin(a + 0.39)) * 5.0));
  }
  let cav = (h - avg / 16.0) * 0.5;
  let wd = waterDistG(p);
  let m = natMaterial(p, h, n, cav, wd.x, wd.y, 0.0);
  writeOut(id.xy, m.rgb, n, cav, m.a, 0.0);
}
`;

const MIP_WGSL = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<rgba8unorm, write>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let d = textureDimensions(dst);
  if (id.x >= d.x || id.y >= d.y) { return; }
  let s = vec2i(id.xy) * 2;
  let c = textureLoad(src, s, 0) + textureLoad(src, s + vec2i(1, 0), 0) + textureLoad(src, s + vec2i(0, 1), 0) + textureLoad(src, s + vec2i(1, 1), 0);
  textureStore(dst, id.xy, c * 0.25);
}
`;

// Tileable noise textures (repeat-sampled with mips, so detail filters out cleanly with distance).
//  tNoise  256^2: r = fbm (8 cells/tile), g = fbm (16 cells), b = gradient noise (32 cells), a = fbm (4 cells)
//  tCanopy 512^2: tree-crown domes, 16x16 crowns/tile: rg = normal xz, b = dome height (AO), a = crown tint hash
const NOISE_WGSL = /* wgsl */ `
@group(0) @binding(0) var oNoise: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var oCanopy: texture_storage_2d<rgba8unorm, write>;
fn tgrad(c: vec2f, per: f32, seed: f32) -> vec2f {
  let w = (c % per + per) % per;
  return hash22(w + seed * 97.0) * 2.0 - 1.0;
}
fn tnoise(p: vec2f, per: f32, seed: f32) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  let a = dot(tgrad(i, per, seed), f); let b = dot(tgrad(i + vec2f(1, 0), per, seed), f - vec2f(1, 0));
  let c = dot(tgrad(i + vec2f(0, 1), per, seed), f - vec2f(0, 1)); let d = dot(tgrad(i + vec2f(1, 1), per, seed), f - vec2f(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.4;
}
fn tfbm(uv: vec2f, cells: f32, seed: f32) -> f32 {
  var s = 0.0; var a = 0.5; var c = cells;
  for (var o = 0; o < 4; o++) { s += a * tnoise(uv * c, c, seed + f32(o)); c *= 2.0; a *= 0.5; }
  return s;
}
@compute @workgroup_size(8, 8)
fn noise(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= 256u || id.y >= 256u) { return; }
  let uv = (vec2f(id.xy) + 0.5) / 256.0;
  let r = tfbm(uv, 8.0, 1.0); let g = tfbm(uv, 16.0, 7.0); let b = tnoise(uv * 32.0, 32.0, 13.0); let a = tfbm(uv, 4.0, 21.0);
  textureStore(oNoise, id.xy, vec4f(r, g, b, a) * 0.5 + 0.5);
}
@compute @workgroup_size(8, 8)
fn canopy(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= 512u || id.y >= 512u) { return; }
  let q = (vec2f(id.xy) + 0.5) / 32.0;   // crown cell units, 16 per tile
  let c = floor(q);
  var best = 9.0; var bo = vec2f(0.0); var bh = 0.0; var second = 9.0;
  for (var j = -2; j <= 2; j++) {
    for (var k = -2; k <= 2; k++) {
      let cc = c + vec2f(f32(k), f32(j));
      let w = (cc % 16.0 + 16.0) % 16.0;
      let h = hash22(w + 3.0);
      let rad = 0.55 + 0.45 * hash21(w + 11.0);
      let o = (cc + 0.1 + h * 0.8 - q) / rad;
      let dd = dot(o, o);
      if (dd < best) { second = best; best = dd; bo = o; bh = hash21(w + 5.0); } else if (dd < second) { second = dd; }
    }
  }
  let r = sqrt(best);
  let dome = sqrt(saturate(1.0 - best));
  // dome normal: gradient of a hemisphere, flattened near the crown edge where the next crown overlaps
  let nrm = -bo * 0.8 * saturate(1.2 - r);
  let gap = smoothstep(0.0, 0.35, sqrt(second) - r);
  let height = dome * (0.55 + 0.45 * gap);
  textureStore(oCanopy, id.xy, vec4f(nrm * 0.5 + 0.5, height, bh));
}
`;

export function makeNoiseTextures(ctx) {
  const d = ctx.device, T = GPUTextureUsage;
  const tNoise = d.createTexture({ size: [256, 256], format: 'rgba8unorm', mipLevelCount: mipCount(256), usage: T.STORAGE_BINDING | T.TEXTURE_BINDING, label: 'terrainNoise' });
  const tCanopy = d.createTexture({ size: [512, 512], format: 'rgba8unorm', mipLevelCount: mipCount(512), usage: T.STORAGE_BINDING | T.TEXTURE_BINDING, label: 'terrainCanopy' });
  const layout = d.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba8unorm' } },
    { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba8unorm' } },
  ] });
  const mod = shader(d, WGSL_LIB + NOISE_WGSL, 'terrain-noise');
  const pl = d.createPipelineLayout({ bindGroupLayouts: [layout] });
  const pN = d.createComputePipeline({ layout: pl, compute: { module: mod, entryPoint: 'noise' } });
  const pC = d.createComputePipeline({ layout: pl, compute: { module: mod, entryPoint: 'canopy' } });
  const g = d.createBindGroup({ layout, entries: [
    { binding: 0, resource: tNoise.createView({ baseMipLevel: 0, mipLevelCount: 1 }) },
    { binding: 1, resource: tCanopy.createView({ baseMipLevel: 0, mipLevelCount: 1 }) },
  ] });
  const enc = d.createCommandEncoder();
  const p = enc.beginComputePass();
  p.setBindGroup(0, g);
  p.setPipeline(pN); p.dispatchWorkgroups(32, 32);
  p.setPipeline(pC); p.dispatchWorkgroups(64, 64);
  p.end();
  d.queue.submit([enc.finish()]);
  return { tNoise, tCanopy };
}

function mipCount(n) { return Math.floor(Math.log2(n)) + 1; }

// Runs all init-time generation. Returns { farH, farHeights (Float32Array), nearA, nearN, farA, farN }.
export async function generateTerrain(ctx) {
  const d = ctx.device, world = ctx.world, r = ctx.renderer;
  const T = GPUTextureUsage;
  const { tNoise, tCanopy } = makeNoiseTextures(ctx);

  // river segments for far-field water carving
  const segData = new Float32Array(world.segs.length * 8);
  world.segs.forEach((s, i) => segData.set([s[0], s[1], s[2], s[3], s[4], s[5], s[6], 0], i * 8));
  const segBuf = d.createBuffer({ size: segData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  d.queue.writeBuffer(segBuf, 0, segData);

  const farH = d.createTexture({ size: [FAR.RES, FAR.RES], format: 'r32float', usage: T.STORAGE_BINDING | T.TEXTURE_BINDING | T.COPY_SRC, label: 'farH' });
  const farGenLayout = d.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'r32float' } },
  ] });
  const farGenPipe = d.createComputePipeline({
    layout: d.createPipelineLayout({ bindGroupLayouts: [farGenLayout] }),
    compute: { module: shader(d, WGSL_LIB + FARGEN_WGSL, 'terrain-fargen'), entryPoint: 'main' },
  });

  const mk = (res, label) => d.createTexture({ size: [res, res], format: 'rgba8unorm', mipLevelCount: mipCount(res), usage: T.STORAGE_BINDING | T.TEXTURE_BINDING, label });
  const nearA = mk(TERRAIN.RES, 'terrainNearA'), nearN = mk(TERRAIN.RES, 'terrainNearN');
  const farA = mk(FAR.RES, 'terrainFarA'), farN = mk(FAR.RES, 'terrainFarN');

  const bakeLayout = d.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba8unorm' } },
    { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba8unorm' } },
    { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
    { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
  ] });
  const bakeNear = r.computePipeline({ label: 'terrain-bake-near', code: BAKE_WGSL, entry: 'bakeNear', groups: [bakeLayout] });
  const bakeFar = r.computePipeline({ label: 'terrain-bake-far', code: BAKE_WGSL, entry: 'bakeFar', groups: [bakeLayout] });

  const mipLayout = d.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
    { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba8unorm' } },
  ] });
  const mipPipe = d.createComputePipeline({
    layout: d.createPipelineLayout({ bindGroupLayouts: [mipLayout] }),
    compute: { module: shader(d, MIP_WGSL, 'terrain-mip'), entryPoint: 'main' },
  });

  const enc = d.createCommandEncoder();
  let pass = enc.beginComputePass();
  pass.setPipeline(farGenPipe);
  pass.setBindGroup(0, d.createBindGroup({ layout: farGenLayout, entries: [{ binding: 0, resource: { buffer: segBuf } }, { binding: 1, resource: farH.createView() }] }));
  pass.dispatchWorkgroups(FAR.RES / 8, FAR.RES / 8);
  pass.end();

  const bake = (pipe, A, N, res) => {
    const p = enc.beginComputePass();
    p.setPipeline(pipe);
    p.setBindGroup(0, r.frameGroup);
    p.setBindGroup(1, d.createBindGroup({ layout: bakeLayout, entries: [
      { binding: 0, resource: A.createView({ baseMipLevel: 0, mipLevelCount: 1 }) },
      { binding: 1, resource: N.createView({ baseMipLevel: 0, mipLevelCount: 1 }) },
      { binding: 2, resource: farH.createView() },
      { binding: 3, resource: { buffer: segBuf } },
    ] }));
    p.dispatchWorkgroups(res / 8, res / 8);
    p.end();
  };
  bake(bakeNear, nearA, nearN, TERRAIN.RES);
  bake(bakeFar, farA, farN, FAR.RES);

  for (const tex of [nearA, nearN, farA, farN, tNoise, tCanopy]) {
    for (let m = 1; m < tex.mipLevelCount; m++) {
      const p = enc.beginComputePass();
      p.setPipeline(mipPipe);
      p.setBindGroup(0, d.createBindGroup({ layout: mipLayout, entries: [
        { binding: 0, resource: tex.createView({ baseMipLevel: m - 1, mipLevelCount: 1 }) },
        { binding: 1, resource: tex.createView({ baseMipLevel: m, mipLevelCount: 1 }) },
      ] }));
      const s = Math.max(1, tex.width >> m);
      p.dispatchWorkgroups(Math.ceil(s / 8), Math.ceil(s / 8));
      p.end();
    }
  }

  const bytes = FAR.RES * FAR.RES * 4;
  const rb = d.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  enc.copyTextureToBuffer({ texture: farH }, { buffer: rb, bytesPerRow: FAR.RES * 4 }, [FAR.RES, FAR.RES]);
  d.queue.submit([enc.finish()]);
  await rb.mapAsync(GPUMapMode.READ);
  const farHeights = new Float32Array(rb.getMappedRange().slice(0));
  rb.unmap(); rb.destroy();
  return { farH, farHeights, nearA, nearN, farA, farN, segBuf, tNoise, tCanopy };
}
