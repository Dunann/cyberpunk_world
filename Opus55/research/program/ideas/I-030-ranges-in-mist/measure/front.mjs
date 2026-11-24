// Front range experiment (not part of the spec; see "More height would not help"): frame share and skyline of
// terrain with rho in [4700, 7400] for the eval poses,
// current terrain vs with the front range. Lots are occluders at a typical height per district.
import fs from 'node:fs';
import { landBase, ss, mix, fbm2, landRidged, lineDist } from '../../I-029-south-face/measure/hcpu.mjs';
const meta = JSON.parse(fs.readFileSync('../../I-029-south-face/measure/grid_meta.json'));
const H = new Float32Array(fs.readFileSync('../../I-029-south-face/measure/grid_h.bin').buffer.slice(0));
const { X0, Z0, S, nx, nz } = meta;
const lots = JSON.parse(fs.readFileSync('../../I-029-south-face/measure/lots.json'));
const poses = JSON.parse(fs.readFileSync('../../../../../eval/poses-v1.json'));
const G = { R: 5900, win: 560, wout: 1000, C: 700, P: 380 };
export function frontRange(h, x, z) {
  const qx = x - 300, qz = (z + 300) * 0.92;
  const rho = Math.hypot(qx, qz);
  if (rho <= 4700) return h;
  const vd = lineDist(x, z, 650, 4300, 2700, 15000);
  const valley = Math.exp(-Math.pow(vd / 1100, 2)) * ss(3600, 5200, z);
  const gate = ss(4700, 5300, rho) * (1 - ss(0.03, 0.3, valley));
  if (gate <= 0) return h;
  const th = Math.atan2(qz, qx);
  const cr = G.R + 380 * Math.sin(th * 3 + 1.3) + 220 * Math.sin(th * 7 + 0.4) + fbm2(x * 0.00025, z * 0.00025, 3) * 500;
  const d = rho - cr;
  const w = d < 0 ? G.win : G.wout;
  const k = Math.exp(-(d / w) * (d / w)) * gate;
  if (k < 1e-3) return h;
  const peak = landRidged(x * 0.0009, z * 0.0009, 4);
  const pass = ss(0.25, 0.75, 0.5 + fbm2(Math.cos(th) * 2.2, Math.sin(th) * 2.2, 2));
  const crest = G.C * (0.55 + 0.45 * pass) + peak * G.P;
  return Math.max(h, mix(h, crest, k));
}
class Far { constructor(v) { this.m = new Map(); this.v = v; }
  cell(i, j) { const k = i * 100003 + j; let q = this.m.get(k); if (q === undefined) { const x = (i + 0.5) * 32, z = (j + 0.5) * 32; q = landBase(x, z); if (this.v) q = frontRange(q, x, z); this.m.set(k, q); } return q; }
  heightAt(x, z) { const tx = x / 32 - 0.5, tz = z / 32 - 0.5, ix = Math.floor(tx), iz = Math.floor(tz), fx = tx - ix, fz = tz - iz;
    return (this.cell(ix, iz) * (1 - fx) + this.cell(ix + 1, iz) * fx) * (1 - fz) + (this.cell(ix, iz + 1) * (1 - fx) + this.cell(ix + 1, iz + 1) * fx) * fz; } }
function gAt(x, z) {
  let tx = (x - X0) / S - 0.5, tz = (z - Z0) / S - 0.5;
  if (tx < 0 || tz < 0 || tx >= nx - 1 || tz >= nz - 1) return NaN;
  const ix = tx | 0, iz = tz | 0, fx = tx - ix, fz = tz - iz, k = iz * nx + ix;
  return (H[k] * (1 - fx) + H[k + 1] * fx) * (1 - fz) + (H[k + nx] * (1 - fx) + H[k + nx + 1] * fx) * fz;
}
const CELL = 64, cells = new Map();
for (const L of lots) { L.c = Math.cos(L.a); L.s = Math.sin(L.a); const r = Math.hypot(L.w, L.d) / 2;
  for (let i = Math.floor((L.x - r) / CELL); i <= Math.floor((L.x + r) / CELL); i++) for (let j = Math.floor((L.z - r) / CELL); j <= Math.floor((L.z + r) / CELL); j++) { const k = i * 100003 + j; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(L); } }
