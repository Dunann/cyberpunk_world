// Procedural architecture: turns world.lots into building "parts" (see buildings_wgsl.js for the part model),
// plus colliders, sign slots, point lights and shared data for other modules.

import { FLAG, MAT, PART_FLOATS } from './buildings_wgsl.js';
import { rng, clamp } from './math.js';
import { DT, DISTRICTS } from './world.js';

// ------------------------------------------------------------------ part buffer

export class Parts {
  constructor(cap = 32768) {
    this.cap = cap;
    this.data = new Float32Array(cap * PART_FLOATS);
    this.count = 0;
    this.solid = [];   // part indices that get colliders
  }

  add(o) {
    if (this.count >= this.cap) {
      const nd = new Float32Array(this.cap * 2 * PART_FLOATS);
      nd.set(this.data);
      this.data = nd; this.cap *= 2;
    }
    const d = this.data, k = this.count * PART_FLOATS;
    const kind = o.kind || 0, prm = o.prm || 0, prof = o.prof || 0, twist = o.twist || 0;
    let flags = o.flags || 0;
    const polyOdd = kind === 2 && prm < 12 && prm !== 4 && prm !== 8;
    if ((kind === 0 && prm > 0) || kind === 3 || kind === 4 || (kind === 2 && prm >= 12) || polyOdd) flags |= FLAG.ROUND;
    if (kind === 3 || kind === 4 || polyOdd) flags |= FLAG.NOBOX;
    if (prof !== 0 || twist !== 0) flags |= FLAG.CURVED;
    d[k] = o.x; d[k + 1] = o.y0; d[k + 2] = o.z; d[k + 3] = o.a || 0;
    d[k + 4] = o.hw; d[k + 5] = o.hd === undefined ? o.hw : o.hd; d[k + 6] = o.h; d[k + 7] = o.seed === undefined ? (this.count * 7.31) % 997 : o.seed;
    d[k + 8] = kind; d[k + 9] = prm; d[k + 10] = o.taper === undefined ? 1 : o.taper; d[k + 11] = twist;
    d[k + 12] = o.lx || 0; d[k + 13] = o.lz || 0; d[k + 14] = prof; d[k + 15] = flags;
    d[k + 16] = o.mat; d[k + 17] = o.floorH || 3; d[k + 18] = o.winW || 3; d[k + 19] = o.baseY === undefined ? o.y0 : o.baseY;
    const c = o.col || GRAY;
    d[k + 20] = c[0]; d[k + 21] = c[1]; d[k + 22] = c[2]; d[k + 23] = o.param === undefined ? 0.5 : o.param;
    const i = this.count++;
    if (o.solid) this.solid.push(i);
    return i;
  }

  get(i, f) { return this.data[i * PART_FLOATS + f]; }
  set(i, f, v) { this.data[i * PART_FLOATS + f] = v; }
}

const GRAY = [0.5, 0.5, 0.5];
export const PAL = {
  res: [[0.52, 0.48, 0.42], [0.44, 0.44, 0.46], [0.56, 0.44, 0.41], [0.6, 0.6, 0.58], [0.4, 0.46, 0.5], [0.44, 0.35, 0.29], [0.5, 0.5, 0.43], [0.36, 0.4, 0.38], [0.58, 0.52, 0.46]],
  glass: [[0.25, 0.45, 0.62], [0.2, 0.5, 0.52], [0.5, 0.56, 0.62], [0.5, 0.4, 0.3], [0.3, 0.35, 0.55], [0.15, 0.26, 0.36], [0.4, 0.5, 0.45]],
  stone: [[0.62, 0.56, 0.46], [0.56, 0.53, 0.49], [0.68, 0.62, 0.52], [0.52, 0.47, 0.41], [0.6, 0.58, 0.55]],
  brick: [[0.6, 0.42, 0.28], [0.66, 0.52, 0.36], [0.55, 0.36, 0.26], [0.7, 0.58, 0.42], [0.62, 0.48, 0.38]],
  office: [[0.5, 0.5, 0.52], [0.62, 0.6, 0.56], [0.36, 0.37, 0.41], [0.55, 0.5, 0.45], [0.45, 0.47, 0.44]],
  neon: [[1, 0.1, 0.5], [0.1, 0.9, 1], [1, 0.5, 0.1], [0.6, 0.2, 1], [0.2, 1, 0.5], [1, 0.85, 0.3], [1, 0.2, 0.2]],
  shop: [[0.38, 0.36, 0.34], [0.45, 0.42, 0.38], [0.3, 0.32, 0.35], [0.5, 0.45, 0.4], [0.42, 0.38, 0.4]],
  crown: [[1, 0.85, 0.6], [0.7, 0.9, 1], [1, 0.3, 0.6], [0.3, 0.9, 1], [1, 0.7, 0.35], [0.85, 0.85, 0.9]],
  tile: [[0.05, 0.55, 0.6], [0.04, 0.45, 0.62], [0.08, 0.62, 0.55], [0.05, 0.3, 0.6]],
};
for (const k of ['res', 'stone', 'brick', 'office', 'shop']) PAL[k] = PAL[k].map((c) => c.map((v) => v * 0.45));
const pick = (R, arr) => arr[Math.floor(R() * arr.length) % arr.length];
const RED = [1, 0.08, 0.05];

// ------------------------------------------------------------------ builder context

export class Builder {
  constructor(world, quality) {
    this.world = world;
    this.P = new Parts();
    this.q = quality;
    this.slots = world.signSlots;
    this.lights = [];          // [x,y,z,r,cr,cg,cb,flicker,priority]
    this.tops = [];            // {x,y,z,cbd}
    this.led = [];
    this.sites = {};             // landmark anchor points published to world.shared.landmarkSites
    this.hillTowers = [];        // hillside tower shafts, used to add skybridges
    this.hillPods = [];          // terraced hillside podiums, used to add elevated walkways
    this.propBudget = quality >= 2 ? 130000 : quality === 1 ? 70000 : 20000;
    this.props = 0;
    this.shopProps = 0;          // props added by shopfront() (awnings, AC units, stepped pavements)
  }

  part(o) { return this.P.add(o); }
  prop(o) {
    if (this.props >= this.propBudget) return -1;
    this.props++;
    o.flags = (o.flags || 0) | FLAG.PROP | (this.detail ? FLAG.DETAIL : 0);
    return this.P.add(o);
  }
  light(x, y, z, r, c, k, prio = 1, flicker = 0) { this.lights.push([x, y, z, r, c[0] * k, c[1] * k, c[2] * k, flicker, prio]); }
  // x,y,z = centre of the free sign area on the facade surface; nx,nz = outward facade normal; w,h in m.
  slot(x, y, z, nx, nz, w, h, vertical, style, roof = false) { this.slots.push({ x, y, z, nx, nz, w, h, vertical, style, roof }); }

  // world position of local (lx, lz) around (cx, cz) rotated by a
  static tw(cx, cz, a, lx, lz) { const c = Math.cos(a), s = Math.sin(a); return [cx + lx * c - lz * s, cz + lx * s + lz * c]; }
}

// Faces of a sharp rectangle in ring order (matches ringEval kind 0 with r = 0): side i follows corner i.
// Each face: start corner (local), direction along increasing face distance, outward normal (local), length.
export function rectFaces(hw, hd) {
  return [
    { sx: hw, sz: hd, dx: -1, dz: 0, nx: 0, nz: 1, len: 2 * hw, fid: 1 },
    { sx: -hw, sz: hd, dx: 0, dz: -1, nx: -1, nz: 0, len: 2 * hd, fid: 3 },
    { sx: -hw, sz: -hd, dx: 1, dz: 0, nx: 0, nz: -1, len: 2 * hw, fid: 5 },
    { sx: hw, sz: -hd, dx: 0, dz: 1, nx: 1, nz: 0, len: 2 * hd, fid: 7 },
  ];
}

// ------------------------------------------------------------------ shared pieces

// Air-conditioner units under windows of a box-shaped residential part.
function acUnits(B, R, x, z, a, hw, hd, y0, baseY, top, floorH, winW, density) {
  if (B.q === 0) return;
  const faces = rectFaces(hw, hd);
  const c = Math.cos(a), s = Math.sin(a);
  for (let fi = 0; fi < 4; fi++) {
    if (R() < 0.35) continue;
    const F = faces[fi];
    const n = Math.max(1, Math.round(F.len / winW));
    const cw = F.len / n;
    const f0 = Math.max(1, Math.ceil((y0 - baseY) / floorH) + 1), f1 = Math.floor((top - baseY) / floorH) - 1;
    const ang = Math.atan2(F.nz, F.nx) - Math.PI / 2 + a;
    for (let fl = f0; fl < f1; fl++) for (let k = 0; k < n; k++) {
      if (R() > density) continue;
      const side = (R() < 0.5 ? -1 : 1) * (0.25 + 0.1 * R()) * cw;
      const lx = F.sx + F.dx * (k + 0.5) * cw + F.dx * side + F.nx * 0.32;
      const lz = F.sz + F.dz * (k + 0.5) * cw + F.dz * side + F.nz * 0.32;
      const wx = x + lx * c - lz * s, wz = z + lx * s + lz * c;
      const y = baseY + fl * floorH + 0.1 * floorH;
      if (B.prop({ x: wx, y0: y, z: wz, a: ang, hw: 0.42, hd: 0.3, h: 0.55, mat: MAT.AC, col: [0.55, 0.55, 0.52], flags: FLAG.BOTTOM, seed: R() * 999 }) < 0) return;
    }
  }
}

function waterTank(B, R, x, z, y) {
  const r = 1.1 + R() * 0.9, h = 2 + R() * 1.5;
  B.prop({ x, y0: y, z, hw: r * 0.9, hd: r * 0.9, h: 0.6, mat: MAT.METAL, col: [0.25, 0.25, 0.27] });
  B.prop({ x, y0: y + 0.6, z, hw: r, hd: r, h, kind: 2, prm: 48, mat: MAT.METAL, col: R() < 0.5 ? [0.55, 0.55, 0.58] : [0.3, 0.42, 0.55] });
}

function aviation(B, x, y, z, seed) {
  B.prop({ x, y0: y, z, hw: 0.45, hd: 0.45, h: 0.7, mat: MAT.EMIT, col: RED, param: 40, winW: 1, seed, flags: FLAG.BOTTOM });
}

