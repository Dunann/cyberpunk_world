// I-035 overlap audit on the CPU replay: sign relocation, layout boxes against parts, signs, lamps, tracks.
//   node audit.mjs [--verbose]
import { world, B, layout, P, SRC, tracks } from './gen.mjs';
const DL = await import(SRC + 'decksLayout.js');
const SP = await import(SRC + 'signPlace.js');
const verbose = process.argv.includes('--verbose');
const stub = { find: () => ({ uv: [0, 0, 0, 0], n: 2, aspect: 1.5, vertical: false }) };
world.shared.decks.active = true;
const res = SP.placeSigns(world, stub, 2);
const R = res.reloc;
console.log('signs', res.signs.length, 'relocation:', JSON.stringify({ moved: R.moved, slid: R.slid, hung: R.hung, hungNoBracket: R.hungNoBracket, failed: R.failed, screensLifted: R.screensLifted, mounts: R.mounts.length }));
if (R.failedRows.length) console.log('failed rows', JSON.stringify(R.failedRows.slice(0, 8)));
const boxes = layout.boxes.map((b) => (b.beam ? DL.beamPieces(b, 0.6).map((q) => ({ ...q, tag: b.tag, hosts: b.hosts, m: b.m })) : [b])).flat();
const all = boxes.concat(R.mounts.map((m) => ({ ...m, tag: 'mount', hosts: [] })));
// spatial hash of layout boxes
const CS = 16, cell = new Map();
all.forEach((g, i) => {
  const r = Math.hypot(g.hx, g.hz);
  for (let a = Math.floor((g.x - r) / CS); a <= Math.floor((g.x + r) / CS); a++) for (let b = Math.floor((g.z - r) / CS); b <= Math.floor((g.z + r) / CS); b++) { const k = a * 100003 + b; if (!cell.has(k)) cell.set(k, []); cell.get(k).push(i); }
});
const near = (x, z, r) => { const s = new Set(); for (let a = Math.floor((x - r) / CS); a <= Math.floor((x + r) / CS); a++) for (let b = Math.floor((z - r) / CS); b <= Math.floor((z + r) / CS); b++) { const l = cell.get(a * 100003 + b); if (l) for (const i of l) s.add(i); } return s; };
const vOver = (a, b, m = 0) => !(a.y + a.hy <= b.y - b.hy + m || a.y - a.hy >= b.y + b.hy - m);
const hitAny = (b, tol = 0.02, skipTag = null) => { const o = []; for (const i of near(b.x, b.z, Math.hypot(b.hx, b.hz) + 1)) { const g = all[i]; if (skipTag && g.tag === skipTag) continue; if (vOver(b, g, tol) && DL.rectOverlap(b, g, -tol)) o.push(g); } return o; };

// 1. signs (with arms) against every layout box (mounts excluded: they touch their sign by design)
const signBox = (r) => {
  const Zx = r[4], Zz = r[5], Xx = r[5], Xz = -r[4];
  const w = r[6], h = r[7], depth = Math.max(r[20], 0.1), zoff = r[21], gap = Math.max(r[22], 0);
  return { x: r[0] + Xx * gap / 2 + Zx * zoff, z: r[2] + Xz * gap / 2 + Zz * zoff, y: r[1], hx: w / 2 + gap / 2, hy: h / 2, hz: depth / 2, a: Math.atan2(Xz, Xx) };
};
let signHits = 0; const sigEx = [];
const deckRows = res.deckRows || [0, 0];
for (let i = 0; i < res.signs.length; i++) {
  if (i >= deckRows[0] && i < deckRows[1]) continue;
  const h = hitAny(signBox(res.signs[i]), 0.02, 'mount');
  if (h.length) { signHits++; if (sigEx.length < 6) sigEx.push({ row: res.signs[i].slice(0, 8).map((v) => +v.toFixed(2)), tags: h.map((g) => g.tag) }); }
}
console.log('sign boxes entering a layout box:', signHits, verbose ? JSON.stringify(sigEx) : '');

