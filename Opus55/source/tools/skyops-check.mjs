// Sky operations (I-009 airships, I-020) checks in the real app (needs out/dev.html):
//   node tools/skyops-check.mjs info                     placement chosen by the rules (ship altitudes, laps)
//   node tools/skyops-check.mjs targets --poses-file ../eval/poses-v1.json
//        review-1 fix 2: projected hull length (px) at each pose, occlusion tested with the depth buffer
//   node tools/skyops-check.mjs burst --cam x,y,z,yaw,pitch,t --name foo [--out dir]
//        4 consecutive frames with the scene animating (temporal check)
//   node tools/skyops-check.mjs beams                   searchlight rule over 600 s: share of time each ship's beam
//        is lit, and the most beams lit at once (judge fix 2: at most one)
//   options: --profile name (Chrome profile), --w 2560 --h 1440
import fs from 'node:fs';
import path from 'node:path';
import { launch, root } from './launch.mjs';

const args = process.argv.slice(2);
const mode = args[0] || 'info';
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const W = +opt('w', 2560), H = +opt('h', 1440);
const { page, close } = await launch({ profileName: opt('profile', 'opus55-I009'), query: `w=${W}&h=${H}&noadapt&nooverlay&freeze&quality=high` });
await page.evaluate(() => window.__frames(5));

if (mode === 'info') {
  const info = await page.evaluate(() => {
    const s = window.__skyops;
    return {
      shipTriangles: s.shipTris,
      ships: s.ships.map((q) => ({ name: q.name, alt: q.alt, towerTop: +q.top.toFixed(1), bands: q.bands, lap: +q.track.length.toFixed(0), phase: +q.phase.toFixed(1), dir: q.dir })),
    };
  });
  console.log(JSON.stringify(info, null, 2));
} else if (mode === 'targets') {
  const set = JSON.parse(fs.readFileSync(path.resolve(root, opt('poses-file', '../eval/poses-v1.json')), 'utf8'));
  const rows = [];
  for (const p of set) {
    await page.evaluate((q) => {
      const w = window.__ctx.world;
      const y = q.rel ? w.heightAt(q.pos[0], q.pos[2]) + q.pos[1] : q.pos[1];
      const dx = q.target[0] - q.pos[0], dy = q.target[1] - y, dz = q.target[2] - q.pos[2];
      window.__ctx.time = q.t;
      window.__setCam(q.pos[0], y, q.pos[2], Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
    }, p);
    await page.evaluate(() => window.__frames(12));
    const m = await page.evaluate(() => window.__skyopsMetrics());
    const bestShip = m.reduce((a, b) => (b.lengthPx > a.lengthPx ? b : a));
    const target = bestShip.lengthPx >= 150;
    rows.push({ id: p.id, t: p.t, ship: `${bestShip.name} ${bestShip.lengthPx}`, target, all: m });
    console.log(`${p.id}  t=${p.t}  hull ${String(bestShip.lengthPx).padStart(5)} px (${bestShip.name})  -> ${target ? 'TARGET' : '-'}`);
  }
  if (opt('json', '')) fs.writeFileSync(path.resolve(root, opt('json', '')), JSON.stringify(rows, null, 2));
} else if (mode === 'stats') {
  // GPU ms per pass at custom cameras, scene animating for 150 frames from time t (repeat --cam to measure several)
  const cams = args.map((a, i) => (a === '--cam' ? args[i + 1] : null)).filter(Boolean);
  for (const cs of cams) {
    const [x, y, z, yaw, pitch, t] = cs.split(',').map(Number);
    await page.evaluate((a) => { window.__ctx.frozen = true; window.__ctx.time = a[5]; window.__setCam(a[0], a[1], a[2], a[3], a[4]); }, [x, y, z, yaw, pitch, t]);
    await page.evaluate(() => window.__frames(30));
    await page.evaluate(() => { window.__gpuStats(); window.__ctx.frozen = false; });
    await page.evaluate(() => window.__frames(150));
    const s = await page.evaluate(() => window.__gpuStats());
    console.log(`${cs}\n  total ${s.total.toFixed(2)} ms   skyops-gbuffer ${s['skyops-gbuffer'] ?? '-'}`);
  }
} else if (mode === 'beams') {
  const r = await page.evaluate(async () => {
    const s = window.__skyops, ctx = window.__ctx;
    // 600 s at 60 fps: share of time lit, most beams at once, and the largest frame-to-frame change of a lit beam's
    // weight and hit point (smooth motion: both should be small)
    const on = [0, 0, 0], prevW = [0, 0, 0], prevP = [0, 0, 0, 0, 0, 0];
    let maxOn = 0, n = 0, maxDW = 0, maxDP = 0;
    ctx.dt = 1 / 60;
    for (let f = 0; f < 36000; f++) {
      const t = f / 60;
      ctx.time = t; s.update(ctx);
      let k = 0;
      for (let i = 0; i < 3; i++) {
        const B = s.beam, o = i * 8, wgt = B[o + 3];
        if (wgt > 0.05) { on[i]++; k++; }
        if (f > 0) {
          maxDW = Math.max(maxDW, Math.abs(wgt - prevW[i]));
          if (wgt > 0.05 && prevW[i] > 0.05) maxDP = Math.max(maxDP, Math.hypot(B[o + 4] - prevP[i * 2], B[o + 6] - prevP[i * 2 + 1]));
        }
        prevW[i] = wgt; prevP[i * 2] = B[o + 4]; prevP[i * 2 + 1] = B[o + 6];
      }
      maxOn = Math.max(maxOn, k); n++;
    }
    return { share: on.map((v) => +(v / n).toFixed(3)), maxOn, maxWeightStepPerFrame: +maxDW.toFixed(4), maxHitStepPerFrameM: +maxDP.toFixed(2) };
  });
  console.log(JSON.stringify(r));
} else if (mode === 'burst') {
  const [x, y, z, yaw, pitch, t] = opt('cam', '0,300,0,0,0,0').split(',').map(Number);
  const out = path.resolve(root, opt('out', 'out/skyops'));
  fs.mkdirSync(out, { recursive: true });
  await page.evaluate((a) => { window.__ctx.time = a[5]; window.__setCam(a[0], a[1], a[2], a[3], a[4]); }, [x, y, z, yaw, pitch, t]);
  await page.evaluate(() => window.__frames(48));
  await page.evaluate(() => { window.__ctx.frozen = false; window.__ctx.fixedDt = 1 / 60; });
  for (let k = 0; k < 4; k++) {
    await page.evaluate((n) => window.__frames(n), k === 0 ? 30 : 1);
    const b64 = await page.evaluate(() => window.__capture('image/jpeg'));
    const file = path.join(out, `${opt('name', 'burst')}-${k}.jpg`);
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    console.log('  saved', file);
  }
}
const errors = await page.evaluate(() => window.__errors());
if (errors.length) console.log('GPU errors:\n ' + [...new Set(errors)].join('\n '));
await close();