function lotAt(x, z) { const c = cells.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL)); if (!c) return null; for (const L of c) { const dx = x - L.x, dz = z - L.z; if (Math.abs(dx * L.c + dz * L.s) <= L.w / 2 && Math.abs(-dx * L.s + dz * L.c) <= L.d / 2) return L; } return null; }
const far = [new Far(false), new Far(true)];
const rho = (x, z) => Math.hypot(x - 300, (z + 300) * 0.92);
function hAt(x, z, v) { if (rho(x, z) < 4500) { const g = gAt(x, z); if (g === g) return g; } return far[v].heightAt(x, z); }
const BOXH = [250, 110, 60, 30, 70, 60, 80];
const W = 2560, Hh = 1440, fov = 1.05, asp = W / Hh, th = Math.tan(fov / 2), STEP = 16;
// crest statistics of the front range along its crest line
{ let mn = 1e9, mx = -1e9, sum = 0, n = 0;
  for (let a = 0; a < 360; a += 1) { let best = 0; for (let r = 5000; r < 7200; r += 40) { const x = 300 + Math.cos(a * Math.PI / 180) * r, z = -300 + Math.sin(a * Math.PI / 180) * r / 0.92; best = Math.max(best, frontRange(landBase(x, z), x, z)); } mn = Math.min(mn, best); mx = Math.max(mx, best); sum += best; n++; }
  console.log(`front range crest by azimuth (1 deg): min ${mn.toFixed(0)} m, mean ${(sum / n).toFixed(0)} m, max ${mx.toFixed(0)} m`);
  let m2 = 0, s2 = 0; for (let a = 0; a < 360; a += 1) { let best = 0; for (let r = 5000; r < 7200; r += 40) { const x = 300 + Math.cos(a * Math.PI / 180) * r, z = -300 + Math.sin(a * Math.PI / 180) * r / 0.92; best = Math.max(best, landBase(x, z)); } m2 = Math.max(m2, best); s2 += best; }
  console.log(`current terrain, same zone: mean of the highest point per azimuth ${(s2 / 360).toFixed(0)} m, max ${m2.toFixed(0)} m`); }
const out = [];
for (const p of poses) {
  const [x0, yRaw, z0] = p.pos; const y0 = p.rel ? gAt(x0, z0) + yRaw : yRaw;
  const dx = p.target[0] - x0, dy = p.target[1] - y0, dz = p.target[2] - z0;
  const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const F = [-sy * cp, sp, -cy * cp], R = [cy, 0, -sy], U = [-R[2] * F[1], R[2] * F[0] - R[0] * F[2], R[0] * F[1]];
  const res = [];
  for (let v = 0; v < 2; v++) {
    let n = 0, fr = 0, all = 0, topSum = 0, cols = 0;
    for (let px = STEP / 2; px < W; px += STEP) {
      let colTop = -1;
      for (let py = STEP / 2; py < Hh; py += STEP) {
        n++;
        const u = px / W * 2 - 1, w = 1 - py / Hh * 2;
        let rx = F[0] + R[0] * u * th * asp + U[0] * w * th, ry = F[1] + R[1] * u * th * asp + U[1] * w * th, rz = F[2] + R[2] * u * th * asp + U[2] * w * th;
        const l = Math.hypot(rx, ry, rz); rx /= l; ry /= l; rz /= l;
        let t = 1, hit = 0;
        while (t < 30000) {
          const x = x0 + rx * t, y = y0 + ry * t, z = z0 + rz * t;
          if (y > 4500 && ry > 0) break;
          const g = hAt(x, z, v);
          if (y < Math.max(g, 0)) { const r = rho(x, z); hit = r > 4700 ? (r < 7400 ? 2 : 4) : 1; break; }
          if (t < 6500 && y < g + 700) { const L = lotAt(x, z); if (L && y < L.gMax + BOXH[L.di]) { hit = 3; break; } }
          t += Math.max(1, t * 0.006);
        }
        if (hit === 2) { fr++; if (colTop < 0) colTop = py; }
        if (hit === 2 || hit === 4) all++;
      }
      if (colTop >= 0) { cols++; topSum += colTop; }
    }
    res.push({ fr: fr / n * 100, all: all / n * 100, top: cols ? topSum / cols : 0, cols: cols / (W / STEP) * 100 });
  }
  out.push(`| ${p.id} | ${res[0].fr.toFixed(1)} | ${res[1].fr.toFixed(1)} | ${res[0].all.toFixed(1)} | ${res[1].all.toFixed(1)} | ${Math.round(res[0].top)} (${Math.round(res[0].cols)}%) | ${Math.round(res[1].top)} (${Math.round(res[1].cols)}%) |`);
  console.error(out[out.length - 1]);
}
console.log('| Pose | front zone % now | with front range | all range terrain % now | with | mean top y of the front zone now (columns) | with |\n|---|---|---|---|---|---|---|\n' + out.join('\n'));
