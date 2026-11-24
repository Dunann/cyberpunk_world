// Sky operations shaders.
//   SKY_OPAQUE_WGSL : airships, rocket and spaceport. Drawn in the module's own pass after the deferred lighting, so
//                     they shade themselves (moon, sky ambient, city glow from below, local floods, emissive, fog) and
//                     write the lit colour, normal, motion and depth.
//   SKY_SPRITE_WGSL : nav lights, strobes, aviation lights, flood glare (additive, size clamped to >= 1.3 px)
//   SKY_BEAM_WGSL   : airship searchlight cones (same look as the air.js helicopter beams)
//   SKY_PLUME_WGSL  : rocket exhaust flame and halo (HDR core <= 50)
//   SKY_TRAIL_WGSL  : launch smoke ribbons (premultiplied alpha)

const LAUNCH_STRUCT = /* wgsl */ `
// tr[i]: x launch age (s), y arc length reached (m), z seed, w alive    lod[i]: x puff spacing (m), y fade to the next level
// plume: xyz nozzle, w flame intensity (0..1)       plumeDir: xyz exhaust direction (unit), w flame length (m)
// glow: xyz smoke-lighting source, w intensity       wind: xy unit wind direction (xz), z sDeck, w trajectory samples
// misc: x halo intensity (ignition flash), y deck fade of the plume, z time
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
  let tuv = vec2f(along / (9.0 * 32.0), 0.0);         // 9 m band = 128 px rows -> 32 rows of text per atlas width
  let gx = dpdx(tuv.x); let gy = dpdy(tuv.x);
  let vyx = dpdx(vy); let vyy = dpdy(vy);
  let fu = fwidth(i.uv); let fwp = fwidth(i.wp);
  var albedo = vec3f(0.3); var rough = 0.6; var metal = 0.0; var emis = vec3f(0.0); var ao = 1.0;
  let local = kind > 0.5;
  if (mat < 0.5) {
    // hull: two-tone livery (pearl grey top, charcoal belly, red pinstripe above the LED band) with panel seams
    albedo = mix(vec3f(0.26, 0.26, 0.28), vec3f(0.52, 0.53, 0.55), smoothstep(-0.3, 0.38, vy)); rough = 0.45; metal = 0.25;
    albedo = mix(albedo, vec3f(0.45, 0.04, 0.035), smoothstep(0.30, 0.31, vy) * (1.0 - smoothstep(0.345, 0.355, vy)));
    let seams = max(lineMask(i.uv.x, 7.5, 0.06, fu.x), lineMask(i.uv.y, 5.0, 0.05, fu.y));
    albedo *= 1.0 - 0.28 * seams;
    // slight panel-to-panel tone variation
    let cell = floor(vec2f(i.uv.x / 7.5, i.uv.y / 5.0));
    albedo *= 0.9 + 0.2 * hash21(cell + vec2f(row * 31.0, 0.0));
    let inZ0 = smoothstep(-40.0, -36.0, lp.z) * (1.0 - smoothstep(58.0, 62.0, lp.z));
    // marker lights along the keel and the spine (scale cues), faded out below a pixel
    let marker = lineMask(i.uv.x, 6.0, 0.22, fu.x) * (smoothstep(-0.992, -0.998, vy) + smoothstep(0.992, 0.998, vy));
    emis += vec3f(1.0, 0.78, 0.5) * 6.0 * marker * inZ0;
    // LED band, 25% of the hull height on each side (|y| < 0.25 R), on the parallel middle body
    let bandV = (vy + 0.25) / 0.5;
    let inZ = inZ0;
    if (bandV > -0.04 && bandV < 1.04 && inZ > 0.0) {
      let frame = smoothstep(-0.04, 0.0, bandV) * (1.0 - smoothstep(1.0, 1.04, bandV));
      let inner = smoothstep(0.0, 0.03, bandV) * (1.0 - smoothstep(0.97, 1.0, bandV));
      let u = fract(tuv.x / ext) * ext;
      let v = (row + 1.0 - bandV) / 4.0;
      let g = textureSampleGrad(ledTex, sampRepeat, vec2f(u, v), vec2f(gx, -vyx * 0.5), vec2f(gy, -vyy * 0.5)).r;
      let c = hue(I.b.z + 0.08 * sin(along * 0.02 - t * 0.3)) * 0.85 + 0.15;
      let led = I.a.z * inZ;
      albedo = mix(albedo, vec3f(0.02), frame);
      rough = mix(rough, 0.25, frame); metal = mix(metal, 0.0, frame);
      emis = (c * g * 7.0 + c * 0.22 * inner) * led * frame;
    }
  } else if (mat < 1.5) {
    // junk-sail LED panels: colour sweeps fanning out along the battens
    let fin = floor(i.me.y / 4.0); let pnl = i.me.y - fin * 4.0;
    let w = 0.5 + 0.5 * sin(i.uv.x * 7.0 - t * 2.2 + pnl * 1.3 + fin * 0.7);
    let c = hue(I.b.z + 0.05 * pnl + 0.05 * sin(t * 0.4 + fin) + i.uv.x * 0.06);
    let rows = 1.0 - 0.5 * lineMask(i.uv.x * 30.0, 1.0, 0.12, fu.x * 30.0);
    let edge = smoothstep(0.0, 0.06, i.uv.y) * smoothstep(1.0, 0.94, i.uv.y);
    albedo = vec3f(0.04); rough = 0.5;
    emis = (c * (0.35 + 2.0 * w * w * w) + vec3f(1.0) * pow(w, 24.0) * 1.2) * rows * edge * I.a.z;
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
  if (i.wp.y < I.a.w) { discard; }
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
    let r = max(70.0 + 90.0 * LU.misc.x, 6.0 * px);
    let p = P + LU.plumeDir.xyz * 25.0 + vdir * 30.0 + (F.camRight.xyz * c.x + F.camUp.xyz * c.y) * r;
    o.cp = F.viewProj * vec4f(p, 1.0);
    o.q = c; o.k = vec2f(0.0, I); o.wy = P.y;
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
    let c = vec3f(1.0, 0.62, 0.3) * (exp(-r2 * 6.0) * 2.5 + exp(-r2 * 2.0) * 0.5) * win * i.k.y;
    return vec4f(c * deck * fg, 0.0);
  }
  // white-hot core at the nozzle, orange toward the tail, Gaussian across
  let a = i.q.y;
  let across = exp(-i.q.x * i.q.x * (3.0 + a * 6.0)) * saturate(1.0 - i.q.x * i.q.x);
  let core = exp(-a * 7.0) * exp(-i.q.x * i.q.x * 14.0);
  let body = pow(1.0 - a, 1.6) * across;
  let flick = 0.9 + 0.1 * sin(time() * 47.0 + a * 13.0);
  let c = (vec3f(1.0, 0.92, 0.8) * core * 40.0 + vec3f(1.0, 0.5, 0.16) * body * 9.0) * flick * i.k.y;
  return vec4f(min(c, vec3f(50.0)) * deck * fg, 0.0);
}
`;

