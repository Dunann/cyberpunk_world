// Sky operations (I-009 airships, kept in I-020 without the launch): placement rules and timing for the three
// advertising airships.
// Pure CPU code (no GPU), so tools/skyops-test.mjs can check it in Node.
//
// Every placement is derived from the world layout (RIVERS, BRIDGES, DISTRICTS, LANDMARKS, colliders, terrain and
// the air-traffic lanes), never from camera poses. All phase and timing constants below are locked: they were fixed
// before the first capture and must not be changed after looking at captures (review-1 fix 3).

import { RIVERS, BRIDGES, DISTRICTS, DT, LANDMARKS } from './world.js';
import { catmullRom, rng } from './math.js';

// ---------------------------------------------------------------- locked constants

export const SKY_SEED = 909;            // rng seed for the airship phases and directions
export const HULL_LEN = 180;            // m
export const HULL_R = 18;               // m (36 m maximum diameter)
export const HULL_BOTTOM = 26;          // m from the hull axis down to the gondola keel
export const SHIP_SPEED = 6;            // m/s
export const TRACK_R = 90;              // m: leg offset from the river centreline = turn radius of the end semicircles
export const STRAIGHT_MAX = 600;        // m (lap = 2 * 600 + 2 * pi * 90 = 1.77 km)
export const STRAIGHT_MIN = 320;        // m (lap >= 1.2 km)
export const SHOW_CENTER = [2380, 215, -1000];
export const SHOW_CLEAR = 300;          // m, horizontal clearance of the Bund-CBD track from the drone-show centre
export const ALT_MIN = 280;
export const TOWER_CLEAR_V = 70, TOWER_CLEAR_H = 250;
export const TRAFFIC_BAND = 50;         // +-40 m around a traffic altitude plus the +-10 m taxi offsets
export const TRAFFIC_NEAR = 300;        // m: traffic paths closer than this to a track constrain its altitude

// ---------------------------------------------------------------- polyline helpers

function cumulative(pts) {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return s;
}
// Point and unit tangent at arc length s on a polyline (pts [[x,z],...], cumulative S).
function sampleAt(pts, S, s) {
  let i = 1;
  while (i < S.length - 1 && S[i] < s) i++;
  const a = pts[i - 1], b = pts[i];
  const L = S[i] - S[i - 1] || 1;
  const t = Math.min(Math.max((s - S[i - 1]) / L, 0), 1);
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx: (b[0] - a[0]) / L, tz: (b[1] - a[1]) / L };
}
function segIntersect(a, b, c, d) {
  const rx = b[0] - a[0], rz = b[1] - a[1], sx = d[0] - c[0], sz = d[1] - c[1];
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return -1;
  const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den;
  const u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : -1;
}
// Arc length on the polyline where it crosses segment c-d (or the nearest approach to the segment midpoint).
function crossingS(pts, S, c, d) {
  for (let i = 1; i < pts.length; i++) {
    const t = segIntersect(pts[i - 1], pts[i], c, d);
    if (t >= 0) return S[i - 1] + (S[i] - S[i - 1]) * t;
  }
  return nearestS(pts, S, (c[0] + d[0]) / 2, (c[1] + d[1]) / 2);
}
function nearestS(pts, S, x, z) {
  let best = 1e18, bs = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const bx = b[0] - a[0], bz = b[1] - a[1];
    const L2 = bx * bx + bz * bz || 1;
    const h = Math.min(Math.max(((x - a[0]) * bx + (z - a[1]) * bz) / L2, 0), 1);
    const d = Math.hypot(x - a[0] - bx * h, z - a[1] - bz * h);
    if (d < best) { best = d; bs = S[i - 1] + (S[i] - S[i - 1]) * h; }
  }
  return bs;
}
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz || 1;
  const h = Math.min(Math.max(((px - ax) * dx + (pz - az) * dz) / L2, 0), 1);
  return Math.hypot(px - ax - dx * h, pz - az - dz * h);
}

// ---------------------------------------------------------------- airship tracks

function centreline(name) {
  const r = RIVERS.find((q) => q.name === name);
  const pts = catmullRom(r.points.map((p) => [p[0], p[1]]), 10);
  return { pts, S: cumulative(pts) };
}

