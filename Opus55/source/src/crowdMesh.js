// Person meshes for the crowd at three levels of detail. All levels share the same part ids so one vertex shader
// poses them (see PERSON_WGSL in crowd.js). Rest pose: x = left, y = up, z = forward, arms hanging down.
//
// Part ids (vertex material id):
//   0 torso   1 head/neck skin   2/3 left/right leg   4/5 left/right upper arm   23/24 left/right forearm + hand
//   10 hips   8 phone (right hand)   6 canopy   7 pole   9 canopy rim (LED strip)
//   15 short hair   25 long hair   16 hood   17 beanie   18 steppe hat   19 long coat skirt   20 poncho   21 deel robe
// The shader hides the parts an agent does not wear by collapsing their vertices.

import { MeshBuilder, norm } from './trafficGeom.js';

// Arm chain shared with the shader: shoulder pivot height, elbow pivot height, shoulder x offset.
export const ARM_SX = 0.215, ARM_SY = 1.42, ARM_EY = 1.13;
// Umbrella grip pose of the left arm: shoulder and elbow angles (rotation about the local x axis).
export const HOLD_SHOULDER = -0.35, HOLD_ELBOW = -1.45;

function rotX(p, py, pz, a) {
  const qy = p[1] - py, qz = p[2] - pz, c = Math.cos(a), s = Math.sin(a);
  return [p[0], py + qy * c - qz * s, pz + qy * s + qz * c];
}
function armPoint(p, shoulder, elbow) {
  return rotX(rotX(p, ARM_EY, 0, elbow), ARM_SY, 0, shoulder);
}

class PersonBuilder extends MeshBuilder {
  // Triangle from shared vertices; winding follows the summed vertex normals.
  tri3(a, b, c) {
    const v = this.v, A = a * 10, B = b * 10, C = c * 10;
    const e1x = v[B] - v[A], e1y = v[B + 1] - v[A + 1], e1z = v[B + 2] - v[A + 2];
    const e2x = v[C] - v[A], e2y = v[C + 1] - v[A + 1], e2z = v[C + 2] - v[A + 2];
    const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
    const nx = v[A + 3] + v[B + 3] + v[C + 3], ny = v[A + 4] + v[B + 4] + v[C + 4], nz = v[A + 5] + v[B + 5] + v[C + 5];
    if (cx * nx + cy * ny + cz * nz >= 0) this.idx.push(a, b, c); else this.idx.push(a, c, b);
  }

  // Vertical loft through elliptical rings [y, rx, rz, cx, cz] with smooth normals.
  loft(rings, n, mat, capTop = false, capBottom = false) {
    const rows = [];
    for (let r = 0; r < rings.length; r++) {
      const [y, rx, rz, cx = 0, cz = 0] = rings[r];
      const lo = rings[Math.max(0, r - 1)], hi = rings[Math.min(rings.length - 1, r + 1)];
      const dy = hi[0] - lo[0];
      const slope = dy !== 0 ? ((hi[1] + hi[2]) - (lo[1] + lo[2])) / 2 / dy : 0;
      const row = [];
      for (let k = 0; k < n; k++) {
        const t = (k / n) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
        const N = norm([c / rx, 0, s / rz]);
        const M = norm([N[0], -slope, N[2]]);
        row.push(this.vert(cx + c * rx, y, cz + s * rz, M[0], M[1], M[2], k / n, y, mat));
      }
      rows.push(row);
    }
    for (let r = 0; r < rows.length - 1; r++) for (let k = 0; k < n; k++) {
      const a = rows[r][k], b = rows[r][(k + 1) % n], c = rows[r + 1][(k + 1) % n], d = rows[r + 1][k];
      this.tri3(a, b, c); this.tri3(a, c, d);
    }
    const cap = (row, ring, ny) => {
      const ci = this.vert(ring[3] || 0, ring[0], ring[4] || 0, 0, ny, 0, 0.5, ring[0], mat);
      for (let k = 0; k < n; k++) {
        const a = row[k], b = row[(k + 1) % n];
        // cap vertices need flat normals: duplicate the ring vertices with the cap normal
        const A = this.vert(this.v[a * 10], this.v[a * 10 + 1], this.v[a * 10 + 2], 0, ny, 0, 0, ring[0], mat);
        const B = this.vert(this.v[b * 10], this.v[b * 10 + 1], this.v[b * 10 + 2], 0, ny, 0, 0, ring[0], mat);
        this.tri3(ci, A, B);
      }
    };
    if (capTop) cap(rows[rows.length - 1], rings[rings.length - 1], 1);
    if (capBottom) cap(rows[0], rings[0], -1);
  }

