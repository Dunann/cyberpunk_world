// Sky operations meshes: the advertising airship (about 6k triangles), the launch rocket and the spaceport.
// Local frames: airship x = left (port), y = up, z = forward (nose at +z); rocket y = up along the body.
// Material ids (vertex me.x), read by skyopsWgsl.js:
//   0 hull  1 sail panel (LED)  2 batten / spar  3 gondola window band  4 dark metal (gondola, pods, masts)
//   5 rotor disc  10 deck concrete  11 pile / mount concrete  12 tower steel  13 scorched pad  14 flood lamp face
//   15 hangar / tank panels  16 deck edge lights  17 hangar door light  20 rocket white  21 rocket black band
//   22 nozzle / engine

import { MeshBuilder, norm } from './trafficGeom.js';
import { HULL_LEN, HULL_R, DECK_HALF } from './skyopsLayout.js';

// Hull radius at axial position z (nose +90 .. tail -90): blunt elliptical nose, parallel middle, long tail cone.
export function hullRadius(z) {
  const t = Math.min(Math.max((HULL_LEN / 2 - z) / HULL_LEN, 0), 1); // 0 nose, 1 tail
  if (t < 0.18) { const k = 1 - t / 0.18; return HULL_R * Math.sqrt(Math.max(1 - k * k, 0)); }
  if (t < 0.55) return HULL_R;
  const u = (t - 0.55) / 0.45;
  return HULL_R * (0.07 + 0.93 * Math.pow(Math.max(1 - u * u, 0), 0.8));
}

// Smooth lathe of the hull: 32 segments around, rings dense at the nose and tail.
function lathe(mb) {
  const SEG = 32;
  const rings = [];
  for (let i = 0; i <= 27; i++) {
    const t = i / 27;
    // more rings near the nose (t^1.6 near 0) and the tail tip
    const tt = t < 0.5 ? 0.5 * Math.pow(t * 2, 1.6) : 1 - 0.5 * Math.pow((1 - t) * 2, 1.25);
    rings.push(HULL_LEN / 2 - tt * HULL_LEN);
  }
  const base = mb.vertexCount;
  for (const z of rings) {
    const r = hullRadius(z);
    const e = 0.5;
    const dr = (hullRadius(z + e) - hullRadius(z - e)) / (2 * e); // dr/dz
    let nr = 1, nz = -dr; const nl = Math.hypot(nr, nz); nr /= nl; nz /= nl;
    if (r < 1e-3) { nr = 0; nz = 1; }
    for (let k = 0; k <= SEG; k++) {
      const phi = k / SEG * Math.PI * 2;
      const s = Math.sin(phi), c = Math.cos(phi);
      mb.vert(s * r, c * r, z, s * nr, c * nr, nz, HULL_LEN / 2 - z, phi * HULL_R, 0, 0);
    }
  }
  const W = SEG + 1;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < SEG; k++) {
      const a = base + i * W + k, b = a + 1, c = a + W + 1, d = a + W;
      // ring i is forward of ring i+1; phi increases toward +x (left). Outward-facing CCW: a, b, c / a, c, d
      mb.idx.push(a, b, c, a, c, d);
    }
  }
}

function pushTwoSided(mb, a, b, c, d, n, uvs, mat, extra) {
  mb.quad(a, b, c, d, n, uvs, mat, extra);
  mb.quad(a, b, c, d, [-n[0], -n[1], -n[2]], uvs, mat, extra);
}

