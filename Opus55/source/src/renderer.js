// Deferred renderer: G-buffer -> tiled lighting (compute) -> module hooks -> forward transparents -> TAA -> post.
//
// Scene modules are plain objects with optional hooks (all receive ctx):
//   init(ctx)                    async; create pipelines/buffers, register lights/colliders
//   update(ctx)                  CPU per frame (no allocations)
//   compute(ctx, encoder)        GPU work before the G-buffer pass (culling, animation, fog volume)
//   gbuffer(ctx, pass)           draw opaque geometry into the G-buffer render pass
//   afterLighting(ctx, encoder)  GPU work on the lit scene (ctx.targets.scene) before transparents (e.g. SSR)
//   forward(ctx, pass)           draw transparents (water, glass, beams, rain) into the HDR scene
//   resize(ctx)                  render targets were recreated (rebuild bind groups that reference them)

import { WGSL_LIB, WGSL_FRAME, GBUFFER_OUT, FOG, MAX_LIGHTS } from './common.js';
import { shader } from './gpu.js';
import { mat4, halton } from './math.js';
import { Post } from './post.js';

export const GBUFFER_FORMATS = ['rgba8unorm', 'rgba16float', 'rgba16float', 'rgba16float'];
export const HDR_FORMAT = 'rgba16float';
export const DEPTH_FORMAT = 'depth32float';

export const WGSL_LIGHT = /* wgsl */ `
struct Light { posR: vec4f, color: vec4f };
// Neon flicker shared by lights and sign geometry. seed > 0 enables flicker.
fn neonFlicker(seed: f32, t: f32) -> f32 {
  if (seed <= 0.0) { return 1.0; }
  let buzz = 0.93 + 0.07 * sin(t * 110.0 + seed * 7.0);
  let slot = floor(t * 9.0 + seed * 13.0);
  let h = hash11u(u32(slot) * 7919u + u32(seed * 1000.0));
  let drop = select(1.0, 0.15 + 0.5 * hash11u(u32(slot) + 17u), h > 0.985);
  return buzz * drop;
}
`;

// Bindings available to forward-pass shaders (group 1).
export const WGSL_FORWARD = /* wgsl */ `
@group(1) @binding(0) var depthTex: texture_depth_2d;      // scene depth (read-only during forward pass)
@group(1) @binding(1) var sceneTex: texture_2d<f32>;       // lit opaque scene (HDR) copied before the forward pass
@group(1) @binding(2) var gNormalTex: texture_2d<f32>;     // G-buffer world normals
@group(1) @binding(3) var<storage, read> lights: array<Light>;
fn sceneDepthAt(px: vec2i) -> f32 { return textureLoad(depthTex, px, 0); }
`;

