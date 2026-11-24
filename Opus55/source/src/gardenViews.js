// Foreground set pieces for the viewpoints, built into the garden module's static mesh:
//  - pose 1: Nanshan lookout tower (multi-storey pavilion, top deck just below the camera, lacquered railing
//            with fretwork panels, lanterns)
//  - pose 5: lakeside garden vignette facing the Su Causeway and the pagoda hill (terrace, stepping stones to a
//            zigzag bridge and a water pavilion, covered corridor with a tiled roof, moon-gate wall, Taihu
//            rockery, willows and lanterns along a stone-edged shore, lotus, lantern boats)
//  - pose 9: cliff-top lookout on the crag above the south valley (carved stone balustrade, a pavilion eave
//            corner with a lantern), plus village and road lights in the valley and on the far slopes
//  - pose 10: promenade lamps, lit stairways and pavilions on the river banks
// Each piece is placed from the POSES entry it frames (world.js), so the camera and the set stay in sync.

import { PAT, V3 } from './gardenMesh.js';
import { POSES, DISTRICTS, DT } from './world.js';

const C = {
  plaster: [0.58, 0.56, 0.52], tile: [0.03, 0.032, 0.036], wood: [0.17, 0.035, 0.022], dwood: [0.06, 0.035, 0.025],
  stone: [0.15, 0.145, 0.135], dstone: [0.08, 0.078, 0.074], taihu: [0.2, 0.2, 0.19], gravel: [0.1, 0.095, 0.088],
  marble: [0.3, 0.295, 0.28], fret: [0.09, 0.018, 0.012], gold: [0.32, 0.2, 0.07], iron: [0.03, 0.03, 0.032],
};

// Local frame: u to the right of the view, v forward, y up.
function frame(pose) {
  const [x, , z] = pose.pos, [tx, , tz] = pose.target;
  const l = Math.hypot(tx - x, tz - z);
  const fx = (tx - x) / l, fz = (tz - z) / l;
  const rx = -fz, rz = fx;
  return { x, z, fx, fz, rx, rz, yaw: Math.atan2(fz, fx), P: (u, v, y) => [x + rx * u + fx * v, y, z + rz * u + fz * v] };
}

// Walk the polyline pts ([u, v] in the frame of Pf) and call fn(a, b, L, ang, at) per segment.
function eachSeg(Pf, pts, y, fn) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = Pf(pts[i][0], pts[i][1], y), b = Pf(pts[i + 1][0], pts[i + 1][1], y);
    const L = Math.hypot(b[0] - a[0], b[2] - a[2]), ang = Math.atan2(b[2] - a[2], b[0] - a[0]);
    const dx = (b[0] - a[0]) / L, dz = (b[2] - a[2]) / L;
    fn(a, b, L, ang, (s, yy) => [a[0] + dx * s, yy, a[2] + dz * s]);
  }
}

// Red-lacquered timber railing: capped posts with gilt finials, a two-step (bevelled) cap rail, a middle and
// a bottom rail, and dark fretwork panels in a hui (nested rectangle) pattern between them.
function lacquerRailing(M, Pf, pts, y) {
  eachSeg(Pf, pts, y, (a, b, L, ang, at) => {
    const n = Math.max(1, Math.round(L / 1.6));
    for (let k = 0; k <= n; k++) {
      const s = L * k / n;
      M.set(C.wood, PAT.WOOD); M.box(at(s, y), 0.085, 0.085, 1.12, ang);
      M.set(C.fret, PAT.WOOD); M.box(at(s, y + 1.12), 0.115, 0.115, 0.05, ang);
      M.set(C.gold, PAT.WOOD); M.prism(at(s, y + 1.17), 0.075, 8, 0, 0.13, 0, true, 0.03);
    }
    const m = at(L / 2, 0);
    M.set(C.wood, PAT.WOOD);
    M.box([m[0], y + 0.97, m[2]], L / 2, 0.08, 0.08, ang);
    M.box([m[0], y + 1.05, m[2]], L / 2, 0.052, 0.035, ang);
    M.box([m[0], y + 0.52, m[2]], L / 2, 0.045, 0.06, ang);
    M.box([m[0], y + 0.06, m[2]], L / 2, 0.055, 0.08, ang);
    M.set(C.fret, PAT.WOOD);
    for (let k = 0; k < n; k++) {
      const s0 = L * k / n + 0.11, s1 = L * (k + 1) / n - 0.11, sm = (s0 + s1) / 2;
      const bar = (sa, sb, yy, hh) => M.box(at((sa + sb) / 2, yy), Math.max((sb - sa) / 2, 0.016), 0.022, hh, ang);
      bar(s0, s1, y + 0.16, 0.03); bar(s0, s1, y + 0.47, 0.03);
      bar(s0, s0 + 0.035, y + 0.16, 0.34); bar(s1 - 0.035, s1, y + 0.16, 0.34);
      const i0 = s0 + 0.17, i1 = s1 - 0.17;
      bar(i0, i1, y + 0.25, 0.026); bar(i0, i1, y + 0.39, 0.026);
      bar(i0, i0 + 0.03, y + 0.25, 0.166); bar(i1 - 0.03, i1, y + 0.25, 0.166);
      bar(sm - 0.016, sm + 0.016, y + 0.19, 0.06); bar(sm - 0.016, sm + 0.016, y + 0.416, 0.054);
      bar(s0, i0, y + 0.31, 0.026); bar(i1, s1, y + 0.31, 0.026);
    }
  });
}

// Carved pale stone balustrade: plinth, posts with lotus-bud finials, a framed lower panel, vase-shaped
// balusters carrying a rounded hand rail.
function stoneBalustrade(M, Pf, pts, y, skip = () => false, bay = 2.0) {
  eachSeg(Pf, pts, y, (a, b, L, ang, at) => {
    const n = Math.max(1, Math.round(L / bay));
    M.set(C.marble, PAT.STONE);
    const m = at(L / 2, 0);
    M.box([m[0], y, m[2]], L / 2 + 0.16, 0.2, 0.16, ang);
    for (let k = 0; k <= n; k++) {
      const s = L * k / n, p = at(s, y);
      M.set(C.marble, PAT.PLAIN);
      M.box([p[0], y + 0.16, p[2]], 0.12, 0.12, 0.98, ang);
      if (skip(p)) continue;
      M.lathe([p[0], y + 1.14, p[2]], [[0.15, 0], [0.15, 0.06], [0.11, 0.12], [0.12, 0.17], [0.15, 0.24], [0.15, 0.3], [0.13, 0.38], [0.08, 0.45], [0.0, 0.52]], 12, false);
    }
    for (let k = 0; k < n; k++) {
      const s0 = L * k / n + 0.12, s1 = L * (k + 1) / n - 0.12, sm = (s0 + s1) / 2, hl = (s1 - s0) / 2;
      // lower panel with a raised border (reads as a carved recess)
      M.set(C.marble, PAT.STONE);
      M.box(at(sm, y + 0.16), hl, 0.045, 0.36, ang);
      M.set(C.marble, PAT.PLAIN);
      M.box(at(sm, y + 0.16), hl, 0.07, 0.05, ang);
      M.box(at(sm, y + 0.47), hl, 0.07, 0.05, ang);
      M.box(at(s0 + 0.04, y + 0.16), 0.04, 0.07, 0.36, ang);
      M.box(at(s1 - 0.04, y + 0.16), 0.04, 0.07, 0.36, ang);
      M.box(at(sm, y + 0.52), hl, 0.08, 0.06, ang);
      // vase balusters
      const nb = Math.max(2, Math.round(hl / 0.55));
      for (let j = 0; j < nb; j++) {
        const f = (j + 0.5) / nb * 2 - 1;
        const p = at(sm + f * hl, 0);
        M.lathe([p[0], y + 0.58, p[2]], [[0.05, 0], [0.065, 0.03], [0.085, 0.08], [0.09, 0.12], [0.075, 0.17], [0.045, 0.21], [0.04, 0.23], [0.075, 0.28]], 10, false);
      }
    }
    M.set(C.marble, PAT.PLAIN);
    M.box([m[0], y + 0.86, m[2]], L / 2, 0.075, 0.06, ang);
    M.box([m[0], y + 0.92, m[2]], L / 2, 0.05, 0.035, ang);
  });
}

