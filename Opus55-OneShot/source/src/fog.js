// Froxel volumetric fog. Writes ctx.renderer.fogTex (FOG.W x FOG.H x FOG.D, rgba16float):
//   rgb = in-scattered light integrated from the camera to the slice center, a = transmittance.
// Slices are exponentially distributed between FOG.NEAR and FOG.FAR (see fogSlice() in common.js).
// Baseline version: height fog lit by sky ambient, warm city glow near the ground and moon forward scattering.

import { WGSL_FRAME_STRUCT, FOG } from './common.js';

const FOG_WGSL = /* wgsl */ `
${WGSL_FRAME_STRUCT}
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var outFog: texture_storage_3d<rgba16float, write>;

const FW = ${FOG.W}u; const FH = ${FOG.H}u; const FD = ${FOG.D}u;
const NEAR = ${FOG.NEAR}.0; const FAR = ${FOG.FAR}.0;

fn sliceDist(z: f32) -> f32 { return NEAR * pow(FAR / NEAR, z / f32(FD)); }

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= FW || id.y >= FH) { return; }
  let uv = (vec2f(id.xy) + 0.5) / vec2f(f32(FW), f32(FH));
  let ndc = vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 1.0, 1.0);
  let wp = F.invViewProj * ndc;
  let dir = normalize(wp.xyz / wp.w - F.camPos.xyz);
  let cam = F.camPos.xyz;
  let md = max(dot(dir, F.moon.xyz), 0.0);
  let moonPhase = 0.6 * pow(md, 8.0) + 0.1;
  var T = 1.0;
  var S = vec3f(0.0);
  var prev = 0.0;
  for (var z = 0u; z < FD; z++) {
    let dc = sliceDist(f32(z) + 0.5);
    let ds = dc - prev;
    let p = cam + dir * (prev + dc) * 0.5;
    let hgt = max(p.y - F.fog.z, -50.0);
    let sigma = F.fog.x * (exp(-F.fog.y * hgt) + 0.08);
    let trans = exp(-sigma * ds);
    // light arriving at the fog: city glow low, cool sky above
    let glow = vec3f(0.55, 0.22, 0.32) * exp(-max(hgt, 0.0) * 0.006);
    let sky = vec3f(0.06, 0.07, 0.13);
    let Li = (glow * 0.22 + sky * 0.5) + vec3f(0.35, 0.42, 0.6) * F.moon.w * moonPhase;
    S += T * Li * (1.0 - trans);
    T *= trans;
    textureStore(outFog, vec3u(id.xy, z), vec4f(S, T));
    prev = dc;
  }
}
`;

export default {
  name: 'fog',
  init(ctx) {
    const d = ctx.device, r = ctx.renderer;
    this.layout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float', viewDimension: '3d' } },
    ] });
    this.pipe = r.computePipeline({ label: 'fog', code: FOG_WGSL, withFrame: false, groups: [this.layout] });
    this.group = d.createBindGroup({ layout: this.layout, entries: [
      { binding: 0, resource: { buffer: r.frameBuf } },
      { binding: 1, resource: r.fogTex.createView({ dimension: '3d' }) },
    ] });
    this.desc = { timestampWrites: undefined };
  },
  compute(ctx, enc) {
    this.desc.timestampWrites = ctx.prof.ts('fog');
    const p = enc.beginComputePass(this.desc);
    p.setPipeline(this.pipe);
    p.setBindGroup(0, this.group);
    p.dispatchWorkgroups(Math.ceil(FOG.W / 8), Math.ceil(FOG.H / 8));
    p.end();
  },
};
