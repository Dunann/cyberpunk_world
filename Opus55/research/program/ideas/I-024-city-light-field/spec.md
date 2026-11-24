---
id: I-024
title: City light field - the light of the real windows, signs and crowns, baked once into a 3D field, lights the wet air and the dark surfaces around them
status: in-review
direction: Wild card / break an assumption (the lighting model: emissive surfaces light nothing)
family: lighting representation: load-time baked 3D light field from the generator's own emitter data, used by the fog and by deferred lighting
parent: none
proposed_by: idea generator
date: 2026-11-24
---

# I-024: City light field

## Idea
In this renderer a lit surface is a decoration, not a light. The lighting pass adds the emissive channel after all lighting is done (`col += E.rgb` in `renderer.js`), so a glowing facade lights nothing: not the air in front of it, not the wall next to it, not the quay below it. Light comes only from about 5,000 small point lights (10-40 m radius, mostly signs, shops and lamps) plus the sky ambient and one constant (`cityBounce = vec3f(0.05, 0.025, 0.03)`). Every idea so far has taken this for granted. It is why the city reads as bright stickers on black boxes, and why the surfaces beside the brightest places are black.

This idea makes the city's emissive surfaces act as light sources, at almost no cost per frame:

1. **Bake a 3D light field once, at load.** The city is static and it is always night, so the light that its facades, crowns, neon trims and static lights send into the space around them does not change. A few compute passes at load time:
   - read every emitter from data that already exists (the building part records and the light list);
   - spread that light through a 3D grid over the built-up area, stopping at buildings and terrain;
   - store the result in two small 3D textures.
2. **Use it in two places.**
   - **The air.** The froxel fog adds the field to the light it scatters. Bright facades get a soft halo in the rain at their real height and in their real colour, and nearer towers stand out as shapes in front of it.
   - **Dark surfaces.** The lighting pass adds the field as fill light, with a direction, so a wall, quay, roof or tree that faces a bright facade is lit by it, and one that faces away is not.

The two uses have separate switches. The quick test judges each one alone and both together, and only what wins ships.

## Why it might work
- **The critics' "black" defects are unlit surfaces next to bright ones.** From the findings on the current best: "flat black embankment strip" (A1), "blank untextured slab" embankment (A2, critical; `terrainBank.js` gives it masonry blocks and streaks, but almost no light reaches them), "unlit black wedge in front of the stack" (A3, critical for critic 2), "supertall bases look pasted on" (A1), "black voids" under the guideway and the hillside street (A5), "dark forest band on far bank" (B3, G2). Each is ordinary geometry within about 100 m of a very bright facade that sends it no light. (The embankment wall itself faces away from the stack and gains less than the quay, hill and tower bases; see Risks.)
- **"Rain is invisible in most frames" (critic 2).** Wet air shows where it is lit. Today the only city light in the fog comes from the point lights: small halos around lights near the camera, and a blurred 2D map of which 88% is held near the ground (`exp(-hA / 55.0) * 0.88` in `fogAmbientLi`). The air around a lit tower or in front of the Hongyadong stack stays dark. Rain streaks take their light from the same fog volume (`rain.js`), so they would also pick up facade light near the camera.
- **Light in the air gives shape without changing a single building.** A glow behind a tower turns it into a silhouette; the same glow in front of a far district makes it recede. This is depth-aware, unlike screen-space bloom.
- **The pieces that make this cheap are specific to this project:**
  - the emitters are known as data (a part record has material, lit share, colour and flags; a light has position and colour), so nothing has to be rendered or voxelised to find them;
  - the city is close to a height field (boxes on terrain), so "is this point inside or behind a building" is one lookup in a roof-height map;
  - the result is static, so the per-frame cost is three texture reads per pixel.
