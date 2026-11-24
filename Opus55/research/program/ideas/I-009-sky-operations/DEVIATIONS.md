# I-009 prototype: deviations from the spec

The prototype applies review-1's required fixes 1–15. Where those fixes replace the spec, the review wins and is not repeated here. Below are the places where the code differs from the spec plus review-1, and why.

Branch `idea/I-009`. Code: `Opus55/source/src/skyops.js`, `skyopsLayout.js`, `skyopsMesh.js`, `skyopsWgsl.js`, `skyopsAtlas.js`. Tools: `tools/skyops-test.mjs` (layout unit checks), `tools/skyops-check.mjs` (placement info, fix-2 target metrics, GPU stats at custom cameras, bursts).

## Scope (fix 1)
Only the airships and the launch were built. There are no vertiports, cargo drones, spaceplanes, runway, approach flashers or xenon sky beams, and `buildings_gen.js` and `buildings.js` were not edited.

## Rendering path
1. **The module draws in its own passes instead of the shared G-buffer and forward passes.** This gives it the timers fix 13 asks for (`skyops-gbuffer`, `skyops-fwd`).
   - Both passes run in `afterLighting`. The module is registered in `main.js` before `water`, so the river's SSR reflects the ships and the plume.
   - The opaque pass (ships, rocket, spaceport) shades itself with the moon, sky ambient, city glow from below (`skyCityGlow`), its own analytic floodlights and plume light, emissive and `applyFog`. It writes the lit colour, the G-buffer normal, motion (with previous-frame transforms) and depth. TAA, SSR, rain and the later forward passes therefore treat it like any other geometry. It writes wetness 0 so SSR never treats the hull as wet ground.
   - Consequence: the tiled point lights of the city do not light the hulls. At 290–530 m altitude they would not reach them anyway.
2. **Shared-file edits** (all minimal and additive):
   - `main.js`: import plus one entry in the module list.
   - `air.js`: `export` on `LANES` and `CIRCLES`, and the CBD corridors are published as `world.shared.airCorridors`. This feeds the fix-10 traffic clearance.
   - `common.js`: a new `Frame.launch` vec4.
   - `renderer.js`: the frame buffer grows from 144 to 148 floats and writes `ctx.env.launch`.
   - `sky.js`: a launch-glow term in `skyCityGlow` (fix 8), inside a uniform branch so it costs nothing while no launch lights the clouds.

## Airships
- **Turn radius 90 m instead of ±60 m.** A 180 m hull on a 60 m radius turn pivots around its own middle and the nose swings far off the track. 90 m still keeps the whole track over the 340–420 m wide river.
- **Lap length.** "Track length 1.2–1.8 km" is read as the lap length. Straights are 600 m (lap 1.77 km); the Bund–CBD straight is 555 m (lap 1.68 km) because its stretch is shorter.
- **Stretch rules** (all in `skyopsLayout.trackStretches`):
  - Confluence: centred on the intersection of the Jade and Great River centrelines, along the Great River.
  - Bund–CBD: the longest run of Great River centreline between the Bund Suspension and North Cable bridge crossings that stays at least SHOW_CLEAR + TRACK_R (390 m) from the drone-show centre. The hull's 90 m overhang stays inside that run. A unit test checks that every hull point stays at least 300 m from the show centre.
  - West: the whole track, including the hull overhang, lies west of the Yuzhong district ellipse's x extent.
