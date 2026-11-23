// Screen-space reflections for the river (planar, y = 0) and for wet, smooth, upward-facing ground.
// Runs in afterLighting, at half resolution except the final composite:
//   1. trace: for each half-res pixel (source pixel rotating through its 2x2 block every frame) decide whether it is
//      water (the y = 0 plane is in front of the opaque depth) or reflective wet ground, ray-march the mirror ray in
//      screen space (with binary refinement near the hit) and fetch the lit scene there. Writes rawTex and the hit
//      distance (distTex):
//        water texels:  rgb = reflection (with sky / city glow fallback), a = 2 + hit confidence
//        ground texels: rgb = reflection * weight, a = weight (> 0 hit, < 0 miss, 0 = not reflective)
//   2. blur: vertical (screen-space) blur whose length grows with the hit distance relative to the view distance, so
//      reflections of lights stretch into smooth vertical streaks like on wet asphalt. Jittered taps, resolved over
//      time. Misses take their colour from neighbouring hits instead of leaving holes.
//   3. resolve: temporal accumulation with motion-vector reprojection and a neighbourhood clamp (reflTex).
//   4. composite (full resolution, premultiplied blend into the lit scene): depth-aware bilateral upsample of the
//      ground reflections. Where there is no reflection data the lit scene keeps its own environment reflection.
// The water shader reads the water texels of reflTex.

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
@group(1) @binding(6) var outD: texture_storage_2d<r32float, write>;

override STEPS_W: i32 = 32;
override STEPS_G: i32 = 20;

fn sceneLin(px: vec2i) -> f32 {
  let d = textureLoad(dTex, px, 0);
  return select(1e9, linearDepth(d), d > 0.0);
}

// Screen-space march of P + R * s. Returns (uv, confidence, ray parameter 0..1 of the hit).
fn trace(P: vec3f, R: vec3f, steps: i32, jit: f32, maxLen: f32, dims: vec2f) -> vec4f {
  let fwd = F.camFwd.xyz;
  let z0 = dot(P - F.camPos.xyz, fwd);
  var L = maxLen;
  let rz = dot(R, fwd);
  if (rz < 0.0) { L = min(L, (z0 - F.misc.x * 4.0) / -rz); }
  if (L <= 0.0) { return vec4f(0.0); }
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
  if (tmax <= 0.0) { return vec4f(0.0); }
  var tPrev = 0.0;
  var zPrev = z0;
  let inv = 1.0 / f32(steps);
  for (var i = 1; i <= steps; i++) {
    let tt = pow((f32(i) - jit) * inv, 1.6) * tmax;
    let rayZ = 1.0 / mix(k0, k1, tt);
    let uv = (n0 + dn * tt) * vec2f(0.5, -0.5) + 0.5;
    let dz = rayZ - sceneLin(vec2i(uv * dims));
    let thick = max(abs(rayZ - zPrev) * 1.0, 0.6) + rayZ * 0.005;
    if (dz > 0.0 && dz < thick) {
      var lo = tPrev; var hi = tt;
      for (var j = 0; j < 6; j++) {
        let m = 0.5 * (lo + hi);
        let uvm = (n0 + dn * m) * vec2f(0.5, -0.5) + 0.5;
        if (1.0 / mix(k0, k1, m) > sceneLin(vec2i(uvm * dims))) { hi = m; } else { lo = m; }
      }
      let uvh = (n0 + dn * hi) * vec2f(0.5, -0.5) + 0.5;
      let e = min(uvh, 1.0 - uvh);
      // ray parameter in world units: invert the perspective interpolation
      let kh = mix(k0, k1, hi);
      let s = select(hi * L, L * (1.0 / kh - c0.w) / (c1.w - c0.w), abs(c1.w - c0.w) > 1e-3);
      return vec4f(uvh, smoothstep(0.0, 0.05, e.x) * smoothstep(0.0, 0.08, e.y), abs(s));
    }
    tPrev = tt; zPrev = rayZ;
  }
  return vec4f(0.0);
}