export function airshipMesh() {
  const mb = new MeshBuilder();
  lathe(mb);
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];

  // junk-sail fins in X layout: 5 fanned battens with 4 LED panels between them
  for (let f = 0; f < 4; f++) {
    const phi = Math.PI / 4 + f * Math.PI / 2;
    const e = [Math.sin(phi), Math.cos(phi)]; // radial direction in x-y
    const side = norm([e[1], -e[0], 0]);       // fin plane normal
    const P = (z, rad) => [e[0] * rad, e[1] * rad, z];
    const roots = [], tips = [];
    for (let i = 0; i < 5; i++) {
      const k = i / 4;
      const zr = -38 - 42 * k;
      const rr = hullRadius(zr) - 0.4;
      const zt = -30 - 70 * Math.pow(k, 1.15);      // the leech fans aft past the tail like a junk sail
      const span = 24 + 5 * Math.sin(k * Math.PI) - 3 * k;
      roots.push(P(zr, rr)); tips.push(P(zt, rr + span));
    }
    for (let i = 0; i < 5; i++) mb.beam(roots[i], tips[i], 0.4, 0.4, 2);
    // outer edge (leech) and root spar
    for (let i = 0; i < 4; i++) { mb.beam(tips[i], tips[i + 1], 0.25, 0.25, 2); }
    for (let i = 0; i < 4; i++) {
      // each panel split along its length into two bagged halves (the cloth bellies out a little)
      const a0 = roots[i], b0 = roots[i + 1], a1 = tips[i], b1 = tips[i + 1];
      const mid = (p, q, bag) => [(p[0] + q[0]) / 2 + side[0] * bag, (p[1] + q[1]) / 2 + side[1] * bag, (p[2] + q[2]) / 2];
      const am = mid(a0, a1, 0.6), bm = mid(b0, b1, 0.6);
      const ex = f * 4 + i;
      pushTwoSided(mb, a0, b0, bm, am, side, [[0, 0], [0, 1], [0.5, 1], [0.5, 0]], 1, ex);
      pushTwoSided(mb, am, bm, b1, a1, side, [[0.5, 0], [0.5, 1], [1, 1], [1, 0]], 1, ex);
    }
  }

  // gondola with a lit window band
  mb.box([0, -HULL_R - 2.2, 24], X, Y, Z, 3.6, 2.6, 15, 4);
  mb.box([0, -HULL_R - 1.7, 24], X, Y, Z, 3.75, 0.7, 13.5, 3, 0, 1 | 2 | 16 | 32);
  mb.box([0, -HULL_R - 4.4, 30], X, Y, Z, 1.2, 0.8, 1.2, 4); // searchlight turret
  // engine pods on pylons, with rotor discs facing forward
  for (const [sx, y, z] of [[1, -7, 46], [-1, -7, 46], [1, -9, -18], [-1, -9, -18]]) {
    const r = hullRadius(z);
    const pod = [sx * (r + 7), y, z];
    mb.beam([sx * (r - 1) * 0.92, y * 0.9, z], pod, 0.5, 0.35, 4);
    mb.box(pod, X, Y, Z, 1.3, 1.3, 3.5, 4);
    const c = [pod[0], pod[1], pod[2] + 3.9];
    const n = 14, R = 4.2;
    for (let k = 0; k < n; k++) {
      const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2;
      const p0 = [c[0] + Math.cos(a0) * R, c[1] + Math.sin(a0) * R, c[2]];
      const p1 = [c[0] + Math.cos(a1) * R, c[1] + Math.sin(a1) * R, c[2]];
      mb.tri(c, p0, p1, Z, [[0, 0], [1, a0], [1, a1]], 5);
      mb.tri(c, p0, p1, [0, 0, -1], [[0, 0], [1, a0], [1, a1]], 5);
    }
  }
  // masts on the spine
  mb.beam([0, HULL_R - 0.5, 52], [0, HULL_R + 7, 50], 0.2, 0.2, 4);
  mb.beam([0, HULL_R - 0.5, -4], [0, HULL_R + 4.5, -5], 0.15, 0.15, 4);
  mb.box([0, HULL_R + 0.3, 12], X, Y, Z, 0.8, 0.6, 2.2, 4); // strobe housing
  return mb;
}

