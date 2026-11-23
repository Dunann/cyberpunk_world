// Transit layout: fine track polylines with a grade-limited height profile (tunnels through hills),
// station / terminal positions and train schedules. Pure CPU data, shared by the transit geometry and the trains.

import { ROUTES, MONORAIL_STATION, LANDMARKS } from './world.js';
import { catmullRom, clamp } from './math.js';

export const STEP = 6; // meters between track samples

const ROUTE_CFG = {
  monorail: { grade: 0.06, track: 2.0, trains: 4, cars: 4, carLen: 15.0, carGap: 0.8, speed: 19, accel: 1.0, dwell: 22, termDwell: 26,
    names: ['佛图关', '大坪', '牛角沱', '较场口'], stationLen: 72, shedLen: 46 },
  metro: { grade: 0.035, track: 2.2, trains: 5, cars: 6, carLen: 19.5, carGap: 0.9, speed: 23, accel: 1.0, dwell: 22, termDwell: 30,
    names: ['南坪', '上新街', '五里店', '江北城', '大剧院', '红土地'], stationLen: 132, shedLen: 72 },
};

export class Track {
  constructor(world, route, index) {
    this.route = route;
    this.index = index;
    this.kind = route.kind;
    this.cfg = ROUTE_CFG[route.kind];
    this.name = route.name;
    this._resample(world);
    this._profile(world);
    this._trim(world);
    this._stations(world);
    this._schedule();
  }

