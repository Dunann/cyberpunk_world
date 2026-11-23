// Foreground set pieces for three viewpoints, built into the garden module's static mesh:
//  - pose 1: Nanshan lookout tower (multi-storey pavilion, top deck just below the camera, railing, lanterns)
//  - pose 5: lakeside garden vignette (terrace, zigzag bridge to a water pavilion, covered corridor,
//            moon-gate wall with tile coping, rockery, willows)
//  - pose 9: cliff-top lookout on the crag above the south valley, plus village and road lights in the valley
// Each piece is placed from the POSES entry it frames (world.js), so the camera and the set stay in sync.

import { PAT, V3 } from './gardenMesh.js';
import { POSES, DISTRICTS, DT } from './world.js';

const C = {
  plaster: [0.58, 0.56, 0.52], tile: [0.03, 0.032, 0.036], wood: [0.17, 0.035, 0.022], dwood: [0.06, 0.035, 0.025],
  stone: [0.15, 0.145, 0.135], dstone: [0.08, 0.078, 0.074], taihu: [0.2, 0.2, 0.19], gravel: [0.1, 0.095, 0.088],
};

// Local frame: u to the right of the view, v forward, y up.
function frame(pose) {
  const [x, , z] = pose.pos, [tx, , tz] = pose.target;
  const l = Math.hypot(tx - x, tz - z);
  const fx = (tx - x) / l, fz = (tz - z) / l;
  const rx = -fz, rz = fx;
  return { x, z, fx, fz, rx, rz, yaw: Math.atan2(fz, fx), P: (u, v, y) => [x + rx * u + fx * v, y, z + rz * u + fz * v] };
}

// Wooden/stone railing along a polyline of [u, v] points at deck height y (posts + two rails).
function railing(M, F, pts, y, h = 1.05) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = F.P(pts[i][0], pts[i][1], y), b = F.P(pts[i + 1][0], pts[i + 1][1], y);
    const L = Math.hypot(b[0] - a[0], b[2] - a[2]), ang = Math.atan2(b[2] - a[2], b[0] - a[0]);
    const n = Math.max(1, Math.round(L / 1.4));
    M.set(C.wood, PAT.WOOD);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      M.box([a[0] + (b[0] - a[0]) * t, y, a[2] + (b[2] - a[2]) * t], 0.07, 0.07, h);
    }
    const m = [(a[0] + b[0]) / 2, y, (a[2] + b[2]) / 2];
    M.box([m[0], y + h - 0.08, m[2]], L / 2, 0.06, 0.1, ang);
    M.box([m[0], y + 0.35, m[2]], L / 2, 0.035, 0.06, ang);
  }
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
    // storey eave with upturned corners
    M.set(C.tile, PAT.TILE);
    const ring = M.roof([cx, y0 + sh - 0.3, cz], 4, (half + 2.2) * Math.SQRT2, 0, (half - 0.2) * Math.SQRT2, 1.3, rot, 1.1, 0.1, 6, 4);
    for (let k = 0; k < 4; k++) { const e = ring[k * 6]; lantern([e[0], e[1] - 0.8, e[2]], 0.9, s === storeys - 1 && k % 2 === 0); }
  }
  col(cx, (base + deckY) / 2 - 0.2, cz, 5, (deckY - base) / 2, 5, F.yaw);
  // top deck: stone floor, railing, corner columns, roof
  const D = 5.6;
  M.set(C.stone, PAT.STONE);
  M.box([cx, deckY - 0.45, cz], D + 0.25, D + 0.25, 0.45, F.yaw);
  col(cx, deckY - 0.3, cz, D, 0.3, D, F.yaw);
  const corners = [[-D, -D], [D, -D], [D, D], [-D, D], [-D, -D]];
  const Fc = { P: Pc };
  railing(M, Fc, corners, deckY);
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
  // lanterns: hanging under the front eave corners and standing on the front-right railing post
  for (let k = 0; k < 4; k++) { const e = top[k * 8]; lantern([e[0], e[1] - 0.9, e[2]], 1.1, true); }
  const pr = Pc(D - 0.05, D - 0.05, deckY + 1.05);
  M.set(C.stone, PAT.PLAIN); M.box(pr, 0.16, 0.16, 0.12);
  lantern([pr[0], pr[1] + 0.45, pr[2]], 0.75, true, [1.0, 0.55, 0.2]);
  lights.push([cx, deckY + 2.8, cz, 12, 8, 4.5, 1.6]);
  reserve.push({ x: cx, z: cz, hw: 16, hd: 16, angle: F.yaw });
}

