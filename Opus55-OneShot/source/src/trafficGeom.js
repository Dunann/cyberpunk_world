// Mesh building helpers shared by the traffic, transit, air and sign modules.
// Vertex layout (40 bytes): position xyz, normal xyz, uv (meters along the face), material id, extra.
// Triangles are wound CCW seen from the side the normal points to (front faces).

export const VERTEX_LAYOUT = {
  arrayStride: 40,
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' },
    { shaderLocation: 1, offset: 12, format: 'float32x3' },
    { shaderLocation: 2, offset: 24, format: 'float32x2' },
    { shaderLocation: 3, offset: 32, format: 'float32x2' },
  ],
};

export class MeshBuilder {
  constructor() {
    this.v = [];
    this.idx = [];
  }

  get vertexCount() { return this.v.length / 10; }

  vert(px, py, pz, nx, ny, nz, u, v, mat, extra = 0) {
    this.v.push(px, py, pz, nx, ny, nz, u, v, mat, extra);
    return this.v.length / 10 - 1;
  }

  // Quad from 4 corner points [x,y,z] in order around the edge. Winding is fixed to face the normal n.
  // uvs: [[u,v] x4]
  quad(a, b, c, d, n, uvs, mat, extra = 0) {
    const i0 = this.vert(a[0], a[1], a[2], n[0], n[1], n[2], uvs[0][0], uvs[0][1], mat, extra);
    const i1 = this.vert(b[0], b[1], b[2], n[0], n[1], n[2], uvs[1][0], uvs[1][1], mat, extra);
    const i2 = this.vert(c[0], c[1], c[2], n[0], n[1], n[2], uvs[2][0], uvs[2][1], mat, extra);
    const i3 = this.vert(d[0], d[1], d[2], n[0], n[1], n[2], uvs[3][0], uvs[3][1], mat, extra);
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
    if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) this.idx.push(i0, i1, i2, i0, i2, i3);
    else this.idx.push(i0, i2, i1, i0, i3, i2);
  }

  tri(a, b, c, n, uvs, mat, extra = 0) {
    const i0 = this.vert(a[0], a[1], a[2], n[0], n[1], n[2], uvs[0][0], uvs[0][1], mat, extra);
    const i1 = this.vert(b[0], b[1], b[2], n[0], n[1], n[2], uvs[1][0], uvs[1][1], mat, extra);
    const i2 = this.vert(c[0], c[1], c[2], n[0], n[1], n[2], uvs[2][0], uvs[2][1], mat, extra);
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
    if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) this.idx.push(i0, i1, i2);
    else this.idx.push(i0, i2, i1);
  }

  // Oriented box. c = center, X/Y/Z unit axes (Y is usually up), h = half sizes.
  // Side faces get uv = (meters along the face, meters from the box bottom + v0); top/bottom uv = local xz meters.
  // faces: bitmask of faces to emit (1 +X, 2 -X, 4 +Y, 8 -Y, 16 +Z, 32 -Z).
  box(c, X, Y, Z, hx, hy, hz, mat, extra = 0, faces = 63, v0 = 0, u0 = 0) {
    const P = (sx, sy, sz) => [
      c[0] + X[0] * sx * hx + Y[0] * sy * hy + Z[0] * sz * hz,
      c[1] + X[1] * sx * hx + Y[1] * sy * hy + Z[1] * sz * hz,
      c[2] + X[2] * sx * hx + Y[2] * sy * hy + Z[2] * sz * hz,
    ];
    const vb = v0, vt = v0 + 2 * hy;
    if (faces & 1) this.quad(P(1, -1, -1), P(1, -1, 1), P(1, 1, 1), P(1, 1, -1), X, [[u0, vb], [u0 + 2 * hz, vb], [u0 + 2 * hz, vt], [u0, vt]], mat, extra);
    if (faces & 2) this.quad(P(-1, -1, 1), P(-1, -1, -1), P(-1, 1, -1), P(-1, 1, 1), neg(X), [[u0, vb], [u0 + 2 * hz, vb], [u0 + 2 * hz, vt], [u0, vt]], mat, extra);
    if (faces & 16) this.quad(P(1, -1, 1), P(-1, -1, 1), P(-1, 1, 1), P(1, 1, 1), Z, [[u0, vb], [u0 + 2 * hx, vb], [u0 + 2 * hx, vt], [u0, vt]], mat, extra);
    if (faces & 32) this.quad(P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1), neg(Z), [[u0, vb], [u0 + 2 * hx, vb], [u0 + 2 * hx, vt], [u0, vt]], mat, extra);
    if (faces & 4) this.quad(P(-1, 1, -1), P(1, 1, -1), P(1, 1, 1), P(-1, 1, 1), Y, [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]], mat, extra);
    if (faces & 8) this.quad(P(-1, -1, 1), P(1, -1, 1), P(1, -1, -1), P(-1, -1, -1), neg(Y), [[-hx, hz], [hx, hz], [hx, -hz], [-hx, -hz]], mat, extra);
  }

  // Axis-aligned-in-yaw box: center (x,y,z), yaw angle a (local x axis = (cos a, 0, sin a)).
  ybox(x, y, z, hx, hy, hz, a, mat, extra = 0, faces = 63, v0 = 0, u0 = 0) {
    const ca = Math.cos(a), sa = Math.sin(a);
    this.box([x, y, z], [ca, 0, sa], [0, 1, 0], [-sa, 0, ca], hx, hy, hz, mat, extra, faces, v0, u0);
  }

  // Box spanning between two points a and b (thickness w x h), "up" hint keeps the cross-section upright.
  beam(a, b, hw, hh, mat, extra = 0, faces = 63) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const L = Math.hypot(dx, dy, dz) || 1e-6;
    const Z = [dx / L, dy / L, dz / L];
    let up = Math.abs(Z[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    const X = norm(cross(up, Z));
    const Y = cross(Z, X);
    this.box([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], X, Y, Z, hw, hh, L / 2, mat, extra, faces);
  }

  // Vertical prism (n-gon) from y0 to y1 at (x,z) with radius r; optional cap faces.
  prism(x, z, y0, y1, r, n, mat, extra = 0, caps = true, phase = 0) {
    for (let i = 0; i < n; i++) {
      const a0 = phase + (i / n) * Math.PI * 2, a1 = phase + ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
      const p0 = [x + Math.cos(a0) * r, y0, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, y0, z + Math.sin(a1) * r];
      const p2 = [p1[0], y1, p1[2]], p3 = [p0[0], y1, p0[2]];
      const seg = 2 * Math.PI * r / n;
      this.quad(p0, p1, p2, p3, [Math.cos(am), 0, Math.sin(am)], [[i * seg, 0], [(i + 1) * seg, 0], [(i + 1) * seg, y1 - y0], [i * seg, y1 - y0]], mat, extra);
    }
    if (caps) {
      for (let i = 0; i < n; i++) {
        const a0 = phase + (i / n) * Math.PI * 2, a1 = phase + ((i + 1) / n) * Math.PI * 2;
        this.tri([x, y1, z], [x + Math.cos(a0) * r, y1, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, y1, z + Math.sin(a1) * r], [0, 1, 0], [[0, 0], [Math.cos(a0) * r, Math.sin(a0) * r], [Math.cos(a1) * r, Math.sin(a1) * r]], mat, extra);
      }
    }
  }

  // Sweep a closed or open 2D profile [[lat, up], ...] along a path of frames.
  // frames: [{p:[x,y,z], l:[x,y,z] (lateral unit, left), s (arc length)}]; profile edges become flat-shaded quads.
  sweep(frames, profile, mat, extra = 0, closed = true, matFn = null) {
    const ne = closed ? profile.length : profile.length - 1;
    for (let e = 0; e < ne; e++) {
      const A = profile[e], B = profile[(e + 1) % profile.length];
      const m = matFn ? matFn(e) : mat;
      // edge normal in profile space: rotate edge direction (dl, du) by -90 deg -> (du, -dl) (outward for CCW profile)
      const dl = B[0] - A[0], du = B[1] - A[1];
      const el = Math.hypot(dl, du) || 1;
      const nl = du / el, nu = -dl / el;
      let vacc = 0;
      for (let i = 0; i < frames.length - 1; i++) {
        const f0 = frames[i], f1 = frames[i + 1];
        const pt = (f, q) => [f.p[0] + f.l[0] * q[0], f.p[1] + q[1], f.p[2] + f.l[2] * q[0]];
        const n0 = [f0.l[0] * nl, nu, f0.l[2] * nl];
        const a = pt(f0, A), b = pt(f0, B), c = pt(f1, B), d = pt(f1, A);
        this.quad(a, b, c, d, norm(n0), [[f0.s, vacc], [f0.s, vacc + el], [f1.s, vacc + el], [f1.s, vacc]], m, extra);
      }
      vacc += el;
    }
  }

  append(o) {
    const base = this.vertexCount;
    for (let i = 0; i < o.v.length; i++) this.v.push(o.v[i]);
    for (let i = 0; i < o.idx.length; i++) this.idx.push(o.idx[i] + base);
  }

  upload(device, label) {
    const vb = device.createBuffer({ label: label + '-vb', size: Math.max(40, this.v.length * 4), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(vb, 0, new Float32Array(this.v));
    const ib = device.createBuffer({ label: label + '-ib', size: Math.max(16, this.idx.length * 4), usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(ib, 0, new Uint32Array(this.idx));
    return { vb, ib, count: this.idx.length };
  }
}

export function neg(a) { return [-a[0], -a[1], -a[2]]; }
export function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
export function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

// Storage buffer with initial data.
export function storageBuffer(device, data, label, extraUsage = 0) {
  const buf = device.createBuffer({ label, size: Math.max(16, (data.byteLength + 15) & ~15), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | extraUsage });
  device.queue.writeBuffer(buf, 0, data.buffer, data.byteOffset, data.byteLength);
  return buf;
}

// Bind group layout with n storage buffers (read-only) and optional extras, visible to vertex+fragment(+compute).
export function storageLayout(device, n, visibility = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT) {
  const entries = [];
  for (let i = 0; i < n; i++) entries.push({ binding: i, visibility, buffer: { type: 'read-only-storage' } });
  return device.createBindGroupLayout({ entries });
}

export function bindBuffers(device, layout, bufs) {
  return device.createBindGroup({ layout, entries: bufs.map((b, i) => ({ binding: i, resource: { buffer: b } })) });
}

// Camera cone test helper (no allocation): returns true if sphere (x,y,z,r) may be visible.
export function makeCamTest() {
  const s = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1, cosA: 0.5, sinA: 0.8 };
  s.set = (cam, aspect) => {
    s.x = cam.x; s.y = cam.y; s.z = cam.z;
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    s.fx = -sy * cp; s.fy = sp; s.fz = -cy * cp;
    const t = Math.tan(cam.fov / 2);
    const half = Math.atan(t * Math.hypot(1, aspect));
    s.cosA = Math.cos(half); s.sinA = Math.sin(half);
  };
  s.visible = (x, y, z, r) => {
    const dx = x - s.x, dy = y - s.y, dz = z - s.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < r) return true;
    const c = (dx * s.fx + dy * s.fy + dz * s.fz) / d;
    // angle between view axis and direction must be < half + asin(r/d)
    const sr = r / d, cr = Math.sqrt(Math.max(0, 1 - sr * sr));
    return c > s.cosA * cr - s.sinA * sr;
  };
  s.dist = (x, y, z) => Math.hypot(x - s.x, y - s.y, z - s.z);
  return s;
}
