// Landmark buildings (bespoke part assemblies), the Hongyadong-style stilt complex, the steppe night market,
// and lot preparation around the verification viewpoints.

import { FLAG, MAT } from './buildings_wgsl.js';
import { Builder, PAL, gerHut, minaret } from './buildings_gen.js';
import { DT } from './world.js';
import { stiltsSite } from './plan.js';

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
      const half = 4.5;
      if (Math.abs(dlx) > Math.abs(dlz) * 3) {
        // corridor runs along local x: cut the lot in z (line position at the lot center)
        const lzc = lz0 - dlz * lx0 / dlx;
        const lo = -L.d / 2, hi = L.d / 2;
        const keepLow = (lzc - half) - lo, keepHigh = hi - (lzc + half);
        if (Math.max(keepLow, keepHigh) < 8) { L.dead = true; continue; }
        let nlo, nhi;
        if (keepLow > keepHigh) { nlo = lo; nhi = lzc - half; } else { nlo = lzc + half; nhi = hi; }
        const mid = (nlo + nhi) / 2;
        L.x += -s * mid; L.z += c * mid;
        L.d = nhi - nlo;
        L.trimmed = true;
      } else if (Math.abs(dlz) > Math.abs(dlx) * 3) {
        // corridor runs along local z: cut the lot in x
        const lxc = lx0 - dlx * lz0 / dlz;
        const lo = -L.w / 2, hi = L.w / 2;
        const keepLow = (lxc - half) - lo, keepHigh = hi - (lxc + half);
        if (Math.max(keepLow, keepHigh) < 8) { L.dead = true; continue; }
        let nlo, nhi;
        if (keepLow > keepHigh) { nlo = lo; nhi = lxc - half; } else { nlo = lxc + half; nhi = hi; }
        const mid = (nlo + nhi) / 2;
        L.x += c * mid; L.z += s * mid;
        L.w = nhi - nlo;
        L.trimmed = true;
      } else L.dead = true;
    }
  }
  lots.length = 0;
  for (const L of keep) if (!L.dead) lots.push(L);
  return { market };
}

// ------------------------------------------------------------------ market plaza (pose 6)

