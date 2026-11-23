// Buildings (baseline placeholder): one instanced box per lot with procedural windows.

import { rng } from './math.js';
import { DT } from './world.js';

const BOX_WGSL = /* wgsl */ `
struct Inst { a: vec4f, b: vec4f }; // a: x, z, w, d   b: angle, y0, height, seed
@group(1) @binding(0) var<storage, read> insts: array<Inst>;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) lp: vec3f,
  @location(3) @interpolate(flat) seed: f32,
};

@vertex fn vs(@location(0) pos: vec3f, @location(1) nrm: vec3f, @builtin(instance_index) ii: u32) -> VOut {
  let I = insts[ii];
  let size = vec3f(I.a.z, I.b.z, I.a.w);
  let lp = pos * size;
  let r = rot2(-I.b.x);
  let xz = r * lp.xz;
  var o: VOut;
  o.wp = vec3f(I.a.x + xz.x, I.b.y + lp.y, I.a.y + xz.y);
  let nxz = r * nrm.xz;
  o.n = vec3f(nxz.x, nrm.y, nxz.y);
  o.lp = lp;
  o.seed = I.b.w;
  o.pos = F.viewProj * vec4f(o.wp, 1.0);
  return o;
}

@fragment fn fs(i: VOut) -> GOut {
  let n = normalize(i.n);
  var albedo = vec3f(0.06, 0.065, 0.075);
  var emis = vec3f(0.0);
  let side = abs(n.y) < 0.5;
  if (side) {
    let u = select(i.lp.z, i.lp.x, abs(n.z) > 0.5);
    let cell = vec2f(u / 3.2, i.lp.y / 3.6);
    let f = fract(cell);
    let win = step(0.15, f.x) * step(f.x, 0.85) * step(0.2, f.y) * step(f.y, 0.8);
    let h = hash21(floor(cell) + i.seed * 31.0);
    let lit = step(0.55, h);
    let warm = mix(vec3f(1.0, 0.65, 0.35), vec3f(0.6, 0.8, 1.0), step(0.8, hash21(floor(cell) + 3.0)));
    emis = warm * win * lit * 1.6;
    albedo = mix(albedo, vec3f(0.02, 0.025, 0.03), win);
  }
  return gbuf(albedo, 0.5, n, 0.0, emis, 1.0, motionVector(i.wp, i.wp), 0.0, 0.6);
}
`;

export default {
  name: 'buildings',
  init(ctx) {
    const d = ctx.device, world = ctx.world;
    const R = rng(77);
    const data = [];
    for (const L of world.lots) {
      let h = 12 + R() * 30;
      if (L.type === DT.CBD) h = 60 + R() * R() * 300;
      if (L.type === DT.HILLSIDE) h = 20 + R() * R() * 140;
      if (L.type === DT.STEPPE) h = 8 + R() * 20;
      data.push(L.x, L.z, L.w * 0.9, L.d * 0.9, L.angle, L.gMin - 3, h + (L.gMax - L.gMin) + 3, R() * 1000);
    }
    this.count = data.length / 8;
    const arr = new Float32Array(Math.max(data.length, 8));
    arr.set(data);
    this.instBuf = d.createBuffer({ size: arr.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.instBuf, 0, arr);
    // unit box centered on x/z, y from 0..1
    const P = [], I = [];
    const faces = [[1, 0, 0, 0, 0, 1], [-1, 0, 0, 0, 0, 1], [0, 1, 0, 1, 0, 0], [0, -1, 0, 1, 0, 0], [0, 0, 1, 1, 0, 0], [0, 0, -1, 1, 0, 0]];
    for (const [nx, ny, nz, tx, ty, tz] of faces) {
      const base = P.length / 6;
      const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        P.push(nx * 0.5 + (tx * a + bx * b) * 0.5, ny * 0.5 + (ty * a + by * b) * 0.5 + 0.5, nz * 0.5 + (tz * a + bz * b) * 0.5, nx, ny, nz);
      }
      // choose winding so the face points outward
      const c = [P.slice(base * 6, base * 6 + 3), P.slice(base * 6 + 6, base * 6 + 9), P.slice(base * 6 + 12, base * 6 + 15)];
      const e1 = [c[1][0] - c[0][0], c[1][1] - c[0][1], c[1][2] - c[0][2]];
      const e2 = [c[2][0] - c[0][0], c[2][1] - c[0][1], c[2][2] - c[0][2]];
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const outward = cr[0] * nx + cr[1] * ny + cr[2] * nz > 0;
      if (outward) I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else I.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    this.vbuf = d.createBuffer({ size: P.length * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.vbuf, 0, new Float32Array(P));
    this.ibuf = d.createBuffer({ size: I.length * 4, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.ibuf, 0, new Uint32Array(I));
    this.indexCount = I.length;
    this.layout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }] });
    this.group = d.createBindGroup({ layout: this.layout, entries: [{ binding: 0, resource: { buffer: this.instBuf } }] });
    this.pipe = ctx.renderer.gbufferPipeline({
      label: 'buildings', code: BOX_WGSL, groups: [this.layout],
      buffers: [{ arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }] }],
    });
    // a few street lights so the lighting path is exercised
    for (let i = 0; i < world.lots.length; i += 3) {
      const L = world.lots[i];
      ctx.lights.add(L.x + L.w * 0.6, L.gMin + 6, L.z, 30, 60 * (0.5 + R()), 20 + 40 * R(), 80 * R(), R() < 0.2 ? 1 + R() : 0);
    }
  },
  gbuffer(ctx, pass) {
    pass.setPipeline(this.pipe);
    pass.setBindGroup(1, this.group);
    pass.setVertexBuffer(0, this.vbuf);
    pass.setIndexBuffer(this.ibuf, 'uint32');
    pass.drawIndexed(this.indexCount, this.count);
  },
};
