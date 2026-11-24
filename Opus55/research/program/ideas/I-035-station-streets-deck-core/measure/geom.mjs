// I-035 geometry by the spec's world rules, as oriented boxes {x,z,a,hw,hd,y0,y1,tag}. Used for coverage only.
import fs from 'node:fs';
import { meta, parts, NP, PF, tracks, ground } from './raster.mjs';
const here = (f) => new URL(f, import.meta.url);
const lamps = JSON.parse(fs.readFileSync(here('./lamps.json')));
const screens = JSON.parse(fs.readFileSync(here('./screens.json')));
const MAT = { GLASS: 3, SHOP: 5 };
export const DIS = {
  0: { cx: 3300, cz: -1250, rx: 760, rz: 1050, angle: 0, block: 125, road: 20 },
  1: { cx: -750, cz: -150, rx: 1250, rz: 620, angle: 0.32, block: 72, road: 11 },
};
export const out = [];
const stats = {};
const add = (b, tag) => {
  stats[tag] = (stats[tag] || 0) + 1;
  // long boxes are cut into <= 6 m pieces so that the camera clearance removes only what is near the camera
  const n = Math.ceil(Math.max(b.hw, b.hd) / 3);
  if (n <= 1 || !['gallery', 'deck', 'spine', 'crossbridge'].includes(tag)) { b.tag = tag; out.push(b); return; }
  const alongX = b.hw >= b.hd, ca = Math.cos(b.a), sa = Math.sin(b.a), L = alongX ? b.hw : b.hd;
  for (let k = 0; k < n; k++) {
    const t = -L + (2 * k + 1) * L / n;
    const ox = alongX ? t * ca : -t * sa, oz = alongX ? t * sa : t * ca;
    out.push({ ...b, x: b.x + ox, z: b.z + oz, hw: alongX ? L / n : b.hw, hd: alongX ? b.hd : L / n, tag });
  }
};
// parts spatial index (by centre, 25 m cells)
const cell = new Map(), CS = 25;
for (let i = 0; i < NP; i++) { const o = i * PF; const k = Math.floor(parts[o] / CS) * 100003 + Math.floor(parts[o + 2] / CS); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(i); }
const near = (x, z, r) => { const res = []; for (let a = Math.floor((x - r) / CS); a <= Math.floor((x + r) / CS); a++) for (let b = Math.floor((z - r) / CS); b <= Math.floor((z + r) / CS); b++) { const l = cell.get(a * 100003 + b); if (l) res.push(...l); } return res; };
const P = (i, f) => parts[i * PF + f];   // 0 x,1 y0,2 z,3 a,4 hw,5 hd,6 h,7 kind,8 prm,9 mat,10 flags,11 taper

function frame(D) {
  const ca = Math.cos(D.angle), sa = Math.sin(D.angle);
  return { toW: (lx, lz) => [D.cx + lx * ca - lz * sa, D.cz + lx * sa + lz * ca], toL: (x, z) => { const dx = x - D.cx, dz = z - D.cz; return [dx * ca + dz * sa, -dx * sa + dz * ca]; }, a: D.angle };
}
// local box: centre (lx,lz), half extents (hx along local x, hz along local z), y range
function lbox(Fr, lx, lz, hx, hz, y0, y1, tag) { const [x, z] = Fr.toW(lx, lz); add({ x, z, a: Fr.a, hw: hx, hd: hz, y0, y1 }, tag); }
// existing bridge boxes (skybridges + walkways), local coords filled per district
const exBridges = [];
for (const [a, b] of [meta.sky, meta.walk]) for (let i = a; i < b; i++) exBridges.push({ x: P(i, 0), z: P(i, 2), y0: P(i, 1), y1: P(i, 1) + P(i, 6), hw: P(i, 4), a: P(i, 3) });

