// Screen-space reflections for the river (planar, y = 0) and for wet, smooth, upward-facing ground.
// Runs in afterLighting:
//   1. trace (compute, half resolution): for each half-res pixel decide whether it is water (the y = 0 plane is in
//      front of the opaque depth) or reflective wet ground, then ray-march the reflected ray in screen space against
//      the depth buffer and fetch the lit scene at the hit. Writes reflTex:
//        water texels:  rgb = reflection (with sky / city glow fallback), a = 2 + hit confidence
//        ground texels: rgb = reflection * confidence, a = confidence (0 = nothing)
//   2. composite (render pass, full resolution, premultiplied blend into the lit scene): depth-aware upsample of the
//      ground reflections, weighted by Fresnel, wetness and puddles. Water texels are used later by the water shader.

import { WGSL_LIB, WGSL_FRAME, WGSL_FULLSCREEN } from './common.js';
import { HDR_FORMAT } from './renderer.js';
import { shader } from './gpu.js';

export const WGSL_SSR_COMMON = /* wgsl */ `
// Is the water plane (y = 0) in front of the opaque surface along this view ray? Returns the ray distance or -1.
fn waterHit(dir: vec3f, sceneLin: f32) -> f32 {
  let cy = F.camPos.y;
  if (cy <= 0.0 || dir.y > -1e-5) { return -1.0; }
  let t = -cy / dir.y;
  let z = t * dot(dir, F.camFwd.xyz);
  return select(-1.0, t, z < sceneLin);
}
// Reflective strength of wet ground (0 = none), from the G-buffer.
fn groundRefl(n: vec3f, A: vec4f, M: vec4f) -> f32 {
  let wet = saturate(F.params.z * M.w);
  let flat = smoothstep(0.75, 0.97, n.y);
  let rough = mix(A.a, 0.05, wet * flat);
  return wet * flat * (1.0 - smoothstep(0.15, 0.45, rough));
}
`;

