// Post-processing (runs after TAA): bloom (dual filter over a mip chain) and the final composite into the
// swapchain: contrast-adaptive sharpening, chromatic aberration, bloom, rain layer, exposure, vignette,
// filmic grading + hue-preserving tonemap, film grain and dithering. Output may be upscaled from the render
// resolution.
//
// Rain layer: the rain module draws its streaks into post.rainView (render resolution, additive HDR) after
// lighting and sets post.rainActive each frame. It is added here, after TAA, so the thin fast streaks are
// not smeared or rejected by the temporal filter.

import { WGSL_LIB, WGSL_FRAME, WGSL_FULLSCREEN } from './common.js';
import { shader } from './gpu.js';

const BLOOM_LEVELS = 4;  // quarter resolution down to 1/32
// Weight of each wider level when it is added into the next finer one: > 1 favours the wide, soft glow.
const BLOOM_UP_WEIGHTS = [1.0, 1.3, 1.6, 2.0];

const BLOOM_WGSL = /* wgsl */ `
@group(1) @binding(0) var src: texture_2d<f32>;
@group(1) @binding(1) var smp: sampler;

fn karis(c: vec3f) -> f32 { return 1.0 / (1.0 + luma(c)); }

// First level (full -> quarter resolution): 4 bilinear taps, each averaging a 2x2 block, together covering
// the 4x4 source texels of the output texel. Karis-weighted against fireflies.
@fragment fn fsDownFirst(i: FsOut) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(src, 0));
  let a = textureSampleLevel(src, smp, i.uv + ts * vec2f(-1.0, -1.0), 0.0).rgb;
  let b = textureSampleLevel(src, smp, i.uv + ts * vec2f(1.0, -1.0), 0.0).rgb;
  let c = textureSampleLevel(src, smp, i.uv + ts * vec2f(-1.0, 1.0), 0.0).rgb;
  let d = textureSampleLevel(src, smp, i.uv + ts * vec2f(1.0, 1.0), 0.0).rgb;
  let wa = karis(a); let wb = karis(b); let wc = karis(c); let wd = karis(d);
  let o = (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
  return vec4f(min(o, vec3f(400.0)), 1.0);
}

// 13-tap downsample (Call of Duty: Advanced Warfare).
@fragment fn fsDown(i: FsOut) -> @location(0) vec4f {
  let uv = i.uv;
  let ts = 1.0 / vec2f(textureDimensions(src, 0));
  let a = textureSampleLevel(src, smp, uv + ts * vec2f(-2.0, -2.0), 0.0).rgb;
  let b = textureSampleLevel(src, smp, uv + ts * vec2f(0.0, -2.0), 0.0).rgb;
  let c = textureSampleLevel(src, smp, uv + ts * vec2f(2.0, -2.0), 0.0).rgb;
  let d = textureSampleLevel(src, smp, uv + ts * vec2f(-2.0, 0.0), 0.0).rgb;
  let e = textureSampleLevel(src, smp, uv, 0.0).rgb;
  let f = textureSampleLevel(src, smp, uv + ts * vec2f(2.0, 0.0), 0.0).rgb;
  let g = textureSampleLevel(src, smp, uv + ts * vec2f(-2.0, 2.0), 0.0).rgb;
  let h = textureSampleLevel(src, smp, uv + ts * vec2f(0.0, 2.0), 0.0).rgb;
  let k = textureSampleLevel(src, smp, uv + ts * vec2f(2.0, 2.0), 0.0).rgb;
  let j = textureSampleLevel(src, smp, uv + ts * vec2f(-1.0, -1.0), 0.0).rgb;
  let l = textureSampleLevel(src, smp, uv + ts * vec2f(1.0, -1.0), 0.0).rgb;
  let m = textureSampleLevel(src, smp, uv + ts * vec2f(-1.0, 1.0), 0.0).rgb;
  let n = textureSampleLevel(src, smp, uv + ts * vec2f(1.0, 1.0), 0.0).rgb;
  var o = e * 0.125;
  o += (a + c + g + k) * 0.03125;
  o += (b + d + f + h) * 0.0625;
  o += (j + l + m + n) * 0.125;
  return vec4f(o, 1.0);
}

// 3x3 tent upsample, blended onto the next finer level (blend constant = level weight).
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
struct PostU {
  a: vec4f,   // x bloom strength, y sharpen amount, z rain layer on (0/1), w bloom normalisation
  b: vec4f,   // x vignette, y chromatic aberration, z grain, w saturation
};
@group(1) @binding(0) var hdrTex: texture_2d<f32>;
@group(1) @binding(1) var bloomTex: texture_2d<f32>;
@group(1) @binding(2) var smp: sampler;
@group(1) @binding(3) var rainTex: texture_2d<f32>;
@group(1) @binding(4) var<uniform> P: PostU;

// Khronos PBR Neutral tone mapper: compresses highlights along the line to white without hue skew.
fn tonemapNeutral(c0: vec3f) -> vec3f {
  var c = c0;
  let start = 0.78; let desat = 0.12;
  let x = min(c.r, min(c.g, c.b));
  let offset = select(0.04, x - 6.25 * x * x, x < 0.08) * 0.6;
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
// Reinhard-compressed values for the sharpening analysis (CAS expects 0..1 input).
fn rc(c: vec3f) -> vec3f { return c / (1.0 + c); }

@fragment fn fsComposite(i: FsOut) -> @location(0) vec4f {
  let uv = i.uv;
  let ts = 1.0 / vec2f(textureDimensions(hdrTex, 0));

  // ---- contrast-adaptive sharpening (AMD CAS on a 5-tap cross) to counter TAA softness. Green is used as
  // the luminance proxy so the neighbourhood comes from two gathers; the result is applied as a luminance
  // ratio, which sharpens without colour fringes.
  let e = textureSampleLevel(hdrTex, smp, uv, 0.0).rgb;
  let g0 = textureGather(1, hdrTex, smp, uv - ts * 0.5);  // (x-1,y), (x,y), (x,y-1), (x-1,y-1)
  let g1 = textureGather(1, hdrTex, smp, uv + ts * 0.5);  // (x,y+1), (x+1,y+1), (x+1,y), (x,y)
  let ce = e.g / (1.0 + e.g);
  let nb = vec4f(g0.x, g0.z, g1.x, g1.z);                 // W, N, S, E
  let cn = nb / (1.0 + nb);
  let mn = min(ce, min(min(cn.x, cn.y), min(cn.z, cn.w)));
  let mx = max(ce, max(max(cn.x, cn.y), max(cn.z, cn.w)));
  let amp = sqrt(saturate(min(mn, 2.0 - mx) / max(mx, 1e-4)));
  let w = amp * (-1.0 / mix(8.0, 5.0, P.a.y));
  let sharp = saturate((ce + w * (cn.x + cn.y + cn.z + cn.w)) / (1.0 + 4.0 * w));
  let eS = sharp / max(1.0 - sharp, 1e-3);
  let ratio = clamp(eS / max(e.g, 1e-5), 0.5, 2.0);

  // ---- lateral chromatic aberration toward the edges (only where it is visible)
  let cdir = uv - 0.5;
  let r2 = dot(cdir, cdir);
  var hdr = e;
  if (r2 > 0.1) {
    let ca = cdir * r2 * P.b.y;
    hdr = vec3f(textureSampleLevel(hdrTex, smp, uv + ca, 0.0).r, e.g, textureSampleLevel(hdrTex, smp, uv - ca, 0.0).b);
  }
  hdr *= ratio;

  // ---- bloom (wide, soft) and rain layer
  let bloom = textureSampleLevel(bloomTex, smp, uv, 0.0).rgb * P.a.w;
  hdr = mix(hdr, bloom, P.a.x) + bloom * (P.a.x * 0.35);
  if (P.a.z > 0.5) { hdr += textureSampleLevel(rainTex, smp, uv, 0.0).rgb; }

  // ---- exposure and vignette (before the tonemap so highlights survive)
  hdr *= F.misc.y;
  let vig = 1.0 - P.b.x * smoothstep(0.05, 0.6, r2 * (1.0 + 0.3 * abs(cdir.x)));
  hdr *= vig;

  // ---- grading in linear: filmic contrast around mid grey (deep blacks), cool shadows, warm-magenta highlights
  let lum0 = max(luma(hdr), 1e-6);
  let lumC = 0.18 * pow(lum0 / 0.18, 1.07);
  hdr *= lumC / lum0;
  let sh = 1.0 - smoothstep(0.0, 0.25, lumC);
  hdr *= mix(vec3f(1.0), vec3f(0.90, 0.98, 1.12), sh * 0.7);
  hdr *= mix(vec3f(1.0), vec3f(1.05, 0.97, 1.03), smoothstep(0.4, 2.0, lumC) * 0.6);

  var c = tonemapNeutral(hdr);
  // vibrance: lift the saturation of mid-saturated colours (neon) more than already saturated ones
  let l = luma(c);
  let sat = (max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b))) / max(max(c.r, max(c.g, c.b)), 1e-4);
  c = max(mix(vec3f(l), c, P.b.w + 0.25 * (1.0 - sat)), vec3f(0.0));
  c = saturate3(c);
  var s = linToSrgb(c);

  // ---- film grain (luminance-dependent, strongest in the mid tones) + triangular dither against banding
  let px = i.pos.xy;
  let fr = F.params.y;
  let g = ign(px * 1.37 + vec2f(13.0, 71.0), fr * 3.0 + 11.0) * 2.0 - 1.0;
  s += vec3f(g * P.b.z * (0.35 + 1.3 * l * (1.0 - l)));
  let d = ign(px, fr) + ign(px + vec2f(47.0, 17.0), fr + 7.0) - 1.0;
  s += vec3f(d / 255.0);
  return vec4f(s, 1.0);
}
`;

