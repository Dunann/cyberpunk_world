// Bund-style river light show (active while F.show.x > 0; timing from world.js showState).
//  - volumetric searchlight beams from the CBD tower tops and the east promenade, choreographed in 8 s sections
//    (rising fan, parallel sweeps, crossing pairs, strobing pillars, rotating cones, a converging finale) on the beat
//  - laser fans across the river
//  - outside the show: three slow ambient searchlights
// Beams are additive camera-facing quads; the fragment shader integrates a soft Gaussian beam analytically along the
// view ray, ends it softly at opaque geometry (depth) and attenuates it by the froxel fog transmittance.
// Each beam is also drawn mirrored (virtual beam below the river) to give its reflection on the water.

import { beamStore, WGSL_BEAMS, MAX_BEAMS, BEAM_FLOATS } from './showBeams.js';
import { WGSL_LIB, WGSL_FRAME } from './common.js';
import { shader } from './gpu.js';
import water from './water.js';

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

// Instances [0, n) draw the beams, [n, 2n) draw their mirror images in the river (virtual beams below y = 0).
fn beamAt(ii: u32) -> Beam {
  let n = u32(beams.info.x);
  var bm = beams.b[select(ii, ii - n, ii >= n)];
  if (ii >= n) {
    bm.o = vec4f(bm.o.x, -bm.o.y, bm.o.z, bm.o.w);
    bm.d = vec4f(bm.d.x, -bm.d.y, bm.d.z, bm.d.w);
  }
  return bm;
}

