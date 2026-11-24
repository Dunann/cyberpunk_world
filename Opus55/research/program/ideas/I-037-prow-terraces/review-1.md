## Reviewer 1 (2026-11-24)

**How I checked it.** I re-ran the generator's projection (`run4.mjs`, `run5.mjs`, f = 1241.7 px), and its numbers reproduce exactly (A3 2.54%, G2 0.92%, A1 1.19%, A6 0.97%; halls against vault 0.84/0.93 in A3). I read `raffles()`, the complex's obstacle scan (`buildings_stilts.js:406-430`), the collider build (`buildings.js:95-100`), the light selection, `towerTops`, `buildRuns`, the crowd's collider test, the MASONRY shader branch and the vegetation clearing. I then added three checks of my own on the CPU height grid (`grid_h.bin`, 6 m):
- I ray-cast the A3 wedge polygon onto the ground and classified each hit.
- I ran the spec's terrace rule literally: 6 m cells on the district grid, runs along local x of at most 48 m, top = ceil(h_max/8)·8 + 0.3, base = h_min − 1. The domain is r ≤ 320, ground ≥ 3, water distance ≥ 6, clear of lots + 3, road corridors ± 7.5, tower footprints, and the complex, approximated as 30 m around its bank line.
- I ray-traced A3 through the resulting blocks.