export class Post {
  constructor(ctx, renderer) {
    this.ctx = ctx;
    this.r = renderer;
    const d = ctx.device;
    this.device = d;
    // Tunable look (adjustable live from the console: __ctx.renderer.post.look)
    this.look = { bloom: 0.085, sharpen: 0.45, vignette: 0.32, aberration: 0.004, grain: 0.035, saturation: 1.08 };
    this.rainActive = false;
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
    this.up = mk('fsUp', { color: { srcFactor: 'constant', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } });
    this.blendConst = { r: 1, g: 1, b: 1, a: 1 };

    this.compLayout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ] });
    const cm = shader(d, WGSL_LIB + WGSL_FRAME + WGSL_FULLSCREEN + COMPOSITE_WGSL, 'composite');
    this.composite = d.createRenderPipeline({
      layout: d.createPipelineLayout({ bindGroupLayouts: [renderer.frameLayout, this.compLayout] }),
      vertex: { module: cm, entryPoint: 'vsFull' },
      fragment: { module: cm, entryPoint: 'fsComposite', targets: [{ format: ctx.gpu.format }] },
      primitive: { topology: 'triangle-list' },
    });
    this.u = new Float32Array(8);
    this.ubuf = d.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.att = [{ view: null, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }];
    this.desc = { colorAttachments: this.att, timestampWrites: undefined };
  }

  resize(w, h) {
    const d = this.device;
    if (this.bloomTex) this.bloomTex.destroy();
    if (this.rainTex) this.rainTex.destroy();
    const bw = Math.max(1, w >> 2), bh = Math.max(1, h >> 2);
    const levels = Math.max(1, Math.min(BLOOM_LEVELS, Math.floor(Math.log2(Math.min(bw, bh))) - 1));
    this.levels = levels;
    this.bloomTex = d.createTexture({ size: [bw, bh], mipLevelCount: levels, format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.mipViews = [];
    for (let i = 0; i < levels; i++) this.mipViews.push(this.bloomTex.createView({ baseMipLevel: i, mipLevelCount: 1 }));
    // normalisation so that a flat field keeps its brightness through the weighted mip sum
    let norm = 1;
    for (let i = levels - 2; i >= 0; i--) norm = 1 + BLOOM_UP_WEIGHTS[i + 1] * norm;
    this.bloomNorm = 1 / norm;
    this.rainTex = d.createTexture({ size: [w, h], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING, label: 'rainLayer' });
    this.rainView = this.rainTex.createView();
    const views = this.r.views;
    const bg = (view) => d.createBindGroup({ layout: this.layout, entries: [{ binding: 0, resource: view }, { binding: 1, resource: this.samp }] });
    this.firstGroups = [bg(views.hist0), bg(views.hist1)];
    this.mipGroups = this.mipViews.map((v) => bg(v));
    this.compGroups = [views.hist0, views.hist1].map((v) => d.createBindGroup({ layout: this.compLayout, entries: [
      { binding: 0, resource: v }, { binding: 1, resource: this.mipViews[0] }, { binding: 2, resource: this.samp },
      { binding: 3, resource: this.rainView }, { binding: 4, resource: { buffer: this.ubuf } }] }));
  }

  _pass(enc, pipe, group, target, load, tsName, weight) {
    this.att[0].view = target;
    this.att[0].loadOp = load ? 'load' : 'clear';
    this.desc.timestampWrites = tsName ? this.ctx.prof.ts(tsName) : undefined;
    const p = enc.beginRenderPass(this.desc);
    p.setPipeline(pipe);
    if (weight !== undefined) {
      const b = this.blendConst;
      b.r = b.g = b.b = b.a = weight;
      p.setBlendConstant(b);
    }
    p.setBindGroup(0, this.r.frameGroup);
    p.setBindGroup(1, group);
    p.draw(3);
    p.end();
  }

  render(enc, histIndex, swapTex) {
    const L = this.look, u = this.u;
    u[0] = L.bloom; u[1] = L.sharpen; u[2] = this.rainActive ? 1 : 0; u[3] = this.bloomNorm;
    u[4] = L.vignette; u[5] = L.aberration; u[6] = L.grain; u[7] = L.saturation;
    this.device.queue.writeBuffer(this.ubuf, 0, u);
    this.rainActive = false;

    this._pass(enc, this.downFirst, this.firstGroups[histIndex], this.mipViews[0], false, 'bloom');
    for (let i = 1; i < this.levels; i++) this._pass(enc, this.down, this.mipGroups[i - 1], this.mipViews[i], false, 'bloom');
    for (let i = this.levels - 2; i >= 0; i--) this._pass(enc, this.up, this.mipGroups[i + 1], this.mipViews[i], true, 'bloom', BLOOM_UP_WEIGHTS[i + 1]);
    this._pass(enc, this.composite, this.compGroups[histIndex], swapTex.createView(), false, 'post');
  }
}