  // Ellipsoid with smooth normals. keep(nx, ny, nz) decides per face (by its centre direction) whether to emit it.
  ellipsoid(c, rx, ry, rz, nu, nv, mat, keep = null) {
    const id = [];
    for (let j = 0; j <= nv; j++) {
      const ph = -Math.PI / 2 + (j / nv) * Math.PI, cp = Math.cos(ph), sp = Math.sin(ph);
      const row = [];
      for (let i = 0; i < nu; i++) {
        const t = (i / nu) * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
        const N = norm([cp * ct / rx, sp / ry, cp * st / rz]);
        row.push(this.vert(c[0] + rx * cp * ct, c[1] + ry * sp, c[2] + rz * cp * st, N[0], N[1], N[2], i / nu, j / nv, mat));
      }
      id.push(row);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      if (keep) {
        const ph = -Math.PI / 2 + ((j + 0.5) / nv) * Math.PI, t = ((i + 0.5) / nu) * Math.PI * 2;
        if (!keep(Math.cos(ph) * Math.cos(t), Math.sin(ph), Math.cos(ph) * Math.sin(t))) continue;
      }
      const a = id[j][i], b = id[j][(i + 1) % nu], cc = id[j + 1][(i + 1) % nu], d = id[j + 1][i];
      if (j > 0) this.tri3(a, b, cc);
      if (j < nv - 1) this.tri3(a, cc, d);
    }
  }
}

