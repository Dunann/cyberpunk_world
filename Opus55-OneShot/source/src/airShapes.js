// Drone show formations. Every shape is N points: [u, v, w, mode, r, g, b, param] in formation space
// (u = viewer's right, v = up, w = toward the viewer; meters). Modes evaluated in the shader:
//   0 static, 1 dragon (offsets in the spine frame, param = spine position), 2 wave (param = phase),
//   3 rotate about the vertical axis, 4 twinkle.

import { rng } from './math.js';

const hsv = (h, s, v) => {
  const f = (n) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)];
};

function finish(list, N, R) {
  // exactly N points: shuffle-truncate or pad with dark duplicates
  for (let i = list.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; const t = list[i]; list[i] = list[j]; list[j] = t; }
  const out = new Float32Array(N * 8);
  for (let i = 0; i < N; i++) {
    if (i < list.length) out.set(list[i], i * 8);
    else { const s = list[i % Math.max(list.length, 1)] || [0, 0, 0, 0, 0, 0, 0, 0]; out.set(s, i * 8); out[i * 8 + 4] = 0; out[i * 8 + 5] = 0; out[i * 8 + 6] = 0; }
  }
  return out;
}


function keyAt(a, i) {
  // sweep by u then v (column order) keeps motion mostly horizontal-local
  const u = a[i * 8], v = a[i * 8 + 1];
  return Math.round((u + 400) / 14) * 1000 + (v + 400);
}

function barge(N, R) {
  const list = [];
  const cols = Math.ceil(Math.sqrt(N * 1.6));
  for (let i = 0; i < N; i++) {
    const c = i % cols, r = (i / cols) | 0;
    list.push([(c - cols / 2) * 1.6, -212 + 1.5, (r - N / cols / 2) * 1.6, 0, 0.15, 0.2, 0.3, 0]);
  }
  return finish(list, N, R);
}

function lotus(N, R, open) {
  const list = [];
  const rings = [{ n: 6, L: 46, W: 20, tilt: open ? 0.55 : 0.16 }, { n: 9, L: 58, W: 24, tilt: open ? 0.95 : 0.3 }, { n: 12, L: 66, W: 26, tilt: open ? 1.3 : 0.48 }];
  const nPetal = Math.floor(N * 0.74), nCenter = Math.floor(N * 0.1), nPad = N - nPetal - nCenter;
  const base = -55;
  for (let i = 0; i < nPetal; i++) {
    const ri = R() < 0.22 ? 0 : R() < 0.45 ? 1 : 2;
    const rg = rings[ri];
    const k = (R() * rg.n) | 0;
    const phi = (k + (ri % 2) * 0.5) / rg.n * Math.PI * 2;
    const s = Math.sqrt(R());
    const t = (R() * 2 - 1);
    const width = Math.pow(Math.sin(Math.PI * Math.min(s * 0.92 + 0.04, 1)), 0.8) * rg.W * 0.5 * (1 - 0.35 * s);
    // petal in its plane: x across, y along; cup and tilt outward
    const px = t * width, py = s * rg.L;
    const cup = (t * t) * width * 0.35;
    const tilt = rg.tilt + s * 0.25;
    const ry = py * Math.cos(tilt), rr = py * Math.sin(tilt) + cup;
    const u = Math.cos(phi) * rr - Math.sin(phi) * px, w = Math.sin(phi) * rr + Math.cos(phi) * px;
    const c = hsv(0.92 + 0.04 * s, 0.25 + 0.6 * s, 1.0);
    list.push([u, base + ry, w, 3, c[0], c[1], c[2] * 0.95, 0]);
  }
  for (let i = 0; i < nCenter; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 12;
    list.push([Math.cos(a) * r, base + 10 + R() * 6, Math.sin(a) * r, 3, 1.0, 0.75, 0.15, 0]);
  }
  for (let i = 0; i < nPad; i++) {
    const side = R() < 0.5 ? -1 : 1;
    const a = R() * Math.PI * 1.85, r = Math.sqrt(R()) * 34;
    list.push([side * 70 + Math.cos(a) * r, base - 8 + Math.sin(a) * r * 0.25, Math.sin(a) * r * 0.5, 3, 0.15, 0.9, 0.35, 0]);
  }
  return finish(list, N, R);
}

