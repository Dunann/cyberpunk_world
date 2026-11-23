// Urban river embankments: granite retaining walls with a parapet and a paved promenade on top, following the
// river banks through the districts, with a row of small warm globe lamps along the parapet.
// Lamps near the camera get real point lights; farther ones get analytic light pools in the embankment shader.
// Colliders: promenade deck + parapet, so walking along the river works and you cannot walk off the wall.

import { RIVERS, DT, DISTRICTS } from './world.js';
import { catmullRom } from './math.js';

const WALL_D = 1.0;          // wall face at this signed water distance (m)
const DECK_Y = 5.8;          // promenade height
const DECK_W = 5.2;          // promenade width
const PARA_H = 0.95, PARA_T = 0.38;
const LAMP_SP = 16;          // lamp spacing along the bank (m)

const BANK_WGSL = /* wgsl */ `
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) sa: vec3f,      // s (arc length), across, face id
};
@group(1) @binding(0) var<uniform> BU: vec4f;   // x = real lamp light range
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) sa: vec3f) -> VOut {
  var o: VOut;
  o.wp = p; o.n = n; o.sa = sa;
  o.pos = F.viewProj * vec4f(p, 1.0);
  return o;
}
fn blocks(u: vec2f, size: vec2f) -> vec3f {   // returns (joint mask, block id hash, bevel)
  let row = floor(u.y / size.y);
  let q = vec2f(u.x / size.x + row * 0.5, u.y / size.y);
  let f = fract(q);
  let e = min(min(f.x, 1.0 - f.x) * size.x, min(f.y, 1.0 - f.y) * size.y);
  return vec3f(1.0 - smoothstep(0.015, 0.04, e), hash21(floor(q) + 0.5), smoothstep(0.0, 0.08, e));
}
@fragment fn fs(i: VOut) -> GOut {
  let p = i.wp;
  var n = normalize(i.n);
  let face = i.sa.z;
  let s = i.sa.x;
  var albedo = vec3f(0.10, 0.098, 0.092);
  var rough = 0.55; var wet = 0.85;
  if (face < 0.5) {
    // retaining wall: coursed granite, darker and mossy toward the waterline, rain streaks
    let b = blocks(vec2f(s, p.y), vec2f(1.3, 0.55));
    albedo *= (0.75 + 0.4 * b.y) * (1.0 - 0.6 * b.x);
    let streak = smoothstep(0.6, 0.9, hash21(vec2f(floor(s * 1.7), 7.0))) * smoothstep(${DECK_Y}, 2.0, p.y);
    albedo *= 1.0 - 0.35 * streak;
    let wl = 1.0 - smoothstep(0.0, 1.6, p.y);
    albedo = mix(albedo, vec3f(0.03, 0.04, 0.025), wl * 0.85);
    n = normalize(n + vec3f(0.0, (b.z - 1.0) * 0.4, 0.0));
    rough = mix(0.6, 0.35, wl);
  } else if (face < 1.5) {
    // parapet coping: lighter dressed stone
    let b = blocks(vec2f(s, i.sa.y * 3.0), vec2f(1.8, 10.0));
    albedo = vec3f(0.13, 0.125, 0.118) * (0.85 + 0.3 * b.y) * (1.0 - 0.5 * b.x);
    rough = 0.5;
  } else {
    // promenade: large pavers with a drainage strip, puddles
    let b = blocks(vec2f(s, i.sa.y), vec2f(1.2, 0.8));
    albedo = vec3f(0.085, 0.082, 0.078) * (0.8 + 0.4 * b.y) * (1.0 - 0.45 * b.x);
    let pc = vec2f(s / 4.0, i.sa.y / 2.2);
    let pf = fract(pc) - 0.5;
    let pud = step(0.62, hash21(floor(pc) + 3.0)) * (1.0 - smoothstep(0.25, 0.42, length(pf * vec2f(1.0, 1.3) + vec2f(sin(s * 1.3), cos(s * 0.9)) * 0.05)));
    rough = mix(0.45, 0.02, pud);
    albedo *= mix(1.0, 0.6, pud);
    wet = mix(0.85, 1.0, pud);
  }
  // analytic globe-lamp pools beyond the real-light range
  var emis = vec3f(0.0);
  let dist = distance(p, F.camPos.xyz);
  if (dist > BU.x * 0.7) {
    let k = floor(s / ${LAMP_SP}.0);
    for (var j = 0; j < 2; j++) {
      let ls = (k + f32(j)) * ${LAMP_SP}.0 + ${LAMP_SP / 2}.0;
      let dd = vec3f(s - ls, p.y - (${DECK_Y} + 3.3), i.sa.y - 0.55);
      let d2 = dot(dd, dd);
      let fake = smoothstep(BU.x * 0.75, BU.x, dist);
      let x = sqrt(d2) / 12.0;
      let fall = saturate(1.0 - x * x * x * x);
      emis += albedo * vec3f(1.0, 0.62, 0.3) * 30.0 * fall * fall / (d2 + 1.0) * fake * 0.3;
    }
  }
  return gbuf(albedo, rough, n, 0.0, emis, 1.0, motionVector(p, p), 4.0, wet);
}

// globe lamps: thin post + emissive globe
struct LOut { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) e: f32 };
@group(1) @binding(1) var<storage, read> lampPos: array<vec4f>;
@vertex fn vsLamp(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) e: f32, @builtin(instance_index) ii: u32) -> LOut {
  let L = lampPos[ii];
  var o: LOut;
  o.wp = L.xyz + p; o.n = n; o.e = e;
  o.pos = F.viewProj * vec4f(o.wp, 1.0);
  return o;
}
@fragment fn fsLamp(i: LOut) -> GOut {
  let em = vec3f(1.0, 0.66, 0.34) * 9.0 * i.e;
  return gbuf(mix(vec3f(0.03), vec3f(0.6), i.e), 0.4, normalize(i.n), 0.6 * (1.0 - i.e), em, 1.0, motionVector(i.wp, i.wp), 0.0, 0.7);
}
`;

