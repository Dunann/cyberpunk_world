// Rain: camera-centred instanced streaks plus splash flecks / ripples on the ground near the camera.
//
// Drawn after lighting (afterLighting hook) into the post rain layer (ctx.renderer.post.rainView), depth-tested
// against the opaque scene depth, and added by the composite after TAA, so the thin fast streaks are not
// smeared or rejected by the temporal filter. Every drop is anchored in world space and wrapped into a box
// around the camera with a soft fade at the box edges (no popping, no visible tiling).
//
// Lighting: each streak samples the fog module's incoming-radiance volume (ctx.fogLi) at its position. That
// volume already holds the light of the nearby point lights, the city glow, the sky and the moon, weighted by
// the phase function toward the camera, so drops glow when backlit by street lights and neon, as in film.
// Streaks are stretched by their velocity relative to the camera (fall speed + wind - camera velocity).
// Overhead structures (collider boxes above the camera, e.g. bridge decks) shelter the drops below them.
// Intensity: F.params.x (ctx.env.rain); R toggles 0 <-> 0.55.

import { WGSL_LIB, WGSL_FRAME } from './common.js';
import { shader } from './gpu.js';

const NEAR_N = 7000, FAR_N = 15000, SPLASH_N = 1600;
const NEAR_B = 16, FAR_B = 46;      // box sizes (m)
const MAX_OCC = 16;

