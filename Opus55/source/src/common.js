// Shared WGSL code.
//  WGSL_LIB    : pure helper functions (no bindings). Safe to prepend to any shader.
//  WGSL_FRAME  : group(0) frame bindings + helpers that need them (terrain height, fog, sky).
//  GBUFFER_OUT : G-buffer fragment output struct and constructor.
// Every G-buffer / forward shader is built as WGSL_LIB + WGSL_FRAME + module code.

import { SKY_WGSL } from './sky.js';

export const TERRAIN = { SIZE: 12288, RES: 4096, ORIGIN: -6144 }; // meters; texel = 3 m
export const INFO = { RES: 2048 };                                 // world info map, 6 m per texel
export const FOG = { W: 160, H: 90, D: 128, NEAR: 1, FAR: 9000 };  // froxel volume
export const MAX_DISTRICTS = 16;
export const MAX_LIGHTS = 8192;

export const WGSL_LIB = /* wgsl */ `
const PI = 3.14159265;
const TAU = 6.28318531;

fn saturate(x: f32) -> f32 { return clamp(x, 0.0, 1.0); }
fn saturate3(x: vec3f) -> vec3f { return clamp(x, vec3f(0.0), vec3f(1.0)); }
fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }
fn rot2(a: f32) -> mat2x2f { let c = cos(a); let s = sin(a); return mat2x2f(c, s, -s, c); }

// Integer hashes (PCG-style), stable across GPUs.
fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn hash11u(v: u32) -> f32 { return f32(pcg(v)) / 4294967295.0; }
fn hash21(p: vec2f) -> f32 {
  let q = vec2u(vec2i(floor(p)) + vec2i(32768));
  return f32(pcg(q.x ^ pcg(q.y))) / 4294967295.0;
}
fn hash22(p: vec2f) -> vec2f {
  let q = vec2u(vec2i(floor(p)) + vec2i(32768));
  let h = pcg(q.x ^ pcg(q.y));
  return vec2f(f32(h & 0xffffu), f32(h >> 16u)) / 65535.0;
}
fn hash31(p: vec3f) -> f32 {
  let q = vec3u(vec3i(floor(p)) + vec3i(32768));
  return f32(pcg(q.x ^ pcg(q.y ^ pcg(q.z)))) / 4294967295.0;
}

// Value noise in [0,1] with quintic interpolation.
fn vnoise2(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  let a = hash21(i); let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0)); let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
fn vnoise3(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let n000 = hash31(i); let n100 = hash31(i + vec3f(1, 0, 0));
  let n010 = hash31(i + vec3f(0, 1, 0)); let n110 = hash31(i + vec3f(1, 1, 0));
  let n001 = hash31(i + vec3f(0, 0, 1)); let n101 = hash31(i + vec3f(1, 0, 1));
  let n011 = hash31(i + vec3f(0, 1, 1)); let n111 = hash31(i + vec3f(1, 1, 1));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
             mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
// Gradient noise in [-1,1].
fn gnoise2(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  let ga = hash22(i) * 2.0 - 1.0; let gb = hash22(i + vec2f(1, 0)) * 2.0 - 1.0;
  let gc = hash22(i + vec2f(0, 1)) * 2.0 - 1.0; let gd = hash22(i + vec2f(1, 1)) * 2.0 - 1.0;
  let a = dot(ga, f); let b = dot(gb, f - vec2f(1, 0));
  let c = dot(gc, f - vec2f(0, 1)); let d = dot(gd, f - vec2f(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.4;
}
fn fbm2(p0: vec2f, oct: i32) -> f32 {
  var p = p0; var a = 0.5; var s = 0.0;
  for (var i = 0; i < oct; i++) { s += a * gnoise2(p); p = rot2(0.6) * p * 2.03 + vec2f(17.1, 9.7); a *= 0.5; }
  return s;
}

// Interleaved gradient noise for dithering.
fn ign(px: vec2f, frame: f32) -> f32 {
  let p = px + 5.588238 * (frame % 64.0);
  return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715))));
}

fn srgbToLinear(c: vec3f) -> vec3f { return pow(c, vec3f(2.2)); }

// Signed distance helpers (2D) for procedural patterns.
fn sdBox2(p: vec2f, b: vec2f) -> f32 { let d = abs(p) - b; return length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0); }
`;