- **The engine already half does this, by hand.** There are hard-coded spill terms where the missing light was most obvious: `S.emis += S.alb * vec3f(1.0, 0.7, 0.5) * 0.35 * exp(...)` on shop podium walls, a fake lamp term on embankments in `terrainBank.js`, a flood term on Bund stone. The field does the same job everywhere, from the real emitters.
- **It is scaled by a rule, not by taste.** At gain 1 a facade lights the air and nearby surfaces as a point light of the same output already does in this engine (same falloff, same units, same phase function). Rough numbers at gain 1, from the shader constants, not measured:
  - 50 m in front of the Hongyadong stack (mean facade radiance about 0.15-0.3), a surface of albedo 0.1 gains about 0.01-0.02 HDR, which is about +30 to +45 on the 8-bit image;
  - 200 m of rain haze in front of the stack gains several times that, a strong gold halo, so the test also runs the air term at half gain;
  - a wall 20 m across a street from an ordinary residential tower gains about +20 on the 8-bit image over black, and the air there gains nothing visible.

  So the effect is strong beside the brightest places and small elsewhere.

## What's new about it
- **Closest existing code:**
  - the fog module's "glow grid": a 2D, 48 m map of the point lights, blurred over about 170 m, used only for haze near the ground. Facades are not in it and it has no height.
  - the constant `cityBounce` and the hard-coded spill terms above.
- **Closest ideas in this program:** I-006 proposed a constant warm "street uplight" on every wall; both reviewers said it would lower contrast across the city. The field is not a constant: it is zero where no bright surface is near and it has a direction.
- **Closest known work** (from memory, not re-checked): irradiance volumes (Greger et al., 1998), light propagation volumes (Kaplanyan and Dachsbacher, 2010) and voxel cone tracing (Crassin et al., 2011). The first is precomputed offline from the full scene; the other two voxelise rendered geometry and update every frame. Here there is no offline step, no voxelisation and no per-frame update: sources come from the generator's records, visibility from a roof-height map, and the bake runs once at load, in about a second.
- **Different from everything tried so far:** all earlier ideas add or rearrange content. This changes what the existing content does to its surroundings.

## Expected effect on the metric
- **Zone A hero views (A1, A2, A3):** a gold halo over the river in front of the stack; the quay, the stilts, the hill beside the stack and the bases of the towers above it are lit by it; the embankment gets a weak share (see Risks). Character +0.5, coherence +0.5, detail up to +0.5 where existing texture becomes visible.
- **Skyline and aerial views:** halos around lit crowns, edge-lit towers and neon streets; dimly lit walls and roofs between the windows. Character +0.5 if judges read it as atmosphere, a loss if they read it as haze. The quick test decides this before the build.
- **Zone means:** about +0.2 to +0.3 in zone A, less elsewhere. On its own this does not reach 9. It removes a cap that sits on every later idea: new geometry placed beside a bright facade will no longer be black.

### Target poses (declared rule)
- **Changed pixel:** a pixel whose 8-bit luma is at least 6 higher with the field on than with it off, in two captures of the same build at the same frame phase (`--align`), at the shipped gain.
- **Rule:** a pose is a target when changed pixels cover at least 20% of the frame. If more than five poses qualify, the five with the largest share are the targets.
- **How it is measured:** with the off/on captures of the quick test, before any judge sees them. The list is frozen in `DEVIATIONS.md`. With the field switched off, the candidate build must match main (see checks), so the rule measures this idea only.
- **My prediction:** A1, A2 and A3 qualify; A6, B3, B4 and G2 may. The measured list decides.
- **Every other pose** must show no clear loss.

## Quick test
About 1 day, with a crude field. Run all GPU jobs under the shared lock.