const LIGHTING_WGSL = /* wgsl */ `
@group(1) @binding(0) var gA: texture_2d<f32>;
@group(1) @binding(1) var gN: texture_2d<f32>;
@group(1) @binding(2) var gE: texture_2d<f32>;
@group(1) @binding(3) var gM: texture_2d<f32>;
@group(1) @binding(4) var gD: texture_depth_2d;
@group(1) @binding(5) var outC: texture_storage_2d<rgba16float, write>;
@group(1) @binding(6) var<storage, read> lights: array<Light>;

const TILE_MAX = 256u;
var<workgroup> tMin: atomic<u32>;
var<workgroup> tMax: atomic<u32>;
var<workgroup> tCount: atomic<u32>;
var<workgroup> tMask: atomic<u32>;   // 2.5D culling: 32 depth slices between zmin and zmax that contain geometry
var<workgroup> tList: array<u32, TILE_MAX>;

fn fresnelR(f0: vec3f, cosT: f32, rough: f32) -> vec3f {
  return f0 + (max(vec3f(1.0 - rough), f0) - f0) * pow(1.0 - cosT, 5.0);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u, @builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) li: u32) {
  let dims = textureDimensions(gD);
  let inside = gid.x < dims.x && gid.y < dims.y;
  let px = vec2i(min(gid.xy, dims - 1u));
  if (li == 0u) { atomicStore(&tMin, 0x7f7fffffu); atomicStore(&tMax, 0u); atomicStore(&tCount, 0u); atomicStore(&tMask, 0u); }
  workgroupBarrier();
  let d = textureLoad(gD, px, 0);
  if (d > 0.0 && inside) {
    let lin = linearDepth(d);
    atomicMin(&tMin, bitcast<u32>(lin));
    atomicMax(&tMax, bitcast<u32>(lin));
  }
  workgroupBarrier();
  let zmax = bitcast<f32>(atomicLoad(&tMax));
  let zmin = bitcast<f32>(atomicLoad(&tMin));
  let zScale = 32.0 / max(zmax - zmin, 1e-3);
  if (d > 0.0 && inside) {
    let sl = u32(clamp((linearDepth(d) - zmin) * zScale, 0.0, 31.0));
    atomicOr(&tMask, 1u << sl);
  }
  workgroupBarrier();
  let depthMask = atomicLoad(&tMask);
  let lightCount = u32(F.fog.w);
  if (zmax > 0.0) {
    let tanY = F.camRight.w;
    let tanX = tanY * F.camUp.w;
    let x0 = f32(wg.x * 16u) * F.res.z * 2.0 - 1.0 - 0.01;
    let x1 = f32(wg.x * 16u + 16u) * F.res.z * 2.0 - 1.0 + 0.01;
    let y1 = 1.0 - f32(wg.y * 16u) * F.res.w * 2.0 + 0.01;
    let y0 = 1.0 - f32(wg.y * 16u + 16u) * F.res.w * 2.0 - 0.01;
    let pl = normalize(vec3f(1.0, 0.0, x0 * tanX));
    let pr = normalize(vec3f(-1.0, 0.0, -x1 * tanX));
    let pb = normalize(vec3f(0.0, 1.0, y0 * tanY));
    let pt = normalize(vec3f(0.0, -1.0, -y1 * tanY));
    for (var i = li; i < lightCount; i += 256u) {
      let L = lights[i];
      let r = L.posR.w;
      if (r <= 0.0) { continue; }
      let vp = (F.view * vec4f(L.posR.xyz, 1.0)).xyz;
      let vz = -vp.z;
      if (vz + r < zmin || vz - r > zmax) { continue; }
      let s0 = u32(clamp((vz - r - zmin) * zScale, 0.0, 31.0));
      let s1 = u32(clamp((vz + r - zmin) * zScale, 0.0, 31.0));
      let lmask = (0xffffffffu >> (31u - s1)) & (0xffffffffu << s0);
      if ((lmask & depthMask) == 0u) { continue; }
      if (dot(pl, vp) < -r || dot(pr, vp) < -r || dot(pb, vp) < -r || dot(pt, vp) < -r) { continue; }
      let k = atomicAdd(&tCount, 1u);
      if (k < TILE_MAX) { tList[k] = i; }
    }
  }
  workgroupBarrier();
  if (!inside) { return; }

  let uv = (vec2f(px) + 0.5) * F.res.zw;
  if (d <= 0.0) {
    let dir = viewRay(uv);
    var sky = skyRadiance(dir);
    sky = applyFog(sky, uv, FOG_FAR * 2.0);
    textureStore(outC, px, vec4f(sky, 1.0));
    return;
  }

  let A = textureLoad(gA, px, 0);
  let N = textureLoad(gN, px, 0);
  let E = textureLoad(gE, px, 0);
  let M = textureLoad(gM, px, 0);
  let P = worldFromDepth(uv, d);
  var albedo = A.rgb;
  var rough = clamp(A.a, 0.03, 1.0);
  let n = normalize(N.xyz);
  let metal = N.w;
  let ao = E.a;
  let mat = M.z;
  let wet = saturate(F.params.z * M.w);
  albedo *= mix(1.0, 0.55, wet);
  rough = mix(rough, 0.05, wet * smoothstep(0.6, 0.95, n.y));

  let toCam = F.camPos.xyz - P;
  let dist = length(toCam);
  let v = toCam / dist;
  let NdotV = max(dot(n, v), 1e-3);
  let f0 = mix(vec3f(select(0.04, 0.08, mat == 2.0)), albedo, metal);
  let diffC = albedo * (1.0 - metal);

  // ambient: sky hemisphere + warm city bounce from below
  let skyAmb = skyAmbient(normalize(vec3f(n.x, max(n.y, 0.0) + 0.2, n.z)));
  let cityBounce = vec3f(0.05, 0.025, 0.03) * saturate(0.6 - n.y * 0.6);
  var col = diffC * (skyAmb * 1.4 + cityBounce) * ao;

  // environment specular
  let R = reflect(-v, n);
  let Fe = fresnelR(f0, NdotV, rough);
  let roughMix = smoothstep(0.1, 0.5, rough);
  var env = skyAmbient(R);
  if (roughMix < 0.99) { env = mix(skyRadiance(R), env, roughMix); }
  col += env * Fe * ao * (1.0 - rough * 0.7);

  // moon light
  let l = F.moon.xyz;
  let NdotL = select(max(dot(n, l), 0.0), (dot(n, l) + 0.5) / 1.5, mat == 1.0);
  let moonCol = vec3f(0.55, 0.65, 0.95) * F.moon.w;
  if (NdotL > 0.0) {
    let h = normalize(v + l);
    let NdotH = max(dot(n, h), 0.0);
    // In rain the moon sits behind cloud: its highlight is broad and soft, never a sharp mirror glint.
    let mRough = max(rough, mix(0.08, 0.55, saturate(F.params.x * 2.0)));
    let a = mRough * mRough; let a2 = a * a;
    let dd = NdotH * NdotH * (a2 - 1.0) + 1.0;
    let D = a2 / (PI * dd * dd);
    let k = (rough + 1.0) * (rough + 1.0) / 8.0;
    let G = NdotL / (NdotL * (1.0 - k) + k) * NdotV / (NdotV * (1.0 - k) + k);
    let Fs = f0 + (1.0 - f0) * pow(1.0 - max(dot(v, h), 0.0), 5.0);
    let spec = D * G * Fs / (4.0 * NdotL * NdotV + 1e-4);
    col += (diffC / PI * (1.0 - Fs) + spec) * moonCol * NdotL;
  }

  // point lights
  let cnt = min(atomicLoad(&tCount), TILE_MAX);
  let t = time();
  for (var j = 0u; j < cnt; j++) {
    let L = lights[tList[j]];
    let lv = L.posR.xyz - P;
    let d2 = dot(lv, lv);
    let r = L.posR.w;
    if (d2 > r * r) { continue; }
    let ld = sqrt(d2);
    let ll = lv / ld;
    var nl = dot(n, ll);
    if (mat == 1.0) { nl = (nl + 0.5) / 1.5; }
    if (nl <= 0.0) { continue; }
    let x = ld / r;
    let fall = saturate(1.0 - x * x * x * x);
    let atten = fall * fall / (d2 + 1.0);
    let radiance = L.color.rgb * atten * neonFlicker(L.color.w, t);
    let h = normalize(v + ll);
    let NdotH = max(dot(n, h), 0.0);
    let a = rough * rough; let a2 = a * a;
    let dd = NdotH * NdotH * (a2 - 1.0) + 1.0;
    let D = a2 / (PI * dd * dd);
    let k = (rough + 1.0) * (rough + 1.0) / 8.0;
    let G = nl / (nl * (1.0 - k) + k) * NdotV / (NdotV * (1.0 - k) + k);
    let Fs = f0 + (1.0 - f0) * pow(1.0 - max(dot(v, h), 0.0), 5.0);
    let spec = min(D * G * Fs / (4.0 * nl * NdotV + 1e-4), vec3f(60.0));
    col += (diffC / PI * (1.0 - Fs) + spec) * radiance * nl;
  }

  col += E.rgb;
  col = applyFog(col, uv, dist);
  textureStore(outC, px, vec4f(col, 1.0));
}
`;

