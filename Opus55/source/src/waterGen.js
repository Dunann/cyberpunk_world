// Water init-time GPU generation:
//  - flow map: river current velocity over the whole world (from the dense river segments), 12 m per texel
//  - wave texture: tiling wave slopes with a full mip chain (rg = mean slope, ba = mean squared slope)
//    so distant water filters to a flat, stable surface and the slope variance can widen highlights.

import { WGSL_LIB, TERRAIN } from './common.js';
import { shader } from './gpu.js';

export const FLOW_RES = 1024;
export const WAVE_RES = 512;

const FLOW_WGSL = /* wgsl */ `
struct Seg { a: vec4f, b: vec4f }; // a: ax, az, bx, bz   b: halfWidthA, halfWidthB, natural, speed
@group(0) @binding(0) var<storage, read> segs: array<Seg>;
@group(0) @binding(1) var infoTex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var outFlow: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let res = ${FLOW_RES}u;
  if (id.x >= res || id.y >= res) { return; }
  let uv = (vec2f(id.xy) + 0.5) / f32(res);
  let p = ${TERRAIN.ORIGIN}.0 + uv * ${TERRAIN.SIZE}.0;
  let info = textureSampleLevel(infoTex, samp, uv, 0.0);
  // soft blend of segment directions (avoids seams at bends and at the confluence)
  var acc = vec2f(0.0);
  var wsum = 0.0;
  var best = 1e9;
  let n = arrayLength(&segs);
  for (var i = 0u; i < n; i++) {
    let s = segs[i];
    let a = s.a.xy; let b = s.a.zw;
    let pa = p - a; let ba = b - a;
    let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    let d = length(pa - ba * h) - mix(s.b.x, s.b.y, h);
    best = min(best, d);
    let w = exp(-max(d, 0.0) / 45.0);
    let dir = normalize(ba);
    // speed: slower near the banks, natural canals barely move
    let core = smoothstep(0.0, 140.0, -d);
    let spd = s.b.w * (0.35 + 0.65 * core);
    acc += dir * spd * w;
    wsum += w;
  }
  var flow = acc / max(wsum, 1e-4);
  // lake and canal water is calm
  let natural = info.w;
  flow *= 1.0 - natural * 0.85;
  let inWater = 1.0 - smoothstep(-5.0, 30.0, info.x);
  // z: river-ness (choppiness), w: water mask
  textureStore(outFlow, id.xy, vec4f(flow * inWater, (1.0 - natural) * inWater, inWater));
}
`;

// Periodic gradient noise height field -> slopes (pass 1) and mip downsample (pass 2).
const WAVE_WGSL = /* wgsl */ `
@group(0) @binding(0) var outWave: texture_storage_2d<rgba16float, write>;

fn pgrad(i: vec2i, period: i32, seed: u32) -> vec2f {
  let w = ((i % period) + period) % period;
  let h = pcg((u32(w.x) * 73856093u) ^ pcg((u32(w.y) * 19349663u) ^ seed));
  let a = f32(h) / 4294967295.0 * TAU;
  return vec2f(cos(a), sin(a));
}
// periodic gradient noise with analytic derivative: returns (value, d/dx, d/dy)
fn pnoise(p: vec2f, period: i32, seed: u32) -> vec3f {
  let i = vec2i(floor(p)); let f = fract(p);
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  let du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  let ga = pgrad(i, period, seed); let gb = pgrad(i + vec2i(1, 0), period, seed);
  let gc = pgrad(i + vec2i(0, 1), period, seed); let gd = pgrad(i + vec2i(1, 1), period, seed);
  let va = dot(ga, f); let vb = dot(gb, f - vec2f(1, 0));
  let vc = dot(gc, f - vec2f(0, 1)); let vd = dot(gd, f - vec2f(1, 1));
  let v = va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * (va - vb - vc + vd);
  let d = ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd)
        + du * (u.yx * (va - vb - vc + vd) + vec2f(vb, vc) - va);
  return vec3f(v, d);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let res = ${WAVE_RES}u;
  if (id.x >= res || id.y >= res) { return; }
  let uv = (vec2f(id.xy) + 0.5) / f32(res);
  var slope = vec2f(0.0);
  var period = 4;
  var amp = 1.0;
  for (var k = 0; k < 6; k++) {
    // slightly stretched cells give wave crests a preferred direction per octave
    let n = pnoise(uv * f32(period), period, u32(k) * 911u + 7u);
    slope += n.yz * amp * f32(period);
    period *= 2;
    amp *= 0.42;
  }
  slope *= 0.16;
  textureStore(outWave, id.xy, vec4f(slope, slope * slope));
}
`;