function mast(B, R, x, z, y, h, r) {
  B.part({ x, y0: y, z, hw: r, hd: r, h, kind: 2, prm: 8, taper: 0.35, mat: MAT.METAL, col: [0.45, 0.45, 0.48] });
  const s = R() * 999;
  aviation(B, x, y + h, z, s);
  aviation(B, x, y + h * 0.55, z, s);
}

// Billboard frame on a roof facing local normal (nx, nz) at the given world position; adds a sign slot.
function billboard(B, R, x, z, y, a, w, h, style) {
  const c = Math.cos(a), s = Math.sin(a);
  const nx = -s, nz = c; // local +z (hd axis) is the panel normal
  const post = h * 0.45;
  for (const o of [-0.35, 0.35]) {
    const px = x + c * w * o, pz = z + s * w * o;
    B.prop({ x: px, y0: y, z: pz, a, hw: 0.25, hd: 0.25, h: post, mat: MAT.METAL, col: [0.2, 0.2, 0.22] });
  }
  B.part({ x, y0: y + post, z, a, hw: w / 2, hd: 0.3, h, mat: MAT.METAL, col: [0.12, 0.12, 0.13], flags: FLAG.BOTTOM });
  B.slot(x + nx * 0.32, y + post + h / 2, z + nz * 0.32, nx, nz, w - 0.6, h - 0.6, false, style, true);
}

// Crown on top of a tower part. Returns the highest point.
function crown(B, R, o) {
  const { x, z, a, hw, hd, top, kind, prm, style, baseY } = o;
  let type = o.type;
  // keep tall crowns (spires, masts, lanterns) under the lot height cap (viewpoint sight lines)
  const capped = o.maxTop !== undefined && top + 12 > o.maxTop;
  if (capped) type = 'machine';
  const m = Math.min(hw, hd);
  if (type === 'machine') {
    B.part({ x, y0: top, z, a, hw: hw * (0.3 + R() * 0.2), hd: hd * (0.3 + R() * 0.2), h: 3.5 + R() * 3, mat: MAT.CONCRETE, col: [0.32, 0.32, 0.33] });
    const n = 1 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) {
      const [tx, tz] = Builder.tw(x, z, a, (R() - 0.5) * hw * 1.2, (R() - 0.5) * hd * 1.2);
      waterTank(B, R, tx, tz, top);
    }
    if (!capped && R() < 0.4) { const [mx, mz] = Builder.tw(x, z, a, hw * 0.5, -hd * 0.5); mast(B, R, mx, mz, top, 8 + R() * 10, 0.25); }
    roofDress(B, R, x, z, a, hw, hd, top, kind, prm, o);
    return top + 6;
  }
  if (type === 'lit') {
    // stepped, up-lit crown: 2-3 setback tiers, each a glowing core ringed by dark fins leaning inward
    const col = pick(R, PAL.crown);
    const tiers = 2 + (R() < 0.45 ? 1 : 0);
    const H = 10 + R() * Math.min(26, m * 0.9);
    let y = top, s = 0.94;
    const c = Math.cos(a), sn = Math.sin(a);
    for (let t = 0; t < tiers; t++) {
      const th = H * (t === 0 ? 0.45 : t === 1 ? 0.33 : 0.22);
      const thw = hw * s, thd = hd * s;
      B.part({ x, y0: y, z, a, hw: thw * 0.86, hd: thd * 0.86, h: th, kind, prm, taper: 0.92, mat: MAT.CROWN, col, param: 1.0 + R() * 0.8, seed: R() * 999 });
      // ledge with a lit lip
      B.part({ x, y0: y - 0.4, z, a, hw: thw + 0.4, hd: thd + 0.4, h: 0.5, kind, prm, mat: MAT.EMIT, col, param: 2.2, flags: FLAG.BOTTOM });
      // fins around the perimeter (only on box-like plans, max ~20 per tier)
      if (kind !== 2 || prm <= 8) {
        const nx = Math.max(2, Math.min(4, Math.round(thw / 4.5))), nz = Math.max(2, Math.min(3, Math.round(thd / 4.5)));
        const fins = [];
        for (let i = 0; i < nx; i++) { const u = -thw + (i + 0.5) * 2 * thw / nx; fins.push([u, thd], [u, -thd]); }
        for (let i = 0; i < nz; i++) { const v = -thd + (i + 0.5) * 2 * thd / nz; fins.push([thw, v], [-thw, v]); }
        for (const [lx, lz] of fins) {
          const wx = x + lx * c - lz * sn, wz = z + lx * sn + lz * c;
          const ins = 0.16;   // lean toward the centre
          B.prop({ x: wx, y0: y, z: wz, a: Math.atan2(-(wx - x), wz - z), hw: 0.25, hd: 0.9, h: th * 1.15, taper: 0.6, lx: -(wx - x) * ins, lz: -(wz - z) * ins, mat: MAT.METAL, col: [0.16, 0.16, 0.18] });
        }
      }
      y += th; s *= 0.74;
    }
    B.part({ x, y0: y, z, hw: Math.max(0.6, m * 0.05), h: 6 + R() * 10, kind: 2, prm: 8, taper: 0.1, mat: MAT.EMIT, col, param: 3 });
    return y;
  }
  if (type === 'pagoda') {
    let y = top, s = 0.82;
    const tiers = 2 + Math.floor(R() * 3);
    const roofC = R() < 0.5 ? [0.12, 0.3, 0.25] : [0.35, 0.12, 0.08];
    for (let t = 0; t < tiers; t++) {
      const th = 3.5 + R() * 1.5;
      B.part({ x, y0: y, z, a, hw: hw * s, hd: hd * s, h: th, mat: MAT.RES, col: [0.55, 0.15, 0.1], floorH: th, winW: 2.2, param: 0.8, baseY: y });
      y += th;
      B.part({ x, y0: y - 0.3, z, a, hw: hw * s + 2, hd: hd * s + 2, h: 3 + R(), prof: 4, taper: 0.45, mat: MAT.ROOFTILE, col: roofC, param: 3, flags: FLAG.BOTTOM });
      y += 2.2;
      s *= 0.72;
    }
    B.part({ x, y0: y + 0.5, z, hw: 0.3, h: 6, kind: 2, prm: 8, taper: 0.2, mat: MAT.METAL, col: [0.7, 0.55, 0.2] });
    return y + 6;
  }
  if (type === 'antenna') {
    B.part({ x, y0: top, z, a, hw: hw * 0.35, hd: hd * 0.35, h: 4, mat: MAT.CONCRETE, col: [0.25, 0.25, 0.27] });
    const h = 20 + R() * 40;
    mast(B, R, x, z, top + 4, h, 0.5 + R() * 0.6);
    return top + 4 + h;
  }
  if (type === 'spire') {
    const h = 25 + R() * Math.min(90, m * 3);
    B.part({ x, y0: top, z, a, hw: m * 0.35, hd: m * 0.35, h: h * 0.25, kind: 2, prm: 8, taper: 0.5, mat: MAT.GLASS, col: [0.5, 0.55, 0.6], param: 0.3, floorH: 4, winW: 1.5 });
    B.part({ x, y0: top + h * 0.25, z, hw: m * 0.17, hd: m * 0.17, h: h * 0.75, kind: 2, prm: 8, taper: 0.03, mat: MAT.METAL, col: [0.7, 0.72, 0.75] });
    aviation(B, x, top + h, z, R() * 999);
    return top + h;
  }
  if (type === 'helipad') {
    B.part({ x, y0: top, z, a, hw: hw * 0.7, hd: hd * 0.7, h: 3, kind, prm, mat: MAT.CONCRETE, col: [0.2, 0.2, 0.22] });
    const r = Math.min(hw, hd) * 0.82;
    B.part({ x, y0: top + 3, z, a, hw: r, hd: r, h: 1.2, kind: 2, prm: 48, mat: MAT.HELI, col: [0.2, 0.2, 0.2], flags: FLAG.BOTTOM });
    return top + 4.2;
  }
  if (type === 'billboard') {
    const w = Math.min(Math.max(hw, hd) * 1.6, 22);
    roofDress(B, R, x, z, a, hw, hd, top, kind, prm, o);
    billboard(B, R, x, z, top, a + (R() < 0.5 ? 0 : Math.PI / 2), w, w * (0.3 + R() * 0.2), style);
    return top + w * 0.5;
  }
  if (type === 'setback') {
    // one or two smaller office storeys set back from the edge, plant on the top one
    let y = top, s = 0.72;
    const n = 1 + (R() < 0.5 ? 1 : 0);
    for (let t = 0; t < n; t++) {
      const h = 7 + R() * 5;
      B.part({ x, y0: y, z, a, hw: hw * s, hd: hd * s, h, kind, prm, mat: MAT.OFFICE, col: [0.2, 0.2, 0.22], floorH: 3.6, winW: 3, baseY: y, param: 0.3, seed: R() * 999 });
      roofDress(B, R, x, z, a, hw * s, hd * s, y, kind, prm, o, true);
      y += h; s *= 0.7;
    }
    roofDress(B, R, x, z, a, hw * s / 0.7, hd * s / 0.7, y, kind, prm, o);
    return y + 3;
  }
  if (type === 'antennas') {
    // telecom cluster: a few masts of different heights on a plant room, each with warning lights
    B.part({ x, y0: top, z, a, hw: hw * 0.3, hd: hd * 0.3, h: 3.5, mat: MAT.CONCRETE, col: [0.22, 0.22, 0.24] });
    const n = 3 + Math.floor(R() * 3);
    let hi = top;
    for (let i = 0; i < n; i++) {
      const [mx, mz] = Builder.tw(x, z, a, (R() - 0.5) * hw * 1.3, (R() - 0.5) * hd * 1.3);
      const h = (capped ? 4 : 8) + R() * (capped ? 4 : 18);
      mast(B, R, mx, mz, top, h, 0.15 + R() * 0.2);
      hi = Math.max(hi, top + h);
    }
    roofDress(B, R, x, z, a, hw, hd, top, kind, prm, o, true);
    return hi;
  }
  if (type === 'garden') {
    // roof garden: planting bed, small trees, a pergola strung with warm lights
    const gw = hw * 0.8, gd = hd * 0.8;
    B.part({ x, y0: top, z, a, hw: gw, hd: gd, h: 0.6, kind, prm, mat: MAT.CONCRETE, col: [0.05, 0.09, 0.045], flags: FLAG.NOWIN });
    const n = 3 + Math.floor(R() * 4);
    for (let i = 0; i < n; i++) {
      const [tx, tz] = Builder.tw(x, z, a, (R() - 0.5) * gw * 1.6, (R() - 0.5) * gd * 1.6);
      const r = 1.0 + R() * 1.2;
      B.prop({ x: tx, y0: top + 0.6, z: tz, hw: 0.12, h: 1.2, kind: 2, prm: 6, mat: MAT.CONCRETE, col: [0.12, 0.08, 0.05] });
      B.prop({ x: tx, y0: top + 1.4, z: tz, hw: r, hd: r, h: r * 1.6, kind: 2, prm: 8, prof: 2, mat: MAT.CONCRETE, col: [0.06, 0.16, 0.07], seed: R() * 999 });
    }
    const [px, pz] = Builder.tw(x, z, a, gw * 0.4, -gd * 0.4);
    B.prop({ x: px, y0: top + 2.6, z: pz, a, hw: Math.min(4, gw * 0.4), hd: Math.min(3, gd * 0.4), h: 0.12, mat: MAT.EMIT, col: [1, 0.7, 0.35], param: 1.2, flags: FLAG.BOTTOM });
    if (top > 55) roofDress(B, R, x, z, a, hw, hd, top, kind, prm, o, true);
    return top + 4;
  }
  return top;
}

