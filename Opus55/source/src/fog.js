// Froxel volumetric fog. Writes ctx.renderer.fogTex (FOG.W x FOG.H x FOG.D, rgba16float):
//   rgb = in-scattered light integrated from the camera to the slice centre, a = transmittance.
// Slices are exponentially distributed between FOG.NEAR and FOG.FAR (see fogSlice() in common.js).
//
// Per frame, all on the GPU:
//   1. splat   : every point light is splatted into a coarse world-space glow grid (fixed-point atomics) and,
//                when it is near the camera and inside the view frustum, appended to a "near light" list.
//   2. blurH/V : the glow grid is blurred into a smooth texture (diffuse city glow in the haze).
//   3. cluster : one workgroup per 8x8 froxel tile culls the near lights against the tile cone and bins them
//                into 16 depth clusters.
//   4. march   : one thread per froxel column marches the depth slices. Every second slice it evaluates the
//                medium at a jittered position: density (height fog, river/valley mist, wind-driven noise,
//                world-edge haze) and incoming light (sky/cloud ambient, city glow grid, moon forward
//                scattering, point light halos), blends it with the reprojected history volume (temporal
//                accumulation: no flicker, no visible slices) and integrates front to back into fogTex.
// The history volume (rgb = incoming radiance Li, a = extinction, half depth resolution) is exposed as
// ctx.fogLi so other effects can light themselves from it (rain streaks pick up the light around them).

import { FOG, WGSL_FRAME_STRUCT } from './common.js';
import { SKY_WGSL } from './sky.js';
import { WGSL_LIGHT } from './renderer.js';
import { halton, rng } from './math.js';

const GRID = 256, GRID_ORIGIN = -6144, GRID_SIZE = 12288; // glow grid: 48 m cells
const MAP_RES = 512;                                       // ground/water map: 24 m texels
const MAX_NEAR = 2048, NEAR_R = 450;
const HALO_R = 0.6;                                        // fog halo radius relative to the light radius
const HZ = FOG.D / 2;                                      // depth resolution of the evaluated medium
const CX = 8, CY = 8, CZ = 8;                              // cluster size in froxels (CZ in output slices)
const NCX = Math.ceil(FOG.W / CX), NCY = Math.ceil(FOG.H / CY), NCZ = Math.ceil(FOG.D / CZ);
const CL_STRIDE = 96, CL_MAX = 95;
const NOISE_N = 64;

// Light arriving at a point in the haze from everything except the point lights: night sky and moonlit
// overcast, the city-lit cloud deck above, the diffuse city glow from the light grid (cooled and partly
// desaturated so distant districts recede instead of turning into a warm wall) and moon forward scattering.
// Shared with rain.js, which subtracts it from the radiance volume to keep only the nearby point lights.
export const FOG_AMBIENT_WGSL = /* wgsl */ `
fn fogAmbientLi(p: vec3f, dir: vec3f, hA: f32, g: vec3f, glowGain: f32) -> vec3f {
  // deep blue-violet over the city, lighter moonlit haze toward the nature areas
  let nat = skyNature();
  var Li = vec3f(0.009, 0.011, 0.02) * mix(vec3f(0.45, 0.4, 0.7), vec3f(1.0), nat) + skyCityGlow(p.xz) * vec3f(0.14, 0.16, 0.32);
  // street glow stays low and local (it must not light up the sky behind a lamp-lit market)
  var gl = g * glowGain * (exp(-hA / 55.0) * 0.88 + exp(-hA / 350.0) * 0.12);
  gl /= 1.0 + max(gl.r, max(gl.g, gl.b)) * 5.0; // soft knee: very dense districts must not wash out the haze
  gl = mix(vec3f(luma(gl)), gl, 0.6) * vec3f(0.8, 0.78, 1.2);
  let c = dot(dir, F.moon.xyz);
  let hg = 1.5625 - 1.5 * c;
  Li += vec3f(0.62, 0.70, 1.0) * F.moon.w * (0.0042 * 0.4375 / (hg * sqrt(hg)) + 0.014);
  return Li + gl;
}
`;

