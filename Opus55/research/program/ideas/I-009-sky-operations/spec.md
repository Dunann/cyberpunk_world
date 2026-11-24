---
id: I-009
title: Sky operations: airships, spaceport and vertiports
status: accepted
score: 5.67 (review-1 only; prototype track, user priority 5 "more technology"; build with review-1 fixes 1-15)
direction: Wild card / borrow from another field (air traffic control and airport lighting, launch photography, junk-sail design)
family: technology: large air and space traffic with readable operations
parent: none
proposed_by: idea generator
date: 2026-11-24
---

# I-009: Sky operations: airships, spaceport and vertiports

## Idea
The sky already holds about 700 flyers (`air.js`), but they are 5 m boxes that read as coloured dots, and nothing in the sky has a purpose you can see. Borrow from **air traffic control and airport lighting**: big craft that read at any distance, doing visible operations (holding, approach, landing, launch), each with the light signatures people know from real airports and launch sites. Three systems, built in this order:

1. **Advertising airships over the rivers.**
   - **Count and size:** 4 rigid airships, 160–200 m long.
   - **Where they fly:** each holds a slow racetrack pattern (6–9 m/s, 2–3 km long) over one stretch of river, at 280–420 m, the way real blimps hold over an event. The stretches:
     - the Great River between the Bund and the CBD;
     - the confluence;
     - the lower Jade River;
     - the Great River west of the peninsula.
   - **Original design:** a streamlined hull with four tail fins shaped like **Chinese junk sails**, with battens and fan-shaped panels, a gondola and vectored engine pods.
   - **Lighting:**
     - the sail panels are LED screens;
     - an LED band along each side of the hull scrolls invented brand names and slogans from the sign atlas;
     - real aircraft navigation lights: red port, green starboard, white tail, anti-collision strobes;
     - two sweeping searchlights shine down onto the water and the banks.
2. **A spaceport on the eastern mountains.**
   - **Location:** 5–6 km east of the city centre, on the CBD side.
   - **Launch complex:** a lattice launch tower (about 160 m) with white floodlights and red aviation lights, a rocket on the pad, xenon sky beams, and a runway with sequenced approach flashers (the "rabbit" lights of real airports).
   - **Launch cycle:** every 150 s.
     1. Ignition flash.
     2. A brilliant plume climbing a gravity-turn arc into the 1.8 km cloud deck, lighting the clouds from below as it passes through.
     3. Then the thing launch photographers know: a smoke column lit warm by the plume, then moonlit, that slowly spreads and drifts with the wind for about 110 s. So a trail is in the sky most of the time.
   - **Approaches:** 3–4 spaceplanes on staggered descents break out of the cloud deck with bright landing lights and land on the runway.
3. **Vertiports and cargo drones in zones A and B.**
   - **Vertiports:** about 10 of the existing rooftop helipads (crown type `helipad`) become active. They get a lit touchdown ring, chase lights running toward the pad, and corner floodlights. Dedicated eVTOLs fly the full cycle: glide-slope approach with a landing-light cone, hover, touchdown, a 12 s pause, vertical take-off, departure.
   - **Cargo drones:** 16–24 octocopters (6 m span) each carry a 6 m lit container on cables, along lanes between the CBD, the Bund and the river quays.

## Why it might work
- The user's 5th priority asks for "more technology: monorails, aircraft and spacecraft", and the brief stresses "technological … aircraft, drones".
- **Why the current sky does not count:** air traffic is too small to read. In A3, B3, G1 and G3 it shows as specks the critics read as noise ("small dots"), not technology.
- **Large silhouettes read at every distance.** A 180 m airship at 1.5 km is about 120 px wide at 2560x1440. A launch plume is the brightest object in the scene, and its smoke column is about 1.5 km tall.
- **Operations sell scale and purpose.** Navigation lights, strobes, approach flashers and landing-light cones are the exact cues that make film and game skies (Blade Runner 2049, Cyberpunk 2077) feel inhabited. They are cheap: emissive sprites and a few additive cones.
- **The sky is empty.** About 40–60% of the frame in A3, B1, B3, G1 and G3 is sky with almost nothing in it, so new content there has a high ratio of visual change to cost and does not compete with the buildings work.
- **Coherence:** the airships hold over water, the spaceport sits on the mountain ring and the vertiports reuse existing rooftop pads. Nothing floats without a reason, and each system ties sky, city and mountains together, which the rubric's coherence axis rewards.