// Roof clutter shared by flat roof types: AC plant (a grid of units), sometimes a neon edge, and
// aircraft-warning lights at two corners of tall roofs. noNeon: skip the edge neon (e.g. lower setbacks).
function roofDress(B, R, x, z, a, hw, hd, top, kind, prm, o, noNeon = false) {
  if (B.q === 0) return;
  // AC plant: one or two rows of units (one part each; the shader draws a fan per 1.2 m)
  const rows = hd > 9 ? 2 : 1;
  const len = Math.min(hw * 1.1, 6 + R() * 6);
  const ox = (R() - 0.5) * (hw - len / 2) * 0.8;
  for (let j = 0; j < rows; j++) {
    const [ux, uz] = Builder.tw(x, z, a, ox, (j - (rows - 1) / 2) * 2.6 + (R() - 0.5) * hd * 0.4);
    B.prop({ x: ux, y0: top, z: uz, a, hw: len / 2, hd: 0.6, h: 1.1, mat: MAT.AC, col: [0.42, 0.43, 0.44], seed: R() * 999 });
  }
  if (!noNeon && kind !== 2 && R() < 0.22) {
    const col = pick(R, PAL.neon);
    for (const [lx, lz, ex, ez] of [[0, hd, hw, 0.06], [0, -hd, hw, 0.06], [hw, 0, 0.06, hd], [-hw, 0, 0.06, hd]]) {
      const [px, pz] = Builder.tw(x, z, a, lx, lz);
      B.prop({ x: px, y0: top + 0.9, z: pz, a, hw: ex, hd: ez, h: 0.14, mat: MAT.EMIT, col, param: 3, flags: FLAG.BOTTOM });
    }
  }
  if (top - B.world.heightAt(x, z) > 50) {
    for (const [sx, sz] of [[1, 1], [-1, -1]]) {
      const [ax, az] = Builder.tw(x, z, a, sx * hw * 0.9, sz * hd * 0.9);
      aviation(B, ax, top, az, R() * 999);
    }
  }
}

// Choose podium and sign slots for a lot. Returns podium top.
function streetFaces(L) { return streetFacesBox(L, L.x, L.z, L.w / 2, L.d / 2); }

// Which faces of a box (centre x,z, half sizes hw,hd, aligned with lot L) face a street. Ring order: +z, -x, -z, +x.
function streetFacesBox(L, x, z, hw, hd) {
  const D = DISTRICTS[L.district];
  const c = Math.cos(-D.angle), s = Math.sin(-D.angle);
  const qx = (x - D.cx) * c - (z - D.cz) * s, qz = (x - D.cx) * s + (z - D.cz) * c;
  // road half width + 3 m sidewalk + slack for lots trimmed back from the road (prepareLots); internal
  // edges between sub-lots of a block lie much further from any road line
  const lim = D.road / 2 + 3 + 8;
  const isStreet = (e) => Math.abs(e - Math.round(e / D.block) * D.block) < lim;
  return [isStreet(qz + hd), isStreet(qx - hw), isStreet(qz - hd), isStreet(qx + hw)];
}

// The shader's integer hash (pcg, common.js), so props can line up with shader-drawn shop bays.
function pcg(v) {
  const s = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
}
const hash11u = (v) => pcg(v) / 4294967295;

// Shopfront dressing on the street faces of a box-shaped SHOP part. Mirrors the shop bay layout in the
// facade shader (buildings_wgsl.js, mat 5): every bay has a level floor at the mean pavement height of its
// two ends. Per bay: a fascia sign slot on the signage board, often a straight awning with a light strip
// under its front edge, sometimes an AC unit above. On sloping hillside streets the pavement in front is
// stepped, with a stepped handrail along the kerb.
function shopfront(B, R, L, cx, cz, hw, hd, seed, top, hill) {
  if (B.q === 0) return;
  const p0 = B.props;
  B.detail = true;
  shopfrontFaces(B, R, L, cx, cz, hw, hd, seed, top, hill);
  B.detail = false;
  B.shopProps += B.props - p0;
}

function shopfrontFaces(B, R, L, cx, cz, hw, hd, seed, top, hill) {
  const W = B.world;
  const faces = rectFaces(hw, hd);
  const street = streetFacesBox(L, cx, cz, hw + 0.5, hd + 0.5);
  const c = Math.cos(L.angle), s = Math.sin(L.angle);
  const sf = Math.fround(seed);
  for (let fi = 0; fi < 4; fi++) {
    if (!street[fi]) continue;
    const F = faces[fi];
    const nx = F.nx * c - F.nz * s, nz = F.nx * s + F.nz * c;
    const tx = F.dx * c - F.dz * s, tz = F.dx * s + F.dz * c;
    const [x0, z0] = Builder.tw(cx, cz, L.angle, F.sx, F.sz);
    const ang = Math.atan2(F.nz, F.nx) - Math.PI / 2 + L.angle;
    const gOut = (t, o = 1.5) => W.heightAt(x0 + tx * t + nx * o, z0 + tz * t + nz * o);
    const bwT = 4.5 + 3 * hash11u(Math.floor(sf) + F.fid * 3);
    const nb = Math.max(1, Math.round(F.len / bwT)), bw = F.len / nb;
    const awnC = pick(R, [[0.5, 0.1, 0.08], [0.08, 0.26, 0.38], [0.48, 0.4, 0.1], [0.14, 0.32, 0.18], [0.3, 0.3, 0.32], [0.42, 0.16, 0.3]]);
    for (let k = 0; k < nb; k++) {
      const gb = 0.5 * (gOut(k * bw) + gOut((k + 1) * bw));
      if (top - gb < 5) continue;
      const tm = (k + 0.5) * bw;
      const mx = x0 + tx * tm, mz = z0 + tz * tm;
      const hb = hash11u(Math.floor(Math.fround(Math.fround(Math.fround(k + F.fid * 17) + sf) * 7)) + 3);
      const shut = hb < 0.22;
      if (R() < (shut ? 0.5 : 0.9)) B.slot(mx + nx * 0.05, gb + 3.9, mz + nz * 0.05, nx, nz, bw * 0.76, 0.95, false, L.type);
      if (R() < (shut ? 0.2 : 0.5)) {
        const ah = bw * 0.42, dep = 0.65 + R() * 0.3;
        const col = R() < 0.7 ? awnC : pick(R, PAL.neon).map((v) => v * 0.45);
        const ox = mx + nx * (dep + 0.03), oz = mz + nz * (dep + 0.03);
        B.prop({ x: ox, y0: gb + 3.28, z: oz, a: ang, hw: ah, hd: dep, h: 0.1, mat: MAT.CONCRETE, col, flags: FLAG.BOTTOM, seed: R() * 999 });
        B.prop({ x: mx + nx * (2 * dep - 0.12), y0: gb + 3.22, z: mz + nz * (2 * dep - 0.12), a: ang, hw: ah * 0.94, hd: 0.04, h: 0.05, mat: MAT.EMIT, col: [1, 0.86, 0.62], param: 2.2, flags: FLAG.BOTTOM });
      }
      if (R() < 0.35 && top - gb > 6) {
        const u = (R() - 0.5) * bw * 0.6;
        B.prop({ x: mx + tx * u + nx * 0.32, y0: gb + 4.72, z: mz + tz * u + nz * 0.32, a: ang, hw: 0.42, hd: 0.3, h: 0.55, mat: MAT.AC, col: [0.55, 0.55, 0.52], flags: FLAG.BOTTOM, seed: R() * 999 });
      }
    }
    // stepped pavement and kerb handrail on sloping hillside streets
    const slope = Math.abs(gOut(F.len) - gOut(0)) / F.len;
    if (hill && slope > 0.09) {
      const ns = Math.min(60, Math.max(2, Math.floor(F.len / Math.min(3.0, Math.max(1.5, 0.3 / slope)))));
      const rl = F.len / ns;
      const gs = [];
      for (let k = 0; k <= ns; k++) gs.push(gOut(k * rl, 1.4));
      const topOf = (k) => Math.max(gs[k], gs[Math.min(k + 1, ns)]) + 0.04;
      for (let k = 0; k < ns; k++) {
        const yt = topOf(k), yb = Math.min(gs[k], gs[k + 1]) - 0.6;
        const tm = (k + 0.5) * rl;
        const sx = x0 + tx * tm, sz = z0 + tz * tm;
        if (B.prop({ x: sx + nx * 1.45, y0: yb, z: sz + nz * 1.45, a: ang, hw: rl / 2 + 0.01, hd: 1.35, h: yt - yb, mat: MAT.CONCRETE, col: [0.3, 0.29, 0.28], seed: R() * 999 }) < 0) return;
        // handrail: one bar over each pair of steps, a post every fourth step
        if (k % 2 === 0) {
          const k2 = Math.min(k + 1, ns - 1), tr = (k + (k2 - k + 1) / 2) * rl;
          B.prop({ x: x0 + tx * tr + nx * 2.95, y0: Math.max(yt, topOf(k2)) + 0.95, z: z0 + tz * tr + nz * 2.95, a: ang, hw: (k2 - k + 1) * rl / 2 + 0.03, hd: 0.035, h: 0.05, mat: MAT.METAL, col: [0.55, 0.56, 0.58] });
        }
        if (k % 4 === 3) B.prop({ x: sx + tx * (rl / 2 - 0.05) + nx * 2.95, y0: yt, z: sz + tz * (rl / 2 - 0.05) + nz * 2.95, hw: 0.035, h: 1.0, kind: 2, prm: 6, mat: MAT.METAL, col: [0.3, 0.3, 0.32] });
      }
    }
  }
}

