// Post-processing: bloom (dual filter, mip chain) and final composite (exposure, tonemap, grading, vignette,
// chromatic aberration, grain, dithering) into the swapchain. Output can be upscaled from the render resolution.

import { WGSL_LIB, WGSL_FRAME, WGSL_FULLSCREEN } from './common.js';
import { shader } from './gpu.js';

const BLOOM_LEVELS = 6;

const BLOOM_WGSL = /* wgsl */ `
@group(1) @binding(0) var src: texture_2d<f32>;
@group(1) @binding(1) var smp: sampler;

fn karis(c: vec3f) -> f32 { return 1.0 / (1.0 + luma(c)); }

// 13-tap downsample (Call of Duty: Advanced Warfare). Karis average on the first level suppresses fireflies.
fn down13(uv: vec2f, first: bool) -> vec3f {
  let ts = 1.0 / vec2f(textureDimensions(src, 0));
  let a = textureSampleLevel(src, smp, uv + ts * vec2f(-2.0, -2.0), 0.0).rgb;
  let b = textureSampleLevel(src, smp, uv + ts * vec2f(0.0, -2.0), 0.0).rgb;
  let c = textureSampleLevel(src, smp, uv + ts * vec2f(2.0, -2.0), 0.0).rgb;
  let d = textureSampleLevel(src, smp, uv + ts * vec2f(-2.0, 0.0), 0.0).rgb;
  let e = textureSampleLevel(src, smp, uv, 0.0).rgb;
  let f = textureSampleLevel(src, smp, uv + ts * vec2f(2.0, 0.0), 0.0).rgb;
  let g = textureSampleLevel(src, smp, uv + ts * vec2f(-2.0, 2.0), 0.0).rgb;
  let h = textureSampleLevel(src, smp, uv + ts * vec2f(0.0, 2.0), 0.0).rgb;
  let i = textureSampleLevel(src, smp, uv + ts * vec2f(2.0, 2.0), 0.0).rgb;
  let j = textureSampleLevel(src, smp, uv + ts * vec2f(-1.0, -1.0), 0.0).rgb;
  let k = textureSampleLevel(src, smp, uv + ts * vec2f(1.0, -1.0), 0.0).rgb;
  let l = textureSampleLevel(src, smp, uv + ts * vec2f(-1.0, 1.0), 0.0).rgb;
  let m = textureSampleLevel(src, smp, uv + ts * vec2f(1.0, 1.0), 0.0).rgb;
  if (first) {
    let g0 = (a + b + d + e) * 0.25; let g1 = (b + c + e + f) * 0.25;
    let g2 = (d + e + g + h) * 0.25; let g3 = (e + f + h + i) * 0.25;
    let g4 = (j + k + l + m) * 0.25;
    let w0 = karis(g0) * 0.125; let w1 = karis(g1) * 0.125; let w2 = karis(g2) * 0.125; let w3 = karis(g3) * 0.125; let w4 = karis(g4) * 0.5;
    return (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
  }
  var o = e * 0.125;
  o += (a + c + g + i) * 0.03125;
  o += (b + d + f + h) * 0.0625;
  o += (j + k + l + m) * 0.125;
  return o;
}

@fragment fn fsDownFirst(i: FsOut) -> @location(0) vec4f { return vec4f(min(down13(i.uv, true), vec3f(500.0)), 1.0); }
@fragment fn fsDown(i: FsOut) -> @location(0) vec4f { return vec4f(down13(i.uv, false), 1.0); }

// 3x3 tent upsample, additively blended onto the next larger level.
@fragment fn fsUp(i: FsOut) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(src, 0));
  let uv = i.uv;
  var o = textureSampleLevel(src, smp, uv, 0.0).rgb * 4.0;
  o += (textureSampleLevel(src, smp, uv + vec2f(-ts.x, 0.0), 0.0).rgb + textureSampleLevel(src, smp, uv + vec2f(ts.x, 0.0), 0.0).rgb
      + textureSampleLevel(src, smp, uv + vec2f(0.0, -ts.y), 0.0).rgb + textureSampleLevel(src, smp, uv + vec2f(0.0, ts.y), 0.0).rgb) * 2.0;
  o += textureSampleLevel(src, smp, uv + vec2f(-ts.x, -ts.y), 0.0).rgb + textureSampleLevel(src, smp, uv + vec2f(ts.x, -ts.y), 0.0).rgb
     + textureSampleLevel(src, smp, uv + vec2f(-ts.x, ts.y), 0.0).rgb + textureSampleLevel(src, smp, uv + vec2f(ts.x, ts.y), 0.0).rgb;
  return vec4f(o / 16.0, 1.0);
}
`;

