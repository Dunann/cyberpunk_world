// Land-use plan for the gaps in the city core (idea I-016, "build first, then paint").
//
// Every piece of plan land gets exactly one use: a built block, a park, or nothing (left as it is).
//  1. Infill: the owner district's street grid is extended over the plain between the Jade River, Jiangbei, the
//     Bund and the Great River. Lots are generated first, with their own random stream; a cell (block) is kept
//     only when at least half of it is built.
//  2. Coverage map: built coverage is stamped from the accepted lots (footprint plus the streets around them),
//     park coverage from the park sites plus every piece of plan land that got no building.
//  3. Ground paint, forest removal, lamps and traffic read that map and nothing else.
// Nothing that existed before moves: the info map, district lookups, world.lots and every existing random stream
// are untouched. Infill lots live in world.infillLots, not in world.lots.
//
// Sites are bounded by world features only (water, bridge corridors, district street grids, a contour and a slope
// rule), never by coordinate lines or circles:
//  - Lantern Park: the south bank of the Great River between the Peninsula South Bridge and the Old Town Bridge,
//    from the water up to the Old Town's first street (its 0.3 weight contour, where the city paints and drives streets),
//    at most the 450 m floodplain. Its designed layout (walks, plazas, ponds, lamps, lanterns, gates, pavilions)
//    is in planPark.js.
//  - The plain north of the Great River and east of the Jade River, south of the line through the Jiangbei and
//    Bund centres, below the 45 m contour (the foot of Ovoo Hill):
//      - Silk Road Garden: the part owned by the Bund that lies beyond the Bund's southernmost street.
//      - Confluence Exchange: the rest; infill blocks, with a quay walk along the river and city squares
//        (pocket parks) on land that got no building.
//  - Unbuilt land steeper than 25% keeps its forest. A keep-out list (the Hongyadong stilt site, landmarks) is
//    applied to everything.

import { DISTRICTS, BRIDGES, ROUTES, LANDMARKS, RIVERS, DT, World } from './world.js';
import { PLAN_BOX } from './common.js';
import { rng, catmullRom } from './math.js';
import { buildParkLayout } from './planPark.js';

export const STYLE = { NONE: 0, LANTERN: 1, SILK: 2, QUAY: 3, POCKET: 4, AVENUE: 5 };

const STILTS_KEEP = 400;     // keep-out radius around the Hongyadong stilt site (m)
const LANDMARK_KEEP = 60;    // keep-out beyond every landmark radius (m)
const HILL_FOOT = 45;        // the plain ends at this contour; higher ground is hill and keeps its forest
const STEEP = 0.25;          // unbuilt plan land steeper than this keeps its forest
const FLOODPLAIN = 450;      // largest depth of the south-bank park from the water (m)
const PARK_WATER = 6;        // parks start this far from the water edge (m)
const QUAY_DEPTH = 70;       // unbuilt Exchange land closer to the water than this is the quay walk
const RAMP = 130;            // bridge ramps: no park or lots within this distance of a landing, near the deck
const AVENUE_CLEAR = 11;     // approach avenues keep this far from every lot (half road + sidewalk + 0.8 m)

// Height rule for infill (metres above the highest ground under the lot). Fixed from first principles: infill
// joins the district centres, so it stays below them, and it steps up only toward the waterfront and transit.
export const INFILL_HEIGHT = {
  base: 26,                  // 8 storeys
  baseVar: [0.6, 1.5],       // per-lot factor on the base (roofline variety)
  water: 16, waterDist: 90,  // first row at the water
  bridge: 52, bridgeDist: 300,
  rail: 26, railDist: 120,
  ceiling: 94,
};

// ------------------------------------------------------------------ shared searches

// Hongyadong stilt site: the steepest stretch of bank within 900 m of the 'stilts' landmark hint. Used by the
// buildings module to place the complex and by the plan for its keep-out zone. Cached on the world.
export function stiltsSite(world) {
  if (world._stiltsSite !== undefined) return world._stiltsSite;
  const L = LANDMARKS.find((l) => l.id === 'stilts');
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
  world._stiltsSite = best;
  return best;
}

// ------------------------------------------------------------------ river geometry

function riverLine(name) {
  const R = RIVERS.find((r) => r.name === name);
  const pts = catmullRom(R.points, 10);
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  // segment index in 250 m cells (the nearest-segment search widens ring by ring)
  const grid = new Map(), C = RIVER_CELL;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    for (let gx = Math.floor(Math.min(a[0], b[0]) / C); gx <= Math.floor(Math.max(a[0], b[0]) / C); gx++) for (let gz = Math.floor(Math.min(a[1], b[1]) / C); gz <= Math.floor(Math.max(a[1], b[1]) / C); gz++) {
      const k = gx * 7919 + gz;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    }
  }
  return { pts, s, grid };
}
const RIVER_CELL = 250;

// Nearest point on a river centre line: distance to the bank (negative in water), arc length, side (+1 = right bank
// looking downstream: south / east bank of the Great River, the peninsula side of the Jade River).
function riverQuery(rl, x, z) {
  const P = rl.pts, C = RIVER_CELL, gx0 = Math.floor(x / C), gz0 = Math.floor(z / C);
  let best = 1e18, bs = 0, side = 0, hw = 0;
  // rings of cells around the point until the best distance found is closer than the ring (exact nearest segment)
  for (let ring = 0; ring < 80; ring++) {
    if (ring > 1 && Math.sqrt(best) < (ring - 1) * C) break;
    // the cells on the ring's perimeter only
    const n = ring ? ring * 8 : 1;
    for (let q = 0; q < n; q++) {
      let gx = gx0, gz = gz0;
      if (ring) {
        const side = Math.floor(q / (2 * ring)), t = q % (2 * ring) - ring;
        if (side === 0) { gx = gx0 + t; gz = gz0 - ring; } else if (side === 1) { gx = gx0 + ring; gz = gz0 + t; }
        else if (side === 2) { gx = gx0 - t; gz = gz0 + ring; } else { gx = gx0 - ring; gz = gz0 - t; }
      }
      const cellSegs = rl.grid.get(gx * 7919 + gz);
      if (!cellSegs) continue;
      for (const i of cellSegs) {
        const a = P[i], b = P[i + 1];
        const bax = b[0] - a[0], baz = b[1] - a[1];
        const L2 = bax * bax + baz * baz || 1;
        const h = Math.min(Math.max(((x - a[0]) * bax + (z - a[1]) * baz) / L2, 0), 1);
        const dx = x - a[0] - bax * h, dz = z - a[1] - baz * h;
        const d2 = dx * dx + dz * dz;
        if (d2 < best) { best = d2; bs = rl.s[i] + h * Math.sqrt(L2); side = Math.sign(bax * (z - a[1]) - baz * (x - a[0])); hw = (a[2] + (b[2] - a[2]) * h) / 2; }
      }
    }
  }
  return { d: Math.sqrt(best) - hw, s: bs, side };
}

// True when segment p-q crosses a river centre line.
function crossesRiver(rl, px, pz, qx, qz) {
  const P = rl.pts;
  const minx = Math.min(px, qx), maxx = Math.max(px, qx), minz = Math.min(pz, qz), maxz = Math.max(pz, qz);
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    if (Math.max(a[0], b[0]) < minx || Math.min(a[0], b[0]) > maxx || Math.max(a[1], b[1]) < minz || Math.min(a[1], b[1]) > maxz) continue;
    const d1 = (qx - px) * (a[1] - pz) - (qz - pz) * (a[0] - px);
    const d2 = (qx - px) * (b[1] - pz) - (qz - pz) * (b[0] - px);
    const d3 = (b[0] - a[0]) * (pz - a[1]) - (b[1] - a[1]) * (px - a[0]);
    const d4 = (b[0] - a[0]) * (qz - a[1]) - (b[1] - a[1]) * (qx - a[0]);
    if (d1 * d2 < 0 && d3 * d4 < 0) return true;
  }
  return false;
}

