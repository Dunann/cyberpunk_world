// Unit checks for the tower phrase show (src/buildings_text.js). Run: node tools/test-text.mjs
import assert from 'node:assert/strict';
import { partFaces, fitBand, fitPhrase, choosePhrases, pickText, blocked, faceWater, signedField, RULE, PHRASES } from '../src/buildings_text.js';

const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const part = (o) => ({ i: 0, x: 0, y0: 0, z: 0, a: 0, hw: 15, hd: 12, h: 200, kind: 0, prm: 0, taper: 1, twist: 0, lx: 0, lz: 0, prof: 0, flags: 0, mat: 3, baseY: 0, ...o });

// ---------------------------------------------------------------- faces
// Box: four outward normals, widths across each face, slot centred on the face (uC = 0).
{
  const f = partFaces(part({}));
  assert.equal(f.length, 4);
  const byDir = (x, z) => f.find((q) => near(q.D[0], x) && near(q.D[1], z));
  assert.equal(byDir(0, 1).W, 30);   // +z face spans 2 hw
  assert.equal(byDir(1, 0).W, 24);   // +x face spans 2 hd
  for (const q of f) assert.ok(near(q.uC, 0));
  assert.deepEqual(byDir(0, 1).m.map(Math.round), [0, 12]);
}

// Rotation follows Builder.tw / WGSL rot2: local +x at angle a points to (cos a, sin a).
{
  const a = 0.5;
  const f = partFaces(part({ a }));
  assert.ok(f.some((q) => near(q.D[0], Math.cos(a)) && near(q.D[1], Math.sin(a))));
}

// Rounded rectangles: usable width = straight part + half of each corner = 2 hw - r.
{
  const f = partFaces(part({ prm: 0.5 }));   // r = 0.5 x 12 = 6
  assert.equal(f.length, 4);
  assert.equal(Math.max(...f.map((q) => q.W)), 24);
}

// Triangle (ringEval kind 4): outward normals, face widths are the edge lengths, uC is the face midpoint offset.
{
  const f = partFaces(part({ kind: 4, hw: 13, hd: 26 }));
  assert.equal(f.length, 3);
  const verts = [[13, -26], [13, 26], [-13, 0]];
  for (const q of f) {
    const on = verts.map((v) => v[0] * q.D[0] + v[1] * q.D[1]);
    const planeD = Math.max(...on);
    assert.ok(planeD > 0);
    assert.equal(on.filter((d) => near(d, planeD, 1e-6)).length, 2);
    const ends = verts.filter((v, k) => near(on[k], planeD, 1e-6));
    const mid = [(ends[0][0] + ends[1][0]) / 2, (ends[0][1] + ends[1][1]) / 2];
    assert.ok(near(q.uC, mid[0] * q.D[1] - mid[1] * q.D[0]));
  }
  assert.ok(f.some((q) => near(q.W, 52)));
}

// Regular hexagon (ringEval kind 2, N = 6): six faces of width 2 r tan(pi / 6), normals perpendicular to the edges.
{
  const f = partFaces(part({ kind: 2, prm: 6, hw: 20, hd: 20 }));
  assert.equal(f.length, 6);
  for (const q of f) {
    assert.ok(near(q.W, 40 * Math.tan(Math.PI / 6), 1e-9));
    assert.ok(near(q.m[0] * q.D[0] + q.m[1] * q.D[1], 20, 1e-9));   // the midpoint lies on the face plane
    assert.ok(near(q.m[0] * q.D[1] - q.m[1] * q.D[0], 0, 1e-9));    // and in the middle of the face
  }
}

// Round plans, twisted and profiled parts have no flat faces.
{
  assert.equal(partFaces(part({ kind: 2, prm: 48, hw: 20, hd: 20 })).length, 0);
  assert.equal(partFaces(part({ kind: 3, prm: 6.3 })).length, 0);
  assert.equal(partFaces(part({ twist: 0.8 })).length, 0);
  assert.equal(partFaces(part({ prof: 2 })).length, 0);
}

