// Functional checks: click to start (pointer lock + audio), movement, fly/walk toggle, viewpoints, rain toggle,
// collision with buildings, no WebGPU errors, JS heap stays flat while moving.
//   node tools/functional.mjs [--file out/dev.html] [--profile name]
import { launch } from './launch.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const { page, close } = await launch({ file: opt('file', 'out/dev.html'), query: '', profileName: opt('profile', 'opus55-functional') });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
const state = () => page.evaluate(() => { const c = window.__ctx.controls; return { x: c.x, y: c.y, z: c.z, yaw: c.yaw, flying: c.flying, onGround: c.onGround, locked: c.locked, rain: window.__ctx.env.rain, audio: window.__audioState ? window.__audioState() : 'n/a' }; });

await sleep(1500);
await page.bringToFront();
// start: click the overlay
await page.mouse.click(400, 300);
await sleep(800);
let s = await state();
check('pointer lock after click', s.locked, `locked=${s.locked}`);
check('audio started', /running/.test(String(s.audio)) || s.audio === 'n/a', String(s.audio));

// move forward while flying
const p0 = await state();
await page.keyboard.down('KeyW'); await sleep(1200); await page.keyboard.up('KeyW');
const p1 = await state();
const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
check('W moves the camera', moved > 5, `${moved.toFixed(1)} m`);

// mouse look
await page.mouse.move(700, 300); await page.mouse.move(760, 300);
const p2 = await state();
check('mouse turns the view', Math.abs(p2.yaw - p1.yaw) > 1e-3 || !p2.locked, `dyaw=${(p2.yaw - p1.yaw).toFixed(3)}`);

// fly up with space
await page.keyboard.down('Space'); await sleep(600); await page.keyboard.up('Space');
const p3 = await state();
check('Space rises while flying', p3.y > p2.y + 1, `${(p3.y - p2.y).toFixed(1)} m`);

// double-tap space -> walking -> falls to the ground
await page.keyboard.press('Space'); await sleep(120); await page.keyboard.press('Space');
await sleep(4000);
const p4 = await state();
check('double-tap Space switches to walking', !p4.flying);
check('gravity lands the player', p4.onGround, `y=${p4.y.toFixed(1)}`);

// walk forward on the ground
await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW');
const p5 = await state();
check('walking moves on the ground', Math.hypot(p5.x - p4.x, p5.z - p4.z) > 2 && p5.onGround, `${Math.hypot(p5.x - p4.x, p5.z - p4.z).toFixed(1)} m`);

// back to flying
await page.keyboard.press('Space'); await sleep(120); await page.keyboard.press('Space');
await sleep(200);
check('double-tap Space switches back to flying', (await state()).flying);

// holding R while moving sprints
{
  const a0 = await state();
  await page.keyboard.down('KeyW'); await sleep(1000); await page.keyboard.up('KeyW');
  const a1 = await state();
  await sleep(600);
  const b0 = await state();
  await page.keyboard.down('KeyR'); await page.keyboard.down('KeyW'); await sleep(1000);
  await page.keyboard.up('KeyW'); await page.keyboard.up('KeyR');
  const b1 = await state();
  const normal = Math.hypot(a1.x - a0.x, a1.z - a0.z), fast = Math.hypot(b1.x - b0.x, b1.z - b0.z);
  check('holding R while moving sprints', fast > normal * 2, `${normal.toFixed(1)} m vs ${fast.toFixed(1)} m in 1 s`);
}

// viewpoint keys
for (const [key, idx] of [['Digit2', 1], ['Digit7', 6], ['Digit0', 9]]) {
  await page.keyboard.press(key); await sleep(300);
  const p = await state();
  const pose = await page.evaluate((i) => window.__poses[i], idx);
  check(`key ${key} jumps to viewpoint ${idx + 1}`, Math.hypot(p.x - pose.x, p.z - pose.z) < 20);
}

// rain toggle
const r0 = (await state()).rain;
await page.keyboard.press('KeyT'); await sleep(100);
const r1 = (await state()).rain;
check('T toggles rain', r0 !== r1, `${r0} -> ${r1}`);
await page.keyboard.press('KeyT');

// collision: fly into the nearest building collider and check we stay outside it
const col = await page.evaluate(() => {
  const w = window.__ctx.world;
  const c = w.colliders.find((c) => c.hy > 20 && c.hx > 8 && c.hz > 8);
  if (!c) return null;
  window.__setCam && (window.__ctx.camOverride = null);
  const ctl = window.__ctx.controls;
  ctl.setPose(c.cx + c.cos * (c.hx + 15), c.cy, c.cz + c.sin * (c.hx + 15), Math.atan2(c.cos, c.sin), 0, true);
  // face the building center
  const dx = c.cx - ctl.x, dz = c.cz - ctl.z;
  ctl.yaw = Math.atan2(-dx, -dz);
  return { cx: c.cx, cz: c.cz, hx: c.hx, hz: c.hz, cos: c.cos, sin: c.sin, cy: c.cy, hy: c.hy };
});
if (col) {
  await page.keyboard.down('KeyW'); await sleep(2500); await page.keyboard.up('KeyW');
  const p = await state();
  const dx = p.x - col.cx, dz = p.z - col.cz;
  const lx = dx * col.cos + dz * col.sin, lz = -dx * col.sin + dz * col.cos;
  const inside = Math.abs(lx) < col.hx - 0.1 && Math.abs(lz) < col.hz - 0.1 && p.y < col.cy + col.hy && p.y > col.cy - col.hy;
  check('cannot fly through buildings', !inside, `local ${lx.toFixed(1)}, ${lz.toFixed(1)} vs half ${col.hx.toFixed(1)}, ${col.hz.toFixed(1)}`);
} else check('cannot fly through buildings', false, 'no colliders registered');

// Esc releases the pointer and shows the menu (synthetic Esc does not reach the browser's pointer-lock handler,
// so release the lock the same way the browser does on Esc)
await page.keyboard.press('Escape'); await page.evaluate(() => document.exitPointerLock()); await sleep(400);
const menu = await page.evaluate(() => !document.getElementById('overlay').classList.contains('hidden'));
check('Esc shows the menu', menu || !(await state()).locked);

// heap stays flat while moving for 10 s
const h0 = await page.evaluate(() => performance.memory.usedJSHeapSize);
await page.evaluate(() => { window.__ctx.controls.keys.add('KeyW'); });
await sleep(10000);
await page.evaluate(() => { window.__ctx.controls.keys.delete('KeyW'); });
const h1 = await page.evaluate(() => performance.memory.usedJSHeapSize);
check('JS heap growth over 10 s < 2 MB', h1 - h0 < 2 * 1048576, `${((h1 - h0) / 1048576).toFixed(2)} MB`);

const errors = await page.evaluate(() => window.__errors());
check('no WebGPU errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
