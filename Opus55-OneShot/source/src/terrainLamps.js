// Street lamps along urban roads. Placement slots are enumerated on the CPU and validated on the GPU with the
// exact same WGSL rules the terrain shader uses for its analytic lamp pools (lampPos / lampValid in
// terrainShade.js). Lamps near the camera get real point lights (nearest first, adaptive range); beyond that
// range the terrain shader draws matching analytic pools, so the hand-off is seamless.

import { STREET_WGSL } from './terrainShade.js';
import { DISTRICTS } from './world.js';

const CELL = 200;           // culling cell size (m)
const NEAR_MESH = 650;      // full lamp mesh within this distance, glow sprite beyond
const FAR_DRAW = 3200;      // max draw distance for lamp sprites

const VALIDATE_WGSL = /* wgsl */ `
${STREET_WGSL}
struct Cand { di: f32, axis: f32, line: f32, j: f32 };
@group(1) @binding(0) var<storage, read> cands: array<Cand>;
@group(1) @binding(1) var<storage, read_write> outL: array<vec4f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&cands)) { return; }
  let c = cands[i];
  let di = i32(c.di);
  let hw = W.d[di].b.z * 0.5;
  let L = lampPos(di, c.axis, c.line, c.j, hw);
  var ok = lampValid(L.xy, di);
  // keep off steep ground and away from water edges
  let h = terrainHeight(L.xy);
  let n = terrainNormal(L.xy, 3.0);
  if (n.y < 0.8 || h < 3.0) { ok = false; }
  // arm direction: toward the road centre
  let ang = W.d[di].b.x + select(select(0.0, 3.14159, L.z > 0.0), select(-1.5708, 1.5708, L.z > 0.0), c.axis > 0.5);
  outL[i * 2u] = vec4f(L.xy, h, select(0.0, 1.0, ok));
  outL[i * 2u + 1u] = vec4f(ang, lampKind(di, c.axis, c.line), 0.0, 0.0);
}
`;

const LAMP_WGSL = /* wgsl */ `
struct Lamp { a: vec4f, b: vec4f };   // a: x, z, ground y, _   b: arm angle, kind, _, _
@group(1) @binding(0) var<storage, read> lamps: array<Lamp>;
@group(1) @binding(1) var<storage, read> vis: array<u32>;
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) @interpolate(flat) e: vec2f,   // emissive weight, kind
};
@vertex fn vs(@location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) em: f32, @builtin(instance_index) ii: u32) -> VOut {
  let L = lamps[vis[ii]];
  let ca = cos(L.b.x); let sa = sin(L.b.x);
  let r = mat2x2f(ca, sa, -sa, ca);
  let xz = r * pos.xz;
  var o: VOut;
  o.wp = vec3f(L.a.x + xz.x, L.a.z + pos.y, L.a.y + xz.y);
  let nxz = r * nrm.xz;
  o.n = vec3f(nxz.x, nrm.y, nxz.y);
  o.e = vec2f(em, L.b.y);
  o.pos = F.viewProj * vec4f(o.wp, 1.0);
  return o;
}
fn lampCol(kind: f32) -> vec3f { return select(vec3f(1.0, 0.52, 0.18), vec3f(0.72, 0.84, 1.0), kind > 0.5); }
@fragment fn fs(i: VOut) -> GOut {
  let em = lampCol(i.e.y) * i.e.x * 26.0;
  return gbuf(vec3f(0.045, 0.047, 0.05), 0.35, i.n, 0.7, em, 1.0, motionVector(i.wp, i.wp), 0.0, 0.8);
}

// far glow sprites: camera-facing quad at the lamp head
struct SOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) kind: f32, @location(2) wp: vec3f };
@vertex fn vsSprite(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> SOut {
  let L = lamps[vis[ii]];
  let ca = cos(L.b.x); let sa = sin(L.b.x);
  let head = vec3f(L.a.x, L.a.z + 7.05, L.a.y) + vec3f(-sa, 0.0, ca) * 1.6;
  var q = array<vec2f, 4>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(1, 1));
  let c = q[vi];
  let d = distance(head, F.camPos.xyz);
  let s = 0.0011 * d + 0.25;            // keeps the sprite ~2 px wide
  let wp = head + (F.camRight.xyz * c.x + F.camUp.xyz * c.y) * s;
  var o: SOut;
  o.pos = F.viewProj * vec4f(wp, 1.0);
  o.uv = c;
  o.kind = L.b.y;
  o.wp = wp;
  return o;
}
@fragment fn fsSprite(i: SOut) -> GOut {
  let r = dot(i.uv, i.uv);
  if (r > 1.0) { discard; }
  let em = lampCol(i.kind) * 18.0 * (1.0 - r);
  return gbuf(vec3f(0.0), 1.0, -F.camFwd.xyz, 0.0, em, 1.0, motionVector(i.wp, i.wp), 0.0, 0.0);
}
`;

