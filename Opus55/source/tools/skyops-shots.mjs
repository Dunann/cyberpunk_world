// Sky operations (I-009) held-out captures (needs out/dev.html). Never use eval poses here.
//   node tools/skyops-shots.mjs --cams <file.json> [--ids H1,Q1] [--out out/r3] [--profile opus55-I009]
// Camera entries:
//   {"id", "cam": [x, y, z, yaw, pitch, t]}                 a fixed camera
//   {"id", "ship": k, "dist": m, "bearing": deg, "dy": m, "t"} placed by rule relative to airship k at time t:
//        at horizontal distance `dist` from the hull centre, `bearing` degrees from the ship's heading (0 = ahead,
//        90 = abeam to the left, 180 = astern), `dy` metres above the hull axis, looking at the hull centre
//   {"id", "site": true, "from": [x, y, z], "t"}             looking from a point at the launch pad (deck + 60 m)
// Prints the GPU errors at the end.
import fs from 'node:fs';
import path from 'node:path';
import { launch, root } from './launch.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const W = +opt('w', 2560), H = +opt('h', 1440);
const cams = JSON.parse(fs.readFileSync(path.resolve(opt('cams', '')), 'utf8'));
const only = (opt('ids', '') || '').split(',').filter(Boolean);
const out = path.resolve(root, opt('out', 'out/skyops'));
fs.mkdirSync(out, { recursive: true });
const { page, close } = await launch({ profileName: opt('profile', 'opus55-I009'), query: `w=${W}&h=${H}&noadapt&nooverlay&freeze&quality=high` });
await page.evaluate(() => window.__frames(5));

for (const c of cams) {
  if (only.length && !only.includes(c.id)) continue;
  const pose = await page.evaluate((c) => {
    const s = window.__skyops, w = window.__ctx.world;
    let x, y, z, yaw, pitch, t;
    if (c.cam) [x, y, z, yaw, pitch, t] = c.cam;
    else {
      t = c.t;
      let tx, ty, tz;
      if (c.ship !== undefined) {
        const st = {};
        window.__skyopsLayout.shipState(s.ships[c.ship], t, st);
        const hl = Math.hypot(st.fx, st.fz) || 1, hx = st.fx / hl, hz = st.fz / hl;
        const b = c.bearing * Math.PI / 180;
        // rotate the heading toward the left side (hz, -hx) by the bearing
        const dx = hx * Math.cos(b) + hz * Math.sin(b), dz = hz * Math.cos(b) - hx * Math.sin(b);
        x = st.x + dx * c.dist; z = st.z + dz * c.dist; y = st.y + c.dy;
        tx = st.x; ty = st.y; tz = st.z;
      } else {
        [x, y, z] = c.from;
        tx = s.site.x; ty = s.plan.deckY + 60; tz = s.site.z;
      }
      y = Math.max(y, w.heightAt(x, z) + 2);
      const ddx = tx - x, ddy = ty - y, ddz = tz - z;
      yaw = Math.atan2(-ddx, -ddz); pitch = Math.atan2(ddy, Math.hypot(ddx, ddz));
    }
    window.__ctx.time = t;
    window.__setCam(x, y, z, yaw, pitch);
    return [x, y, z, yaw, pitch, t].map((v) => +v.toFixed(4));
  }, c);
  await page.evaluate(() => window.__frames(48));
  const b64 = await page.evaluate(() => window.__capture('image/jpeg'));
  const file = path.join(out, `${c.id}.jpg`);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log(`  ${c.id}  cam ${pose.join(',')}  -> ${file}`);
}
const errors = await page.evaluate(() => window.__errors());
if (errors.length) console.log('GPU errors:\n ' + [...new Set(errors)].join('\n '));
else console.log('no GPU errors');
await close();
