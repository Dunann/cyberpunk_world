// Far-height cache for the I-030 measurements (FarCache(false) = the current terrain).
// rangeExtra is an early three-range experiment; the spec does not change any height.
import { landBase, ss, mix, fbm2, landRidged, lineDist } from '../../I-029-south-face/measure/hcpu.mjs';
export const RANGES = [
  { R: 5900, win: 520, wout: 950, C: 760, P: 420, f: 0.0009 },
  { R: 8300, win: 800, wout: 1500, C: 1250, P: 650, f: 0.0007 },
  { R: 11600, win: 1200, wout: 2400, C: 1900, P: 900, f: 0.0005 },
];
export function rangeExtra(h, x, z) {
  const qx = x - 300, qz = (z + 300) * 0.92;
  const rho = Math.hypot(qx, qz);
  if (rho <= 4700) return h;
  const vd = lineDist(x, z, 650, 4300, 2700, 15000);
  const valley = Math.exp(-Math.pow(vd / 1100, 2)) * ss(3600, 5200, z);
  const gate = ss(4700, 5300, rho) * (1 - ss(0.03, 0.3, valley));
  if (gate <= 0) return h;
  const th = Math.atan2(qz, qx);
  for (let i = 0; i < RANGES.length; i++) {
    const g = RANGES[i];
    const cr = g.R + (380 + 120 * i) * Math.sin(th * 3 + 1.3 + i * 2.1) + (220 + 60 * i) * Math.sin(th * 7 + 0.4 + i * 1.7) + fbm2(x * 0.00025 + i * 9, z * 0.00025 + i * 9, 3) * (500 + 150 * i);
    const d = rho - cr;
    const w = d < 0 ? g.win : g.wout;
    const k = Math.exp(-(d / w) * (d / w)) * gate;
    if (k < 1e-3) continue;
    const peak = landRidged(x * g.f + i * 4, z * g.f + i * 4, 4);
    const pass = ss(0.25, 0.75, 0.5 + fbm2(Math.cos(th) * (2.2 + i) + i * 5, Math.sin(th) * (2.2 + i) - i * 3, 2));   // 0 at passes
    const crest = g.C * (0.55 + 0.45 * pass) + peak * g.P;
    h = Math.max(h, mix(h, crest, k));
  }
  return h;
}
export class FarCache {
  constructor(withRanges) { this.m = new Map(); this.r = withRanges; this.S = 32; }
  cell(i, j) {
    const k = i * 100003 + j; let v = this.m.get(k);
    if (v === undefined) { const x = (i + 0.5) * this.S, z = (j + 0.5) * this.S; v = landBase(x, z); if (this.r) v = rangeExtra(v, x, z); this.m.set(k, v); }
    return v;
  }
  heightAt(x, z) {
    const tx = x / this.S - 0.5, tz = z / this.S - 0.5, ix = Math.floor(tx), iz = Math.floor(tz), fx = tx - ix, fz = tz - iz;
    return (this.cell(ix, iz) * (1 - fx) + this.cell(ix + 1, iz) * fx) * (1 - fz) + (this.cell(ix, iz + 1) * (1 - fx) + this.cell(ix + 1, iz + 1) * fx) * fz;
  }
}