const SHARED = /* wgsl */ `
struct FogU {
  prevCam: vec4f,   // xyz previous camera position, w history blend factor (1 = reset)
  jitter: vec4f,    // xyz froxel jitter (-0.5..0.5), w light count
  tune: vec4f,      // x halo gain, y city glow gain, z mist density, w edge haze density
  misc: vec4f,      // x near light radius
};
const FW = ${FOG.W}u; const FH = ${FOG.H}u; const FD = ${FOG.D}u; const HZ = ${HZ}u;
const FNEAR = ${FOG.NEAR}.0; const FFAR = ${FOG.FAR}.0;
const GRID = ${GRID}u; const GRID_ORIGIN = ${GRID_ORIGIN}.0; const GRID_SIZE = ${GRID_SIZE}.0;
const MAX_NEAR = ${MAX_NEAR}u;
const NCX = ${NCX}u; const NCY = ${NCY}u; const NCZ = ${NCZ}u;
const CL_STRIDE = ${CL_STRIDE}u; const CL_MAX = ${CL_MAX}u;
const HALO_R = ${HALO_R};
fn sliceDist(z: f32) -> f32 { return FNEAR * pow(FFAR / FNEAR, z / f32(FD)); }
fn sliceCoord(d: f32) -> f32 { return log(max(d, FNEAR) / FNEAR) / log(FFAR / FNEAR) * f32(FD); }
`;

// ---------------------------------------------------------------- 1. splat lights
const SPLAT_WGSL = SHARED + /* wgsl */ `
struct NearList { count: atomic<u32>, p0: u32, p1: u32, p2: u32, idx: array<u32> };
@group(1) @binding(0) var<uniform> FU: FogU;
@group(1) @binding(1) var<storage, read> lights: array<Light>;
@group(1) @binding(2) var<storage, read_write> grid: array<atomic<u32>>;
@group(1) @binding(3) var<storage, read_write> near: NearList;

fn splat(c: vec2i, v: vec3f) {
  if (c.x < 0 || c.y < 0 || c.x >= i32(GRID) || c.y >= i32(GRID)) { return; }
  let o = (u32(c.y) * GRID + u32(c.x)) * 3u;
  let q = vec3u(clamp(v * 64.0, vec3f(0.0), vec3f(1e6)));
  atomicAdd(&grid[o], q.x); atomicAdd(&grid[o + 1u], q.y); atomicAdd(&grid[o + 2u], q.z);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= u32(FU.jitter.w)) { return; }
  let L = lights[i];
  let r = L.posR.w;
  if (r <= 0.0) { return; }
  let col = max(L.color.rgb, vec3f(0.0));
  if (max(col.r, max(col.g, col.b)) <= 0.0) { return; }
  let g = (L.posR.xz - GRID_ORIGIN) / GRID_SIZE * f32(GRID) - 0.5;
  let gi = vec2i(floor(g)); let f = g - floor(g);
  splat(gi, col * (1.0 - f.x) * (1.0 - f.y));
  splat(gi + vec2i(1, 0), col * f.x * (1.0 - f.y));
  splat(gi + vec2i(0, 1), col * (1.0 - f.x) * f.y);
  splat(gi + vec2i(1, 1), col * f.x * f.y);

  let v = L.posR.xyz - F.camPos.xyz;
  let rh = r * HALO_R;
  if (length(v) - rh > FU.misc.x) { return; }
  let vp = (F.view * vec4f(L.posR.xyz, 1.0)).xyz;
  if (vp.z > rh) { return; }
  let tanY = F.camRight.w * 1.1;
  let tanX = tanY * F.camUp.w;
  let pl = normalize(vec3f(1.0, 0.0, -tanX)); let pr = normalize(vec3f(-1.0, 0.0, -tanX));
  let pb = normalize(vec3f(0.0, 1.0, -tanY)); let pt = normalize(vec3f(0.0, -1.0, -tanY));
  if (dot(pl, vp) < -rh || dot(pr, vp) < -rh || dot(pb, vp) < -rh || dot(pt, vp) < -rh) { return; }
  let k = atomicAdd(&near.count, 1u);
  if (k < MAX_NEAR) { near.idx[k] = i; }
}
`;

// ---------------------------------------------------------------- 2. blur the glow grid
const BLUR_R = 8, BLUR_SIGMA = 3.5;
const blurWgsl = (horizontal) => SHARED + /* wgsl */ `
${horizontal ? '@group(0) @binding(0) var<storage, read> grid: array<u32>;' : '@group(0) @binding(0) var inT: texture_2d<f32>;'}
@group(0) @binding(1) var outT: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= GRID || id.y >= GRID) { return; }
  var s = vec3f(0.0); var ws = 0.0;
  for (var k = -${BLUR_R}; k <= ${BLUR_R}; k++) {
    let w = exp(-f32(k * k) / ${(2 * BLUR_SIGMA * BLUR_SIGMA).toFixed(2)});
    ws += w;
    ${horizontal ? `let x = i32(id.x) + k;
    if (x < 0 || x >= i32(GRID)) { continue; }
    let o = (id.y * GRID + u32(x)) * 3u;
    s += vec3f(f32(grid[o]), f32(grid[o + 1u]), f32(grid[o + 2u])) * (w / 64.0);` : `let y = i32(id.y) + k;
    if (y < 0 || y >= i32(GRID)) { continue; }
    s += textureLoad(inT, vec2i(i32(id.x), y), 0).rgb * w;`}
  }
  textureStore(outT, id.xy, vec4f(s / ws, 1.0));
}
`;

