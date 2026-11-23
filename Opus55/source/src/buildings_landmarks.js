// Landmark buildings (bespoke part assemblies), the Hongyadong-style stilt complex, the steppe night market,
// and lot preparation around the verification viewpoints.

import { FLAG, MAT } from './buildings_wgsl.js';
import { Builder, PAL, gerHut, minaret } from './buildings_gen.js';
import { DT } from './world.js';

const TAU = Math.PI * 2;
const RED = [1, 0.08, 0.05];
const av = (B, x, y, z, s) => B.prop({ x, y0: y, z, hw: 0.6, hd: 0.6, h: 0.9, mat: MAT.EMIT, col: RED, param: 45, winW: 1, seed: s, flags: FLAG.BOTTOM });

// ------------------------------------------------------------------ lot preparation

// Keeps the verification viewpoints usable: removes lots that contain a street-level camera, clears the view
// wedge at the Bund, trims lots along the hillside street view and turns the steppe market lots into a plaza.
// Lots are edited in place in world.lots so other modules (signs) see the final footprints.
export function prepareLots(world) {
  const lots = world.lots;
  const poses = world.poses;
  const keep = [];
  const market = [];
  const inLot = (L, x, z, m) => {
    const c = Math.cos(L.angle), s = Math.sin(L.angle);
    const dx = x - L.x, dz = z - L.z;
    const lx = dx * c + dz * s, lz = -dx * s + dz * c;
    return Math.abs(lx) < L.w / 2 + m && Math.abs(lz) < L.d / 2 + m;
  };
  const cams = poses.map((p) => ({ ...p.resolved, g: world.heightAt(p.resolved.x, p.resolved.z), tx: p.target[0], tz: p.target[2] }));
  const P1 = cams[0];
  for (const L of lots) {
    let drop = false;
    // Nanshan overlook (pose 1): keep near rooftops below the sight line to the skyline
    const d1 = Math.hypot(L.x - P1.x, L.z - P1.z);
    if (d1 < 1800) L.maxTop = Math.min(L.maxTop || 1e9, P1.y - 4 - d1 * 0.0175);
    for (let i = 0; i < cams.length; i++) {
      const C = cams[i];
      const low = C.y - C.g < 30;
      if (inLot(L, C.x, C.z, 0.5)) {
        if (low) drop = true; else L.maxTop = Math.min(L.maxTop || 1e9, C.y - 60);
      }
    }
    // Bund viewpoint (pose 2): keep the river and the CBD skyline in view
    {
      const C = cams[1];
      if (L.type === DT.BUND && L.waterDist < 120) {
        const dx = L.x - C.x, dz = L.z - C.z;
        const d = Math.hypot(dx, dz);
        if (d < 110) drop = true;
      }
    }
    // steppe market (pose 6): lots crossed by the view toward the dome become a market plaza
    {
      const C = cams[5];
      const dx = C.tx - C.x, dz = C.tz - C.z, len = Math.hypot(dx, dz);
      for (let t = 0; t < 170 && !drop; t += 4) {
        if (inLot(L, C.x + dx / len * t, C.z + dz / len * t, 4)) { drop = true; market.push(L); }
      }
    }
    if (!drop) keep.push(L);
  }
  // hillside street (pose 3): trim lots so a pedestrian strip runs along the view
  {
    const C = cams[2];
    const dx = C.tx - C.x, dz = C.tz - C.z, len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    for (const L of keep) {
      if (L.type !== DT.HILLSIDE) continue;
      const c = Math.cos(L.angle), s = Math.sin(L.angle);
      let hit = false;
      for (let t = 0; t < 90; t += 3) if (inLot(L, C.x + ux * t, C.z + uz * t, 4.5)) { hit = true; break; }
      if (!hit) continue;
      // lot-local corridor line
      const ax = C.x - L.x, az = C.z - L.z;
      const lx0 = ax * c + az * s, lz0 = -ax * s + az * c;
      const dlz = -ux * s + uz * c;
      const dlx = ux * c + uz * s;
      if (Math.abs(dlx) > Math.abs(dlz) * 3) {
        // corridor runs along local x: cut the lot in z (line position at the lot center)
        const lzc = lz0 - dlz * lx0 / dlx;
        const half = 4.5;
        const lo = -L.d / 2, hi = L.d / 2;
        const keepLow = (lzc - half) - lo, keepHigh = hi - (lzc + half);
        if (Math.max(keepLow, keepHigh) < 8) { L.dead = true; continue; }
        let nlo, nhi;
        if (keepLow > keepHigh) { nlo = lo; nhi = lzc - half; } else { nlo = lzc + half; nhi = hi; }
        const mid = (nlo + nhi) / 2;
        L.x += -s * mid; L.z += c * mid;
        L.d = nhi - nlo;
        L.trimmed = true;
      } else L.dead = true;
    }
  }
  lots.length = 0;
  for (const L of keep) if (!L.dead) lots.push(L);
  return { market };
}

// ------------------------------------------------------------------ market plaza (pose 6)

