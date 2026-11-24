// Unit checks for the sky operations layout rules (src/skyopsLayout.js). Runs in Node with a mock world:
//   node tools/skyops-test.mjs
import assert from 'node:assert/strict';
import * as L from '../src/skyopsLayout.js';
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
ok('site inside the valid heightmap and the search sector', () => {
  const s = L.chooseSite(world);
  assert.ok(s);
  const r = Math.hypot(s.x - L.CITY[0], s.z - L.CITY[1]);
  assert.ok(r >= 4499 && r <= 5501, `r ${r}`);
  assert.ok(Math.abs(s.x) <= 5900 && Math.abs(s.z) <= 5900);
});
ok('trajectory: >= 35 deg from vertical at the cloud deck, ends at the deck', () => {
  const tr = L.trajectory([5000, 450, -1500]);
  assert.ok(tr.angleAtDeck >= 35 * Math.PI / 180, `angle ${(tr.angleAtDeck * 180 / Math.PI).toFixed(1)}`);
  assert.ok(Math.abs(tr.y[tr.y.length - 1] - L.CLOUD_BASE) < 6);
  for (let i = 1; i < tr.x.length; i++) assert.ok(tr.x[i] >= tr.x[i - 1]);
});
ok('smoke timing: opacity curve, radius cap, always a young trail', () => {
  assert.equal(L.smokeOpacity(0), 1);
  assert.ok(Math.abs(L.smokeOpacity(120) - Math.pow(0.5, 0.7)) < 1e-9);
  assert.equal(L.smokeOpacity(240), 0);
  assert.equal(L.smokeRadius(0), 15);
  assert.equal(L.smokeRadius(1000), 250);
  const ages = new Float64Array(2);
  for (let t = 0; t < 1000; t += 0.7) {
    const k = L.liveLaunches(t, ages);
    assert.ok(k >= 1 && k <= 2);
    assert.ok(ages[0] < L.LAUNCH_PERIOD);
  }
});
ok('wind shear: speed doubles and the direction turns 75 deg between 300 and 1800 m', () => {
  const a = [0, 0], b = [0, 0];
  L.windDrift(300, 10, 0.6, 0.25, a); L.windDrift(1800, 10, 0.6, 0.25, b);
  const la = Math.hypot(a[0], a[1]), lb = Math.hypot(b[0], b[1]);
  assert.ok(Math.abs(lb / la - 2) < 1e-6);
  const ang = Math.acos((a[0] * b[0] + a[1] * b[1]) / (la * lb)) * 180 / Math.PI;
  assert.ok(Math.abs(ang - 75) < 1e-6);
});
ok('landmarks exist', () => assert.ok(LANDMARKS.length > 0));
console.log(`${n} checks passed`);
