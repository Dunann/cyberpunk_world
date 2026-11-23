// Water (baseline): one large plane at y = 0 drawn in the forward pass.
// Refraction from the lit scene copy, Fresnel sky reflection, animated ripple normals.

const WATER_WGSL = /* wgsl */ `
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

@fragment fn fs(i: VOut) -> FOut {
  let p = i.wp;
  let t = time();
  let toCam = F.camPos.xyz - p;
  let dist = length(toCam);
  let v = toCam / dist;
  let fade = 1.0 - smoothstep(200.0, 3000.0, dist);
  let g1 = vec2f(gnoise2(p.xz * 0.08 + vec2f(t * 0.3, t * 0.1)), gnoise2(p.xz * 0.08 + vec2f(5.2, 1.3) - vec2f(t * 0.2, t * 0.25)));
  let g2 = vec2f(gnoise2(p.xz * 0.5 + vec2f(t * 0.9, 0.0)), gnoise2(p.xz * 0.5 + vec2f(3.1, t * 0.8)));
  let n = normalize(vec3f((g1.x * 0.12 + g2.x * 0.05) * fade, 1.0, (g1.y * 0.12 + g2.y * 0.05) * fade));
  let px = vec2i(i.pos.xy);
  let uv = i.pos.xy * F.res.zw;
  let sceneD = textureLoad(depthTex, px, 0);
  let behind = linearDepth(max(sceneD, 1e-7));
  let thick = max(behind - dist * dot(normalize(-toCam), F.camFwd.xyz) , 0.0);
  let ruv = clamp(uv + n.xz * 0.03, vec2f(0.001), vec2f(0.999));
  let refr = textureSampleLevel(sceneTex, sampClamp, ruv, 0.0).rgb;
  let absorb = exp(-vec3f(0.5, 0.25, 0.2) * thick * 0.6);
  var col = refr * absorb + vec3f(0.004, 0.008, 0.01) * (1.0 - absorb);
  let r = reflect(-v, n);
  let NdotV = max(dot(n, v), 0.0);
  let fres = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);
  col = mix(col, skyRadiance(vec3f(r.x, abs(r.y), r.z)), fres);
  col = applyFog(col, uv, dist);
  var o: FOut;
  o.color = vec4f(col, 1.0);
  o.motion = vec4f(motionVector(p, p), 0.0, 0.0);
  return o;
}
`;

export default {
  name: 'water',
  init(ctx) {
    this.pipe = ctx.renderer.forwardPipeline({ label: 'water', code: WATER_WGSL, blend: null, writeMotion: true });
  },
  forward(ctx, pass) {
    pass.setPipeline(this.pipe);
    pass.draw(6);
  },
};
