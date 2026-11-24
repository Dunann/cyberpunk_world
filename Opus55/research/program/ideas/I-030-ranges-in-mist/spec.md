---
id: I-030
title: Ranges in mist - the mountains are already tall; make them visible (sea of mist, layered far haze, moonlit crests, lit ridgelines)
status: proposed
direction: The hard layout problem - hill city and riverbanks (mountains that read in mist with lit ridgelines)
family: far-field atmosphere and mountain lighting (no terrain change)
parent: none
proposed_by: idea generator
date: 2026-11-24
---

# I-030: Ranges in mist

## Idea
**The finding.** Both critics ask for "tall readable mountains". The mountains are already tall. Within 5.0-7.2 km of the centre the ring's highest point averages 811 m per bearing (1,226 m at most), and the ranges behind keep rising by up to 2,500 m more. Seen from G1 they cover 14% of the frame and reach y = 328 px, 240 px above the horizon line. From G3 they cover 19%. They do not show because the air in front of them lets through 0.3-22% of their light, and the sky behind them is seen through the same air. A ridge and the sky above it are then the same colour. Three terms in the fog do this: the aerial haze (scale height 1,800 m), the "world edge" haze wall beyond 6.2 km (scale height 2,500 m), and the end of the fog volume at 9 km, which gives every range behind it the same fog.

**What to change.** No height changes. Four changes to air and light, all beyond the city:
1. **Sea of mist.** The edge haze becomes a low layer (scale height 240 m in place of 2,500 m). It still hides valley floors and the far river, but crests rise out of it, the way Chinese landscape painting shows ranges standing in a sea of cloud (yunhai).
2. **Layered far haze.** Beyond 4-6.5 km from the camera the aerial haze thins faster with height. Beyond the fog volume (9 km) a simple distance term fades each farther range toward the low-sky colour, so the ranges separate into layers, the last one merges with the sky, and the end of the terrain stays hidden. Peaks above the cloud base fade into the cloud deck.
3. **Moonlight outside the city.** The mist beyond the basin is lit by the moon at a fixed strength (the camera-based dimming of the moon in the city no longer darkens the countryside), and moon-facing slopes of the ranges get the same light. G1, G3 and B3 all look within 15 degrees of the moon's bearing, so their ranges become dark layers in front of pale mist and sky, with thin lit crests where a slope turns to the moon.
4. **Lit ridgelines, as Chinese cities build them.** Rule-placed lights on the real crests: rows of wind turbines with red beacons blinking together, two lit ridge trails, three pass roads zigzagging up to saddles, three hillside temples, one relay mast. Chinese cities light their mountains this way (mountain lighting projects, ridge wind farms), so it also adds to the brief.

Every pixel nearer than 4 km keeps its fog exactly. Lots, roads, the monorail, Hongyadong, the parks and every random stream are untouched.

## Why it might work
Numbers come from a CPU port of the height function and of the fog density formulas in `fog.js` (`measure/sky2.mjs`, `measure/front.mjs`; float64, no fog noise, rain 0.55, lots as occluders at a typical height per district). No GPU job was run.

**1. The ranges fill the frames but the air hides them.** "T" is the share of light that reaches the camera.

| Pose | Far-range terrain in frame | Mean distance | Beyond the 9 km fog volume | Skyline at | T of the skyline ridge, now | T of the sky just above, now | Skyline T with the new formulas |
|---|---|---|---|---|---|---|---|
| G1 | 14.3% | 10.9 km | 67% | y 328 | 0.18 | 0.22 | 0.32 |
| G3 | 18.8% | 10.5 km | 55% | y 72 | 0.22 | 0.26 | 0.43 |
| B3 | 16.1% | 8.2 km | 31% | y 248 | 0.017 | 0.027 | 0.29 |
| B4 | 18.5% | 6.4 km | 19% | y 312 | 0.003 | 0.009 | 0.34 |
| A6 | 16.2% | 8.7 km | 31% | y 8 | 0.05 | 0.07 | 0.33 |
| G2 | 10.4% | 9.6 km | 43% | y 264 | 0.06 | 0.07 | 0.19 |
| A3 | 5.9% | 8.5 km | 29% | y 744 | 0.03 | 0.03 | 0.16 |
| B1 | 5.0% | 6.2 km | 16% | y 552 | 0.02 | 0.003 | 0.17 |
| G4 | 3.6% | 11.5 km | 80% | y 536 | 0.10 | 0.11 | 0.17 |
| A1, A5 | 1.1%, 3.7% | | | | | | |
| A2, A4, B2 | under 0.3% | | | | | | |