// The three river stretches (review-1 fix 4). Returns [{name, pts, S, s0, s1}] with the straight leg [s0, s1] on the
// Great River centreline.
export function trackStretches() {
  const G = centreline('Great River');
  const J = centreline('Jade River');
  const out = [];

  // 1. Confluence: centred on the Jade / Great River centreline intersection, legs along the Great River.
  let sc = -1;
  for (let i = 1; i < J.pts.length && sc < 0; i++) {
    for (let k = 1; k < G.pts.length; k++) {
      const t = segIntersect(G.pts[k - 1], G.pts[k], J.pts[i - 1], J.pts[i]);
      if (t >= 0) { sc = G.S[k - 1] + (G.S[k] - G.S[k - 1]) * t; break; }
    }
  }
  if (sc < 0) { const e = J.pts[J.pts.length - 1]; sc = nearestS(G.pts, G.S, e[0], e[1]); } // nearest approach
  out.push({ name: 'confluence', ...G, s0: sc - STRAIGHT_MAX / 2, s1: sc + STRAIGHT_MAX / 2 });

  // 2. Bund-CBD: the longer part of the Great River between the Bund Suspension and North Cable bridges whose
  //    centreline stays SHOW_CLEAR + TRACK_R from the drone-show centre. The hull (half length past the leg ends)
  //    stays inside that part.
  const bA = BRIDGES.find((b) => b.name === 'Bund Suspension'), bB = BRIDGES.find((b) => b.name === 'North Cable Bridge');
  let sa = crossingS(G.pts, G.S, [bA.ax, bA.az], [bA.bx, bA.bz]);
  let sb = crossingS(G.pts, G.S, [bB.ax, bB.az], [bB.bx, bB.bz]);
  if (sa > sb) { const q = sa; sa = sb; sb = q; }
  const ok = (s) => { const p = sampleAt(G.pts, G.S, s); return Math.hypot(p.x - SHOW_CENTER[0], p.z - SHOW_CENTER[2]) >= SHOW_CLEAR + TRACK_R; };
  let best = null, run = null;
  for (let s = sa; s <= sb; s += 5) {
    if (ok(s)) { if (!run) run = [s, s]; run[1] = s; } else run = null;
    if (run && (!best || run[1] - run[0] > best[1] - best[0])) best = [run[0], run[1]];
  }
  const avail = best[1] - best[0];
  const S2 = Math.min(Math.max(avail - HULL_LEN, STRAIGHT_MIN), STRAIGHT_MAX);
  const m2 = (best[0] + best[1]) / 2;
  out.push({ name: 'bund-cbd', ...G, s0: m2 - S2 / 2, s1: m2 + S2 / 2 });

  // 3. Great River west of the peninsula: the whole track (legs plus the hull overhang) lies west of the
  //    Yuzhong peninsula district's bounding ellipse.
  const P = DISTRICTS.find((d) => d.type === DT.HILLSIDE);
  const halfX = Math.hypot(P.rx * Math.cos(P.angle), P.rz * Math.sin(P.angle));
  const xc = P.cx - halfX - (STRAIGHT_MAX / 2 + HULL_LEN / 2);
  let s3 = 0, bd = 1e18;
  for (let s = 0; s < G.S[G.S.length - 1]; s += 5) {
    const p = sampleAt(G.pts, G.S, s);
    if (Math.abs(p.x - xc) < bd) { bd = Math.abs(p.x - xc); s3 = s; }
  }
  out.push({ name: 'west', ...G, s0: s3 - STRAIGHT_MAX / 2, s1: s3 + STRAIGHT_MAX / 2 });
  return out;
}

