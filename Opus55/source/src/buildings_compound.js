// Planned compounds (idea I-018): towers designed per street block, as Chinese residential compounds (xiaoqu),
// instead of lot by lot.
//
// In Yuzhong Peninsula (lots on the residential-tower path) and Nan'an Old Town (lots on the tower path), the tower
// lots of one street block form a compound. The compound draws one design from its own stream (plan type, window
// cell, finish, lit share, window class, crown, lighting) and every tower of the block uses it. Towers are unions of
// 2-4 boxes: cross point tower, stepped cross, Y tower, slab with light wells, twin point towers, and rounded slabs
// for office campuses.
//
// Kept as they were, by construction:
//  - each lot's podium, shopfront, street signs and shop light: only the lot's tower section (recorded by
//    buildings_gen.js without random draws) is replaced;
//  - every random stream: compounds are built after everything else (after the land-use plan infill), every part
//    they add has an explicit seed, and the replaced parts are removed afterwards by compaction (buildings.js);
//  - each district's height mix: compound heights are the replaced lots' own shaft heights, dealt out in sorted
//    order in contiguous chunks (one chunk per compound), so the height histogram is kept;
//  - the night accents (lit crowns, roof billboards, roof neon lines, EDGE and CROWNLIT towers): per district, the
//    compounds with the highest accent keys take each accent until its baseline count is reached;
//  - the tower-text show (I-014): its selection is made before compounds; lots that could change it are kept.

import { FLAG, MAT, PART_FLOATS } from './buildings_wgsl.js';
import { rng } from './math.js';
import { DT, DISTRICTS, LANDMARKS, MONORAIL_STATION } from './world.js';
import { Parts, PAL, crown, aviation, streetFacesBox, rectFaces } from './buildings_gen.js';
import { RULE, SHAFT_MATS, TEXT_DISTRICTS, groupTowers, waterHits, faceWater, partFaces } from './buildings_text.js';

// Every rule and weight. Frozen after the held-out tests (see the idea's DEVIATIONS.md for the hash).
export const RULES = {
  districts: [1, 5],              // Yuzhong Peninsula, Nan'an Old Town
  landmarks: ['raffles', 'ridge', 'beacon'],
  landmarkMargin: 60,             // lots within landmark radius + this are kept (m, lot centre)
  stationMargin: 120,             // lots within this of the Liziba monorail station are kept (landmark rule)
  complexMargin: 60,              // lots within this of the Hongyadong complex are kept
  // round 2 (judge-driven): lots kept as they are
  keepBridgeAnchors: true,        // lots whose tower anchors a skybridge (skybridges(), rng 5150)
  keepCrowns: ['lit', 'pagoda', 'spire', 'helipad', 'antenna'],   // lots whose tower has a distinctive crown kind
                                  // (stepped lit crown, pagoda, spire, helipad, antenna mast) as built by crown()
  streetInset: 1.5,               // tower to lot edge on street sides (m)
  lotGap: 4,                      // gap between the lots of a block (world.js _buildLots)
  gapK: 0.6,                      // gap between neighbouring towers of a compound >= gapK * W
  W: [17, 22],                    // target tower width (m)
  minW: 12,                       // a compound whose lots cannot fit this width stays as it was
  winToday: { 1: [2.8, 4.4], 5: [3.0, 4.5] },   // window cell of today's towers (m)
  winFine: [1.9, 2.4],
  fineWindows: false,             // decided by the held-out A/B (DEVIATIONS.md)
  contourTurns: false,            // decided by the held-out A/B (DEVIATIONS.md)
  turnGrad: 0.12, turnMax: 30, turnStep: 5,
  square: [['cross', 0.35], ['stepped', 0.15], ['y', 0.15]],
  long: [['slab', 0.6], ['twin', 0.4]],
  longAspect: 1.6,                // lot length / width above this is a long lot
  slabDepth: 13, slabWell: [2, 3], slabCore: 7,
  stepFloors: [4, 8],
  crestShare: 0.15,               // Yuzhong crest: blocks in the top 15% of ground height
  anchorHeight: 190,              // Yuzhong: lots at least this tall (top above ground; today's 62+ floor share) go
                                  // to crest compounds only (the "anchors")
  bridgeShare: 0.3,
  acDensity: { 1: 0.09, 5: 0.07 },
  balcShare: { 1: 0.45, 5: 0.35 },
  floorH: 3.0, officeFloorH: 3.8,
  // compound finishes, night albedo at the scale of PAL.res: white tile, cream, light grey, terracotta, blue-grey
  finishes: [[0.66, 0.65, 0.62], [0.64, 0.58, 0.48], [0.55, 0.56, 0.57], [0.58, 0.4, 0.32], [0.42, 0.47, 0.53]].map((c) => c.map((v) => v * 0.45)),
  classTol: { hs: 0.08, wh: 0.03, hb1: 0.1, margin: 0.003 },
};

// Dev switches (dev builds only): ?nocomp, ?cmpwin=fine|today, ?cmpturn=1|0
function activeRules() {
  const r = { ...RULES };
  if (typeof __DEV__ !== 'undefined' && __DEV__ && typeof location !== 'undefined') {
    const q = new URLSearchParams(location.search);
    if (q.has('nocomp')) r.off = true;
    if (q.get('cmpwin') === 'fine') r.fineWindows = true;
    if (q.get('cmpwin') === 'today') r.fineWindows = false;
    if (q.get('cmpturn') === '1') r.contourTurns = true;
    if (q.get('cmpturn') === '0') r.contourTurns = false;
  }
  return r;
}

