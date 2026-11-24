---
id: I-026
title: Hongyadong set dressing - a set decorator's pass of hangings, traditional shop signs and gallery extras on the built stack
status: proposed
direction: Borrow from another field (film set decoration: dressing a built set in layers by a dressing plan)
family: set dressing on an existing landmark: layered hangings, typed signage and extras, density tied to occupancy
parent: I-015 (builds on its stack; does not change its structure)
proposed_by: idea generator
date: 2026-11-24
---

# I-026: Hongyadong set dressing

## Idea
In film, construction builds the set and then the set decorator dresses it. The work follows a dressing plan, in layers:
1. **Hangings and practicals:** lanterns, string lights, wall lamps, all practical light sources.
2. **Signage and graphics:** shop plaques, cloth banners, posters.
3. **Action props:** tables, stools, parasols and goods where people "live".
4. **Background extras.**

Dressing density follows the story of each part of the set: busy shop rows are dressed heavily, shuttered houses are left bare. Neighbouring bays are deliberately dressed differently so the eye never finds a repeat.

I-015 built Hongyadong's structure well: it is grounded, stepped and audited. But its dressing is one layer of small items:
- 0.44 m lanterns every 2.2 m on bright units, which read as a grid of pink dots in A2;
- one sign form for all 88 complex signs, the small coloured rectangles both critics call out;
- no people on the galleries.

This idea is the decorator's pass over the finished stack, with no change to its structure:

| Layer | What it adds |
|---|---|
| Hangings | Strings of full-size red and gold lanterns (0.75-1.1 m) sagging along the lit eaves, and large feature lanterns (1.8-2.6 m) on tower bays, stair bays and end pavilions |
| Signage | Three traditional sign forms (lacquer plaques, cloth shop banners on bracket poles, lantern-column signs) mixed with a minority of the existing neon blades, with a no-repeat rule between neighbours |
| Action props | Tea tables with stools, and parasols on wide galleries and on the crest plaza |
| Extras | People standing at the gallery rails and walking the galleries and the plaza |

All density follows the occupancy that I-015 already assigns to each unit. Dark units stay bare, so the dressing reinforces the existing pattern of lit and dark runs instead of covering it evenly.

## Why it might work
- **It answers the critics' Hongyadong findings directly.**
  - Critic 1's change #6 is "Break up the Hongyadong stack (roof forms, floor heights, **lanterns, varied signs, crowds**)", and three of its five items are dressing.
  - Critic 1's major defects at A2 are "identical small sign rectangles" and the "identical window/balcony module" at A1 and A2.
  - A2 scores 5.25 and A1 5.5 (two-critic means). These are the lowest Zone A poses apart from A3.
- **The stack fills most of the frame:** about 80% of A2 and about 45% of A1 (from the current-best images; the exact share comes from `?hydmask` in step 0).
  - A2, about 95 m from the facade: a 1 m lantern is about 23 px tall, a 3 m banner about 70 px, and a standing person (crowd LOD2, which covers up to 210 m at q2) about 40 px.
  - A1, about 250 m: a lantern is about 9 px and a banner about 27 px. The strings read as sagging lines of red light along every lit eave.
  - These are exactly the sizes at which the current dots and rectangles read as "repeated module".
- **It works with the real place.** Hongyadong's night identity is red and gold lantern strings hung along tiered galleries, and calligraphy plaques and cloth banners over the shops. The brief is "Chongqing core", and this is the visual signature of that site, not a generic cyberpunk addition.
- **It is cheap and the systems exist.**
  - The sign module already has an instanced, swaying lantern mesh (`lanternMesh`, signs.js:292). I-016 already uses it with cells of its own (park lanterns).
  - The complex already appends its own sign slots in a tagged range (`own`), with its own light allowance.
  - The complex has its own prop counter and cap.
  - The crowd already has standing agents (mode 2) and pacing agents (mode 1).

## What's new about it
- **Closest existing idea: I-015**, whose items 1 and 6 added occupancy families, small lanterns, vertical shop signs, plants and laundry.
- **The difference is the method:**
  - a separate layered dressing pass over the finished stack;
  - dressing objects at the scale they really have (full-size lanterns, banners that hang off the facade, plaques over shop doors);
  - typed traditional sign forms instead of one rectangle;
  - extras on the galleries;
  - an explicit no-repeat rule between neighbouring units, measured by a repetition count.
