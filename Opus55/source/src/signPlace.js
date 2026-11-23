// Sign placement: from world.signSlots when the buildings module provides them, otherwise along the street-facing
// edges of URBAN / HILLSIDE / BUND / STEPPE / CBD lots. Also lanterns, giant LED screens and requested signage
// (station names from the transit module via world.shared.signRequests).

import { DISTRICTS, DT } from './world.js';
import { rng } from './math.js';
import { SHOP_WORDS, BUND_WORDS, STEPPE_CN, MONGOL_WORDS, MONGOL_PAIRS, LATIN_WORDS, BIG_WORDS, CYRILLIC_MN, UYGHUR_WORDS } from './signAtlas.js';

const MONGOL_BI = MONGOL_PAIRS.map(([m, c]) => m + c);

export const KIND = { BLADE: 0, FASCIA: 1, LIGHTBOX: 2, BILLBOARD: 3, SCREEN: 4, DOUBLE: 5 };
export const SIGN_FLOATS = 24; // 6 vec4 per sign

const NEON = {
  pink: [1.0, 0.12, 0.45], red: [1.0, 0.07, 0.05], cyan: [0.1, 0.85, 1.0], green: [0.15, 1.0, 0.35], yellow: [1.0, 0.72, 0.1],
  orange: [1.0, 0.4, 0.05], violet: [0.6, 0.2, 1.0], blue: [0.2, 0.4, 1.0], white: [0.92, 0.94, 1.0], magenta: [0.95, 0.1, 0.9], gold: [1.0, 0.62, 0.22],
};
const PALETTE_STREET = ['red', 'red', 'yellow', 'pink', 'cyan', 'green', 'orange', 'violet', 'white', 'magenta', 'blue', 'pink'];
const PALETTE_BUND = ['gold', 'white', 'gold', 'yellow', 'white'];
const PALETTE_STEPPE = ['blue', 'cyan', 'gold', 'white', 'red', 'green'];

