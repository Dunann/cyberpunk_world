---
id: I-022
title: Readable sky - fewer specks, aircraft you can recognise, rooftop vertiports, and airships that keep out of the landmarks' way
status: rejected
score: 4.50 (review-1 4.67, review-2 4.33; mean; below 7)
direction: Attack the weakness (critic-named sky clutter and unreadable aircraft; the I-020 airship losses)
family: air traffic design: flyer hierarchy, vehicle silhouettes, vertiport cycles, airship placement rule
parent: I-020 (airships), I-009
proposed_by: idea generator
date: 2026-11-24
---

# I-022: Readable sky

## Idea
The sky over the city is full of red and green dots. On High there are about 940 flyers (`air.js`: 320 air taxis, 380 light-only drones, 64 CBD taxis, 150 CBD drones, police, helicopters, airliners). Every one draws nav-light sprites with a minimum size of 1.5 px at full brightness, so at 1–3 km they stay as hundreds of evenly spread specks, while the taxis themselves are 4 m boxes with four rotor prisms that never resolve into a shape. The critics on the current best ask for exactly the opposite: "fewer drone specks and searchlights", "readable holograms and aircraft" (critic 1, change 10), "readable drones" (critic 2, change 9). The user's priority 5 is more technology: aircraft and spacecraft. I-020 showed that a close airship wins on its own and loses only where it hides a landmark tower, and that its flat glowing fins and English-only banner were named as weak.

This idea turns the sky from noise into a few things you can read, in five parts:
1. **Fewer specks.** Light-only drones are thinned to one in four; every nav light fades out with distance and haze (gone by about 1.5 km) instead of keeping a 1.5 px minimum. Far traffic becomes a faint, sparse glow; near traffic stays.
2. **Air taxis you can recognise.** The taxi becomes a designed vehicle at a realistic size (about 9 m long, 9 m span): tapered fuselage, a lit cabin glass band, four ducted rotor rings with LED rims (rings read as circles at any distance), a tail light bar and a livery colour band. Same instance count and paths.
3. **Rooftop vertiports.** Up to 10 of the existing helipad crowns, chosen by rule, become vertiports: a lit pad ring, a soft stack of three holographic approach rings above it, and two taxis each that land, wait with the cabin lit, and take off on analytic paths. This puts life on the skyline where the eye goes (the CBD, the Bund, the peninsula towers).
4. **Cargo drones over the rivers.** About 30 heavy drones carrying lit containers fly low lanes (60–120 m) along the rivers, so the river sky has visible, purposeful traffic.
5. **Airships, fixed.** The three I-020 airships come back with: a landmark sightline rule (no ship track may block the view from the rivers to the upper half of any landmark tower within 1.2 km of the viewer); structural fins (ribbed frames with shaded skin and an LED trailing edge only, not flat emissive panels); and three-script banner pages (Chinese, Latin, and Mongolian Cyrillic or Uyghur by the ship's home district). The airship searchlight beams are dropped (the critics ask for fewer searchlights; I-009's judges named beam clutter).

## Why it might work
- **The critics name it directly.** Both fresh critics list sky clutter and unreadable aircraft (`metric/best-016m-findings.md`). The specks are in every aerial and waterfront pose: A1, A3, A6, B3, B4, G1, G2, G3 (visible in `runs/I-016m`).
- **The cause is concrete.** `FLYER_LIGHT_WGSL`: `rr = max(r, pxMin * px)` with `pxMin` 1.1–1.7 and colours 8–20, so the sprite never shrinks below about 3 px across and only fog dims it. The taxi mesh (`evtolMesh`) is a 1.5 × 1.2 × 4.2 m box: at 800 m it covers about 3 × 9 px, which reads as a smudge between two dots.
- **The airship result is known.** I-009 round 3 and I-020: the close airship won all four u62 aerial frames twice and slight wins at G1 and G3 (I-020 judge A); every fresh-camera loss was a close ship hiding a landmark or dominating the frame. A rule that keeps ships off the landmark sightlines attacks the only reason I-020 failed.
- **Vertiports use what exists.** `buildings_gen.js` already builds `helipad` crowns (visible as lit "H" pads in G3 and B3). Landing taxis on them is analytic path work, like the existing holding circles.