// Frame uniform struct alone (for shaders that bind the frame uniform in their own bind group, e.g. writers of fogTex).
export const WGSL_FRAME_STRUCT = /* wgsl */ `
struct Frame {
  viewProj: mat4x4f,        // jittered
  viewProjNJ: mat4x4f,      // not jittered (use for motion vectors)
  prevViewProjNJ: mat4x4f,  // previous frame, not jittered
  invViewProj: mat4x4f,     // inverse of jittered viewProj
  view: mat4x4f,
  proj: mat4x4f,            // jittered projection
  camPos: vec4f,            // xyz camera position, w = time (s)
  camFwd: vec4f,            // xyz forward, w = dt (s)
  res: vec4f,               // render width, height, 1/w, 1/h
  jitter: vec4f,            // xy current jitter (NDC), zw previous
  moon: vec4f,              // xyz direction to moon, w intensity
  params: vec4f,            // x rain 0..1, y frame index, z wetness 0..1, w quality (0 low,1 med,2 high)
  fog: vec4f,               // x density, y height falloff, z base height, w light count
  camRight: vec4f,          // xyz right, w tan(fovY/2)
  camUp: vec4f,             // xyz up, w aspect
  misc: vec4f,              // x near plane, y exposure, z wind x, w wind z
  show: vec4f,              // light show: x intensity 0..1, y seconds since show start, z beat phase 0..1, w beat index
  launch: vec4f,            // rocket launch glow on the cloud deck (skyops): x, z (m), radius (m), intensity
};

`;

export const WGSL_FRAME = WGSL_FRAME_STRUCT + /* wgsl */ `
struct District {
  a: vec4f,   // center x, center z, radius x, radius z (ellipse)
  b: vec4f,   // grid angle, block size, road width, type
  c: vec4f,   // target ground height, flatten 0..1, bank softness, seed
};
struct WorldU {
  d: array<District, ${MAX_DISTRICTS}>,
  count: vec4f, // x = district count
};

@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var sampRepeat: sampler;
@group(0) @binding(2) var sampClamp: sampler;
@group(0) @binding(3) var heightTex: texture_2d<f32>;   // r32float, ${TERRAIN.RES}^2 over ${TERRAIN.SIZE} m
@group(0) @binding(4) var infoTex: texture_2d<f32>;     // rgba16float: x signed water distance (m), y district id, z district weight, w natural shore (lake/canal) 0..1
@group(0) @binding(5) var fogTex: texture_3d<f32>;      // rgb in-scatter, a transmittance (froxels)
@group(0) @binding(6) var<uniform> W: WorldU;

const T_SIZE = ${TERRAIN.SIZE}.0;
const T_RES = ${TERRAIN.RES}.0;
const T_ORIGIN = ${TERRAIN.ORIGIN}.0;
const FOG_NEAR = ${FOG.NEAR}.0;
const FOG_FAR = ${FOG.FAR}.0;
const FOG_D = ${FOG.D}.0;
const WATER_Y = 0.0;

fn time() -> f32 { return F.camPos.w; }

// Bilinear terrain height (meters) at world xz.
fn terrainHeight(xz: vec2f) -> f32 {
  let t = (xz - T_ORIGIN) / T_SIZE * T_RES - 0.5;
  let i = vec2i(floor(t));
  let f = t - floor(t);
  let m = i32(T_RES) - 1;
  let h00 = textureLoad(heightTex, clamp(i, vec2i(0), vec2i(m)), 0).x;
  let h10 = textureLoad(heightTex, clamp(i + vec2i(1, 0), vec2i(0), vec2i(m)), 0).x;
  let h01 = textureLoad(heightTex, clamp(i + vec2i(0, 1), vec2i(0), vec2i(m)), 0).x;
  let h11 = textureLoad(heightTex, clamp(i + vec2i(1, 1), vec2i(0), vec2i(m)), 0).x;
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}
fn terrainNormal(xz: vec2f, e: f32) -> vec3f {
  let hx = terrainHeight(xz + vec2f(e, 0.0)) - terrainHeight(xz - vec2f(e, 0.0));
  let hz = terrainHeight(xz + vec2f(0.0, e)) - terrainHeight(xz - vec2f(0.0, e));
  return normalize(vec3f(-hx, 2.0 * e, -hz));
}
// World info: x signed distance to water edge (negative = in water), y district id, z district weight, w natural shore 0..1.
fn worldInfo(xz: vec2f) -> vec4f {
  let uv = (xz - T_ORIGIN) / T_SIZE;
  return textureSampleLevel(infoTex, sampClamp, uv, 0.0);
}

// Road mask for a district grid: returns (mask 0..1, distance to road center line, lane coord along road, axis 0/1).
fn districtRoad(p: vec2f, di: i32) -> vec4f {
  let d = W.d[di];
  let lp = rot2(-d.b.x) * (p - d.a.xy);
  let blk = d.b.y;
  let hw = d.b.z * 0.5;
  let q = lp / blk;
  let fq = (fract(q + 0.5) - 0.5) * blk;   // distance from grid line in meters
  let ax = abs(fq.x); let az = abs(fq.y);
  let onX = ax < az;                        // nearest road runs along z (constant x)
  let dist = min(ax, az);
  let mask = 1.0 - smoothstep(hw - 0.6, hw + 0.6, dist);
  let along = select(lp.x, lp.y, onX);
  return vec4f(mask, dist, along, select(1.0, 0.0, onX));
}
// Combined road mask at a world position (0 outside districts with a street grid).
fn roadMask(p: vec2f) -> f32 {
  let info = worldInfo(p);
  let di = i32(info.y + 0.5);
  if (di < 0 || di >= i32(W.count.x) || info.z < 0.35) { return 0.0; }
  if (W.d[di].b.y <= 0.0) { return 0.0; }
  return districtRoad(p, di).x * smoothstep(0.35, 0.6, info.z) * smoothstep(6.0, 14.0, info.x);
}

fn linearDepth(d: f32) -> f32 { return F.misc.x / max(d, 1e-7); }

// Motion vector in UV space (current - previous) for a point at world position wp that was at pwp last frame.
fn motionVector(wp: vec3f, pwp: vec3f) -> vec2f {
  let c = F.viewProjNJ * vec4f(wp, 1.0);
  let p = F.prevViewProjNJ * vec4f(pwp, 1.0);
  let cu = c.xy / c.w * vec2f(0.5, -0.5);
  let pu = p.xy / p.w * vec2f(0.5, -0.5);
  return cu - pu;
}

// Froxel fog lookup. uv = screen uv, dist = view distance in meters.
fn fogSlice(dist: f32) -> f32 { return log(max(dist, FOG_NEAR) / FOG_NEAR) / log(FOG_FAR / FOG_NEAR); }
fn applyFog(col: vec3f, uv: vec2f, dist: f32) -> vec3f {
  let w = clamp(fogSlice(dist), 0.0, 1.0);
  let f = textureSampleLevel(fogTex, sampClamp, vec3f(uv, w), 0.0);
  return col * f.a + f.rgb;
}

// World-space view ray through a screen uv (uses jittered inverse view-projection).
fn viewRay(uv: vec2f) -> vec3f {
  let ndc = vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 1.0, 1.0);
  let w = F.invViewProj * ndc;
  return normalize(w.xyz / w.w - F.camPos.xyz);
}
fn worldFromDepth(uv: vec2f, depth: f32) -> vec3f {
  let ndc = vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, depth, 1.0);
  let w = F.invViewProj * ndc;
  return w.xyz / w.w;
}

${SKY_WGSL}
`;

