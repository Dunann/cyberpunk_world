// Vegetation: GPU-driven instanced trees.
//  - Forest: scattered every frame on the GPU in two rings around the camera (dense near ring, sparse big
//    "clump" trees in the far ring), driven by the terrain's baked forest mask. Beyond that the terrain's
//    canopy shading takes over. Avoids water, roads, building lots, landmarks, bridges and transit lines.
//  - Fixed trees: street trees along some avenues (validated on the GPU with the street-layout rules) and
//    trees provided by the garden module (world.shared.gardenTrees: willows, etc.).
//  - One compute pass does placement + frustum culling + LOD selection into indirect draw lists
//    (4 species x 3 LODs). Wind sway is animated in the vertex shader with proper motion vectors.
//  - The vegetation gbuffer hook also draws the terrain ground right after the trees (see terrain.js).

import { buildTreeMeshes, SPECIES, LODS } from './vegMeshes.js';
import { THEIGHT_WGSL, STREET_WGSL } from './terrainShade.js';
import { LANDMARKS, BRIDGES, ROUTES, CABLEWAY, MONORAIL_STATION, DISTRICTS } from './world.js';
import { TERRAIN, INFO } from './common.js';
import { rng } from './math.js';

const LISTS = SPECIES * LODS;
const CAP = 32768;               // instances per list
const MASK_RES = INFO.RES;       // 6 m texels over the near map

const VEG_COMMON = /* wgsl */ `
struct Tree { a: vec4f, b: vec4f };   // a: x, y, z, scale   b: rotation, hash, species, fade
`;

