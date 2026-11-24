// CPU replay of world + buildings generation (no GPU). Heights from the CPU port hcpu.mjs.
import fs from 'node:fs';
import { HeightCache } from '../hcpu.mjs';
const SRC = 'file:///C:/Users/pdunc/cyberpunk_world/Opus55/source/src/';
const W = await import(SRC + 'world.js');
const { rng } = await import(SRC + 'math.js');
const G = await import(SRC + 'buildings_gen.js');
const LMK = await import(SRC + 'buildings_landmarks.js');
const INF = await import(SRC + 'buildings_infill.js');
const PL = await import(SRC + 'plan.js');
const world = new W.World();
const hc = new HeightCache();
world.heightAt = (x, z) => hc.heightAt(x, z);
world.heights = hc.H;
world._resolveRoutes(); world._buildLots(); world._resolvePoses();
try { world.plan = PL.buildPlan(world); world.infillLots = world.plan.infill; } catch (e) { console.log('plan failed', e.message); }
const { market } = LMK.prepareLots(world);
const B = new G.Builder(world, 2);
const R = rng(9137);
let clockDone = false, clockLot = null, best = 1e9;
for (const L of world.lots) if (L.type === W.DT.BUND && L.waterDist < 125) { const d = Math.abs(L.z + 1080); if (d < best) { best = d; clockLot = L; } }
LMK.genLandmarks(B, R, world);
LMK.genMarket(B, R, world, market);
for (const L of world.lots) {
  const r = rng(L.seed);
  switch (L.type) {
    case W.DT.HILLSIDE: G.genHillside(B, r, L); break;
    case W.DT.URBAN: G.genUrban(B, r, L); break;
    case W.DT.BUND: G.genBund(B, r, L, L === clockLot && !clockDone); if (L === clockLot) clockDone = true; break;
    case W.DT.STEPPE: G.genSteppe(B, r, L); break;
    case W.DT.CBD: G.genCBD(B, r, L); break;
  }
}
const p0 = B.P.count;
B.bridges = G.skybridges(B, rng(5150));
const p1 = B.P.count;
B.walkways = G.walkways(B, rng(5151));
const p2 = B.P.count;
LMK.finishComplex(B, world);
B.infill = INF.genInfill(B, world);
const P = B.P;
console.log('parts', P.count, 'bridges', B.bridges, 'walkways', B.walkways, 'lots', world.lots.length, 'infill', world.infillLots.length, 'slots', world.signSlots.length);
// dump parts: x,y0,z,a,hw,hd,h,kind,prm,mat,flags,taper
const N = P.count, F = 12, out = new Float32Array(N * F);
for (let i = 0; i < N; i++) { const g = (f) => P.get(i, f); out.set([g(0), g(1), g(2), g(3), g(4), g(5), g(6), g(8), g(9), g(16), g(15), g(10)], i * F); }
fs.writeFileSync('parts.bin', Buffer.from(out.buffer));
fs.writeFileSync('meta.json', JSON.stringify({ N, F, sky: [p0, p1], walk: [p1, p2], hillPods: B.hillPods.map((p) => ({ x: p.L.x, z: p.L.z, w: p.L.w, d: p.L.d, a: p.L.angle, gMin: p.L.gMin, gMax: p.L.gMax, top: p.top, minTop: p.minTop })), lots: world.lots.map((L) => ({ x: L.x, z: L.z, w: L.w, d: L.d, a: L.angle, di: L.district, t: L.type, gMin: L.gMin, gMax: L.gMax })), slots: world.signSlots, poses: world.poses.map((p) => p.resolved) }));
// transit tracks (monorail + metro) for occlusion and siting
const TL = await import(SRC + 'transitLayout.js');
const tracks = TL.buildTracks(world);
fs.writeFileSync('tracks.json', JSON.stringify(tracks.map((T) => ({ kind: T.kind, iA: T.iA, iB: T.iB, liz: T.lizibaIndex, x: Array.from(T.x), z: Array.from(T.z), y: Array.from(T.y), g: Array.from(T.g), tx: Array.from(T.tx), tz: Array.from(T.tz), stations: T.stations.map((s) => ({ i: s.i, s: s.s, name: s.name, liziba: !!s.liziba })), stationLen: T.cfg.stationLen }))));
console.log('tracks', tracks.map((T) => T.kind + ' stations ' + T.stations.map((s) => s.name + '@' + Math.round(T.x[s.i]) + ',' + Math.round(T.z[s.i]) + ' y' + Math.round(T.y[s.i]) + ' g' + Math.round(T.g[s.i])).join('; ')).join('\n'));
// signs (stub atlas: placement draws do not depend on the atlas content)
const SP = await import(SRC + 'signPlace.js');
const stub = { find: () => ({ uv: [0, 0, 0, 0], n: 2, aspect: 1.5, vertical: false }) };
const res = SP.placeSigns(world, stub, 2);
const SF = res.signs.length ? res.signs[0].length : 24;
const sb = new Float32Array(res.signs.length * 8);
res.signs.forEach((s, i) => sb.set([s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7]].concat([]).slice(0, 8), i * 8));
const depth = new Float32Array(res.signs.length); res.signs.forEach((s, i) => { depth[i] = s[20]; });
fs.writeFileSync('signs.bin', Buffer.from(sb.buffer)); fs.writeFileSync('signdepth.bin', Buffer.from(depth.buffer));
console.log('signs', res.signs.length, 'screens', res.signs.filter((s) => s[3] === 4).length, 'lightC', res.lightC.length);
fs.writeFileSync('screens.json', JSON.stringify(res.signs.filter((s) => s[3] === 4).map((s) => ({ x: s[0], y: s[1], z: s[2], nx: s[4], nz: s[5], w: s[6], h: s[7] }))));
// street lamps (candidates of terrainLamps with the lampValid rule approximated on the CPU)
const lamps = [];
W.DISTRICTS.forEach((D, di) => {
  if (!D.block) return;
  const ext = Math.max(D.rx, D.rz) * 1.05, nl = Math.ceil(ext / D.block), n = Math.max(Math.round(D.block / 34), 1), sp = D.block / n, nj = Math.ceil(ext / sp);
  const ca = Math.cos(D.angle), sa = Math.sin(D.angle);
  for (let axis = 0; axis < 2; axis++) for (let line = -nl; line <= nl; line++) for (let j = -nj; j < nj; j++) {
    const along = (j + 0.5) * sp, off0 = line * D.block;
    const lx0 = axis ? off0 : along, lz0 = axis ? along : off0;
    if ((lx0 / D.rx) ** 2 + (lz0 / D.rz) ** 2 > 1.05) continue;
    const side = ((j + line) % 2 === 0) ? 1 : -1;
    const off = off0 + side * (D.road * 0.5 + 0.7);
    const lx = axis ? off : along, lz = axis ? along : off;
    const x = D.cx + lx * ca - lz * sa, z = D.cz + lx * sa + lz * ca;
    const dw = world.districtAt(x, z);
    if (dw.index !== di || dw.weight <= 0.55 || world.waterDist(x, z) <= 14) continue;
    lamps.push([+x.toFixed(2), +z.toFixed(2), di, axis, line, +world.heightAt(x, z).toFixed(2)]);
  }
});
fs.writeFileSync('lamps.json', JSON.stringify(lamps));
console.log('lamps', lamps.length);