export function genMarket(B, R, world, market) {
  const C = world.poses[5].resolved;
  const T = world.poses[5].target;
  const dx = T[0] - C.x, dz = T[2] - C.z, len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len, px = -uz, pz = ux;
  const ang = Math.atan2(uz, ux);
  const fabric = [[0.7, 0.12, 0.1], [0.1, 0.35, 0.6], [0.75, 0.55, 0.12], [0.15, 0.45, 0.3], [0.55, 0.15, 0.45]];
  for (let t = 14; t < 175; t += 5.5) {
    for (const side of [-1, 1]) {
      if (R() < 0.12) continue;
      const off = side * (5.5 + R() * 1.2);
      const x = C.x + ux * t + px * off, z = C.z + uz * t + pz * off;
      if (world.waterDist(x, z) < 8) continue;
      const g = world.heightAt(x, z);
      const a = ang;
      // counter, canopy, goods, lantern
      B.prop({ x, y0: g - 0.5, z, a, hw: 2.1, hd: 1.0, h: 1.5, mat: MAT.CONCRETE, col: [0.3, 0.22, 0.16] });
      const [cx, cz] = [x - px * side * 0.3, z - pz * side * 0.3];
      B.part({ x: cx, y0: g + 2.35, z: cz, a, hw: 1.9, hd: 1.3, h: 0.7, taper: 0.5, mat: MAT.CONCRETE, col: fabric[Math.floor(R() * fabric.length)], param: 2.2, flags: FLAG.BOTTOM });
      for (const o of [-2.2, 2.2]) B.prop({ x: x + ux * o, y0: g, z: z + uz * o, hw: 0.07, h: 2.6, kind: 2, prm: 8, mat: MAT.METAL, col: [0.2, 0.2, 0.2] });
      for (let k = 0; k < 3; k++) B.prop({ x: x + ux * (k - 1) * 1.2, y0: g + 1.0, z: z + uz * (k - 1) * 1.2, a, hw: 0.3 + R() * 0.2, hd: 0.3, h: 0.25 + R() * 0.3, mat: MAT.EMIT, col: [[1, 0.5, 0.2], [0.9, 0.8, 0.4], [1, 0.3, 0.3], [0.5, 0.9, 0.3]][k], param: 0.15 + R() * 0.2, flags: FLAG.BOTTOM });
      B.prop({ x: x - px * side * 1.2, y0: g + 1.85, z: z - pz * side * 1.2, hw: 0.24, h: 0.5, kind: 2, prm: 16, prof: 2, mat: MAT.EMIT, col: [1, 0.55, 0.18], param: 6, winW: 2 });
      B.slot(cx - px * side * 1.7, g + 3.2, cz - pz * side * 1.7, -px * side, -pz * side, 3.5, 0.8, false, DT.STEPPE);
    }
    // lantern string across the lane
    if (Math.round(t / 5.5) % 3 === 0) {
      const g = world.heightAt(C.x + ux * t, C.z + uz * t);
      for (let k = -6; k <= 6; k++) {
        const o = k * 0.95;
        const sag = 1.2 * (1 - (o / 6.5) * (o / 6.5));
        B.prop({ x: C.x + ux * t + px * o, y0: g + 5.2 - sag, z: C.z + uz * t + pz * o, hw: 0.2, h: 0.36, kind: 2, prm: 16, prof: 2, mat: MAT.EMIT, col: k % 2 ? [1, 0.18, 0.08] : [1, 0.62, 0.22], param: 6, winW: 2 });
      }
      if (t < 150) B.light(C.x + ux * t, g + 4.2, C.z + uz * t, 14, [1, 0.6, 0.3], 26, 4);
    }
  }
  // gers and tents around the plaza edges
  for (const L of market) {
    for (let k = 0; k < 4; k++) {
      const lx = (R() - 0.5) * L.w * 0.8, lz = (R() - 0.5) * L.d * 0.8;
      const [x, z] = Builder.tw(L.x, L.z, L.angle, lx, lz);
      const d = Math.abs((x - C.x) * px + (z - C.z) * pz);
      if (d < 13) continue;
      gerHut(B, R, x, z, world.heightAt(x, z) - 0.2, 3 + R() * 2);
    }
  }
}

// ------------------------------------------------------------------ CBD landmarks

