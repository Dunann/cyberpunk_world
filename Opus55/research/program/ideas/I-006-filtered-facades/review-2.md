## Reviewer 2 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 5 | Reflection probes, prefiltered mips and distance-based shading levels are standard engine practice. They are new to this program, and the semantic window lighting (lit cores, stacks, lobbies) is a sensible touch, but none of it would surprise an expert. |
| Feasibility and credibility | 5 | The diagnosis is right: crops of B2 and B4 show `cityRefl()` dot grids on the podium and full-height neon strips on the cylinder. The replacement has real gaps, though. Four probes chosen by name, a 700 m sphere proxy, a buildings-only bake at 256² and "two nearest probes" blending will give blurry glass that reflects itself and shows no streets, with seams between probes. Three separate changes are bundled, and the quick test covers only one of them. |
| Expected impact | 4 | B2 and B4 are likely pairwise wins. The other five targets (A1, A3, A6, G1, G3) are dominated by defects this idea does not touch, so they are likely ties. Reaching 5 of 7 target wins is unlikely. The city-wide changes to wall albedo, uplight and occupancy risk a clear loss on a pose outside the targets. |
| **Overall (average)** | 4.67 | |

### Strongest reason it will fail
The idea cannot meet the adoption rule. To be adopted it needs at least 2/3 of its 7 target poses, so 5 wins. Only B2 and B4 have a visible, traced defect that it removes. In A1 and A3 the eye goes to the bare cliff and the repeated stilt modules (findings §1 and §2). The glass towers above the cliff are a secondary element, and a different reflection on them will be judged a tie. In A6, G1 and G3, the critics blamed boxy massing, identical crowns, forest strips and flat plinths (findings §3 and §4). In A6 most windows are 4–10 px, which falls in the proposed mid band. That band removes the interior shading and lowers the contrast between lit and dark windows, and the spec admits this may read as "simpler". The new occupancy spread puts 25% of residential towers at 5–20% lit, which adds black boxes to the view whose complaint was dark boxes with random squares. So the realistic outcome is 2, perhaps 3, wins out of 7.

It may not even win B2 cleanly. The B2 podium is a near-mirror (roughness 0.06) seen from the street. A 256² face covers about 0.35° per texel, while a screen pixel at this camera covers about 0.03°. The reflection therefore magnifies by about 10×, and its content is wrong: the probe hangs 80–200 m above the district centroid and the proxy is a 700 m sphere, so the facade across the street, the signs, the cars and the street lights are all missing. What replaces the dots is a soft, smeared glow. That is better than dot noise, but a strict judge may not call it "more detail".

### Other concerns
- **Probe placement is tied to the eval zones, not to the stated rule.** The spec says "the 4 largest built districts with towers: CBD, Bund, Yuzhong, Jiangbei". By `DISTRICTS` extents, the largest built districts are Nan'an Old Town (1250×700), Lujiazui CBD (760×1050), Yuzhong (1250×620), then Steppe and West Hills (850×700 each). Bund (300×820) and Jiangbei (620×520) are the two smallest. The chosen set is exactly zone B (Bund, CBD) plus zone A (Yuzhong) plus the district facing the confluence. No pose coordinates are used, but this is zone-level tuning, and a strict code review should reject it. The glass towers that `genUrban` makes in Nan'an and West Hills would reflect probes 1.5–3 km away.
- **Towers will reflect themselves almost everywhere, not just in rare cases.** With one probe per district and a sphere proxy, any facade that faces away from the probe sends its reflection ray across the tower itself as seen from the probe. Every tower in a district has such faces. The spec's fix (push the probe outside the tower's bounding box) does not address this, because the error is in the geometry of the lookup, not in where the probe sits. The CBD is about 1.5 × 2.1 km, so one probe cannot serve it.
- **Blending the "two nearest probes" creates seams.** Where the pair changes (for example from probes 1 and 2 to probes 1 and 3), the weights jump, and a visible line appears across facades. That is the same kind of seam the idea is meant to remove. Use smooth weights over all probes within a radius.
- **The bake reflects only buildings.** `fsProbe` draws building parts only: no terrain, roads, street lights, signs, LED shows, bridges or water. The brightest features of a neon city at night are therefore missing from the "real city" reflection. The current `cityRefl()` at least adds a street-glow band below the horizon. From aerial poses, glass reflecting downward will look into black gaps.
- **The sky will be counted twice.** The lighting pass already adds `skyRadiance(R)` Fresnel specular for material 2 (glass). If the cubemap is cleared to a sky gradient, glass gets the sky twice. The cubemap needs sky coverage in alpha, and the lookup must add only the city.
- **The bind-group plan has a usage conflict.** The spec adds the cube texture to `drawLayout` at bindings 2 and 3. A bake pipeline built with that layout would sample the cube texture while rendering into it, which is a WebGPU validation error. The bake needs its own layout without those bindings, which works because `fsProbe` does not use them. It also needs Frame data filled by hand (`F.params`, `F.show`, `res`) and a reversed-Z cube projection, because no frame has run yet at `init`. All of this is solvable, but none of it is in the plan.
- **The GPU claim is plausible but leaves out costs.** The −0.15 to +0.05 ms estimate counts the `interior()` saving and omits several new costs:
  - cubemap lookups (2 probes, 2 sphere intersections) for dark residential and office windows at mid and near size, which are a large share of facade pixels and get no reflection work today;
  - both representations evaluated in the 30% overlap zones;
  - the cladding patterns and uplight on every wall.

  A realistic range is about −0.1 to +0.3 ms in the gbuffer pass. The hard gate is 11 ms against a 9.64 ms baseline, so this almost certainly passes. The gate is not the risk, but the number should come from measurement, not from reasoning.
