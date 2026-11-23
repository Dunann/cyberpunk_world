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
    this.propBudget = quality >= 2 ? 70000 : quality === 1 ? 40000 : 15000;
    this.props = 0;
  }

  part(o) { return this.P.add(o); }
  prop(o) {
    if (this.props >= this.propBudget) return -1;
    this.props++;
    o.flags = (o.flags || 0) | FLAG.PROP;
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
      if (B.prop({ x: wx, y0: y, z: wz, a: ang, hw: 0.42, hd: 0.3, h: 0.55, mat: MAT.CONCRETE, col: [0.5, 0.5, 0.47], flags: FLAG.BOTTOM, seed: R() * 999 }) < 0) return;
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
    return top + 6;
  }
  if (type === 'lit') {
    const h = 8 + R() * Math.min(25, m * 0.8);
    B.part({ x, y0: top, z, a, hw: hw * 0.94, hd: hd * 0.94, h, kind, prm, taper: 0.8 + R() * 0.15, mat: MAT.CROWN, col: pick(R, PAL.crown), param: 1.1 + R() * 1.2, flags: FLAG.NOTOP });
    B.part({ x, y0: top + 0.5, z, a, hw: hw * 0.8, hd: hd * 0.8, h: h - 1, kind, prm, mat: MAT.CONCRETE, col: [0.1, 0.1, 0.1] });
    return top + h;
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
    billboard(B, R, x, z, top, a + (R() < 0.5 ? 0 : Math.PI / 2), w, w * (0.3 + R() * 0.2), style);
    return top + w * 0.5;
  }
  return top;
}

// Choose podium and sign slots for a lot. Returns podium top.
function streetFaces(L) {
  const D = DISTRICTS[L.district];
  const c = Math.cos(-D.angle), s = Math.sin(-D.angle);
  const qx = (L.x - D.cx) * c - (L.z - D.cz) * s, qz = (L.x - D.cx) * s + (L.z - D.cz) * c;
  const lim = D.road / 2 + 3 + 2.5;
  const isStreet = (e) => Math.abs(e - Math.round(e / D.block) * D.block) < lim;
  // ring order faces: +z, -x, -z, +x
  return [isStreet(qz + L.d / 2), isStreet(qx - L.w / 2), isStreet(qz - L.d / 2), isStreet(qx + L.w / 2)];
}

function lotSigns(B, R, L, podTop, style, density = 1) {
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
    if (street[fi] && R() < 0.38 * density) {
      const t = F.len * (0.3 + R() * 0.4);
      const [x, z] = at(t);
      const g = W.heightAt(x, z);
      const w = Math.min(F.len * 0.55, 4 + R() * 10);
      B.slot(x, Math.min(g + 4.0, podTop - 0.8), z, nx, nz, w, 1.1, false, style);
    }
    if (R() < 0.33 * p * density) {
      const t = R() < 0.5 ? 1.2 + R() * 2 : F.len - 1.2 - R() * 2;
      const [x, z] = at(t);
      const g = W.heightAt(x, z);
      // blade sign on the podium facade: from 3.5 m above the street up to just below the podium top
      const bottom = g + 3.5, top = Math.min(podTop - 0.4, g + 20);
      const h = Math.min(4 + R() * 9, top - bottom);
      if (h >= 2) B.slot(x, bottom + h / 2, z, nx, nz, 1.1 + R() * 0.6, h, true, style);
    }
  }
}

function podium(B, R, L, opts) {
  const hw = L.w / 2 - 0.5, hd = L.d / 2 - 0.5;
  const y0 = L.gMin - 4;
  const top = L.gMax + opts.h;
  B.part({ x: L.x, y0, z: L.z, a: L.angle, hw, hd, h: top - y0, mat: opts.mat, col: opts.col, floorH: opts.floorH || 4.2, winW: opts.winW || 3.4, baseY: L.gMin, param: opts.lit || 0.45, flags: opts.flags || 0, seed: R() * 999, solid: true });
  return top;
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

const CROWNS_RES = ['machine', 'machine', 'machine', 'lit', 'pagoda', 'antenna', 'billboard'];
const CROWNS_CBD = ['lit', 'lit', 'spire', 'helipad', 'antenna', 'spire', 'machine'];

// ------------------------------------------------------------------ districts

export function genHillside(B, R, L) {
  const podH = 6 + 3 * Math.floor(R() * 3);
  const podTop = podium(B, R, L, { h: podH, mat: MAT.SHOP, col: pick(R, PAL.shop), floorH: 3.6, winW: 3.2, lit: 0.55, flags: R() < 0.3 ? FLAG.ARCADE : 0 });
  lotSigns(B, R, L, podTop, DT.HILLSIDE);
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
    if (kind === 0 && prm === 0) acUnits(B, R, T.x, T.z, L.angle, T.hw, T.hd, podTop, podTop, podTop + h * (segs === 2 ? 0.6 : 1), floorH, winW, 0.07);
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
  const podTop = podium(B, R, L, { h: podH, mat: MAT.SHOP, col: pick(R, PAL.shop), floorH: 3.5, winW: 3.2, lit: 0.55, flags: arcade ? FLAG.ARCADE : 0 });
  lotSigns(B, R, L, podTop, DT.URBAN);
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