function ellipseE(D, x, z) {
  const c = Math.cos(-D.angle), s = Math.sin(-D.angle);
  const qx = (x - D.cx) * c - (z - D.cz) * s, qz = (x - D.cx) * s + (z - D.cz) * c;
  return Math.hypot(qx / D.rx, qz / D.rz);
}

function segDist(ax, az, bx, bz, x, z) {
  const bax = bx - ax, baz = bz - az;
  const h = Math.min(Math.max(((x - ax) * bax + (z - az) * baz) / (bax * bax + baz * baz || 1), 0), 1);
  return Math.hypot(x - ax - bax * h, z - az - baz * h);
}

// ------------------------------------------------------------------ park layout (CPU mirror of terrainPark.js)
// Must match PARK_WGSL exactly: trees are kept off the paths with these functions.

export function walk0c(style, a) { return style === STYLE.LANTERN ? 34 + 10 * Math.sin(a / 46) : 17 + 3 * Math.sin(a / 46); }
export function walk1c(a) { return 110 + 12 * Math.sin(a / 60 + 2); }
export function walk2c(a) { return 200 + 14 * Math.sin(a / 75); }
export const PLAZA_IN = 12;               // Lantern Park plazas sit this far inland of the river walk
export const SILK_RINGS = [80, 150, 220]; // ring walks of the Silk Road Garden (m from the star plaza's centre)
export const SILK_SPOKE_R = 240;          // eight straight walks radiate from the plaza out to this radius

// ------------------------------------------------------------------ plan

