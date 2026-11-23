// Water: the river system and the lake as one surface at y = 0, drawn in the forward pass.
//  - flow-mapped wave normals (currents move downstream, calm lake and canal), mip-filtered for stable far water
//  - planar screen-space reflections (traced at half resolution in waterSSR.js) with normal-driven distortion that
//    stretches light reflections into long vertical streaks; sky / city-glow fallback where the screen has no data
//  - moon glitter (the light-show beams draw their own mirrored reflections, see lightshow.js)
//  - refraction with depth absorption, shoreline foam and soft edges, rain ripple rings, boat wakes
// Also owns the boats (boats.js) and the wet-ground reflections (waterSSR.js), driven from these hooks.

import { generateWater } from './waterGen.js';
import { WaterSSR } from './waterSSR.js';
import boats, { WGSL_BOAT_STRUCT, MAX_BOATS } from './boats.js';

const WATER_WGSL = /* wgsl */ `
${WGSL_BOAT_STRUCT}
@group(2) @binding(0) var reflTex: texture_2d<f32>;
@group(2) @binding(1) var flowTex: texture_2d<f32>;
@group(2) @binding(2) var waveTex: texture_2d<f32>;
@group(2) @binding(3) var<storage, read> wk: Wakes;
@group(2) @binding(4) var sampWave: sampler;

struct VOut { @builtin(position) pos: vec4f, @location(0) wp: vec3f };

@vertex fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  var q = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let c = floor(F.camPos.xz / 64.0) * 64.0;
  let xz = c + q[vi] * 9000.0;
  var o: VOut;
  o.wp = vec3f(xz.x, WATER_Y, xz.y);
  o.pos = F.viewProj * vec4f(o.wp, 1.0);
  return o;
}

struct FOut { @location(0) color: vec4f, @location(1) motion: vec4f };

// Boat wakes: Kelvin wedge arms, transverse waves and a turbulent foam trail. Returns (slope xz, foam).
fn wakes(p: vec2f, t: f32) -> vec3f {
  var s = vec2f(0.0);
  var foam = 0.0;
  let nb = u32(wk.info.x);
  for (var i = 0u; i < nb; i++) {
    let B = wk.b[i];
    let d = p - B.a.xy;
    if (dot(d, d) > 90000.0) { continue; }
    let fwd = B.a.zw;
    let side = vec2f(-fwd.y, fwd.x);
    let along = dot(d, fwd);
    let lat = dot(d, side);
    let hl = B.b.y; let hb = B.b.z; let spd = B.b.x;
    let back = -along - hl * 0.8;           // distance behind the stern
    let al = abs(lat);
    // bow wave and hull foam
    let hullD = length(max(abs(vec2f(along, lat)) - vec2f(hl * 0.92, hb * 0.9), vec2f(0.0)));
    foam += exp(-hullD * 0.7) * (0.35 + 0.65 * smoothstep(0.0, hl, along)) * saturate(spd * 0.4);
    if (back < -hl * 1.6 || back > 280.0) { continue; }
    let bk = max(back, 0.0);
    let decay = exp(-bk / (60.0 + spd * 18.0)) * saturate(spd * 0.35);
    // diverging waves on the arms (tan 19.5 deg = 0.354)
    let armD = al - bk * 0.354 - hb * 0.8;
    let arm = exp(-armD * armD / (8.0 + bk * 0.9)) * smoothstep(-hl, 4.0, back) * (1.0 - smoothstep(120.0, 260.0, bk));
    let ph = armD * 1.1 - bk * 0.35 - t * 2.2;
    let armN = side * sign(lat) + fwd * 0.354;
    s += armN * cos(ph) * arm * decay * 0.28;
    // transverse waves inside the wedge
    let inside = smoothstep(0.0, -6.0, armD) * smoothstep(-hl, 6.0, back);
    s += -fwd * cos(bk * 0.55 - t * 3.0) * inside * decay * 0.18;
    // turbulent trail
    let tw = hb * (1.0 + bk * 0.035);
    let trail = exp(-lat * lat / (tw * tw)) * exp(-bk / (35.0 + spd * 14.0)) * smoothstep(-hl * 1.2, 0.0, back) * saturate(spd * 0.5);
    let churn = gnoise2(vec2f(along, lat) * 0.35 + vec2f(t * 1.3, 0.0)) * 0.5 + 0.5;
    foam += trail * (0.4 + 0.8 * churn) + arm * decay * 0.25 * churn;
    s += vec2f(gnoise2(p * 0.6 + t * 0.9), gnoise2(p * 0.6 - t * 0.8 + 7.0)) * trail * 0.25;
  }
  return vec3f(s, foam);
}

// Rain drop rings (two layers of cells, one drop per cell per cycle). Returns slope.
fn rainRings(p: vec2f, t: f32) -> vec2f {
  var s = vec2f(0.0);
  for (var l = 0; l < 4; l++) {
    let q = p * 2.2 + vec2f(f32(l) * 3.71, f32(l) * 1.37);
    let cell = floor(q);
    let f = fract(q) - 0.5;
    let h = hash22(cell + f32(l) * 17.0);
    let c = (h - 0.5) * 0.4;
    let ph = fract(t * (0.9 + 0.3 * h.y) + h.x * 7.0);
    let r = ph * 0.42;
    let dv = f - c;
    let dl = max(length(dv), 1e-4);
    let x = dl - r;
    let env = (1.0 - ph) * (1.0 - ph) * exp(-x * x * 500.0);
    s += dv / dl * cos(x * 55.0) * env * 0.55;
  }
  return s;
}

fn ndcOf(dir: vec3f) -> vec2f {
  let c = F.viewProj * vec4f(dir, 0.0);
  return c.xy / max(c.w, 1e-3);
}

@fragment fn fs(i: VOut) -> FOut {
  let p = i.wp;
  let t = time();
  let cam = F.camPos.xyz;
  let toCam = cam - p;
  let dist = length(toCam);
  let v = toCam / dist;
  let fwd = F.camFwd.xyz;

  // ---- flow-mapped waves (all texture samples first: uniform control flow)
  let wuv = (p.xz - T_ORIGIN) / T_SIZE;
  let fl = textureSampleLevel(flowTex, sampClamp, wuv, 0.0);
  let flow = fl.xy;
  let river = fl.z;
  let T = 2.4;
  let ph0 = fract(t / T);
  let ph1 = fract(t / T + 0.5);
  let w0 = 1.0 - abs(2.0 * ph0 - 1.0);
  let w1 = 1.0 - w0;
  let norm = 1.0 / sqrt(w0 * w0 + w1 * w1);
  let o0 = flow * (ph0 * T);
  let o1 = flow * (ph1 * T);
  let r1 = mat2x2f(0.8, 0.6, -0.6, 0.8);
  let A1 = textureSample(waveTex, sampWave, (p.xz - o0) * (1.0 / 38.0));
  let B1 = textureSample(waveTex, sampWave, (p.xz - o1) * (1.0 / 38.0) + vec2f(0.31, 0.57));
  let A2 = textureSample(waveTex, sampWave, (r1 * (p.xz - o0)) * (1.0 / 9.5) + vec2f(0.13, 0.71));
  let B2 = textureSample(waveTex, sampWave, (r1 * (p.xz - o1)) * (1.0 / 9.5) + vec2f(0.67, 0.21));
  let wind = vec2f(F.misc.z, F.misc.w);
  let C = textureSample(waveTex, sampWave, (transpose(r1) * p.xz) * (1.0 / 3.3) + wind * t * 0.11);

  // macro variation (breaks up tiling): wind gust patches and calmer streaks
  let mvar = textureSample(waveTex, sampWave, p.xz * (1.0 / 640.0) + vec2f(0.21, 0.83));
  let gust = 0.9 + 0.1 * clamp(mvar.x - 0.5 * mvar.y, -1.0, 1.0);
  let calm = mix(0.35, 1.0, river) * gust;
  let K1 = 0.03 * calm; let K2 = 0.075 * calm; let K3 = 0.045 * (0.6 + 0.6 * F.params.x) * mix(0.6, 1.0, river);
  let m1 = (A1 * w0 + B1 * w1); let m2 = (A2 * w0 + B2 * w1);
  let s1 = m1.xy * norm; let s2a = A2.xy * w0 + B2.xy * w1;
  let s2 = r1 * (s2a * norm);
  let s3 = transpose(r1) * C.xy;
  var slope = s1 * K1 + s2 * K2 + s3 * K3;
  // sub-pixel slope variance from the filtered mips (wide highlights instead of shimmer far away)
  let var1 = max(m1.zw - m1.xy * m1.xy, vec2f(0.0));
  let var2 = max(m2.zw - m2.xy * m2.xy, vec2f(0.0));
  let var3 = max(C.zw - C.xy * C.xy, vec2f(0.0));
  let sigma2 = dot(var1, vec2f(1.0)) * K1 * K1 + dot(var2, vec2f(1.0)) * K2 * K2 + dot(var3, vec2f(1.0)) * K3 * K3;
  let farFade = 1.0 - smoothstep(600.0, 4000.0, dist) * 0.7;
  slope *= farFade;

  // ---- wakes and rain
  var foam = 0.0;
  if (dist < 1500.0) {
    let wv = wakes(p.xz, t);
    slope += wv.xy;
    foam += wv.z;
  }
  if (F.params.x > 0.0 && dist < 120.0) {
    slope += rainRings(p.xz, t) * 0.3 * F.params.x * (1.0 - smoothstep(35.0, 120.0, dist));
  }
  let n = normalize(vec3f(-slope.x, 1.0, -slope.y));

  // ---- depth, refraction, absorption
  let px = vec2i(i.pos.xy);
  let uv = i.pos.xy * F.res.zw;
  let sd = textureLoad(depthTex, px, 0);
  let zS = select(1e6, linearDepth(sd), sd > 0.0);
  let zW = dot(p - cam, fwd);
  let cosV = max(dot(-v, fwd), 0.05);
  let pathLen = max(zS - zW, 0.0) / cosV;
  let vdepth = pathLen * max(v.y, 0.02);
  var ruv = uv + slope * vec2f(1.0, -1.0) * 0.05 * saturate(vdepth * 0.4) / (1.0 + dist * 0.02);
  ruv = clamp(ruv, vec2f(0.001), vec2f(0.999));
  let rd = textureLoad(depthTex, vec2i(ruv * F.res.xy), 0);
  let rz = select(1e6, linearDepth(rd), rd > 0.0);
  if (rz < zW) { ruv = uv; }
  let refrPath = max(select(rz, zS, rz < zW) - zW, 0.0) / cosV;
  let refr = textureSampleLevel(sceneTex, sampClamp, ruv, 0.0).rgb;
  let absorb = exp(-vec3f(0.42, 0.16, 0.13) * min(refrPath, 200.0));
  let murk = vec3f(0.002, 0.006, 0.007) + vec3f(0.012, 0.006, 0.01) * river;
  var under = refr * absorb + murk * (1.0 - absorb.g);

  // ---- reflection: half-res planar SSR distorted by the surface normal
  let Rf = normalize(vec3f(-v.x, v.y, -v.z));
  var R = reflect(-v, n);
  if (R.y < 0.005) { R = normalize(vec3f(R.x, 0.005, R.z)); }
  var off = (ndcOf(R) - ndcOf(Rf)) * vec2f(0.5, -0.5);
  off = clamp(off * 0.4, vec2f(-0.04), vec2f(0.04));
  let streak = clamp(sqrt(sigma2) * 0.9 + 0.0015, 0.0, 0.035);
  var refl = vec3f(0.0);
  var rw = 0.0;
  for (var k = 0; k < 5; k++) {
    let fk = f32(k) - 2.0;
    let su = clamp(uv + off + vec2f(0.0, fk * streak), vec2f(0.0), vec2f(1.0));
    let s = textureSampleLevel(reflTex, sampClamp, su, 0.0);
    let w = select(0.0, exp(-fk * fk * 0.35), s.a > 1.9);
    refl += s.rgb * w;
    rw += w;
  }
  if (rw < 0.01) {
    let s = textureSampleLevel(reflTex, sampClamp, uv, 0.0);
    refl = select(skyAmbient(R), s.rgb, s.a > 1.9);
  } else {
    refl /= rw;
  }

  // moon glitter
  let hm = normalize(v + F.moon.xyz);
  let a = 0.05 + sqrt(sigma2) * 0.6;
  let a2 = a * a;
  let nh = max(dot(n, hm), 0.0);
  let dd = nh * nh * (a2 - 1.0) + 1.0;
  let D = a2 / (PI * dd * dd);
  let moonSpec = vec3f(0.55, 0.65, 0.95) * F.moon.w * D * 0.06 * saturate(dot(n, F.moon.xyz));

  let NdotV = saturate(dot(n, v));
  let fres = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);
  var col = mix(under, refl, fres) + moonSpec;

  // ---- foam: shoreline (shallow) + wakes, advected with the current
  let shore = (1.0 - smoothstep(0.0, 1.6, vdepth)) * smoothstep(0.02, 0.25, vdepth);
  foam = max(foam, shore * 0.9) * (1.0 - smoothstep(300.0, 900.0, dist));
  if (foam > 0.01) {
    let fp = p.xz - flow * t * 0.6;
    let fn1 = gnoise2(fp * 0.45) * 0.5 + 0.5;
    let fn2 = gnoise2(fp * 1.7 + 5.0) * 0.5 + 0.5;
    foam = saturate(foam * (fn1 * 0.7 + fn2 * 0.6) - 0.15);
    // foam is lit by the city glow, the sky and whatever the surface reflects
    let foamLight = skyAmbient(vec3f(0.0, 1.0, 0.0)) * 1.5 + min(luma(refl), 2.0) * vec3f(0.4) + vec3f(0.05, 0.045, 0.06);
    col = mix(col, foamLight, foam * 0.85);
  }

  // soft edge where the water is very shallow
  if (vdepth < 0.18) {
    let unref = textureSampleLevel(sceneTex, sampClamp, uv, 0.0).rgb;
    col = mix(unref, col, smoothstep(0.0, 0.18, vdepth));
  }

  col = applyFog(col, uv, dist);
  var o: FOut;
  o.color = vec4f(col, 1.0);
  o.motion = vec4f(motionVector(p, p), 0.0, 0.0);
  return o;
}
`;