// 2. layout boxes against building parts (hosts excluded), by tag
const nearParts = (() => {
  const c = new Map(), S = 25;
  for (let i = 0; i < P.count; i++) { const k = Math.floor(P.get(i, 0) / S) * 100003 + Math.floor(P.get(i, 2) / S); if (!c.has(k)) c.set(k, []); c.get(k).push(i); }
  return (x, z, r) => { const o = []; for (let a = Math.floor((x - r) / S); a <= Math.floor((x + r) / S); a++) for (let b = Math.floor((z - r) / S); b <= Math.floor((z + r) / S); b++) { const l = c.get(a * 100003 + b); if (l) o.push(...l); } return o; };
})();
const partHits = {}, partEx = [];
for (const b of all) {
  const hosts = new Set(b.hosts || []);
  for (const i of nearParts(b.x, b.z, Math.hypot(b.hx, b.hz) + 80)) {
    if (hosts.has(i)) continue;
    const pb = { x: P.get(i, 0), z: P.get(i, 2), y: P.get(i, 1) + P.get(i, 6) / 2, hx: P.get(i, 4), hy: P.get(i, 6) / 2, hz: P.get(i, 5), a: P.get(i, 3) };
    if (Math.hypot(pb.x - b.x, pb.z - b.z) > Math.hypot(pb.hx, pb.hz) + Math.hypot(b.hx, b.hz)) continue;
    if (!vOver(b, pb, 0.02) || !DL.rectOverlap(b, pb, -0.02)) continue;
    const k = b.tag + ' x part(mat ' + P.get(i, 16) + ', kind ' + P.get(i, 8) + ')';
    partHits[k] = (partHits[k] || 0) + 1;
    if (partEx.length < 40) partEx.push({ tag: b.tag, m: b.m, dims: [b.hx, b.hy, b.hz, b.a].map((v) => +(+v).toFixed(2)), hosts: b.hosts, box: [b.x, b.y, b.z].map((v) => +v.toFixed(1)), part: i, pdim: [P.get(i,0),P.get(i,2),P.get(i,4),P.get(i,5),P.get(i,3)].map((v)=>+v.toFixed(2)), mat: P.get(i, 16), kind: P.get(i, 8), py: [P.get(i, 1), P.get(i, 1) + P.get(i, 6)].map((v) => +v.toFixed(1)) });
    break;
  }
}
console.log('layout boxes entering a non-host part:', JSON.stringify(partHits));
if (verbose) console.log(JSON.stringify(partEx));

// 3. street lamps (replica): pole 0..7.1 m and head
let lampHits = 0;
for (const l of DL.lampReplica(world)) {
  for (const b of [{ x: l.x, z: l.z, y: l.g + 3.55, hx: 0.12, hy: 3.55, hz: 0.12, a: 0 }, { x: (l.x + l.hx) / 2, z: (l.z + l.hz) / 2, y: l.g + 7.08, hx: 1.05, hy: 0.14, hz: 0.25, a: Math.atan2(l.hz - l.z, l.hx - l.x) }]) if (hitAny(b, 0.0).length) { lampHits++; break; }
}
console.log('street lamps entering a layout box:', lampHits);

// 4. transit: guideway beams and pillars (approximate boxes)
let trackHits = 0;
for (const T of tracks) {
  const metro = T.kind === 'metro';
  for (let i = T.iA; i < T.iB; i++) {
    if (T.depthAt(i) > 3.5) continue;
    const x = (T.x[i] + T.x[i + 1]) / 2, z = (T.z[i] + T.z[i + 1]) / 2, y = (T.y[i] + T.y[i + 1]) / 2;
    const a = Math.atan2(T.tz[i], T.tx[i]);
    const beam = { x, z, a, hx: 3.1, hz: metro ? 5.3 : 2.5, y: y - (metro ? 1.6 : 0.8), hy: metro ? 1.6 : 0.8 };
    const h = hitAny(beam, 0.02).filter((g) => g.tag !== 'exit');
    if (h.length) { trackHits++; if (verbose && trackHits < 4) console.log('track hit', T.kind, i, h.map((g) => g.tag)); }
  }
}
console.log('track samples entering a layout box (exits excluded: they meet the station by design):', trackHits);
console.log('mounts', R.mounts.length, 'deck sign rows', deckRows);
