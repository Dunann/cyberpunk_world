// Fresh judging cameras for I-020 (airships only), placed by the rule declared in the spec before any capture:
//   node tools/airship-cams.mjs [--out <poses.json>] [--html out/dev.html]
// Needs a build with the airships (out/dev.html): the ship positions and the terrain come from the running app.
//
// Rule (seed 20261124, 8 cameras S01-S08):
//   - camera k (0..7) looks at ship k mod 3, at horizontal distance d = 300 m for even k and 700 m for odd k, so each
//     ship gets both distances;
//   - drawn per attempt, in this order: time t uniform in [0, 360) s; bearing uniform in [60, 120] deg off the ship's
//     heading; the side (left or right of the ship, 50/50); height difference uniform in [-150, +50] m from the hull
//     axis;
//   - the camera stands at that bearing and distance from the hull centre at time t and looks at the hull centre;
//   - line of sight: 101 points from the camera to the hull centre; if the terrain at any point is less than 2 m below
//     it (the camera itself included), the attempt is rejected and redrawn.
// Writes a poses file for capture.mjs --poses-file: [{id, zone, name, pos, rel: false, target, t}].
// The images of these cameras are for the judges only: do not look at them or tune anything on them.
import fs from 'node:fs';
import path from 'node:path';
import { launch, root } from './launch.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const SEED = 20261124, N = 8, DISTS = [300, 700];

// mulberry32
let s = SEED >>> 0;
const rand = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const U = (a, b) => a + (b - a) * rand();

const { page, close } = await launch({ file: opt('html', 'out/dev.html'), profileName: opt('profile', 'opus55-I020'), query: 'w=640&h=360&noadapt&nooverlay&freeze&quality=high' });
await page.evaluate(() => window.__frames(5));

// Camera and target for ship `ship` at time t, `bearing` deg off its heading toward its left (side +1) or right
// (side -1), d m away horizontally, dy m above the hull axis; and whether the terrain blocks the line of sight.
const place = (q) => page.evaluate((q) => {
  const sk = window.__skyops, w = window.__ctx.world, st = {};
  window.__skyopsLayout.shipState(sk.ships[q.ship], q.t, st);
  const hl = Math.hypot(st.fx, st.fz) || 1, hx = st.fx / hl, hz = st.fz / hl;
  const b = q.side * q.bearing * Math.PI / 180;
  // rotate the heading toward the left side (hz, -hx) by b
  const dx = hx * Math.cos(b) + hz * Math.sin(b), dz = hz * Math.cos(b) - hx * Math.sin(b);
  const pos = [st.x + dx * q.d, st.y + q.dy, st.z + dz * q.d], target = [st.x, st.y, st.z];
  let blocked = false;
  for (let j = 0; j <= 100 && !blocked; j++) {
    const f = j / 100;
    const x = pos[0] + (target[0] - pos[0]) * f, y = pos[1] + (target[1] - pos[1]) * f, z = pos[2] + (target[2] - pos[2]) * f;
    if (w.heightAt(x, z) > y - 2) blocked = true;
  }
  return { name: sk.ships[q.ship].name, pos, target, blocked };
}, q);

const cams = [];
let rejected = 0;
for (let k = 0; k < N; k++) {
  const ship = k % 3, d = DISTS[k % 2];
  for (let attempt = 0; ; attempt++) {
    if (attempt > 200) throw new Error(`camera ${k}: no clear line of sight in 200 attempts`);
    const q = { ship, d, t: U(0, 360), bearing: U(60, 120), side: rand() < 0.5 ? 1 : -1, dy: U(-150, 50) };
    const r = await place(q);
    if (r.blocked) { rejected++; continue; }
    const r1 = (v) => Math.round(v * 10) / 10;
    const id = 'S' + String(k + 1).padStart(2, '0');
    cams.push({
      id, zone: 'S', name: `${r.name}-${d}m-${q.side > 0 ? 'left' : 'right'}-${Math.round(q.bearing)}deg`,
      pos: r.pos.map(r1), rel: false, target: r.target.map(r1), t: Math.round(q.t * 1000) / 1000,
    });
    break;
  }
}
await close();

const out = path.resolve(root, opt('out', 'out/airship-cams.json'));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, '[\n' + cams.map((c) => '  ' + JSON.stringify(c)).join(',\n') + '\n]\n');
for (const c of cams) console.log(c.id, c.name, 'pos', c.pos.join(','), 'target', c.target.join(','), 't', c.t);
console.log(`${rejected} attempts rejected (line of sight). Wrote ${out}`);