// Long hall / corridor roof between a and b (xz, at height y): grey tiles on a concave section, eaves and
// ridge curving up at the ends, a soffit, ridge ornaments at both ends.
function hallRoof(M, a, b, y, ov, rise) {
  const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const dx = (b[0] - a[0]) / L, dz = (b[2] - a[2]) / L, nx = -dz, nz = dx;
  const ext = 0.7, NL = 10, NS = 4;
  const pt = (t, s) => {
    const al = -ext + t * (L + 2 * ext);
    const endC = Math.pow(Math.abs(2 * t - 1), 6);
    const as = Math.abs(s), w = s * ov * (1 + 0.1 * endC);
    return [a[0] + dx * al + nx * w, y + rise * Math.pow(1 - as, 1.6) + 0.6 * endC * as * as * as + 0.12 * endC * (1 - as), a[2] + dz * al + nz * w, al, (1 - Math.pow(1 - as, 1.0)) * ov * 1.25];
  };
  M.set(C.tile, PAT.TILE);
  for (const side of [-1, 1]) for (let i = 0; i < NL; i++) for (let j = 0; j < NS; j++) {
    const p0 = pt(i / NL, side * j / NS), p1 = pt((i + 1) / NL, side * j / NS), p2 = pt((i + 1) / NL, side * (j + 1) / NS), p3 = pt(i / NL, side * (j + 1) / NS);
    let n = V3.norm(V3.cross(V3.sub(p1.slice(0, 3), p0.slice(0, 3)), V3.sub(p3.slice(0, 3), p0.slice(0, 3))));
    if (n[1] < 0) n = V3.mul(n, -1);
    M.quad(p0.slice(0, 3), p1.slice(0, 3), p2.slice(0, 3), p3.slice(0, 3), n, [[p0[3], p0[4]], [p1[3], p1[4]], [p2[3], p2[4]], [p3[3], p3[4]]]);
  }
  // soffit and eave fascia
  M.set(C.dwood, PAT.WOOD);
  for (let i = 0; i < NL; i++) {
    const a0 = pt(i / NL, -1), a1 = pt((i + 1) / NL, -1), b0 = pt(i / NL, 1), b1 = pt((i + 1) / NL, 1);
    M.quad([a0[0], a0[1] - 0.12, a0[2]], [a1[0], a1[1] - 0.12, a1[2]], [b1[0], b1[1] - 0.12, b1[2]], [b0[0], b0[1] - 0.12, b0[2]], [0, -1, 0]);
    for (const [p, q, sd] of [[a0, a1, -1], [b0, b1, 1]]) M.quad([p[0], p[1] - 0.12, p[2]], [q[0], q[1] - 0.12, q[2]], q.slice(0, 3), p.slice(0, 3), [nx * sd, 0, nz * sd]);
  }
  // ridge and end ornaments
  M.set(C.tile, PAT.PLAIN);
  const r0 = pt(0, 0), r1 = pt(1, 0), rm = [(r0[0] + r1[0]) / 2, y + rise - 0.05, (r0[2] + r1[2]) / 2];
  M.box(rm, L / 2 + ext - 0.25, 0.12, 0.22, Math.atan2(dz, dx));
  for (const [r, sd] of [[r0, -1], [r1, 1]]) {
    M.prism([r[0] - dx * sd * 0.25, r[1] - 0.05, r[2] - dz * sd * 0.25], 0.16, 6, 0, 0.42, 0, false, 0.12);
    M.prism([r[0] + dx * sd * 0.05, r[1] + 0.32, r[2] + dz * sd * 0.05], 0.12, 6, 0, 0.3, 0, true, 0.04);
  }
}

// Small sampan with an arched mat canopy and a lantern hung at the bow.
function boat(M, lantern, x, z, yaw, light) {
  const ca = Math.cos(yaw), sa = Math.sin(yaw), nx = -sa, nz = ca;
  M.set(C.dwood, PAT.WOOD);
  M.box([x, -0.25, z], 2.3, 0.72, 0.55, yaw);
  M.box([x + ca * 2.45, -0.1, z + sa * 2.45], 0.35, 0.5, 0.5, yaw);
  M.box([x - ca * 2.45, -0.1, z - sa * 2.45], 0.35, 0.5, 0.45, yaw);
  M.set([0.05, 0.04, 0.03], PAT.WOOD);
  const K = 5;
  for (let k = 0; k < K; k++) {
    const t0 = Math.PI * k / K, t1 = Math.PI * (k + 1) / K;
    const q = (t, al) => [x + ca * al + nx * Math.cos(t) * 0.78, 0.3 + Math.sin(t) * 0.85, z + sa * al + nz * Math.cos(t) * 0.78];
    const tm = (t0 + t1) / 2;
    M.quad(q(t0, -1.1), q(t0, 1.1), q(t1, 1.1), q(t1, -1.1), [nx * Math.cos(tm), Math.sin(tm), nz * Math.cos(tm)]);
  }
  const bx = x + ca * 2.6, bz = z + sa * 2.6;
  M.set(C.dwood, PAT.WOOD); M.box([bx, 0.3, bz], 0.03, 0.03, 1.7);
  lantern([bx + ca * 0.3, 1.55, bz + sa * 0.3], 0.62, light);
}

// ---------------------------------------------------------------- pose 1: Nanshan lookout tower
export function lookoutTower(env) {
  const { M, H, col, lantern, lights, reserve } = env;
  const F = frame(POSES[0]);
  const deckY = POSES[0].pos[1] - 2.0;
  const cx = F.x - F.fx * 2.2, cz = F.z - F.fz * 2.2;        // camera stands 2.2 m in front of the centre
  const Pc = (u, v, y) => [cx + F.rx * u + F.fx * v, y, cz + F.rz * u + F.fz * v];
  let g = 1e9; for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; g = Math.min(g, H(cx + Math.cos(a) * 10, cz + Math.sin(a) * 10)); }
  const rot = F.yaw + Math.PI / 4;   // square plan aligned with the view
  const D = 5.6;
  // stone podium
  M.set(C.stone, PAT.STONE);
  M.box([cx, g - 3, cz], 9, 9, 6.5, F.yaw);
  col(cx, g + 1.0, cz, 9, 2.5, 9, F.yaw);
  // storeys
  const base = g + 3.5, storeys = 4, sh = (deckY - 0.4 - base) / storeys;
  for (let s = 0; s < storeys; s++) {
    const y0 = base + s * sh, half = 5.0 - s * 0.25;
    M.set(C.plaster, PAT.PLASTER);
    M.prism([cx, y0, cz], half * Math.SQRT2, 4, 0, sh, rot, false);
    // corner columns
    M.set(C.wood, PAT.WOOD);
    for (let k = 0; k < 4; k++) { const a = rot + k * Math.PI / 2; M.prism([cx + Math.cos(a) * half * Math.SQRT2, y0, cz + Math.sin(a) * half * Math.SQRT2], 0.32, 6, 0, sh, 0, false); }
    // glowing lattice windows on all four faces
    M.set([1, 1, 1], PAT.LATTICE, 2.6);
    for (let k = 0; k < 4; k++) {
      const a = F.yaw + k * Math.PI / 2, ox = Math.cos(a), oz = Math.sin(a), tx = -oz, tz = ox;
      for (const w of [-2.2, 0, 2.2]) {
        const b = [cx + ox * (half + 0.03) + tx * w, y0 + sh * 0.35, cz + oz * (half + 0.03) + tz * w];
        M.quad([b[0] - tx * 0.7, b[1], b[2] - tz * 0.7], [b[0] + tx * 0.7, b[1], b[2] + tz * 0.7], [b[0] + tx * 0.7, b[1] + 1.9, b[2] + tz * 0.7], [b[0] - tx * 0.7, b[1] + 1.9, b[2] - tz * 0.7], [ox, 0, oz]);
      }
    }
    // storey eave with upturned corners; the top one stays tucked under the deck (its corners used to poke
    // up through the floor at the bottom corners of the view)
    M.set(C.tile, PAT.TILE);
    const top = s === storeys - 1;
    const ring = top
      ? M.roof([cx, y0 + sh - 0.75, cz], 4, (D - 0.2) * Math.SQRT2, 0, (half - 0.2) * Math.SQRT2, 0.5, rot, 0.25, 0.06, 6, 3)
      : M.roof([cx, y0 + sh - 0.3, cz], 4, (half + 2.2) * Math.SQRT2, 0, (half - 0.2) * Math.SQRT2, 1.3, rot, 1.1, 0.1, 6, 4);
    if (!top) for (let k = 0; k < 4; k++) { const e = ring[k * 6]; lantern([e[0], e[1] - 0.8, e[2]], 0.9, s === storeys - 2 && k % 2 === 0); }
  }
  col(cx, (base + deckY) / 2 - 0.2, cz, 5, (deckY - base) / 2, 5, F.yaw);
  // top deck: stone floor with a timber edge, lacquered railing, corner columns, roof
  M.set(C.stone, PAT.STONE);
  M.box([cx, deckY - 0.45, cz], D + 0.25, D + 0.25, 0.45, F.yaw);
  M.set(C.fret, PAT.WOOD);
  M.box([cx, deckY - 0.75, cz], D + 0.32, D + 0.32, 0.3, F.yaw, false);
  col(cx, deckY - 0.3, cz, D, 0.3, D, F.yaw);
  const corners = [[-D, -D], [D, -D], [D, D], [-D, D], [-D, -D]];
  lacquerRailing(M, Pc, corners, deckY);
  for (let k = 0; k < 4; k++) {
    const [u0, v0] = corners[k], [u1, v1] = corners[k + 1];
    const m = Pc((u0 + u1) / 2, (v0 + v1) / 2, 0);
    const len = Math.hypot(u1 - u0, v1 - v0) / 2;
    const ang = F.yaw + (k % 2 === 0 ? Math.PI / 2 : 0);
    col(m[0], deckY + 0.55, m[2], k % 2 === 0 ? 0.15 : len, 0.55, k % 2 === 0 ? len : 0.15, ang);
  }
  M.set(C.wood, PAT.WOOD);
  for (const [u, v] of corners.slice(0, 4)) M.prism(Pc(u * 0.98, v * 0.98, deckY), 0.2, 6, 0, 4.7, 0, false);
  M.set(C.dwood, PAT.WOOD);
  M.prism([cx, deckY, cz], D * Math.SQRT2 * 1.01, 4, 4.4, 4.75, rot, false);
  M.set(C.tile, PAT.TILE);
  const top = M.roof([cx, deckY + 4.75, cz], 4, (D + 1.6) * Math.SQRT2, 0, 0, 3.6, rot, 1.8, 0.14, 8, 6);
  M.set(C.tile, PAT.PLAIN);
  M.prism([cx, deckY + 8.2, cz], 0.22, 6, 0, 1.4, 0, true, 0.04);
  // lanterns: hanging under the eave corners and standing on the front-right railing post
  for (let k = 0; k < 4; k++) { const e = top[k * 8]; lantern([e[0], e[1] - 0.9, e[2]], 1.1, true); }
  const pr = Pc(D - 0.05, D - 0.05, deckY + 1.3);
  lantern([pr[0], pr[1] + 0.45, pr[2]], 0.75, true, [1.0, 0.55, 0.2]);
  lights.push([cx, deckY + 2.8, cz, 12, 8, 4.5, 1.6]);
  reserve.push({ x: cx, z: cz, hw: 16, hd: 16, angle: F.yaw });
}