// Hash of the rules (recorded when the rules are frozen).
export function rulesHash(r = RULES) {
  const s = JSON.stringify(r);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

function hash32(...v) {
  let h = 0x811c9dc5;
  for (const x of v) {
    h = Math.imul(h ^ (x | 0), 0x01000193) >>> 0;
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
  }
  return h >>> 0;
}

// ------------------------------------------------------------------ facade window classes (fix 4)
// The facade shader (buildings_wgsl.js windowGrid) derives from each part's seed: hs (window width and height share,
// apartment width), hb1 (lit share) and hb2 (light colour class). A compound draws one class; each tower draws seeds
// until the shader's hashes fall in it, so towers match in proportions and colour but differ in which windows are lit.

function pcg(v) {
  const s = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
}
const h11 = (v) => Math.fround(pcg(v)) / 4294967296;   // WGSL f32(pcg(v)) / 4294967295.0 (the divisor rounds to 2^32 in f32)
const f32u = (seed, k) => Math.trunc(Math.fround(Math.fround(seed) * k)) >>> 0;   // WGSL u32(seed * k)
const fract = (x) => x - Math.floor(x);

export function windowHashes(seed) {
  return { hs: h11(f32u(seed, 13) + 7), hb1: h11(f32u(seed, 17) + 31), hb2: h11(f32u(seed, 23) + 57) };
}

// Class of a seed for a material: what the shader shows (res: apartment width, window size, colour; office/glass:
// window height, colour), with the distance to the nearest class boundary.
function seedClass(seed, office) {
  const { hs, hb1, hb2 } = windowHashes(seed);
  const wh = office ? 0.5 + 0.12 * hs : 0.46 + 0.16 * fract(hs * 7.3);
  const cuts = office ? [0.35, 0.6, 0.85] : [0.32, 0.64];
  let col = 0;
  while (col < cuts.length && hb2 >= cuts[col]) col++;
  let edge = Math.min(...cuts.map((c) => Math.abs(hb2 - c)));
  let uw = 0;
  if (!office) {
    uw = hs * 1.99 < 1 ? 2 : 3;
    edge = Math.min(edge, Math.abs(hs - 1 / 1.99), fract(hs * 7.3), 1 - fract(hs * 7.3));
  }
  return { hs, hb1, hb2, wh, col, uw, edge };
}

function matches(k, t, tol) {
  return k.edge >= tol.margin && k.col === t.col && k.uw === t.uw && Math.abs(k.hs - t.hs) <= tol.hs &&
    Math.abs(k.wh - t.wh) <= tol.wh && Math.abs(k.hb1 - t.hb1) <= tol.hb1;
}

// seeds are multiples of 1/16 below 999 (exact in f32, same range as the generators' seeds)
const drawSeed = (R) => Math.floor(R() * 15984) / 16;

function windowClass(R, office, tol) {
  for (let i = 0; i < 1000; i++) { const s = drawSeed(R); const k = seedClass(s, office); if (k.edge >= 0.05) return k; }
  return seedClass(drawSeed(R), office);
}

function towerSeed(R, cls, office, tol) {
  for (let i = 0; i < 20000; i++) { const s = drawSeed(R); if (matches(seedClass(s, office), cls, tol)) return { seed: s, ok: true }; }
  return { seed: drawSeed(R), ok: false };
}

// ------------------------------------------------------------------ geometry helpers

const rot = (a, x, z) => { const c = Math.cos(a), s = Math.sin(a); return [x * c - z * s, x * s + z * c]; };

// Half extents (along the lot axes) of a set of boxes given in tower-local coordinates, turned by theta.
function extents(boxes, theta) {
  let ex = 0, ez = 0;
  for (const b of boxes) {
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const [lx, lz] = rot(b.a, sx * b.hw, sz * b.hd);
      const [x, z] = rot(theta, b.ox + lx, b.oz + lz);
      ex = Math.max(ex, Math.abs(x)); ez = Math.max(ez, Math.abs(z));
    }
  }
  return [ex, ez];
}

// Plans in tower-local coordinates (x along the lot's x axis before any turn). Every face length is a whole number
// of window cells c, so the junctions of the wings fall on piers between windows.
function crossPlan(nC, c, stepped) {
  const m = Math.max(1, Math.round(0.22 * nC));
  const W = nC * c, D = (nC - 2 * m) * c;
  return { kind: stepped ? 'stepped' : 'cross', W, boxes: [
    { ox: 0, oz: 0, a: 0, hw: W / 2, hd: D / 2, step: false },
    { ox: 0, oz: 0, a: 0, hw: D / 2, hd: W / 2, step: stepped },
  ], crown: { ox: 0, oz: 0, a: 0, hw: W / 2, hd: D / 2 } };
}

function yPlan(nC, c, flip) {
  const m = Math.max(1, Math.round(0.22 * nC));
  const Ww = (nC - 2 * m) * c, Rw = Math.max(2, Math.round(0.55 * nC)) * c;
  const boxes = [];
  for (let k = 0; k < 3; k++) {
    const phi = (flip ? -Math.PI / 2 : Math.PI / 2) + k * 2 * Math.PI / 3;
    boxes.push({ ox: Math.cos(phi) * Rw / 2, oz: Math.sin(phi) * Rw / 2, a: phi, hw: Rw / 2, hd: Ww / 2, step: false });
  }
  return { kind: 'y', W: nC * c, boxes, crown: { ox: 0, oz: 0, a: 0, hw: Ww * 0.4, hd: Ww * 0.4 } };
}

// slab along local x: three boxes Lb long, `well` apart, joined by a recessed core; light wells run full height
function slabPlan(len, depth, c, well, core) {
  const Lb = Math.floor((len - 2 * well) / 3 / c) * c;
  if (Lb < 2 * c) return null;
  const off = Lb + well;
  return { kind: 'slab', W: depth, boxes: [
    { ox: -off, oz: 0, a: 0, hw: Lb / 2, hd: depth / 2, step: false },
    { ox: 0, oz: 0, a: 0, hw: Lb / 2, hd: depth / 2, step: false },
    { ox: off, oz: 0, a: 0, hw: Lb / 2, hd: depth / 2, step: false },
    { ox: 0, oz: 0, a: 0, hw: off, hd: core / 2, step: false, core: true },
  ], crown: { ox: 0, oz: 0, a: 0, hw: Lb / 2, hd: depth / 2 } };
}

function officePlan(W) {
  return { kind: 'office', W, boxes: [{ ox: 0, oz: 0, a: 0, hw: W / 2, hd: W * 0.35, step: false, round: true }], crown: { ox: 0, oz: 0, a: 0, hw: W / 2, hd: W * 0.35 } };
}

const swapXZ = (plan) => ({ ...plan, boxes: plan.boxes.map((b) => ({ ...b, ox: b.oz, oz: b.ox, a: b.a + Math.PI / 2 })),
  crown: { ...plan.crown, ox: plan.crown.oz, oz: plan.crown.ox, a: plan.crown.a + Math.PI / 2 } });

// Free rectangle of a lot for towers (lot-local): street sides inset by streetInset, internal sides by enough that
// towers on neighbouring lots keep the compound gap. Returns [x0, x1, z0, z1].
function freeRect(L, gap, rules) {
  const st = streetFacesBox(L, L.x, L.z, L.w / 2, L.d / 2);   // +z, -x, -z, +x
  const inner = Math.max(rules.streetInset, (gap - rules.lotGap) / 2);
  const ins = (i) => (st[i] ? rules.streetInset : inner);
  return [-L.w / 2 + ins(1), L.w / 2 - ins(3), -L.d / 2 + ins(2), L.d / 2 - ins(0)];
}

// How many towers of half extent e fit along a free length A with the compound gap.
function fitCount(A, e, gap) {
  if (2 * e > A) return 0;
  let n = 1;
  while (A / (n + 1) - 2 * e >= gap) n++;
  return n;
}

