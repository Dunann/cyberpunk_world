# I-015 deviations from the spec (and from the I-011 base it modifies)

Branch `idea/I-015`. Code: `Opus55/source/src/buildings_stilts.js` (new), `buildings_landmarks.js` (old `stilts()` removed, the new generator called instead), `buildings_wgsl.js` (new material ids and shader branches). `buildings.js` is untouched.

## Site and level count (fix 1)
- The cliff rule walk gives 516 m (z −380 to +110). The 480 m clamp trims the end with the lower crest, one station at a time; that removed 7 stations (28 m) at the north end (crest 64–72 m) and 2 stations (8 m) at the south end. The complex runs from (321, 99) to (171, −357).
- Level count per station: `floor((crest − 7)/7.2)`, eroded over ±2 stations, adjacent runs differ by at most one level, runs shorter than 3 stations merge into the lower neighbour. Result: 12 levels in the middle, 8–11 towards the ends.
- **Added:** both ends also step down by one level every 8 m, to 3 levels (arcade plus two levels) at the end pavilion. Without this, each end was a single vertical cut through all levels (seen on the first held-out renders).
- **Changed:** the gallery depth `g` is smoothed over ±6 stations. Computed per station, `g` jumps where the level count changes, which kinked the level fronts by up to 4 m between neighbouring stations.
- Gentle ends: the depth rule caps units at 20 m. Instead, galleries widen into terraces (fronts are pushed inland so that no unit is deeper than 20 m from the sectioned rock). Units can still be deeper where the real ground under a unit's rear edge is lower than the smoothed section. Each unit is extended until the ground at its rear edge reaches its top. The maximum depth is in the `stats.maxDepth` output.

## Structure
- **Facade and core blocks.** Each deep unit is a 6 m facade block on its own chord, plus a core block behind it on the level's shared core line (6 m behind the level front). This stops neighbouring units from meeting in wedges deep inside the stack.
- **Underpinning.** At the stepped ends the terrain falls away along the bank, so a unit's rear can stand on neither rock nor the level below. In those places a timber mass (WOOD, role `underpin`) is built down to the ground under the unsupported part. There are 87 of these, mostly hidden, and they count as support like rock.
- **Toe (fix 3).** Level 0 is an open braced frame everywhere along the bank. Column rows stand 3.4 m apart inland and 3.2 m along the bank, on stone footings, and all columns stand behind water distance 7 (the promenade ends at 6.2). Front-row piers carry lanterns, and alternate front bays are braced. Under the deck, where the rock comes within 4 m of the deck, a lit timber shop wall closes the undercroft and carries the deck back to the rock.
- **Tower bays.** Each is one block per level, aligned to the bank normal rather than to the chord of the front line, so its sides run inland like the units beside it. Eaves on every floor; a pavilion with a double hip roof on the plaza.
- **End pavilions (fix 2).** Each end gets a two-level tower bay standing on the deck, with the pavilion roof. Galleries return around every exposed end (side eaves, glow strips, railing), and the plaza ends at a balustrade.
- **Stair bays.** There are only 3, not about 7. A stair bay needs a level-count run of at least about 9 m. The end tapers, the Raffles tower zone, the lift and the tower bays leave no such space at the other candidate positions. Each stair bay is a 6.5 m recess through all levels with two switchback flights per floor (leaned slabs with painted treads, plus 10 step props per flight), landings and a lit slatted back panel. Each also has a river-walk stair from the promenade up through an opening in the level-1 deck.

## Lift (fix 4)
- A vertical 3 × 3 m glass shaft beside the 28° stepped face can bridge to only about two levels within 6 m. The shaft therefore stands inside the stack, and the units of the lower levels are split around it.
- Its front emerges three levels below the top. From there it rises in the open, against the stack, to 6 m above the plaza, with a machine room, a vertical sign slot and a lit cabin.
- Bridges are 0.4 m (level N−1 gallery) and 4.1 m (plaza), both at most 6 m. It is at z ≈ −119, the station nearest the middle that is clear of other features.

