// Land height function shared by the world heightmap generator (world.js GEN_HEIGHT) and the
// far-field terrain generator (terrain.js), so the near heightmap and the endless far mountains match.
// Requires WGSL_LIB (fbm2, gnoise2) and the GEN_COMMON helpers ridged() and lineDist() from world.js
// (terrain.js provides identical copies).

export const LAND_WGSL = /* wgsl */ `
// Tea / rice terrace patches on rural foothills (0..1).
fn landTerraceMask(p: vec2f) -> f32 {
  let n = fbm2(p * 0.0019 + vec2f(41.0, -13.0), 3);
  let rr = length((p - vec2f(300.0, -300.0)) * vec2f(1.0, 0.92));
  // foothill band around the city + the tea hills west of the lake
  let band = smoothstep(3500.0, 4100.0, rr) * (1.0 - smoothstep(5000.0, 5600.0, rr));
  let tea = 1.0 - smoothstep(500.0, 900.0, length((p - vec2f(-3050.0, 2350.0)) * vec2f(0.8, 1.0)));
  return smoothstep(0.14, 0.3, n) * max(band, tea);
}

// Ridged multifractal with slightly rounded crests (soft abs), for forested subtropical ranges.
fn landRidged(p0: vec2f, oct: i32) -> f32 {
  var p = p0; var a = 0.5; var s = 0.0; var w = 1.0;
  for (var i = 0; i < oct; i++) {
    let g = gnoise2(p);
    var n = 1.0 - sqrt(g * g + 0.012);
    n = n * n * w;
    w = clamp(n * 1.8, 0.0, 1.0);
    s += a * n; p = rot2(0.55) * p * 2.07 + vec2f(3.1, 7.7); a *= 0.48;
  }
  return s;
}

fn landBase(p: vec2f) -> f32 {
  // rolling inner hills
  var h = 24.0 + fbm2(p * 0.0011, 5) * 60.0 + fbm2(p * 0.0045 + 3.0, 4) * 9.0;
  // Yuzhong peninsula spine ridge
  let sp = lineDist(p, vec2f(-2000.0, -180.0), vec2f(250.0, -80.0));
  h += 85.0 * exp(-pow(sp / 360.0, 2.0));
  // Nanshan ridge south of the Great River
  let ns = lineDist(p, vec2f(-900.0, 2950.0), vec2f(2800.0, 2550.0));
  h += (220.0 + ridged(p * 0.0016, 4) * 260.0) * exp(-pow(ns / 650.0, 2.0));
  // hills around the lake (west lake: hills N, W and S)
  let lk = length((p - vec2f(-2250.0, 2350.0)) / vec2f(1250.0, 1050.0));
  h += smoothstep(0.75, 1.25, lk) * (60.0 + ridged(p * 0.0025, 4) * 110.0) * smoothstep(-1400.0, -2200.0, p.x + (p.y - 2350.0) * 0.3);
  // pagoda hill on the south shore of the lake (rounded hill with a small summit terrace)
  let pg = length((p - vec2f(-1980.0, 3040.0)) * vec2f(1.0, 1.25));
  h += 46.0 * (1.0 - smoothstep(25.0, 260.0, pg));

  // mountain ring that bounds the world: domain-warped ridges with rounded crests, grouped into massifs
  // separated by lower saddles. The ring is pushed outward around the lake so West Lake sits among
  // gentle hills.
  let q = p - vec2f(300.0, -300.0);
  let lakePush = 1300.0 * (1.0 - smoothstep(1600.0, 3600.0, length(p - vec2f(-2100.0, 2500.0))));
  let r = length(q * vec2f(1.0, 0.92)) + fbm2(p * 0.00035, 4) * 900.0 - lakePush;
  let wp = p + vec2f(fbm2(p * 0.00042 + 11.0, 3), fbm2(p * 0.00042 - 7.0, 3)) * 700.0;
  let massif = smoothstep(-0.45, 0.45, fbm2(p * 0.00019 + 3.3, 3));
  // forested foothills where the basin floor meets the ranges
  let foot = smoothstep(3500.0, 4600.0, r);
  h += foot * (fbm2(wp * 0.0016 + 2.0, 4) * 70.0 + 45.0);
  // a long valley opening south from the basin, so the ranges behind show as receding layers
  let vd = lineDist(p, vec2f(650.0, 4300.0), vec2f(2700.0, 15000.0));
  let valley = exp(-pow(vd / 1100.0, 2.0)) * smoothstep(3600.0, 5200.0, p.y);
  // near ranges: moderate, layered ridgelines
  let ring = smoothstep(4000.0, 7200.0, r) * (1.0 - 0.78 * valley);
  let rg = landRidged(wp * 0.00055, 5);
  h += ring * (120.0 + (rg * 1000.0 + 80.0) * (0.45 + 0.75 * massif) + fbm2(p * 0.004, 3) * 22.0);
  // ranges beyond the playable area keep rising, so every ridge has a higher one behind it
  let farW = smoothstep(6500.0, 15000.0, r);
  h += farW * (450.0 + landRidged(wp * 0.00022 + 5.0, 6) * 1900.0 * (0.6 + 0.6 * massif)) * (1.0 - 0.6 * valley * (1.0 - smoothstep(9000.0, 15000.0, r)));
  return h;
}

fn landHeight(p: vec2f) -> f32 {
  var h = landBase(p);
  let tm = landTerraceMask(p);
  if (tm > 0.001 && h > 12.0 && h < 360.0) {
    // terraces follow the contour lines: quantize height on gentle slopes only
    let e = 4.0;
    let g = length(vec2f(landBase(p + vec2f(e, 0.0)) - h, landBase(p + vec2f(0.0, e)) - h)) / e;
    let w = tm * smoothstep(0.05, 0.12, g) * (1.0 - smoothstep(0.38, 0.6, g)) * smoothstep(12.0, 25.0, h) * (1.0 - smoothstep(300.0, 360.0, h));
    let S = 2.6;
    let t = h / S;
    let ht = (floor(t) + smoothstep(0.78, 1.0, fract(t))) * S;
    h = mix(h, ht, w);
  }
  return h;
}
`;