function twist(B, R, L, g) {
  const x = L.x, z = L.z, H = 560;
  B.part({ x, y0: g - 4, z, hw: 62, hd: 62, h: 28, kind: 3, prm: 3.14, mat: MAT.GLASS, col: [0.3, 0.5, 0.6], floorH: 6, winW: 2, baseY: g, param: 0.6, flags: FLAG.EDGE, solid: true });
  B.part({ x, y0: g + 24, z, a: 0.3, hw: 40, hd: 40, h: H, kind: 3, prm: 3.14, taper: 0.58, twist: 2.0, mat: MAT.GLASS, col: [0.35, 0.55, 0.68], floorH: 4.4, winW: 1.6, baseY: g, param: 0.22, flags: FLAG.LED | FLAG.EDGE, seed: 38, solid: true });
  // spiral of lit floor rings every 15 floors (sky lobbies)
  for (let i = 1; i < 9; i++) {
    const t = i / 9;
    const s = 1 - 0.42 * t;
    B.part({ x, y0: g + 24 + H * t - 1, z, a: 0.3 + 2.0 * t, hw: 40 * s + 0.35, hd: 40 * s + 0.35, h: 1.2, kind: 3, prm: 3.14, mat: MAT.EMIT, col: [0.5, 0.85, 1], param: 3, flags: FLAG.BOTTOM | FLAG.NOTOP });
  }
  const top = g + 24 + H;
  const s = 0.58;
  B.part({ x, y0: top, z, a: 2.3, hw: 40 * s, hd: 40 * s, h: 32, kind: 3, prm: 3.14, taper: 0.7, mat: MAT.CROWN, col: [0.55, 0.85, 1], param: 3.5, flags: FLAG.NOTOP });
  B.part({ x, y0: top + 32, z, hw: 5, hd: 5, h: 36, kind: 2, prm: 8, taper: 0.05, mat: MAT.METAL, col: [0.75, 0.78, 0.8] });
  av(B, x, top + 68, z, 1);
  B.tops.push({ x, y: top + 32, z, cbd: true });
  B.led.push({ x, z, y0: g + 24, y1: top, r: 40 });
  B.light(x + 70, g + 3, z, 40, [0.5, 0.8, 1], 120, 3);
  B.light(x - 70, g + 3, z, 40, [0.5, 0.8, 1], 120, 3);
}

function twin(B, R, L, g) {
  const sep = 58, a = 0.35;
  const ca = Math.cos(a), sa = Math.sin(a);
  const tiers = [[0, 250, 23], [250, 310, 20.5], [310, 350, 17.5], [350, 375, 14.5], [375, 393, 11.5]];
  for (const sgn of [-1, 1]) {
    const x = L.x + ca * sep / 2 * sgn, z = L.z + sa * sep / 2 * sgn;
    for (const [y0, y1, r] of tiers) {
      const yb = y0 === 0 ? g - 4 : g + y0;
      const h = g + y1 - yb;
      const common = { x, y0: yb, z, h, mat: MAT.GLASS, col: [0.62, 0.66, 0.72], floorH: 4.0, winW: 1.4, baseY: g, param: 0.4, flags: FLAG.EDGE, seed: 0.5 + sgn * 0.2, solid: true };
      B.part({ ...common, a, hw: r, hd: r });
      B.part({ ...common, a: a + Math.PI / 4, hw: r, hd: r, solid: false });
      B.part({ ...common, hw: r * 1.04, hd: r * 1.04, kind: 2, prm: 48, solid: false, flags: 0 });
      // steel band at each setback
      B.part({ x, y0: g + y1 - 1.2, z, hw: r * 1.16, hd: r * 1.16, h: 1.4, kind: 2, prm: 48, mat: MAT.EMIT, col: [0.85, 0.9, 1], param: 2.5, flags: FLAG.BOTTOM | FLAG.NOTOP });
    }
    B.part({ x, y0: g + 393, z, hw: 10, hd: 10, h: 18, kind: 2, prm: 16, taper: 0.55, mat: MAT.CROWN, col: [0.8, 0.9, 1], param: 3 });
    B.part({ x, y0: g + 411, z, hw: 2.2, hd: 2.2, h: 41, kind: 2, prm: 8, taper: 0.06, mat: MAT.METAL, col: [0.8, 0.82, 0.85] });
    // pinnacle rings
    for (let k = 0; k < 4; k++) B.part({ x, y0: g + 412 + k * 7, z, hw: 3 - k * 0.5, hd: 3 - k * 0.5, h: 0.8, kind: 2, prm: 16, mat: MAT.EMIT, col: [0.85, 0.92, 1], param: 4 });
    av(B, x, g + 452, z, 5 + sgn);
    B.tops.push({ x, y: g + 393, z, cbd: true });
    B.light(x + 30 * sgn * ca, g + 3, z + 30 * sgn * sa, 36, [0.85, 0.9, 1], 100, 3);
  }
  // skybridge at levels 41-42 with struts
  const by = g + 170;
  B.part({ x: L.x, y0: by, z: L.z, a, hw: sep / 2, hd: 3, h: 9, mat: MAT.GLASS, col: [0.7, 0.75, 0.8], floorH: 4.5, winW: 1.5, baseY: g, param: 0.9, flags: FLAG.BOTTOM | FLAG.EDGE });
  for (const sgn of [-1, 1]) {
    const x0 = L.x + ca * (sep / 2 - 14) * sgn, z0 = L.z + sa * (sep / 2 - 14) * sgn;
    B.part({ x: x0, y0: g + 120, z: z0, hw: 1.2, hd: 1.2, h: 50, kind: 2, prm: 8, lx: -ca * (sep / 2 - 14) * sgn, lz: -sa * (sep / 2 - 14) * sgn, mat: MAT.METAL, col: [0.7, 0.72, 0.75] });
  }
}

