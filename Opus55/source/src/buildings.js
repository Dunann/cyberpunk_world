// Buildings: the architecture of the whole city.
//
// Generation (buildings_gen.js, buildings_landmarks.js) turns world.lots and world.landmarks into ~50k "parts"
// (parametric extrusions: podiums, tower shafts, setbacks, crowns, domes, props). Each frame a compute pass culls
// parts against the frustum and screen size and sorts the survivors into six indirect draws by LOD mesh:
//   0 box near, 1 round K48, 2 curved K48x32 rows, 3 round K24, 4 curved K24x10 rows, 5 box far / props.
// Facades (windows with fake interiors, glass curtain walls, stone, brick, tile, wood, LED shows) are shaded
// procedurally in the fragment shader (buildings_wgsl.js).
//
// Publishes: world.signSlots (facade anchors), world.shared.towerTops, world.shared.ledFacades, colliders, lights.

import { rng } from './math.js';
import { DT } from './world.js';
import { PART_WGSL, CULL_WGSL, DRAW_WGSL, PART_FLOATS } from './buildings_wgsl.js';
import { Builder, genHillside, genUrban, genBund, genSteppe, genCBD, skybridges, walkways } from './buildings_gen.js';
import { prepareLots, genLandmarks, genMarket } from './buildings_landmarks.js';
import { genInfill, infillHeightStats } from './buildings_infill.js';
import { WGSL_LIB, WGSL_FRAME, GBUFFER_OUT } from './common.js';
import { WGSL_LIGHT, GBUFFER_FORMATS, DEPTH_FORMAT } from './renderer.js';
import { shader } from './gpu.js';

const LIGHT_BUDGET = 1450;
const INFILL_LIGHT_BUDGET = 80;
const LISTS = 6;
// mesh used by each draw list: [K columns, R rows]
const LIST_MESH = [0, 2, 4, 1, 3, 0];
const MESHES = [[8, 1], [24, 1], [48, 1], [24, 10], [48, 32]];

// Ring mesh: K columns x R rows of side quads (unshared vertices per column so faces can be flat), top cap fan,
// bottom cap fan. Vertex = (s, s_mid, t, kind) with kind 0 side, 1 top center, 2 top ring, 3 bottom center, 4 bottom ring.
function ringMesh(K, R, verts, idx) {
  const base = verts.length / 4;
  for (let c = 0; c < K; c++) {
    const s0 = c / K, s1 = (c + 1) / K, sm = (c + 0.5) / K;
    for (let r = 0; r <= R; r++) { const t = r / R; verts.push(s0, sm, t, 0, s1, sm, t, 0); }
  }
  for (let c = 0; c < K; c++) for (let r = 0; r < R; r++) {
    const A = base + c * (R + 1) * 2 + r * 2, B = A + 1, A2 = A + 2, B2 = A + 3;
    idx.push(A, B2, B, A, A2, B2);
  }
  const top = verts.length / 4;
  verts.push(0.5, 0.5, 1, 1);
  for (let c = 0; c < K; c++) { const s0 = c / K, s1 = (c + 1) / K, sm = (c + 0.5) / K; verts.push(s0, sm, 1, 2, s1, sm, 1, 2); }
  for (let c = 0; c < K; c++) { const A = top + 1 + c * 2, B = A + 1; idx.push(top, B, A); }
  const bot = verts.length / 4;
  verts.push(0.5, 0.5, 0, 3);
  for (let c = 0; c < K; c++) { const s0 = c / K, s1 = (c + 1) / K, sm = (c + 0.5) / K; verts.push(s0, sm, 0, 4, s1, sm, 0, 4); }
  for (let c = 0; c < K; c++) { const A = bot + 1 + c * 2, B = A + 1; idx.push(bot, A, B); }
  return { baseVertex: base, vcount: verts.length / 4 - base };
}

function generate(ctx) {
  const world = ctx.world;
  const { market } = prepareLots(world);
  const B = new Builder(world, ctx.quality.level);
  const R = rng(9137);
  let clockDone = false;
  // the clock tower goes on the waterfront Bund building closest to the middle of the row
  let clockLot = null, best = 1e9;
  for (const L of world.lots) if (L.type === DT.BUND && L.waterDist < 125) { const d = Math.abs(L.z + 1080); if (d < best) { best = d; clockLot = L; } }
  genLandmarks(B, R, world);
  genMarket(B, R, world, market);
  for (const L of world.lots) {
    const r = rng(L.seed);
    switch (L.type) {
      case DT.HILLSIDE: genHillside(B, r, L); break;
      case DT.URBAN: genUrban(B, r, L); break;
      case DT.BUND: genBund(B, r, L, L === clockLot && !clockDone); if (L === clockLot) clockDone = true; break;
      case DT.STEPPE: genSteppe(B, r, L); break;
      case DT.CBD: genCBD(B, r, L); break;
      default: break;
    }
  }
  B.bridges = skybridges(B, rng(5150));
  B.walkways = walkways(B, rng(5151));
  // land-use plan infill (I-016): generated last, with its own sign slots and lights
  B.infill = genInfill(B, world);
  return B;
}

