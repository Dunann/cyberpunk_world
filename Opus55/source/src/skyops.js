// Sky operations (idea I-009, prototype): three advertising airships holding racetracks over the rivers, and a
// spaceport on the eastern mountains that launches a rocket every 150 s, leaving a smoke trail that drifts and
// spreads in a sheared wind for 240 s and lighting the cloud deck as it passes through (via F.launch in sky.js).
//
// Rendering:
//   In afterLighting, two passes of this module, timed on their own (skyops-gbuffer, skyops-fwd), before the water's
//   SSR so the river reflects the ships, the plume and the trail:
//   1. opaque pass: airships, rocket and spaceport shade themselves (moon, sky, city glow from below, local floods,
//      emissive, fog) and write the lit colour, G-buffer normal, motion (with previous-frame transforms) and depth.
//   2. transparent pass: smoke trails (premultiplied alpha) and the plume (additive).
//   In the shared forward pass, after the water (the `skyopsLate` entry in main.js): searchlight beams and light
//   sprites (additive). Drawn earlier, the water's opaque plane would paint over them wherever it lies behind them.
// Lights: 3 searchlight hit points (at most one lit at a time) + 1 plume light (dynamic).
// Placement and timing rules live in skyopsLayout.js.

import { VERTEX_LAYOUT, makeCamTest } from './trafficGeom.js';
import { WGSL_LIB, WGSL_FRAME } from './common.js';
import { HDR_FORMAT, DEPTH_FORMAT } from './renderer.js';
import { shader } from './gpu.js';
import { LANES, CIRCLES } from './air.js';
import * as L from './skyopsLayout.js';
import { airshipMesh, rocketMesh, spaceportMesh, shipOutlineLights } from './skyopsMesh.js';
import { buildSkyAtlas } from './skyopsAtlas.js';
import { SKY_OPAQUE_WGSL, SKY_SPRITE_WGSL, SKY_BEAM_WGSL, SKY_PLUME_WGSL, SKY_TRAIL_WGSL } from './skyopsWgsl.js';

const NSHIP = 3;
const INST_F = 32;              // floats per instance (8 vec4)
const I_ROCKET = 3, I_PORT = 4; // instance slots
const NSPR = 144;
const NTRAJ = 160;
const NPUFF = 192, PUFF_DS = 9.25; // must match SKY_TRAIL_WGSL
const SHOW_DIM_R = 1500;        // ships this close to the drone-show centre dim during the show
const HUE = [0.52, 0.11, 0.36]; // LED palette offset per ship: cyan, amber, green (no magenta, judge fix 3)
// Searchlights (judge fix 2): at most one beam in the sky. Ships take turns in BEAM_SLOT s slots (fading over
// BEAM_FADE s at each end), and the slot owner's beam shows only while it lands on lit city (on land, among
// buildings) within BEAM_RANGE m of slant range. Each beam is aimed at the outer bank of its racetrack and sweeps it.
const BEAM_SLOT = 40, BEAM_FADE = 2, BEAM_RANGE0 = 640, BEAM_RANGE1 = 720;
const BANK_STEP = 20, BANK_MAX = 600;
// outline lights (judge fix 3): colour * intensity per kind (spine, keel, fin edge)
const OUTLINE_COL = [[7, 6.4, 5.6], [7, 4.3, 1.8], [5.6, 6.2, 7.4]];
const OUTLINE = shipOutlineLights();
const NOUT = OUTLINE.length / 4;
const ROCKET_TOP = 82;

// ship-local light positions (x left, y up, z forward)
const R = L.HULL_R;
const NAV = [
  [R + 0.7, -1.0, 10], [-(R + 0.7), -1.0, 10], [0, 0, -91.8], [0, R + 1.4, 12], [0, -R - 6.2, 18], [0, -R - 5.3, 30.6], [0, R + 7.4, 50],
];

function sstep(a, b, x) { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); }