// Closed racetrack around a straight [s0, s1] of a centreline: leg +n from s0 to s1, semicircle, leg -n back,
// semicircle. Resampled to a fixed spacing DS. Returns {x, z, hx, hz, bank: Float32Array, n, ds, length}.
const DS = 4;
export function buildRacetrack(st) {
  const raw = [];
  const legStep = 10;
  const n = Math.max(2, Math.ceil((st.s1 - st.s0) / legStep));
  const nrm = (p) => [-p.tz, p.tx]; // left normal of the tangent (x, z) -> (-tz, tx)
  for (let i = 0; i <= n; i++) {
    const p = sampleAt(st.pts, st.S, st.s0 + (st.s1 - st.s0) * i / n), q = nrm(p);
    raw.push([p.x + q[0] * TRACK_R, p.z + q[1] * TRACK_R]);
  }
  const arc = (p, sign) => {
    // semicircle around centreline point p: at the s1 end (sign 1) from offset +n to -n bulging forward along the
    // tangent; at the s0 end (sign -1) from -n back to +n bulging backward
    const q = nrm(p);
    for (let k = 1; k < 24; k++) {
      const a = Math.PI * k / 24;
      const c = Math.cos(a), s = Math.sin(a);
      raw.push([p.x + (q[0] * c + p.tx * s) * TRACK_R * sign, p.z + (q[1] * c + p.tz * s) * TRACK_R * sign]);
    }
  };
  arc(sampleAt(st.pts, st.S, st.s1), 1);
  for (let i = n; i >= 0; i--) {
    const p = sampleAt(st.pts, st.S, st.s0 + (st.s1 - st.s0) * i / n), q = nrm(p);
    raw.push([p.x - q[0] * TRACK_R, p.z - q[1] * TRACK_R]);
  }
  arc(sampleAt(st.pts, st.S, st.s0), -1);
  raw.push(raw[0].slice());
  const S = cumulative(raw);
  const length = S[S.length - 1];
  const m = Math.floor(length / DS);
  const x = new Float32Array(m), z = new Float32Array(m), hx = new Float32Array(m), hz = new Float32Array(m), bank = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    const p = sampleAt(raw, S, i * length / m);
    x[i] = p.x; z[i] = p.z;
  }
  for (let i = 0; i < m; i++) {
    const a = (i + m - 2) % m, b = (i + 2) % m;
    const dx = x[b] - x[a], dz = z[b] - z[a], L = Math.hypot(dx, dz) || 1;
    hx[i] = dx / L; hz[i] = dz / L;
  }
  // bank into the turns: +-2 degrees at full turn curvature, smoothed along the track
  const curv = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    const a = (i + m - 3) % m, b = (i + 3) % m;
    const cr = hx[a] * hz[b] - hz[a] * hx[b];
    curv[i] = cr / (6 * length / m);
  }
  for (let i = 0; i < m; i++) {
    let acc = 0;
    for (let k = -8; k <= 8; k++) acc += curv[(i + k + m) % m];
    bank[i] = Math.max(-1, Math.min(1, acc / 17 * TRACK_R)) * (2 * Math.PI / 180);
  }
  return { x, z, hx, hz, bank, n: m, ds: length / m, length };
}

// Position on a racetrack at arc length s (wraps). Writes {x, z, hx, hz, bank} into out.
export function trackAt(tr, s, out) {
  let u = (s % tr.length + tr.length) % tr.length / tr.ds;
  const i = Math.floor(u) % tr.n, j = (i + 1) % tr.n, f = u - Math.floor(u);
  out.u = u;                 // sample index and fraction (the searchlight interpolates its aim with it)
  out.x = tr.x[i] + (tr.x[j] - tr.x[i]) * f;
  out.z = tr.z[i] + (tr.z[j] - tr.z[i]) * f;
  let hx = tr.hx[i] + (tr.hx[j] - tr.hx[i]) * f, hz = tr.hz[i] + (tr.hz[j] - tr.hz[i]) * f;
  const L = Math.sqrt(hx * hx + hz * hz) || 1; // not Math.hypot: its result is boxed when not inlined
  out.hx = hx / L; out.hz = hz / L;
  out.bank = tr.bank[i] + (tr.bank[j] - tr.bank[i]) * f;
  return out;
}

// Highest building / landmark / terrain top within TOWER_CLEAR_H of any track sample (review-1 fix 10).
export function maxTopNear(world, tr) {
  const R = TOWER_CLEAR_H;
  let top = 0;
  const seen = new Set();
  for (let i = 0; i < tr.n; i += 4) {
    const x = tr.x[i], z = tr.z[i];
    for (const L of LANDMARKS) if (L.r > 0 && Math.hypot(x - L.x, z - L.z) < L.r + R) top = Math.max(top, world.heightAt(L.x, L.z) + L.h);
    for (let gx = -R; gx <= R + 64; gx += 64) for (let gz = -R; gz <= R + 64; gz += 64) {
      const cs = world.collidersNear ? world.collidersNear(x + gx, z + gz) : null;
      if (!cs) continue;
      for (const k of cs) {
        if (seen.has(k)) continue;
        const dx = x - k.cx, dz = z - k.cz;
        const lx = Math.abs(dx * k.cos + dz * k.sin) - k.hx, lz = Math.abs(-dx * k.sin + dz * k.cos) - k.hz;
        if (Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) < R) { seen.add(k); top = Math.max(top, k.cy + k.hy); }
      }
    }
    for (let a = 0; a < 8; a++) {
      const c = Math.cos(a * Math.PI / 4), s = Math.sin(a * Math.PI / 4);
      for (const r of [0, R * 0.5, R]) top = Math.max(top, world.heightAt(x + c * r, z + s * r));
    }
  }
  return top;
}

