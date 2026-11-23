// Terrain: CDLOD quadtree (geomorphed, crack-free) over the world heightmap plus a far-field heightmap
// that extends the mountains to +-32 km, so the world edge is never visible.
// Selection: CPU quadtree with min/max height bounds, frustum culling and front-to-back order.
// Shading: baked material textures (albedo, normal, cavity, forest/terrace masks with mips) plus live
// detail: tree-crown bumps, rock strata, terraces, roads/sidewalks/crosswalks/puddles (see terrainShade.js).
//
// Draw order: the ground is the most expensive full-screen shader, so it is drawn as late as possible.
// When the vegetation module is active it draws the ground right after the trees (its gbuffer hook runs
// after buildings and bridges), so early-z rejects ground hidden behind buildings and trees.
// Street lamps, embankments and other small occluders (ctx.terrainEarly) are drawn in the terrain hook.

import { TERRAIN } from './common.js';
import { FAR, generateTerrain } from './terrainGen.js';
import { terrainDrawWGSL } from './terrainShade.js';
import { StreetLamps } from './terrainLamps.js';
import { Embankments } from './terrainBank.js';

const LEAF = 64;                         // leaf patch size (m)
const LEVELS = Math.log2(FAR.SIZE / LEAF); // root level index (10)
const GRID = FAR.SIZE / LEAF;            // leaves per side (1024)
const MAX_PATCHES = 4096;
const MORPH0 = 0.85;