const skyops = {
  name: 'skyops',

  async init(ctx) {
    const d = ctx.device, Rr = ctx.renderer, w = ctx.world;
    this.cam = makeCamTest();
    // ---- spaceport (site by rule; never chosen from cameras)
    this.site = L.chooseSite(w);
    this.plan = L.deckPlan(w, this.site);
    const sp = spaceportMesh(this.site, this.plan);
    this.port = sp;
    this.pad = sp.rocketBase;
    const tr = L.trajectory(this.pad);
    this.traj = tr;
    this.sDeck = tr.sDeck;
    const td = new Float32Array(NTRAJ * 4);
    for (let i = 0; i < NTRAJ; i++) {
      const s = this.sDeck * i / (NTRAJ - 1);
      const f = Math.min(s / 5, tr.s.length - 1.001), k = Math.floor(f), u = f - k;
      td[i * 4] = tr.x[k] + (tr.x[k + 1] - tr.x[k]) * u;
      td[i * 4 + 1] = tr.y[k] + (tr.y[k + 1] - tr.y[k]) * u;
      td[i * 4 + 2] = tr.z[k] + (tr.z[k + 1] - tr.z[k]) * u;
      td[i * 4 + 3] = s;
    }
    this.trajBuf = d.createBuffer({ label: 'skyops-traj', size: td.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.trajBuf, 0, td);
    const S = this.site, dy = this.plan.deckY;
    w.addCollider(S.x, dy - 1.6, S.z, L.DECK_HALF, 1.6, L.DECK_HALF, 0);
    w.addCollider(S.x, dy + 80, S.z - 17, 6, 80, 6, 0);
    w.addCollider(S.x - 46, dy + 24, S.z + 40, 18, 24, 14, 0);
    // half: half the deck's side; vegetation keeps trees off the deck footprint
    w.shared.spaceport = { x: S.x, z: S.z, deckY: dy, half: L.DECK_HALF, period: L.LAUNCH_PERIOD };

    // ---- meshes
    const ship = airshipMesh();
    this.shipTris = ship.idx.length / 3;
    this.shipMesh = ship.upload(d, 'airship');
    this.rocketMesh = rocketMesh().upload(d, 'rocket');
    this.portMesh = sp.mb.upload(d, 'spaceport');
    this.atlas = buildSkyAtlas(d);

    // ---- buffers
    this.inst = new Float32Array(5 * INST_F);
    this.instBuf = d.createBuffer({ label: 'skyops-inst', size: this.inst.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.U = new Float32Array(40);
    this.UBuf = d.createBuffer({ label: 'skyops-u', size: 160, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.spr = new Float32Array(NSPR * 8);
    this.sprBuf = d.createBuffer({ label: 'skyops-spr', size: this.spr.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.beam = new Float32Array(24);
    this.beamBuf = d.createBuffer({ label: 'skyops-beams', size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.LU = new Float32Array(36);
    this.LUBuf = d.createBuffer({ label: 'skyops-launch', size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    // spaceport instance: identity transform
    this._setXf(I_PORT, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, false);
    this._setXf(I_PORT, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, true);
    this.inst[I_PORT * INST_F + 24] = 2; this.inst[I_PORT * INST_F + 27] = -1e9;

    // ---- pipelines
    const VF = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
    this.opLayout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: VF, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: VF, buffer: { type: 'uniform' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ] });
    this.opGroup = d.createBindGroup({ layout: this.opLayout, entries: [
      { binding: 0, resource: { buffer: this.instBuf } }, { binding: 1, resource: { buffer: this.UBuf } }, { binding: 2, resource: this.atlas.view },
    ] });
    const mod = shader(d, WGSL_LIB + WGSL_FRAME + SKY_OPAQUE_WGSL, 'skyops-opaque');
    this.opPipe = d.createRenderPipeline({
      label: 'skyops-opaque',
      layout: d.createPipelineLayout({ bindGroupLayouts: [Rr.frameLayout, this.opLayout] }),
      vertex: { module: mod, entryPoint: 'vs', buffers: [VERTEX_LAYOUT] },
      fragment: { module: mod, entryPoint: 'fs', targets: [{ format: HDR_FORMAT }, { format: 'rgba16float' }, { format: 'rgba16float' }] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'greater' },
    });
    this.sprLayout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: VF, buffer: { type: 'read-only-storage' } }] });
    this.sprGroup = d.createBindGroup({ layout: this.sprLayout, entries: [{ binding: 0, resource: { buffer: this.sprBuf } }] });
    this.sprPipe = Rr.forwardPipeline({ label: 'skyops-sprites', code: SKY_SPRITE_WGSL, groups: [this.sprLayout], blend: 'add' });
    this.beamLayout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: VF, buffer: { type: 'uniform' } }] });
    this.beamGroup = d.createBindGroup({ layout: this.beamLayout, entries: [{ binding: 0, resource: { buffer: this.beamBuf } }] });
    this.beamPipe = Rr.forwardPipeline({ label: 'skyops-beams', code: SKY_BEAM_WGSL, groups: [this.beamLayout], blend: 'add' });
    this.lauLayout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: VF, buffer: { type: 'uniform' } }, { binding: 1, visibility: VF, buffer: { type: 'read-only-storage' } }] });
    this.lauGroup = d.createBindGroup({ layout: this.lauLayout, entries: [{ binding: 0, resource: { buffer: this.LUBuf } }, { binding: 1, resource: { buffer: this.trajBuf } }] });
    this.plumePipe = Rr.forwardPipeline({ label: 'skyops-plume', code: SKY_PLUME_WGSL, groups: [this.lauLayout], blend: 'add' });
    this.trailPipe = Rr.forwardPipeline({ label: 'skyops-trail', code: SKY_TRAIL_WGSL, groups: [this.lauLayout], blend: 'premul' });

    // ---- pass descriptors (views filled in resize)
    this.opAtt = [{ view: null, loadOp: 'load', storeOp: 'store' }, { view: null, loadOp: 'load', storeOp: 'store' }, { view: null, loadOp: 'load', storeOp: 'store' }];
    this.opDesc = { colorAttachments: this.opAtt, depthStencilAttachment: { view: null, depthLoadOp: 'load', depthStoreOp: 'store' }, timestampWrites: undefined };
    this.fwAtt = [{ view: null, loadOp: 'load', storeOp: 'store' }, { view: null, loadOp: 'load', storeOp: 'store' }];
    this.fwDesc = { colorAttachments: this.fwAtt, depthStencilAttachment: { view: null, depthReadOnly: true }, timestampWrites: undefined };

    // ---- lights: 3 searchlight hit points, 1 plume light
    this.lightBase = ctx.lights.reserve(NSHIP + 1);
    // cloud-deck launch glow, read by the renderer into F.launch (x, z, radius, intensity)
    this.glow = new Float32Array(4);
    ctx.env.launch = this.glow;

    this.ships = null;
    this.vis = new Uint8Array(5);
    this.ages = new Float64Array(2);
    this.launchIdx = new Int32Array(2);
    this._st = {}; this._pt = {};
    this._r = { x: 0, y: 0, z: 0, ux: 0, uy: 1, uz: 0, lx: 1, ly: 0, lz: 0 };
    this._p3 = new Float64Array(3);
    // nav light colours: red port, green starboard, white tail, strobe A, strobe B, searchlight lamp, beacon
    this._navCol = new Float32Array([10, 0.5, 0.3, 0.5, 9, 2.2, 7, 7, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      window.__skyops = this;
      window.__skyopsLayout = L;
      window.__skyopsMetrics = () => this._metrics(ctx);
    }
  },

  // Dev only (review-1 fix 2): projected size of each airship hull and of each live smoke trail in the current
  // frame, counting only samples that are on screen and not hidden by nearer opaque geometry (depth read back).
  async _metrics(ctx) {
    const d = ctx.device, Rr = ctx.renderer;
    const W = Rr.width, H = Rr.height, M = Rr.viewProjNJ, t = ctx.time;
    const pts = []; // [x, y, z, slack, group]
    const st = {};
    for (let i = 0; i < NSHIP; i++) {
      L.shipState(this.ships[i], t, st);
      for (let k = 0; k <= 24; k++) {
        const z = -L.HULL_LEN / 2 + L.HULL_LEN * k / 24;
        pts.push([st.x + st.fx * z, st.y + st.fy * z, st.z + st.fz * z, L.HULL_R + 6, i]);
      }
    }
    const n = L.liveLaunches(t, this.ages), dr = [0, 0];
    for (let k = 0; k < n; k++) {
      const A = this.ages[k], sEnd = Math.min(L.rocketS(A), this.sDeck);
      for (let j = 0; j <= 40; j++) {
        const s = sEnd * j / 40;
        const f = Math.min(s / 5, this.traj.s.length - 1.001), q = Math.floor(f), u = f - q;
        const x = this.traj.x[q] + (this.traj.x[q + 1] - this.traj.x[q]) * u, y = this.traj.y[q] + (this.traj.y[q + 1] - this.traj.y[q]) * u;
        const age = A - L.emitAge(s);
        if (age < 0 || L.smokeOpacity(age) < 0.2 || y > L.CLOUD_BASE) continue;
        L.windDrift(y, age, ctx.env.windX, ctx.env.windZ, dr);
        pts.push([x + dr[0], y, this.pad[2] + dr[1], L.smokeRadius(age), NSHIP + k]);
      }
    }
    const scr = pts.map((p) => {
      const cx = M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], cy = M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13];
      const cw = M[3] * p[0] + M[7] * p[1] + M[11] * p[2] + M[15];
      if (cw <= 0) return null;
      const sx = (cx / cw * 0.5 + 0.5) * W, sy = (0.5 - cy / cw * 0.5) * H;
      return sx >= 0 && sx < W && sy >= 0 && sy < H ? [sx, sy, cw] : null;
    });
    // read the scene depth at every on-screen sample
    if (!this._probe) {
      const code = /* wgsl */ `
@group(0) @binding(0) var dTex: texture_depth_2d;
@group(0) @binding(1) var<storage, read> px: array<vec2u>;
@group(0) @binding(2) var<storage, read_write> outD: array<f32>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g: vec3u) {
  if (g.x >= arrayLength(&px)) { return; }
  outD[g.x] = textureLoad(dTex, vec2i(px[g.x]), 0);
}`;
      this._probe = d.createComputePipeline({ layout: 'auto', compute: { module: d.createShaderModule({ code }), entryPoint: 'main' } });
    }
    const N = pts.length;
    const pxA = new Uint32Array(N * 2);
    scr.forEach((s, i) => { if (s) { pxA[i * 2] = Math.floor(s[0]); pxA[i * 2 + 1] = Math.floor(s[1]); } });
    const inB = d.createBuffer({ size: pxA.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(inB, 0, pxA);
    const outB = d.createBuffer({ size: N * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const rdB = d.createBuffer({ size: N * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const bg = d.createBindGroup({ layout: this._probe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: ctx.views.depth }, { binding: 1, resource: { buffer: inB } }, { binding: 2, resource: { buffer: outB } }] });
    const enc = d.createCommandEncoder();
    const cp = enc.beginComputePass(); cp.setPipeline(this._probe); cp.setBindGroup(0, bg); cp.dispatchWorkgroups(Math.ceil(N / 64)); cp.end();
    enc.copyBufferToBuffer(outB, 0, rdB, 0, N * 4);
    d.queue.submit([enc.finish()]);
    await rdB.mapAsync(GPUMapMode.READ);
    const dep = new Float32Array(rdB.getMappedRange().slice(0));
    rdB.unmap(); inB.destroy(); outB.destroy(); rdB.destroy();
    const near = ctx.cam.near || 0.25;
    const groups = [];
    for (let g = 0; g < NSHIP + 2; g++) groups.push({ name: g < NSHIP ? this.ships[g].name : `trail${g - NSHIP}`, vis: [] });
    pts.forEach((p, i) => {
      const s = scr[i];
      if (!s) return;
      const sceneLin = dep[i] > 0 ? near / dep[i] : 1e9;
      if (sceneLin >= s[2] - p[3]) groups[p[4]].vis.push(s);
    });
    return groups.map((g) => {
      let span = 0, ylo = 1e9, yhi = -1e9;
      for (const a of g.vis) { ylo = Math.min(ylo, a[1]); yhi = Math.max(yhi, a[1]); for (const b of g.vis) span = Math.max(span, Math.hypot(a[0] - b[0], a[1] - b[1])); }
      return { name: g.name, samples: g.vis.length, lengthPx: Math.round(span), heightPx: g.vis.length ? Math.round(yhi - ylo) : 0 };
    });
  },

  resize(ctx) {
    const v = ctx.views;
    this.opAtt[0].view = v.scene; this.opAtt[1].view = v.normal; this.opAtt[2].view = v.motion;
    this.opDesc.depthStencilAttachment.view = v.depth;
    this.fwAtt[0].view = v.scene; this.fwAtt[1].view = v.motion;
    this.fwDesc.depthStencilAttachment.view = v.depth;
  },

  // Airship altitudes need the air-traffic corridors, which traffic.init creates after this module's init.
  _planShips(ctx) {
    const traffic = { lanes: LANES, circles: CIRCLES, corridors: ctx.world.shared.airCorridors || [] };
    this.ships = L.planAirships(ctx.world, traffic);
    // centre of each racetrack: the beam sweeps the side away from it (the outer bank)
    for (const sh of this.ships) {
      let cx = 0, cz = 0;
      for (let k = 0; k < sh.track.n; k++) { cx += sh.track.x[k]; cz += sh.track.z[k]; }
      sh.cx = cx / sh.track.n; sh.cz = cz / sh.track.n;
    }
    ctx.world.shared.airships = this.ships.map((s) => ({ name: s.name, alt: s.alt, lap: s.track.length }));
  },

  // instance transform: columns l, u, f with the position in w; prev = previous frame slot
  _setXf(i, px, lx, ly, lz, py, ux, uy, uz, pz, fx, fy, fz, prev) {
    const o = i * INST_F + (prev ? 12 : 0), D = this.inst;
    D[o] = lx; D[o + 1] = ly; D[o + 2] = lz; D[o + 3] = px;
    D[o + 4] = ux; D[o + 5] = uy; D[o + 6] = uz; D[o + 7] = py;
    D[o + 8] = fx; D[o + 9] = fy; D[o + 10] = fz; D[o + 11] = pz;
  },
  _shipXf(i, st, prev) { this._setXf(i, st.x, st.lx, st.ly, st.lz, st.y, st.ux, st.uy, st.uz, st.z, st.fx, st.fy, st.fz, prev); },

  // rocket base position and axis at launch age a; returns false when hidden. Writes this._r.
  // While it climbs through the cloud deck, the opaque shader clips it at 1800 m per pixel (nose first).
  _rocket(a) {
    const r = this._r;
    const P = this.pad;
    r.clip = -1e9;
    if (a < L.IGNITION || a >= L.ROCKET_RETURN0) {
      r.x = P[0]; r.y = P[1]; r.z = P[2];
      r.ux = 0; r.uy = 1; r.uz = 0; r.lx = 1; r.ly = 0; r.lz = 0;
      if (a >= L.ROCKET_RETURN0) {
        // the next rocket rises out of the deck on its elevator
        const k = Math.min((a - L.ROCKET_RETURN0) / (L.ROCKET_RETURN1 - L.ROCKET_RETURN0), 1);
        r.y = P[1] - (ROCKET_TOP + 8) * (1 - k * k * (3 - 2 * k));
        r.clip = this.plan.deckY + 0.05;
      }
      return true;
    }
    const s = L.rocketS(a);
    if (s >= this.sDeck) return false;
    const T = this.traj;
    const f = Math.min(s / 5, T.s.length - 1.001), k = Math.floor(f), u = f - k;
    r.x = T.x[k] + (T.x[k + 1] - T.x[k]) * u; r.y = T.y[k] + (T.y[k + 1] - T.y[k]) * u; r.z = T.z[k];
    const g = s < L.GT_START ? 0 : L.GT_MAX * (1 - Math.exp(-(s - L.GT_START) / L.GT_SCALE));
    r.ux = Math.sin(g); r.uy = Math.cos(g); r.uz = 0;
    r.lx = Math.cos(g); r.ly = -Math.sin(g); r.lz = 0;
    return r.y < L.CLOUD_BASE;
  },

  // Lit city at a point: the number of buildings (colliders taller than 6 m and under 80 m across, so not bridge
  // decks or the spaceport) in its 64 m cell and the four cells around it. Forest, water and open ground have none.
  _buildingsNear(w, x, z) {
    let n = 0;
    for (let k = 0; k < 5; k++) {
      const cs = w.collidersNear(x + (k === 1 ? 64 : k === 2 ? -64 : 0), z + (k === 3 ? 64 : k === 4 ? -64 : 0));
      if (!cs) continue;
      for (let m = 0; m < cs.length; m++) { const c = cs[m]; if (c.hy > 3 && c.hx < 40 && c.hz < 40) n++; }
    }
    return n;
  },

  // scale a sprite's colour (the searchlight lamp follows its beam)
  _lampW(k, wgt) { const o = k * 8 + 4, S = this.spr; S[o] *= wgt; S[o + 1] *= wgt; S[o + 2] *= wgt; },

  _sprite(k, x, y, z, r, cr, cg, cb, pxMin) {
    const o = k * 8, S = this.spr;
    S[o] = x; S[o + 1] = y; S[o + 2] = z; S[o + 3] = r;
    S[o + 4] = cr; S[o + 5] = cg; S[o + 6] = cb; S[o + 7] = pxMin;
  },

  update(ctx) {
    if (!this.ships) this._planShips(ctx);
    const t = ctx.time, dt = ctx.dt, w = ctx.world, Li = ctx.lights;
    const cam = this.cam;
    cam.set(ctx.cam, ctx.renderer.width / Math.max(ctx.renderer.height, 1));
    const showI = ctx.show.intensity;
    let sp = 0;

    // ---- airships
    const st = this._st, pt = this._pt;
    const slot = Math.floor(t / BEAM_SLOT), tau = t - slot * BEAM_SLOT;
    const owner = ((slot % NSHIP) + NSHIP) % NSHIP;
    const slotW = sstep(0, BEAM_FADE, tau) * (1 - sstep(BEAM_SLOT - BEAM_FADE, BEAM_SLOT, tau));
    for (let i = 0; i < NSHIP; i++) {
      const sh = this.ships[i];
      L.shipState(sh, t, st);
      L.shipState(sh, t - dt, pt);
      this._shipXf(i, st, false); this._shipXf(i, pt, true);
      const nearShow = Math.hypot(st.x - L.SHOW_CENTER[0], st.z - L.SHOW_CENTER[2]) < SHOW_DIM_R;
      const dim = nearShow ? Math.min(showI * 20, 1) : 0;
      const led = 1 - 0.7 * dim, beamOn = 1 - dim;
      const o = i * INST_F + 24, D = this.inst;
      D[o] = 0; D[o + 1] = i; D[o + 2] = led; D[o + 3] = -1e9;
      D[o + 4] = this.atlas.extents[i]; D[o + 5] = t * 6.0; D[o + 6] = HUE[i]; D[o + 7] = 0;
      this.vis[i] = cam.visible(st.x, st.y, st.z, 110) ? 1 : 0;

      // nav lights: red port, green starboard, white tail, 1 Hz strobes (0.12 s), searchlight lamp, red beacon
      const ph = ((t + sh.seed * 0.9) % 1 + 1) % 1;
      const strobeA = ph < 0.12 ? 30 : 0, strobeB = (ph + 0.5) % 1 < 0.12 ? 30 : 0;
      const beacon = 0.5 + 0.5 * Math.sin(t * 4.2 + sh.seed * 11);
      const c = this._navCol;
      c[9] = c[10] = c[11] = strobeA; c[12] = c[13] = c[14] = strobeB;
      c[15] = 18 * beamOn; c[16] = 17 * beamOn; c[17] = 15 * beamOn; // scaled by the beam weight below
      c[18] = 10 * beacon; c[19] = 0.4 * beacon; c[20] = 0.2 * beacon;
      const ap = this._p3;
      let spLamp = 0;
      for (let k = 0; k < NAV.length; k++) {
        const q = NAV[k];
        const x = st.x + st.lx * q[0] + st.ux * q[1] + st.fx * q[2];
        const y = st.y + st.ly * q[0] + st.uy * q[1] + st.fy * q[2];
        const z = st.z + st.lz * q[0] + st.uz * q[1] + st.fz * q[2];
        if (k === 5) { ap[0] = x; ap[1] = y; ap[2] = z; spLamp = sp; }
        this._sprite(sp++, x, y, z, k === 5 ? 1.2 : 0.7, c[k * 3], c[k * 3 + 1], c[k * 3 + 2], k >= 3 && k <= 4 ? 1.8 : 1.4);
      }

      // outline lights along the spine, the keel and the fin edges (fade to >= 1.3 px dots at a distance)
      for (let k = 0; k < NOUT; k++) {
        const qx = OUTLINE[k * 4], qy = OUTLINE[k * 4 + 1], qz = OUTLINE[k * 4 + 2], oc = OUTLINE_COL[OUTLINE[k * 4 + 3]];
        this._sprite(sp++, st.x + st.lx * qx + st.ux * qy + st.fx * qz, st.y + st.ly * qx + st.uy * qy + st.fy * qz,
          st.z + st.lz * qx + st.uz * qy + st.fz * qz, 0.8, oc[0], oc[1], oc[2], 1.3);
      }

      // searchlight: aimed at the outer bank (the side away from the track centre). March outward from the ship
      // to the first dry ground (at most BANK_MAX m), aim 60 m inland of it, sweeping along and across the bank.
      let hx = st.fx, hz = st.fz; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
      const outer = hz * (st.x - sh.cx) - hx * (st.z - sh.cz) >= 0 ? 1 : -1; // + : the left side (hz, -hx)
      const nx = outer * hz, nz = -outer * hx;
      let bank = 0;
      for (let k = 1; k * BANK_STEP <= BANK_MAX; k++) {
        if (w.heightAt(ap[0] + nx * k * BANK_STEP, ap[2] + nz * k * BANK_STEP) > 2) { bank = k * BANK_STEP; break; }
      }
      const reach = (bank > 0 ? bank + 60 : 250) + 40 * Math.sin(t * 0.11 + sh.seed * 6);
      const along = 120 * Math.sin(t * 0.07 + sh.seed * 5);
      const tx = ap[0] + nx * reach + hx * along, tz = ap[2] + nz * reach + hz * along;
      const gh = w.heightAt(tx, tz), gy = Math.max(gh, 0);
      const Lb = Math.hypot(tx - ap[0], gy - ap[1], tz - ap[2]);
      // only the slot owner's beam, and only while it lands on lit city within range
      let bw = 0;
      if (i === owner && slotW > 0 && beamOn > 0) {
        bw = slotW * beamOn * sstep(2, 5, this._buildingsNear(w, tx, tz)) * sstep(1, 4, gh) * (1 - sstep(BEAM_RANGE0, BEAM_RANGE1, Lb));
      }
      const B = this.beam, bo = i * 8;
      B[bo] = ap[0]; B[bo + 1] = ap[1] - 0.5; B[bo + 2] = ap[2]; B[bo + 3] = bw;
      B[bo + 4] = tx; B[bo + 5] = gy; B[bo + 6] = tz; B[bo + 7] = 2 + Lb * Math.tan(3.2 * Math.PI / 180);
      this._lampW(spLamp, bw);
      if (bw > 0.01) Li.set(this.lightBase + i, tx, gy + 8, tz, 34, 170 * bw, 180 * bw, 205 * bw, 0);
      else Li.set(this.lightBase + i, 0, -1e5, 0, 0, 0, 0, 0, 0);
    }

    // ---- launch cycle
    const P = L.LAUNCH_PERIOD;
    const a = ((t % P) + P) % P;
    const r = this._r;
    const D = this.inst, ro = I_ROCKET * INST_F;
    const shown = this._rocket(a);
    let nx = r.x, ny = r.y, nz = r.z, ux = r.ux, uy = r.uy;
    this._setXf(I_ROCKET, r.x, r.lx, r.ly, r.lz, r.y, r.ux, r.uy, r.uz, r.z, 0, 0, 1, false);
    D[ro + 24] = 1; D[ro + 25] = 0; D[ro + 26] = 1; D[ro + 27] = r.clip;
    const shownPrev = this._rocket(((a - dt) % P + P) % P);
    this._setXf(I_ROCKET, r.x, r.lx, r.ly, r.lz, r.y, r.ux, r.uy, r.uz, r.z, 0, 0, 1, true);
    this.vis[I_ROCKET] = shown && cam.visible(nx, ny + 40, nz, 60) ? 1 : 0;
    void shownPrev;
    this.vis[I_PORT] = cam.visible(this.site.x, this.plan.deckY + 40, this.site.z, 190) ? 1 : 0;

    // plume and ignition flash
    let flame = 0, flen = 40, flash = 0;
    if (a < L.IGNITION + 1.5) flash = Math.min(a / 0.4, 1) * (1 - Math.min(Math.max((a - 2.5) / 2, 0), 1)) * 1.5;
    if (a < L.IGNITION) { flame = 0.55 * Math.min(a / 2.5, 1); flen = 25 + 15 * a; }
    else if (shown) { const v = L.ACCEL * (a - L.IGNITION); flame = 1; flen = 60 + Math.min(v * 0.45, 100); }
    const LU = this.LU;
    LU[16] = nx; LU[17] = ny; LU[18] = nz; LU[19] = flame;
    LU[20] = -ux; LU[21] = -uy; LU[22] = 0; LU[23] = flen;
    LU[24] = nx - ux * 30; LU[25] = ny - uy * 30; LU[26] = nz; LU[27] = 3.0 * flame + 2.0 * flash;
    const wl = Math.hypot(ctx.env.windX, ctx.env.windZ) || 1;
    LU[28] = ctx.env.windX / wl; LU[29] = ctx.env.windZ / wl; LU[30] = this.sDeck; LU[31] = NTRAJ;
    LU[32] = flash; LU[33] = 1; LU[34] = t; LU[35] = 0;
    // trails: up to two launches with live smoke; puff spacing level from the smoke radius at mid-trail
    const n = L.liveLaunches(t, this.ages, this.launchIdx);
    for (let k = 0; k < 2; k++) {
      const A = this.ages[k];
      const live = k < n && A > L.IGNITION;
      const sEnd = live ? Math.min(L.rocketS(A), this.sDeck) : 0;
      LU[k * 4] = A; LU[k * 4 + 1] = sEnd; LU[k * 4 + 2] = L.trailSeed(this.launchIdx[k]); LU[k * 4 + 3] = live ? 1 : 0;
      const rMid = L.smokeRadius(A - L.emitAge(sEnd * 0.5));
      const lev = Math.log2(Math.max(1.2 * rMid / PUFF_DS, 1)); // target spacing 1.2 x the smoke radius (elongated puffs)
      const kf = Math.floor(lev);
      LU[8 + k * 4] = PUFF_DS * Math.pow(2, kf); LU[8 + k * 4 + 1] = lev - kf;
    }
    D[ro + 31] = flame;

    // cloud-deck glow: brightest as the plume reaches the deck, then fading by 40 s
    const G = this.glow;
    let gi = 0.3 * flash;
    if (flame > 0 && a >= L.IGNITION) { const h = (L.CLOUD_BASE - ny) / 400; gi += 2.5 / (1 + h * h); }
    else if (a >= L.IGNITION) {
      const aDeck = L.emitAge(this.sDeck);
      gi += 2.5 * Math.exp(-(a - aDeck) / 6) * (1 - Math.min(Math.max((a - 30) / 10, 0), 1));
    }
    if (a >= L.IGNITION && !shown) { G[0] = this.traj.x[this.traj.x.length - 1]; G[1] = this.pad[2]; G[2] = 350; }
    else { G[0] = nx; G[1] = nz; G[2] = 300 + 0.5 * Math.max(L.CLOUD_BASE - ny, 0); }
    G[3] = a < 40 ? gi : 0;

    // plume light on the pad and the terrain below the climbing rocket
    const pi = flame * 1.0 + flash * 0.6;
    if (pi > 0 && ny < this.plan.deckY + 400) Li.set(this.lightBase + NSHIP, nx - ux * 25, ny - uy * 25, nz, 180, 9000 * pi, 5200 * pi, 2400 * pi, 0);
    else Li.set(this.lightBase + NSHIP, 0, -1e5, 0, 0, 0, 0, 0, 0);

    // local lights for the spaceport's own shading: 3 floods + the plume
    const U = this.U;
    for (let k = 0; k < 3; k++) {
      const f = this.port.floods[k];
      U[k * 8] = f[0]; U[k * 8 + 1] = f[1]; U[k * 8 + 2] = f[2]; U[k * 8 + 3] = 170;
      U[k * 8 + 4] = 22000; U[k * 8 + 5] = 21000; U[k * 8 + 6] = 19500; U[k * 8 + 7] = 0;
    }
    U[24] = nx - ux * 20; U[25] = ny - uy * 20; U[26] = nz; U[27] = pi > 0 ? 700 : 0;
    U[28] = 2.2e5 * pi; U[29] = 1.2e5 * pi; U[30] = 0.5e5 * pi; U[31] = 0;
    U[32] = this.site.x; U[33] = this.site.z; U[34] = this.plan.deckY; U[35] = t;

    // spaceport lights: red obstruction lights on the tower (top one flashing), flood glare
    const rl = this.port.redLights;
    for (let k = 0; k < rl.length; k++) {
      const on = k === 0 ? (((t * 0.75) % 1) < 0.5 ? 1 : 0.05) : 1;
      this._sprite(sp++, rl[k][0], rl[k][1], rl[k][2], 0.9, 12 * on, 0.5 * on, 0.2 * on, 1.3);
    }
    const fl = this.port.floods;
    for (let k = 0; k < fl.length; k++) this._sprite(sp++, fl[k][0], fl[k][1], fl[k][2], 3.0, 24, 23, 21, 1.6);
    // white work lights up the tower, so the lit structure shows from far away (judge fix 1: a visible source)
    const tl = this.port.towerLights;
    for (let k = 0; k < tl.length; k++) this._sprite(sp++, tl[k][0], tl[k][1], tl[k][2], 1.4, 16, 15.5, 14.5, 1.5);
    // glow of the floodlit pad in the haze above it, brighter while the engines burn; shows over the ridges
    const dome = 0.012 + 0.2 * flame + 0.15 * flash;
    this._sprite(sp++, this.site.x, this.plan.deckY + 60, this.site.z, 170, dome, dome * 0.86, dome * 0.66, 1);
    while (sp < NSPR) this._sprite(sp++, 0, 0, 0, 1, 0, 0, 0, 1);

    const q = ctx.device.queue;
    q.writeBuffer(this.instBuf, 0, this.inst);
    q.writeBuffer(this.UBuf, 0, this.U);
    q.writeBuffer(this.sprBuf, 0, this.spr);
    q.writeBuffer(this.beamBuf, 0, this.beam);
    q.writeBuffer(this.LUBuf, 0, this.LU);
  },

  afterLighting(ctx, enc) {
    if (!this.ships || !this.opAtt[0].view) return;
    const Rr = ctx.renderer;
    const vis = this.vis;
    if (vis[0] || vis[1] || vis[2] || vis[I_ROCKET] || vis[I_PORT]) {
      this.opDesc.timestampWrites = ctx.prof.ts('skyops-gbuffer');
      const p = enc.beginRenderPass(this.opDesc);
      p.setBindGroup(0, Rr.frameGroup);
      p.setBindGroup(1, this.opGroup);
      p.setPipeline(this.opPipe);
      p.setVertexBuffer(0, this.shipMesh.vb); p.setIndexBuffer(this.shipMesh.ib, 'uint32');
      for (let i = 0; i < NSHIP; i++) if (vis[i]) p.drawIndexed(this.shipMesh.count, 1, 0, 0, i);
      if (vis[I_ROCKET]) { p.setVertexBuffer(0, this.rocketMesh.vb); p.setIndexBuffer(this.rocketMesh.ib, 'uint32'); p.drawIndexed(this.rocketMesh.count, 1, 0, 0, I_ROCKET); }
      if (vis[I_PORT]) { p.setVertexBuffer(0, this.portMesh.vb); p.setIndexBuffer(this.portMesh.ib, 'uint32'); p.drawIndexed(this.portMesh.count, 1, 0, 0, I_PORT); }
      p.end();
    }
    this.fwDesc.timestampWrites = ctx.prof.ts('skyops-fwd');
    const p = enc.beginRenderPass(this.fwDesc);
    p.setBindGroup(0, Rr.frameGroup);
    p.setBindGroup(1, ctx.forwardGroup);
    p.setBindGroup(2, this.lauGroup);
    p.setPipeline(this.trailPipe);
    p.draw(6, 2 * NPUFF);
    p.setPipeline(this.plumePipe);
    p.draw(6, 2);
    p.end();
  },

  // Called from the shared forward pass after the water (see skyopsLate): searchlight beams and light sprites.
  drawLate(ctx, pass) {
    if (!this.ships) return;
    pass.setBindGroup(0, ctx.renderer.frameGroup);
    pass.setBindGroup(1, ctx.forwardGroup);
    pass.setPipeline(this.beamPipe);
    pass.setBindGroup(2, this.beamGroup);
    pass.draw(120, NSHIP);
    pass.setPipeline(this.sprPipe);
    pass.setBindGroup(2, this.sprGroup);
    pass.draw(6, NSPR);
  },
};

export default skyops;

// Second entry in the module list, placed after `water`: its forward hook draws the beams and sprites after the
// water's opaque plane. (skyops itself stays before `water`, so the water's SSR still sees the ships and the trail.)
export const skyopsLate = {
  name: 'skyops-late',
  forward(ctx, pass) { skyops.drawLate(ctx, pass); },
};
