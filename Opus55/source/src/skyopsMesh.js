// Sky operations mesh: the advertising airship (about 2.6k triangles).
// Local frame: x = left (port), y = up, z = forward (nose at +z).
// Material ids (vertex me.x), read by skyopsWgsl.js:
//   0 hull  1 sail panel (framed, LED screen inset)  2 batten / spar  3 gondola window band
//   4 dark metal (gondola, pods, masts)  5 rotor disc  6 fin edge light (leech)

import { MeshBuilder, norm } from './trafficGeom.js';
import { HULL_LEN, HULL_R } from './skyopsLayout.js';

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

// Fin f (X layout) radial direction in the hull's x-y plane, and batten i (0..4) root and tip points.
function finDir(f) { const phi = Math.PI / 4 + f * Math.PI / 2; return [Math.sin(phi), Math.cos(phi)]; }
function finBatten(f, i) {
  const e = finDir(f);
  const k = i / 4;
  const zr = -38 - 42 * k;
  const rr = hullRadius(zr) - 0.4;
  const zt = -30 - 70 * Math.pow(k, 1.15);      // the leech fans aft past the tail like a junk sail
  const span = 24 + 5 * Math.sin(k * Math.PI) - 3 * k;
  return { root: [e[0] * rr, e[1] * rr, zr], tip: [e[0] * (rr + span), e[1] * (rr + span), zt] };
}

// Ship-local points of the outline lights (judge fix 3): a row along the spine, a row along the keel and three on
// each fin's lit edge. Flat [x, y, z, kind] with kind 0 spine, 1 keel, 2 fin edge.
export function shipOutlineLights() {
  const out = [];
  for (let z = -72; z <= 72.1; z += 18) out.push(0, hullRadius(z) + 0.5, z, 0);
  for (const z of [-66, -48, -30, -12, 4, 44, 60, 76]) out.push(0, -hullRadius(z) - 0.5, z, 1);
  for (let f = 0; f < 4; f++) for (const i of [0, 2, 4]) { const t = finBatten(f, i).tip; out.push(t[0], t[1], t[2], 2); }
  return out;
}

export function airshipMesh() {
  const mb = new MeshBuilder();
  lathe(mb);
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];

  // junk-sail fins in X layout: 5 fanned battens with 4 framed panels between them
  for (let f = 0; f < 4; f++) {
    const e = finDir(f);
    const side = norm([e[1], -e[0], 0]);       // fin plane normal
    const roots = [], tips = [];
    for (let i = 0; i < 5; i++) { const b = finBatten(f, i); roots.push(b.root); tips.push(b.tip); }
    for (let i = 0; i < 5; i++) mb.beam(roots[i], tips[i], 0.4, 0.4, 2);
    // outer edge (leech): an edge-lit spar, so the fin's outline reads at a distance
    for (let i = 0; i < 4; i++) { mb.beam(tips[i], tips[i + 1], 0.35, 0.35, 6); }
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