const SCATTER_WGSL = /* wgsl */ `
${VEG_COMMON}
struct VegU { ringA: vec4f, ringB: vec4f, p: vec4f, lod: vec4f };
@group(1) @binding(0) var<storage, read_write> args: array<atomic<u32>, ${LISTS * 10}>;
@group(1) @binding(1) var<storage, read_write> outT: array<Tree>;
@group(1) @binding(2) var<storage, read> fixedT: array<Tree>;
@group(1) @binding(3) var nearN: texture_2d<f32>;
@group(1) @binding(4) var farN: texture_2d<f32>;
@group(1) @binding(5) var farH: texture_2d<f32>;
@group(1) @binding(6) var vmask: texture_2d<f32>;
@group(1) @binding(7) var<uniform> VU: VegU;
@group(1) @binding(8) var lsamp: sampler;
${THEIGHT_WGSL}

const CAP = ${CAP}u;

fn inFrustum(c: vec3f, r: f32) -> bool {
  let d = c - F.camPos.xyz;
  let z = dot(d, F.camFwd.xyz);
  if (z < -r) { return false; }
  let ty = F.camRight.w * 1.03; let tx = ty * F.camUp.w;
  if ((abs(dot(d, F.camRight.xyz)) - z * tx) * inverseSqrt(1.0 + tx * tx) > r) { return false; }
  if ((abs(dot(d, F.camUp.xyz)) - z * ty) * inverseSqrt(1.0 + ty * ty) > r) { return false; }
  return true;
}

fn emit(t: Tree, list: u32) {
  let k = atomicAdd(&args[list * 5u + 1u], 1u);
  if (k < CAP) { outT[list * CAP + k] = t; }
}

fn lodOf(d: f32) -> u32 { return select(select(2u, 1u, d < VU.lod.y), 0u, d < VU.lod.x); }

fn place(p: vec2f, h4: vec4f, far: bool) {
  let wN = nearWeight(p);
  var N: vec4f;
  if (wN > 0.5) { N = textureSampleLevel(nearN, lsamp, (p - T_ORIGIN) / T_SIZE, 0.0); }
  else { N = textureSampleLevel(farN, lsamp, (p - FAR_ORIGIN) / FAR_SIZE, 0.0); }
  // clumpy stands with small clearings, so the canopy does not read as a regular grid
  let forest = N.a * (0.45 + 0.75 * vnoise2(p * 0.03 + 3.7));
  if (h4.z > forest * VU.p.z) { return; }
  let h = tHeight(p);
  if (h < 1.6) { return; }
  if (wN > 0.5) {
    let mt = vec2i((p - T_ORIGIN) / T_SIZE * ${MASK_RES}.0);
    if (textureLoad(vmask, clamp(mt, vec2i(0), vec2i(${MASK_RES - 1})), 0).r > 0.5) { return; }
    let info = worldInfo(p);
    if (info.x < 6.0) { return; }
    if (roadMask(p) > 0.02) { return; }
  }
  let d = distance(vec3f(p.x, h, p.y), F.camPos.xyz);
  // species
  let bam = smoothstep(0.72, 0.8, vnoise2(p * 0.006 + 5.0)) * (1.0 - smoothstep(110.0, 180.0, h));
  let pin = smoothstep(260.0, 520.0, h + (vnoise2(p * 0.003) - 0.5) * 420.0);
  var sp = 0u;
  if (h4.w < pin) { sp = 1u; }
  if (h4.w > 1.0 - bam) { sp = 2u; }
  var s = mix(0.7, 1.5, fract(h4.z * 7.31 + h4.w * 3.7));
  if (sp == 2u) { s = mix(0.8, 1.15, h4.x); }
  // ring fades (scale-in / scale-out so transitions never pop)
  var fade = 1.0;
  var lod = lodOf(d);
  if (far) {
    fade = smoothstep(VU.p.x - 140.0, VU.p.x, d) * (1.0 - smoothstep(VU.p.y - 350.0, VU.p.y, d));
    s *= 1.65;
    lod = 3u;
  } else {
    fade = 1.0 - smoothstep(VU.p.x - 140.0, VU.p.x, d);
    // density LOD: thin out distant trees and grow the survivors so canopy coverage stays the same
    let keep = clamp(pow(210.0 / d, 2.0), 0.2, 1.0);
    if (fract(h4.x * 13.7 + h4.y * 5.3) > keep) { return; }
    s *= min(inverseSqrt(keep), 1.75);
  }
  s *= fade;
  if (s < 0.05) { return; }
  let ht = select(11.0, 14.0, sp == 1u) * s;
  if (!inFrustum(vec3f(p.x, h + ht * 0.55, p.y), ht * 0.7 + 2.0)) { return; }
  var t: Tree;
  t.a = vec4f(p.x, h - 0.3, p.y, s);
  t.b = vec4f(h4.x * TAU, h4.y, f32(sp), fade);
  emit(t, sp * ${LODS}u + lod);
}

// Square spiral around the camera cell: thread order = near to far, so the appended instances are roughly
// sorted front-to-back and early-z rejects hidden trees (tree cost is dominated by overdraw).
fn spiral(i: u32) -> vec2i {
  if (i == 0u) { return vec2i(0); }
  var k = i32(ceil((sqrt(f32(i) + 1.0) - 1.0) * 0.5));
  if ((2 * k + 1) * (2 * k + 1) <= i32(i)) { k += 1; }
  if ((2 * k - 1) * (2 * k - 1) > i32(i)) { k -= 1; }
  let j = i32(i) - (2 * k - 1) * (2 * k - 1);
  let side = j / (2 * k);
  let o = j % (2 * k);
  if (side == 0) { return vec2i(k, -k + 1 + o); }
  if (side == 1) { return vec2i(k - 1 - o, k); }
  if (side == 2) { return vec2i(-k, k - 1 - o); }
  return vec2i(-k + 1 + o, -k);
}

@compute @workgroup_size(64)
fn scatterNear(@builtin(global_invocation_id) id: vec3u) {
  let K = u32(VU.ringA.w);
  if (id.x >= (2u * K + 1u) * (2u * K + 1u)) { return; }
  let c = VU.ringA.xy + vec2f(spiral(id.x));
  let cell = c * VU.ringA.z;
  let h = vec4f(hash22(c), hash22(c + 71.3));
  place(cell + (0.1 + 0.8 * h.xy) * VU.ringA.z, h, false);
}

@compute @workgroup_size(64)
fn scatterFar(@builtin(global_invocation_id) id: vec3u) {
  let K = u32(VU.ringB.w);
  if (id.x >= (2u * K + 1u) * (2u * K + 1u)) { return; }
  let c = VU.ringB.xy + vec2f(spiral(id.x));
  let cell = c * VU.ringB.z;
  let mid = cell + VU.ringB.z * 0.5 - F.camPos.xz;
  if (dot(mid, mid) < (VU.p.x - 200.0) * (VU.p.x - 200.0)) { return; }
  let h = vec4f(hash22(c + 9000.0), hash22(c + 9071.3));
  place(cell + (0.1 + 0.8 * h.xy) * VU.ringB.z, h, true);
}

@compute @workgroup_size(64)
fn cullFixed(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(VU.p.w)) { return; }
  var t = fixedT[id.x];
  let d = distance(t.a.xyz, F.camPos.xyz);
  if (d > VU.lod.z) { return; }
  let s = t.a.w;
  if (!inFrustum(t.a.xyz + vec3f(0.0, 6.0 * s, 0.0), 9.0 * s)) { return; }
  t.b.w = 1.0;
  emit(t, u32(t.b.z) * ${LODS}u + lodOf(d));
}

@compute @workgroup_size(${LISTS})
fn clampArgs(@builtin(local_invocation_index) i: u32) {
  let c = min(atomicLoad(&args[i * 5u + 1u]), CAP);
  atomicStore(&args[i * 5u + 1u], c);
  atomicStore(&args[(i + ${LISTS}u) * 5u + 1u], c);   // card draw of the same list
}
`;