// What the river reflects when the screen has no data: sky plus a smeared, irregular glow of the city at the horizon.
fn waterFallback(R: vec3f) -> vec3f {
  // in rain the moon is behind cloud: keep the sky reflection dim and free of moon glow
  var c = (skyAmbient(R) - skyMoonHalo(dot(R, F.moon.xyz)) * 1.2 * saturate(F.params.x)) * mix(0.8, 0.55, saturate(F.params.x)) + vec3f(0.012, 0.008, 0.014) * saturate(R.y * 3.0);
  let az = atan2(R.x, R.z);
  let band = exp(-max(R.y, 0.0) * 14.0);
  let lights = 0.7 + 0.3 * vnoise2(vec2f(az * 9.0, 0.5));
  c += vec3f(0.30, 0.12, 0.20) * band * lights * 0.35;
  return c;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let hd = textureDimensions(outR);
  if (gid.x >= hd.x || gid.y >= hd.y) { return; }
  let fd = textureDimensions(dTex);
  let dims = vec2f(fd);
  let fi = u32(F.params.y) % 4u;
  let px = min(vec2i(gid.xy) * 2 + vec2i(i32(fi & 1u), i32(fi >> 1u)), vec2i(fd) - 1);
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
    textureStore(outD, gid.xy, vec4f(0.0));
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
    // mirror ray (the roughness is applied as a screen-space streak blur afterwards); tiny temporal jitter only
    let hj = (vec2f(jit, fract(jit * 7.31)) - 0.5) * 0.004;
    R = reflect(dir, normalize(n + vec3f(hj.x, 0.0, hj.y)));
    if (R.y < 0.02) { R = normalize(vec3f(R.x, 0.02, R.z)); }
    P += n * 0.05;
    steps = STEPS_G; maxLen = 600.0;
  }
  var h = trace(P, R, steps, jit, maxLen, dims);
  // reject hits on surfaces facing away from the ray (the ray passed behind them)
  if (h.z > 0.0) {
    let nh = textureLoad(nTex, clamp(vec2i(h.xy * dims), vec2i(0), vec2i(fd) - 1), 0).xyz;
    if (dot(nh, R) > 0.15) { h.z = 0.0; }
  }
  let hit = min(textureSampleLevel(sTex, sampClamp, h.xy, 0.0).rgb, vec3f(60.0));
  if (tW > 0.0) {
    let col = mix(waterFallback(R), hit, h.z);
    textureStore(outR, gid.xy, vec4f(col, 2.0 + h.z));
    textureStore(outD, gid.xy, vec4f(select(400.0, h.w, h.z > 0.0)));
    return;
  }
  // hits: premultiplied colour, weight k > 0; misses: weight stored negative (filled by the blur / resolve)
  // misses fade to a soft sky reflection (no moon disk), flagged with a negative weight so the blur can fill them
  if (h.z <= 0.0) { textureStore(outR, gid.xy, vec4f(skyAmbient(R) * g, -g)); return; }
  let k = g * h.z;
  textureStore(outR, gid.xy, vec4f(hit * k, k));
  textureStore(outD, gid.xy, vec4f(h.w));
}
`;

// Vertical streak blur (half resolution). Length in texels grows with hit distance / (view distance + hit distance).
const BLUR_WGSL = /* wgsl */ `
@group(1) @binding(0) var rawTex: texture_2d<f32>;
@group(1) @binding(1) var distTex: texture_2d<f32>;
@group(1) @binding(2) var dTex: texture_depth_2d;
@group(1) @binding(3) var outB: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let hd = vec2i(textureDimensions(outB));
  let p = vec2i(gid.xy);
  if (p.x >= hd.x || p.y >= hd.y) { return; }
  let c = textureLoad(rawTex, p, 0);
  if (c.a == 0.0) { textureStore(outB, p, c); return; }
  let water = c.a >= 1.5;
  let fd = vec2i(textureDimensions(dTex));
  let d = textureLoad(dTex, min(p * 2, fd - 1), 0);
  let view = select(5000.0, linearDepth(d), d > 0.0);
  var L: f32;
  if (water) {
    L = clamp(2.0 + view * 0.006, 2.0, 12.0);
  } else {
    var hitD = textureLoad(distTex, p, 0).x;
    if (hitD <= 0.0) { hitD = 15.0; }
    L = clamp(f32(hd.y) * (0.035 * hitD / (view + hitD)) * (1.0 + F.params.x * 0.6), 1.0, 26.0);
  }
  let jit = ign(vec2f(p), F.params.y) - 0.5;
  var acc = vec4f(0.0); var wsum = 0.0;
  for (var k = 0; k < 8; k++) {
    let o = (f32(k) - 3.5 + jit) / 3.5;                 // -1..1
    let q = vec2i(p.x, clamp(p.y + i32(round(o * L)), 0, hd.y - 1));
    let s = textureLoad(rawTex, q, 0);
    let isGround = (s.a > 0.0) && (s.a < 1.5);
    let isWater = s.a >= 1.5;
    let same = select(isGround, isWater, water);
    let w = select(0.0, exp(-o * o * 2.5), same);
    acc += select(s, vec4f(s.rgb, s.a - 2.0), water) * w; wsum += w;
  }
  // ground miss: fill from neighbouring hits only when there are enough of them (avoids ghost blobs)
  if (wsum <= 1e-4 || (c.a < 0.0 && wsum < 2.0)) { textureStore(outB, p, c); return; }
  var r = acc / wsum;
  if (water) { r.a += 2.0; }
  else if (c.a < 0.0) { r = r * (-c.a / max(r.a, 1e-3)) * 0.8; }   // miss: neighbour colour at this pixel's weight
  textureStore(outB, p, r);
}
`;

// Temporal resolve: blend with the reprojected history (motion vectors) after clamping it to the current 3x3
// neighbourhood of the same surface type. Misses with no data fade out.
const RESOLVE_WGSL = /* wgsl */ `
@group(1) @binding(0) var curTex: texture_2d<f32>;
@group(1) @binding(1) var histTex: texture_2d<f32>;
@group(1) @binding(2) var mTex: texture_2d<f32>;
@group(1) @binding(3) var outT: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let hd = vec2i(textureDimensions(outT));
  let p = vec2i(gid.xy);
  if (p.x >= hd.x || p.y >= hd.y) { return; }
  var c = textureLoad(curTex, p, 0);
  if (c.a == 0.0) { textureStore(outT, p, vec4f(0.0)); return; }
  let water = c.a >= 1.5;
  if (c.a < 0.0) { c = vec4f(c.rgb, -c.a); }
  var mn = vec4f(1e9); var mx = vec4f(-1e9); var nn = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      var s = textureLoad(curTex, clamp(p + vec2i(x, y), vec2i(0), hd - 1), 0);
      if ((s.a >= 1.5) == water && s.a != 0.0) {
        if (s.a < 0.0) { s = vec4f(s.rgb, -s.a); }
        mn = min(mn, s); mx = max(mx, s); nn += 1.0;
      }
    }
  }
  let fd = vec2i(textureDimensions(mTex));
  let uv = (vec2f(p) + 0.5) / vec2f(hd);
  let mv = textureLoad(mTex, clamp(vec2i(uv * vec2f(fd)), vec2i(0), fd - 1), 0).xy;
  let puv = uv - mv;
  var hist = textureSampleLevel(histTex, sampClamp, puv, 0.0);
  var a = select(0.22, 0.25, water);
  if (any(puv < vec2f(0.0)) || any(puv > vec2f(1.0)) || (hist.a >= 1.5) != water || hist.a < 0.0) { hist = c; a = 1.0; }
  let ext = (mx - mn) * 0.2 + vec4f(0.01, 0.01, 0.01, 0.02);
  hist = clamp(hist, mn - ext, mx + ext);
  textureStore(outT, p, max(mix(hist, c, a), vec4f(0.0)));
}
`;

const COMP_WGSL = /* wgsl */ `
@group(1) @binding(0) var rTex: texture_2d<f32>;

