// Bridges: the five BRIDGES of world.js (cable-stayed, arch, suspension).
//  - decks with approach ramps down to the ground at each end, road markings, sidewalks, railings, piers
//  - towers / pylons, stay cables, suspension main cables and hangers, truss arches
//  - deck street lights (point lights), LED accent lines on cables, arches, towers and deck fascias that animate and
//    pulse with the light show (F.show)
//  - walkable deck colliders and deck polylines for traffic: world.shared.bridgeDecks
// Thin members (cables, hangers, LED lines) are camera-facing ribbons that never get thinner than ~1 pixel; when
// widened their emission is scaled down so the energy stays constant (no shimmer at distance).

const STYLE = {
  // steel color, LED color A, LED color B, tower shape
  'Peninsula South Bridge': { steel: [0.62, 0.64, 0.66], a: [0.1, 0.75, 1.0], b: [0.35, 0.2, 1.0], tower: 'A' },
  'Chaotianmen Arch': { steel: [0.5, 0.52, 0.55], a: [1.0, 0.72, 0.25], b: [1.0, 0.95, 0.85], tower: 'none' },
  'Bund Suspension': { steel: [0.45, 0.07, 0.06], a: [1.0, 0.18, 0.55], b: [0.6, 0.2, 1.0], tower: 'portal' },
  'Old Town Bridge': { steel: [0.55, 0.18, 0.06], a: [1.0, 0.3, 0.1], b: [1.0, 0.75, 0.2], tower: 'none' },
  'North Cable Bridge': { steel: [0.86, 0.85, 0.8], a: [1.0, 0.55, 0.12], b: [1.0, 0.88, 0.6], tower: 'single' },
};

// Shared WGSL: LED color animation (uses F.show during the light show).
const WGSL_LED = /* wgsl */ `
struct BridgeStyle { a: vec4f, b: vec4f, steel: vec4f };
@group(1) @binding(0) var<storage, read> styles: array<BridgeStyle, 8>;

fn showHue(k: f32) -> vec3f {
  let i = u32(k) % 4u;
  if (i == 0u) { return vec3f(0.1, 0.9, 1.0); }
  if (i == 1u) { return vec3f(1.0, 0.15, 0.6); }
  if (i == 2u) { return vec3f(1.0, 0.75, 0.2); }
  return vec3f(0.55, 0.25, 1.0);
}

// s: meters along the bridge, h: meters along the member (height), bid: bridge index
fn bridgeLed(bid: u32, s: f32, h: f32, t: f32) -> vec3f {
  let st = styles[bid];
  let wave = 0.5 + 0.5 * sin(s * 0.011 - t * 0.7 + h * 0.04 + f32(bid) * 1.3);
  var c = mix(st.a.rgb, st.b.rgb, wave);
  var k = 0.8 + 0.2 * sin(t * 0.8 + f32(bid) * 1.7);
  let sx = F.show.x;
  if (sx > 0.0) {
    let flash = exp(-F.show.z * 5.0);
    let chase = pow(0.5 + 0.5 * sin(s * 0.025 + h * 0.06 - F.show.y * 5.0), 4.0);
    let hue = showHue(F.show.w * 0.25 + f32(bid));
    c = mix(c, hue, sx * 0.75);
    k *= 1.0 + sx * (1.6 * flash + 1.5 * chase);
  }
  return c * k;
}
`;