export function placeSigns(world, atlas, quality) {
  const R = rng(9137);
  const signs = [];     // Float32 rows
  const lightC = [];    // light candidates
  const lanterns = [];  // [x,y,z,seed, scale, hue, sway, 0]
  const dens = quality >= 2 ? 1 : quality === 1 ? 0.75 : 0.5;
  const pick = (arr) => arr[(R() * arr.length) | 0];
  const color = (name) => NEON[name];

  // Generic sign emitter. kind, center (x,y,z), face normal (zx,zz), w, h, entry, c1, c2, seed, anim, geometry (depth, zoff, gap, margin)
  const emit = (kind, x, y, z, zx, zz, w, h, entry, c1, c2, seed, mode, depth, zoff, gap, margin) => {
    const uv = entry ? entry.uv : [0, 0, 0, 0];
    const n = entry ? Math.min(entry.n, 15) : 0;
    const anim = mode + 16 * n + (entry && entry.vertical ? 256 : 0);
    signs.push([x, y, z, kind, zx, zz, w, h, uv[0], uv[1], uv[2], uv[3], c1[0], c1[1], c1[2], seed, c2[0], c2[1], c2[2], anim, depth, zoff, gap, margin]);
  };
  const addLight = (x, y, z, c, area, seed, prio) => {
    const r = Math.min(9 + Math.sqrt(area) * 3.2, 22);
    const k = Math.min(10 + area * 2.6, 46);
    lightC.push([x, y, z, r, c[0] * k, c[1] * k, c[2] * k, seed, prio]);
  };
  const flickSeed = () => (R() < 0.38 ? 0.1 + R() * 9.8 : 0);
  const animMode = () => { const r = R(); return r < 0.62 ? 0 : r < 0.74 ? 1 : r < 0.84 ? 2 : r < 0.9 ? 3 : r < 0.95 ? 4 : 5; };

  // vertical blade sign projecting from a wall point (wx,wz) with outward normal n
  const blade = (wx, wz, g, nx, nz, words, pal, wMin, wMax, yLo, yHi, mongol, horizontal = false) => {
    const word = pick(words);
    const e = atlas.find(word, !horizontal);
    if (!e || (horizontal && e.vertical)) return;
    let w = wMin + R() * (wMax - wMin);
    const m = 0.12 * Math.min(w, 1.6);
    let h = (w - 2 * m) / e.aspect + 2 * m;
    if (h > 9.5) { w *= 9.5 / h; h = 9.5; }
    if (h < (horizontal ? 0.7 : mongol ? 1.0 : 1.6)) return;
    const y0 = g + yLo + R() * (yHi - yLo);
    if (y0 + h > g + 21) return;
    const gap = 0.45 + R() * 0.4;
    const cx = wx + nx * (gap + w / 2), cz = wz + nz * (gap + w / 2);
    const c1 = color(pick(pal));
    const c2 = R() < 0.55 ? c1 : color(pick(pal));
    const seed = flickSeed();
    emit(KIND.BLADE, cx, y0 + h / 2, cz, nz, -nx, w, h, e, c1, c2, seed, mongol ? (R() < 0.5 ? 0 : 1) : animMode(), 0.22, 0, gap + 1.0, m);
    addLight(cx, y0 - 0.6, cz, c1, w * h, seed, w * h * (0.6 + R()));
  };
  // flat sign on a wall
  const fascia = (wx, wz, g, nx, nz, word, kind, pal, hMin, hMax, yc, maxW, vertical = false) => {
    const e = atlas.find(word, vertical);
    if (!e) return 0;
    let h = hMin + R() * (hMax - hMin);
    const m = (kind === KIND.LIGHTBOX ? 0.14 : 0.12) * Math.min(h, 2.0);
    let w = (h - 2 * m) * e.aspect + 2 * m;
    if (w > maxW) { h = (maxW - 2 * m) / e.aspect + 2 * m; w = maxW; }
    if (h < 0.5) return 0;
    const c1 = color(pick(pal));
    let c2 = color(pick(pal));
    const seed = kind === KIND.LIGHTBOX ? 0 : flickSeed();
    const depth = 1.2;
    emit(kind, wx, g + yc, wz, nx, nz, w, h, e, c1, c2, seed, kind === KIND.LIGHTBOX ? 0 : animMode(), depth, 0.3 - depth / 2, 0, m);
    addLight(wx + nx * 1.6, g + yc - h / 2 - 0.3, wz + nz * 1.6, kind === KIND.LIGHTBOX ? [c1[0] * 0.6 + 0.4, c1[1] * 0.6 + 0.4, c1[2] * 0.6 + 0.4] : c1, w * h, seed, w * h);
    return w;
  };

  const useSlots = world.signSlots && world.signSlots.length > 0;
  const denseSlots = useSlots && world.signSlots.length > 20000; // buildings provide the street-level signs
  let screenPts = [];
  for (const lot of world.lots) {
    const t = lot.type;
    if (t !== DT.URBAN && t !== DT.HILLSIDE && t !== DT.BUND && t !== DT.STEPPE && t !== DT.CBD) continue;
    const D = DISTRICTS[lot.district];
    const ca = Math.cos(lot.angle), sa = Math.sin(lot.angle);
    const edges = [
      [ca, sa, lot.w / 2, lot.d], [-ca, -sa, lot.w / 2, lot.d],
      [-sa, ca, lot.d / 2, lot.w], [sa, -ca, lot.d / 2, lot.w],
    ];
    for (const [nx, nz, off, len] of edges) {
      const ex = lot.x + nx * off, ez = lot.z + nz * off;
      // street test: the point across the sidewalk lies on a grid road
      const px = ex + nx * (3 + D.road * 0.5), pz = ez + nz * (3 + D.road * 0.5);
      const lx = (px - D.cx) * ca + (pz - D.cz) * sa, lz = -(px - D.cx) * sa + (pz - D.cz) * ca;
      const fx = (((lx / D.block + 0.5) % 1) + 1) % 1 - 0.5, fz = (((lz / D.block + 0.5) % 1) + 1) % 1 - 0.5;
      const dist = Math.min(Math.abs(fx), Math.abs(fz)) * D.block;
      if (dist > D.road * 0.5 + 1.0) continue;
      if (world.heightAt(px, pz) < 1.5) continue;
      const tx = -nz, tz = nx; // tangent along the edge
      const L = len - 3;
      // giant LED screens on long edges (CBD/BUND/URBAN)
      if ((t === DT.CBD || t === DT.BUND || t === DT.URBAN) && len > 34 && R() < (t === DT.CBD ? 0.12 : 0.03)) {
        if (!screenPts.some((p) => Math.hypot(p[0] - ex, p[1] - ez) < 300)) {
          const w = Math.min(len * 0.7, t === DT.CBD ? 40 : 26), h = w * 0.5625;
          const g = world.heightAt(ex, ez);
          const y = g + 9 + R() * 10 + h / 2;
          const e = atlas.find(pick(BIG_WORDS), false);
          emit(KIND.SCREEN, ex + nx * 0.6, y, ez + nz * 0.6, nx, nz, w, h, e, color(pick(PALETTE_STREET)), color(pick(PALETTE_STREET)), 0, (R() * 4) | 0, 1.6, -0.2, 0, 0.35);
          addLight(ex + nx * 6, y - h * 0.2, ez + nz * 6, [0.7, 0.6, 1.0], w * h * 0.25, 0, 1e4);
          addLight(ex + nx * 6 + tx * w * 0.35, y - h * 0.2, ez + nz * 6 + tz * w * 0.35, [0.6, 0.7, 1.0], w * h * 0.2, 0, 1e4);
          screenPts.push([ex, ez]);
          continue;
        }
      }
      if (useSlots) {
        if (t === DT.STEPPE || (t === DT.HILLSIDE && R() < 0.1)) lanternRow(ex, ez, nx, nz, tx, tz, L, 0);
        if (t !== DT.HILLSIDE && t !== DT.URBAN) continue;
      }
      if (t === DT.HILLSIDE || t === DT.URBAN) {
        const hill = t === DT.HILLSIDE;
        const bladeStep = (hill ? 4.6 : 7.0) / dens;
        for (let s = -L / 2 + 1 + R() * 2; s < L / 2 - 0.5; s += bladeStep * (0.7 + R() * 0.6)) {
          const wx = ex + tx * s, wz = ez + tz * s;
          const g = world.heightAt(wx, wz);
          const latin = !denseSlots && R() < 0.08;
          if (latin) {
            fascia(wx, wz, g, nx, nz, pick(LATIN_WORDS), KIND.FASCIA, PALETTE_STREET, 0.7, 1.2, 6 + R() * 6, 6);
            continue;
          }
          // Hong Kong style layers: small blades low, big projecting boxes mid-height, tall blades high up
          if (!denseSlots) blade(wx, wz, g, nx, nz, R() < 0.12 ? BIG_WORDS : SHOP_WORDS, PALETTE_STREET, hill ? 0.9 : 1.0, hill ? 1.5 : 1.8, 3.6, 5.5, false);
          const mid = R();
          if (mid < (hill ? 0.45 : 0.3)) blade(wx + tx * 0.4, wz + tz * 0.4, g, nx, nz, SHOP_WORDS, PALETTE_STREET, 2.2, 3.8, 7.5, 11, false, true);
          else if (mid < (hill ? 0.75 : 0.5)) blade(wx + tx * 0.4, wz + tz * 0.4, g, nx, nz, R() < 0.3 ? BIG_WORDS : SHOP_WORDS, PALETTE_STREET, 1.6, 2.6, 7.5, 10, false);
          if (R() < (hill ? 0.3 : 0.15)) blade(wx - tx * 0.4, wz - tz * 0.4, g, nx, nz, BIG_WORDS, PALETTE_STREET, 1.5, 2.3, 12.5, 15, false);
        }
        // shop fronts: fascia signs above the doors
        for (let s = -L / 2 + 0.6; s < L / 2 - 2 && !useSlots;) {
          const seg = Math.min(4 + R() * 6, L / 2 - s);
          const wx = ex + tx * (s + seg / 2), wz = ez + tz * (s + seg / 2);
          const g = world.heightAt(wx, wz);
          const kind = R() < 0.45 ? KIND.LIGHTBOX : KIND.FASCIA;
          if (R() < 0.85 * dens + 0.1) fascia(wx, wz, g, nx, nz, pick(SHOP_WORDS), kind, PALETTE_STREET, hill ? 0.7 : 0.9, hill ? 1.1 : 1.5, 3.4 + R() * 0.6, seg - 0.4);
          s += seg + 0.3;
        }
        // billboards higher up
        if (len > 18 && R() < (hill ? 0.18 : 0.12)) {
          const wx = ex + tx * (R() - 0.5) * L * 0.4, wz = ez + tz * (R() - 0.5) * L * 0.4;
          const g = world.heightAt(wx, wz);
          const e = atlas.find(pick(BIG_WORDS.concat(SHOP_WORDS.slice(0, 20))), false);
          if (e) {
            const h = 3 + R() * 2.5;
            const w = Math.min(h * 2.4, len - 2);
            const c1 = color(pick(PALETTE_STREET)), c2 = color(pick(PALETTE_STREET));
            const yc = g + 12 + R() * 5;
            emit(KIND.BILLBOARD, wx + nx * 0.4, yc, wz + nz * 0.4, nx, nz, w, h, e, c1, c2, 0, (R() * 3) | 0, 0.8, -0.1, 0, 0.3);
            addLight(wx + nx * 3, yc - h / 2 - 0.5, wz + nz * 3, [c1[0] * 0.5 + 0.5, c1[1] * 0.5 + 0.5, c1[2] * 0.5 + 0.5], w * h * 0.6, 0, w * h);
          }
        }
        if (R() < (hill ? 0.1 : 0.025)) lanternRow(ex, ez, nx, nz, tx, tz, L, R() < 0.5 ? 0 : 1);
      } else if (t === DT.BUND) {
        for (let s = -L / 2 + 2; s < L / 2 - 4; s += 13 / dens) {
          const wx = ex + tx * s, wz = ez + tz * s;
          const g = world.heightAt(wx, wz);
          fascia(wx, wz, g, nx, nz, pick(BUND_WORDS), R() < 0.5 ? KIND.FASCIA : KIND.LIGHTBOX, PALETTE_BUND, 1.0, 1.6, 4.5 + R(), 10);
          if (R() < 0.35) blade(wx + tx * 4, wz + tz * 4, g, nx, nz, BUND_WORDS, PALETTE_BUND, 1.1, 1.5, 4.5, 6, false);
        }
      } else if (t === DT.STEPPE) {
        for (let s = -L / 2 + 1.5; s < L / 2 - 1; s += 7 / dens) {
          const wx = ex + tx * s, wz = ez + tz * s;
          const g = world.heightAt(wx, wz);
          const k = R();
          if (k < 0.45) blade(wx, wz, g, nx, nz, MONGOL_BI, PALETTE_STEPPE, 1.3, 1.9, 3.4, 6, true);
          else if (k < 0.65) blade(wx, wz, g, nx, nz, MONGOL_WORDS, PALETTE_STEPPE, 0.7, 1.0, 3.6, 7, true);
          else blade(wx, wz, g, nx, nz, STEPPE_CN, PALETTE_STEPPE, 1.0, 1.4, 3.6, 6, false);
        }
        for (let s = -L / 2 + 1; s < L / 2 - 3; s += 9) {
          const wx = ex + tx * (s + 4), wz = ez + tz * (s + 4);
          fascia(wx, wz, world.heightAt(wx, wz), nx, nz, pick(STEPPE_CN), R() < 0.5 ? KIND.LIGHTBOX : KIND.FASCIA, PALETTE_STEPPE, 0.9, 1.3, 3.3, 7.5);
        }
        lanternRow(ex, ez, nx, nz, tx, tz, L, 0);
      } else if (t === DT.CBD) {
        for (let s = -L / 2 + 3; s < L / 2 - 6; s += 22) {
          const wx = ex + tx * s, wz = ez + tz * s;
          fascia(wx, wz, world.heightAt(wx, wz), nx, nz, pick(LATIN_WORDS.concat(BUND_WORDS)), KIND.LIGHTBOX, PALETTE_BUND, 1.0, 1.6, 4.5, 12);
        }
      }
    }
  }

  // lanterns hung on a wire along a facade
  function lanternRow(ex, ez, nx, nz, tx, tz, L, style) {
    const step = 3.0 / Math.max(dens, 0.6);
    const hue = style; // 0 red, 1 gold/orange
    for (let s = -L / 2 + 1; s < L / 2 - 0.5; s += step) {
      const wx = ex + tx * s + nx * 0.9, wz = ez + tz * s + nz * 0.9;
      const g = world.heightAt(wx, wz);
      lanterns.push([wx, g + 4.6 + Math.sin(s * 0.9) * 0.08, wz, R() * 100, 0.85 + R() * 0.3, hue + (R() < 0.12 ? 2 : 0), 0.5 + R(), Math.atan2(tz, tx)]);
    }
    const mid = lanterns[lanterns.length - 1];
    if (mid) lightC.push([ex + nx * 1.5, mid[1] - 0.4, ez + nz * 1.5, 14, 30, 7, 2, 0, 8]);
  }

  // Night market stall boards (pose 6 lane): the stalls face across the lane, so a board parallel to the stall
  // front is seen edge-on from the lane. Hang double-sided boards across the stall front instead, readable from
  // both lane ends, in the market's four scripts: Chinese, vertical Mongolian, Cyrillic Mongolian and Uyghur.
  const market = world.poses[5] && world.poses[5].resolved ? (() => {
    const C = world.poses[5].resolved, T = world.poses[5].target;
    const dx = T[0] - C.x, dz = T[2] - C.z, len = Math.hypot(dx, dz);
    return { x: C.x, z: C.z, ux: dx / len, uz: dz / len };
  })() : null;
  const inMarket = (x, z) => {
    if (!market) return false;
    const rx = x - market.x, rz = z - market.z;
    const along = rx * market.ux + rz * market.uz, across = -rx * market.uz + rz * market.ux;
    return along > 8 && along < 180 && Math.abs(across) < 9;
  };
  const marketBoard = (sl) => {
    // board plane spans the across-lane direction; its normal runs along the lane
    const fx = market.ux, fz = market.uz;
    const r = R();
    const c1 = color(pick(PALETTE_STEPPE)), c2 = R() < 0.5 ? c1 : color(pick(PALETTE_STEPPE));
    let e, w, h;
    if (r < 0.25) {
      // vertical Mongolian blade hanging from the canopy edge
      e = atlas.find(pick(MONGOL_WORDS), true);
      if (!e) return;
      w = 0.75; const m = 0.09;
      h = Math.min((w - 2 * m) / e.aspect + 2 * m, 1.9);
      w = Math.min(w, (h - 2 * m) * e.aspect + 2 * m);
      // hangs just in front of the canopy edge, bottom above head height
      emit(KIND.DOUBLE, sl.x + sl.nx * 0.7, sl.y + 1.0 - h / 2, sl.z + sl.nz * 0.7, fx, fz, w, h, e, c1, c2, 0, 1, 0.12, 0, 0, m);
      return;
    }
    const words = r < 0.5 ? STEPPE_CN : r < 0.68 ? CYRILLIC_MN : r < 0.84 ? UYGHUR_WORDS : MONGOL_BI;
    e = atlas.find(pick(words), false);
    if (!e) return;
    h = 0.55 + R() * 0.25; const m = 0.08;
    w = (h - 2 * m) * e.aspect + 2 * m;
    if (w > 2.0) { w = 2.0; h = (w - 2 * m) / e.aspect + 2 * m; }
    // stands on the canopy ridge so the canopy does not hide it
    emit(KIND.DOUBLE, sl.x, sl.y + 0.1 + h / 2, sl.z, fx, fz, w, h, e, c1, c2, flickSeed(), R() < 0.7 ? 0 : 1, 0.12, 0, 0, m);
  };

  // slots from the buildings module
  if (useSlots) {
    for (const sl of world.signSlots) {
      const g = sl.y;
      const nx = sl.nx, nz = sl.nz;
      const style = typeof sl.style === 'string' ? sl.style : '';
      if (sl.style === DT.STEPPE && inMarket(sl.x, sl.z)) { marketBoard(sl); continue; }
      if (style.includes('screen')) {
        emit(KIND.SCREEN, sl.x + nx * 0.6, sl.y, sl.z + nz * 0.6, nx, nz, sl.w, sl.h, atlas.find(pick(BIG_WORDS), false), color(pick(PALETTE_STREET)), color(pick(PALETTE_STREET)), 0, (R() * 4) | 0, 1.6, -0.2, 0, 0.35);
        continue;
      }
      if (sl.vertical) {
        const word = pick(SHOP_WORDS);
        const e = atlas.find(word, true);
        if (!e) continue;
        const w = Math.max(0.8, Math.min(sl.w, 2.2));
        const m = 0.12 * w;
        const h = Math.min((w - 2 * m) / e.aspect + 2 * m, Math.max(sl.h, 2));
        const c1 = color(pick(PALETTE_STREET)); const seed = flickSeed();
        const gap = 0.5;
        emit(KIND.BLADE, sl.x + nx * (gap + w / 2), sl.y, sl.z + nz * (gap + w / 2), nz, -nx, w, h, e, c1, R() < 0.5 ? c1 : color(pick(PALETTE_STREET)), seed, animMode(), 0.22, 0, gap + 0.6, m);
        addLight(sl.x + nx * (gap + w / 2), sl.y - h / 2 - 0.6, sl.z + nz * (gap + w / 2), c1, w * h, seed, w * h);
      } else {
        const kind = style.includes('billboard') ? KIND.BILLBOARD : style.includes('lightbox') ? KIND.LIGHTBOX : (R() < 0.5 ? KIND.LIGHTBOX : KIND.FASCIA);
        const steppe = sl.style === DT.STEPPE;
        fascia(sl.x, sl.z, sl.y - 0, nx, nz, steppe ? pick(MONGOL_BI) : pick(kind === KIND.BILLBOARD ? BIG_WORDS : SHOP_WORDS), steppe ? KIND.FASCIA : kind, steppe ? PALETTE_STEPPE : PALETTE_STREET, Math.min(sl.h, 0.8), sl.h, 0, sl.w);
      }
    }
  }

  // requested signage (station names etc.)
  for (const q of world.shared.signRequests || []) {
    const e = atlas.find(q.text, q.kind === 'blade' || !!q.vertical);
    if (!e) continue;
    const nx = q.nx, nz = q.nz;
    const off = q.offset || 0;
    const x = q.x + nx * off, z = q.z + nz * off;
    const m = 0.1 * Math.min(q.w, q.h);
    let w = q.w, h = q.h;
    // fit the box to the text aspect inside the requested size
    const tw = (h - 2 * m) * e.aspect + 2 * m;
    if (tw < w) w = tw; else h = (w - 2 * m) / e.aspect + 2 * m;
    const c = q.color || [1, 1, 1];
    if (q.kind === 'blade') { const gap = 0.6; emit(KIND.BLADE, x + nx * (gap + w / 2), q.y, z + nz * (gap + w / 2), nz, -nx, w, h, e, c, q.color2 || c, 0, 1, 0.3, 0, gap + 0.6, m); }
    else if (q.kind === 'lightbox') emit(KIND.LIGHTBOX, x, q.y, z, nx, nz, w, h, e, c, [0.05, 0.25, 0.6], 0, 0, 0.3, 0.0, 0, m);
    else if (q.both) emit(KIND.DOUBLE, x, q.y, z, nx, nz, w, h, e, c, c, 0, 1, 0.3, 0, 0, m);
    else emit(KIND.FASCIA, x, q.y, z, nx, nz, w, h, e, c, c, 0, 0, 0.6, 0.0, 0, m);
    if (w * h > 3) addLight(x + nx * 2, q.y - h, z + nz * 2, c, w * h, 0, 1e5);
  }

  return { signs, lightC, lanterns };
}

// Choose lights: highest priority first, at most `perCell` per 20 m cell, up to `budget`.
export function selectLights(cands, budget, perCell = 3) {
  cands.sort((a, b) => b[8] - a[8]);
  const cells = new Map();
  const out = [];
  for (const c of cands) {
    if (out.length >= budget) break;
    const k = Math.floor(c[0] / 20) * 100003 + Math.floor(c[2] / 20);
    const n = cells.get(k) || 0;
    if (n >= perCell) continue;
    cells.set(k, n + 1);
    out.push(c);
  }
  return out;
}