function truss(B, R, L, g) {
  const x = L.x, z = L.z, a = 0.2, s = 26;
  B.part({ x, y0: g - 4, z, a, hw: s + 12, hd: s + 12, h: 22, mat: MAT.STONE, col: [0.45, 0.45, 0.47], floorH: 5, winW: 3, baseY: g, param: 0.6, flags: FLAG.FLOOD, solid: true });
  // four triangular quadrants rising to different heights, each capped by a sloped wedge
  const hs = [330, 270, 205, 140];
  for (let q = 0; q < 4; q++) {
    const qa = a + q * Math.PI / 2;
    const [cx, cz] = Builder.tw(x, z, qa, s / 2, 0);
    const h = hs[q];
    B.part({ x: cx, y0: g + 18, z: cz, a: qa, hw: s / 2, hd: s, h: h - 18, kind: 4, mat: MAT.TRUSS, col: [0.3, 0.45, 0.6], floorH: 4, winW: 1.6, baseY: g, param: 0.35, flags: FLAG.LED, solid: q === 0 });
    B.part({ x: cx, y0: g + h, z: cz, a: qa, hw: s / 2, hd: s, h: 30, kind: 4, taper: 0.02, lx: -Math.cos(qa) * s * 0.33, lz: -Math.sin(qa) * s * 0.33, mat: MAT.TRUSS, col: [0.35, 0.5, 0.65], floorH: 4, winW: 1.6, baseY: g, param: 0.2, flags: FLAG.CROWNLIT });
  }
  B.led.push({ x, z, y0: g + 18, y1: g + 330, r: s });
  // twin masts
  for (const o of [-6, 6]) {
    const [mx, mz] = Builder.tw(x, z, a, s / 2, o);
    B.part({ x: mx, y0: g + 345, z: mz, hw: 0.9, hd: 0.9, h: 40, kind: 2, prm: 8, taper: 0.3, mat: MAT.METAL, col: [0.8, 0.8, 0.82] });
    av(B, mx, g + 385, mz, o);
  }
  B.tops.push({ x, y: g + 345, z, cbd: true });
  B.light(x + 45, g + 3, z, 34, [0.7, 0.85, 1], 90, 3);
}

function tvtower(B, R, L, g) {
  const x = L.x, z = L.z;
  const pink = [1, 0.2, 0.62];
  const col = [0.75, 0.75, 0.8];
  // three vertical columns from ground to the upper sphere
  for (let k = 0; k < 3; k++) {
    const ang = k * TAU / 3 + 0.5;
    const cx = x + Math.cos(ang) * 7, cz = z + Math.sin(ang) * 7;
    B.part({ x: cx, y0: g - 2, z: cz, hw: 4.5, hd: 4.5, h: 262, kind: 2, prm: 24, mat: MAT.METAL, col, solid: true });
    // inclined legs
    const lx0 = x + Math.cos(ang + Math.PI / 3) * 48, lz0 = z + Math.sin(ang + Math.PI / 3) * 48;
    B.part({ x: lx0, y0: g - 2, z: lz0, hw: 3.6, hd: 3.6, h: 92, kind: 2, prm: 24, lx: (x - lx0) * 0.78, lz: (z - lz0) * 0.78, mat: MAT.METAL, col });
    // small spheres between the big ones
    for (const sy of [160, 186, 212, 238]) B.part({ x: cx, y0: g + sy - 6, z: cz, hw: 6, hd: 6, h: 12, kind: 2, prm: 32, prof: 2, mat: MAT.TV, col: pink, param: 1.2, flags: FLAG.NOTOP });
    B.light(lx0, g + 4, lz0, 40, pink, 160, 4);
  }
  B.part({ x, y0: g + 88, z, hw: 25, hd: 25, h: 50, kind: 2, prm: 48, prof: 2, mat: MAT.TV, col: pink, param: 1.6, flags: FLAG.NOTOP });
  B.part({ x, y0: g + 112, z, hw: 26, hd: 26, h: 2, kind: 2, prm: 48, mat: MAT.EMIT, col: [1, 0.5, 0.85], param: 4, flags: FLAG.BOTTOM });
  B.part({ x, y0: g + 262, z, hw: 17, hd: 17, h: 34, kind: 2, prm: 48, prof: 2, mat: MAT.TV, col: pink, param: 1.6, flags: FLAG.NOTOP });
  B.part({ x, y0: g + 296, z, hw: 4, hd: 4, h: 40, kind: 2, prm: 16, mat: MAT.METAL, col });
  B.part({ x, y0: g + 334, z, hw: 7.5, hd: 7.5, h: 15, kind: 2, prm: 32, prof: 2, mat: MAT.TV, col: pink, param: 2, flags: FLAG.NOTOP });
  B.part({ x, y0: g + 349, z, hw: 2.6, hd: 2.6, h: 121, kind: 2, prm: 12, taper: 0.08, mat: MAT.METAL, col: [0.85, 0.85, 0.9] });
  for (let k = 0; k < 6; k++) B.part({ x, y0: g + 360 + k * 16, z, hw: 2.7 - k * 0.3, hd: 2.7 - k * 0.3, h: 1.2, kind: 2, prm: 16, mat: MAT.EMIT, col: [1, 0.3, 0.75], param: 6, flags: FLAG.BOTTOM });
  av(B, x, g + 470, z, 9);
  B.tops.push({ x, y: g + 296, z, cbd: true, tv: true });
}

