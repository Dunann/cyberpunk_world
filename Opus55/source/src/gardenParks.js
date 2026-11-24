// Structures of the land-use plan's designed parks (plan.js, planPark.js), built into the garden's static mesh
// after all of the garden's own content (nothing of the garden changes and no random stream is used):
//  - 6 m pole lamps along every walk (their light pools are baked into the park light map);
//  - lantern posts every 7 m along Lantern Park's river and cross walks (the red lanterns themselves are drawn
//    with the instanced lanterns of the signs module);
//  - paifang gates where the cross walks reach the inland edge of the park;
//  - open pavilions with lit eaves on the plazas (the river plazas' pavilions carry one real light each).
// Everything stays below 15 m.

import { PAT } from './gardenMesh.js';

const PIECE = 160;          // static-mesh pieces (culling) of this size (m)
const FAR = 2400;           // pieces are drawn up to this distance (m)
export const PARK_REAL_LIGHTS = 30;

// env: { M, world, C, col, lantern(p, s, light, c), pavilion(c, sides, r, plat, lantern) }
export function parkStructures(env) {
  const { M, world, C } = env;
  const L = world.plan && world.plan.layout;
  if (!L) return { lamps: 0, posts: 0, gates: 0, pavilions: 0, lights: 0 };
  const H = (x, z) => world.heightAt(x, z);
  const items = [];
  for (const p of L.lamps) items.push({ x: p.x, z: p.z, k: 0, p });
  for (const p of L.posts) items.push({ x: p.x, z: p.z, k: 1, p });
  for (const p of L.gates) items.push({ x: p.x, z: p.z, k: 2, p });
  for (const p of L.pavilions) items.push({ x: p.x, z: p.z, k: 3, p });
  const cell = (o) => Math.floor(o.x / PIECE) * 4096 + Math.floor(o.z / PIECE);
  items.sort((a, b) => cell(a) - cell(b) || a.k - b.k);
  let lights = 0, cur = null;
  for (let i = 0; i < items.length; i++) {
    const o = items[i], c = cell(o);
    if (c !== cur) { M.begin(); cur = c; }
    const p = o.p;
    if (o.k === 0) poleLamp(M, p.x, H(p.x, p.z), p.z, p.style === 1);
    else if (o.k === 1) lanternPost(M, C, p.x, H(p.x, p.z), p.z, p.nx, p.nz);
    else if (o.k === 2) gate(M, C, p, env.lantern);
    else {
      const allow = p.light && lights < PARK_REAL_LIGHTS;
      if (allow) lights++;
      const lan = (q, s, light, col) => env.lantern(q, s, light && allow, col);
      env.pavilion([p.x, p.y, p.z], p.sides, p.r, 0.35, lan);
      litEaves(M, p.x, p.y + 0.35, p.z, p.sides, p.r);
    }
    // close a piece at the end of each cell
    const next = items[i + 1];
    if (!next || cell(next) !== c) M.end(FAR);
  }
  return { lamps: L.lamps.length, posts: L.posts.length, gates: L.gates.length, pavilions: L.pavilions.length, lights };
}

// Slim dark pole with a hexagonal palace-lantern head (warm in Lantern Park, cool white in the garden).
function poleLamp(M, x, y, z, warm) {
  M.set([0.035, 0.033, 0.035], PAT.PLAIN);
  M.prism([x, y, z], 0.18, 6, -0.4, 0.5, 0, true, 0.12);
  M.box([x, y, z], 0.06, 0.06, 5.55);
  M.set(warm ? [1.0, 0.72, 0.42] : [0.8, 0.95, 1.0], PAT.PLAIN, 6.5);
  M.prism([x, y, z], 0.2, 6, 5.5, 6.05, 0, false, 0.26);
  M.set([0.03, 0.03, 0.035], PAT.TILE);
  M.prism([x, y, z], 0.36, 6, 6.05, 6.3, 0, true, 0.06);
}

// Red-lacquered post with a short arm toward the walk; the lantern hangs from the arm's end.
function lanternPost(M, C, x, y, z, nx, nz) {
  M.set(C.wood, PAT.WOOD);
  M.box([x, y, z], 0.055, 0.055, 2.95);
  const a = Math.atan2(nz, nx);
  M.box([x + nx * 0.25, y + 2.8, z + nz * 0.25], 0.28, 0.03, 0.06, a);
  M.set(C.gold, PAT.PLAIN, 1.2);
  M.prism([x, y + 2.95, z], 0.08, 6, 0, 0.12, 0, true, 0.02);
}

