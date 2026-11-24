## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 6 | Facade kits, massing grammars and crown libraries are standard procedural-city practice. Putting instanced element arrays inside the existing GPU part cull, and morphing protrusion depth with screen size, is a sensible and slightly unusual fit for this engine. Parts of the massing grammar already exist: the cross-plan wing (`genHillside` line 724, 12%), two-segment setbacks (`tower()`, 30–35%) and the pagoda crown. |
| Feasibility and credibility | 4 | The ARRAY engine work can be built: the part layout is only read in `buildings*.js`, and the `pid \| chunk << 18` packing fits. But the morph does not prevent popping on the main kits. STACK bands are city-wide, not costed, unfiltered and not covered by the capacity plan. The "contact shadows (AO)" premise is false for this renderer. The quick test does not measure the gate. Details below. |
| Expected impact | 5 | Real relief should visibly change A4 and B2, and crown and massing variety could win G1 and A6. A2 and A5 will almost certainly tie, and B4 is uncertain, so 5 of 7 target wins is unlikely. If it fails, the program still learns whether geometric relief is worth its GPU cost for user priority 1. |
| **Overall (average)** | **5.0** | |

### Strongest reason it will fail
It repeats the bundling problem that sank I-006. Seven target poses means 5 wins are needed, and a tie does not count as a win. Two targets are not built by the systems this idea changes:
- **A5:** the frame is filled by the Liziba tower. That tower is built by `buildLizibaTower()` in `transitStatic.js`, not by the part system, so no kit reaches it. The background residential towers sit about 100–250 m away, where most array elements are culled. At that distance, a 0.15 m slab is under 1.4 px beyond about 133 m (FOV 1.05 gives about 1242 px per radian at 1440p).
- **A2:** the frame is the stilt complex and the bare cliff (`buildings_landmarks.js`). The towers above the cliff are 150–250 m from the camera (pose at 330, 25, −170), so their mullion caps (0.12 m, culled beyond about 106 m) never draw. Only a strip of skyline changes.
- **B4:** the camera is at 280 m, and most towers are 150–700 m away, so arrays are culled. Only the STACK bands and the crowns change. The spec says ring bands will "replace the flat painted stripes" on the cylinder, but the critics' stripe seams are vertical, while floor bands are horizontal and only add more of the same banding. This could go either way.

Realistic wins are A4, B2, and perhaps G1 and A6: 2–4 of 7. The changes are also city-wide:
- the massing grammar, the AC-to-array move (which removes `R()` calls from `acUnits()`) and crown re-rolls change the RNG sequence inside every lot;
- so tower heights, crowns and skybridges change at every non-target pose (A1, A3, B1, B3, G2–G4);
- that makes a "clear loss elsewhere" a real possibility.

