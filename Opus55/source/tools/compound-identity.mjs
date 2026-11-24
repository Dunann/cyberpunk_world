// Dev check for I-018 (planned compounds): everything outside the replaced tower sections must be identical to the
// baseline build.
//   node tools/compound-identity.mjs --dump <file.html> --to <out.json> [--profile name] [--query extra]
//       loads a dev build and writes every building part (before and after compaction), sign row, lantern, light,
//       sign slot and collider, plus the crowd, car and air-path arrays, the tower-text selection and the stats
//   node tools/compound-identity.mjs --compare <base.json> <candidate.json>
//       compares them:
//        - parts: the candidate's full list (before compaction) equals the baseline index by index (replaced parts
//          keep their data there); its compacted list is the baseline minus the replaced indices, in order, then
//          the compound parts;
//        - sign rows: equal index by index except the dead slots' rows (zeroed); compound rows come after;
//        - lights and colliders as multisets: every baseline-only row must be a dropped dead-slot light or the
//          collider of a replaced part;
//        - crowd, cars, air paths, tower text, infill and fixed-prefix stats: equal.
// The baseline needs the dev hooks (devParts, shared.devData); main before I-018 has devParts only, so crowd, cars
// and air paths are compared when both dumps have them.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { launch, root } from './launch.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };

if (opt('dump', '')) {
  const file = path.resolve(opt('dump'));
  const name = 'identity-' + path.basename(file);
  fs.copyFileSync(file, path.join(root, 'out', name));
  const extra = opt('query', '');
  const { page, close } = await launch({ file: 'out/' + name, profileName: opt('profile', 'opus55-I018'), query: 'w=640&h=360&noadapt&nooverlay&freeze&quality=high' + (extra ? '&' + extra : '') });
  await page.evaluate(() => window.__frames(6));
  const d = await page.evaluate(() => {
    const ctx = window.__ctx, w = ctx.world;
    const bm = ctx.modules.find((m) => m.name === 'buildings'), sm = ctx.modules.find((m) => m.name === 'signs');
    const rows = (data, n, stride) => { const out = []; for (let i = 0; i < n; i++) out.push(Array.from(data.subarray(i * stride, i * stride + stride)).join(',')); return out; };
    const flat = (arr) => arr.map((r) => Array.from(r).join(','));
    const P = bm.devParts, PF = bm.devPartsFinal || bm.devParts;
    const dd = w.shared.devData || {};
    const arr = (a) => (a ? Array.from(a).join(',') : null);
    return {
      parts: rows(P.data, P.count, 24),
      partsFinal: rows(PF.data, PF.count, 24),
      replaced: bm.devReplaced ? Array.from(bm.devReplaced) : [],
      deadRows: sm.devDeadRows || 0,
      signs: flat(sm.cells.rows),
      lanterns: flat(sm.lanCells.rows),
      lights: rows(ctx.lights.data, ctx.lights.count, 8),
      slots: w.signSlots.map((s) => [s.x, s.y, s.z, s.nx, s.nz, s.w, s.h, s.vertical, s.style, s.roof, s.own ? 1 : 0].join(',')),
      slotFlags: w.signSlots.map((s) => (s.dead ? 'd' : s.comp ? 'c' : '')),
      colliders: w.colliders.map((c) => [c.cx, c.cy, c.cz, c.hx, c.hy, c.hz, c.cos, c.sin].join(',')),
      crowd: arr(dd.crowd), cars: arr(dd.cars), airPaths: arr(dd.airPaths),
      text: JSON.stringify((({ phrases, glyphs }) => ({ phrases: phrases.map((p) => p.text), glyphs }))(w.shared.towerText)),
      infill: JSON.stringify(w.shared.infillStats), fixedPrefix: JSON.stringify(w.shared.fixedPrefix || null),
      signStats: w.shared.signStats, buildingStats: w.shared.buildingStats, compound: w.shared.compoundStats || null,
    };
  });
  await close();
  fs.unlinkSync(path.join(root, 'out', name));
  fs.writeFileSync(path.resolve(opt('to')), JSON.stringify(d));
  console.log(`dumped ${d.parts.length} parts (${d.partsFinal.length} final, ${d.replaced.length} replaced), ${d.signs.length} signs, ${d.lights.length} lights, ${d.slots.length} slots, ${d.colliders.length} colliders`);
  process.exit(0);
}

const ci = args.indexOf('--compare');
if (ci < 0) { console.log('usage: --dump <file.html> --to <out.json> [--query q] | --compare <base.json> <candidate.json>'); process.exit(2); }
const A = JSON.parse(fs.readFileSync(args[ci + 1], 'utf8')), C = JSON.parse(fs.readFileSync(args[ci + 2], 'utf8'));
const hash = (x) => crypto.createHash('sha256').update(Array.isArray(x) ? x.join('\n') : String(x)).digest('hex').slice(0, 16);
const report = {};
let ok = true;
const check = (name, cond) => { report.checks = report.checks || {}; report.checks[name] = cond ? 'PASS' : 'FAIL'; if (!cond) ok = false; };