function jinCrown(B, R, L, g) {
  const x = L.x, z = L.z, a = 0.0;
  B.part({ x, y0: g - 4, z, a, hw: 48, hd: 34, h: 30, kind: 1, prm: 0.2, mat: MAT.STONE, col: [0.5, 0.48, 0.45], floorH: 6, winW: 3, baseY: g, param: 0.6, flags: FLAG.FLOOD, solid: true });
  // tiered shaft: section heights shrink toward the top (pagoda rhythm)
  let y = g + 26, s = 27, h = 46;
  const gold = [1, 0.72, 0.3];
  for (let i = 0; i < 13; i++) {
    B.part({ x, y0: y, z, a, hw: s, hd: s, h, kind: 1, prm: 0.3, mat: MAT.GLASS, col: [0.55, 0.58, 0.6], floorH: 4.0, winW: 1.5, baseY: g, param: 0.4, flags: i > 9 ? FLAG.CROWNLIT : FLAG.LED, seed: 300 + i, solid: i < 3 });
    y += h;
    // flared eave band at each tier
    B.part({ x, y0: y - 1.0, z, a, hw: s + 1.6, hd: s + 1.6, h: 1.6, kind: 1, prm: 0.3, prof: 6, taper: 1.06, mat: MAT.EMIT, col: gold, param: 2.6, flags: FLAG.BOTTOM });
    s *= 0.93; h *= 0.83;
  }
  B.led.push({ x, z, y0: g + 26, y1: y, r: 27 });
  // lit crown: octagonal lantern, stepped rings, spire
  B.part({ x, y0: y, z, a: a + 0.39, hw: s * 0.95, hd: s * 0.95, h: 30, kind: 2, prm: 8, taper: 0.75, mat: MAT.CROWN, col: gold, param: 4 });
  let cy = y + 30, cs = s * 0.72;
  for (let k = 0; k < 4; k++) {
    B.part({ x, y0: cy, z, a: a + 0.39, hw: cs, hd: cs, h: 7, kind: 2, prm: 8, taper: 0.8, mat: MAT.CROWN, col: [1, 0.85, 0.5], param: 3 + k });
    cy += 7; cs *= 0.75;
  }
  B.part({ x, y0: cy, z, hw: 2.2, hd: 2.2, h: g + 520 - cy, kind: 2, prm: 8, taper: 0.05, mat: MAT.METAL, col: [0.85, 0.8, 0.6] });
  av(B, x, g + 520, z, 21);
  B.tops.push({ x, y, z, cbd: true });
  B.light(x, g + 3, z + 45, 36, gold, 100, 3);
}

// ------------------------------------------------------------------ peninsula landmarks

function raffles(B, R, L, world) {
  // row of four towers along the peninsula axis (+x toward the tip) carrying a horizontal conservatory
  const xs = [-185, -125, -65, -5];   // relative to the site (the plateau ends near x = 230)
  const glass = [0.4, 0.55, 0.62];
  const towerAt = (x, z, top, w, conserv) => {
    const g = world.heightAt(x, z);
    B.part({ x, y0: g - 6, z, a: 0, hw: w, hd: w * 0.8, h: top - g + 6, kind: 0, prm: 0.35, mat: MAT.GLASS, col: glass, floorH: 4, winW: 1.5, baseY: g, param: 0.4, flags: FLAG.EDGE | (conserv ? 0 : FLAG.CROWNLIT), seed: x + z, solid: true });
    return top;
  };
  let gmax = 0;
  for (const dx of xs) gmax = Math.max(gmax, world.heightAt(L.x + dx, L.z));
  const H0 = 245;
  const cy = gmax + H0;
  for (const dx of xs) towerAt(L.x + dx, L.z, cy, 16, true);
  // horizontal glass conservatory
  B.part({ x: L.x - 95, y0: cy, z: L.z, a: 0, hw: 112, hd: 16, h: 24, kind: 0, prm: 0.85, mat: MAT.GLASS, col: [0.5, 0.8, 0.7], floorH: 6, winW: 3, baseY: cy, param: 0.85, flags: FLAG.EDGE | FLAG.BOTTOM | FLAG.LED });
  B.part({ x: L.x - 95, y0: cy - 1.2, z: L.z, a: 0, hw: 113, hd: 17, h: 1.2, mat: MAT.EMIT, col: [0.4, 0.9, 1], param: 3, flags: FLAG.BOTTOM });
  B.led.push({ x: L.x - 95, z: L.z, y0: cy, y1: cy + 24, r: 112 });
  // two taller flanking towers at the tip
  for (const sz of [-1, 1]) {
    const x = L.x - 70, z = L.z + (sz < 0 ? -110 : 105);
    const top = towerAt(x, z, world.heightAt(x, z) + 300, 20, false);
    B.part({ x, y0: top, z, hw: 3, hd: 3, h: 40, kind: 2, prm: 8, taper: 0.1, mat: MAT.METAL, col: [0.8, 0.8, 0.85] });
    av(B, x, top + 40, z, sz * 3);
    B.tops.push({ x, y: top, z });
  }
  for (const dx of xs) B.light(L.x + dx, gmax + 3, L.z + 22, 30, [0.6, 0.9, 1], 70, 3);
}

