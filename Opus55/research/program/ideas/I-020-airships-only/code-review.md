## Code review round 1 (2026-11-24)

**Branch:** idea/I-020 at 9cfe031 (e2f4660 code, 52185b1 merge of main 54f2c3e, c3b570a generator and DEVIATIONS, 9cfe031 DEVIATIONS)
**Verdict:** pass

The launch is completely gone and the airships are round 4's. The LED band now shows fitted, mirror-safe pages that switch instantly. The fresh-camera generator follows the declared rule, and it reproduces the committed `fresh-cameras.json` byte for byte. No serious or moderate problems.

### Matches the spec
1. **Launch removed (spec item 1).**
   - `git diff main idea/I-020` is empty for `common.js`, `renderer.js`, `sky.js` and `vegetation.js`. So `Frame` is back to 144 floats with no `launch` field, and `skyCityGlow` has no launch term.
   - Against main, the source diff touches only:
     - the skyops module (`skyops*.js`);
     - its registration (`main.js`: the import plus the `skyops` and `skyopsLate` entries);
     - I-009's `air.js` edit (`LANES`/`CIRCLES` exported, `airCorridors` published, same `rnd` call order);
     - the skyops tools and `tools/airship-cams.mjs`.

     Nothing in `Opus55/eval/` or the metric folder differs.
   - A grep of `src/skyops*`, `tools/skyops-*` and `tools/airship-cams.mjs`, plus the four shared files, finds no rocket, trail, plume, smoke, spaceport, `deckY`, `sDeck`, launch uniform, `skyops-fwd` or `F.launch`. The only "launch" hits are the header comments and the `launch.mjs` browser helper.
   - **Other removed items:**
     - no `addCollider` calls remain, so the 3 spaceport colliders are gone;
     - `world.shared.spaceport` is no longer published;
     - the launch layout functions and constants are deleted;
     - the `rocketMesh` and `spaceportMesh` functions are deleted;
     - materials 7–22 and the local-light loop in the opaque shader are deleted;
     - the rocket's two instance slots are deleted.
   - **No dead code was left behind:** the instance buffer is 3 × 32 floats, `NSPR` = 3 × (7 nav + 29 outline) = 108, and the opaque pass is skipped when no ship is in view.
2. **Airships unchanged from round 4 (spec item 2).** I diffed `skyopsLayout.js`, `skyopsMesh.js`, `skyopsWgsl.js` and `skyops.js` against 7506f1e (round 4, which I passed).
   - **`skyopsLayout.js` and `skyopsMesh.js`:** removals only.
   - **The opaque shader** keeps the same hull, fin, rotor, fin-edge and window shading, and the same `shade()` minus the local lights.
   - **The only change to the ships is the LED band** (spec item 3). The text lookup and the row index changed; the band position, height, frame and colour are as before. The band's colour wave now uses `s` instead of the old scrolling `along` (`s` is the same axis without the scroll).
   - **Unchanged in `skyops.js`:** the tracks, phases, altitudes, beam slots, `_cityWeight`, aim, outline and nav lights, and the show dimming.
   - **One harmless difference:** the per-pixel discard at `wp.y < a.w || wp.y > 1800` was removed. It only served the rocket, and ships never reach those heights.
3. **Sign fix (spec item 3).** The two still pages, the fit inside the band, the mirror-safe reading and the page selection are each checked under Checks run below.

### Problems
- **minor: adjacent atlas rows can bleed faintly into the band's edges at mid distance.** Rows are 128 px with the type up to 108 px. Mip levels are made by downscaling the whole canvas, so from mip 3 (about 1 km) the neighbouring row's glyph tops and bottoms can blend faintly into the band's top and bottom edges. That row is the same ship's other page, or the next ship's. Round 4 had the same layout. It is not a half-switched page, and it is illegible at that distance. Fix if wanted: pad the rows, or clamp `v` inside the row at each mip level.
- **minor: one burst frame can show a faint mix of two pages.** The first frame of each motion burst renders 30 un-frozen frames before capture. If a page switch lands in its last ~0.1 s, TAA can briefly blend the old page into the new one, mostly removed by the neighbourhood clamp. The chance is about 2% per visible ship per burst. Burst times follow wall-clock time, so this is a property of the burst harness, not of this idea. The other burst frames reset the history.
- **minor: two rotor discs can hide the bottom edge of the text.** The port and starboard rotor discs at z ≈ 50 and z ≈ −18 hang just below the band (pod centre y −7 or −9, disc radius 4.2 m). Seen from below at certain angles, they can hide the lower edge of a few glyphs near the ends of the text. This is unchanged mesh from round 4 and is occlusion, not clipping by the band. No action needed.
- **note: the airship altitudes depend on the quality level.** `air.js` uses `rnd` for its quality-dependent taxi and drone counts before `cbdCorridors`, so the corridors, and with them the Bund–CBD altitude, differ by quality: 405 m on High, 390 m on Low, which I measured in round 4. Every eval tool, `airship-cams.mjs` and `capture.mjs` all use `quality=high`, so the fresh-camera targets (y ≈ 403–407) match the captures. Keep it in mind for any tool that runs at another quality.

### Checks run
- **Build and unit tests.** In the worktree, which is on `idea/I-020` and clean: `node build.mjs --dev` builds (1173 KB). `node tools/skyops-test.mjs` passes 10/10, including:
  - pages: two per ship, each in its own atlas row;
  - pages fit inside the fully lit band (z −36…58);
  - mirror safety: band position runs along the viewer's screen-right vector on both sides.
- **Diffs read.**
  - `git diff main idea/I-020` (stat and name lists);
  - every changed line of `skyops.js`, `skyopsAtlas.js`, `skyopsWgsl.js`, `skyopsMesh.js` and `skyopsLayout.js` against 7506f1e;
  - the remnant grep described above.
