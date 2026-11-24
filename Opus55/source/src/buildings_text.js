// Tower phrase show (idea I-014): large Chinese characters on the water-facing faces of river-front towers.
//
// Each phrase (2-4 characters) is one composed sign spread over neighbouring front-row towers, one character per
// tower. Participants are chosen by a fixed rule (no camera positions):
//   - a tower (stack of shaft parts) at least 100 m tall, in a hillside, urban, Bund or CBD district;
//   - front row: one of its flat faces has water in front of it within 700 m, and no tower (on the ground or on a
//     podium, reaching 40 m above the ground) stands between that face and the water;
//   - a phrase uses neighbouring front-row towers of one bank (no other front-row tower between them in the row),
//     with face normals within 25 degrees of each other, evenly spaced along the tangent and nearly in one plane;
//   - every character of a phrase has the same size and the same height (one band), sized to fit the smallest
//     face with a clear margin on both sides;
//   - the largest phrases are kept first; at most 2 phrases per district, 500 m apart along a bank, and no
//     character repeated in a district.
// Characters are ordered left to right for a viewer on the water facing the phrase.
//
// The characters are drawn by a separate overlay pass over the chosen tower parts (see TEXT_WGSL): it writes only
// the emissive G-buffer target, dims the lit windows under each character panel, then adds the character. The
// glyphs are signed distance fields, so large characters keep smooth strokes.

import { FLAG, MAT, PART_FLOATS, TEXT_MAX } from './buildings_wgsl.js';
import { DT, DISTRICTS } from './world.js';

export { TEXT_MAX };   // capacity of each overlay draw list (TEXT_STRIDE in CULL_WGSL)

// All rule constants.
export const RULE = {
  minHeight: 100,     // tower top above the ground (m)
  reach: 700,         // water must be within this distance of the tower centre (m)
  dirs: 16,           // directions marched to find water
  cone: 0.866,        // water counts as in front of a face within 30 degrees of its normal
  blockH: 40,         // a ground-standing building at least this tall between a face and the water hides it
  minGlyph: 15,       // smallest character slot (m)
  maxGlyph: 60,       // largest character slot (m)
  sideMargin: 0.1,    // clear face width beside the slot on each side, as a fraction of the slot (ink is ~0.87)
  vMargin: 0.1,       // clear part height above and below the slot, as a fraction of the slot
  minBase: 40,        // keep the slot this far above the ground (clear of trees and low buildings, m)
  maxAngle: 25,       // largest angle between the face normals of one phrase (degrees)
  stepMin: 1.3,       // spacing of neighbouring characters along the tangent, in slot sizes: at least ...
  stepMax: 6.0,       // ... and at most
  evenness: 1.8,      // largest spacing / smallest spacing within a phrase
  depthRatio: 0.45,   // depth offset between neighbouring faces / their spacing (keeps the order to ~65 degrees)
  holeDepth: 25,     // a tower between two characters leaves a hole unless it stands this far behind the row (m)
  phraseGap: 500,     // two phrases on one bank are at least this far apart along the bank (m)
  perDistrict: 2,     // phrases per district
  maxPhrases: 8,
  maxTowers: 40,
  seed: 1408,
};
const COS_MAX = Math.cos(RULE.maxAngle * Math.PI / 180);

// Low-stroke phrases (every character at most 9 strokes, no character repeated within a phrase).
export const PHRASES = {
  2: ['山城', '江城', '两江', '天光', '大江', '月光'],
  3: ['不夜城', '山水城', '江上月', '光之城', '云中城'],
  4: ['山城不夜', '江城不夜', '千里江山', '天下山城'],
};

// Warm white, gold, red, cyan.
export const PALETTE = [[1.0, 0.86, 0.68], [1.0, 0.66, 0.22], [1.0, 0.2, 0.14], [0.25, 0.88, 1.0]];

const SHAFT_MATS = new Set([MAT.RES, MAT.OFFICE, MAT.GLASS, MAT.TRUSS, MAT.CRYSTAL]);
const TEXT_DISTRICTS = new Set([DT.HILLSIDE, DT.URBAN, DT.BUND, DT.CBD]);

// Small deterministic hash -> [0, 1).
export function hash01(...v) {
  let h = 2166136261 >>> 0;
  for (const x of v) {
    h ^= Math.floor(x * 1000) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
  }
  return (h >>> 0) / 4294967296;
}