function lampMesh() {
  const P = [], I = [];
  const seg = 6;
  // post
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2, b = P.length / 7;
    const r = 0.05, h = 3.0, nx = Math.cos((a0 + a1) / 2), nz = Math.sin((a0 + a1) / 2);
    P.push(Math.cos(a0) * r, 0, Math.sin(a0) * r, nx, 0, nz, 0, Math.cos(a1) * r, 0, Math.sin(a1) * r, nx, 0, nz, 0,
      Math.cos(a1) * r, h, Math.sin(a1) * r, nx, 0, nz, 0, Math.cos(a0) * r, h, Math.sin(a0) * r, nx, 0, nz, 0);
    I.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  // globe (octahedron subdivided once)
  const c = [0, 3.3, 0], R = 0.3;
  const oct = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const faces = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [0, 4, 3], [4, 1, 3], [1, 5, 3], [5, 0, 3]];
  for (const [a, b2, d] of faces) {
    const base = P.length / 7;
    for (const v of [oct[a], oct[b2], oct[d]]) P.push(c[0] + v[0] * R, c[1] + v[1] * R, c[2] + v[2] * R, v[0], v[1], v[2], 1);
    I.push(base, base + 1, base + 2);
  }
  // fix winding against normals
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 7, b = I[t + 1] * 7, d = I[t + 2] * 7;
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[d] - P[a], P[d + 1] - P[a + 1], P[d + 2] - P[a + 2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (cr[0] * (P[a + 3] + P[b + 3] + P[d + 3]) + cr[1] * (P[a + 4] + P[b + 4] + P[d + 4]) + cr[2] * (P[a + 5] + P[b + 5] + P[d + 5]) < 0) { const s = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = s; }
  }
  return { verts: new Float32Array(P), idx: new Uint16Array(I) };
}