const RAIN_WGSL = /* wgsl */ `
struct RainU {
  a: vec4f,        // x intensity (1 = default rain), y time, z exposure time (s), w splash radius
  vel: vec4f,      // xyz camera velocity, w camera ground height
  boxes: vec4f,    // x near box, y far box, z near count, w far count
  wind: vec4f,     // xz wind velocity (m/s), y occluder count, w frame
  occA: array<vec4f, ${MAX_OCC}>,   // cx, cz, cos, sin
  occB: array<vec4f, ${MAX_OCC}>,   // hx, hz, bottom y, top y
};
@group(1) @binding(0) var<uniform> R: RainU;
@group(1) @binding(1) var depthTex: texture_depth_2d;
@group(1) @binding(2) var liTex: texture_3d<f32>;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) col: vec3f,
  @location(1) q: vec2f,          // x across (-1..1), y along (0 head .. 1 tail)
  @location(2) @interpolate(flat) misc: vec4f, // x alpha, y view depth, z kind (0 streak, 1 fleck, 2 ripple), w age
};

fn h1(i: u32, k: u32) -> f32 { return hash11u(i * 7919u + k * 104729u + 17u); }

fn sheltered(p: vec3f) -> bool {
  let n = u32(R.wind.y);
  for (var k = 0u; k < n; k++) {
    let A = R.occA[k]; let B = R.occB[k];
    let d = p.xz - A.xy;
    let l = vec2f(d.x * A.z + d.y * A.w, -d.x * A.w + d.y * A.z);
    if (abs(l.x) < B.x && abs(l.y) < B.y && p.y < B.z) { return true; }
  }
  return false;
}

// Light arriving at a world position, as seen from the camera (fog incoming-radiance volume).
fn lightAt(p: vec3f) -> vec3f {
  let c = F.viewProjNJ * vec4f(p, 1.0);
  let uv = clamp(c.xy / c.w * vec2f(0.5, -0.5) + 0.5, vec2f(0.0), vec2f(1.0));
  let w = clamp(fogSlice(length(p - F.camPos.xyz)), 0.0, 1.0);
  return textureSampleLevel(liTex, sampClamp, vec3f(uv, w), 0.0).rgb;
}

fn cull() -> VOut { var o: VOut; o.pos = vec4f(0.0, 0.0, -2.0, 1.0); return o; }

const FOCAL_K = 0.5; // focal length in pixels = res.y * FOCAL_K / tan(fov/2)

@vertex fn vsStreak(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  let nearN = u32(R.boxes.z);
  let isNear = ii < nearN;
  let i = select(ii - nearN + 100000u, ii, isNear);
  if (!isNear && ii - nearN >= u32(R.boxes.w)) { return cull(); }
  let B = select(R.boxes.y, R.boxes.x, isNear);
  let t = R.a.y;
  let speed = 7.0 + 2.5 * h1(i, 3u);
  let v = vec3f(R.wind.x, -speed, R.wind.z);
  // world-anchored drop wrapped into a box around the camera
  let base = vec3f(h1(i, 0u), h1(i, 1u), h1(i, 2u)) * B;
  let rel = fract((base + v * t - F.camPos.xyz) / B + 0.5) - 0.5;
  let p = F.camPos.xyz + rel * B;
  let edge = max(abs(rel.x), max(abs(rel.y), abs(rel.z)));
  var alpha = 1.0 - smoothstep(0.32, 0.48, edge);
  if (alpha <= 0.0 || p.y < 0.05 || sheltered(p)) { return cull(); }

  // streak = motion during the exposure, relative to the camera
  var vr = v - R.vel.xyz;
  let vl = length(vr);
  let len = min(vl * R.a.z, 2.5);
  let tail = p - vr / max(vl, 1e-3) * max(len, 0.12);
  let ch = F.viewProjNJ * vec4f(p, 1.0);
  let ct = F.viewProjNJ * vec4f(tail, 1.0);
  if (ch.w < 0.3 || ct.w < 0.3) { return cull(); }
  let res = F.res.xy;
  let sh = (ch.xy / ch.w * 0.5 + 0.5) * res;
  let st = (ct.xy / ct.w * 0.5 + 0.5) * res;
  var dvec = st - sh;
  let dl = length(dvec);
  let dir = select(vec2f(0.0, 1.0), dvec / max(dl, 1e-4), dl > 1e-3);
  let nrm = vec2f(-dir.y, dir.x);
  // physical drop width ~2.5 mm; never thinner than 1.1 px (coverage goes into alpha instead)
  let focal = res.y * FOCAL_K / F.camRight.w;
  let wpx = 0.0025 * focal / ch.w;
  let drawW = max(wpx, 1.1);
  alpha *= min(wpx / drawW, 1.0) * 0.9;
  // fade very long streaks (less energy per pixel) and far drops
  alpha *= 1.0 / (1.0 + dl * 0.012);
  var corner = array<vec2f, 6>(vec2f(-1.0, 0.0), vec2f(1.0, 0.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0));
  let c = corner[vi];
  let cap = drawW * 0.5;
  let along = select(-cap, cap, c.y > 0.5);
  let spx = mix(sh, st, c.y) + dir * along + nrm * (c.x * drawW * 0.5);
  let w = mix(ch.w, ct.w, c.y);
  let z = mix(ch.z / ch.w, ct.z / ct.w, c.y);
  var o: VOut;
  o.pos = vec4f((spx / res * 2.0 - 1.0) * w, z * w, w);
  // lighting: incoming light around the drop (point lights, glow, sky, moon) + a little sky reflection
  let L = lightAt(p);
  o.col = (L * 0.55 + skyAmbient(vec3f(0.0, 1.0, 0.0)) * 0.25) * R.a.x;
  o.q = vec2f(c.x, c.y);
  o.misc = vec4f(alpha, ch.w, 0.0, 0.0);
  return o;
}

// Splashes: flecks (tiny bright crowns) on solid ground, expanding ripple rings on water.
@vertex fn vsSplash(@builtin(vertex_index) vi: u32, @builtin(instance_index) i: u32) -> VOut {
  let t = R.a.y;
  let water = h1(i, 9u) < 0.5;
  let life = select(0.09, 0.5, water);
  let period = life + 0.25 + 0.5 * h1(i, 4u);
  let ph = t / period + h1(i, 5u);
  let cyc = u32(floor(ph));
  let age = fract(ph) * period;
  if (age > life) { return cull(); }
  let k = i * 131u + cyc * 7u;
  let Bs = R.a.w * 2.0;
  let base = vec2f(h1(k, 6u), h1(k, 7u)) * Bs;
  let rel = fract((base - F.camPos.xz) / Bs + 0.5) - 0.5;
  let xz = F.camPos.xz + rel * Bs;
  let rr = length(rel) * 2.0;
  var alpha = 1.0 - smoothstep(0.6, 1.0, rr);
  if (alpha <= 0.0) { return cull(); }
  let th = terrainHeight(xz);
  let onWater = th < 0.0;
  if (onWater != water) { return cull(); }
  var gy = max(th, 0.0);
  // standing on something above the terrain (roof, deck): splash on that level near the camera
  if (R.vel.w > th + 1.0 && rr < 0.6) { gy = R.vel.w; }
  let p = vec3f(xz.x, gy + 0.01, xz.y);
  if (sheltered(p + vec3f(0.0, 0.05, 0.0))) { return cull(); }
  var corner = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let c = corner[vi];
  var wp: vec3f;
  var kind = 1.0;
  let a01 = age / life;
  if (water) {
    // flat ripple on the water surface
    let size = 0.03 + 0.2 * sqrt(a01);
    wp = p + vec3f(c.x, 0.0, c.y) * size;
    kind = 2.0;
    alpha *= (1.0 - a01) * (1.0 - a01) * 0.45 * (1.0 - smoothstep(4.0, 12.0, length(xz - F.camPos.xz)));
  } else {
    // small camera-facing speck just above the ground, rising a little as it bursts
    let size = 0.018 + 0.03 * a01;
    wp = p + vec3f(0.0, 0.015 + 0.04 * a01, 0.0) + (F.camRight.xyz * c.x + vec3f(0.0, 1.0, 0.0) * c.y) * size;
    alpha *= (1.0 - a01) * 0.7;
  }
  let cp = F.viewProjNJ * vec4f(wp, 1.0);
  if (cp.w < 0.3) { return cull(); }
  var o: VOut;
  o.pos = cp;
  let L = lightAt(p + vec3f(0.0, 0.3, 0.0));
  o.col = (L * select(0.9, 0.6, water) + skyAmbient(vec3f(0.0, 1.0, 0.0)) * 0.6) * R.a.x;
  o.q = c;
  o.misc = vec4f(alpha, cp.w, kind, a01);
  return o;
}

@fragment fn fs(i: VOut) -> @location(0) vec4f {
  let kind = i.misc.z;
  var a = i.misc.x;
  if (kind < 0.5) {
    // gaussian profile across the streak, soft taper toward the tail
    a *= exp(-i.q.x * i.q.x * 2.5) * (1.0 - 0.6 * i.q.y);
  } else if (kind < 1.5) {
    // fleck: soft bright speck
    let r2 = dot(i.q, i.q);
    a *= exp(-r2 * 6.0);
  } else {
    // ripple: thin expanding ring with a faint inner ring
    let r = length(i.q);
    a *= smoothstep(0.1, 0.0, abs(r - 0.85)) * 0.6 + smoothstep(0.08, 0.0, abs(r - 0.5)) * 0.25 * (1.0 - i.misc.w);
  }
  // soft depth fade against the scene; flecks must sit on a surface (not float over a ledge)
  let sd = linearDepth(textureLoad(depthTex, vec2i(i.pos.xy), 0));
  let diff = sd - i.misc.y;
  a *= saturate(diff / 0.3);
  if (kind > 0.5 && kind < 1.5) { a *= 1.0 - smoothstep(0.3, 0.8, diff - i.misc.y * 0.02); }
  if (a <= 0.002) { discard; }
  return vec4f(i.col * a, 0.0);
}
`;

