// Tower phrase show (I-014): prints the chosen phrases and captures held-out views (never the eval poses).
//   node tools/text-views.mjs [--file out/dev.html] [--out out/held-v2] [--prefix cand] [--profile name]
//     [--phrases] views chosen by rule for every phrase of this build (water level, water-side aerial, obliques)
//     [--fixed]   the fixed held-out cameras (riverside, bund, aerial, far, two moving bursts)
//     [--cams file.json] instead of --phrases, the phrase views saved by an earlier run (to compare builds)
//     [--w 2560 --h 1440] [--t 113]
// Phrase views, all relative to a phrase's centre C (mean face centre at the band height) and its mean normal D:
//   water:  C + D x (nearest water distance + 250 m), 15 m above the water, looking at C
//   near:   C + D x 200 m, at the band height (checks stroke quality up close)
//   aerial: C + D x 600 m, 250 m up, looking at C
//   obl+/obl-: the aerial position turned 40 degrees about C (50 degrees from the face plane)
//   graze: the aerial position turned 72 degrees about C (about 18 degrees from the face plane)
import fs from 'node:fs';
import path from 'node:path';
import { launch, root } from './launch.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const W = +opt('w', 2560), H = +opt('h', 1440), T = +opt('t', 113);
const out = path.resolve(root, opt('out', 'out/held-v2'));
const prefix = opt('prefix', 'cand');
fs.mkdirSync(out, { recursive: true });

const { page, close } = await launch({ file: opt('file', 'out/dev.html'), profileName: opt('profile', 'opus55-I014b'),
  query: `w=${W}&h=${H}&noadapt&nooverlay&freeze&quality=high` });
const tt = await page.evaluate(() => window.__ctx.world.shared.towerText);
console.log(JSON.stringify(tt.stats));
for (const p of tt.phrases || []) console.log(`  ${p.text}  ${p.district}  centre (${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)})  normal (${p.D[0].toFixed(2)}, ${p.D[1].toFixed(2)})  g ${p.g.toFixed(1)} m`);
for (const g of tt.glyphs) console.log(`    ${g.phrase}[${g.index}] ${g.char} (${g.x}, ${g.y}, ${g.z}) g ${g.g} ${g.district}`);

const look = (x, y, z, tx, ty, tz) => { const dx = tx - x, dy = ty - y, dz = tz - z; return [x, y, z, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))]; };
const turn = (C, D, dist, deg, y) => {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const dx = D[0] * c - D[1] * s, dz = D[0] * s + D[1] * c;
  return look(C.x + dx * dist, y, C.z + dz * dist, C.x, C.y, C.z);
};
async function shot(name, cam, t = T, frames = 48) {
  await page.evaluate((a, tm) => { window.__ctx.time = tm; window.__setCam(...a); }, cam, t);
  await page.evaluate((n) => window.__frames(n), frames);
  const b64 = await page.evaluate(() => window.__capture('image/jpeg'));
  const file = path.join(out, `${prefix}-${name}.jpg`);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log('  saved', file);
}

if (args.includes('--phrases') || opt('cams', '')) {
  let views = [];
  if (opt('cams', '')) views = JSON.parse(fs.readFileSync(path.resolve(root, opt('cams', '')), 'utf8'));
  else {
    (tt.phrases || []).forEach((p, k) => {
      const tag = `p${k}`;
      views.push({ name: `${tag}-water`, cam: turn(p, p.D, p.wdist + 250, 0, 15) });
      views.push({ name: `${tag}-near`, cam: turn(p, p.D, 200, 0, p.y) });
      views.push({ name: `${tag}-aerial`, cam: turn(p, p.D, 600, 0, 250) });
      views.push({ name: `${tag}-oblR`, cam: turn(p, p.D, 600, 40, 250) });
      views.push({ name: `${tag}-oblL`, cam: turn(p, p.D, 600, -40, 250) });
      views.push({ name: `${tag}-graze`, cam: turn(p, p.D, 600, 72, 250) });
    });
    fs.writeFileSync(path.join(out, `${prefix}-phrase-views.json`), JSON.stringify(views));
  }
  for (const v of views) await shot(v.name, v.cam);
}
if (args.includes('--fixed')) {
  // the held-out cameras of round 1 (positions from DEVIATIONS.md), not eval poses or eval times
  const fixed = [
    ['river', [-250, 8, 620, 0, 0.15]],
    ['bund', [2200, 10, -1550, -Math.PI / 2, 0.12]],
    ['aerial', look(1200, 380, -300, 150, 100, -60)],
    ['far', look(-2400, 230, 2300, -750, 150, -150)],
  ];
  for (const [name, cam] of fixed) for (const t of [113, 33]) await shot(`${name}-t${t}`, cam, t);
  // moving bursts: the camera slides 3 m per frame, one frame apart
  const bursts = [['burst800', look(2150, 15, -600, 3000, 120, -600)], ['burst1700', look(-900, 250, 1900, -750, 120, -150)]];
  for (const [name, cam] of bursts) {
    for (let k = 0; k < 4; k++) await shot(`${name}-${k}`, [cam[0] + 3 * k, cam[1], cam[2], cam[3], cam[4]], T, k === 0 ? 30 : 1);
  }
}
const errors = await page.evaluate(() => window.__errors());
if (errors.length) console.log('GPU errors:\n ' + [...new Set(errors)].join('\n '));
await close();