// Lamp mesh in local space: arm points along +z (rotated so it reaches over the road).
function lampMesh() {
  const P = [], I = [];
  const box = (x0, y0, z0, x1, y1, z1, em = 0, emBottomOnly = false) => {
    const faces = [
      [[1, 0, 0], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]],
      [[-1, 0, 0], [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]]],
      [[0, 1, 0], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]],
      [[0, -1, 0], [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]]],
      [[0, 0, 1], [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]]],
      [[0, 0, -1], [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]]],
    ];
    for (const [n, vs] of faces) {
      const b = P.length / 7;
      const e = emBottomOnly ? (n[1] < 0 ? em : 0) : em;
      for (const v of vs) P.push(v[0], v[1], v[2], n[0], n[1], n[2], e);
      I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  };
  // octagonal pole
  const seg = 6, r0 = 0.11, r1 = 0.075, H = 7.0;
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
    const b = P.length / 7;
    const am = (a0 + a1) / 2;
    const nx = Math.cos(am), nz = Math.sin(am);
    P.push(Math.cos(a0) * r0, 0, Math.sin(a0) * r0, nx, 0, nz, 0);
    P.push(Math.cos(a1) * r0, 0, Math.sin(a1) * r0, nx, 0, nz, 0);
    P.push(Math.cos(a1) * r1, H, Math.sin(a1) * r1, nx, 0, nz, 0);
    P.push(Math.cos(a0) * r1, H, Math.sin(a0) * r1, nx, 0, nz, 0);
    I.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  box(-0.2, 0, -0.2, 0.2, 0.5, 0.2);                 // base
  box(-0.05, 6.95, -0.05, 0.05, 7.08, 1.5);          // arm
  box(-0.22, 6.98, 1.25, 0.22, 7.2, 2.05, 1, true);  // head, emissive lens underneath
  // check winding: make every triangle face along its normal
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 7, b = I[t + 1] * 7, c = I[t + 2] * 7;
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (cr[0] * P[a + 3] + cr[1] * P[a + 4] + cr[2] * P[a + 5] < 0) { const s = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = s; }
  }
  return { verts: new Float32Array(P), idx: new Uint16Array(I) };
}