// ---------------------------------------------------------------- pose 5: lakeside garden vignette
export function lakesideVignette(env) {
  const { M, H, col, lantern, lights, reserve, trees, rock, R, pads } = env;
  const F = frame(POSES[4]);
  const g0 = H(F.x, F.z);
  const ty = g0 + 0.75;           // terrace top
  const P = F.P;
  const h = (u, v) => H(P(u, v, 0)[0], P(u, v, 0)[2]);
  // the shore straight ahead
  let vs = 30; for (let v = 6; v < 90; v += 0.5) if (h(0, v) < 0.3) { vs = v; break; }
  // stone terrace with a low balustrade at the front
  M.set(C.dstone, PAT.STONE);
  const TF = 3.2;   // front edge of the terrace
  let gmin = g0; for (const [u, v] of [[-6, -5], [6, -5], [6, TF], [-6, TF]]) gmin = Math.min(gmin, h(u, v));
  M.box(P(0, (TF - 5) / 2, gmin - 1.5), (TF + 5) / 2, 6, ty - gmin + 1.5, F.yaw);
  M.set(C.gravel, PAT.GRAVEL);
  M.quad(P(-6, -5, ty + 0.01), P(6, -5, ty + 0.01), P(6, TF, ty + 0.01), P(-6, TF, ty + 0.01), [0, 1, 0]);
  col(...P(0, (TF - 5) / 2, (gmin - 1.5 + ty) / 2), (TF + 5) / 2, (ty - gmin + 1.5) / 2, 6, F.yaw);
  stoneBalustrade(M, P, [[-6, TF], [-1.1, TF]], ty);
  stoneBalustrade(M, P, [[1.1, TF], [6, TF]], ty);
  col(...P(-3.55, TF, ty + 0.5), 0.2, 0.5, 2.45, F.yaw); col(...P(3.55, TF, ty + 0.5), 0.2, 0.5, 2.45, F.yaw);
  lantern(P(-6, TF, ty + 1.95), 0.9, true); lantern(P(6, TF, ty + 1.95), 0.9, true);
  // steps down from the terrace to a courtyard of pebble mosaic paving that runs to the shore
  M.set(C.stone, PAT.STONE);
  for (let k = 0; k < 4; k++) M.box(P(0, TF + 0.4 + k * 0.5, ty - 0.25 * (k + 1)), 0.25, 0.9, 0.25, F.yaw);
  const PV0 = TF + 2.4, PV1 = vs - 1.2, PU0 = -6.5, PU1 = 9;
  M.set([1, 1, 1], PAT.PEBBLE);
  for (let v = PV0; v < PV1 - 0.01; v += 1.5) for (let u = PU0; u < PU1 - 0.01; u += 1.5) {
    const v1 = Math.min(v + 1.5, PV1), u1 = Math.min(u + 1.5, PU1);
    const y = (uu, vv) => Math.max(h(uu, vv), 0.25) + 0.05;
    M.quad(P(u, v, y(u, v)), P(u1, v, y(u1, v)), P(u1, v1, y(u1, v1)), P(u, v1, y(u, v1)), [0, 1, 0], [[u, v], [u1, v], [u1, v1], [u, v1]]);
  }
  // a dressed-stone path down the middle with lanterns on low posts both sides
  M.set(C.stone, PAT.STONE);
  for (let v = PV0 - 0.6; v < PV1 + 0.4; v += 1.2) M.box(P(0, v, Math.max(h(0, v), 0.25) - 0.06), 0.58, 0.85, 0.16, F.yaw);
  for (let v = PV0 + 1; v < PV1; v += 3.2) for (const sd of [-1.4, 1.4]) {
    const q = P(sd, v, 0), y = Math.max(h(sd, v), 0.25);
    M.set(C.dwood, PAT.WOOD); M.box([q[0], y, q[2]], 0.05, 0.05, 1.1);
    lantern([q[0], y + 1.32, q[2]], 0.55, false, [1.0, 0.55, 0.22]);
  }
  lights.push([...P(0, (PV0 + PV1) / 2, ty + 1.2), 12, 4.5, 2.4, 0.9]);
  // planted beds with stone kerbs: osmanthus, bamboo, plantain
  const bed = (u0, v0, u1, v1) => {
    M.set(C.stone, PAT.STONE);
    const yb = Math.max(h((u0 + u1) / 2, (v0 + v1) / 2), 0.25);
    for (const [a, b] of [[[u0, v0], [u1, v0]], [[u1, v0], [u1, v1]], [[u1, v1], [u0, v1]], [[u0, v1], [u0, v0]]]) {
      const pa = P(a[0], a[1], 0), pb = P(b[0], b[1], 0);
      const L = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]);
      M.box([(pa[0] + pb[0]) / 2, yb - 0.1, (pa[2] + pb[2]) / 2], L / 2 + 0.12, 0.12, 0.5, Math.atan2(pb[2] - pa[2], pb[0] - pa[0]));
    }
    M.set([0.022, 0.04, 0.016], PAT.LEAF);   // moss and ground cover
    M.quad(P(u0, v0, yb + 0.32), P(u1, v0, yb + 0.32), P(u1, v1, yb + 0.32), P(u0, v1, yb + 0.32), [0, 1, 0], [[u0 * 3, v0 * 3], [u1 * 3, v0 * 3], [u1 * 3, v1 * 3], [u0 * 3, v1 * 3]]);
    return yb + 0.32;
  };
  const plantain = (u, v, y, s) => {
    const c = P(u, v, 0);
    M.set([0.12, 0.13, 0.06], PAT.PLAIN); M.prism([c[0], y, c[2]], 0.12 * s, 6, 0, 1.6 * s, 0, false, 0.08 * s);
    M.set([0.03, 0.07, 0.022], PAT.LEAF);
    for (let k = 0; k < 6; k++) {
      const a = k * 1.05 + R() * 0.4, ca = Math.cos(a), sa = Math.sin(a), L = (1.5 + R() * 0.6) * s, W = 0.32 * s;
      const b0 = [c[0], y + 1.5 * s, c[2]], tip = [c[0] + ca * L, y + (1.9 + R() * 0.4) * s, c[2] + sa * L];
      const mid = [c[0] + ca * L * 0.5, y + (2.05 + R() * 0.2) * s, c[2] + sa * L * 0.5];
      const ox = -sa * W, oz = ca * W;
      M.quad(b0, [mid[0] + ox, mid[1], mid[2] + oz], tip, [mid[0] - ox, mid[1], mid[2] - oz], [0, 1, 0], [[0, 0], [0.5, 1], [1, 0], [0.5, -1]]);
    }
  };
  let yb = bed(-6.2, PV0 + 2.0, -2.4, PV0 + 6.5);
  plantain(-4.8, PV0 + 3.4, yb, 0.75); plantain(-3.4, PV0 + 5.3, yb, 0.6);
  { const q = P(-4.2, PV0 + 5.8, 0); trees.push([q[0], yb, q[2], 0.32, 0]); }
  yb = bed(2.4, PV0 + 9, 6.2, PV0 + 14);
  { const q = P(4.0, PV0 + 11.5, 0); trees.push([q[0], yb, q[2], 0.55, 2]); }
  plantain(2.9, PV0 + 13.4, yb, 0.7);
  yb = bed(-6.0, PV0 + 11, -2.6, PV0 + 15.5);
  { let q = P(-4.6, PV0 + 12.8, 0); trees.push([q[0], yb, q[2], 0.3, 0]); q = P(-3.4, PV0 + 14.6, 0); trees.push([q[0], yb, q[2], 0.26, 0]); }
  // zigzag stone bridge from the shore to a hexagonal water pavilion: solid piers, square landings at the
  // turns, low stone railings and lanterns on the corner posts
  const zz = [[0, vs - 1.2], [-6, vs + 7], [5, vs + 17], [-4, vs + 28], [2, vs + 37]];
  const by = 0.6;
  const bridgeStone = [0.11, 0.105, 0.098];
  for (let i = 0; i < zz.length; i++) {
    const q = P(zz[i][0], zz[i][1], 0);
    M.set(bridgeStone, PAT.STONE);
    M.box([q[0], -2.5, q[2]], 1.15, 1.15, by + 2.5, F.yaw);
    col(q[0], by - 0.6, q[2], 1.15, 0.6, 1.15, F.yaw);
    M.set(C.stone, PAT.PLAIN);
    for (const [cu, cv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const c = P(zz[i][0] + cu, zz[i][1] + cv, 0); M.box([c[0], by, c[2]], 0.1, 0.1, 0.75, F.yaw); }
    if (i > 0) for (const [cu, cv] of [[-1, 1], [1, 1]]) { const c = P(zz[i][0] + cu, zz[i][1] + cv, 0); lantern([c[0], by + 1.05, c[2]], 0.5, false, [1.0, 0.5, 0.2]); }
  }
  for (let i = 0; i < zz.length - 1; i++) {
    const a = P(zz[i][0], zz[i][1], 0), b = P(zz[i + 1][0], zz[i + 1][1], 0);
    const L = Math.hypot(b[0] - a[0], b[2] - a[2]), ang = Math.atan2(b[2] - a[2], b[0] - a[0]);
    const m = [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2];
    M.set(bridgeStone, PAT.STONE);
    M.box([m[0], by - 0.45, m[2]], L / 2 - 1.1, 0.8, 0.45, ang);
    for (let k = 1; k <= 2; k++) { const t = k / 3; M.box([a[0] + (b[0] - a[0]) * t, -2.5, a[2] + (b[2] - a[2]) * t], 0.35, 0.65, by + 2.0, ang); }
    col(m[0], by - 0.6, m[2], L / 2, 0.6, 0.8, ang);
    const nx = -Math.sin(ang), nz = Math.cos(ang);
    M.set(C.stone, PAT.PLAIN);
    const n = Math.max(2, Math.round((L - 2.2) / 1.6));
    for (const sd of [-1, 1]) {
      M.box([m[0] + nx * 0.75 * sd, by + 0.48, m[2] + nz * 0.75 * sd], L / 2 - 1.1, 0.06, 0.08, ang);
      for (let k = 1; k < n; k++) {
        const t = (1.1 + (L - 2.2) * k / n) / L;
        M.box([a[0] + (b[0] - a[0]) * t + nx * 0.75 * sd, by, a[2] + (b[2] - a[2]) * t + nz * 0.75 * sd], 0.06, 0.06, 0.5, ang);
      }
    }
    if (i % 2 === 1) lights.push([b[0], by + 1.2, b[2], 9, 4, 2.0, 0.7]);
  }
  const pc = P(2, vs + 42, 0);
  M.set(C.stone, PAT.STONE);
  M.prism([pc[0], -2.5, pc[2]], 5.2, 6, 0, 2.95, 0);
  col(pc[0], by - 0.6, pc[2], 3.6, 0.6, 3.6, 0);
  env.pavilion([pc[0], by - 0.1, pc[2]], 6, 3.2, 0.1);
  // lanterns on posts along the shore
  for (let u = -44; u <= 46; u += 5.5) {
    if (Math.abs(u) < 3 || (u < -5 && u > -34)) continue;
    let v = -1; for (let t = 4; t < 140; t += 0.5) if (h(u, t) < 0.35) { v = t; break; }
    if (v < 0) continue;
    const q = P(u, v - 1.6, 0), y = H(q[0], q[2]);
    if (y < 0.3) continue;
    M.set(C.dwood, PAT.WOOD); M.box([q[0], y, q[2]], 0.05, 0.05, 1.3);
    lantern([q[0], y + 1.5, q[2]], 0.55, false, [1.0, 0.5, 0.2]);
  }
  // covered corridor (lang) along the shore on the left, on posts over the water
  const cor = [[-7, 3], [-12, 14], [-20, 25], [-30, 33]];
  const cy = 0.9;
  for (let i = 0; i < cor.length - 1; i++) {
    const a = P(cor[i][0], cor[i][1], 0), b = P(cor[i + 1][0], cor[i + 1][1], 0);
    const L = Math.hypot(b[0] - a[0], b[2] - a[2]), ang = Math.atan2(b[2] - a[2], b[0] - a[0]);
    const nx = -Math.sin(ang), nz = Math.cos(ang), m = [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2];
    const floor = Math.max(cy, H(m[0], m[2]) + 0.2);
    M.set(C.stone, PAT.STONE);
    M.box([m[0], -2.5, m[2]], L / 2 + 0.2, 1.45, floor + 2.5, ang);
    col(m[0], floor - 0.5, m[2], L / 2 + 0.2, 0.5, 1.45, ang);
    const n = Math.max(2, Math.round(L / 2.6));
    const at = (t, o, y) => [a[0] + (b[0] - a[0]) * t + nx * o, y, a[2] + (b[2] - a[2]) * t + nz * o];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      M.set(C.wood, PAT.WOOD);
      for (const sd of [-1, 1]) M.prism(at(t, 1.25 * sd, floor), 0.12, 6, 0, 2.7, 0, false);
      if (k < n) {
        // a lantern in every bay, lit in every other one
        const tm = (k + 0.5) / n;
        lantern(at(tm, 0, floor + 2.05), 0.7, k % 2 === 0);
        // hanging timber lattice frieze under the beams and a bench rail between the posts, both sides
        for (const sd of [-1, 1]) {
          const p0 = at(t, 1.27 * sd, 0), p1 = at((k + 1) / n, 1.27 * sd, 0);
          M.set([1, 1, 1], PAT.LATTICE, 0.55);
          M.quad([p0[0], floor + 2.25, p0[2]], [p1[0], floor + 2.25, p1[2]], [p1[0], floor + 2.62, p1[2]], [p0[0], floor + 2.62, p0[2]], [nx * sd, 0, nz * sd], [[0, 0], [L / n / 1.2, 0], [L / n / 1.2, 0.35], [0, 0.35]]);
          M.set(C.wood, PAT.WOOD);
          M.box(at(tm, 1.25 * sd, floor + 0.42), L / n / 2 - 0.12, 0.16, 0.06, ang);
          M.box(at(tm, 1.25 * sd, floor), L / n / 2 - 0.12, 0.04, 0.42, ang);
        }
      }
    }
    M.set(C.wood, PAT.WOOD);
    for (const sd of [-1, 1]) M.box(at(0.5, 1.25 * sd, floor + 2.62), L / 2 + 0.15, 0.1, 0.18, ang);
    hallRoof(M, a, b, floor + 2.8, 1.95, 1.0);
  }
  // moon-gate wall on the right, white plaster with dark tile coping and lattice windows
  const wa = P(9.0, -3, 0), wb = P(12.5, 24, 0);
  const WL = Math.hypot(wb[0] - wa[0], wb[2] - wa[2]), wang = Math.atan2(wb[2] - wa[2], wb[0] - wa[0]);
  const dx = (wb[0] - wa[0]) / WL, dz = (wb[2] - wa[2]) / WL, nx = -dz, nz = dx;
  const wy = Math.min(H(wa[0], wa[2]), H(wb[0], wb[2]), g0) - 0.3, WH = 3.6 + (ty - wy) * 0.3;
  const A = (s, o, y) => [wa[0] + dx * s + nx * o, y, wa[2] + dz * s + nz * o];
  const gateS = WL * 0.6, gr = 1.45, gcy = wy + gr + 0.4;
  for (const o of [0.22, -0.22]) {
    const n = o > 0 ? [nx, 0, nz] : [-nx, 0, -nz];
    M.set(C.plaster, PAT.PLASTER);
    M.quad(A(0, o, wy), A(gateS - 1.7, o, wy), A(gateS - 1.7, o, wy + WH), A(0, o, wy + WH), n, [[0, 0], [gateS - 1.7, 0], [gateS - 1.7, WH], [0, WH]]);
    M.quad(A(gateS + 1.7, o, wy), A(WL, o, wy), A(WL, o, wy + WH), A(gateS + 1.7, o, wy + WH), n, [[gateS + 1.7, 0], [WL, 0], [WL, WH], [gateS + 1.7, WH]]);
    const N = 28;
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
      const ray = (a) => { const cx = Math.cos(a), cy = Math.sin(a); const tx = cx > 0 ? 1.7 / cx : cx < 0 ? -1.7 / cx : 1e9; const tyy = cy > 0 ? (wy + WH - gcy) / cy : cy < 0 ? (wy - gcy) / cy : 1e9; const t = Math.min(tx, tyy); return [gateS + cx * t, gcy + cy * t]; };
      const r0 = ray(a0), r1 = ray(a1);
      const c0 = [gateS + Math.cos(a0) * gr, gcy + Math.sin(a0) * gr], c1 = [gateS + Math.cos(a1) * gr, gcy + Math.sin(a1) * gr];
      M.quad(A(c0[0], o, c0[1]), A(c1[0], o, c1[1]), A(r1[0], o, r1[1]), A(r0[0], o, r0[1]), n, [[c0[0], c0[1] - wy], [c1[0], c1[1] - wy], [r1[0], r1[1] - wy], [r0[0], r0[1] - wy]]);
    }
    M.set([1, 1, 1], PAT.LATTICE, 2.0);
    for (const s of [2.2, 5.4, 8.6, 11.8, gateS + 3.6, gateS + 6.8, gateS + 10].filter((t) => t < WL - 1 && Math.abs(t - gateS) > 2.6)) M.quad(A(s - 0.6, o * 1.05, wy + 1.4), A(s + 0.6, o * 1.05, wy + 1.4), A(s + 0.6, o * 1.05, wy + 2.4), A(s - 0.6, o * 1.05, wy + 2.4), n, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
  M.set(C.stone, PAT.PLAIN);
  for (let k = 0; k < 28; k++) {
    const a0 = (k / 28) * Math.PI * 2, a1 = ((k + 1) / 28) * Math.PI * 2;
    const p0 = [gateS + Math.cos(a0) * gr, gcy + Math.sin(a0) * gr], p1 = [gateS + Math.cos(a1) * gr, gcy + Math.sin(a1) * gr];
    M.quad(A(p0[0], 0.22, p0[1]), A(p1[0], 0.22, p1[1]), A(p1[0], -0.22, p1[1]), A(p0[0], -0.22, p0[1]), V3.norm([-dx * Math.cos(a0), -Math.sin(a0), -dz * Math.cos(a0)]));
  }
  M.set(C.tile, PAT.TILE);
  for (const sd of [-1, 1]) M.quad(A(-0.2, sd * 0.65, wy + WH - 0.05), A(WL + 0.2, sd * 0.65, wy + WH - 0.05), A(WL + 0.2, 0, wy + WH + 0.45), A(-0.2, 0, wy + WH + 0.45), V3.norm([nx * sd, 1.2, nz * sd]), [[0, 0], [WL, 0], [WL, 1.3], [0, 1.3]]);
  col(...A(gateS / 2 - 0.85, 0, wy + WH / 2), gateS / 2 - 0.85, WH / 2, 0.25, wang);
  col(...A((gateS + 1.7 + WL) / 2, 0, wy + WH / 2), (WL - gateS - 1.7) / 2, WH / 2, 0.25, wang);
  lantern(A(gateS - 2.1, -1.0, wy + 2.7), 1.0, true);
  // Taihu rockery: a few tall porous stones with smaller ones at their feet
  M.set([0.11, 0.11, 0.105], PAT.PLAIN);
  const rk = P(6.2, 11, 0);
  const rg = H(rk[0], rk[2]);
  rock([rk[0], rg - 0.5, rk[2]], 0.95, 1.9, 3);
  rock([rk[0] + F.fx * 1.6 - F.rx * 0.8, rg - 0.4, rk[2] + F.fz * 1.6 - F.rz * 0.8], 0.6, 1.4, 3);
  rock([rk[0] - F.fx * 1.4 + F.rx * 0.5, rg - 0.3, rk[2] - F.fz * 1.4 + F.rz * 0.5], 0.55, 0.9, 2);
  for (let k = 0; k < 4; k++) { const a = R() * 6.28, r = 1.2 + R() * 1.2; rock([rk[0] + Math.cos(a) * r, rg - 0.3, rk[2] + Math.sin(a) * r], 0.3 + R() * 0.25, 0.8, 2); }
  // willows along the shore with a stone lantern at each foot
  const shore = (u) => { for (let v = 4; v < 140; v += 0.5) if (h(u, v) < 0.35) return v; return -1; };
  for (const [u, s] of [[-40, 0.95], [-26, 1.0], [-15, 0.9], [22, 0.95], [34, 1.05], [46, 0.9]]) {
    const v = shore(u); if (v < 0) continue;
    const p = P(u, v - 2.5, 0), y = H(p[0], p[2]);
    if (y < 0.5) continue;
    if (u < -5 && v < 36 && u > -32) continue;   // the corridor runs there
    trees.push([p[0], y, p[2], s, 3]);
    const q = P(u + 1.6, v - 1.2, 0), qy = H(q[0], q[2]);
    M.set(C.stone, PAT.PLAIN);
    M.prism([q[0], qy - 0.2, q[2]], 0.18, 6, 0, 0.9, 0, false);
    M.prism([q[0], qy - 0.2, q[2]], 0.34, 6, 0.9, 1.0, 0, true);
    lantern([q[0], qy + 1.15, q[2]], 0.6, false, [1.0, 0.6, 0.25]);
    M.set(C.stone, PAT.PLAIN);
    M.prism([q[0], qy - 0.2, q[2]], 0.42, 4, 1.42, 1.72, Math.PI / 4, true, 0.05);
    lights.push([q[0], qy + 1.2, q[2], 10, 4.5, 2.4, 0.9]);
  }
  for (const [u, v, s] of [[-17, 5, 1.0]]) { const p = P(u, v, 0); const y = H(p[0], p[2]); if (y > 0.5) trees.push([p[0], y, p[2], s, 3]); }
  // lotus close to the shore, clear of the bridge
  for (let k = 0; k < 700; k++) {
    const u = -55 + R() * 75, v = vs + 2 + R() * 55;
    if (Math.abs(u - 0) < 9 && v < vs + 45) continue;
    if (Math.sin(u * 0.12) * Math.cos(v * 0.1) + R() * 0.7 < 0.15) continue;
    const p = P(u, v, 0), y = H(p[0], p[2]);
    if (y > -0.4 || y < -4) continue;
    const flower = R() < 0.12 ? 1 : 0;
    pads.push([p[0], p[2], 0.35 + R() * 0.5, R() * 6.2 + flower * 10]);
  }
  // lantern boats out on the water
  let nb = 0;
  for (let k = 0; k < 40 && nb < 6; k++) {
    const u = -70 + R() * 110, v = vs + 25 + R() * 170;
    if (Math.abs(u) < 14 && v < vs + 55) continue;
    const p = P(u, v, 0);
    if (Math.max(H(p[0], p[2]), H(p[0] + 4, p[2]), H(p[0] - 4, p[2]), H(p[0], p[2] + 4), H(p[0], p[2] - 4)) > -1.2) continue;
    boat(M, lantern, p[0], p[2], R() * 6.28, nb < 4);
    nb++;
  }
  reserve.push({ x: P(0, 10, 0)[0], z: P(0, 10, 0)[2], hw: 26, hd: 40, angle: F.yaw + Math.PI / 2 });
  return F;
}

