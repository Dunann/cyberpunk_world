// Terrain: CPU quadtree of 32x32 patches over the GPU heightmap (with skirts to hide LOD cracks).
// Baseline shading: rock/grass by slope and height, paved city ground with roads, shore stone.

import { TERRAIN } from './common.js';

const N = 32; // quads per patch side
const MAX_PATCHES = 2048;

const TERRAIN_WGSL = /* wgsl */ `
struct Patch { p: vec4f }; // x0, z0, size, lod
@group(1) @binding(0) var<storage, read> patches: array<Patch>;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
};

@vertex fn vs(@location(0) uvs: vec3f, @builtin(instance_index) inst: u32) -> VOut {
  let P = patches[inst].p;
  let xz = P.xy + uvs.xy * P.z;
  var y = terrainHeight(xz);
  y -= uvs.z * max(P.z * 0.03, 2.0); // skirt
  var o: VOut;
  o.wp = vec3f(xz.x, y, xz.y);
  o.pos = F.viewProj * vec4f(o.wp, 1.0);
  return o;
}

@fragment fn fs(i: VOut) -> GOut {
  let p = i.wp;
  let dist = length(p - F.camPos.xyz);
  let n0 = terrainNormal(p.xz, 3.0);
  let info = worldInfo(p.xz);
  // detail normal
  let dn = vec2f(fbm2(p.xz * 0.35, 3), fbm2(p.xz * 0.35 + 9.1, 3)) * 0.25 * (1.0 - smoothstep(30.0, 200.0, dist));
  let n = normalize(n0 + vec3f(dn.x, 0.0, dn.y));
  let slope = 1.0 - n0.y;
  let h = p.y;
  let nz = fbm2(p.xz * 0.02, 4) * 0.5 + 0.5;

  // natural ground
  var albedo = mix(vec3f(0.035, 0.05, 0.028), vec3f(0.05, 0.06, 0.035), nz);  // dark vegetation
  albedo = mix(albedo, vec3f(0.09, 0.085, 0.08), smoothstep(0.25, 0.5, slope)); // rock
  albedo = mix(albedo, vec3f(0.11, 0.115, 0.12), smoothstep(700.0, 1100.0, h + nz * 200.0) * smoothstep(0.5, 0.2, slope)); // high rock
  var rough = 0.9;
  var wet = 0.25;
  var mat = 3.0;

  // shore stone / embankment
  let shore = 1.0 - smoothstep(0.0, 18.0, info.x);
  albedo = mix(albedo, vec3f(0.09, 0.085, 0.08), shore * (1.0 - info.w));
  albedo = mix(albedo, vec3f(0.12, 0.11, 0.09), shore * info.w);

  // city ground: paving + roads
  let urban = smoothstep(0.35, 0.6, info.z) * select(1.0, 0.0, i32(info.y + 0.5) == 7) * smoothstep(0.35, 0.15, slope);
  var emis = vec3f(0.0);
  if (urban > 0.0) {
    let di = i32(info.y + 0.5);
    let r = districtRoad(p.xz, di);
    let pave = vec3f(0.07, 0.07, 0.075) * (0.85 + 0.3 * hash21(floor(p.xz * 1.2)));
    var road = vec3f(0.03, 0.03, 0.033);
    // lane markings
    let lane = abs(r.y);
    let dash = step(0.5, fract(r.z * 0.12));
    let mark = (1.0 - smoothstep(0.08, 0.14, lane)) * dash;
    road = mix(road, vec3f(0.5, 0.45, 0.3), mark);
    let ground = mix(pave, road, r.x);
    albedo = mix(albedo, ground, urban);
    rough = mix(rough, mix(0.6, 0.45, r.x), urban);
    wet = mix(wet, 1.0, urban);
  }
  // distant terrain gets flatter shading
  let ao = 1.0;
  return gbuf(albedo, rough, n, 0.0, emis, ao, motionVector(p, p), mat, wet);
}
`;

export default {
  name: 'terrain',
  init(ctx) {
    const d = ctx.device;
    // patch grid vertices (u, v, skirt) with skirts around the border
    const verts = [];
    const idx = [];
    const V = N + 3; // includes skirt ring
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const u = Math.min(Math.max(i - 1, 0), N) / N, v = Math.min(Math.max(j - 1, 0), N) / N;
      const skirt = i === 0 || j === 0 || i === V - 1 || j === V - 1 ? 1 : 0;
      verts.push(u, v, skirt);
    }
    for (let j = 0; j < V - 1; j++) for (let i = 0; i < V - 1; i++) {
      const a = j * V + i, b = a + 1, c = a + V, e = c + 1;
      idx.push(a, c, b, b, c, e);
    }
    this.vbuf = d.createBuffer({ size: verts.length * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.vbuf, 0, new Float32Array(verts));
    this.ibuf = d.createBuffer({ size: idx.length * 4, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.ibuf, 0, new Uint32Array(idx));
    this.indexCount = idx.length;
    this.patchData = new Float32Array(MAX_PATCHES * 4);
    this.patchBuf = d.createBuffer({ size: this.patchData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.layout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }] });
    this.group = d.createBindGroup({ layout: this.layout, entries: [{ binding: 0, resource: { buffer: this.patchBuf } }] });
    this.pipe = ctx.renderer.gbufferPipeline({
      label: 'terrain', code: TERRAIN_WGSL, groups: [this.layout],
      buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }],
    });
    this.count = 0;
  },

  _select(cx, cz, x0, z0, size) {
    const mx = x0 + size / 2, mz = z0 + size / 2;
    const d = Math.max(Math.hypot(mx - cx, mz - cz) - size * 0.7, 0);
    if (size > 24 && d < size * 1.4 && this.count < MAX_PATCHES - 4) {
      const h = size / 2;
      this._select(cx, cz, x0, z0, h); this._select(cx, cz, x0 + h, z0, h);
      this._select(cx, cz, x0, z0 + h, h); this._select(cx, cz, x0 + h, z0 + h, h);
      return;
    }
    if (this.count >= MAX_PATCHES) return;
    const o = this.count * 4;
    this.patchData[o] = x0; this.patchData[o + 1] = z0; this.patchData[o + 2] = size; this.patchData[o + 3] = 0;
    this.count++;
  },

  update(ctx) {
    this.count = 0;
    const c = ctx.cam;
    const lod = 1 + Math.max(0, c.y - ctx.world.heightAt(c.x, c.z)) / 400;
    this._select(c.x / lod, c.z / lod, TERRAIN.ORIGIN / lod, TERRAIN.ORIGIN / lod, TERRAIN.SIZE / lod);
    // rescale (keeps the quadtree logic simple while coarsening when high above ground)
    if (lod !== 1) for (let i = 0; i < this.count * 4; i += 4) { this.patchData[i] *= lod; this.patchData[i + 1] *= lod; this.patchData[i + 2] *= lod; }
    ctx.device.queue.writeBuffer(this.patchBuf, 0, this.patchData.buffer, 0, this.count * 16);
  },

  gbuffer(ctx, pass) {
    pass.setPipeline(this.pipe);
    pass.setBindGroup(1, this.group);
    pass.setVertexBuffer(0, this.vbuf);
    pass.setIndexBuffer(this.ibuf, 'uint32');
    pass.drawIndexed(this.indexCount, this.count);
  },
};
