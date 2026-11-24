---
id: I-008
title: Virtual-volume 3D screens and holograms
status: proposed
direction: Wild card / borrow from another field (anamorphic billboards, interior mapping, volumetric displays)
family: signage: 3D displays (parallax screens, raymarched holograms)
parent: none
proposed_by: idea generator
date: 2026-11-24
---

# I-008: Virtual-volume 3D screens and holograms

## Idea
Add the two kinds of display that make a city feel like the future: wraparound 3D corner screens and holograms in open air.

1. **Corner screens with real depth.** Real "3D" billboards wrap around a building corner and paint a box frame so the content seems to sit inside the building. Examples: the 3D cat in Chengdu, the Shinjuku cat, Seoul's "Wave" tank. They only work from one sweet spot. Here we borrow **interior mapping** from game rendering (fake room interiors behind windows) to make the illusion correct from every viewpoint.
   - Each corner screen is two faces that meet at a podium corner, each 18–32 m wide and 10–18 m tall, 8–14 m above the street.
   - Its fragment shader casts the view ray into a virtual box behind the two faces (the building's corner volume) and raymarches stylised content inside it.
   - The result is quantized to an LED dot grid so it reads as a screen, not a window.
   - **Content programmes**, all original designs, cycling every ~20 s with a different phase on each screen:
     - (a) **"Two-rivers tank":** a water volume sloshing and breaking against the glass;
     - (b) **koi:** a giant koi turning in the box;
     - (c) **变脸 mask:** a Sichuan-opera face-changing mask that switches painted faces behind a fan sweep;
     - (d) **鸳鸯锅:** a Chongqing split hotpot, red chilli broth and white broth, with rising bubbles and floating chillies.
2. **Holograms.** These are additive raymarched volumes in the forward pass, with a projector cone from an emitter, scanlines in world Y, short glitch slices and Fresnel edge glow.
   - **Crown holograms:** 40–80 m, above 4–6 flat-roofed towers in zones A and B, visible across the river.
   - **Street holograms:** 12–25 m, above 6–8 major intersections in the hillside, CBD and Bund districts.
   - **Content:**
     - (a) **rotating extruded characters** (渝, 福, 龍, 霓). The sign atlas's blurred glyph channel serves as a 2D distance field, extruded into a 3D glyph, so any character in the atlas can become a hologram for free;
     - (b) a pair of koi circling;
     - (c) a planet with orbit rings, as an "advert" for off-world travel, which ties in with I-009.

## Why it might work
- The brief names holograms explicitly. Both critics list "few holograms or drones at street level" as a missing item.
- The user's 4th priority asks for "3D holographic billboards, wraparound LED screens".
- Corner 3D screens are the most recognisable piece of 2020s Chinese, Korean and Japanese street spectacle. Chengdu is in the same Sichuan-Chongqing cultural region as zone A, so the reference fits the brief.
- **True parallax** is what separates a showcase screen from a flat billboard. Interior mapping is a proven real-time technique, used in Spider-Man and many open-world games, that gives this at the cost of one ray-box intersection per pixel, plus a short raymarch here.
- **Content that hides crude shapes:** the LED dot quantization (already used by kind-4 screens) hides SDF simplifications up close, and the box frame gives the depth cue that makes real anamorphic ads work.

## What's new about it
- **Nothing in the program or the code renders 3D content inside a display or as a free-standing hologram.** The closest things are:
  - the existing giant LED screens (kind 4 in `signs.js`: flat 2D plasma, slogans, equalizer, tunnel);
  - the drone show (point formations in the sky).
- **The new parts:**
  - the parallax "virtual box" behind the screen surface, correct from all viewpoints rather than a fixed anamorphic sweet spot;
  - motion vectors from the virtual hit point, so TAA reprojects the parallax correctly;
  - volumetric holograms, including glyph extrusion from the existing atlas;
  - culturally specific content (变脸, 鸳鸯锅).
- **Difference from I-007:** I-007 is tower-scale 2D light on facades. This idea is 3D content at street and crown scale.

## Expected effect on the metric
- **Street poses:** A4, A5 and B2, plus the `burst-u12` street burst if a screen or hologram is in frame. The effect should be on character, brief and detail.
- **Wide poses:** A3, A6, B1, B3 and B4, through the crown holograms.
- **Rough size:** +0.2 to +0.5 on zone A and B means.
- **Pairwise:** wins expected where a display is in frame. Placement follows city rules, not the cameras, so some target poses may not contain one. Street poses near intersections in the CBD and the hillside are the most likely.

## Quick test
About half a day:
1. Turn one existing CBD giant-screen location (kind 4, from `signPlace.js`) into a two-face corner screen.
2. Use a fragment shader with ray-box entry and exit and a 40-step raymarch of a sphere bouncing on an emissive grid floor, LED-quantized.
3. Capture:
   - 3 custom cameras, 30, 80 and 150 m away, at 0°, 35° and 70° to the corner;
   - a 4-frame moving burst past it.
4. Measure with `--stats` while the screen covers about 25% of the frame.

Continue if all of these hold:
- the content reads as inside the building from all three angles;
- there is no TAA smear or ghosting in the burst;
- the added gbuffer time is under 0.15 ms at 25% coverage.

## Implementation plan
1. **New module `holo.js`**, plus `holoContent.js` for the WGSL content programmes. Register it in `main.js` right after `signs`; this is a one-line, additive shared-file edit. It reads `world.shared.signAtlas`, which signs publishes in its init.
2. **Corner-screen placement** (in `holo.js`, from `world.lots`, reusing the street test from `signPlace.js`):
   - A lot corner qualifies when both adjacent edges face a grid road and both edges are over 24 m long.
   - Allowed in districts CBD, BUND, URBAN and HILLSIDE (main roads only), at least 260 m apart.
   - At most 12 in the whole city.
   - The screen faces sit 0.6 m outside the lot edges, as existing screens do, from 8 to 14 m above the ground at the corner.
   - Check that the podium reaches the screen top. Use `world.signSlots` and lot heights where available, and skip lots without a podium face there.
   - Add a thin metal bezel and a top cap (boxes) so the screen is visibly mounted.
3. **Corner-screen shader** (gbuffer pipeline):
   - Screen-local frame: origin at the corner, axes along face A, face B and up. The virtual box is [0, wA] × [0, wB] × [y0, y0 + h] behind both faces.
   - For each fragment:
     1. Make a ray from `F.camPos` to `wp`.
     2. The entry point is `wp`; compute the exit against the box.
     3. Raymarch the active programme's SDF: at most 48 steps, a hit threshold of 0.02 × distance, stop at the exit.
     4. Shade the hit with a fixed virtual key light from the top and a rim light.
     5. Rays that hit nothing land on the box's back walls and floor. These are painted as a dark emissive grid with a vignette, the "box" that real anamorphic screens draw.
   - **LED look:** quantize the hit's colour to a 6 cm dot pitch using the existing kind-4 `fwidth` approach (dots up close, fading to flat colour far away).
   - **Motion vectors:** output `motionVector(virtualHit, virtualHitPrev)`, using the same virtual point for static box parts. Depth stays the screen surface depth.
   - **LOD:** beyond 250 m, or when the LED pitch is under 0.3 px, skip the raymarch and sample the content at a fixed mid-box depth with 8 steps.
   - **Programmes** (in `holoContent.js`; each is one `fn sceneN(p, t) -> vec2f` returning (distance, material) plus a colour function):
     - **Tank:** a heightfield of 3 travelling waves with a sharp crest, checked against the glass plane; foam is emissive white where it is steep.
     - **Koi:** a body ellipsoid bent by a travelling sine, a forked tail, two pectoral fins; red and white patches from value noise.
     - **Mask:** an ellipsoid face with brow, nose and cheek ridges (smooth unions). Painted bands come from a pattern table of 4 faces, swapped every 2.5 s behind a fan-shaped wipe.
     - **Hotpot:** a split bowl (torus plus a dividing wall), two broths, up to 8 bubble spheres rising on hash timings, chilli capsules bobbing on the surface, and steam as a soft glow gradient on the back wall.
   - Add one point light per screen, in front of it (radius 25 m, average programme colour, set per frame from a CPU-side estimate per programme).
4. **Holograms** (forward pass, additive, depth-tested, no depth write):
   - **Crown sites:** the 4–6 tallest flat-roofed towers in zones A and B. Use `world.shared.towerTops` and skip tops that have a searchlight fixture from `lightshow.js`. Each gets a projector ring on the roof (emissive torus prop drawn by `holo.js`) and a 40–80 m hologram above it.
   - **Street sites:** grid intersections of two roads 16 m wide or more in CBD, BUND and HILLSIDE, with no building part within the volume. Test against `world.colliders`. At most 8, at least 300 m apart. The volume is 12–25 m tall, its base 6 m above the road.
   - **Proxy geometry:** draw the hologram's bounding box. In the fragment shader, march the box segment with at most 32 steps, accumulating glow `exp(-k·max(d, 0))`, not a hard surface. Add:
     - scanlines `0.6 + 0.4·step(0.5, fract(wp.y / 0.35))` (fading with distance);
     - a glitch: every 3–7 s, offset a horizontal slice 0.5 m for 0.12 s;
     - Fresnel edge glow;
     - a cyan/magenta/amber palette per site;
     - a faint additive projector cone from the emitter.
   - **Extruded glyph:** d2 = (0.5 - atlas.g) × glyph size, then d = max(d2, |z| - thickness), rotating about Y.
   - Add one point light per hologram (radius 30–60 m) to tint nearby facades and wet streets.
5. **Budget guards:**
   - Hologram march steps scale with screen size: 32 steps above 400 px tall, 16 below.
   - Holograms more than 2500 m away are not drawn.
   - Corner screens are culled by distance (600 m) and frustum on the CPU.
6. **Checks:**
   - Capture the target poses.
   - Capture 6 custom cameras at other screens and holograms, so nothing is tuned to the eval cameras.
   - Run the `burst-u12` and `burst-u62` motion bursts.
   - Run `--stats` near the largest screen.
   - Run the functional checks.

## Cost
- **Effort:** about 3 implementer days. The content art is most of it.
- **GPU, about 0.05–0.1 ms average over the fly-through, with peaks of +0.3 ms when a corner screen fills a street view.** The time comes from:
  - **Corner-screen raymarch in gbuffer**, only on screen pixels: 48 steps of a simple SDF at about 25 ops per step. At 25% frame coverage (0.9 M pixels) that is about 0.15–0.25 ms; at typical coverage (0–5%) it is under 0.05 ms. Far screens use the 8-step LOD.
  - **Hologram forward pass:** 32-step glow march, only inside proxy boxes. A crown hologram at 1 km covers about 1–2% of the frame (under 0.02 ms); a close street hologram at 15% coverage costs about 0.1 ms.
  - **Lighting:** about 20 new point lights, under 0.03 ms.
- **p99 safety:** the worst single frame is a corner screen plus a hologram together at close range. Keep it under +0.4 ms, against a measured baseline p99 of 11.55 ms and a gate of 16.7 ms.

## Risks
- **Programmer art:** SDF content may read as crude placeholders, which critics punish under "detail". The LED dot grid and strong stylisation (flat colour bands, rim light) are the defence. If one programme looks weak, drop it rather than ship it.
- **TAA:** animated content inside a moving parallax volume may ghost. Motion vectors from the virtual hit point fix the parallax part; fast animation may still smear slightly. Keep motion slow.
- **No display in some poses:** placement is by rule, so some target poses may contain no screen or hologram. Pairwise gains then come only from the poses that do.
- **Lights clustering:** lights at intersections could cluster in tiles that already hold many sign lights. Hologram lights must stay under the 256-per-tile cap, as `selectLights` already enforces for signs.
- **Hiding landmarks:** crown holograms could hide searchlights or landmark crowns. Skip tops that already have fixtures.
