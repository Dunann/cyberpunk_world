// CPU replay of world + buildings generation for a source tree, then the I-035 deck layout.
//   node gen.mjs [srcDir] [--out file.json]
import fs from 'node:fs';
import { HeightCache } from '../hcpu.mjs';
const args = process.argv.slice(2);
const srcDir = (args[0] && !args[0].startsWith('--')) ? args[0] : 'C:/Users/pdunc/cyberpunk_world/.claude/worktrees/agent-a80fb7928c4dd136e/Opus55/source/src/';
const SRC = 'file:///' + srcDir.replace(/\\/g, '/').replace(/^\/+/, '');
const W = await import(SRC + 'world.js');
const { rng } = await import(SRC + 'math.js');
const G = await import(SRC + 'buildings_gen.js');
const LMK = await import(SRC + 'buildings_landmarks.js');
const INF = await import(SRC + 'buildings_infill.js');
const PL = await import(SRC + 'plan.js');
export const world = new W.World();
const hc = new HeightCache();
world.heightAt = (x, z) => hc.heightAt(x, z);
world.heights = hc.H;
world._resolveRoutes(); world._buildLots(); world._resolvePoses();
world.plan = PL.buildPlan(world); world.infillLots = world.plan.infill;
const { market } = LMK.prepareLots(world);
export const B = new G.Builder(world, 2);
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
B.skyRange = [p0, p1]; B.walkRange = [p1, B.P.count];
LMK.finishComplex(B, world);
B.infill = INF.genInfill(B, world);
// building colliders (as buildings.js)
const P = B.P;
for (const i of P.solid) {
  const g = (f) => P.get(i, f);
  const hw = g(4), hd = g(5), h = g(6);
  if (Math.min(hw, hd) < 1 || h < 2) continue;
  world.addCollider(g(0), g(1) + h / 2, g(2), hw, h / 2, hd, g(3));
}
export const TL = await import(SRC + 'transitLayout.js');
export const tracks = TL.buildTracks(world);
let layout = null;
try {
  const DL = await import(SRC + 'decksLayout.js');
  const lamps = DL.lampReplica(world);
  layout = DL.buildDeckLayout(world, B, 2, { lamps, tracks });
  world.shared.decks = layout;
  if (process.argv[1].endsWith('gen.mjs')) {
    console.log(JSON.stringify(layout.stats, null, 1));
    const o = args.indexOf('--out');
    if (o >= 0) fs.writeFileSync(args[o + 1], JSON.stringify({ boxes: layout.boxes, people: layout.people, lights: layout.lights }));
  }
} catch (e) { if (!String(e.message).includes('Cannot find module')) throw e; }
export { layout, P, W, SRC };
