// Top-down debug map of the land-use plan (I-016): water, districts, existing lots, infill lots, built and park
// coverage, keep-out zones, bridges and transit lines. Also prints the plan statistics.
//   node tools/planmap.mjs [--file out/dev.html] [--out out/planmap.png] [--rect x0,z0,x1,z1] [--px 4]
import fs from 'node:fs';
import path from 'node:path';
import { launch, root } from './launch.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const file = opt('file', 'out/dev.html');
const outFile = path.resolve(root, opt('out', 'out/planmap.png'));
const rect = opt('rect', '-1000,-1500,2600,1400').split(',').map(Number);
const px = +opt('px', 4);

const { page, close } = await launch({ file, query: 'w=320&h=180&noadapt&nooverlay&freeze', profileName: opt('profile', 'opus55-I016-map') });
const res = await page.evaluate(async (a) => {
  const [x0, z0, x1, z1, S] = a;
  const w = window.__ctx.world;
  const W = Math.ceil((x1 - x0) / S), H = Math.ceil((z1 - z0) / S);
  const oc = new OffscreenCanvas(W, H);
  const g = oc.getContext('2d');
  const img = g.createImageData(W, H);
  const plan = w.plan;
  const DCOL = [[200, 80, 255], [255, 80, 80], [255, 210, 60], [80, 200, 255], [255, 140, 40], [255, 100, 200], [160, 255, 120], [120, 255, 200]];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + (i + 0.5) * S, z = z0 + (j + 0.5) * S;
    const h = w.heightAt(x, z);
    const o = (j * W + i) * 4;
    let c;
    if (h < 0.3) c = [20, 40, 90];
    else {
      const hx = w.heightAt(x + 4, z) - w.heightAt(x - 4, z), hz = w.heightAt(x, z + 4) - w.heightAt(x, z - 4);
      const slope = Math.hypot(hx, hz) / 8;
      const shade = 40 + Math.min(h, 200) * 0.5 - Math.min(slope, 1) * 30;
      c = [shade * 0.6, shade * 0.8, shade * 0.6];
      const d = w.districtAt(x, z);
      if (d.index >= 0 && d.weight > 0.05) {
        const k = d.weight >= 0.55 ? 0.55 : d.weight * 0.6;
        const dc = DCOL[d.index % DCOL.length];
        c = c.map((v, t) => v * (1 - k) + dc[t] * k * 0.7);
      }
      if (slope > 0.25) c = c.map((v) => v * 0.7);
    }
    if (plan) {
      const cv = plan.coverAt(x, z);
      if (cv.built > 0.5) c = [230, 150, 60];
      else if (cv.park > 0.5) {
        const PC = [[60, 200, 90], [60, 200, 200], [200, 200, 60], [120, 220, 120], [220, 120, 220], [90, 140, 90]];
        c = PC[cv.style % PC.length];
      }
      if (cv.blocked) c = c.map((v, t) => (t === 0 ? 255 : v * 0.5));
    }
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tp = (x, z) => [(x - x0) / S, (z - z0) / S];
  const rectPath = (L) => {
    const c = Math.cos(L.angle), s = Math.sin(L.angle);
    g.beginPath();
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const lx = u * L.w / 2, lz = v * L.d / 2;
      const [px2, pz2] = tp(L.x + lx * c - lz * s, L.z + lx * s + lz * c);
      g.lineTo(px2, pz2);
    }
    g.closePath();
  };
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  for (const L of w.lots) { rectPath(L); g.stroke(); }
  g.fillStyle = 'rgba(255,255,0,0.9)';
  for (const L of w.infillLots || []) { rectPath(L); g.fill(); }
  g.strokeStyle = 'rgba(255,0,0,0.9)'; g.lineWidth = 2;
  for (const b of w.bridges) { g.beginPath(); g.moveTo(...tp(b.ax, b.az)); g.lineTo(...tp(b.bx, b.bz)); g.stroke(); }
  g.strokeStyle = 'rgba(0,255,255,0.9)';
  for (const r of w.routes) { g.beginPath(); for (const p of r.dense) g.lineTo(...tp(p.x, p.z)); g.stroke(); }
  g.strokeStyle = 'rgba(255,0,255,0.9)';
  for (const L of w.landmarks) if (L.r > 0) { g.beginPath(); g.arc(...tp(L.x, L.z), L.r / S, 0, Math.PI * 2); g.stroke(); }
  // designed park layout: walks, plazas, ponds, lamps, gates
  if (plan && plan.layout) {
    const Ly = plan.layout;
    for (const wk of Ly.walks) {
      g.strokeStyle = wk.kind === 'path' ? 'rgba(255,255,255,0.75)' : 'rgba(255,200,80,1)'; g.lineWidth = wk.kind === 'path' ? 1 : 1.5;
      g.beginPath(); for (let i = 0; i < wk.pts.length; i += 2) g.lineTo(...tp(wk.pts[i], wk.pts[i + 1])); g.stroke();
    }
    g.fillStyle = 'rgba(255,120,40,0.9)';
    for (const pl of Ly.plazas) { g.beginPath(); g.arc(...tp(pl.x, pl.z), Math.max(pl.r / S, 1), 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(40,120,255,0.95)';
    for (const pd of Ly.ponds) { g.beginPath(); g.arc(...tp(pd.x, pd.z), pd.r / S, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(255,0,0,1)';
    for (const gt of Ly.gates) g.fillRect(...tp(gt.x - 4, gt.z - 4), 3, 3);
  }
  // grid labels every 500 m
  g.fillStyle = 'white'; g.font = '10px sans-serif';
  for (let x = Math.ceil(x0 / 500) * 500; x < x1; x += 500) for (let z = Math.ceil(z0 / 500) * 500; z < z1; z += 500) {
    const [a2, b2] = tp(x, z); g.fillRect(a2 - 1, b2 - 1, 3, 3); g.fillText(`${x},${z}`, a2 + 3, b2 - 3);
  }
  const blob = await oc.convertToBlob({ type: 'image/png' });
  const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
  const sh = w.shared;
  const extra = plan ? { unlitLawn: plan.unlitLawn(), fixedPrefix: sh.fixedPrefix, planRunLotHits: sh.planRunLotHits, garden: sh.garden, infill: sh.infillStats, parkTrees: sh.parkTrees, infillStreetLamps: sh.infillStreetLamps, infillRoadRuns: sh.infillRoadRuns, signs: sh.signStats, lights: window.__ctx.lights.count, silk: plan.silk, avenues: plan.avenues.map((v) => [v.ax, v.az, v.bx, v.bz].map(Math.round)) } : null;
  return { b64, stats: plan ? { ...plan.stats, ...extra } : null, lots: w.lots.length };
}, [...rect, px]);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, Buffer.from(res.b64, 'base64'));
console.log('saved', outFile, 'lots', res.lots);
if (res.stats) console.log(JSON.stringify(res.stats, null, 2));
await close();