export default {
  name: 'buildings',

  init(ctx) {
    const d = ctx.device, world = ctx.world;
    const t0 = performance.now();
    const B = generate(ctx);
    const P = B.P;
    this.count = P.count;

    // colliders
    for (const i of P.solid) {
      const g = (f) => P.get(i, f);
      const hw = g(4), hd = g(5), h = g(6);
      if (Math.min(hw, hd) < 1 || h < 2) continue;
      world.addCollider(g(0), g(1) + h / 2, g(2), hw, h / 2, hd, g(3));
    }

    // lights: landmark/flood/market lights first, then shop spill lights spread evenly over the city
    const L = B.lights;
    const hi = L.filter((l) => l[8] > 1), lo = L.filter((l) => l[8] <= 1);
    const rl = rng(4242);
    for (let i = lo.length - 1; i > 0; i--) { const j = Math.floor(rl() * (i + 1)); const t = lo[i]; lo[i] = lo[j]; lo[j] = t; }
    let nl = 0;
    for (const l of hi.concat(lo)) {
      if (nl >= LIGHT_BUDGET) break;
      ctx.lights.add(l[0], l[1], l[2], l[3], l[4], l[5], l[6], l[7]);
      nl++;
    }
    this.lightCount = nl;
    // infill shop lights: own shuffle and pool, added after the selection above
    const il = B.infill.lights.slice();
    const ri = rng(4343);
    for (let i = il.length - 1; i > 0; i--) { const j = Math.floor(ri() * (i + 1)); const t = il[i]; il[i] = il[j]; il[j] = t; }
    for (const l of il.slice(0, INFILL_LIGHT_BUDGET)) ctx.lights.add(l[0], l[1], l[2], l[3], l[4], l[5], l[6], l[7]);
    world.shared.infillStats = { ...B.infill, lights: Math.min(il.length, INFILL_LIGHT_BUDGET), lightsWanted: il.length, heights: infillHeightStats(B.infill.tops), tops: undefined };

    // shared data
    // landmark tops (new supertall and telecom tower) are always included, then the tallest CBD and Bund towers
    const lm = B.tops.filter((t) => t.lm && !t.cbd);
    const cbd = B.tops.filter((t) => t.cbd).sort((a, b) => b.y - a.y).slice(0, 14 - lm.length);
    const bund = B.tops.filter((t) => t.bund).sort((a, b) => b.y - a.y).slice(0, 6);
    world.shared.towerTops = lm.concat(cbd, bund).map((t) => ({ x: t.x, y: t.y, z: t.z }));
    world.shared.ledFacades = B.led;
    world.shared.landmarkSites = B.sites;
    world.shared.buildingStats = { parts: P.count, props: B.props, bridges: B.bridges, walkways: B.walkways, shopProps: B.shopProps, lights: nl, lightsWanted: L.length, slots: world.signSlots.length, colliders: world.colliders.length, lots: world.lots.length };

    // ---------------- GPU resources
    const verts = [], idx = [];
    this.meshes = MESHES.map(([K, Rr]) => {
      const first = idx.length;
      const m = ringMesh(K, Rr, verts, idx);
      return { first, count: idx.length - first, baseVertex: 0 };
    });
    this.vbuf = d.createBuffer({ size: verts.length * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.vbuf, 0, new Float32Array(verts));
    this.ibuf = d.createBuffer({ size: idx.length * 4, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.ibuf, 0, new Uint32Array(idx));

    const N = Math.max(P.count, 1);
    const stride = Math.ceil(N / 64) * 64;
    this.stride = stride;
    const pdata = P.data.subarray(0, N * PART_FLOATS);
    this.partBuf = d.createBuffer({ size: Math.max(pdata.byteLength, 96), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.partBuf, 0, pdata);
    this.visBuf = d.createBuffer({ size: stride * LISTS * 4, usage: GPUBufferUsage.STORAGE });
    this.argsTemplate = new Uint32Array(LISTS * 5);
    for (let l = 0; l < LISTS; l++) {
      const m = this.meshes[LIST_MESH[l]];
      this.argsTemplate.set([m.count, 0, m.first, 0, 0], l * 5);
    }
    this.argsBuf = d.createBuffer({ size: this.argsTemplate.byteLength, usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.cullU = new Float32Array([N, stride, ctx.quality.level === 0 ? 0.7 : ctx.quality.level === 1 ? 0.85 : 1.0, 1.4]);
    this.cullUBuf = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.cullUBuf, 0, this.cullU);

    const SB = (type, vis) => ({ visibility: vis, buffer: { type } });
    const C = GPUShaderStage.COMPUTE, V = GPUShaderStage.VERTEX, F = GPUShaderStage.FRAGMENT;
    this.cullLayout = d.createBindGroupLayout({ label: 'bld-cull', entries: [
      { binding: 0, ...SB('read-only-storage', C) }, { binding: 1, ...SB('storage', C) },
      { binding: 2, ...SB('storage', C) }, { binding: 3, ...SB('uniform', C) }] });
    this.cullGroup = d.createBindGroup({ layout: this.cullLayout, entries: [
      { binding: 0, resource: { buffer: this.partBuf } }, { binding: 1, resource: { buffer: this.visBuf } },
      { binding: 2, resource: { buffer: this.argsBuf } }, { binding: 3, resource: { buffer: this.cullUBuf } }] });
    this.cullPipe = ctx.renderer.computePipeline({ label: 'buildings-cull', code: PART_WGSL + CULL_WGSL, groups: [this.cullLayout] });

    this.drawLayout = d.createBindGroupLayout({ label: 'bld-draw', entries: [
      { binding: 0, ...SB('read-only-storage', V | F) }, { binding: 1, ...SB('read-only-storage', V) }] });
    this.drawGroups = [];
    for (let l = 0; l < LISTS; l++) {
      this.drawGroups.push(d.createBindGroup({ layout: this.drawLayout, entries: [
        { binding: 0, resource: { buffer: this.partBuf } },
        { binding: 1, resource: { buffer: this.visBuf, offset: l * stride * 4, size: stride * 4 } }] }));
    }
    // Depth prepass + equal-depth shading pass: the city is dense, so this keeps facade shading at ~1x per pixel.
    const module = shader(d, WGSL_LIB + WGSL_FRAME + WGSL_LIGHT + GBUFFER_OUT + PART_WGSL + DRAW_WGSL, 'buildings');
    const layout = d.createPipelineLayout({ bindGroupLayouts: [ctx.renderer.frameLayout, this.drawLayout] });
    const vertex = { module, entryPoint: 'vs', buffers: [{ arrayStride: 16, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }] }] };
    const primitive = { topology: 'triangle-list', cullMode: 'back' };
    this.prePipe = d.createRenderPipeline({ label: 'buildings-depth', layout, vertex, primitive,
      fragment: { module, entryPoint: 'fsDepth', targets: GBUFFER_FORMATS.map((format) => ({ format, writeMask: 0 })) },
      depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'greater' } });
    this.pipe = d.createRenderPipeline({ label: 'buildings', layout, vertex, primitive,
      fragment: { module, entryPoint: 'fs', targets: GBUFFER_FORMATS.map((format) => ({ format })) },
      depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: 'greater-equal' } });
    this.cullDesc = { timestampWrites: undefined };
    this.groups = Math.ceil(N / 64);
    console.log(`buildings: ${P.count} parts, ${P.solid.length} solids, ${world.lots.length} lots, ${world.signSlots.length} sign slots, ${nl} lights, ${(performance.now() - t0).toFixed(0)} ms`);
  },

  compute(ctx, enc) {
    ctx.device.queue.writeBuffer(this.argsBuf, 0, this.argsTemplate);
    this.cullDesc.timestampWrites = ctx.prof.ts('bld-cull');
    const pass = enc.beginComputePass(this.cullDesc);
    pass.setPipeline(this.cullPipe);
    pass.setBindGroup(0, ctx.renderer.frameGroup);
    pass.setBindGroup(1, this.cullGroup);
    pass.dispatchWorkgroups(this.groups);
    pass.end();
  },

  gbuffer(ctx, pass) {
    pass.setVertexBuffer(0, this.vbuf);
    pass.setIndexBuffer(this.ibuf, 'uint32');
    for (let p = 0; p < 2; p++) {
      pass.setPipeline(p === 0 ? this.prePipe : this.pipe);
      for (let l = 0; l < LISTS; l++) {
        pass.setBindGroup(1, this.drawGroups[l]);
        pass.drawIndexedIndirect(this.argsBuf, l * 20);
      }
    }
  },
};
