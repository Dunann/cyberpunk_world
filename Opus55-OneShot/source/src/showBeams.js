// Shared light-show beam list. The lightshow module fills it every frame; the water shader reads it to add
// analytic reflections of the beams (they are forward geometry, so screen-space reflections cannot see them).
//
// Beam layout (3 x vec4 = 48 bytes):
//   o: origin xyz, length (m)
//   d: unit direction xyz, radius at the origin (m)
//   c: color rgb (HDR, premultiplied by intensity), spread (radius growth per meter)

export const MAX_BEAMS = 64;
export const BEAM_FLOATS = 12;

let shared = null;

export function beamStore(device) {
  if (shared) return shared;
  const data = new Float32Array(4 + MAX_BEAMS * BEAM_FLOATS);
  const buffer = device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label: 'showBeams' });
  device.queue.writeBuffer(buffer, 0, data);
  shared = { data, buffer, count: 0 };
  return shared;
}

export const WGSL_BEAMS = /* wgsl */ `
struct Beam { o: vec4f, d: vec4f, c: vec4f };
struct Beams { info: vec4f, b: array<Beam, ${MAX_BEAMS}> };

// In-scattered light of one soft beam along the ray ro + rd * s, s in [0, maxT].
// Gaussian radial profile integrated analytically across the beam; the beam's own energy spreads with its radius.
// pixAng = angular size of a pixel (radians) so thin beams never get thinner than ~1 pixel (no aliasing).
fn beamGlow(ro: vec3f, rd: vec3f, maxT: f32, bm: Beam, pixAng: f32, t: f32) -> vec3f {
  let O = bm.o.xyz; let D = bm.d.xyz; let L = bm.o.w;
  let w0 = ro - O;
  let b = dot(rd, D);
  let dd = dot(rd, w0);
  let e = dot(D, w0);
  let den = max(1.0 - b * b, 1e-4);
  var u = clamp((e - b * dd) / den, 0.0, L);
  let s0 = dot(O + D * u - ro, rd);
  let s = clamp(s0, 0.0, maxT);
  u = clamp(dot(ro + rd * s - O, D), 0.0, L);
  let dist = length(ro + rd * s - (O + D * u));
  let r0 = bm.d.w + bm.c.w * u;
  let rEff = max(r0, pixAng * max(s, 1.0) * 1.2);
  let sinT = sqrt(den);
  let wAlong = rEff / max(sinT, 0.08);
  // partial integral: soft termination at opaque geometry (maxT) and at the eye
  let part = (0.5 + 0.5 * tanh(1.3 * (maxT - s0) / wAlong)) * (0.5 + 0.5 * tanh(1.3 * s0 / wAlong));
  let prof = exp(-(dist * dist) / (rEff * rEff));
  // energy conservation: brightness falls with the spread radius
  let energy = bm.d.w * bm.d.w / (r0 * rEff);
  let lenFade = 1.0 - smoothstep(L * 0.3, L, u);
  // haze: denser low over the river and the city, drifting dust along the beam
  let py = O.y + D.y * u;
  let haze = 0.3 + 0.7 * exp(-max(py, 0.0) * 0.0012);
  let dust = 0.7 + 0.3 * sin(u * 0.045 - t * 1.3 + bm.o.x * 0.01) * sin(u * 0.017 + t * 0.7);
  var c = bm.c.rgb * (prof * part * energy * lenFade * dust * haze * 1.77 * rEff / max(sinT, 0.08));
  // glare around the lamp itself
  let so = dot(O - ro, rd);
  if (so > 0.0 && so < maxT + bm.d.w * 4.0) {
    let dO = length(O - ro - rd * so);
    let rf = max(bm.d.w * 1.5, pixAng * so * 1.5);
    let a = bm.d.w * 2.0;
    // falls to exactly zero at 8 rf (inside the quad drawn around the lamp)
    let g = max((a * a) / (dO * dO + rf * rf) - (a * a) / (65.0 * rf * rf), 0.0);
    c += bm.c.rgb * 1.0 * g;
  }
  return c;
}
`;