function ridgeTower(B, R, L, world) {
  const x = L.x, z = L.z, g = world.heightAt(x, z);
  B.part({ x, y0: g - 8, z, a: 0.32, hw: 34, hd: 34, h: 26, kind: 1, prm: 0.3, mat: MAT.STONE, col: [0.42, 0.42, 0.45], floorH: 5, winW: 3, baseY: g, param: 0.6, flags: FLAG.FLOOD, solid: true });
  const tw = { x, z, a: 0.32 };
  B.part({ ...tw, y0: g + 18, hw: 24, hd: 24, h: 200, kind: 1, prm: 0.32, mat: MAT.GLASS, col: [0.3, 0.42, 0.55], floorH: 4, winW: 1.5, baseY: g, param: 0.4, flags: FLAG.EDGE, solid: true });
  B.part({ ...tw, y0: g + 218, hw: 20, hd: 20, h: 82, kind: 1, prm: 0.32, taper: 0.75, mat: MAT.GLASS, col: [0.3, 0.42, 0.55], floorH: 4, winW: 1.5, baseY: g, param: 0.4, flags: FLAG.EDGE | FLAG.CROWNLIT });
  B.part({ ...tw, y0: g + 300, hw: 15, hd: 15, h: 14, kind: 1, prm: 0.32, taper: 0.8, mat: MAT.CROWN, col: [1, 0.3, 0.6], param: 4 });
  B.part({ x, y0: g + 314, z, hw: 1.5, hd: 1.5, h: 26, kind: 2, prm: 8, taper: 0.1, mat: MAT.METAL, col: [0.8, 0.8, 0.85] });
  av(B, x, g + 340, z, 4);
  B.light(x, g + 4, z + 40, 30, [1, 0.4, 0.7], 70, 3);
}

// Hongyadong-style stilt complex stacked down the Jade River bank.
function stilts(B, R, L, world) {
  // find the steepest stretch of bank within 900 m of the hint point
  let best = null;
  for (let x = L.x - 900; x <= L.x + 900; x += 20) for (let z = L.z - 900; z <= L.z + 900; z += 20) {
    const d = world.waterDist(x, z);
    if (d < 7 || d > 13) continue;
    const e = 3;
    let gx = world.waterDist(x + e, z) - world.waterDist(x - e, z), gz = world.waterDist(x, z + e) - world.waterDist(x, z - e);
    const gl = Math.hypot(gx, gz) || 1; gx /= gl; gz /= gl;
    const rise = world.heightAt(x + gx * 55, z + gz * 55) - world.heightAt(x, z);
    const score = rise - Math.hypot(x - L.x, z - L.z) * 0.012;
    if (!best || score > best.score) best = { x, z, gx, gz, score };
  }
  if (!best) return;
  B.sites.stilts = { x: best.x, z: best.z, nx: -best.gx, nz: -best.gz };
  // walk along the bank (iso-line of water distance ~10 m) in both directions
  const cols = [];
  for (const dir of [1, -1]) {
    let x = best.x, z = best.z, gx = best.gx, gz = best.gz;
    for (let i = 0; i < 9; i++) {
      if (dir === 1 || i > 0) cols.push({ x, z, gx, gz });
      // step along the bank tangent
      x += -gz * 17 * dir; z += gx * 17 * dir;
      // re-project to water distance ~10
      for (let it = 0; it < 4; it++) {
        const e = 3;
        let nx = world.waterDist(x + e, z) - world.waterDist(x - e, z), nz = world.waterDist(x, z + e) - world.waterDist(x, z - e);
        const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
        const d = world.waterDist(x, z);
        x -= nx * (d - 10); z -= nz * (d - 10);
        gx = nx; gz = nz;
      }
    }
  }
  const wood = [0.2, 0.07, 0.045];
  const roofC = [0.1, 0.1, 0.11];
  for (const c of cols) {
    const a = Math.atan2(-c.gx, c.gz);   // local +z points inland, local -z faces the river
    const top = world.heightAt(c.x + c.gx * 60, c.z + c.gz * 60) + 6 + R() * 6;
    const fl = 3.6;
    let y = 7; // deck on stilts above the water
    // stilts under the first tier
    for (const sx of [-6, -2, 2, 6]) for (const sz of [-3.5, 0.5]) {
      const [px, pz] = Builder.tw(c.x, c.z, a, sx, sz);
      B.prop({ x: px, y0: -1, z: pz, hw: 0.32, h: y + 1, kind: 2, prm: 8, mat: MAT.CONCRETE, col: [0.25, 0.18, 0.12] });
    }
    let k = 0;
    while (y < top && k < 12) {
      const floors = 2 + (R() < 0.4 ? 1 : 0);
      const h = floors * fl;
      const inland = k * 7.5;
      const [bx, bz] = Builder.tw(c.x, c.z, a, 0, inland + 2);
      const bw = 5.2 + R() * 2.2, bd = 4.2 + 0.3 * k;
      B.part({ x: bx, y0: k === 0 ? y : Math.max(y - 30, -1), z: bz, a, hw: bw, hd: bd, h: k === 0 ? h : h + (y - Math.max(y - 30, -1)), mat: MAT.WOOD, col: wood, floorH: fl, winW: 2.4, baseY: 7, param: 1.1 + R() * 0.4, seed: R() * 999, solid: true });
      y += h;
      // overhanging upturned roof with glowing eaves
      B.part({ x: bx, y0: y - 0.25, z: bz, a, hw: bw + 1.7, hd: bd + 1.7, h: 3.2, prof: 4, taper: 0.2, mat: MAT.ROOFTILE, col: roofC, param: 2.2, flags: FLAG.BOTTOM });
      // lanterns under the eave
      for (const lx of [-bw + 1, -bw / 3, bw / 3, bw - 1]) {
        const [qx, qz] = Builder.tw(c.x, c.z, a, lx, inland + 2 - bd - 0.9);
        B.prop({ x: qx, y0: y - 1.6, z: qz, hw: 0.32, h: 0.75, kind: 2, prm: 8, mat: MAT.EMIT, col: [1, 0.1, 0.03], param: 5, winW: 2, flags: FLAG.BOTTOM });
      }
      k++;
    }
    const [lx, lz] = Builder.tw(c.x, c.z, a, 0, -4);
    B.light(lx, 9, lz, 22, [1, 0.62, 0.25], 60, 5);
    if (k > 3) { const [mx, mz] = Builder.tw(c.x, c.z, a, 0, 10); B.light(mx, y - 6, mz, 22, [1, 0.6, 0.25], 50, 5); }
  }
}

