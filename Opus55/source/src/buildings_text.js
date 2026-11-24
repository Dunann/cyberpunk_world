// Tower phrase show (idea I-014): large Chinese characters on the water-facing faces of river-front towers.
//
// Each run of front-row towers along a river bank spells one short phrase (2-4 characters), one character per
// tower, in reading order as seen from the water. Participants are chosen by a fixed rule (no camera positions):
//   - a tower (stack of shaft parts) at least 100 m tall, in a hillside, urban, Bund or CBD district;
//   - front row: one of its faces has water in front of it within 700 m, and no ground-standing building at
//     least 40 m tall stands between that face and the water; the face nearest the water carries the character;
//   - at most 40 towers city-wide: when more qualify, whole phrases are kept nearest-the-water first;
//   - a fixed seed breaks ties and picks each phrase's text and colour.
// Landmark towers follow the same rule, so they only carry text as part of a front-row phrase. Towers behind the
// front row show nothing.
//
// The characters are drawn by a separate overlay pass over the chosen tower parts (see TEXT_WGSL): it writes only
// the emissive G-buffer target, dims the lit windows under each character panel, then adds the character.

import { FLAG, MAT, PART_FLOATS } from './buildings_wgsl.js';
import { DT, DISTRICTS } from './world.js';

export const TEXT_MAX = 64;         // capacity of each overlay draw list (TEXT_STRIDE in CULL_WGSL)

// All rule constants, fixed before any eval capture.
export const RULE = {
  minHeight: 100,     // tower top above the ground (m)
  reach: 700,         // water must be within this distance of the tower centre (m)
  dirs: 16,           // directions marched to find water
  cone: 0.866,        // water counts as in front of a face within 30 degrees of its normal
  blockH: 40,         // a ground-standing building at least this tall between a face and the water hides it
  minGlyph: 16,       // smallest character slot (m)
  maxGlyph: 60,       // largest character slot (m)
  flatFill: 0.94,     // slot side / face width on flat faces (the character's ink is ~87% of the slot)
  roundFill: 0.75,    // slot side / diameter on round plans (ink ~1.3 x radius)
  minBase: 25,        // keep the slot this far above the ground (m)
  runGap: 250,        // a gap along the bank larger than this splits a run of front-row towers (m)
  maxTowers: 40,
  seed: 1408,
};

// Low-stroke phrases (every character at most 9 strokes).
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

// Candidate faces of one part that can carry a character: [{ D: face direction (world xz, unit), uC: slot centre
// along the tangent, W: face width at the part base, fill }]. Flat faces centre the character on the face; round
// plans (cylinders, ellipses, lobed plans) offer the marched directions `dirs` instead.
// The overlay maps the character by projecting onto the tangent T = (D.z, -D.x), so taper and lean are handled.
export function partFaces(p, dirs) {
  if (p.twist !== 0 || p.prof !== 0) return [];   // twisted or profiled (domes, flares) parts are skipped
  const flat = (faces, fill = RULE.flatFill) => faces.map((f) => {
    const [nx, nz] = rot(p.a, f.n[0], f.n[1]);
    const [mx, mz] = rot(p.a, f.m[0], f.m[1]);
    return { D: [nx, nz], uC: mx * nz - mz * nx, W: f.w, fill };
  });
  const { hw, hd, kind, prm } = p;
  if (kind <= 1 || (kind === 2 && Math.round(prm) === 4)) {
    // rectangle, rounded or chamfered rectangle, square polygon: projected width across the face normal
    return flat([
      { n: [0, 1], m: [0, hd], w: 2 * hw }, { n: [-1, 0], m: [-hw, 0], w: 2 * hd },
      { n: [0, -1], m: [0, -hd], w: 2 * hw }, { n: [1, 0], m: [hw, 0], w: 2 * hd },
    ]);
  }
  if (kind === 4) {
    // triangle (matches ringEval kind 4)
    const v = [[hw, -hd], [hw, hd], [-hw, 0]];
    const faces = [];
    for (let k = 0; k < 3; k++) {
      const a = v[k], b = v[(k + 1) % 3];
      const ex = b[0] - a[0], ez = b[1] - a[1];
      faces.push({ n: norm(ez, -ex), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], w: Math.hypot(ex, ez) });
    }
    return flat(faces);
  }
  if (kind === 2 && prm < 12) {
    const N = Math.max(3, Math.round(prm));
    const faces = [];
    const off = Math.PI / N;
    for (let k = 0; k < N; k++) {
      const na = (k + 0.5) / N * Math.PI * 2 + off;
      const n = norm(Math.cos(na) / hw, Math.sin(na) / hd);
      // odd polygons have one face per side; others are treated like a cylinder centred on a face
      const w = N % 2 === 1 ? 2 * Math.min(hw, hd) / Math.cos(off) * Math.sin(off) : 2 * Math.min(hw, hd);
      faces.push({ n, m: [n[0] * Math.min(hw, hd), n[1] * Math.min(hw, hd)], w });
    }
    const out = flat(faces);
    if (N % 2 === 0) for (const f of out) { f.fill = RULE.roundFill; f.uC = 0; }
    return out;
  }
  if (kind === 2 || kind === 3) {
    // ellipse / cylinder, lobed plan: centred on a marched direction
    const r = Math.min(hw, hd) * (kind === 3 ? 1 - (prm % 1) : 1);
    return dirs.map((d) => ({ D: [d[0], d[1]], uC: 0, W: 2 * r, fill: RULE.roundFill }));
  }
  return [];
}