## What's new about it
- **Closest existing code:** `air.js` (taxis, drones, police, helicopters, airliners on straight lanes and circles, and the drone show). What is new:
  - craft at a scale that reads from a distance;
  - operations with phases (approach, land, wait, take off, launch) instead of endless constant-speed loops;
  - an off-world element (spaceport, launches, spaceplanes), which does not exist in the scene at all;
  - links to the existing city: helipad crowns become vertiports, airships take their text from the sign atlas.
- No earlier idea in this program touches the sky or air traffic.
- **The design borrowings are deliberate and original:**
  - Chinese junk sails as airship fins (not the Blade Runner blimp);
  - airport "rabbit" flashers and PAPI-style lights;
  - long-exposure launch photography as the look of the trail.

## Expected effect on the metric
- **Target poses:**
  - **A3:** the confluence airship, vertiports on the peninsula towers.
  - **A6:** the airships over the Jade and Great rivers in the background, vertiports.
  - **B1:** the Bund–CBD airship over the river; the spaceport trail and sky beams behind the CBD.
  - **B3:** the airship, the trail behind the CBD, cargo drones.
  - **B4:** cargo drones and eVTOLs between the supertalls, the trail.
  - **G1 and G3:** the whole sky system.
- **Axes:** mainly character and brief.
- **Rough size:** +0.2 to +0.5 on zone A and B means and +0.3 to +0.6 on G.
- **Pairwise:** wins expected on the wide poses. Street poses (A4, B2) are unaffected, which the adoption rule allows as long as there is no clear loss there.

## Quick test
About half a day:
1. Build the airship mesh with flat colours plus LED band and nav lights, and one instance on the confluence racetrack at 320 m.
2. Draw the spaceport tower and a static plume-and-trail ribbon (no animation yet) at the chosen site.
3. Capture:
   - A3, B1, B3 and G1;
   - one custom camera 400 m from the airship;
   - one custom camera on the Nan'an bank looking toward the spaceport.
4. Run `--stats`.

Continue if all of these hold:
- the airship reads as a huge vehicle, not a toy: it has panel lines and nav-light scale, and the fog sits between it and the camera;
- the trail reads as a launch trail rather than a searchlight;
- the cost is under 0.05 ms.

## Implementation plan
1. **New module `skyops.js`**, plus `skyopsMesh.js` (meshes) and `skyopsWgsl.js` (shaders). Register it in `main.js` after `traffic`; this is a one-line additive edit.
   - Use the established patterns from `air.js` and `transit.js`:
     - instanced gbuffer meshes from `MeshBuilder`;
     - CPU-evaluated transforms for the few large craft, each with a previous-frame transform for motion vectors;
     - forward additive pipelines for beams, plumes and trails.
   - **Lights:** reserve at most 16 dynamic lights.
2. **Airships:**
   - **Racetracks:** derived from `RIVERS`. For each of the 4 stretches, take the river centerline segment, offset ±60 m to both sides, and join the ends with semicircles over the water.
   - **Altitude:** at least 280 m, and at least 70 m above the tallest `world.shared.towerTops` within 250 m of the track. Raise the track if needed. Never route over towers.
   - **Motion:** speed 6–9 m/s; phases are spread so the 4 ships are not in sync. Add gentle bank and pitch (±2°).
   - **Mesh (about 6k triangles):**
     - lathe hull: profile with a blunt nose and long tail cone, 32 segments × 24 rings, 36 m maximum diameter;
     - 4 junk-sail fins in X layout, each 5 battens (thin boxes) with 4 panels between them, fanned;
     - gondola box with a window band;
     - 4 engine pods with rotor discs;
     - masts.
   - **Shader:**
     - dark metallic hull with procedural panel lines and rivet rows that fade with `fwidth`;
     - an LED band covering 25% of the hull height on each side, sampling the sign atlas with scrolling text from new `SKY_WORDS` (invented brands and slogans, both CJK and Latin);
     - sail panels with LED colour sweeps (reuse `ledProgram` ideas);
     - nav lights as emissive spheres, plus a forward flare sprite pass (strobes 1 Hz, 0.08 s flash).
   - **Searchlights:** 2 per ship, sweeping slowly 15–35° from vertical. Reuse the `air.js` helicopter searchlight beam shader. Put one dynamic point light at each beam's ground or water hit point (radius 30 m), for the 4 ships closest to the camera only.