// Paifang: three bays (tall middle, lower sides) of red columns on stone plinths, beams with a lit name board,
// tiled roofs with gold-lit eaves, a lantern under each side of the main beam.
function gate(M, C, g, lantern) {
  const ux = -g.dz, uz = g.dx;                 // across the walk
  const ang = Math.atan2(uz, ux);
  const P = (u, y, v = 0) => [g.x + ux * u + g.dx * v, g.y + y, g.z + uz * u + g.dz * v];
  const half = g.span / 2, side = half + 2.0;
  for (const u of [-side, -half, half, side]) {
    const tall = Math.abs(u) < half + 0.1;
    M.set(C.stone, PAT.STONE);
    M.box(P(u, -0.6), 0.42, 0.42, 1.2, ang);
    M.set(C.wood, PAT.WOOD);
    M.prism(P(u, 0.6), 0.2, 8, 0, tall ? 5.0 : 3.7, 0, false);
  }
  // beams and the name board
  M.set(C.wood, PAT.WOOD);
  M.box(P(0, 4.25), half + 0.3, 0.17, 0.32, ang);
  M.box(P(0, 5.25), half + 0.3, 0.17, 0.36, ang);
  for (const s of [-1, 1]) M.box(P(s * (half + 1.0), 3.95), 1.05, 0.15, 0.3, ang);
  M.set(C.gold, PAT.PLAIN, 2.2);
  M.box(P(0, 4.6), 1.1, 0.12, 0.55, ang);
  // roofs: main bay and the two side bays
  roofBar(M, C, P, 0, half + 1.5, 6.6, 1.3);
  for (const s of [-1, 1]) roofBar(M, C, P, s * (half + 1.0), 1.35, 5.05, 1.0);
  for (const s of [-1, 1]) lantern(P(s * half * 0.55, 3.75), 0.85, false);
}

// Hip roof of a gate bay centred at u0 (half length hl), ridge at height yr, eaves hd either side; upturned ends
// and a gold-lit eave line.
function roofBar(M, C, P, u0, hl, yr, hd) {
  const ye = yr - 0.75;
  const lift = 0.35;
  M.set(C.tile, PAT.TILE);
  for (const s of [-1, 1]) {
    const e0 = P(u0 - hl, ye + lift, s * hd), e1 = P(u0 + hl, ye + lift, s * hd);
    const m0 = P(u0 - hl + 0.6, ye, s * hd), m1 = P(u0 + hl - 0.6, ye, s * hd);
    const r0 = P(u0 - hl + 0.7, yr, 0), r1 = P(u0 + hl - 0.7, yr, 0);
    M.quad(m0, m1, r1, r0);
    M.quad(e0, m0, r0, r0);
    M.quad(m1, e1, r1, r1);
  }
  for (const s of [-1, 1]) {
    const a = P(u0 + s * hl, ye + lift, -hd), b = P(u0 + s * hl, ye + lift, hd), r = P(u0 + s * (hl - 0.7), yr, 0);
    M.quad(a, b, r, r);
  }
  M.set(C.tile, PAT.PLAIN);
  const ra = P(u0 - hl + 0.7, yr, 0), rb = P(u0 + hl - 0.7, yr, 0);
  M.quad([ra[0], ra[1] - 0.05, ra[2]], [rb[0], rb[1] - 0.05, rb[2]], [rb[0], rb[1] + 0.22, rb[2]], [ra[0], ra[1] + 0.22, ra[2]]);
  // lit eave lines (both sides)
  M.set([1.0, 0.62, 0.26], PAT.PLAIN, 3.5);
  for (const s of [-1, 1]) {
    const a = P(u0 - hl + 0.6, ye - 0.02, s * (hd + 0.02)), b = P(u0 + hl - 0.6, ye - 0.02, s * (hd + 0.02));
    M.quad(a, b, [b[0], b[1] - 0.09, b[2]], [a[0], a[1] - 0.09, a[2]]);
  }
}

// Gold LED band just outside a pavilion's eave ring (see garden._pavilion: eave radius r + 1.4 at 3.25 m).
function litEaves(M, x, fy, z, sides, r) {
  M.set([1.0, 0.62, 0.26], PAT.PLAIN, 3.5);
  M.prism([x, fy, z], r + 1.46, sides, 3.12, 3.24, Math.PI / sides, false, r + 1.46);
}