export function buildPlan(world) {
  const t0 = performance.now();
  const tm = {};   // load time per phase (ms)
  let tPrev = t0;
  const lap = (k) => { const t = performance.now(); tm[k] = Math.round(t - tPrev); tPrev = t; };
  const great = riverLine('Great River'), jade = riverLine('Jade River');
  const gridded = DISTRICTS.map((D, i) => i).filter((i) => DISTRICTS[i].block > 0);
  const iJiangbei = DISTRICTS.findIndex((D) => D.name === 'Jiangbei');
  const iBund = DISTRICTS.findIndex((D) => D.type === DT.BUND);
  const iOld = DISTRICTS.findIndex((D) => D.name.startsWith('Nan'));
  const stats = { candidates: 0, built: 0, rejects: { core: 0, seam: 0, other: 0, keepout: 0, half: 0 }, lots: 0, lotArea: 0, paintedArea: 0, unbuiltPaved: 0, parkArea: {}, styleArea: {} };

  // ---- keep-out list
  const st = stiltsSite(world);
  const keep = [];
  if (st) keep.push({ x: st.x, z: st.z, r: STILTS_KEEP });
  for (const L of LANDMARKS) if (L.r > 0) keep.push({ x: L.x, z: L.z, r: L.r + LANDMARK_KEEP });
  const inKeep = (x, z, m = 0) => keep.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + m);

  // ---- bridge landings on land and bridge crossing positions along the Great River
  const landings = [];
  for (const [bi, B] of BRIDGES.entries()) for (const [x, z] of [[B.ax, B.az], [B.bx, B.bz]]) if (world.heightAt(x, z) > 2) landings.push({ x, z, bi, ox: x === B.ax ? B.bx : B.ax, oz: x === B.ax ? B.bz : B.az });
  const bridgeS = (name) => { const B = BRIDGES.find((b) => b.name === name); return riverQuery(great, (B.ax + B.bx) / 2, (B.az + B.bz) / 2).s; };
  const sWest = bridgeS('Peninsula South Bridge'), sEast = bridgeS('Old Town Bridge');
  const inRamp = (x, z, m) => {
    for (const L of landings) {
      const B = BRIDGES[L.bi];
      const dx = L.ox - L.x, dz = L.oz - L.z, len = Math.hypot(dx, dz);
      const t = ((x - L.x) * dx + (z - L.z) * dz) / len;
      if (t < -2 || t > RAMP) continue;
      const across = Math.abs((x - L.x) * dz - (z - L.z) * dx) / len;
      if (across < B.width / 2 + m) return true;
    }
    return false;
  };

  // ---- the Bund's southernmost street (Silk Road Garden starts beyond it)
  const DB = DISTRICTS[iBund];
  const bundLocal = (x, z) => { const c = Math.cos(-DB.angle), s = Math.sin(-DB.angle); return [(x - DB.cx) * c - (z - DB.cz) * s, (x - DB.cx) * s + (z - DB.cz) * c]; };
  let bundMaxJ = -1e9;
  for (const L of world.lots) if (L.district === iBund) bundMaxJ = Math.max(bundMaxJ, Math.floor(bundLocal(L.x, L.z)[1] / DB.block));
  const bundSouth = (bundMaxJ + 1) * DB.block + DB.road / 2 + 3;

  // ---- the north boundary of the plain: the line through the Jiangbei and Bund centres
  const DJ = DISTRICTS[iJiangbei];
  const southOfCentres = (x, z) => ((DB.cx - DJ.cx) * (z - DJ.cz) - (DB.cz - DJ.cz) * (x - DJ.cx)) * Math.sign(DB.cx - DJ.cx) > 0;

  // ---- owner: nearest gridded district (ellipse distance) reachable in a straight line without crossing a river
  const ownerAt = (x, z) => {
    let best = -1, be = 1e9;
    for (const i of gridded) {
      const e = ellipseE(DISTRICTS[i], x, z);
      if (e >= be) continue;
      const D = DISTRICTS[i];
      if (crossesRiver(great, x, z, D.cx, D.cz) || crossesRiver(jade, x, z, D.cx, D.cz)) continue;
      best = i; be = e;
    }
    return best;
  };
  const coreAt = (x, z) => { for (const i of gridded) if (world.districtWeight(i, x, z) >= 0.55) return true; return false; };
  const streetZone = (x, z) => { for (const i of gridded) if (world.districtWeight(i, x, z) >= 0.3) return true; return false; };

  // ---- field grid (6 m): water distance, region, owner
  const B = PLAN_BOX;
  const FS = 6, FW = Math.ceil((B.X1 - B.X0) / FS) + 1, FH = Math.ceil((B.Z1 - B.Z0) / FS) + 1;
  const fWater = new Float32Array(FW * FH);
  const fRegion = new Uint8Array(FW * FH), fOwner = new Int8Array(FW * FH).fill(-1);
  const REG = { NONE: 0, LANTERN: 1, PLAIN: 2 };
  const regionAt = (x, z) => {
    const g = riverQuery(great, x, z);
    // Lantern Park: inland it ends at the Old Town's first street (the coverage skips its 0.55 contour and lot streets)
    if (g.side > 0) return g.s > sWest && g.s < sEast && g.d < FLOODPLAIN ? REG.LANTERN : REG.NONE;
    const jq = riverQuery(jade, x, z);
    return jq.side > 0 || !southOfCentres(x, z) ? REG.NONE : REG.PLAIN;
  };
  // water distance: exact on every second texel, interpolated between them, exact again within 40 m of the water
  for (let j = 0; j < FH; j += 2) for (let i = 0; i < FW; i += 2) fWater[j * FW + i] = world.waterDist(B.X0 + i * FS, B.Z0 + j * FS);
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
    if (!(i & 1) && !(j & 1)) continue;
    const i0 = i & ~1, j0 = j & ~1, i1 = Math.min(i0 + 2, (FW - 1) & ~1), j1 = Math.min(j0 + 2, (FH - 1) & ~1);
    const u = i1 > i0 ? (i - i0) / 2 : 0, v = j1 > j0 ? (j - j0) / 2 : 0;
    const w = (fWater[j0 * FW + i0] * (1 - u) + fWater[j0 * FW + i1] * u) * (1 - v) + (fWater[j1 * FW + i0] * (1 - u) + fWater[j1 * FW + i1] * u) * v;
    fWater[j * FW + i] = w < 40 || i1 < i || j1 < j ? world.waterDist(B.X0 + i * FS, B.Z0 + j * FS) : w;
  }
  // exact on every second texel; a texel between four that agree takes their region, otherwise it is computed
  // exactly too (the regions are large and their edges are where the samples disagree)
  for (let j = 0; j < FH; j += 2) for (let i = 0; i < FW; i += 2) fRegion[j * FW + i] = regionAt(B.X0 + i * FS, B.Z0 + j * FS);
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
    if (!(i & 1) && !(j & 1)) continue;
    const i0 = i & ~1, j0 = j & ~1, i1 = Math.min(i0 + 2, (FW - 1) & ~1), j1 = Math.min(j0 + 2, (FH - 1) & ~1);
    const r0 = fRegion[j0 * FW + i0];
    const same = fRegion[j0 * FW + i1] === r0 && fRegion[j1 * FW + i0] === r0 && fRegion[j1 * FW + i1] === r0 && i1 >= i && j1 >= j;
    fRegion[j * FW + i] = same ? r0 : regionAt(B.X0 + i * FS, B.Z0 + j * FS);
  }
  for (let k = 0; k < FW * FH; k++) if (fWater[k] < PARK_WATER - 6) fRegion[k] = REG.NONE;
  lap('fieldRiver');
  // owners only where needed (plain), every other texel copied from the nearest computed one
  // Ovoo Hill: the highest ground of the plain within 900 m of the confluence. The plain's west edge is the line
  // from the Jiangbei centre over its summit to the river; land west of it is the Jade River bank (not in the plan).
  const conf = jade.pts[jade.pts.length - 1];
  let ovoo = null;
  for (let k = 0; k < fRegion.length; k++) {
    if (fRegion[k] !== REG.PLAIN) continue;
    const x = B.X0 + (k % FW) * FS, z = B.Z0 + Math.floor(k / FW) * FS;
    if (Math.hypot(x - conf[0], z - conf[1]) > 900) continue;
    const h = world.heightAt(x, z);
    if (!ovoo || h > ovoo.h) ovoo = { x, z, h };
  }
  const westOfOvooLine = (x, z) => ovoo && (ovoo.x - DJ.cx) * (z - DJ.cz) - (ovoo.z - DJ.cz) * (x - DJ.cx) > 0;
  for (let k = 0; k < fRegion.length; k++) {
    if (fRegion[k] === REG.PLAIN && westOfOvooLine(B.X0 + (k % FW) * FS, B.Z0 + Math.floor(k / FW) * FS)) fRegion[k] = REG.NONE;
  }
  stats.ovoo = ovoo && [Math.round(ovoo.x), Math.round(ovoo.z), Math.round(ovoo.h)];
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
    const k = j * FW + i;
    if (fRegion[k] !== REG.PLAIN) continue;
    if ((i & 1) || (j & 1)) continue;
    fOwner[k] = ownerAt(B.X0 + i * FS, B.Z0 + j * FS);
  }
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
    const k = j * FW + i;
    if (fRegion[k] !== REG.PLAIN || fOwner[k] >= 0) continue;
    fOwner[k] = fOwner[(j & ~1) * FW + (i & ~1)];
    if (fOwner[k] < 0) fOwner[k] = ownerAt(B.X0 + i * FS, B.Z0 + j * FS);
  }
  const fIdx = (x, z) => {
    const i = Math.round((x - B.X0) / FS), j = Math.round((z - B.Z0) / FS);
    return i < 0 || j < 0 || i >= FW || j >= FH ? -1 : j * FW + i;
  };
  const fieldWater = (x, z) => {
    const fx = Math.min(Math.max((x - B.X0) / FS, 0), FW - 1.001), fz = Math.min(Math.max((z - B.Z0) / FS, 0), FH - 1.001);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * FW + i;
    return (fWater[k] * (1 - u) + fWater[k + 1] * u) * (1 - v) + (fWater[k + FW] * (1 - u) + fWater[k + FW + 1] * u) * v;
  };
  const isSilk = (x, z, owner) => owner === iBund && bundLocal(x, z)[1] > bundSouth;
  // the Exchange lies on the Jiangbei side of the Bund's long axis (the Bund's own river front stays as it is)
  const bundAxis = DB.rz >= DB.rx ? [-Math.sin(DB.angle), Math.cos(DB.angle)] : [Math.cos(DB.angle), Math.sin(DB.angle)];
  const axisSide = (x, z) => Math.sign(bundAxis[0] * (z - DB.cz) - bundAxis[1] * (x - DB.cx));
  const jiangbeiSide = axisSide(DJ.cx, DJ.cz);
  // site of a point: 'lantern', 'silk', 'exchange' or null
  const siteAt = (x, z) => {
    const k = fIdx(x, z);
    if (k < 0) return null;
    if (fRegion[k] === REG.LANTERN) return 'lantern';
    if (fRegion[k] !== REG.PLAIN) return null;
    if (isSilk(x, z, fOwner[k])) return 'silk';
    return axisSide(x, z) === jiangbeiSide ? 'exchange' : null;
  };
  const slopeAt = (x, z) => Math.hypot(world.heightAt(x + 4, z) - world.heightAt(x - 4, z), world.heightAt(x, z + 4) - world.heightAt(x, z - 4)) / 8;

  // dev switch (?noplan, dev builds only): an empty plan, to measure the cost and side effects of the plumbing alone
  if (typeof __DEV__ !== 'undefined' && __DEV__ && typeof location !== 'undefined' && new URLSearchParams(location.search).has('noplan')) fRegion.fill(REG.NONE);
  lap('field');

  // ---- infill pass: own stream, appended after everything else
  const R = rng(5678);
  const infill = [];
  const cells = [];
  const owners = new Set();
  for (let k = 0; k < fOwner.length; k++) if (fRegion[k] === REG.PLAIN && fOwner[k] >= 0) owners.add(fOwner[k]);
  const H = INFILL_HEIGHT;
  for (const di of [...owners].sort((a, b) => a - b)) {
    const D = DISTRICTS[di];
    const ca = Math.cos(D.angle), sa = Math.sin(D.angle);
    const toWorld = (lx, lz) => [D.cx + lx * ca - lz * sa, D.cz + lx * sa + lz * ca];
    const toLocal = (x, z) => [(x - D.cx) * ca + (z - D.cz) * sa, -(x - D.cx) * sa + (z - D.cz) * ca];
    let i0 = 1e9, i1 = -1e9, j0 = 1e9, j1 = -1e9;
    for (const [x, z] of [[B.X0, B.Z0], [B.X1, B.Z0], [B.X0, B.Z1], [B.X1, B.Z1]]) {
      const [lx, lz] = toLocal(x, z);
      i0 = Math.min(i0, Math.floor(lx / D.block)); i1 = Math.max(i1, Math.ceil(lx / D.block));
      j0 = Math.min(j0, Math.floor(lz / D.block)); j1 = Math.max(j1, Math.ceil(lz / D.block));
    }
    const inner = D.block - D.road - 6;
    for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) {
      const lcx = (i + 0.5) * D.block, lcz = (j + 0.5) * D.block;
      const [wx, wz] = toWorld(lcx, lcz);
      if (siteAt(wx, wz) !== 'exchange' || fOwner[fIdx(wx, wz)] !== di) continue;
      const dom = world.districtAt(wx, wz);
      if (dom.index === di && dom.weight >= 0.55) continue;   // the first lot pass owns this cell
      stats.candidates++;
      if (coreAt(wx, wz)) { stats.rejects.core++; continue; }
      const pts = [[wx, wz]];
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pts.push(toWorld(lcx + u * D.block / 2, lcz + v * D.block / 2));
      let reason = null;
      for (const [x, z] of pts) {
        if (world.heightAt(x, z) > 0.5 && ownerAt(x, z) !== di) { reason = 'seam'; break; }
        for (const o of gridded) if (o !== di && world.districtWeight(o, x, z) > 0.3) { reason = 'other'; break; }
        if (reason) break;
      }
      if (!reason && inKeep(wx, wz, D.block * 0.72)) reason = 'keepout';
      if (reason) { stats.rejects[reason]++; continue; }
      // subdivision: the urban pattern (mostly 2 x 2), whatever the owner's type, so lots pass the slope test
      const r = R();
      const nx = r < 0.5 ? 2 : 1, nz = r < 0.8 ? 2 : 1;
      const gap = 4;
      const sw = (inner - gap * (nx - 1)) / nx, sd = (inner - gap * (nz - 1)) / nz;
      const lots = [];
      let area = 0;
      for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
        const lx = lcx - inner / 2 + sw / 2 + a * (sw + gap);
        const lz = lcz - inner / 2 + sd / 2 + b * (sd + gap);
        const [x, z] = toWorld(lx, lz);
        if (world._isReserved(x, z, Math.max(sw, sd) * 0.5)) continue;
        if (inKeep(x, z, Math.max(sw, sd) * 0.71) || inRamp(x, z, Math.max(sw, sd) * 0.71)) continue;
        let gMin = 1e9, gMax = -1e9, ok = true;
        for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) {
          const [px, pz] = toWorld(lx + u * sw * 0.5, lz + v * sd * 0.5);
          const h = world.heightAt(px, pz);
          if (h < 2.5) ok = false;
          gMin = Math.min(gMin, h); gMax = Math.max(gMax, h);
        }
        if (!ok || gMax - gMin > 14 || gMax > HILL_FOOT) continue;
        const wdist = world.waterDist(x, z);
        if (wdist < 12) continue;
        // block-edge sides of the lot (local -x, +x, -z, +z): the streets around these are painted in full
        lots.push({ x, z, w: sw, d: sd, angle: D.angle, district: di, type: DT.URBAN, gMin, gMax, waterDist: wdist, distFromCenter: 1, infill: true, edges: [a === 0, a === nx - 1, b === 0, b === nz - 1] });
        area += sw * sd;
      }
      if (area < 0.5 * inner * inner) { stats.rejects.half++; continue; }
      for (const L of lots) {
        L.seed = (R() * 1e9) | 0;
        // height rule
        const f = H.baseVar[0] + (H.baseVar[1] - H.baseVar[0]) * R();
        let dB = 1e9; for (const g of landings) dB = Math.min(dB, Math.hypot(L.x - g.x, L.z - g.z));
        let dR = 1e9; for (const rt of ROUTES) dR = Math.min(dR, World.polyDist(rt.dense, L.x, L.z));
        let cap = H.base * f + (L.waterDist < H.waterDist ? H.water : 0) + H.bridge * Math.max(0, 1 - dB / H.bridgeDist) + H.rail * Math.max(0, 1 - dR / H.railDist);
        cap = Math.min(cap, H.ceiling);
        L.cap = cap;
        L.maxTop = L.gMax + cap;
        infill.push(L);
        stats.lotArea += L.w * L.d;
      }
      cells.push({ di, i, j, x: wx, z: wz });
      stats.built++;
    }
  }
  stats.lots = infill.length;
  lap('infill');

  // ---- lot footprints (existing and infill) in a 100 m grid: distance of a point to the nearest lot
  const LG = 100, lotGridAll = new Map();
  for (const L of world.lots.concat(infill)) {
    if (L.x < B.X0 - 300 || L.x > B.X1 + 300 || L.z < B.Z0 - 300 || L.z > B.Z1 + 300) continue;
    const r = Math.hypot(L.w, L.d) / 2;
    for (let gx = Math.floor((L.x - r) / LG); gx <= Math.floor((L.x + r) / LG); gx++) for (let gz = Math.floor((L.z - r) / LG); gz <= Math.floor((L.z + r) / LG); gz++) {
      const kk = gx * 7919 + gz;
      if (!lotGridAll.has(kk)) lotGridAll.set(kk, []);
      lotGridAll.get(kk).push(L);
    }
  }
  // distance from (x, z) to the nearest lot footprint (0 inside one), searched up to `reach` metres
  const lotDist = (x, z, reach) => {
    let best = reach;
    for (let gx = Math.floor((x - reach) / LG); gx <= Math.floor((x + reach) / LG); gx++) for (let gz = Math.floor((z - reach) / LG); gz <= Math.floor((z + reach) / LG); gz++) {
      for (const L of lotGridAll.get(gx * 7919 + gz) || []) {
        const c = Math.cos(L.angle), s = Math.sin(L.angle), dx = x - L.x, dz = z - L.z;
        const ex = Math.max(Math.abs(dx * c + dz * s) - L.w / 2, 0), ez = Math.max(Math.abs(-dx * s + dz * c) - L.d / 2, 0);
        best = Math.min(best, Math.hypot(ex, ez));
      }
    }
    return best;
  };
  // number of points (every 2 m) of segment a-b that come closer than `clear` to a lot footprint
  const lotHits = (ax, az, bx, bz, clear) => {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
    let hits = 0;
    for (let k = 0; k <= n; k++) if (lotDist(ax + (bx - ax) * k / n, az + (bz - az) * k / n, clear + 1) < clear) hits++;
    return hits;
  };

  // ---- coverage raster (3 m): r built, g owner, b park, a style
  const CS = B.CELL, CW = Math.ceil((B.X1 - B.X0) / CS), CH = Math.ceil((B.Z1 - B.Z0) / CS);
  const built = new Uint8Array(CW * CH), owner = new Uint8Array(CW * CH).fill(255), park = new Uint8Array(CW * CH), style = new Uint8Array(CW * CH);
  const exist = new Uint8Array(CW * CH);   // existing lots plus their sidewalk and half street
  const stamp = (cx, cz, ang, x0, x1, z0, z1, fn) => {
    // rectangle in the frame rotated by ang around (cx, cz), local x in [x0, x1], z in [z0, z1]
    const c = Math.cos(ang), s = Math.sin(ang);
    const ex = Math.max(Math.abs(x0), Math.abs(x1)), ez = Math.max(Math.abs(z0), Math.abs(z1));
    const rx = Math.abs(c) * ex + Math.abs(s) * ez, rz = Math.abs(s) * ex + Math.abs(c) * ez;
    const i0 = Math.max(0, Math.floor((cx - rx - B.X0) / CS)), i1 = Math.min(CW - 1, Math.ceil((cx + rx - B.X0) / CS));
    const j0 = Math.max(0, Math.floor((cz - rz - B.Z0) / CS)), j1 = Math.min(CH - 1, Math.ceil((cz + rz - B.Z0) / CS));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = B.X0 + (i + 0.5) * CS - cx, z = B.Z0 + (j + 0.5) * CS - cz;
      const lx = x * c + z * s, lz = -x * s + z * c;
      if (lx >= x0 && lx <= x1 && lz >= z0 && lz <= z1) fn(j * CW + i);
    }
  };
  for (const L of world.lots) {
    if (L.x < B.X0 - 200 || L.x > B.X1 + 200 || L.z < B.Z0 - 200 || L.z > B.Z1 + 200) continue;
    const pad = 3 + DISTRICTS[L.district].road / 2 + 2;
    stamp(L.x, L.z, L.angle, -L.w / 2 - pad, L.w / 2 + pad, -L.d / 2 - pad, L.d / 2 + pad, (k) => { exist[k] = 1; });
  }
  for (const L of infill) {
    const D = DISTRICTS[L.district];
    const out = 3 + D.road + 3 + 0.5, inn = 2.5;
    const e = L.edges;
    stamp(L.x, L.z, L.angle, -L.w / 2 - (e[0] ? out : inn), L.w / 2 + (e[1] ? out : inn), -L.d / 2 - (e[2] ? out : inn), L.d / 2 + (e[3] ? out : inn), (k) => { built[k] = 255; owner[k] = L.district; });
  }

  // ---- existing streets that carry traffic through plan land (the district streets trafficCars.js buildRuns drives,
  // which extend to blocks of district weight 0.3): painted as city streets (built coverage, the district's own grid),
  // so the parks stop at them and no car drives across a lawn. The runs themselves are not changed.
  const edgeStreet = new Uint8Array(CW * CH);
  for (const di of gridded) {
    const D = DISTRICTS[di];
    const ca = Math.cos(D.angle), sa = Math.sin(D.angle);
    const toW = (lx, lz) => [D.cx + lx * ca - lz * sa, D.cz + lx * sa + lz * ca];
    const nI = Math.ceil(Math.max(D.rx, D.rz) / D.block) + 1;
    const blockOk = (bi, bj) => { const [x, z] = toW((bi + 0.5) * D.block, (bj + 0.5) * D.block); const dom = world.districtAt(x, z); return dom.index === di && dom.weight >= 0.3; };
    for (let axis = 0; axis < 2; axis++) for (let i = -nI; i <= nI; i++) for (let k = -nI; k < nI; k++) {
      const a = axis === 0 ? toW(i * D.block, k * D.block) : toW(k * D.block, i * D.block);
      const b = axis === 0 ? toW(i * D.block, (k + 1) * D.block) : toW((k + 1) * D.block, i * D.block);
      if (Math.max(a[0], b[0]) < B.X0 || Math.min(a[0], b[0]) > B.X1 || Math.max(a[1], b[1]) < B.Z0 || Math.min(a[1], b[1]) > B.Z1) continue;
      let inSite = false;
      for (let s = 0; s <= 8 && !inSite; s++) {
        // a stretch of the street lies on plan land outside the existing blocks (their lots, streets and the 0.55 core)
        const x = a[0] + (b[0] - a[0]) * s / 8, z = a[1] + (b[1] - a[1]) * s / 8;
        const i3 = Math.floor((x - B.X0) / CS), j3 = Math.floor((z - B.Z0) / CS);
        inSite = i3 >= 0 && j3 >= 0 && i3 < CW && j3 < CH && !exist[j3 * CW + i3] && !built[j3 * CW + i3] && !!siteAt(x, z) && !coreAt(x, z);
      }
      if (!inSite) continue;
      if (!(axis === 0 ? blockOk(i - 1, k) || blockOk(i, k) : blockOk(k, i - 1) || blockOk(k, i))) continue;
      let ok = true, hPrev = null;
      for (let s = 0; s <= 4 && ok; s++) {
        const x = a[0] + (b[0] - a[0]) * s / 4, z = a[1] + (b[1] - a[1]) * s / 4, h = world.heightAt(x, z);
        if (h < 2.0 || world.waterDist(x, z) < 6 || world.districtAt(x, z).index !== di) ok = false;
        if (hPrev !== null && Math.abs(h - hPrev) / (D.block / 4) > 0.4) ok = false;
        hPrev = h;
      }
      if (!ok) continue;
      const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, hw = D.road / 2 + 3.5, hl = D.block / 2 + hw;
      const ang = axis === 0 ? D.angle + Math.PI / 2 : D.angle;
      stamp(cx, cz, ang, -hl, hl, -hw, hw, (kk) => { if (!built[kk] && !exist[kk]) { built[kk] = 255; owner[kk] = di; edgeStreet[kk] = 1; } });
    }
  }

  // ---- approach avenues: from each bridge landing in a plan site straight to the nearest street of the
  // adjoining built blocks (infill or existing lots)
  const avenues = [];
  const streetTarget = (L) => {
    // candidate street points: grid intersections of districts that have lots or infill near them; the nearest
    // one whose straight avenue keeps clear of every lot (existing or infill) is taken
    const cands = [];
    for (const di of gridded) {
      const D = DISTRICTS[di];
      const ca = Math.cos(D.angle), sa = Math.sin(D.angle);
      const lx0 = (L.x - D.cx) * ca + (L.z - D.cz) * sa, lz0 = -(L.x - D.cx) * sa + (L.z - D.cz) * ca;
      const n = Math.ceil(700 / D.block);
      for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) {
        const lx = (Math.round(lx0 / D.block) + a) * D.block, lz = (Math.round(lz0 / D.block) + b) * D.block;
        const x = D.cx + lx * ca - lz * sa, z = D.cz + lx * sa + lz * ca;
        const d = Math.hypot(x - L.x, z - L.z);
        if (d < 40 || d > 700) continue;
        // inland: onward from the bridge, not back toward the water
        if ((x - L.x) * (L.x - L.ox) + (z - L.z) * (L.z - L.oz) < 0.3 * d * Math.hypot(L.x - L.ox, L.z - L.oz)) continue;
        // on the same bank and next to built land of this district: a lot within one block of the crossing
        if (crossesRiver(great, L.x, L.z, x, z) || crossesRiver(jade, L.x, L.z, x, z)) continue;
        const near = (arr) => arr.some((q) => q.district === di && Math.abs(q.x - x) < D.block * 0.75 && Math.abs(q.z - z) < D.block * 0.75);
        if (!near(infill) && !near(world.lots)) continue;
        cands.push({ x, z, d, di });
      }
    }
    cands.sort((p, q) => p.d - q.d);
    // the avenue's last 12 m end on the target street, between the blocks: only the part before it must be clear
    for (const c of cands) {
      const t = Math.max(0, 1 - 12 / c.d);
      if (!lotHits(L.x, L.z, L.x + (c.x - L.x) * t, L.z + (c.z - L.z) * t, AVENUE_CLEAR)) return c;
    }
    return null;
  };
  for (const L of landings) {
    // a landing serves the plan when plan land lies right beside it
    let s = null;
    for (let a = 0; a < 8 && !s; a++) s = siteAt(L.x + Math.cos(a * 0.785) * 40, L.z + Math.sin(a * 0.785) * 40);
    if (!s) continue;
    const T = streetTarget(L);
    if (!T) continue;
    avenues.push({ ax: L.x, az: L.z, bx: T.x, bz: T.z, hw: 8, di: T.di });
  }
  const onAvenue = (x, z, m) => avenues.some((v) => segDist(v.ax, v.az, v.bx, v.bz, x, z) < v.hw + m);
  // dev check: no avenue comes closer than AVENUE_CLEAR to a lot (except on its target street)
  stats.avenueLotHits = avenues.reduce((n, v) => { const d = Math.hypot(v.bx - v.ax, v.bz - v.az), t = Math.max(0, 1 - 12 / d); return n + lotHits(v.ax, v.az, v.ax + (v.bx - v.ax) * t, v.az + (v.bz - v.az) * t, AVENUE_CLEAR); }, 0);
  lap('avenues');

  // ---- park coverage and style
  const silkPts = [];
  for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) {
    const k = j * CW + i;
    const x = B.X0 + (i + 0.5) * CS, z = B.Z0 + (j + 0.5) * CS;
    if (built[k]) continue;
    const site = siteAt(x, z);
    if (!site) continue;
    if (onAvenue(x, z, 3)) { park[k] = 255; style[k] = STYLE.AVENUE; continue; }
    if (exist[k] || coreAt(x, z)) continue;
    // Lantern Park ends at the Old Town's first street: the city paints and drives its streets from a district weight
    // of 0.3 (terrainShade.js, trafficCars.js buildRuns), so the park stops at that contour
    if (site === 'lantern' && streetZone(x, z)) continue;
    const wd = fieldWater(x, z);
    if (wd < PARK_WATER || inKeep(x, z) || inRamp(x, z, 4)) continue;
    if (slopeAt(x, z) > STEEP) continue;
    if (site !== 'lantern' && world.heightAt(x, z) > HILL_FOOT) continue;
    park[k] = 255;
    if (site === 'lantern') style[k] = STYLE.LANTERN;
    else if (site === 'silk') { style[k] = STYLE.SILK; silkPts.push(x, z); }
    else {
      style[k] = wd < QUAY_DEPTH ? STYLE.QUAY : STYLE.POCKET;
      owner[k] = fOwner[fIdx(x, z)];
    }
  }
  // Silk Road Garden centre: the centroid of its land, pulled onto flat ground
  let silk = null;
  if (silkPts.length) {
    let sx = 0, sz = 0;
    for (let i = 0; i < silkPts.length; i += 2) { sx += silkPts[i]; sz += silkPts[i + 1]; }
    sx /= silkPts.length / 2; sz /= silkPts.length / 2;
    let best = null;
    for (let dx = -90; dx <= 90; dx += 15) for (let dz = -90; dz <= 90; dz += 15) {
      const x = sx + dx, z = sz + dz;
      if (style[Math.floor((z - B.Z0) / CS) * CW + Math.floor((x - B.X0) / CS)] !== STYLE.SILK) continue;
      let hmin = 1e9, hmax = -1e9;
      for (let a = 0; a < 8; a++) { const h = world.heightAt(x + Math.cos(a * 0.785) * 45, z + Math.sin(a * 0.785) * 45); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); }
      const score = (hmax - hmin) + Math.hypot(dx, dz) * 0.03;
      if (!best || score < best.score) best = { x, z, score };
    }
    if (best) silk = { x: best.x, z: best.z, r: 45, rings: SILK_RINGS, spokeR: SILK_SPOKE_R };
  }
  // garden avenues: from the plaza to the water, the approach avenues and the Exchange
  const silkAvenues = [];
  if (silk) {
    const targets = [];
    // nearest water edge
    let bw = null;
    for (let a = 0; a < 64; a++) {
      const dx = Math.cos(a / 64 * Math.PI * 2), dz = Math.sin(a / 64 * Math.PI * 2);
      for (let t = 50; t < 500; t += 10) { if (world.waterDist(silk.x + dx * t, silk.z + dz * t) < 8) { if (!bw || t < bw.t) bw = { t, x: silk.x + dx * t, z: silk.z + dz * t }; break; } }
    }
    if (bw) targets.push([bw.x, bw.z]);
    for (const v of avenues) if (siteAt(v.ax, v.az) === 'silk') targets.push([(v.ax + v.bx) / 2, (v.az + v.bz) / 2]);
    for (const [x, z] of targets) silkAvenues.push({ ax: silk.x, az: silk.z, bx: x, bz: z, hw: 3 });
  }

  // ---- statistics: painted (built) area, unbuilt paving, park area by style
  let painted = 0, unbuiltPaved = 0;
  const styleNames = ['none', 'lantern', 'silk', 'quay', 'pocket', 'avenue'];
  const sCount = new Array(6).fill(0);
  for (let k = 0; k < built.length; k++) {
    if (built[k]) painted++;
    if (park[k]) sCount[style[k]]++;
  }
  // a built texel is "unbuilt paving" if no infill lot lies within one street (road + both sidewalks) of it
  const lotGrid = new Map();
  for (const L of infill) { const kk = Math.floor(L.x / 100) * 7919 + Math.floor(L.z / 100); if (!lotGrid.has(kk)) lotGrid.set(kk, []); lotGrid.get(kk).push(L); }
  for (let j = 0; j < CH; j += 2) for (let i = 0; i < CW; i += 2) {
    const k = j * CW + i;
    if (!built[k]) continue;
    if (edgeStreet[k]) { stats.edgeStreetArea = (stats.edgeStreetArea || 0) + 4 * CS * CS; continue; }
    const x = B.X0 + (i + 0.5) * CS, z = B.Z0 + (j + 0.5) * CS;
    let ok = false;
    for (let a = -1; a <= 1 && !ok; a++) for (let b = -1; b <= 1 && !ok; b++) for (const L of lotGrid.get((Math.floor(x / 100) + a) * 7919 + Math.floor(z / 100) + b) || []) {
      const reach = 3 + DISTRICTS[L.district].road + 3 + 1;
      const c = Math.cos(L.angle), s = Math.sin(L.angle), dx = x - L.x, dz = z - L.z;
      if (Math.abs(dx * c + dz * s) < L.w / 2 + reach && Math.abs(-dx * s + dz * c) < L.d / 2 + reach) { ok = true; break; }
    }
    if (!ok) unbuiltPaved += 4;
  }
  stats.paintedArea = Math.round(painted * CS * CS);
  stats.unbuiltPaved = Math.round(unbuiltPaved * CS * CS);
  stats.lotArea = Math.round(stats.lotArea);
  for (let s = 1; s < 6; s++) stats.styleArea[styleNames[s]] = Math.round(sCount[s] * CS * CS);
  stats.cells = cells.length;
  stats.avenues = avenues.length;
  lap('cover');

  // ---- texture data
  const tex = new Uint8Array(CW * CH * 4);
  for (let k = 0; k < CW * CH; k++) { tex[k * 4] = built[k]; tex[k * 4 + 1] = owner[k]; tex[k * 4 + 2] = park[k]; tex[k * 4 + 3] = style[k]; }

  // river-walk axis: direction of the Great River chord between the two bridges that bound Lantern Park
  const pa = great.pts[great.s.findIndex((s) => s >= sWest)], pb = great.pts[great.s.findIndex((s) => s >= sEast)];
  const al = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
  const axis = [(pb[0] - pa[0]) / al, (pb[1] - pa[1]) / al];

  // ---- designed layout of Lantern Park and the Silk Road Garden (planPark.js)
  const park3 = (x, z) => { const i = Math.floor((x - B.X0) / CS), j = Math.floor((z - B.Z0) / CS); if (i < 0 || j < 0 || i >= CW || j >= CH) return 0; const k = j * CW + i; return park[k] ? style[k] : 0; };
  const layout = buildParkLayout({
    world, STYLE, axis, river: great, sA: sWest, sB: sEast, silk, silkAvenues, fieldWater, slopeAt,
    coverStyle: park3,
    isStreet: (x, z) => { const i = Math.floor((x - B.X0) / CS), j = Math.floor((z - B.Z0) / CS); return i >= 0 && j >= 0 && i < CW && j < CH && built[j * CW + i] > 0; },
    forEachPark: (fn) => { for (let k = 0; k < CW * CH; k++) if (park[k]) fn(B.X0 + (k % CW + 0.5) * CS, B.Z0 + (Math.floor(k / CW) + 0.5) * CS, style[k]); },
  });
  stats.park = layout.stats;
  lap('park');

  const plan = {
    stats, infill, cells, avenues, silk, silkAvenues, axis, keep, tex, W: CW, H: CH, layout,
    iBund, iJiangbei, iOld,
    coverAt(x, z) {
      const i = Math.floor((x - B.X0) / CS), j = Math.floor((z - B.Z0) / CS);
      if (i < 0 || j < 0 || i >= CW || j >= CH) return { built: 0, owner: -1, park: 0, style: 0, blocked: inKeep(x, z) };
      const k = j * CW + i;
      return { built: built[k] / 255, owner: owner[k] === 255 ? -1 : owner[k], park: park[k] / 255, style: style[k], blocked: inKeep(x, z) };
    },
    siteAt,
    styleAt: park3,   // park style at a point (0 where there is no park), fast
    // true where a hamlet (or other small set piece) would stand on built or park land of the plan
    blocks(x, z, r = 0) {
      for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
        const c = this.coverAt(x + dx, z + dz);
        if (c.built > 0 || c.park > 0) return true;
      }
      return false;
    },
    waterAt: fieldWater,
    lotHits,
    // GPU textures: coverage map (frame group) and the park layout and light maps (terrain group)
    upload(device) {
      const mk = (w, h, format, data, bpp, label) => {
        const t = device.createTexture({ size: [w, h], format, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST, label });
        device.queue.writeTexture({ texture: t }, data, { bytesPerRow: w * bpp }, [w, h]);
        return t;
      };
      this.coverTex = mk(CW, CH, 'rgba8unorm', tex, 4, 'planCover');
      this.layTex = mk(layout.atlasW, layout.atlasH, 'rgba16float', layout.texData('layout'), 8, 'parkLayout');
      this.litTex = mk(layout.atlasW, layout.atlasH, 'rgba16float', layout.texData('light'), 8, 'parkLight');
      this.device = device;
    },
    // bakes the ground glow of the uplit park trees into the light map (called by the vegetation module)
    bakeTreeLight(trees) {
      layout.bakeTrees(trees);
      this.device.queue.writeTexture({ texture: this.litTex }, layout.texData('light'), { bytesPerRow: layout.atlasW * 8 }, [layout.atlasW, layout.atlasH]);
    },
  };
  stats.ms = Math.round(performance.now() - t0);
  stats.msPhases = tm;
  plan.parkTrees = (masked) => { const t = performance.now(), r = parkTrees(world, plan, masked, slopeAt); stats.msTrees = Math.round(performance.now() - t); return r; };
  // Lawn more than 25 m from any lit walk, plaza or avenue (m2 per style): the "unlit lawn" check.
  plan.unlitLawn = () => {
    const res = {};
    for (let z = B.Z0; z < B.Z1; z += 6) for (let x = B.X0; x < B.X1; x += 6) {
      const cv = plan.coverAt(x, z);
      if (cv.park < 0.5) continue;
      const c = cv.style === STYLE.LANTERN || cv.style === STYLE.QUAY ? fieldWater(x, z) : 0;
      const p = parkPath(plan, cv.style, x, z, c, cv.owner);
      if (Math.min(p.d, p.plaza) > 25) { const k = styleNames[cv.style]; res[k] = (res[k] || 0) + 36; }
    }
    return res;
  };
  return plan;
}