// ---------------------------------------------------------------- pose 5: lakeside garden vignette
export function lakesideVignette(env) {
  const { M, H, col, lantern, reserve, trees, pavilion, rock, R } = env;
  const F = frame(POSES[4]);
  const g0 = H(F.x, F.z);
  const ty = g0 + 1.0;            // terrace top
  const P = F.P;
  // stone terrace with a low balustrade at the front
  M.set(C.dstone, PAT.STONE);
  let gmin = g0; for (const [u, v] of [[-6, -5], [6, -5], [6, 5], [-6, 5]]) gmin = Math.min(gmin, H(P(u, v, 0)[0], P(u, v, 0)[2]));
  M.box(P(0, 0, gmin - 1.5), 6, 5, ty - gmin + 1.5, F.yaw);
  M.set(C.gravel, PAT.GRAVEL);
  M.quad(P(-6, -5, ty + 0.01), P(6, -5, ty + 0.01), P(6, 5, ty + 0.01), P(-6, 5, ty + 0.01), [0, 1, 0]);
  col(...P(0, 0, (gmin - 1.5 + ty) / 2), 6, (ty - gmin + 1.5) / 2, 5, F.yaw);
  M.set(C.stone, PAT.STONE);
  M.box(P(-3.6, 5, ty), 0.18, 2.4, 0.62, F.yaw);
  M.box(P(3.6, 5, ty), 0.18, 2.4, 0.62, F.yaw);
  col(...P(-3.6, 5, ty + 0.31), 0.2, 0.31, 2.4, F.yaw); col(...P(3.6, 5, ty + 0.31), 0.2, 0.31, 2.4, F.yaw);
  for (const u of [-6, 6]) { M.set(C.stone, PAT.PLAIN); M.box(P(u, 5, ty), 0.22, 0.22, 0.9, F.yaw); }
  lantern(P(-6, 5, ty + 1.35), 1.0, true); lantern(P(6, 5, ty + 1.35), 1.0, true);
  // steps down to the zigzag bridge
  M.set(C.stone, PAT.STONE);
  for (let k = 0; k < 4; k++) M.box(P(0, 5.4 + k * 0.5, ty - 0.25 * (k + 1)), 0.75, 0.25, 0.25, F.yaw);
  // zigzag stone bridge over the water to a hexagonal water pavilion
  const zz = [[0, 13], [-6, 22], [5, 32], [-4, 43], [2, 52]];
  const by = 0.55;
  for (let i = 0; i < zz.length - 1; i++) {
    const a = P(zz[i][0], zz[i][1], 0), b = P(zz[i + 1][0], zz[i + 1][1], 0);
    const L = Math.hypot(b[0] - a[0], b[2] - a[2]), ang = Math.atan2(b[2] - a[2], b[0] - a[0]);
    const m = [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2];
    M.set(C.stone, PAT.STONE);
    M.box([m[0], by - 0.25, m[2]], L / 2 + 0.7, 0.85, 0.25, ang);
    for (let k = 0; k <= 2; k++) { const t = k / 2; M.box([a[0] + (b[0] - a[0]) * t, -2.5, a[2] + (b[2] - a[2]) * t], 0.3, 0.3, by + 2.2); }
    col(m[0], by - 0.6, m[2], L / 2 + 0.7, 0.6, 0.85, ang);
    // low stone rails
    const nx = -Math.sin(ang), nz = Math.cos(ang);
    M.set(C.stone, PAT.PLAIN);
    for (const sd of [-1, 1]) M.box([m[0] + nx * 0.8 * sd, by, m[2] + nz * 0.8 * sd], L / 2 + 0.5, 0.06, 0.45, ang);
    if (i % 2 === 1) lantern([b[0], by + 1.6, b[2]], 0.9, true);
  }
  const pc = P(2, 57, 0);
  M.set(C.stone, PAT.STONE);
  M.prism([pc[0], -2.5, pc[2]], 5.2, 6, 0, 2.95, 0);
  col(pc[0], by - 0.6, pc[2], 3.6, 0.6, 3.6, 0);
  pavilion([pc[0], by - 0.1, pc[2]], 6, 3.2, 0.1);
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
    for (let k = 0; k <= n; k++) {
      const t = k / n, px = a[0] + (b[0] - a[0]) * t, pz = a[2] + (b[2] - a[2]) * t;
      M.set(C.wood, PAT.WOOD);
      for (const sd of [-1, 1]) M.prism([px + nx * 1.25 * sd, floor, pz + nz * 1.25 * sd], 0.12, 6, 0, 2.7, 0, false);
      if (k % 3 === 1) lantern([px, floor + 2.35, pz], 0.75, k === 1);
    }
    // gable roof with dark tiles and a ridge
    M.set(C.tile, PAT.TILE);
    const ry = floor + 2.75, ov = 1.9;
    const e0 = [a[0] - (b[0] - a[0]) / L * 0.3, 0, a[2] - (b[2] - a[2]) / L * 0.3], e1 = [b[0] + (b[0] - a[0]) / L * 0.3, 0, b[2] + (b[2] - a[2]) / L * 0.3];
    for (const sd of [-1, 1]) {
      M.quad([e0[0] + nx * ov * sd, ry, e0[2] + nz * ov * sd], [e1[0] + nx * ov * sd, ry, e1[2] + nz * ov * sd], [e1[0], ry + 0.9, e1[2]], [e0[0], ry + 0.9, e0[2]], V3.norm([nx * sd, 1.6, nz * sd]), [[0, 0], [L, 0], [L, 1], [0, 1]]);
    }
    M.set(C.dwood, PAT.WOOD);
    M.box([m[0], ry + 0.85, m[2]], L / 2 + 0.35, 0.12, 0.18, ang);
  }
  // moon-gate wall on the right, white plaster with dark tile coping and lattice windows
  const wa = P(7.5, -3, 0), wb = P(9.5, 26, 0);
  const WL = Math.hypot(wb[0] - wa[0], wb[2] - wa[2]), wang = Math.atan2(wb[2] - wa[2], wb[0] - wa[0]);
  const dx = (wb[0] - wa[0]) / WL, dz = (wb[2] - wa[2]) / WL, nx = -dz, nz = dx;
  const wy = Math.min(H(wa[0], wa[2]), H(wb[0], wb[2]), g0) - 0.3, WH = 3.6 + (ty - wy) * 0.3;
  const A = (s, o, y) => [wa[0] + dx * s + nx * o, y, wa[2] + dz * s + nz * o];
  const gateS = WL * 0.36, gr = 1.45, gcy = wy + gr + 0.4;
  for (const o of [0.22, -0.22]) {
    const n = o > 0 ? [nx, 0, nz] : [-nx, 0, -nz];
    M.set(C.plaster, PAT.PLASTER);
    M.quad(A(0, o, wy), A(gateS - 1.7, o, wy), A(gateS - 1.7, o, wy + WH), A(0, o, wy + WH), n, [[0, 0], [1, 0], [1, WH], [0, WH]]);
    M.quad(A(gateS + 1.7, o, wy), A(WL, o, wy), A(WL, o, wy + WH), A(gateS + 1.7, o, wy + WH), n, [[0, 0], [1, 0], [1, WH], [0, WH]]);
    // ring around the circular opening
    const N = 28;
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
      const ray = (a) => { const cx = Math.cos(a), cy = Math.sin(a); const tx = cx > 0 ? 1.7 / cx : cx < 0 ? -1.7 / cx : 1e9; const tyy = cy > 0 ? (wy + WH - gcy) / cy : cy < 0 ? (wy - gcy) / cy : 1e9; const t = Math.min(tx, tyy); return [gateS + cx * t, gcy + cy * t]; };
      const r0 = ray(a0), r1 = ray(a1);
      const c0 = [gateS + Math.cos(a0) * gr, gcy + Math.sin(a0) * gr], c1 = [gateS + Math.cos(a1) * gr, gcy + Math.sin(a1) * gr];
      M.quad(A(c0[0], o, c0[1]), A(c1[0], o, c1[1]), A(r1[0], o, r1[1]), A(r0[0], o, r0[1]), n, [[0, c0[1] - wy], [1, c1[1] - wy], [1, r1[1] - wy], [0, r0[1] - wy]]);
    }
    M.set([1, 1, 1], PAT.LATTICE, 2.0);
    for (const s of [WL * 0.18, WL * 0.85]) M.quad(A(s - 0.6, o * 1.05, wy + 1.4), A(s + 0.6, o * 1.05, wy + 1.4), A(s + 0.6, o * 1.05, wy + 2.4), A(s - 0.6, o * 1.05, wy + 2.4), n, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
  M.set(C.stone, PAT.PLAIN);
  for (let k = 0; k < 28; k++) {
    const a0 = (k / 28) * Math.PI * 2, a1 = ((k + 1) / 28) * Math.PI * 2;
    const p0 = [gateS + Math.cos(a0) * gr, gcy + Math.sin(a0) * gr], p1 = [gateS + Math.cos(a1) * gr, gcy + Math.sin(a1) * gr];
    M.quad(A(p0[0], 0.22, p0[1]), A(p1[0], 0.22, p1[1]), A(p1[0], -0.22, p1[1]), A(p0[0], -0.22, p0[1]), V3.norm([-dx * Math.cos(a0), -Math.sin(a0), -dz * Math.cos(a0)]));
  }
  M.set(C.tile, PAT.TILE);
  for (const sd of [-1, 1]) M.quad(A(-0.2, sd * 0.65, wy + WH - 0.05), A(WL + 0.2, sd * 0.65, wy + WH - 0.05), A(WL + 0.2, 0, wy + WH + 0.45), A(-0.2, 0, wy + WH + 0.45), V3.norm([nx * sd, 1.2, nz * sd]), [[0, 0], [WL, 0], [WL, 1], [0, 1]]);
  col(...A(gateS / 2 - 0.85, 0, wy + WH / 2), gateS / 2 - 0.85, WH / 2, 0.25, wang);
  col(...A((gateS + 1.7 + WL) / 2, 0, wy + WH / 2), (WL - gateS - 1.7) / 2, WH / 2, 0.25, wang);
  lantern(A(gateS - 2.1, -1.0, wy + 2.7), 1.0, true);
  // rockery and willows
  M.set(C.taihu, PAT.STONE);
  const rk = P(6.5, 11, 0);
  for (let k = 0; k < 7; k++) { const a = R() * 6.28, r = R() * 2.2; rock([rk[0] + Math.cos(a) * r, H(rk[0], rk[2]) - 0.4, rk[2] + Math.sin(a) * r], 0.5 + R() * 0.9, 1.0 + R() * 0.9); }
  for (const [u, v, s] of [[-9.5, 16, 0.95], [16, 19, 0.9], [-17, 5, 1.0]]) { const p = P(u, v, 0); const h = H(p[0], p[2]); if (h > 0.5) trees.push([p[0], h, p[2], s, 3]); }
  reserve.push({ x: P(0, 10, 0)[0], z: P(0, 10, 0)[2], hw: 26, hd: 40, angle: F.yaw + Math.PI / 2 });
  return F;
}

