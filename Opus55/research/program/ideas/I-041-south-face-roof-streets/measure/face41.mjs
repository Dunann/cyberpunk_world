// I-041 measurements, CPU only (no browser, no GPU). Run order, from this folder:
//   node ../../I-029-south-face/measure/lots.mjs   (run in that folder first: writes its lots.json)
//   node runs.mjs            Yuzhong street runs from the real buildRuns on CPU heights (runs.json)
//   node face41.mjs 3        the face by the spec rules: unit fit per band, types, frame share by part class
//   node face41.mjs 3 none   the same without the frame shares (fast)
//   node lod.mjs             coarse terrain against roofs
//   node checks.mjs          street segments in the face, bench path, Hongyadong distance, cableway clearance
//   node near.mjs            nearest face part to a street centre line
// Outputs (*.json, *.bin, *.txt) are not committed.
// I-041 measurements (CPU only). The south face with the revised rules:
//  - the tip within TIP_R of the Raffles site is left to I-037; lots keep LOT_KEEP; street runs keep STREET_KEEP;
//  - lane field with a bury margin; units by strip width: A (house with back lane), R (roof street), G (two levels
//    with a gallery); end tapers; cableway clearance; bridge corridor.
// Prints the unit-fit share per 200 m band, exposed wall heights, counts, and the frame share by part class.
//   node face41.mjs [bury=2.5] [poses=G4,G3,G2,A3,A6,A1,G1]
import fs from 'node:fs';
import { waterDistEx, HeightCache } from '../../I-029-south-face/measure/hcpu.mjs';
const lots = JSON.parse(fs.readFileSync('../../I-029-south-face/measure/lots.json'));
const runs = JSON.parse(fs.readFileSync('./runs.json'));
const POSES = new URL('../../../../../eval/poses-v1.json', import.meta.url);
const poses = JSON.parse(fs.readFileSync(fs.existsSync(POSES) ? POSES : 'C:/Users/pdunc/cyberpunk_world/Opus55/eval/poses-v1.json'));
const hc = new HeightCache();
const gAt = (x, z) => hc.heightAt(x, z);

const DY = 14.4, DW = 22, Y0 = 5.8, W0 = 7;
const BURY = +(process.argv[2] || 3);
const LOT_KEEP = 3, STREET_KEEP = 10.5, TIP = { x: 220, z: -60, r: 320 }, BRIDGE_KEEP = 19, CABLE_HALF = 16, CABLE_CLEAR = 14;
const DECK_C = 4.2, DECK_O = 6, MIN_UNIT = 5, MAX_UNIT = 12, END_STEP = 16, FLOOR = 3.6;

for (const L of lots) { L.c = Math.cos(L.a); L.s = Math.sin(L.a); }
const CELL = 64, cells = new Map();
for (const L of lots) { const r = Math.hypot(L.w, L.d) / 2 + 8;
  for (let i = Math.floor((L.x - r) / CELL); i <= Math.floor((L.x + r) / CELL); i++) for (let j = Math.floor((L.z - r) / CELL); j <= Math.floor((L.z + r) / CELL); j++) { const k = i * 100003 + j; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(L); } }
