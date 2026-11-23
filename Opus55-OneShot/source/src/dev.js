// Dev-only tools (not in index.html): frame capture, viewpoint control, fly-through and benchmark.
//   window.__capture()            -> Promise<base64 PNG> of the next presented frame (full internal resolution)
//   window.__setPose(i, t)        -> jump to viewpoint i (0-based) and set scene time t
//   window.__frames(n)            -> Promise resolved after n frames
//   window.__bench(seconds)       -> Promise<report> runs the scripted fly-through and collects GPU/frame timings
//   window.__flyTo(u)             -> place the camera at fly-through parameter u (0..1)
//   F key: play fly-through. B key: benchmark (results in console).

import { catmullRom } from './math.js';

// Fly-through keyframes: [x, y, z]; y is absolute meters.
const PATH = [
  [450, 330, 2050], [600, 160, 1300], [420, 80, 650], [260, 70, 120], [-200, 60, -500],
  [-700, 55, -350], [-1100, 45, -650], [-600, 90, -1150], [300, 130, -1900], [850, 90, -2500],
  [1450, 70, -2050], [1900, 30, -1300], [1980, 25, -700], [2450, 120, -900], [3000, 220, -1100],
  [3350, 300, -1550], [3000, 230, -2050], [2300, 200, -1400], [1400, 230, -300], [200, 220, 800],
  [-900, 160, 1500], [-1500, 80, 2050], [-2000, 50, 2400], [-2300, 90, 2800],
];