function lotSigns(B, R, L, podTop, style, density = 1) {
  const topAt = typeof podTop === 'function' ? podTop : () => podTop;
  const W = B.world;
  const hw = L.w / 2 - 0.5, hd = L.d / 2 - 0.5;
  const faces = rectFaces(hw, hd);
  const street = streetFaces(L);
  const c = Math.cos(L.angle), s = Math.sin(L.angle);
  for (let fi = 0; fi < 4; fi++) {
    const F = faces[fi];
    const p = street[fi] ? 1 : 0.25;
    const nx = F.nx * c - F.nz * s, nz = F.nx * s + F.nz * c;
    const at = (t, out) => { const lx = F.sx + F.dx * t + F.nx * 0.05, lz = F.sz + F.dz * t + F.nz * 0.05; return [L.x + lx * c - lz * s, L.z + lx * s + lz * c]; };
    // Hong Kong-style street faces (hillside, urban): a blade every few metres, a second taller blade on some,
    // and a fascia over each shopfront. All stay below the podium top so they sit on a wall.
    if (street[fi] && (style === DT.HILLSIDE || style === DT.URBAN)) {
      const hill = style === DT.HILLSIDE;
      const step = hill ? 4.6 : 7.0;
      for (let t = 1.5 + R() * 2; t < F.len - 1.5; t += step * (0.7 + R() * 0.6)) {
        if (R() > 0.85 * density) continue;
        const [x, z] = at(t);
        const g = W.heightAt(x, z), top = topAt(x, z) - 0.4;
        // blades start above the awnings and signage boards of the shopfronts
        const h1 = Math.min(2.5 + R() * 3.5, top - g - 4.7);
        if (h1 >= 2) B.slot(x, g + 4.7 + h1 / 2, z, nx, nz, 0.9 + R() * 0.6, h1, true, style);
        const b2 = g + 7.5 + R() * 2, h2 = Math.min(3 + R() * 5, top - b2);
        if (R() < (hill ? 0.5 : 0.3) && h2 >= 2.5) {
          const [x2, z2] = at(Math.min(t + 0.6, F.len - 0.5));
          B.slot(x2, b2 + h2 / 2, z2, nx, nz, 1.4 + R() * 1.2, h2, true, style);
        }
      }
      // fascia signs: shopfront() already put one on each bay's signage board
      if (!L.shopfront) for (let t = 0.6; t < F.len - 2;) {
        const seg = Math.min(4 + R() * 6, F.len - t);
        const [x, z] = at(t + seg / 2);
        const g = W.heightAt(x, z);
        if (R() < 0.85 * density && topAt(x, z) - g > 4.6) B.slot(x, g + 3.0, z, nx, nz, seg - 0.4, 0.9 + R() * 0.5, false, style);
        t += seg + 0.3;
      }
      continue;
    }
    if (street[fi] && R() < 0.38 * density) {
      const t = F.len * (0.3 + R() * 0.4);
      const [x, z] = at(t);
      const g = W.heightAt(x, z);
      const w = Math.min(F.len * 0.55, 4 + R() * 10);
      B.slot(x, Math.min(g + 4.0, topAt(x, z) - 0.8), z, nx, nz, w, 1.1, false, style);
    }
    if (R() < 0.33 * p * density) {
      const t = R() < 0.5 ? 1.2 + R() * 2 : F.len - 1.2 - R() * 2;
      const [x, z] = at(t);
      const g = W.heightAt(x, z);
      // blade sign on the podium facade: from 3.5 m above the street up to just below the podium top
      const bottom = g + 3.5, top = Math.min(topAt(x, z) - 0.4, g + 20);
      const h = Math.min(4 + R() * 9, top - bottom);
      if (h >= 2) B.slot(x, bottom + h / 2, z, nx, nz, 1.1 + R() * 0.6, h, true, style);
    }
  }
}

function podium(B, R, L, opts) {
  const hw = L.w / 2 - 0.5, hd = L.d / 2 - 0.5;
  const y0 = L.gMin - 4;
  const top = L.gMax + opts.h;
  const seed = R() * 999;
  B.part({ x: L.x, y0, z: L.z, a: L.angle, hw, hd, h: top - y0, mat: opts.mat, col: opts.col, floorH: opts.floorH || 4.2, winW: opts.winW || 3.4, baseY: L.gMin, param: opts.lit || 0.45, flags: opts.flags || 0, seed, solid: true });
  if (wantsShopfront(L, opts)) shopfront(B, R, L, L.x, L.z, hw, hd, seed, top, L.type === DT.HILLSIDE);
  return top;
}

// shopfront dressing for street-level shop podiums in the hillside and urban districts (not arcades)
function wantsShopfront(L, opts) {
  const ok = opts.mat === MAT.SHOP && !((opts.flags || 0) & FLAG.ARCADE) && (L.type === DT.HILLSIDE || L.type === DT.URBAN);
  if (ok) L.shopfront = true;
  return ok;
}

// Podium that steps down a slope: on steep lots it is split along the fall line into 2-4 strips, each covering
// its part of the lot and standing at least opts.h above its own highest ground (sign contract still holds).
// Lit rails mark the terrace edges, and a stair flight runs down a side gap. Returns { top, minTop }.
function terracedPodium(B, R, L, opts) {
  const W = B.world;
  const diff = L.gMax - L.gMin;
  if (diff < 7) { const top = podium(B, R, L, opts); B.hillPods.push({ L, top, minTop: top }); return { top, minTop: top, topAt: () => top }; }
  const hw = L.w / 2 - 0.5, hd = L.d / 2 - 0.5;
  const hAt = (lx, lz) => { const [x, z] = Builder.tw(L.x, L.z, L.angle, lx, lz); return W.heightAt(x, z); };
  const sx = (hAt(hw, 0) - hAt(-hw, 0)) / (2 * hw), sz = (hAt(0, hd) - hAt(0, -hd)) / (2 * hd);
  const alongX = Math.abs(sx) * hw >= Math.abs(sz) * hd;
  const n = Math.min(4, Math.ceil(diff / 6));
  const len = alongX ? hw : hd, wid = alongX ? hd : hw;
  const seed = R() * 999;
  let top = -1e9, minTop = 1e9;
  const strips = [];
  for (let i = 0; i < n; i++) {
    const c0 = -len + (2 * len) * i / n, c1 = -len + (2 * len) * (i + 1) / n;
    const mid = (c0 + c1) / 2, half = (c1 - c0) / 2;
    let smin = 1e9, smax = -1e9;
    for (const u of [c0, mid, c1]) for (const v of [-wid, 0, wid]) {
      const h = alongX ? hAt(u, v) : hAt(v, u);
      smin = Math.min(smin, h); smax = Math.max(smax, h);
    }
    const t = smax + opts.h;
    const [cx, cz] = Builder.tw(L.x, L.z, L.angle, alongX ? mid : 0, alongX ? 0 : mid);
    B.part({ x: cx, y0: smin - 4, z: cz, a: L.angle, hw: alongX ? half : hw, hd: alongX ? hd : half, h: t - smin + 4, mat: opts.mat, col: opts.col, floorH: opts.floorH || 4.2, winW: opts.winW || 3.4, baseY: L.gMin, param: opts.lit || 0.45, flags: opts.flags || 0, seed, solid: true });
    if (wantsShopfront(L, opts)) shopfront(B, R, L, cx, cz, alongX ? half : hw, alongX ? hd : half, seed, t, L.type === DT.HILLSIDE);
    strips.push({ mid, half, t });
    top = Math.max(top, t); minTop = Math.min(minTop, t);
  }
  // lit guard rail along each terrace edge that drops to a lower neighbour
  const railC = R() < 0.5 ? [1, 0.7, 0.35] : pick(R, PAL.neon);
  for (let i = 0; i < n; i++) for (const j of [i - 1, i + 1]) {
    if (j < 0 || j >= n || strips[j].t >= strips[i].t - 1) continue;
    const edge = strips[i].mid + Math.sign(strips[j].mid - strips[i].mid) * strips[i].half;
    const [ex, ez] = Builder.tw(L.x, L.z, L.angle, alongX ? edge : 0, alongX ? 0 : edge);
    B.prop({ x: ex, y0: strips[i].t + 0.9, z: ez, a: L.angle, hw: alongX ? 0.06 : hw, hd: alongX ? hd : 0.06, h: 0.12, mat: MAT.EMIT, col: railC, param: 2.5, flags: FLAG.BOTTOM });
  }
  // stair street down one side gap (not on a road side)
  const street = streetFaces(L);
  const sides = alongX ? [[0, 1], [2, -1]] : [[3, 1], [1, -1]];   // faces parallel to the fall line: [faceIndex, sign of offset]
  const free = sides.filter(([fi]) => !street[fi]);
  if (diff > 9 && free.length && R() < 0.45) {
    const sgn = free[0][1];
    const off = (alongX ? hd : hw) + 2.5;
    const steps = Math.min(40, Math.round(2 * len / 1.4));
    for (let k = 0; k < steps; k++) {
      const u = -len + (k + 0.5) * 2 * len / steps;
      const lx = alongX ? u : sgn * off, lz = alongX ? sgn * off : u;
      const [x, z] = Builder.tw(L.x, L.z, L.angle, lx, lz);
      const g = W.heightAt(x, z);
      const yt = Math.round((g + 0.2) / 0.3) * 0.3;
      B.prop({ x, y0: g - 1.5, z, a: L.angle, hw: alongX ? 2 * len / steps / 2 + 0.02 : 1.6, hd: alongX ? 1.6 : 2 * len / steps / 2 + 0.02, h: yt - g + 1.5, mat: MAT.CONCRETE, col: [0.3, 0.29, 0.27] });
      if (k % 8 === 4) {
        const [px, pz] = Builder.tw(L.x, L.z, L.angle, alongX ? u : sgn * (off + 1.5), alongX ? sgn * (off + 1.5) : u);
        B.prop({ x: px, y0: yt, z: pz, hw: 0.06, h: 3, kind: 2, prm: 8, mat: MAT.METAL, col: [0.2, 0.2, 0.22] });
        B.prop({ x: px, y0: yt + 3, z: pz, hw: 0.18, h: 0.3, kind: 2, prm: 8, mat: MAT.EMIT, col: [1, 0.72, 0.4], param: 4, flags: FLAG.BOTTOM });
      }
    }
  }
  B.hillPods.push({ L, top, minTop });
  // podium top at a world point (used to keep sign slots on the terrace they are mounted on)
  const c = Math.cos(L.angle), s = Math.sin(L.angle);
  const topAt = (x, z) => {
    const dx = x - L.x, dz = z - L.z;
    const u = alongX ? dx * c + dz * s : -dx * s + dz * c;
    const i = Math.max(0, Math.min(n - 1, Math.floor((u + len) / (2 * len) * n)));
    return strips[i].t;
  };
  return { top, minTop, topAt };
}