// Rocket: base at the origin, body along +y. 72 m tall core stage + upper stage, 4.2 m radius.
export function rocketMesh() {
  const mb = new MeshBuilder();
  const R = 4.2, N = 16;
  mb.prism(0, 0, 0, 40, R, N, 20, 0, false);
  mb.prism(0, 0, 40, 44, R + 0.05, N, 21, 0, false);
  mb.prism(0, 0, 44, 64, R, N, 20, 0, false);
  mb.prism(0, 0, 64, 66, R + 0.05, N, 21, 0, false);
  // ogive nose
  const rings = [66, 69, 72, 75, 78, 81];
  for (let i = 0; i < rings.length - 1; i++) {
    const r0 = R * Math.sqrt(1 - Math.pow(i / (rings.length - 1), 2.0)), r1 = R * Math.sqrt(Math.max(1 - Math.pow((i + 1) / (rings.length - 1), 2.0), 0));
    for (let k = 0; k < N; k++) {
      const a0 = k / N * Math.PI * 2, a1 = (k + 1) / N * Math.PI * 2, am = (a0 + a1) / 2;
      const ny = (r0 - r1) / (rings[i + 1] - rings[i]);
      const nn = norm([Math.cos(am), ny, Math.sin(am)]);
      const p = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
      if (r1 > 0.01) mb.quad(p(a0, r0, rings[i]), p(a1, r0, rings[i]), p(a1, r1, rings[i + 1]), p(a0, r1, rings[i + 1]), nn, [[0, 0], [1, 0], [1, 1], [0, 1]], 20);
      else mb.tri(p(a0, r0, rings[i]), p(a1, r0, rings[i]), [0, rings[i + 1], 0], nn, [[0, 0], [1, 0], [0.5, 1]], 20);
    }
  }
  // fins
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
    const n = [-s, 0, c];
    const p = (r, y) => [c * r, y, s * r];
    mb.quad(p(R, 0), p(R + 3.2, 0), p(R + 1.2, 9), p(R, 12), n, [[0, 0], [1, 0], [1, 1], [0, 1]], 21);
    mb.quad(p(R, 0), p(R + 3.2, 0), p(R + 1.2, 9), p(R, 12), [s, 0, -c], [[0, 0], [1, 0], [1, 1], [0, 1]], 21);
  }
  // engine bells
  for (const [x, z] of [[1.8, 1.8], [-1.8, 1.8], [1.8, -1.8], [-1.8, -1.8], [0, 0]]) mb.prism(x, z, -3.2, 0, 1.15, 8, 22, 0, false);
  return mb;
}