export function install(ctx, renderer) {
  const device = ctx.device;
  let pendingCapture = null;
  let frameWaiters = [];
  const fmt = ctx.gpu.format;

  const pts = catmullRom(PATH, 24);
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  const total = lens[lens.length - 1];
  const pathAt = (u, out) => {
    const s = Math.min(Math.max(u, 0), 1) * total;
    let i = 1;
    while (i < lens.length - 1 && lens[i] < s) i++;
    const t = (s - lens[i - 1]) / Math.max(lens[i] - lens[i - 1], 1e-6);
    for (let k = 0; k < 3; k++) out[k] = pts[i - 1][k] + (pts[i][k] - pts[i - 1][k]) * t;
    return out;
  };
  const camOverride = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: 1.05, near: 0.25 };
  const pA = [0, 0, 0], pB = [0, 0, 0];
  let fly = null; // {start, duration, onDone}
  const flyTo = (u) => {
    pathAt(u, pA); pathAt(Math.min(u + 0.012, 1), pB);
    if (u >= 0.988) { pathAt(0.988, pA); pathAt(1, pB); pathAt(u, pA); }
    const dx = pB[0] - pA[0], dy = pB[1] - pA[1], dz = pB[2] - pA[2];
    const g = ctx.world.heightAt(pA[0], pA[2]);
    camOverride.x = pA[0]; camOverride.y = Math.max(pA[1], g + 8); camOverride.z = pA[2];
    camOverride.yaw = Math.atan2(-dx, -dz);
    camOverride.pitch = Math.atan2(dy, Math.hypot(dx, dz)) - 0.12;
    ctx.camOverride = camOverride;
  };

  ctx.frameCallbacks.push((c) => {
    if (fly) {
      const u = (performance.now() - fly.start) / 1000 / fly.duration;
      if (u >= 1) { const done = fly.onDone; fly = null; ctx.camOverride = null; done && done(); }
      else flyTo(u);
    }
  });

  ctx.onBeforeSubmit = (enc, swap) => {
    if (!pendingCapture || pendingCapture.buf) return;
    const w = swap.width, h = swap.height;
    const bpr = Math.ceil(w * 4 / 256) * 256;
    const buf = device.createBuffer({ size: bpr * h, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    enc.copyTextureToBuffer({ texture: swap }, { buffer: buf, bytesPerRow: bpr }, [w, h]);
    pendingCapture.buf = buf; pendingCapture.w = w; pendingCapture.h = h; pendingCapture.bpr = bpr;
  };
  ctx.onAfterSubmit = () => {
    const ws = frameWaiters;
    if (ws.length) {
      frameWaiters = [];
      for (const w of ws) { if (--w.n <= 0) w.resolve(); else frameWaiters.push(w); }
    }
    if (pendingCapture && pendingCapture.buf && !pendingCapture.mapping) {
      const pc = pendingCapture;
      pc.mapping = true;
      pc.buf.mapAsync(GPUMapMode.READ).then(async () => {
        const src = new Uint8Array(pc.buf.getMappedRange());
        const img = new ImageData(pc.w, pc.h);
        const bgra = fmt === 'bgra8unorm';
        for (let y = 0; y < pc.h; y++) {
          const so = y * pc.bpr, dO = y * pc.w * 4;
          for (let x = 0; x < pc.w; x++) {
            const s = so + x * 4, d = dO + x * 4;
            img.data[d] = src[s + (bgra ? 2 : 0)]; img.data[d + 1] = src[s + 1]; img.data[d + 2] = src[s + (bgra ? 0 : 2)]; img.data[d + 3] = 255;
          }
        }
        pc.buf.unmap(); pc.buf.destroy();
        const oc = new OffscreenCanvas(pc.w, pc.h);
        oc.getContext('2d').putImageData(img, 0, 0);
        const blob = await oc.convertToBlob({ type: pc.type || 'image/png', quality: 0.92 });
        const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
        pendingCapture = null;
        pc.resolve(b64);
      });
    }
  };

  window.__frames = (n) => new Promise((resolve) => frameWaiters.push({ n, resolve }));
  window.__capture = (type) => new Promise((resolve) => { pendingCapture = { resolve, type }; });
  window.__setPose = (i, t) => {
    ctx.camOverride = null;
    if (t !== undefined) ctx.time = t;
    ctx.gotoPose(i);
    renderer.resetHistory = true;
  };
  window.__flyTo = (u) => { flyTo(u); renderer.resetHistory = true; };
  window.__setCam = (x, y, z, yaw, pitch) => {
    camOverride.x = x; camOverride.y = y; camOverride.z = z; camOverride.yaw = yaw; camOverride.pitch = pitch;
    ctx.camOverride = camOverride; renderer.resetHistory = true;
  };
  window.__poses = ctx.world.poses.map((p) => ({ name: p.name, t: p.t, ...p.resolved }));
  window.__errors = () => window.__gpuErrors || [];
  // Smoothed GPU time per pass (ms). Enables the profiler on first call; wait ~120 frames for stable values.
  window.__gpuStats = () => { ctx.prof.enabled = true; const o = { total: ctx.prof.gpuTotal }; for (const [k, v] of ctx.prof.passMs) o[k] = +v.toFixed(3); return o; };
  window.__info = () => ({ adapter: ctx.gpu.adapterName, vendor: ctx.gpu.vendor, format: fmt, lights: ctx.lights.count, timestamp: ctx.prof.supported, lots: ctx.world.lots.length });

  window.__bench = (seconds = 60) => new Promise((resolve) => {
    const gpu = [], frames = [], passes = {};
    let lastT = performance.now();
    const heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
    let heapMax = heap0;
    let samples = 0;
    ctx.benchmarking = true;
    ctx.prof.enabled = true;
    const wasFrozen = ctx.frozen; ctx.frozen = false;
    ctx.prof.onFrame = (total, acc) => {
      gpu.push(total);
      for (const [k, v] of acc) (passes[k] ||= []).push(v);
    };
    const tick = () => {
      const now = performance.now();
      frames.push(now - lastT); lastT = now;
      if (performance.memory && (++samples % 30) === 0) heapMax = Math.max(heapMax, performance.memory.usedJSHeapSize);
    };
    ctx.frameCallbacks.push(tick);
    fly = { start: performance.now(), duration: seconds, onDone: () => {
      ctx.frameCallbacks.splice(ctx.frameCallbacks.indexOf(tick), 1);
      ctx.prof.onFrame = null;
      ctx.benchmarking = false;
      ctx.frozen = wasFrozen;
      const stat = (arr) => {
        const s = [...arr].sort((a, b) => a - b);
        const avg = arr.reduce((a, b) => a + b, 0) / Math.max(arr.length, 1);
        return { avg, p50: s[Math.floor(s.length * 0.5)] || 0, p99: s[Math.floor(s.length * 0.99)] || 0, max: s[s.length - 1] || 0, n: arr.length };
      };
      // skip the first 2 seconds of samples (pipeline warmup)
      const skipF = Math.min(frames.length - 1, Math.round(frames.length * 2 / seconds));
      const skipG = Math.min(gpu.length - 1, Math.round(gpu.length * 2 / seconds));
      const passStats = {};
      for (const k in passes) passStats[k] = stat(passes[k].slice(skipG));
      resolve({
        seconds, adapter: ctx.gpu.adapterName,
        resolution: [renderer.width, renderer.height],
        quality: ctx.quality.name,
        gpu: stat(gpu.slice(skipG)), frame: stat(frames.slice(skipF)), passes: passStats,
        heapStartMB: heap0 / 1048576, heapMaxMB: heapMax / 1048576,
        heapEndMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0,
        lights: ctx.lights.count,
        errors: window.__gpuErrors || [],
      });
    } };
  });

  addEventListener('keydown', (e) => {
    if (e.code === 'KeyF') { fly = fly ? null : { start: performance.now(), duration: 60, onDone: null }; if (!fly) ctx.camOverride = null; }
    if (e.code === 'KeyB') window.__bench(60).then((r) => console.log('benchmark', r));
  });
}