@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  let bm = beamAt(ii);
  let mirrored = ii >= u32(beams.info.x);
  var ends = array<f32, 6>(0.0, 0.0, 1.0, 1.0, 0.0, 1.0);
  var sides = array<f32, 6>(-1.0, 1.0, -1.0, -1.0, 1.0, 1.0);
  let L = bm.o.w;
  let d0 = max(length(F.camPos.xyz - bm.o.xyz), 1.0);
  let pixAng = 4.0 * F.camRight.w * F.res.w;
  let u = ends[vi] * L - (1.0 - ends[vi]) * max(bm.d.w * 6.0, pixAng * d0 * 10.0);
  let pe = bm.o.xyz + bm.d.xyz * u;
  let tc = F.camPos.xyz - pe;
  let dist = max(length(tc), 1.0);
  var side = cross(bm.d.xyz, tc / dist);
  if (dot(side, side) < 1e-6) { side = vec3f(1.0, 0.0, 0.0); }
  side = normalize(side);
  let r = max(bm.d.w * select(1.0, 4.0, u <= 0.0) + bm.c.w * max(u, 0.0), pixAng * dist * select(1.2, 10.0, u <= 0.0));
  // widen when seen along the axis so the quad still covers the projected disc; reflections spread with the ripples
  let sinT = length(cross(bm.d.xyz, tc / dist));
  let w = r * 2.3 / max(sinT, 0.25) + select(0.0, dist * 0.02 + r * 3.0, mirrored);
  var o: VOut;
  o.wp = pe + side * w * sides[vi];
  o.pos = F.viewProj * vec4f(o.wp, 1.0);
  o.bi = ii;
  return o;
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
    // ripple normal from the water's wave texture (two drifting layers, mip chosen from the pixel footprint)
    let foot = tW * pixAng * 0.5 / max(-rd.y, 0.04);
    let w1 = textureSampleLevel(waveTex, sampRepeat, P.xz / 38.0 + vec2f(t * 0.011, t * 0.004), log2(max(foot / 38.0 * 512.0, 1.0)));
    let w2 = textureSampleLevel(waveTex, sampRepeat, P.xz / 9.5 + vec2f(-t * 0.02, t * 0.03), log2(max(foot / 9.5 * 512.0, 1.0)));
    let sl = w1.xy * 0.05 + w2.xy * 0.07;
    let nrm = normalize(vec3f(-sl.x, 1.0, -sl.y));
    let R = reflect(rd, nrm);
    let fres = 0.02 + 0.98 * pow(1.0 - saturate(dot(nrm, -rd)), 5.0);
    c = beamGlow(P, R, 1e5, beams.b[i.bi - n], pixAng * 5.0, t) * fres * 0.85;
    s = tW;
  }
  // fog transmittance to the beam
  let f = textureSampleLevel(fogTex, sampClamp, vec3f(uv, clamp(fogSlice(s), 0.0, 1.0)), 0.0);
  c *= f.a;
  return vec4f(min(c, vec3f(60.0)), 0.0);
}`;

const COMP_WGSL = /* wgsl */ `
@group(2) @binding(0) var beamTex: texture_2d<f32>;
struct FOut { @location(0) color: vec4f, @location(1) motion: vec4f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let x = f32((i << 1u) & 2u); let y = f32(i & 2u);
  return vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
}
@fragment fn fs(@builtin(position) pos: vec4f) -> FOut {
  let c = textureSampleLevel(beamTex, sampClamp, pos.xy * F.res.zw, 0.0).rgb;
  if (max(c.r, max(c.g, c.b)) < 2e-4) { discard; }
  var o: FOut;
  o.color = vec4f(c, 0.0);
  o.motion = vec4f(0.0);
  return o;
}
`;

const PI = Math.PI;
const LASER_COLORS = [[0.2, 1.0, 0.35], [0.15, 0.85, 1.0]];
// pattern per 8 s section: rising fan, sweep, crossing, pillars, cones, wave fan, crossing, converging finale
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
    // searchlight sources: tower tops (from the buildings module if published) or the CBD landmarks
    const sources = [];
    const tops = world.shared.towerTops;
    if (Array.isArray(tops) && tops.length) {
      for (const t of tops.slice(0, 8)) {
        const x = t.x ?? t[0], y = t.y ?? t[1], z = t.z ?? t[2];
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) sources.push({ x, y: y + 2, z, tower: true });
      }
    }
    if (!sources.length) {
      for (const id of ['twist', 'twin', 'truss', 'tvtower', 'crown']) {
        const L = world.landmarks.find((l) => l.id === id);
        if (L) sources.push({ x: L.x, y: world.heightAt(L.x, L.z) + L.h + 2, z: L.z, tower: true });
      }
    }
    // east promenade (Lujiazui side of the river)
    const promenade = [];
    for (let z = -1800; z <= -500; z += 260) {
      let x = 2420;
      for (let k = 0; k < 40 && world.waterDist(x, z) < 12; k++) x += 10;
      promenade.push({ x, y: world.heightAt(x, z) + 2.5, z, tower: false });
    }
    this.beamsSrc = [];
    sources.forEach((s, i) => { this.beamsSrc.push({ ...s, k: 0, i }); this.beamsSrc.push({ ...s, k: 1, i }); });
    promenade.forEach((s, i) => this.beamsSrc.push({ ...s, k: 2, i }));
    this.nSearch = Math.min(this.beamsSrc.length, MAX_BEAMS - 16);
    // laser emitters: two points on the east bank, mid-height
    this.lasers = [];
    for (const z of [-1300, -820]) {
      let x = 2420;
      for (let k = 0; k < 40 && world.waterDist(x, z) < 12; k++) x += 10;
      this.lasers.push({ x, y: world.heightAt(x, z) + 42, z });
    }
    this.laserFan = 6;
    this.ambient = sources.length ? [sources[0], sources[Math.min(2, sources.length - 1)], sources[sources.length - 1]] : [];
    this.lightBase = ctx.lights.reserve(this.lasers.length);

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

  // Direction for searchlight j in pattern p at show time ts. Writes this.dir (unit vector).
  _pattern(p, j, n, src, ts, out) {
    const beat = ts * 2;
    let az = WEST, el = 1.2;
    const odd = j % 2 ? 1 : -1;
    switch (p) {
      case 0: // rising fan
        az = WEST + ((j + 0.5) / n - 0.5) * 2.2; el = 0.55 + 0.85 * smooth(0, 6, ts - j * 0.2); break;
      case 1: // parallel sweep over the river
        az = WEST + 0.85 * Math.sin(ts * 0.9 + j * 0.08); el = 1.0 + 0.2 * Math.sin(ts * 0.45); break;
      case 2: // crossing pairs, one cross per beat
        az = WEST + odd * 0.55 * Math.sin(beat * PI * 0.5) + (j / n - 0.5) * 0.6; el = 0.95 + 0.1 * Math.cos(beat * PI * 0.5); break;
      case 3: // pillars
        az = WEST + (j / n - 0.5) * 0.3; el = PI / 2 - 0.04 - 0.12 * (j % 3) * 0.3; break;
      case 4: // rotating cones
        az = ts * 1.4 * odd + j * 0.9; el = 1.12; break;
      case 5: // wave fan
        az = WEST + ((j + 0.5) / n - 0.5) * 2.0; el = 0.8 + 0.35 * Math.sin(ts * 2.2 - j * 0.6); break;
      default: { // converge on a point high above the river, then open
        const dx = 2300 - src.x, dy = 650 + 120 * Math.sin(ts * 0.7) - src.y, dz = -1150 - src.z, l = Math.hypot(dx, dy, dz);
        out[0] = dx / l; out[1] = dy / l; out[2] = dz / l;
        return out;
      }
    }
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

  update(ctx) {
    const show = ctx.show;
    const x = show.intensity, ts = show.time, t = ctx.time;
    const phase = show.beatPhase;
    const pulse = 1 + 0.6 * Math.exp(-phase * 6);
    let count = 0;
    const lights = ctx.lights;

    // ambient searchlights (fade out while the show runs)
    const amb = 1 - x;
    if (amb > 0.01) {
      for (let i = 0; i < this.ambient.length; i++) {
        const s = this.ambient[i];
        const az = t * 0.11 * (i % 2 ? 1 : -1) + i * 2.1;
        const el = 1.05 + 0.2 * Math.sin(t * 0.07 + i * 1.3);
        const ce = Math.cos(el);
        const k = 0.55 * amb;
        this._write(count++, s.x, s.y, s.z, 2200, Math.sin(az) * ce, Math.sin(el), -Math.cos(az) * ce, 1.4,
          0.75 * k, 0.85 * k, 1.0 * k, 0.011);
      }
    }

    if (x > 0.001) {
      const sec = Math.floor(ts / SECTION);
      const local = ts - sec * SECTION;
      const pA = SHOW_ORDER[Math.min(sec, SHOW_ORDER.length - 1)];
      const pB = SHOW_ORDER[Math.min(sec + 1, SHOW_ORDER.length - 1)];
      const blend = smooth(SECTION - 1.2, SECTION, local);
      const pal = PALETTES[(sec + 1) % PALETTES.length];
      const n = this.nSearch;
      for (let j = 0; j < n; j++) {
        const s = this.beamsSrc[j];
        this._pattern(pA, j, n, s, ts, this.dir);
        if (blend > 0) {
          this._pattern(pB, j, n, s, ts, this.dirB);
          for (let c = 0; c < 3; c++) this.dir[c] = this.dir[c] * (1 - blend) + this.dirB[c] * blend;
        }
        const dl = Math.hypot(this.dir[0], this.dir[1], this.dir[2]) || 1;
        // intro: beams switch on one after another
        let k = x * smooth(j * 0.25, j * 0.25 + 0.4, ts);
        if (pA === 3) k *= (j + show.beat) % 2 ? 0.35 + 1.2 * Math.exp(-phase * 5) : 0.9; // strobing pillars
        else k *= pulse;
        const col = pal[j % 2];
        const g = s.tower ? 0.75 : 0.55;
        this._write(count++, s.x, s.y, s.z, s.tower ? 2600 : 1600, this.dir[0] / dl, this.dir[1] / dl, this.dir[2] / dl,
          s.tower ? 1.8 : 1.2, col[0] * k * g, col[1] * k * g, col[2] * k * g, s.tower ? 0.014 : 0.018);
      }
      // laser fans across the river (from the third section on)
      const lk = x * smooth(SECTION * 2, SECTION * 2 + 1, ts);
      if (lk > 0.001) {
        const m = this.laserFan;
        for (let e = 0; e < this.lasers.length; e++) {
          const L = this.lasers[e];
          for (let j = 0; j < m && count < MAX_BEAMS; j++) {
            const f = j / (m - 1) - 0.5;
            const az = WEST + f * (0.6 + 0.4 * Math.sin(ts * 0.8 + e)) + 0.35 * Math.sin(ts * 1.1 + e * 2.0);
            const el = 0.012 + 0.03 * Math.sin(ts * 2.0 + j * 0.7 + e) + 0.02 * (1 - Math.abs(f) * 2);
            const ce = Math.cos(el);
            const on = (show.beat + j) % 4 === 0 ? 1.6 : 1.0;
            const g = LASER_COLORS[e % 2];
            const kk = lk * on * 5;
            this._write(count++, L.x, L.y, L.z, 1500, Math.sin(az) * ce, Math.sin(el), -Math.cos(az) * ce, 0.12,
              g[0] * kk, g[1] * kk, g[2] * kk, 0.0006);
          }
          lights.set(this.lightBase + e, L.x - 6, L.y, L.z, 30, 8 * lk, 30 * lk, 14 * lk);
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
