// Sky operations shaders (the three advertising airships).
//   SKY_OPAQUE_WGSL : airships. Drawn in the module's own pass after the deferred lighting, so they shade themselves
//                     (moon, sky ambient, city glow from below, emissive, fog) and write the lit colour, normal, motion
//                     and depth.
//   SKY_SPRITE_WGSL : nav lights, strobes, outline lights (additive, size clamped to >= 1.3 px)
//   SKY_BEAM_WGSL   : airship searchlight cones (same look as the air.js helicopter beams)

import { PAGE_ROWS, BAND_MID, BAND_TEX_M } from './skyopsAtlas.js';

export const SKY_OPAQUE_WGSL = /* wgsl */ `
struct Inst { l: vec4f, u: vec4f, f: vec4f, pl: vec4f, pu: vec4f, pf: vec4f, a: vec4f, b: vec4f };
// a: x unused, y ship index, z LED level 0..1, w unused
// b: x atlas row of the page shown, y unused, z hue offset, w unused
@group(1) @binding(0) var<storage, read> inst: array<Inst>;
@group(1) @binding(1) var ledTex: texture_2d<f32>;
const PAGE_ROWS = ${PAGE_ROWS}.0;     // atlas rows (one page per row)
const BAND_MID = ${BAND_MID.toFixed(1)};      // hull z (m) of the middle of the LED band
const BAND_TEX_M = ${BAND_TEX_M.toFixed(1)};  // m of band per atlas width

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
fn shade(P: vec3f, n: vec3f, albedo: vec3f, rough: f32, metal: f32, emis: vec3f, ao: f32) -> vec3f {
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
  let t = time();
  var n = normalize(i.n);
  // LED band text coordinates (hull sides), derivatives taken in uniform control flow.
  // s: metres from the middle of the band, increasing to the right as seen from outside that side of the hull, so
  // the text reads left to right on both sides. The port side (x > 0) is seen looking toward -x, with the nose (+z)
  // on the viewer's left; the starboard side is its mirror image.
  let lp = i.lp;
  let side = select(-1.0, 1.0, lp.x > 0.0);
  let s = select(lp.z - BAND_MID, BAND_MID - lp.z, side > 0.0);
  let rr = max(length(lp.xy), 1.0);
  let vy = lp.y / rr;                                 // -1 bottom .. 1 top
  let row = I.a.y;                                    // ship index (panel tone hashes)
  // the band (about 12.5 m tall) is one 128 px atlas row; one atlas width is BAND_TEX_M m, centred on the band
  let tu = 0.5 + s / BAND_TEX_M;
  let gx = dpdx(tu); let gy = dpdy(tu);
  let vyx = dpdx(vy); let vyy = dpdy(vy);
  let fu = fwidth(i.uv);
  var albedo = vec3f(0.3); var rough = 0.6; var metal = 0.0; var emis = vec3f(0.0); var ao = 1.0;
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
      // pages (I-020): each page is fitted to the band and does not scroll, so no word is ever cut at the band's
      // ends; the pages switch from one frame to the next, so no frame shows part of a page
      let v = (I.b.x + 1.0 - bandV) / PAGE_ROWS;
      let dv = -1.0 / (0.68 * PAGE_ROWS);
      let g = textureSampleGrad(ledTex, sampRepeat, vec2f(tu, v), vec2f(gx, vyx * dv), vec2f(gy, vyy * dv)).r;
      let c = hue(I.b.z + 0.08 * sin(s * 0.02 - t * 0.3)) * 0.85 + 0.15;
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
  }
  var o: SOut;
  o.color = vec4f(shade(i.wp, n, albedo, rough, metal, emis, ao), 1.0);
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