// ---------------------------------------------------------------- one band, margins
const opt = (p, f, lo = p.y0 + RULE.minBase) => ({ p, f, lo });
{
  const p = part({ h: 200 });
  const f = { W: 30, m: [0, 12], D: [0, 1], uC: 0 };
  const b = fitBand([opt(p, f)]);
  // face width >= slot + a margin on both sides; slot below the part top with a margin
  assert.ok(b.g * (1 + 2 * RULE.sideMargin) <= 30 + 1e-9);
  assert.ok(b.yC + 0.5 * b.g + RULE.vMargin * b.g <= 200 + 1e-9);
  // a narrower face in the same phrase sets the size for all, and the lowest top sets the height
  const q = part({ h: 150, x: 60 });
  const b2 = fitBand([opt(p, f), opt(q, { ...f, W: 22 })]);
  assert.ok(b2.g * (1 + 2 * RULE.sideMargin) <= 22 + 1e-9 && b2.g > 15);
  assert.ok(b2.yC + 0.5 * b2.g <= 150);
  // taper: the face is narrower at the top of the slot
  const tp = fitBand([opt(part({ h: 200, taper: 0.7 }), f)]);
  assert.ok(tp.g < b.g);
  // too narrow or too short for the smallest slot
  assert.equal(fitBand([opt(part({}), { ...f, W: RULE.minGlyph })]), null);
  assert.equal(fitBand([opt(part({ h: RULE.minBase + 10 }), f)]), null);
}

// ---------------------------------------------------------------- phrases: order, normals, spacing, holes
// Camera convention (math.js fromYawPitch): yaw 0 looks along -z; right = (cos yaw, 0, -sin yaw).
function orderSeen(camPos, target, pts) {
  const dx = target[0] - camPos[0], dz = target[2] - camPos[2];
  const yaw = Math.atan2(-dx, -dz), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const fx = -sy, fz = -cy, rx = cy, rz = -sy;
  return pts.map((p, k) => {
    const ox = p[0] - camPos[0], oz = p[2] - camPos[2];
    return { k, sx: (ox * rx + oz * rz) / (ox * fx + oz * fz) };
  }).sort((a, b) => a.sx - b.sx).map((q) => q.k);
}

const tower = (x, z, o = {}) => {
  const t = { x, z, top: 200 };
  const p = part({ x, z, ...o });
  const f = partFaces(p).find((q) => near(q.D[0], o.D ? o.D[0] : 0, 0.3) && near(q.D[1], o.D ? o.D[1] : 1, 0.3));
  return { t, p, f, lo: RULE.minBase, along: x, district: o.district || 'A' };
};
// a row of four towers facing +z (the water lies at +z), 90 m apart, one 20 m further back
{
  const row = [tower(180, 0), tower(0, 0), tower(90, -20), tower(270, 0)];
  const ph = fitPhrase(row);
  assert.ok(ph);
  const g = ph.g;
  assert.ok(ph.list.every((o) => near(o.c[0], o.p.x, 1e-9)));
  // one size and one band for every character
  assert.ok(g >= RULE.minGlyph);
  // reading order: left to right for a viewer on the water (+z) looking at the bank
  const C = [135, ph.yC, 12];
  const pts = ph.list.map((o) => [o.c[0], ph.yC, o.c[1]]);
  for (const [cx, cz] of [[0, 600], [Math.sin(0.7) * 600, Math.cos(0.7) * 600], [-Math.sin(0.7) * 600, Math.cos(0.7) * 600], [0, 150]]) {
    for (const cy of [10, 250]) {
      assert.deepEqual(orderSeen([C[0] + cx, cy, C[2] + cz], C, pts), [0, 1, 2, 3]);
    }
  }
  assert.deepEqual(ph.list.map((o) => o.p.x), [0, 90, 180, 270]);
}
// mirrored bank: the water at -z, faces -z; left to right for that viewer is decreasing x
{
  const row = [0, 90, 180].map((x) => tower(x, 0, { D: [0, -1] }));
  const ph = fitPhrase(row);
  assert.deepEqual(ph.list.map((o) => o.p.x), [180, 90, 0]);
  const C = [90, ph.yC, -12];
  assert.deepEqual(orderSeen([90, 250, -600], C, ph.list.map((o) => [o.c[0], ph.yC, o.c[1]])), [0, 1, 2]);
}
// rejections: normals more than 25 degrees apart, too deep an offset, uneven or too wide spacing, a hole
{
  const a = 30 * Math.PI / 180;
  const turned = { t: { x: 90, z: 0, top: 200 }, p: part({ x: 90, a }), lo: RULE.minBase, along: 90, district: 'A' };
  turned.f = partFaces(turned.p).find((q) => q.D[1] > 0.8);
  assert.equal(fitPhrase([tower(0, 0), turned]), null);
  assert.equal(fitPhrase([tower(0, 0), tower(90, -60)]), null);                       // depth offset > 0.45 x spacing
  assert.equal(fitPhrase([tower(0, 0), tower(60, 0), tower(260, 0)]), null);        // uneven
  assert.equal(fitPhrase([tower(0, 0), tower(400, 0)]), null);                       // too far apart
  assert.equal(fitPhrase([tower(0, 0), tower(20, 0)]), null);                        // too close
  assert.ok(fitPhrase([tower(0, 0), tower(140, 0)]));
  const others = [{ t: { x: 70, z: 0, top: 200 } }];
  assert.equal(fitPhrase([tower(0, 0), tower(140, 0)], others), null);              // a tower between them in the row
  const behind = [{ t: { x: 70, z: -80, top: 200 } }];
  assert.ok(fitPhrase([tower(0, 0), tower(140, 0)], behind));                       // a tower behind the row is fine
}