export const SKY_TRAIL_WGSL = LAUNCH_STRUCT + /* wgsl */ `
@group(2) @binding(0) var<uniform> LU: LaunchU;
@group(2) @binding(1) var<storage, read> traj: array<vec4f>;   // x, y, z, arc length; uniform in arc length
const NPUFF = 192u;
const PUFF_DS = 9.25;           // arc-length spacing of the finest puff level (m)
const SMOKE_LIFE = 240.0;
struct VOut {
  @builtin(position) cp: vec4f,
  @location(0) q: vec2f,                              // puff-local, 1 = smoke radius
  @location(1) @interpolate(flat) base: vec3f,        // ambient + city glow + exhaust glow (fogged later)
  @location(2) @interpolate(flat) moonK: vec3f,
  @location(3) @interpolate(flat) mdir: vec3f,        // moon direction in (right, up, toward camera)
  @location(4) @interpolate(flat) warmK: vec3f,
  @location(5) @interpolate(flat) wdir: vec3f,        // warm light (city side / plume) direction, same basis
  @location(6) @interpolate(flat) fogC: vec4f,        // in-scatter rgb, transmittance
  @location(7) @interpolate(flat) aux: vec4f,         // x opacity, y noise seed, z noise rotation
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
  return vec4f(p.x + drift.x + wob.x * (10.0 + age * 0.4), p.y + age * 0.15, p.z + drift.y + wob.y * (10.0 + age * 0.4), age);
}
fn cull() -> VOut { var o: VOut; o.cp = vec4f(0.0, 0.0, -1.0, 1.0); return o; }
// One soft puff per instance. Puffs sit at fixed arc lengths s = j * spacing; the spacing doubles as the smoke
// spreads (LOD levels 9.25 m * 2^k), the odd puffs of a level fading out as it approaches the next level, so puffs
// never slide along the trail or pop.
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var o: VOut;
  let tri = ii / NPUFF; let j = ii % NPUFF;
  let T = LU.tr[tri]; let lod = LU.lod[tri];
  if (T.w < 0.5) { return cull(); }
  let s = f32(j) * lod.x;
  if (s > T.y) { return cull(); }
  let odd = (u32(round(s / lod.x)) & 1u) == 1u;
  let keep = select(1.0, 1.0 - lod.y, odd);
  let c = smokeAt(s, T.x);
  let age = c.w;
  let life = pow(saturate(1.0 - age / SMOKE_LIFE), 0.7);
  let deck = 1.0 - smoothstep(1650.0, 1800.0, c.y);
  // radius 15 m + 2 m/s * age (cap 250 m), uneven along the trail and over time, plus the ground cloud at the pad
  var r = min(15.0 + 2.0 * age, 250.0);
  r *= 0.7 + 0.6 * vnoise3(vec3f(s * 0.012, age * 0.035, T.z * 17.0));
  r += 55.0 * (1.0 - smoothstep(0.0, 110.0, s)) * smoothstep(0.0, 6.0, age);
  let toCamV = F.camPos.xyz - c.xyz;
  let dist = length(toCamV);
  let toCam = toCamV / dist;
  let px = dist * 2.0 * F.camRight.w * F.res.w;
  let rr = max(r, 2.0 * px);
  // opacity per puff keeps the column density independent of the puff spacing
  let op = life * deck * keep * min(lod.x / (0.8 * rr) / (1.0 - 0.5 * lod.y), 1.6) * 0.8 * pow(r / rr, 2.0);
  if (op < 0.01) { return cull(); }
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let q = corners[vi] * 1.4;
  let p = c.xyz + (F.camRight.xyz * q.x + F.camUp.xyz * q.y) * rr + toCam * min(rr, dist * 0.5);
  o.cp = F.viewProj * vec4f(p, 1.0);
  o.q = q;
  // lighting, constant per puff: sky ambient and city glow from below, the moon (cool) and a warm key from the
  // city 5 km away or from the plume while it burns nearby
  let albedo = vec3f(0.75, 0.75, 0.78);
  let toCity = normalize(vec3f(300.0 - c.x, -0.35 * c.y, -300.0 - c.z));
  let lv = LU.glow.xyz - c.xyz;
  let ld = length(lv);
  let plume = LU.glow.w / (1.0 + ld * ld / (260.0 * 260.0));
  let wd = normalize(toCity * 0.26 + lv / max(ld, 1.0) * plume);
  o.base = albedo * (skyAmbient(toCam) * 0.9 + skyCityGlow(c.xz) * 0.9) + vec3f(1.0, 0.5, 0.18) * 5.0 * exp(-age * 1.4);
  o.moonK = albedo * vec3f(0.55, 0.65, 0.95) * 0.62;
  let basis = mat3x3f(F.camRight.xyz, F.camUp.xyz, toCam);
  o.mdir = F.moon.xyz * basis;
  o.warmK = albedo * (vec3f(1.0, 0.45, 0.65) * 0.36 + vec3f(1.0, 0.55, 0.24) * plume);
  o.wdir = wd * basis;
  let sc = F.viewProj * vec4f(c.xyz, 1.0);
  let suv = clamp(sc.xy / max(sc.w, 1e-3) * vec2f(0.5, -0.5) + 0.5, vec2f(0.0), vec2f(1.0));
  o.fogC = textureSampleLevel(fogTex, sampClamp, vec3f(suv, clamp(fogSlice(dist), 0.0, 1.0)), 0.0);
  o.aux = vec4f(op, hash11u(u32(s) * 7919u + u32(T.z * 1000.0)) * 61.0, f32(j) * 2.39996, 0.0);
  return o;
}
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  let r2 = dot(i.q, i.q);
  if (r2 > 1.96) { discard; }
  // billowy edge: noise in the puff's own rotated frame
  let rq = rot2(i.aux.z) * i.q;
  let n = vnoise2(rq * 1.5 + i.aux.y) * 0.65 + vnoise2(rq * 3.4 - i.aux.y) * 0.35;
  let edge = r2 * (1.0 + 0.9 * (0.5 - n));
  let dens = exp(-edge * 1.9) * (0.6 + 0.7 * n) * saturate(1.0 - r2 / 1.96);
  let alpha = saturate(dens * i.aux.x);
  if (alpha < 0.004) { discard; }
  // round puff normal in (right, up, toward camera)
  let nq = i.q / 1.25;
  let nrm = vec3f(nq, sqrt(max(1.0 - dot(nq, nq), 0.0)));
  let lm = saturate(dot(nrm, i.mdir) * 0.8 + 0.2);
  let fwd = pow(saturate(-i.mdir.z), 6.0) * (1.0 - nrm.z) * 1.5;   // silver lining when back-lit by the moon
  var col = i.base + i.moonK * (0.3 + 0.7 * lm + fwd) + i.warmK * (0.3 + 0.7 * saturate(dot(nrm, i.wdir)));
  col *= 0.8 + 0.35 * n;
  col = col * i.fogC.a + i.fogC.rgb;
  return vec4f(col * alpha, alpha);
}
`;