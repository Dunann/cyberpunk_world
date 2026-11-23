// WebGPU device setup and GPU timestamp profiler.

export async function initGPU(canvas) {
  if (!navigator.gpu) throw new Error('WebGPU is not available in this browser.');
  let adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No WebGPU adapter found.');

  const wanted = ['timestamp-query', 'float32-filterable', 'rg11b10ufloat-renderable'];
  const requiredFeatures = wanted.filter((f) => adapter.features.has(f));
  const L = adapter.limits;
  const device = await adapter.requestDevice({
    requiredFeatures,
    requiredLimits: {
      maxStorageBufferBindingSize: L.maxStorageBufferBindingSize,
      maxBufferSize: L.maxBufferSize,
      maxStorageBuffersPerShaderStage: Math.min(L.maxStorageBuffersPerShaderStage, 10),
      maxComputeWorkgroupStorageSize: L.maxComputeWorkgroupStorageSize,
      maxComputeInvocationsPerWorkgroup: Math.min(L.maxComputeInvocationsPerWorkgroup, 1024),
      maxColorAttachmentBytesPerSample: Math.min(L.maxColorAttachmentBytesPerSample, 64),
      maxSampledTexturesPerShaderStage: Math.min(L.maxSampledTexturesPerShaderStage, 16),
      maxStorageTexturesPerShaderStage: Math.min(L.maxStorageTexturesPerShaderStage, 8),
    },
  });
  const info = adapter.info || {};
  const format = navigator.gpu.getPreferredCanvasFormat();
  const context = canvas.getContext('webgpu');
  context.configure({ device, format, alphaMode: 'opaque', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });

  device.lost.then((e) => { console.error('WebGPU device lost:', e.message); window.__deviceLost = e.message; });
  device.addEventListener && device.addEventListener('uncapturederror', (e) => {
    console.error('WebGPU error:', e.error.message);
    (window.__gpuErrors ||= []).push(e.error.message);
  });

  return {
    adapter, device, context, format, features: device.features,
    adapterName: [info.vendor, info.architecture, info.description || info.device].filter(Boolean).join(' '),
    vendor: info.vendor || '',
  };
}

// Records one begin/end timestamp pair per named pass. Results are averaged over a window.
// Only active when enabled (stats overlay or benchmark), so normal play has no readback cost.
export class Profiler {
  constructor(device, maxPasses = 48) {
    this.device = device;
    this.supported = device.features.has('timestamp-query');
    this.enabled = false;
    this.max = maxPasses;
    this.names = [];          // pass names in the order they were recorded this frame
    this.count = 0;
    this.lastNames = [];
    this.gpuTotal = 0;        // ms, latest frame
    this.passMs = new Map();  // name -> smoothed ms
    this.frameAcc = new Map(); // name -> ms summed over the latest frame
    this.onFrame = null;      // callback(totalMs, Map name->ms, spanMs) for benchmarks
    this.msScratch = new Float64Array(maxPasses);
    if (!this.supported) return;
    this.querySet = device.createQuerySet({ type: 'timestamp', count: maxPasses * 2 });
    this.resolveBuf = device.createBuffer({ size: maxPasses * 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
    this.ring = [];
    for (let i = 0; i < 4; i++) {
      this.ring.push({ buf: device.createBuffer({ size: maxPasses * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }), busy: false, names: [], count: 0 });
    }
    this.descCache = [];
    for (let i = 0; i < maxPasses; i++) {
      this.descCache.push({ querySet: this.querySet, beginningOfPassWriteIndex: i * 2, endOfPassWriteIndex: i * 2 + 1 });
    }
  }

  beginFrame() { this.count = 0; }

  // Returns a timestampWrites object for a pass descriptor, or undefined.
  ts(name) {
    if (!this.enabled || !this.supported || this.count >= this.max) return undefined;
    this.names[this.count] = name;
    return this.descCache[this.count++];
  }

  endFrame(encoder) {
    if (!this.enabled || !this.supported || this.count === 0) return null;
    const slot = this.ring.find((r) => !r.busy);
    if (!slot) return null;
    encoder.resolveQuerySet(this.querySet, 0, this.count * 2, this.resolveBuf, 0);
    encoder.copyBufferToBuffer(this.resolveBuf, 0, slot.buf, 0, this.count * 16);
    slot.count = this.count;
    for (let i = 0; i < this.count; i++) slot.names[i] = this.names[i];
    return slot;
  }

  afterSubmit(slot) {
    if (!slot) return;
    slot.busy = true;
    slot.buf.mapAsync(GPUMapMode.READ, 0, slot.count * 16).then(() => {
      const t = new BigInt64Array(slot.buf.getMappedRange(0, slot.count * 16));
      let total = 0;
      let first = null, last = null;
      for (const k of this.frameAcc.keys()) this.frameAcc.set(k, 0);
      for (let i = 0; i < slot.count; i++) {
        const b = t[i * 2], e = t[i * 2 + 1];
        const ms = e > b ? Number(e - b) / 1e6 : 0;
        this.msScratch[i] = ms;
        total += ms;
        if (b > 0n && (first === null || b < first)) first = b;
        if (e > 0n && (last === null || e > last)) last = e;
        const name = slot.names[i];
        this.frameAcc.set(name, (this.frameAcc.get(name) || 0) + ms);
      }
      for (const [name, ms] of this.frameAcc) {
        const prev = this.passMs.get(name);
        this.passMs.set(name, prev === undefined ? ms : prev * 0.95 + ms * 0.05);
      }
      // Frame GPU time = sum of pass durations (gaps between passes excluded).
      this.gpuTotal = total;
      this.span = first !== null && last !== null ? Number(last - first) / 1e6 : total;
      slot.buf.unmap();
      slot.busy = false;
      if (this.onFrame) this.onFrame(total, this.frameAcc, this.span);
    }).catch(() => { slot.busy = false; });
  }
}

// Helper: create a buffer with initial data.
export function bufferWithData(device, data, usage) {
  const buf = device.createBuffer({ size: Math.max(16, (data.byteLength + 3) & ~3), usage: usage | GPUBufferUsage.COPY_DST, mappedAtCreation: true });
  const dst = new Uint8Array(buf.getMappedRange());
  dst.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  buf.unmap();
  return buf;
}

// Helper: compile a shader module and log compilation errors with line context.
export function shader(device, code, label) {
  const m = device.createShaderModule({ code, label });
  if (m.getCompilationInfo) {
    m.getCompilationInfo().then((info) => {
      for (const msg of info.messages) {
        if (msg.type === 'error') {
          const lines = code.split('\n');
          const ln = msg.lineNum;
          const ctx = lines.slice(Math.max(0, ln - 3), ln + 2).map((l, i) => `${ln - 2 + i}: ${l}`).join('\n');
          console.error(`WGSL error in ${label} (${ln}:${msg.linePos}): ${msg.message}\n${ctx}`);
          (window.__gpuErrors ||= []).push(`${label}: ${msg.message}`);
        }
      }
    });
  }
  return m;
}