// ------------------------------------------------------------------ Yuzhong: station frame streets
export function yuzhong(report) {
  const D = DIS[1], Fr = frame(D), B = D.block, R2 = D.road / 2;
  const lots = meta.lots.filter((L) => L.di === 1 && L.t === 2).map((L) => { const [lx, lz] = Fr.toL(L.x, L.z); return { ...L, lx, lz }; });
  // podium strips per lot (SHOP parts that start below ground)
  for (const L of lots) {
    L.strips = [];
    for (const i of near(L.x, L.z, 45)) {
      if (P(i, 9) !== MAT.SHOP || P(i, 6) < 5 || P(i, 1) > L.gMax - 2) continue;
      const [lx, lz] = Fr.toL(P(i, 0), P(i, 2));
      if (Math.abs(lx - L.lx) > L.w / 2 || Math.abs(lz - L.lz) > L.d / 2) continue;
      L.strips.push({ lx, lz, hx: P(i, 4), hz: P(i, 5), top: P(i, 1) + P(i, 6) });
    }
  }
  // stations in the district -> the four bounding lines of their block
  const lines = new Set(), lineSt = {};
  const CAP = +(process.env.CAP || 600);
  const stations = [];
  for (const T of tracks) for (const s of T.stations) {
    const x = T.x[s.i], z = T.z[s.i];
    const [lx, lz] = Fr.toL(x, z);
    if ((lx / D.rx) ** 2 + (lz / D.rz) ** 2 > 1) continue;   // inside the district ellipse
    stations.push({ name: s.name, x, z, lx, lz, T, i: s.i });
    for (const k of ['0:' + Math.floor(lx / B) * B, '0:' + (Math.floor(lx / B) + 1) * B]) { lines.add(k); lineSt[k] = lz; }
    for (const k of ['1:' + Math.floor(lz / B) * B, '1:' + (Math.floor(lz / B) + 1) * B]) { lines.add(k); lineSt[k] = lx; }
  }
  report.stations = stations.map((s) => `${s.name} (${s.x.toFixed(0)}, ${s.z.toFixed(0)})`);
  report.lines = [...lines];
  let galLen = 0, bridgeN = 0, bridgeSkip = { lamp: 0, delta: 0, existing: 0, low: 0 }, alleyN = 0, crossN = 0, stairN = 0;
  const lampsOn = lamps.filter((l) => l[2] === 1).map((l) => { const [lx, lz] = Fr.toL(l[0], l[1]); return { lx, lz, g: l[5], axis: l[3] }; });
  for (const key of lines) {
    const [axis, v] = key.split(':').map(Number);
    // per side: gallery pieces sorted along the line
    const side = { '-1': [], '1': [] };
    for (const L of lots) {
      const off = axis === 0 ? L.lx - v : L.lz - v, half = axis === 0 ? L.w / 2 : L.d / 2;
      const setb = Math.abs(off) - half - R2 - 3;
      if (setb < -1 || setb > 6) continue;
      const sg = Math.sign(off);
      for (const s of L.strips) {
        const sOff = axis === 0 ? s.lx - v : s.lz - v, sHalf = axis === 0 ? s.hx : s.hz;
        const face = Math.abs(sOff) - sHalf;          // distance from line centre to the strip face
        if (face > R2 + 3 + 7) continue;              // interior strip, not on the street face
        const al = axis === 0 ? s.lz : s.lx, ah = axis === 0 ? s.hz : s.hx;
        if (Math.abs(al - lineSt[key]) > CAP) continue;   // within CAP m (along the street) of the station
        side[sg].push({ a0: al - ah + 0.3, a1: al + ah - 0.3, top: s.top, face, g: ground(...(axis === 0 ? Fr.toW(v + sg * face, al) : Fr.toW(al, v + sg * face))) });
      }
    }
    for (const sg of [-1, 1]) {
      const pcs = side[sg].sort((p, q) => p.a0 - q.a0);
      for (const p of pcs) {
        // gallery: 1.0 m on the roof, 1.8 m cantilever, deck on the roof (slab bottom = strip top)
        const inner = p.face + 1.0, outer = p.face - 1.8;
        const mid = (inner + outer) / 2, hwid = (inner - outer) / 2;
        // lamp notch: a pole within 1.5 m of the outer edge and the soffit < lamp top + 1 m -> pull back to 1.0 m over 3 m
        const notches = lampsOn.filter((l) => l.axis === axis && Math.sign((axis === 0 ? l.lx : l.lz) - v) === sg && (axis === 0 ? l.lz : l.lx) > p.a0 - 1.5 && (axis === 0 ? l.lz : l.lx) < p.a1 + 1.5 && p.top < l.g + 8.2);
        const len = p.a1 - p.a0; galLen += len;
        const c = (p.a0 + p.a1) / 2, h = len / 2;
        const mk = (lo, hi, o, i2, tag) => { const m = (o + i2) / 2, hw = (i2 - o) / 2; if (axis === 0) lbox(Fr, v + sg * m, (lo + hi) / 2, hw, (hi - lo) / 2, p.top, p.top + 0.35, tag); else lbox(Fr, (lo + hi) / 2, v + sg * m, (hi - lo) / 2, hw, p.top, p.top + 0.35, tag); };
        mk(p.a0, p.a1, outer, inner, 'gallery');
        // balustrade (glass, 1.1 m) at the outer edge
        if (axis === 0) lbox(Fr, v + sg * outer, c, 0.06, h, p.top + 0.35, p.top + 1.45, 'gallery'); else lbox(Fr, c, v + sg * outer, h, 0.06, p.top + 0.35, p.top + 1.45, 'gallery');
        p.notch = notches.length;
      }
      // alley links between consecutive pieces on the same side (gap <= 6 m, |dy| <= 4)
      for (let k = 1; k < pcs.length; k++) {
        const p = pcs[k - 1], q = pcs[k], gap = q.a0 - p.a1;
        if (gap <= 0.2) continue;
        const face = Math.min(p.face, q.face);
        if (gap <= 6 && Math.abs(q.top - p.top) <= 4) {
          alleyN++;
          const y0 = Math.min(p.top, q.top), y1 = Math.max(p.top, q.top) + 0.35;
          if (axis === 0) lbox(Fr, v + sg * (face - 0.4), (p.a1 + q.a0) / 2, 1.4, gap / 2 + 0.3, y0, y1, 'alley'); else lbox(Fr, (p.a1 + q.a0) / 2, v + sg * (face - 0.4), gap / 2 + 0.3, 1.4, y0, y1, 'alley');
        } else if (gap > 12 && gap < 24 && Math.abs(q.top - p.top) <= 4) {
          crossN++;   // crossing a cross street: a bridge along the line
          const y0 = Math.min(p.top, q.top) - 1.2, y1 = Math.max(p.top, q.top) + 1.45;
          if (axis === 0) lbox(Fr, v + sg * (face - 0.4), (p.a1 + q.a0) / 2, 1.5, gap / 2 + 0.3, y0, y1, 'crossbridge'); else lbox(Fr, (p.a1 + q.a0) / 2, v + sg * (face - 0.4), gap / 2 + 0.3, 1.5, y0, y1, 'crossbridge');
        } else if (gap <= 6) {
          stairN++;   // big step: the gallery ends with a stair flight in the alley (approximate as a block in the alley mouth)
          const lo = Math.min(p.top, q.top), hi = Math.max(p.top, q.top);
          if (axis === 0) lbox(Fr, v + sg * (face + 2), (p.a1 + q.a0) / 2, 4, gap / 2 - 0.3, lo, hi + 1.1, 'stair'); else lbox(Fr, (p.a1 + q.a0) / 2, v + sg * (face + 2), gap / 2 - 0.3, 4, lo, hi + 1.1, 'stair');
        }
      }
    }
    // bridges across the street: at block-relative 12, 36, 60 m
    const L1 = side['-1'], R1 = side['1'];
    const nb = Math.ceil(Math.max(D.rx, D.rz) / B) + 1;
    let lastA = -1e9;
    for (let j = -nb; j < nb; j++) for (const rel of [21.25, 36, 50.75]) {
      const a = j * B + rel;
      if (a - lastA < 30) continue;
      const pl = L1.find((p) => p.a0 + 1.6 <= a && p.a1 - 1.6 >= a), pr = R1.find((p) => p.a0 + 1.6 <= a && p.a1 - 1.6 >= a);
      if (process.env.DBG === key) console.log('dbg', key, j, rel, a.toFixed(1), !!pl, !!pr, pl && pl.top.toFixed(1), pr && pr.top.toFixed(1));
      if (!pl || !pr) continue;
      const dy = Math.abs(pl.top - pr.top);
      if (dy > 7) { bridgeSkip.delta++; if (process.env.DBG === key) console.log('skip', a.toFixed(1), 'delta'); continue; }
      const yTop = Math.min(pl.top, pr.top) + 0.35;
      const gRoad = ground(...(axis === 0 ? Fr.toW(v, a) : Fr.toW(a, v)));
      if (yTop - 1.55 < gRoad + 5) { bridgeSkip.low++; if (process.env.DBG === key) console.log('skip', a.toFixed(1), 'low'); continue; }
      // lamps within 3 m along on this line whose head would be within 1 m of the soffit
      const lampHit = lampsOn.some((l) => l.axis === axis && Math.abs((axis === 0 ? l.lz : l.lx) - a) < 3 + 2.0 && yTop - 1.55 < l.g + 8.2);
      if (lampHit) { bridgeSkip.lamp++; if (process.env.DBG === key) console.log('skip', a.toFixed(1), 'lamp'); continue; }
      const [wx, wz] = axis === 0 ? Fr.toW(v, a) : Fr.toW(a, v);
      // keep GAP m (along the street) from every existing skybridge or walkway that crosses this street
      const GAP = +(process.env.EXGAP || 12);
      const exHit = exBridges.some((e) => {
        const c = Math.cos(e.a), s2 = Math.sin(e.a);
        const ends = [-1, 1].map((u) => Fr.toL(e.x + u * e.hw * c, e.z + u * e.hw * s2));
        const off = ends.map(([qx, qz]) => (axis === 0 ? qx : qz) - v), al = ends.map(([qx, qz]) => (axis === 0 ? qz : qx));
        if (!(off[0] * off[1] < 0 || Math.min(Math.abs(off[0]), Math.abs(off[1])) < R2 + 3)) return false;   // does not cross this street
        if (Math.max(Math.abs(off[0]), Math.abs(off[1])) < 1 && e.hw > 5) { /* runs along the street centre */ }
        return a > Math.min(...al) - GAP && a < Math.max(...al) + GAP;
      });
      if (exHit) { bridgeSkip.existing++; if (process.env.DBG === key) console.log('skip', a.toFixed(1), 'existing'); continue; }
      const span = Math.max(pl.face, pr.face) - 1.8 + 0.3;
      // flat bridge, or a stair bridge in 4 steps from the lower to the higher gallery (each step a slab with its balustrade)
      const loS = pl.top <= pr.top ? -1 : 1, nS = dy > 1 ? 4 : 1;
      for (let k = 0; k < nS; k++) {
        const u0 = -span + 2 * span * k / nS, u1 = -span + 2 * span * (k + 1) / nS;
        const t = nS === 1 ? 0 : k / (nS - 1);
        const yk = Math.min(pl.top, pr.top) + 0.35 + dy * t;
        const c = loS * -1 * 0 + (u0 + u1) / 2 * -loS, hu = (u1 - u0) / 2;
        if (axis === 0) lbox(Fr, v + c, a, hu, 1.6, yk - 1.55, yk + 1.1, 'bridge'); else lbox(Fr, a, v + c, 1.6, hu, yk - 1.55, yk + 1.1, 'bridge');
      }
      bridgeN++; lastA = a;
    }
  }
  // Liziba: south exit at platform level (west half of the south face) + stair/lift tower 16 m out
  for (const s of stations) {
    const T = s.T, i = s.i, tx = T.tx[i], tz = T.tz[i], yb = T.y[i];
    const ez = [tz, -tx];                       // left of track
    const pickSide = [1, -1].map((sd) => ({ sd, g: ground(s.x + ez[0] * sd * 30, s.z + ez[1] * sd * 30) })).sort((p, q) => p.g - q.g)[0];  // downhill side
    const sd = pickSide.sd;
    const HZ = 14, along = -10;                 // exit at X = -10 (west of the A5 clearance line is not used: rule is the long-face centre minus 10 m)
    const bx = s.x + tx * along + ez[0] * sd * (HZ + 8), bz = s.z + tz * along + ez[1] * sd * (HZ + 8);
    add({ x: bx, z: bz, a: Math.atan2(ez[1], ez[0]), hw: 8, hd: 1.8, y0: yb - 1.0, y1: yb + 3.6 }, 'exit');   // covered bridge 16 m
    const lx = s.x + tx * along + ez[0] * sd * (HZ + 19), lz = s.z + tz * along + ez[1] * sd * (HZ + 19);
    const gl = ground(lx, lz);
    add({ x: lx, z: lz, a: Math.atan2(tz, tx), hw: 3.2, hd: 3.2, y0: gl, y1: yb + 4.5 }, 'lift');           // stair + lift tower down to the ground
    report['exit_' + s.name] = { sd, exitAt: [bx.toFixed(0), bz.toFixed(0)], towerGround: gl.toFixed(1), drop: (yb - gl).toFixed(1) };
  }
  Object.assign(report, { galleryLength_m: Math.round(galLen), bridges: bridgeN, bridgeSkip, alleyLinks: alleyN, crossStreetBridges: crossN, alleyStairs: stairN });
}