const MIP_WGSL = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let d = textureDimensions(dst);
  if (id.x >= d.x || id.y >= d.y) { return; }
  let p = vec2i(id.xy) * 2;
  let c = textureLoad(src, p, 0) + textureLoad(src, p + vec2i(1, 0), 0) + textureLoad(src, p + vec2i(0, 1), 0) + textureLoad(src, p + vec2i(1, 1), 0);
  textureStore(dst, id.xy, c * 0.25);
}
`;

// Speeds per river (m/s): Great River, Jade River, Garden Canal.
const RIVER_SPEED = [1.3, 1.7, 0.25];

export function generateWater(ctx) {
  const d = ctx.device, world = ctx.world;
  // segments with speed (segs keep river order; rebuild the per-river speed by matching counts)
  const segData = new Float32Array(world.segs.length * 8);
  let ri = 0, count = 0;
  const perRiver = world.rivers.map((r) => (r.points.length - 1) * 10);
  world.segs.forEach((s, i) => {
    if (count >= perRiver[ri]) { ri = Math.min(ri + 1, perRiver.length - 1); count = 0; }
    count++;
    segData.set([s[0], s[1], s[2], s[3], s[4], s[5], s[6], RIVER_SPEED[ri] || 1], i * 8);
  });
  const sbuf = d.createBuffer({ size: segData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  d.queue.writeBuffer(sbuf, 0, segData);

  const flowTex = d.createTexture({ size: [FLOW_RES, FLOW_RES], format: 'rgba16float', usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING, label: 'waterFlow' });
  const mips = Math.log2(WAVE_RES) + 1;
  const waveTex = d.createTexture({ size: [WAVE_RES, WAVE_RES], mipLevelCount: mips, format: 'rgba16float', usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING, label: 'waterWaves' });

  const samp = d.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const flowPipe = d.createComputePipeline({ layout: 'auto', compute: { module: shader(d, WGSL_LIB + FLOW_WGSL, 'water-flow'), entryPoint: 'main' } });
  const wavePipe = d.createComputePipeline({ layout: 'auto', compute: { module: shader(d, WGSL_LIB + WAVE_WGSL, 'water-waves'), entryPoint: 'main' } });
  const mipPipe = d.createComputePipeline({ layout: 'auto', compute: { module: shader(d, MIP_WGSL, 'water-mip'), entryPoint: 'main' } });

  const enc = d.createCommandEncoder();
  let p = enc.beginComputePass();
  p.setPipeline(flowPipe);
  p.setBindGroup(0, d.createBindGroup({ layout: flowPipe.getBindGroupLayout(0), entries: [
    { binding: 0, resource: { buffer: sbuf } }, { binding: 1, resource: world.infoTex.createView() },
    { binding: 2, resource: samp }, { binding: 3, resource: flowTex.createView() }] }));
  p.dispatchWorkgroups(FLOW_RES / 8, FLOW_RES / 8);
  p.setPipeline(wavePipe);
  p.setBindGroup(0, d.createBindGroup({ layout: wavePipe.getBindGroupLayout(0), entries: [
    { binding: 0, resource: waveTex.createView({ baseMipLevel: 0, mipLevelCount: 1 }) }] }));
  p.dispatchWorkgroups(WAVE_RES / 8, WAVE_RES / 8);
  p.end();
  for (let m = 1; m < mips; m++) {
    p = enc.beginComputePass();
    p.setPipeline(mipPipe);
    p.setBindGroup(0, d.createBindGroup({ layout: mipPipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: waveTex.createView({ baseMipLevel: m - 1, mipLevelCount: 1 }) },
      { binding: 1, resource: waveTex.createView({ baseMipLevel: m, mipLevelCount: 1 }) }] }));
    const s = Math.max(1, WAVE_RES >> m);
    p.dispatchWorkgroups(Math.ceil(s / 8), Math.ceil(s / 8));
    p.end();
  }
  d.queue.submit([enc.finish()]);
  d.queue.onSubmittedWorkDone().then(() => sbuf.destroy());
  return { flowTex, waveTex };
}