// parts
{
  const n = A.parts.length;
  let diff = 0;
  for (let i = 0; i < n; i++) if (A.parts[i] !== C.parts[i]) diff++;
  const rep = new Set(C.replaced);
  const kept = A.parts.filter((_, i) => !rep.has(i));
  const finalHead = C.partsFinal.slice(0, kept.length);
  let fdiff = 0;
  for (let i = 0; i < kept.length; i++) if (kept[i] !== finalHead[i]) fdiff++;
  const added = C.parts.length - n;
  report.parts = { base: n, candidateFull: C.parts.length, replaced: rep.size, compoundParts: added, fullPrefixDifferent: diff,
    final: C.partsFinal.length, keptDifferent: fdiff, finalIsKeptPlusCompound: C.partsFinal.length === kept.length + added,
    hashKeptBase: hash(kept), hashKeptCandidate: hash(finalHead), netChange: C.partsFinal.length - n };
  check('parts: full prefix identical', diff === 0);
  check('parts: compacted = kept + compound parts', fdiff === 0 && C.partsFinal.length === kept.length + added);
}
// sign slots: the baseline's slots come first, unchanged (dead ones flagged), compound slots after
{
  let diff = 0;
  for (let i = 0; i < A.slots.length; i++) if (A.slots[i] !== C.slots[i]) diff++;
  const extra = C.slotFlags.slice(A.slots.length);
  report.slots = { base: A.slots.length, candidate: C.slots.length, firstDifferent: diff, dead: C.slotFlags.filter((f) => f === 'd').length,
    compoundSlots: extra.filter((f) => f === 'c').length, extraNotCompound: extra.filter((f) => f !== 'c').length };
  check('slots: existing slots identical', diff === 0 && report.slots.extraNotCompound === 0);
}
// sign rows: equal index by index except the dead slots' rows (zeroed in place)
{
  let diff = 0, diffZeroed = 0;
  for (let i = 0; i < A.signs.length; i++) {
    if (A.signs[i] === C.signs[i]) continue;
    diff++;
    const a = A.signs[i].split(','), c = C.signs[i].split(',');
    const same = a.every((v, k) => k === 6 || k === 7 || v === c[k]);
    if (same && +c[6] === 0 && +c[7] === 0) diffZeroed++;
  }
  report.signs = { base: A.signs.length, candidate: C.signs.length, different: diff, differentOnlyByDeadZeroing: diffZeroed, deadRowsReported: C.deadRows,
    compoundRows: C.signs.length - A.signs.length, lanternsSame: hash(A.lanterns) === hash(C.lanterns) };
  check('signs: only dead rows differ', diff === diffZeroed && diff === C.deadRows && report.signs.lanternsSame);
}
// lights and colliders as multisets
const multiset = (a, c) => {
  const count = new Map();
  for (const r of a) count.set(r, (count.get(r) || 0) + 1);
  const onlyC = [];
  for (const r of c) { const k = count.get(r) || 0; if (k > 0) count.set(r, k - 1); else onlyC.push(r); }
  const onlyA = [];
  for (const [r, k] of count) for (let j = 0; j < k; j++) onlyA.push(r);
  return { onlyA, onlyC };
};
{
  const { onlyA, onlyC } = multiset(A.lights, C.lights);
  const sa = new Set(onlyA), sc = new Set(onlyC);
  const ka = A.lights.filter((r) => !sa.has(r)), kc = C.lights.filter((r) => !sc.has(r));
  const cs = C.compound || {};
  report.lights = { base: A.lights.length, candidate: C.lights.length, onlyBase: onlyA.length, onlyCandidate: onlyC.length,
    deadDropped: cs.signs ? cs.signs.deadLightsDropped : null, compoundSignLights: cs.signs ? cs.signs.compoundLights : null,
    sharedOrderSame: ka.length === kc.length && ka.every((r, i) => r === kc[i]) };
  check('lights: only dead-slot lights dropped and compound sign lights added', report.lights.sharedOrderSame && (!cs.signs || (onlyA.length === cs.signs.deadLightsDropped && onlyC.length === cs.signs.compoundLights)));
}
{
  const { onlyA, onlyC } = multiset(A.colliders, C.colliders);
  const cs = C.compound || {};
  report.colliders = { base: A.colliders.length, candidate: C.colliders.length, onlyBase: onlyA.length, onlyCandidate: onlyC.length,
    replacedColliders: cs.colliders ? cs.colliders.replaced : null, compoundColliders: cs.colliders ? cs.colliders.added : null };
  check('colliders: only replaced removed and compound added', !cs.colliders || (onlyA.length === cs.colliders.replaced && onlyC.length === cs.colliders.added));
}
for (const k of ['crowd', 'cars', 'airPaths']) {
  if (A[k] === null || C[k] === null) { report[k] = 'not in both dumps'; continue; }
  report[k] = { base: hash(A[k]), candidate: hash(C[k]) };
  check(k + ' identical', A[k] === C[k]);
}
for (const k of ['text', 'infill', 'fixedPrefix']) {
  report[k] = { base: hash(A[k]), candidate: hash(C[k]) };
  check(k + ' identical', A[k] === C[k]);
}
report.stats = { base: { signs: A.signStats, buildings: A.buildingStats }, candidate: { signs: C.signStats, buildings: C.buildingStats } };
console.log(JSON.stringify(report, null, 1));
console.log(ok ? 'ALL CHECKS PASS' : 'SOME CHECKS FAIL');
process.exit(ok ? 0 : 1);