// Tower placements (lot-local centres) for one lot and plan, or null when it does not fit.
function placeLot(L, plan, theta, gap, rules, wantTwo) {
  const [x0, x1, z0, z1] = freeRect(L, gap, rules);
  const Ax = x1 - x0, Az = z1 - z0;
  const [ex, ez] = extents(plan.boxes, theta);
  const nx = fitCount(Ax, ex, gap), nz = fitCount(Az, ez, gap);
  if (!nx || !nz) return null;
  if (wantTwo && Math.max(nx, nz) < 2) return null;
  const out = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    out.push([x0 + (i + 0.5) * Ax / nx, z0 + (j + 0.5) * Az / nz]);
  }
  return out;
}

// ------------------------------------------------------------------ which lots are kept (world rules only)

function keptByLandmarks(L, rules) {
  for (const id of rules.landmarks) {
    const lm = LANDMARKS.find((o) => o.id === id);
    if (lm && Math.hypot(L.x - lm.x, L.z - lm.z) < lm.r + rules.landmarkMargin) return 'landmark';
  }
  if (Math.hypot(L.x - MONORAIL_STATION.x, L.z - MONORAIL_STATION.z) < rules.stationMargin) return 'station';
  return null;
}

// Lots near the Hongyadong complex (its parts' plan centres, within complexMargin of the lot's rectangle).
function complexPoints(B) {
  const st = B.sites.stilts;
  const pts = [];
  if (!st || !st.ranges) return pts;
  for (const [a, b] of st.ranges) for (let i = a; i < b; i++) pts.push([B.P.get(i, 0), B.P.get(i, 2)]);
  return pts;
}