## Raffles tower 4 (fix 5)
- The generator collects solid landmark parts that reach into the stack as obstacles. Tower 4's base is at 80 m, above the stack in front of it, so it gets:
  - a timber podium from the level-8 roof (71.8 m) up to its base, which units may bury into, like rock;
  - a timber skirt 0.3 m in front of each river-facing face, from the lowest roof under it up to plaza level, carrying the eave lines and glow strips across, with the plaza balustrade on top.
- Units of levels 9–11 that meet the tower or the skirts are shortened, narrowed or split around them.

## Glow, materials, numbering (fixes 7, 8)
- Every pent eave has a separate emissive strip, 0.32 m tall, along its lower front edge. The strips are counted in the part total below.
- New material ids replace the flag bits: `MASONRY 21` (winW 1 = stair treads), `PLASTER 22`, `LACQUER 23`, `SHOPWOOD 24` (open shopfront on the lower floor), `RAIL 25`.
  - The `DECK` flag was not needed: the roof caps of WOOD and its variants are drawn as wet planks.
  - A WOOD part with param > 2 has a lantern-lit underside; the level-1 deck uses this.
  - No flag bits are used.
- Weep holes in the masonry were left out. Masonry is only footings, stair flights and landings, and planters (1–2% of the complex's screen area).

## Clearance solver and audit
- **Clearance.** Units are checked against obstacles (landmark parts, the lift shaft, skirts), then shortened (face unit), narrowed or split.
- **Dressing clearance.** Eaves, strips, railings, lanterns, oriels and plaza props are checked through a spatial hash against everything already placed, including the levels above, because dressing runs after all bodies. Anything that would cut into another group is not placed (34 pieces).
- **Audit (`?hydaudit`).** It runs a full pairwise check of all 9.4k registered pieces through a 4 m hash, and a support check on load-bearing pieces. Support counts only if it comes from below: rock, a carrier top within 0.35 m, or a column under a deck or landing. Overhang of up to 1 m is allowed.
- **Designed joints the audit does not count:**
  - parts of one unit;
  - neighbouring units of one level: up to 1 m where facades meet; core blocks, which lie at least 6 m behind the fronts inside the stack, at any depth;
  - units butting against a tower bay's sides from its base level up;
  - burial into a podium or an underpinning block.
- 4,784 such joints are reported separately.

## Other
- **Vegetation (fix 6).** The footprint plus 10 m is pushed to `world.shared.gardenReserve` in 20 m segments.
- **Plaza collider (fix 9).** The plaza is the top units' roof, so the bodies' colliders cover it. Deck parts (0.6 m) get colliders through `world.addCollider` directly.
- **Prop cap (fix 10).** 1,000, 3,500 or 6,500 props by quality, counted on the complex's own counter. Step props are added last, so the cap drops them first.
- **Lights.** 38 at priority 3, below the I-011 figure of about 60: undercroft every 32 m, tower uplights, stair bays every third level, plaza every 24 m.
- **Random numbers.** The complex uses its own fixed seed, `rng(15015)`. Removing the old `stilts()` removes its calls on the shared landmark stream, so the steppe landmarks generated after it (gerdome huts, registan minarets, market stalls) get different random values. Districts are not affected, because they use per-lot seeds. Of the eval poses, only G3 sees the steppe, at about 4 km, where these few-metre differences are below a pixel.
- **Dev tools.**
  - `?hydmask` repaints the complex in flat colours (magenta, with masonry green) and every other building black. It was used to measure the screen region, masonry share and glow.
  - `?hydaudit` stores the audit in `world.shared.landmarkSites.stilts.audit`.

## Quick test results (implementer, not the official evaluation)
- **Audit (`?hydaudit`):** 0 overlaps and 0 unsupported pieces out of 9,363; 4,784 designed joints. The complex has 10,942 parts, of which 3,721 are props and 257 are masonry, plus 38 lights.
- **Masonry share** of the complex's screen area: 1.2% (H1), 0.7% (H3), 1.6% (H2).
- **Glow, mean luminance (0–255)** over the complex region, I-015 against baseline. "Same region" is the old complex's screen region measured in the I-015 image.

  | Camera | I-015 | Baseline | I-015 in the old complex's region |
  |---|---|---|---|
  | H1 | 105.2 | 97.9 | 100.4 |
  | H3 | 104.6 | 99.1 | 104.9 |
  | H2 | 99.0 | 96.4 | 98.7 |

- **`functional.mjs`:** 18/18.
- **GPU: not settled.** Up to three other implementers' browsers shared the GPU throughout; under that contention even the baseline read 25–31 ms on average.
  - Only one back-to-back pair ran with no other browser seen. Baseline: average 9.51, p99 11.45, worst 13.89 (PASS). I-015: average 10.12, p99 22.22, worst 23.90 (fails on p99). Its lighting pass p99 was 10.9 ms against the baseline's 4.3.
  - Static probes at fly-through positions near the complex (u 0–0.13) show I-015 at +0.1 to +0.5 ms over the baseline, with no position spiking.
  - Whether the p99 rise is real or contention is unresolved. It needs a fly-through bench on a quiet GPU.

## Round 2 (code-review fix round 1)

Commit e59c948 (code) on `idea/I-015`. Every item of `code-review.md` is addressed below.

### Random-stream isolation (serious 1)
Nothing outside the complex changes any more. The mechanism:
- **Shared landmark stream and prop count.** `buildings_landmarks.js` `earlierStiltsFootprint()` replays the removed `stilts()`: the same seed search, the same 17-column bank walk and the same tier loop (terrain queries only), drawing `R()` exactly as before (1 per column, 4 per tier). It also advances `B.props` by the earlier complex's props (8 stilts per column, 4 lanterns per tier), so the shared 20,000-prop budget at low quality fills exactly as in the baseline (this also settles the minor point about `B.props`). gerdome, registan, the market and its sign slots are identical to the baseline.
- **Part indices.** `Parts.add` gives a part without a seed the seed `(index * 7.31) % 997`, so every part after the complex depends on the part count (the review did not list this; round 1 changed the seeds of all unseeded district parts). `hongyadong()` now returns its part records. `placeComplex()` adds the first N of them at the complex's place in the order, where N = the earlier complex's part count (1,306), and `finishComplex()` (called at the end of `generate()`, after the walkways) appends the rest. Every non-complex part keeps its index.
- **Sign slots.** The complex's slots are collected and appended after every other slot (`finishComplex()`), tagged `own`. In `signPlace.js` the light candidates of `own` slots are tagged; `signs.js` selects the city's sign lights from the untagged candidates with the unchanged budget (2,150), and the complex's from the tagged ones with their own allowance of 64. The complex's signs also get their own cells in `Cells` (otherwise they would change the bounds, and so the near/far tier, of the city's sign cells that share a 160 m cell with the complex).
- **Light budget.** The complex's lights are tagged (`l[9] = 1`) and do not count toward `LIGHT_BUDGET`; the rest of the city gets `LIGHT_BUDGET − 34` (the earlier complex's 34 lights), so exactly the same shuffled shop-spill lights survive as in the baseline, in the same order.

**Proof** (`tools/hyd-identity.mjs`, dev builds of the baseline c43ed1f and of e59c948, quality high): see "Identity check" below.

### GPU p99 (serious 2)
See "Bench" below.

### Art (rule-based, all from the complex's own seed 15015; tuned only on the held-out cameras H1–H6)
1. **Occupancy per unit.** Each family draws a mix of dark (shuttered), dim, normal and bright units (dark 6–28%, dim 18–32%, bright 4–24%; quiet families have more dark units, lacquer families are quiet, shop families busy). A unit takes the state of the unit below it 45% of the time and of that unit's neighbour 15% of the time, otherwise draws from its family's mix, so dark and lit units form vertical and diagonal runs. The state is the facade's `param` (0.06, 0.5, 1.15–1.35, 1.75); the shader now takes the share of lit windows (2–95%), their brightness and the glowing beam lines from it. Dark units also get no lanterns, no eave strip and no lit railing; bright ones get red lanterns every 2.2 m. Result over the whole complex: about 21% dark, 20% dim, 40% normal, 18% bright units.
2. **Fewer gold lines.** The glow strip is kept on the roof-edge eave only, with intensity 0, 1.2 or 2.4 per family (30/40/30%). The mid-level pent eave, and any eave without a strip, gets a lighter ridge-tile edge (non-emissive) instead, so the tile colour reads. **Deviation from spec fix 7** (strips on every pent eave), as the review asked.
3. **Roofs.** Top units carry a crest per family: a hip roof over the facade block (35%), a pavilion storey with its own hip roof (25%), a two-storey pavilion (10%), or a flat terrace with a balustrade (30%). A terrace unit at the exposed end of a run (every level-count step and the stepped ends) gets a hip roof. Roof-edge eaves of 55% of families have upswept corners. **Not done:** gable ends (the part system has no ridge or gable profile; only hip roofs, `prof: 4`).
4. **Vertical rhythm.** Tower bays every 35 m (11 placed; 3–8 levels). The projection is drawn from 2–5 m but limited to the gallery in front minus 0.5 m, measured from the front of the unit below (with its family offset), so in practice it is 0.3–3.3 m at the tower's base; because the stack steps back 2.4–3.8 m per level and the tower's face is vertical, the tower stands 10–25 m proud of the stack at its top. A tower is skipped where a landmark part, podium or skirt reaches into its volume. Crowns: a pavilion, a double hip roof or one tall hip roof, crowned by a pavilion, a double hip roof or one tall hip roof; walls lattice, plaster or lacquer with their own occupancy. Dark recessed slots (2–4 m wide, set back 2.2 m, a lantern on every other level) at about half of the family boundaries (3 placed; a slot moves up to 3.5 stations along the bank when a feature is in the way). Stair bays now need 100 m between them (towers are too dense for the old "every gap over 36 m" rule).
5. **Materials.** Full lattice (WOOD) on 40% of families; plaster 25%, lacquer 15%, shop 20% (shop families' upper floors are plaster or lacquer). Plaster and lacquer walls use a new small-window style (window grid style 6: 36% x 42% of a cell instead of 64% x 56%), so the wall reads.
6. **Gallery depth and dressing.** Family front offset ±1.5 m. Where families meet vertically, a unit is pushed inland just enough to keep at least `G_MIN` (1.6 m) of gallery on the unit below, so it never overhangs it. Upper-floor oriels project 1.2–1.8 m (12% of units), balconies 1.2–1.7 m (10%), both limited to 0.6 m short of the gallery's edge. **Deviation:** no two-storey oriels; one projecting from the gallery floor would block the gallery. Greenery on 15–35% of gallery fronts per family (potted shrubs and a planter of trailing plants on the railing). Vertical shop signs on 60% of shop fronts and 12% of other lit units of levels 1–5, 0.9–1.5 x 2.6–4.8 m, hanging 0.95 m out over the gallery so they clear the eaves.
7. **Skyline.** Via the crests (item 3) and the tower crowns. **Deviation:** no family drops its top level; that would leave a 7.2 m rock face below the crest plaza.
8. **Ends.** The ends step down two levels every 16 m (`END_STEP` 16), with a hip roof on the top unit at each step.

### Moderate and minor
- **`devQuery`** checks `__DEV__`; in `index.html` it compiles to `() => false`, so `?hydmask` and `?hydaudit` do nothing in production.
- **Audit.** Landmark parts the complex was fitted around are now in the audit (2 obstacles), and so are all props (steps, plaza lamps and trees have roles). No blanket exemption for podiums or underpinning. Designed joints are reported by category with the deepest of each (see results). Tower joints are limited to body, core and tower pieces under 1 m; the stack's core blocks are clipped against tower blocks (the core line is not parallel to a tower's sides), and the dressing clearance check no longer ignores podiums.
- **Underpinning** is now built per band of unsupported samples (0.9 x 0.75 m grid, floors within 0.5 m), from just below the floor under it (rock or the roof of a lower piece) instead of down to the lowest ground under the whole unit, inset 0.25 m from its sides. Tower underpinning runs after the stack is built (in round 1 it ran before the units under the towers existed, so it went down to the ground through them; the blanket exemption hid that).
- **Undercroft lights:** one in the deck segment containing each multiple of 32 m along the bank (round 1 placed one every 96 m).
- **Comments:** `FACADE`/`END_STEP` comments fixed; `stats.features` on its own line.
- **`stats.maxDepth`:** the deepest unit is 24.3 m (rear extended until the real ground under its rear edge reaches its top, see "Site and level count").
- **Prop budget:** see stream isolation (the earlier complex's props are still counted in `B.props`).
- **Narrow units:** the plaza is now a separate paving part per top unit; paving parts narrower than 2 m add their own collider.
- **Plaza (perf review):** the plaza is paved (TILE, dry: wet 0.35, rough 0.9, below the SSR threshold) instead of wet planks; galleries keep wet planks. Plaza foliage is an octagonal cone (no curved `prof: 2` mesh); plaza lamps, lamp heads, planters, trees and gallery plants are detail props. Dressing was not moved off the bench path.

### Results (implementer, not the official evaluation)
All files: `Opus55/source/out/I015/r2/` in the worktree (images, bench reports, traces, identity report).

**Identity check** (`tools/hyd-identity.mjs`, baseline c43ed1f against e59c948, dev builds, quality high):

| Data | Baseline | I-015 | Result |
|---|---|---|---|
| Building parts | 133,904 | 144,984 | the 132,598 parts outside the complex are identical, index by index (hash 8f9320cc4663e055 in both); the baseline's other 1,306 parts (the earlier complex's indices) all lie in the complex's footprint box; the complex's remaining parts start at index 133,904 |
| Sign slots | 58,627 | 58,715 | the first 58,627 identical (hash 2042c224c06ff867); the 88 extra are the complex's, all in its box |
| Signs | 83,457 | 83,545 | the first 83,457 rows identical (hash c643218e6b143c14); the 88 extra are the complex's, all in its box |
| Sign lanterns | 14,806 | 14,806 | identical |
| Lights | 5,033 | 5,110 | 4,999 shared, in the same order; only in the baseline: the earlier complex's 34; only in I-015: 111 (the complex's 47 and 64 of its sign lights). All of them in the complex's box |
| Colliders | 13,338 | 14,598 | 13,143 shared; the 195 and 1,455 that differ are all in the complex's box |

