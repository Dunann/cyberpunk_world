// Dev check for I-015: everything outside the Hongyadong complex must be identical to the baseline build.
//   node tools/hyd-identity.mjs --dump <file.html> --to <out.json> [--profile name]
//       loads a dev build and writes every building part, sign, sign lantern, light, sign slot and collider
//   node tools/hyd-identity.mjs --compare <base.json> <candidate.json>
//       compares them. Parts and signs keep their indices, so they are compared index by index: the candidate's
//       parts outside the complex's ranges must equal the baseline's at the same index, its first signs the
//       baseline's signs. Lights and colliders are compared as multisets; every row found in only one build must
//       lie inside the complex's footprint box.
// The baseline build needs `this.devParts = P` in buildings.js init (added under __DEV__ in I-015's buildings.js).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { launch, root } from './launch.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };

if (opt('dump', '')) {
  const file = path.resolve(opt('dump'));
  // launch() serves files relative to the tools' root; copy the build next to out/dev.html under its own name
  const name = 'identity-' + path.basename(file);
  fs.copyFileSync(file, path.join(root, 'out', name));
  const { page, close } = await launch({ file: 'out/' + name, profileName: opt('profile', 'opus55-I015'), query: 'w=640&h=360&noadapt&nooverlay&freeze&quality=high' });
  await page.evaluate(() => window.__frames(6));
  const d = await page.evaluate(() => {
    const ctx = window.__ctx, w = ctx.world;
    const bm = ctx.modules.find((m) => m.name === 'buildings'), sm = ctx.modules.find((m) => m.name === 'signs');
    const P = bm.devParts;
    const rows = (data, n, stride) => { const out = []; for (let i = 0; i < n; i++) out.push(Array.from(data.subarray(i * stride, i * stride + stride)).join(',')); return out; };
    const flat = (arr) => arr.map((r) => Array.from(r).join(','));
    const site = w.shared.landmarkSites.stilts || {};
    return {
      parts: rows(P.data, P.count, 24),
      signs: flat(sm.cells.rows),
      lanterns: flat(sm.lanCells.rows),
      lights: rows(ctx.lights.data, ctx.lights.count, 8),
      slots: w.signSlots.map((s) => [s.x, s.y, s.z, s.nx, s.nz, s.w, s.h, s.vertical, s.style, s.roof, s.own ? 1 : 0].join(',')),
      colliders: w.colliders.map((c) => [c.cx, c.cy, c.cz, c.hx, c.hy, c.hz, c.cos, c.sin].join(',')),
      ranges: site.ranges || null,
      ends: site.stats ? site.stats.ends : null,
      signStats: w.shared.signStats, buildingStats: w.shared.buildingStats,
    };
  });
  await close();
  fs.unlinkSync(path.join(root, 'out', name));
  fs.writeFileSync(path.resolve(opt('to')), JSON.stringify(d));
  console.log(`dumped ${d.parts.length} parts, ${d.signs.length} signs, ${d.lanterns.length} lanterns, ${d.lights.length} lights, ${d.slots.length} slots, ${d.colliders.length} colliders`);
  process.exit(0);
}

const ci = args.indexOf('--compare');
if (ci < 0) { console.log('usage: --dump <file.html> --to <out.json> | --compare <base.json> <candidate.json>'); process.exit(2); }
const A = JSON.parse(fs.readFileSync(args[ci + 1], 'utf8')), Bc = JSON.parse(fs.readFileSync(args[ci + 2], 'utf8'));
const hash = (arr) => crypto.createHash('sha256').update(arr.join('\n')).digest('hex').slice(0, 16);

// footprint box of the complex: its parts' centres (candidate ranges), padded by 40 m
const inRange = (i) => Bc.ranges.some(([a, b]) => i >= a && i < b);
let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
Bc.parts.forEach((r, i) => { if (!inRange(i)) return; const v = r.split(',').map(Number); bx0 = Math.min(bx0, v[0]); bx1 = Math.max(bx1, v[0]); bz0 = Math.min(bz0, v[2]); bz1 = Math.max(bz1, v[2]); });
bx0 -= 40; bx1 += 40; bz0 -= 40; bz1 += 40;
const inBox = (row, xi = 0, zi = 2) => { const v = row.split(',').map(Number); return v[xi] >= bx0 && v[xi] <= bx1 && v[zi] >= bz0 && v[zi] <= bz1; };
const report = { box: [bx0, bx1, bz0, bz1].map((v) => +v.toFixed(0)) };

// parts, index by index
{
  const head = Bc.ranges[0], late = Bc.ranges[1];
  const n = A.parts.length;
  let same = 0, diff = 0, oldInBox = 0;
  const diffs = [];
  for (let i = 0; i < n; i++) {
    if (i >= head[0] && i < head[1]) { if (inBox(A.parts[i])) oldInBox++; continue; }   // the earlier complex's indices
    if (A.parts[i] === Bc.parts[i]) same++; else { diff++; if (diffs.length < 5) diffs.push(i); }
  }
  const outside = A.parts.filter((_, i) => !(i >= head[0] && i < head[1]));
  const outsideC = Bc.parts.filter((_, i) => !inRange(i));
  report.parts = { base: n, candidate: Bc.parts.length, earlierComplexIndices: head[1] - head[0], earlierComplexInBox: oldInBox, lateStart: late[0], lateStartEqualsBaseCount: late[0] === n, outsideSame: same, outsideDifferent: diff, firstDiffs: diffs, hashBase: hash(outside), hashCandidate: hash(outsideC) };
}
// signs and lanterns: the candidate's first rows are the city's (its own rows come last)
for (const k of ['signs', 'lanterns', 'slots']) {
  const a = A[k], b = Bc[k];
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  const extra = b.slice(a.length);
  report[k] = { base: a.length, candidate: b.length, firstRowsDifferent: diff, hashBase: hash(a), hashCandidate: hash(b.slice(0, a.length)), extraRows: extra.length, extraOutsideBox: extra.filter((r) => !inBox(r)).length };
}
// lights and colliders as multisets
for (const [k, xi, zi] of [['lights', 0, 2], ['colliders', 0, 2]]) {
  const count = new Map();
  for (const r of A[k]) count.set(r, (count.get(r) || 0) + 1);
  const onlyC = [];
  for (const r of Bc[k]) { const c = count.get(r) || 0; if (c > 0) count.set(r, c - 1); else onlyC.push(r); }
  const onlyA = [];
  for (const [r, c] of count) for (let j = 0; j < c; j++) onlyA.push(r);
  const shared = A[k].length - onlyA.length;
  report[k] = { base: A[k].length, candidate: Bc[k].length, shared, onlyBase: onlyA.length, onlyBaseOutsideBox: onlyA.filter((r) => !inBox(r, xi, zi)).length, onlyCandidate: onlyC.length, onlyCandidateOutsideBox: onlyC.filter((r) => !inBox(r, xi, zi)).length };
  if (k === 'lights') {
    // order of the shared lights (the tiled shader sums lights in index order)
    const sa = new Set(onlyA), sc = new Set(onlyC);
    const ka = A[k].filter((r) => !sa.has(r)), kc = Bc[k].filter((r) => !sc.has(r));
    report[k].sharedOrderSame = ka.length === kc.length && ka.every((r, i) => r === kc[i]);
  }
}
report.stats = { base: { signs: A.signStats, buildings: A.buildingStats }, candidate: { signs: Bc.signStats, buildings: Bc.buildingStats } };
console.log(JSON.stringify(report, null, 1));