## What's new about it
- **Closest ideas: I-020 and I-009.** They added airships (and a launch) to an unchanged air-traffic system and were judged on fresh cameras because the ships barely appear in eval poses. This idea changes the whole sky that every aerial eval pose already shows (removing clutter, making craft legible, adding rooftop activity) and keeps the airships as one part, with a placement rule written against their known failure.
- **Different from a density tweak:** it creates a hierarchy (few readable near craft, sparse far glow, focal vertiports and airships) instead of uniform noise, which is how film and game skylines are composed.

## Expected effect on the metric
**Targets, by a rule declared now.** After the build is final, a dev tool (`tools/skyshare.mjs`, new) evaluates the analytic flyer, vertiport and airship states at each eval pose's time, on the candidate build, and projects them with the real camera (terrain occlusion only). A pose is a target if the candidate shows at least one of: an airship hull at least 40 px long; a vertiport approach-ring stack at least 30 px tall; at least 3 aircraft at least 20 px long. The list is frozen in `DEVIATIONS.md` before any candidate eval image is viewed. Expected targets: B3, G3, A6, B4, G2 (CBD and peninsula towers carry most helipads), possibly G1. Adopt: wins on 2/3 of the targets and no clear loss elsewhere. **Secondary check:** I-020's 8 fresh airship cameras (`ideas/I-020-airships-only/fresh-cameras.json`) are re-captured on main and the candidate; no clear loss on any of them (I-020 lost S01, S04, S07 slightly).

| Pose | What changes | Forecast |
|---|---|---|
| B3, G3, A6 | Specks thinned; vertiport rings and landing taxis on helipad towers; recognisable taxis on the near lanes | Slight to clear win |
| B4 | Taxis threading the supertalls become readable vehicles; a vertiport on a nearby crown | Win |
| G2, A3, A1 | Far specks fade into haze; cargo drones over the river; possibly an airship above the skyline | Slight win or tie |
| G1, G4 | As above; G4 lost slightly in I-020 (a ship near the bridges): the sightline rule moves it | Tie or slight win |
| B1 | The drone show and its lasers are untouched; background specks fewer | Tie |
| A2, A4, A5, B2 | Little or no sky | Tie |

**Critic scores (estimate):** brief-fit and coherence +0.3 to +0.5 on the aerial poses (B3, G3, A6, B4), +0.1 to +0.2 on G1, G2, A3. Zone B about +0.15, zone G about +0.15, zone A about +0.05. It does not raise the detail axis much on its own; its value is removing a named defect from 8 poses at very low GPU cost and answering user priority 5.

## Quick test
About half a day, held-out cameras only.
1. Build parts 1 and 2 only (speck thinning and fade; new taxi mesh).
2. **Held-out cameras by rule (seed 20261126, written before any capture):** 6 cameras, each 150–400 m from a randomly chosen air-taxi lane point at a random time, at the lane altitude ±80 m, looking along a random bearing within 30° of the lane; plus 2 high aerial cameras (400–600 m up, pitched −20° to −35°) over random district centres. Rejected if within 300 m of an eval pose or if terrain blocks.
3. Blind pairwise judge (fresh agent, `make-pairs.mjs`, key outside the judge folder). **Stop rule:** fewer than 5 of 8 wins, or any clear loss, means the speck cut or the new taxi is not an improvement; stop before vertiports and airships.

## Implementation plan
### Part 1: speck policy (`air.js`)
1. **Keep the `rng(555)` sequence identical by construction.** Every existing `rnd()` call runs in the same order and number (the airship altitudes depend on `cbdCorridors`, which draws after the drones; I-020 code review note). Thinning happens after drawing: a light-only drone (type 1) is uploaded only if `hash(index) < 0.25`. Nothing else is removed.
2. **Distance fade for nav lights** (`FLYER_LIGHT_WGSL`): `pxMin` is multiplied by `1 − smoothstep(600, 1500, dist)`, and the colour by `1 − smoothstep(900, 1600, dist)` on top of the fog term. Airliners (type 3) keep their beacons (they are 3 km up and read as aircraft).