// Reads one part record into a plain object.
export function readPart(P, i) {
  const d = P.data, k = i * PART_FLOATS;
  return {
    i, x: d[k], y0: d[k + 1], z: d[k + 2], a: d[k + 3], hw: d[k + 4], hd: d[k + 5], h: d[k + 6],
    kind: Math.round(d[k + 8]), prm: d[k + 9], taper: d[k + 10], twist: d[k + 11],
    lx: d[k + 12], lz: d[k + 13], prof: d[k + 14], flags: d[k + 15], mat: Math.round(d[k + 16]), baseY: d[k + 19],
  };
}

const rot = (a, x, z) => { const c = Math.cos(a), s = Math.sin(a); return [c * x - s * z, s * x + c * z]; };
const norm = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };

// Plan scale of a tapered part at height y (linear taper profile).
export const taperAt = (p, y) => 1 + (p.taper - 1) * Math.min(1, Math.max(0, (y - p.y0) / p.h));

// Flat faces of one part that can carry a character: [{ D: outward normal (world xz, unit), m: face midpoint
// relative to the part axis (world xz, at taper scale 1), uC: midpoint along the tangent T = (D.z, -D.x),
// W: usable face width at taper scale 1 }]. Round plans (cylinders, ellipses, lobed plans, polygons with 12 or more
// sides), twisted and profiled parts have no flat faces and carry nothing.
export function partFaces(p) {
  if (p.twist !== 0 || p.prof !== 0) return [];
  const faces = [];
  const add = (n, m, w) => {
    const [nx, nz] = rot(p.a, n[0], n[1]);
    const [mx, mz] = rot(p.a, m[0], m[1]);
    faces.push({ D: [nx, nz], m: [mx, mz], uC: mx * nz - mz * nx, W: w });
  };
  const { hw, hd, kind, prm } = p;
  if (kind <= 1) {
    // rectangle with rounded (0) or chamfered (1) corners of radius r: the straight part plus half of each corner
    const r = Math.min(1, Math.max(0, prm)) * Math.min(hw, hd);
    add([0, 1], [0, hd], 2 * hw - r); add([-1, 0], [-hw, 0], 2 * hd - r);
    add([0, -1], [0, -hd], 2 * hw - r); add([1, 0], [hw, 0], 2 * hd - r);
  } else if (kind === 4) {
    // triangle (matches ringEval kind 4)
    const v = [[hw, -hd], [hw, hd], [-hw, 0]];
    for (let k = 0; k < 3; k++) {
      const a = v[k], b = v[(k + 1) % 3];
      const ex = b[0] - a[0], ez = b[1] - a[1];
      add(norm(ez, -ex), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], Math.hypot(ex, ez));
    }
  } else if (kind === 2 && prm < 12) {
    // polygon with N sides (matches ringEval kind 2, N < 12): vertices on the ellipse (hw, hd) / cos(pi / N)
    const N = Math.max(3, Math.round(prm));
    const off = Math.PI / N, sc = 1 / Math.cos(off);
    const vert = (k) => [Math.cos(k / N * Math.PI * 2 + off) * hw * sc, Math.sin(k / N * Math.PI * 2 + off) * hd * sc];
    for (let k = 0; k < N; k++) {
      const a = vert(k), b = vert(k + 1);
      const na = (k + 0.5) / N * Math.PI * 2 + off;
      add(norm(Math.cos(na) / hw, Math.sin(na) / hd), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
  }
  return faces;
}

// Common band for a set of faces: the largest slot g (same for all) and its centre height yC, placed as high as the
// lowest part top allows, with clear margins above, below and on both sides of every face. Each entry is
// { p, f, lo } (lo = lowest allowed slot bottom). Returns { g, yC } or null when g < RULE.minGlyph.
export function fitBand(list) {
  const hi = Math.min(...list.map((o) => o.p.y0 + o.p.h));
  const lo = Math.max(...list.map((o) => o.lo));
  const side = 1 + 2 * RULE.sideMargin, vert = 1 + 2 * RULE.vMargin;
  const fits = (g) => {
    const yt = hi - RULE.vMargin * g, yb = yt - g;
    if (yb - RULE.vMargin * g < lo) return false;
    for (const o of list) {
      const w = o.f.W * Math.min(taperAt(o.p, yt), taperAt(o.p, yb));
      if (w < side * g) return false;
    }
    return true;
  };
  let g = Math.min(RULE.maxGlyph, (hi - lo) / vert);
  for (let it = 0; it < 6; it++) {
    const yt = hi - RULE.vMargin * g, yb = yt - g;
    for (const o of list) g = Math.min(g, o.f.W * Math.min(taperAt(o.p, yt), taperAt(o.p, yb)) / side);
  }
  while (g >= RULE.minGlyph && !fits(g)) g *= 0.97;
  if (g < RULE.minGlyph) return null;
  return { g, yC: hi - RULE.vMargin * g - 0.5 * g };
}

// World xz position of a face midpoint at height y (lean moves the axis, taper scales the plan).
export function faceCentre(p, f, y) {
  const hf = Math.min(1, Math.max(0, (y - p.y0) / p.h));
  const s = taperAt(p, y);
  return [p.x + p.lx * hf + f.m[0] * s, p.z + p.lz * hf + f.m[1] * s];
}

// Counts of rejected candidate phrases by reason (reported in the stats).
export const REJECT = {};
const rj = (k) => { REJECT[k] = (REJECT[k] || 0) + 1; return null; };

// Checks one candidate phrase (options of neighbouring towers) against the composition rules. Returns
// { list (in reading order), g, yC, Dm } or null.
//  - face normals within RULE.maxAngle of each other;
//  - one band (same size and height) that fits every face with margins;
//  - ordered along the tangent of the mean normal, spaced 1.3-6 slot sizes apart, evenly, nearly in one plane;
//  - no hole: `others` (the bank's other front-row towers) may not stand between two characters in the row.
export function fitPhrase(opts, others = []) {
  for (let a = 0; a < opts.length; a++) {
    for (let b = a + 1; b < opts.length; b++) {
      if (opts[a].f.D[0] * opts[b].f.D[0] + opts[a].f.D[1] * opts[b].f.D[1] < COS_MAX) return rj('angle');
    }
  }
  const band = fitBand(opts);
  if (!band) return rj('band');
  const { g, yC } = band;
  let sx = 0, sz = 0;
  for (const o of opts) { sx += o.f.D[0]; sz += o.f.D[1]; }
  const Dm = norm(sx, sz);
  const T = [Dm[1], -Dm[0]];   // right-hand direction for a viewer looking along -Dm (camera yaw 0 looks along -z)
  const pos = opts.map((o) => {
    const c = faceCentre(o.p, o.f, yC);
    return { o, c, u: c[0] * T[0] + c[1] * T[1], d: c[0] * Dm[0] + c[1] * Dm[1] };
  }).sort((a, b) => a.u - b.u);
  const steps = [];
  for (let k = 1; k < pos.length; k++) {
    const du = pos[k].u - pos[k - 1].u;
    if (du < RULE.stepMin * g) return rj('stepMin');
    if (du > RULE.stepMax * g) return rj('stepMax');
    if (Math.abs(pos[k].d - pos[k - 1].d) > RULE.depthRatio * du) return rj('depth');
    steps.push(du);
  }
  if (steps.length > 1 && Math.max(...steps) > RULE.evenness * Math.min(...steps)) return rj('even');
  // no hole: no other front-row tower reaching the band stands between two neighbours in the same row (or in
  // front of it); towers clearly behind the row are fine
  const members = new Set(opts.map((o) => o.t));
  const tc = (t) => ({ u: t.x * T[0] + t.z * T[1], d: t.x * Dm[0] + t.z * Dm[1] });
  for (let k = 1; k < pos.length; k++) {
    const a = tc(pos[k - 1].o.t), b = tc(pos[k].o.t);
    for (const ob of others) {
      if (members.has(ob.t) || ob.t.top < yC - 0.5 * g) continue;
      const q = tc(ob.t);
      if (q.u <= Math.min(a.u, b.u) + 0.5 * g || q.u >= Math.max(a.u, b.u) - 0.5 * g) continue;
      const dLine = a.d + (b.d - a.d) * (q.u - a.u) / (b.u - a.u || 1);
      if (q.d > dLine - RULE.holeDepth) return rj('hole');
    }
  }
  return { list: pos.map((q) => ({ ...q.o, c: q.c })), g, yC, Dm };
}

// Groups parts into towers by their plan centre (tower() and the landmarks stack segments on one axis).
export function groupTowers(P, world) {
  const map = new Map();
  for (let i = 0; i < P.count; i++) {
    const p = readPart(P, i);
    if (p.flags & (FLAG.PROP | FLAG.DETAIL)) continue;
    if (p.h < 12 || Math.min(p.hw, p.hd) < 4) continue;
    const key = Math.round(p.x / 2) + ',' + Math.round(p.z / 2);
    let t = map.get(key);
    if (!t) { t = { x: p.x, z: p.z, parts: [], top: -1e9, y0: 1e9, r: 0, shaft: false }; map.set(key, t); }
    t.parts.push(p);
    t.top = Math.max(t.top, p.y0 + p.h);
    t.y0 = Math.min(t.y0, p.y0);
    t.r = Math.max(t.r, Math.max(p.hw, p.hd));
    if (SHAFT_MATS.has(p.mat)) t.shaft = true;
  }
  const towers = [...map.values()];
  for (const t of towers) t.ground = world.heightAt(t.x, t.z);
  return towers;
}

// Distance to the first water along each of RULE.dirs directions (Infinity when none within reach), or null when
// no water is within reach at all.
export function waterHits(world, x, z) {
  if (world.waterDist(x, z) > RULE.reach) return null;
  const hits = [];
  for (let k = 0; k < RULE.dirs; k++) {
    const an = k / RULE.dirs * Math.PI * 2;
    const dx = Math.cos(an), dz = Math.sin(an);
    let s = 0, hit = Infinity;
    while (s <= RULE.reach) {
      const w = world.waterDist(x + dx * s, z + dz * s);
      if (w < 0) { hit = s; break; }
      s += Math.max(w, 10);   // the water distance never overshoots the water edge
    }
    hits.push({ d: [dx, dz], s: hit });
  }
  return hits.some((h) => h.s < Infinity) ? hits : null;
}

// Water distance in front of a face: the nearest hit among marched directions within 30 degrees of its normal.
export function faceWater(hits, D) {
  let best = Infinity;
  for (const h of hits) if (h.d[0] * D[0] + h.d[1] * D[1] >= RULE.cone) best = Math.min(best, h.s);
  return best;
}

// True when a tower that would hide the character stands between the face and the water.
export function blocked(blockers, t, f, wdist) {
  const D = f.D, T = [D[1], -D[0]];
  for (const o of blockers) {
    if (o === t) continue;
    const rx = o.x - t.x, rz = o.z - t.z;
    const along = rx * D[0] + rz * D[1];
    if (along <= 0 || along > wdist + 30) continue;
    if (Math.abs(rx * T[0] + rz * T[1]) < 0.5 * f.W + 0.8 * o.r) return true;
  }
  return false;
}

// River id, side and position along the river (arc length) of the bank point nearest to (hx, hz).
export function bankOf(world, x, z, hx, hz) {
  if (!world._textSegs) {
    // tag each river segment with a river id and its cumulative arc length
    const segs = [];
    let river = 0, s = 0;
    world.segs.forEach((g, i) => {
      if (i > 0) {
        const p = world.segs[i - 1];
        if (Math.abs(p[2] - g[0]) > 1e-3 || Math.abs(p[3] - g[1]) > 1e-3) { river++; s = 0; }
      }
      segs.push({ g, river, s });
      s += Math.hypot(g[2] - g[0], g[3] - g[1]);
    });
    world._textSegs = segs;
  }
  let best = null, bd = 1e18;
  for (const e of world._textSegs) {
    const g = e.g;
    const bx = g[2] - g[0], bz = g[3] - g[1];
    const L2 = bx * bx + bz * bz || 1;
    const h = Math.max(0, Math.min(1, ((hx - g[0]) * bx + (hz - g[1]) * bz) / L2));
    const px = g[0] + bx * h, pz = g[1] + bz * h;
    const d = (hx - px) ** 2 + (hz - pz) ** 2;
    if (d < bd) { bd = d; best = { e, h, bx, bz }; }
  }
  const { e, h, bx, bz } = best;
  const side = Math.sign(bx * (z - e.g[1]) - bz * (x - e.g[0])) || 1;
  return { key: e.river + ':' + side, along: e.s + h * Math.hypot(bx, bz) };
}

// Every candidate phrase on one bank: 2-4 front-row towers taken in order along the bank, one face each, checked
// by fitPhrase. `bankTowers` is [{ t, along, opts }] sorted by `along`. Towers may be skipped only when they do not
// leave a hole in the sign (see fitPhrase).
export function bankPhrases(bankTowers) {
  const out = [];
  const side = 1 + 2 * RULE.sideMargin;
  const pick = [], idx = [];
  const walk = (last, gUp) => {
    if (pick.length >= 2) {
      const ph = fitPhrase(pick, bankTowers);
      if (ph) out.push(ph);
    }
    if (pick.length === 4) return;
    for (let j = last + 1; j < bankTowers.length; j++) {
      const b = bankTowers[j];
      // neighbours are at most stepMax slot sizes apart (with slack: the bank and the tangent differ a little)
      if (b.along - bankTowers[last].along > 1.25 * RULE.stepMax * gUp) break;
      for (const o of b.opts) {
        // prune early: normals must agree with every earlier pick, and a common band must stay possible
        let ok = true;
        for (let k = 0; k < pick.length && ok; k++) {
          const q = pick[k];
          if (q.f.D[0] * o.f.D[0] + q.f.D[1] * o.f.D[1] < COS_MAX) { ok = false; rj('pAngle'); }
          else if (Math.min(q.p.y0 + q.p.h, o.p.y0 + o.p.h) - Math.max(q.lo, o.lo) < (1 + 2 * RULE.vMargin) * RULE.minGlyph) { ok = false; rj('pBand'); }
        }
        if (!ok) continue;
        const g = Math.min(gUp, o.f.W * Math.max(o.p.taper, 1) / side);
        if (g < RULE.minGlyph) continue;
        pick.push(o); idx.push(j);
        walk(j, g);
        pick.pop(); idx.pop();
      }
    }
  };
  for (let s = 0; s < bankTowers.length; s++) {
    for (const o of bankTowers[s].opts) {
      const g = Math.min(RULE.maxGlyph, o.f.W * Math.max(o.p.taper, 1) / side);
      if (g < RULE.minGlyph) continue;
      pick.push(o); idx.push(s);
      walk(s, g);
      pick.pop(); idx.pop();
    }
  }
  return out;
}

// Picks the phrase text: K characters, none already used in the given districts; texts not used anywhere else are
// preferred. Returns the text or null.
export function pickText(K, districts, usedChars, usedTexts, h) {
  const free = PHRASES[K].filter((p) => [...p].every((ch) => districts.every((d) => !(usedChars.get(d) || new Set()).has(ch))));
  if (!free.length) return null;
  const fresh = free.filter((p) => !usedTexts.has(p));
  const list = fresh.length ? fresh : free;
  return list[Math.floor(h * list.length) % list.length];
}

// Chooses the phrases from the front-row towers of every bank (Map: bank key -> [{ t, along, opts }]): all
// candidate phrases, largest first, without sharing towers, with gaps along each bank, few per district, and a
// text whose characters are not used elsewhere in the same districts. Returns { kept, candidates }.
export function choosePhrases(banks) {
  // candidate phrases on every bank
  const cands = [];
  for (const [key, list] of [...banks.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    list.sort((a, b) => a.along - b.along);
    for (const ph of bankPhrases(list)) {
      ph.bank = key;
      ph.span = [Math.min(...ph.list.map((o) => o.along)), Math.max(...ph.list.map((o) => o.along))];
      ph.score = ph.list.length * ph.g * ph.g;   // character area: larger and complete phrases first
      ph.h = hash01(RULE.seed, ph.list[0].t.x, ph.list[0].t.z, ph.list.length);
      cands.push(ph);
    }
  }
  // keep the largest phrases first, without sharing towers, with gaps along each bank, few per district
  cands.sort((a, b) => b.score - a.score || a.h - b.h);
  const usedTowers = new Set(), usedChars = new Map(), usedTexts = new Set(), perDistrict = new Map();
  const kept = [];
  let total = 0;
  for (const ph of cands) {
    if (kept.length >= RULE.maxPhrases || total + ph.list.length > RULE.maxTowers) continue;
    if (ph.list.some((o) => usedTowers.has(o.t))) continue;
    if (kept.some((k) => k.bank === ph.bank && ph.span[0] - k.span[1] < RULE.phraseGap && k.span[0] - ph.span[1] < RULE.phraseGap)) continue;
    const districts = [...new Set(ph.list.map((o) => o.district))];
    if (districts.some((d) => (perDistrict.get(d) || 0) >= RULE.perDistrict)) continue;
    const text = pickText(ph.list.length, districts, usedChars, usedTexts, ph.h);
    if (!text) continue;
    ph.text = text;
    kept.push(ph);
    total += ph.list.length;
    usedTexts.add(text);
    for (const o of ph.list) usedTowers.add(o.t);
    for (const d of districts) {
      perDistrict.set(d, (perDistrict.get(d) || 0) + 1);
      if (!usedChars.has(d)) usedChars.set(d, new Set());
      for (const ch of text) usedChars.get(d).add(ch);
    }
  }
  return { kept, candidates: cands.length };
}

// Full participation rule. Returns { glyphs: [...], chars: [unique characters], phrases: [...], stats }.
export function selectTowerText(world, P) {
  for (const k of Object.keys(REJECT)) delete REJECT[k];
  const towers = groupTowers(P, world);
  // front-row blockers: towers reaching blockH above the ground, either standing on the ground or with at least
  // blockH of their own height (towers on podiums count; skybridges and the vault garden do not)
  const blockers = towers.filter((o) => o.top - o.ground >= RULE.blockH && (o.y0 - o.ground < 15 || o.top - o.y0 >= RULE.blockH));
  const stats = { towers: towers.length, tall: 0, sight: 0, front: 0, candidates: 0, chosen: 0, byDistrict: {} };
  const banks = new Map();
  for (const t of towers) {
    if (!t.shaft || t.top - t.ground < RULE.minHeight) continue;
    const di = world.districtAt(t.x, t.z).index;
    if (di < 0 || !TEXT_DISTRICTS.has(DISTRICTS[di].type)) continue;
    stats.tall++;
    const hits = waterHits(world, t.x, t.z);
    if (!hits) continue;
    stats.sight++;
    // every flat face of a shaft part with water in front of it and no tower in between, grouped by bank
    const mine = new Map();
    for (const p of t.parts) {
      if (!SHAFT_MATS.has(p.mat)) continue;
      for (const f of partFaces(p)) {
        const wdist = faceWater(hits, f.D);
        if (wdist === Infinity || blocked(blockers, t, f, wdist)) continue;
        const b = bankOf(world, t.x, t.z, t.x + f.D[0] * wdist, t.z + f.D[1] * wdist);
        const o = { t, p, f, wdist, lo: Math.max(p.y0, t.ground + RULE.minBase), along: b.along, district: DISTRICTS[di].name };
        if (!mine.has(b.key)) mine.set(b.key, []);
        mine.get(b.key).push(o);
      }
    }
    if (!mine.size) continue;
    stats.front++;
    for (const [key, opts] of mine) {
      if (!banks.has(key)) banks.set(key, []);
      banks.get(key).push({ t, along: opts.reduce((s, o) => s + o.along, 0) / opts.length, opts });
    }
  }
  const { kept, candidates } = choosePhrases(banks);
  stats.candidates = candidates;
  stats.reject = { ...REJECT };
  // glyph records: one size, one band, one colour per phrase; index = reading order
  const glyphs = [], chars = [], phrases = [];
  kept.forEach((ph, pi) => {
    const col = PALETTE[Math.floor(hash01(RULE.seed, pi, 13) * PALETTE.length) % PALETTE.length];
    const text = [...ph.text];
    ph.list.forEach((o, k) => {
      const ch = text[k];
      let layer = chars.indexOf(ch);
      if (layer < 0) { layer = chars.length; chars.push(ch); }
      glyphs.push({ part: o.p.i, D: o.f.D, uC: o.f.uC * taperAt(o.p, ph.yC), yC: ph.yC, g: ph.g, layer, index: k, col, char: ch,
        phrase: ph.text, x: o.c[0], z: o.c[1], district: o.district });
      stats.byDistrict[o.district] = (stats.byDistrict[o.district] || 0) + 1;
    });
    const cx = ph.list.reduce((s, o) => s + o.c[0], 0) / ph.list.length;
    const cz = ph.list.reduce((s, o) => s + o.c[1], 0) / ph.list.length;
    phrases.push({ text: ph.text, x: cx, y: ph.yC, z: cz, D: ph.Dm, g: ph.g, wdist: Math.min(...ph.list.map((o) => o.wdist)), district: ph.list[0].district });
  });
  stats.chosen = glyphs.length;
  stats.phrases = phrases.map((p) => p.text);
  return { glyphs, chars, phrases, stats };
}

// GPU slot records: 4 x vec4f per character.
//  a: face direction x, z, slot centre along the tangent, slot centre y
//  b: slot side g, atlas layer, index in the phrase, 0
//  c: colour rgb, standby brightness
//  d: unused
export const SLOT_FLOATS = 16;
export const STANDBY = 2.6;   // HDR emission of a character outside the show (lit windows are ~0.5-3)

export function packSlots(glyphs) {
  const out = new Float32Array(Math.max(1, glyphs.length) * SLOT_FLOATS);
  glyphs.forEach((g, i) => {
    out.set([g.D[0], g.D[1], g.uC, g.yC, g.g, g.layer, g.index, 0, g.col[0], g.col[1], g.col[2], STANDBY, 0, 0, 0, 0], i * SLOT_FLOATS);
  });
  return out;
}

// ---------------------------------------------------------------- glyph layers
// One 256x256 rgba8 layer per character, full mip chain:
//   R: signed distance to the stroke edge (0.5 = edge, higher inside), +-SDF_RANGE texels over 0..1
//   G: blurred halo (dims the windows around the strokes)
//   B: coverage (used once a pixel covers several texels)
// The distance field comes from a 512 px rendering, so magnified characters keep smooth strokes.
export const GLYPH_RES = 256;
export const SDF_RANGE = 12;   // texels (at 256) mapped onto the 0..1 range

// Squared Euclidean distance transform of a 1D sampled function (Felzenszwalb and Huttenlocher).
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

// Squared distance from every pixel to the nearest pixel where `inside(i)` is true (n x n grid).
export function edt2d(n, inside) {
  const BIG = 1e20;
  const g = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) g[i] = inside(i) ? 0 : BIG;
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) f[y] = g[y * n + x];
    edt1d(f, n, d, v, z);
    for (let y = 0; y < n; y++) g[y * n + x] = d[y];
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) f[x] = g[y * n + x];
    edt1d(f, n, d, v, z);
    for (let x = 0; x < n; x++) g[y * n + x] = d[x];
  }
  return g;
}