// G-buffer outputs. Every opaque shader writes this.
//  albedo.rgb, roughness | normal.xyz (world), metalness | emissive.rgb (HDR), ao | motion.xy, material id, wetness factor
//  Material ids: 0 default, 1 foliage (soft transmission), 2 glass (strong reflection), 3 terrain/ground (puddles when wet), 4 water-adjacent stone.
export const GBUFFER_OUT = /* wgsl */ `
struct GOut {
  @location(0) albedo: vec4f,
  @location(1) normal: vec4f,
  @location(2) emissive: vec4f,
  @location(3) motion: vec4f,
};
fn gbuf(albedo: vec3f, rough: f32, n: vec3f, metal: f32, emissive: vec3f, ao: f32, motion: vec2f, material: f32, wet: f32) -> GOut {
  var o: GOut;
  o.albedo = vec4f(albedo, rough);
  o.normal = vec4f(normalize(n), metal);
  o.emissive = vec4f(emissive, ao);
  o.motion = vec4f(motion, material, wet);
  return o;
}
`;

// Fullscreen triangle vertex shader for post passes.
export const WGSL_FULLSCREEN = /* wgsl */ `
struct FsOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vsFull(@builtin(vertex_index) i: u32) -> FsOut {
  var o: FsOut;
  let x = f32((i << 1u) & 2u); let y = f32(i & 2u);
  o.pos = vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  o.uv = vec2f(x, y);
  return o;
}
`;
