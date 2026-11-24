// Yuzhong street runs as buildRuns (trafficCars.js) gives them, on the CPU heights (no colliders: landmark disks block).
import fs from 'node:fs';
import { HeightCache } from '../../I-029-south-face/measure/hcpu.mjs';
const W = await import('../../../../../source/src/world.js');
let T = null;
try { T = await import('../../../../../source/src/trafficCars.js'); } catch (e) { console.log('import trafficCars failed:', String(e).slice(0, 200)); }
const world = new W.World();
const hc = new HeightCache();
world.heightAt = (x, z) => hc.heightAt(x, z);
world.heights = hc.H;
world._resolveRoutes(); world._buildLots(); world._resolvePoses();
world.collidersNear = null;
if (T && T.buildRuns) {
  const runs = T.buildRuns(world);
  const yz = runs.filter((r) => r.district === 1);
  console.log('runs total', runs.length, 'yuzhong', yz.length, 'length', Math.round(yz.reduce((a, r) => a + r.len, 0)));
  fs.writeFileSync('runs.json', JSON.stringify(yz.map((r) => ({ ax: +r.ax.toFixed(2), az: +r.az.toFixed(2), bx: +(r.ax + r.dx * r.len).toFixed(2), bz: +(r.az + r.dz * r.len).toFixed(2), len: +r.len.toFixed(1) }))));
}