export default {
  name: 'water',
  async init(ctx) {
    const d = ctx.device, r = ctx.renderer;
    const gen = generateWater(ctx);
    this.flowTex = gen.flowTex; this.waveTex = gen.waveTex;
    this.ssr = new WaterSSR();
    this.ssr.init(ctx);
    await boats.init(ctx);
    const FR = GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX;
    this.layout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: FR, texture: { sampleType: 'float' } },
      { binding: 1, visibility: FR, texture: { sampleType: 'float' } },
      { binding: 2, visibility: FR, texture: { sampleType: 'float' } },
      { binding: 3, visibility: FR, buffer: { type: 'read-only-storage' } },
      { binding: 4, visibility: FR, sampler: { type: 'filtering' } },
    ] });
    this.sampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', maxAnisotropy: 1 });
    this.pipe = r.forwardPipeline({ label: 'water', code: WATER_WGSL, groups: [this.layout], blend: null, writeMotion: true });
    this.flowView = this.flowTex.createView();
    this.waveView = this.waveTex.createView();
  },
  _group(ctx) {
    this.group = ctx.device.createBindGroup({ layout: this.layout, entries: [
      { binding: 0, resource: this.ssr.reflView }, { binding: 1, resource: this.flowView },
      { binding: 2, resource: this.waveView }, { binding: 3, resource: { buffer: boats.wakeBuf } },
      { binding: 4, resource: this.sampler }] });
  },
  resize(ctx) {
    this.ssr.resize(ctx);
    this._group(ctx);
  },
  update(ctx) {
    boats.update(ctx);
  },
  gbuffer(ctx, pass) {
    boats.gbuffer(ctx, pass);
  },
  afterLighting(ctx, enc) {
    this.ssr.run(ctx, enc);
  },
  forward(ctx, pass) {
    pass.setPipeline(this.pipe);
    pass.setBindGroup(2, this.group);
    pass.draw(6);
  },
};
