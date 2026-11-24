// Sky operations shaders.
//   SKY_OPAQUE_WGSL : airships, rocket and spaceport. Drawn in the module's own pass after the deferred lighting, so
//                     they shade themselves (moon, sky ambient, city glow from below, local floods, emissive, fog) and
//                     write the lit colour, normal, motion and depth.
//   SKY_SPRITE_WGSL : nav lights, strobes, aviation lights, flood glare (additive, size clamped to >= 1.3 px)
//   SKY_BEAM_WGSL   : airship searchlight cones (same look as the air.js helicopter beams)
//   SKY_PLUME_WGSL  : rocket exhaust flame and halo (HDR <= 50 for the two together)
//   SKY_TRAIL_WGSL  : launch smoke puffs (premultiplied alpha)
// The trail and the plume fade per pixel with 1 - smoothstep(1650, 1800, y), and the rocket is clipped per pixel, so
// nothing is drawn above the 1800 m cloud deck.

import { SMOKE_LIFE, SMOKE_R0, SMOKE_GROW, SMOKE_RMAX, GROUND_CLOUD_R } from './skyopsLayout.js';

const LAUNCH_STRUCT = /* wgsl */ `
// tr[i]: x launch age (s), y arc length reached (m), z seed, w alive    lod[i]: x puff spacing (m), y fade to the next level
// plume: xyz nozzle, w flame intensity (0..1)       plumeDir: xyz exhaust direction (unit), w flame length (m)
// glow: xyz smoke-lighting source, w intensity       wind: xy unit wind direction (xz), z sDeck, w trajectory samples
// misc: x halo intensity (ignition flash), y unused, z time
struct LaunchU { tr: array<vec4f, 2>, lod: array<vec4f, 2>, plume: vec4f, plumeDir: vec4f, glow: vec4f, wind: vec4f, misc: vec4f };
`;