const TREE_DRAW_WGSL = /* wgsl */ `
${VEG_COMMON}
@group(1) @binding(0) var<storage, read> trees: array<Tree>;
@group(1) @binding(1) var tNoise: texture_2d<f32>;
@group(1) @binding(2) var sRep: sampler;
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) @interpolate(flat) info: vec4f,   // species, hash, part, base y
  @location(3) mv: vec2f,
  @location(4) lp: vec3f,
  @location(5) uv: vec2f,
};

fn swayOff(t: f32, ph: f32, amp: f32) -> vec2f {
  let w = vec2f(F.misc.z, F.misc.w);
  let g = 0.6 + 0.4 * sin(t * 0.35 + ph * 0.2);
  return (w * (0.6 + 0.4 * sin(t * 1.1 + ph)) * g + vec2f(sin(t * 2.3 + ph * 1.7), cos(t * 1.9 + ph * 1.3)) * 0.25) * amp;
}

@vertex fn vs(@location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) uv: vec2f, @location(3) part: f32, @location(4) sway: f32, @builtin(instance_index) ii: u32) -> VOut {
  let T = trees[ii];
  let s = T.a.w;
  let r = rot2(T.b.x);
  let lxz = r * pos.xz;
  let local = vec3f(lxz.x, pos.y, lxz.y) * s;
  let sp = T.b.z;
  let amp = select(select(0.3, 0.8, sp == 2.0), 0.55, sp == 3.0) * sway * s;
  let ph = T.b.y * 40.0 + T.a.x * 0.02;
  let t = time();
  let o0 = swayOff(t, ph, amp);
  let o1 = swayOff(t - F.camFwd.w, ph, amp);
  // leaf flutter on cards
  let fl = select(0.0, 0.06, part > 1.5) * sway;
  let f0 = sin(t * 7.0 + ph + pos.y * 2.0) * fl;
  let f1 = sin((t - F.camFwd.w) * 7.0 + ph + pos.y * 2.0) * fl;
  let base = T.a.xyz + local;
  let wp = base + vec3f(o0.x + f0, -0.1 * dot(o0, o0), o0.y);
  let pwp = base + vec3f(o1.x + f1, -0.1 * dot(o1, o1), o1.y);
  var o: VOut;
  o.wp = wp;
  let nxz = r * nrm.xz;
  o.n = vec3f(nxz.x, nrm.y, nxz.y);
  o.info = vec4f(sp, T.b.y, part, T.a.y);
  o.mv = motionVector(wp, pwp);
  o.lp = pos;
  o.uv = uv;
  o.pos = F.viewProj * vec4f(wp, 1.0);
  return o;
}

// Alpha-tested leaf cards (separate pipeline so the opaque parts keep full early-z).
@fragment fn fs(i: VOut, @builtin(front_facing) ff: bool) -> GOut {
  let dUx = dpdx(i.uv); let dUy = dpdy(i.uv);
  let hsh = i.info.y;
  let k = 0.3;
  let q = i.uv * k + vec2f(hsh * 0.37 + i.lp.x * 0.05, hsh * 0.71 + i.lp.z * 0.05);
  let N = textureSampleGrad(tNoise, sRep, q, dUx * k, dUy * k);
  let m = N.g * 1.3 + N.b * 0.45 - length(i.uv) * 0.9;
  if (m < 0.42) { discard; }
  return shadeTree(i, ff, vec4f(N.rgb, saturate((m - 0.42) * 4.0)), vec2f(0.0), vec2f(0.0));
}
@fragment fn fsOpaque(i: VOut, @builtin(front_facing) ff: bool) -> GOut {
  let dLx = dpdx(i.lp.xz) * 0.12; let dLy = dpdy(i.lp.xz) * 0.12;
  return shadeTree(i, ff, vec4f(0.0), dLx, dLy);
}
fn shadeTree(i: VOut, ff: bool, card: vec4f, dLx: vec2f, dLy: vec2f) -> GOut {
  let sp = i.info.x; let hsh = i.info.y; let part = i.info.z;
  var n = normalize(i.n);
  var albedo: vec3f; var rough = 0.7; var mat = 1.0; var ao = 1.0;
  if (part < 0.5) {
    if (!ff) { n = -n; }
    // bark / bamboo culm
    albedo = select(vec3f(0.05, 0.04, 0.032), vec3f(0.075, 0.08, 0.035), sp == 2.0);
    let ring = sin(i.wp.y * select(9.0, 2.2, sp == 2.0)) * 0.5 + 0.5;
    albedo *= 0.75 + 0.35 * ring;
    rough = select(0.8, 0.4, sp == 2.0);
    mat = 0.0;
    ao = 0.75;
  } else {
    var leaf = 0.5;
    if (part > 1.5) {
      leaf = card.a;
      n = normalize(n + vec3f(card.r - 0.5, 0.0, card.b - 0.5) * 0.9);
    } else {
      if (!ff) { n = -n; }
      let q = i.lp.xz * 0.12 + i.lp.y * 0.05 + hsh;
      let N = textureSampleGrad(tNoise, sRep, q, dLx, dLy);
      n = normalize(n + vec3f(N.r - 0.5, N.g - 0.5, N.b - 0.5) * 1.2);
      leaf = N.g;
    }
    let base = array<vec3f, 4>(vec3f(0.055, 0.088, 0.034), vec3f(0.032, 0.058, 0.040), vec3f(0.075, 0.105, 0.036), vec3f(0.080, 0.105, 0.040));
    albedo = base[u32(sp)];
    albedo *= mix(vec3f(0.85, 1.0, 0.9), vec3f(1.2, 1.1, 0.78), fract(hsh * 13.7));
    albedo *= 0.7 + 0.6 * leaf;
    // self-shadowing: darker toward the inside and the bottom of the crown
    let h = (i.wp.y - i.info.w) / max(select(13.0, 14.0, sp == 1.0), 1.0);
    ao = saturate(0.3 + 0.8 * saturate(h - 0.25)) * mix(0.55, 1.0, saturate(n.y * 0.5 + 0.5)) * select(0.7 + 0.3 * leaf, 0.6, part < 1.5);
    rough = 0.72;
  }
  return gbuf(albedo, rough, n, 0.0, vec3f(0.0), ao, i.mv, mat, select(0.3, 0.6, mat == 0.0));
}
`;