// Elevated pedestrian walkways between facing hillside podiums across a road.
export function walkways(B, R) {
  const pods = B.hillPods;
  const cell = new Map();
  const key = (x, z) => Math.floor(x / 50) * 7919 + Math.floor(z / 50);
  pods.forEach((p, i) => { const k = key(p.L.x, p.L.z); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(i); });
  let n = 0;
  for (let i = 0; i < pods.length; i++) {
    const A = pods[i], LA = A.L;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const list = cell.get(key(LA.x + dx * 50, LA.z + dz * 50));
      if (!list) continue;
      for (const j of list) {
        if (j <= i || R() > 0.22) continue;
        const LB = pods[j].L;
        if (LB.district !== LA.district) continue;
        const c = Math.cos(LA.angle), s = Math.sin(LA.angle);
        const ox = LB.x - LA.x, oz = LB.z - LA.z;
        const lx = ox * c + oz * s, lz = -ox * s + oz * c;
        const alongX = Math.abs(lx) > Math.abs(lz);
        if (Math.abs(alongX ? lz : lx) > 4) continue;
        const gap = Math.abs(alongX ? lx : lz) - (alongX ? (LA.w + LB.w) / 2 : (LA.d + LB.d) / 2);
        if (gap < 9 || gap > 24) continue;    // across a road, not across an alley
        const y = Math.min(A.minTop, pods[j].minTop) - 0.3;
        if (y - Math.max(LA.gMax, LB.gMax) < 5) continue;
        const mx = LA.x + ox / 2, mz = LA.z + oz / 2;
        const ang = Math.atan2(oz, ox);
        const half = Math.hypot(ox, oz) / 2;
        B.part({ x: mx, y0: y - 0.8, z: mz, a: ang, hw: half, hd: 1.6, h: 0.8, mat: MAT.CONCRETE, col: [0.28, 0.28, 0.3], flags: FLAG.BOTTOM, solid: true });
        for (const side of [-1, 1]) {
          const [rx, rz] = Builder.tw(mx, mz, ang, 0, side * 1.55);
          B.part({ x: rx, y0: y, z: rz, a: ang, hw: half, hd: 0.05, h: 1.05, mat: MAT.METAL, col: [0.25, 0.25, 0.27] });
          B.prop({ x: rx, y0: y + 1.0, z: rz, a: ang, hw: half, hd: 0.07, h: 0.08, mat: MAT.EMIT, col: [0.4, 0.9, 1], param: 3, flags: FLAG.BOTTOM });
        }
        B.part({ x: mx, y0: y - 0.85, z: mz, a: ang, hw: half, hd: 1.0, h: 0.06, mat: MAT.EMIT, col: [1, 0.75, 0.45], param: 2, flags: FLAG.BOTTOM });
        n++;
      }
    }
  }
  return n;
}

// Shop spill light at a street face.
function shopLight(B, R, L, podTop) {
  const street = streetFaces(L);
  const faces = rectFaces(L.w / 2, L.d / 2);
  const opts = [];
  for (let i = 0; i < 4; i++) if (street[i]) opts.push(i);
  if (!opts.length) return;
  const F = faces[opts[Math.floor(R() * opts.length)]];
  const t = F.len * (0.25 + R() * 0.5);
  const lx = F.sx + F.dx * t + F.nx * 2.5, lz = F.sz + F.dz * t + F.nz * 2.5;
  const [x, z] = Builder.tw(L.x, L.z, L.angle, lx, lz);
  const g = B.world.heightAt(x, z);
  const col = R() < 0.6 ? [1, 0.62, 0.32] : pick(R, PAL.neon);
  B.light(x, g + 3.2, z, 16 + R() * 6, col, 32 + R() * 18, 1);
}

// Tower made of 1-3 stacked segments with setbacks; returns {top, hw, hd}.
function tower(B, R, o) {
  const { x, z, a, y0, baseY, mat, col, floorH, winW, lit, flags } = o;
  let { hw, hd, h } = o;
  const segs = o.segs || 1;
  let y = y0;
  const total = h;
  let kind = o.kind || 0, prm = o.prm || 0;
  for (let i = 0; i < segs; i++) {
    const sh = i === segs - 1 ? total - (y - y0) : total * (segs === 2 ? 0.62 : i === 0 ? 0.5 : 0.3);
    const taper = i === segs - 1 ? (o.taper || 1) : 1;
    B.part({ x, y0: y, z, a, hw, hd, h: sh, kind, prm, taper, twist: o.twist || 0, mat, col, floorH, winW, baseY, param: lit, flags, seed: o.seed, solid: true });
    y += sh;
    if (i < segs - 1) {
      // setback ledge
      const k = 0.78 + R() * 0.12;
      hw *= k; hd *= k;
    }
    if (o.taper && i === segs - 1) { hw *= o.taper; hd *= o.taper; }
  }
  return { top: y, hw, hd, kind, prm };
}

// roof types; the tiered lit crown is kept to about one roof in eight
const CROWNS_RES = ['machine', 'machine', 'setback', 'garden', 'antennas', 'billboard', 'pagoda', 'lit'];
const CROWNS_CBD = ['lit', 'spire', 'helipad', 'antenna', 'setback', 'machine', 'antennas', 'garden', 'billboard'];

// ------------------------------------------------------------------ districts

export function genHillside(B, R, L) {
  const podH = 6 + 3 * Math.floor(R() * 3);
  const tp = terracedPodium(B, R, L, { h: podH, mat: MAT.SHOP, col: pick(R, PAL.shop), floorH: 3.6, winW: 3.2, lit: 0.55, flags: R() < 0.3 ? FLAG.ARCADE : 0 });
  const podTop = tp.minTop;   // towers start on the lowest terrace (they pass through the higher ones)
  lotSigns(B, R, L, tp.topAt, DT.HILLSIDE);
  if (R() < 0.55) shopLight(B, R, L, podTop);
  const t = R();
  const maxTop = L.maxTop || 1e9;
  const col = pick(R, PAL.res);
  const lit = 0.35 + R() * 0.3;
  if (t < 0.2) {
    // stacked low blocks stepping with the slope
    let y = podTop, hw = L.w / 2 - 1.5, hd = L.d / 2 - 1.5;
    const n = 2 + Math.floor(R() * 2);
    for (let i = 0; i < n; i++) {
      const fl = 3 + Math.floor(R() * 6);
      const h = fl * 3.1;
      const ox = (R() - 0.5) * hw * 0.4, oz = (R() - 0.5) * hd * 0.4;
      const [cx, cz] = Builder.tw(L.x, L.z, L.angle, ox, oz);
      const bw = hw * (0.6 + R() * 0.3), bd = hd * (0.6 + R() * 0.3);
      if (y + h > maxTop) break;
      B.part({ x: cx, y0: y, z: cz, a: L.angle, hw: bw, hd: bd, h, mat: MAT.RES, col: pick(R, PAL.res), floorH: 3.1, winW: 3 + R(), baseY: podTop, param: lit, flags: R() < 0.4 ? FLAG.BALC : 0, solid: true });
      acUnits(B, R, cx, cz, L.angle, bw, bd, y, podTop, y + h, 3.1, 3.5, 0.1);
      y += h;
      if (i === n - 1) crown(B, R, { x: cx, z: cz, a: L.angle, hw: bw, hd: bd, top: y, kind: 0, prm: 0, type: R() < 0.5 ? 'machine' : 'billboard', maxTop: L.maxTop, style: DT.HILLSIDE });
    }
    return;
  }
  // residential towers
  const long = Math.max(L.w, L.d) > 40;
  const two = long && R() < 0.55;
  let floors = 18 + Math.floor(Math.pow(R(), 1.15) * 38);
  if (R() < 0.07) floors = 62 + Math.floor(R() * 22);
  else if (R() < 0.16) floors = 10 + Math.floor(R() * 7);
  const floorH = 3.0;
  const shapeR = R();
  let kind = 0, prm = 0;
  if (shapeR < 0.2) { kind = 1; prm = 0.2 + R() * 0.2; } else if (shapeR < 0.3) { kind = 0; prm = 0.25 + R() * 0.2; }
  const winW = 2.8 + R() * 1.6;
  let flags = R() < 0.45 ? FLAG.BALC : 0;
  const fr = R();
  if (fr < 0.14) flags |= FLAG.EDGE; else if (fr < 0.22) flags |= FLAG.CROWNLIT;
  const towers = [];
  if (two) {
    const alongX = L.w > L.d;
    const len = Math.max(L.w, L.d), wid = Math.min(L.w, L.d);
    const th = len / 4 - 2, tw = wid / 2 - 2;
    for (const sgn of [-1, 1]) {
      const [cx, cz] = Builder.tw(L.x, L.z, L.angle, alongX ? sgn * len / 4 : 0, alongX ? 0 : sgn * len / 4);
      towers.push({ x: cx, z: cz, hw: alongX ? th : tw, hd: alongX ? tw : th, floors: Math.round(floors * (0.75 + R() * 0.25)) });
    }
  } else {
    const ins = 1.5 + R() * 2;
    towers.push({ x: L.x, z: L.z, hw: L.w / 2 - ins, hd: L.d / 2 - ins, floors });
  }
  for (const T of towers) {
    let h = T.floors * floorH;
    if (podTop + h > maxTop) h = Math.max(maxTop - podTop, 12);
    const segs = R() < 0.35 ? 2 : 1;
    const tw = tower(B, R, { x: T.x, z: T.z, a: L.angle, y0: podTop, baseY: podTop, hw: T.hw, hd: T.hd, h, segs, kind, prm, mat: MAT.RES, col, floorH, winW, lit, flags, seed: R() * 999 });
    B.hillTowers.push({ x: T.x, z: T.z, a: L.angle, hw: T.hw, hd: T.hd, y0: podTop, top: podTop + h * (segs === 2 ? 0.6 : 1), district: L.district });
    if (kind === 0 && prm === 0) acUnits(B, R, T.x, T.z, L.angle, T.hw, T.hd, podTop, podTop, podTop + h * (segs === 2 ? 0.6 : 1), floorH, winW, 0.09);
    // rooftop neon accent: a coloured parapet line that reads from far viewpoints
    if (kind !== 2 && R() < 0.28) B.part({ x: T.x, y0: tw.top - 0.7, z: T.z, a: L.angle, hw: tw.hw + 0.15, hd: tw.hd + 0.15, h: 0.35, kind: tw.kind, prm: tw.prm, mat: MAT.EMIT, col: pick(R, PAL.neon), param: 4.5, flags: FLAG.BOTTOM | FLAG.NOTOP });
    if (R() < 0.12 && kind === 0) {
      // cross plan: perpendicular wing
      B.part({ x: T.x, y0: podTop, z: T.z, a: L.angle, hw: T.hw * 0.45, hd: T.hd + 3, h: h * 0.92, mat: MAT.RES, col, floorH, winW, baseY: podTop, param: lit, seed: R() * 999, solid: true });
    }
    const type = pick(R, CROWNS_RES);
    const top = crown(B, R, { x: T.x, z: T.z, a: L.angle, hw: tw.hw, hd: tw.hd, top: tw.top, kind: tw.kind, prm: tw.prm, type, maxTop: L.maxTop, style: DT.HILLSIDE });
    if (tw.top > 140) {
      const [ax, az] = Builder.tw(T.x, T.z, L.angle, tw.hw * 0.9, tw.hd * 0.9);
      aviation(B, ax, tw.top, az, R() * 999);
    }
    if (tw.top - L.gMin > 110) B.tops.push({ x: T.x, y: tw.top, z: T.z, hill: true });
  }
}