// ------------------------------------------------------------------ steppe landmarks

function gerdome(B, R, L, world) {
  const x = L.x, z = L.z, g = world.heightAt(x, z);
  const C = world.poses[5].resolved;
  const doorA = Math.atan2(C.z - z, C.x - x);
  B.sites.gerdome = { x, z, y: g, r: 68, doorX: x + Math.cos(doorA) * 70, doorZ: z + Math.sin(doorA) * 70 };
  const r = 68;
  // plinth
  B.part({ x, y0: g - 4, z, hw: r + 10, hd: r + 10, h: 7, kind: 2, prm: 48, mat: MAT.STONE, col: [0.5, 0.45, 0.4], floorH: 100, winW: 100, param: 0, flags: FLAG.FLOOD | FLAG.NOWIN, solid: true });
  // wall drum
  B.part({ x, y0: g + 3, z, a: doorA, hw: r, hd: r, h: 26, kind: 2, prm: 48, mat: MAT.FELT, col: [0.86, 0.84, 0.78], param: 0.72, seed: 31, solid: true });
  // dome roof with ribs and ornament band
  B.part({ x, y0: g + 29, z, a: doorA, hw: r + 2, hd: r + 2, h: 82, kind: 2, prm: 48, prof: 5, taper: 0.15, mat: MAT.FELT, col: [0.88, 0.86, 0.8], param: 0.08, flags: FLAG.RIBS | FLAG.BOTTOM });
  // lit crown ring (toono)
  B.part({ x, y0: g + 109, z, hw: 13, hd: 13, h: 5, kind: 2, prm: 48, mat: MAT.CROWN, col: [1, 0.72, 0.3], param: 5 });
  B.part({ x, y0: g + 114, z, hw: 9, hd: 9, h: 6, kind: 2, prm: 32, prof: 1, mat: MAT.EMIT, col: [1, 0.85, 0.5], param: 4 });
  for (let k = 0; k < 8; k++) {
    const t = k / 8 * TAU;
    B.part({ x: x + Math.cos(t) * 12.5, y0: g + 109, z: z + Math.sin(t) * 12.5, hw: 0.8, h: 9, kind: 2, prm: 8, mat: MAT.EMIT, col: [0.2, 0.9, 1], param: 5 });
  }
  // colorful door frame facing the market
  const [dx, dz] = Builder.tw(x, z, doorA, r + 1.5, 0);
  B.part({ x: dx, y0: g + 3, z: dz, a: doorA, hw: 2, hd: 9, h: 18, mat: MAT.TILE, col: [0.8, 0.2, 0.1], param: -1, flags: 0 });
  B.part({ x: dx + Math.cos(doorA) * 0.6, y0: g + 3, z: dz + Math.sin(doorA) * 0.6, a: doorA, hw: 1.8, hd: 6, h: 14, mat: MAT.EMIT, col: [1, 0.55, 0.15], param: 3.5 });
  for (const o of [-9.5, 9.5]) {
    const [px, pz] = Builder.tw(x, z, doorA, r + 2.2, o);
    B.part({ x: px, y0: g + 3, z: pz, a: doorA, hw: 0.6, hd: 0.6, h: 19, mat: MAT.EMIT, col: [0.1, 0.6, 1], param: 5 });
  }
  // ring of floodlights
  for (let k = 0; k < 6; k++) {
    const t = k / 6 * TAU + doorA;
    B.light(x + Math.cos(t) * (r + 14), g + 3, z + Math.sin(t) * (r + 14), 40, [1, 0.8, 0.55], 140, 5);
  }
  // small gers around the plinth
  for (let k = 0; k < 10; k++) {
    const t = doorA + 0.6 + k / 10 * (TAU - 1.2);
    const gx = x + Math.cos(t) * (r + 24), gz = z + Math.sin(t) * (r + 24);
    gerHut(B, R, gx, gz, world.heightAt(gx, gz) - 0.2, 4 + R() * 2);
  }
}