// ---------------------------------------------------------------- pose 9: cliff-top lookout and valley lights
export function cragLookout(env) {
  const { M, H, Hf, col, lantern, lights, reserve, pavilion, R } = env;
  const F = frame(POSES[8]);
  const g = H(F.x, F.z);
  const ty = g + 0.6;
  const P = F.P;
  // stone platform at the cliff edge with a balustrade on the valley side
  M.set(C.stone, PAT.STONE);
  M.box(P(0, -1, g - 6), 7, 6, 6.6, F.yaw);
  col(...P(0, -1, g - 2.7), 7, 3.3, 6, F.yaw);
  for (const u of [-6.5, 6.5]) { M.set(C.stone, PAT.PLAIN); M.box(P(u, 4.6, ty), 0.25, 0.25, 1.15, F.yaw); }
  M.set(C.stone, PAT.STONE);
  M.box(P(0, 4.6, ty + 0.75), 0.16, 6.7, 0.16, F.yaw);
  M.box(P(0, 4.6, ty), 0.12, 6.7, 0.25, F.yaw);
  for (let u = -5.5; u <= 5.6; u += 1.1) { M.set(C.stone, PAT.PLAIN); M.box(P(u, 4.6, ty + 0.25), 0.06, 0.06, 0.5, F.yaw); }
  col(...P(0, 4.6, ty + 0.5), 0.2, 0.5, 6.7, F.yaw);
  lantern(P(-6.5, 4.6, ty + 1.6), 1.1, true); lantern(P(6.5, 4.6, ty + 1.6), 1.1, true);
  // small pavilion behind the camera and a stone stele
  pavilion(P(-4.5, -9, g), 4, 2.6, 0.5);
  M.set(C.dstone, PAT.PLAIN);
  M.box(P(5.2, -3.5, ty), 0.6, 0.18, 2.2, F.yaw);
  reserve.push({ x: F.x, z: F.z, hw: 16, hd: 16, angle: F.yaw });
  // road winding down the valley with lamps, and villages of lit windows
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
  // glows are small emissive octahedra (sub-pixel lamps would vanish at these distances)
  for (const [x, y, z, s, r, gg, b] of glow) {
    M.set([r, gg, b], PAT.PLAIN, 26);
    M.prism([x, y, z], 0.01, 4, -s, 0, 0, false, s);
    M.prism([x, y, z], s, 4, 0, s, 0, false, 0.01);
  }
  return glow.length;
}

// ---------------------------------------------------------------- hillside life inside the city
// Chongqing-style hamlets on the forested slopes between the districts: a few houses (or a small temple) on
// stone terraces along the contour, a lit stairway running down the slope, lamp posts along the steps.
export function hillsideLife(env, world) {
  const { M, H, col, lantern, lights, reserve, R } = env;
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