// Signed distance field (in output texels, positive inside) at n/2 resolution from an n x n coverage mask.
export function signedField(cov, n) {
  const ins = (i) => cov[i] >= 0.5;
  const dOut = edt2d(n, ins);                    // outside pixels: distance to the nearest inside pixel
  const dIn = edt2d(n, (i) => !ins(i));          // inside pixels: distance to the nearest outside pixel
  const sd = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) sd[i] = ins(i) ? Math.sqrt(dIn[i]) - 0.5 : 0.5 - Math.sqrt(dOut[i]);
  const m = n / 2, out = new Float32Array(m * m);
  for (let y = 0; y < m; y++) {
    for (let x = 0; x < m; x++) {
      const i = 2 * y * n + 2 * x;
      out[y * m + x] = (sd[i] + sd[i + 1] + sd[i + n] + sd[i + n + 1]) / 8;   // mean, halved to output texels
    }
  }
  return out;
}

export function buildGlyphArray(device, chars) {
  const N = GLYPH_RES, HI = 2 * N, layers = Math.max(1, chars.length);
  const levels = Math.log2(N) + 1;
  const tex = device.createTexture({ label: 'tower-glyphs', size: [N, N, layers], dimension: '2d', format: 'rgba8unorm', mipLevelCount: levels, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  chars.forEach((ch, layer) => {
    const hi = new OffscreenCanvas(HI, HI);
    const gh = hi.getContext('2d');
    gh.fillStyle = '#000'; gh.fillRect(0, 0, HI, HI);
    gh.fillStyle = '#fff'; gh.textAlign = 'center'; gh.textBaseline = 'middle';
    gh.font = `bold ${Math.round(HI * 0.84)}px "Microsoft YaHei", "SimHei", sans-serif`;
    gh.fillText(ch, HI / 2, HI / 2 + HI * 0.03);
    const hd = gh.getImageData(0, 0, HI, HI).data;
    const cov = new Float32Array(HI * HI);
    for (let i = 0; i < HI * HI; i++) cov[i] = hd[i * 4] / 255;
    const sd = signedField(cov, HI);
    // coverage and halo at 256
    const a = new OffscreenCanvas(N, N);
    const ga = a.getContext('2d');
    ga.imageSmoothingQuality = 'high';
    ga.drawImage(hi, 0, 0, N, N);
    const b = new OffscreenCanvas(N, N);
    const gb = b.getContext('2d');
    gb.filter = 'blur(7px)'; gb.drawImage(a, 0, 0);
    gb.globalCompositeOperation = 'lighter'; gb.drawImage(b, 0, 0);
    const da = ga.getImageData(0, 0, N, N).data, db = gb.getImageData(0, 0, N, N).data;
    // level 0 as floats, then box-filtered mips
    let w = N;
    let lev = new Float32Array(N * N * 4);
    for (let i = 0; i < N * N; i++) {
      lev[i * 4] = Math.min(1, Math.max(0, 0.5 + sd[i] / (2 * SDF_RANGE)));
      lev[i * 4 + 1] = db[i * 4] / 255;
      lev[i * 4 + 2] = da[i * 4] / 255;
      lev[i * 4 + 3] = 1;
    }
    for (let l = 0; l < levels; l++) {
      if (l > 0) {
        const nw = Math.max(1, w >> 1), nx = new Float32Array(nw * nw * 4);
        for (let y = 0; y < nw; y++) {
          for (let x = 0; x < nw; x++) {
            for (let c = 0; c < 4; c++) {
              const at = (yy, xx) => lev[(yy * w + xx) * 4 + c];
              nx[(y * nw + x) * 4 + c] = (at(2 * y, 2 * x) + at(2 * y, 2 * x + 1) + at(2 * y + 1, 2 * x) + at(2 * y + 1, 2 * x + 1)) / 4;
            }
          }
        }
        lev = nx; w = nw;
      }
      const out = new Uint8Array(w * w * 4);
      for (let i = 0; i < out.length; i++) out[i] = Math.round(lev[i] * 255);
      device.queue.writeTexture({ texture: tex, mipLevel: l, origin: [0, 0, layer] }, out, { bytesPerRow: w * 4 }, [w, w, 1]);
    }
  });
  return tex;
}

// Overlay fragment shader. Appended to the buildings draw module (it reuses the parts buffer, VOut and vs).
export const TEXT_WGSL = /* wgsl */ `
struct TextSlot { a: vec4f, b: vec4f, c: vec4f, d: vec4f };
@group(2) @binding(0) var<storage, read> textMap: array<u32>;        // part index -> slot + 1 (0 = none)
@group(2) @binding(1) var<storage, read> textSlots: array<TextSlot>;
@group(2) @binding(2) var glyphTex: texture_2d_array<f32>;

const LED_CELLS = 48.0;   // LED cells across one character slot (a fine surface pattern only)
const GLYPH_RES = ${GLYPH_RES}.0;
const SDF_RANGE = ${SDF_RANGE}.0;

@fragment fn fsText(i: VOut) -> GOut {
  let P = parts[i.info.x];
  let S = textSlots[max(textMap[i.info.x], 1u) - 1u];
  let D = S.a.xy;
  let T = vec2f(D.y, -D.x);
  let g = S.b.x;
  // lean moves the axis with height; projecting on the tangent keeps taper and rounded corners right
  let hf = (i.wp.y - P.a.y) / max(P.b.z, 1.0);
  let axis = vec2f(P.a.x, P.a.z) + P.d.xy * hf;
  let rel = i.wp.xz - axis;
  let uv = vec2f((dot(rel, T) - S.a.z) / g + 0.5, 0.5 - (i.wp.y - S.a.w) / g);
  // derivatives in uniform control flow (before any discard)
  let fuv = max(fwidth(uv), vec2f(1e-6));
  let layer = i32(S.b.y + 0.5);

  // glyph: distance field with a one-pixel edge while magnified, filtered coverage once a pixel spans texels
  let tx = fuv * GLYPH_RES;                          // texels per pixel along u and v
  let tpp = max(tx.x, tx.y);
  let sd = textureSampleLevel(glyphTex, sampClamp, uv, layer, 0.0).r;
  let dist = (sd - 0.5) * 2.0 * SDF_RANGE;           // texels, positive inside the strokes
  let sharp = saturate(dist / max(0.5 * (tx.x + tx.y), 1e-3) + 0.5);
  let far = textureSampleLevel(glyphTex, sampClamp, uv, layer, log2(max(tpp, 1e-3)));
  let glyph = mix(sharp, far.b, smoothstep(1.5, 3.0, tpp));
  // LED dots: a mild surface pattern only while a cell is wider than ~8 px, gone by 4 px (never aliases)
  let cellPx = 1.0 / (LED_CELLS * max(fuv.x, fuv.y));
  let dotM = 1.0 - smoothstep(0.28, 0.5, length(fract(uv * LED_CELLS) - vec2f(0.5)));
  let led = mix(1.0, 0.72 + 0.45 * dotM, smoothstep(4.0, 8.0, cellPx));

  // panel: the slot on the lit face only (not on caps or side faces), faded out at grazing views
  let n = normalize(i.n);
  let facing = dot(normalize(n.xz + vec2f(1e-5, 0.0)), D);
  let edge = min(min(uv.x, 1.0 - uv.x) / fuv.x, min(uv.y, 1.0 - uv.y) / fuv.y);
  let view = normalize(F.camPos.xyz - i.wp);
  let graze = smoothstep(0.34, 0.5, dot(view, vec3f(D.x, 0.0, D.y)));   // 20-30 degrees from the face plane
  let panel = saturate(edge + 0.5) * smoothstep(0.25, 0.4, facing) * graze
            * select(1.0, 0.0, (i.info.y & 256u) != 0u);
  if (panel <= 0.001) { discard; }

  // always on; during the river show the characters pulse with the beat, rippling along the phrase
  let beat = exp(-4.0 * fract(F.show.z - S.b.z * 0.15));
  let bright = S.c.w * mix(1.0, 1.5 + 0.5 * beat, F.show.x);
  var e = S.c.rgb * glyph * led * bright;
  // same aerial perspective as the facade emission
  let farK = smoothstep(450.0, 2600.0, length(F.camPos.xyz - i.wp));
  let eL = dot(e, vec3f(0.3, 0.5, 0.2));
  e = mix(e, mix(e, vec3f(eL), 0.25) / (1.0 + eL * 0.6), farK * 0.7);
  // dim the lit windows under the panel, most strongly around the strokes, then add the character
  let dim = panel * saturate(0.35 + 0.6 * far.g);
  var o: GOut;
  o.emissive = vec4f(e * panel, dim);
  return o;
}
`;