- **Not a rebuild** (the crowded I-004, I-011 and I-015 family): no unit, level, roof, gallery or support changes, and the I-015 audit must still report 0 unsupported pieces.

## Target poses (declared by rule, before any implementation)
- **Rule:** on the current best (main = runs/I-016m source), capture all 14 eval poses with the existing dev mask `?hydmask`, which paints the complex. A pose is a **target** if complex pixels cover at least 5% of the frame.
- **Expected targets:** A1 (about 45%), A2 (about 80%), A3 (about 6-7%, borderline). G2 is about 2%, so not a target.
- The list and the shares are written to `targets.json` in this folder before any code is written, and never changed.
- **Adoption (EVAL v1 rule):** wins on at least 2/3 of the targets and no clear loss on any other pose.

**Held-out cameras (for the quick-test go/no-go only):**
- 4 river cameras by rule, seed 20261126:
  - a station index along the complex is drawn uniformly from the middle 80% of its stations;
  - the camera stands on the river along that station's bank normal, at distances 120, 200, 320 and 450 m (one each);
  - height 8-40 m, yaw toward the station ±20 degrees (seeded), pitch toward the facade mid-height;
  - reject a camera if a bridge or boat model is within 30 m of it.
- 1 promenade camera at 1.7 m on the river walk, 25 m from the facade, looking along the stack.
- The list is written to `heldout-cameras.json` before any code.

## Expected effect on the metric
- Pairwise: likely wins at A2 (the strongest case) and A1; A3 is likely a slight win or a tie; ties elsewhere.
- Critic means: about +0.5 to +0.8 on A1 and A2, on the detail and character axes. That gives Zone A about +0.2-0.3.
- The idea does not fix the window grid (the facade shader belongs to another generator), so the "identical module" complaint is reduced but not removed. Lanterns, banners and plaques cover and break up about a fifth of the facade area at A2.

## Quick test
Layer 1 only (lantern strings and feature lanterns), with all existing small complex lanterns removed.
- Capture A2, A1 and the 5 held-out cameras on main and on the candidate.
- One blind pairwise judge, both orders.
- **Go** if the candidate wins at A2 and at least 3 of the 5 held-out cameras.
- **Stop** if A2 loses: the strings read as clutter, or the lanterns hide the architecture.

## Implementation plan
All new code runs **after** the complex is finished (`finishComplex()`) and uses a new stream, `rng(0x48594431)`. It only reads the complex's unit records: front segment, level, occupancy state, family, variant, crest, and tower and stair bays. It is a new file, `buildings_hydDress.js`, called from where the complex's parts and slots are appended.

### 0. Measure and record
- `?hydmask` captures for `targets.json`; held-out cameras.
- **Repetition count**, printed by the dev build. For every pair of horizontally adjacent lit units, compare a dressing signature: (lantern string yes/no and colour mix, sign form, sign colour, extras yes/no). Report the share of adjacent pairs with the same signature.
- The I-015 baseline for the same signature (small lanterns and rectangle signs only) is also printed.
- **Target:** under 15% identical adjacent pairs, against the baseline's value.

### 1. Hangings and practicals
**Remove** the complex's existing `lantern` props (role `lantern`, 0.44 m), so lanterns are not doubled. They come from the complex's own prop counter, so the city's prop budget is not affected.

**Lantern strings:**
- On every unit with occupancy dim or brighter that has a pent or roof-edge eave on its gallery front, hang one string under the eave line, 0.15 m in front of the eave's lower edge.
- Bright units get two strings: a second row 0.9 m lower, offset by half a spacing.
- Spacing 1.3-1.8 m along the unit (per unit, from the new stream).
- Sag: y = y0 − s·(1 − (2u − 1)²), with s = 0.25-0.6 m over each span between posts.
- Ends are tied at gallery posts: every 3.2 m, or the unit ends.

**Lanterns:**
- Instances of the existing `lanternMesh` at scale 1.05-1.5. The mesh is 0.72 m plus its tassel, so they are 0.75-1.1 m tall.
- Colours: 80% red, 14% gold, 6% white paper. The colour is constant along a string, except that 1 in 6 strings alternates red and gold.
- Sway amplitude 0.5-0.8 (`L.b.z`).
- **Cord:** a thin dark prop (0.03 × 0.03 m box) along each span, drawn only within 120 m. It is sub-pixel farther away, and the lantern glow carries the line there.

**Feature lanterns:**
- One giant lantern (scale 2.5-3.6, so 1.8-2.6 m) per level on the front of each tower bay and each stair bay, and two at each end pavilion.
- One per 24 m of crest plaza front on bright families.