// ------------------------------------------------------------------ park paths (CPU mirror of parkShade)

function nearSeg(segs, x, z) {
  let best = { d: 1e9, s: 0, i: -1 };
  segs.forEach((v, i) => {
    const bax = v.bx - v.ax, baz = v.bz - v.az, L = Math.hypot(bax, baz) || 1e-3;
    const h = Math.min(Math.max(((x - v.ax) * bax + (z - v.az) * baz) / (L * L), 0), 1);
    const d = Math.hypot(x - v.ax - bax * h, z - v.az - baz * h);
    if (d < best.d) best = { d, s: h * L, i };
  });
  return best;
}

// Nearest walk at a park point: { id, d (distance from the walk's edge, negative on it), s (coordinate along it),
// side (-1 / 1), plaza (distance from a plaza edge, negative inside) }.
export function parkPath(plan, style, x, z, c, owner) {
  let best = { id: -1, d: 1e9, s: 0, side: 1, plaza: 1e9 };
  const take = (id, dc, hw, s) => { const d = Math.abs(dc) - hw; if (d < best.d) best = { ...best, id, d, s, side: Math.sign(dc) || 1 }; };
  const a = x * plan.axis[0] + z * plan.axis[1];
  if (style === STYLE.LANTERN || style === STYLE.QUAY) {
    const lantern = style === STYLE.LANTERN;
    const c0 = walk0c(style, a);
    take(0, c - c0, lantern ? 2.4 : 2.0, a);
    if (lantern) { take(1, c - walk1c(a), 1.6, a); take(2, c - walk2c(a), 1.6, a); }
    const ak = Math.round(a / 120) * 120;
    if (c > c0) take(3, a - ak, 1.4, c);
    if (lantern) best.plaza = Math.hypot(a - ak, c - walk0c(style, ak) - PLAZA_IN) - 14;
  } else if (style === STYLE.SILK && plan.silk) {
    const S = plan.silk;
    const qx = x - S.x, qz = z - S.z, r = Math.hypot(qx, qz), th = Math.atan2(qz, qx);
    const g = nearSeg(plan.silkAvenues, x, z);
    if (g.d < 12 && r > S.r - 1) take(10 + g.i, g.d, 3.0, g.s);
    S.rings.forEach((rr, i) => take(4 + i, r - rr, 1.8, th * rr));
    if (r > S.r && r < S.spokeR) { const k = Math.round(th / (Math.PI / 4)); take(9, r * Math.sin(th - k * Math.PI / 4), 1.4, r); }
    best.plaza = r - S.r;
  } else if (style === STYLE.POCKET && owner >= 0) {
    const D = DISTRICTS[owner];
    const ca = Math.cos(D.angle), sa = Math.sin(D.angle);
    const lx = (x - D.cx) * ca + (z - D.cz) * sa, lz = -(x - D.cx) * sa + (z - D.cz) * ca;
    const fr = (v) => (((v / D.block + 0.5) % 1) + 1) % 1 - 0.5;
    const qx = fr(lx) * D.block, qz = fr(lz) * D.block;
    const ring = D.block / 2 - D.road / 2 - 7, m = Math.max(Math.abs(qx), Math.abs(qz));
    take(30, m - ring, 1.2, Math.abs(qz) > Math.abs(qx) ? qx : qz);
    if (m < ring) take(31, (Math.abs(qx) - Math.abs(qz)) * 0.70710678, 1.0, m);
    best.plaza = Math.hypot(qx, qz) - 7;
  } else if (style === STYLE.AVENUE) {
    const g = nearSeg(plan.avenues, x, z);
    take(20 + g.i, g.d, 10.2, g.s);
  }
  return best;
}