export function genUrban(B, R, L) {
  const dfc = clamp(L.distFromCenter, 0, 1);
  const t = R();
  const maxTop = L.maxTop || 1e9;
  const oldTown = DISTRICTS[L.district].name.startsWith('Nan');
  const pShop = oldTown ? 0.62 : 0.3 + 0.35 * dfc;
  const arcade = R() < 0.45;
  if (t < pShop) {
    // shophouse block: the whole building is the podium
    const fl = 3 + Math.floor(R() * 4);
    const h = Math.max(fl * 3.4, 6.5);
    const top = podium(B, R, L, { h: Math.min(h, Math.max(maxTop - L.gMax, 6)), mat: MAT.SHOP, col: pick(R, PAL.shop.concat(PAL.res)), floorH: 3.4, winW: 2.6 + R(), lit: 0.5 + R() * 0.25, flags: arcade ? FLAG.ARCADE : 0 });
    lotSigns(B, R, L, top, DT.URBAN, 1.1);
    if (R() < 0.6) shopLight(B, R, L, top);
    const hw = L.w / 2 - 0.5, hd = L.d / 2 - 0.5;
    if (R() < 0.3) {
      B.part({ x: L.x, y0: top - 0.2, z: L.z, a: L.angle, hw: hw + 0.8, hd: hd + 0.8, h: 2.5 + Math.min(hw, hd) * 0.25, prof: 4, taper: 0.35, mat: MAT.ROOFTILE, col: R() < 0.6 ? [0.16, 0.17, 0.18] : [0.3, 0.1, 0.07], param: R() < 0.4 ? 2 : 0, flags: FLAG.BOTTOM });
    } else {
      const n = 1 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) { const [x, z] = Builder.tw(L.x, L.z, L.angle, (R() - 0.5) * hw * 1.4, (R() - 0.5) * hd * 1.4); waterTank(B, R, x, z, top); }
      if (R() < 0.35) crown(B, R, { x: L.x, z: L.z, a: L.angle, hw, hd, top, type: 'billboard', maxTop: L.maxTop, style: DT.URBAN });
      if (R() < 0.3) B.part({ x: L.x + (R() - 0.5) * hw, y0: top, z: L.z + (R() - 0.5) * hd, a: L.angle, hw: 2 + R() * 2, hd: 2 + R() * 2, h: 2.6, mat: MAT.CONCRETE, col: [0.35, 0.34, 0.32] });
    }
    acUnits(B, R, L.x, L.z, L.angle, hw, hd, L.gMax + 4, L.gMin, top, 3.4, 3.2, 0.1);
    return;
  }
  const podH = 6 + 3.5 * Math.floor(R() * 2);
  const tp = terracedPodium(B, R, L, { h: podH, mat: MAT.SHOP, col: pick(R, PAL.shop), floorH: 3.5, winW: 3.2, lit: 0.55, flags: arcade ? FLAG.ARCADE : 0 });
  const podTop = tp.minTop;
  lotSigns(B, R, L, tp.topAt, DT.URBAN);
  if (R() < 0.5) shopLight(B, R, L, podTop);
  const ins = 1.5 + R() * 3;
  const hw = L.w / 2 - ins, hd = L.d / 2 - ins;
  const k = R();
  let mat = MAT.RES, col = pick(R, PAL.res), floors, floorH = 3.0, winW = 3 + R() * 1.5, lit = 0.35 + R() * 0.3, crowns = CROWNS_RES;
  let kind = 0, prm = 0, flags = R() < 0.35 ? FLAG.BALC : 0;
  if (k < 0.5) floors = 7 + Math.floor(R() * 13);
  else if (k < 0.75) { mat = R() < 0.5 ? MAT.OFFICE : MAT.GLASS; col = mat === MAT.GLASS ? pick(R, PAL.glass) : pick(R, PAL.office); floors = 12 + Math.floor(R() * 22); floorH = 3.8; winW = mat === MAT.GLASS ? 1.5 : 3; lit = 0.3 + R() * 0.25; flags = R() < 0.25 ? FLAG.EDGE : 0; crowns = CROWNS_CBD; if (R() < 0.4) { kind = R() < 0.5 ? 1 : 0; prm = 0.2 + R() * 0.3; } }
  else floors = 22 + Math.floor(R() * 24) - Math.floor(dfc * 10);
  let h = floors * floorH;
  if (podTop + h > maxTop) h = Math.max(maxTop - podTop, 8);
  const tw = tower(B, R, { x: L.x, z: L.z, a: L.angle, y0: podTop, baseY: podTop, hw, hd, h, segs: R() < 0.3 ? 2 : 1, kind, prm, mat, col, floorH, winW, lit, flags, seed: R() * 999 });
  if (mat === MAT.RES && kind === 0) acUnits(B, R, L.x, L.z, L.angle, hw, hd, podTop, podTop, podTop + h * 0.6, floorH, winW, 0.07);
  crown(B, R, { x: L.x, z: L.z, a: L.angle, hw: tw.hw, hd: tw.hd, top: tw.top, kind: tw.kind, prm: tw.prm, type: pick(R, crowns), maxTop: L.maxTop, style: DT.URBAN });
  if (tw.top - L.gMin > 140) { const [ax, az] = Builder.tw(L.x, L.z, L.angle, tw.hw * 0.9, -tw.hd * 0.9); aviation(B, ax, tw.top, az, R() * 999); }
}