### Other concerns
- **The morph does not stop the pop for the main kits.** The cull uses element thickness, but the morph uses protrusion depth. Balcony slab (0.15 m thick, 1.2 m deep):
  - It is culled at about 133 m (or 186 m at the spec's 1.0 px).
  - At that distance its depth projects to about 8–11 px, so `morph = smoothstep(1, 3.5, depthPx)` is 1.
  - It therefore disappears while fully extended.
  - Under `GEOBALC`, the painted rails are fully faded at that moment, so the painted pattern, which uses the alternating `bal` column hash rather than the kit's skip hash, snaps back at the same time.

  Mullion caps (0.12 × 0.35 m) have the same problem: culled at about 106 m, with depth about 4 px, so morph is 1. The spec's own pop test should fail. The morph and the cull must use the same measure. For example, set morph to 0 at the cull threshold, or cull on projected depth and use the same width.
- **STACK is the larger cost, and it is not estimated.**
  - **What is drawn:** office towers get "one spandrel ledge every floor", and glass towers get bands every 1–3 floors. Copies are culled only below 0.5 px of band height, about 0.3–0.4 m. That keeps them visible out to about 750–1000 m, so most of the visible city is drawn in aerial views.
  - **Triangle count:** each copy is a full ring instance: 32 triangles for the K8 box ring, and about 96–190 for round rings. In an aerial view, roughly 500 towers × 40 copies × 32 triangles is about 0.6M+ triangles, drawn twice (depth prepass and shading pass).
  - **Why it matters for the gate:** the `bench.mjs` path in `dev.js` is mostly at 45–330 m altitude, so STACK cost lands in the gated fly-through average. The cost section prices only ARRAY triangles at street level.
  - **My estimate:** +0.3 to +0.8 ms on the average, against 1.36 ms of headroom. It could pass alone, but the stated +0.15 to +0.3 ms is not credible.
  - **Per-pose numbers are already close to 11 ms:** A4 11.02, G4 10.93, G3 10.69 and A6 10.67 (`summary.json` `poseGpuMs`).
- **STACK copies are not in the capacity plan.** They go into lists 0–5, which the spec keeps at "the part count". There is no bound on the total copies. When a list overflows, the clamp drops whichever instances lose the `atomicAdd` race, and that changes from frame to frame, so random parts would flicker.
- **Sub-pixel geometric bands will alias in aerials.** Painted slab lines fade through `pulse` and `fwidth`, and `windowGrid` switches to `det`/`farE` at distance. STACK bands at 0.5–2 px have no such filtering and no morph. A regular grid of 1 px lines every floor, over a window grid, is a recipe for the moiré and shimmer the critics already flagged. It also risks A6, G3 and B3 and the `burst-u62` motion burst.
- **The renderer has no shadows or SSAO.** `renderer.js` uses only a per-pixel `ao` from the G-buffer, there is no shadow pass, and the 5033 point lights do not cast shadows. So fins and balconies will not "cast contact shadows (AO)". Relief reads only through silhouettes, occluding windows at grazing angles, and flat-normal shading. That still helps at A4 and B2, which are grazing street views, but much less elsewhere. The facade shader needs a painted shadow band under real slabs (it already does `S.ao *= 1 - 0.3*bal`).
- **Spec errors that show the code was not read closely:**
  - `cullU.w` is 1.4 at every quality level (`buildings.js:143`), not "1.0 at high and 1.5 at medium".
  - `cullU.y` is the single list stride that the cull indexes with, so per-list capacities also need per-list base offsets in the cull, not only new bind-group sizes.
- **Alignment gaps:**
  - `windowGrid` measures `fd` on the unscaled ring, so on tapered parts (CBD, `tower()` taper) painted cells shrink with height, but a fixed `pitchX` does not.
  - Polar mode places elements at equal angles, while ellipses use an arc-length approximation for `fd`. Mullion caps will drift off the painted mullions on elliptical and tapered glass towers.
  - The spec handles parent taper and twist only for STACK. That in turn contradicts "one record per STACK", because per-copy profiles computed in JS mean either many parts or parent parameters stored in the record, and neither is specified.
- **The AC units would lose their look.** The array material list (concrete, glass, metal, LED) has no `MAT.AC` path, so the fan-grille AC boxes that A4 already shows would become plain boxes.
- **No tuning to the eval cameras.** Selection is per lot from its RNG, and nothing depends on pose coordinates. The quick test measures at A4, A5 and B2. That is acceptable as measurement, but it should add non-eval cameras so the kits are not judged only where the eval looks.
- **The claimed gain is inconsistent.** +0.5 to +1.0 on one axis out of four is +0.13 to +0.25 on a pose, which cannot give the stated +0.3 to +0.5 on the zone means unless character also rises a lot on most poses in the zone.
- **The scope is large for 3–4 days:** engine, 5 kits, massing, refuge floors, 5 new crowns and the neighbour rule.

### What would make it stronger
- **Split the idea:**
  - **I-005a, ARRAY relief only:** residential balconies and bays, office piers. Target A4 and B2, plus 2 non-eval street cameras for checking.
  - **I-005b, crowns and massing:** cut the `lit` crown to 5% or less, add the neighbour rule, refuge cuts and new crowns. Target G1 and A6. This part is cheap and nearly free on the GPU.
  - Drop A2 and A5 as targets.
- **Keep the RNG sequence stable.** Draw all new kit and massing decisions from a separate stream per lot, for example `rng(L.seed ^ 0x5eed)`. Keep the existing `R()` calls in order, including a dummy loop where `acUnits` used to draw. Non-target poses then change only where the idea intends.
- **Make the morph and the cull use one measure.** Cull at the point where morph reaches 0. Make `GEOBALC` use the same column hash as the painted `bal` pattern, so the handover to the painted rails is invisible.
- **Defer STACK, or limit it.** Allow at most about 150–200 m, with a band height of 2 px or more before drawing, fading to the painted slab line beyond. Give STACK its own list with an explicit capacity. Cost it separately.
- **Make the quick test measure the gate.** Run the full `bench.mjs` fly-through (average and p99), not only `--stats` gbuffer at three poses. Read back the instance counts for every list, not only list 6, at A6 and G3 as well as street poses.
- **Add a painted occlusion band under real slabs and fins.** Without shadows, it is the cheapest way to make the relief read.