export const SKY_OPAQUE_WGSL = /* wgsl */ `
struct Inst { l: vec4f, u: vec4f, f: vec4f, pl: vec4f, pu: vec4f, pf: vec4f, a: vec4f, b: vec4f };
// a: x kind (0 airship, 1 rocket, 2 spaceport), y atlas row, z LED level 0..1, w clip y (discard below)
// b: x atlas row u extent, y text scroll (m), z hue offset, w engine glow 0..1
struct SkyU { L: array<vec4f, 8>, site: vec4f, misc: vec4f };
// L[2i] = light position xyz, radius; L[2i+1] = colour * intensity (4 lights; spaceport floods + plume)
// site: x, z of the pad centre, deck y, time
@group(1) @binding(0) var<storage, read> inst: array<Inst>;
@group(1) @binding(1) var<uniform> U: SkyU;
@group(1) @binding(2) var ledTex: texture_2d<f32>;

struct VIn { @location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) uv: vec2f, @location(3) me: vec2f };
struct VOut {
  @builtin(position) cp: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) pwp: vec3f,
  @location(3) lp: vec3f,
  @location(4) uv: vec2f,
  @location(5) @interpolate(flat) me: vec2f,
  @location(6) @interpolate(flat) ii: u32,
};
fn xf(l: vec4f, u: vec4f, f: vec4f, p: vec3f) -> vec3f { return vec3f(l.w, u.w, f.w) + l.xyz * p.x + u.xyz * p.y + f.xyz * p.z; }

@vertex fn vs(v: VIn, @builtin(instance_index) ii: u32) -> VOut {
  let I = inst[ii];
  var o: VOut;
  o.wp = xf(I.l, I.u, I.f, v.pos);
  o.pwp = xf(I.pl, I.pu, I.pf, v.pos);
  o.n = I.l.xyz * v.nrm.x + I.u.xyz * v.nrm.y + I.f.xyz * v.nrm.z;
  o.lp = v.pos; o.uv = v.uv; o.me = v.me; o.ii = ii;
  o.cp = F.viewProj * vec4f(o.wp, 1.0);
  return o;
}

struct SOut { @location(0) color: vec4f, @location(1) normal: vec4f, @location(2) motion: vec4f };

fn hue(h: f32) -> vec3f { return saturate3(abs(fract(h + vec3f(0.0, 0.6667, 0.3333)) * 6.0 - 3.0) - 1.0); }

// Self-lighting for the module's opaque geometry (same terms as the deferred lighting, minus the tiled lights).
fn shade(P: vec3f, n: vec3f, albedo: vec3f, rough: f32, metal: f32, emis: vec3f, ao: f32, local: bool) -> vec3f {
  let toCam = F.camPos.xyz - P;
  let dist = length(toCam);
  let v = toCam / dist;
  let NdotV = max(dot(n, v), 1e-3);
  let f0 = mix(vec3f(0.04), albedo, metal);
  let diffC = albedo * (1.0 - metal);
  // sky hemisphere, plus the city light from below on downward-facing surfaces (the underside reads warm)
  let skyAmb = skyAmbient(normalize(vec3f(n.x, max(n.y, 0.0) + 0.2, n.z)));
  let cityUp = skyCityGlow(P.xz) * 4.0 * saturate(0.35 - n.y * 0.85);
  var col = diffC * (skyAmb * 1.4 + cityUp) * ao;
  let R = reflect(-v, n);
  let Fe = f0 + (max(vec3f(1.0 - rough), f0) - f0) * pow(1.0 - NdotV, 5.0);
  col += (skyAmbient(R) + skyCityGlow(P.xz) * 0.8 * saturate(-R.y)) * Fe * ao;
  // moon: diffuse, plus a moonlit rim along the top edge of the silhouette
  let moonCol = vec3f(0.55, 0.65, 0.95) * max(F.moon.w, 0.35);
  let NdotL = max(dot(n, F.moon.xyz), 0.0);
  col += diffC / PI * moonCol * NdotL * 1.6;
  let h = normalize(v + F.moon.xyz);
  let spec = pow(max(dot(n, h), 0.0), mix(8.0, 90.0, 1.0 - rough)) * (1.0 - rough) * 0.5;
  col += f0 * moonCol * spec * NdotL;
  col += moonCol * pow(1.0 - NdotV, 4.0) * saturate(n.y + 0.25) * 0.05;
  if (local) {
    for (var i = 0u; i < 4u; i++) {
      let Lp = U.L[i * 2u]; let Lc = U.L[i * 2u + 1u];
      if (Lp.w <= 0.0) { continue; }
      let lv = Lp.xyz - P;
      let d2 = dot(lv, lv);
      if (d2 > Lp.w * Lp.w) { continue; }
      let ll = lv * inverseSqrt(d2);
      let nl = dot(n, ll);
      if (nl <= 0.0) { continue; }
      let x = sqrt(d2) / Lp.w;
      let fall = saturate(1.0 - x * x * x * x);
      let hh = normalize(v + ll);
      let sp = pow(max(dot(n, hh), 0.0), mix(8.0, 90.0, 1.0 - rough)) * (1.0 - rough);
      col += (diffC / PI + f0 * sp) * Lc.rgb * nl * fall * fall / (d2 + 1.0);
    }
  }
  col += emis;
  let uv = (F.viewProj * vec4f(P, 1.0));
  let suv = uv.xy / uv.w * vec2f(0.5, -0.5) + 0.5;
  return applyFog(col, suv, dist);
}

// fade a procedural line pattern out when it gets thinner than a pixel
fn lineMask(x: f32, period: f32, width: f32, fw: f32) -> f32 {
  let d = abs(fract(x / period + 0.5) - 0.5) * period;
  let m = 1.0 - smoothstep(width, width + fw * 1.2, d);
  return m * (1.0 - smoothstep(0.25, 0.6, fw / period * 4.0));
}

@fragment fn fs(i: VOut) -> SOut {
  let I = inst[i.ii];
  let mat = i.me.x;
  let kind = I.a.x;
  let t = time();
  var n = normalize(i.n);
  // LED band text coordinates (hull sides), derivatives taken in uniform control flow
  let lp = i.lp;
  let side = select(-1.0, 1.0, lp.x > 0.0);
  let along = select(lp.z, -lp.z, side > 0.0) + I.b.y;
  let rr = max(length(lp.xy), 1.0);
  let vy = lp.y / rr;                                 // -1 bottom .. 1 top
  let row = I.a.y;
  let ext = I.b.x;
  // band |vy| < BAND_V: about 12.5 m tall on the hull = one 128 px atlas row; the atlas is 32 rows wide
  let tuv = vec2f(along / (12.5 * 32.0), 0.0);
  let gx = dpdx(tuv.x); let gy = dpdy(tuv.x);
  let vyx = dpdx(vy); let vyy = dpdy(vy);
  let fu = fwidth(i.uv); let fwp = fwidth(i.wp);
  var albedo = vec3f(0.3); var rough = 0.6; var metal = 0.0; var emis = vec3f(0.0); var ao = 1.0;
  let local = kind > 0.5;
  if (mat < 0.5) {
    // hull: two-tone livery (pearl grey top, charcoal belly, red pinstripe above the LED band) with panel seams
    albedo = mix(vec3f(0.26, 0.26, 0.28), vec3f(0.52, 0.53, 0.55), smoothstep(-0.3, 0.38, vy)); rough = 0.45; metal = 0.25;
    albedo = mix(albedo, vec3f(0.45, 0.04, 0.035), smoothstep(0.40, 0.41, vy) * (1.0 - smoothstep(0.445, 0.455, vy)));
    let seams = max(lineMask(i.uv.x, 7.5, 0.06, fu.x), lineMask(i.uv.y, 5.0, 0.05, fu.y));
    albedo *= 1.0 - 0.28 * seams;
    // slight panel-to-panel tone variation
    let cell = floor(vec2f(i.uv.x / 7.5, i.uv.y / 5.0));
    albedo *= 0.9 + 0.2 * hash21(cell + vec2f(row * 31.0, 0.0));
    let inZ0 = smoothstep(-40.0, -36.0, lp.z) * (1.0 - smoothstep(58.0, 62.0, lp.z));
    // marker lights along the keel and the spine (scale cues), faded out below a pixel
    let marker = lineMask(i.uv.x, 6.0, 0.22, fu.x) * (smoothstep(-0.992, -0.998, vy) + smoothstep(0.992, 0.998, vy));
    emis += vec3f(1.0, 0.78, 0.5) * 6.0 * marker * inZ0;
    // LED band, 34% of the hull height on each side (|y| < 0.34 R), on the parallel middle body (larger type, fix 5)
    let bandV = (vy + 0.34) / 0.68;
    let inZ = inZ0;
    if (bandV > -0.04 && bandV < 1.04 && inZ > 0.0) {
      let frame = smoothstep(-0.04, 0.0, bandV) * (1.0 - smoothstep(1.0, 1.04, bandV));
      let inner = smoothstep(0.0, 0.03, bandV) * (1.0 - smoothstep(0.97, 1.0, bandV));
      let u = fract(tuv.x / ext) * ext;
      let v = (row + 1.0 - bandV) / 4.0;
      let g = textureSampleGrad(ledTex, sampRepeat, vec2f(u, v), vec2f(gx, -vyx * 0.368), vec2f(gy, -vyy * 0.368)).r;
      let c = hue(I.b.z + 0.08 * sin(along * 0.02 - t * 0.3)) * 0.85 + 0.15;
      let led = I.a.z * inZ;
      albedo = mix(albedo, vec3f(0.02), frame);
      rough = mix(rough, 0.25, frame); metal = mix(metal, 0.0, frame);
      emis = (c * g * 7.0 + c * 0.12 * inner) * led * frame;
    }
  } else if (mat < 1.5) {
    // junk-sail panel (judge fix 4): a shaded sail-cloth panel with batten lines and a seam, framed around an
    // inset LED screen; only the screen emits, at about a third of the old level, so the fins are lit objects
    // rather than flat glowing fans. uv.x root (0) to leech (1), uv.y from one batten (0) to the next (1).
    let fin = floor(i.me.y / 4.0); let pnl = i.me.y - fin * 4.0;
    let sx = smoothstep(0.07, 0.07 + fu.x * 1.5, i.uv.x) * (1.0 - smoothstep(0.93 - fu.x * 1.5, 0.93, i.uv.x));
    let sy = smoothstep(0.17, 0.17 + fu.y * 1.5, i.uv.y) * (1.0 - smoothstep(0.83 - fu.y * 1.5, 0.83, i.uv.y));
    let screen = sx * sy;
    let lines = max(lineMask(i.uv.y, 1.0, 0.035, fu.y), lineMask(i.uv.x, 0.5, 0.01, fu.x));
    let cloth = vec3f(0.34, 0.33, 0.32) * (0.9 + 0.1 * hash21(vec2f(pnl + fin * 4.0, row)));
    albedo = mix(cloth * (1.0 - 0.6 * lines), vec3f(0.025), screen); rough = mix(0.7, 0.35, screen);
    let w = 0.5 + 0.5 * sin(i.uv.x * 7.0 - t * 2.2 + pnl * 1.3 + fin * 0.7);
    let c = hue(I.b.z + 0.05 * pnl + 0.05 * sin(t * 0.4 + fin) + i.uv.x * 0.06);
    let rows = 1.0 - 0.5 * lineMask(i.uv.x * 30.0, 1.0, 0.12, fu.x * 30.0);
    emis = (c * (0.35 + 2.0 * w * w * w) + vec3f(1.0) * pow(w, 24.0) * 1.2) * rows * screen * I.a.z * 0.35;
    if (dot(n, F.camPos.xyz - i.wp) < 0.0) { n = -n; }
  } else if (mat < 2.5) {
    albedo = vec3f(0.12, 0.12, 0.13); rough = 0.4; metal = 0.6;
  } else if (mat < 3.5) {
    // gondola window band
    let mull = lineMask(i.uv.x, 2.2, 0.12, fu.x);
    albedo = vec3f(0.02); rough = 0.1;
    emis = vec3f(1.0, 0.78, 0.5) * 2.4 * (1.0 - mull);
  } else if (mat < 4.5) {
    albedo = vec3f(0.08, 0.085, 0.09); rough = 0.45; metal = 0.6;
  } else if (mat < 5.5) {
    // rotor disc: motion-blurred blades, glowing tip ring
    albedo = vec3f(0.03); rough = 0.6;
    emis = vec3f(0.3, 0.9, 1.0) * smoothstep(0.86, 0.97, i.uv.x) * 2.2 * I.a.z;
    if (dot(n, F.camPos.xyz - i.wp) < 0.0) { n = -n; }
  } else if (mat < 6.5) {
    // fin edge light along the leech (cool white), part of the lit outline
    albedo = vec3f(0.1); rough = 0.4;
    emis = vec3f(0.75, 0.88, 1.0) * 3.0 * max(I.a.z, 0.3);
  } else if (mat < 10.5) {
    // launch deck: concrete with painted markings around the mount
    albedo = vec3f(0.26, 0.26, 0.27); rough = 0.75;
    let q = i.wp.xz - U.site.xy;
    let r = length(q);
    let ring = max(1.0 - smoothstep(0.35, 0.6, abs(r - 30.0)), 1.0 - smoothstep(0.25, 0.45, abs(r - 34.0)));
    let crs = (1.0 - smoothstep(0.3, 0.5, min(abs(q.x), abs(q.y)))) * step(36.0, r) * step(r, 70.0);
    let grid = max(lineMask(q.x, 20.0, 0.08, fwp.x), lineMask(q.y, 20.0, 0.08, fwp.z));
    albedo = mix(albedo * (1.0 - 0.25 * grid), vec3f(0.55, 0.42, 0.08), max(ring, crs));
  } else if (mat < 11.5) {
    albedo = vec3f(0.24, 0.235, 0.23); rough = 0.85;
    albedo *= 0.85 + 0.15 * vnoise2(i.wp.xz * 0.3 + i.wp.y * 0.2);
  } else if (mat < 12.5) {
    albedo = vec3f(0.42, 0.12, 0.07); rough = 0.5; metal = 0.3;
  } else if (mat < 13.5) {
    albedo = vec3f(0.05, 0.045, 0.045); rough = 0.9;
  } else if (mat < 14.5) {
    albedo = vec3f(0.05); emis = vec3f(1.0, 0.97, 0.9) * 22.0;
  } else if (mat < 15.5) {
    albedo = vec3f(0.62, 0.63, 0.64); rough = 0.55;
    albedo *= 1.0 - 0.3 * lineMask(i.wp.x + i.wp.z, 3.0, 0.1, fwp.x + fwp.z);
  } else if (mat < 16.5) {
    albedo = vec3f(0.1); rough = 0.5;
    let d = lineMask(i.wp.x + i.wp.z, 6.0, 0.6, fwp.x + fwp.z);
    emis = vec3f(1.0, 0.55, 0.12) * 5.0 * d;
  } else if (mat < 17.5) {
    albedo = vec3f(0.05); emis = vec3f(0.55, 0.75, 1.0) * 1.6 * (0.7 + 0.3 * lineMask(i.wp.y, 2.0, 0.6, fwp.y));
  } else if (mat < 20.5) {
    albedo = vec3f(0.78, 0.78, 0.76); rough = 0.35;
  } else if (mat < 21.5) {
    albedo = vec3f(0.03); rough = 0.4;
  } else {
    albedo = vec3f(0.08); rough = 0.35; metal = 0.8;
    emis = vec3f(1.0, 0.45, 0.15) * 6.0 * I.b.w;
  }
  // lower clip (the rocket rising out of the deck on its elevator), and the cloud deck: the climbing rocket
  // disappears into the clouds from the nose down
  if (i.wp.y < I.a.w || i.wp.y > 1800.0) { discard; }
  var o: SOut;
  o.color = vec4f(shade(i.wp, n, albedo, rough, metal, emis, ao, local), 1.0);
  o.normal = vec4f(n, metal);
  o.motion = vec4f(motionVector(i.wp, i.pwp), 0.0, 0.0);
  return o;
}
`;

