// Sky operations (idea I-020, the airships of I-009 without the launch): three advertising airships holding
// racetracks over the rivers, with LED bands, lit outlines and searchlights.
//
// Rendering:
//   In afterLighting, before the water's SSR so the river reflects the ships, an opaque pass of this module (timed
//   as skyops-gbuffer): the airships shade themselves (moon, sky, city glow from below, emissive, fog) and write the
//   lit colour, G-buffer normal, motion (with previous-frame transforms) and depth.
//   In the shared forward pass, after the water (the `skyopsLate` entry in main.js): searchlight beams and light
//   sprites (additive). Drawn earlier, the water's opaque plane would paint over them wherever it lies behind them.
// Lights: 3 searchlight hit points (at most one lit at a time).
// Placement and timing rules live in skyopsLayout.js.

import { VERTEX_LAYOUT, makeCamTest } from './trafficGeom.js';
import { WGSL_LIB, WGSL_FRAME } from './common.js';
import { HDR_FORMAT, DEPTH_FORMAT } from './renderer.js';
import { shader } from './gpu.js';
import { LANES, CIRCLES } from './air.js';
import * as L from './skyopsLayout.js';
import { airshipMesh, shipOutlineLights } from './skyopsMesh.js';
import { buildSkyAtlas, pageRow, PAGES_PER_SHIP } from './skyopsAtlas.js';
import { SKY_OPAQUE_WGSL, SKY_SPRITE_WGSL, SKY_BEAM_WGSL } from './skyopsWgsl.js';

const NSHIP = 3;
const INST_F = 32;              // floats per instance (8 vec4)
const SHOW_DIM_R = 1500;        // ships this close to the drone-show centre dim during the show
const HUE = [0.52, 0.11, 0.36]; // LED palette offset per ship: cyan, amber, green (no magenta, judge fix 3)
// Searchlights (judge fix 2): at most one beam in the sky. Ships take turns in BEAM_SLOT s slots (fading over
// BEAM_FADE s at each end), and the slot owner's beam shows only while it lands on lit city (on land, among
// buildings) within BEAM_RANGE m of slant range. Each beam is aimed at the outer bank of its racetrack and sweeps it.
const BEAM_SLOT = 40, BEAM_FADE = 2, BEAM_RANGE0 = 640, BEAM_RANGE1 = 720;
const BANK_STEP = 20, BANK_MAX = 600;
// lit-city weight around the beam's hit point (see _cityWeight), and the weight that gives a full beam
const CITY_R0 = 60, CITY_R1 = 200, CITY_W0 = 1, CITY_W1 = 3;
// outline lights (judge fix 3): colour * intensity per kind (spine, keel, fin edge)
const OUTLINE_COL = [[7, 6.4, 5.6], [7, 4.3, 1.8], [5.6, 6.2, 7.4]];
const OUTLINE = shipOutlineLights();
const NOUT = OUTLINE.length / 4;
// LED band pages (I-020): each page shows for PAGE_PERIOD s, then the band switches to the next page. Each ship
// starts at its own phase, so the three ships do not change pages together.
const PAGE_PERIOD = 5;

// ship-local light positions (x left, y up, z forward)
const R = L.HULL_R;
const NAV = [
  [R + 0.7, -1.0, 10], [-(R + 0.7), -1.0, 10], [0, 0, -91.8], [0, R + 1.4, 12], [0, -R - 6.2, 18], [0, -R - 5.3, 30.6], [0, R + 7.4, 50],
];
const NSPR = NSHIP * (NAV.length + NOUT); // light sprites: nav and outline lights of each ship