// The spaceport in world space: deck on piles, launch mount, lattice tower, flood masts, hangar and tanks.
// site {x, z}; plan {deckY, piles}; returns {mesh, rocketBase: [x, y, z], floods: [[x,y,z]...], towerTop, redLights}
export function spaceportMesh(site, plan) {
  const mb = new MeshBuilder();
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
  const sx = site.x, sz = site.z, dy = plan.deckY;
  // deck slab (top at deckY)
  mb.box([sx, dy - 1.6, sz], X, Y, Z, DECK_HALF, 1.6, DECK_HALF, 10);
  // edge girder with lights
  for (const [ox, oz, hx, hz] of [[0, -DECK_HALF, DECK_HALF, 0.3], [0, DECK_HALF, DECK_HALF, 0.3], [-DECK_HALF, 0, 0.3, DECK_HALF], [DECK_HALF, 0, 0.3, DECK_HALF]]) {
    mb.box([sx + ox, dy + 0.35, sz + oz], X, Y, Z, hx + 0.3, 0.35, hz + 0.3, 16);
  }
  // piles down to the ground (every corner and edge midpoint included), with bracing on the tall ones
  const P = plan.piles;
  for (const p of P) {
    const top = dy - 3.2, bot = p.ground - 4;
    mb.box([p.x, (top + bot) / 2, p.z], X, Y, Z, 1.7, (top - bot) / 2, 1.7, 11);
  }
  const at = (i, j) => P[i * 5 + j];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    for (const [di, dj] of [[1, 0], [0, 1]]) {
      if (i + di > 4 || j + dj > 4) continue;
      const a = at(i, j), b = at(i + di, j + dj);
      const lowTop = dy - 3.2;
      const gmax = Math.max(a.ground, b.ground);
      if (lowTop - gmax < 14) continue;
      const ym = gmax + (lowTop - gmax) * 0.5;
      mb.beam([a.x, ym, a.z], [b.x, ym, b.z], 0.6, 0.6, 12);
      mb.beam([a.x, lowTop - 1, a.z], [b.x, Math.max(ym, gmax + 2), b.z], 0.35, 0.35, 12);
      mb.beam([b.x, lowTop - 1, b.z], [a.x, Math.max(ym, gmax + 2), a.z], 0.35, 0.35, 12);
    }
  }
  // launch mount and scorched pad around it
  const rb = [sx, dy + 7, sz];
  mb.box([sx, dy + 0.02, sz], X, Y, Z, 22, 0.02, 22, 13, 0, 4);
  for (const [ox, oz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) mb.box([sx + ox * 7, dy + 3.5, sz + oz * 7], X, Y, Z, 2.5, 3.5, 2.5, 11);
  mb.box([sx, dy + 6.5, sz], X, Y, Z, 9.5, 0.5, 9.5, 11, 0, 1 | 2 | 4 | 16 | 32);
  // lattice umbilical tower north of the rocket: 4 legs, X-bracing every 10 m, service arms
  const tx = sx, tz = sz - 17, H = 160, w = 5;
  const legs = [[-w, -w], [w, -w], [w, w], [-w, w]];
  for (const [lx, lz] of legs) mb.beam([tx + lx, dy, tz + lz], [tx + lx, dy + H, tz + lz], 0.7, 0.7, 12);
  for (let y = 0; y < H; y += 10) {
    for (let k = 0; k < 4; k++) {
      const a = legs[k], b = legs[(k + 1) % 4];
      mb.beam([tx + a[0], dy + y, tz + a[1]], [tx + b[0], dy + y + 10, tz + b[1]], 0.22, 0.22, 12);
      mb.beam([tx + b[0], dy + y, tz + b[1]], [tx + a[0], dy + y + 10, tz + a[1]], 0.22, 0.22, 12);
      mb.beam([tx + a[0], dy + y + 10, tz + a[1]], [tx + b[0], dy + y + 10, tz + b[1]], 0.3, 0.3, 12);
    }
  }
  for (const y of [30, 62, 76]) {
    mb.box([tx, dy + y, tz + 8.5], X, Y, Z, 1.4, 1.0, 4.2, 12);
    mb.box([tx, dy + y + 1.2, tz], X, Y, Z, 6.2, 0.25, 6.2, 12);
  }
  mb.beam([tx, dy + H, tz], [tx, dy + H + 22, tz], 0.3, 0.3, 12); // lightning mast
  // flood masts around the pad aimed at the rocket
  const floods = [];
  for (let k = 0; k < 3; k++) {
    const a = Math.PI / 2 + k * Math.PI * 2 / 3;
    const mx = sx + Math.cos(a) * 58, mz = sz + Math.sin(a) * 58, mh = 38;
    mb.beam([mx, dy, mz], [mx, dy + mh, mz], 0.6, 0.6, 12);
    const toR = norm([sx - mx, 0, sz - mz]);
    const side = [-toR[2], 0, toR[0]];
    mb.box([mx + toR[0] * 0.8, dy + mh + 1.5, mz + toR[2] * 0.8], side, Y, toR, 4, 1.8, 0.5, 14);
    floods.push([mx + toR[0] * 1.5, dy + mh + 1.5, mz + toR[2] * 1.5]);
  }
  // vertical integration hangar and propellant tanks
  mb.ybox(sx - 46, dy + 24, sz + 40, 18, 24, 14, 0, 15);
  mb.box([sx - 46, dy + 14, sz + 26 - 0.15], X, Y, Z, 9, 14, 0.2, 17, 0, 32);
  for (const [ox, oz] of [[52, -50], [52, -30]]) { mb.prism(sx + ox, sz + oz, dy, dy + 16, 6, 14, 15, 0, true); }
  const redLights = [[tx, dy + H + 22.5, tz]];
  for (const y of [40, 80, 120, 160]) redLights.push([tx + w + 0.8, dy + y, tz - w - 0.8]);
  return { mb, rocketBase: rb, floods, towerTop: [tx, dy + H, tz], redLights };
}