// ---------------------------------------------------------------- choice: no repeated characters, few per district
{
  const mk = (x0, n, d) => Array.from({ length: n }, (_, k) => {
    const o = tower(x0 + k * 90, 0, { district: d });
    return { t: o.t, along: o.along, opts: [o] };
  });
  // one district, three separate runs of 4 towers on one bank, far apart
  const banks = new Map([['0:1', [...mk(0, 4, 'A'), ...mk(2000, 4, 'A'), ...mk(4000, 4, 'A')]]]);
  const { kept } = choosePhrases(banks);
  assert.equal(kept.length, RULE.perDistrict);
  const chars = kept.flatMap((k) => [...k.text]);
  assert.equal(new Set(chars).size, chars.length);   // no character repeated in the district
  for (const k of kept) {
    assert.equal(new Set(k.list.map((o) => o.t)).size, k.list.length);
    assert.ok(k.list.every((o) => o.district === 'A'));
  }
  // phrases on one bank keep a gap along the bank
  const close = new Map([['0:1', [...mk(0, 2, 'B'), ...mk(400, 2, 'C')]]]);
  assert.equal(choosePhrases(close).kept.length, 1);
}
// text choice avoids characters already used in the district, prefers unused texts
{
  const used = new Map([['A', new Set([...'山城'])]]);
  for (let h = 0; h < 1; h += 0.05) {
    const t = pickText(3, ['A'], used, new Set(), h);
    assert.ok(![...t].some((c) => '山城'.includes(c)));
  }
  assert.equal(pickText(4, ['A'], new Map([['A', new Set([...'山江城千'])]]), new Set(), 0.3), null);
  for (const K of [2, 3, 4]) for (const p of PHRASES[K]) assert.equal(new Set([...p]).size, K);
}

// ---------------------------------------------------------------- front row
{
  const t = { x: 0, z: 0 };
  const f = { D: [0, 1], W: 30 };
  assert.equal(blocked([{ x: 0, z: 100, r: 15 }], t, f, 300), true);
  assert.equal(blocked([{ x: 80, z: 100, r: 15 }], t, f, 300), false);
  assert.equal(blocked([{ x: 0, z: -100, r: 15 }], t, f, 300), false);
  assert.equal(blocked([{ x: 0, z: 500, r: 15 }], t, f, 300), false);   // beyond the water
}
{
  const hits = [{ d: [1, 0], s: 100 }, { d: [0, 1], s: 300 }, { d: [-1, 0], s: Infinity }];
  assert.equal(faceWater(hits, [0, 1]), 300);
  assert.equal(faceWater(hits, [1, 0]), 100);
  assert.equal(faceWater(hits, [-1, 0]), Infinity);
}

// ---------------------------------------------------------------- distance field
{
  // a 32 x 32 square in a 64 x 64 mask: positive inside, negative outside, zero on the edge (output at 32 x 32)
  const n = 64, cov = new Float32Array(n * n);
  for (let y = 16; y < 48; y++) for (let x = 16; x < 48; x++) cov[y * n + x] = 1;
  const sd = signedField(cov, n), m = 32;
  assert.ok(sd[16 * m + 16] > 7);                 // centre: ~8 output texels inside
  assert.ok(sd[2 * m + 2] < -5);                  // corner region: outside
  assert.ok(Math.abs(sd[16 * m + 8]) < 0.6);      // on the left edge
  // monotone across the edge
  for (let x = 2; x < 16; x++) assert.ok(sd[16 * m + x] > sd[16 * m + x - 1]);
}

console.log('test-text: all checks passed');
