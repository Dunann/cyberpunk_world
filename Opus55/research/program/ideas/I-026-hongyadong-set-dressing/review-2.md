## Reviewer 2 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 4 | The idea is framed as film set decoration, but in practice it is another dressing pass on I-015: bigger lanterns, more sign types, tables and people. I-015 items 1 and 6 already added lanterns, shop signs, plants and laundry, and I-025 (rejected) covered extras. Three things are new: the typed traditional sign forms (plaque, cloth banner, lantern column), the rule that neighbours must differ, and the measured repetition count. |
| Feasibility and credibility | 5 | Many code claims hold. `lanternMesh` (signs.js:292), the tagged `own` sign range, `OWN_SIGN_LIGHTS`, the complex prop cap (`PROP_CAP`, buildings_stilts.js:36), crowd modes 1 and 2 with a fixed `y` (crowd.js:48), and appending new agents after the existing ones are all real. The quick test is cheap and well designed. But the pixel sizes the case rests on are about 1.75x too large. Several mechanisms the plan needs do not exist (gallery posts, a draw-distance cutoff for parts, a glyph lantern). As written, removing the old lanterns and placing the new parts would change part seeds outside the complex (details below). |
| Expected impact | 5 | A win at A2 is plausible: the pink 0.44 m dots become real lanterns, and banners hang over the galleries. At A1 the dressing is only 4-5 px, and A3 is a tie at best, so the 2/3 adoption rule is a coin flip. Even if it works, it does not touch the critics' main Hongyadong complaint (the identical window module) or A2's critical defect (the embankment slab). That limits the critic gain toward 9+. The program learns little from a failure, because "dressing alone does not beat the window grid" is already the expected result. |
| **Overall (average)** | **4.67** | |

### Strongest reason it will fail
The second target, A1, gets much smaller dressing than the spec assumes, so the adoption rule probably fails there.
- **The pixel sizes are wrong.** The camera FOV is 1.05 rad (controls.js:29, dev.js:38). At 1440 px that gives 1242/d px per metre.
  - At A2: the facade front is about 93 m from the camera, measured perpendicular to the bank line from (171, −357) to (321, 99), so about 13 px/m. A 1 m lantern is about 13 px (the spec says 23), a person about 22 px (spec: 40) and a 3 m banner about 39 px (spec: 70).
  - At A1: about 240-250 m, so 5 px/m. The new lanterns are 4-5 px (spec: 9), plaques 4 px tall, and banners 11-17 px.
- **The extras are not drawn at A1.** The crowd's mesh distance at q2 is 210 m (crowd.js:606), so no gallery agent is drawn as a mesh there. The 30% that raise a phone would appear only as blue-white glints (crowd.js:115-127, drawn beyond 126 m). That adds roughly 100 scattered specks, the same defect critic 1 already calls out as "drone specks".
- **What A1 actually gains** is thousands of 4-5 px red dots along every lit eave, spaced 1.3-1.8 m, plus bloom. That is a new regular horizontal pattern laid over the identical window grid the critics already call repetitive. It is exactly the "Christmas lights" case the spec lists as a risk.
- **The arithmetic of the rule.** If A3 (about 6-7% complex pixels) passes the 5% rule, it is a target where the lanterns are about 2-3 px and the result is a tie. A tie at A3 means the idea must win both A1 and A2. If A3 is not a target, 2/3 of 2 targets still means both A1 and A2. Either way, A1 decides. The spec's case for A1 rests on sizes that are about 1.75x too large.

### Other concerns
- **Seeds shift outside the complex (shared-stream claim is wrong as written).**
  - Most complex parts have no explicit seed (only 12 `seed:` in buildings_stilts.js). `Parts.add` gives an unseeded part the seed `(index × 7.31) % 997` (buildings_gen.js:32), and the facade shader takes window lit patterns from that seed (`winLit`, `windowGrid`, buildings_wgsl.js:326-415).
  - Removing the roughly 700 `lantern` props (buildings_stilts.js:404) would reindex every later complex part, which reshuffles window lighting across the whole stack. That is a confound the judges will see, and it is not part of the idea.
  - It would also shift every I-016 infill part: `genInfill` runs after `finishComplex` (buildings.js:77-80), so infill indices, and so infill seeds, move too.
  - Placing the dressing "where the complex's parts and slots are appended", which is `finishComplex`, also puts it before the infill. It must run after `genInfill`.
  - Removing the lantern props also changes the clearance hash (they are `DRESS` pieces, buildings_stilts.js:237, 334) and the prop count, so later dressing that was blocked or capped is now placed.
  - Fix: keep the old lantern records as empty placeholders, as `placeComplex` already does for missing parts (buildings_landmarks.js:569), or give them explicit seeds equal to their old index seeds. Keep their clearance registration, and append all new parts after `genInfill`. `hyd-identity` would catch this, but the plan as written would fail it.