// Rectangular hall: plaster walls with glowing lattice windows on both long faces and a tiled roof.
function rectHall(env, cx, cz, ang, L, W, y0, h, wall, em) {
  const { M } = env;
  const dx = Math.cos(ang), dz = Math.sin(ang), nx = -dz, nz = dx;
  M.set(wall, PAT.PLASTER);
  M.box([cx, y0, cz], L / 2, W / 2, h, ang, false);
  M.set([1, 1, 1], PAT.LATTICE, em);
  const nw = Math.max(1, Math.floor(L / 3.2));
  for (const sd of [-1, 1]) for (let k = 0; k < nw; k++) {
    const s = -L / 2 + (k + 0.5) * L / nw, o = (W / 2 + 0.03) * sd;
    const b = [cx + dx * s + nx * o, y0 + h * 0.25, cz + dz * s + nz * o];
    M.quad([b[0] - dx * 0.8, b[1], b[2] - dz * 0.8], [b[0] + dx * 0.8, b[1], b[2] + dz * 0.8], [b[0] + dx * 0.8, b[1] + h * 0.5, b[2] + dz * 0.8], [b[0] - dx * 0.8, b[1] + h * 0.5, b[2] - dz * 0.8], [nx * sd, 0, nz * sd]);
  }
  M.set(C.wood, PAT.WOOD);
  M.box([cx, y0 + h - 0.6, cz], L / 2 + 0.1, W / 2 + 0.1, 0.6, ang, false);
  const a = [cx - dx * L / 2, 0, cz - dz * L / 2], b = [cx + dx * L / 2, 0, cz + dz * L / 2];
  hallRoof(M, a, b, y0 + h, W / 2 + 1.6, W * 0.32);
}