3. **Spaceport:**
   - **Site rule:**
     - search the sector 5–6 km from the city centre (300, -300), bearing toward the CBD ±40°;
     - pick the flattest 300 m patch with `world.heightAt`;
     - set it on a concrete platform deck on piles, so terrain is not flattened.
     - Write the rule in code and comments. Never choose the site from eval cameras.
   - **Static parts:**
     - lattice tower: 4 legs plus X-bracing with `MeshBuilder.beam`, white floodlights (emissive plus 3 static lights);
     - rocket: cylinder, nose cone, 4 fins, with a steam vent glow at its base;
     - service hangar;
     - runway 1.2 km long with edge lights (instanced emissive sprites) and sequenced approach flashers (a flash runs toward the threshold every 0.5 s);
     - 3 xenon sky beams with the `lightshow.js` ambient searchlight style (forward additive).
   - **Launch cycle** (period 150 s, phase from `time()`):
     - **0–4 s:** ignition flash. Pad flood, plus a large horizontal additive glow disc on the underside of the cloud deck (y = 1800) above the site.
     - **Ascent:** y = 0.5·a·t² with a = 12 m/s², tilting east along a gravity turn. The plume is an additive billboard: HDR core about 200 for bloom, orange-white falloff.
     - **Cloud deck:** at about 17 s the rocket reaches the deck. The cloud glow disc follows it, fading out by 40 s.
     - **Trail:** a ribbon of camera-facing quads along the sampled trajectory with a soft Gaussian profile.
       - Colour: hot near the rocket, warm-lit smoke below, moonlit grey after the plume passes.
       - Over its life (about 110 s) the width grows (r = 6 m + 0.8 m/s × age), it drifts with the wind (`F.misc.zw`), and it fades.
       - Apply fog with `applyFog`.
     - The rocket model is hidden from the end of the ascent until the trail has faded, then it reappears on the pad.
   - **Spaceplanes:** 4 instances (30 m delta-wing mesh) on staggered 160 s approach paths. They come from 3000 m (above the clouds; hidden above the deck, with a glow patch on the deck where they come through), descend to the runway, and taxi off and fade. Each has two landing-light sprites (HDR about 40), nav lights, and a faint orange heat trail above 2 km.
4. **Vertiports:**
   - **Data:** in `buildings_gen.js` `crown()` 'helipad' branch, push `{x, y: top + 4.2, z, r}` to a new `B.helipads` list. Do not use extra RNG calls. Publish it as `world.shared.helipads` in `buildings.js`. These are two additive lines in buildings files.
   - **Selection:** up to 10 pads in zones A and B (HILLSIDE, BUND and CBD districts), chosen by a position hash, at least 250 m apart.
   - **Pad lighting** (drawn by `skyops.js`):
     - an emissive touchdown ring;
     - 12 chase lights in a cross toward the centre;
     - 4 corner flood sprites;
     - a green "clear" or amber "occupied" status light that follows the cycle.
   - **eVTOLs:** one per pad. A 1.3× scaled copy of the `air.js` eVTOL mesh, with added rotor-disc glow rings.
   - **Cycle (90 s):**
     1. Approach along a 6° glide slope from 600 m out, at 18 m/s slowing to 2 m/s.
     2. Hover 4 s.
     3. Touchdown.
     4. Wait 12 s.
     5. Climb vertically 60 m in 8 s.
     6. Depart along a lane, and a new arrival comes in.
   - **Landing lights:** a forward additive landing-light cone, plus a dynamic point light under the craft for the last 40 m (part of the 16-light reserve, nearest pads first).
5. **Cargo drones:**
   - 16–24 octocopters (6 m) carrying 6 m containers on 4 cables.
   - The container has LED stripes and a glyph logo from the atlas.
   - They fly lanes from the CBD and the Bund to the river quays at 80–200 m and 15 m/s, using `air.js`-style analytic paths in the vertex shader. Lanes must keep clear of `towerTops`, using the `cbdCorridors` approach from `air.js`.