function registan(B, R, L, world) {
  const x = L.x, z = L.z, g = world.heightAt(x, z);
  const a0 = Math.atan2(world.poses[5].resolved.z - z, world.poses[5].resolved.x - x);
  B.sites.registan = { x, z, y: g };
  // plaza paving block
  B.part({ x, y0: g - 4, z, a: a0, hw: 46, hd: 46, h: 4.6, mat: MAT.STONE, col: [0.5, 0.45, 0.38], floorH: 100, winW: 100, param: 0, flags: FLAG.NOWIN | FLAG.FLOOD });
  // three madrasas on three sides facing the plaza; the open side faces the market
  for (let k = 1; k <= 3; k++) {
    const a = a0 + k * Math.PI / 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const cx = x + ca * 60, cz = z + sa * 60;
    const fa = a + Math.PI / 2; // local +x along the wing, local -z... face toward plaza is local -x of a rotated frame
    // wing block
    B.part({ x: cx, y0: g - 3, z: cz, a: fa, hw: 46, hd: 9, h: 21, mat: MAT.BRICK, col: [0.66, 0.54, 0.38], floorH: 4.5, winW: 4, baseY: g, param: 0.5, solid: true });
    // tile band on the wing
    B.part({ x: cx, y0: g + 15, z: cz, a: fa, hw: 46.2, hd: 9.2, h: 3, mat: MAT.TILE, col: [0.05, 0.42, 0.62], param: -1, flags: FLAG.NOTOP | FLAG.BOTTOM });
    // pishtaq portal (taller frame) with iwan arch on the plaza face (fid 1 = local +z face)
    const [px, pz] = Builder.tw(cx, cz, fa, 0, 10.5);
    B.part({ x: px, y0: g - 3, z: pz, a: fa, hw: 16, hd: 2.5, h: 39, mat: MAT.TILE, col: [0.06, 0.5, 0.62], floorH: 100, winW: 100, baseY: g, param: 1, flags: FLAG.PORTAL, seed: k * 13, solid: true });
    // neon trim around the portal
    for (const [ox, oy, w, h] of [[-16.3, 0, 0.25, 36], [16.3, 0, 0.25, 36], [0, 35.8, 16.5, 0.25]]) {
      const [nx, nz] = Builder.tw(px, pz, fa, ox, 2.7);
      B.part({ x: nx, y0: g + oy, z: nz, a: fa, hw: w, hd: 0.2, h: h || 0.3, mat: MAT.EMIT, col: [0.1, 0.95, 1], param: 7, flags: FLAG.BOTTOM });
    }
    // minarets flanking the portal
    for (const o of [-19, 19]) {
      const [mx, mz] = Builder.tw(cx, cz, fa, o, 9);
      minaret(B, R, mx, mz, g, 36 + R() * 6, 2.3);
    }
    // ribbed turquoise domes behind the portal
    for (const o of [-24, 24]) {
      const [dx, dz] = Builder.tw(cx, cz, fa, o, -2);
      B.part({ x: dx, y0: g + 18, z: dz, hw: 8, hd: 8, h: 8, kind: 2, prm: 24, mat: MAT.TILE, col: [0.05, 0.5, 0.6], param: -1 });
      B.part({ x: dx, y0: g + 26, z: dz, hw: 8.8, hd: 8.8, h: 12, kind: 2, prm: 48, prof: 3, mat: MAT.TILE, col: [0.05, 0.62, 0.66], param: -1, flags: FLAG.RIBS });
      B.part({ x: dx, y0: g + 38, z: dz, hw: 0.4, h: 3, kind: 2, prm: 8, taper: 0.2, mat: MAT.EMIT, col: [1, 0.8, 0.35], param: 4 });
    }
    B.light(x + ca * 40, g + 3, z + sa * 40, 30, [1, 0.75, 0.45], 40, 4);
    B.light(px - ca * 4, g + 20, pz - sa * 4, 26, [0.2, 0.9, 1], 40, 4);
  }
}

export function genLandmarks(B, R, world) {
  for (const L of world.landmarks) {
    const g = world.heightAt(L.x, L.z);
    switch (L.id) {
      case 'twist': twist(B, R, L, g); break;
      case 'twin': twin(B, R, L, g); break;
      case 'truss': truss(B, R, L, g); break;
      case 'tvtower': tvtower(B, R, L, g); break;
      case 'crown': jinCrown(B, R, L, g); break;
      case 'raffles': raffles(B, R, L, world); break;
      case 'ridge': ridgeTower(B, R, L, world); break;
      case 'stilts': stilts(B, R, L, world); break;
      case 'gerdome': gerdome(B, R, L, world); break;
      case 'registan': registan(B, R, L, world); break;
      default: break;
    }
  }
}