- **Plaques and banners will be dark at night.**
  - Gold is "high-albedo metallic, not emission", the cloth is plain albedo, and the spec adds no lights. The "two small emissive lamps" above a plaque light nothing.
  - Non-emissive surfaces get only sky ambient, a city bounce of about 0.05, moonlight and the sparse tiled lights (renderer.js:148-157). The complex has 47 lights and 64 sign lights, which were already full with 88 signs.
  - So gold-on-lacquer plaques read as black slabs, and banners as dark rectangles against bright windows. Real Hongyadong signs are lit by lanterns.
  - Fix: a faked lamp-lit emissive gradient on plaque glyphs and banner faces, as I-015 did for the lantern-lit deck underside (`WOOD param > 2`).
- **The gallery posts do not exist.** Upper galleries have railings and cantilevered pent eaves only. The only posts in the complex are plaza lamp posts and deck columns (buildings_stilts.js:924, 948-996). The string ties every 3.2 m and the wall lamps "on every second gallery post" need new posts. Those are structure, against "no change to its structure", and the I-015 audit would have to cover them.
- **The cords will alias.**
  - A 0.03 m cord is under 1 px beyond about 41 m, so at A2 (93-130 m) it is 0.3-0.4 px: dashed, shimmering dark lines across the brightest part of the frame.
  - The part system has no distance cutoff. Props are culled by pixel size of their bounding radius (buildings_wgsl.js:66-69), and a 1.5 m span stays above 8 px well past 120 m.
  - A sagging thin box cannot be built from the existing parts either: they only rotate about Y and lean in XZ, so a near-horizontal leaned prism collapses to a sliver.
  - Fix: drop cords beyond about 40 m, or draw them in the lantern pipeline with a minimum width of 1 px.
- **The lantern-column glyph needs more than "a style value".**
  - `lanLayout` binds only the instance buffer, visible to the vertex stage (signs.js:392). `Lan` is 8 floats with no room for atlas UVs.
  - The fix needs an atlas and sampler binding plus a wider struct for city, park and complex lanterns. The values stay identical, but the work is not in the cost estimate.
  - "6% white paper" also needs a new style: style 2 is pink (signs.js:247).
- **The lantern draw distance conflicts.** The spec puts the new lanterns in a group of the existing `lanCells`, which is culled at 300 m (signs.js:471), but also says 750 m. That needs a separate `Cells` instance, as the park lanterns have.
- **Agents walk through props.** Pacing agents on shop galleries (1 per 14 m, runs of 6-12 m) share the gallery with tea tables every 7-10 m, potted shrubs, planters, AC boxes and oriels. The only check proposed is foot height. It needs a walking lane kept clear of props, or rejection against the complex's clearance hash.
- **Mannequins move to A2.** Both critics call static spectators "mannequins" (B1 critical or major). About 200 people standing at the rails facing the river, 22 px tall at A2, invite the same defect at the idea's strongest pose.
- **The prop count is too low.** The +1,500 covers tables, stools and parasols only. Cord segments (about one per lantern gap, 2,500-3,500) and wall lamps also go through the prop counter. The total may pass the 6,500 cap (the complex already had 3,721 props in round 1 and more after round 2), and raising the cap changes how many `deferredSteps` survive.
- **The GPU estimate is low but harmless.** The lantern mesh has about 116 triangles, not about 90, so 0.3-0.4M triangles in total. At A1 and A3 these are micro-triangles of 2-5 px, which wastes quad shading. It is still well under budget: the bench is at 9.5 ms and the baseline p99 is 11.55 ms, far from 16.7. Two points are missing:
  - The bench path crosses the plaza a few metres above the deck (I-015 code review). Parasols, plaza walkers at LOD0 and feature lanterns are closest to the camera there, which matters for p99.
  - A1 already measures 11.23 ms per pose in runs/I-016m.
- **The critic estimate is optimistic.** A2 keeps the critical embankment-slab defect, so +0.5-0.8 on A2 is unlikely to show in critic scores, even if the pairwise result is a win.
- **The A1 frame share is overstated.** A1 is about 25-30% complex pixels, not about 45% (the stack band is roughly y 460-860 of 1440). It does not change which poses are targets.

### What would make it stronger
- Redo the pixel case with the real FOV. Then judge the quick test at A1 as well as A2, and make "no loss at A1" part of the go rule, since A1 decides adoption.
- At A1 distances, prefer fewer, larger and irregular elements over uniform strings:
  - feature lanterns at 1.8-2.6 m (9-13 px at A1);
  - long vertical banners;
  - strings only on some eaves, chosen by occupancy runs, not on every lit eave.
  - Vertical, irregular elements break the module; another horizontal row of dots reinforces it.
- Fix the seed and order problem: keep placeholder lantern records, append after `genInfill`, and extend `hyd-identity` to the infill parts and to the complex's own unchanged parts.
- Give the plaques and banners a fake lamp-lit emissive term, and set a luminance cap for the complex region measured with `?hydmask` (for example, mean luminance within +10% of main), so bloom does not turn the stack red.
- Drop cords beyond about 40 m. Tie strings to eave ends and bracket arms, not to posts that do not exist.
- Keep gallery agents off A1's glint path (no raised phones beyond the mesh distance). Keep a clear walking lane against the props, and give standing agents varied poses and facings so they do not read as mannequins.
- Count every new prop (cords, wall lamps, tables, stools, parasols) before building, and say what raising the cap does to the deferred steps.
