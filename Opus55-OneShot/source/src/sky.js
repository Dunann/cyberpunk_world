// Night sky. SKY_WGSL is compiled into the shared frame code (see common.js), so every shader can call:
//   skyRadiance(dir)  full sky with moon, stars and clouds (used for background pixels and sharp reflections)
//   skyAmbient(dir)   cheap smooth version (used for ambient light and rough reflections)
// It may only use WGSL_LIB functions and the Frame uniform F.

export const SKY_WGSL = /* wgsl */ `
fn skyBase(dir: vec3f) -> vec3f {
  let y = dir.y;
  let horizon = vec3f(0.10, 0.055, 0.12);   // purple city glow near horizon
  let zenith = vec3f(0.006, 0.010, 0.028);
  let glow = vec3f(0.30, 0.10, 0.16) * exp(-max(y, 0.0) * 9.0); // light pollution band
  var c = mix(horizon, zenith, pow(saturate(y), 0.45)) + glow * 0.5;
  if (y < 0.0) { c = mix(horizon * 0.8, vec3f(0.02, 0.012, 0.03), saturate(-y * 4.0)); }
  return c;
}

fn skyAmbient(dir: vec3f) -> vec3f {
  let m = F.moon.xyz;
  let md = max(dot(dir, m), 0.0);
  return skyBase(dir) + vec3f(0.05, 0.07, 0.11) * pow(md, 6.0) * F.moon.w;
}

fn skyRadiance(dir: vec3f) -> vec3f {
  var c = skyBase(dir);
  let m = F.moon.xyz;
  let md = dot(dir, m);
  // moon disk + halo
  c += vec3f(1.6, 1.7, 1.9) * smoothstep(0.99985, 0.99992, md) * 6.0;
  c += vec3f(0.08, 0.10, 0.16) * pow(max(md, 0.0), 300.0) * 2.0;
  c += vec3f(0.03, 0.04, 0.07) * pow(max(md, 0.0), 12.0);
  // stars
  if (dir.y > 0.02) {
    let sp = dir.xz / (dir.y + 0.35) * 220.0;
    let cell = floor(sp);
    let h = hash21(cell);
    let off = hash22(cell + 7.0) - 0.5;
    let d = length(fract(sp) - 0.5 - off * 0.6);
    let star = smoothstep(0.08, 0.0, d) * step(0.985, h) * (0.5 + 0.5 * sin(time() * (2.0 + h * 5.0) + h * 40.0));
    c += vec3f(0.8, 0.85, 1.0) * star * 0.6 * saturate(dir.y * 4.0);
  }
  // drifting cloud layer
  if (dir.y > 0.0) {
    let cp = dir.xz / (dir.y + 0.08) * 1.4 + vec2f(time() * 0.004, time() * 0.0015);
    let n = fbm2(cp, 5) * 0.5 + 0.5;
    let cov = smoothstep(0.45, 0.85, n);
    let lit = vec3f(0.10, 0.06, 0.11) * (1.0 + 2.0 * exp(-dir.y * 6.0)) + vec3f(0.04, 0.05, 0.08) * pow(max(md, 0.0), 8.0) * 3.0;
    c = mix(c, lit, cov * saturate(dir.y * 6.0) * 0.9);
  }
  return c;
}
`;

export default {
  name: 'sky',
};