- A dark ridge shows only by contrast with what is behind it. When ridge and sky are seen through the same haze, that contrast is at most the sky's T: 0.2 at G1 and G3 (the faint shapes in the stills), 0.03 or less at B3, B4 and A3 (nothing visible). This matches the images.
- With the new density formulas alone (before any tuning) the skyline T rises to 0.3-0.45. With brighter mist and sky behind the ridge, the contrast rises further.
- The frame share is geometry only; real towers hide part of it at B4, A6 and B1.

**2. More height would not help.** A new continuous front range at 5.9 km (crest 580-1,230 m) was simulated: the front zone's share changes from 6.4 to 7.7% at G1 and from 8.9 to 9.4% at G3, and its top edge rises 8-70 px. The existing ring is already that high. The height function is not the problem.

**3. The moon is in the right place.** `moonDir = (0.38, 0.42, -0.82)`: bearing 25 degrees east of north, 25 degrees up. G1 looks 22, G3 14 and B3 36 degrees east of north. The fog already scatters moonlight forward (`fogAmbientLi`); it is only too weak (moon intensity 0.25 when the camera is in the city) and buried under haze.

**4. Lights already work at this distance.** The village and road glows on the ring (`distantLights`) are the only mountain features visible in G1 and G3 today, through T of 0.02-0.2.

## What's new about it
- No earlier idea touched the fog, the far field or the mountains. I-024 (in review) adds light from the city's own emitters to the fog inside the city; this idea changes density and light only beyond 4 km from the camera and beyond the basin, so the two do not overlap.
- The obvious fix is "make the mountains taller or nearer". The measurement shows why that fails, and why a height change is also risky: `distantLights` draws from the garden stream `rng(7070)` with a height test on the ring before `hillsideLife` places the city's hamlets from the same stream, so any change to ring heights re-rolls every hamlet, and through their tree reserves the fixed-tree stream. This idea avoids that by leaving heights alone.
- Mountain lighting as urban design (ridge wind farms, lit trails, pass roads, temples) in place of generic "rim light".

## Expected effect on the metric
**Targets by rule:** a pose is a target if far-range terrain (first visible surface, more than 4,700 m from the centre in the ellipse metric `length((p - (300, -300)) * (1, 0.92))`) covers at least 14% of its frame. The implementer measures it on main from the real depth buffer (one small tool) and records the list before judging. Forecast from the CPU table: **G1, G3, B3**, and **B4, A6** if their share holds with real towers as occluders. Adoption as in EVAL.md.

| Pose | What changes | Forecast | Loss risk |
|---|---|---|---|
| G1 | Above the skyline: two or three dark range layers over pale mist, lit crests toward the moon, beacon rows, a pass road, a temple | Clear win | Low |
| G3 | The flat violet band at the top becomes a sea of mist with ranges standing in it and lights on the crests | Clear win | Low to medium: the mist must not be brighter than the city |
| B3 | Ranges appear behind the CBD and the Bund | Win | Low |
| B4, A6 | Range layers in the gaps between towers and along the top | Slight win or tie | Low |
| G2, A3, B1, G4 | Background only (4-10% of the frame): layers behind the skyline | Tie or slight win | Low; B1 must be checked (the show pose) |
| A1, A2, A4, A5, B2 | Under 4% of the frame beyond 4 km | Identical or within noise | Low |

**Critics:** answers critic 2's change 3 and half of critic 1's change 2 ("layered haze, lit ridgelines"), named at G1, G3, B3, A6 and G4. Expect +1 on coherence and +0.5 to +1 on detail and character at G1 and G3; zone G mean about +0.4 to +0.6, zone B about +0.2.