// I-014 tower text (fix 3). The selection itself is made before the compounds (buildings.js), so it cannot change.
// Kept as well, so the river front stays as I-014 sees it:
//  - textFront: lots holding a tower (any height) with a water-facing face within RULE.reach that no blocker hides
//    (the front row of every bank);
//  - textCorridor: lots standing in the sight corridor between such a face and the water (a taller compound tower
//    there would hide it).
// Returns Map(lot record index -> reason).
function textExclusions(B, world, recs, candIdx) {
  const P = B.P;
  const towers = groupTowers(P, world);
  const partLot = new Int32Array(P.count).fill(-1);
  recs.forEach((r, k) => { for (let i = r.p0; i < r.p1; i++) partLot[i] = k; });
  const blockers = towers.filter((o) => o.top - o.ground >= RULE.blockH && (o.y0 - o.ground < 15 || o.top - o.y0 >= RULE.blockH));
  const out = new Map();
  const mark = (k, why) => { if (candIdx.has(k) && !out.has(k)) out.set(k, why); };
  // the corridor of blocked() in buildings_text.js
  const corridor = (t, f, wdist, ox, oz, reach) => {
    const rx = ox - t.x, rz = oz - t.z;
    const along = rx * f.D[0] + rz * f.D[1];
    return along > 0 && along <= wdist + 30 && Math.abs(rx * f.D[1] - rz * f.D[0]) < 0.5 * f.W + reach;
  };
  const candList = [...candIdx].map((k) => [k, recs[k]]);
  for (const t of towers) {
    if (!t.shaft) continue;
    const di = world.districtAt(t.x, t.z).index;
    if (di < 0 || !TEXT_DISTRICTS.has(DISTRICTS[di].type)) continue;
    const hits = waterHits(world, t.x, t.z);
    if (!hits) continue;
    const mine = new Set();
    for (const p of t.parts) if (partLot[p.i] >= 0) mine.add(partLot[p.i]);
    for (const p of t.parts) {
      if (!SHAFT_MATS.has(p.mat)) continue;
      for (const f of partFaces(p)) {
        const wdist = faceWater(hits, f.D);
        if (wdist === Infinity) continue;
        if (blockers.some((o) => o !== t && corridor(t, f, wdist, o.x, o.z, 0.8 * o.r))) continue;
        for (const k of mine) mark(k, 'textFront');
        for (const [k, r] of candList) {
          const L = r.L;
          if (!mine.has(k) && corridor(t, f, wdist, L.x, L.z, 0.8 * 16 + 0.5 * Math.max(L.w, L.d))) mark(k, 'textCorridor');
        }
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ main entry

// Builds the compounds (appends their parts to B.P) and returns { mask, stats }: mask[i] = 1 for replaced parts.
// Returns null when switched off.
export function buildCompounds(B, world) {
  const rules = activeRules();
  if (rules.off) return null;
  const t0 = performance.now();
  const P = B.P;
  const recs = B.lotRecs;
  const stats = { rulesHash: rulesHash(RULES), fineWindows: rules.fineWindows, contourTurns: rules.contourTurns, kept: {}, districts: {} };

  // 1. candidate lots and the lots kept by rule
  const candIdx = new Set();
  recs.forEach((r, k) => { if (rules.districts.includes(r.L.district) && r.path === 'tower' && r.towers.length && r.mark >= 0) candIdx.add(k); });
  const keep = new Map();
  const cpts = complexPoints(B);
  for (const k of candIdx) {
    const L = recs[k].L;
    let why = keptByLandmarks(L, rules);
    if (!why && cpts.length) {
      const rr = rules.complexMargin + 0.5 * Math.hypot(L.w, L.d);
      for (const [x, z] of cpts) if (Math.abs(x - L.x) < rr && Math.abs(z - L.z) < rr && Math.hypot(x - L.x, z - L.z) < rr) { why = 'complex'; break; }
    }
    if (why) keep.set(k, why);
  }
  // skybridge anchors: the lots holding either tower of a skybridge (hill tower index -> lot)
  const hillOf = new Map();
  recs.forEach((r, k) => { for (let h = r.h0; h < r.h1; h++) hillOf.set(h, k); });
  const anchorLots = new Set();
  if (rules.keepBridgeAnchors) for (const br of B.bridgeRecs) for (const h of [br.i, br.j]) if (hillOf.has(h)) anchorLots.add(hillOf.get(h));
  // distinctive crowns: the crown kinds actually built on the lot (crown() records them after the height cap)
  const crownLots = new Set();
  stats.candidateCrowns = {};
  for (const k of candIdx) {
    for (const t of recs[k].crowns) stats.candidateCrowns[t] = (stats.candidateCrowns[t] || 0) + 1;
    if (recs[k].crowns.some((t) => rules.keepCrowns.includes(t))) crownLots.add(k);
  }
  const textKeep = textExclusions(B, world, recs, candIdx);
  // every rule's own count (a lot can meet several), then the first reason per lot
  stats.keptByRule = { landmark: 0, station: 0, complex: 0, skybridge: 0, crown: 0, textFront: 0, textCorridor: 0 };
  for (const why of keep.values()) stats.keptByRule[why]++;
  for (const k of candIdx) {
    if (anchorLots.has(k)) stats.keptByRule.skybridge++;
    if (crownLots.has(k)) stats.keptByRule.crown++;
    if (textKeep.has(k)) stats.keptByRule[textKeep.get(k)]++;
    if (keep.has(k)) continue;
    if (anchorLots.has(k)) keep.set(k, 'skybridge');
    else if (crownLots.has(k)) keep.set(k, 'crown');
    else if (textKeep.has(k)) keep.set(k, textKeep.get(k));
  }
  stats.candidates = candIdx.size;
  for (const why of keep.values()) stats.kept[why] = (stats.kept[why] || 0) + 1;

  // 2. compounds: the remaining tower lots of each street block
  const byBlock = new Map();
  for (const k of candIdx) {
    if (keep.has(k)) continue;
    const r = recs[k], L = r.L, D = DISTRICTS[L.district];
    const ca = Math.cos(D.angle), sa = Math.sin(D.angle);
    const dx = L.x - D.cx, dz = L.z - D.cz;
    const bi = Math.floor((dx * ca + dz * sa) / D.block), bj = Math.floor((-dx * sa + dz * ca) / D.block);
    const key = L.district * 1e6 + (bi + 500) * 1000 + (bj + 500);
    if (!byBlock.has(key)) byBlock.set(key, { key, district: L.district, bi, bj, recs: [], idx: [] });
    byBlock.get(key).recs.push(r);
    byBlock.get(key).idx.push(k);
  }
  const comps = [...byBlock.values()].sort((a, b) => a.key - b.key);
  for (const c of comps) {
    const D = DISTRICTS[c.district];
    const [cx, cz] = rot(D.angle, (c.bi + 0.5) * D.block, (c.bj + 0.5) * D.block);
    c.cx = D.cx + cx; c.cz = D.cz + cz;
    c.ground = world.heightAt(c.cx, c.cz);
    const office = c.recs.filter((r) => r.towers[0].mat !== MAT.RES).length;
    c.office = office * 2 >= c.recs.length && office > 0;
  }

  // 3. one design per compound (fixed draw order from the compound's own stream)
  const designed = new Map();
  for (const c of comps) {
    const R = rng((hash32(c.district, c.bi, c.bj) ^ 0x18018) >>> 0);
    const wr = rules.winToday[c.district];
    const d = {
      hKey: R(), sqPick: R(), longPick: R(), finish: Math.floor(R() * rules.finishes.length),
      cToday: wr[0] + R() * (wr[1] - wr[0]), cFine: rules.winFine[0] + R() * (rules.winFine[1] - rules.winFine[0]),
      wFrac: R(), lit: 0.35 + R() * 0.3, balc: R() < rules.balcShare[c.district], neon: PAL.neon[Math.floor(R() * PAL.neon.length) % PAL.neon.length],
      step: rules.stepFloors[0] + Math.floor(R() * (rules.stepFloors[1] - rules.stepFloors[0] + 1)),
      kLit: R(), kBill: R(), kEdge: R(), kCrownLit: R(), kNeon: R(), crownR: R(), bridge: R() < rules.bridgeShare, bridgeT: R(),
      glass: R() < 0.5, officeCol: R(), yFlip: R() < 0.5, well: rules.slabWell[0] + R() * (rules.slabWell[1] - rules.slabWell[0]),
    };
    let acc = 0;
    const sq = rules.square, tot = sq.reduce((s, e) => s + e[1], 0);
    d.square = sq[sq.length - 1][0];
    for (const [name, w] of sq) { acc += w / tot; if (d.sqPick < acc) { d.square = name; break; } }
    d.long = d.longPick < rules.long[0][1] ? rules.long[0][0] : rules.long[1][0];
    if (c.office) {
      d.mat = d.glass ? MAT.GLASS : MAT.OFFICE;
      const pal = d.glass ? PAL.glass : PAL.office;
      d.colIdx = Math.floor(d.officeCol * pal.length) % pal.length;
      d.col = pal[d.colIdx];
      d.c = d.glass ? 1.5 : 3;
    } else {
      d.mat = MAT.RES;
      d.c = rules.fineWindows ? d.cFine : d.cToday;
    }
    // neighbour rule: compounds sharing a street edge never share both plan type and finish
    const sig = (dd) => (c.office ? 'office' : c.recs.some((r) => isLong(r.L, rules)) ? dd.long : dd.square);
    for (let tries = 0; tries < 5; tries++) {
      const clash = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([u, v]) => {
        const o = designed.get(c.district * 1e6 + (c.bi + u + 500) * 1000 + (c.bj + v + 500));
        return o && o.sig === sig(d) && o.fin === (c.office ? d.colIdx + 100 : d.finish);
      });
      if (!clash) break;
      if (c.office) { const pal = d.glass ? PAL.glass : PAL.office; d.colIdx = (d.colIdx + 1) % pal.length; d.col = pal[d.colIdx]; }
      else d.finish = (d.finish + 1) % rules.finishes.length;
    }
    if (!c.office) d.col = rules.finishes[d.finish];
    designed.set(c.key, { sig: sig(d), fin: c.office ? d.colIdx + 100 : d.finish });
    c.d = d;
    c.R = R;
  }

  // 4. layout: the widest tower (whole window cells) that fits every lot of the compound; then the contour turn
  for (const c of comps) layoutCompound(c, world, rules);
  const built = comps.filter((c) => c.towers);
  stats.compoundsNotFitting = comps.length - built.length;

  // 5. heights: re-deal the replaced lots' shaft heights by quantile, per district and housing / office
  assignHeights(built, world, rules);
  // 6. accents: per district, baseline counts of each accent on the replaced lots
  assignAccents(built, stats);
  // 7. window seeds
  let seedFails = 0;
  for (const c of built) {
    const Rs = rng((hash32(c.district, c.bi, c.bj) ^ 0x5eed18) >>> 0);
    c.cls = windowClass(Rs, c.office, rules.classTol);
    for (const T of c.towers) { const s = towerSeed(Rs, c.cls, c.office, rules.classTol); T.seed = s.seed; if (!s.ok) seedFails++; }
  }
  stats.windowSeedFails = seedFails;

  // 8. replaced parts, dead sign slots, returned prop budget
  const mask = new Uint8Array(P.count);
  const hillLot = new Map();
  const compLots = new Set();
  for (const c of built) for (const r of c.recs) {
    compLots.add(r);
    for (let i = r.mark; i < r.p1; i++) mask[i] = 1;
    for (let s = r.slotMark; s < r.s1; s++) world.signSlots[s].dead = true;
    for (let h = r.h0; h < r.h1; h++) hillLot.set(h, r);
    c.replacedParts = (c.replacedParts || 0) + (r.p1 - r.mark);
  }
  let bridgesRemoved = 0;
  for (const br of B.bridgeRecs) {
    const ra = hillLot.get(br.i), rb = hillLot.get(br.j);
    if (!ra && !rb) continue;
    mask[br.p0] = 1; mask[br.p0 + 1] = 1;
    bridgesRemoved++;
    const c = built.find((cc) => cc.recs.includes(ra || rb));
    if (c) c.replacedParts += 2;
  }
  // dev check: every skybridge's two anchor towers and its own parts are unchanged
  let bridgesIntact = 0;
  for (const br of B.bridgeRecs) {
    const lots = [br.i, br.j].map((h) => recs[hillOf.get(h)]);
    if (!mask[br.p0] && !mask[br.p0 + 1] && lots.every((r) => r && !compLots.has(r))) bridgesIntact++;
  }
  stats.skybridges = { total: B.bridgeRecs.length, intact: bridgesIntact };
  let replacedProps = 0;
  for (let i = 0; i < P.count; i++) if (mask[i] && (P.get(i, 15) & FLAG.PROP)) replacedProps++;
  B.props -= replacedProps;

  // 9. build (appended after every existing part; explicit seeds; compound billboard slots tagged)
  const part0 = B.part, prop0 = B.prop, slot0 = B.slot, light0 = B.light;
  let Rp = null;
  const seeded = (o) => { if (o.seed === undefined) o.seed = Rp() * 999; return o; };
  B.part = function (o) { return part0.call(this, seeded(o)); };
  B.prop = function (o) { return prop0.call(this, seeded(o)); };
  B.slot = function (...a) { slot0.apply(this, a); this.slots[this.slots.length - 1].comp = true; };
  B.light = function () { throw new Error('compounds add no lights'); };
  const n0 = P.count;
  let capped = 0, bridgesAdded = 0;
  try {
    for (const c of built) {
      Rp = rng((hash32(c.district, c.bi, c.bj) ^ 0x9a27) >>> 0);
      const r = buildCompound(B, c, world, rules);
      capped += r.capped ? 1 : 0;
      bridgesAdded += r.bridges;
    }
  } finally {
    B.part = part0; B.prop = prop0; B.slot = slot0; B.light = light0;
  }
  const full = new Uint8Array(P.count);
  full.set(mask);
  report(stats, B, built, recs, compLots, n0, rules);
  Object.assign(stats, { compounds: built.length, lots: compLots.size, replacedParts: mask.reduce((s, v) => s + v, 0), replacedProps,
    addedParts: P.count - n0, capped, bridgesRemoved, bridgesAdded, ms: Math.round(performance.now() - t0) });
  return { mask: full, stats, n0 };
}

function isLong(L, rules) { return Math.max(L.w, L.d) / Math.min(L.w, L.d) > rules.longAspect; }

// Plan of one lot for a compound (lot-local, before the turn), or null.
function lotPlan(c, L, nC, rules) {
  const d = c.d, cw = d.c;
  if (c.office) return { plan: officePlan(nC * cw), two: false };
  const long = isLong(L, rules);
  if (!long) {
    if (d.square === 'y') return { plan: yPlan(nC, cw, d.yFlip), two: false };
    return { plan: crossPlan(nC, cw, d.square === 'stepped'), two: false };
  }
  if (d.long === 'twin') return { plan: crossPlan(nC, cw, false), two: true };
  // slab along the lot's long axis, filling the free length
  const gap = rules.gapK * nC * cw;
  const [x0, x1, z0, z1] = freeRect(L, gap, rules);
  const alongX = L.w >= L.d;
  const len = alongX ? x1 - x0 : z1 - z0;
  const depth = Math.max(2, Math.round(rules.slabDepth / cw)) * cw;
  const s = slabPlan(len - 0.01, depth, cw, d.well, rules.slabCore);
  if (!s) return null;
  return { plan: alongX ? s : swapXZ(s), two: false };
}

function layoutCompound(c, world, rules) {
  const d = c.d, cw = d.c;
  const nMax = Math.max(2, Math.round((rules.W[0] + d.wFrac * (rules.W[1] - rules.W[0])) / cw));
  const nMin = Math.ceil(rules.minW / cw);
  let found = null;
  for (let nC = nMax; nC >= nMin && !found; nC--) {
    const gap = rules.gapK * nC * cw;
    const lots = [];
    let ok = true;
    for (const r of c.recs) {
      const lp = lotPlan(c, r.L, nC, rules);
      let pos = lp && placeLot(r.L, lp.plan, 0, gap, rules, lp.two);
      if (lp && lp.two && !pos) {
        // a long lot that cannot take two towers with the gap gets one
        const one = { plan: crossPlan(nC, cw, false), two: false };
        pos = placeLot(r.L, one.plan, 0, gap, rules, false);
        if (pos) lp.plan = one.plan;
      }
      if (!pos) { ok = false; break; }
      lots.push({ r, plan: lp.plan, pos, n: pos.length });
    }
    if (ok) found = { nC, gap, lots };
  }
  if (!found) return;
  // contour turn (all towers of the compound turn together; the angle is reduced until every lot keeps its towers)
  let theta = 0;
  if (rules.contourTurns) {
    const D = DISTRICTS[c.district];
    const e = 6;
    const gx = (world.heightAt(c.cx + e, c.cz) - world.heightAt(c.cx - e, c.cz)) / (2 * e);
    const gz = (world.heightAt(c.cx, c.cz + e) - world.heightAt(c.cx, c.cz - e)) / (2 * e);
    if (Math.hypot(gx, gz) > rules.turnGrad) {
      const contour = Math.atan2(gz, gx) + Math.PI / 2;
      let rel = (contour - D.angle) * 180 / Math.PI;
      rel = ((rel % 90) + 135) % 90 - 45;   // fold to [-45, 45)
      rel = Math.max(-rules.turnMax, Math.min(rules.turnMax, rel));
      let deg = Math.round(rel / rules.turnStep) * rules.turnStep;
      while (deg !== 0) {
        const th = deg * Math.PI / 180;
        const fits = found.lots.every((lo) => { const p = placeLot(lo.r.L, lo.plan, th, found.gap, rules, false); return p && p.length === lo.n; });
        if (fits) { theta = th; break; }
        deg -= Math.sign(deg) * rules.turnStep;
      }
    }
  }
  c.nC = found.nC; c.W = found.nC * cw; c.theta = theta;
  c.towers = [];
  for (const lo of found.lots) {
    const L = lo.r.L;
    const pos = theta ? placeLot(L, lo.plan, theta, found.gap, rules, false) : lo.pos;
    for (const [lx, lz] of pos) {
      const [wx, wz] = rot(L.angle, lx, lz);
      c.towers.push({ r: lo.r, L, x: L.x + wx, z: L.z + wz, a: L.angle + theta, plan: lo.plan });
    }
  }
}

// Heights. Each district's replaced lots (housing and office separately) keep their heights as a set: the lot's
// tallest tower top above its lowest ground. The compounds are sorted by a key and each takes the next contiguous
// chunk of the sorted heights, one value per lot. In Yuzhong housing, enough crest compounds to hold today's tall
// share (lots of anchorHeight or more) sort last, so those heights stand on the crest only. Within a compound the lowest lot takes the lowest value of its chunk (roofs step up the hill), and
// floor counts stay within 3 floors of the compound's median.
function assignHeights(built, world, rules) {
  const groups = new Map();
  for (const c of built) {
    const g = c.district * 10 + (c.office ? 1 : 0);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(c);
  }
  for (const list of groups.values()) {
    const pool = [];
    for (const c of list) for (const r of c.recs) pool.push(Math.max(...r.towers.map((t) => t.top)) - r.L.gMin);
    pool.sort((a, b) => a - b);
    // crest: blocks whose centre ground is in the top crestShare of the group's blocks (Yuzhong housing only)
    let crest = Infinity;
    const anchors = new Set();
    if (list[0].district === 1 && !list[0].office) {
      const gs = list.map((c) => c.ground).sort((a, b) => a - b);
      crest = gs[Math.floor(gs.length * (1 - rules.crestShare))];
      const nTall = pool.filter((v) => v >= rules.anchorHeight).length;
      let cum = 0;
      for (const c of list.filter((cc) => cc.ground >= crest).sort((a, b) => b.d.hKey - a.d.hKey)) {
        if (cum >= nTall) break;
        anchors.add(c); cum += c.recs.length;
      }
    }
    for (const c of list) { c.crest = c.ground >= crest; c.anchor = anchors.has(c); c.sortKey = c.d.hKey + (c.anchor ? 2 : 0); }
    list.sort((a, b) => a.sortKey - b.sortKey);
    let pos = 0;
    for (const c of list) {
      const fh = c.office ? rules.officeFloorH : rules.floorH;
      const chunk = pool.slice(pos, pos + c.recs.length);
      pos += c.recs.length;
      const lots = [...c.recs].sort((a, b) => a.L.gMin - b.L.gMin);
      const fl = lots.map((r, i) => Math.max(4, Math.round((chunk[i] - (r.podTop - r.L.gMin)) / fh)));
      const med = [...fl].sort((a, b) => a - b)[Math.floor((fl.length - 1) / 2)];
      c.floorH = fh;
      c.floors = med;
      c.lotFloors = new Map(lots.map((r, i) => [r, Math.max(med - 3, Math.min(med + 3, fl[i]))]));
    }
  }
  // per tower: its lot's floors on its own podium, clamped by the lot's height cap like the original towers
  for (const c of built) for (const T of c.towers) {
    const pod = T.r.podTop;
    let h = c.lotFloors.get(T.r) * c.floorH;
    const maxTop = T.L.maxTop || 1e9;
    if (pod + h > maxTop) h = Math.max(maxTop - pod, 12);
    T.base = pod; T.h = h; T.top = pod + h;
  }
}

// Accent counts on the replaced lots of a district (from the original generation's records).
function baselineAccents(recs) {
  const a = { towers: 0, lit: 0, billboard: 0, neon: 0, parapet: 0, dressNeon: 0, edge: 0, crownlit: 0 };
  for (const r of recs) {
    a.towers += r.towers.length;
    for (const t of r.crowns) { if (t === 'lit') a.lit++; if (t === 'billboard') a.billboard++; }
    a.parapet += r.parapet; a.dressNeon += r.dressNeon;
    for (const t of r.towers) { if (t.flags & FLAG.EDGE) a.edge++; if (t.flags & FLAG.CROWNLIT) a.crownlit++; }
  }
  a.neon = a.parapet + a.dressNeon;
  return a;
}

// Picks compounds (highest key first) whose tower counts add up closest to the target.
function quota(list, target, key, ok = () => true) {
  const chosen = new Set();
  let cum = 0;
  for (const c of [...list].sort((a, b) => b.d[key] - a.d[key])) {
    if (cum >= target) break;
    if (!ok(c)) continue;
    const w = c.towers.length;
    if (w <= 2 * (target - cum)) { chosen.add(c); cum += w; }
  }
  return chosen;
}

function assignAccents(built, stats) {
  for (const di of [...new Set(built.map((c) => c.district))]) {
    const list = built.filter((c) => c.district === di);
    const base = baselineAccents(list.flatMap((c) => c.recs));
    // a crown is built as its type only when it stays under the lot cap (crown() turns capped crowns into plant)
    const uncapped = (c) => c.towers.every((T) => T.top + 12 <= (T.L.maxTop || 1e9));
    const lit = quota(list, base.lit, 'kLit', uncapped);
    const bill = quota(list, base.billboard, 'kBill', (c) => uncapped(c) && !lit.has(c));
    const edge = quota(list, base.edge, 'kEdge');
    const crownlit = quota(list, base.crownlit, 'kCrownLit', (c) => !edge.has(c));
    const neon = quota(list, base.neon, 'kNeon');
    const rest = (c) => (c.office ? ['spire', 'helipad', 'antenna', 'setback', 'machine', 'antennas', 'garden'] : ['machine', 'machine', 'setback', 'garden', 'antennas', 'pagoda']);
    for (const c of list) {
      const rl = rest(c);
      c.crownType = lit.has(c) ? 'lit' : bill.has(c) ? 'billboard' : rl[Math.floor(c.d.crownR * rl.length) % rl.length];
      c.flags = (edge.has(c) ? FLAG.EDGE : 0) | (crownlit.has(c) ? FLAG.CROWNLIT : 0);
      c.neonLine = neon.has(c);
    }
    stats.districts[DISTRICTS[di].name] = { baseline: base };
  }
}

// Air-conditioner units on the faces of a tower's boxes, skipping window cells hidden inside another box of the
// same tower. Returns the number added; stops at `budget`.
function acOnPlan(B, R, T, boxes, c, density, budget) {
  let n = 0;
  const inside = (wx, wz, skip) => boxes.some((b, k) => {
    if (k === skip) return false;
    const dx = wx - b.wx, dz = wz - b.wz, cb = Math.cos(b.wa), sb = Math.sin(b.wa);
    return Math.abs(dx * cb + dz * sb) < b.hw + 0.05 && Math.abs(-dx * sb + dz * cb) < b.hd + 0.05;
  });
  for (let bi = 0; bi < boxes.length; bi++) {
    const b = boxes[bi];
    const faces = rectFaces(b.hw, b.hd);
    const cs = Math.cos(b.wa), sn = Math.sin(b.wa);
    const f1 = Math.floor(b.h / c.floorH) - 1;
    for (const F of faces) {
      if (R() < 0.35) continue;
      const nc = Math.max(1, Math.round(F.len / c.d.c)), cw = F.len / nc;
      const ang = Math.atan2(F.nz, F.nx) - Math.PI / 2 + b.wa;
      for (let fl = 1; fl < f1; fl++) for (let k = 0; k < nc; k++) {
        if (R() > density) continue;
        const side = (R() < 0.5 ? -1 : 1) * (0.25 + 0.1 * R()) * cw;
        const lx = F.sx + F.dx * ((k + 0.5) * cw + side) + F.nx * 0.32, lz = F.sz + F.dz * ((k + 0.5) * cw + side) + F.nz * 0.32;
        const wx = b.wx + lx * cs - lz * sn, wz = b.wz + lx * sn + lz * cs;
        if (inside(wx, wz, bi)) continue;
        if (n >= budget) return n;
        if (B.prop({ x: wx, y0: T.base + fl * c.floorH + 0.1 * c.floorH, z: wz, a: ang, hw: 0.42, hd: 0.3, h: 0.55, mat: MAT.AC, col: [0.55, 0.55, 0.52], flags: FLAG.BOTTOM, seed: R() * 999 }) < 0) return n;
        n++;
      }
    }
  }
  return n;
}

function buildCompound(B, c, world, rules) {
  const R = c.R, d = c.d;
  const P = B.P;
  const c0 = P.count;
  const style = c.district === 1 ? DT.HILLSIDE : DT.URBAN;
  const flags = c.flags | (d.balc && !c.office ? FLAG.BALC : 0);
  const acJobs = [];
  for (const T of c.towers) {
    const boxes = T.plan.boxes.map((b) => {
      const [ox, oz] = rot(T.a, b.ox, b.oz);
      const h = b.step ? Math.max(T.h - d.step * c.floorH, Math.min(T.h, 6 * c.floorH)) : T.h;
      return { wx: T.x + ox, wz: T.z + oz, wa: T.a + b.a, hw: b.hw, hd: b.hd, h, round: b.round };
    });
    for (const b of boxes) {
      B.part({ x: b.wx, y0: T.base, z: b.wz, a: b.wa, hw: b.hw, hd: b.hd, h: b.h, kind: 0, prm: b.round ? 0.3 : 0,
        mat: d.mat, col: d.col, floorH: c.floorH, winW: d.c, baseY: T.base, param: c.office ? 0.3 + d.lit * 0.4 : d.lit, flags, seed: T.seed, solid: true });
    }
    // roof neon line around the whole outline (one line per tower)
    if (c.neonLine) {
      for (const b of boxes) B.part({ x: b.wx, y0: T.base + b.h - 0.7, z: b.wz, a: b.wa, hw: b.hw + 0.15, hd: b.hd + 0.15, h: 0.35, kind: 0, prm: b.round ? 0.3 : 0, mat: MAT.EMIT, col: d.neon, param: 4.5, flags: FLAG.BOTTOM | FLAG.NOTOP });
    }
    const cb = T.plan.crown;
    const [kx, kz] = rot(T.a, cb.ox, cb.oz);
    const top = crown(B, R, { x: T.x + kx, z: T.z + kz, a: T.a + cb.a, hw: cb.hw, hd: cb.hd, top: T.top, kind: 0, prm: c.office ? 0.3 : 0, type: c.crownType, maxTop: T.L.maxTop, style, neon: false });
    T.crownTop = top;
    const tall = c.district === 1 ? T.top > 140 : T.top - T.L.gMin > 140;
    if (tall) {
      const [ax, az] = rot(T.a + cb.a, cb.hw * 0.9, cb.hd * 0.9);
      aviation(B, T.x + kx + ax, T.top, T.z + kz + az, R() * 999);
    }
    T.boxes = boxes;
    if (!c.office) acJobs.push({ T, boxes });
  }
  // one skybridge level for the whole compound, between neighbouring towers in a row
  let bridges = 0;
  if (d.bridge && c.towers.length >= 2) {
    const lo = Math.max(...c.towers.map((T) => T.base)) + 8, hi = Math.min(...c.towers.map((T) => T.top)) - 10;
    if (hi >= lo + 4) {
      const y = lo + (hi - lo) * (0.15 + d.bridgeT * 0.7);
      for (let i = 0; i < c.towers.length; i++) for (let j = i + 1; j < c.towers.length; j++) {
        const A = c.towers[i], Bt = c.towers[j];
        const ox = Bt.x - A.x, oz = Bt.z - A.z;
        const [lx, lz] = rot(-A.a, ox, oz);
        const alongX = Math.abs(lx) > Math.abs(lz);
        if (Math.abs(alongX ? lz : lx) > 4 || Math.hypot(ox, oz) > 2.2 * c.W + 12) continue;
        // only the nearest neighbour in that direction
        const between = c.towers.some((Ct, k) => k !== i && k !== j && Math.hypot(Ct.x - A.x, Ct.z - A.z) < Math.hypot(ox, oz) && Math.hypot(Ct.x - Bt.x, Ct.z - Bt.z) < Math.hypot(ox, oz));
        if (between) continue;
        const mx = A.x + ox / 2, mz = A.z + oz / 2, len = Math.hypot(ox, oz), ang = Math.atan2(oz, ox);
        B.part({ x: mx, y0: y, z: mz, a: ang, hw: len / 2, hd: 1.8, h: 3.4, mat: MAT.OFFICE, col: [0.28, 0.28, 0.3], floorH: 3.4, winW: 2.2, baseY: y, param: 0.7, flags: FLAG.BOTTOM, seed: R() * 999, solid: true });
        B.part({ x: mx, y0: y - 0.25, z: mz, a: ang, hw: len / 2, hd: 1.95, h: 0.25, mat: MAT.EMIT, col: d.neon, param: 3.5, flags: FLAG.BOTTOM });
        bridges++;
      }
    }
  }
  // air-conditioner units last, within the part cap (the compound adds no more parts than it replaced)
  const budget = Math.max(0, c.replacedParts - (P.count - c0));
  let want = 0;
  for (const j of acJobs) for (const b of j.boxes) want += 0.65 * 2 * (b.hw + b.hd) / d.c * 2 * Math.max(0, Math.floor(b.h / c.floorH) - 2) * rules.acDensity[c.district];
  const k = want > budget ? budget / want * 0.9 : 1;
  let left = budget;
  for (const j of acJobs) left -= acOnPlan(B, R, j.T, j.boxes, c, rules.acDensity[c.district] * k, left);
  return { capped: k < 1, bridges };
}

// ------------------------------------------------------------------ dev report

// Union plan area of boxes [{x, z, a, hw, hd}] over a lot (0.5 m sampling grid in the lot frame).
function planArea(L, boxes) {
  const step = 0.5;
  const c = Math.cos(L.angle), s = Math.sin(L.angle);
  let n = 0;
  for (let u = -L.w / 2 + step / 2; u < L.w / 2; u += step) for (let v = -L.d / 2 + step / 2; v < L.d / 2; v += step) {
    const x = L.x + u * c - v * s, z = L.z + u * s + v * c;
    for (const b of boxes) {
      const dx = x - b.x, dz = z - b.z, cb = Math.cos(b.a), sb = Math.sin(b.a);
      if (Math.abs(dx * cb + dz * sb) <= b.hw && Math.abs(-dx * sb + dz * cb) <= b.hd) { n++; break; }
    }
  }
  return n * step * step;
}

function histogram(hs) {
  const bands = {};
  for (const h of hs) { const b = Math.floor(h / 10) * 10; bands[b] = (bands[b] || 0) + 1; }
  return bands;
}

function report(stats, B, built, recs, compLots, n0, rules) {
  const P = B.P;
  for (const di of rules.districts) {
    const name = DISTRICTS[di].name;
    const list = built.filter((c) => c.district === di);
    if (!list.length) continue;
    const s = stats.districts[name] || (stats.districts[name] = {});
    const lots = list.flatMap((c) => c.recs);
    // heights per lot: tallest shaft top above the lot's lowest ground
    const before = lots.map((r) => Math.max(...r.towers.map((t) => t.top)) - r.L.gMin);
    const afterBy = new Map();
    for (const c of list) for (const T of c.towers) afterBy.set(T.r, Math.max(afterBy.get(T.r) || -1e9, T.top - T.L.gMin));
    const after = lots.map((r) => afterBy.get(r));
    const mean = (a) => +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
    s.heights = { lots: lots.length, meanBefore: mean(before), meanAfter: mean(after), over100Before: before.filter((h) => h > 100).length, over100After: after.filter((h) => h > 100).length,
      histBefore: histogram(before), histAfter: histogram(after) };
    // towers and plan area
    const towersBefore = lots.reduce((n, r) => n + r.towers.length, 0), towersAfter = list.reduce((n, c) => n + c.towers.length, 0);
    let areaBefore = 0, areaAfter = 0;
    for (const r of lots) {
      const boxes = [];
      for (let i = r.mark; i < r.p1; i++) {
        const fl = P.get(i, 15), mat = Math.round(P.get(i, 16));
        if (fl & FLAG.PROP || !SHAFT_MATS.has(mat) || Math.abs(P.get(i, 1) - r.podTop) > 0.5) continue;
        boxes.push({ x: P.get(i, 0), z: P.get(i, 2), a: P.get(i, 3), hw: P.get(i, 4), hd: P.get(i, 5) });
      }
      areaBefore += planArea(r.L, boxes);
    }
    for (const c of list) for (const r of c.recs) {
      const boxes = c.towers.filter((T) => T.r === r).flatMap((T) => T.boxes.map((b) => ({ x: b.wx, z: b.wz, a: b.wa, hw: b.hw, hd: b.hd })));
      areaAfter += planArea(r.L, boxes);
    }
    s.towers = { before: towersBefore, after: towersAfter };
    s.planArea = { perLotBefore: Math.round(areaBefore / lots.length), perLotAfter: Math.round(areaAfter / lots.length),
      perTowerBefore: Math.round(areaBefore / towersBefore), perTowerAfter: Math.round(areaAfter / towersAfter) };
    // accents after (one per compound, counted per tower)
    const a = { towers: towersAfter, lit: 0, billboard: 0, neon: 0, edge: 0, crownlit: 0 };
    for (const c of list) {
      const n = c.towers.length;
      const realised = c.towers.filter((T) => T.top + 12 <= (T.L.maxTop || 1e9)).length;
      if (c.crownType === 'lit') a.lit += realised;
      if (c.crownType === 'billboard') a.billboard += realised;
      if (c.neonLine) a.neon += n;
      if (c.flags & FLAG.EDGE) a.edge += n;
      if (c.flags & FLAG.CROWNLIT) a.crownlit += n;
    }
    s.accents = { before: s.baseline, after: a };
    delete s.baseline;
    const plans = {};
    for (const c of list) for (const T of c.towers) plans[T.plan.kind] = (plans[T.plan.kind] || 0) + 1;
    s.plans = plans;
    s.compounds = list.length;
    s.office = list.filter((c) => c.office).length;
    s.crest = list.filter((c) => c.crest).length;
    s.anchors = list.filter((c) => c.anchor).length;
    s.centroid = [Math.round(lots.reduce((t, r) => t + r.L.x, 0) / lots.length), Math.round(lots.reduce((t, r) => t + r.L.z, 0) / lots.length)];
    s.turned = list.filter((c) => c.theta).length;
    s.meanW = +(list.reduce((t, c) => t + c.W, 0) / list.length).toFixed(1);
    s.meanCell = +(list.reduce((t, c) => t + c.d.c, 0) / list.length).toFixed(2);
    // window classes: every tower's seed must give the compound's class
    let bad = 0;
    for (const c of list) for (const T of c.towers) if (!matches(seedClass(T.seed, c.office), c.cls, rules.classTol)) bad++;
    s.windowClassMismatches = bad;
  }
}

// ------------------------------------------------------------------ compaction

// Copies the parts not flagged in `mask`, in order, into a new part list. Returns { P, map } (map[old] = new index,
// -1 for dropped parts). Every side table keyed by part index is built from the new list or remapped with `map`.
export function compactParts(P, mask) {
  const n = P.count;
  const map = new Int32Array(n).fill(-1);
  let k = 0;
  for (let i = 0; i < n; i++) if (!mask[i]) map[i] = k++;
  const Q = new Parts(Math.max(k, 1));
  for (let i = 0; i < n; i++) if (!mask[i]) Q.data.set(P.data.subarray(i * PART_FLOATS, (i + 1) * PART_FLOATS), map[i] * PART_FLOATS);
  Q.count = k;
  Q.solid = P.solid.filter((i) => !mask[i]).map((i) => map[i]);
  return { P: Q, map };
}