### Part 2: the air taxi (`air.js` `evtolMesh`, `FLYER_MESH_WGSL`)
3. New mesh (about 300 triangles, built with the existing `MeshBuilder`): tapered fuselage (8.6 m), cabin glass band (material 1, emissive warm white, as today), four ducted rings (outer radius 1.6 m, 12 segments) on short pylons, with an LED rim (material 3, the existing cyan or magenta by seed), a tail light bar, a livery band (one of 4 colours by seed). Mesh scale stays 1.0 for taxis; police and helicopters keep their current scales and meshes.
4. Raise the mesh draw distance from 1600 m to 2200 m for taxis only, so a taxi is a shape (not a light pair) out to where its lights fade.

### Part 3: vertiports (new `vertiports.js`, appended module data; `air.js` paths)
5. **Selection rule (world data only):** among `helipad` crowns, take those with roof height at least 120 m, sorted by height, greedily keeping crowns at least 400 m apart, at most 10. No pose coordinates.
6. **Per vertiport:** a lit pad ring (emissive, on the existing pad), three soft approach rings 15, 30 and 45 m above the pad (additive forward quads with an analytic soft ring profile, depth-faded, cyan or amber by district), and 2 taxis on an analytic cycle of 90 s: 30 s descending spiral approach from the nearest lane, 20 s on the pad (cabin lit, rotors slowing), 40 s climb-out to another lane. Phases from `rng(5557)` (new stream). No real lights.
7. **Clearance:** approach spirals are tested against the building collider boxes (the `cbdCorridors` `blocked` test) and the airship tracks; a vertiport whose spiral is blocked is dropped.

### Part 4: cargo drones (`air.js`, appended after all existing flyers)
8. 30 drones (type 5, new): four-rotor heavy frame, 6 m, carrying a 6 × 2.4 m container with one of 6 lit liveries (CJK and Latin logo panels from the sign atlas). Lanes: along the river centrelines at 60–120 m, offset ±60 m, both directions, speed 18–24 m/s. Draws from `rng(5557)` after the vertiports.