The scripts are in `C:\Users\pdunc\AppData\Local\Temp\claude\71d1a506b11c03e8\7dd9aef4-6179-4c30-820b-ff3b0f510313\scratchpad\rv037\` (`wedge.py`, `steps.py`, `steps2.py`, `steps3.py`, `path.mjs`, `a3wedge.png`).

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 5 | The sky stair (three halls climbing landward plus a prow lantern) is a real departure from the Raffles City conservatory. Reusing the old-record/replace-later isolation for an obstacle tower, with the lean slope kept so the complex stays valid, is neat. But the Confluence Steps are the standard Chongqing terrace set that I-002, I-004 and I-029 already proposed, and the isolation mechanism comes from I-036. |
| Feasibility and credibility | 4 | The isolation reasoning holds against the code: the obstacle box depends on lx/h, `towerTops` ignores unflagged tops, the halls and lantern sit above yTopMax, and wedge streets carry no traffic. But the half of the idea that removes the critical defect fails its own check as written. Open streets leave about 36% of the wedge as painted road, the runs build 50 m monoliths on 51-degree ground, and I estimate about 43% wedge coverage, not 90%. The collider claim is false (solid tubes and changed heights). The crowns slope away from the confluence, and the stair, joint and fins are geometrically underspecified. |
| Expected impact | 6 | It targets the program's only critical defect in the highest-weight zone, plus a replica named by a critic, and it keeps the shafts' edge light at A1/A2. If the Steps worked, a clear A3 win and a likely G2 win are realistic. As specified, though, A3 would show a half-covered slope with zebra stripes between tall dark sandstone faces. The critical defect may then be downgraded rather than removed, and A1 (1.19%, a top-edge change) is a likely tie that still counts as a target. |
| **Overall (average)** | **5.0** | |

### Strongest reason it will fail
**The Steps as specified cannot cover the wedge, and what they do cover would read as tall dark slabs, not lit terraces.**

- **The ground.** I ray-cast A3 wedge pixels onto the ground (990 samples). The ground under the wedge has a median slope of 1.22 (51 degrees), and its 90th percentile is 1.59 (58 degrees).
- **Streets left open.** 39% of the wedge's ground lies within 7.5 m of a Yuzhong road centreline, and 30% is on the painted road surface itself. These are exactly the "lane lines and zebra crossings on a steep hillside" the spec set out to remove; they are clearly visible in a brightened crop of the wedge (`a3wedge.png`). The spec keeps these corridors open, and its domain test ("every cell that is clear of the corridor") widens each corridor to about ±12 m on a 72 m grid.
- **Runs follow the district axis, not the contours.** The downhill direction at the tip is 37–67 degrees off local z, so a 48 m run along local x crosses the contours. Under the literal rule, the median ground range inside a run is 4 m, but the 90th percentile is **51 m** (maximum 63 m), so 10% of blocks have end faces 50–65 m tall.
- **Coverage.** Ray-tracing A3 through the blocks gives **about 43% of the wedge covered, against the spec's 90% target.**
- **What the covered part shows.** A3 looks up the slope from 20 m, so it sees faces, not terrace tops. Of all wedge samples:
  - 24% hit a face more than 12 m above the level in front of it;
  - 10.5% hit a face 5–12 m above that level;
  - only 8% hit the lowest 5 m, where an arcade row would sit;
  - essentially none hit a terrace top.
- **Why those faces will be dark.** MASONRY emits only within about 2.5 m of a part's top (`exp(-dTop/2.5)`, `buildings_wgsl.js:949`). The spec adds no real lights; it only moves 2 of the 4 Raffles floods (r = 30 m).
- **The result:** stepped sandstone monoliths with a warm line along each top edge, separated by painted 51-degree road strips, plus a bare band at the waterline (8.6% of the wedge, where water distance is under 6 m). That is "more slabs", the failure the user and both critics punish (the critical defect at A2 is a blank wall).
- **The streets need not stay open.** `buildRuns` rejects every 18 m step steeper than 0.4 (`trafficCars.js:352`), so none of these wedge streets carries cars, and covering them would leave the runs unchanged.

### Other concerns

**I-031 findings: what was fixed**
- **Fixed:**
  - edge strips kept on every shaft;
  - terrace tops filled up and bases below the lowest ground;
  - the domain no longer stops at r = 190;
  - the 12 m seam replaced by a 0.5 m clearance;
  - the hall area is about the vault's (A3 0.84 against 0.93);
  - a "Not Raffles City" list;
  - the scope split off from I-031;
  - a blind pairwise quick test with A1/A2-like views;
  - the complex's non-solid obstacle scan stated correctly;
  - light order kept by computing positions at `raffles()` time;
  - the obstacle problem made moot by keeping footprints and the lean slope. I checked this: `fr0·lx = (yTopMax − y0)·lx/h`, so the box below yTopMax is unchanged.
- **Not fixed or new:**
  - "measure the wedge before and after" became a 90% target the rule cannot meet (above);
  - the second obstacle is still "almost certainly" the north flank tower, and the table puts tower 3 at (155, 4), where `raffles()` puts it at (155, −56);
  - the I-031 review asked for at least 2 of 3 quick-test wins, and this spec's 4 of 5 with one judge is fine, but I-036's reviewers asked for two judges.

**Colliders: "geometrically equal anyway" is false (the I-036 finding applies)**
- Colliders come from `P.solid` as one box per part (`buildings.js:95`), and the colliders here would come from the frozen old records:
  - **Both tubes are `solid: true`.** Removing them leaves two invisible beams, about 5 × 4.5 × 180 m, at gm + 140 between the flank towers and tower 4.
  - **Tower 1** grows from gm + 270 to gm + 340, and its top 70 m has no collider.
  - **Tower 4's** old box reaches gm + 255 inside a crown that starts tapering at gm + 229.
  - **The south flank tower's** old box stands about 30 m above its new roof and through its setbacks.
  - **The halls and lantern** are not solid.
- The frozen copy is not needed for Raffles. `buildRuns` and the crowd test only footprints and box bottoms (`cy − hy < g + 4` / `g + 2`), and every new shaft keeps its footprint and its bottom. Colliders from the new records therefore give identical runs and crowds.

**The crowns slope away from the confluence**
- A lean of +8 m in x moves each crown's top east. The east face then stays nearly vertical (it moves in 1.75 m over 36 m), and the west face takes the slope.
- From A3 and G2 (cameras to the east-southeast and south-east), the lean lies almost along the view direction, so the slope barely reads in either. Use lx = −8 if the slope is meant to face the confluence.
- **The fins will float.** Five vertical fins sit on an east face whose half-depth shrinks from 12 m to 4.2 m (taper 0.35). Any fin more than about 9 m off centre leaves the face about 11 m up. The fins must follow the face width.

**Grand stair and joint are geometrically impossible as written**
- **The stair starts in the wrong place.** "The plaza east of tower 4" is the complex's top: at z = −68 the bank line is at x ≈ 266, and the cliff spans x 220–260. The steepest descent from there runs into the stack. A straight fall-line stair on slopes of 1.2–1.7 rises at 50–60 degrees, which reads as a ladder (the same finding as I-029 review 1).
- **The joint landing has no room.** The terrace cells beside the south end pavilion stand on ground at about 19–22 m, so the first terrace top is 24.3 m. "A landing from the 5.8 m deck to the first terrace" then rises about 18 m within one 6 m cell row. It needs a switchback stair tower or a lift, stated with its size.

**Lights**
- The spec does not say which two floods move.
  - The tower 3/4 floods (x 155/215, z −36/−48) are the ones nearest the stack plaza.
  - Move the tower 1/2 floods (x 35/95), which no pose sees.
- Two 30 m floods cannot light a terrace field about 300 m across. The tagged-light mechanism already exists: the complex's 47 lights carry `l[9]` and have their own allowance outside `LIGHT_BUDGET` (`buildings.js:109-112`). The Steps can add their own lights without touching the shuffle.

**Tall faces**
- The spec's "a row of lit arcade bays every 8 m" is one row per face. On faces of 12–60 m that leaves most of the wall blank.

**Halls**
- **Ends.** "15 m into each tower" puts each hall's end face at ±15 m from the tower centre, which is exactly the far face (hw 15). The towers are rotated 0.04–0.12 rad against the hall axis, so the end faces cut through the far faces at an angle: slivers 1–2 m proud, and z-fighting where they nearly coincide. End each hall 1–2 m inside the far face.
- **Lantern height.** The spec says the lantern hangs "from tower 4's crown zone", but it sits at gm + 150. Tower 4's crown starts at gm + 229.
- **Seeds.** No seed is given for the halls' `FLAG.LED` glass. Use 61, the vault's seed, to keep its colour and LED behaviour.

**Tower text**
- Raffles row towers are hillside towers taller than 100 m, so phrase candidates are possible. Step 1 logs this, but the design (tops 340/315/290/265) silently changes if any glyph shaft keeps its old h.
- The halls (gm + 150–248) cross the faces between towers. Assert that no glyph band intersects a hall or the lantern.

**Vegetation**
- The domain (r ≤ 320) extends past the clear zone (a 212 m half-square and a circle of r + 25, `vegetation.js:374`). Forest trees there would stand inside terrace blocks.
- Either exclude vegetation cells from the domain or extend the clearing. Clearing is a stamp with no random draws.

**Bench path**
- The fly-through passes (260, 70, 120) and (272, 70, 144). Under the literal rule, the blocks there have tops at 80.3 and 72.3 m, so the bench camera flies through masonry.
- The path already crosses the plateau terrain and tower 3. Still, report the tip leg's frame times.

**Targets**
- A1 is 1.19%: the vault's underside and the left tube are replaced by halls in the top 94 px.
- A6 is 0.97%: the cluster sits at the right edge.
- Both are likely ties that may count as targets under the pixdiff rule. With four targets, adoption needs A3, G2 and one of A1/A6. Say so.

**Minor**
- Quick test: the A2-like view is 250 m from A2, which breaks the spec's own 300 m rule.
- Add a crowd-placement identity check next to the run check, since the crowd's `blocked()` sits on its random stream.
- Prop cap: the Steps' 600 props come after the complex's and may be dropped at low quality.

**Checked and correct**
- `towerTops` ignores Raffles (only `lm`/`cbd`/`bund` tops are used), so searchlights are unaffected.
- The six shafts are the only obstacle candidates.
- Tail parts appended after `finishComplex` with `rng(7301)` share no stream.
- No traffic run touches the wedge.
- GPU: about +0.06 ms is plausible for about 1,000 blocks. With 30–40 tagged lights, expect +0.05–0.1 ms more in the lighting pass, still far inside the gate.

### What would make it stronger
- **Cover the steep streets.** On every Yuzhong road segment that `buildRuns` already rejects (slope > 0.4, which includes all wedge streets), build stair streets: switchback flights along the street line with landings, lamps and side walls, at most about 35 degrees. Keep only accepted runs open (2 m clear). Runs stay identical by construction.
- **Run the terraces along the contours.** Split a run whenever its ground range exceeds 8 m, or build runs along local contour lines instead of local x. Cap the exposed face at about 12 m.
- **Turn faces taller than one storey into frontage.** Stack lit shop or house floors every 4 m (as the complex's units do) instead of one arcade row, so no face shows more than about 4 m of blank masonry.
- **Light the Steps properly.** Add about 30–40 tagged lights at priority 3 (the `l[9]` allowance) along the stair streets and terrace edges, and count them in the GPU estimate. Move the tower 1/2 floods, not 3/4.
- **Recompute coverage before building.** Use the literal rule on the CPU grid, as above. Require at least 85% of the wedge covered by lit frontage, stairs or terrace edges, and at most 10% blank face over 6 m. Treat the waterline band (water distance under 6 m) explicitly, either by handing it to the bank and promenade or by taking the domain down to the promenade.
- **Colliders.** Build Raffles colliders from the new records: same footprints and bottoms, so runs and crowds are unchanged. Drop the tube colliders, and make the halls, lantern and Steps solid.
- **Geometry fixes:**
  - crown lean −8 m if the slope should face the confluence;
  - fins sized to the tapering face;
  - hall ends 1–2 m inside the far faces;
  - lantern location stated consistently;
  - hall seed 61;
  - the grand stair started south of the complex's end, with switchbacks;
  - the joint landing as a stair tower with its size.
- **Before finalising, log:** the obstacle indices, the glyph parts in the Raffles range, and the vegetation inside the domain. Correct tower 3's position.
- **Quick test.** Use two judges with the 4/5 rule each. Add a stop rule: if the wedge coverage check fails, stop before any judging.