## Quick test
Half a day: plan steps 1 and 2 only (about 50 lines in `fog.js`, `common.js`, `renderer.js`).
1. **Held-out cameras by rule, never eval poses:** 300 m above the centre (300, -300), looking along bearings 0, 90, 180 and 270 degrees, pitch -5 degrees; and at the confluence, 15 m above the water, looking up each river. Plus the in-app viewpoints "Lake gardens" and "Mountain edge" as regression views.
2. **Measure on main and candidate:**
   - skyline contrast: for each image column, the luminance just above and just below the first far-range pixel found from the depth buffer; report the median of `|above - below| / max(above, below)`. Target: at least 0.35 (the model predicts about 0.05-0.2 on main);
   - identity near the camera: pixels with depth under 4 km must differ from main by no more than capture noise;
   - "Mountain edge" must match main within noise (its valley keeps the old haze by rule).
3. **Blind pairwise** on the six held-out pairs: the candidate must win at least 4.
4. **Stop** if the contrast target is missed after tuning the three constants, if the mist reads as a bright wall, or if the pairwise check fails. Fix `seaTop`, `RANGE_SIGMA` and the mist light on these cameras only, before any eval capture.

## Implementation plan
1. **Fog density** (`medium()` in `fog.js`, the line that adds the aerial and edge terms).
   ```
   // the south valley of the Mountain-edge viewpoint keeps today's haze
   let sv   = exp(-pow(segDist(p.xz, vec2f(650, 4300), vec2f(2700, 15000)) / 1100, 2)) * smoothstep(3600, 5200, p.z);
   let keep = smoothstep(0.1, 0.3, sv);
   let farK = smoothstep(4000, 6500, dist) * (1 - keep);              // dist = distance along the view ray
   let aer  = mix(exp(-py / 1800), exp(-py / 450), farK);             // aerial haze thins with height far away
   let sea  = mix(exp(-py / seaTop), exp(-py / 2500), keep);          // seaTop = 240 m
   sigma += 0.00016 * aer + FU.tune.w * smoothstep(6200, 8200, rc) * sea;
   ```
   - Within 4 km of the camera `farK = 0`, and the edge term is 0 inside 6.2 km as today, so the fog of every near pixel is the same value as on main (the march runs front to back).
2. **Beyond the fog volume** (`common.js`, used in the lighting pass in place of `applyFog` for geometry only; the sky and the water keep `applyFog`).
   ```
   fn applyFogRange(col: vec3f, uv: vec2f, dist: f32, dir: vec3f, worldY: f32) -> vec3f {
     var c = col;
     if (dist > FOG_FAR) {
       var t = exp(-RANGE_SIGMA * (dist - FOG_FAR));                  // RANGE_SIGMA = 0.00011 per m
       t *= 1.0 - smoothstep(SKY_CLOUD_BASE - 300.0, SKY_CLOUD_BASE + 100.0, worldY);   // peaks enter the cloud deck
       c = mix(skyHorizon(vec3f(dir.x, 0.02, dir.z)), c, t);
     }
     return applyFog(c, uv, dist);
   }
   ```
   - A range at 11 km keeps 80% of its own colour, at 15 km 52%, at 20 km 30%, at 30 km 10%. The far-map edge at 32 km stays hidden.
   - The same volume fog is then applied to the range and to the sky above it, so the farthest range meets the sky without a seam.
3. **Moonlight beyond the basin.**
   - In `FOG_AMBIENT_WGSL` (shared with `rain.js`, so rain subtracts the same value): `Li += SKY_MOON_COL * tune.range * far * (0.7 + 0.3 * saturate(dot(dir, F.moon.xyz))) * (1 - keep)`, with `far = smoothstep(4700, 6500, ellipse distance)` and `tune.range` about 0.02 (2 to 3 times the city haze). Pass `tune.range` in the free slot of `FogU.misc`. Where the camera's own moon term is already larger (camera in the gardens or mountains), use the larger of the two, not the sum.
   - In `groundShade` (`terrainShade.js`): `emis += albedo / PI * SKY_MOON_COL * max(RANGE_MOON - F.moon.w, 0) * saturate(dot(n, F.moon.xyz)) * rangeW`, `RANGE_MOON = 0.8`, `rangeW = smoothstep(4700, 5600, ellipse distance)`. The ranges then get the same moonlight wherever the camera stands. Rock and bald crests (albedo about 0.1) reach about 0.02, near the mist's brightness; forest stays dark.