// Goods on a stall counter (top at y). (ux,uz) runs along the counter, (fx,fz) points from the stall to the lane.
function stallGoods(B, R, x, z, y, a, ux, uz, fx, fz) {
  const kind = Math.floor(R() * 6);
  const at = (u, f) => [x + ux * u - fx * f, z + uz * u - fz * f];
  if (kind === 0) {
    // hanging carpets on the canopy front, a few rolled ones standing on the counter
    for (let k = 0; k < 3; k++) {
      const [cx, cz] = at(-1.3 + k * 1.3, 1.45);
      B.prop({ x: cx, y0: y + 0.25, z: cz, a, hw: 0.55, hd: 0.025, h: 1.25, mat: MAT.CARPET, col: [0.5, 0.1, 0.08], seed: R() * 999 });
    }
    for (let k = 0; k < 3; k++) {
      const [cx, cz] = at(-1.2 + k * 0.35, -0.3);
      B.prop({ x: cx, y0: y, z: cz, hw: 0.12, h: 0.9 + R() * 0.3, kind: 2, prm: 12, mat: MAT.CARPET, col: [0.4, 0.1, 0.1], seed: R() * 999 });
    }
  } else if (kind === 1) {
    // stacks of folded felt with ornament bands
    for (let s = 0; s < 3; s++) {
      const [cx, cz] = at(-1.2 + s * 1.2, 0);
      for (let k = 0; k < 3 + Math.floor(R() * 3); k++) {
        B.prop({ x: cx, y0: y + k * 0.13, z: cz, a: a + (R() - 0.5) * 0.3, hw: 0.32, hd: 0.24, h: 0.12, mat: MAT.FELT, col: [[0.8, 0.76, 0.7], [0.6, 0.15, 0.12], [0.15, 0.3, 0.55], [0.7, 0.55, 0.2]][Math.floor(R() * 4)], param: 0.4, flags: FLAG.BOTTOM });
      }
    }
  } else if (kind === 2) {
    // charcoal grill with skewers
    const [gx, gz] = at(0, 0);
    B.prop({ x: gx, y0: y, z: gz, a, hw: 1.3, hd: 0.25, h: 0.22, mat: MAT.METAL, col: [0.12, 0.12, 0.12] });
    B.prop({ x: gx, y0: y + 0.22, z: gz, a, hw: 1.2, hd: 0.18, h: 0.02, mat: MAT.EMIT, col: [1, 0.35, 0.08], param: 5, winW: 2 });
    for (let k = 0; k < 9; k++) {
      const [sx, sz] = at(-1.05 + k * 0.26, 0);
      B.prop({ x: sx, y0: y + 0.27, z: sz, a: a + Math.PI / 2, hw: 0.32, hd: 0.035, h: 0.05, mat: MAT.CONCRETE, col: [0.45, 0.2, 0.1] });
    }
  } else if (kind === 3) {
    // fruit pyramids
    const fruit = [[1, 0.45, 0.05], [0.8, 0.1, 0.08], [0.45, 0.7, 0.15], [0.95, 0.8, 0.15]];
    for (let p = 0; p < 3; p++) {
      const col = fruit[Math.floor(R() * fruit.length)];
      const [cx, cz] = at(-1.2 + p * 1.2, 0);
      const r = 0.1;
      for (let lay = 0; lay < 3; lay++) {
        const nn = 3 - lay;
        for (let i = 0; i < nn; i++) for (let j = 0; j < nn; j++) {
          const ou = (i - (nn - 1) / 2) * r * 2, of = (j - (nn - 1) / 2) * r * 2;
          B.prop({ x: cx + ux * ou - fx * of, y0: y + lay * r * 1.6, z: cz + uz * ou - fz * of, hw: r, h: r * 2, kind: 2, prm: 12, prof: 2, mat: MAT.TILE, col: col.map((v) => v * 0.6), param: -1 });
        }
      }
    }
  } else if (kind === 5) {
    // two big pots on glowing burners (noodles, hotpot), lids ajar, ladle
    for (const u of [-0.8, 0.8]) {
      const [px, pz] = at(u, 0.1);
      B.prop({ x: px, y0: y, z: pz, hw: 0.36, h: 0.08, kind: 2, prm: 12, mat: MAT.EMIT, col: [1, 0.3, 0.06], param: 4, winW: 2 });
      B.prop({ x: px, y0: y + 0.08, z: pz, hw: 0.32, h: 0.42, kind: 2, prm: 16, mat: MAT.METAL, col: [0.5, 0.48, 0.45] });
      B.prop({ x: px + ux * 0.05, y0: y + 0.5, z: pz + uz * 0.05, hw: 0.3, h: 0.06, kind: 2, prm: 16, prof: 1, mat: MAT.METAL, col: [0.6, 0.58, 0.55] });
      // steam: a faint warm glow column above the pot
      B.prop({ x: px, y0: y + 0.6, z: pz, hw: 0.18, h: 0.7, kind: 2, prm: 8, prof: 2, taper: 1.6, mat: MAT.EMIT, col: [0.5, 0.45, 0.4], param: 0.35 });
    }
  } else {
    // bowls and ceramics, plus a lit brass lamp
    for (let k = 0; k < 7; k++) {
      const [cx, cz] = at(-1.5 + k * 0.5, (R() - 0.5) * 0.4);
      B.prop({ x: cx, y0: y, z: cz, hw: 0.13, h: 0.12, kind: 2, prm: 16, prof: 6, taper: 1.6, mat: MAT.TILE, col: R() < 0.6 ? [0.05, 0.4, 0.6] : [0.75, 0.72, 0.65], param: -1 });
    }
    const [lx, lz] = at(1.6, 0.2);
    B.prop({ x: lx, y0: y, z: lz, hw: 0.12, h: 0.35, kind: 2, prm: 8, prof: 3, mat: MAT.EMIT, col: [1, 0.65, 0.25], param: 3 });
  }
}

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
      B.prop({ x, y0: g - 0.5, z, a, hw: 2.1, hd: 1.0, h: 1.5, mat: MAT.FELT, col: [0.32, 0.2, 0.12], param: 0.4, seed: R() * 999 });
      const [cx, cz] = [x - px * side * 0.3, z - pz * side * 0.3];
      B.part({ x: cx, y0: g + 2.35, z: cz, a, hw: 1.9, hd: 1.3, h: 0.7, taper: 0.5, mat: MAT.CONCRETE, col: fabric[Math.floor(R() * fabric.length)], param: 2.2, flags: FLAG.BOTTOM });
      for (const o of [-2.2, 2.2]) B.prop({ x: x + ux * o, y0: g, z: z + uz * o, hw: 0.07, h: 2.6, kind: 2, prm: 8, mat: MAT.METAL, col: [0.2, 0.2, 0.2] });
      stallGoods(B, R, x, z, g + 1.0, a, ux, uz, px * side, pz * side);
      // counter front (lane side, -p*side): woven drape or painted boards, and a lit price board
      const fx = x - px * side * 1.03, fz = z - pz * side * 1.03;
      if (R() < 0.7) B.prop({ x: fx, y0: g + 0.1, z: fz, a, hw: 2.0, hd: 0.02, h: 0.85, mat: R() < 0.5 ? MAT.CARPET : MAT.FELT, col: fabric[Math.floor(R() * fabric.length)], param: 0.4, seed: R() * 999 });
      else B.prop({ x: fx, y0: g + 0.1, z: fz, a, hw: 2.0, hd: 0.02, h: 0.85, mat: MAT.TILE, col: [0.1, 0.32, 0.36], param: -1, seed: R() * 999 });
      B.slot(x - px * side * 1.06 + ux * 1.4, g + 1.35, z - pz * side * 1.06 + uz * 1.4, -px * side, -pz * side, 0.9, 0.5, false, DT.STEPPE);
      // textiles hanging from the canopy front on some stalls
      if (R() < 0.5) for (let k = 0; k < 4; k++) {
        const hx = x - px * side * 1.5 + ux * (-1.5 + k), hz = z - pz * side * 1.5 + uz * (-1.5 + k);
        B.prop({ x: hx, y0: g + 1.6, z: hz, a, hw: 0.3, hd: 0.02, h: 0.75, mat: MAT.FELT, col: fabric[(k + Math.floor(R() * 5)) % fabric.length], param: 0.5, seed: R() * 999 });
      }
      // hanging lamp on a cord under the canopy
      const lx = x - px * side * 1.2, lz = z - pz * side * 1.2;
      B.prop({ x: lx, y0: g + 1.85, z: lz, hw: 0.24, h: 0.5, kind: 2, prm: 16, prof: 2, mat: MAT.EMIT, col: [1, 0.55, 0.18], param: 6, winW: 2 });
      B.prop({ x: lx, y0: g + 2.35, z: lz, hw: 0.015, h: 0.25, mat: MAT.METAL, col: [0.1, 0.1, 0.1] });
      B.slot(cx - px * side * 1.7, g + 3.2, cz - pz * side * 1.7, -px * side, -pz * side, 3.5, 0.8, false, DT.STEPPE);
    }
    // lantern string across the lane
    if (Math.round(t / 5.5) % 3 === 0) {
      const g = world.heightAt(C.x + ux * t, C.z + uz * t);
      // poles at both ends, a catenary wire through the lantern tops
      const wire = [];
      for (const o of [-7, 7]) {
        const wx = C.x + ux * t + px * o, wz = C.z + uz * t + pz * o;
        const gp = world.heightAt(wx, wz);
        B.prop({ x: wx, y0: gp - 0.3, z: wz, hw: 0.08, h: g + 5.75 - gp, kind: 2, prm: 8, mat: MAT.METAL, col: [0.18, 0.17, 0.16] });
        if (o < 0) wire.push([wx, g + 5.45, wz]);
      }
      for (let k = -6; k <= 6; k++) {
        const o = k * 0.95;
        const sag = 1.2 * (1 - (o / 7) * (o / 7));
        const lx = C.x + ux * t + px * o, lz = C.z + uz * t + pz * o;
        B.prop({ x: lx, y0: g + 5.2 - sag, z: lz, hw: 0.2, h: 0.36, kind: 2, prm: 16, prof: 2, mat: MAT.EMIT, col: k % 2 ? [1, 0.18, 0.08] : [1, 0.62, 0.22], param: 6, winW: 2 });
        wire.push([lx, g + 5.2 - sag + 0.4, lz]);
      }
      wire.push([C.x + ux * t + px * 7, g + 5.45, C.z + uz * t + pz * 7]);
      for (let k = 0; k < wire.length - 1; k++) {
        const [a0, b0] = wire[k][1] <= wire[k + 1][1] ? [wire[k], wire[k + 1]] : [wire[k + 1], wire[k]];
        B.prop({ x: a0[0], y0: a0[1] - 0.012, z: a0[2], hw: 0.012, h: b0[1] - a0[1] + 0.024, lx: b0[0] - a0[0], lz: b0[2] - a0[2], mat: MAT.METAL, col: [0.08, 0.08, 0.08] });
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

// Spiral Garden Tower: three-lobed plan twisting a third of a turn (spiralling notch and taper), split by
// glowing sky gardens every ~90 m, topped by three leaning blade fins around a floating halo.
function twist(B, R, L, g) {
  const x = L.x, z = L.z, H = 540, R0 = 40, T = 2.0, a0 = 0.3, TAPER = 0.42;
  const prm = 3.14;
  B.part({ x, y0: g - 4, z, hw: 62, hd: 62, h: 28, kind: 3, prm, mat: MAT.GLASS, col: [0.3, 0.5, 0.6], floorH: 6, winW: 2, baseY: g, param: 0.6, flags: FLAG.EDGE, seed: 38, solid: true });
  const y0 = g + 24;
  const sc = (f) => 1 - TAPER * f;
  const fr = [0, 0.17, 0.34, 0.5, 0.66, 0.82, 1];
  const gardenH = 8;
  for (let i = 0; i < fr.length - 1; i++) {
    const f0 = fr[i], f1 = fr[i + 1];
    const ys = y0 + f0 * H + (i > 0 ? gardenH : 0), ye = y0 + f1 * H;
    const fs = (ys - y0) / H, fe = (ye - y0) / H;
    B.part({ x, y0: ys, z, a: a0 + T * fs, hw: R0 * sc(fs), hd: R0 * sc(fs), h: ye - ys, kind: 3, prm, taper: sc(fe) / sc(fs), twist: T * (fe - fs),
      mat: MAT.GLASS, col: [0.32, 0.52, 0.66], floorH: 4.4, winW: 1.6, baseY: g, param: 0.22, flags: FLAG.LED | FLAG.EDGE, seed: 38, solid: i < 2 });
    if (i > 0) {
      // sky garden: recessed glowing green core with a lit balustrade on the terrace edge
      const fg = (y0 + f0 * H - y0) / H;
      const r = R0 * sc(fg);
      B.part({ x, y0: y0 + f0 * H, z, a: a0 + T * fg, hw: r * 0.8, hd: r * 0.8, h: gardenH, kind: 3, prm, mat: MAT.GLASS, col: [0.25, 0.75, 0.4], floorH: gardenH, winW: 3, baseY: y0 + f0 * H, param: 1.0, seed: 77 + i });
      B.part({ x, y0: y0 + f0 * H, z, a: a0 + T * fg, hw: r + 0.3, hd: r + 0.3, h: 1.1, kind: 3, prm, mat: MAT.EMIT, col: [0.45, 1, 0.6], param: 2.5, flags: FLAG.BOTTOM | FLAG.NOTOP });
      // garden trees on the terrace ring
      for (let k = 0; k < 9; k++) {
        const t = k / 9 * TAU + a0 + T * fg;
        const rr = r * 0.9;
        B.prop({ x: x + Math.cos(t) * rr, y0: y0 + f0 * H, z: z + Math.sin(t) * rr, hw: 1.6, hd: 1.6, h: 4.5, kind: 2, prm: 8, taper: 0.1, mat: MAT.EMIT, col: [0.1, 0.45, 0.2], param: 0.6 });
      }
    }
  }
  const top = y0 + H;
  const aTop = a0 + T, rTop = R0 * sc(1);
  // crown: three blade fins rising from the lobe tips, leaning outward, around a floating halo and a light needle
  for (let k = 0; k < 3; k++) {
    const t = aTop + k * TAU / 3;
    const bx = x + Math.cos(t) * rTop * 0.95, bz = z + Math.sin(t) * rTop * 0.95;
    B.part({ x: bx, y0: top - 2, z: bz, a: t - Math.PI / 2, hw: 1.4, hd: 5, h: 78, taper: 0.15, lx: Math.cos(t) * 7, lz: Math.sin(t) * 7, mat: MAT.CROWN, col: [0.5, 0.9, 1], param: 3.2 });
  }
  B.part({ x, y0: top, z, a: aTop, hw: rTop * 0.82, hd: rTop * 0.82, h: 6, kind: 3, prm, mat: MAT.EMIT, col: [0.5, 0.9, 1], param: 2.2 });
  B.part({ x, y0: top + 46, z, hw: rTop * 0.75, hd: rTop * 0.75, h: 2.2, kind: 2, prm: 48, mat: MAT.EMIT, col: [0.6, 0.95, 1], param: 5, flags: FLAG.BOTTOM | FLAG.NOTOP });
  B.part({ x, y0: top + 6, z, hw: 2.4, hd: 2.4, h: 92, kind: 2, prm: 8, taper: 0.05, mat: MAT.CROWN, col: [0.7, 0.95, 1], param: 4 });
  av(B, x, top + 98, z, 1);
  B.tops.push({ x, y: top + 8, z, cbd: true, lm: true });
  B.led.push({ x, z, y0, y1: top, r: R0 });
  B.light(x + 70, g + 3, z, 40, [0.5, 0.8, 1], 120, 3);
  B.light(x - 70, g + 3, z, 40, [0.5, 0.8, 1], 120, 3);
}

// Hexa Twins: two unequal faceted towers on a six-pointed star plan; each tier rotates 15 degrees so the facets
// step and spiral. A rhombus-shaped truss skybridge (crossed struts above and below a lit deck) links them.
function twin(B, R, L, g) {
  const sep = 80, a = 0.35;
  const ca = Math.cos(a), sa = Math.sin(a);
  const glass = [0.66, 0.58, 0.44];
  const heights = [420, 355];
  const fr = [0, 0.45, 0.68, 0.83, 0.93, 1];
  const scl = [1, 0.88, 0.76, 0.64, 0.52];
  const tipR = 30;
  const tips = [];
  [-1, 1].forEach((sgn, ti) => {
    const x = L.x + ca * sep / 2 * sgn, z = L.z + sa * sep / 2 * sgn;
    const Ht = heights[ti];
    for (let k = 0; k < fr.length - 1; k++) {
      const yb = k === 0 ? g - 4 : g + fr[k] * Ht, ye = g + fr[k + 1] * Ht;
      const ap = tipR / 2 * scl[k];
      const rot = a + k * Math.PI / 12 + (ti ? Math.PI / 6 : 0);
      const common = { x, y0: yb, z, h: ye - yb, kind: 2, prm: 3, hw: ap, hd: ap, mat: MAT.GLASS, col: glass, floorH: 4.0, winW: 1.4, baseY: g, param: 0.35, flags: FLAG.EDGE, seed: 8.8, solid: false };
      B.part({ ...common, a: rot, solid: true });
      B.part({ ...common, a: rot + Math.PI / 3 });
      // lit ledge at each setback
      if (k > 0) B.part({ x, y0: yb - 0.8, z, a: rot, hw: ap * 1.25, hd: ap * 1.25, h: 1.2, kind: 2, prm: 6, mat: MAT.EMIT, col: [1, 0.8, 0.45], param: 3, flags: FLAG.BOTTOM });
    }
    const top = g + Ht;
    // crown: glowing hexagonal lantern pyramid and a light needle
    B.part({ x, y0: top, z, a: a + ti * 0.5, hw: tipR * 0.22, hd: tipR * 0.22, h: 34, kind: 2, prm: 6, taper: 0.08, mat: MAT.CROWN, col: [1, 0.78, 0.45], param: 3.5 });
    B.part({ x, y0: top + 30, z, hw: 1.2, hd: 1.2, h: 46 - ti * 10, kind: 2, prm: 8, taper: 0.1, mat: MAT.CROWN, col: [1, 0.9, 0.7], param: 4 });
    av(B, x, top + 76 - ti * 10, z, 5 + ti);
    B.tops.push({ x, y: top, z, cbd: true });
    B.light(x + 34 * sgn * ca, g + 3, z + 34 * sgn * sa, 36, [1, 0.8, 0.55], 100, 3);
    tips.push({ x, z });
  });
  // rhombus truss skybridge
  const by = g + 190;
  const gap = sep - tipR * 1.4;
  B.part({ x: L.x, y0: by, z: L.z, a, hw: gap / 2 + 4, hd: 3.2, h: 7, mat: MAT.GLASS, col: [0.75, 0.7, 0.6], floorH: 3.5, winW: 1.5, baseY: by, param: 0.95, flags: FLAG.BOTTOM | FLAG.EDGE, seed: 8.8 });
  B.part({ x: L.x, y0: by - 0.5, z: L.z, a, hw: gap / 2 + 4, hd: 3.6, h: 0.5, mat: MAT.EMIT, col: [1, 0.75, 0.4], param: 4, flags: FLAG.BOTTOM });
  const half = gap / 2 + 2;
  for (const sgn of [-1, 1]) {
    const ex = L.x + ca * half * sgn, ez = L.z + sa * half * sgn;
    // lower strut from the tower face up to the deck centre, upper strut from the deck centre up to the tower face
    B.part({ x: ex, y0: by - 45, z: ez, hw: 0.9, hd: 0.9, h: 45, kind: 2, prm: 8, lx: -ca * half * sgn, lz: -sa * half * sgn, mat: MAT.EMIT, col: [1, 0.85, 0.6], param: 2.2 });
    B.part({ x: L.x, y0: by + 7, z: L.z, hw: 0.9, hd: 0.9, h: 45, kind: 2, prm: 8, lx: ca * half * sgn, lz: sa * half * sgn, mat: MAT.EMIT, col: [1, 0.85, 0.6], param: 2.2 });
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

// Orbital Lantern Mast: a leaning hexagonal core with a slimmer companion shaft; luminous orbs of different
// sizes hang off both sides on cantilevered arms (asymmetric cluster), in a cyan-to-violet treatment.
function tvtower(B, R, L, g) {
  const x = L.x, z = L.z;
  const lean = [14, -6];           // top offset of the main core (m)
  const H = 330;
  const steel = [0.62, 0.64, 0.7];
  const coreAt = (y) => [x + lean[0] * (y - g) / H, z + lean[1] * (y - g) / H];
  B.part({ x, y0: g - 3, z, hw: 46, hd: 46, h: 8, kind: 2, prm: 48, mat: MAT.STONE, col: [0.35, 0.35, 0.4], floorH: 100, winW: 100, param: 0, flags: FLAG.NOWIN | FLAG.FLOOD, solid: true });
  B.part({ x, y0: g + 2, z, a: 0.3, hw: 8.5, hd: 8.5, h: H, kind: 2, prm: 6, taper: 0.55, lx: lean[0], lz: lean[1], mat: MAT.METAL, col: steel, solid: true });
  // companion shaft and three raking struts on one side only
  const cx = x - 30, cz = z + 16;
  B.part({ x: cx, y0: g + 2, z: cz, a: 0.3, hw: 4, hd: 4, h: 205, kind: 2, prm: 6, taper: 0.7, lx: 12, lz: -6, mat: MAT.METAL, col: steel, solid: true });
  for (const [ox, oz, h] of [[-62, -10, 120], [-48, 46, 100], [-8, 58, 86]]) {
    const [tx, tz] = coreAt(g + h);
    B.part({ x: x + ox, y0: g + 2, z: z + oz, hw: 2.8, hd: 2.8, h, kind: 2, prm: 12, lx: tx - (x + ox), lz: tz - (z + oz), mat: MAT.METAL, col: steel });
  }
  // orbs: [height of centre, radius, side angle, offset from core axis, colour]
  const cyan = [0.15, 0.85, 1], violet = [0.62, 0.32, 1], blue = [0.3, 0.5, 1], teal = [0.1, 0.95, 0.75];
  const orbs = [[108, 24, 0, 0, cyan], [168, 10, 2.2, 21, violet], [196, 15, -0.7, 25, blue], [238, 8, 1.4, 16, teal], [268, 12, -2.4, 19, violet], [300, 18, 0, 0, blue], [352, 6, 0, 0, cyan]];
  for (const [yc, r, side, off, col] of orbs) {
    const [ax, az] = coreAt(g + yc);
    const ox = ax + Math.cos(side) * off, oz = az + Math.sin(side) * off;
    B.part({ x: ox, y0: g + yc - r, z: oz, hw: r, hd: r, h: 2 * r, kind: 2, prm: 48, prof: 2, mat: MAT.TV, col, param: 1.5, flags: FLAG.NOTOP });
    if (off > 0) {
      // cantilever arm from the core to the orb
      B.part({ x: (ax + ox) / 2, y0: g + yc - 1.5, z: (az + oz) / 2, a: side, hw: off / 2, hd: 1.4, h: 3, mat: MAT.METAL, col: steel, flags: FLAG.BOTTOM });
    } else {
      // equator ring on the centred orbs
      B.part({ x: ox, y0: g + yc - 1, z: oz, hw: r + 1.5, hd: r + 1.5, h: 2, kind: 2, prm: 48, mat: MAT.EMIT, col: [0.7, 0.4, 1], param: 4, flags: FLAG.BOTTOM });
    }
  }
  const [mx, mz] = coreAt(g + H);
  B.part({ x: mx, y0: g + H + 2, z: mz, hw: 2.4, hd: 2.4, h: 120, kind: 2, prm: 12, taper: 0.08, mat: MAT.METAL, col: [0.85, 0.85, 0.9] });
  for (let k = 0; k < 5; k++) B.part({ x: mx, y0: g + H + 20 + k * 18, z: mz, hw: 2.5 - k * 0.35, hd: 2.5 - k * 0.35, h: 1.2, kind: 2, prm: 16, mat: MAT.EMIT, col: [0.4, 0.8, 1], param: 6, flags: FLAG.BOTTOM });
  av(B, mx, g + H + 122, mz, 9);
  B.tops.push({ x: mx, y: g + 300, z: mz, cbd: true, tv: true });
  for (const [ox, oz] of [[40, 0], [-20, 35], [-20, -35]]) B.light(x + ox, g + 8, z + oz, 40, [0.4, 0.6, 1], 140, 4);
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

// Sky Vault: four towers set on a gentle arc, threaded mid-height (not on top) by a long glass vault garden;
// the towers continue above it with lit crowns. Two taller towers at the tip connect to the vault ends with
// angled sky tubes at a lower level.
function raffles(B, R, L, world) {
  const pts = [[-185, -8], [-125, 4], [-65, 4], [-5, -8]];   // relative to the site (the plateau ends near x = 230)
  const glass = [0.4, 0.55, 0.62];
  let gmax = 0;
  for (const [dx, dz] of pts) gmax = Math.max(gmax, world.heightAt(L.x + dx, L.z + dz));
  const vy = gmax + 190;                       // vault floor
  const tops = [270, 300, 285, 255];
  pts.forEach(([dx, dz], i) => {
    const x = L.x + dx, z = L.z + dz;
    const g = world.heightAt(x, z);
    const lean = i === 0 ? -9 : i === 3 ? 9 : 0;   // end towers lean outward
    const top = gmax + tops[i];
    B.part({ x, y0: g - 6, z, a: 0.08 * (i - 1.5), hw: 15, hd: 12, h: top - g + 6, kind: 0, prm: 0.45, lx: lean, mat: MAT.GLASS, col: glass, floorH: 4, winW: 1.5, baseY: g, param: 0.4, flags: FLAG.EDGE | FLAG.CROWNLIT, seed: 52 + i, solid: true });
    B.part({ x: x + lean, y0: top, z, hw: 6, hd: 6, h: 14, kind: 2, prm: 6, taper: 0.3, mat: MAT.CROWN, col: [0.5, 1, 0.85], param: 3 });
    B.light(x, g + 3, z + 20, 30, [0.6, 0.9, 1], 70, 3);
  });
  // vault garden: lit deck plus an elongated glass dome threaded through the towers
  const vx = L.x - 95, vz = L.z;
  B.part({ x: vx, y0: vy - 4, z: vz, a: 0, hw: 118, hd: 19, h: 4, kind: 0, prm: 1, mat: MAT.METAL, col: [0.3, 0.32, 0.35], flags: FLAG.BOTTOM });
  B.part({ x: vx, y0: vy - 4.6, z: vz, a: 0, hw: 119, hd: 19.5, h: 0.6, kind: 0, prm: 1, mat: MAT.EMIT, col: [0.3, 1, 0.7], param: 3, flags: FLAG.BOTTOM });
  B.part({ x: vx, y0: vy, z: vz, a: 0, hw: 118, hd: 18, h: 30, kind: 0, prm: 1, prof: 1, mat: MAT.GLASS, col: [0.35, 0.9, 0.6], floorH: 5, winW: 3, baseY: vy, param: 0.9, flags: FLAG.LED, seed: 61 });
  // ribs over the vault (lit arches every 24 m)
  for (let k = -4; k <= 4; k++) {
    const rx = vx + k * 24;
    B.part({ x: rx, y0: vy, z: vz, hw: 0.6, hd: 18.5 * Math.sqrt(Math.max(0.05, 1 - (k * 24 / 118) ** 2)), h: 30 * Math.sqrt(Math.max(0.05, 1 - (k * 24 / 118) ** 2)), kind: 0, prm: 1, prof: 1, mat: MAT.EMIT, col: [0.6, 1, 0.85], param: 2.2 });
  }
  B.led.push({ x: vx, z: vz, y0: vy, y1: vy + 30, r: 118 });
  // two taller tip towers and angled sky tubes to the vault ends
  for (const sz of [-1, 1]) {
    const x = L.x - 70, z = L.z + (sz < 0 ? -110 : 105);
    const g = world.heightAt(x, z);
    const top = g + 310;
    B.part({ x, y0: g - 6, z, a: 0, hw: 19, hd: 16, h: top - g + 6, kind: 1, prm: 0.3, mat: MAT.GLASS, col: glass, floorH: 4, winW: 1.5, baseY: g, param: 0.4, flags: FLAG.EDGE | FLAG.CROWNLIT, seed: 70 + sz, solid: true });
    B.part({ x, y0: top, z, hw: 3, hd: 3, h: 40, kind: 2, prm: 8, taper: 0.1, mat: MAT.METAL, col: [0.8, 0.8, 0.85] });
    av(B, x, top + 40, z, sz * 3);
    B.tops.push({ x, y: top, z });
    const [ex, ez] = [L.x + pts[3][0], L.z + pts[3][1]];
    const dx = ex - x, dz = ez - z, len = Math.hypot(dx, dz);
    const ty = gmax + 140;
    B.part({ x: (x + ex) / 2, y0: ty, z: (z + ez) / 2, a: Math.atan2(dz, dx), hw: len / 2, hd: 2.6, h: 4.5, kind: 0, prm: 0.9, mat: MAT.GLASS, col: [0.5, 0.85, 0.8], floorH: 4.5, winW: 2, baseY: ty, param: 0.95, flags: FLAG.BOTTOM | FLAG.EDGE, seed: 61, solid: true });
  }
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
  // the steepest stretch of bank within 900 m of the hint point (shared with the land-use plan's keep-out)
  const best = stiltsSite(world);
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
      B.part({ x: bx, y0: k === 0 ? y : Math.max(y - 30, -1), z: bz, a, hw: bw, hd: bd, h: k === 0 ? h : h + (y - Math.max(y - 30, -1)), mat: MAT.WOOD, col: wood, floorH: fl, winW: 1.6, baseY: 7, param: 1.1 + R() * 0.4, seed: R() * 999, solid: true });
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

// ------------------------------------------------------------------ added landmarks

// Crystal Lance (Jiangbei): a faceted crystalline supertall. Hexagonal segments, each rotated 30 degrees from the
// one below and tapering into the next, give a zig-zag faceted silhouette; the glass carries a diamond lattice of
// glowing seams. A faceted pinnacle and a long slender spire bring it to ~670 m.
function crystal(B, R, L, g) {
  const x = L.x, z = L.z;
  B.part({ x, y0: g - 4, z, a: 0.2, hw: 58, hd: 46, h: 30, kind: 1, prm: 0.45, mat: MAT.GLASS, col: [0.35, 0.35, 0.5], floorH: 6, winW: 2, baseY: g, param: 0.6, flags: FLAG.EDGE, seed: 54.7, solid: true });
  const segs = [92, 86, 80, 72, 64, 56, 46];
  let y = g + 26, ap = 34, rot = 0.2;
  for (let i = 0; i < segs.length; i++) {
    const h = segs[i];
    const tp = 0.84;
    B.part({ x, y0: y, z, a: rot, hw: ap, hd: ap, h, kind: 2, prm: 6, taper: tp, mat: MAT.CRYSTAL, col: [0.4, 0.42, 0.62], floorH: 4.2, winW: 1.6, baseY: g, param: 0.2, flags: FLAG.LED, seed: 54.7, solid: i < 3 });
    y += h;
    // lit joint ring where the next facet set begins
    B.part({ x, y0: y - 0.6, z, a: rot, hw: ap * tp + 0.4, hd: ap * tp + 0.4, h: 1.0, kind: 2, prm: 6, mat: MAT.EMIT, col: [0.75, 0.6, 1], param: 3, flags: FLAG.BOTTOM | FLAG.NOTOP });
    ap = ap * tp * 0.98;   // next hexagon (rotated 30 deg): its corners overhang the faces below as small facets
    rot += Math.PI / 6;
  }
  B.led.push({ x, z, y0: g + 26, y1: y, r: 34 });
  // faceted pinnacle, then the spire
  B.part({ x, y0: y, z, a: rot, hw: ap, hd: ap, h: 58, kind: 2, prm: 6, taper: 0.06, mat: MAT.CRYSTAL, col: [0.5, 0.5, 0.75], floorH: 4.2, winW: 1.6, baseY: g, param: 0.5, flags: FLAG.EDGE | FLAG.CROWNLIT, seed: 54.7 });
  const top = y + 54;
  B.part({ x, y0: top, z, hw: 1.8, hd: 1.8, h: g + 670 - top, kind: 2, prm: 8, taper: 0.06, mat: MAT.METAL, col: [0.85, 0.85, 0.92] });
  for (let k = 0; k < 4; k++) B.part({ x, y0: top + 12 + k * 20, z, hw: 1.9 - k * 0.3, hd: 1.9 - k * 0.3, h: 1, kind: 2, prm: 8, mat: MAT.EMIT, col: [0.8, 0.7, 1], param: 5, flags: FLAG.BOTTOM });
  av(B, x, g + 670, z, 31);
  B.tops.push({ x, y: y, z, lm: true });
  B.light(x + 55, g + 3, z, 36, [0.7, 0.6, 1], 100, 3);
  B.light(x - 55, g + 3, z, 36, [0.7, 0.6, 1], 100, 3);
}

// Hilltop Beacon (West Hills edge): a slender tapering concrete shaft with three climbing light strips, a
// two-lobed observation pod (flared lower bowl, glazed bulb, lit deck ring) and a stepped antenna mast.
function beacon(B, R, L, world) {
  const x = L.x, z = L.z;
  // sit on the local high point and extend the footing down the slope
  let g = world.heightAt(x, z), gmin = g;
  for (let k = 0; k < 8; k++) { const t = k / 8 * TAU; const h = world.heightAt(x + Math.cos(t) * 26, z + Math.sin(t) * 26); g = Math.max(g, h); gmin = Math.min(gmin, h); }
  B.part({ x, y0: gmin - 4, z, a: 0.26, hw: 26, hd: 26, h: g - gmin + 10, kind: 2, prm: 6, mat: MAT.STONE, col: [0.42, 0.42, 0.46], floorH: 100, winW: 100, param: 0, flags: FLAG.NOWIN | FLAG.FLOOD, solid: true });
  const H = 235, r0 = 9, tp = 0.5;
  const base = g + 6;
  B.part({ x, y0: base, z, hw: r0, hd: r0, h: H, kind: 2, prm: 48, taper: tp, mat: MAT.CONCRETE, col: [0.42, 0.42, 0.45], solid: true });
  for (let k = 0; k < 3; k++) {
    const t = k / 3 * TAU + 0.4;
    const c = Math.cos(t), s = Math.sin(t);
    B.part({ x: x + c * (r0 + 0.3), y0: base, z: z + s * (r0 + 0.3), hw: 0.35, hd: 0.35, h: H, lx: -c * r0 * (1 - tp), lz: -s * r0 * (1 - tp), mat: MAT.EMIT, col: [1, 0.55, 0.2], param: 3.5 });
  }
  // observation pod
  const py = base + H;
  B.part({ x, y0: py - 16, z, hw: r0 * tp, hd: r0 * tp, h: 16, kind: 2, prm: 32, taper: 4.2, mat: MAT.METAL, col: [0.55, 0.55, 0.6], flags: FLAG.NOTOP });
  B.part({ x, y0: py - 1, z, hw: 22, hd: 22, h: 2, kind: 2, prm: 48, mat: MAT.EMIT, col: [1, 0.6, 0.25], param: 4, flags: FLAG.BOTTOM });
  B.part({ x, y0: py, z, hw: 21, hd: 21, h: 26, kind: 2, prm: 48, prof: 3, mat: MAT.TV, col: [1, 0.55, 0.22], param: 1.3, flags: FLAG.NOTOP });
  B.part({ x, y0: py + 9, z, hw: 22.5, hd: 22.5, h: 1.5, kind: 2, prm: 48, mat: MAT.EMIT, col: [0.3, 0.9, 1], param: 3, flags: FLAG.BOTTOM | FLAG.NOTOP });
  // stepped antenna mast with alternating red/white bands
  let my = py + 24, mr = 3.2;
  for (let k = 0; k < 3; k++) {
    const mh = [52, 46, 40][k];
    B.part({ x, y0: my, z, hw: mr, hd: mr, h: mh, kind: 2, prm: 8, taper: 0.75, mat: MAT.METAL, col: [0.8, 0.8, 0.85] });
    for (let b = 0; b < 3; b++) B.part({ x, y0: my + 8 + b * 14, z, hw: mr * (1 - 0.25 * (8 + b * 14) / mh) + 0.15, hd: mr * (1 - 0.25 * (8 + b * 14) / mh) + 0.15, h: 2.5, kind: 2, prm: 8, mat: MAT.EMIT, col: b % 2 ? [1, 1, 1] : [1, 0.1, 0.05], param: 3, flags: FLAG.BOTTOM });
    my += mh; mr *= 0.62;
  }
  av(B, x, my, z, 41);
  av(B, x, py + 26, z, 42);
  B.tops.push({ x, y: py + 26, z, lm: true });
  B.sites.beacon = { x, z, y: g, podY: py };
  B.light(x + 30, g + 4, z, 30, [1, 0.6, 0.3], 70, 4);
  B.light(x - 30, g + 4, z, 30, [1, 0.6, 0.3], 70, 4);
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
      case 'crystal': crystal(B, R, L, g); break;
      case 'beacon': beacon(B, R, L, world); break;
      default: break;
    }
  }
}