// lod 0: close-up, 1: mid, 2: far
export function personMesh(lod) {
  const mb = new PersonBuilder();
  const n = [8, 6, 4][lod];            // sides of the body lofts
  const nl = [6, 5, 4][lod];            // sides of the limbs
  const hu = [10, 7, 5][lod], hv = [6, 5, 3][lod];
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];

  // legs and shoes
  for (const [side, part] of [[1, 2], [-1, 3]]) {
    const x = side * 0.09;
    mb.loft([[0.07, 0.05, 0.055, x], [0.46, 0.052, 0.056, x], [0.88, 0.078, 0.082, x]], nl, part);
    mb.box([x, 0.045, 0.035], X, Y, Z, 0.046, 0.045, 0.115, part);
  }
  // hips and torso (tapered: waist, chest, shoulders, collar)
  mb.loft([[0.8, 0.155, 0.1], [0.97, 0.158, 0.102]], n, 10);
  mb.loft([[0.95, 0.15, 0.1], [1.12, 0.155, 0.1], [1.3, 0.182, 0.115], [1.385, 0.19, 0.108], [1.44, 0.15, 0.09], [1.48, 0.07, 0.06]], n, 0, true);
  // neck and head
  mb.loft([[1.44, 0.046, 0.046, 0, 0.0], [1.54, 0.043, 0.045, 0, 0.005]], nl, 1);
  mb.ellipsoid([0, 1.625, 0.008], 0.088, 0.108, 0.1, hu, hv, 1);
  if (lod === 0) mb.box([0, 1.615, 0.1], X, Y, Z, 0.012, 0.022, 0.014, 1); // nose
  // short hair: cap over the top and back of the head
  mb.ellipsoid([0, 1.638, -0.004], 0.094, 0.11, 0.104, hu, hv, 15, (x, y, z) => y > 0.3 || (z < 0.2 && y > -0.4));
  // long hair hanging down the back
  mb.loft([[1.38, 0.08, 0.035, 0, -0.07], [1.6, 0.092, 0.05, 0, -0.06]], nl, 25, false, true);
  // hood (open at the face) and beanie
  mb.ellipsoid([0, 1.64, -0.015], 0.116, 0.132, 0.124, hu, hv, 16, (x, y, z) => !(z > 0.42 && y < 0.6 && y > -0.65) && y > -0.8);
  mb.ellipsoid([0, 1.655, 0.004], 0.098, 0.1, 0.108, hu, hv, 17, (x, y) => y > 0.05);
  mb.loft([[1.645, 0.1, 0.11, 0, 0.004], [1.69, 0.101, 0.111, 0, 0.004]], n, 17);
  // steppe hat: fur brim and a conical silk crown with a knot on top
  mb.loft([[1.66, 0.104, 0.114, 0, 0.004], [1.695, 0.122, 0.132, 0, 0.004], [1.735, 0.108, 0.118, 0, 0.004]], n, 18, true);
  mb.loft([[1.73, 0.084, 0.09, 0, 0.004], [1.81, 0.058, 0.062, 0, 0.0], [1.86, 0.018, 0.018, 0, -0.005]], n, 18, true);
  if (lod < 2) mb.ellipsoid([0, 1.875, -0.005], 0.016, 0.02, 0.016, 5, 3, 18);

  // garments worn over the torso
  mb.loft([[0.47, 0.21, 0.145], [0.72, 0.19, 0.13], [0.98, 0.162, 0.108]], n, 19);                     // long coat skirt
  mb.loft([[0.9, 0.36, 0.27], [1.22, 0.29, 0.22], [1.41, 0.2, 0.15], [1.5, 0.075, 0.075]], n, 20);      // poncho
  mb.loft([[0.12, 0.25, 0.18], [0.6, 0.205, 0.14], [0.96, 0.17, 0.112], [1.14, 0.168, 0.108], [1.3, 0.188, 0.122], [1.385, 0.197, 0.115], [1.44, 0.157, 0.096], [1.5, 0.074, 0.066]], n, 21); // deel robe

  // arms: upper arm (shoulder to elbow) and forearm with hand; sleeves a little wider at the cuff
  for (const [side, up, fore] of [[1, 4, 23], [-1, 5, 24]]) {
    const x = side * ARM_SX;
    mb.loft([[ARM_EY - 0.02, 0.043, 0.046, x], [1.3, 0.048, 0.052, x], [ARM_SY - 0.03, 0.052, 0.056, x]], nl, up);
    mb.ellipsoid([x * 0.96, ARM_SY - 0.035, 0], 0.056, 0.05, 0.06, nl, Math.max(3, nl - 3), up); // rounded shoulder
    mb.loft([[0.77, 0.02, 0.03, x, 0.005], [0.84, 0.026, 0.04, x, 0.005], [0.895, 0.03, 0.035, x], [0.905, 0.046, 0.048, x], [ARM_EY + 0.02, 0.043, 0.046, x]], nl, fore, false, true);
  }
  // phone in the right hand
  mb.box([-ARM_SX, 0.8, 0.045], X, Y, Z, 0.032, 0.068, 0.007, 8);

  // umbrella held in the left hand: the pole runs through the posed hand up to a slightly tilted canopy
  const hand = armPoint([ARM_SX, 0.835, 0.005], HOLD_SHOULDER, HOLD_ELBOW);
  const apex = [0.07, 2.24, 0.06];
  const d = norm([apex[0] - hand[0], apex[1] - hand[1], apex[2] - hand[2]]);
  const bottom = [hand[0] - d[0] * 0.1, hand[1] - d[1] * 0.1, hand[2] - d[2] * 0.1];
  mb.beam(bottom, apex, 0.012, 0.012, 7);
  // canopy frame: axis d, two perpendicular unit vectors
  const ua = norm([d[1], -d[0], 0]);
  const ub = [d[1] * ua[2] - d[2] * ua[1], d[2] * ua[0] - d[0] * ua[2], d[0] * ua[1] - d[1] * ua[0]];
  const P = (r, h, t) => [apex[0] + (ua[0] * Math.cos(t) + ub[0] * Math.sin(t)) * r - d[0] * h,
    apex[1] + (ua[1] * Math.cos(t) + ub[1] * Math.sin(t)) * r - d[1] * h,
    apex[2] + (ua[2] * Math.cos(t) + ub[2] * Math.sin(t)) * r - d[2] * h];
  const N = lod === 0 ? 10 : 8, R = 0.58, Rm = 0.32;
  const face = (a, b, c, m) => {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nn = norm([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]);
    if (nn[0] * d[0] + nn[1] * d[1] + nn[2] * d[2] < 0) nn = [-nn[0], -nn[1], -nn[2]];
    const uv = [[0, 0], [1, 0], [0, 1]];
    mb.tri(a, b, c, nn, uv, m);
    mb.tri(a, c, b, [-nn[0], -nn[1], -nn[2]], uv, m);
  };
  for (let k = 0; k < N; k++) {
    const t0 = (k / N) * Math.PI * 2, t1 = ((k + 1) / N) * Math.PI * 2;
    const o0 = P(R, 0.25, t0), o1 = P(R, 0.25, t1);
    if (lod === 2) face(apex, o0, o1, 6);
    else {
      const m0 = P(Rm, 0.07, t0), m1 = P(Rm, 0.07, t1);
      face(apex, m0, m1, 6); face(m0, o0, o1, 6); face(m0, o1, m1, 6);
    }
    const l0 = [o0[0], o0[1] - 0.035, o0[2]], l1 = [o1[0], o1[1] - 0.035, o1[2]];
    const tm = (t0 + t1) / 2, rn = norm([ua[0] * Math.cos(tm) + ub[0] * Math.sin(tm), 0, ua[2] * Math.cos(tm) + ub[2] * Math.sin(tm)]);
    mb.quad(o0, o1, l1, l0, rn, [[0, 0], [1, 0], [1, 1], [0, 1]], 9);
  }
  return mb;
}