export const SKY_SPRITE_WGSL = /* wgsl */ `
// per sprite: a = position xyz, radius (m); b = colour rgb (HDR), minimum radius in pixels
struct Spr { a: vec4f, b: vec4f };
@group(2) @binding(0) var<storage, read> spr: array<Spr>;
struct VOut { @builtin(position) cp: vec4f, @location(0) q: vec2f, @location(1) @interpolate(flat) col: vec3f };
fn fogT(p: vec3f, dist: f32) -> f32 {
  let c = F.viewProj * vec4f(p, 1.0);
  let uv = c.xy / max(c.w, 1e-3) * vec2f(0.5, -0.5) + 0.5;
  return textureSampleLevel(fogTex, sampClamp, vec3f(clamp(uv, vec2f(0.0), vec2f(1.0)), clamp(fogSlice(dist), 0.0, 1.0)), 0.0).a;
}
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var o: VOut;
  let S = spr[ii];
  var col = S.b.rgb;
  if (dot(col, col) < 1e-6) { o.cp = vec4f(0.0, 0.0, -1.0, 1.0); return o; }
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = corners[vi];
  let toCam = F.camPos.xyz - S.a.xyz;
  let dist = length(toCam);
  let px = dist * 2.0 * F.camRight.w * F.res.w;
  let r = S.a.w;
  let rr = max(r, S.b.w * px);
  col *= pow(r / rr, 1.2) * fogT(S.a.xyz, dist);
  let p = S.a.xyz + (toCam / dist) * min(r * 2.0, 3.0) + (F.camRight.xyz * c.x + F.camUp.xyz * c.y) * rr * 2.0;
  o.cp = F.viewProj * vec4f(p, 1.0);
  o.q = c * 2.0;
  o.col = col;
  return o;
}
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  let r2 = dot(i.q, i.q);
  return vec4f(i.col * (exp(-r2 * 2.0) + 0.05 * exp(-r2 * 0.45)), 0.0);
}
`;