const TAA_WGSL = /* wgsl */ `
@group(1) @binding(0) var curTex: texture_2d<f32>;
@group(1) @binding(1) var histTex: texture_2d<f32>;
@group(1) @binding(2) var motTex: texture_2d<f32>;
@group(1) @binding(3) var depTex: texture_depth_2d;
@group(1) @binding(4) var outTex: texture_storage_2d<rgba16float, write>;
@group(1) @binding(5) var<uniform> taa: vec4f; // x reset, y blend factor

fn toYCoCg(c: vec3f) -> vec3f {
  return vec3f(0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b);
}
fn fromYCoCg(c: vec3f) -> vec3f {
  return vec3f(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z);
}
fn tmw(c: vec3f) -> vec3f { return c / (1.0 + luma(c)); }
fn itmw(c: vec3f) -> vec3f { return c / max(1.0 - luma(c), 1e-4); }

// 5-tap Catmull-Rom history sample (bilinear taps).
fn sampleHist(uv: vec2f, size: vec2f) -> vec3f {
  let sp = uv * size;
  let tc = floor(sp - 0.5) + 0.5;
  let f = sp - tc;
  let w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  let w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  let w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  let w3 = f * f * (-0.5 + 0.5 * f);
  let w12 = w1 + w2;
  let o12 = w2 / w12;
  let t0 = (tc - 1.0) / size; let t3 = (tc + 2.0) / size; let t12 = (tc + o12) / size;
  var r = vec3f(0.0);
  r += textureSampleLevel(histTex, sampClamp, vec2f(t12.x, t0.y), 0.0).rgb * w12.x * w0.y;
  r += textureSampleLevel(histTex, sampClamp, vec2f(t0.x, t12.y), 0.0).rgb * w0.x * w12.y;
  r += textureSampleLevel(histTex, sampClamp, vec2f(t12.x, t12.y), 0.0).rgb * w12.x * w12.y;
  r += textureSampleLevel(histTex, sampClamp, vec2f(t3.x, t12.y), 0.0).rgb * w3.x * w12.y;
  r += textureSampleLevel(histTex, sampClamp, vec2f(t12.x, t3.y), 0.0).rgb * w12.x * w3.y;
  let wsum = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return max(r / wsum, vec3f(0.0));
}

var<workgroup> tC: array<vec3f, 324>;
var<workgroup> tD: array<f32, 324>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u, @builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) li: u32) {
  let dims = textureDimensions(curTex);
  let maxp = vec2i(dims) - 1;
  let origin = vec2i(wg.xy * 16u) - 1;
  // cooperative load of the 18x18 neighborhood (tonemapped YCoCg color + depth)
  for (var k = li; k < 324u; k += 256u) {
    let q = clamp(origin + vec2i(i32(k % 18u), i32(k / 18u)), vec2i(0), maxp);
    tC[k] = toYCoCg(tmw(textureLoad(curTex, q, 0).rgb));
    tD[k] = textureLoad(depTex, q, 0);
  }
  workgroupBarrier();
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let px = vec2i(gid.xy);
  let size = vec2f(dims);
  let uv = (vec2f(px) + 0.5) / size;
  let lp = vec2i(gid.xy - wg.xy * 16u) + 1;
  let c = tC[u32(lp.y * 18 + lp.x)];
  if (taa.x > 0.5) { textureStore(outTex, px, vec4f(itmw(fromYCoCg(c)), 1.0)); return; }

  var m1 = vec3f(0.0); var m2 = vec3f(0.0);
  var bestD = -1.0; var bestO = vec2i(0);
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let k = u32((lp.y + y) * 18 + lp.x + x);
      let cc = tC[k];
      m1 += cc; m2 += cc * cc;
      let dq = tD[k];
      if (dq > bestD) { bestD = dq; bestO = vec2i(x, y); }
    }
  }
  var motion = textureLoad(motTex, clamp(px + bestO, vec2i(0), maxp), 0).xy;
  if (bestD <= 0.0) {
    // sky: camera rotation only
    let dir = viewRay(uv);
    let pc = F.prevViewProjNJ * vec4f(dir, 0.0);
    let cc = F.viewProjNJ * vec4f(dir, 0.0);
    motion = (cc.xy / cc.w - pc.xy / pc.w) * vec2f(0.5, -0.5);
  }
  let prevUV = uv - motion;
  let mean = m1 / 9.0;
  let sigma = sqrt(max(m2 / 9.0 - mean * mean, vec3f(0.0)));
  let speed = length(motion * size);
  let gamma = mix(1.25, 0.8, saturate(speed / 12.0));
  let lo = mean - sigma * gamma; let hi = mean + sigma * gamma;

  var hist = toYCoCg(tmw(sampleHist(prevUV, size)));
  // clip toward mean
  let center = (lo + hi) * 0.5; let ext = (hi - lo) * 0.5 + 1e-5;
  let off = hist - center;
  let ts = abs(off / ext);
  let mx = max(ts.x, max(ts.y, ts.z));
  if (mx > 1.0) { hist = center + off / mx; }

  var alpha = taa.y + saturate(speed / 40.0) * 0.15;
  if (any(prevUV < vec2f(0.0)) || any(prevUV > vec2f(1.0))) { alpha = 1.0; }
  let res = itmw(fromYCoCg(mix(hist, c, alpha)));
  textureStore(outTex, px, vec4f(max(res, vec3f(0.0)), 1.0));
}
`;