// ---------------------------------------------------------------- 3. cluster assignment (one workgroup per xy tile)
const CLUSTER_WGSL = SHARED + /* wgsl */ `
struct NearListR { count: u32, p0: u32, p1: u32, p2: u32, idx: array<u32> };
@group(1) @binding(0) var<uniform> FU: FogU;
@group(1) @binding(1) var<storage, read> lights: array<Light>;
@group(1) @binding(2) var<storage, read> near: NearListR;
@group(1) @binding(3) var<storage, read_write> clusters: array<u32>;

var<workgroup> cnt: array<atomic<u32>, ${NCZ}>;
var<workgroup> list: array<u32, ${NCZ * CL_MAX}>;

fn froxelDir(uv: vec2f) -> vec3f {
  let w = F.invViewProj * vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 1.0, 1.0);
  return normalize(w.xyz / w.w - F.camPos.xyz);
}

@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) li: u32) {
  if (li < NCZ) { atomicStore(&cnt[li], 0u); }
  workgroupBarrier();
  let u0 = f32(wg.x * ${CX}u) / f32(FW); let u1 = min(f32(wg.x * ${CX}u + ${CX}u) / f32(FW), 1.0);
  let v0 = f32(wg.y * ${CY}u) / f32(FH); let v1 = min(f32(wg.y * ${CY}u + ${CY}u) / f32(FH), 1.0);
  let ctr = froxelDir(vec2f(u0 + u1, v0 + v1) * 0.5);
  let ca = min(min(dot(ctr, froxelDir(vec2f(u0, v0))), dot(ctr, froxelDir(vec2f(u1, v1)))),
               min(dot(ctr, froxelDir(vec2f(u0, v1))), dot(ctr, froxelDir(vec2f(u1, v0)))));
  let ang = acos(clamp(ca, -1.0, 1.0)) * 1.15; // widened for the xy jitter
  let n = min(near.count, MAX_NEAR);
  let cam = F.camPos.xyz;
  for (var j = li; j < n; j += 64u) {
    let i = near.idx[j];
    let L = lights[i];
    let r = L.posR.w * HALO_R;
    let v = L.posR.xyz - cam;
    let d = length(v);
    if (d > r) {
      let a = acos(clamp(dot(v / d, ctr), -1.0, 1.0));
      if (a - asin(r / d) > ang) { continue; }
    }
    let za = i32(floor((sliceCoord(d - r) - 1.2) / ${CZ}.0));
    let zb = i32(floor((sliceCoord(d + r) + 1.2) / ${CZ}.0));
    for (var z = max(za, 0); z <= min(zb, i32(NCZ) - 1); z++) {
      let k = atomicAdd(&cnt[z], 1u);
      if (k < CL_MAX) { list[u32(z) * CL_MAX + k] = i; }
    }
  }
  workgroupBarrier();
  for (var z = 0u; z < NCZ; z++) {
    let total = min(atomicLoad(&cnt[z]), CL_MAX);
    let base = ((z * NCY + wg.y) * NCX + wg.x) * CL_STRIDE;
    if (li == 0u) { clusters[base] = total; }
    for (var k = li; k < total; k += 64u) { clusters[base + 1u + k] = list[z * CL_MAX + k]; }
  }
}
`;