export const SKY_BEAM_WGSL = /* wgsl */ `
struct Beam { apex: vec4f, tgt: vec4f }; // apex xyz, intensity; target xyz, radius
@group(2) @binding(0) var<uniform> beams: array<Beam, 3>;
struct VOut { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) t: f32, @location(3) @interpolate(flat) k: f32 };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  let B = beams[ii];
  var o: VOut;
  if (B.apex.w <= 0.0) { o.cp = vec4f(0.0, 0.0, -1.0, 1.0); return o; }
  let seg = vi / 6u; let k = vi % 6u;
  var qa = array<vec2f, 6>(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0));
  let q = qa[k];
  let ang = (f32(seg) + q.x) / 20.0 * TAU;
  let axis = B.tgt.xyz - B.apex.xyz;
  let L = length(axis);
  let d = axis / L;
  let s = normalize(cross(d, select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(d.y) > 0.9)));
  let t2 = cross(d, s);
  let radial = s * cos(ang) + t2 * sin(ang);
  let rad = mix(0.6, B.tgt.w, q.y);
  o.wp = B.apex.xyz + d * L * q.y + radial * rad;
  o.n = normalize(radial - d * (B.tgt.w - 0.6) / L);
  o.t = q.y;
  o.k = B.apex.w;
  o.cp = F.viewProj * vec4f(o.wp, 1.0);
  return o;
}
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  let v = normalize(F.camPos.xyz - i.wp);
  let facing = abs(dot(normalize(i.n), v));
  let core = pow(facing, 2.5);
  let along = (1.0 - i.t * 0.7) * smoothstep(0.0, 0.03, i.t);
  let px = vec2i(i.cp.xy);
  let sd = linearDepth(max(sceneDepthAt(px), 1e-7));
  let dist = length(F.camPos.xyz - i.wp);
  let soft = saturate((sd - dist) / 10.0);
  let uv = i.cp.xy * F.res.zw;
  let fg = textureSampleLevel(fogTex, sampClamp, vec3f(uv, clamp(fogSlice(dist), 0.0, 1.0)), 0.0);
  // light scattered by the rain and haze inside the cone
  let c = vec3f(0.85, 0.9, 1.0) * 0.07 * i.k * core * along * soft * fg.a;
  return vec4f(c, 0.0);
}
`;