### Part 5: airships (bring in `skyops*.js` from `idea/I-020` at 9cfe031, merged with current main)
9. **Landmark sightline rule** (`skyopsLayout.js`, CPU, unit-tested in `tools/skyops-test.mjs`):
   - Viewers: points every 50 m along both river centrelines at y = 10 m.
   - Targets: for each `LANDMARKS` tower and each of the 15 tallest `towerTops`, the vertical segment from half its height to its top.
   - For every track sample (every 20 m along the racetrack, at the ship's altitude) and every viewer within 1.2 km of a target, the hull capsule (radius `HULL_R` + 15 m) must not cross the viewer-to-target segment.
   - If a track fails: shift the straight leg along the river in 50 m steps (both directions, up to 600 m); then raise the altitude in 25 m steps (up to +150 m, still under the airliners); then shorten the straight to `STRAIGHT_MIN`; if it still fails, drop that ship. Report the result per ship.
   - The rule's constants are locked in the file before any capture, as I-009's were.
10. **Structural fins** (`skyopsMesh.js`, `skyopsWgsl.js`): each fin is a frame (leading spar, trailing spar, 4 ribs, 0.6 m sections) with skin panels in the hull material (shaded, not emissive); only the trailing edge carries an LED line.
11. **Three-script pages** (`skyopsAtlas.js`): each ship's band cycles three still pages every 5 s: the Chinese brand, the Latin line, and a third line in Mongolian Cyrillic (Confluence ship), Uyghur (west ship) or Chinese with the brand's English tagline (Bund–CBD ship). Uses the existing glyph sets in `signAtlas.js`. The fit and mirror-safety unit tests are extended to three pages.
12. **No airship searchlight beams;** the 3 reserved lights are released.

### Checks before hand-off
13. **Identity outside the sky.** `hyd-identity.mjs`: building parts, signs, lanterns, slots and lights identical to main except the released airship lights (none on main) and no others. With air traffic and the airships off (`?trafficParts=transit,cars,crowd&disable=skyops,skyopsLate`, dev; the vertiport and cargo content lives in the air part), aligned PNG captures of all 14 poses must match main with air traffic off. (If the vertiport pad ring is drawn as part of the building crown, it must be switched off by the same flag.)
14. `rng(555)` check (dev): the draw count and the published `airCorridors` must equal main's.
15. Motion: burst-u62 and burst-u12 captured; no TAA ghosting on the approach rings (they are additive and depth-faded; check the four u62 frames).
16. `functional.mjs` 18/18, no WebGPU errors, both builds.

## Cost
- **Effort:** one implementer, about 3 days (parts 1–2: 0.5 day, part 3: 1 day, part 4: 0.5 day, part 5: 1 day; part 5 reuses I-020's code).
- **GPU** (gate: average ≤ 11 ms, p99 ≤ 16.7, max ≤ 25; current best about 9.8 ms; the remaining ~1.2 ms is shared with I-018 and the other generators' ideas). **Cap for this idea: +0.10 ms on the fly-through average, +0.2 ms at p99** (mean of 3 alternating pairs under the GPU lock).

  | Source | Estimate | Where it comes from |
  |---|---|---|
  | Light sprites: about 400 fewer flyers × 4 sprites, and far sprites culled when their colour reaches 0 | −0.01 to −0.03 ms | forward (0.37 ms today) |
  | Taxi mesh about 300 triangles instead of about 100, ~380 instances, drawn to 2200 m | +0.01–0.02 ms | gbuffer |
  | Vertiports: 10 × 3 additive rings, half-screen at most when close; 20 extra taxis | +0.01–0.03 ms | forward |
  | Cargo drones: 30 × about 200 triangles | under 0.01 ms | gbuffer |
  | Airships: measured in I-020 at +0.03 ms average (opaque pass skipped when no ship is in view); beams removed | +0.02–0.03 ms | gbuffer, forward |
  | Real lights | −3 reserved (airship beams dropped), none added | lighting (unchanged or slightly cheaper) |

  Total estimate: +0.02–0.07 ms average.
- **Memory:** under 2 MB (meshes, flyer buffer, one 1024² airship atlas as in I-020).
- **Shared random streams:** `rng(555)` (air traffic, feeding the CBD corridors and through them the airship altitudes) keeps its exact draw sequence; the drone show's `rng(7)`, `rng(2024)`, `rng(99)` in `airShapes.js` are untouched; `SKY_SEED` 909 for the airships is unchanged. All building, sign, light, traffic, crowd and tree streams (`rng(1234)`, `rng(9137)`, `rng(4242)`, `rng(5150)`, `rng(31337)`, `rng(8080)`, `rng(9191)`, `rng(7070)`, `rng(99)` in vegetation) are not read or written. New: `rng(5557)` for vertiports and cargo drones.

## Risks
- **Fewer specks may read as an emptier sky.** Some judges may prefer the busy sparkle. The quick test checks this first on 8 held-out cameras; if it loses, keep the thinning at one in two and only fade the far lights.
- **Small gains spread over many poses.** Each pose gains a little, and slight wins can turn into ties. The target rule keeps only poses where something readable is added.
- **The sightline rule cannot cover every view.** It protects views from the rivers, where most eval and fresh cameras stand; an aerial camera can still see a ship cross a tower. That is a normal aerial composition, but I-020's S01, S04, S07 must be re-checked (secondary check above).
- **Vertiport rings could look like the "unexplained primitives" critic 2 named** (floating neon bars, hard quads). They must be soft, depth-faded and attached to a pad that is visibly in use (taxis on it); if a held-out camera shows a ring with no taxi in sight, lengthen the parked phase.
- **Overlap with other generators:** the placeholders and landmark ideas may change the towers that carry helipads. The selection rule reads the crowns at load time, so it adapts; the target list is computed on the final merged build.