export class Embankments {
  init(ctx) {
    const d = ctx.device, world = ctx.world;
    // offset polylines along every river bank, kept where the bank is urban and really at the shore
    const runs = [];
    const gi = DISTRICTS.findIndex((D) => D.type === DT.GARDEN);
    for (const R of RIVERS) {
      if (R.name === 'Garden Canal') continue;
      const pts = catmullRom(R.points, 24);
      for (const side of [-1, 1]) {
        let run = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)];
          let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
          const nx = -tz * side, nz = tx * side;
          const hw = pts[i][2] / 2;
          const x = pts[i][0] + nx * (hw + WALL_D), z = pts[i][1] + nz * (hw + WALL_D);
          // urban banks: everywhere inside the city basin except the garden district
          const urban = Math.hypot(x - 300, (z + 300) * 0.92) < 4300 && world.districtWeight(gi, x, z) < 0.15;
          const wd = world.waterDist(x, z);
          const ok = urban && Math.abs(wd - WALL_D) < 1.5 && Math.abs(x) < 6000 && Math.abs(z) < 6000 && world.heightAt(x + nx * 8, z + nz * 8) > 4;
          if (ok) run.push([x, z, nx, nz]);
          else { if (run.length > 3) runs.push(run); run = []; }
        }
        if (run.length > 3) runs.push(run);
      }
    }
    world.shared.embankments = runs;
    // extrude profile: wall face, parapet (front, top, back), promenade deck, back drop
    const V = [], I = [];
    const lamps = [];
    this.colliders = 0;
    const prof = [  // [across0, y0, across1, y1, face]
      [0, -3.0, 0, DECK_Y + PARA_H, 0],
      [0, DECK_Y + PARA_H, PARA_T, DECK_Y + PARA_H, 1],
      [PARA_T, DECK_Y + PARA_H, PARA_T, DECK_Y, 1],
      [PARA_T, DECK_Y, DECK_W, DECK_Y, 2],
      [DECK_W, DECK_Y, DECK_W, DECK_Y - 1.5, 0],
    ];
    for (const run of runs) {
      // arc length
      const S = [0];
      for (let i = 1; i < run.length; i++) S.push(S[i - 1] + Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]));
      for (const [a0, y0, a1, y1, face] of prof) {
        const ex = a1 - a0, ey = y1 - y0;
        const base = V.length / 9;
        for (let i = 0; i < run.length; i++) {
          const [x, z, nx, nz] = run[i];
          // profile normal: across direction points away from the water (+n); face normal in (across, y)
          const fnA = -ey, fnY = ex; const fl = Math.hypot(fnA, fnY) || 1;
          const na = fnA / fl, ny = fnY / fl;
          for (const [a, y] of [[a0, y0], [a1, y1]]) V.push(x + nx * a, y, z + nz * a, nx * na, ny, nz * na, S[i], a, face);
        }
        for (let i = 0; i < run.length - 1; i++) {
          const k = base + i * 2;
          I.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
        }
      }
      // lamps every LAMP_SP along the parapet, colliders per ~16 m
      for (let s = LAMP_SP / 2; s < S[S.length - 1]; s += LAMP_SP) {
        let i = 1; while (i < S.length - 1 && S[i] < s) i++;
        const t = (s - S[i - 1]) / (S[i] - S[i - 1] || 1);
        const x = run[i - 1][0] + (run[i][0] - run[i - 1][0]) * t, z = run[i - 1][1] + (run[i][1] - run[i - 1][1]) * t;
        const nx = run[i][2], nz = run[i][3];
        lamps.push(x + nx * 0.55, DECK_Y, z + nz * 0.55);
      }
      for (let i = 0; i < run.length - 1; i += 2) {
        const j = Math.min(i + 2, run.length - 1);
        const ax = run[i][0], az = run[i][1], bx = run[j][0], bz = run[j][1];
        const nx = (run[i][2] + run[j][2]) / 2, nz = (run[i][3] + run[j][3]) / 2;
        const len = Math.hypot(bx - ax, bz - az); if (len < 0.5) continue;
        const ang = Math.atan2(bz - az, bx - ax);
        const cx = (ax + bx) / 2, cz = (az + bz) / 2;
        // deck
        world.addCollider(cx + nx * (DECK_W + PARA_T) / 2, (DECK_Y - 4) / 2, cz + nz * (DECK_W + PARA_T) / 2, len / 2 + 0.3, (DECK_Y + 4) / 2, (DECK_W - PARA_T) / 2, ang);
        // parapet
        world.addCollider(cx + nx * PARA_T / 2, (DECK_Y + PARA_H - 4) / 2, cz + nz * PARA_T / 2, len / 2 + 0.3, (DECK_Y + PARA_H + 4) / 2, PARA_T / 2 + 0.05, ang);
        this.colliders += 2;
      }
    }
    // winding: make triangles face along their normals
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 9, b = I[t + 1] * 9, c = I[t + 2] * 9;
      const e1 = [V[b] - V[a], V[b + 1] - V[a + 1], V[b + 2] - V[a + 2]], e2 = [V[c] - V[a], V[c + 1] - V[a + 1], V[c + 2] - V[a + 2]];
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (cr[0] * V[a + 3] + cr[1] * V[a + 4] + cr[2] * V[a + 5] < 0) { const s = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = s; }
    }
    this.indexCount = I.length;
    this.vbuf = d.createBuffer({ size: Math.max(V.length, 9) * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.vbuf, 0, new Float32Array(V));
    this.ibuf = d.createBuffer({ size: Math.max(I.length, 3) * 4, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.ibuf, 0, new Uint32Array(I));
    // lamps
    this.lampCount = lamps.length / 3;
    const lp = new Float32Array(Math.max(this.lampCount, 1) * 4);
    for (let i = 0; i < this.lampCount; i++) lp.set([lamps[i * 3], lamps[i * 3 + 1], lamps[i * 3 + 2], 0], i * 4);
    this.lampData = lp;
    this.lampBuf = d.createBuffer({ size: lp.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.lampBuf, 0, lp);
    const m = lampMesh();
    this.lvbuf = d.createBuffer({ size: m.verts.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.lvbuf, 0, m.verts);
    this.libuf = d.createBuffer({ size: Math.ceil(m.idx.byteLength / 4) * 4, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.libuf, 0, m.idx.buffer, 0, Math.ceil(m.idx.byteLength / 4) * 4);
    this.lIndexCount = m.idx.length;

    this.ubuf = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.u = new Float32Array(4);
    this.layout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
    ] });
    this.group = d.createBindGroup({ layout: this.layout, entries: [{ binding: 0, resource: { buffer: this.ubuf } }, { binding: 1, resource: { buffer: this.lampBuf } }] });
    const r = ctx.renderer;
    this.pipe = r.gbufferPipeline({ label: 'embankment', code: BANK_WGSL, groups: [this.layout], buffers: [{ arrayStride: 36, attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'float32x3' }] }] });
    this.lampPipe = r.gbufferPipeline({ label: 'embankment-lamps', code: BANK_WGSL, vs: 'vsLamp', fs: 'fsLamp', groups: [this.layout], buffers: [{ arrayStride: 28, attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'float32' }] }] });
    // real lights for the nearest lamps
    this.maxLights = ctx.quality.level >= 2 ? 160 : 90;
    this.lightBase = ctx.lights.reserve(this.maxLights);
    this.dist = new Float32Array(this.lampCount);
    this.order = new Uint32Array(this.lampCount);
    this.hist = new Uint32Array(64);
    this.range = 200;
    this.lastK = 0;
  }

  update(ctx) {
    const c = ctx.cam, L = ctx.lights, P = this.lampData, n = this.lampCount;
    const hist = this.hist; hist.fill(0);
    for (let i = 0; i < n; i++) {
      const dx = P[i * 4] - c.x, dy = P[i * 4 + 1] + 3.3 - c.y, dz = P[i * 4 + 2] - c.z;
      const dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
      this.dist[i] = dd;
      const b = (dd / 8) | 0; if (b < 64) hist[b]++;
    }
    let acc = 0, R = 500;
    for (let b = 0; b < 64; b++) { acc += hist[b]; if (acc > this.maxLights) { R = b * 8; break; } }
    R = Math.max(R, 40);
    let k = 0;
    for (let i = 0; i < n && k < this.maxLights; i++) {
      const dd = this.dist[i];
      if (dd >= R) continue;
      const t = Math.min(Math.max((dd - R * 0.75) / (R * 0.25), 0), 1);
      const f = (1 - t * t * (3 - 2 * t)) * 30;
      L.set(this.lightBase + k, P[i * 4], P[i * 4 + 1] + 3.3, P[i * 4 + 2], 12, f, f * 0.62, f * 0.3, 0);
      k++;
    }
    for (let j = k; j < this.lastK; j++) L.set(this.lightBase + j, 0, -1e5, 0, 0, 0, 0, 0, 0);
    this.lastK = k;
    this.u[0] = R;
    ctx.device.queue.writeBuffer(this.ubuf, 0, this.u);
  }

  drawEarly(ctx, pass) {
    if (!this.indexCount) return;
    pass.setPipeline(this.pipe);
    pass.setBindGroup(1, this.group);
    pass.setVertexBuffer(0, this.vbuf);
    pass.setIndexBuffer(this.ibuf, 'uint32');
    pass.drawIndexed(this.indexCount);
    if (this.lampCount) {
      pass.setPipeline(this.lampPipe);
      pass.setVertexBuffer(0, this.lvbuf);
      pass.setIndexBuffer(this.libuf, 'uint16');
      pass.drawIndexed(this.lIndexCount, this.lampCount);
    }
  }
}