// ---------------------------------------------------------------- 4. march: medium + temporal + integration
// It writes fogTex, so it cannot use the shared frame bind group (which samples fogTex): own group 0.
const MARCH_WGSL = WGSL_FRAME_STRUCT + /* wgsl */ `
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var sampRepeat: sampler;
@group(0) @binding(2) var sampClamp: sampler;
fn time() -> f32 { return F.camPos.w; }
` + SKY_WGSL + WGSL_LIGHT + FOG_AMBIENT_WGSL + SHARED + /* wgsl */ `
@group(1) @binding(0) var<uniform> FU: FogU;
@group(1) @binding(1) var<storage, read> lights: array<Light>;
@group(1) @binding(2) var<storage, read> clusters: array<u32>;
@group(1) @binding(3) var glowTex: texture_2d<f32>;
@group(1) @binding(4) var histTex: texture_3d<f32>;
@group(1) @binding(5) var outVol: texture_storage_3d<rgba16float, write>;
@group(1) @binding(6) var mapTex: texture_2d<f32>;    // r ground height (>= water level), g water distance
@group(1) @binding(7) var noiseTex: texture_3d<f32>;  // tiling smooth value noise (mip-mapped)
@group(1) @binding(8) var outFog: texture_storage_3d<rgba16float, write>;

// Henyey-Greenstein phase normalized so that isotropic scattering = 1.
fn phaseHG(c: f32, g: f32) -> f32 {
  let d = 1.0 + g * g - 2.0 * g * c;
  return (1.0 - g * g) / (d * sqrt(d));
}

// Medium at world position p (distance dist along view direction dir): rgb = incoming radiance, a = extinction.
fn medium(p: vec3f, dir: vec3f, dist: f32, cnt: u32) -> vec4f {
  let t = time();
  let fm = textureSampleLevel(mapTex, sampClamp, (p.xz - GRID_ORIGIN) / GRID_SIZE, 0.0);
  let ground = fm.r;
  let hA = max(p.y - ground, 0.0);
  let py = max(p.y, 0.0);

  // ---- density (1/m)
  var n = 0.5;
  let nd = 1.0 - smoothstep(700.0, 3000.0, dist);
  if (nd > 0.0) {
    let q = p - vec3f(F.misc.z, 0.0, F.misc.w) * (t * 2.5);
    let fp = dist * 0.06;
    let n1 = textureSampleLevel(noiseTex, sampRepeat, q * vec3f(1.0, 2.4, 1.0) * (1.0 / 1100.0), log2(max(fp / 17.0, 1.0))).r;
    let n2 = textureSampleLevel(noiseTex, sampRepeat, (q + vec3f(0.0, t * 0.6, 0.0)) * vec3f(1.0, 1.6, 1.0) * (1.0 / 300.0), log2(max(fp / 4.7, 1.0))).g;
    n = mix(0.5, saturate((n1 * 0.7 + n2 * 0.3 - 0.5) * 2.2 + 0.5), nd);
  }
  var sigma = F.fog.x * exp(-F.fog.y * max(p.y - F.fog.z, -60.0)) * (0.5 + n);
  // low-lying mist over and near the rivers, and in low ground
  let wf = exp(-max(fm.g, 0.0) / 240.0);
  let valley = smoothstep(80.0, 12.0, ground);
  sigma += FU.tune.z * (wf * 0.9 + valley * 0.2) * exp(-hA / 18.0) * smoothstep(0.32, 0.8, n) * 1.6;
  // aerial perspective + thick haze toward the world edge (hides the end of the terrain)
  let rc = length(p.xz - SKY_CITY);
  // aerial perspective: horizon-aligned (depends on altitude only), so ridges recede in layers; the radial
  // term only thickens the air beyond the terrain so the end of the world never shows
  sigma += 0.00016 * exp(-py / 1800.0) + FU.tune.w * smoothstep(6200.0, 8200.0, rc) * exp(-py / 2500.0);
  sigma *= 1.0 + F.params.x * 0.7;

  // ---- incoming light
  // sky dome and the lit cloud deck above (city light reflected down), cool moonlit base
  let g = textureSampleLevel(glowTex, sampClamp, (p.xz - GRID_ORIGIN) / GRID_SIZE, 0.0).rgb;
  var Li = fogAmbientLi(p, dir, hA, g, FU.tune.y);
  // moon above a broken cloud deck: forward scattering when looking toward it
  // point light halos (lights of this froxel's cluster, cached in workgroup memory with flicker applied)
  var acc = vec3f(0.0);
  for (var k = 0u; k < cnt; k++) {
    let P = wl[k * 2u];
    let lv = P.xyz - p;
    let d2 = dot(lv, lv);
    let x2 = d2 / (P.w * P.w);
    if (x2 >= 1.0) { continue; }
    let fall = 1.0 - x2 * x2;
    let c = dot(lv, dir) * inverseSqrt(d2 + 1e-4);
    let hg = 1.0 + 0.3025 - 1.1 * c;
    acc += wl[k * 2u + 1u].rgb * (fall * fall / (d2 + 2.0) * (0.45 + 0.55 * 0.6975 / (hg * sqrt(hg))));
  }
  Li += acc * FU.tune.x;
  return vec4f(Li, sigma);
}

var<workgroup> wl: array<vec4f, ${CL_MAX * 2}>;  // cluster lights: posR, colour * flicker

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u, @builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) li: u32) {
  // threads past the bottom edge still run (they take part in the barriers) but write nothing
  let valid = gid.x < FW && gid.y < FH;
  let id = vec2u(gid.x, min(gid.y, FH - 1u));
  let jit = FU.jitter.xyz;
  let uv = (vec2f(id) + 0.5 + jit.xy) / vec2f(f32(FW), f32(FH));
  let w4 = F.invViewProj * vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 1.0, 1.0);
  let cam = F.camPos.xyz;
  let dir = normalize(w4.xyz / w4.w - cam);
  let tileXY = wg.y * NCX + wg.x;  // one workgroup = one 8x8 cluster tile
  let useHist = FU.prevCam.w < 1.0;
  let t = time();

  var T = 1.0;
  var S = vec3f(0.0);
  var prevD = 0.0;
  var cnt = 0u;
  for (var s = 0u; s < HZ; s++) {
    if (s % ${CZ / 2}u == 0u) {
      // entering a new depth cluster: cache its lights
      workgroupBarrier();
      let base = ((s / ${CZ / 2}u) * NCY * NCX + tileXY) * CL_STRIDE;
      cnt = min(clusters[base], CL_MAX);
      for (var j = li; j < cnt; j += 64u) {
        let L = lights[clusters[base + 1u + j]];
        // fade out toward the near-light range so lights never pop in or out with camera distance
        let fade = 1.0 - smoothstep(FU.misc.x * 0.7, FU.misc.x, length(L.posR.xyz - cam));
        wl[j * 2u] = vec4f(L.posR.xyz, L.posR.w * HALO_R);
        wl[j * 2u + 1u] = vec4f(L.color.rgb * (neonFlicker(L.color.w, t) * fade), 0.0);
      }
      workgroupBarrier();
    }
    // evaluate the medium at a jittered depth inside the slice pair (2s, 2s+1)
    let dist = sliceDist(f32(2u * s) + 1.0 + jit.z * 2.0);
    let p = cam + dir * dist;
    var v = medium(p, dir, dist, cnt);
    if (useHist) {
      let pc = F.prevViewProjNJ * vec4f(p, 1.0);
      if (pc.w > 0.0) {
        let puv = pc.xy / pc.w * vec2f(0.5, -0.5) + 0.5;
        let pw = sliceCoord(length(p - FU.prevCam.xyz)) / f32(FD);
        if (all(puv >= vec2f(0.0)) && all(puv <= vec2f(1.0)) && pw <= 1.0) {
          v = mix(textureSampleLevel(histTex, sampClamp, vec3f(puv, pw), 0.0), v, FU.prevCam.w);
        }
      }
    }
    // integrate the two output slices of this pair
    let Li = max(v.rgb, vec3f(0.0));
    let sg = max(v.a, 0.0);
    let d0 = sliceDist(f32(2u * s) + 0.5);
    var tr = exp(-sg * (d0 - prevD));
    S += T * Li * (1.0 - tr); T *= tr;
    let o0 = vec4f(S, T);
    let d1 = sliceDist(f32(2u * s) + 1.5);
    tr = exp(-sg * (d1 - d0));
    S += T * Li * (1.0 - tr); T *= tr;
    if (valid) {
      textureStore(outVol, vec3u(id, s), v);
      textureStore(outFog, vec3u(id, 2u * s), o0);
      textureStore(outFog, vec3u(id, 2u * s + 1u), vec4f(S, T));
    }
    prevD = d1;
  }
}
`;