const MESH_WGSL = /* wgsl */ `
${WGSL_LED}
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) uv: vec2f,
  @location(3) @interpolate(flat) kb: vec2u,
};

@vertex fn vs(@location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) uv: vec2f, @location(3) kb: vec2f) -> VOut {
  var o: VOut;
  o.wp = pos; o.n = nrm; o.uv = uv;
  o.kb = vec2u(u32(kb.x + 0.5), u32(kb.y + 0.5));
  o.pos = F.viewProj * vec4f(pos, 1.0);
  return o;
}

fn bandAA(y: f32, c: f32, h: f32, fw: f32) -> f32 {
  let w = max(fw, 1e-4);
  let hw = max(h, w * 0.75);
  return (1.0 - smoothstep(hw - w * 0.5, hw + w * 0.5, abs(y - c))) * (h / hw);
}

// Fake uplighting under the deck: warm pools every 36 m along the span (no point lights needed).
fn underLit(s: f32, n: vec3f) -> vec3f {
  let x = (fract(s / 36.0) - 0.5) * 36.0;
  let pool = exp(-x * x / 50.0);
  return vec3f(1.0, 0.72, 0.45) * (0.018 + 0.26 * pool) * select(0.55, 1.0, n.y < -0.5);
}

@fragment fn fs(i: VOut) -> GOut {
  let kind = i.kb.x; let bid = i.kb.y;
  let st = styles[bid];
  let n = normalize(i.n);
  let t = time();
  let fwv = fwidth(i.uv.y);
  let fws = fwidth(i.uv.x);
  var albedo = vec3f(0.3);
  var rough = 0.7; var metal = 0.0; var emis = vec3f(0.0); var wet = 0.5; var mat = 0.0;
  if (kind == 0u) { // concrete
    albedo = vec3f(0.22, 0.215, 0.21) * (0.85 + 0.15 * hash21(floor(i.wp.xz * 0.5)));
    rough = 0.85;
  } else if (kind == 1u) { // asphalt road with lane markings (uv.y = lateral meters from the centerline)
    albedo = vec3f(0.035, 0.035, 0.038);
    rough = 0.5; wet = 1.0; mat = 3.0;
    let lat = abs(i.uv.y);
    let dash = step(0.45, fract(i.uv.x / 9.0));
    let center = bandAA(lat, 0.0, 0.12, fwv) ;
    let lanes = bandAA(fract(lat / 3.6 + 0.5) - 0.5, 0.0, 0.035, fwv / 3.6) * dash * step(1.0, lat);
    albedo = mix(albedo, vec3f(0.55, 0.42, 0.12), center);
    albedo = mix(albedo, vec3f(0.5), lanes * 0.8);
  } else if (kind == 2u) { // sidewalk
    albedo = vec3f(0.12, 0.11, 0.105);
    rough = 0.6; wet = 0.9; mat = 3.0;
  } else if (kind == 3u) { // painted steel
    albedo = st.steel.rgb;
    rough = 0.45; metal = 0.3;
  } else if (kind == 4u) { // deck fascia: LED line (uv.y = meters below the deck surface)
    albedo = vec3f(0.18, 0.18, 0.19);
    rough = 0.5;
    emis = bridgeLed(bid, i.uv.x, 0.0, t) * bandAA(i.uv.y, -1.3, 0.14, fwv) * 3.0;
  } else if (kind == 5u) { // lamp head
    albedo = vec3f(0.1);
    emis = vec3f(1.0, 0.86, 0.66) * 14.0;
  } else if (kind == 6u) { // under-deck girder with blue accent line along the bottom edges, uplit pools
    albedo = vec3f(0.2, 0.2, 0.21);
    rough = 0.6;
    emis = vec3f(0.15, 0.4, 1.0) * bandAA(i.uv.y, -4.0, 0.1, fwv) * 3.0 + underLit(i.uv.x, n);
  } else if (kind == 10u) { // deck underside concrete, washed by warm uplights in pools along the span
    albedo = vec3f(0.24, 0.23, 0.22) * (0.85 + 0.15 * hash21(floor(i.wp.xz * 0.5)));
    rough = 0.85;
    emis = underLit(i.uv.x, n);
  } else if (kind == 11u) { // fender: dark rubber with yellow hazard stripes
    let k = step(0.5, fract((i.wp.x + i.wp.z) * 0.25));
    albedo = mix(vec3f(0.03), vec3f(0.5, 0.38, 0.05), k);
    rough = 0.7;
  } else if (kind == 7u) { // tower concrete/steel with vertical LED edge lines (uv.y = height)
    albedo = mix(st.steel.rgb, vec3f(0.3), 0.4);
    rough = 0.55;
    let seams = bandAA(fract(i.uv.y / 12.0), 0.5, 0.02, fwv / 12.0);
    albedo *= 1.0 - seams * 0.3;
  } else if (kind == 9u) { // small maintenance-walkway lamp
    albedo = vec3f(0.1);
    emis = vec3f(1.0, 0.78, 0.5) * 6.0;
  } else if (kind == 8u) { // flood-lit tower base glow (static emissive)
    albedo = vec3f(0.2);
    emis = bridgeLed(bid, i.uv.x, i.uv.y, t) * 4.0;
  }
  return gbuf(albedo, rough, n, metal, emis, 1.0, motionVector(i.wp, i.wp), mat, wet);
}
`;

const RIBBON_WGSL = /* wgsl */ `
${WGSL_LED}
struct Rib { a: vec4f, b: vec4f, c: vec4f };
// a: p0 xyz, radius   b: p1 xyz, kind (0 cable with LED, 1 LED line, 2 plain steel)   c: s0, s1, bridge id, h0
@group(1) @binding(1) var<storage, read> ribs: array<Rib>;

struct ROut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) side: vec3f,
  @location(2) toCam: vec3f,
  @location(3) xc: f32,
  @location(4) cover: f32,
  @location(5) sh: vec2f,
  @location(6) @interpolate(flat) kb: vec2u,
};

@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> ROut {
  let R = ribs[ii];
  var ends = array<f32, 6>(0.0, 0.0, 1.0, 1.0, 0.0, 1.0);
  var sides = array<f32, 6>(-1.0, 1.0, -1.0, -1.0, 1.0, 1.0);
  let e = ends[vi]; let sg = sides[vi];
  let p0 = R.a.xyz; let p1 = R.b.xyz;
  let axis = normalize(p1 - p0);
  let pe = mix(p0, p1, e);
  let tc = F.camPos.xyz - pe;
  let dist = max(length(tc), 0.1);
  var side = cross(axis, tc / dist);
  if (dot(side, side) < 1e-6) { side = cross(axis, vec3f(0.0, 1.0, 0.0)); }
  side = normalize(side);
  let pix = dist * 2.0 * F.camRight.w * F.res.w;
  let r = R.a.w;
  let w = max(r, pix * 1.5);
  var o: ROut;
  o.wp = pe + side * w * sg;
  o.pos = F.viewProj * vec4f(o.wp, 1.0);
  o.side = side;
  o.toCam = normalize(tc - axis * dot(tc, axis));
  o.xc = sg;
  o.cover = r / w;
  o.sh = vec2f(mix(R.c.x, R.c.y, e), R.c.w + e * length(p1 - p0));
  o.kb = vec2u(u32(R.b.w + 0.5), u32(R.c.z + 0.5));
  return o;
}

@fragment fn fs(i: ROut) -> GOut {
  let kind = i.kb.x; let bid = i.kb.y;
  let st = styles[bid];
  let x = clamp(i.xc, -1.0, 1.0);
  let n = normalize(i.side * x + i.toCam * sqrt(max(1.0 - x * x, 0.0)));
  let t = time();
  var albedo = mix(st.steel.rgb, vec3f(0.7), 0.3) * mix(0.15, 1.0, saturate(i.cover));
  var emis = vec3f(0.0);
  var rough = mix(0.9, 0.35, saturate(i.cover));
  if (kind == 0u) {
    emis = bridgeLed(bid, i.sh.x, i.sh.y, t) * 2.2 * i.cover;
  } else if (kind == 1u) {
    emis = bridgeLed(bid, i.sh.x, i.sh.y, t) * 7.0 * i.cover;
    albedo = vec3f(0.2);
  }
  return gbuf(albedo, rough, n, 0.4, emis, 1.0, motionVector(i.wp, i.wp), 0.0, 0.5);
}
`;