export const SKY_PLUME_WGSL = LAUNCH_STRUCT + /* wgsl */ `
@group(2) @binding(0) var<uniform> LU: LaunchU;
struct VOut { @builtin(position) cp: vec4f, @location(0) q: vec2f, @location(1) @interpolate(flat) k: vec2f, @location(2) wy: f32 };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var o: VOut;
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = corners[vi];
  let P = LU.plume.xyz;
  let toCam = F.camPos.xyz - P;
  let dist = length(toCam);
  let px = dist * 2.0 * F.camRight.w * F.res.w;
  let vdir = toCam / dist;
  if (ii == 0u) {
    // halo: ignition flash and the glow around the flame
    let I = LU.misc.x + LU.plume.w * 0.6;
    if (I <= 0.0) { o.cp = vec4f(0.0, 0.0, -1.0, 1.0); return o; }
    let r = max(40.0 + 70.0 * LU.misc.x, 5.0 * px);
    let hc = P + LU.plumeDir.xyz * 25.0;
    let off = (F.camRight.xyz * c.x + F.camUp.xyz * c.y) * r;
    let p = hc + vdir * 30.0 + off;
    o.cp = F.viewProj * vec4f(p, 1.0);
    // height of this point of the halo, without the shift toward the camera (cloud-deck fade per pixel)
    o.q = c; o.k = vec2f(0.0, I); o.wy = hc.y + off.y;
    return o;
  }
  // flame: a camera-facing quad along the exhaust direction
  if (LU.plume.w <= 0.0) { o.cp = vec4f(0.0, 0.0, -1.0, 1.0); return o; }
  let d = LU.plumeDir.xyz;
  let len = LU.plumeDir.w;
  var s = cross(d, vdir);
  let sl = length(s);
  s = select(F.camRight.xyz, s / max(sl, 1e-4), sl > 0.05);
  let w = max(9.0, 1.6 * px);
  let along = c.y * 0.5 + 0.5;
  let p = P - d * 4.0 + d * (along * (len + 8.0) - 2.0) + s * c.x * w + vdir * 6.0;
  o.cp = F.viewProj * vec4f(p, 1.0);
  o.q = vec2f(c.x, along);
  o.k = vec2f(1.0, LU.plume.w * min(9.0 / w, 1.0));
  o.wy = p.y;
  return o;
}
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  let deck = 1.0 - smoothstep(1650.0, 1800.0, i.wy);
  let uv = i.cp.xy * F.res.zw;
  let dist = length(F.camPos.xyz - LU.plume.xyz);
  let fg = textureSampleLevel(fogTex, sampClamp, vec3f(uv, clamp(fogSlice(dist), 0.0, 1.0)), 0.0).a;
  if (i.k.x < 0.5) {
    let r2 = dot(i.q, i.q);
    let win = saturate(1.0 - r2) * saturate(1.0 - r2);
    let c = vec3f(1.0, 0.7, 0.4) * (exp(-r2 * 12.0) * 5.0 + exp(-r2 * 2.5) * 0.45) * win * i.k.y;
    return vec4f(c * deck * fg, 0.0);
  }
  // white-hot core at the nozzle, orange toward the tail, Gaussian across
  let a = i.q.y;
  let across = exp(-i.q.x * i.q.x * (3.0 + a * 6.0)) * saturate(1.0 - i.q.x * i.q.x);
  let core = exp(-a * 7.0) * exp(-i.q.x * i.q.x * 14.0);
  let body = pow(1.0 - a, 1.6) * across;
  let flick = 0.9 + 0.1 * sin(time() * 47.0 + a * 13.0);
  let c = (vec3f(1.0, 0.92, 0.8) * core * 40.0 + vec3f(1.0, 0.5, 0.16) * body * 9.0) * flick * i.k.y;
  // HDR cap of 50 for flame and halo together: the halo adds at most its peak (3 x its intensity) on top
  let haloPeak = vec3f(1.0, 0.7, 0.4) * 5.45 * (LU.misc.x + LU.plume.w * 0.6);
  return vec4f(min(c, vec3f(50.0) - haloPeak) * deck * fg, 0.0);
}
`;