// Trees of the parks: rows along the walks, groves chosen by low-frequency noise, rings around the squares.
// Returned as fixed trees [x, y, z, scale, species + glow / 8] (glow 0 = unlit, 1 gold, 2 jade, 3 turquoise,
// 4 magenta, 5 warm white). masked(x, z) is the vegetation module's exclusion mask.
const ROW = {   // per walk id: [spacing, offset from the walk edge, species, glow, both sides]
  0: [9, 3.2, 0, 1, true], 1: [11, 3.0, 0, 5, true], 2: [11, 3.0, 0, 0, true], 3: [10, 2.8, 0, 0, false],
  4: [10, 3.0, 0, 3, false], 5: [12, 3.0, 0, 0, false], 6: [12, 3.0, 0, 4, false], 9: [8, 2.4, 1, 3, true],
  10: [8, 2.6, 1, 4, true], 11: [8, 2.6, 1, 4, true], 12: [8, 2.6, 1, 4, true],
  20: [13, 0.8, 0, 0, true], 21: [13, 0.8, 0, 0, true], 22: [13, 0.8, 0, 0, true], 23: [13, 0.8, 0, 0, true],
  30: [9, 2.6, 0, 5, false], 31: [9, 1.8, 0, 0, false],
};
const GROVE_GLOW = { [STYLE.LANTERN]: [1, 2], [STYLE.QUAY]: [1, 1], [STYLE.SILK]: [3, 4], [STYLE.POCKET]: [5, 5] };