4. **Lit ridgelines** (`rangeLights(env)` in `gardenViews.js`, called in `garden.js` after `hillsideLife`, own stream `rng(7373)`; emissive octahedra like the existing far glows, in their own mesh section with a 20 km draw range).
   - **Crest runs.** For every degree of bearing, walk outward from 4,800 m and take the first local height maximum that stands 250 m or more above the lowest point passed. Join neighbouring bearings whose crest points are within 250 m into runs. Keep runs of 1.5 km or more.
   - **Wind farms** on the four longest runs that are at least 30 degrees apart: a 85 m mast every 260 m, 8-12 per run, each with a red `PAT.BEACON` glow; one row blinks together.
   - **Ridge trails** on the two runs nearest the centre: a warm glow every 40 m for up to 2 km.
   - **Pass roads** to the three lowest saddles between runs: glows every 60 m on a zigzag from the basin edge to the saddle.
   - **Temples:** `mountainTemple` at three sites on city-facing spurs, 150-250 m below a crest, at least 2.5 km apart. One `relayMast` on the highest crest of the northern half.
   - Glow size `max(4 m, 0.0011 x distance from the centre)` (about 1.5 px from the city), emission scaled with 1 / size squared so the light sent stays the same.
   - No light enters the deferred light list. Nothing draws from `rng(7070)`.
5. **Retune the existing far glows.** `distantLights` and the hamlet lamps on the ring now arrive 2 to 10 times brighter. Scale the emission of glows beyond 4,700 m so their measured brightness at the held-out cameras stays within 20% of main.
6. **Checks before hand-off.**
   - Hamlet hash, fixed-tree prefix, `buildingStats`, `signStats`: equal to main (nothing should move).
   - All ten in-app viewpoints captured; "Mountain edge" within noise of main.
   - Target list by the depth rule, recorded before judging.
   - `functional.mjs` 18/18; bench as below.

**If the quick test shows broken silhouettes** (the first layer reads as a row of bumps): do not add a front range in this idea. The simulation says it adds little, and it needs the stream freeze described under "What's new". Record it as a follow-up.

## Cost
- **Effort:** one implementer, 2 days: fog and far haze 0.5, moonlight and retune 0.5, ridge lights 1.
- **GPU (gate: average 11 ms, p99 16.7, worst 25; current about 9.8 ms).** Estimate: **+0.02 to +0.05 ms average**. Cap for this idea: +0.08 ms average, three alternating bench pairs.
  - Fog march: the same texture reads and light loops; about 10 more arithmetic operations per froxel sample (921,600 samples per frame). The fog pass is 0.65 ms; under +0.01 ms.
  - `applyFogRange`: one branch per lit pixel; the far body runs on pixels beyond 9 km only (under 12% of any eval frame): two `exp`, one `skyHorizon`. Under +0.02 ms.
  - Ground shader: one dot product and one `smoothstep` on terrain pixels. Under +0.01 ms.
  - Ridge lights: about 400 glows and 50 masts, about 5,000 triangles in the G-buffer, no point lights. The existing far glows of the same kind have no measurable cost.
  - Source: pass timings in CODEMAP.md (fog 0.65 ms, lighting 3.4 ms, G-buffer 2.5 ms) and the operation counts above.
- **Load time:** crest search on the far height grid: 360 bearings x about 150 samples, under 10 ms.

## Risks
- **The mist can read as a bright wall or wash out the top of the frame.** It is the first thing the quick test checks; `tune.range` and `seaTop` are fixed on held-out cameras. From high cameras (G3 at 600 m) the sea of mist fills about 10% of the frame and must stay darker than the city.
- **Far terrain was never meant to be seen clearly.** The far map has 32 m texels and no trees beyond the forest range. Dark silhouettes hide this; lit slopes may show it. If so, lower `RANGE_MOON` on forest and keep it on rock.
- **Peaks against the cloud deck.** The sky is a 2D function behind all terrain, so peaks above 1,800 m would stand in front of a cloud base that should hide them. The cloud fade in step 2 covers this; check it at the held-out cameras looking north.
- **Many small background changes.** Nine poses change a little beyond 4 km. Each is forecast, but a judge could prefer the plain dark sky behind the B1 show. B1's far-range share is 5% and sits behind the towers.
- **Other viewpoints.** "Lake gardens" and the fly-through's last leg look at the hills with the moon at full strength; the "larger of the two" rule in step 3 must be checked there so the mist does not double.
- **The stream trap remains for others.** Any later idea that changes ring heights must first give `distantLights` a fixed number of draws.
