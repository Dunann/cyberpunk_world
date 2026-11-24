// Buildings for the land-use plan's infill lots (plan.js, world.infillLots). Generated after every existing lot,
// skybridge and walkway, so nothing that existed before changes:
//  - each lot uses its own stream rng(L.seed) and the urban generator only (no clock tower, no tower tops);
//  - its sign slots go to world.infillSignSlots (the signs module places them in a second pass);
//  - its point lights go to a separate list (the buildings module adds a separate pool after its own selection);
//  - props are thinned to 60% (the generators' prop budget is shared and is not exceeded).

import { genUrban } from './buildings_gen.js';
import { rng } from './math.js';

const PROP_KEEP = 0.6;

export function genInfill(B, world) {
  const lots = world.infillLots || [];
  world.infillSignSlots = [];
  const out = { lights: [], tops: [], lots: lots.length, parts: 0, props: 0 };
  if (!lots.length) return out;
  const p0 = B.P.count, props0 = B.props;
  const slots = B.slots, lights = B.lights, prop = B.prop;
  B.slots = world.infillSignSlots;
  B.lights = out.lights;
  let k = 0;
  B.prop = function (o) {
    // deterministic thinning: keep 60% of the prop calls
    k++;
    if (((k * 2654435761) >>> 0) / 4294967296 > PROP_KEEP) return -1;
    return prop.call(this, o);
  };
  try {
    for (const L of lots) {
      const first = B.P.count;
      genUrban(B, rng(L.seed), L);
      let top = -1e9;
      for (let i = first; i < B.P.count; i++) top = Math.max(top, B.P.get(i, 1) + B.P.get(i, 6));
      L.top = top;
      out.tops.push(top - L.gMax);
    }
  } finally {
    B.slots = slots; B.lights = lights; B.prop = prop;
  }
  out.parts = B.P.count - p0;
  out.props = B.props - props0;
  return out;
}

// Height histogram of infill buildings above their ground (3 m bands), and the share of the largest band among
// tower lots (lots that rise above the shophouse height).
export function infillHeightStats(tops) {
  const towers = tops.filter((h) => h > 26);
  const bands = new Map();
  for (const h of towers) { const b = Math.floor(h / 3) * 3; bands.set(b, (bands.get(b) || 0) + 1); }
  let maxShare = 0;
  for (const n of bands.values()) maxShare = Math.max(maxShare, n / Math.max(towers.length, 1));
  const hist = [...bands.entries()].sort((a, b) => a[0] - b[0]).map(([b, n]) => `${b}-${b + 3}:${n}`).join(' ');
  return { lots: tops.length, towers: towers.length, maxBandShare: +maxShare.toFixed(3), hist };
}