export function genBund(B, R, L, clockTower) {
  const old = L.waterDist < 125 || (L.waterDist < 200 && R() < 0.55);
  if (!old) {
    // modern tower behind the historic row
    const podTop = podium(B, R, L, { h: 9 + R() * 6, mat: MAT.SHOP, col: pick(R, PAL.stone), floorH: 4.5, winW: 3.4, lit: 0.55 });
    lotSigns(B, R, L, podTop, DT.BUND);
    if (R() < 0.6) shopLight(B, R, L, podTop);
    const ins = 4 + R() * 4;
    const hw = Math.min(L.w / 2 - ins, 22), hd = Math.min(L.d / 2 - ins, 22);
    const h = 70 + Math.pow(R(), 1.3) * 180;
    const glass = R() < 0.7;
    const kind = R() < 0.4 ? 1 : 0, prm = kind ? 0.25 : (R() < 0.3 ? 0.4 : 0);
    const tw = tower(B, R, { x: L.x, z: L.z, a: L.angle, y0: podTop, baseY: podTop, hw: Math.max(hw, 8), hd: Math.max(hd, 8), h, segs: 1 + Math.floor(R() * 3), kind, prm, mat: glass ? MAT.GLASS : MAT.OFFICE, col: glass ? pick(R, PAL.glass) : pick(R, PAL.office), floorH: 3.9, winW: glass ? 1.5 : 3.2, lit: 0.16 + R() * 0.2, flags: R() < 0.5 ? FLAG.EDGE : FLAG.CROWNLIT, seed: R() * 999 });
    const top = crown(B, R, { x: L.x, z: L.z, a: L.angle, hw: tw.hw, hd: tw.hd, top: tw.top, kind: tw.kind, prm: tw.prm, type: pick(R, CROWNS_CBD), maxTop: L.maxTop, style: DT.BUND });
    B.tops.push({ x: L.x, y: tw.top, z: L.z, bund: true });
    if (tw.top > 140) aviation(B, L.x, top, L.z, R() * 999);
    return;
  }
  // neoclassical / art-deco stone building covering the lot
  const floorH = 4.2 + R() * 0.6;
  const floors = 5 + Math.floor(R() * 6);
  const h = floors * floorH;
  const hw = L.w / 2 - 0.5, hd = L.d / 2 - 0.5;
  const col = pick(R, PAL.stone);
  const y0 = L.gMin - 4, baseY = L.gMin;
  const top = L.gMax + h;
  const seed = R() * 999;
  B.part({ x: L.x, y0, z: L.z, a: L.angle, hw, hd, h: top - y0, mat: MAT.STONE, col, floorH, winW: 3.2 + R() * 0.6, baseY, param: 0.55, flags: FLAG.FLOOD, seed, solid: true });
  lotSigns(B, R, L, Math.min(top, L.gMax + 12), DT.BUND, 0.6);
  // floodlights toward the river (east face, local +x)
  for (const t of [-0.3, 0.3]) {
    const [fx, fz] = Builder.tw(L.x, L.z, L.angle, hw + 3, hd * t * 2);
    B.light(fx, L.gMin + 2, fz, 20, [1, 0.72, 0.42], 16, 3);
  }
  // colonnade portico on the river face
  if (R() < 0.6) {
    const n = 6 + 2 * Math.floor(R() * 3);
    const span = Math.min(hd * 1.6, n * 4.5);
    const ch = floorH * 2;
    const cy = baseY + floorH * 1.4;
    for (let i = 0; i < n; i++) {
      const [cx, cz] = Builder.tw(L.x, L.z, L.angle, hw + 2.2, -span / 2 + span * i / (n - 1));
      B.part({ x: cx, y0: cy, z: cz, hw: 0.75, hd: 0.75, h: ch, kind: 2, prm: 16, mat: MAT.STONE, col: [col[0] * 1.15, col[1] * 1.15, col[2] * 1.15], floorH: 100, winW: 100, baseY: cy, param: 0, flags: FLAG.FLOOD | FLAG.NOWIN });
    }
    const [ex, ez] = Builder.tw(L.x, L.z, L.angle, hw + 1.4, 0);
    B.part({ x: ex, y0: cy + ch, z: ez, a: L.angle, hw: 1.6, hd: span / 2 + 1.5, h: 2.2, mat: MAT.STONE, col, floorH: 100, winW: 100, baseY: cy + ch - 20, param: 0, flags: FLAG.FLOOD | FLAG.BOTTOM });
    // pediment
    if (R() < 0.5) B.part({ x: ex, y0: cy + ch + 2.2, z: ez, a: L.angle, hw: 1.6, hd: span / 2 + 1.5, h: 4, taper: 0.05, mat: MAT.STONE, col, floorH: 100, winW: 100, baseY: cy, param: 0, flags: FLAG.FLOOD });
  }
  const ro = R();
  if (clockTower) {
    const tw = Math.min(hw, hd) * 0.32;
    const [tx, tz] = Builder.tw(L.x, L.z, L.angle, hw * 0.45, 0);
    B.part({ x: tx, y0: top, z: tz, a: L.angle, hw: tw, hd: tw, h: 22, mat: MAT.STONE, col, floorH: 5, winW: 3, baseY: top, param: 0.4, flags: FLAG.FLOOD, solid: true });
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const [cx, cz] = Builder.tw(tx, tz, L.angle, nx * (tw + 0.15), nz * (tw + 0.15));
      const ang = L.angle + (nx !== 0 ? 0 : Math.PI / 2);
      B.part({ x: cx, y0: top + 12, z: cz, a: ang, hw: 0.3, hd: tw * 0.8, h: tw * 1.6, mat: MAT.CLOCK, col, flags: FLAG.NOTOP });
    }
    B.part({ x: tx, y0: top + 22, z: tz, a: L.angle, hw: tw + 0.6, hd: tw + 0.6, h: 3, mat: MAT.STONE, col, floorH: 100, winW: 100, param: 0, flags: FLAG.FLOOD | FLAG.BOTTOM });
    B.part({ x: tx, y0: top + 25, z: tz, a: L.angle, hw: tw, hd: tw, h: 10, taper: 0.1, mat: MAT.METAL, col: [0.25, 0.42, 0.36] });
    B.part({ x: tx, y0: top + 35, z: tz, hw: 0.2, h: 7, kind: 2, prm: 8, taper: 0.3, mat: MAT.METAL, col: [0.7, 0.6, 0.3] });
    B.tops.push({ x: tx, y: top + 35, z: tz, bund: true });
  } else if (ro < 0.3) {
    // dome on a drum at the river-facing corner
    const r = Math.min(hw, hd) * (0.22 + R() * 0.12);
    const [dx, dz] = Builder.tw(L.x, L.z, L.angle, hw - r - 1, (R() < 0.5 ? -1 : 1) * (hd - r - 1));
    B.part({ x: dx, y0: top, z: dz, hw: r, hd: r, h: r * 0.9, kind: 2, prm: 32, mat: MAT.STONE, col, floorH: r * 0.9, winW: 2.5, baseY: top, param: 0.6, flags: FLAG.FLOOD });
    B.part({ x: dx, y0: top + r * 0.9, z: dz, hw: r * 1.08, hd: r * 1.08, h: 0.8, kind: 2, prm: 32, mat: MAT.STONE, col, floorH: 100, winW: 100, param: 0, flags: FLAG.BOTTOM | FLAG.FLOOD });
    B.part({ x: dx, y0: top + r * 0.9 + 0.8, z: dz, hw: r, hd: r, h: r * 1.05, kind: 2, prm: 32, prof: 1, mat: MAT.METAL, col: [0.22, 0.4, 0.33] });
    B.part({ x: dx, y0: top + r * 1.95 + 0.5, z: dz, hw: r * 0.15, hd: r * 0.15, h: r * 0.5, kind: 2, prm: 16, mat: MAT.EMIT, col: [1, 0.75, 0.4], param: 3 });
  } else if (ro < 0.6) {
    // stepped art-deco tower
    let y = top, s = 0.7;
    const steps = 2 + Math.floor(R() * 2);
    for (let i = 0; i < steps; i++) {
      const sh = floorH * (2 + Math.floor(R() * 3));
      B.part({ x: L.x, y0: y, z: L.z, a: L.angle, hw: hw * s, hd: hd * s, h: sh, mat: MAT.STONE, col, floorH, winW: 2.8, baseY, param: 0.55, flags: FLAG.FLOOD, solid: true });
      y += sh; s *= 0.72;
    }
    B.part({ x: L.x, y0: y, z: L.z, hw: 0.4, h: 10, kind: 2, prm: 8, taper: 0.2, mat: MAT.METAL, col: [0.65, 0.6, 0.45] });
  } else if (ro < 0.8) {
    // mansard roof
    B.part({ x: L.x, y0: top, z: L.z, a: L.angle, hw: hw - 0.5, hd: hd - 0.5, h: 5 + R() * 3, taper: 0.7, mat: MAT.METAL, col: [0.2, 0.32, 0.3], flags: 0 });
  }
}

export function genSteppe(B, R, L) {
  const podH = 7 + R() * 2.5;
  const col = pick(R, PAL.brick);
  const podTop = podium(B, R, L, { h: podH, mat: MAT.BRICK, col, floorH: 3.4, winW: 3, lit: 0.6, flags: FLAG.ARCADE });
  lotSigns(B, R, L, podTop, DT.STEPPE, 1.4);
  shopLight(B, R, L, podTop);
  if (R() < 0.5) shopLight(B, R, L, podTop);
  const hw = L.w / 2 - 0.5, hd = L.d / 2 - 0.5;
  const at = (lx, lz) => Builder.tw(L.x, L.z, L.angle, lx, lz);
  // quadrants of the roof terrace get different structures
  const quads = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (let i = quads.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = quads[i]; quads[i] = quads[j]; quads[j] = t; }
  const qw = hw / 2, qd = hd / 2;
  const maxTop = L.maxTop || 1e9;
  for (let qi = 0; qi < 4; qi++) {
    const [sx, sz] = quads[qi];
    const r = R();
    const [cx, cz] = at(sx * qw, sz * qd);
    if (qi === 0 || r < 0.3) {
      // mid-rise patterned-brick block
      const fl = 3 + Math.floor(R() * (qi === 0 ? 10 : 6));
      const bh = fl * 3.2;
      if (podTop + bh > maxTop) continue;
      const bw = qw * (0.7 + R() * 0.25), bd = qd * (0.7 + R() * 0.25);
      B.part({ x: cx, y0: podTop, z: cz, a: L.angle, hw: bw, hd: bd, h: bh, mat: MAT.BRICK, col: pick(R, PAL.brick), floorH: 3.2, winW: 2.6, baseY: podTop, param: 0.55, seed: R() * 999, solid: true });
      if (R() < 0.5) {
        const dr = Math.min(bw, bd) * 0.45;
        B.part({ x: cx, y0: podTop + bh, z: cz, hw: dr, hd: dr, h: 2.5, kind: 2, prm: 24, mat: MAT.TILE, col: pick(R, PAL.tile) });
        B.part({ x: cx, y0: podTop + bh + 2.5, z: cz, hw: dr, hd: dr, h: dr * 1.3, kind: 2, prm: 32, prof: R() < 0.5 ? 3 : 1, mat: MAT.TILE, col: pick(R, PAL.tile), flags: FLAG.RIBS });
      } else {
        for (let k = 0; k < 2; k++) { const [x, z] = Builder.tw(cx, cz, L.angle, (R() - 0.5) * bw, (R() - 0.5) * bd); B.prop({ x, y0: podTop + bh, z, hw: 0.35, h: 0.6, kind: 2, prm: 8, mat: MAT.EMIT, col: [1, 0.55, 0.2], param: 6, winW: 2, flags: FLAG.BOTTOM }); }
      }
      // neon trim along the parapet
      B.part({ x: cx, y0: podTop + bh - 0.6, z: cz, a: L.angle, hw: bw + 0.12, hd: bd + 0.12, h: 0.18, mat: MAT.EMIT, col: pick(R, PAL.neon), param: 5, flags: FLAG.BOTTOM | FLAG.NOTOP });
    } else if (r < 0.6) {
      // turquoise dome on a drum
      const dr = Math.min(qw, qd) * (0.4 + R() * 0.25);
      const drumH = 4 + R() * 4;
      B.part({ x: cx, y0: podTop, z: cz, hw: dr, hd: dr, h: drumH, kind: 2, prm: 16, mat: MAT.TILE, col: pick(R, PAL.tile), seed: R() * 999 });
      B.part({ x: cx, y0: podTop + drumH, z: cz, hw: dr * 1.06, hd: dr * 1.06, h: dr * (1.1 + R() * 0.5), kind: 2, prm: 32, prof: R() < 0.6 ? 3 : 1, mat: MAT.TILE, col: pick(R, PAL.tile), flags: FLAG.RIBS });
      B.part({ x: cx, y0: podTop + drumH + dr * 1.5, z: cz, hw: 0.25, h: 3, kind: 2, prm: 8, taper: 0.2, mat: MAT.EMIT, col: [1, 0.8, 0.35], param: 4 });
      B.light(cx, podTop + 3, cz, 18, [0.3, 0.9, 1], 20, 2);
    } else if (r < 0.85) {
      // ger cluster
      const n = 2 + Math.floor(R() * 4);
      for (let k = 0; k < n; k++) {
        const gr = 3 + R() * 2.5;
        const [gx, gz] = Builder.tw(cx, cz, L.angle, (R() - 0.5) * (qw - gr) * 1.6, (R() - 0.5) * (qd - gr) * 1.6);
        gerHut(B, R, gx, gz, podTop, gr);
      }
    } else {
      // slender tower with neon rings
      minaret(B, R, cx, cz, podTop, 22 + R() * 18, 1.6 + R() * 0.6);
    }
  }
  // lantern string along two roof edges
  if (B.q > 0) {
    for (const side of [0, 2]) {
      const F = rectFaces(hw, hd)[side];
      for (let t = 2; t < F.len - 1; t += 5) {
        const lx = F.sx + F.dx * t + F.nx * 0.3, lz = F.sz + F.dz * t + F.nz * 0.3;
        const [x, z] = at(lx, lz);
        B.prop({ x, y0: podTop + 1.2 + 0.25 * Math.sin(t * 0.6), z, hw: 0.25, h: 0.45, kind: 2, prm: 8, mat: MAT.EMIT, col: (t | 0) % 3 === 0 ? [1, 0.25, 0.12] : [1, 0.6, 0.2], param: 7, winW: 2, flags: FLAG.BOTTOM });
      }
    }
  }
}