// ---------------------------------------------------------------- geometry helpers

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

class Mesh {
  constructor() { this.v = []; this.i = []; }
  // quad from 4 corners in order around the face; winding chosen so it faces n. uvs: 4 [u, v] pairs
  quad(p, n, uvs, kind, bid) {
    const base = this.v.length / 10;
    for (let k = 0; k < 4; k++) this.v.push(p[k][0], p[k][1], p[k][2], n[0], n[1], n[2], uvs[k][0], uvs[k][1], kind, bid);
    const c = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    if (dot(c, n) > 0) this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else this.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  // oriented box from p0 to p1 (main axis), with cross-section half sizes (hw along w, hh along h)
  beam(p0, p1, wdir, hw, hh, kind, bid, s, h0 = 0) {
    const ax = norm(sub(p1, p0));
    let wv = norm(sub(wdir, mul(ax, dot(wdir, ax))));
    const hv = norm(cross(ax, wv));
    const len = Math.hypot(...sub(p1, p0));
    const C = (e, a, b) => add(add(e ? p1 : p0, mul(wv, a * hw)), mul(hv, b * hh));
    const faces = [[wv, 1, 0], [mul(wv, -1), -1, 0], [hv, 0, 1], [mul(hv, -1), 0, -1]];
    for (const [n, a, b] of faces) {
      let pts;
      if (a !== 0) pts = [C(0, a, -1), C(1, a, -1), C(1, a, 1), C(0, a, 1)];
      else pts = [C(0, -1, b), C(1, -1, b), C(1, 1, b), C(0, 1, b)];
      this.quad(pts, n, [[s, h0], [s, h0 + len], [s, h0 + len], [s, h0]], kind, bid);
    }
    this.quad([C(1, -1, -1), C(1, 1, -1), C(1, 1, 1), C(1, -1, 1)], ax, [[s, h0 + len], [s, h0 + len], [s, h0 + len], [s, h0 + len]], kind, bid);
    const nax = mul(ax, -1);
    this.quad([C(0, -1, -1), C(0, 1, -1), C(0, 1, 1), C(0, -1, 1)], nax, [[s, h0], [s, h0], [s, h0], [s, h0]], kind, bid);
  }
}

// ---------------------------------------------------------------- bridge construction

function buildBridge(world, B, bid, mesh, ribs, lightsOut, colliders) {
  const style = STYLE[B.name] || STYLE['Peninsula South Bridge'];
  const ax = B.ax, az = B.az;
  const dx = B.bx - B.ax, dz = B.bz - B.az;
  const len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;          // along
  const vx = -uz, vz = ux;                     // lateral (horizontal)
  const hw = B.width / 2;
  const Hd = B.deck;
  const step = 5;
  const n = Math.ceil(len / step);
  const S = [], G = [], WD = [];
  for (let i = 0; i <= n; i++) {
    const s = Math.min(i * step, len);
    const x = ax + ux * s, z = az + uz * s;
    S.push(s); G.push(world.heightAt(x, z)); WD.push(world.waterDist(x, z));
  }
  // water span
  let w0 = -1, w1 = -1;
  for (let i = 0; i <= n; i++) if (WD[i] < 0) { if (w0 < 0) w0 = i; w1 = i; }
  if (w0 < 0) { w0 = Math.floor(n * 0.3); w1 = Math.ceil(n * 0.7); }
  const sw0 = S[w0], sw1 = S[w1];
  // deck profile: level deck with smoothstep ramps at both ends. This is exactly the profile the traffic module drives
  // on (trafficCars.js: ends at max(ground, 0), ramp length min(120, 0.2 L), cars at deck + 0.15), so cars sit on
  // the road surface.
  const Y = new Float64Array(n + 1);
  const yA = Math.max(world.heightAt(B.ax, B.az), 0), yB = Math.max(world.heightAt(B.bx, B.bz), 0);
  const ramp = Math.min(120, len * 0.2);
  const ss = (x) => { const t = Math.min(Math.max(x, 0), 1); return t * t * (3 - 2 * t); };
  for (let i = 0; i <= n; i++) {
    const s = S[i];
    let y = Hd;
    if (s < ramp) y = yA + (Hd - yA) * ss(s / ramp);
    if (s > len - ramp) y = yB + (Hd - yB) * ss((len - s) / ramp);
    Y[i] = y;
  }
  const P = (s, lat, dy) => {
    const f = Math.min(Math.max(s / step, 0), n - 1e-6);
    const i = Math.floor(f), t = f - i;
    const y = Y[i] + (Y[Math.min(i + 1, n)] - Y[i]) * t;
    return [ax + ux * s + vx * lat, y + dy, az + uz * s + vz * lat];
  };
  const deckY = (s) => P(s, 0, 0)[1];
  const along = [ux, 0, uz], lateral = [vx, 0, vz], up = [0, 1, 0];

  // ---- deck: road, sidewalks, curbs, fascias, underside, girder
  const SW = 3.0;
  for (let i = 0; i < n; i++) {
    const s0 = S[i], s1 = S[i + 1];
    const q = (lat0, d0, lat1, d1, nrm, kind, uv0, uv1) => {
      mesh.quad([P(s0, lat0, d0), P(s1, lat0, d0), P(s1, lat1, d1), P(s0, lat1, d1)], nrm,
        [[s0, uv0], [s1, uv0], [s1, uv1], [s0, uv1]], kind, bid);
    };
    const nl = mul(lateral, -1);
    q(-hw + SW, 0, hw - SW, 0, up, 1, -hw + SW, hw - SW);                 // road
    q(-hw, 0.22, -hw + SW, 0.22, up, 2, 0, 0);                            // sidewalks
    q(hw - SW, 0.22, hw, 0.22, up, 2, 0, 0);
    q(-hw + SW, 0.22, -hw + SW, 0, lateral, 0, 0, 0);                      // curbs
    q(hw - SW, 0.22, hw - SW, 0, nl, 0, 0, 0);
    q(-hw, 0.22, -hw, -2.8, nl, 4, 0.22, -2.8);                           // fascias (uv.y = meters from deck top)
    q(hw, 0.22, hw, -2.8, lateral, 4, 0.22, -2.8);
    q(-hw, -2.8, -hw * 0.62, -2.8, [0, -1, 0], 10, s0, s0);               // underside slab
    q(hw * 0.62, -2.8, hw, -2.8, [0, -1, 0], 10, s0, s0);
    q(-hw * 0.62, -2.8, -hw * 0.5, -4.2, nl, 6, -2.8, -4.2);              // box girder webs (slanted)
    q(hw * 0.62, -2.8, hw * 0.5, -4.2, lateral, 6, -2.8, -4.2);
    q(-hw * 0.5, -4.2, hw * 0.5, -4.2, [0, -1, 0], 6, -4.2, -4.2);          // box girder bottom
  }
  // ---- underside structure where the deck is high: edge girders, cross-beams, maintenance walkway with small lamps
  const elevated = (s) => deckY(s) - Math.max(world.heightAt(ax + ux * s, az + uz * s), 0) > 6;
  for (let i = 0; i < n; i++) {
    const s0 = S[i], s1 = S[i + 1];
    if (!elevated(s0) || !elevated(s1)) continue;
    for (const sd of [-1, 1]) mesh.beam(P(s0, sd * hw * 0.8, -3.6), P(s1, sd * hw * 0.8, -3.6), up, 0.8, 0.45, 10, bid, s0); // edge girders
    mesh.beam(P(s0, hw * 0.33, -5.0), P(s1, hw * 0.33, -5.0), up, 0.06, 0.55, 3, bid, s0);        // walkway grating
    mesh.beam(P(s0, hw * 0.33 + 0.55, -4.0), P(s1, hw * 0.33 + 0.55, -4.0), up, 0.05, 0.05, 3, bid, s0); // handrail
  }
  for (let s = 4; s < len - 4; s += 8) {
    if (!elevated(s)) continue;
    mesh.beam(P(s, -hw * 0.95, -3.4), P(s, hw * 0.95, -3.4), up, 0.65, 0.3, 10, bid, s);           // cross-beam
    if (((s - 4) / 8) % 2 === 0) {
      const l = P(s, hw * 0.33, -5.15);
      mesh.beam(add(l, mul(along, -0.25)), add(l, mul(along, 0.25)), lateral, 0.12, 0.08, 9, bid, s); // walkway lamp
    }
  }
  // ---- railings: posts every 2.5 m + top rail (thin beams)
  for (const sd of [-1, 1]) {
    const lat = sd * (hw - 0.15);
    for (let s = 1; s < len - 1; s += 2.5) {
      const b = P(s, lat, 0.22);
      mesh.beam(b, add(b, [0, 1.05, 0]), along, 0.05, 0.05, 3, bid, s);
    }
    for (let i = 0; i < n; i++) {
      const a = P(S[i], lat, 1.27), b = P(S[i + 1], lat, 1.27);
      mesh.beam(a, b, up, 0.06, 0.05, 3, bid, S[i]);
    }
  }
  // ---- street lights on both sides (staggered, 20 m apart)
  for (let s = 12, k = 0; s < len - 8; s += 20, k++) {
    const sd = k % 2 ? 1 : -1;
    const base = P(s, sd * (hw - 0.6), 0.22);
    const top = add(base, [0, 9, 0]);
    mesh.beam(base, top, along, 0.11, 0.11, 3, bid, s);
    const arm = add(top, mul(lateral, -sd * 2.2));
    mesh.beam(top, arm, up, 0.07, 0.07, 3, bid, s);
    const head = add(arm, [0, -0.15, 0]);
    mesh.beam(add(head, mul(along, -0.5)), add(head, mul(along, 0.5)), lateral, 0.25, 0.08, 5, bid, s);
    lightsOut.push([head[0], head[1] - 0.6, head[2], 26, 34, 28, 20]);
  }

  // ---- colliders (deck + railings) and the traffic polyline
  const pts = [];
  for (let i = 0; i < n; i++) {
    const s0 = S[i], s1 = S[i + 1], sm = (s0 + s1) / 2;
    const c = P(sm, 0, 0);
    const ang = Math.atan2(uz, ux);
    colliders.push([c[0], c[1] - 0.4, c[2], (s1 - s0) / 2 + 0.3, 0.4, hw, ang]);
    for (const sd of [-1, 1]) {
      const r = P(sm, sd * (hw - 0.1), 0);
      colliders.push([r[0], r[1] + 0.75, r[2], (s1 - s0) / 2 + 0.3, 0.75, 0.12, ang]);
    }
  }
  for (let i = 0; i <= n; i++) { const p = P(S[i], 0, 0); pts.push({ x: p[0], y: p[1], z: p[2], s: S[i] }); }

  // ---- piers under the approaches (not inside the main span)
  let mainA = sw0 + (sw1 - sw0) * 0.12, mainB = sw1 - (sw1 - sw0) * 0.12;
  const single = B.type === 'cable' && style.tower === 'single';
  // single leaning pylon near one bank, harp cables over the water
  const pylonS = sw0 + (sw1 - sw0) * 0.08;
  const reachS = Math.min((sw1 - sw0) * 0.78, 380);
  if (single) { mainA = pylonS; mainB = pylonS + reachS; }
  const towers = [];
  // lit band at the waterline around a pier or leg (base below water) and a light washing it upward
  // massive pile cap under a pylon standing in the river: fender band, corner lamps and a light on its base
  const footing = (cx, cz, s, halfLat) => {
    const c0 = [cx - ux * 14, 0.5, cz - uz * 14], c1 = [cx + ux * 14, 0.5, cz + uz * 14];
    mesh.beam(c0, c1, up, 4.5, halfLat, 0, bid, s);
    mesh.beam([c0[0] - ux * 0.4, 1.3, c0[2] - uz * 0.4], [c1[0] + ux * 0.4, 1.3, c1[2] + uz * 0.4], up, 0.6, halfLat + 0.4, 11, bid, s);
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      const x = cx + ux * 13.6 * a + vx * (halfLat - 0.4) * b, z = cz + uz * 13.6 * a + vz * (halfLat - 0.4) * b;
      mesh.beam([x, 5.0, z], [x, 5.7, z], along, 0.25, 0.25, 9, bid, s);
    }
    lightsOut.push([cx - vx * (halfLat + 4), 4, cz - vz * (halfLat + 4), 30, style.a[0] * 22, style.a[1] * 22, style.a[2] * 22]);
  };
  const waterline = (x, z, r, s) => {
    mesh.beam([x, 0.2, z], [x, 1.4, z], along, r + 0.35, r + 0.35, 8, bid, s, 0);
    lightsOut.push([x - vx * (r + 3), 2.0, z - vz * (r + 3), 22, style.a[0] * 18, style.a[1] * 18, style.a[2] * 18]);
  };
  const isArch = B.type === 'arch';
  const pierSpacing = 42;
  for (let s = pierSpacing; s < len - 20; s += pierSpacing) {
    if (isArch ? (s > sw0 - 15 && s < sw1 + 15) : (s > mainA - 30 && s < mainB + 30)) continue;
    const y = deckY(s);
    const g = world.heightAt(ax + ux * s, az + uz * s);
    const base = Math.min(g, 0) - 2;
    if (y - 3.2 - Math.max(g, 0) < 3) continue;
    for (const sd of [-1, 1]) {
      const c = P(s, sd * hw * 0.42, 0);
      mesh.beam([c[0], base, c[2]], [c[0], y - 4.4, c[2]], along, 1.1, 1.1, 0, bid, s);
    }
    const c0 = P(s, -hw * 0.6, -4.2), c1 = P(s, hw * 0.6, -4.2);
    mesh.beam(add(c0, [0, -1.2, 0]), add(c1, [0, -1.2, 0]), along, 1.2, 1.2, 0, bid, s);
    for (const sd of [-1, 1]) { const bb = P(s, sd * hw * 0.42, -4.35); mesh.beam(add(bb, [0, -0.2, 0]), add(bb, [0, 0.15, 0]), along, 0.7, 0.7, 3, bid, s); } // bearings
    // accent light washing the pier and the deck underside
    if (g < -0.5) {
      const c = P(s, hw * 0.42, 0);
      waterline(c[0], c[2], 1.1, s);
    } else if (y - Math.max(g, 0) > 9) {
      const pl = P(s, 0, -6);
      lightsOut.push([pl[0], pl[1], pl[2], 24, style.a[0] * 14, style.a[1] * 14, style.a[2] * 14]);
    }
  }