Footprint box: x 88–364, z −398–144 (the complex's part centres plus 40 m).

**Pixel check.** Captures are not frame-deterministic even with `freeze` (TAA jitter phase and animated LED chases depend on the frame count since load), so two baseline captures differ too. With traffic, rain and the light show disabled, at 1280x720:
- Far cameras (steppe landmarks, market, hillside, CBD, behind the complex): mean absolute difference baseline against baseline 0–4.4 (0–255), baseline against I-015 1.6–4.0; the difference images show only edge and LED-phase noise, no changed object, sign or window.
- Held-out cameras H1–H6, outside the complex's mask dilated by 40 px: the remaining differences are the complex's own reflection in the river, the earlier complex's region (outside the new mask), its bloom, and the same low-level noise.
The data hash above is the exact proof; the pixel check only confirms nothing else changed visibly. The review's B2/A4 check was done on these non-eval cameras instead, because the instructions forbid capturing eval poses.

**Audit (`?hydaudit`):** 12,386 pieces plus 2 landmark obstacles; 0 unsupported pieces. 300 overlaps, all hidden inside the stack or the cliff: 292 involve underpinning masses (deepest 1.68 m, body/underpin), 8 are tower blocks against a neighbouring unit's facade block (up to 2.08 m, at the rear of the facade block beside the tower), 6 tower/paving (0.15 m). Designed joints by category (count, deepest): facade 2,771 (0.77 m), tread 1,246 (0.26), dressing contact 297 (0.30), underpin footing 279 (0.63), core 228 (1.14), tower side 33 (0.91), podium burial 11 (7.2), podium on obstacle 1 (0.4). Round 1's "0 overlaps" came from exempting podiums, underpins and tower bays at any depth.

**Complex:** 12,386 parts (3,645 props, 225 masonry), 47 lights, 565 units (121 dark, 113 dim, 228 normal, 103 bright), 11 tower bays, 3 stair bays, 3 dark slots, 1,992 underpinning masses (most small, inside the cliff), deepest unit 24.3 m. Families of this seed: plaster/roof, plaster/roof, plaster/pavilion, lattice/double, lacquer/roof, shop/pavilion, plaster/roof, lattice/roof, lacquer/roof, lattice/terrace, lacquer/terrace, plaster/pavilion.

**Masonry share** of the complex's screen area: 0.04–1.1% (H1–H6).

**Glow**, mean luminance (0–255) over the complex's mask, I-015 against the baseline image in the same region: H1 69.3/53.0, H2 66.8/54.9, H3 75.9/58.0, H4 46.6/47.7, H5 76.7/65.0, H6 77.3/53.6. H4 looks down on the plaza, where the baseline region also holds parts of lit towers behind it.

**`functional.mjs`:** 18/18.

**Bench (full `tools/bench.mjs`, 2560x1440, each pair run under the shared GPU lock).** Runs whose TAA p99/average is above 1.15 are rejected.

| Run | Time | Avg | p50 | p99 | Max | TAA p99/avg | Verdict |
|---|---|---|---|---|---|---|---|
| base | 05:03 | 10.03 | 9.55 | 20.36 | 49.86 | 2.99 | rejected (GPU shared) |
| I-015 | 05:05 | 10.53 | 9.58 | 24.64 | 49.81 | 3.18 | rejected (GPU shared) |
| base | 05:09 | 9.86 | 9.49 | 20.20 | 52.68 | 2.59 | rejected (GPU shared) |
| base | 05:36 | 9.53 | 9.40 | 11.54 | 13.37 | 1.052 | accepted |
| I-015 | 05:37 | 9.59 | 9.46 | 11.70 | 14.34 | 1.051 | accepted, PASS |
| base | 05:46 | 9.52 | 9.37 | 11.52 | 13.74 | 1.053 | accepted |
| I-015 | 05:48 | 9.64 | 9.50 | 11.77 | 13.19 | 1.055 | accepted, PASS |

I-015 is +0.06 and +0.12 ms on average over the baseline next to it (limit +0.3), p99 +0.16 and +0.25 ms.

**Where round 1's p99 came from** (`tools/bench-trace.mjs`, per-frame GPU log with the camera position). The round-1 build (bb2de29) on a quiet GPU: avg 9.63, p99 11.79, max 13.20, TAA p99/avg 1.05, the same as the baseline run next to it (9.55 / 11.52 / 13.52). Its slowest 1% of frames fall in the same windows as the baseline's (t 4–8 s near the complex, about +0.3 ms, and t 13–15 s over the western hillside). The same build with another job on the GPU: p99 24.98, TAA p99/avg 2.84, with every pass (TAA included) inflated 2–3x in the same frames. So round 1's p99 failures were GPU contention, not the complex. The plaza changes above were made anyway, because they are better material rules, and dressing was not moved off the bench path.