// Altitude bands blocked by the existing air traffic near a track: [[lo, hi], ...] (review-1 fix 10).
// traffic = {lanes: [[ax, az, bx, bz, alt]], circles: [[cx, cz, r, alt, user]], corridors: [[ax, az, bx, bz, alt]]}
export function trafficBands(tr, traffic) {
  const bands = [];
  const nearSeg = (ax, az, bx, bz) => {
    for (let i = 0; i < tr.n; i += 2) if (segDist(tr.x[i], tr.z[i], ax, az, bx, bz) < TRAFFIC_NEAR) return true;
    return false;
  };
  const nearRing = (cx, cz, r) => {
    for (let i = 0; i < tr.n; i += 2) if (Math.abs(Math.hypot(tr.x[i] - cx, tr.z[i] - cz) - r) < TRAFFIC_NEAR + 15) return true;
    return false;
  };
  for (const L of traffic.lanes || []) if (nearSeg(L[0], L[1], L[2], L[3])) {
    bands.push([L[4] - TRAFFIC_BAND, L[4] + TRAFFIC_BAND]);
    bands.push([120 - TRAFFIC_BAND, 200 + TRAFFIC_BAND]); // delivery drones on the lanes fly at 120-200 m
  }
  for (const C of traffic.circles || []) if (nearRing(C[0], C[1], C[2])) bands.push([C[3] - TRAFFIC_BAND, C[3] + TRAFFIC_BAND]);
  for (const L of traffic.corridors || []) if (nearSeg(L[0], L[1], L[2], L[3])) bands.push([L[4] - TRAFFIC_BAND, L[4] + TRAFFIC_BAND]);
  return bands;
}

// Lowest altitude >= ALT_MIN that clears the towers (hull keel 70 m above every top within 250 m) and every
// traffic band.
export function solveAltitude(world, tr, traffic) {
  const top = maxTopNear(world, tr);
  const bands = trafficBands(tr, traffic);
  let a = Math.max(ALT_MIN, Math.ceil((top + TOWER_CLEAR_V + HULL_BOTTOM) / 5) * 5);
  for (let guard = 0; guard < 400; guard++) {
    const hit = bands.find((b) => a > b[0] && a < b[1]);
    if (!hit) break;
    a = Math.ceil(hit[1] / 5) * 5;
  }
  return { alt: a, top, bands };
}

// Airship set: tracks, altitudes, phases. traffic: see trafficBands.
export function planAirships(world, traffic) {
  const rnd = rng(SKY_SEED);
  return trackStretches().map((st, i) => {
    const tr = buildRacetrack(st);
    const sol = solveAltitude(world, tr, traffic);
    return { index: i, name: st.name, track: tr, alt: sol.alt, top: sol.top, bands: sol.bands, phase: rnd() * tr.length, dir: rnd() < 0.5 ? 1 : -1, seed: rnd() };
  });
}

// Ship state at time t: position, heading frame and bank. Writes into out {x,y,z, fx,fy,fz, lx,ly,lz, ux,uy,uz}.
const _tp = { x: 0, z: 0, hx: 0, hz: 0, bank: 0, u: 0.5 };
export function shipState(ship, t, out) {
  const s = ship.phase + ship.dir * SHIP_SPEED * t;
  trackAt(ship.track, s, _tp);
  out.u = _tp.u;
  const hx = _tp.hx * ship.dir, hz = _tp.hz * ship.dir;
  const bank = _tp.bank * ship.dir + 0.004 * Math.sin(t * 0.21 + ship.seed * 9);
  const pitch = 0.012 * Math.sin(t * 0.13 + ship.seed * 5) ; // ~ +-0.7 deg gentle pitching
  out.x = _tp.x; out.z = _tp.z;
  out.y = ship.alt + 2.5 * Math.sin(t * 0.09 + ship.seed * 7);
  // forward with pitch
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const fx = hx * cp, fy = sp, fz = hz * cp;
  // left (horizontal) = up x forward
  let lx = fz, lz = -fx;
  const ll = Math.sqrt(lx * lx + lz * lz) || 1; lx /= ll; lz /= ll;
  // up0 = forward x left
  const u0x = fy * lz - fz * 0, u0y = fz * lx - fx * lz, u0z = fx * 0 - fy * lx;
  const cb = Math.cos(bank), sb = Math.sin(bank);
  out.fx = fx; out.fy = fy; out.fz = fz;
  out.lx = lx * cb + u0x * sb; out.ly = u0y * sb; out.lz = lz * cb + u0z * sb;
  out.ux = u0x * cb - lx * sb; out.uy = u0y * cb; out.uz = u0z * cb - lz * sb;
  return out;
}