// Galloping horse: rigid parts sampled once in part-local coordinates, then posed per frame.
function horseFrames(N, R, frames) {
  const parts = [
    { name: 'torso', type: 'ell', a: 38, b: 15, w: 0.34 },
    { name: 'neck', type: 'cap', len: 34, r: 8, w: 0.12 },
    { name: 'head', type: 'cap', len: 22, r: 6, w: 0.07 },
    { name: 'tail', type: 'cap', len: 34, r: 4, w: 0.07 },
    { name: 'mane', type: 'cap', len: 30, r: 3, w: 0.06 },
    { name: 'flu', type: 'cap', len: 22, r: 4.2, w: 0.045 }, { name: 'fll', type: 'cap', len: 24, r: 2.8, w: 0.045 },
    { name: 'fru', type: 'cap', len: 22, r: 4.2, w: 0.045 }, { name: 'frl', type: 'cap', len: 24, r: 2.8, w: 0.045 },
    { name: 'blu', type: 'cap', len: 24, r: 5, w: 0.045 }, { name: 'bll', type: 'cap', len: 24, r: 2.8, w: 0.045 },
    { name: 'bru', type: 'cap', len: 24, r: 5, w: 0.045 }, { name: 'brl', type: 'cap', len: 24, r: 2.8, w: 0.045 },
  ];
  const tot = parts.reduce((s, p) => s + p.w, 0);
  const pts = [];
  for (const p of parts) {
    const n = Math.round(N * p.w / tot);
    for (let i = 0; i < n; i++) {
      let x, y;
      if (p.type === 'ell') { const a = R() * Math.PI * 2, r = Math.sqrt(R()); x = Math.cos(a) * r * p.a; y = Math.sin(a) * r * p.b; }
      else { x = R() * p.len; const a = R() * Math.PI * 2, r = Math.sqrt(R()); y = Math.cos(a) * r * p.r * (p.name === 'head' ? 1 - x / p.len * 0.45 : 1); }
      pts.push({ part: p.name, x, y, z: (R() - 0.5) * (p.name === 'torso' ? 14 : 6) });
    }
  }
  const out = [];
  for (let f = 0; f < frames; f++) {
    const ph = f / frames * Math.PI * 2;
    const bob = Math.sin(ph * 2) * 3, pitch = Math.sin(ph) * 0.06;
    const T = {}; // part -> [ox, oy, angle]
    const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
    const body = (x, y) => { const [rx, ry] = rot(x, y, pitch); return [rx, ry + bob]; };
    T.torso = [...body(0, 0), pitch];
    const neckBase = body(28, 8);
    const neckA = 1.0 + Math.sin(ph + 1.2) * 0.12;
    T.neck = [neckBase[0], neckBase[1], neckA];
    const neckTip = [neckBase[0] + Math.cos(neckA) * 34, neckBase[1] + Math.sin(neckA) * 34];
    T.head = [neckTip[0], neckTip[1], -0.55 + Math.sin(ph + 1.2) * 0.1];
    T.mane = [neckBase[0] - 3, neckBase[1] + 7, neckA + 0.08];
    const tailBase = body(-37, 6);
    T.tail = [tailBase[0], tailBase[1], Math.PI + 0.55 + Math.sin(ph * 2) * 0.18];
    const leg = (name, hip, a1, a2) => {
      T[name + 'u'] = [hip[0], hip[1], -Math.PI / 2 + a1];
      const knee = [hip[0] + Math.cos(-Math.PI / 2 + a1) * 22, hip[1] + Math.sin(-Math.PI / 2 + a1) * 22];
      T[name + 'l'] = [knee[0], knee[1], -Math.PI / 2 + a1 + a2];
    };
    // transverse gallop: front pair and hind pair swing in opposition with a small left/right lag
    const fa = (o) => 0.75 * Math.sin(ph + o), ha = (o) => 0.7 * Math.sin(ph + Math.PI + o);
    leg('fl', body(24, -10), fa(0), -Math.max(0, Math.sin(ph + 0.9)) * 1.3);
    leg('fr', body(20, -10), fa(0.5), -Math.max(0, Math.sin(ph + 1.4)) * 1.3);
    leg('bl', body(-26, -9), ha(0), Math.max(0, Math.sin(ph + Math.PI + 0.9)) * 1.1);
    leg('br', body(-30, -9), ha(0.5), Math.max(0, Math.sin(ph + Math.PI + 1.4)) * 1.1);
    const list = pts.map((p) => {
      const t = T[p.part];
      const [x, y] = rot(p.x, p.y, t[2]);
      const u = x + t[0], v = y + t[1];
      const mane = p.part === 'mane' || p.part === 'tail';
      const c = mane ? hsv(0.55 + 0.1 * Math.sin(p.x * 0.2), 0.7, 1) : [1.0, 0.92, 0.8];
      return [u * 1.15 + 10, v * 1.15 - 5, p.z, 0, c[0], c[1], c[2], 0];
    });
    // keep identical point order for all frames (no shuffle): pad manually
    const arr = new Float32Array(N * 8);
    for (let i = 0; i < N; i++) {
      if (i < list.length) arr.set(list[i], i * 8);
      else { arr.set(list[i % list.length], i * 8); arr[i * 8 + 4] = arr[i * 8 + 5] = arr[i * 8 + 6] = 0; }
    }
    out.push(arr);
  }
  return out;
}