- **Altitude rule (fix 10).**
  - Towers: the 70 m vertical clearance is measured from the gondola keel (26 m below the hull axis), not from the axis. Terrain within 250 m is tested as well as colliders and landmarks.
  - Traffic: bands are ±50 m (the fix's ±40 m plus the ±10 m taxi offsets). Lane drones fly at 120–200 m, so any lane near a track also blocks 70–250 m.
  - Resulting altitudes: confluence 530 m (it must clear Raffles, top 431 m), Bund–CBD 405 m, west 290 m.
- **Hull mesh: 2.6k triangles, not about 6k.** The lathe has 32 × 28 segments; the junk-sail fins, gondola, pods, rotors and masts are as specified. Silhouette and panel detail read well at 300 m, so the extra triangles were not needed.
- **Hull look (fix 11).**
  - Two-tone livery: pearl-grey top, charcoal belly and a red pinstripe. The belly is lit by `skyCityGlow` ×4 from below and the top edge has a moonlit rim, so the hull reads against the sky instead of being a dark hull with a light strip.
  - Amber marker lights along the keel and spine add scale cues. They fade out below a pixel.
- **Lights.** One searchlight per ship, sweeping 15–35° from vertical. All three ships get a 34 m point light where their beam hits the ground or water, since three is fewer than the four-closest cap. During the show, ships within 1.5 km of the show centre switch off their searchlight and dim their LED band to 30%.
- **Strobe flash length.** 0.12 s at 1 Hz, longer than fix 11's 0.1 s minimum.

## LED text (fix 12)
The airship bands use their own small atlas (`skyopsAtlas.js`: 4096×512, one row per ship) instead of `SKY_WORDS` appended to the shared sign atlas. This is fix 12's own fallback, taken directly:
- the shared sign atlas is untouched, so A4 and B2 signage cannot change;
- `signAtlas.js` belongs to other builders, and I-010 and I-014 also touch signage.

The text shrinks to fit its row, so it cannot overflow.

## Launch
- **Lift-off at 3 s.** Ignition is at t = k·150 s. The rocket lifts off at 3 s and climbs at s = 6τ².
- **Trajectory.**
  - The gravity turn starts after 120 m of vertical climb; the flight-path angle from vertical is 0.9 rad × (1 − exp(−(s − 120)/900)).
  - It reaches the 1.8 km cloud deck at 20.2 s, at 43° from vertical and 760 m downrange (due east).
- **The rocket returns at 70–100 s.** The spec hides it "until the trail has faded", but with the 240 s smoke life (fix 5) and the 150 s period the trail never fully fades before the next launch. Instead, the next rocket rises out of the deck on its elevator between 70 and 100 s, clipped at the deck surface.
- **The trail is soft puff sprites, not a ribbon.**
  - Why: a camera-facing ribbon with radius up to 250 m and about 14 m segments folded into visible fan-shaped line artifacts wherever the trail bent or pointed toward the camera.
  - Placement: puffs sit at fixed arc lengths on LOD levels with spacings of 9.25 m × 2^k. The level follows 0.8 × the smoke radius at mid-trail, and the odd puffs fade out as the next level approaches, so puffs never slide along the trail or pop.
  - Unchanged from the fixes: radius (15 m + 2 m/s × age, cap 250 m, times 0.7–1.3 3D noise), opacity (1 − age/240)^0.7, wind shear (drift speed doubles and turns 75° between 300 and 1800 m), and clipping by `1 − smoothstep(1650, 1800, y)`.
  - Lighting: a moonlit side, a silver lining when back-lit by the moon, a warm side toward the city and the burning plume, and exhaust glow on the youngest smoke.
- **Cloud glow (fix 8).**
  - Intensity 2.5 / (1 + ((1800 − y)/400)²) while the rocket climbs, then decaying with a 6 s time constant after the rocket passes the deck, and gone by 40 s.
  - An ignition-flash term is added.
  - Radius 300 m + 0.5 × the height below the deck.
- **Spaceport site (fix 9).**
  - The rule picked (4974, −2339): 5.1 km out at a bearing of 23.6° south of east, which is 6° from the bearing to the CBD district centre (17.6° south of east), inside fix 9's ±20°; height range 37 m over the 300 m patch.
  - The deck is 160 m square, top at 244 m, on a 5 × 5 pile grid that includes every corner and edge midpoint. Each pile footing is the lowest ground under its 3 m section, sunk 4 m; piles are 6.5–22.7 m tall, and those taller than 14 m are cross-braced.
  - The tower stands north of the rocket. Three flood masts are lit analytically in the module's shader; the city's light list gets no static lights. The red obstruction lights and the flood glare are sprites.
- **Lights.** The module uses 4 dynamic lights: 3 beam hits plus the plume light, which is on only during ignition and the low part of the climb.

## Constants
All timing, phase and placement constants are in `skyopsLayout.js` and were fixed before the first capture. Only look parameters were tuned afterwards, and only on held-out cameras: brightness, puff spacing and opacity, sail palette and hull livery.

No eval-pose image was captured before the look was final. The fix-2 target metrics are computed from geometry and depth only.

## Round 2: code-review fix round 1
Commit `bab3950` on `idea/I-009` (code); this section is in the following commit. No timing, phase or placement constant changed.

### Rendering path changes
- **Beams and light sprites are now drawn in the shared forward pass, after the water.** `skyops.js` exports a second module object, `skyopsLate`, which `main.js` lists right after `water`. Its `forward` hook draws the searchlight beams and the sprites (nav lights, strobes, tower and flood lights). The water's opaque plane no longer paints over them, so the beams reach the river again.
  - `skyops` itself stays before `water`, so the water's SSR still reflects the ships, the plume and the trail.
  - Consequences: the beam and sprite cost now counts under the shared `forward` timer, not `skyops-fwd`. SSR no longer reflects the beams, which `air.js` also accepts.
- **The trail and the plume stay in `afterLighting`** (timer `skyops-fwd`). See "Glows behind the smoke" below.

### Cloud deck (fix 7)
- Trail puffs fade on the height of each pixel: `c.y + (q.x·camRight.y + q.y·camUp.y)·r`, using `1 − smoothstep(1650, 1800, y)`. Pixels at 1800 m or higher are discarded, and puffs lying wholly above the deck are culled in the vertex shader. The plume halo also fades on the height of each pixel, not the nozzle height.
- The puff-centre fade was removed. Smoke below 1650 m is no longer dimmed just because its puff centre is high. In other words, the fade now follows the rule as written.
- **Rocket:** the opaque shader discards pixels above 1800 m, so the rocket enters the clouds nose first. `_rocket` now hides it only once its base reaches the deck. The flame stays on until then and fades per pixel at the deck.

### Trail cost near the camera
The fade the review suggested (`smoothstep(0.6·r, 2·r, dist)`) is in, but on its own it barely changed the cost: 1.3–1.8 ms at the boundary point versus 1.0–1.9 ms before. Puffs 0.6–2.4 radii away still cover the whole screen, and the cost is the blend of many large overlapping layers. A second measure was therefore added:
- **Thinning of puffs that look large.** Each doubling of a puff's on-screen size beyond 0.25 × the screen height (half-size) removes every other puff, up to 2 extra levels. It uses the existing LOD scheme: level = `lod.y` + extra levels, and the odd puffs of the current level fade out continuously, so nothing pops.
- The surviving puffs take over the removed puffs' opacity as stacked layers, `1 − (1 − a)^m`, which keeps the transmittance. A linear opacity boost made close views visibly more opaque.
- **Only puffs closer than 2 km are thinned** (full thinning inside 1.5 km). Farther puffs are drawn exactly as before.
  - Every eval pose camera is at least 2.49 km from every puff centre at its pose time (B2 2.49 km, B4 2.58 km, B1 3.31 km; CPU model of the trail including wind drift and the largest wobble).
  - The near fade also does nothing at that distance, since it acts only within 2 × the puff radius (≤ 760 m).
  - So the trail in the eval poses and in normal city views is unchanged by this.
- **GPU, `skyops-fwd`, 2560×1440.** Camera at the world-boundary point nearest the pad: (4701, −2211), 302 m from the pad, looking at the pad. Three heights (deck, +150 m, +450 m) × four launch ages (20, 60, 130, 230 s); 150 animated frames each.

| Camera | Before round 2 | Fade only | Final |
|---|---|---|---|
| Boundary, worst of 12 | 1.86 ms | 1.80 ms | 0.92 ms |
| Boundary, range | 0.82–1.86 ms | 0.93–1.80 ms | 0.47–0.92 ms |
| Inside the ground cloud at the pad (not reachable) | 3.40 ms | 2.83 ms | 0.98 ms |
| Inside the lower trail (not reachable) | 4.44 ms | 4.61 ms | 1.46 ms |

  The close views were checked against the old build: the column reads the same, slightly more opaque in the lower right of the +150 m view.

### Minor items
- **Launch index:** `liveLaunches(t, ages, idx)` now also returns each launch's index, and the trail seed is `trailSeed(j)`. A new unit check runs 3000 s at 60 fps and finds no flips.
- **Plume HDR cap:** the flame is clamped to `50 − haloPeak`, where `haloPeak = (1, 0.62, 0.3) × 3 × halo intensity` is the halo's maximum. Flame and halo together stay at or below 50.
- **Spaceport bearing wording:** corrected under Launch, Spaceport site. The site is 6° off the CBD bearing.
- **Trees under the deck:** confirmed. Near captures from above the pad showed forest canopy through the deck. `world.shared.spaceport` now carries `half` (80 m). `vegetation.js` stamps the deck square plus 12 m into its existing exclusion mask, with no RNG calls, so the random streams are unchanged. The deck area is now clear and the forest meets its edge.

### Glows behind the smoke (minor, not fixed)
The trail is still drawn before the other modules' forward passes, so additive glows behind it are not dimmed: light-show beams, the drone show and air-traffic lights. Moving the trail after `lightshow` would dim the glows behind it, but it would also dim every glow in front of it, since nothing orders the additive glows against the trail per pixel.

From every place the trail is normally seen, the city's glows are in front of it. The trail stands 3–7 km away behind the CBD and the mountains, and the drone show (B1) and air traffic are between the camera and the trail. Moving the trail would wrongly dim the drone show and the beams in B1, B3 and G1. A correct fix needs per-pixel ordering of the additive glows against the smoke, which is not cheap. The current order is kept.

### Checks
- `node tools/skyops-test.mjs`: 12 checks pass (one new).
- `node tools/functional.mjs`: 18/18, no WebGPU errors.
- Custom captures with profile `opus55-I009`, old build against new, no eval poses:
  - beams over the river from above each ship;
  - the trail top from below the deck;
  - the rocket entering the deck;
  - the pad from three sides.
- **Full bench** (`tools/bench.mjs`, 2560×1440 High).
  - Run alternately against a main-branch build, only after the GPU had been idle (under 15%, no other agent's Chrome) for 30 s.
  - Two runs (one of each build) were contaminated by another agent's GPU work, at 16–18 ms average, and were discarded and rerun.

| Run | Build | GPU avg | p99 | max | skyops-gbuffer avg / p99 | skyops-fwd avg / p99 | forward avg / p99 |
|---|---|---|---|---|---|---|---|
| 1 | main | 9.47 | 11.41 | 14.25 | – | – | 0.371 / 1.309 |
| 4 | I-009 | 9.67 | 11.66 | 14.09 | 0.009 / 0.033 | 0.024 / 0.161 | 0.382 / 1.359 |
| 5 | I-009 | 9.56 | 11.54 | 14.26 | 0.009 / 0.033 | 0.024 / 0.162 | 0.375 / 1.314 |
| 6 | main | 9.56 | 11.56 | 13.68 | – | – | 0.375 / 1.361 |
| 7 | I-009 | 9.64 | 11.60 | 13.39 | 0.009 / 0.033 | 0.024 / 0.160 | 0.380 / 1.358 |
| 8 | main | 9.63 | 12.04 | 54.86 | – | – | 0.373 / 1.366 |

  - Mean GPU average: I-009 9.62 ms against main 9.55 ms, so +0.07 ms. The p99 is within noise: 11.60 against 11.67.
  - The module's own timers average 0.033 ms, plus about 0.006 ms of beams and sprites now inside `forward`. That is well inside the 0.35 ms average / 0.6 ms p99 cap.
  - The 54.86 ms maximum in main run 8 is a one-off hitch in the main build.
  - All gates pass and there are no WebGPU errors.
