// Point light list used by tiled deferred lighting (and available to forward shaders).
// Layout per light (32 bytes): vec4(pos.xyz, radius), vec4(color.rgb * intensity, flicker)
//   flicker: 0 = steady; > 0 = neon flicker seed (lighting applies a subtle buzz/flicker pattern).
//
// Static lights: call add() during init(); they are uploaded once by finalize().
// Dynamic lights: reserve(n) during init() returns a base index. Each frame either
//   - write CPU data with set(index, ...) (marks a dirty range, uploaded once per frame), or
//   - write directly into `buffer` from your own compute shader (binding it as storage, read_write).

import { MAX_LIGHTS } from './common.js';

export class Lights {
  constructor(device) {
    this.device = device;
    this.data = new Float32Array(MAX_LIGHTS * 8);
    this.count = 0;
    this.buffer = device.createBuffer({ size: MAX_LIGHTS * 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.dirtyLo = MAX_LIGHTS; this.dirtyHi = -1;
  }

  // Adds a static light; returns its index (or -1 when full).
  add(x, y, z, radius, r, g, b, flicker = 0) {
    if (this.count >= MAX_LIGHTS) return -1;
    const i = this.count++;
    this.set(i, x, y, z, radius, r, g, b, flicker);
    return i;
  }

  // Reserves n consecutive dynamic lights (initially disabled: radius 0). Returns base index.
  reserve(n) {
    const base = this.count;
    n = Math.min(n, MAX_LIGHTS - this.count);
    for (let i = 0; i < n; i++) this.set(base + i, 0, -1e5, 0, 0, 0, 0, 0, 0);
    this.count += n;
    return base;
  }

  set(i, x, y, z, radius, r, g, b, flicker = 0) {
    const o = i * 8, d = this.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = radius;
    d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = flicker;
    if (i < this.dirtyLo) this.dirtyLo = i;
    if (i > this.dirtyHi) this.dirtyHi = i;
  }

  // Uploads changed lights. Called by the renderer once per frame.
  flush() {
    if (this.dirtyHi < this.dirtyLo) return;
    const lo = this.dirtyLo, hi = this.dirtyHi + 1;
    this.device.queue.writeBuffer(this.buffer, lo * 32, this.data.buffer, lo * 32, (hi - lo) * 32);
    this.dirtyLo = MAX_LIGHTS; this.dirtyHi = -1;
  }
}