// ---------------------------------------------------------------- CPU: exclusion mask

function buildMask(world) {
  const R = MASK_RES, S = TERRAIN.SIZE / R, O = TERRAIN.ORIGIN;
  const m = new Uint8Array(R * R);
  const stampRect = (cx, cz, hw, hd, ang, pad) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    const ex = Math.abs(c) * (hw + pad) + Math.abs(s) * (hd + pad), ez = Math.abs(s) * (hw + pad) + Math.abs(c) * (hd + pad);
    const i0 = Math.max(0, Math.floor((cx - ex - O) / S)), i1 = Math.min(R - 1, Math.ceil((cx + ex - O) / S));
    const j0 = Math.max(0, Math.floor((cz - ez - O) / S)), j1 = Math.min(R - 1, Math.ceil((cz + ez - O) / S));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = O + (i + 0.5) * S - cx, z = O + (j + 0.5) * S - cz;
      const lx = x * c + z * s, lz = -x * s + z * c;
      if (Math.abs(lx) <= hw + pad && Math.abs(lz) <= hd + pad) m[j * R + i] = 255;
    }
  };
  const stampCircle = (cx, cz, r) => stampRect(cx, cz, r * 0.85, r * 0.85, Math.PI / 4, 0) || stampRect(cx, cz, r * 0.85, r * 0.85, 0, 0);
  const stampLine = (ax, az, bx, bz, r) => {
    const L = Math.hypot(bx - ax, bz - az); if (L < 1e-3) return;
    stampRect((ax + bx) / 2, (az + bz) / 2, L / 2, r, Math.atan2(bz - az, bx - ax), 0);
  };
  for (const L of world.lots) stampRect(L.x, L.z, L.w / 2, L.d / 2, L.angle, 2);
  for (const L of LANDMARKS) if (L.r > 0) { stampCircle(L.x, L.z, L.r + 10); stampRect(L.x, L.z, L.r + 10, L.r + 10, 0, 0); }
  for (const b of BRIDGES) stampLine(b.ax, b.az, b.bx, b.bz, b.width * 0.5 + 10);
  for (const r of ROUTES) for (let i = 1; i < r.dense.length; i++) stampLine(r.dense[i - 1].x, r.dense[i - 1].z, r.dense[i].x, r.dense[i].z, 9);
  stampLine(CABLEWAY.ax, CABLEWAY.az, CABLEWAY.bx, CABLEWAY.bz, 12);
  stampRect(MONORAIL_STATION.x, MONORAIL_STATION.z, 50, 50, 0, 0);
  for (const g of world.shared.gardenReserve || []) stampRect(g.x, g.z, g.hw, g.hd, g.angle || 0, 2);
  for (const run of world.shared.embankments || []) for (let i = 1; i < run.length; i++) {
    const a = run[i - 1], b = run[i];
    stampLine(a[0] + a[2] * 6, a[1] + a[3] * 6, b[0] + b[2] * 6, b[1] + b[3] * 6, 9);
  }
  return m;
}

