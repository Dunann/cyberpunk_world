// Unit checks for the airship layout rules (src/skyopsLayout.js) and the LED band pages (src/skyopsAtlas.js).
// Runs in Node with a mock world:
//   node tools/skyops-test.mjs
import assert from 'node:assert/strict';
import * as L from '../src/skyopsLayout.js';
import * as A from '../src/skyopsAtlas.js';
import { LANDMARKS } from '../src/world.js';

// mock world: rolling terrain, one tall collider next to the confluence, no other buildings
const world = {
  heightAt: (x, z) => (Math.abs(x) > 4000 ? 300 + 0.05 * (x - 4000) + 40 * Math.sin(z * 0.003) : 10),
  collidersNear: (x, z) => (Math.abs(x - 700) < 64 && Math.abs(z - 200) < 64 ? [{ cx: 700, cy: 150, cz: 200, hx: 20, hy: 150, hz: 20, cos: 1, sin: 0 }] : undefined),
};
let n = 0;
const ok = (name, f) => { f(); n++; console.log('  ok', name); };

const st = L.trackStretches();
ok('three stretches', () => assert.equal(st.length, 3));
ok('lap length 1.2-1.8 km', () => {
  for (const s of st) {
    const tr = L.buildRacetrack(s);
    assert.ok(tr.length >= 1200 && tr.length <= 1800, `${s.name} lap ${tr.length.toFixed(0)}`);
  }
});
ok('racetrack is closed and smooth', () => {
  for (const s of st) {
    const tr = L.buildRacetrack(s);
    for (let i = 0; i < tr.n; i++) {
      const j = (i + 1) % tr.n;
      const d = Math.hypot(tr.x[j] - tr.x[i], tr.z[j] - tr.z[i]);
      assert.ok(d < tr.ds * 1.6, `${s.name} gap ${d} at ${i}`);
      assert.ok(tr.hx[i] * tr.hx[j] + tr.hz[i] * tr.hz[j] > 0.9, `${s.name} heading jump at ${i}`);
      assert.ok(Math.abs(tr.bank[i]) <= 2.0001 * Math.PI / 180);
    }
  }
});
ok('bund-cbd track keeps 300 m from the show centre (hull included)', () => {
  const s = st.find((q) => q.name === 'bund-cbd');
  const tr = L.buildRacetrack(s);
  for (let i = 0; i < tr.n; i++) {
    for (const k of [-1, 0, 1]) {
      const x = tr.x[i] + tr.hx[i] * k * L.HULL_LEN / 2, z = tr.z[i] + tr.hz[i] * k * L.HULL_LEN / 2;
      assert.ok(Math.hypot(x - L.SHOW_CENTER[0], z - L.SHOW_CENTER[2]) >= L.SHOW_CLEAR - 1, `point ${i} too close`);
    }
  }
});
ok('altitude clears towers and traffic', () => {
  const traffic = { lanes: [[-4500, 300, 4500, 400, 410]], circles: [], corridors: [] };
  const s = st.find((q) => q.name === 'confluence');
  const tr = L.buildRacetrack(s);
  const sol = L.solveAltitude(world, tr, traffic);
  assert.ok(sol.alt >= 300 + 70 + L.HULL_BOTTOM, `alt ${sol.alt} vs collider top 300`);
  assert.ok(Math.abs(sol.alt - 410) >= L.TRAFFIC_BAND, `alt ${sol.alt} inside lane band`);
});
ok('ship state frame is orthonormal and banked at most 2 deg', () => {
  const ships = L.planAirships(world, { lanes: [], circles: [], corridors: [] });
  const o = {};
  for (const sh of ships) for (let t = 0; t < 400; t += 7.3) {
    L.shipState(sh, t, o);
    const dot = (a, b, c, d, e, f) => a * d + b * e + c * f;
    assert.ok(Math.abs(dot(o.fx, o.fy, o.fz, o.fx, o.fy, o.fz) - 1) < 1e-6);
    assert.ok(Math.abs(dot(o.lx, o.ly, o.lz, o.lx, o.ly, o.lz) - 1) < 1e-6);
    assert.ok(Math.abs(dot(o.fx, o.fy, o.fz, o.lx, o.ly, o.lz)) < 1e-6);
    assert.ok(Math.abs(dot(o.ux, o.uy, o.uz, o.lx, o.ly, o.lz)) < 1e-6);
    assert.ok(o.uy > Math.cos(3 * Math.PI / 180));
  }
});
ok('landmarks exist', () => assert.ok(LANDMARKS.length > 0));
ok('LED pages: two per ship, each in its own atlas row', () => {
  const texts = A.pageTexts();
  assert.equal(texts.length, A.SKY_WORDS.length * A.PAGES_PER_SHIP);
  const rows = new Set();
  for (let i = 0; i < A.SKY_WORDS.length; i++) for (let p = 0; p < A.PAGES_PER_SHIP; p++) rows.add(A.pageRow(i, p));
  assert.equal(rows.size, texts.length);
  for (const r of rows) assert.ok(r >= 0 && r < A.PAGE_ROWS);
  assert.ok(texts[2].includes('天舟航天') && texts[3] === 'TIANZHOU ORBITAL');
});
ok('LED pages fit inside the fully lit band (z -36..58)', () => {
  // the widest page spans BAND_MID +- TEXT_HALF_M along the hull, and fitSize keeps every page that narrow
  assert.ok(A.BAND_MID - A.TEXT_HALF_M >= -36 && A.BAND_MID + A.TEXT_HALF_M <= 58);
  for (const w of [200, 880, 881, 1500, 3000]) assert.ok(w * A.fitSize(w) / 108 <= A.TEXT_MAX + 1e-9);
});
ok('LED text reads left to right from both sides of the hull (mirror-safe)', () => {
  const ships = L.planAirships(world, { lanes: [], circles: [], corridors: [] });
  const o = {};
  for (const sh of ships) for (let t = 0; t < 300; t += 37) {
    L.shipState(sh, t, o);
    for (const side of [1, -1]) {
      // viewer abeam on this side (x > 0 is the port side), looking at the hull; screen right = view x up
      const vx = -side * o.lx, vy = -side * o.ly, vz = -side * o.lz;
      const rx = vy * 0 - vz * 1, ry = vz * 0 - vx * 0, rz = vx * 1 - vy * 0;
      // direction of increasing band position s on the hull surface: d(world)/ds = f * dz/ds
      const z0 = 10, dzds = (A.bandS(side, z0 + 1) - A.bandS(side, z0)) > 0 ? 1 : -1;
      const along = (o.fx * rx + o.fy * ry + o.fz * rz) * dzds;
      assert.ok(along > 0.9, `${sh.name} t=${t} side ${side}: text runs ${along.toFixed(2)} along screen right`);
    }
  }
});
console.log(`${n} checks passed`);