function lotAt(x, z, m = 0) { const c = cells.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL)); if (!c) return null; for (const L of c) { const dx = x - L.x, dz = z - L.z; if (Math.abs(dx * L.c + dz * L.s) <= L.w / 2 + m && Math.abs(-dx * L.s + dz * L.c) <= L.d / 2 + m) return L; } return null; }
const wd = (x, z) => waterDistEx(x, z, false)[0];
function bankNormal(x, z) { const e = 3; const ax = wd(x + e, z) - wd(x - e, z), az = wd(x, z + e) - wd(x, z - e); const l = Math.hypot(ax, az) || 1; return [ax / l, az / l]; }
function project(x, z, WD) { let n = [0, 0]; for (let it = 0; it < 5; it++) { n = bankNormal(x, z); const d = wd(x, z); x -= n[0] * (d - WD); z -= n[1] * (d - WD); } return [x, z, n[0], n[1]]; }
const segDist = (x, z, ax, az, bx, bz) => { const pax = x - ax, paz = z - az, bax = bx - ax, baz = bz - az; const h = Math.min(Math.max((pax * bax + paz * baz) / (bax * bax + baz * baz), 0), 1); return Math.hypot(pax - bax * h, paz - baz * h); };
const inTip = (x, z) => Math.hypot(x - TIP.x, z - TIP.z) < TIP.r;
const inDisk = (x, z) => Math.hypot(x + 600, z + 260) < 70 || Math.hypot(x + 1250, z + 900) < 45;
const BR = [-640, 230, -540, 980], CB = [-1250, 330, -1150, 1080];
const inBridge = (x, z) => segDist(x, z, ...BR) < BRIDGE_KEEP;
const cableD = (x, z) => segDist(x, z, ...CB);
// runs near the face only
const nearRuns = runs.filter((r) => Math.max(r.az, r.bz) > 60 && Math.min(r.ax, r.bx) < 420);
const streetD = (x, z) => { let b = 1e9; for (const r of nearRuns) { const d = segDist(x, z, r.ax, r.az, r.bx, r.bz); if (d < b) b = d; } return b; };
// rope height over a point of the cableway line (lowest rope: haul rope 0.9 m below the track ropes)
const gA = gAt(CB[0], CB[1]), gB = gAt(CB[2], CB[3]);
function ropeY(x, z) {
  const L = Math.hypot(CB[2] - CB[0], CB[3] - CB[1]), ex = (CB[2] - CB[0]) / L, ez = (CB[3] - CB[1]) / L;
  const a = { x: CB[0] + ex * 16, z: CB[1] + ez * 16, y: gA + 43 }, b = { x: CB[2] - ex * 16, z: CB[3] - ez * 16, y: gB + 43 };
  const Lp = Math.hypot(b.x - a.x, b.z - a.z);
  const u = Math.min(Math.max(((x - a.x) * ex + (z - a.z) * ez) / Lp, 0), 1);
  return a.y + (b.y - a.y) * u - 26 * 4 * u * (1 - u) - 0.9;
}

// ---- stations
const STEP = 4, SEC = 360, DS = 0.5, NS = SEC / DS;
let [x, z, nxv, nzv] = project(321, 99, 10);
const all = [];
let fails = 0, dirx = 0, dirz = 1;
for (let i = 0; i < 700 && fails < 3; i++) {
  const a = project(x - nzv * STEP, z + nxv * STEP, 10), b = project(x + nzv * STEP, z - nxv * STEP, 10);
  const da = (a[0] - x) * dirx + (a[1] - z) * dirz, db = (b[0] - x) * dirx + (b[1] - z) * dirz;
  const nxt = da > db ? a : b;
  const l = Math.hypot(nxt[0] - x, nxt[1] - z) || 1; dirx = (nxt[0] - x) / l; dirz = (nxt[1] - z) / l;
  [x, z, nxv, nzv] = nxt;
  const s = { x, z, nx: nxv, nz: nzv };
  s.P = (w) => [s.x + s.nx * (w - 10), s.z + s.nz * (w - 10)];
  s.h = new Float32Array(NS + 1);
  for (let q = 0; q <= NS; q++) { const [px, pz] = s.P(q * DS); s.h[q] = gAt(px, pz); }
  s.hw = (w) => { const t = Math.min(Math.max(w / DS, 0), NS - 0.001), i0 = t | 0; return s.h[i0] + (s.h[i0 + 1] - s.h[i0]) * (t - i0); };
  let D = -1; for (let w = 8; w <= 350; w += 0.5) { const [px, pz] = s.P(w); if (lotAt(px, pz, LOT_KEEP) || inDisk(px, pz) || Math.hypot(px - 220, pz + 60) < 190) { D = w; break; } }
  let c = 25; while (c < SEC - 5 && !(s.hw(c) > 25 && s.hw(c + 5) - s.hw(c) < 0.75)) c++;
  s.D = D; s.crest = c; s.ok = D > 0;
  fails = s.ok ? 0 : fails + 1;
  all.push(s);
}
while (all.length && !all[all.length - 1].ok) all.pop();
// the face: stations whose bank point lies outside the tip circle
const st = all.filter((s) => !inTip(s.x, s.z));
console.log(`walk: ${all.length} stations; outside the ${TIP.r} m tip circle: ${st.length} (${st.length * STEP} m), from (${st[0].x.toFixed(0)}, ${st[0].z.toFixed(0)}) to (${st[st.length - 1].x.toFixed(0)}, ${st[st.length - 1].z.toFixed(0)})`);
console.log(`cableway: ground north ${gA.toFixed(0)} m, south ${gB.toFixed(0)} m`);