// Premultiplied blend of the half-resolution wet-ground reflections, reflectivity-aware upsample.
@fragment fn fs(i: FsOut) -> @location(0) vec4f {
  let uv = i.pos.xy * F.res.zw;
  // early out: no wet-ground reflection data around this pixel
  let ga = textureGather(3, rTex, sampClamp, uv);
  let gnd = (ga > vec4f(0.0005)) & (ga < vec4f(1.5));
  if (!any(gnd)) { discard; }
  // reflectivity-aware bilinear upsample: texels without ground reflection (walls, cars, water) get no weight
  let hdim = vec2f(textureDimensions(rTex));
  let f = fract(uv * hdim - 0.5);
  let bw = vec4f((1.0 - f.x) * f.y, f.x * f.y, f.x * (1.0 - f.y), (1.0 - f.x) * (1.0 - f.y));
  let wv = bw * select(vec4f(0.0), vec4f(1.0), gnd);
  let wsum = dot(wv, vec4f(1.0));
  let acc = vec4f(dot(textureGather(0, rTex, sampClamp, uv), wv), dot(textureGather(1, rTex, sampClamp, uv), wv),
                  dot(textureGather(2, rTex, sampClamp, uv), wv), dot(ga, wv));
  if (wsum < 1e-4) { discard; }
  let r = acc / wsum;
  if (r.a <= 0.0005) { discard; }
  return r;
}`;

export class WaterSSR {
  init(ctx) {
    const d = ctx.device, r = ctx.renderer;
    const C = GPUShaderStage.COMPUTE;
    this.traceLayout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: C, texture: { sampleType: 'depth' } },
      { binding: 1, visibility: C, texture: { sampleType: 'unfilterable-float' } },
      { binding: 2, visibility: C, texture: { sampleType: 'unfilterable-float' } },
      { binding: 3, visibility: C, texture: { sampleType: 'unfilterable-float' } },
      { binding: 4, visibility: C, texture: { sampleType: 'float' } },
      { binding: 5, visibility: C, storageTexture: { access: 'write-only', format: 'rgba16float' } },
      { binding: 6, visibility: C, storageTexture: { access: 'write-only', format: 'r32float' } },
    ] });
    const q = ctx.quality.level;
    this.tracePipe = r.computePipeline({ label: 'ssr-trace', code: WGSL_SSR_COMMON + TRACE_WGSL, groups: [this.traceLayout],
      constants: { STEPS_W: q >= 2 ? 20 : q === 1 ? 16 : 12, STEPS_G: q >= 2 ? 14 : q === 1 ? 12 : 8 } });
    this.blurLayout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: C, texture: { sampleType: 'unfilterable-float' } },
      { binding: 1, visibility: C, texture: { sampleType: 'unfilterable-float' } },
      { binding: 2, visibility: C, texture: { sampleType: 'depth' } },
      { binding: 3, visibility: C, storageTexture: { access: 'write-only', format: 'rgba16float' } },
    ] });
    this.blurPipe = r.computePipeline({ label: 'ssr-blur', code: BLUR_WGSL, groups: [this.blurLayout] });
    this.resLayout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: C, texture: { sampleType: 'unfilterable-float' } },
      { binding: 1, visibility: C, texture: { sampleType: 'float' } },
      { binding: 2, visibility: C, texture: { sampleType: 'unfilterable-float' } },
      { binding: 3, visibility: C, storageTexture: { access: 'write-only', format: 'rgba16float' } },
    ] });
    this.resPipe = r.computePipeline({ label: 'ssr-resolve', code: RESOLVE_WGSL, groups: [this.resLayout] });
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
    for (const k of ['rawTex', 'distTex', 'blurTex', 'reflTex', 'histTex']) if (this[k]) this[k].destroy();
    const T = GPUTextureUsage;
    const mk = (format, usage, label) => d.createTexture({ size: [w, h], format, usage, label });
    this.rawTex = mk('rgba16float', T.STORAGE_BINDING | T.TEXTURE_BINDING, 'reflRaw');
    this.distTex = mk('r32float', T.STORAGE_BINDING | T.TEXTURE_BINDING, 'reflDist');
    this.blurTex = mk('rgba16float', T.STORAGE_BINDING | T.TEXTURE_BINDING, 'reflBlur');
    this.reflTex = mk('rgba16float', T.STORAGE_BINDING | T.TEXTURE_BINDING | T.COPY_SRC, 'reflHalf');
    this.histTex = mk('rgba16float', T.TEXTURE_BINDING | T.COPY_DST, 'reflHist');
    const rawView = this.rawTex.createView(), distView = this.distTex.createView(), blurView = this.blurTex.createView();
    this.reflView = this.reflTex.createView();
    this.hw = w; this.hh = h;
    this.copySrc = { texture: this.reflTex }; this.copyDst = { texture: this.histTex }; this.copySize = [w, h];
    this.traceGroup = d.createBindGroup({ layout: this.traceLayout, entries: [
      { binding: 0, resource: v.depth }, { binding: 1, resource: v.normal }, { binding: 2, resource: v.albedo },
      { binding: 3, resource: v.motion }, { binding: 4, resource: v.scene }, { binding: 5, resource: rawView },
      { binding: 6, resource: distView }] });
    this.blurGroup = d.createBindGroup({ layout: this.blurLayout, entries: [
      { binding: 0, resource: rawView }, { binding: 1, resource: distView }, { binding: 2, resource: v.depth },
      { binding: 3, resource: blurView }] });
    this.resGroup = d.createBindGroup({ layout: this.resLayout, entries: [
      { binding: 0, resource: blurView }, { binding: 1, resource: this.histTex.createView() },
      { binding: 2, resource: v.motion }, { binding: 3, resource: this.reflView }] });
    this.compGroup = d.createBindGroup({ layout: this.compLayout, entries: [
      { binding: 0, resource: this.reflView }] });
    this.att[0].view = v.scene;
  }

  run(ctx, enc) {
    const r = ctx.renderer;
    const gx = Math.ceil(this.hw / 8), gy = Math.ceil(this.hh / 8);
    this.computeDesc.timestampWrites = ctx.prof.ts('ssr');
    const p = enc.beginComputePass(this.computeDesc);
    p.setBindGroup(0, r.frameGroup);
    p.setPipeline(this.tracePipe);
    p.setBindGroup(1, this.traceGroup);
    p.dispatchWorkgroups(gx, gy);
    p.setPipeline(this.blurPipe);
    p.setBindGroup(1, this.blurGroup);
    p.dispatchWorkgroups(gx, gy);
    p.setPipeline(this.resPipe);
    p.setBindGroup(1, this.resGroup);
    p.dispatchWorkgroups(gx, gy);
    p.end();
    enc.copyTextureToTexture(this.copySrc, this.copyDst, this.copySize);
    this.compDesc.timestampWrites = ctx.prof.ts('ssr-comp');
    const rp = enc.beginRenderPass(this.compDesc);
    rp.setPipeline(this.compPipe);
    rp.setBindGroup(0, r.frameGroup);
    rp.setBindGroup(1, this.compGroup);
    rp.draw(3);
    rp.end();
  }
}