const TRACE_WGSL = /* wgsl */ `
@group(1) @binding(0) var dTex: texture_depth_2d;
@group(1) @binding(1) var nTex: texture_2d<f32>;
@group(1) @binding(2) var aTex: texture_2d<f32>;
@group(1) @binding(3) var mTex: texture_2d<f32>;
@group(1) @binding(4) var sTex: texture_2d<f32>;
@group(1) @binding(5) var outR: texture_storage_2d<rgba16float, write>;

override STEPS_W: i32 = 32;
override STEPS_G: i32 = 20;

fn sceneLin(px: vec2i) -> f32 {
  let d = textureLoad(dTex, px, 0);
  return select(1e9, linearDepth(d), d > 0.0);
}

// Screen-space march of P + R * s. Returns (uv, confidence).
fn trace(P: vec3f, R: vec3f, steps: i32, jit: f32, maxLen: f32, dims: vec2f) -> vec3f {
  let fwd = F.camFwd.xyz;
  let z0 = dot(P - F.camPos.xyz, fwd);
  var L = maxLen;
  let rz = dot(R, fwd);
  if (rz < 0.0) { L = min(L, (z0 - F.misc.x * 4.0) / -rz); }
  if (L <= 0.0) { return vec3f(0.0); }
  let c0 = F.viewProj * vec4f(P, 1.0);
  let c1 = F.viewProj * vec4f(P + R * L, 1.0);
  let k0 = 1.0 / c0.w; let k1 = 1.0 / c1.w;
  let n0 = c0.xy * k0; let n1 = c1.xy * k1;
  let dn = n1 - n0;
  var tmax = 1.0;
  if (dn.x > 1e-6) { tmax = min(tmax, (1.0 - n0.x) / dn.x); }
  if (dn.x < -1e-6) { tmax = min(tmax, (-1.0 - n0.x) / dn.x); }
  if (dn.y > 1e-6) { tmax = min(tmax, (1.0 - n0.y) / dn.y); }
  if (dn.y < -1e-6) { tmax = min(tmax, (-1.0 - n0.y) / dn.y); }
  if (tmax <= 0.0) { return vec3f(0.0); }
  var tPrev = 0.0;
  var zPrev = z0;
  let inv = 1.0 / f32(steps);
  for (var i = 1; i <= steps; i++) {
    let tt = pow((f32(i) - jit) * inv, 1.6) * tmax;
    let rayZ = 1.0 / mix(k0, k1, tt);
    let uv = (n0 + dn * tt) * vec2f(0.5, -0.5) + 0.5;
    let dz = rayZ - sceneLin(vec2i(uv * dims));
    let thick = max(abs(rayZ - zPrev) * 1.2, 0.8) + rayZ * 0.008;
    if (dz > 0.0 && dz < thick) {
      var lo = tPrev; var hi = tt;
      for (var j = 0; j < 4; j++) {
        let m = 0.5 * (lo + hi);
        let uvm = (n0 + dn * m) * vec2f(0.5, -0.5) + 0.5;
        if (1.0 / mix(k0, k1, m) > sceneLin(vec2i(uvm * dims))) { hi = m; } else { lo = m; }
      }
      let uvh = (n0 + dn * hi) * vec2f(0.5, -0.5) + 0.5;
      let e = min(uvh, 1.0 - uvh);
      return vec3f(uvh, smoothstep(0.0, 0.05, e.x) * smoothstep(0.0, 0.08, e.y));
    }
    tPrev = tt; zPrev = rayZ;
  }
  return vec3f(0.0);
}

// What the river reflects when the screen has no data: sky plus a smeared glow of the city lights at the horizon.
fn waterFallback(R: vec3f) -> vec3f {
  // cheap sky (no clouds or stars: the ripples blur them anyway)
  var c = skyAmbient(R) * 0.8 + vec3f(0.012, 0.008, 0.014) * saturate(R.y * 3.0);
  let az = atan2(R.x, R.z);
  let band = exp(-max(R.y, 0.0) * 14.0);
  let lights = 0.55 + 0.45 * sin(az * 23.0 + 1.7) * sin(az * 7.0 + 0.4);
  c += vec3f(0.30, 0.12, 0.20) * band * lights * 0.35;
  return c;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let hd = textureDimensions(outR);
  if (gid.x >= hd.x || gid.y >= hd.y) { return; }
  let fd = textureDimensions(dTex);
  let dims = vec2f(fd);
  let px = min(vec2i(gid.xy) * 2, vec2i(fd) - 1);
  let uv = (vec2f(px) + 0.5) * F.res.zw;
  let dRaw = textureLoad(dTex, px, 0);
  let sz = select(1e9, linearDepth(dRaw), dRaw > 0.0);
  let dir = viewRay(uv);
  let cam = F.camPos.xyz;
  let jit = ign(vec2f(gid.xy), F.params.y);

  // classify: river surface (planar mirror) or wet reflective ground; one shared trace call keeps the shader small
  let tW = waterHit(dir, sz);
  var P = vec3f(0.0); var R = vec3f(0.0); var n = vec3f(0.0, 1.0, 0.0);
  var steps = STEPS_W; var maxLen = 8000.0; var g = 0.0;
  if (tW > 0.0) {
    P = cam + dir * tW;
    R = normalize(vec3f(dir.x, -dir.y, dir.z));
  } else {
    if (dRaw <= 0.0) { textureStore(outR, gid.xy, vec4f(0.0)); return; }
    let N = textureLoad(nTex, px, 0);
    let A = textureLoad(aTex, px, 0);
    let M = textureLoad(mTex, px, 0);
    n = normalize(N.xyz);
    g = groundRefl(n, A, M);
    if (g < 0.02) { textureStore(outR, gid.xy, vec4f(0.0)); return; }
    P = worldFromDepth(uv, dRaw);
    // blend weight: Fresnel (water film), wetness, puddles (mirror-like patches on flat ground); skip faint pixels
    let fres = 0.02 + 0.98 * pow(1.0 - saturate(dot(n, -dir)), 5.0);
    let puddle = smoothstep(0.55, 0.68, vnoise2(P.xz * 0.12)) * smoothstep(0.96, 0.995, n.y);
    g *= mix(0.6, 1.0, puddle) * mix(fres, max(fres, 0.35), puddle);
    if (g < 0.02) { textureStore(outR, gid.xy, vec4f(0.0)); return; }
    // uneven wet surface: smooth world-space micro-normals (stable under TAA) plus a little temporal jitter;
    // the composite then smears the result vertically into the streaks typical of wet streets
    let rough = mix(A.a, 0.05, saturate(F.params.z * M.w));
    let q = P.xz * 0.7;
    let wn = vec2f(sin(q.x * 1.7 + sin(q.y * 1.3)), sin(q.y * 1.9 + sin(q.x * 1.1))) * (0.012 + rough * 0.1);
    let hj = (vec2f(jit, fract(jit * 7.31)) - 0.5) * 0.01;
    R = reflect(dir, normalize(n + vec3f(wn.x + hj.x, 0.0, wn.y + hj.y)));
    if (R.y < 0.02) { R = normalize(vec3f(R.x, 0.02, R.z)); }
    P += n * 0.05;
    steps = STEPS_G; maxLen = 600.0;
  }
  let h = trace(P, R, steps, jit, maxLen, dims);
  let hit = min(textureSampleLevel(sTex, sampClamp, h.xy, 0.0).rgb, vec3f(100.0));
  if (tW > 0.0) {
    let col = mix(waterFallback(R), hit, h.z);
    textureStore(outR, gid.xy, vec4f(col, 2.0 + h.z));
    return;
  }
  let k = g * h.z;
  textureStore(outR, gid.xy, vec4f(hit * k, k));
}
`;