// Lit mountain monastery on three stepped terraces: gate hall, main hall with side halls, a seven-storey
// floodlit pagoda at the top, lanterns along every terrace edge. front: direction the complex faces.
function mountainTemple(env, x, z, front) {
  const { M, H, col, lantern, lights, reserve } = env;
  const fx = Math.cos(front), fz = Math.sin(front), rx = -fz, rz = fx;
  const S = 1.45;   // overall scale: it is seen from 1.1 km
  const Q = (u, v) => [x + (rx * u + fx * v) * S, z + (rz * u + fz * v) * S];   // v toward the front
  const g = H(x, z);
  const red = [0.34, 0.075, 0.045], stoneC = [0.13, 0.125, 0.115];
  const ang = Math.atan2(rz, rx);   // long axis of the halls runs across the front
  const terr = [[0, 26, 72, 22, 3], [0, 4, 58, 22, 11], [0, -18, 38, 20, 19]].map(([u, v, w, d, hh]) => [u, v, w * S, d * S, hh * S]);   // u, v, width, depth, height above g
  for (const [u, v, w, d, hh] of terr) {
    const [cx, cz] = Q(u, v);
    let gmin = 1e9; for (const [a, b] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [0, 0]]) { const q = Q(u + a / S, v + b / S); gmin = Math.min(gmin, H(q[0], q[1])); }
    M.set(stoneC, PAT.STONE);
    M.box([cx, gmin - 3, cz], w / 2, d / 2, g + hh - gmin + 3, ang);
    col(cx, (gmin + g + hh) / 2, cz, w / 2, (g + hh - gmin) / 2, d / 2, ang);
    // lanterns along the front edge
    for (let s = -w / 2 + 3; s <= w / 2 - 3; s += 5) {
      const q = Q(u + s / S, v + (d / 2 - 0.4) / S);
      M.set(C.dwood, PAT.WOOD); M.box([q[0], g + hh, q[1]], 0.08, 0.08, 1.5);
      lantern([q[0], g + hh + 1.9, q[1]], 1.6, false);
    }
    reserve.push({ x: cx, z: cz, hw: w / 2 + 6, hd: d / 2 + 6, angle: ang });
  }
  // central stairs between the terraces
  M.set(stoneC, PAT.STONE);
  for (let k = 0; k < 40; k++) {
    const v = 40 - k * 1.5, q = Q(0, v);
    const y = (v > 37 ? -1 + (40 - v) * 1.3 : v > 15 ? 3 + Math.min(8, (37 - v) * 0.55) : 11 + Math.min(8, (15 - v) * 0.6)) * S + g;
    M.box([q[0], y - 0.4, q[1]], 3 * S, 0.8 * S, 0.45 * S, ang);
  }
  // gate hall, main hall, side halls
  let q = Q(0, 28); rectHall(env, q[0], q[1], ang, 22 * S, 9 * S, g + 3 * S, 6.5 * S, red, 4.0);
  q = Q(0, 2); rectHall(env, q[0], q[1], ang, 30 * S, 13 * S, g + 11 * S, 9 * S, red, 5.0);
  q = Q(-21, 4); rectHall(env, q[0], q[1], ang + Math.PI / 2, 14 * S, 8 * S, g + 11 * S, 6 * S, red, 3.4);
  q = Q(21, 4); rectHall(env, q[0], q[1], ang + Math.PI / 2, 14 * S, 8 * S, g + 11 * S, 6 * S, red, 3.4);
  // seven-storey pagoda
  const [px, pz] = Q(0, -19);
  let y = g + 19 * S;
  const rot = Math.PI / 8;
  for (let i = 0; i < 7; i++) {
    const r = (6.2 - i * 0.42) * S, hh = (i === 0 ? 6.5 : 4.4) * S;
    M.set([0.6, 0.42, 0.22], PAT.PAGODA, 6.0 - i * 0.4);
    M.prism([px, y, pz], r, 8, 0, hh, rot, false, r * 0.97);
    y += hh;
    M.set(C.tile, PAT.TILE);
    const top = i === 6;
    const eave = M.roof([px, y, pz], 8, r + 2.0 * S, 0, top ? 0 : (r - 0.42 * S) * 0.98, (top ? 5.5 : 1.4) * S, rot, 1.0 * S, 0.13, 4, 3);
    for (let k = 0; k < 8; k++) { const e = eave[k * 4]; lantern([e[0], e[1] - 1.0, e[2]], 1.5, false, [1.0, 0.45, 0.12]); }
    y += (top ? 5.5 : 1.4) * S;
  }
  M.set(C.gold, PAT.PLAIN, 0.5);
  M.prism([px, y - 0.5, pz], 0.45, 8, 0, 9, rot, true, 0.12);
  col(px, g + 19 * S + 25, pz, 8, 25, 8, 0);
  // floodlights and hall glow (real lights; the complex is far away, so few and large)
  lights.push([px, g + 26 * S, pz, 40, 60, 36, 14]);
  q = Q(0, 12); lights.push([q[0], g + 17 * S, q[1], 40, 40, 22, 9]);
  q = Q(0, 36); lights.push([q[0], g + 9 * S, q[1], 34, 30, 17, 6]);
}