1. **Crude field:** inject the sources (plan step 2), then blur the source volume (Gaussian, 2 cells wide, 1 layer high). No roof test and no direction: the surface term uses the even share only (0.25) and the air term uses a phase weight of 1.
2. **Wire both uses** behind dev switches: `field=off|air|surf|both`, `airgain=0.5|1` and `surfgain=1|2`.
3. **Capture** all 14 poses and both bursts for six arms: off; air at 0.5; air at 1; surfaces at 1; surfaces at 2; and both, each term at the higher of its two gains that still passes the two luma limits under "Checks before evaluation", or the lower gain if neither passes (decided from the numbers, before any judging). Also capture four held-out cameras, computed by a script before any render is viewed and written to `heldout-cameras.json`: for each of the four brightest 96 m columns of the source volume that are at least 800 m apart, a camera 150 m to the south-east, 30 m above the ground, looking at the column 20 m above the ground; if blocked, turn 90° around the column until clear.
4. **Judge blind, in both orders:** each arm against off, on that arm's target poses (by the rule above) and the held-out cameras. One more judge pass over the remaining poses looks only for clear losses.
5. **Measure cost:** `--stats` for the lighting and fog passes at A1, A4, A6 and G3, and three alternating bench pairs.

**Go / no-go:**
- Go with the best arm that wins at least 2/3 of its targets in both orders, with no clear loss elsewhere. The arm and its gains are then fixed.
- If no arm passes and the judges' reasons are light leaking through buildings or light that looks flat, build plan steps 1 and 4 (roof test and direction), which take one more day, and repeat once.
- If no arm passes for any other reason (for example "hazy", "washed out", "shows bare terrain"), stop.
- The bench average may rise by at most 0.25 ms.