const COMP_WGSL = /* wgsl */ `
@group(1) @binding(0) var rTex: texture_2d<f32>;

// Premultiplied blend of the half-resolution wet-ground reflections, smeared vertically into streaks.
@fragment fn fs(i: FsOut) -> @location(0) vec4f {
  let uv = i.pos.xy * F.res.zw;
  // early out: no wet-ground reflection data around this pixel
  let ga = textureGather(3, rTex, sampClamp, uv);
  let gnd = (ga > vec4f(0.0005)) & (ga < vec4f(1.5));
  if (!any(gnd)) { discard; }
  let len = 0.0045 * (1.0 + F.params.x);
  var acc = vec4f(0.0); var wsum = 0.0;
  for (var k = 0; k < 4; k++) {
    let fk = f32(k) - 1.5;
    var s = textureSampleLevel(rTex, sampClamp, uv + vec2f(0.0, fk * len), 0.0);
    if (s.a > 1.5) { s = vec4f(0.0); }
    let w = exp(-fk * fk * 0.3);
    acc += s * w; wsum += w;
  }
  let r = acc / wsum;
  if (r.a <= 0.0005) { discard; }
  return r;
}`;
export class WaterSSR {
  init(ctx) {
    const d = ctx.device, r = ctx.renderer;
    this.traceLayout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'depth' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float' } },
    ] });
    const q = ctx.quality.level;
    this.tracePipe = r.computePipeline({ label: 'ssr-trace', code: WGSL_SSR_COMMON + TRACE_WGSL, groups: [this.traceLayout],
      constants: { STEPS_W: q >= 2 ? 24 : q === 1 ? 16 : 12, STEPS_G: q >= 2 ? 12 : q === 1 ? 10 : 8 } });

    const F = GPUShaderStage.FRAGMENT;
    this.compLayout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: F, texture: { sampleType: 'float' } },
    ] });
    const mod = shader(d, WGSL_LIB + WGSL_FRAME + WGSL_FULLSCREEN + WGSL_SSR_COMMON + COMP_WGSL, 'ssr-composite');
    this.compPipe = d.createRenderPipeline({
      label: 'ssr-composite',
      layout: d.createPipelineLayout({ bindGroupLayouts: [r.frameLayout, this.compLayout] }),
      vertex: { module: mod, entryPoint: 'vsFull' },
      fragment: { module: mod, entryPoint: 'fs', targets: [{ format: HDR_FORMAT, blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' } } }] },
      primitive: { topology: 'triangle-list' },
    });
    this.computeDesc = { timestampWrites: undefined };
    this.att = [{ view: null, loadOp: 'load', storeOp: 'store' }];
    this.compDesc = { colorAttachments: this.att, timestampWrites: undefined };
    // bind groups are created in resize() (render targets do not exist yet during init)
  }

  resize(ctx) {
    const d = ctx.device, v = ctx.views;
    const w = Math.max(1, Math.ceil(ctx.renderer.width / 2)), h = Math.max(1, Math.ceil(ctx.renderer.height / 2));
    if (this.reflTex) this.reflTex.destroy();
    this.reflTex = d.createTexture({ size: [w, h], format: 'rgba16float', usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING, label: 'reflHalf' });
    this.reflView = this.reflTex.createView();
    this.hw = w; this.hh = h;
    this.traceGroup = d.createBindGroup({ layout: this.traceLayout, entries: [
      { binding: 0, resource: v.depth }, { binding: 1, resource: v.normal }, { binding: 2, resource: v.albedo },
      { binding: 3, resource: v.motion }, { binding: 4, resource: v.scene }, { binding: 5, resource: this.reflView }] });
    this.compGroup = d.createBindGroup({ layout: this.compLayout, entries: [
      { binding: 0, resource: this.reflView }] });
    this.att[0].view = v.scene;
  }

  run(ctx, enc) {
    const r = ctx.renderer;
    this.computeDesc.timestampWrites = ctx.prof.ts('ssr');
    const p = enc.beginComputePass(this.computeDesc);
    p.setBindGroup(0, r.frameGroup);
    p.setPipeline(this.tracePipe);
    p.setBindGroup(1, this.traceGroup);
    p.dispatchWorkgroups(Math.ceil(this.hw / 8), Math.ceil(this.hh / 8));
    p.end();
    this.compDesc.timestampWrites = ctx.prof.ts('ssr-comp');
    const rp = enc.beginRenderPass(this.compDesc);
    rp.setPipeline(this.compPipe);
    rp.setBindGroup(0, r.frameGroup);
    rp.setBindGroup(1, this.compGroup);
    rp.draw(3);
    rp.end();
  }
}