export class StreetLamps {
  async init(ctx, terrain) {
    const d = ctx.device, r = ctx.renderer;
    // candidate slots: (district, axis, road line, lamp index)
    const cand = [];
    DISTRICTS.forEach((D, di) => {
      if (!D.block) return;
      const ext = Math.max(D.rx, D.rz) * 1.05;
      const nl = Math.ceil(ext / D.block);
      const n = Math.max(Math.round(D.block / 34), 1), sp = D.block / n;
      const nj = Math.ceil(ext / sp);
      for (let axis = 0; axis < 2; axis++) for (let line = -nl; line <= nl; line++) for (let j = -nj; j < nj; j++) {
        // local position (cheap pre-filter against the district ellipse)
        const along = (j + 0.5) * sp, off = line * D.block;
        const lx = axis ? off : along, lz = axis ? along : off;
        if ((lx / D.rx) ** 2 + (lz / D.rz) ** 2 > 1.05) continue;
        cand.push(di, axis, line, j);
      }
    });
    const nC = cand.length / 4;
    const candBuf = d.createBuffer({ size: cand.length * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(candBuf, 0, new Float32Array(cand));
    const outBuf = d.createBuffer({ size: nC * 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const rb = d.createBuffer({ size: nC * 32, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const vLayout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ] });
    const vPipe = r.computePipeline({ label: 'lamp-validate', code: VALIDATE_WGSL, groups: [vLayout] });
    const enc = d.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(vPipe);
    pass.setBindGroup(0, r.frameGroup);
    pass.setBindGroup(1, d.createBindGroup({ layout: vLayout, entries: [{ binding: 0, resource: { buffer: candBuf } }, { binding: 1, resource: { buffer: outBuf } }] }));
    pass.dispatchWorkgroups(Math.ceil(nC / 64));
    pass.end();
    enc.copyBufferToBuffer(outBuf, 0, rb, 0, nC * 32);
    d.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ);
    const res = new Float32Array(rb.getMappedRange().slice(0));
    rb.unmap(); rb.destroy(); candBuf.destroy(); outBuf.destroy();

    // keep valid lamps, sorted into culling cells
    const lamps = [];
    for (let i = 0; i < nC; i++) {
      const o = i * 8;
      if (res[o + 3] < 0.5) continue;
      lamps.push([res[o], res[o + 1], res[o + 2], res[o + 4], res[o + 5]]);
    }
    const cellOf = (x, z) => Math.floor(x / CELL) * 4096 + Math.floor(z / CELL);
    lamps.sort((a, b) => cellOf(a[0], a[1]) - cellOf(b[0], b[1]));
    this.count = lamps.length;
    const data = new Float32Array(Math.max(lamps.length, 1) * 8);
    this.pos = new Float32Array(lamps.length * 4);   // light position + kind
    lamps.forEach((L, i) => {
      data.set([L[0], L[1], L[2], 0, L[3], L[4], 0, 0], i * 8);
      const ax = -Math.sin(L[3]), az = Math.cos(L[3]);  // arm direction (local +z rotated)
      this.pos[i * 4] = L[0] + ax * 1.6; this.pos[i * 4 + 1] = L[2] + 6.9; this.pos[i * 4 + 2] = L[1] + az * 1.6; this.pos[i * 4 + 3] = L[4];
    });
    // cells: [x0, z0, start, count]
    const cells = [];
    for (let i = 0; i < lamps.length;) {
      const c = cellOf(lamps[i][0], lamps[i][1]);
      let j = i; let minY = 1e9, maxY = -1e9;
      while (j < lamps.length && cellOf(lamps[j][0], lamps[j][1]) === c) { minY = Math.min(minY, lamps[j][2]); maxY = Math.max(maxY, lamps[j][2]); j++; }
      cells.push(Math.floor(lamps[i][0] / CELL) * CELL, Math.floor(lamps[i][1] / CELL) * CELL, i, j - i, minY, maxY + 8);
      i = j;
    }
    this.cells = new Float64Array(cells);
    this.nCells = cells.length / 6;
    this.lampBuf = d.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.lampBuf, 0, data);
    this.visNear = new Uint32Array(Math.max(this.count, 1));
    this.visFar = new Uint32Array(Math.max(this.count, 1));
    this.farOffset = Math.ceil(this.visNear.byteLength / 256) * 256;
    this.visBuf = d.createBuffer({ size: this.farOffset + this.visFar.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const m = lampMesh();
    this.vbuf = d.createBuffer({ size: m.verts.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.vbuf, 0, m.verts);
    this.ibuf = d.createBuffer({ size: Math.ceil(m.idx.byteLength / 4) * 4, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.ibuf, 0, m.idx.buffer, 0, Math.ceil(m.idx.byteLength / 4) * 4);
    this.indexCount = m.idx.length;
    this.layout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
    ] });
    this.groupNear = d.createBindGroup({ layout: this.layout, entries: [{ binding: 0, resource: { buffer: this.lampBuf } }, { binding: 1, resource: { buffer: this.visBuf, offset: 0, size: this.visNear.byteLength } }] });
    this.groupFar = d.createBindGroup({ layout: this.layout, entries: [{ binding: 0, resource: { buffer: this.lampBuf } }, { binding: 1, resource: { buffer: this.visBuf, offset: this.farOffset, size: this.visFar.byteLength } }] });
    this.pipe = r.gbufferPipeline({ label: 'street-lamps', code: LAMP_WGSL, groups: [this.layout],
      buffers: [{ arrayStride: 28, attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'float32' }] }] });
    this.spritePipe = r.gbufferPipeline({ label: 'street-lamp-sprites', code: LAMP_WGSL, vs: 'vsSprite', fs: 'fsSprite', groups: [this.layout], topology: 'triangle-strip', cull: 'none' });

    // real lights for the nearest lamps
    const q = ctx.quality.level;
    this.maxLights = q >= 2 ? 520 : q === 1 ? 380 : 240;
    this.lightBase = ctx.lights.reserve(this.maxLights);
    this.hist = new Uint32Array(64);   // 10 m bins
    this.dist = new Float32Array(this.count);
    this.range = 300;
    this.terrain = terrain;
  }