// ---- strips and units per station
const hash = (a, b) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const bands = {}; const wallsExposed = []; const wallsAll = [];
let nStrip = 0, nFit = 0, nStreet = 0, frontage = 0, area = 0, unitFloorArea = 0;
const typeCount = { A: 0, R: 0, G: 0, F: 0, T: 0, none: 0 };
const M = st.length;
for (let i = 0; i < M; i++) {
  const s = st[i];
  s.depth = Math.min(s.D, s.crest + 8);
  // usable depth also ends at the tip circle
  let dep = s.depth; for (let w = W0; w <= s.depth; w += 0.5) { const [px, pz] = s.P(w); if (inTip(px, pz)) { dep = w; break; } }
  s.depth = dep;
  const endDist = Math.min(i, M - 1 - i) * STEP;
  s.maxK = 2 + 2 * Math.floor(endDist / END_STEP);            // rows step down at both ends
  const Lw = (w) => { const h = s.hw(w); const a = (h + BURY - Y0) / DY, b = (w - W0) / DW; return [Math.max(a, b, 0), a >= b ? 1 : 2]; };
  const cross = [{ w: W0, k: 0, mode: 2, y: Y0 }];
  let prev = Lw(W0)[0];
  for (let w = W0 + 0.25; w <= s.depth; w += 0.25) { const [L, m] = Lw(w); const k = Math.floor(L); if (k > Math.floor(prev) && k >= 1) cross.push({ w, k, mode: m, y: m === 1 ? Y0 + k * DY : s.hw(w) + 0.15 }); prev = L; }
  s.cross = cross; s.rows = [];
  const crestY = s.hw(Math.min(s.crest, SEC));
  const capY = (w) => { const [px, pz] = s.P(w); const cd = cableD(px, pz); return cd < CABLE_HALF ? ropeY(px, pz) - CABLE_CLEAR : 1e9; };
  let skip = false;
  for (let r = 0; r < cross.length; r++) {
    if (skip) { skip = false; continue; }
    const a = cross[r], up = cross[r + 1], up2 = cross[r + 2];
    if (a.k >= s.maxK) break;                                  // end taper: nothing above the cap
    const end = up ? up.w : s.depth;
    const sW = end - a.w;
    // corridor tests on the strip
    let freeTo = end, kind = '';
    for (let w = a.w; w <= end; w += 0.5) { const [px, pz] = s.P(w); const inS = streetD(px, pz) < STREET_KEEP, inB = inBridge(px, pz); if (inS || inB) { freeTo = w; kind = inB ? 'bridge' : 'street'; break; } }
    const b = Math.floor(s.x / 200) * 200; bands[b] = bands[b] || { strips: 0, fit: 0, street: 0, wallN: 0, wallSum: 0 };
    if (kind && freeTo - a.w < MIN_UNIT) { nStreet++; bands[b].street++; s.rows.push({ type: kind, a, end, top: a.y }); continue; }
    const clip = freeTo < end;
    let type = 'none', depth = 0, top = a.y, back = a.w, span = 1;
    const extra = 1 + Math.floor(hash(i >> 2, a.k) * 3);       // 1-3 floors above the upper lane for type A
    if (up) {
      if (up.mode === 1) {
        if (sW >= DECK_C + 1.5 + 7) { type = 'A'; depth = Math.min(sW - DECK_C - 1.5, MAX_UNIT); top = up.y + extra * FLOOR; }
        else if (sW >= MIN_UNIT && up.y - a.y >= FLOOR && !clip) { type = 'R'; depth = sW; top = up.y; }
        else if (clip) { type = 'F'; depth = Math.min(freeTo - a.w, MAX_UNIT); top = a.y + 3 * FLOOR; }
        else if (up2 && up2.mode === 1 && up2.w - a.w >= MIN_UNIT && up2.k < s.maxK + 1) { type = 'G'; depth = up2.w - a.w; top = up2.y; span = 2; }
        else if (!up2 && s.depth - a.w >= MIN_UNIT) { type = 'G'; depth = Math.min(s.depth - a.w, MAX_UNIT); top = up.y + FLOOR; span = 2; }
      } else {
        if (sW - DECK_O - 1.5 >= 7) { type = 'F'; depth = Math.min(sW - DECK_O - 1.5, MAX_UNIT); top = a.y + (4 + Math.floor(hash(i >> 2, a.k + 31) * 4)) * FLOOR; }
      }
    } else if (sW >= MIN_UNIT) { type = 'T'; depth = Math.min(sW, MAX_UNIT); top = a.y + (3 + Math.floor(hash(i >> 2, a.k + 77) * 3)) * FLOOR; }
    // caps: nothing more than two floors above the crest of its station; cableway clearance
    if (type !== 'none') {
      top = Math.min(top, Math.max(crestY, a.y + FLOOR) + 2 * FLOOR, capY(a.w + depth / 2));
      depth = Math.min(depth, freeTo - a.w);
      // the footprint ends where the ground comes within BURY of the roof (types other than the roof street)
      if (type !== 'R' && type !== 'G') { let d2 = depth; for (let w = a.w; w <= a.w + depth; w += 0.5) { if (s.hw(w) > top - BURY) { d2 = w - a.w; break; } } depth = d2; if (depth < MIN_UNIT) type = 'none'; }
      if (top - a.y < FLOOR - 0.01) type = 'none';
    }
    const strips = span === 2 ? 2 : 1;
    nStrip += strips; bands[b].strips += strips;
    if (type !== 'none') {
      nFit += strips; bands[b].fit += strips; typeCount[type] += strips; frontage += STEP; unitFloorArea += STEP * depth * Math.max(1, Math.round((top - a.y) / FLOOR));
      s.rows.push({ type, a, depth, top, end: span === 2 ? up2.w : end, span });
      if (span === 2) skip = true;
    } else {
      typeCount.none += 1;
      // the upper lane then stands on an exposed wall: deck level minus the ground at its outer edge
      if (up) { const dw = up.mode === 1 ? DECK_C : DECK_O; const wh = up.y - s.hw(up.w - dw); wallsExposed.push(wh); bands[b].wallN++; bands[b].wallSum += wh; }
      s.rows.push({ type: 'none', a, end, top: a.y });
    }
  }
  area += (s.depth - W0) * STEP;
}
const pc = (a, b) => (b ? (100 * a / b).toFixed(0) : '-') + '%';
console.log(`\nBURY=${BURY} m. strips (station x row, outside street and bridge corridors): ${nStrip}; with a unit: ${nFit} (${pc(nFit, nStrip)}); in corridors: ${nStreet}`);
console.log('by type (strips):', JSON.stringify(typeCount));
console.log('| x band | strips | with a unit | in street or bridge corridor | exposed walls (count, mean m) |\n|---|---|---|---|---|');
for (const b of Object.keys(bands).map(Number).sort((p, q) => p - q)) { const v = bands[b]; console.log(`| ${b}..${b + 200} | ${v.strips} | ${pc(v.fit, v.strips)} | ${v.street} | ${v.wallN}, ${(v.wallSum / Math.max(v.wallN, 1)).toFixed(1)} |`); }
const cliff = Object.keys(bands).map(Number).filter((b) => b >= -600 && b < 200), hill = Object.keys(bands).map(Number).filter((b) => b < -1000);
const agg = (ks) => { let s = 0, f = 0; for (const k of ks) { s += bands[k].strips; f += bands[k].fit; } return `${f}/${s} = ${pc(f, s)}`; };
console.log(`cliff (x -600..200): ${agg(cliff)};  G4 hill (x < -1000): ${agg(hill)}`);
const ws = wallsExposed.slice().sort((p, q) => p - q);
console.log(`exposed walls with no unit in front: ${ws.length} station-rows; median ${ws[ws.length >> 1]?.toFixed(1)} m, p90 ${ws[(ws.length * 0.9) | 0]?.toFixed(1)} m, max ${ws[ws.length - 1]?.toFixed(1)} m; over 5 m: ${ws.filter((v) => v > 5).length} (${pc(ws.filter((v) => v > 5).length, nStrip)} of strips)`);
console.log(`face area ${(area / 1e4).toFixed(2)} ha; unit frontage ${frontage} m (station rows x 4 m) => about ${Math.round(frontage * 0.83 / 20)} units of 20 m after 17% alleys; floor area ${(unitFloorArea * 0.83 / 1e4).toFixed(1)} ha`);
// cableway slot
{ let n = 0, f = 0; for (const s of st) for (const r of s.rows) { const [px, pz] = s.P(r.a.w); if (cableD(px, pz) < CABLE_HALF) { n++; if (!['none', 'street', 'bridge'].includes(r.type)) f++; } } console.log(`under the cableway (within ${CABLE_HALF} m of its axis): ${f} of ${n} station-rows keep a unit under the ${CABLE_CLEAR} m clearance rule`); }
// sample rows
for (let i = 0; i < M; i += 16) { const s = st[i]; console.log(`${s.x.toFixed(0)},${s.z.toFixed(0)} depth ${s.depth.toFixed(0)} maxK ${s.maxK}: ` + s.rows.map((r) => r.type[0] + (r.span === 2 ? '2' : '')).join('')); }
fs.writeFileSync('face41_st.json', JSON.stringify(st.map((s) => ({ x: s.x, z: s.z, nx: s.nx, nz: s.nz, depth: s.depth, rows: s.rows.map((r) => ({ t: r.type, w: r.a.w, k: r.a.k, y: r.a.y, d: r.depth || 0, top: r.top, end: r.end })) }))));

