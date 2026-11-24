// Reviewer check: how much of each frame is sky / far city, and how its 9 km fog column changes (spec formulas).
import fs from 'node:fs';
import path from 'node:path';
const M = process.argv[2];
process.chdir(M);
const { pathToFileURL } = await import('node:url'); const { FarCache } = await import(pathToFileURL(path.join(M, 'ranges.mjs')).href);
const meta = JSON.parse(fs.readFileSync('../../I-029-south-face/measure/grid_meta.json'));
const H = new Float32Array(fs.readFileSync('../../I-029-south-face/measure/grid_h.bin').buffer.slice(0));
const { X0, Z0, S, nx, nz } = meta;
const lots = JSON.parse(fs.readFileSync('../../I-029-south-face/measure/lots.json'));
const poses = JSON.parse(fs.readFileSync('../../../../../eval/poses-v1.json'));
const STEP = 32; const BOXH = [250, 110, 60, 30, 70, 60, 80];
function gAt(x, z) { let tx = (x - X0) / S - 0.5, tz = (z - Z0) / S - 0.5; if (tx < 0 || tz < 0 || tx >= nx - 1 || tz >= nz - 1) return NaN;
  const ix = tx | 0, iz = tz | 0, fx = tx - ix, fz = tz - iz, k = iz * nx + ix; return (H[k] * (1 - fx) + H[k + 1] * fx) * (1 - fz) + (H[k + nx] * (1 - fx) + H[k + nx + 1] * fx) * fz; }
const CELL = 64, cells = new Map();
for (const L of lots) { L.c = Math.cos(L.a); L.s = Math.sin(L.a); const r = Math.hypot(L.w, L.d) / 2;
  for (let i = Math.floor((L.x - r) / CELL); i <= Math.floor((L.x + r) / CELL); i++) for (let j = Math.floor((L.z - r) / CELL); j <= Math.floor((L.z + r) / CELL); j++) { const k = i * 100003 + j; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(L); } }
function lotAt(x, z) { const c = cells.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL)); if (!c) return null; for (const L of c) { const dx = x - L.x, dz = z - L.z; if (Math.abs(dx * L.c + dz * L.s) <= L.w / 2 && Math.abs(-dx * L.s + dz * L.c) <= L.d / 2) return L; } return null; }
const far = new FarCache(false);
const rho = (x, z) => Math.hypot(x - 300, (z + 300) * 0.92);
function hAt(x, z) { if (rho(x, z) < 4500) { const g = gAt(x, z); if (g === g) return g; } return far.heightAt(x, z); }
const ss = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
const RAIN = 1 + 0.7 * 0.55, FOGFAR = 9000;
function sigNow(x, y, z) { const py = Math.max(y, 0), rc = Math.hypot(x - 300, z + 300); return (0.00045 * Math.exp(-0.0045 * Math.max(y, -60)) + 0.00016 * Math.exp(-py / 1800) + 0.0016 * ss(6200, 8200, rc) * Math.exp(-py / 2500)) * RAIN; }
function sigNew(x, y, z, t) { const py = Math.max(y, 0), rc = Math.hypot(x - 300, z + 300); const k = ss(4000, 6500, t);
  return (0.00045 * Math.exp(-0.0045 * Math.max(y, -60)) + 0.00016 * ((1 - k) * Math.exp(-py / 1800) + k * Math.exp(-py / 450)) + 0.0016 * ss(6200, 8200, rc) * Math.exp(-py / 220)) * RAIN; }
const W = 2560, Hh = 1440, fov = 1.05, asp = W / Hh, th = Math.tan(fov / 2);
console.log('| Pose | cam rho | sky % | sky T now | new | sky (1-T) haze now | new | city hit >4 km from cam % | its T now | new | max |dT| city |');
for (const p of poses) {
  const [x0, yRaw, z0] = p.pos; const y0 = p.rel ? gAt(x0, z0) + yRaw : yRaw;
  const dx = p.target[0] - x0, dy = p.target[1] - y0, dz = p.target[2] - z0;
  const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const F = [-sy * cp, sp, -cy * cp], R = [cy, 0, -sy], U = [-R[2] * F[1], R[2] * F[0] - R[0] * F[2], R[0] * F[1]];
  let n = 0, sky = 0, sT0 = 0, sT1 = 0, fc = 0, cT0 = 0, cT1 = 0, mx = 0;
  for (let px = STEP / 2; px < W; px += STEP) for (let py = STEP / 2; py < Hh; py += STEP) {
    n++;
    const u = px / W * 2 - 1, w = 1 - py / Hh * 2;
    let rx = F[0] + R[0] * u * th * asp + U[0] * w * th, ry = F[1] + R[1] * u * th * asp + U[1] * w * th, rz = F[2] + R[2] * u * th * asp + U[2] * w * th;
    const l = Math.hypot(rx, ry, rz); rx /= l; ry /= l; rz /= l;
    let t = 1, hit = 0, a0 = 0, a1 = 0, ht = 0;
    while (t < 30000) {
      const x = x0 + rx * t, y = y0 + ry * t, z = z0 + rz * t; const dt = Math.max(1, t * 0.006);
      if (t < FOGFAR) { const d = Math.min(dt, FOGFAR - t); a0 += sigNow(x, y, z) * d; a1 += sigNew(x, y, z, t) * d; }
      if (y > 4500 && ry > 0) { // finish the column to 9 km (sky uses the full volume)
        let tt = t + dt; while (tt < FOGFAR) { const d2 = Math.max(1, tt * 0.006); const X = x0 + rx * tt, Y = y0 + ry * tt, Z = z0 + rz * tt; const dd = Math.min(d2, FOGFAR - tt); a0 += sigNow(X, Y, Z) * dd; a1 += sigNew(X, Y, Z, tt) * dd; tt += d2; }
        break; }
      const g = hAt(x, z);
      if (y < Math.max(g, 0)) { hit = rho(x, z) > 4700 ? 2 : 1; ht = t; break; }
      if (t < 6500 && y < g + 700) { const L = lotAt(x, z); if (L && y < L.gMax + BOXH[L.di]) { hit = 3; ht = t; break; } }
      t += dt;
    }
    if (hit === 0) { sky++; sT0 += Math.exp(-a0); sT1 += Math.exp(-a1); }
    if ((hit === 1 || hit === 3) && ht > 4000) { fc++; const T0 = Math.exp(-a0), T1 = Math.exp(-a1); cT0 += T0; cT1 += T1; mx = Math.max(mx, Math.abs(T1 - T0)); }
  }
  const crho = rho(x0, z0);
  console.log(`| ${p.id} | ${crho.toFixed(0)} | ${(sky / n * 100).toFixed(1)} | ${sky ? (sT0 / sky).toFixed(3) : '-'} | ${sky ? (sT1 / sky).toFixed(3) : '-'} | ${sky ? (1 - sT0 / sky).toFixed(3) : '-'} | ${sky ? (1 - sT1 / sky).toFixed(3) : '-'} | ${(fc / n * 100).toFixed(1)} | ${fc ? (cT0 / fc).toFixed(3) : '-'} | ${fc ? (cT1 / fc).toFixed(3) : '-'} | ${mx.toFixed(3)} |`);
}