export class Renderer {
  constructor(ctx) {
    this.ctx = ctx;
    const device = ctx.device;
    this.device = device;
    this.frameData = new Float32Array(144);
    this.frameBuf = device.createBuffer({ size: this.frameData.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.taaData = new Float32Array(4);
    this.taaBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.sampRepeat = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', addressModeW: 'repeat', maxAnisotropy: 8 });
    this.sampClamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear' });

    // froxel fog volume, written by the fog module
    this.fogTex = device.createTexture({ size: [FOG.W, FOG.H, FOG.D], dimension: '3d', format: 'rgba16float', usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING });

    const VFC = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE;
    this.frameLayout = device.createBindGroupLayout({ label: 'frame', entries: [
      { binding: 0, visibility: VFC, buffer: { type: 'uniform' } },
      { binding: 1, visibility: VFC, sampler: { type: 'filtering' } },
      { binding: 2, visibility: VFC, sampler: { type: 'filtering' } },
      { binding: 3, visibility: VFC, texture: { sampleType: 'unfilterable-float' } },
      { binding: 4, visibility: VFC, texture: { sampleType: 'float' } },
      { binding: 5, visibility: VFC, texture: { sampleType: 'float', viewDimension: '3d' } },
      { binding: 6, visibility: VFC, buffer: { type: 'uniform' } },
    ] });
    const VF = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
    this.forwardLayout = device.createBindGroupLayout({ label: 'forward', entries: [
      { binding: 0, visibility: VF, texture: { sampleType: 'depth' } },
      { binding: 1, visibility: VF, texture: { sampleType: 'float' } },
      { binding: 2, visibility: VF, texture: { sampleType: 'float' } },
      { binding: 3, visibility: VF, buffer: { type: 'read-only-storage' } },
    ] });

    const w = ctx.world;
    this.worldBuf = device.createBuffer({ size: w.worldUniformData.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.worldBuf, 0, w.worldUniformData);
    this.frameGroup = device.createBindGroup({ layout: this.frameLayout, entries: [
      { binding: 0, resource: { buffer: this.frameBuf } },
      { binding: 1, resource: this.sampRepeat },
      { binding: 2, resource: this.sampClamp },
      { binding: 3, resource: w.heightTex.createView() },
      { binding: 4, resource: w.infoTex.createView() },
      { binding: 5, resource: this.fogTex.createView({ dimension: '3d' }) },
      { binding: 6, resource: { buffer: this.worldBuf } },
    ] });

    // lighting pipeline
    this.lightLayout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'depth' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: HDR_FORMAT } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    ] });
    this.lightPipe = device.createComputePipeline({
      label: 'lighting',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.frameLayout, this.lightLayout] }),
      compute: { module: shader(device, WGSL_LIB + WGSL_FRAME + WGSL_LIGHT + LIGHTING_WGSL, 'lighting'), entryPoint: 'main' },
    });

    this.taaLayout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'depth' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: HDR_FORMAT } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ] });
    this.taaPipe = device.createComputePipeline({
      label: 'taa',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.frameLayout, this.taaLayout] }),
      compute: { module: shader(device, WGSL_LIB + WGSL_FRAME + TAA_WGSL, 'taa'), entryPoint: 'main' },
    });

    this.post = new Post(ctx, this);

    // camera matrices
    this.view = mat4.create(); this.proj = mat4.create(); this.projNJ = mat4.create();
    this.viewProj = mat4.create(); this.viewProjNJ = mat4.create(); this.prevViewProjNJ = mat4.create();
    this.invViewProj = mat4.create();
    this.frameIndex = 0;
    this.historyIndex = 0;
    this.resetHistory = true;
    this.width = 0; this.height = 0;

    // reusable descriptors (avoid per-frame allocations)
    this.gbufferColorAtt = GBUFFER_FORMATS.map(() => ({ view: null, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }));
    this.gbufferDesc = { colorAttachments: this.gbufferColorAtt, depthStencilAttachment: { view: null, depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'store' }, timestampWrites: undefined };
    this.fwdColorAtt = [{ view: null, loadOp: 'load', storeOp: 'store' }, { view: null, loadOp: 'load', storeOp: 'store' }];
    this.fwdDesc = { colorAttachments: this.fwdColorAtt, depthStencilAttachment: { view: null, depthReadOnly: true }, timestampWrites: undefined };
    this.computeDesc = { timestampWrites: undefined };
    this.copySrc = { texture: null }; this.copyDst = { texture: null }; this.copySize = [0, 0];
  }

  // ---------------- pipeline helpers for modules

  gbufferPipeline({ label, code, vs = 'vs', fs = 'fs', buffers = [], groups = [], cull = 'back', topology = 'triangle-list', constants }) {
    const d = this.device;
    const module = shader(d, WGSL_LIB + WGSL_FRAME + WGSL_LIGHT + GBUFFER_OUT + code, label);
    return d.createRenderPipeline({
      label,
      layout: d.createPipelineLayout({ bindGroupLayouts: [this.frameLayout, ...groups] }),
      vertex: { module, entryPoint: vs, buffers, constants },
      fragment: { module, entryPoint: fs, targets: GBUFFER_FORMATS.map((format) => ({ format })), constants },
      primitive: { topology, cullMode: cull },
      depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'greater' },
    });
  }

  // blend: 'add' (additive), 'alpha' (straight alpha), 'premul', or null (opaque overwrite)
  forwardPipeline({ label, code, vs = 'vs', fs = 'fs', buffers = [], groups = [], cull = 'none', topology = 'triangle-list', blend = 'alpha', writeMotion = false, depthTest = true, constants }) {
    const d = this.device;
    const module = shader(d, WGSL_LIB + WGSL_FRAME + WGSL_LIGHT + WGSL_FORWARD + code, label);
    const blends = {
      add: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } },
      alpha: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } },
      premul: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } },
    };
    return d.createRenderPipeline({
      label,
      layout: d.createPipelineLayout({ bindGroupLayouts: [this.frameLayout, this.forwardLayout, ...groups] }),
      vertex: { module, entryPoint: vs, buffers, constants },
      fragment: { module, entryPoint: fs, constants, targets: [
        { format: HDR_FORMAT, blend: blend ? blends[blend] : undefined },
        { format: 'rgba16float', writeMask: writeMotion ? GPUColorWrite.ALL : 0 },
      ] },
      primitive: { topology, cullMode: cull },
      depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: depthTest ? 'greater' : 'always' },
    });
  }

  computePipeline({ label, code, entry = 'main', groups = [], withFrame = true, constants }) {
    const d = this.device;
    const module = shader(d, WGSL_LIB + (withFrame ? WGSL_FRAME + WGSL_LIGHT : '') + code, label);
    return d.createComputePipeline({
      label,
      layout: d.createPipelineLayout({ bindGroupLayouts: withFrame ? [this.frameLayout, ...groups] : groups }),
      compute: { module, entryPoint: entry, constants },
    });
  }

  // ---------------- targets

  resize(w, h) {
    if (w === this.width && h === this.height) return false;
    this.width = w; this.height = h;
    const d = this.device;
    const T = GPUTextureUsage;
    const old = this.targets;
    if (old) for (const k in old) if (old[k] && old[k].destroy) old[k].destroy();
    const tex = (format, usage, label) => d.createTexture({ size: [w, h], format, usage, label });
    const t = {
      albedo: tex(GBUFFER_FORMATS[0], T.RENDER_ATTACHMENT | T.TEXTURE_BINDING, 'gAlbedo'),
      normal: tex(GBUFFER_FORMATS[1], T.RENDER_ATTACHMENT | T.TEXTURE_BINDING, 'gNormal'),
      emissive: tex(GBUFFER_FORMATS[2], T.RENDER_ATTACHMENT | T.TEXTURE_BINDING, 'gEmissive'),
      motion: tex(GBUFFER_FORMATS[3], T.RENDER_ATTACHMENT | T.TEXTURE_BINDING, 'gMotion'),
      depth: tex(DEPTH_FORMAT, T.RENDER_ATTACHMENT | T.TEXTURE_BINDING, 'depth'),
      scene: tex(HDR_FORMAT, T.STORAGE_BINDING | T.RENDER_ATTACHMENT | T.TEXTURE_BINDING | T.COPY_SRC, 'scene'),
      sceneCopy: tex(HDR_FORMAT, T.TEXTURE_BINDING | T.COPY_DST, 'sceneCopy'),
      hist0: tex(HDR_FORMAT, T.STORAGE_BINDING | T.TEXTURE_BINDING, 'hist0'),
      hist1: tex(HDR_FORMAT, T.STORAGE_BINDING | T.TEXTURE_BINDING, 'hist1'),
    };
    this.targets = t;
    this.views = {};
    for (const k in t) this.views[k] = t[k].createView();
    this.gbufferColorAtt[0].view = this.views.albedo;
    this.gbufferColorAtt[1].view = this.views.normal;
    this.gbufferColorAtt[2].view = this.views.emissive;
    this.gbufferColorAtt[3].view = this.views.motion;
    this.gbufferDesc.depthStencilAttachment.view = this.views.depth;
    this.fwdColorAtt[0].view = this.views.scene;
    this.fwdColorAtt[1].view = this.views.motion;
    this.fwdDesc.depthStencilAttachment.view = this.views.depth;
    this.copySrc.texture = t.scene; this.copyDst.texture = t.sceneCopy; this.copySize[0] = w; this.copySize[1] = h;

    this.lightGroup = d.createBindGroup({ layout: this.lightLayout, entries: [
      { binding: 0, resource: this.views.albedo }, { binding: 1, resource: this.views.normal },
      { binding: 2, resource: this.views.emissive }, { binding: 3, resource: this.views.motion },
      { binding: 4, resource: this.views.depth }, { binding: 5, resource: this.views.scene },
      { binding: 6, resource: { buffer: this.ctx.lights.buffer } },
    ] });
    this.forwardGroup = d.createBindGroup({ layout: this.forwardLayout, entries: [
      { binding: 0, resource: this.views.depth }, { binding: 1, resource: this.views.sceneCopy },
      { binding: 2, resource: this.views.normal }, { binding: 3, resource: { buffer: this.ctx.lights.buffer } },
    ] });
    this.taaGroups = [0, 1].map((i) => d.createBindGroup({ layout: this.taaLayout, entries: [
      { binding: 0, resource: this.views.scene },
      { binding: 1, resource: i === 0 ? this.views.hist1 : this.views.hist0 },
      { binding: 2, resource: this.views.motion },
      { binding: 3, resource: this.views.depth },
      { binding: 4, resource: i === 0 ? this.views.hist0 : this.views.hist1 },
      { binding: 5, resource: { buffer: this.taaBuf } },
    ] }));
    this.post.resize(w, h);
    this.resetHistory = true;
    this.ctx.forwardGroup = this.forwardGroup;
    this.ctx.targets = t;
    this.ctx.views = this.views;
    return true;
  }

  // ---------------- per-frame

  updateCamera(cam, w, h) {
    const ctx = this.ctx;
    mat4.copy(this.prevViewProjNJ, this.viewProjNJ);
    mat4.fromYawPitch(this.view, cam.x, cam.y, cam.z, cam.yaw, cam.pitch);
    const aspect = w / h;
    mat4.perspectiveReversedInf(this.projNJ, cam.fov, aspect, cam.near);
    mat4.copy(this.proj, this.projNJ);
    const idx = (this.frameIndex % 8) + 1;
    const jx = ctx.taaEnabled ? (halton(idx, 2) - 0.5) * 2 / w : 0;
    const jy = ctx.taaEnabled ? (halton(idx, 3) - 0.5) * 2 / h : 0;
    this.proj[8] = -jx; this.proj[9] = -jy;
    mat4.multiply(this.viewProj, this.proj, this.view);
    mat4.multiply(this.viewProjNJ, this.projNJ, this.view);
    mat4.invert(this.invViewProj, this.viewProj);
    if (this.frameIndex === 0 || this.resetHistory) mat4.copy(this.prevViewProjNJ, this.viewProjNJ);

    const f = this.frameData;
    f.set(this.viewProj, 0); f.set(this.viewProjNJ, 16); f.set(this.prevViewProjNJ, 32);
    f.set(this.invViewProj, 48); f.set(this.view, 64); f.set(this.proj, 80);
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    let o = 96;
    f[o++] = cam.x; f[o++] = cam.y; f[o++] = cam.z; f[o++] = ctx.time;
    f[o++] = -sy * cp; f[o++] = sp; f[o++] = -cy * cp; f[o++] = ctx.dt;
    f[o++] = w; f[o++] = h; f[o++] = 1 / w; f[o++] = 1 / h;
    f[o++] = jx; f[o++] = jy; f[o++] = this.lastJx || 0; f[o++] = this.lastJy || 0;
    this.lastJx = jx; this.lastJy = jy;
    const m = ctx.env.moonDir;
    f[o++] = m[0]; f[o++] = m[1]; f[o++] = m[2]; f[o++] = ctx.env.moonIntensity;
    f[o++] = ctx.env.rain; f[o++] = this.frameIndex; f[o++] = ctx.env.wetness; f[o++] = ctx.quality.level;
    f[o++] = ctx.env.fogDensity; f[o++] = ctx.env.fogFalloff; f[o++] = ctx.env.fogBase; f[o++] = ctx.lights.count;
    // right / up (camera basis)
    f[o++] = cy; f[o++] = 0; f[o++] = -sy; f[o++] = Math.tan(cam.fov / 2);
    // up = right x forward
    const fx = -sy * cp, fy = sp, fz = -cy * cp, rx = cy, rz = -sy;
    f[o++] = -rz * fy; f[o++] = rz * fx - rx * fz; f[o++] = rx * fy; f[o++] = aspect;
    f[o++] = cam.near; f[o++] = ctx.env.exposure; f[o++] = ctx.env.windX; f[o++] = ctx.env.windZ;
    const s = ctx.show;
    f[o++] = s.intensity; f[o++] = s.time; f[o++] = s.beatPhase; f[o++] = s.beat;
    this.device.queue.writeBuffer(this.frameBuf, 0, f);
  }

  render(modules) {
    const ctx = this.ctx;
    const d = this.device;
    const prof = ctx.prof;
    prof.beginFrame();
    ctx.lights.flush();
    const enc = d.createCommandEncoder();

    for (let i = 0; i < modules.length; i++) if (modules[i].compute) modules[i].compute(ctx, enc);

    this.gbufferDesc.timestampWrites = prof.ts('gbuffer');
    let pass = enc.beginRenderPass(this.gbufferDesc);
    pass.setBindGroup(0, this.frameGroup);
    for (let i = 0; i < modules.length; i++) if (modules[i].gbuffer) modules[i].gbuffer(ctx, pass);
    pass.end();

    this.computeDesc.timestampWrites = prof.ts('lighting');
    let cp = enc.beginComputePass(this.computeDesc);
    cp.setPipeline(this.lightPipe);
    cp.setBindGroup(0, this.frameGroup);
    cp.setBindGroup(1, this.lightGroup);
    cp.dispatchWorkgroups(Math.ceil(this.width / 16), Math.ceil(this.height / 16));
    cp.end();

    for (let i = 0; i < modules.length; i++) if (modules[i].afterLighting) modules[i].afterLighting(ctx, enc);

    enc.copyTextureToTexture(this.copySrc, this.copyDst, this.copySize);

    this.fwdDesc.timestampWrites = prof.ts('forward');
    pass = enc.beginRenderPass(this.fwdDesc);
    pass.setBindGroup(0, this.frameGroup);
    pass.setBindGroup(1, this.forwardGroup);
    for (let i = 0; i < modules.length; i++) if (modules[i].forward) modules[i].forward(ctx, pass);
    pass.end();

    // TAA
    this.taaData[0] = this.resetHistory || !ctx.taaEnabled ? 1 : 0;
    this.taaData[1] = 0.1;
    d.queue.writeBuffer(this.taaBuf, 0, this.taaData);
    this.computeDesc.timestampWrites = prof.ts('taa');
    cp = enc.beginComputePass(this.computeDesc);
    cp.setPipeline(this.taaPipe);
    cp.setBindGroup(0, this.frameGroup);
    cp.setBindGroup(1, this.taaGroups[this.historyIndex]);
    cp.dispatchWorkgroups(Math.ceil(this.width / 16), Math.ceil(this.height / 16));
    cp.end();
    const taaOut = this.historyIndex === 0 ? this.views.hist0 : this.views.hist1;
    this.taaOutTex = this.historyIndex === 0 ? this.targets.hist0 : this.targets.hist1;

    const swap = ctx.gpu.context.getCurrentTexture();
    this.post.render(enc, this.historyIndex, swap);
    this.lastSwap = swap;

    if (ctx.onBeforeSubmit) ctx.onBeforeSubmit(enc, swap);
    const slot = prof.endFrame(enc);
    d.queue.submit([enc.finish()]);
    prof.afterSubmit(slot);
    if (ctx.onAfterSubmit) ctx.onAfterSubmit();

    this.historyIndex ^= 1;
    this.frameIndex++;
    this.resetHistory = false;
    return taaOut;
  }
}