  // ---- type specific superstructure
  const rib = (p0, p1, r, kind, s0, s1, h0 = 0) => ribs.push([p0[0], p0[1], p0[2], r, p1[0], p1[1], p1[2], kind, s0, s1, bid, h0]);
  const groundAt = (s) => { const g = world.heightAt(ax + ux * s, az + uz * s); return g < 0.5 ? -3 : g - 1; };

  if (single) {
    // leaning portal pylon (two legs outside the deck, tilted back toward the near bank), harp cables on one side
    const yd = deckY(pylonS);
    const H = Math.max(150, reachS * 0.42);
    const lean = 0.42;
    const base = groundAt(pylonS);
    const c = P(pylonS, 0, 0);
    const at = (lat, ds, y) => [c[0] + vx * lat + ux * ds, y, c[2] + vz * lat + uz * ds];
    const legTop = (sd) => at(sd * (hw + 2.0), -H * lean, yd + H);
    for (const sd of [-1, 1]) {
      const b0 = at(sd * (hw + 2.6), 0, base);
      mesh.beam(b0, legTop(sd), lateral, 2.4, 2.0, 7, bid, pylonS, 0);
      rib(at(sd * (hw + 5.1), 0, base + 3), add(legTop(sd), mul(lateral, sd * 2.5)), 0.24, 1, pylonS, pylonS, 0);

      lightsOut.push([b0[0] + ux * 6, yd + 4, b0[2] + uz * 6, 30, style.a[0] * 30, style.a[1] * 30, style.a[2] * 30]);
    }
    for (const f of [1.0, 0.82]) {
      const yy = yd + H * f, dd = -H * lean * f;
      mesh.beam(at(-(hw + 2.0), dd, yy), at(hw + 2.0, dd, yy), along, 1.6, 1.8, 7, bid, pylonS);
    }
    mesh.beam(at(-(hw + 2.5), 0, yd - 4.5), at(hw + 2.5, 0, yd - 4.5), along, 1.6, 1.4, 7, bid, pylonS);
    if (base < 0) footing(c[0], c[2], pylonS, hw + 7);
    lightsOut.push([c[0] - ux * H * lean * 0.9, yd + H * 0.9, c[2] - uz * H * lean * 0.9, 34, style.b[0] * 26, style.b[1] * 26, style.b[2] * 26]);
    towers.push({ x: c[0], z: c[2], top: yd + H });
    // harp: parallel cables, farther deck anchors attach higher up the legs
    const N = 16;
    for (let k = 1; k <= N; k++) {
      const f = 0.3 + 0.68 * k / N;
      const sd2 = pylonS + reachS * k / N;
      for (const sd of [-1, 1]) {
        const pa = at(sd * (hw + 2.0 + 0.6 * (1 - f)), -H * lean * f, yd + H * f);
        rib(P(sd2, sd * (hw - 0.4), 0.3), pa, 0.13, 0, sd2, pylonS, 0);
      }
    }
    // backstays to the near bank anchorage
    for (const sd of [-1, 1]) {
      const anc = P(Math.max(pylonS - H * lean * 1.4, 10), sd * (hw - 1), 0.3);
      rib(anc, add(legTop(sd), [0, -2, 0]), 0.3, 0, pylonS, pylonS, 0);
    }
  } else if (B.type === 'cable') {
    const span = mainB - mainA;
    const Ht = Math.max(95, span * 0.28);
    const towerS = [mainA, mainB];
    for (let ti = 0; ti < 2; ti++) {
      const ts = towerS[ti];
      const yd = deckY(ts);
      const base = groundAt(ts);
      const top = yd + Ht;
      const c = P(ts, 0, 0);
      const at = (lat, y) => [c[0] + vx * lat, y, c[2] + vz * lat];
      if (style.tower === 'A') {
        // inverted Y: legs from outside the deck converge above it into a single column
        const join = yd + Ht * 0.5;
        for (const sd of [-1, 1]) {
          mesh.beam(at(sd * (hw + 4), base), at(sd * 1.6, join), along, 2.2, 2.6, 7, bid, ts, 0);
          rib(at(sd * (hw + 4 + 2.25), base + 4), at(sd * (1.6 + 2.25), join), 0.22, 1, ts, ts, 0);
        }
        mesh.beam(at(0, join - 2), at(0, top), along, 2.4, 3.0, 7, bid, ts, join);
        mesh.beam(at(-(hw + 2), yd - 4.5), at(hw + 2, yd - 4.5), along, 1.6, 1.4, 7, bid, ts);
        for (const sd of [-1, 1]) rib(at(sd * 2.45, join), at(sd * 2.45, top), 0.22, 1, ts, ts, join);
        mesh.beam(at(0, top), at(0, top + 6), along, 1.0, 1.0, 7, bid, ts, top);
      } else {
        // H tower: two legs with crossbeams
        for (const sd of [-1, 1]) {
          mesh.beam(at(sd * (hw + 2.5), base), at(sd * (hw + 1.8), top), along, 1.8, 2.6, 7, bid, ts, 0);
          rib(at(sd * (hw + 4.4), base + 4), at(sd * (hw + 3.7), top), 0.22, 1, ts, ts, 0);
        }
        for (const y of [yd - 4.5, top - 8, top - 30]) mesh.beam(at(-(hw + 2), y), at(hw + 2, y), along, 1.4, 1.6, 7, bid, ts);
      }
      // stay cables: fan to both sides of the tower, two cable planes
      const N = 14;
      const reach = Math.min(span / 2 - 10, ts === mainA ? ts - 15 : len - ts - 15);
      for (let k = 1; k <= N; k++) {
        const dd = reach * k / N;
        const ya = top - 4 - (N - k) * 2.6;
        for (const dir of [-1, 1]) {
          const sd2 = ts + dir * dd;
          for (const sd of [-1, 1]) {
            const anchorLat = style.tower === 'A' ? sd * 1.2 : sd * (hw + 1.8);
            const pa = at(anchorLat, ya);
            const pd = P(sd2, sd * (hw - 0.4), 0.3);
            rib(pd, pa, 0.13, 0, sd2, ts, 0);
          }
        }
      }
      // pylon uplights at deck level and the top, lit band and light at the waterline
      lightsOut.push([c[0], yd + 3, c[2], 30, style.a[0] * 30, style.a[1] * 30, style.a[2] * 30]);
      lightsOut.push([c[0], top - 6, c[2], 26, style.b[0] * 22, style.b[1] * 22, style.b[2] * 22]);
      if (base < 0) footing(c[0], c[2], ts, hw + 9);
      towers.push({ x: c[0], z: c[2], top });
    }
  } else if (B.type === 'suspension') {
    const span = mainB - mainA;
    const Ht = Math.max(110, span * 0.25);
    const towerS = [mainA, mainB];
    const tops = [];
    for (let ti = 0; ti < 2; ti++) {
      const ts = towerS[ti];
      const yd = deckY(ts);
      const base = groundAt(ts);
      const top = yd + Ht;
      tops.push(top);
      const c = P(ts, 0, 0);
      const at = (lat, y) => [c[0] + vx * lat, y, c[2] + vz * lat];
      for (const sd of [-1, 1]) {
        mesh.beam(at(sd * (hw + 3), base), at(sd * (hw + 2.2), top), along, 2.0, 3.0, 3, bid, ts, 0);
        rib(at(sd * (hw + 5.1), base + 4), at(sd * (hw + 4.3), top), 0.25, 1, ts, ts, 0);
        mesh.beam(at(sd * (hw + 2.2), top), at(sd * (hw + 2.2), top + 4), along, 1.4, 1.4, 3, bid, ts, top);
      }
      // portal crossbeams (gate-like, with a curved look from three beams)
      for (const y of [yd - 4.5, top - 6, top - 38, top - 70]) {
        if (y < yd + 8 && y > yd - 4) continue;
        mesh.beam(at(-(hw + 2.5), y), at(hw + 2.5, y), along, 2.0, 2.4, 3, bid, ts);
        rib(at(-(hw + 2.5), y - 2.6), at(hw + 2.5, y - 2.6), 0.2, 1, ts, ts, y);
      }
      lightsOut.push([c[0], yd + 3, c[2], 32, style.a[0] * 30, style.a[1] * 30, style.a[2] * 30]);
      lightsOut.push([c[0], top - 10, c[2], 30, style.b[0] * 26, style.b[1] * 26, style.b[2] * 26]);
      if (base < 0) footing(c[0], c[2], ts, hw + 8);
      towers.push({ x: c[0], z: c[2], top });
    }
    // main cables (parabola between towers) and back stays to anchorages, hangers every 10 m
    const sag = deckY((mainA + mainB) / 2) + 3.5;
    for (const sd of [-1, 1]) {
      const lat = sd * (hw + 2.2);
      const cableY = (s) => {
        if (s >= mainA && s <= mainB) {
          const x = (s - (mainA + mainB) / 2) / (span / 2);
          return sag + (tops[0] + 2 - sag) * x * x;
        }
        // back spans: straight line from the tower top down to the anchorage
        if (s < mainA) { const a = 25; return deckY(a) + 1 + (tops[0] + 2 - deckY(a) - 1) * Math.max((s - a) / (mainA - a), 0); }
        const a = len - 25; return deckY(a) + 1 + (tops[1] + 2 - deckY(a) - 1) * Math.max((a - s) / (a - mainB), 0);
      };
      const at = (s) => { const p = P(s, lat, 0); return [p[0], cableY(s), p[2]]; };
      const segs = 48;
      for (let k = 0; k < segs; k++) {
        const s0 = mainA + (mainB - mainA) * k / segs, s1 = mainA + (mainB - mainA) * (k + 1) / segs;
        rib(at(s0), at(s1), 0.42, 2, s0, s1, 0);
        rib(add(at(s0), [0, 0.5, 0]), add(at(s1), [0, 0.5, 0]), 0.1, 1, s0, s1, 0);
      }
      rib(at(25), at(mainA), 0.42, 2, 25, mainA, 0);
      rib(at(mainB), at(len - 25), 0.42, 2, mainB, len - 25, 0);
      rib(add(at(25), [0, 0.5, 0]), add(at(mainA), [0, 0.5, 0]), 0.1, 1, 25, mainA, 0);
      rib(add(at(mainB), [0, 0.5, 0]), add(at(len - 25), [0, 0.5, 0]), 0.1, 1, mainB, len - 25, 0);
      mesh.beam(add(at(25), [0, -6, 0]), add(at(25), [0, 1, 0]), along, 3, 3, 0, bid, 25);
      mesh.beam(add(at(len - 25), [0, -6, 0]), add(at(len - 25), [0, 1, 0]), along, 3, 3, 0, bid, len - 25);
      for (let s = mainA + 10; s < mainB - 5; s += 10) {
        const top = at(s);
        const bot = P(s, lat * 0.93, 0.2);
        if (top[1] - bot[1] > 1.5) rib(bot, top, 0.08, 2, s, s, 0);
      }
    }
  } else if (B.type === 'arch') {
    // through arch: springs near the water line on both banks, crown above the deck, hangers / struts to the deck
    const truss = B.name === 'Chaotianmen Arch';
    const sa = Math.max(sw0 - 25, 20), sb = Math.min(sw1 + 25, len - 20);
    const span = sb - sa;
    const mid = (sa + sb) / 2;
    const yS = 4;
    const rise = Hd + span * 0.17 - yS;
    const archY = (s) => { const x = (s - mid) / (span / 2); return yS + rise * (1 - x * x); };
    const lowerY = (s) => archY(s) - (truss ? 7 + 9 * Math.abs((s - mid) / (span / 2)) : 0);
    const segs = 44;
    for (const sd of [-1, 1]) {
      const lat = sd * (hw + 2.0);
      const at = (s, y) => { const p = P(s, lat, 0); return [p[0], y, p[2]]; };
      for (let k = 0; k < segs; k++) {
        const s0 = sa + span * k / segs, s1 = sa + span * (k + 1) / segs;
        mesh.beam(at(s0, archY(s0)), at(s1, archY(s1)), lateral, 1.4, 1.6, 3, bid, s0);
        rib(at(s0, archY(s0) + 1.75), at(s1, archY(s1) + 1.75), 0.2, 1, s0, s1, archY(s0));
        if (truss) {
          mesh.beam(at(s0, lowerY(s0)), at(s1, lowerY(s1)), lateral, 1.1, 1.2, 3, bid, s0);
          rib(at(s0, lowerY(s0) - 1.3), at(s1, lowerY(s1) - 1.3), 0.18, 1, s0, s1, lowerY(s0));
          // truss diagonals and verticals
          rib(at(s0, lowerY(s0)), at(s1, archY(s1)), 0.35, 2, s0, s1, 0);
          rib(at(s0, lowerY(s0)), at(s0, archY(s0)), 0.35, 2, s0, s0, 0);
        }
      }
      // springs: massive piers
      for (const s of [sa, sb]) {
        const g = groundAt(s);
        mesh.beam(at(s, g - 2), at(s, yS + 2), along, 4.5, 4, 0, bid, s);
        if (g < 0) { const b0 = at(s, 0); waterline(b0[0], b0[2], 4.5, s); }
      }
      // hangers above the deck, struts below it
      for (let s = sa + 12; s < sb - 6; s += 12) {
        const ya = truss ? lowerY(s) : archY(s);
        const yd = deckY(s);
        const pd = P(s, lat, 0);
        if (ya > yd + 1.5) rib([pd[0], yd + 0.2, pd[2]], [pd[0], ya, pd[2]], 0.09, 2, s, s, 0);
        else if (ya < yd - 4) mesh.beam([pd[0], ya, pd[2]], [pd[0], yd - 1.8, pd[2]], along, 0.6, 0.6, 3, bid, s);
      }
    }
    // wind bracing between the ribs where they are high above the road
    for (let s = sa + 18; s < sb - 18; s += 24) {
      const y = archY(s);
      if (y < deckY(s) + 9) continue;
      const a = P(s, -(hw + 2), 0), b = P(s, hw + 2, 0);
      mesh.beam([a[0], y - 0.5, a[2]], [b[0], y - 0.5, b[2]], along, 0.7, 0.8, 3, bid, s);
    }
    const c = P(mid, 0, 0);
    lightsOut.push([c[0], archY(mid) - 6, c[2], 36, style.a[0] * 30, style.a[1] * 30, style.a[2] * 30]);
    for (const s of [sa + span * 0.25, sb - span * 0.25]) {
      const p = P(s, 0, 0);
      lightsOut.push([p[0], archY(s) - 4, p[2], 30, style.b[0] * 20, style.b[1] * 20, style.b[2] * 20]);
    }
  }

