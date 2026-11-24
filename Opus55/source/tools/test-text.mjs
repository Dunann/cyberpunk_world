// Unit checks for the tower phrase show geometry (src/buildings_text.js). Run: node tools/test-text.mjs
import assert from 'node:assert/strict';
import { partFaces, fitSlot, chunkSizes, blocked, faceWater, RULE } from '../src/buildings_text.js';

const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const part = (o) => ({ i: 0, x: 0, y0: 0, z: 0, a: 0, hw: 15, hd: 12, h: 200, kind: 0, prm: 0, taper: 1, twist: 0, lx: 0, lz: 0, prof: 0, flags: 0, mat: 3, baseY: 0, ...o });

// Box faces: four outward normals, widths across each face, slot centred on the face (uC = 0).
{
  const f = partFaces(part({}), []);
  assert.equal(f.length, 4);
  const byDir = (x, z) => f.find((q) => near(q.D[0], x) && near(q.D[1], z));
  assert.equal(byDir(0, 1).W, 30);   // +z face spans 2 hw
  assert.equal(byDir(1, 0).W, 24);   // +x face spans 2 hd
  for (const q of f) assert.ok(near(q.uC, 0));
}

// Rotation follows Builder.tw / WGSL rot2: local +x at angle a points to (cos a, sin a).
{
  const a = 0.5;
  const f = partFaces(part({ a }), []);
  assert.ok(f.some((q) => near(q.D[0], Math.cos(a)) && near(q.D[1], Math.sin(a))));
}

// Rounded rectangles (FLAG.ROUND in the generator) are still treated as four flat faces of full projected width.
{
  const f = partFaces(part({ prm: 0.45 }), []);
  assert.equal(f.length, 4);
  assert.equal(Math.max(...f.map((q) => q.W)), 30);
}

// Triangle (ringEval kind 4): outward normals, face widths are the edge lengths, uC is the face midpoint offset.
{
  const f = partFaces(part({ kind: 4, hw: 13, hd: 26 }), []);
  assert.equal(f.length, 3);
  const verts = [[13, -26], [13, 26], [-13, 0]];
  for (const q of f) {
    // outward: the centre lies behind the face, and exactly two vertices lie on the face line
    const on = verts.map((v) => v[0] * q.D[0] + v[1] * q.D[1]);
    const planeD = Math.max(...on);
    assert.ok(planeD > 0);
    assert.equal(on.filter((d) => near(d, planeD, 1e-6)).length, 2);
    // uC: the face midpoint projected on the tangent T = (D.z, -D.x)
    const ends = verts.filter((v, k) => near(on[k], planeD, 1e-6));
    const mid = [(ends[0][0] + ends[1][0]) / 2, (ends[0][1] + ends[1][1]) / 2];
    assert.ok(near(q.uC, mid[0] * q.D[1] - mid[1] * q.D[0]));
  }
  assert.ok(f.some((q) => near(q.W, 52)));
}

// Cylinders offer the marched water directions; twisted or profiled parts offer nothing.
{
  const dirs = [[1, 0], [0, 1]];
  const f = partFaces(part({ kind: 2, prm: 48, hw: 20, hd: 20 }), dirs);
  assert.equal(f.length, 2);
  assert.equal(f[0].fill, RULE.roundFill);
  assert.equal(partFaces(part({ twist: 0.8 }), dirs).length, 0);
  assert.equal(partFaces(part({ prof: 2 }), dirs).length, 0);
}

// Slot fitting: size from the face width, shrunk by taper at the slot's top edge, kept below the part top.
{
  const p = part({ h: 200 });
  const f = { W: 30, fill: RULE.flatFill };
  const s = fitSlot(p, f, 0);
  assert.ok(near(s.g, 30 * RULE.flatFill));
  assert.ok(s.yC + 0.5 * s.g <= p.y0 + p.h);
  const tapered = fitSlot(part({ h: 200, taper: 0.7 }), f, 0);
  assert.ok(tapered.g < s.g * 0.8 && tapered.g > s.g * 0.7);
  assert.equal(fitSlot(part({ h: 200, taper: 0.5 }), f, 0), null);                       // too narrow at the top
  assert.equal(fitSlot(part({ hw: 6, hd: 6 }), { W: 12, fill: RULE.flatFill }, 0), null);   // too narrow
  assert.equal(fitSlot(part({ h: 30 }), f, 0), null);                                      // too short above the base
}

// Phrase chunking: 2-4 characters, lone towers get none.
assert.deepEqual(chunkSizes(1), []);
assert.deepEqual(chunkSizes(4), [4]);
assert.deepEqual(chunkSizes(5), [3, 2]);
assert.deepEqual(chunkSizes(8), [4, 4]);
assert.deepEqual(chunkSizes(9), [3, 3, 3]);
for (let n = 2; n < 40; n++) for (const k of chunkSizes(n)) assert.ok(k >= 2 && k <= 4);

// Front row: a tower between the face and the water blocks it; one beside or behind does not.
{
  const t = { x: 0, z: 0 };
  const f = { D: [0, 1], W: 30 };
  assert.equal(blocked([{ x: 0, z: 100, r: 15 }], t, f, 300), true);
  assert.equal(blocked([{ x: 80, z: 100, r: 15 }], t, f, 300), false);
  assert.equal(blocked([{ x: 0, z: -100, r: 15 }], t, f, 300), false);
  assert.equal(blocked([{ x: 0, z: 500, r: 15 }], t, f, 300), false);   // beyond the water
}

// Water in front of a face: only directions within the cone count.
{
  const hits = [{ d: [1, 0], s: 100 }, { d: [0, 1], s: 300 }, { d: [-1, 0], s: Infinity }];
  assert.equal(faceWater(hits, [0, 1]), 300);
  assert.equal(faceWater(hits, [1, 0]), 100);
  assert.equal(faceWater(hits, [-1, 0]), Infinity);
}

console.log('test-text: all checks passed');