6. **Checks:**
   - Capture all G, A and B poses.
   - Capture 4 custom cameras elsewhere, so nothing is tuned to the eval set.
   - Run the motion bursts, especially `burst-u62` (aerial), for temporal stability of trails and strobes.
   - Run `--stats`, the functional checks, and the full bench.

## Cost
- **Effort:** about 3–4 implementer days.
- **GPU, about 0.1–0.2 ms average, p99 about +0.25 ms, from:**
  - **gbuffer meshes:** 4 airships (6k triangles each), the spaceport (about 10k triangles), 4 spaceplanes, about 10 eVTOLs and about 24 cargo drones. All small in vertex cost. Airships cover at most about 5–8% of the frame in near views, with cheap shading, so under 0.05 ms.
  - **Forward additive:**
    - searchlights (8 beams, reusing the existing beam shader): about 0.02–0.05 ms when crossing the frame;
    - trail ribbon (up to about 5% of frame, Gaussian only): under 0.03 ms;
    - cloud glow disc (large but one exp per pixel): under 0.02 ms;
    - flare sprites: negligible.
  - **Lighting:** 16 dynamic plus about 10 static lights, under 0.04 ms.

## Risks
- **Toy-like scale:** airships and spaceplanes can look like toys if they lack fine detail or atmospheric haze. The quick test checks this first. Panel lines, nav-light spacing and fog between camera and craft matter more than polygon count.
- **Clutter:** too many lit things in the sky compete with the drone show and searchlights in B1. Keep airships out of the drone-show volume (cut the Bund racetrack short of the show centre (2380, 215, -1000), with 300 m clearance) and dim their LED bands while `F.show.x > 0`.
- **Captures at fixed times:** whether a launch or an airship is inside a given eval frame depends on the pose time. The design makes this likely but not certain (trail lifetime 110 s of a 150 s cycle, airships holding over river stretches). The pairwise judge might see a plain sky in some target poses.
- **Spaceport direction may look camera-tuned:** the spaceport's direction (toward the CBD) makes it appear behind the CBD from the Bund. The thematic reason is that the east is the Shanghai/CBD side and the newest part of the city. Reviewers may still question it.
- **TAA on strobes and plume:** strobes and the bright plume can flicker or ghost under TAA. Use sprite motion vectors (`writeMotion`), clamp the HDR, and keep strobes at least 0.08 s long.
- **Merge conflicts:** the `buildings_gen.js` helipad hook may conflict with buildings ideas I-004..006. It is two additive lines.
- **Monorails not included:** visible monorails in the hero zones are not part of this idea, because new routes would interfere with the layout and waterfront ideas. They are a follow-up candidate.

## Target poses (review-1 fix 2, computed by rule on the prototype build)
Computed with `node tools/skyops-check.mjs targets --poses-file ../eval/poses-v1.json` at each pose's time. Only on-screen samples not hidden by nearer opaque depth count. A pose is a target when a hull is at least 150 px long or a trail (opacity at least 0.2) is at least 250 px tall. A6 is dropped regardless.

| Pose | t | Longest visible hull (px) | Tallest visible trail (px) | Target |
|---|---|---|---|---|
| A1 | 100 | 0 | 0 | no |
| A2 | 100 | 0 | 0 | no |
| A3 | 100 | 2 | 0 | no |
| A4 | 100 | 0 | 0 | no |
| A5 | 15 | 0 | 0 | no |
| A6 | 100 | 0 | 0 | no (dropped) |
| B1 | 45 | 0 | 268 | yes |
| B2 | 100 | 0 | 0 | no |
| B3 | 100 | 6 | 439 | yes |
| B4 | 50 | 0 | 523 | yes |
| G1 | 40 | 111 | 351 | yes |
| G2 | 100 | 0 | 0 | no |
| G3 | 100 | 141 | 279 | yes |
| G4 | 70 | 12 | 296 | yes |

**Targets: B1, B3, B4, G1, G3, G4** (6 of 14). All of them pass through the launch trail; no airship reaches 150 px at any pose time.