// Street tree slots on wide avenues (validated on the GPU like the lamps).
const STREET_TREE_WGSL = /* wgsl */ `
${STREET_WGSL}
@group(1) @binding(0) var<storage, read> cands: array<vec4f>;      // di, axis, line, slot (quarter lamp spacing units)
@group(1) @binding(1) var<storage, read_write> outT: array<vec4f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&cands)) { return; }
  let c = cands[i];
  let di = i32(c.x);
  let D = W.d[di];
  let blk = D.b.y; let hw = D.b.z * 0.5;
  let sp = blk / lampCount(blk);
  let along = c.w * sp * 0.5 + sp * 0.25;
  let side = select(-1.0, 1.0, fract(c.w * 0.5) > 0.25);
  let off = c.z * blk + side * (hw + 1.9);
  let lp = select(vec2f(along, off), vec2f(off, along), c.y > 0.5);
  let p = rot2(D.b.x) * lp + D.a.xy;
  // distance to the nearest intersection along the road
  let ia = abs(along - round(along / blk) * blk);
  var ok = lampValid(p, di) && ia > hw + 7.0;
  let n = terrainNormal(p, 3.0);
  let h = terrainHeight(p);
  if (n.y < 0.85 || h < 3.0) { ok = false; }
  outT[i] = vec4f(p.x, h, p.y, select(0.0, 1.0, ok));
}
`;

