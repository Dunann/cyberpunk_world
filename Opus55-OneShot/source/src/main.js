// Entry point: sets up WebGPU, generates the world, initializes scene modules and runs the frame loop.

import { initGPU, Profiler } from './gpu.js';
import { World, showState } from './world.js';
import { Renderer } from './renderer.js';
import { Lights } from './lights.js';
import { Controls } from './controls.js';
import { Quality } from './quality.js';

import sky from './sky.js';
import fog from './fog.js';
import terrain from './terrain.js';
import garden from './garden.js';
import buildings from './buildings.js';
import water from './water.js';
import bridges from './bridges.js';
import vegetation from './vegetation.js';
import signs from './signs.js';
import traffic from './traffic.js';
import lightshow from './lightshow.js';
import rain from './rain.js';
import audio from './audio.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

function setStatus(text) { const el = $('loadText'); if (el) el.textContent = text; }

async function main() {
  const canvas = $('c');
  let gpu;
  try { gpu = await initGPU(canvas); }
  catch (e) { $('loadText').innerHTML = `${e.message}<br><small>Use a recent desktop Chrome or Edge with WebGPU enabled.</small>`; return; }
  const { device } = gpu;
  window.__adapter = gpu.adapterName;

  setStatus('Shaping mountains and rivers');
  await new Promise((r) => setTimeout(r, 0));
  const world = new World();
  await world.generate(device);

  const fixedW = +params.get('w') || 0, fixedH = +params.get('h') || 0;
  const ctx = {
    gpu, device, world, params,
    prof: new Profiler(device),
    lights: new Lights(device),
    quality: null,
    time: params.has('t') ? +params.get('t') : 0,
    dt: 1 / 60,
    frozen: params.has('freeze'),
    taaEnabled: true,
    env: {
      moonDir: normalize([0.38, 0.42, -0.82]), moonIntensity: 0.22,
      rain: params.has('rain') ? +params.get('rain') : 0.55,
      wetness: 0.8, fogDensity: 0.00045, fogFalloff: 0.0045, fogBase: 0,
      exposure: 1.6, windX: 0.6, windZ: 0.25,
    },
    show: { intensity: 0, time: 0, beatPhase: 0, beat: 0 },
    cam: null,
    camVel: [0, 0, 0],
    modules: null,
  };
  ctx.quality = new Quality(ctx, params.get('quality'), !(fixedW && fixedH) && !params.has('noadapt'));
  const renderer = new Renderer(ctx);
  ctx.renderer = renderer;

  const disabled = (params.get('disable') || '').split(',');
  const modules = [sky, fog, terrain, garden, buildings, water, bridges, vegetation, signs, traffic, lightshow, rain, audio].filter((m) => !disabled.includes(m.name));
  ctx.modules = modules;
  for (const m of modules) {
    if (!m.init) continue;
    setStatus(`Building ${m.name}`);
    await new Promise((r) => setTimeout(r, 0));
    try { await m.init(ctx); }
    catch (e) { console.error(`Module ${m.name} failed to init:`, e); m.disabled = true; }
  }
  const active = modules.filter((m) => !m.disabled);

  const controls = new Controls(canvas, world);
  ctx.controls = controls;
  const startPose = +(params.get('pose') || 1) - 1;
  const gotoPose = (i) => {
    const p = world.poses[i];
    if (!p) return;
    const r = p.resolved;
    controls.setPose(r.x, r.y, r.z, r.yaw, r.pitch, true);
    renderer.resetHistory = true;
  };
  gotoPose(startPose);

  // ---------------- UI
  const overlay = $('overlay'), stats = $('stats');
  let statsOn = params.has('stats');
  let started = false;
  const lockPointer = () => { canvas.requestPointerLock && canvas.requestPointerLock(); };
  overlay.addEventListener('click', () => {
    lockPointer();
    if (!started) { started = true; audio.start && audio.start(ctx); }
  });
  canvas.addEventListener('click', () => { if (!controls.locked) lockPointer(); });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    overlay.classList.toggle('hidden', locked);
    $('play').textContent = started ? 'Click to resume' : 'Click to enter the city';
  });
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyH') { statsOn = !statsOn; stats.style.display = statsOn ? 'block' : 'none'; ctx.prof.enabled = statsOn || ctx.benchmarking; }
    else if (e.code === 'KeyM') { audio.toggleMute && audio.toggleMute(ctx); }
    else if (e.code === 'KeyR') { ctx.env.rain = ctx.env.rain > 0 ? 0 : 0.55; }
    else if (/^Digit[0-9]$/.test(e.code)) { const n = +e.code.slice(5); gotoPose(n === 0 ? 9 : n - 1); }
  });
  stats.style.display = statsOn ? 'block' : 'none';
  ctx.prof.enabled = statsOn;
  const hint = $('hint');
  if (hint) {
    hint.textContent = `GPU: ${gpu.adapterName}` + (/intel|qualcomm|arm/i.test(gpu.vendor) ? '  ·  For best performance set your browser to "High performance" in Windows Settings > Display > Graphics.' : '');
    document.addEventListener('pointerlockchange', () => { hint.style.display = document.pointerLockElement ? 'none' : 'block'; });
  }
  $('loading').classList.add('hidden');
  overlay.classList.remove('hidden');
  if (params.has('nooverlay')) overlay.classList.add('hidden');

  // ---------------- sizing
  function outputSize() {
    if (fixedW && fixedH) return [fixedW, fixedH];
    const dpr = devicePixelRatio || 1;
    let w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    const cap = 2560 * 1600;
    if (w * h > cap) { const s = Math.sqrt(cap / (w * h)); w = Math.round(w * s); h = Math.round(h * s); }
    return [Math.max(w, 64), Math.max(h, 64)];
  }

  // ---------------- loop
  let last = performance.now();
  let fpsAcc = 0, fpsN = 0, fps = 0, statT = 0;
  const statLines = [];
  ctx.gotoPose = gotoPose;
  ctx.frameCallbacks = [];

  function frame(now) {
    requestAnimationFrame(frame);
    if (window.__deviceLost) return;
    let dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (ctx.fixedDt) dt = ctx.fixedDt;
    ctx.dt = ctx.frozen ? 0 : dt;
    if (!ctx.frozen) ctx.time += dt;

    const [ow, oh] = outputSize();
    if (canvas.width !== ow || canvas.height !== oh) { canvas.width = ow; canvas.height = oh; }
    ctx.quality.update(dt);
    const rw = Math.max(64, Math.round(ow * ctx.quality.scale)), rh = Math.max(64, Math.round(oh * ctx.quality.scale));
    if (renderer.resize(rw, rh)) for (const m of active) m.resize && m.resize(ctx);

    for (let i = 0; i < ctx.frameCallbacks.length; i++) ctx.frameCallbacks[i](ctx, dt);
    const cam = ctx.camOverride || controls.update(ctx.frozen ? 0 : dt);
    ctx.cam = cam;
    ctx.camVel = controls.vel;

    const s = showState(ctx.time);
    ctx.show.intensity = s.intensity; ctx.show.time = s.time;
    const beats = s.time * 2.0; // 120 bpm
    ctx.show.beat = Math.floor(beats); ctx.show.beatPhase = beats - Math.floor(beats);

    for (let i = 0; i < active.length; i++) if (active[i].update) active[i].update(ctx);
    renderer.updateCamera(cam, rw, rh);
    renderer.render(active);

    fpsAcc += dt; fpsN++;
    if (now - statT > 500) {
      fps = fpsN / Math.max(fpsAcc, 1e-6); fpsAcc = 0; fpsN = 0; statT = now;
      if (statsOn) {
        statLines.length = 0;
        statLines.push(`${fps.toFixed(0)} fps  ${(1000 / fps).toFixed(1)} ms`);
        if (ctx.prof.supported) {
          statLines.push(`GPU ${ctx.prof.gpuTotal.toFixed(2)} ms`);
          for (const [k, v] of ctx.prof.passMs) statLines.push(`  ${k.padEnd(12)} ${v.toFixed(2)}`);
        }
        statLines.push(`render ${rw}x${rh} (${ctx.quality.name}, scale ${ctx.quality.scale.toFixed(2)})`);
        statLines.push(`lights ${ctx.lights.count}`);
        statLines.push(`pos ${cam.x.toFixed(0)} ${cam.y.toFixed(0)} ${cam.z.toFixed(0)}  ${controls.flying ? 'flying' : 'walking'}`);
        const d = world.districtAt(cam.x, cam.z);
        if (d.index >= 0) statLines.push(world.districts[d.index].name);
        statLines.push(gpu.adapterName);
        stats.textContent = statLines.join('\n');
      }
    }
  }
  requestAnimationFrame(frame);
  window.__ctx = ctx;
  window.__ready = true;
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    const dev = await import('./dev.js');
    dev.install(ctx, renderer);
  }
}

function normalize(v) { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }

main().catch((e) => { console.error(e); const el = $('loadText'); if (el) el.textContent = 'Error: ' + e.message; });