export function gerHut(B, R, x, z, y, r, colDoor) {
  const wallH = r * 0.55;
  const a = R() * Math.PI * 2;
  B.part({ x, y0: y, z, a, hw: r, hd: r, h: wallH, kind: 2, prm: 24, mat: MAT.FELT, col: [0.82, 0.8, 0.74], param: 0.55, seed: R() * 999 });
  B.part({ x, y0: y + wallH, z, a, hw: r * 1.04, hd: r * 1.04, h: r * 0.5, kind: 2, prm: 24, prof: 5, taper: 0.16, mat: MAT.FELT, col: [0.8, 0.78, 0.72], param: 0.05, flags: FLAG.RIBS | FLAG.BOTTOM });
  const [dx, dz] = Builder.tw(x, z, a, r + 0.05, 0);
  B.prop({ x: dx, y0: y, z: dz, a, hw: 0.12, hd: r * 0.2, h: wallH * 0.85, mat: MAT.EMIT, col: colDoor || pick(R, [[1, 0.3, 0.1], [0.1, 0.6, 1], [1, 0.75, 0.1]]), param: 2.5 });
  B.prop({ x, y0: y + wallH + r * 0.48, z, hw: r * 0.17, hd: r * 0.17, h: 0.25, kind: 2, prm: 16, mat: MAT.EMIT, col: [1, 0.7, 0.3], param: 3 });
}

export function minaret(B, R, x, z, y, h, r) {
  const tile = pick(R, PAL.tile);
  B.part({ x, y0: y, z, hw: r, hd: r, h, kind: 2, prm: 16, taper: 0.82, mat: MAT.BRICK, col: pick(R, PAL.brick), floorH: 4, winW: 4, baseY: y, param: 0.3, solid: true });
  const rt = r * 0.82;
  B.part({ x, y0: y + h, z, hw: rt * 1.1, hd: rt * 1.1, h: 1.4, kind: 2, prm: 16, prof: 6, taper: 1.5, mat: MAT.TILE, col: tile, flags: FLAG.BOTTOM });
  B.part({ x, y0: y + h + 1.4, z, hw: rt * 0.8, hd: rt * 0.8, h: 3, kind: 2, prm: 16, mat: MAT.EMIT, col: [1, 0.75, 0.4], param: 3.5 });
  B.part({ x, y0: y + h + 4.4, z, hw: rt * 0.9, hd: rt * 0.9, h: rt * 1.6, kind: 2, prm: 16, prof: 3, mat: MAT.TILE, col: tile, flags: FLAG.RIBS });
  const neon = pick(R, PAL.neon);
  for (const f of [0.3, 0.6, 0.85]) {
    const rr = r * (1 - 0.18 * f) + 0.1;
    B.part({ x, y0: y + h * f, z, hw: rr, hd: rr, h: 0.35, kind: 2, prm: 16, mat: MAT.EMIT, col: neon, param: 6, flags: FLAG.BOTTOM | FLAG.NOTOP });
  }
  return y + h + 4.4 + rt * 1.6;
}

export function genCBD(B, R, L) {
  const dfc = clamp(L.distFromCenter, 0, 1);
  const maxTop = L.maxTop || 1e9;
  const big = Math.min(L.w, L.d) > 80;
  const podH = 12 + R() * 12;
  const ins = 4 + R() * 4;
  const glassC = pick(R, PAL.glass);
  // podium (glass lobby / mall)
  const podTop = L.gMax + podH;
  B.part({ x: L.x, y0: L.gMin - 4, z: L.z, a: L.angle, hw: L.w / 2 - ins, hd: L.d / 2 - ins, h: podTop - L.gMin + 4, kind: R() < 0.4 ? 0 : 1, prm: 0.15, mat: MAT.GLASS, col: glassC, floorH: 5, winW: 2, baseY: L.gMin, param: 0.6, flags: FLAG.EDGE, seed: R() * 999, solid: true });
  B.light(L.x + L.w / 2 - ins + 3, L.gMin + 4, L.z, 24, [0.7, 0.85, 1], 40, 1);
  const towers = big && R() < 0.6 ? 2 : 1;
  for (let ti = 0; ti < towers; ti++) {
    let hw, hd, x = L.x, z = L.z;
    if (towers === 2) {
      hw = L.w / 4 - 6; hd = Math.min(L.d / 2 - ins - 4, hw * (0.8 + R() * 0.5));
      [x, z] = Builder.tw(L.x, L.z, L.angle, (ti === 0 ? -1 : 1) * L.w / 4, (R() - 0.5) * 10);
    } else {
      const s = Math.min(L.w, L.d) / 2 - ins - 3;
      hw = Math.min(s, 20 + R() * 10); hd = Math.min(s, hw * (0.75 + R() * 0.4));
    }
    let H = 130 + 200 * Math.pow(R(), 1.7) * (1 - 0.4 * dfc);
    if (ti === 1) H *= 0.55 + R() * 0.2;
    if (podTop + H > maxTop) H = Math.max(maxTop - podTop, 60);
    const sr = R();
    let kind = 0, prm = 0, segs = 1, taper = 1, twist = 0;
    if (sr < 0.25) { kind = 0; prm = 0.35 + R() * 0.2; }
    else if (sr < 0.45) { kind = 1; prm = 0.2 + R() * 0.25; segs = 1 + Math.floor(R() * 2); }
    else if (sr < 0.68) { kind = 0; prm = 0; segs = 2 + Math.floor(R() * 2); }
    else if (sr < 0.78) { kind = 2; prm = 48; hd = hw; }
    else if (sr < 0.86) { kind = 2; prm = 8; hd = hw; segs = 2; }
    else if (sr < 0.92) { kind = 3; prm = 4.1; hd = hw; twist = 0.6 + R() * 0.6; }
    else { kind = 0; prm = 0.3; taper = 0.7; }
    const mr = R();
    const mat = mr < 0.82 ? MAT.GLASS : MAT.OFFICE;
    let flags = 0;
    if (R() < 0.35) flags |= FLAG.LED;
    if (R() < 0.45) flags |= FLAG.EDGE;
    if (R() < 0.3) flags |= FLAG.CROWNLIT;
    const tw = tower(B, R, { x, z, a: L.angle, y0: podTop, baseY: podTop, hw, hd, h: H, segs, kind, prm, taper, twist, mat, col: mat === MAT.GLASS ? glassC : pick(R, PAL.office), floorH: 4.0, winW: mat === MAT.GLASS ? 1.5 : 3, lit: 0.14 + R() * 0.2, flags, seed: R() * 999 });
    if (flags & FLAG.LED) B.led.push({ x, z, y0: podTop, y1: tw.top, r: Math.max(hw, hd) });
    const top = crown(B, R, { x, z, a: L.angle, hw: tw.hw, hd: tw.hd, top: tw.top, kind: tw.kind, prm: tw.prm, type: pick(R, CROWNS_CBD), maxTop: L.maxTop, style: DT.CBD });
    B.tops.push({ x, y: tw.top, z, cbd: true });
    for (const [sx, sz] of [[1, 1], [-1, -1]]) { const [ax, az] = Builder.tw(x, z, L.angle, sx * tw.hw * 0.85, sz * tw.hd * 0.85); aviation(B, ax, tw.top, az, R() * 999); }
    if (top > tw.top + 10) aviation(B, x, top, z, R() * 999);
  }
}


// Pedestrian skybridges between neighbouring hillside towers (Chongqing-style layered city).
export function skybridges(B, R) {
  const T = B.hillTowers;
  const cell = new Map();
  const key = (x, z) => Math.floor(x / 60) * 7919 + Math.floor(z / 60);
  T.forEach((t, i) => { const k = key(t.x, t.z); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(i); });
  let n = 0;
  for (let i = 0; i < T.length; i++) {
    const A = T[i];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const list = cell.get(key(A.x + dx * 60, A.z + dz * 60));
      if (!list) continue;
      for (const j of list) {
        if (j <= i) continue;
        const Bt = T[j];
        if (Bt.district !== A.district || R() > 0.3) continue;
        const c = Math.cos(A.a), s = Math.sin(A.a);
        const ox = Bt.x - A.x, oz = Bt.z - A.z;
        const lx = ox * c + oz * s, lz = -ox * s + oz * c;
        const alongX = Math.abs(lx) > Math.abs(lz);
        if (Math.abs(alongX ? lz : lx) > 6) continue;
        const gap = Math.abs(alongX ? lx : lz) - (alongX ? A.hw + Bt.hw : A.hd + Bt.hd);
        if (gap < 3 || gap > 34) continue;
        const lo = Math.max(A.y0, Bt.y0) + 8, hi = Math.min(A.top, Bt.top) - 10;
        if (hi < lo + 4) continue;
        const y = lo + (hi - lo) * (0.15 + R() * 0.7);
        const mx = A.x + ox / 2, mz = A.z + oz / 2;
        const len = Math.hypot(ox, oz);
        const ang = Math.atan2(oz, ox);
        const col = [0.28, 0.28, 0.3];
        B.part({ x: mx, y0: y, z: mz, a: ang, hw: len / 2, hd: 1.8, h: 3.4, mat: MAT.OFFICE, col, floorH: 3.4, winW: 2.2, baseY: y, param: 0.7, flags: FLAG.BOTTOM, seed: R() * 999, solid: true });
        B.part({ x: mx, y0: y - 0.25, z: mz, a: ang, hw: len / 2, hd: 1.95, h: 0.25, mat: MAT.EMIT, col: R() < 0.5 ? [0.3, 0.9, 1] : [1, 0.35, 0.7], param: 3.5, flags: FLAG.BOTTOM });
        n++;
      }
    }
  }
  return n;
}