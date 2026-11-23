// Night sky. SKY_WGSL is compiled into the shared frame code (see common.js), so every shader can call:
//   skyRadiance(dir)  full sky with moon, stars and clouds (used for background pixels and sharp reflections)
//   skyAmbient(dir)   cheap smooth version (used for ambient light and rough reflections)
//   skyCityGlow(xz)   city light reflected by the cloud deck above world xz (also used by the fog)
// It may only use WGSL_LIB functions and the Frame uniform F.
//
// Look: a low cloud deck (base 1.8 km) lit from below by the city: pink-amber over the centre and the CBD,
// violet-magenta toward the outskirts, fading to near black above the mountains. A moon with a soft corona
// that shows through thin cloud, sparse stars only in the clear gaps. Clouds drift with the wind (F.misc.zw).
// skyRadiance() runs for every lit pixel (reflections), so the cloud noise uses a cheap single-hash gradient
// noise and skips its fine octaves at grazing angles.

import { DISTRICTS, DT } from './world.js';

export const SKY_WGSL = /* wgsl */ `
const SKY_CITY = vec2f(300.0, -300.0);
const SKY_CBD = vec2f(3300.0, -1250.0);
const SKY_CLOUD_BASE = 1800.0;
const SKY_MOON_COL = vec3f(0.62, 0.70, 1.0);
const SKY_ZENITH = vec3f(0.0036, 0.0058, 0.017);
const SKY_HORIZON = vec3f(0.026, 0.025, 0.048);
const SKY_COVER_AVG = 0.62;

// City light reflected by the underside of the cloud deck above world position xz (linear HDR radiance).
fn skyCityGlow(xz: vec2f) -> vec3f {
  let d = length(xz - SKY_CITY);
  let a = d * (1.0 / 2700.0);
  let a2 = 1.0 + a * a;
  let m = 1.0 / (a2 * a2);
  let c = length(xz - SKY_CBD) * (1.0 / 1300.0);
  let b = exp(-c * c);
  let warm = vec3f(1.0, 0.40, 0.48);
  let vio = vec3f(0.58, 0.20, 0.95);
  let col = mix(warm, vio, smoothstep(700.0, 4200.0, d));
  return (col * m + vec3f(0.85, 0.30, 0.95) * b * 0.6) * 0.095;
}

// 0 in the city, 1 out in the gardens / mountains. Computed on the CPU from the camera position and the
// urban districts (sky.update) and passed through the moon intensity, which it drives.
const SKY_MOON_CITY = 0.25;
const SKY_MOON_NATURE = 1.0;
fn skyNature() -> f32 { return saturate((F.moon.w - SKY_MOON_CITY) / (SKY_MOON_NATURE - SKY_MOON_CITY)); }
// Night-sky base: deep blue-violet over the city (the neon does the lighting there), lighter moonlit
// overcast in the nature areas.
fn skyBase(c: vec3f) -> vec3f { return c * mix(vec3f(0.5, 0.42, 0.72), vec3f(1.0), skyNature()); }

// Moon light seen through the atmosphere around the moon direction (no disk).
fn skyMoonHalo(md: f32) -> vec3f {
  let m = max(md, 0.0);
  let m2 = m * m; let m4 = m2 * m2; let m8 = m4 * m4; let m16 = m8 * m8;
  let m64 = m16 * m16 * m16 * m16;
  return SKY_MOON_COL * F.moon.w * (m8 * 0.008 + m64 * 0.02);
}

// Cheap horizon colour (no cloud detail): used below the horizon and blended in near it.
fn skyHorizon(dir: vec3f) -> vec3f {
  let h = normalize(dir.xz + vec2f(1e-5, 0.0));
  // atmospheric in-scatter of the city light toward the horizon: the glow a few km away along the view
  // a glow gradient on the horizon toward the city, visible from the gardens and the mountains too
  let far = max(skyCityGlow(F.camPos.xz + h * 2000.0), skyCityGlow(F.camPos.xz + h * 5500.0));
  // out in the southern mountains a faint moonlit haze sits on the horizon, so the far ridgelines stand
  // out as darker layers against it (zero anywhere in the city or the gardens)
  let mtn = smoothstep(3600.0, 4600.0, F.camPos.z);
  return skyBase(SKY_HORIZON) + far * 1.15 + skyMoonHalo(dot(vec3f(h.x, 0.0, h.y), F.moon.xyz)) * 0.6 + SKY_MOON_COL * F.moon.w * 0.011 * mtn;
}

fn skyAmbient(dir: vec3f) -> vec3f {
  let up = saturate(dir.y);
  let over = skyCityGlow(F.camPos.xz);
  let dome = skyBase(SKY_ZENITH) * 1.5 + over * (0.45 * SKY_COVER_AVG);
  let hz = skyBase(SKY_HORIZON) + over * 0.5;
  var c = mix(hz, dome, sqrt(up));
  c += skyMoonHalo(dot(dir, F.moon.xyz)) * 1.5;
  // moonlight diffused by the overcast: keeps nature areas readable away from the city lights
  // (stronger when the camera is out in the gardens or the mountains, where nothing else lights the scene)
  let nature = skyNature();
  c += SKY_MOON_COL * F.moon.w * (0.03 + 0.13 * nature) * (0.55 + 0.45 * up);
  if (dir.y < 0.0) { c *= mix(1.0, 0.35, saturate(-dir.y * 3.0)); }
  return c;
}

// Gradient noise in [-1,1] with a single PCG hash per lattice corner.
fn skyGrad(i: vec2f, f: vec2f) -> f32 {
  let q = vec2u(vec2i(i) + vec2i(32768));
  let h = pcg((q.x * 1597334677u) ^ (q.y * 3812015801u));
  let g = vec2f(f32(h & 0xffffu), f32(h >> 16u)) * (2.0 / 65535.0) - 1.0;
  return dot(g, f);
}
fn skyNoise(p: vec2f) -> f32 {
  let i = floor(p); let f = p - i;
  let u = f * f * (3.0 - 2.0 * f);
  let a = skyGrad(i, f); let b = skyGrad(i + vec2f(1.0, 0.0), f - vec2f(1.0, 0.0));
  let c = skyGrad(i + vec2f(0.0, 1.0), f - vec2f(0.0, 1.0)); let d = skyGrad(i + vec2f(1.0, 1.0), f - vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.5;
}

// Cloud deck density field at world xz. detail fades the fine octaves with distance (anti-aliasing).
fn skyCloudNoise(P: vec2f, detail: f32) -> f32 {
  let drift = vec2f(F.misc.z, F.misc.w) * (time() * 9.0);
  var q = (P - drift) * 0.0006;
  var n = skyNoise(q) * 0.5;
  q = mat2x2f(1.6, 1.2, -1.2, 1.6) * q + vec2f(17.1, 9.7);
  // billowy second octave (rounded cells) evolving slowly against the drift
  n += (0.55 - abs(skyNoise(q + drift * 0.0005))) * 0.34;
  if (detail > 0.02) {
    q = mat2x2f(1.6, 1.2, -1.2, 1.6) * q + vec2f(5.3, 2.9);
    n += skyNoise(q) * 0.16 * detail;
    q = mat2x2f(1.6, 1.2, -1.2, 1.6) * q + vec2f(1.3, 8.1);
    n += skyNoise(q) * 0.08 * detail;
  }
  return n - 0.1;
}

fn skyRadiance(dir: vec3f) -> vec3f {
  let hz = skyHorizon(dir);
  if (dir.y <= 0.0) {
    return hz * mix(1.0, 0.3, saturate(-dir.y * 3.0));
  }
  let y = dir.y;
  let md = dot(dir, F.moon.xyz);

  // cloud deck (plane at SKY_CLOUD_BASE, seen from below)
  let t = (SKY_CLOUD_BASE - F.camPos.y) / y;
  let P = F.camPos.xz + dir.xz * t;
  let detail = 1.0 - smoothstep(5000.0, 26000.0, t);
  let n = skyCloudNoise(P, detail);
  let far = smoothstep(18000.0, 70000.0, t);
  let cov = mix(smoothstep(-0.32, 0.12, n), SKY_COVER_AVG, far);
  let dens = mix(smoothstep(-0.12, 0.5, n), 0.4, far);
  let glow = skyCityGlow(P);
  // underside lit by the city; thicker cloud scatters more of it back down, cores slightly darker
  var cloud = glow * (0.22 + 1.05 * dens) * (0.8 + 0.2 * smoothstep(0.65, 0.2, n));
  // faint moonlight diffusing through the deck, silver corona on thin cloud near the moon
  let thin = cov * (1.0 - dens);
  let mm = max(md, 0.0);
  let m2 = mm * mm; let m4 = m2 * m2; let m8 = m4 * m4; let m16 = m8 * m8; let m32 = m16 * m16;
  // moonlight: diffuse through the deck, silver on thin cloud edges everywhere, a bright corona near the moon
  cloud += SKY_MOON_COL * F.moon.w * (0.042 + thin * (0.04 + m32 * 0.13 + m8 * 0.02) + (1.0 - dens) * m4 * 0.008);

  // clear sky behind the clouds: gradient, moon halo, moon disk, sparse stars in the gaps
  var clear = skyBase(mix(SKY_HORIZON, SKY_ZENITH, sqrt(y))) + skyMoonHalo(md);
  if (cov < 0.3 && y > 0.03) {
    let sp = dir.xz / (y + 0.35) * 260.0;
    let cell = floor(sp);
    let h = hash21(cell);
    if (h > 0.988) {
      let off = hash22(cell + 7.0) - 0.5;
      let sd = length(sp - cell - 0.5 - off * 0.55);
      let tw = 0.75 + 0.25 * sin(time() * (1.3 + h * 3.0) + h * 40.0);
      let star = smoothstep(0.16, 0.02, sd) * (h - 0.988) * 70.0 * tw * saturate(y * 5.0) * (1.0 - cov / 0.3);
      clear += vec3f(0.75, 0.82, 1.0) * star;
    }
  }
  var c = mix(clear, cloud, cov);
  // moon disk (~0.6 deg) dimmed by the cloud in front of it
  let disk = smoothstep(0.99993, 0.99996, md);
  // while it rains the disc stays hidden behind the overcast; only a diffuse glow shows through
  let rk = smoothstep(0.02, 0.3, F.params.x);
  c += SKY_MOON_COL * disk * exp(-dens * 7.0 * cov) * F.moon.w * 9.5 * (1.0 - rk);
  let m128 = m32 * m32 * m32 * m32;
  c += SKY_MOON_COL * F.moon.w * (m128 * 0.5 + m32 * 0.025) * rk;
  // blend into the horizon haze (continuous with the dir.y <= 0 branch)
  let hb = smoothstep(0.0, 0.12, y);
  c = mix(hz, c + (hz - skyBase(SKY_HORIZON)) * (1.0 - smoothstep(0.0, 0.35, y)) * 0.6, hb);
  return c;
}
`;

export default {
  name: 'sky',
  // Moon intensity follows the camera: low over the city (neon and lamps light the streets, unlit facades
  // fall near black), full in the gardens and mountains where the moon is the only light.
  // (must match SKY_MOON_CITY / SKY_MOON_NATURE in the WGSL)
  moonCity: 0.25,
  moonNature: 1.0,
  init(ctx) {
    this.urban = DISTRICTS.map((d) => d.type !== DT.GARDEN);
    this.nature = -1;
  },
  update(ctx) {
    const c = ctx.cam, w = ctx.world;
    if (!c || !w) return;
    const s = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
    let urban = 0;
    for (let i = 0; i < DISTRICTS.length; i++) if (this.urban[i]) urban = Math.max(urban, w.districtWeight(i, c.x, c.z));
    const target = s(1400, 3600, Math.hypot(c.x - 300, c.z + 300)) * (1 - s(0.1, 0.6, urban));
    // smoothed so flying between districts never pops the lighting
    this.nature = this.nature < 0 || ctx.renderer.resetHistory ? target : this.nature + (target - this.nature) * Math.min(1, ctx.dt * 1.5);
    ctx.env.moonIntensity = this.moonCity + (this.moonNature - this.moonCity) * this.nature;
  },
};