// West Lake landforms raised out of the lake bed by the water carving (walkable through the heightmap):
// the Su Causeway (north-south, with arch-bridge gaps), the Bai Causeway (from the east shore to an island)
// and two islands. Coordinates are lake-local (x along the lake's long axis, z across), converted to world.
const LK = { cx: -2000, cz: 2350, a: 0.25 };
export const lakeToWorld = ([x, z]) => [LK.cx + x * Math.cos(LK.a) - z * Math.sin(LK.a), LK.cz + x * Math.sin(LK.a) + z * Math.cos(LK.a)];
export const CAUSEWAY_TOP = 1.3;
export const CAUSEWAYS = [
  { name: 'Su Causeway', half: 5.5, pts: [[-300, -640], [-290, -330], [-268, -40], [-272, 250], [-300, 640]].map(lakeToWorld), bridges: [0.2, 0.4, 0.6, 0.8] },
  { name: 'Bai Causeway', half: 5.5, pts: [[820, -280], [610, -322], [428, -346], [250, -352], [150, -352]].map(lakeToWorld), bridges: [0.62] },
];
export const ISLANDS = [
  { name: 'Solitary Hill', x: lakeToWorld([70, -350])[0], z: lakeToWorld([70, -350])[1], r: 95, h: 14 },
  { name: 'Three Pools', x: lakeToWorld([-30, 170])[0], z: lakeToWorld([-30, 170])[1], r: 55, h: 2.2 },
];
export const BRIDGE_GAP = 7.0; // half length of the water channel under each causeway bridge (m)

function polyLen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }
CAUSEWAYS.forEach((c) => { c.length = polyLen(c.pts); });

const f = (v) => v.toFixed(2);
const causewayWGSL = CAUSEWAYS.map((c) => {
  const pts = c.pts.map((p) => `vec2f(${f(p[0])}, ${f(p[1])})`).join(', ');
  const br = c.bridges.map((t) => `g = min(g, abs(s - ${f(t * c.length)}));`).join(' ');
  return `
  {
    let P = array<vec2f, ${c.pts.length}>(${pts});
    var best = 1e9; var s = 0.0; var acc = 0.0;
    for (var i = 0; i < ${c.pts.length - 1}; i++) {
      let r = segDist(p, P[i], P[i + 1]);
      let L = length(P[i + 1] - P[i]);
      if (r.x < best) { best = r.x; s = acc + r.y * L; }
      acc += L;
    }
    var g = 1e9; ${br}
    let gap = 1.0 - smoothstep(${f(BRIDGE_GAP - 1.5)}, ${f(BRIDGE_GAP + 0.5)}, g);
    let crown = ${f(CAUSEWAY_TOP)} + 0.12 * (1.0 - smoothstep(0.0, 2.5, best));
    let top = mix(crown, -4.0, smoothstep(${f(c.half)}, ${f(c.half + 7)}, best));
    lf = max(lf, mix(top, -9.0, gap));
  }`;
}).join('');
const islandWGSL = ISLANDS.map((I) => `
  {
    let d = length(p - vec2f(${f(I.x)}, ${f(I.z)})) + gnoise2(p * 0.03) * ${f(I.r * 0.18)};
    let m = 1.0 - smoothstep(${f(I.r * 0.7)}, ${f(I.r * 1.05)}, d);
    lf = max(lf, mix(-4.0, ${f(CAUSEWAY_TOP)} + ${f(I.h)} * pow(saturate(1.0 - d / ${f(I.r)}), 1.4) + 0.2, m));
  }`).join('');

export const LANDFORMS_WGSL = /* wgsl */ `
fn lakeLandforms(p: vec2f) -> f32 {
  var lf = -100.0;
  if (length(p - vec2f(${LK.cx}.0, ${LK.cz}.0)) > 1100.0) { return lf; }
  ${causewayWGSL}
  ${islandWGSL}
  return lf;
}
`;

// Water carving (river banks, lake and canal shores). h = shaped land height, wd = signed water distance,
// natural = lake/canal shore, hillW = hillside district weight (steeper banks).
export const CARVE_WGSL = LANDFORMS_WGSL + /* wgsl */ `
fn carveWater(h0: f32, wd: f32, natural: bool, hillW: f32, p: vec2f) -> f32 {
  var h = h0;
  let shore = select(5.5, 1.0, natural);
  let wall = select(5.0, 26.0, natural);
  let soft = mix(select(120.0, 220.0, natural), 28.0, hillW);
  if (wd > 0.0) {
    let landH = max(h, shore + 0.5);
    let land = mix(shore, landH, smoothstep(wall, wall + soft, wd));
    let wallH = mix(-1.5, shore, smoothstep(0.0, wall, wd));
    h = select(land, wallH, wd < wall);
  } else {
    let depth = select(14.0, 4.0, natural);
    h = -1.5 - depth * smoothstep(0.0, select(90.0, 40.0, natural), -wd) + gnoise2(p * 0.02) * 0.8;
    if (natural) { h = max(h, lakeLandforms(p)); }
  }
  return h;
}
`;