// Lattice relay mast with blinking red aircraft-warning beacons.
function relayMast(env, x, z) {
  const { M, H } = env;
  const g = H(x, z), Ht = 58;
  const w = (y) => 3.2 * (1 - y / Ht) + 0.4;
  M.set(C.iron, PAT.PLAIN);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    for (let s = 0; s < 6; s++) {
      const y0 = s * Ht / 6, y1 = (s + 1) * Ht / 6;
      const p0 = [x + Math.cos(a) * w(y0), g + y0, z + Math.sin(a) * w(y0)];
      M.prism(p0, 0.14, 4, 0, y1 - y0, 0, false, 0.12);
    }
  }
  for (let s = 1; s < 10; s++) {
    const y = s * Ht / 10, ww = w(y) / Math.SQRT2;
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; M.box([x + Math.cos(a) * ww, g + y, z + Math.sin(a) * ww], 0.06, ww, 0.12, a); }
  }
  M.set([1.0, 0.08, 0.04], PAT.BEACON, 70);
  for (const y of [Ht * 0.45, Ht * 0.75, Ht + 1.2]) { M.prism([x, g + y, z], 0.01, 6, -1.5, 0, 0, false, 1.5); M.prism([x, g + y, z], 1.5, 6, 0, 1.5, 0, false, 0.01); }
  M.set([0.5, 0.06, 0.04], PAT.PLAIN, 0);
  M.prism([x, g + Ht, z], 0.12, 4, 0, 0.6, 0, true);
}

// ---------------------------------------------------------------- pose 9: cliff-top lookout and valley lights
// mist cover at a valley point (mirrors valleyMist() in terrainShade.js), used to dim lights under the mist
function mistAt(x, y, z) {
  const qx = x - 700, qz = z - 4560, s = qx * 0.188 + qz * 0.9822;
  if (s < -300) return 0;
  const top = 120 + 0.08 * Math.max(s, 0);
  const t = Math.min(Math.max((y - (top - 110)) / 110, 0), 1);
  return (1 - t * t * (3 - 2 * t)) * Math.min(Math.max((s + 300) / 800, 0), 1) * 0.88;
}

export function cragLookout(env) {
  const { M, H, Hf, col, lantern, lights, reserve, R } = env;
  const F = frame(POSES[8]);
  const g = H(F.x, F.z);
  const ty = g + 0.6;
  const P = F.P;
  const h = (u, v) => H(P(u, v, 0)[0], P(u, v, 0)[2]);
  // stone platform on the brink: from 12 m behind the camera to just past the balustrade
  let gmin = g; for (const u of [-11.3, 0, 11.3]) for (const v of [-12, -5, 2.0]) gmin = Math.min(gmin, h(u, v));
  M.set(C.stone, PAT.STONE);
  M.box(P(0, -5.0, gmin - 4), 7.0, 11.3, ty - gmin + 4, F.yaw);
  col(...P(0, -5.0, ty - 1.5), 7.0, 1.5, 11.3, F.yaw);
  M.set(C.gravel, PAT.GRAVEL);
  M.quad(P(-11.3, -12, ty + 0.005), P(11.3, -12, ty + 0.005), P(11.3, 2.0, ty + 0.005), P(-11.3, 2.0, ty + 0.005), [0, 1, 0]);
  // carved stone balustrade along the brink (a bay centred on the view axis) and down both sides; only its
  // hand rail and the tops of the balusters enter the bottom of the view
  const BV = 1.1;
  stoneBalustrade(M, P, [[-11, -11], [-11, BV], [11, BV], [11, -11]], ty, () => false, 4.4);
  col(...P(0, BV, ty + 0.55), 0.22, 0.55, 11, F.yaw);
  for (const u of [-11, 11]) col(...P(u, (BV - 11) / 2, ty + 0.55), (BV + 11) / 2, 0.55, 0.22, F.yaw);
  // pavilion behind the camera on the left (out of view; lights the platform)
  const pc = P(-8.6, -6.5, ty);
  const pr = F.yaw + Math.PI / 4, half = 2.3;
  M.set(C.wood, PAT.WOOD);
  for (let k = 0; k < 4; k++) { const a = pr + k * Math.PI / 2; M.prism([pc[0] + Math.cos(a) * half * Math.SQRT2, ty, pc[2] + Math.sin(a) * half * Math.SQRT2], 0.15, 6, 0, 2.45, 0, false); }
  M.prism([pc[0], ty, pc[2]], half * Math.SQRT2 + 0.12, 4, 2.2, 2.5, pr, false);
  M.set(C.tile, PAT.TILE);
  M.roof([pc[0], ty + 2.5, pc[2]], 4, (half + 1.6) * Math.SQRT2, 0, 0, 2.4, pr, 0.95, 0.12, 6, 5);
  lantern([pc[0], ty + 1.9, pc[2]], 0.9, true);
  col(pc[0], ty + 1.2, pc[2], 0.2, 1.2, 0.2, 0);
  reserve.push({ x: F.x, z: F.z, hw: 20, hd: 20, angle: F.yaw });
  M.end(3000);

  // hero of the view: a lit mountain monastery on the spur right of the valley, above the mist
  M.begin();
  const ts = [700 + 0.188 * 950 - 0.9822 * 600, 4560 + 0.9822 * 950 + 0.188 * 600];
  mountainTemple(env, ts[0], ts[1], Math.atan2(4605 - ts[1], 708 - ts[0]));
  M.end(6000);
  // relay mast with blinking red beacons on the left ridge
  M.begin();
  relayMast(env, 700 + 0.188 * 1750 + 0.9822 * 1050, 4560 + 0.9822 * 1750 - 0.188 * 1050);
  M.end(6000);
  M.begin();

  // valley lights: a road winding down the valley floor, villages along it, hamlets on the far slopes
  const glow = [];
  const road = [];
  for (let s = 0; s <= 1; s += 0.005) {
    const x = 700 + s * 1900 + Math.sin(s * 23) * 140, z = 4700 + s * 9800;
    road.push([x, z]);
  }
  for (let i = 0; i < road.length; i += 2) { const [x, z] = road[i]; glow.push([x, Hf(x, z) + 7, z, 2.4, 1.0, 0.62, 0.3]); }
  const villages = [[0.16, 22], [0.3, 30], [0.47, 18], [0.62, 26], [0.8, 16], [0.93, 12]];
  for (const [s, n] of villages) {
    const i = Math.round(s / 0.005), [vx, vz] = road[Math.min(i, road.length - 1)];
    for (let k = 0; k < n; k++) {
      const a = R() * 6.28, r = 20 + R() * 140;
      const x = vx + Math.cos(a) * r, z = vz + Math.sin(a) * r;
      glow.push([x, Hf(x, z) + 9 + R() * 5, z, 3.0 + R() * 2.0, 1.0, 0.7 + R() * 0.15, 0.38]);
    }
  }
  const slopes = [[1700, -950], [2500, 1150], [3300, -1500], [4100, 950], [5000, -800], [5900, 1500], [6900, -1250], [2100, 1750], [7800, 600], [4600, -2100]];
  for (const [s, c] of slopes) {
    const cx = 700 + 0.188 * s - 0.9822 * c, cz = 4560 + 0.9822 * s + 0.188 * c;
    const n = 8 + Math.floor(R() * 10);
    for (let k = 0; k < n; k++) {
      const a = R() * 6.28, r = R() * (60 + s * 0.02);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      glow.push([x, Hf(x, z) + 6 + R() * 4, z, 2.2 + s / 1600 + R(), 1.0, 0.66 + R() * 0.15, 0.32]);
    }
  }
  // lit pilgrims' path zigzagging down from the monastery gate toward the valley floor
  {
    const tx = 700 + 0.188 * 950 - 0.9822 * 600, tz = 4560 + 0.9822 * 950 + 0.188 * 600;
    const dx = 708 - tx, dz = 4605 - tz, dl = Math.hypot(dx, dz), fx = dx / dl, fz = dz / dl;
    for (let s = 70; s < 420; s += 11) {
      const w = Math.sin(s / 45) * 35, x = tx + fx * s - fz * w, z = tz + fz * s + fx * w;
      glow.push([x, Hf(x, z) + 3, z, 1.6, 1.0, 0.6, 0.28]);
    }
  }
  // glows are small emissive octahedra (sub-pixel lamps would vanish at these distances), dimmed under the mist
  for (const [x, y, z, s, r, gg, b] of glow) {
    M.set([r, gg, b], PAT.PLAIN, 26 * (1 - 0.8 * mistAt(x, y, z)));
    M.prism([x, y, z], 0.01, 4, -s, 0, 0, false, s);
    M.prism([x, y, z], s, 4, 0, s, 0, false, 0.01);
  }
  return glow.length;
}