function dragon(N, R) {
  const list = [];
  const nBody = Math.floor(N * 0.62), nHead = Math.floor(N * 0.12), nLegs = Math.floor(N * 0.1), nSpike = Math.floor(N * 0.08);
  const nWh = N - nBody - nHead - nLegs - nSpike;
  const rad = (p) => 9 * (0.25 + 0.75 * Math.sin(Math.PI * Math.min(Math.pow(p, 0.75), 1) * 0.92 + 0.08));
  for (let i = 0; i < nBody; i++) {
    const p = Math.pow(R(), 0.9);
    const a = R() * Math.PI * 2, r = rad(p) * (0.85 + R() * 0.15);
    const belly = Math.sin(a) < -0.4;
    const c = belly ? [1.0, 0.85, 0.5] : hsv(0.02 + 0.09 * (0.5 + 0.5 * Math.sin(p * 18)), 0.85, 1);
    list.push([0, Math.sin(a) * r, Math.cos(a) * r, 1, c[0], c[1], c[2], p]);
  }
  for (let i = 0; i < nHead; i++) {
    // head: an elongated block with jaw, horns and a brow
    const k = R();
    let o;
    let c = [1.0, 0.7, 0.15];
    if (k < 0.55) { o = [R() * 22, (R() - 0.3) * 12, (R() - 0.5) * 14]; }
    else if (k < 0.75) { o = [8 + R() * 16, -8 - R() * 4, (R() - 0.5) * 10]; c = [1.0, 0.35, 0.1]; }
    else if (k < 0.95) { const s = R(); const side = R() < 0.5 ? -1 : 1; o = [-4 - s * 16, 8 + s * 16, side * (4 + s * 5)]; c = [1.0, 0.95, 0.7]; }
    else { const side = R() < 0.5 ? -1 : 1; o = [14 + R() * 2, 4, side * 5]; c = [1.0, 0.0, 0.0]; }
    list.push([o[0], o[1], o[2], 1, c[0], c[1], c[2], 1.0]);
  }
  const legP = [0.28, 0.4, 0.66, 0.78];
  for (let i = 0; i < nLegs; i++) {
    const li = i % 4, s = R();
    const side = li % 2 ? 1 : -1;
    const o = [s * 6 - 3 + (s > 0.85 ? (R() - 0.5) * 8 : 0), -rad(legP[li]) - s * 18, side * (6 + s * 6)];
    list.push([o[0], o[1], o[2], 1, 1.0, 0.6, 0.12, legP[li]]);
  }
  for (let i = 0; i < nSpike; i++) {
    const p = 0.05 + R() * 0.85;
    const s = R();
    const cyc = (p * 40) % 1;
    list.push([-cyc * 3, rad(p) + s * 6 * (1 - cyc), 0, 1, 1.0, 0.15, 0.1, p]);
  }
  for (let i = 0; i < nWh; i++) {
    const s = R(), side = R() < 0.5 ? -1 : 1;
    list.push([22 + s * 26, -2 - Math.sin(s * 3) * 10, side * (4 + s * 14), 1, 0.3, 0.9, 1.0, 1.0]);
  }
  return finish(list, N, R);
}