// ------------------------------------------------------------------ CBD core deck
export function cbd(report, dfcMax = 0.45) {
  const D = DIS[0], Fr = frame(D), B = D.block, R2 = D.road / 2;
  const lots = meta.lots.filter((L) => L.di === 0 && L.t === 1).map((L) => { const [lx, lz] = Fr.toL(L.x, L.z); return { ...L, lx, lz, dfc: Math.hypot(L.x - D.cx, L.z - D.cz) / Math.max(D.rx, D.rz) }; }).filter((L) => L.dfc < dfcMax);
  let deckLen = 0, faces = 0, screenSkip = 0, cols = 0, spans = 0;
  const decked = [];   // per lot corner info for spans
  for (const L of lots) {
    // podium part: GLASS at the lot centre, starting 4 m below gMin
    let pod = null;
    for (const i of near(L.x, L.z, 10)) if (P(i, 9) === MAT.GLASS && Math.abs(P(i, 0) - L.x) < 0.5 && Math.abs(P(i, 2) - L.z) < 0.5 && Math.abs(P(i, 1) - (L.gMin - 4)) < 0.6) { pod = i; break; }
    if (pod === null) continue;
    const ins = L.w / 2 - P(pod, 4), top = L.gMax + 10;
    L.ins = ins; L.top = top; decked.push(L);
    // faces: +x, -x, +z, -z ; street faces only (the 4 m split gap is not a street)
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const half = nx ? L.w / 2 : L.d / 2;
      const faceL = nx ? L.lx + nx * half : L.lz + nz * half;          // lot edge
      const lineC = faceL + (nx || nz) * (3 + R2);
      if (Math.abs(((lineC % B) + B) % B) > 1 && Math.abs(((lineC % B) + B) % B - B) > 1) continue;   // not a grid road
      faces++;
      const len = nx ? L.d : L.w;
      const along = nx ? L.lz : L.lx;
      // deck from 0.3 m inside the lot edge (3.3 m from the curb) to the podium face (embedded 0.3 m)
      const o0 = faceL - (nx || nz) * 0.3, o1 = faceL - (nx || nz) * (ins + 0.3);
      // screens on this face whose bottom is below deck top + 2.6
      let a0 = along - len / 2, a1 = along + len / 2;
      const blocks = [];
      for (const s of screens) {
        const [sx, sz] = Fr.toL(s.x, s.z);
        const sOff = nx ? sx : sz, sAl = nx ? sz : sx;
        if (Math.abs(sOff - faceL) > 2 || sAl < a0 - 20 || sAl > a1 + 20) continue;
        if (s.y - s.h / 2 < top + 2.6) blocks.push([sAl - s.w / 2 - 2, sAl + s.w / 2 + 2]);
      }
      if (blocks.length) screenSkip++;
      let segsA = [[a0, a1]];
      for (const [b0, b1] of blocks) segsA = segsA.flatMap(([p, q]) => (b1 <= p || b0 >= q ? [[p, q]] : [[p, b0], [b1, q]].filter(([u, w]) => w - u > 4)));
      for (const [p, q] of segsA) {
        deckLen += q - p;
        const mid = (o0 + o1) / 2, hw = Math.abs(o0 - o1) / 2;
        if (nx) lbox(Fr, mid, (p + q) / 2, hw, (q - p) / 2, top - 0.35, top, 'deck'); else lbox(Fr, (p + q) / 2, mid, (q - p) / 2, hw, top - 0.35, top, 'deck');
        if (nx) lbox(Fr, o0, (p + q) / 2, 0.06, (q - p) / 2, top, top + 1.1, 'deck'); else lbox(Fr, (p + q) / 2, o0, (q - p) / 2, 0.06, top, top + 1.1, 'deck');
        for (let c = p + 7.5; c < q - 3; c += 15) { const g = ground(...(nx ? Fr.toW(o0 - (nx) * 0.3, c) : Fr.toW(c, o0 - nz * 0.3))); if (nx) lbox(Fr, o0 - nx * 0.3, c, 0.35, 0.35, g, top - 0.35, 'column'); else lbox(Fr, c, o0 - nz * 0.3, 0.35, 0.35, g, top - 0.35, 'column'); cols++; }
      }
    }
  }
  // spans across each road between decked lots that face each other at a block corner band
  for (const L of decked) for (const M of decked) {
    if (M === L) continue;
    for (const ax of [0, 1]) {
      const dO = ax === 0 ? M.lx - L.lx : M.lz - L.lz, dA = ax === 0 ? M.lz - L.lz : M.lx - L.lx;
      if (dO <= 0) continue;
      const gapEdge = dO - (ax === 0 ? (L.w + M.w) / 2 : (L.d + M.d) / 2);
      if (Math.abs(gapEdge - (D.road + 6)) > 1) continue;     // facing across a road
      if (Math.abs(dA) > 5) continue;                          // same row (aligned blocks)
      const lenA = ax === 0 ? Math.min(L.d, M.d) : Math.min(L.w, M.w);
      const cO = (ax === 0 ? L.lx + L.w / 2 : L.lz + L.d / 2) + gapEdge / 2;
      const yTop = (L.top + M.top) / 2;
      for (const end of [0]) {   // one span at the middle of the facing lot pair (intersections stay open)
        const a = (ax === 0 ? L.lz : L.lx) + end;
        if (ax === 0) lbox(Fr, cO, a, gapEdge / 2 - 0.3 + 0.3, 2.0, yTop - 1.55, yTop + 1.1, 'span'); else lbox(Fr, a, cO, 2.0, gapEdge / 2, yTop - 1.55, yTop + 1.1, 'span');
        spans++;
      }
    }
  }
  // metro spine: freestanding deck under the viaduct through the core, 8 m wide at ground + 10
  const M = tracks.find((t) => t.kind === 'metro');
  let spine = 0;
  for (let i = M.iA; i < M.iB; i += 3) {
    const x = M.x[i], z = M.z[i];
    if (Math.hypot(x - D.cx, z - D.cz) / Math.max(D.rx, D.rz) > dfcMax) continue;
    const g = ground(x, z);
    add({ x, z, a: Math.atan2(M.tz[i], M.tx[i]), hw: 3.2, hd: 4.0, y0: g + 9.65, y1: g + 11.1 }, 'spine'); spine++;
  }
  Object.assign(report, { cbdLots: decked.length, faces, deckLength_m: Math.round(deckLen), facesWithScreenCut: screenSkip, columns: cols, spans, spineSegments: spine });
}
export { stats };