const COMPOSITE_WGSL = /* wgsl */ `
@group(1) @binding(0) var hdrTex: texture_2d<f32>;
@group(1) @binding(1) var bloomTex: texture_2d<f32>;
@group(1) @binding(2) var smp: sampler;

// Khronos PBR Neutral tone mapper: keeps saturated neon hues instead of skewing them.
fn tonemapNeutral(c0: vec3f) -> vec3f {
  var c = c0;
  let start = 0.76; let desat = 0.15;
  let x = min(c.r, min(c.g, c.b));
  let offset = select(0.04, x - 6.25 * x * x, x < 0.08);
  c -= offset;
  let peak = max(c.r, max(c.g, c.b));
  if (peak < start) { return c; }
  let d = 1.0 - start;
  let newPeak = 1.0 - d * d / (peak + d - start);
  c *= newPeak / peak;
  let g = 1.0 - 1.0 / (desat * (peak - newPeak) + 1.0);
  return mix(c, vec3f(newPeak), g);
}
fn linToSrgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}

@fragment fn fsComposite(i: FsOut) -> @location(0) vec4f {
  let uv = i.uv;
  let cdir = uv - 0.5;
  let r2 = dot(cdir, cdir);
  // subtle lateral chromatic aberration toward the edges
  let ca = cdir * r2 * 0.006;
  var hdr = vec3f(
    textureSampleLevel(hdrTex, smp, uv + ca, 0.0).r,
    textureSampleLevel(hdrTex, smp, uv, 0.0).g,
    textureSampleLevel(hdrTex, smp, uv - ca, 0.0).b);
  let bloom = textureSampleLevel(bloomTex, smp, uv, 0.0).rgb;
  hdr = mix(hdr, bloom, 0.06) + bloom * 0.05;
  hdr *= F.misc.y; // exposure
  // vignette (before tonemap so highlights survive)
  hdr *= mix(1.0, 0.62, smoothstep(0.08, 0.55, r2));
  var c = tonemapNeutral(hdr);
  // grading: cool shadows, warm-magenta highlights, gentle contrast
  let l = luma(c);
  c = mix(c, c * vec3f(0.86, 0.98, 1.14), (1.0 - smoothstep(0.0, 0.35, l)) * 0.6);
  c = mix(c, c * vec3f(1.06, 0.97, 1.02), smoothstep(0.45, 1.0, l) * 0.5);
  c = saturate3(c);
  c = c * c * (3.0 - 2.0 * c) * 0.25 + c * 0.75;
  var s = linToSrgb(c);
  // film grain + dithering (removes banding in the dark gradients)
  let px = i.pos.xy;
  let n = ign(px, F.params.y) - 0.5;
  let grain = (hash21(px + fract(F.camPos.w * 13.0) * 1000.0) - 0.5) * 0.025;
  s += vec3f(n / 255.0 * 1.5 + grain * (1.0 - l));
  return vec4f(s, 1.0);
}
`;

export class Post {
  constructor(ctx, renderer) {
    this.ctx = ctx;
    this.r = renderer;
    const d = ctx.device;
    this.device = d;
    this.samp = d.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    this.layout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ] });
    const bm = shader(d, WGSL_LIB + WGSL_FULLSCREEN + BLOOM_WGSL, 'bloom');
    const pl = d.createPipelineLayout({ bindGroupLayouts: [renderer.frameLayout, this.layout] });
    const mk = (fs, blend) => d.createRenderPipeline({
      layout: pl, vertex: { module: bm, entryPoint: 'vsFull' },
      fragment: { module: bm, entryPoint: fs, targets: [{ format: 'rgba16float', blend }] },
      primitive: { topology: 'triangle-list' },
    });
    this.downFirst = mk('fsDownFirst');
    this.down = mk('fsDown');
    this.up = mk('fsUp', { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } });

    this.compLayout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ] });
    const cm = shader(d, WGSL_LIB + WGSL_FRAME + WGSL_FULLSCREEN + COMPOSITE_WGSL, 'composite');
    this.composite = d.createRenderPipeline({
      layout: d.createPipelineLayout({ bindGroupLayouts: [renderer.frameLayout, this.compLayout] }),
      vertex: { module: cm, entryPoint: 'vsFull' },
      fragment: { module: cm, entryPoint: 'fsComposite', targets: [{ format: ctx.gpu.format }] },
      primitive: { topology: 'triangle-list' },
    });
    this.att = [{ view: null, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }];
    this.desc = { colorAttachments: this.att, timestampWrites: undefined };
  }

  resize(w, h) {
    const d = this.device;
    if (this.bloomTex) this.bloomTex.destroy();
    const bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
    const levels = Math.min(BLOOM_LEVELS, Math.floor(Math.log2(Math.min(bw, bh))) - 1);
    this.levels = levels;
    this.bloomTex = d.createTexture({ size: [bw, bh], mipLevelCount: levels, format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.mipViews = [];
    for (let i = 0; i < levels; i++) this.mipViews.push(this.bloomTex.createView({ baseMipLevel: i, mipLevelCount: 1 }));
    const views = this.r.views;
    const bg = (view) => d.createBindGroup({ layout: this.layout, entries: [{ binding: 0, resource: view }, { binding: 1, resource: this.samp }] });
    this.firstGroups = [bg(views.hist0), bg(views.hist1)];
    this.mipGroups = this.mipViews.map((v) => bg(v));
    this.compGroups = [views.hist0, views.hist1].map((v) => d.createBindGroup({ layout: this.compLayout, entries: [
      { binding: 0, resource: v }, { binding: 1, resource: this.mipViews[0] }, { binding: 2, resource: this.samp }] }));
  }

  _pass(enc, pipe, group, target, load, tsName) {
    this.att[0].view = target;
    this.att[0].loadOp = load ? 'load' : 'clear';
    this.desc.timestampWrites = tsName ? this.ctx.prof.ts(tsName) : undefined;
    const p = enc.beginRenderPass(this.desc);
    p.setPipeline(pipe);
    p.setBindGroup(0, this.r.frameGroup);
    p.setBindGroup(1, group);
    p.draw(3);
    p.end();
  }

  render(enc, histIndex, swapTex) {
    this._pass(enc, this.downFirst, this.firstGroups[histIndex], this.mipViews[0], false, 'bloom');
    for (let i = 1; i < this.levels; i++) this._pass(enc, this.down, this.mipGroups[i - 1], this.mipViews[i], false, 'bloom');
    for (let i = this.levels - 2; i >= 0; i--) this._pass(enc, this.up, this.mipGroups[i + 1], this.mipViews[i], true, 'bloom');
    this._pass(enc, this.composite, this.compGroups[histIndex], swapTex.createView(), false, 'post');
  }
}