export default {
  name: 'vegetation',

  async init(ctx) {
    const d = ctx.device, r = ctx.renderer, world = ctx.world;
    const T = world.shared.terrain;
    if (!T) throw new Error('vegetation needs the terrain module');
    const q = ctx.quality.level;
    this.density = q >= 2 ? 1.0 : q === 1 ? 0.75 : 0.5;
    this.RA = q >= 2 ? 650 : 480;
    this.RB = q >= 2 ? 2100 : 1600;
    this.cellA = 6.2; this.cellB = 20;
    this.KA = Math.ceil(this.RA / this.cellA) + 1;
    this.KB = Math.ceil(this.RB / this.cellB) + 1;

    // meshes
    const M = buildTreeMeshes();
    this.vbuf = d.createBuffer({ size: M.verts.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.vbuf, 0, M.verts);
    this.ibuf = d.createBuffer({ size: M.idx.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.ibuf, 0, M.idx);
    // args: LISTS opaque draws, then LISTS card draws (same instance counts, written by clampArgs)
    this.argsInit = new Uint32Array(LISTS * 10);
    this.hasCards = M.draws.map((dr) => dr[3] > 0);
    M.draws.forEach(([of, oc, cf, cc], k) => { this.argsInit.set([oc, 0, of, 0, 0], k * 5); this.argsInit.set([cc, 0, cf, 0, 0], (LISTS + k) * 5); });
    this.argsBuf = d.createBuffer({ size: this.argsInit.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
    // debug: instance counts per list (dev tools)
    window.__vegCounts = async () => {
      const rb = d.createBuffer({ size: this.argsInit.byteLength, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      const e = d.createCommandEncoder(); e.copyBufferToBuffer(this.argsBuf, 0, rb, 0, this.argsInit.byteLength); d.queue.submit([e.finish()]);
      await rb.mapAsync(GPUMapMode.READ); const a = new Uint32Array(rb.getMappedRange().slice(0)); rb.destroy();
      const out = []; for (let k = 0; k < LISTS; k++) out.push(a[k * 5 + 1]); return out;
    };
    this.instBuf = d.createBuffer({ size: LISTS * CAP * 32, usage: GPUBufferUsage.STORAGE });

    // exclusion mask
    const mask = buildMask(world);
    this.maskTex = d.createTexture({ size: [MASK_RES, MASK_RES], format: 'r8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    d.queue.writeTexture({ texture: this.maskTex }, mask, { bytesPerRow: MASK_RES }, [MASK_RES, MASK_RES]);

    // fixed trees: street avenues + garden
    const fixed = await this._streetTrees(ctx);
    for (const g of world.shared.gardenTrees || []) fixed.push(g);
    this.nFixed = fixed.length;
    const fd = new Float32Array(Math.max(fixed.length, 1) * 8);
    const R = rng(4242);
    fixed.forEach((t, i) => fd.set([t[0], t[1] - 0.2, t[2], t[3], R() * Math.PI * 2, R(), t[4], 1], i * 8));
    this.fixedBuf = d.createBuffer({ size: fd.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.fixedBuf, 0, fd);

    this.vu = new Float32Array(16);
    this.vuBuf = d.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const C = GPUShaderStage.COMPUTE;
    this.cLayout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: C, buffer: { type: 'storage' } },
      { binding: 1, visibility: C, buffer: { type: 'storage' } },
      { binding: 2, visibility: C, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: C, texture: { sampleType: 'float' } },
      { binding: 4, visibility: C, texture: { sampleType: 'float' } },
      { binding: 5, visibility: C, texture: { sampleType: 'unfilterable-float' } },
      { binding: 6, visibility: C, texture: { sampleType: 'float' } },
      { binding: 7, visibility: C, buffer: { type: 'uniform' } },
      { binding: 8, visibility: C, sampler: { type: 'filtering' } },
    ] });
    this.cGroup = d.createBindGroup({ layout: this.cLayout, entries: [
      { binding: 0, resource: { buffer: this.argsBuf } },
      { binding: 1, resource: { buffer: this.instBuf } },
      { binding: 2, resource: { buffer: this.fixedBuf } },
      { binding: 3, resource: T.nearN.createView() },
      { binding: 4, resource: T.farN.createView() },
      { binding: 5, resource: T.farH.createView() },
      { binding: 6, resource: this.maskTex.createView() },
      { binding: 7, resource: { buffer: this.vuBuf } },
      { binding: 8, resource: d.createSampler({ magFilter: 'linear', minFilter: 'linear' }) },
    ] });
    const mk = (entry) => r.computePipeline({ label: 'veg-' + entry, code: SCATTER_WGSL, entry, groups: [this.cLayout] });
    this.pNear = mk('scatterNear'); this.pFar = mk('scatterFar'); this.pFixed = mk('cullFixed'); this.pClamp = mk('clampArgs');

    this.dLayout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ] });
    this.dGroups = [];
    for (let k = 0; k < LISTS; k++) {
      this.dGroups.push(d.createBindGroup({ layout: this.dLayout, entries: [
        { binding: 0, resource: { buffer: this.instBuf, offset: k * CAP * 32, size: CAP * 32 } },
        { binding: 1, resource: T.tNoise.createView() }, { binding: 2, resource: T.sampRep }] }));
    }
    const vb = [{ arrayStride: M.stride, attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' },
      { shaderLocation: 2, offset: 24, format: 'float32x2' }, { shaderLocation: 3, offset: 32, format: 'float32' }, { shaderLocation: 4, offset: 36, format: 'float32' }] }];
    this.pipe = r.gbufferPipeline({ label: 'tree-cards', code: TREE_DRAW_WGSL, groups: [this.dLayout], buffers: vb, cull: 'none' });
    this.pipeOpaque = r.gbufferPipeline({ label: 'trees', code: TREE_DRAW_WGSL, fs: 'fsOpaque', groups: [this.dLayout], buffers: vb, cull: 'none' });
    this.cDesc = { timestampWrites: undefined };
    ctx.terrainLateHost = this;
  },

  async _streetTrees(ctx) {
    const d = ctx.device, r = ctx.renderer;
    const cand = [];
    const R = rng(99);
    DISTRICTS.forEach((D, di) => {
      if (!D.block || D.road < 12) return;
      const ext = Math.max(D.rx, D.rz) * 1.05;
      const nl = Math.ceil(ext / D.block);
      const n = Math.max(Math.round(D.block / 34), 1), sp = D.block / n;
      const ns = Math.ceil(ext / sp) * 2;
      for (let axis = 0; axis < 2; axis++) for (let line = -nl; line <= nl; line++) {
        if (R() > 0.45) continue;   // only some avenues are tree-lined
        for (let s = -ns; s < ns; s++) {
          const along = s * sp * 0.5, off = line * D.block;
          const lx = axis ? off : along, lz = axis ? along : off;
          if ((lx / D.rx) ** 2 + (lz / D.rz) ** 2 > 1.05) continue;
          cand.push(di, axis, line, s);
        }
      }
    });
    const nC = cand.length / 4;
    if (!nC) return [];
    const cb = d.createBuffer({ size: cand.length * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(cb, 0, new Float32Array(cand));
    const ob = d.createBuffer({ size: nC * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const rb = d.createBuffer({ size: nC * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const layout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ] });
    const pipe = r.computePipeline({ label: 'street-trees', code: STREET_TREE_WGSL, groups: [layout] });
    const enc = d.createCommandEncoder();
    const p = enc.beginComputePass();
    p.setPipeline(pipe); p.setBindGroup(0, r.frameGroup);
    p.setBindGroup(1, d.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer: cb } }, { binding: 1, resource: { buffer: ob } }] }));
    p.dispatchWorkgroups(Math.ceil(nC / 64)); p.end();
    enc.copyBufferToBuffer(ob, 0, rb, 0, nC * 16);
    d.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ);
    const res = new Float32Array(rb.getMappedRange().slice(0));
    rb.unmap(); rb.destroy(); cb.destroy(); ob.destroy();
    const out = [];
    for (let i = 0; i < nC; i++) if (res[i * 4 + 3] > 0.5) out.push([res[i * 4], res[i * 4 + 1], res[i * 4 + 2], 0.62 + 0.12 * ((i * 7919) % 13) / 13, 0]);
    this.streetTreeCount = out.length;
    return out;
  },

  compute(ctx, enc) {
    const c = ctx.cam, v = this.vu;
    v[0] = Math.floor(c.x / this.cellA); v[1] = Math.floor(c.z / this.cellA); v[2] = this.cellA; v[3] = this.KA;
    v[4] = Math.floor(c.x / this.cellB); v[5] = Math.floor(c.z / this.cellB); v[6] = this.cellB; v[7] = this.KB;
    v[8] = this.RA; v[9] = this.RB; v[10] = this.density; v[11] = this.nFixed;
    v[12] = 42; v[13] = 130; v[14] = 1600; v[15] = 0;
    ctx.device.queue.writeBuffer(this.vuBuf, 0, v);
    ctx.device.queue.writeBuffer(this.argsBuf, 0, this.argsInit);
    this.cDesc.timestampWrites = ctx.prof.ts('vegetation');
    const p = enc.beginComputePass(this.cDesc);
    p.setBindGroup(0, ctx.renderer.frameGroup);
    p.setBindGroup(1, this.cGroup);
    p.setPipeline(this.pNear); p.dispatchWorkgroups(Math.ceil((2 * this.KA + 1) ** 2 / 64));
    p.setPipeline(this.pFar); p.dispatchWorkgroups(Math.ceil((2 * this.KB + 1) ** 2 / 64));
    if (this.nFixed) { p.setPipeline(this.pFixed); p.dispatchWorkgroups(Math.ceil(this.nFixed / 64)); }
    p.setPipeline(this.pClamp); p.dispatchWorkgroups(1);
    p.end();
  },

  drawTrees(ctx, pass) {
    pass.setVertexBuffer(0, this.vbuf);
    pass.setIndexBuffer(this.ibuf, 'uint32');
    const lm = ctx.treeLodMask === undefined ? 15 : ctx.treeLodMask;   // dev: which LODs to draw
    // opaque trunks and crown cores, near LODs first so early-z rejects the far trees hidden behind them
    pass.setPipeline(this.pipeOpaque);
    for (let l = 0; l < LODS; l++) for (let sp = 0; sp < SPECIES; sp++) {
      if (!(lm & (1 << l))) continue;
      const k = sp * LODS + l;
      pass.setBindGroup(1, this.dGroups[k]);
      pass.drawIndexedIndirect(this.argsBuf, k * 20);
    }
    // alpha-tested leaf cards last (they are tested against everything opaque already drawn)
    pass.setPipeline(this.pipe);
    for (let l = 0; l < LODS; l++) for (let sp = 0; sp < SPECIES; sp++) {
      const k = sp * LODS + l;
      if (!(lm & (1 << l)) || !this.hasCards[k]) continue;
      pass.setBindGroup(1, this.dGroups[k]);
      pass.drawIndexedIndirect(this.argsBuf, (LISTS + k) * 20);
    }
  },

  gbuffer(ctx, pass) {
    if (!ctx.hideA) this.drawTrees(ctx, pass);
    if (ctx.terrainDrawGround) ctx.terrainDrawGround(ctx, pass);
  },
};