**Wall lamps:** small warm emissive boxes (0.18 × 0.32 × 0.12 m) on every second gallery post of lit units, below the eave strip, as complex props.

**Rendering:**
- Lantern rows are appended as a new cell group in `signs.js`, after the park lanterns, with the same instanced lantern pipeline and their own cells (`group(i) = 3`). The city's and the parks' lantern cells stay as they are.
- Draw distance 750 m, so A3 at about 450 m is included.
- No new light sources. The lanterns are emissive in the G-buffer, the bloom pass makes them glow, and the complex's 47 existing lights stay.

**Safety:**
- Every string must clear the clearance hash the complex already uses for dressing (`DRESS` roles, contact under 0.3 m). A span that would cut into another group is shortened or dropped.
- Lanterns must hang at least 2.1 m above the gallery floor below, so extras walk under them.

### 2. Signage: three traditional forms plus neon
The complex's sign slots, the tagged `own` range from I-015, plus new slots from this pass get a form by rule.

**Shop units** (variant `shop`, or shop families):
- **Plaque (牌匾):** a horizontal board over the shopfront, 2.4-4.0 × 0.7-1.0 m.
  - Black or oxblood lacquer field, gold characters, a raised gilt frame, and two small emissive lamps above it.
  - It replaces the current sign over the door. The existing vertical slot may still carry a blade.
- **Cloth banner (幌子):** a bracket pole from a gallery post, 0.9 m out over the gallery edge, with a vertical cloth 0.6-0.9 × 2.2-3.4 m.
  - Cream, red, indigo or black cloth with 2-4 dark or gold characters and a cut fringe at the bottom.
  - It sways with the lantern sway function (smaller amplitude), with previous-frame positions for motion vectors.
- **Lantern-column sign:** 3-4 lanterns stacked on one cord, each carrying one character, with a darker band painted around the lantern's waist.
- **Neon blade:** the existing look, kept for 25% of shop signs so the cyberpunk layer stays.

**Mix and no-repeat rule:**
- Forms: plaque 35%, banner 25%, lantern column 15%, neon 25%.
- No form may equal that of the left neighbour unit or of the unit below, and no colour may equal the left neighbour's colour. A form or colour is redrawn (up to 4 tries) from the new stream.

