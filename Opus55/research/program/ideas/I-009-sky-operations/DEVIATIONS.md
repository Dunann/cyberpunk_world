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
  - The rule picked (4974, −2339): 5.1 km out, 24° from the CBD bearing, height range 37 m over the 300 m patch.
  - The deck is 160 m square, top at 244 m, on a 5 × 5 pile grid that includes every corner and edge midpoint. Each pile footing is the lowest ground under its 3 m section, sunk 4 m; piles are 6.5–22.7 m tall, and those taller than 14 m are cross-braced.
  - The tower stands north of the rocket. Three flood masts are lit analytically in the module's shader; the city's light list gets no static lights. The red obstruction lights and the flood glare are sprites.
- **Lights.** The module uses 4 dynamic lights: 3 beam hits plus the plume light, which is on only during ignition and the low part of the climb.

## Constants
All timing, phase and placement constants are in `skyopsLayout.js` and were fixed before the first capture. Only look parameters were tuned afterwards, and only on held-out cameras: brightness, puff spacing and opacity, sail palette and hull livery.

No eval-pose image was captured before the look was final. The fix-2 target metrics are computed from geometry and depth only.