export default {
  name: 'terrain',

  async init(ctx) {
    const d = ctx.device, world = ctx.world;
    const q = ctx.quality.level;
    this.N = q >= 2 ? 32 : q === 1 ? 24 : 16;
    this.K = 6.0 * ctx.quality.drawDistance + (q >= 2 ? 0.5 : 0);
    if (this.K < 5.5) this.K = 5.5;

    const gen = await generateTerrain(ctx);
    Object.assign(this, gen);
    this._buildBounds(world.heights, gen.farHeights);

    // patch grid (N+1)^2 vertices, integer grid coordinates
    const N = this.N, V = N + 1;
    const verts = new Float32Array(V * V * 2);
    for (let j = 0, o = 0; j < V; j++) for (let i = 0; i < V; i++) { verts[o++] = i; verts[o++] = j; }
    const idx = new Uint16Array(N * N * 6);
    for (let j = 0, o = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * V + i, b = a + 1, c = a + V, e = c + 1;
      idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = e;
    }
    this.vbuf = d.createBuffer({ size: verts.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.vbuf, 0, verts);
    this.ibuf = d.createBuffer({ size: idx.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.ibuf, 0, idx);
    this.indexCount = idx.length;

    this.patchData = new Float32Array(MAX_PATCHES * 4);
    this.patchBuf = d.createBuffer({ size: this.patchData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.sampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: 16, addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    const VF = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE;
    this.layout = d.createBindGroupLayout({ label: 'terrain', entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: VF, texture: { sampleType: 'unfilterable-float' } },
      { binding: 2, visibility: VF, texture: { sampleType: 'float' } },
      { binding: 3, visibility: VF, texture: { sampleType: 'float' } },
      { binding: 4, visibility: VF, texture: { sampleType: 'float' } },
      { binding: 5, visibility: VF, texture: { sampleType: 'float' } },
      { binding: 6, visibility: VF, sampler: { type: 'filtering' } },
      { binding: 7, visibility: VF, texture: { sampleType: 'float' } },
      { binding: 8, visibility: VF, texture: { sampleType: 'float' } },
      { binding: 9, visibility: VF, sampler: { type: 'filtering' } },
      { binding: 10, visibility: VF, buffer: { type: 'uniform' } },
    ] });
    this.sampRep = d.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: 8, addressModeU: 'repeat', addressModeV: 'repeat' });
    this.tuData = new Float32Array(4);
    this.tuBuf = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.group = d.createBindGroup({ layout: this.layout, entries: [
      { binding: 0, resource: { buffer: this.patchBuf } },
      { binding: 1, resource: this.farH.createView() },
      { binding: 2, resource: this.nearA.createView() },
      { binding: 3, resource: this.nearN.createView() },
      { binding: 4, resource: this.farA.createView() },
      { binding: 5, resource: this.farN.createView() },
      { binding: 6, resource: this.sampler },
      { binding: 7, resource: this.tNoise.createView() },
      { binding: 8, resource: this.tCanopy.createView() },
      { binding: 9, resource: this.sampRep },
      { binding: 10, resource: { buffer: this.tuBuf } },
    ] });
    this.pipe = ctx.renderer.gbufferPipeline({
      label: 'terrain', code: terrainDrawWGSL({ N, K: this.K.toFixed(3), LEAF, MORPH0: MORPH0.toFixed(3), simple: ctx.params.get('tdbg') === '1' }), groups: [this.layout],
      buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }],
    });

    // shared with vegetation / garden / other modules
    world.shared.terrain = {
      farH: this.farH, farHeights: this.farHeights, FAR, nearN: this.nearN, farN: this.farN, nearA: this.nearA, tNoise: this.tNoise, sampRep: this.sampRep,
      heightAt: (x, z) => this.heightAt(world, x, z),
    };
    this.ranges = new Float64Array(LEVELS + 1);
    for (let l = 0; l <= LEVELS; l++) this.ranges[l] = this.K * LEAF * 2 ** l;
    this.planes = new Float64Array(16);
    this.count = 0;
    ctx.terrainEarly = [];
    this.lamps = new StreetLamps();
    await this.lamps.init(ctx, this);
    world.shared.streetLamps = this.lamps.count;
    this.bank = new Embankments();
    this.bank.init(ctx);
    ctx.terrainEarly.push(this.bank);
    ctx.terrainDrawGround = (c, pass) => this.drawGround(c, pass);
    this.ready = true;
  },

  // Height including the far field (CPU).
  heightAt(world, x, z) {
    const m = Math.max(Math.abs(x), Math.abs(z));
    if (m < 5600) return world.heightAt(x, z);
    const R = FAR.RES;
    let tx = (x - FAR.ORIGIN) / FAR.SIZE * R - 0.5, tz = (z - FAR.ORIGIN) / FAR.SIZE * R - 0.5;
    tx = Math.min(Math.max(tx, 0), R - 1.001); tz = Math.min(Math.max(tz, 0), R - 1.001);
    const ix = tx | 0, iz = tz | 0, fx = tx - ix, fz = tz - iz, i0 = iz * R + ix, H = this.farHeights;
    const hf = (H[i0] * (1 - fx) + H[i0 + 1] * fx) * (1 - fz) + (H[i0 + R] * (1 - fx) + H[i0 + R + 1] * fx) * fz;
    if (m >= 6100) return hf;
    const t = (m - 5600) / 500, w = t * t * (3 - 2 * t);
    return world.heightAt(x, z) * (1 - w) + hf * w;
  },

  // Min/max height pyramid over the quadtree (leaf = 64 m).
  _buildBounds(near, far) {
    const mins = [], maxs = [];
    const n0 = GRID * GRID;
    const mn = new Float32Array(n0).fill(1e9), mx = new Float32Array(n0).fill(-1e9);
    // far field: 32 m texels, 2 per leaf
    const FR = FAR.RES, fScale = FAR.SIZE / FAR.RES;
    for (let j = 0; j < FR; j++) {
      const lz = Math.floor(j * fScale / LEAF);
      for (let i = 0; i < FR; i++) {
        const h = far[j * FR + i], k = lz * GRID + Math.floor(i * fScale / LEAF);
        if (h < mn[k]) mn[k] = h; if (h > mx[k]) mx[k] = h;
      }
    }
    // reset leaves well inside the near map, then add near texels
    const off = (TERRAIN.ORIGIN - FAR.ORIGIN) / LEAF;   // leaf offset of the near map
    const nl = TERRAIN.SIZE / LEAF;
    for (let j = 0; j < nl; j++) for (let i = 0; i < nl; i++) {
      const x0 = TERRAIN.ORIGIN + i * LEAF, z0 = TERRAIN.ORIGIN + j * LEAF;
      const m = Math.max(Math.abs(x0), Math.abs(x0 + LEAF), Math.abs(z0), Math.abs(z0 + LEAF));
      if (m < 5500) { const k = (j + off) * GRID + i + off; mn[k] = 1e9; mx[k] = -1e9; }
    }
    const R = TERRAIN.RES, tpl = LEAF / (TERRAIN.SIZE / R);
    for (let j = 0; j < R; j++) {
      const lz = Math.floor(j / tpl) + off;
      for (let i = 0; i < R; i++) {
        const h = near[j * R + i], k = lz * GRID + Math.floor(i / tpl) + off;
        if (h < mn[k]) mn[k] = h; if (h > mx[k]) mx[k] = h;
      }
    }
    // dilate by one leaf so texels straddling leaf borders are covered
    const dmn = new Float32Array(n0), dmx = new Float32Array(n0);
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      let a = 1e9, b = -1e9;
      for (let y = Math.max(j - 1, 0); y <= Math.min(j + 1, GRID - 1); y++)
        for (let x = Math.max(i - 1, 0); x <= Math.min(i + 1, GRID - 1); x++) {
          const k = y * GRID + x; if (mn[k] < a) a = mn[k]; if (mx[k] > b) b = mx[k];
        }
      dmn[j * GRID + i] = a - 1; dmx[j * GRID + i] = b + 1;
    }
    mins.push(dmn); maxs.push(dmx);
    for (let l = 1, dim = GRID / 2; l <= LEVELS; l++, dim /= 2) {
      const pm = mins[l - 1], px = maxs[l - 1], cm = new Float32Array(dim * dim), cx = new Float32Array(dim * dim);
      for (let j = 0; j < dim; j++) for (let i = 0; i < dim; i++) {
        const a = (2 * j) * dim * 2 + 2 * i, b = a + dim * 2;
        cm[j * dim + i] = Math.min(pm[a], pm[a + 1], pm[b], pm[b + 1]);
        cx[j * dim + i] = Math.max(px[a], px[a + 1], px[b], px[b + 1]);
      }
      mins.push(cm); maxs.push(cx);
    }
    this.minH = mins; this.maxH = maxs;
  },

  _frustum(cam, aspect) {
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const fx = -sy * cp, fy = sp, fz = -cy * cp, rx = cy, rz = -sy;
    const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
    const ty = Math.tan(cam.fov / 2) * 1.04, tx = ty * aspect;
    const P = this.planes;
    P[0] = rx + fx * tx; P[1] = fy * tx; P[2] = rz + fz * tx;
    P[4] = -rx + fx * tx; P[5] = fy * tx; P[6] = -rz + fz * tx;
    P[8] = ux + fx * ty; P[9] = uy + fy * ty; P[10] = uz + fz * ty;
    P[12] = -ux + fx * ty; P[13] = -uy + fy * ty; P[14] = -uz + fz * ty;
  },

  _visible(x0, z0, size, y0, y1) {
    const P = this.planes, c = this.cam;
    for (let i = 0; i < 16; i += 4) {
      const nx = P[i], ny = P[i + 1], nz = P[i + 2];
      const px = (nx >= 0 ? x0 + size : x0) - c.x, py = (ny >= 0 ? y1 : y0) - c.y, pz = (nz >= 0 ? z0 + size : z0) - c.z;
      if (nx * px + ny * py + nz * pz < 0) return false;
    }
    return true;
  },

  _sel(l, ix, iz) {
    const dim = GRID >> l, k = iz * dim + ix;
    const y0 = this.minH[l][k], y1 = this.maxH[l][k];
    const size = LEAF << l, x0 = FAR.ORIGIN + ix * size, z0 = FAR.ORIGIN + iz * size;
    if (!this._visible(x0, z0, size, y0, y1)) return;
    const c = this.cam;
    if (l > 0) {
      const dx = Math.max(x0 - c.x, 0, c.x - x0 - size), dz = Math.max(z0 - c.z, 0, c.z - z0 - size), dy = Math.max(y0 - c.y, 0, c.y - y1);
      const r = this.ranges[l - 1];
      if (dx * dx + dy * dy + dz * dz < r * r) {
        const h = size / 2;
        const sx = c.x < x0 + h ? 0 : 1, sz = c.z < z0 + h ? 0 : 1;
        this._sel(l - 1, 2 * ix + sx, 2 * iz + sz);
        this._sel(l - 1, 2 * ix + 1 - sx, 2 * iz + sz);
        this._sel(l - 1, 2 * ix + sx, 2 * iz + 1 - sz);
        this._sel(l - 1, 2 * ix + 1 - sx, 2 * iz + 1 - sz);
        return;
      }
    }
    if (this.count >= MAX_PATCHES) return;
    const o = this.count * 4, P = this.patchData;
    P[o] = x0; P[o + 1] = z0; P[o + 2] = size; P[o + 3] = l;
    this.count++;
  },

  update(ctx) {
    const cam = ctx.cam;
    this.cam = cam;
    this._frustum(cam, ctx.renderer.width / Math.max(ctx.renderer.height, 1));
    this.count = 0;
    this._sel(LEVELS, 0, 0);
    ctx.device.queue.writeBuffer(this.patchBuf, 0, this.patchData.buffer, 0, this.count * 16);
    this.lamps.update(ctx);
    this.bank.update(ctx);
    this.tuData[0] = this.lamps.realRange;
    ctx.device.queue.writeBuffer(this.tuBuf, 0, this.tuData);
  },

  gbuffer(ctx, pass) {
    this.lamps.draw(ctx, pass);
    const early = ctx.terrainEarly;
    for (let i = 0; i < early.length; i++) early[i].drawEarly(ctx, pass);
    if (!ctx.terrainLateHost) this.drawGround(ctx, pass);
  },

  drawGround(ctx, pass) {
    if (!this.count) return;
    pass.setPipeline(this.pipe);
    pass.setBindGroup(1, this.group);
    pass.setVertexBuffer(0, this.vbuf);
    pass.setIndexBuffer(this.ibuf, 'uint16');
    pass.drawIndexed(this.indexCount, this.count);
  },
};