// ---- raster by part class with real tops: 1 unit, 2 deck / wall / stair / yard, 3 bare face ground, 4 kept street
const EX0 = -1500, EZ0 = 0, ES = 1.5, ENX = 1150, ENZ = 420;
const E = new Float32Array(ENX * ENZ), C = new Uint8Array(ENX * ENZ);
const put = (px, pz, top, c) => { const i = Math.floor((px - EX0) / ES), j = Math.floor((pz - EZ0) / ES); if (i < 0 || j < 0 || i >= ENX || j >= ENZ) return; const k = j * ENX + i; if (!C[k] || c < C[k] || (c === C[k] && top > E[k])) { C[k] = c; E[k] = top; } };
for (let i = 0; i < M; i++) {
  const s = st[i]; const alley = i % 6 === 5;
  for (const r of s.rows) {
    for (let w = r.a.w; w <= r.end; w += 0.75) for (let t = -2; t <= 2; t += 0.75) {
      const [bx, bz] = s.P(w); const px = bx - s.nz * t, pz = bz + s.nx * t;
      if (lotAt(px, pz, LOT_KEEP) || inTip(px, pz)) continue;
      if (r.type !== 'street' && r.type !== 'bridge' && (streetD(px, pz) < STREET_KEEP || inBridge(px, pz))) { put(px, pz, gAt(px, pz) + 0.2, 4); continue; }
      if (r.type === 'street') { put(px, pz, gAt(px, pz) + 0.2, 4); continue; }
      if (r.type === 'bridge') { put(px, pz, gAt(px, pz) + 0.4, 2); continue; }
      if (r.type === 'none') { put(px, pz, gAt(px, pz) + 0.3, 3); continue; }
      if (alley || w > r.a.w + r.depth) put(px, pz, Math.max(r.a.y, gAt(px, pz)) + 1.0, 2);     // stair bay, yard
      else put(px, pz, r.top + 1.0, 1);
    }
    // deck in front of a contour lane that has no unit below it (kerb or wall deck)
    if (r.a.k >= 1) for (let w = r.a.w - (r.a.mode === 1 ? DECK_C : DECK_O); w < r.a.w; w += 0.75) for (let t = -2; t <= 2; t += 0.75) { const [bx, bz] = s.P(w); const px = bx - s.nz * t, pz = bz + s.nx * t; if (!lotAt(px, pz, LOT_KEEP) && !inTip(px, pz) && streetD(px, pz) >= STREET_KEEP && !inBridge(px, pz)) put(px, pz, r.a.y + 1.0, 2); }
  }
}
fs.writeFileSync('face41_C.bin', Buffer.from(C.buffer)); fs.writeFileSync('face41_C.json', JSON.stringify({ EX0, EZ0, ES, ENX, ENZ }));
const envAt = (x, z) => { const i = Math.floor((x - EX0) / ES), j = Math.floor((z - EZ0) / ES); if (i < 0 || j < 0 || i >= ENX || j >= ENZ) return 0; return j * ENX + i; };
const BOXH = [250, 110, 60, 30, 70, 60, 80];
const W = 2560, Hh = 1440, fov = 1.05, asp = W / Hh, th = Math.tan(fov / 2), PSTEP = 8;
const ids = (process.argv[3] || 'G4,G3,G2,A3,A6,A1,G1').split(',');
console.log('\n| Pose | Units and roof streets | Decks, walls, stairs, yards | Bare face ground | Kept streets | Face parts total (units + decks) | Nearest |\n|---|---|---|---|---|---|---|');
for (const p of poses.filter((q) => ids.includes(q.id))) {
  const [x0, yRaw, z0] = p.pos; const y0 = p.rel ? gAt(x0, z0) + yRaw : yRaw;
  const dx = p.target[0] - x0, dy = p.target[1] - y0, dz = p.target[2] - z0;
  const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const F = [-sy * cp, sp, -cy * cp], R = [cy, 0, -sy], U = [-R[2] * F[1], R[2] * F[0] - R[0] * F[2], R[0] * F[1]];
  const cnt = [0, 0, 0, 0, 0]; let n = 0, near = 1e9;
  for (let py = PSTEP / 2; py < Hh; py += PSTEP) for (let px = PSTEP / 2; px < W; px += PSTEP) {
    n++;
    const u = px / W * 2 - 1, v = 1 - py / Hh * 2;
    let rx = F[0] + R[0] * u * th * asp + U[0] * v * th, ry = F[1] + R[1] * u * th * asp + U[1] * v * th, rz = F[2] + R[2] * u * th * asp + U[2] * v * th;
    const l = Math.hypot(rx, ry, rz); rx /= l; ry /= l; rz /= l;
    // quick reject: rays that never come near the face box
    let t = 0.5;
    while (t < 4500) {
      const X = x0 + rx * t, Y = y0 + ry * t, Z = z0 + rz * t;
      if (X < -2700 || X > 4400 || Z < -3700 || Z > 2800) break;
      const k = envAt(X, Z);
      if (k && C[k] && Y < E[k]) { cnt[C[k]]++; near = Math.min(near, t); break; }
      const g = gAt(X, Z);
      if (Y < Math.max(g, 0)) break;
      if (Y < g + 700) { const L = lotAt(X, Z, 0); if (L && Y < L.gMax + BOXH[L.di]) break; }
      if (Y > 800 && ry > 0) break;
      t += Math.max(0.3, t * 0.002);
    }
  }
  const f = (c) => (c / n * 100).toFixed(2) + '%';
  console.log(`| ${p.id} | ${f(cnt[1])} | ${f(cnt[2])} | ${f(cnt[3])} | ${f(cnt[4])} | ${f(cnt[1] + cnt[2])} | ${near < 1e9 ? Math.round(near) + ' m' : '-'} |`);
}