  _resample(world) {
    const ctrl = this.route.dense.map((p) => [p.x, p.z]);
    // drop near-duplicate control points then smooth with Catmull-Rom
    const fine = catmullRom(ctrl, 6);
    const cum = [0];
    for (let i = 1; i < fine.length; i++) cum.push(cum[i - 1] + Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]));
    const L = cum[cum.length - 1];
    const n = Math.floor(L / STEP) + 1;
    this.n = n;
    this.length = (n - 1) * STEP;
    this.x = new Float32Array(n); this.z = new Float32Array(n); this.y = new Float32Array(n);
    this.g = new Float32Array(n); this.tx = new Float32Array(n); this.tz = new Float32Array(n);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const s = i * STEP;
      while (j < cum.length - 2 && cum[j + 1] < s) j++;
      const t = (s - cum[j]) / Math.max(cum[j + 1] - cum[j], 1e-6);
      this.x[i] = fine[j][0] + (fine[j + 1][0] - fine[j][0]) * t;
      this.z[i] = fine[j][1] + (fine[j + 1][1] - fine[j][1]) * t;
    }
    for (let i = 0; i < n; i++) {
      const a = Math.max(i - 1, 0), b = Math.min(i + 1, n - 1);
      const dx = this.x[b] - this.x[a], dz = this.z[b] - this.z[a];
      const l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l; this.tz[i] = dz / l;
      this.g[i] = world.heightAt(this.x[i], this.z[i]);
    }
  }

  // Grade-limited lower envelope of (ground + clearance): hills become tunnels, valleys get tall pillars.
  _profile(world) {
    const n = this.n, y = this.y, g = this.g, G = this.cfg.grade * STEP;
    const clr = this.route.clearance;
    for (let i = 0; i < n; i++) {
      // use the max ground across the track width so pillars clear the terrain
      let t = Math.max(g[i], 0) + clr;
      if (g[i] < 3) t = Math.max(t, this.kind === 'metro' ? 34 : 30);
      y[i] = t;
    }
    for (let i = 1; i < n; i++) y[i] = Math.min(y[i], y[i - 1] + G);
    for (let i = n - 2; i >= 0; i--) y[i] = Math.min(y[i], y[i + 1] + G);
    // pinned heights (the Liziba station sits ~20 m above ground inside its tower)
    this.pins = [];
    if (this.index === MONORAIL_STATION.route) {
      let best = 1e9, bi = 0;
      for (let i = 0; i < n; i++) { const d = Math.hypot(this.x[i] - MONORAIL_STATION.x, this.z[i] - MONORAIL_STATION.z); if (d < best) { best = d; bi = i; } }
      const gs = world.heightAt(MONORAIL_STATION.x, MONORAIL_STATION.z);
      this.pins.push({ i: bi, h: gs + 21 });
      this.lizibaIndex = bi;
    }
    for (const p of this.pins) {
      for (let i = 0; i < n; i++) {
        const d = Math.abs(i - p.i) * STEP;
        // flat section through the station, then climb/descend at the grade limit
        y[i] = d < 40 ? p.h : Math.max(y[i], p.h - (d - 40) * this.cfg.grade);
      }
    }
    // gentle vertical curves
    const tmp = new Float32Array(n);
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < n; i++) tmp[i] = (y[Math.max(i - 1, 0)] + 2 * y[i] + y[Math.min(i + 1, n - 1)]) / 4;
      for (let i = 0; i < n; i++) y[i] = tmp[i];
      for (const p of this.pins) for (let i = Math.max(0, p.i - 6); i <= Math.min(n - 1, p.i + 6); i++) y[i] = p.h;
    }
  }

  // Usable range: cut ends that run into landmark sites.
  _trim() {
    let a = 0, b = this.n - 1;
    const blocked = (i) => {
      for (const L of LANDMARKS) if (L.r > 0 && Math.hypot(this.x[i] - L.x, this.z[i] - L.z) < L.r + 30) return true;
      return false;
    };
    while (a < b && blocked(a)) a++;
    while (b > a && blocked(b)) b--;
    this.iA = a + 2; this.iB = b - 2;
    this.sA = this.iA * STEP; this.sB = this.iB * STEP;
    this.L = this.sB - this.sA;
  }

  depthAt(i) { return this.g[i] - this.y[i]; } // > 0: terrain above the track top

  _stations() {
    const cfg = this.cfg;
    const st = [];
    const half = cfg.stationLen / 2;
    const ok = (i) => {
      for (let k = i - Math.ceil(half / STEP); k <= i + Math.ceil(half / STEP); k++) {
        if (k < 0 || k >= this.n) return false;
        const h = this.y[k] - this.g[k];
        if (h < 5 || h > 26 || this.g[k] < 4) return false;
      }
      return true;
    };
    if (this.lizibaIndex !== undefined) st.push({ i: this.lizibaIndex, s: this.lizibaIndex * STEP, name: '李子坝', liziba: true });
    const minGap = this.kind === 'metro' ? 900 : 650;
    const margin = cfg.shedLen + half + 120;
    const cands = [];
    for (let i = this.iA; i <= this.iB; i++) {
      const s = i * STEP;
      if (s < this.sA + margin || s > this.sB - margin) continue;
      if (ok(i)) cands.push(i);
    }
    // greedy: evenly spread targets
    const want = this.kind === 'metro' ? 5 : 3;
    for (let k = 0; k < want; k++) {
      const target = this.sA + (k + 0.5) / want * this.L;
      let best = -1, bd = 1e9;
      for (const i of cands) {
        const s = i * STEP;
        if (st.some((o) => Math.abs(o.s - s) < minGap)) continue;
        const d = Math.abs(s - target);
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0 && bd < this.L / want) st.push({ i: best, s: best * STEP, name: '' });
    }
    st.sort((p, q) => p.s - q.s);
    let ni = 0;
    for (const s of st) if (!s.name) s.name = cfg.names[ni++ % cfg.names.length];
    this.stations = st;
    // terminals: sheds unless the end is in a tunnel
    this.terminals = [this.iA, this.iB].map((i, k) => ({ i, s: i * STEP, end: k, tunnel: this.depthAt(i) > 4 }));
  }

  // Train loop: u in [0, 2L). u < L: track +1 at s = sA + u; else track -1 at s = sB - (u - L).
  _schedule() {
    const cfg = this.cfg, L = this.L;
    const stops = [{ u: 0, dwell: cfg.termDwell }];
    for (const s of this.stations) stops.push({ u: s.s - this.sA, dwell: cfg.dwell, st: s, dir: 1 });
    stops.push({ u: L, dwell: cfg.termDwell });
    for (let k = this.stations.length - 1; k >= 0; k--) { const s = this.stations[k]; stops.push({ u: L + (this.sB - s.s), dwell: cfg.dwell, st: s, dir: -1 }); }
    // legs: dwell at stop k, then travel to stop k+1
    const legs = [];
    let T = 0;
    for (let k = 0; k < stops.length; k++) {
      const a = stops[k], b = k + 1 < stops.length ? stops[k + 1].u : 2 * L;
      const D = b - a.u;
      const V = cfg.speed, A = cfg.accel;
      let tt, vmax;
      if (D >= V * V / A) { tt = D / V + V / A; vmax = V; } else { vmax = Math.sqrt(D * A); tt = 2 * vmax / A; }
      legs.push({ t0: T, dwell: a.dwell, u0: a.u, D, tt, vmax, stop: a });
      T += a.dwell + tt;
    }
    this.legs = legs;
    this.cycle = T;
    this.trainLen = cfg.cars * cfg.carLen + (cfg.cars - 1) * cfg.carGap;
  }

  // Loop coordinate u and speed du/dt at schedule time tau (seconds, wrapped).
  uAt(tau, out) {
    const legs = this.legs;
    tau = ((tau % this.cycle) + this.cycle) % this.cycle;
    let k = legs.length - 1;
    for (let i = 0; i < legs.length; i++) if (legs[i].t0 > tau) { k = i - 1; break; }
    const g = legs[k];
    let t = tau - g.t0;
    const A = this.cfg.accel;
    if (t < g.dwell) { out.u = g.u0; out.v = 0; return out; }
    t -= g.dwell;
    const vm = g.vmax, ta = vm / A, tc = g.tt - 2 * ta;
    let d, v;
    if (t < ta) { d = 0.5 * A * t * t; v = A * t; }
    else if (t < ta + tc) { d = 0.5 * A * ta * ta + vm * (t - ta); v = vm; }
    else { const r = Math.max(g.tt - t, 0); d = g.D - 0.5 * A * r * r; v = A * r; }
    out.u = g.u0 + Math.min(d, g.D); out.v = v;
    return out;
  }

  // Time offset that puts a train in the middle of the dwell at a station at scene time t.
  offsetForDwell(station, dir, t) {
    for (const g of this.legs) if (g.stop.st === station && g.stop.dir === dir) return g.t0 + g.dwell * 0.5 - t;
    return 0;
  }

  // Map loop coordinate to (s, track side, direction). Returns s; writes out.side (+1/-1).
  mapU(u, out) {
    const L2 = 2 * this.L;
    u = ((u % L2) + L2) % L2;
    if (u < this.L) { out.side = 1; out.s = this.sA + u; }
    else { out.side = -1; out.s = this.sB - (u - this.L); }
    return out;
  }

  // Position on the track centerline at arc length s (clamped): out.x,y,z, tangent tx,tz.
  sample(s, out) {
    const f = clamp(s / STEP, 0, this.n - 1.001);
    const i = f | 0, t = f - i;
    out.x = this.x[i] + (this.x[i + 1] - this.x[i]) * t;
    out.y = this.y[i] + (this.y[i + 1] - this.y[i]) * t;
    out.z = this.z[i] + (this.z[i + 1] - this.z[i]) * t;
    const tx = this.tx[i] + (this.tx[i + 1] - this.tx[i]) * t, tz = this.tz[i] + (this.tz[i + 1] - this.tz[i]) * t;
    const l = Math.sqrt(tx * tx + tz * tz) || 1;
    out.tx = tx / l; out.tz = tz / l;
    return out;
  }
}

export function buildTracks(world) {
  return ROUTES.map((r, i) => new Track(world, r, i));
}