  return { name: B.name, type: B.type, ax: B.ax, az: B.az, bx: B.bx, bz: B.bz, width: B.width, deck: Hd,
    points: pts, length: len, towers, yAt: (t) => deckY(Math.min(Math.max(t, 0), 1) * len) };
}

export default {
  name: 'bridges',
  init(ctx) {
    const d = ctx.device, world = ctx.world;
    const mesh = new Mesh();
    const ribs = [], lights = [], colliders = [];
    const decks = [];
    world.bridges.forEach((B, i) => decks.push(buildBridge(world, B, i, mesh, ribs, lights, colliders)));
    world.shared.bridgeDecks = decks;
    for (const c of colliders) world.addCollider(c[0], c[1], c[2], c[3], c[4], c[5], c[6]);
    for (const L of lights) ctx.lights.add(L[0], L[1], L[2], L[3], L[4], L[5], L[6]);
    this.lightCount = lights.length;

    this.vbuf = d.createBuffer({ size: mesh.v.length * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.vbuf, 0, new Float32Array(mesh.v));
    this.ibuf = d.createBuffer({ size: mesh.i.length * 4, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.ibuf, 0, new Uint32Array(mesh.i));
    this.indexCount = mesh.i.length;
    const rd = new Float32Array(Math.max(ribs.length, 1) * 12);
    ribs.forEach((r, i) => rd.set(r, i * 12));
    this.ribCount = ribs.length;
    this.ribBuf = d.createBuffer({ size: rd.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.ribBuf, 0, rd);
    const sd = new Float32Array(8 * 12);
    world.bridges.forEach((B, i) => {
      const st = STYLE[B.name] || STYLE['Peninsula South Bridge'];
      sd.set([...st.a, 0, ...st.b, 0, ...st.steel, 0], i * 12);
    });
    this.styleBuf = d.createBuffer({ size: sd.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.styleBuf, 0, sd);

    const VF = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
    this.layout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: VF, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: VF, buffer: { type: 'read-only-storage' } },
    ] });
    this.group = d.createBindGroup({ layout: this.layout, entries: [
      { binding: 0, resource: { buffer: this.styleBuf } }, { binding: 1, resource: { buffer: this.ribBuf } }] });
    const r = ctx.renderer;
    this.meshPipe = r.gbufferPipeline({ label: 'bridges', code: MESH_WGSL, groups: [this.layout],
      buffers: [{ arrayStride: 40, attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x2' }, { shaderLocation: 3, offset: 32, format: 'float32x2' }] }] });
    this.ribPipe = r.gbufferPipeline({ label: 'bridge-ribbons', code: RIBBON_WGSL, groups: [this.layout], cull: 'none' });
  },
  gbuffer(ctx, pass) {
    pass.setBindGroup(1, this.group);
    pass.setPipeline(this.meshPipe);
    pass.setVertexBuffer(0, this.vbuf);
    pass.setIndexBuffer(this.ibuf, 'uint32');
    pass.drawIndexed(this.indexCount);
    pass.setPipeline(this.ribPipe);
    pass.draw(6, this.ribCount);
  },
};