## Implementation plan
Files: a new module `cityfield.js`; small additive changes to `renderer.js` (lighting pass), `fog.js` (one term in `medium()`), `terrainLamps.js` and `terrainBank.js` (expose lamp positions), and `main.js` (one entry in the module list, after `lightshow`, so that every module's static lights exist). No file in `eval/` changes.

**Random streams:** none are touched. The bake reads finished data and draws no random numbers.

### Grid
- **Area:** the bounding box of all districts that are not gardens, plus 300 m, computed from `DISTRICTS` (today: x from -4,050 to 4,360, z from -3,750 to 2,350).
- **Cells:** 12 m columns (704 × 512), 12 layers that follow the terrain. Layer k covers heights `4·(1.55^k - 1)` to `4·(1.55^(k+1) - 1)` m above the ground: 0-2.2 m, 2.2-5.6 m, ..., up to 765 m. Layers follow the terrain so that hillside streets get the same resolution as the riverside.
- **Stored result:** two `rgba16float` 3D textures and one 2D map.
  - `fieldA`: rgb = light arriving at the point from all directions; a = share of the sky that is visible (stored, not used in this version).
  - `fieldB`: xyz = mean direction the light comes from; its length says how one-sided the light is.
  - `fieldBase`: ground height of each column.
- **Memory:** about 70 MB (GPU). During the bake about 130 MB more, freed afterwards.

### Bake (compute passes in `cityfield.init`, before the first frame)
The module finds the buildings module in `ctx.modules` and binds its part buffer; it calls `ctx.lights.flush()` first so the light buffer is on the GPU.

1. **Roof map.** A 4 m map over the same area (2,112 × 1,536): terrain height, raised to the top of every part that is not a prop and is at least 6 m high and 6 m wide (one thread per part walks the cells under its rotated footprint and takes the maximum, in fixed point).
2. **Sources.** Fixed-point sums into a buffer, as `fog.js` already does for its light splat.
   - **Parts:** one thread per part. For each side face, the mean emitted radiance times the face area, added to the cell 6 m in front of the face, at one point per 12 m of face length and per layer. The mean radiance uses the same constants as the facade shader's distant path:

     | Part | Mean emitted radiance |
     |---|---|
     | Residential, office, glass | average window colour × lit share × window area share × intensity × 0.5 (the `farE` formula) |
     | Hongyadong timber, plaster, lacquer | gold × param × 0.4 × window area share |
     | Shop podium | 0.35 × shop light colour over the lowest 4.6 m; upper floors as residential |
     | Emissive trims, lanterns | colour × param |
     | Lit crowns, crown wash, edge strips | colour × param × 0.3; two 0.45 m strips per face at accent × 3 |
     | Flood-lit stone | albedo × warm × 0.4 |
     | Everything else | none |
   - **Static point lights:** each adds 25% of its colour (the light it puts back into the scene after one bounce). Lights with radius 0 are skipped; at load this removes the reserved dynamic ranges (lamps near the camera, lasers, boats, trains).
   - **Street and bank lamps:** every lamp position adds 25% of the colour its real light uses when it is near the camera (`_emit` in `terrainLamps.js`: intensity 95). The lamps are static even though their real lights are assigned per frame. This needs the two lamp modules to expose their position arrays (an additive change).
   - **Not included:** light-show LED facades and lasers, because they change with time. LED towers still contribute their static windows, edge strips and crowns.
3. **Filter levels.** Resolve the sums to a 3D texture with 5 mip levels (box filter).
4. **Gather.** For every cell centre that is not inside a building or the ground:
   - 32 directions (8 around × 4 elevations: -15°, +10°, +35°, +65°);
   - 8 steps per direction at 9, 15, 24, 38, 60, 95, 150 and 240 m, reading the source at the mip level that matches the cone width at that distance;
   - stop a direction at the first step that lies below the roof map;
   - sum `source × step length × (4π / 32)`: this gives the same value a point light of that output would give at that distance;
   - also keep the luminance-weighted mean direction, and the share of upward directions that reach 240 m unblocked.
5. **Fill.** Cells inside buildings take the average of their open neighbours (two passes), so that filtering near walls does not darken the result.
6. **Run in pieces.** One dispatch per layer per band of 64 rows, with `await device.queue.onSubmittedWorkDone()` between them, so no single submission runs long enough to trip the GPU driver's time limit. Then destroy the working buffers and hand the three views to the renderer and the fog module, which rebuild their bind groups. Until then both bind 1×1×1 black textures, so `--query disable=cityfield` gives main's image.

### Use
- **Coordinates:** from a world position, `uv` = position in the area; the layer coordinate is `log(h / 4 + 1) / log(1.55) / 12` with `h` = height above `fieldBase`. The field fades to zero over the last 200 m of the area.
- **Air (`fog.js`, `medium()`):** `Li += fieldA.rgb × w × tune.field`, with the same soft knee the glow grid uses. The weight `w` is the phase term the point-light halos already use (`0.45 + 0.55 × phase`), evaluated for the field's mean direction `fieldB` and blended toward 1 (the average over all directions) as the light becomes less one-sided. Three more bindings in the march layout. `fogAmbientLi` is not changed, so `rain.js` treats the new term like nearby lights.
- **Surfaces (`renderer.js`, lighting pass):** three more bindings in `lightLayout`.
  ```wgsl
  let Ps = P + n * 7.0;                                   // read the field in the open air in front of the surface
  let A = textureSampleLevel(fieldA, sampClamp, fieldUVW(Ps), 0.0);
  let B = textureSampleLevel(fieldB, sampClamp, fieldUVW(Ps), 0.0).xyz;
  // even part: a surface gets a quarter of light that arrives from all sides; one-sided part: cosine to the mean direction;
  // a small floor stands for light bounced off water and wet ground, which the field does not trace
  let shape = 0.25 * (1.0 - length(B)) + max(dot(B, n), 0.0) + 0.08;
  col += diffC / PI * A.rgb * shape * ao * FIELD_GAIN;
  ```
  Foliage uses the wrapped cosine the pass already uses for it. Water is drawn in the forward pass and is not changed; it reflects the newly lit surfaces through the existing reflection pass.

### Checks before evaluation
- Both builds succeed; `functional.mjs` 18/18; no WebGPU errors.
- With the field switched off, `pixdiff --noise` against main shows no changed tiles on all 14 poses.
- Luma limits: the frame-mean 8-bit luma of A4 (the pose with the best mood) rises by no more than 3%, and no pose rises by more than 15%.
- A top-down dev view of `fieldA` at street level shows no light inside building footprints and no bright cell behind a tower on the side away from the source.
- `burst-u12` and `burst-u62`: no flicker and no moving bands in the halos.
- Load time is reported; the bake must stay under 3 s on the target machine.
- All dev switches are compiled only into the dev build.

## Cost
- **Effort:** one implementer, about 4 days: quick test 1 day, full bake 2 days, checks 1 day.
- **GPU, per frame:**
  - **Lighting pass:** one 2D and two 3D texture reads and about 25 arithmetic operations per lit pixel. Estimate +0.10 to +0.20 ms.
  - **Fog:** three reads per evaluated froxel (about 0.9 million per frame). Estimate +0.02 ms.
  - **Capped at +0.25 ms** on the bench average by the stop rule. These are estimates from counts, not measurements; quick-test step 5 measures them.
  - **Where the time comes from:** the existing headroom (about 9.8 ms against the 11 ms gate; p99 about 11.7 and worst frame about 15 are far from their limits).
- **Load time:** one bake of roughly 1-3 s (up to about 1.1 billion volume reads). If it is over 3 s: 16 m columns, or 16 directions.
- **Optional, separate step: return budget from the lighting pass.** This does not change the image and can be split out as its own change.
  - **What is slow:** in the lighting pass every 16×16 tile walks the whole light list (`for (var i = li; i < lightCount; i += 256u)`), transforming each light to view space and testing it against the tile. That is 14,400 tiles × about 5,000 lights, about 72 million tests per frame.
  - **Estimate:** 0.4 to 1.0 ms of the 3.5 ms pass, from operation counts. This is not measured.
  - **Measure first (1 hour):** a dev switch that sets `cnt = 0` before the shading loop, compared with a light count of 0. The difference is the cost of the tests alone.
  - **The change:** one compute pass over the lights writes the view-space position and radius of each light that touches the view, and appends it to the lists of the 160 px blocks (16 × 9) that its screen bounding box overlaps. Each tile then walks only its block's list, with the same tests as now. A block list that overflows makes its tiles fall back to the full list.
  - **Check:** `pixdiff --noise` against main shows no changed tiles (lights are already summed in an order that varies from frame to frame, so results match to rounding).

## Risks
- **Haze may read as washed out.** The engine's authors kept the existing glow low and local on purpose (comments in `fog.js`: "must not wash out the haze", "must not light up the sky"). The field is local by construction, but a strict judge may still prefer the crisp black sky. The quick test has an arm without the air term for this reason.
- **Lit surroundings may expose weak geometry.** The "black wedge" in A3 and the forest bands are simple shapes; lighting them shows that. If judges name this, the surface arm fails and only the air arm can ship.
- **The embankment below the Hongyadong stack gains little.** It faces the river, and the stack is behind its plane, so only the small floor term reaches it. The quay deck, stilts, hill and tower bases gain much more. A different generator is working on the riverbanks; this idea lights whatever stands there.
- **Ties.** At gain 1 the effect beside ordinary towers is small by design. If the measured target list is short, adoption rests on two or three poses.
- **12 m cells.** Light can leak through walls thinner than a cell, and a narrow street is one or two cells wide. Reading the field 7 m in front of the surface and filling solid cells reduce this; the dev view checks it.
- **Not updated by the light show.** LED facades and lasers light nothing through the field. A second small field scaled by show intensity is a possible follow-up, not part of this idea.
- **Emission is an estimate.** The bake uses mean values per part, not the exact shader. This is acceptable for soft light, but a facade whose look changes later (for example through I-023) keeps its old mean until the table is updated.
- **Load time, memory and driver limits.** The bake adds 1-3 s and about 70 MB. A long compute submission can trip the driver's time limit, hence the pieces in step 6.
- **Citywide change.** Every pose changes a little. One clear loss on a non-target pose blocks adoption.