- **Sign fix: two still pages.** Each ship has two atlas rows, `pageRow(i, p) = 2i + p`: page 0 is `◆  <Chinese brand>  ◆` and page 1 is the Latin line. Each row is drawn centred (`textAlign = 'center'` at x = 512) and does not scroll. The shader reads row `I.b.x` written from `_updateShip`; the old scroll term `I.b.y` is gone.
- **Sign fix: fit inside the band.**
  - `fitSize` shrinks any page wider than `TEXT_MAX` = 880 px. Scaling the font by `floor(108 × 880 / width)` keeps the width ≤ 880 px, assuming widths scale linearly with font size.
  - At 1024 px per 100 m, 880 px is 86 m, centred on `BAND_MID` = z 11, so it spans z −32…54. That lies inside the fully lit band, z −36…58 (`inZ0` = 1), with 4 m to spare at each end.
  - `tu = 0.5 + s/100` stays in [0.03, 0.97] across the lit band. Only the 4 m fade zones reach the atlas edge, and that is black.
  - The fins start at z −38, behind the band.
- **Sign fix: mirror-safe reading.**
  - The ship's local frame is a proper rotation: in round 1 I showed (l, u, f) = identity for heading +z.
  - On the port side (x > 0) the viewer looks toward −x, so their right-hand direction is −x × +y = −z, and `s = BAND_MID − z` increases to the right. On the starboard side, right is +z, and `s = z − BAND_MID` increases to the right.
  - `bandS` in `skyopsAtlas.js` is the same mapping, and the unit test checks it against the screen-right vector for every ship and both sides.
  - The atlas `v` runs from the row's bottom (bandV = 0) to its top, and the gradient `dv = −1/(0.68 × 8)` matches it, so glyphs are upright. The Chinese reading order is now the canvas's own order, with no window cutting off the first character (the round-4 "舟航天" cause).
- **Sign fix: page selection.**
  - `pk = floor((t + seed·10)/5)`, `page = pk mod 2`: a pure function of time and the existing ship seed, with no new random draws.
  - Pages switch between frames, with no transition.
  - **Eval stills cannot show a partial page.** Pose and `--poses-file` captures run with `freeze` and a fixed `ctx.time`, and render 48 frames at constant time, so every frame of the TAA history shows the same full page. The 8-frame `--stats` refresh also re-freezes at the pose time. A half-switched or clipped page in a still is therefore impossible.
  - **Bursts:** see the minor problem above.
- **Fresh-camera generator (`tools/airship-cams.mjs`) against the spec rule.**
  - **Rule items:** seed 20261124; 8 cameras; per ship, d ∈ {300, 700} m; bearing 60–120° off the heading, seeded, with the side drawn 50/50; height difference −150…+50 m; looks at the ship; rejected and redrawn when terrain blocks the line of sight.
  - **The open choices are reasonable and neutral:**
    - ship = k mod 3 and d by parity, so every ship gets both distances (3/3/2 cameras);
    - times uniform in [0, 360) s;
    - fixed draw order;
    - distance measured horizontally from the hull centre;
    - a 2 m terrain margin over 101 samples.

    None of them favours a particular view, and the generator's own log reports 0 rejected attempts.
  - **They were fixed before any image existed.** The generator and `fresh-cameras.json` were committed together in c3b570a (07:19), after the spec commit 0ad70d8 (06:59). The generator was not edited afterwards. The implementer's `out/` folders hold only H1–H4 and R1–R8 images, no S images (checked by file name only; I viewed no image).
  - **Reproduced:** I re-ran `node tools/airship-cams.mjs` under `gpu-run.sh I-020cr`. The output is byte-identical to the committed `fresh-cameras.json`, so the file is exactly the rule's output, not a hand-picked set.
  - **Extra check beyond the spec (numbers only, no images):** I tested each S camera's line of sight against the building colliders, at 4 m steps up to the hull, and against the other two airships at time t. All 8 have **0** collider intersections and no other ship within 100 m of the line. The spec only requires the terrain test, but this confirms no S camera looks at a building instead of a ship.
- **Light reservation, 4 → 3.**
  - `ctx.lights.reserve(NSHIP)` is called once, in `init`, before `water`, as before.
  - Each frame `_updateShip` writes exactly slots `lightBase + 0…2`, with on or off values, through `_putLight`, which writes the data and dirty range exactly as `lights.set` does. Nothing references a fourth slot, since the plume light code is gone.
  - Later modules' lights shift down by one index against I-009 and by three against main. Light order is not a random stream: tile lists are filled by atomics, and flicker seeds are stored per light. The signs' budget, `min(2150, 8192 − count − 64)`, is nowhere near binding: there are 5388 lights in total.
- **No per-frame allocations.** `update`, `_updateShip`, `afterLighting` and `drawLate` create no arrays, objects, closures or template strings:
  - scratch storage is preallocated (`_st`, `_pt`, `_p3`, `_lv`, `_vp`, `_cq`, `_navCol`, the typed instance, sprite and beam arrays);
  - `pageRow` takes and returns integers;
  - `prof.ts` returns cached descriptors.

  Only the dev-only `_metrics` allocates. The remaining V8 boxing is less than in round 4, because the launch's calls are gone.
- **Not run:** bench, captures, `functional.mjs`. GPU use was limited to the two short headless-window runs above (generator reproduction and line of sight), under `gpu-run.sh I-020cr`.

### Evaluation untouched
`git diff main idea/I-020 --name-only -- Opus55/eval Opus55/research/program/metric` is empty. The branch's other differences from main are the skyops files, `main.js`, `air.js`, the tools listed above, and program files that main has since moved past (LOG, I-018).