// ---------------------------------------------------------------- init-time: low-res ground/water map
const MAP_WGSL = SHARED + /* wgsl */ `
@group(1) @binding(0) var outMap: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= ${MAP_RES}u || id.y >= ${MAP_RES}u) { return; }
  let cell = GRID_SIZE / ${MAP_RES}.0;
  let xz = GRID_ORIGIN + (vec2f(id.xy) + 0.5) * cell;
  var h = 0.0;
  for (var j = 0; j < 4; j++) {
    for (var i = 0; i < 4; i++) { h += max(terrainHeight(xz + (vec2f(f32(i), f32(j)) - 1.5) * (cell * 0.25)), 0.0); }
  }
  let info = worldInfo(xz);
  textureStore(outMap, id.xy, vec4f(h / 16.0, info.x, 0.0, 0.0));
}
`;

// Tiling 3D value noise (CPU, deterministic) with a box-filtered mip chain.
// Each of the 4 channels holds 2 octaves of periodic smooth value noise.
function makeNoise(N) {
  const R = rng(4242);
  const base = new Uint8Array(N * N * N * 4);
  const acc = new Float32Array(N * N * N);
  const sm = (f) => f * f * (3 - 2 * f);
  const octave = (L, w) => {
    const lat = new Float32Array(L * L * L);
    for (let i = 0; i < lat.length; i++) lat[i] = R();
    const s = N / L;
    const l = (a, b, c) => lat[(c * L + b) * L + a];
    for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const ux = x / s, uy = y / s, uz = z / s;
      const ix = Math.floor(ux), iy = Math.floor(uy), iz = Math.floor(uz);
      const fx = sm(ux - ix), fy = sm(uy - iy), fz = sm(uz - iz);
      const X0 = ix % L, X1 = (ix + 1) % L, Y0 = iy % L, Y1 = (iy + 1) % L, Z0 = iz % L, Z1 = (iz + 1) % L;
      const v00 = l(X0, Y0, Z0) + (l(X1, Y0, Z0) - l(X0, Y0, Z0)) * fx;
      const v10 = l(X0, Y1, Z0) + (l(X1, Y1, Z0) - l(X0, Y1, Z0)) * fx;
      const v01 = l(X0, Y0, Z1) + (l(X1, Y0, Z1) - l(X0, Y0, Z1)) * fx;
      const v11 = l(X0, Y1, Z1) + (l(X1, Y1, Z1) - l(X0, Y1, Z1)) * fx;
      const v0 = v00 + (v10 - v00) * fy, v1 = v01 + (v11 - v01) * fy;
      acc[(z * N + y) * N + x] += (v0 + (v1 - v0) * fz) * w;
    }
  };
  for (let c = 0; c < 4; c++) {
    acc.fill(0);
    octave(8, 0.62); octave(16, 0.38);
    for (let i = 0; i < acc.length; i++) base[i * 4 + c] = Math.max(0, Math.min(255, Math.round(acc[i] * 255)));
  }
  const mips = [base];
  for (let n = N >> 1; n >= 1; n >>= 1) {
    const src = mips[mips.length - 1], m = n * 2, dst = new Uint8Array(n * n * n * 4);
    for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = 0; k < 8; k++) sum += src[(((z * 2 + (k >> 2)) * m + y * 2 + ((k >> 1) & 1)) * m + x * 2 + (k & 1)) * 4 + c];
      dst[((z * n + y) * n + x) * 4 + c] = Math.round(sum / 8);
    }
    mips.push(dst);
  }
  return mips;
}