// ---------------------------------------------------------------- pose 10: life on the river banks
// Promenade lamps along the embankments in view of the cableway viewpoint, and lit stairways climbing the
// bank slopes to small pavilions, so the wooded hillside has paths and points of light.
export function riverbankLife(env, world) {
  const { M, H, col, lantern, lights, reserve } = env;
  const F = frame(POSES[9]);
  const local = (x, z) => { const dx = x - F.x, dz = z - F.z; return [dx * F.rx + dz * F.rz, dx * F.fx + dz * F.fz]; };
  const bank = [];
  for (const run of world.shared.embankments || []) {
    for (let i = 0; i < run.length; i++) {
      const [x, z, nx, nz] = run[i];
      const [u, v] = local(x, z);
      // in front of the camera, landward normal pointing away from the view axis
      if (v > 30 && v < 1400 && Math.abs(u) < 700 && Math.sign(u) * (nx * F.rx + nz * F.rz) > 0.3) bank.push([x, z, nx, nz, v, u]);
    }
  }
  bank.sort((a, b) => a[4] - b[4]);
  let lampsPlaced = 0;
  M.begin();
  const lastBySide = {};
  for (const [x, z, nx, nz, , u] of bank) {
    const side = u > 0 ? 'r' : 'l', last = lastBySide[side];
    if (last && Math.hypot(x - last[0], z - last[1]) < 30) continue;
    lastBySide[side] = [x, z];
    const px = x + nx * 4.9, pz = z + nz * 4.9, y = 5.8;
    M.set(C.iron, PAT.PLAIN);
    M.prism([px, y, pz], 0.08, 6, 0, 4.2, 0, false, 0.06);
    M.box([px - nx * 0.45, y + 4.1, pz - nz * 0.45], 0.5, 0.04, 0.08, Math.atan2(-nz, -nx));
    lantern([px - nx * 0.85, y + 3.45, pz - nz * 0.85], 1.15, false, [1.0, 0.5, 0.18]);
    if (lampsPlaced % 2 === 0) lights.push([px - nx * 0.85, y + 3.2, pz - nz * 0.85, 16, 9, 4.6, 1.7]);
    lampsPlaced++;
  }
  M.end(2600);
  // stairways climbing the slope behind the promenade, lamp posts along them, a pavilion at the top
  let stairs = 0;
  for (let i = 2; i < bank.length; i += 5) {
    const [bx, bz, nx, nz] = bank[i];
    M.begin();
    let x = bx + nx * 6.5, z = bz + nz * 6.5, len = 0;
    const steps = [];
    while (len < 75) {
      const d = 3, gx = H(x + d, z) - H(x - d, z), gz = H(x, z + d) - H(x, z - d), gl = Math.hypot(gx, gz);
      let sx = nx * 0.5 + (gl > 0.05 ? gx / gl : 0) * 0.8 + Math.sin(len / 9) * 0.5 * -nz, sz = nz * 0.5 + (gl > 0.05 ? gz / gl : 0) * 0.8 + Math.sin(len / 9) * 0.5 * nx;
      const sl = Math.hypot(sx, sz); sx /= sl; sz /= sl;
      x += sx * 1.5; z += sz * 1.5; len += 1.5;
      if (world.waterDist(x, z) < 6) break;
      steps.push([x, z, Math.atan2(sz, sx)]);
    }
    if (steps.length < 12) { M.end(); continue; }
    M.set(C.stone, PAT.STONE);
    for (const [x2, z2, a] of steps) M.box([x2, H(x2, z2) - 0.3, z2], 0.75, 1.0, 0.45, a);
    for (let k = 2; k < steps.length; k += 5) {
      const [x2, z2, a] = steps[k];
      const lx = x2 - Math.sin(a) * 1.4, lz = z2 + Math.cos(a) * 1.4, ly = H(lx, lz);
      M.set(C.dwood, PAT.WOOD); M.box([lx, ly, lz], 0.06, 0.06, 2.3);
      lantern([lx, ly + 2.55, lz], 0.95, false, [1.0, 0.55, 0.22]);
      reserve.push({ x: x2, z: z2, hw: 5, hd: 5 });
    }
    const [ex, ez, ea] = steps[steps.length - 1];
    const tx = ex + Math.cos(ea) * 5, tz = ez + Math.sin(ea) * 5;
    let gmin = 1e9, gmax = -1e9;
    for (let k = 0; k < 8; k++) { const q = H(tx + Math.cos(k * 0.785) * 5, tz + Math.sin(k * 0.785) * 5); gmin = Math.min(gmin, q); gmax = Math.max(gmax, q); }
    M.set(C.stone, PAT.STONE);
    M.prism([tx, gmin - 2, tz], 5.2, 8, 0, gmax - gmin + 2.4, Math.PI / 8);
    col(tx, (gmin + gmax) / 2, tz, 3.7, (gmax - gmin) / 2 + 0.4, 3.7, 0);
    env.pavilion([tx, gmax + 0.4, tz], 6, 3.0, 0.3);
    const mid = steps[steps.length >> 1];
    lights.push([tx, gmax + 3.2, tz, 15, 8, 4.3, 1.6]);
    lights.push([mid[0], H(mid[0], mid[1]) + 2.8, mid[1], 14, 6, 3.2, 1.2]);
    reserve.push({ x: tx, z: tz, hw: 10, hd: 10 });
    M.end(2600);
    stairs++;
  }
  return lampsPlaced + stairs;
}