export default {
  name: 'rain',
  init(ctx) {
    const d = ctx.device, r = ctx.renderer;
    this.u = new Float32Array(16 + MAX_OCC * 8);
    this.ubuf = d.createBuffer({ size: this.u.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.layout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
      { binding: 2, visibility: GPUShaderStage.VERTEX, texture: { sampleType: 'float', viewDimension: '3d' } },
    ] });
    const mod = shader(d, WGSL_LIB + WGSL_FRAME + RAIN_WGSL, 'rain');
    const pl = d.createPipelineLayout({ bindGroupLayouts: [r.frameLayout, this.layout] });
    const add = { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } };
    const mk = (vs) => d.createRenderPipeline({
      label: 'rain-' + vs, layout: pl,
      vertex: { module: mod, entryPoint: vs },
      fragment: { module: mod, entryPoint: 'fs', targets: [{ format: 'rgba16float', blend: add }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'greater' },
    });
    this.streakPipe = mk('vsStreak');
    this.splashPipe = mk('vsSplash');
    this.att = [{ view: null, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }];
    this.desc = { colorAttachments: this.att, depthStencilAttachment: { view: null, depthReadOnly: true }, timestampWrites: undefined };
    this.groups = null;
  },

  resize(ctx) {
    const d = ctx.device;
    const li = ctx.fogLi;
    this.groups = [0, 1].map((k) => d.createBindGroup({ layout: this.layout, entries: [
      { binding: 0, resource: { buffer: this.ubuf } },
      { binding: 1, resource: ctx.views.depth },
      { binding: 2, resource: li.views[k] },
    ] }));
  },

  // Overhead collider boxes near the camera (bridge decks, awnings, overpasses) that shelter the rain.
  _occluders(ctx) {
    const w = ctx.world, c = ctx.cam, u = this.u;
    let n = 0;
    const feet = c.y - 1.7;
    for (let gx = -1; gx <= 1 && n < MAX_OCC; gx++) for (let gz = -1; gz <= 1 && n < MAX_OCC; gz++) {
      const cell = w.collidersNear(c.x + gx * 64, c.z + gz * 64);
      if (!cell) continue;
      for (let i = 0; i < cell.length && n < MAX_OCC; i++) {
        const b = cell[i];
        const bottom = b.cy - b.hy;
        if (bottom < feet + 2.2 || bottom > c.y + 40) continue;
        let dup = false;
        for (let j = 0; j < n; j++) if (u[16 + j * 4] === b.cx && u[16 + j * 4 + 1] === b.cz) { dup = true; break; }
        if (dup) continue;
        const o = 16 + n * 4, o2 = 16 + MAX_OCC * 4 + n * 4;
        u[o] = b.cx; u[o + 1] = b.cz; u[o + 2] = b.cos; u[o + 3] = b.sin;
        u[o2] = b.hx; u[o2 + 1] = b.hz; u[o2 + 2] = bottom; u[o2 + 3] = b.cy + b.hy;
        n++;
      }
    }
    return n;
  },

  afterLighting(ctx, enc) {
    const rain = ctx.env.rain;
    if (!(rain > 0.001) || !ctx.fogLi || !this.groups) return;
    const q = ctx.quality.level;
    const k = Math.min(rain / 0.55, 1.6);
    const u = this.u, v = ctx.camVel, c = ctx.cam;
    u[0] = k; u[1] = ctx.time; u[2] = 0.032; u[3] = 13;
    u[4] = v[0]; u[5] = v[1]; u[6] = v[2]; u[7] = ctx.controls ? ctx.controls.y : c.y - 1.7;
    const nearN = Math.round(NEAR_N * (q === 0 ? 0.5 : 1) * Math.min(k, 1));
    const farN = Math.round(FAR_N * (q === 2 ? 1 : q === 1 ? 0.6 : 0.3) * Math.min(k, 1));
    u[8] = NEAR_B; u[9] = FAR_B; u[10] = nearN; u[11] = farN;
    u[12] = ctx.env.windX * 2.2; u[14] = ctx.env.windZ * 2.2; u[15] = 0;
    u[13] = this._occluders(ctx);
    ctx.device.queue.writeBuffer(this.ubuf, 0, u);

    const post = ctx.renderer.post;
    this.att[0].view = post.rainView;
    this.desc.depthStencilAttachment.view = ctx.views.depth;
    this.desc.timestampWrites = ctx.prof.ts('rain');
    const p = enc.beginRenderPass(this.desc);
    p.setBindGroup(0, ctx.renderer.frameGroup);
    p.setBindGroup(1, this.groups[ctx.fogLi.index]);
    p.setPipeline(this.streakPipe);
    p.draw(6, nearN + farN);
    p.setPipeline(this.splashPipe);
    p.draw(6, Math.round(SPLASH_N * Math.min(k, 1.3)));
    p.end();
    post.rainActive = true;
  },
};