  update(ctx) {
    const c = ctx.cam, L = ctx.lights, P = this.pos, n = this.count;
    // adaptive real-light range: as far as the light budget allows (max 600 m)
    const hist = this.hist; hist.fill(0);
    for (let i = 0; i < n; i++) {
      const dx = P[i * 4] - c.x, dy = P[i * 4 + 1] - c.y, dz = P[i * 4 + 2] - c.z;
      const dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
      this.dist[i] = dd;
      const b = (dd / 10) | 0;
      if (b < 64) hist[b]++;
    }
    let acc = 0, R = 640;
    for (let b = 0; b < 64; b++) { acc += hist[b]; if (acc > this.maxLights) { R = b * 10; break; } }
    R = Math.max(R, 60);
    this.range += (R - this.range) * 0.2;   // smooth to avoid visible jumps
    if (Math.abs(this.range - R) > 80) this.range = R;
    R = Math.min(this.range, R);
    let k = 0;
    for (let i = 0; i < n && k < this.maxLights; i++) {
      const dd = this.dist[i];
      if (dd >= R) continue;
      const t = Math.min(Math.max((dd - R * 0.75) / (R * 0.25), 0), 1);
      const f = (1 - t * t * (3 - 2 * t)) * 95;
      const led = P[i * 4 + 3] > 0.5;
      L.set(this.lightBase + k, P[i * 4], P[i * 4 + 1], P[i * 4 + 2], 24, (led ? 0.72 : 1.0) * f, (led ? 0.84 : 0.52) * f, (led ? 1.0 : 0.18) * f, 0);
      k++;
    }
    for (let j = k; j < (this.lastK || 0); j++) L.set(this.lightBase + j, 0, -1e5, 0, 0, 0, 0, 0, 0);
    this.lastK = k;
    this.realRange = R;

    // visible lamps: frustum-tested cells, near mesh vs far sprite
    const t = this.terrain;
    let nn = 0, nf = 0;
    const C = this.cells;
    for (let ci = 0; ci < this.nCells; ci++) {
      const o = ci * 6, x0 = C[o], z0 = C[o + 1];
      const dx = Math.max(x0 - c.x, 0, c.x - x0 - CELL), dz = Math.max(z0 - c.z, 0, c.z - z0 - CELL);
      const dmin = Math.sqrt(dx * dx + dz * dz);
      if (dmin > FAR_DRAW) continue;
      if (!t._visible(x0, z0, CELL, C[o + 4], C[o + 5])) continue;
      const s = C[o + 2], e = s + C[o + 3];
      for (let i = s; i < e; i++) {
        if (this.dist[i] < NEAR_MESH) this.visNear[nn++] = i;
        else if (this.dist[i] < FAR_DRAW) this.visFar[nf++] = i;
      }
    }
    this.nNear = nn; this.nFar = nf;
    if (nn) ctx.device.queue.writeBuffer(this.visBuf, 0, this.visNear.buffer, 0, nn * 4);
    if (nf) ctx.device.queue.writeBuffer(this.visBuf, this.farOffset, this.visFar.buffer, 0, nf * 4);
  }

  draw(ctx, pass) {
    if (this.nNear) {
      pass.setPipeline(this.pipe);
      pass.setBindGroup(1, this.groupNear);
      pass.setVertexBuffer(0, this.vbuf);
      pass.setIndexBuffer(this.ibuf, 'uint16');
      pass.drawIndexed(this.indexCount, this.nNear);
    }
    if (this.nFar) {
      pass.setPipeline(this.spritePipe);
      pass.setBindGroup(1, this.groupFar);
      pass.draw(4, this.nFar);
    }
  }
}