function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const h = (a, b) => { let n = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return (h(ix, iz) * (1 - u) + h(ix + 1, iz) * u) * (1 - v) + (h(ix, iz + 1) * (1 - u) + h(ix + 1, iz + 1) * u) * v;
}

// Rows of the designed parks (planPark.js walks): [spacing, offset from the walk edge, species, both sides, chance]
const WALK_ROW = {
  river: [9, 3.2, 0, true, 1], upper: [11, 3.0, 0, true, 1], cross: [10, 2.8, 0, false, 1], link: [10, 2.8, 0, false, 1],
  path: [13, 2.4, 0, true, 0.6], ring: [10, 3.0, 0, false, 1], spoke: [8, 2.4, 1, true, 1], avenue: [8, 2.6, 1, true, 1],
};
const UPLIT = 12;   // every designed-park tree within this distance of a walk edge is uplit

function parkTrees(world, plan, masked, slopeAt) {
  const B = PLAN_BOX, R = rng(6161), CS3 = B.CELL;
  const out = [];
  const rows = new Set();
  const ok = (x, z, style) => {
    const cv = plan.coverAt(x, z);
    if (cv.park < 0.5 || cv.built > 0 || cv.style !== style) return false;
    if (masked(x, z) || plan.waterAt(x, z) < 9 || slopeAt(x, z) > 0.35) return false;
    return true;
  };
  const add = (x, z, scale, sp, glow) => out.push([x, world.heightAt(x, z), z, scale, sp + glow / 8]);
  const designed = (st) => st === STYLE.LANTERN || st === STYLE.SILK;
  // ---- quay walk, city squares and avenues: rows along the analytic walks, on the park texels only
  const CW = Math.ceil((B.X1 - B.X0) / CS3), CH = Math.ceil((B.Z1 - B.Z0) / CS3);
  for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) {
    const cx = B.X0 + (i + 0.5) * CS3, cz = B.Z0 + (j + 0.5) * CS3;
    const st = plan.styleAt(cx, cz);
    if (!st || designed(st)) continue;
    const cv = plan.coverAt(cx, cz);
    for (const [ox, oz] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) {
      const x = cx + ox, z = cz + oz, style = cv.style;
      const c = style === STYLE.QUAY ? plan.waterAt(x, z) : 0;
      const p = parkPath(plan, style, x, z, c, cv.owner);
      const row = ROW[p.id];
      if (!row || p.plaza < 3) continue;
      const [spacing, off, sp, glow, both] = row;
      if (Math.abs(p.d - off) > 0.75) continue;
      if (!both && p.side < 0) continue;
      const slot = Math.round(p.s / spacing - 0.5);
      if (Math.abs(p.s - (slot + 0.5) * spacing) > 0.75) continue;
      const key = `${p.id},${slot},${p.side},${style},${Math.round(x / 400)},${Math.round(z / 400)}`;
      if (rows.has(key) || !ok(x, z, style)) continue;
      rows.add(key);
      add(x, z, 0.72 + 0.12 * R(), style === STYLE.QUAY ? 3 : sp, glow && (slot & 1) === 0 ? glow : 0);
    }
  }
  // groves of the quay walk and the city squares: low-frequency noise, kept off walks and plazas
  for (let z = B.Z0; z < B.Z1; z += 8) for (let x = B.X0; x < B.X1; x += 8) {
    const jx = x + (R() - 0.5) * 6, jz = z + (R() - 0.5) * 6, pick = R(), sc = R(), sp = R();
    const st0 = plan.styleAt(jx, jz);
    if (!st0 || st0 === STYLE.AVENUE || designed(st0)) continue;
    const cv = plan.coverAt(jx, jz);
    const style = cv.style;
    const n = vnoise(jx / 70, jz / 70) * 0.7 + vnoise(jx / 23 + 9, jz / 23) * 0.3;
    if (n < (style === STYLE.POCKET ? 0.62 : 0.63) || pick > 0.75) continue;
    const c = style === STYLE.QUAY ? plan.waterAt(jx, jz) : 0;
    const p = parkPath(plan, style, jx, jz, c, cv.owner);
    if (p.d < 4 || p.plaza < 4 || !ok(jx, jz, style)) continue;
    const gc = vnoise(Math.floor(jx / 120) * 3.1, Math.floor(jz / 120) * 3.1);
    const gl = GROVE_GLOW[style] || [0, 0];
    const glow = gc < 0.4 ? gl[gc < 0.24 ? 0 : 1] : 0;
    const species = c < 40 && c > 0 && sp < 0.6 ? 3 : sp < 0.12 ? 1 : 0;
    add(jx, jz, 0.7 + 0.45 * sc, species, glow);
  }
  // ---- Lantern Park and the Silk Road Garden: rows along the walks of the layout
  const L = plan.layout;
  const busy = new Map();   // lamps, lantern posts and trees in 6 m cells
  const key6 = (x, z) => Math.floor(x / 6) * 7919 + Math.floor(z / 6);
  const mark = (x, z) => { const k = key6(x, z); if (!busy.has(k)) busy.set(k, []); busy.get(k).push(x, z); };
  const free = (x, z, d) => {
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const v = busy.get((Math.floor(x / 6) + a) * 7919 + Math.floor(z / 6) + b);
      if (v) for (let i = 0; i < v.length; i += 2) if (Math.hypot(v[i] - x, v[i + 1] - z) < d) return false;
    }
    return true;
  };
  for (const p of L.lamps) mark(p.x, p.z);
  for (const p of L.posts) mark(p.x, p.z);
  // uplight colour: one per grove cell of about 120 m (Lantern Park: gold, jade, warm white; garden: turquoise, magenta)
  const glowAt = (x, z, st) => {
    const g = vnoise(Math.floor(x / 120) * 3.1, Math.floor(z / 120) * 3.1);
    if (st === STYLE.SILK) return g < 0.55 ? 3 : 4;
    return g < 0.45 ? 1 : g < 0.72 ? 5 : 2;
  };
  const place = (x, z, st, scale, species) => {
    const q = L.sample(x, z);
    if (!q || q.style !== st || q.walk < 1.6 || q.plaza < 3 || q.pond < 2.5) return false;
    if (!free(x, z, 3.2) || !ok(x, z, st)) return false;
    mark(x, z);
    add(x, z, scale, species, q.walk <= UPLIT ? glowAt(x, z, st) : 0);
    return true;
  };
  for (const w of L.walks) {
    const row = WALK_ROW[w.kind];
    if (!row) continue;
    const [spacing, off, sp, both, chance] = row;
    const hw = { river: 2.4, upper: 1.8, cross: 1.6, link: 1.6, path: 1.1, ring: 1.8, spoke: 1.4, avenue: 3.0 }[w.kind];
    const P = w.pts;
    let acc = 0, next = spacing * 0.5, n = 0;
    for (let i = 2; i < P.length; i += 2) {
      const ax = P[i - 2], az = P[i - 1], bx = P[i], bz = P[i + 1], len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-6) continue;
      const tx = (bx - ax) / len, tz = (bz - az) / len;
      while (next <= acc + len) {
        const t = (next - acc) / len, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        for (const side of both ? [1, -1] : [(n & 1) ? -1 : 1]) {
          if (R() > chance) continue;
          const px = x - tz * side * (hw + off), pz = z + tx * side * (hw + off);
          // the river walk: willows on the water side
          const willow = w.style === STYLE.LANTERN && (w.kind === 'river' ? plan.waterAt(px, pz) < plan.waterAt(x, z) : plan.waterAt(px, pz) < 40);
          place(px, pz, w.style, 0.72 + 0.12 * R(), willow ? 3 : sp);
        }
        next += spacing; n++;
      }
      acc += len;
    }
  }
  // groves: low-frequency noise, off walks, plazas and ponds
  for (const reg of L.regions) {
    const st = reg.style;
    for (let z = reg.Z0; z < reg.Z0 + reg.H * 2; z += 8) for (let x = reg.X0; x < reg.X0 + reg.W * 2; x += 8) {
      const jx = x + (R() - 0.5) * 6, jz = z + (R() - 0.5) * 6, pick = R(), sc = R(), sp = R();
      const n = vnoise(jx / 70, jz / 70) * 0.7 + vnoise(jx / 23 + 9, jz / 23) * 0.3;
      if (n < (st === STYLE.SILK ? 0.74 : 0.6) || pick > 0.75) continue;
      const q = L.sample(jx, jz);
      if (!q || q.style !== st || q.walk < 4 || q.plaza < 4 || q.pond < 3) continue;
      const c = plan.waterAt(jx, jz);
      const species = st === STYLE.SILK ? (sp < 0.5 ? 1 : 0) : c < 40 && sp < 0.6 ? 3 : sp < 0.12 ? 1 : 0;
      place(jx, jz, st, 0.7 + 0.45 * sc, species);
    }
  }
  return out;
}