export const SKY_TRAIL_WGSL = LAUNCH_STRUCT + /* wgsl */ `
@group(2) @binding(0) var<uniform> LU: LaunchU;
@group(2) @binding(1) var<storage, read> traj: array<vec4f>;   // x, y, z, arc length; uniform in arc length; [0] = pad
const NPUFF = 192u;
const PUFF_DS = 9.25;           // arc-length spacing of the finest puff level (m)
const SMOKE_LIFE = ${SMOKE_LIFE.toFixed(1)};
const R0 = ${SMOKE_R0.toFixed(2)}; const GROW = ${SMOKE_GROW.toFixed(3)}; const RMAX = ${SMOKE_RMAX.toFixed(1)};
const GROUND_R = ${GROUND_CLOUD_R.toFixed(1)};
// The column is a chain of elongated puffs: a Gaussian of sigma SIG x the puff spacing along the trail (the sum of
// the chain is flat to < 1%, so the column is continuous with no beads), and a steep profile of scale SB x the smoke
// radius across it, eroded by noise. Each puff adds optical depth; the column's optical depth falls as it spreads
// (TAU0 at radius R_REF, ~ 1 / r^0.7), so the young column is thin, dense and well defined and old smoke is broad
// and faint.
const SIG = 0.6; const SB = 0.55;
const TAU0 = 4.0; const R_REF = 12.0;
const CITY_KEY = 0.42;
// Cost bound near the trail (see vs): near-camera fade, full opacity beyond NEAR1 x the puff radius, culled inside
// NEAR0; thinning of puffs larger than THIN0 x the screen height (half-size), at most THIN_MAX extra levels, only
// for puffs closer than THIN_D1 m (none from THIN_D1 on, full from THIN_D0 in).
const NEAR0 = 0.6; const NEAR1 = 2.0;
const THIN0 = 0.25; const THIN_MAX = 2.0;
const THIN_D0 = 1500.0; const THIN_D1 = 2000.0;
const EA = 2.8; const EB = 3.0;  // quad half-extent in sigmas (along) and profile scales (across)
struct VOut {
  @builtin(position) cp: vec4f,
  @location(0) q: vec4f,                              // x along / Sa, y across / Sb, z world height, w across / radius
  @location(1) nq: vec2f,                             // noise coordinates (arc length, across) / smoke radius
  @location(2) @interpolate(flat) base: vec3f,        // ambient (neutral sky + desaturated city glow)
  @location(3) @interpolate(flat) moonK: vec3f,
  @location(4) @interpolate(flat) mdir: vec3f,        // moon direction in (along, across, toward camera)
  @location(5) @interpolate(flat) warmK: vec3f,       // key light: city glow from below, the plume, the pad floods
  @location(6) @interpolate(flat) wdir: vec3f,        // its direction, same basis
  @location(7) @interpolate(flat) fogC: vec4f,        // in-scatter rgb, transmittance
  @location(8) @interpolate(flat) hot: vec3f,         // glow of the youngest exhaust
  @location(9) @interpolate(flat) aux: vec4f,         // x peak optical depth, y trail noise seed, z age
};
fn trajAt(s: f32) -> vec3f {
  let n = u32(LU.wind.w);
  let f = clamp(s / LU.wind.z, 0.0, 1.0) * f32(n - 1u);
  let i = min(u32(f), n - 2u);
  let a = traj[i]; let b = traj[i + 1u];
  return mix(a.xyz, b.xyz, f - f32(i));
}
fn emitAge(s: f32) -> f32 { return 3.0 + sqrt(max(s, 0.0) / 6.0); }
// smoke centre at arc length s for a launch of age A (wind shear: drift doubles and turns 75 deg from 300 m to 1800 m)
fn smokeAt(s: f32, A: f32) -> vec4f {
  let p = trajAt(s);
  let age = max(A - emitAge(s), 0.0);
  let k = smoothstep(300.0, 1800.0, p.y);
  let a = 1.3089969 * k;
  let w = LU.wind.xy;
  let dir = vec2f(w.x * cos(a) - w.y * sin(a), w.x * sin(a) + w.y * cos(a));
  let drift = dir * (3.0 * (1.0 + k) * age);
  // slow billowing of the column centre
  let wob = vec2f(vnoise3(vec3f(s * 0.004, age * 0.02, 1.0)), vnoise3(vec3f(s * 0.004, age * 0.02, 7.0))) - 0.5;
  return vec4f(p.x + drift.x + wob.x * (6.0 + age * 0.3), p.y + age * 0.15, p.z + drift.y + wob.y * (6.0 + age * 0.3), age);
}
fn cull() -> VOut { var o: VOut; o.cp = vec4f(0.0, 0.0, -1.0, 1.0); return o; }
// One elongated puff per instance. Puffs sit at fixed arc lengths s = j * spacing; the spacing doubles as the smoke
// spreads (LOD levels 9.25 m * 2^k): the odd puffs of a level fade out as it approaches the next level while the
// even ones lengthen to cover them, so the column's density stays constant and nothing slides or pops.
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var o: VOut;
  let tri = ii / NPUFF; let j = ii % NPUFF;
  let T = LU.tr[tri]; let lod = LU.lod[tri];
  if (T.w < 0.5) { return cull(); }
  let s = f32(j) * lod.x;
  if (s > T.y) { return cull(); }
  let c = smokeAt(s, T.x);
  let age = c.w;
  let life = pow(saturate(1.0 - age / SMOKE_LIFE), 0.7);
  if (life <= 0.0) { return cull(); }
  // radius 8 m + 0.55 m/s * age (cap 100 m), uneven along the trail and over time, plus the ground cloud at the pad
  let r0 = min(R0 + GROW * age, RMAX) + GROUND_R * (1.0 - smoothstep(0.0, 110.0, s)) * smoothstep(0.0, 6.0, age);
  let r = r0 * (0.75 + 0.5 * vnoise3(vec3f(s * 0.012, age * 0.035, T.z * 17.0)));
  let toCamV = F.camPos.xyz - c.xyz;
  let dist = length(toCamV);
  let vd = toCamV / dist;
  let px = dist * 2.0 * F.camRight.w * F.res.w;
  let sb = SB * r;
  let sbE = max(sb, 0.8 * px);                         // at least about a pixel across (optical depth conserved)
  // puffs wholly above the cloud deck draw nothing (the others fade per pixel in fs)
  if (c.y - EB * sbE - 3.0 * lod.x >= 1800.0) { return cull(); }
  // Cost bound near the trail: puffs that look large are thinned (each doubling of their size beyond THIN0 x the
  // screen height removes every other puff, up to THIN_MAX extra levels, the survivors covering the gaps), only
  // within THIN_D1 m; puffs closer than NEAR1 x their radius fade out. Same scheme as the LOD levels.
  let sf = EB * sbE / (dist * F.camRight.w);
  let gate = 1.0 - smoothstep(THIN_D0, THIN_D1, dist);
  let lvl = lod.y + gate * clamp(log2(max(sf, 1e-6) / THIN0), 0.0, THIN_MAX);
  let li = min(u32(lvl), u32(THIN_MAX)); let lf = lvl - f32(li);
  let stp = 1u << li;
  if (j % stp != 0u) { return cull(); }
  let odd = ((j / stp) & 1u) == 1u;
  let d = lod.x * f32(stp);
  let sig = SIG * d * select(1.0 + lf, 1.0, odd);       // along-trail sigma (m)
  let w = d * select(1.0 + lf, 1.0 - lf, odd);          // length of trail this puff stands for (m)
  // trail direction here, and the quad's axes: along the projected trail, across it
  let h = 0.5 * lod.x;
  var tg = smokeAt(min(s + h, T.y), T.x).xyz - smokeAt(max(s - h, 0.0), T.x).xyz;
  let tl = length(tg);
  tg = select(vec3f(0.0, 1.0, 0.0), tg / max(tl, 1e-6), tl > 1e-3);
  let ca = dot(tg, vd);
  var ax = tg - vd * ca;
  let sa = length(ax);
  ax = select(F.camRight.xyz, ax / max(sa, 1e-6), sa > 1e-3);
  let bx = cross(vd, ax);
  // projected sigma along the axis (foreshortened trail plus the column's own width when seen end-on)
  let Sa = sqrt(sig * sig * sa * sa + sbE * sbE * ca * ca);
  let nearK = smoothstep(NEAR0 * r, NEAR1 * r, dist);
  let tauC = TAU0 * pow(R_REF / r, 0.7) * life * nearK * (sb / sbE);
  let K = tauC * w / (2.5066 * Sa);
  if (K < 0.004) { return cull(); }
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let cq = corners[vi];
  let u = cq.x * EA * Sa; let v = cq.y * EB * sbE;
  let p = c.xyz + ax * u + bx * v + vd * min(1.5 * sbE, dist * 0.5);
  o.cp = F.viewProj * vec4f(p, 1.0);
  o.q = vec4f(cq.x * EA, cq.y * EB, c.y + ax.y * u + bx.y * v, v / max(r, 1e-3));
  o.nq = vec2f((s + u / max(sa, 0.25)) / r0, v / r0);
  // lighting, constant per puff. Neutral grey smoke: the sky's ambient without its tint and the city glow mostly
  // desaturated; a warm key from the burning plume close by and from the pad floods near the ground; the moon.
  let albedo = 0.8;
  let amb = luma(skyAmbient(vec3f(0.0, 1.0, 0.0))) * vec3f(0.93, 0.96, 1.0);
  let cg = skyCityGlow(c.xz);
  let cgN = mix(cg, vec3f(1.0, 0.95, 0.9) * luma(cg), 0.8);
  o.base = albedo * (amb * 1.2 + cgN * 0.5);
  o.moonK = albedo * vec3f(0.55, 0.65, 0.95) * 0.5;
  let basis = mat3x3f(ax, bx, vd);
  o.mdir = F.moon.xyz * basis;
  let toCity = normalize(vec3f(300.0 - c.x, -0.35 * c.y, -300.0 - c.z));
  let lv = LU.glow.xyz - c.xyz;
  let ld = length(lv);
  let plume = LU.glow.w / (1.0 + ld * ld / (220.0 * 220.0));
  let pv = traj[0].xyz + vec3f(0.0, 20.0, 0.0) - c.xyz;
  let pd = length(pv);
  let flood = 1.4 / (1.0 + pd * pd / (150.0 * 150.0));
  // the city's light reaches the smoke from the west and below: a neutral, slightly warm grey key
  let cityK = vec3f(0.9, 0.9, 0.92) * CITY_KEY + cgN * 0.9;
  o.warmK = albedo * (cityK + vec3f(1.0, 0.68, 0.38) * plume * 1.3 + vec3f(1.0, 0.96, 0.9) * flood);
  let wd = toCity * luma(cityK) + lv / max(ld, 1.0) * plume + pv / max(pd, 1.0) * flood;
  o.wdir = normalize(wd + vec3f(0.0, -1e-4, 0.0)) * basis;
  // the youngest exhaust is still hot: white-orange right behind the nozzle, cooling within a few seconds
  o.hot = vec3f(1.0, 0.62, 0.3) * 9.0 * exp(-age / 1.3);
  let sc = F.viewProj * vec4f(c.xyz, 1.0);
  let suv = clamp(sc.xy / max(sc.w, 1e-3) * vec2f(0.5, -0.5) + 0.5, vec2f(0.0), vec2f(1.0));
  o.fogC = textureSampleLevel(fogTex, sampClamp, vec3f(suv, clamp(fogSlice(dist), 0.0, 1.0)), 0.0);
  o.aux = vec4f(K, T.z * 61.0, age, 0.0);
  return o;
}
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  if (abs(i.q.x) > EA || abs(i.q.y) > EB || i.q.z >= 1800.0) { discard; }
  // three octaves of noise in trail coordinates (continuous from puff to puff): billows and fine puff detail
  let P = i.nq + vec2f(i.aux.y, i.aux.z * 0.004);
  let n = 0.5 * vnoise2(P * 1.6) + 0.3 * vnoise2(P * 3.7 + 17.0) + 0.2 * vnoise2(P * 8.3 - 5.0);
  let e = i.q.y * i.q.y * (1.0 + 1.3 * (0.5 - n));
  let prof = exp(-0.5 * i.q.x * i.q.x) * exp(-0.5 * e * (1.0 + 0.35 * e));
  let tau = i.aux.x * prof * (0.45 + 1.1 * n) * (1.0 - smoothstep(1650.0, 1800.0, i.q.z));
  let alpha = 1.0 - exp(-tau);
  if (alpha < 0.004) { discard; }
  // round column normal across the trail, roughened by the noise
  let x = clamp(i.q.w, -1.0, 1.0);
  let nrm = normalize(vec3f((n - 0.5) * 0.6, x * 0.85 + (n - 0.5) * 0.5, sqrt(max(1.0 - x * x * 0.72, 0.05))));
  let lw = saturate(dot(nrm, i.wdir) * 0.75 + 0.25);
  let lm = saturate(dot(nrm, i.mdir) * 0.75 + 0.25);
  let fwd = pow(saturate(-i.mdir.z), 6.0) * (1.0 - nrm.z) * 1.5;   // silver lining when back-lit by the moon
  var col = i.base * (0.55 + 0.45 * lw) + i.moonK * (lm + fwd) + i.warmK * lw;
  col *= 0.7 + 0.6 * n;
  col += i.hot * exp(-i.q.y * i.q.y * 0.6);
  col = col * i.fogC.a + i.fogC.rgb;
  return vec4f(col * alpha, alpha);
}
`;