function moonWaves(N, R) {
  const list = [];
  const nMoon = Math.floor(N * 0.3), nStar = Math.floor(N * 0.07), nWave = N - nMoon - nStar;
  while (list.length < nMoon) {
    const u = (R() * 2 - 1) * 46, v = (R() * 2 - 1) * 46;
    if (u * u + v * v > 46 * 46) continue;
    const du = u - 18, dv = v - 14;
    if (du * du + dv * dv < 40 * 40) continue;
    list.push([u + 40, v + 38, (R() - 0.5) * 4, 0, 1.0, 0.9, 0.62, 0]);
  }
  for (let i = 0; i < nStar; i++) list.push([(R() * 2 - 1) * 140, 30 + R() * 50, (R() - 0.5) * 30, 4, 0.85, 0.9, 1.0, R() * 6.28]);
  for (let i = 0; i < nWave; i++) {
    const row = (R() * 5) | 0;
    const u = (R() * 2 - 1) * 135;
    const crest = R() < 0.3;
    const base = -20 - row * 13 + Math.sin(u * 0.05 + row * 1.3) * 6;
    const v = crest ? base + 3 + R() * 2 : base - R() * 5;
    const c = crest ? [0.75, 0.95, 1.0] : hsv(0.55 + row * 0.02, 0.85, 0.55 + 0.45 * (1 - row / 5));
    list.push([u, v, (row - 2) * 9 + (R() - 0.5) * 3, 2, c[0], c[1], c[2], row * 1.3]);
  }
  return finish(list, N, R);
}

function glyphs(N, R, text) {
  const W = 640, H = 320;
  const cv = new OffscreenCanvas(W, H);
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 270px "Microsoft YaHei", "SimHei", sans-serif';
  g.fillText(text, W / 2, H / 2 + 10);
  const d = g.getImageData(0, 0, W, H).data;
  const list = [];
  let tries = 0;
  while (list.length < N && tries < N * 200) {
    tries++;
    const x = R() * W, y = R() * H;
    if (d[((y | 0) * W + (x | 0)) * 4] < 128) continue;
    const u = (x / W - 0.5) * 270, v = (0.5 - y / H) * 135;
    const c = hsv(0.85 - 0.35 * (x / W), 0.85, 1);
    list.push([u, v, (R() - 0.5) * 3, 4, c[0], c[1], c[2], R() * 6.28]);
  }
  return finish(list, N, R);
}

function sphere(N, R, r) {
  const list = [];
  for (let i = 0; i < N; i++) {
    const z = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    const c = hsv((a / (Math.PI * 2) + z * 0.2 + 1) % 1, 0.8, 1);
    list.push([Math.cos(a) * s * r, z * r * 0.9, Math.sin(a) * s * r, 3, c[0], c[1], c[2], 0]);
  }
  return finish(list, N, R);
}

function applyPerm(arr, perm, N) {
  const out = new Float32Array(N * 8);
  for (let i = 0; i < N; i++) out.set(arr.subarray(perm[i] * 8, perm[i] * 8 + 8), i * 8);
  return out;
}
// perm such that drone i (sorted position in prev) takes the point with the same rank in cur
function arrangePerm(prev, cur, N) {
  const idxPrev = [...Array(N).keys()].sort((a, b) => keyAt(prev, a) - keyAt(prev, b));
  const idxCur = [...Array(N).keys()].sort((a, b) => keyAt(cur, a) - keyAt(cur, b));
  const perm = new Int32Array(N);
  for (let k = 0; k < N; k++) perm[idxPrev[k]] = idxCur[k];
  return perm;
}

// Returns { shapes: Float32Array (S*N*8), index: {name: i}, count }
export function buildShapes(N) {
  const R = rng(2024);
  const list = [];
  const index = {};
  const perms = {};
  let prev = null;
  const add = (name, arr, samePermAs) => {
    let perm;
    if (samePermAs) perm = perms[samePermAs];
    else if (prev) perm = arrangePerm(prev, arr, N);
    else perm = Int32Array.from({ length: N }, (_, i) => i);
    const a = applyPerm(arr, perm, N);
    perms[name] = perm; index[name] = list.length; list.push(a); prev = a;
  };
  add('barge', barge(N, R));
  add('lotusC', lotus(N, rng(7), false));
  add('lotusO', lotus(N, rng(7), true), 'lotusC');
  const hf = horseFrames(N, R, 8);
  add('horse0', hf[0]);
  for (let f = 1; f < 8; f++) add('horse' + f, hf[f], 'horse0');
  prev = list[index.horse0];
  add('dragon', dragon(N, R));
  add('moon', moonWaves(N, R));
  add('neon', glyphs(N, R, '霓虹'));
  add('sphere', sphere(N, R, 70));
  add('burst', sphere(N, rng(99), 150), 'sphere');
  const out = new Float32Array(list.length * N * 8);
  list.forEach((a, i) => out.set(a, i * N * 8));
  return { shapes: out, index, count: list.length };
}