// Fits a character slot on part p with face f. Returns { g, yC } or null.
export function fitSlot(p, f, ground) {
  const top = p.y0 + p.h;
  const lo = Math.max(p.y0, ground + RULE.minBase);
  let g = Math.min(RULE.maxGlyph, f.fill * f.W);
  for (let it = 0; it < 3; it++) {
    // taper (linear profile): the face is narrower higher up, so size the slot at its top edge
    const t = Math.min(1, Math.max(0, (top - 0.1 * g - p.y0) / p.h));
    const scale = 1 + (p.taper - 1) * t;
    g = Math.min(RULE.maxGlyph, f.fill * f.W * scale);
  }
  if (top - 0.1 * g - g < lo) g = Math.min(g, (top - lo) / 1.1);
  if (g < RULE.minGlyph) return null;
  return { g, yC: top - 0.1 * g - 0.5 * g };
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

// River id, side and position along the river (arc length) of the bank point nearest to (x, z).
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

// Splits a run of n towers into phrases of 2-4 characters (a lone tower gets none).
export function chunkSizes(n) {
  if (n < 2) return [];
  const k = Math.ceil(n / 4);
  const base = Math.floor(n / k), extra = n % k;
  const out = [];
  for (let i = 0; i < k; i++) out.push(base + (i < extra ? 1 : 0));
  return out;
}

// Full participation rule. Returns { glyphs: [...], chars: [unique characters], stats }.
export function selectTowerText(world, P) {
  const towers = groupTowers(P, world);
  // front-row blockers: towers standing on the ground (not skybridges or vaults) at least blockH tall
  const blockers = towers.filter((o) => o.y0 - o.ground < 15 && o.top - o.ground >= RULE.blockH);
  const stats = { towers: towers.length, tall: 0, sight: 0, front: 0, inRuns: 0, chosen: 0, byDistrict: {} };
  const cands = [];
  for (const t of towers) {
    if (!t.shaft || t.top - t.ground < RULE.minHeight) continue;
    const di = world.districtAt(t.x, t.z).index;
    if (di < 0 || !TEXT_DISTRICTS.has(DISTRICTS[di].type)) continue;
    stats.tall++;
    const hits = waterHits(world, t.x, t.z);
    if (!hits) continue;
    stats.sight++;
    const dirs = hits.filter((h) => h.s < Infinity).map((h) => h.d);
    // front row: a face with water in front of it and no tower in between. Among those, the face nearest the
    // water carries the character (ties within 25 m go to the larger, then the higher character).
    let best = null;
    for (const p of t.parts) {
      if (!SHAFT_MATS.has(p.mat)) continue;
      for (const f of partFaces(p, dirs)) {
        const wdist = faceWater(hits, f.D);
        if (wdist === Infinity) continue;
        const s = fitSlot(p, f, t.ground);
        if (!s || blocked(blockers, t, f, wdist)) continue;
        const key = [Math.round(wdist / 25), -s.g, -s.yC];
        if (!best || key[0] < best.key[0] || (key[0] === best.key[0] && (key[1] < best.key[1] || (key[1] === best.key[1] && key[2] < best.key[2])))) {
          best = { p, f, s, wdist, key };
        }
      }
    }
    if (!best) continue;
    stats.front++;
    cands.push({ t, ...best, district: DISTRICTS[di].name });
  }
  // banks: group by (river, side), order along the river, split into runs, then into phrases
  const banks = new Map();
  for (const c of cands) {
    const hx = c.t.x + c.f.D[0] * c.wdist, hz = c.t.z + c.f.D[1] * c.wdist;
    const b = bankOf(world, c.t.x, c.t.z, hx, hz);
    c.along = b.along;
    if (!banks.has(b.key)) banks.set(b.key, []);
    banks.get(b.key).push(c);
  }
  const chunks = [];
  for (const [key, list] of [...banks.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    list.sort((a, b) => a.along - b.along);
    const runs = [];
    let run = [];
    for (const c of list) {
      if (run.length && c.along - run[run.length - 1].along > RULE.runGap) { runs.push(run); run = []; }
      run.push(c);
    }
    if (run.length) runs.push(run);
    runs.forEach((r, ri) => {
      let at = 0;
      chunkSizes(r.length).forEach((n, ci) => {
        const tw = r.slice(at, at + n);
        chunks.push({ key: `${key}/${ri}/${ci}`, towers: tw, wdist: tw.reduce((s, c) => s + c.wdist, 0) / n, h: hash01(RULE.seed, chunks.length) });
        at += n;
      });
    });
  }
  stats.inRuns = chunks.reduce((s, c) => s + c.towers.length, 0);
  // cap: keep the phrases nearest the water (ties broken by the fixed seed)
  const order = [...chunks].sort((a, b) => a.wdist - b.wdist || a.h - b.h);
  const kept = [];
  let total = 0;
  for (const c of order) {
    if (total + c.towers.length > RULE.maxTowers) continue;
    kept.push(c); total += c.towers.length;
  }
  // phrase text, reading order (left to right for a viewer on the water facing the bank), colour
  const glyphs = [];
  const chars = [];
  kept.forEach((c, ci) => {
    const n = c.towers.length;
    const list = PHRASES[n];
    const phrase = [...list[Math.floor(hash01(RULE.seed, ci, 7) * list.length) % list.length]];
    let mx = 0, mz = 0;
    for (const t of c.towers) { mx += t.f.D[0]; mz += t.f.D[1]; }
    const [dx, dz] = norm(mx, mz);
    const right = [dz, -dx];
    const ordered = [...c.towers].sort((a, b) => (a.t.x * right[0] + a.t.z * right[1]) - (b.t.x * right[0] + b.t.z * right[1]));
    const col = PALETTE[Math.floor(hash01(RULE.seed, ci, 13) * PALETTE.length) % PALETTE.length];
    ordered.forEach((t, k) => {
      const ch = phrase[k];
      let layer = chars.indexOf(ch);
      if (layer < 0) { layer = chars.length; chars.push(ch); }
      glyphs.push({ part: t.p.i, D: t.f.D, uC: t.f.uC, yC: t.s.yC, g: t.s.g, layer, index: k, col, char: ch,
        phrase: phrase.join(''), x: t.t.x, z: t.t.z, district: t.district });
      stats.byDistrict[t.district] = (stats.byDistrict[t.district] || 0) + 1;
    });
  });
  stats.chosen = glyphs.length;
  stats.phrases = kept.map((c) => glyphs.filter((g) => c.towers.some((t) => t.p.i === g.part)).map((g) => g.char).join(''));
  return { glyphs, chars, stats };
}

// GPU slot records: 4 x vec4f per character.
//  a: lit direction x, z, slot centre along the tangent, slot centre y
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

// One 256x256 layer per character (rg8unorm: R crisp mask, G blurred halo), with full mip chains.
// Separate layers mean far mip levels can never bleed in neighbouring characters.
export const GLYPH_RES = 256;
export function buildGlyphArray(device, chars) {
  const N = GLYPH_RES, layers = Math.max(1, chars.length);
  const levels = Math.log2(N) + 1;
  const tex = device.createTexture({ label: 'tower-glyphs', size: [N, N, layers], dimension: '2d', format: 'rg8unorm', mipLevelCount: levels, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  chars.forEach((ch, layer) => {
    const a = new OffscreenCanvas(N, N);
    const ga = a.getContext('2d');
    ga.fillStyle = '#000'; ga.fillRect(0, 0, N, N);
    ga.fillStyle = '#fff'; ga.textAlign = 'center'; ga.textBaseline = 'middle';
    ga.font = `bold ${Math.round(N * 0.84)}px "Microsoft YaHei", "SimHei", sans-serif`;
    ga.fillText(ch, N / 2, N / 2 + N * 0.03);
    const b = new OffscreenCanvas(N, N);
    const gb = b.getContext('2d');
    gb.filter = 'blur(7px)'; gb.drawImage(a, 0, 0);
    gb.globalCompositeOperation = 'lighter'; gb.drawImage(b, 0, 0);
    let srcA = a, srcB = b, w = N;
    for (let l = 0; l < levels; l++) {
      if (l > 0) {
        const nw = Math.max(1, w >> 1);
        const na = new OffscreenCanvas(nw, nw), nb = new OffscreenCanvas(nw, nw);
        const ca = na.getContext('2d'), cb = nb.getContext('2d');
        ca.imageSmoothingQuality = 'high'; cb.imageSmoothingQuality = 'high';
        ca.drawImage(srcA, 0, 0, nw, nw); cb.drawImage(srcB, 0, 0, nw, nw);
        srcA = na; srcB = nb; w = nw;
      }
      const da = srcA.getContext('2d').getImageData(0, 0, w, w).data;
      const db = srcB.getContext('2d').getImageData(0, 0, w, w).data;
      const out = new Uint8Array(w * w * 2);
      for (let i = 0; i < w * w; i++) { out[i * 2] = da[i * 4]; out[i * 2 + 1] = db[i * 4]; }
      device.queue.writeTexture({ texture: tex, mipLevel: l, origin: [0, 0, layer] }, out, { bytesPerRow: w * 2 }, [w, w, 1]);
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

const LED_CELLS = 28.0;   // LED cells across one character slot (the ink spans ~24)
const GLYPH_RES = ${GLYPH_RES}.0;

@fragment fn fsText(i: VOut) -> GOut {
  // derivatives first, in uniform control flow
  let fwp = max(length(fwidth(i.wp)), 1e-4);   // metres per pixel
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
  let layer = i32(S.b.y + 0.5);

  // LED cells: quantised up close, a continuous filtered glyph once cells get small (no stair-step crawl)
  let cp = fwp * LED_CELLS / g;                     // fraction of an LED cell covered by one pixel
  let q = (floor(uv * LED_CELLS) + 0.5) / LED_CELLS;
  let nearS = textureSampleLevel(glyphTex, sampClamp, q, layer, 0.0).r;
  let lod = log2(max(GLYPH_RES * fwp / g, 1e-3));
  let farS = textureSampleLevel(glyphTex, sampClamp, uv, layer, lod);
  let kq = 1.0 - smoothstep(0.2, 0.45, cp);        // LED quantisation while a cell is wider than ~5 px
  let glyph = mix(farS.r, smoothstep(0.3, 0.6, nearS), kq);
  let cf = fract(uv * LED_CELLS) - vec2f(0.5);
  let dotM = 1.0 - smoothstep(0.36 - cp, 0.36 + cp, length(cf));
  let kd = 1.0 - smoothstep(0.1, 0.25, cp);        // round LED dots only while a cell is wider than ~10 px
  let led = mix(1.0, dotM * 1.8, kd);

  // panel: the slot on the lit face only (not on caps or the side and back faces)
  let n = normalize(i.n);
  let facing = dot(normalize(n.xz + vec2f(1e-5, 0.0)), D);
  let fu = fwp / g;
  let panel = saturate(min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)) / max(fu, 1e-4) + 0.5)
            * smoothstep(0.25, 0.4, facing) * select(1.0, 0.0, (i.info.y & 256u) != 0u);
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
  let dim = panel * saturate(0.35 + 0.6 * farS.g);
  var o: GOut;
  o.emissive = vec4f(e * panel, dim);
  return o;
}
`;