// ---------------------------------------------------------------- distant settlements on the mountain ring
// Small villages and the roads climbing to them on the ranges around the basin, as warm points of light
// (mostly seen from the Nanshan overlook, pose 1).
export function distantLights(env) {
  const { M, Hf, R } = env;
  const cam = POSES[0].pos;
  const glow = [];
  const sites = [];
  for (let k = 0; k < 400 && sites.length < 9; k++) {
    const a = (-100 + R() * 70) * Math.PI / 180, d = 5200 + R() * 4200;
    const x = cam[0] + Math.cos(a) * d, z = cam[2] + Math.sin(a) * d;
    const h = Hf(x, z);
    if (Math.hypot(x - 300, (z + 300) * 0.92) < 4500 || h < 120 || h > 1100) continue;
    if (sites.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 1200)) continue;
    sites.push([x, z]);
  }
  for (const [x, z] of sites) {
    const n = 7 + Math.floor(R() * 9);
    for (let i = 0; i < n; i++) {
      const a = R() * 6.28, r = R() * 110, gx = x + Math.cos(a) * r, gz = z + Math.sin(a) * r;
      glow.push([gx, Hf(gx, gz) + 6, gz, 6 + R() * 3]);
    }
    // a road winding down toward the basin
    const dx = 300 - x, dz = -300 - z, dl = Math.hypot(dx, dz), fx = dx / dl, fz = dz / dl;
    for (let s = 130; s < 1300; s += 75) {
      const w = Math.sin(s / 160) * 120, gx = x + fx * s - fz * w, gz = z + fz * s + fx * w;
      glow.push([gx, Hf(gx, gz) + 5, gz, 4.5]);
    }
  }
  for (const [x, y, z, s] of glow) {
    M.set([1.0, 0.68, 0.36], PAT.PLAIN, 20);
    M.prism([x, y, z], 0.01, 4, -s, 0, 0, false, s);
    M.prism([x, y, z], s, 4, 0, s, 0, false, 0.01);
  }
  return glow.length;
}

// ---------------------------------------------------------------- hillside life inside the city
// Chongqing-style hamlets on the forested slopes between the districts: a few houses (or a small temple) on
// stone terraces along the contour, a lit stairway running down the slope, lamp posts along the steps.
const noop = () => {};
const SINK_M = { begin: noop, end: noop, set: noop, box: noop, quad: noop, roof: noop, prism: noop };

export function hillsideLife(env, world) {
  const { H, R } = env;
  const gi = DISTRICTS.findIndex((D) => D.type === DT.GARDEN);
  // lots in a coarse grid for overlap tests
  const CELL = 100, grid = new Map();
  for (const L of world.lots) {
    const k = Math.floor(L.x / CELL) * 10007 + Math.floor(L.z / CELL);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(L);
  }
  const nearLot = (x, z, pad) => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const L of grid.get((cx + i) * 10007 + cz + j) || []) {
        const c = Math.cos(L.angle), s = Math.sin(L.angle), dx = x - L.x, dz = z - L.z;
        const lx = dx * c + dz * s, lz = -dx * s + dz * c;
        if (Math.abs(lx) < L.w / 2 + pad && Math.abs(lz) < L.d / 2 + pad) return true;
      }
    }
    return false;
  };
  let hamlets = 0;
  for (let gx = -3400; gx <= 4200; gx += 75) for (let gz = -3600; gz <= 3200; gz += 75) {
    const x = gx + (R() - 0.5) * 50, z = gz + (R() - 0.5) * 50;
    if (Math.hypot(x - 300, (z + 300) * 0.92) > 3900) continue;
    const h = H(x, z);
    if (h < 14) continue;
    const ddx = H(x + 5, z) - H(x - 5, z), ddz = H(x, z + 5) - H(x, z - 5);
    const slope = Math.hypot(ddx, ddz) / 10;
    const hot = Math.min(Math.hypot(x + 1060, z - 330), Math.hypot(x + 1066, z + 924)) < 560;
    if (slope < 0.12 || slope > (hot ? 1.3 : 0.75)) continue;
    if (world.waterDist(x, z) < (hot ? 25 : 45)) continue;
    if (gi >= 0 && world.districtWeight(gi, x, z) > 0.05) continue;
    if (world._isReserved(x, z, 10) || nearLot(x, z, 9)) continue;
    if (R() > (hot ? 0.75 : 0.075)) continue;
    // land-use plan (I-016): a hamlet on built or park land of the plan is not emitted, but it consumes exactly
    // the same random draws, so every later hamlet stays as it was
    const skip = !!(world.plan && world.plan.blocks(x, z, 40));
    const M = skip ? SINK_M : env.M, lantern = skip ? noop : env.lantern, col = skip ? noop : env.col;
    // the reserve rectangles of a suppressed hamlet are kept apart: the vegetation module still stamps them into the
    // mask that filters the street trees, so the fixed-tree stream rng(4242) cannot shift (see vegetation.js)
    const lights = skip ? [] : env.lights, reserve = skip ? (world.shared.suppressedReserve ||= []) : env.reserve;
    const gl = Math.hypot(ddx, ddz), dX = -ddx / gl, dZ = -ddz / gl;   // downhill
    const tX = -dZ, tZ = dX;                                         // along the contour
    const yaw = Math.atan2(dZ, dX);
    const temple = R() < 0.12;
    M.begin();
    const n = temple ? 1 : 2 + Math.floor(R() * 3);
    let ok = true;
    for (let k = 0; k < n && ok; k++) { const o = (k - (n - 1) / 2) * 9; if (nearLot(x + tX * o, z + tZ * o, 6)) ok = false; }
    if (!ok) continue;
    for (let k = 0; k < n; k++) {
      const o = (k - (n - 1) / 2) * 9 + (R() - 0.5) * 2;
      const hx = x + tX * o, hz = z + tZ * o;
      const half = temple ? 4.2 : 2.6 + R() * 0.8;
      let gmin = 1e9, gmax = -1e9;
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const q = H(hx + (tX * a + dX * b) * half, hz + (tZ * a + dZ * b) * half); gmin = Math.min(gmin, q); gmax = Math.max(gmax, q); }
      const floor = gmax + 0.3;
      // stone retaining terrace
      M.set(C.stone, PAT.STONE);
      M.box([hx, gmin - 1.5, hz], half + 1.2, half + 1.2, floor - gmin + 1.5, yaw);
      // house walls (temples are red)
      const wallH = temple ? 4.2 : 3.0 + R() * 0.6;
      M.set(temple ? [0.32, 0.06, 0.04] : C.plaster, PAT.PLASTER);
      M.box([hx, floor, hz], half, half, wallH, yaw, false);
      col(hx, floor + wallH / 2, hz, half, wallH / 2, half, yaw);
      // glowing windows on the downhill face
      M.set([1, 1, 1], PAT.LATTICE, temple ? 3.0 : 1.6 + R() * 1.4);
      for (const w of temple ? [-1.6, 0, 1.6] : [-0.9, 0.9]) {
        const bx = hx + dX * (half + 0.03) + tX * w, bz = hz + dZ * (half + 0.03) + tZ * w;
        M.quad([bx - tX * 0.45, floor + 0.9, bz - tZ * 0.45], [bx + tX * 0.45, floor + 0.9, bz + tZ * 0.45], [bx + tX * 0.45, floor + 2.1, bz + tZ * 0.45], [bx - tX * 0.45, floor + 2.1, bz - tZ * 0.45], [dX, 0, dZ]);
      }
      M.set(C.tile, PAT.TILE);
      M.roof([hx, floor + wallH, hz], 4, (half + 1.0) * Math.SQRT2, 0, 0, temple ? 2.6 : 1.8, yaw + Math.PI / 4, temple ? 0.9 : 0.45, 0.1, 6, 4);
      if (temple) {
        M.roof([hx, floor + wallH + 2.0, hz], 4, (half - 0.6) * Math.SQRT2, 0, 0, 2.2, yaw + Math.PI / 4, 0.8, 0.1, 6, 4);
        lantern([hx + dX * (half + 1.0) + tX * 2.2, floor + wallH - 0.4, hz + dZ * (half + 1.0) + tZ * 2.2], 1.0, true);
        lantern([hx + dX * (half + 1.0) - tX * 2.2, floor + wallH - 0.4, hz + dZ * (half + 1.0) - tZ * 2.2], 1.0, false);
      }
      reserve.push({ x: hx, z: hz, hw: half + 4, hd: half + 4, angle: yaw });
    }
    // lit stairway down the slope
    const len = 30 + R() * 35;
    const sx = x + dX * 5, sz = z + dZ * 5;
    M.set(C.stone, PAT.STONE);
    for (let s = 0; s < len; s += 1.6) {
      const px = sx + dX * s, pz = sz + dZ * s, py = H(px, pz);
      M.box([px, py - 0.25, pz], 0.8, 1.1, 0.45, yaw);
    }
    for (let s = 3; s < len; s += 11) {
      const px = sx + dX * s + tX * 1.5, pz = sz + dZ * s + tZ * 1.5, py = H(px, pz);
      M.set(C.dwood, PAT.WOOD); M.box([px, py, pz], 0.06, 0.06, 2.6);
      M.set([1.0, 0.68, 0.35], PAT.PLAIN, 10);
      M.prism([px, py + 2.75, pz], 0.16, 6, -0.2, 0.2, 0, true);
    }
    const mx = sx + dX * len * 0.5 + tX * 1.5, mz = sz + dZ * len * 0.5 + tZ * 1.5;
    if (hamlets % 2 === 0) lights.push([mx, H(mx, mz) + 3, mz, 16, 6, 3.6, 1.6]);
    reserve.push({ x: sx + dX * len / 2, z: sz + dZ * len / 2, hw: len / 2 + 2, hd: 2.4, angle: yaw });
    M.end(2200);
    hamlets++;
  }
  return hamlets;
}