- **The city-wide wall changes risk a clear loss elsewhere.**
  - Removing `S.alb *= mix(0.5, 1.0, G.det)` doubles far-wall albedo.
  - The uplight adds about `alb × 0.25` of emission at every tower base. That is the same order as the averaged window emission (about 0.06), so bases will glow as much as the windows do.

  Together these lower the contrast between walls and windows across the city, including on the non-target poses A4, A5, B1 and B3. One clear loss there blocks adoption.
- **The lit core column becomes a new repeated motif.** A cool-white lit column on 70% of all towers is a city-wide repetition, and critics already complain about repetition. The column should vary by tower type, and many towers should not have one.
- **Three changes are bundled, and only one is tested before full implementation.** The quick test covers the reflection bake only. Occupancy, the three bands and cladding are 1–1.5 days of untested taste changes. If the pairwise result is mixed, it cannot be attributed to any one part.
- **There is no control.** A cheaper fix for the two confirmed defects exists:
  - Make `cityRefl()` world-scaled and filtered by footprint: dot frequency tied to a reflected distance, the dots faded once their period is under 2 px.
  - Give the neon strips a limited extent in elevation, so a cylinder does not get full-height lines.

  The spec should show that the bake beats this cheap fix before it spends a day on the bake.
- **The expected effects are overstated.** "Zone B +0.4 to +0.6" assumes detail +1 on B2 and B4 plus gains on B1 and B3, which the spec does not target. Two poses improving by +1 on one axis move zone B by about 0.125.

### What would make it stronger
- **Split the idea in two.**
  - I-006a: reflections only, targeting B2 and B4 (and B3 if it has glass in view), so 2 of 3 wins is a reachable bar.
  - I-006b: occupancy, scale bands and cladding, targeting A6 and G3, with its own blind check.
- **Make the quick test a blind A/B/C** on B2 and B4 plus two custom cameras away from the eval poses (glass in Jiangbei or Nan'an): baseline, the fixed `cityRefl()`, and the baked probes. Build the bake only if it beats the cheap fix.
- **Place probes by a data rule that covers the whole city.** For example, one probe per ~400 m cell wherever the tallest part is over 60 m, with 128² faces; memory stays near 30 MB. Weight all probes within a radius with smooth falloff.
- **Avoid self-reflection.** Store the hit distance in the probe's alpha channel and use it to reject or march the lookup (a distance-aware parallax lookup), or use a box or height proxy that fits the district. Show a capture of a tower's back face before and after.
- **Put the city's bright content into the bake:** roads and street lights from the terrain module (an emissive-only pass), sign slots as their mean colour, LED facades, and the bridges. At minimum keep an analytic street-glow band below the horizon.
- **Add sharp near-field reflections.** Consider extending the existing half-resolution SSR to vertical glass for the near band, with the probe as fallback. There is about 1.3 ms of headroom, and this would deliver the "reflects the real street" claim the spec makes for B2.
- **Keep wall contrast.** Keep the far-wall darkening, or replace it with a measured equivalent. Limit the uplight to podiums and the lowest floors near streets with lights. Report the mean luminance and wall/window contrast on A6 and G3 before and after.
- **Lower the occupancy spread** so few towers drop below 20% lit. Make the core column depend on tower type, not appear on 70% of all towers.
- **Measure the cost.** Run `--stats` on B2, A6 and G3, plus a bench run, before claiming the change is cost-neutral.