const skyops = {
  name: 'skyops',

  async init(ctx) {
    const d = ctx.device, Rr = ctx.renderer;
    this.cam = makeCamTest();
    // ---- meshes
    const ship = airshipMesh();
    this.shipTris = ship.idx.length / 3;
    this.shipMesh = ship.upload(d, 'airship');
    this.atlas = buildSkyAtlas(d);

    // ---- buffers
    this.inst = new Float32Array(NSHIP * INST_F);
    this.instBuf = d.createBuffer({ label: 'skyops-inst', size: this.inst.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.spr = new Float32Array(NSPR * 8);
    this.sprBuf = d.createBuffer({ label: 'skyops-spr', size: this.spr.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.beam = new Float32Array(24);
    this.beamBuf = d.createBuffer({ label: 'skyops-beams', size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    // ---- pipelines
    const VF = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
    this.opLayout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: VF, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ] });
    this.opGroup = d.createBindGroup({ layout: this.opLayout, entries: [
      { binding: 0, resource: { buffer: this.instBuf } }, { binding: 1, resource: this.atlas.view },
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

    // ---- pass descriptors (views filled in resize)
    this.opAtt = [{ view: null, loadOp: 'load', storeOp: 'store' }, { view: null, loadOp: 'load', storeOp: 'store' }, { view: null, loadOp: 'load', storeOp: 'store' }];
    this.opDesc = { colorAttachments: this.opAtt, depthStencilAttachment: { view: null, depthLoadOp: 'load', depthStoreOp: 'store' }, timestampWrites: undefined };

    // ---- lights: 3 searchlight hit points
    this.lightBase = ctx.lights.reserve(NSHIP);

    this.ships = null;
    this._owner = 0; this._slotW = 0.5;
    this._lv = new Float64Array(8); this._vp = new Float64Array(3); this._cq = new Float64Array(2);
    this.vis = new Uint8Array(NSHIP);
    this._st = { u: 0.5 }; this._pt = { u: 0.5 };
    this._p3 = new Float64Array(3);
    // nav light colours: red port, green starboard, white tail, strobe A, strobe B, searchlight lamp, beacon
    this._navCol = new Float32Array([10, 0.5, 0.3, 0.5, 9, 2.2, 7, 7, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      window.__skyops = this;
      window.__skyopsLayout = L;
      window.__skyopsMetrics = () => this._metrics(ctx);
    }
  },

  // Dev only (review-1 fix 2): projected size of each airship hull in the current frame, counting only samples that
  // are on screen and not hidden by nearer opaque geometry (depth read back).
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
    for (let g = 0; g < NSHIP; g++) groups.push({ name: this.ships[g].name, vis: [] });
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
  },

  // Airship altitudes need the air-traffic corridors, which traffic.init creates after this module's init.
  _planShips(ctx) {
    const traffic = { lanes: LANES, circles: CIRCLES, corridors: ctx.world.shared.airCorridors || [] };
    this.ships = L.planAirships(ctx.world, traffic);
    // Searchlight aim. The outer side (away from the track centre) is one side of the track's direction for the
    // whole lap (`side`: +1 left, -1 right, the majority over the samples; a racetrack around a river stretch is
    // convex). Per track sample: how far the beam reaches across, 60 m inland of the first dry ground on the outer
    // side (BANK_STEP search up to BANK_MAX m; 250 m when there is none), smoothed along the track over +-40 m so
    // the aim point moves smoothly. The per-frame code interpolates it between samples.
    for (const sh of this.ships) {
      const T = sh.track;
      let cx = 0, cz = 0, vote = 0;
      for (let k = 0; k < T.n; k++) { cx += T.x[k]; cz += T.z[k]; }
      cx /= T.n; cz /= T.n;
      for (let k = 0; k < T.n; k++) vote += T.hz[k] * (T.x[k] - cx) - T.hx[k] * (T.z[k] - cz) >= 0 ? 1 : -1;
      sh.side = vote >= 0 ? 1 : -1;
      const raw = new Float32Array(T.n);
      for (let k = 0; k < T.n; k++) {
        const nx = sh.side * T.hz[k], nz = -sh.side * T.hx[k];
        raw[k] = 250;
        for (let m = 1; m * BANK_STEP <= BANK_MAX; m++) {
          if (ctx.world.heightAt(T.x[k] + nx * m * BANK_STEP, T.z[k] + nz * m * BANK_STEP) > 2) { raw[k] = m * BANK_STEP + 60; break; }
        }
      }
      sh.reach = new Float32Array(T.n);
      for (let k = 0; k < T.n; k++) {
        let a = 0;
        for (let m = -10; m <= 10; m++) a += raw[(k + m + T.n) % T.n];
        sh.reach[k] = a / 21;
      }
    }
    ctx.world.shared.airships = this.ships.map((s) => ({ name: s.name, alt: s.alt, lap: s.track.length }));
  },

  // Instance transform (columns l, u, f with the position in w; prev = previous frame slot).
  // Per-frame writers take objects and integers only: update() is too large for V8 to inline helpers, and every
  // double passed to a call that is not inlined is boxed (a heap allocation).
  _shipXf(i, st, prev) {
    const o = i * INST_F + (prev ? 12 : 0), D = this.inst;
    D[o] = st.lx; D[o + 1] = st.ly; D[o + 2] = st.lz; D[o + 3] = st.x;
    D[o + 4] = st.ux; D[o + 5] = st.uy; D[o + 6] = st.uz; D[o + 7] = st.y;
    D[o + 8] = st.fx; D[o + 9] = st.fy; D[o + 10] = st.fz; D[o + 11] = st.z;
  },
  // Lit city around the point (this._cq x, z): a smooth, distance-weighted sum of the building footprints whose
  // centres lie within CITY_R1 m (full weight inside CITY_R0). A footprint of 20 x 20 m counts 1 (at most 4).
  // Buildings are colliders over 8 m tall and 6-80 m across both ways, which leaves out bridge decks,
  // embankment promenades and parapets, and transit pillars. Each collider is counted once, from the 64 m cell that
  // holds its centre. The sum is continuous as the point moves, so the beam never steps in brightness.
  _cityWeight(w) {
    const x = this._cq[0], z = this._cq[1];
    const i0 = Math.floor((x - CITY_R1) / 64), i1 = Math.floor((x + CITY_R1) / 64);
    const j0 = Math.floor((z - CITY_R1) / 64), j1 = Math.floor((z + CITY_R1) / 64);
    let sum = 0;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const cs = w.collidersNear(i * 64 + 32, j * 64 + 32);
      if (!cs) continue;
      for (let m = 0; m < cs.length; m++) {
        const c = cs[m];
        if (c.hy <= 4 || c.hx < 3 || c.hz < 3 || c.hx >= 40 || c.hz >= 40) continue;
        if (Math.floor(c.cx / 64) !== i || Math.floor(c.cz / 64) !== j) continue;
        const dx = c.cx - x, dz = c.cz - z, d2 = dx * dx + dz * dz;
        if (d2 >= CITY_R1 * CITY_R1) continue;
        let f = Math.min(Math.max((CITY_R1 - Math.sqrt(d2)) / (CITY_R1 - CITY_R0), 0), 1);
        f = f * f * (3 - 2 * f);
        sum += Math.min(c.hx * c.hz / 100, 4) * f;
      }
    }
    return sum;
  },

  // Write light i of the module from this._lv (x, y, z, radius, r, g, b, flicker) straight into the shared light
  // list, the same as lights.set, without passing doubles through a call (V8 would box each one).
  _putLight(Li, i) {
    const o = i * 8, d = Li.data, v = this._lv;
    for (let k = 0; k < 8; k++) d[o + k] = v[k];
    if (i < Li.dirtyLo) Li.dirtyLo = i;
    if (i > Li.dirtyHi) Li.dirtyHi = i;
  },

  // View test of the sphere (this._vp x, y, z) of radius r (same as the camera test's visible()).
  _inView(r) {
    const c = this.cam, v = this._vp;
    const dx = v[0] - c.x, dy = v[1] - c.y, dz = v[2] - c.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < r) return true;
    const sr = r / d, cr = Math.sqrt(Math.max(0, 1 - sr * sr));
    return (dx * c.fx + dy * c.fy + dz * c.fz) / d > c.cosA * cr - c.sinA * sr;
  },

  // scale a sprite's colour (the searchlight lamp follows its beam)
  _lampW(k, wgt) { const o = k * 8 + 4, S = this.spr; S[o] *= wgt; S[o + 1] *= wgt; S[o + 2] *= wgt; },

  // One airship per call (kept apart from update so V8 optimizes it): transforms, nav and outline lights,
  // searchlight. Takes the sprite slot to start at and returns the next one.
  _updateShip(ctx, i, sp) {
    const t = ctx.time, dt = ctx.dt, w = ctx.world, Li = ctx.lights, S = this.spr;
    const showI = ctx.show.intensity, owner = this._owner, slotW = this._slotW;
    const st = this._st, pt = this._pt;
    const sh = this.ships[i];
    L.shipState(sh, t, st);
    L.shipState(sh, t - dt, pt);
    this._shipXf(i, st, false); this._shipXf(i, pt, true);
    const sx = st.x - L.SHOW_CENTER[0], sz = st.z - L.SHOW_CENTER[2];
    const nearShow = sx * sx + sz * sz < SHOW_DIM_R * SHOW_DIM_R;
    const dim = nearShow ? Math.min(showI * 20, 1) : 0;
    const led = 1 - 0.7 * dim, beamOn = 1 - dim;
    const o = i * INST_F + 24, D = this.inst;
    // LED band page shown now
    const pk = Math.floor((t + sh.seed * PAGE_PERIOD * PAGES_PER_SHIP) / PAGE_PERIOD);
    const page = ((pk % PAGES_PER_SHIP) + PAGES_PER_SHIP) % PAGES_PER_SHIP;
    D[o] = 0; D[o + 1] = i; D[o + 2] = led; D[o + 3] = 0;
    D[o + 4] = pageRow(i, page); D[o + 5] = 0; D[o + 6] = HUE[i]; D[o + 7] = 0;
    const vp = this._vp; vp[0] = st.x; vp[1] = st.y; vp[2] = st.z;
    this.vis[i] = this._inView(110) ? 1 : 0;

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
      const so = sp++ * 8;
      S[so] = x; S[so + 1] = y; S[so + 2] = z; S[so + 3] = k === 5 ? 1.2 : 0.7;
      S[so + 4] = c[k * 3]; S[so + 5] = c[k * 3 + 1]; S[so + 6] = c[k * 3 + 2]; S[so + 7] = k >= 3 && k <= 4 ? 1.8 : 1.4;
    }

    // outline lights along the spine, the keel and the fin edges (fade to >= 1.3 px dots at a distance)
    for (let k = 0; k < NOUT; k++) {
      const qx = OUTLINE[k * 4], qy = OUTLINE[k * 4 + 1], qz = OUTLINE[k * 4 + 2], oc = OUTLINE_COL[OUTLINE[k * 4 + 3]];
      const so = sp++ * 8;
      S[so] = st.x + st.lx * qx + st.ux * qy + st.fx * qz; S[so + 1] = st.y + st.ly * qx + st.uy * qy + st.fy * qz;
      S[so + 2] = st.z + st.lz * qx + st.uz * qy + st.fz * qz; S[so + 3] = 0.8;
      S[so + 4] = oc[0]; S[so + 5] = oc[1]; S[so + 6] = oc[2]; S[so + 7] = 1.3;
    }

    // searchlight: aimed at the outer bank (the side away from the track centre). March outward from the ship
    // to the first dry ground (at most BANK_MAX m), aim 60 m inland of it, sweeping along and across the bank.
    let hx = st.fx, hz = st.fz; const hl = Math.sqrt(hx * hx + hz * hz) || 1; hx /= hl; hz /= hl;
    // outer side from the interpolated track direction (heading * dir); reach interpolated between samples
    const nx = sh.side * hz * sh.dir, nz = -sh.side * hx * sh.dir;
    const n = sh.track.n, u = st.u, k0 = Math.floor(u) % n, k1 = (k0 + 1) % n, fu = u - Math.floor(u);
    const reach = sh.reach[k0] + (sh.reach[k1] - sh.reach[k0]) * fu + 40 * Math.sin(t * 0.11 + sh.seed * 6);
    const along = 120 * Math.sin(t * 0.07 + sh.seed * 5);
    const tx = ap[0] + nx * reach + hx * along, tz = ap[2] + nz * reach + hz * along;
    const gy = Math.max(w.heightAt(tx, tz), 0);
    const ex = tx - ap[0], ey = gy - ap[1], ez = tz - ap[2];
    const Lb = Math.sqrt(ex * ex + ey * ey + ez * ez);
    // only the slot owner's beam, and only while it lands on lit city within range
    let bw = 0;
    if (i === owner && slotW > 0 && beamOn > 0) {
      this._cq[0] = tx; this._cq[1] = tz;
      let a = Math.min(Math.max((this._cityWeight(w) - CITY_W0) / (CITY_W1 - CITY_W0), 0), 1);
      // (no separate land test: the aim is 20-100 m inland of the bank by construction, and a height gate stepped
      // at steep embankment walls)
      let c = Math.min(Math.max((Lb - BEAM_RANGE0) / (BEAM_RANGE1 - BEAM_RANGE0), 0), 1);
      a = a * a * (3 - 2 * a); c = c * c * (3 - 2 * c);
      bw = slotW * beamOn * a * (1 - c);
    }
    const B = this.beam, bo = i * 8;
    B[bo] = ap[0]; B[bo + 1] = ap[1] - 0.5; B[bo + 2] = ap[2]; B[bo + 3] = bw;
    B[bo + 4] = tx; B[bo + 5] = gy; B[bo + 6] = tz; B[bo + 7] = 2 + Lb * Math.tan(3.2 * Math.PI / 180);
    this._lampW(spLamp, bw);
    const lv = this._lv;
    if (bw > 0.01) { lv[0] = tx; lv[1] = gy + 8; lv[2] = tz; lv[3] = 34; lv[4] = 170 * bw; lv[5] = 180 * bw; lv[6] = 205 * bw; }
    else { lv[0] = 0; lv[1] = -1e5; lv[2] = 0; lv[3] = 0; lv[4] = 0; lv[5] = 0; lv[6] = 0; }
    lv[7] = 0;
    this._putLight(Li, this.lightBase + i);
    return sp;
  },

  update(ctx) {
    if (!this.ships) this._planShips(ctx);
    const t = ctx.time;
    this.cam.set(ctx.cam, ctx.renderer.width / Math.max(ctx.renderer.height, 1));
    let sp = 0;

    // ---- airships (searchlights: one slot owner at a time)
    const slot = Math.floor(t / BEAM_SLOT), tau = t - slot * BEAM_SLOT;
    this._owner = ((slot % NSHIP) + NSHIP) % NSHIP;
    let fi = Math.min(Math.max(tau / BEAM_FADE, 0), 1), fo = Math.min(Math.max((tau - (BEAM_SLOT - BEAM_FADE)) / BEAM_FADE, 0), 1);
    fi = fi * fi * (3 - 2 * fi); fo = fo * fo * (3 - 2 * fo);
    this._slotW = fi * (1 - fo);
    for (let i = 0; i < NSHIP; i++) sp = this._updateShip(ctx, i, sp);

    const q = ctx.device.queue;
    q.writeBuffer(this.instBuf, 0, this.inst);
    q.writeBuffer(this.sprBuf, 0, this.spr);
    q.writeBuffer(this.beamBuf, 0, this.beam);
  },

  afterLighting(ctx, enc) {
    if (!this.ships || !this.opAtt[0].view) return;
    const Rr = ctx.renderer;
    const vis = this.vis;
    if (!(vis[0] || vis[1] || vis[2])) return;
    this.opDesc.timestampWrites = ctx.prof.ts('skyops-gbuffer');
    const p = enc.beginRenderPass(this.opDesc);
    p.setBindGroup(0, Rr.frameGroup);
    p.setBindGroup(1, this.opGroup);
    p.setPipeline(this.opPipe);
    p.setVertexBuffer(0, this.shipMesh.vb); p.setIndexBuffer(this.shipMesh.ib, 'uint32');
    for (let i = 0; i < NSHIP; i++) if (vis[i]) p.drawIndexed(this.shipMesh.count, 1, 0, 0, i);
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
// water's opaque plane. (skyops itself stays before `water`, so the water's SSR still sees the ships.)
export const skyopsLate = {
  name: 'skyops-late',
  forward(ctx, pass) { skyops.drawLate(ctx, pass); },
};