**Non-shop lit units:** 12% get a small plaque or a banner (as I-015's 12% rule), with no neon.

**Rendering:**
- In `signs.js` and `signPlace.js`, add `KIND.PLAQUE` and `KIND.BANNER` to the sign shader:
  - **plaque:** the frame, the lacquer field, and gold glyphs from the existing CJK atlas, with gold as a high-albedo metallic colour, not emission;
  - **banner:** the cloth albedo with a weave-noise value pattern, the glyphs, the fringe as a cut-out step at the bottom (no transparency), and the vertex sway.
- Lantern-column signs use the lantern instance list with a style value that tells the lantern fragment shader to draw one atlas glyph on the lantern's front.
- These forms are selected only for `own` rows. City sign rows are unchanged; prove this by row hash, as I-015 did.

### 3. Action props on galleries and the plaza
- Wide galleries (depth at least 3.2 m) of shop and bright units: one tea table (0.8 m square, wood) with 2-4 stools per 7-10 m.
- Terrace crests and the crest plaza: parasols (2.4 m, red or cream, kind 2 with taper) over a table, one per 12-18 m.
- All are complex props: they go through the clearance hash, and the complex's cap at q2 rises from 6,500 to as needed. Report the count; expect about +1,500 props in total.

### 4. Extras
**Gallery agents.** Appended after every other agent in `crowd.js`, from a separate stream `rng(0x48594432)`, so the existing agents keep their order and values:
- **Standing (mode 2):** 1 per 8 m of gallery front on lit units of levels 1 to 6, at 0.4-0.7 m from the railing, facing the river ±40 degrees. 30% of them raise a phone.
- **Pacing (mode 1):** 1 per 14 m along galleries of shop units, over a run that stays inside the unit's gallery (L = 6-12 m).
- **Plaza:** walkers on the crest plaza at the same density as hillside sidewalks (7 per 100 m).
- No umbrellas under eaves (galleries are covered), and the existing share of umbrellas on the open plaza.

**Counts:** about 500-700 agents. Report the LOD fill at A1, A2 and A3. The LOD2 capacity (3,500 at q2) must not overflow at those poses. Raise it if needed, and report the change.

**Support:** each agent stands on the gallery floor of its unit (the roof top of the level below), which is taken from the unit record, not from the terrain. The I-015 audit is extended to check that every agent's feet are within 0.05 m of a supporting deck top.

### 5. Checks
- **I-015 audit (`?hydaudit`):** still 0 unsupported pieces. New overlaps only in the "dressing contact" category, at 0.3 m or less.
- **Identity outside the complex.** The hyd-identity tool (used in I-015 and I-016) shows:
  - all main parts outside the complex identical;
  - all city sign rows identical;
  - city lantern rows and park lantern rows identical;
  - lights identical;
  - agents 0 to N−1 identical (hash).
- **Repetition count** below 15% identical adjacent pairs, printed with the baseline value.
- **Motion:** a 4-frame burst at the promenade held-out camera. Lantern and banner sway must be smooth and must not shimmer.

## GPU cost and where it comes from
The current frame is about 9.8 ms. The gate is an average of at most 11 ms, a p99 of at most 16.7 ms and a worst frame of at most 25 ms.
- **Lanterns:** about 2,500-3,500 instances of an approximately 90-triangle mesh, so 0.23-0.32M triangles when the whole complex is in view.
  - The existing small complex lanterns are removed: about 700 props, which also leave the building cull.
  - At A2 and A1: about +0.05-0.08 ms of G-buffer time.
  - The CPU cell culling is the same as for the park lanterns.
- **Signs:** about +100-150 instanced signs in the own range. The plaque and banner shader branches run only on their own pixels: under 0.01 ms.
- **Props:** about +1,500 parts in the building cull, which has about 145k parts now: about +1%, so about +0.01 ms in `bld-cull`, plus their G-buffer pixels, which are tiny.
- **Crowd:** +500-700 agents in the compute pass: negligible. LOD2 meshes in view at A2, about 400 × 511 = 0.2M triangles: about +0.03-0.05 ms.
- **Lighting, fog, SSR, post:** no new lights, and no other pass is affected.
- **Totals:**
  - Hongyadong views: +0.1-0.15 ms.
  - Bench fly-through average: +0.02-0.06 ms, since the complex is in view for part of the route.
  - p99 under +0.15 ms.
- **Stop rule:** a mean of 3 interleaved bench pairs over +0.2 ms means cut the cord props and the second string row before evaluation.

## Shared random streams
- Unchanged: the complex's own stream (its structure, existing slots and existing props, apart from the removed lantern props, are still generated with exactly the same draws); the city's building streams (9137 and others); the sign streams; the crowd stream; the traffic streams.
- New streams `rng(0x48594431)` for dressing and `rng(0x48594432)` for gallery agents are used only by this pass, which runs after everything else.
- New parts, slots, lantern rows and agents are appended after all existing ones.
- The identity check in step 5 proves this.

## Cost
- About 900-1,300 lines:
  - dressing pass, about 500;
  - sign forms in the shader and placement, about 300;
  - lantern string rows and the glyph lantern, about 150;
  - gallery agents, about 150;
  - checks, about 150.
- Compute: one eval run, 3 bench pairs and the held-out captures.

## Risks
- **Over-dressing.** Thousands of red lanterns could read as decoration noise ("Christmas lights") instead of architecture, especially at A1, where each lantern is about 9 px. Mitigation:
  - dark units stay bare, so about 40% of the stack keeps its current look;
  - colour constancy along strings;
  - the quick test judges A2 and 4 river cameras at different distances before the rest is built.
- **It does not fix the window module.** The critics' strongest complaint at A1 and A2 is the identical window and balcony pattern of the facade shader, which this idea does not touch. The judge may still see the stack as repetitive and give only slight wins.
- **Sign legibility.** Gold glyphs on dark lacquer can turn into noise at 250 m. Plaques must fall back to a plain gilt band below about 8 px per character, using the same legibility threshold as the tower text (I-014).
- **Cap pressure in the crowd.** Gallery agents compete for LOD2 slots with the promenade walkers in A1 and A2. Step 4 requires reporting the fill and raising the capacity rather than letting agents drop out.
- **Overlap with the other generators.** The facade shader and the riverbank or embankment walls are being worked on elsewhere. This idea touches neither: the dressing hangs in front of the facades, and nothing is placed on the promenade or the embankment. If another idea changes the eave lines, the strings follow them, because they are placed from the unit records.