export default {
  name: 'fog',
  // Artistic controls (adjustable live from the console: __ctx.modules.find(m => m.name === 'fog').tune)
  tune: { halo: 1.0, glow: 0.0028, mist: 0.0009, edge: 0.0016 },

  init(ctx) {
    const d = ctx.device, r = ctx.renderer;
    const C = GPUShaderStage.COMPUTE;
    const B = GPUBufferUsage, T = GPUTextureUsage;
    const st3 = { access: 'write-only', format: 'rgba16float', viewDimension: '3d' };
    this.u = new Float32Array(16);
    this.ubuf = d.createBuffer({ size: 64, usage: B.UNIFORM | B.COPY_DST });
    this.gridBuf = d.createBuffer({ size: GRID * GRID * 12, usage: B.STORAGE | B.COPY_DST });
    this.nearBuf = d.createBuffer({ size: 16 + MAX_NEAR * 4, usage: B.STORAGE | B.COPY_DST });
    this.clusterBuf = d.createBuffer({ size: NCX * NCY * NCZ * CL_STRIDE * 4, usage: B.STORAGE });
    this.glowA = d.createTexture({ size: [GRID, GRID], format: 'rgba16float', usage: T.STORAGE_BINDING | T.TEXTURE_BINDING });
    this.glowB = d.createTexture({ size: [GRID, GRID], format: 'rgba16float', usage: T.STORAGE_BINDING | T.TEXTURE_BINDING });
    this.vols = [0, 1].map(() => d.createTexture({ size: [FOG.W, FOG.H, HZ], dimension: '3d', format: 'rgba16float', usage: T.STORAGE_BINDING | T.TEXTURE_BINDING }));
    this.volViews = this.vols.map((v) => v.createView({ dimension: '3d' }));
    const lightsRes = { buffer: ctx.lights.buffer };

    // init-time textures: ground/water map (GPU) and tiling noise (CPU)
    this.mapTex = d.createTexture({ size: [MAP_RES, MAP_RES], format: 'rgba16float', usage: T.STORAGE_BINDING | T.TEXTURE_BINDING });
    const mapL = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: C, storageTexture: { access: 'write-only', format: 'rgba16float' } }] });
    const mapPipe = r.computePipeline({ label: 'fog-map', code: MAP_WGSL, groups: [mapL] });
    const menc = d.createCommandEncoder();
    const mp = menc.beginComputePass();
    mp.setPipeline(mapPipe);
    mp.setBindGroup(0, r.frameGroup);
    mp.setBindGroup(1, d.createBindGroup({ layout: mapL, entries: [{ binding: 0, resource: this.mapTex.createView() }] }));
    mp.dispatchWorkgroups(MAP_RES / 8, MAP_RES / 8);
    mp.end();
    d.queue.submit([menc.finish()]);
    const mips = makeNoise(NOISE_N);
    this.noiseTex = d.createTexture({ size: [NOISE_N, NOISE_N, NOISE_N], dimension: '3d', format: 'rgba8unorm', mipLevelCount: mips.length, usage: T.TEXTURE_BINDING | T.COPY_DST });
    mips.forEach((m, i) => {
      const n = NOISE_N >> i;
      d.queue.writeTexture({ texture: this.noiseTex, mipLevel: i }, m, { bytesPerRow: n * 4, rowsPerImage: n }, [n, n, n]);
    });

    // 1. splat
    const splatL = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: C, buffer: { type: 'uniform' } },
      { binding: 1, visibility: C, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: C, buffer: { type: 'storage' } },
      { binding: 3, visibility: C, buffer: { type: 'storage' } },
    ] });
    this.splatPipe = r.computePipeline({ label: 'fog-splat', code: SPLAT_WGSL, groups: [splatL] });
    this.splatGroup = d.createBindGroup({ layout: splatL, entries: [
      { binding: 0, resource: { buffer: this.ubuf } }, { binding: 1, resource: lightsRes },
      { binding: 2, resource: { buffer: this.gridBuf } }, { binding: 3, resource: { buffer: this.nearBuf } },
    ] });

    // 2. blur
    const blurHL = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: C, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: C, storageTexture: { access: 'write-only', format: 'rgba16float' } },
    ] });
    const blurVL = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: C, texture: { sampleType: 'unfilterable-float' } },
      { binding: 1, visibility: C, storageTexture: { access: 'write-only', format: 'rgba16float' } },
    ] });
    this.blurHPipe = r.computePipeline({ label: 'fog-blurH', code: blurWgsl(true), withFrame: false, groups: [blurHL] });
    this.blurVPipe = r.computePipeline({ label: 'fog-blurV', code: blurWgsl(false), withFrame: false, groups: [blurVL] });
    this.blurHGroup = d.createBindGroup({ layout: blurHL, entries: [
      { binding: 0, resource: { buffer: this.gridBuf } }, { binding: 1, resource: this.glowA.createView() }] });
    this.blurVGroup = d.createBindGroup({ layout: blurVL, entries: [
      { binding: 0, resource: this.glowA.createView() }, { binding: 1, resource: this.glowB.createView() }] });

    // 3. cluster
    const clusterL = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: C, buffer: { type: 'uniform' } },
      { binding: 1, visibility: C, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: C, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: C, buffer: { type: 'storage' } },
    ] });
    this.clusterPipe = r.computePipeline({ label: 'fog-cluster', code: CLUSTER_WGSL, groups: [clusterL] });
    this.clusterGroup = d.createBindGroup({ layout: clusterL, entries: [
      { binding: 0, resource: { buffer: this.ubuf } }, { binding: 1, resource: lightsRes },
      { binding: 2, resource: { buffer: this.nearBuf } }, { binding: 3, resource: { buffer: this.clusterBuf } },
    ] });

    // 4. march (ping-pong history)
    const marchL = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: C, buffer: { type: 'uniform' } },
      { binding: 1, visibility: C, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: C, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: C, texture: { sampleType: 'float' } },
      { binding: 4, visibility: C, texture: { sampleType: 'float', viewDimension: '3d' } },
      { binding: 5, visibility: C, storageTexture: st3 },
      { binding: 6, visibility: C, texture: { sampleType: 'float' } },
      { binding: 7, visibility: C, texture: { sampleType: 'float', viewDimension: '3d' } },
      { binding: 8, visibility: C, storageTexture: st3 },
    ] });
    const march0 = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: C, buffer: { type: 'uniform' } },
      { binding: 1, visibility: C, sampler: { type: 'filtering' } },
      { binding: 2, visibility: C, sampler: { type: 'filtering' } },
    ] });
    this.marchPipe = r.computePipeline({ label: 'fog-march', code: MARCH_WGSL, withFrame: false, groups: [march0, marchL] });
    this.march0Group = d.createBindGroup({ layout: march0, entries: [
      { binding: 0, resource: { buffer: r.frameBuf } }, { binding: 1, resource: r.sampRepeat }, { binding: 2, resource: r.sampClamp }] });
    const glowView = this.glowB.createView(), mapView = this.mapTex.createView();
    const noiseView = this.noiseTex.createView({ dimension: '3d' }), fogView = r.fogTex.createView({ dimension: '3d' });
    this.marchGroups = [0, 1].map((i) => d.createBindGroup({ layout: marchL, entries: [
      { binding: 0, resource: { buffer: this.ubuf } }, { binding: 1, resource: lightsRes },
      { binding: 2, resource: { buffer: this.clusterBuf } }, { binding: 3, resource: glowView },
      { binding: 4, resource: this.volViews[1 - i] }, { binding: 5, resource: this.volViews[i] },
      { binding: 6, resource: mapView }, { binding: 7, resource: noiseView }, { binding: 8, resource: fogView },
    ] }));

    this.cur = 0;
    this.frame = 0;
    this.last = [0, 0, 0];
    this.hasHistory = false;
    this.desc = { timestampWrites: undefined };
    // Incoming radiance volume for other effects: views[index] was written this frame.
    // rgb = radiance arriving at the point and scattered toward the camera, a = extinction (1/m).
    // Sample it like fogTex: uv = screen uv, w = fogSlice(distance).
    ctx.fogLi = { views: this.volViews, index: 0, glowView, tune: this.tune };
  },

  compute(ctx, enc) {
    const u = this.u, c = ctx.cam, tn = this.tune;
    const reset = !this.hasHistory || ctx.renderer.resetHistory;
    const k = (this.frame % 16) + 1;
    // The history is reprojected in world space, so it stays valid after a camera cut (reprojection rejects
    // what was not in view). Only the very first frame starts from scratch; after a cut it converges faster.
    u[0] = this.last[0]; u[1] = this.last[1]; u[2] = this.last[2]; u[3] = !this.hasHistory ? 1 : reset ? 0.2 : 0.1;
    u[4] = halton(k, 2) - 0.5; u[5] = halton(k, 3) - 0.5; u[6] = halton(k, 5) - 0.5; u[7] = ctx.lights.count;
    u[8] = tn.halo; u[9] = tn.glow; u[10] = tn.mist; u[11] = tn.edge;
    u[12] = NEAR_R;
    ctx.device.queue.writeBuffer(this.ubuf, 0, u);
    this.last[0] = c.x; this.last[1] = c.y; this.last[2] = c.z;
    this.hasHistory = true;
    this.frame++;

    enc.clearBuffer(this.gridBuf);
    enc.clearBuffer(this.nearBuf, 0, 16);
    // Separate passes so no bind group holding a writable resource stays bound across a conflicting dispatch.
    const fg = ctx.renderer.frameGroup;
    this.desc.timestampWrites = ctx.prof.ts('fog');
    let p = enc.beginComputePass(this.desc);
    p.setPipeline(this.splatPipe);
    p.setBindGroup(0, fg); p.setBindGroup(1, this.splatGroup);
    p.dispatchWorkgroups(Math.max(1, Math.ceil(ctx.lights.count / 64)));
    p.end();
    this.desc.timestampWrites = ctx.prof.ts('fog');
    p = enc.beginComputePass(this.desc);
    p.setPipeline(this.blurHPipe);
    p.setBindGroup(0, this.blurHGroup);
    p.dispatchWorkgroups(GRID / 8, GRID / 8);
    p.setPipeline(this.blurVPipe);
    p.setBindGroup(0, this.blurVGroup);
    p.dispatchWorkgroups(GRID / 8, GRID / 8);
    p.setPipeline(this.clusterPipe);
    p.setBindGroup(0, fg); p.setBindGroup(1, this.clusterGroup);
    p.dispatchWorkgroups(NCX, NCY);
    p.end();
    this.desc.timestampWrites = ctx.prof.ts('fog');
    p = enc.beginComputePass(this.desc);
    p.setPipeline(this.marchPipe);
    p.setBindGroup(0, this.march0Group); p.setBindGroup(1, this.marchGroups[this.cur]);
    p.dispatchWorkgroups(Math.ceil(FOG.W / 8), Math.ceil(FOG.H / 8));
    p.end();
    ctx.fogLi.index = this.cur;
    this.cur ^= 1;
  },
};
