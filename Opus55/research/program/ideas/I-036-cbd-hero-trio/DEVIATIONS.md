# I-036 deviations from the spec

Branch `idea/I-036` (worktree `C:\Users\pdunc\cyberpunk_world\.claude\worktrees\agent-a412d6f7614772b9b`). New code: `Opus55/source/src/buildings_trio.js`; hooks in `buildings.js`, `buildings_landmarks.js` (`genLandmarks` records each trio landmark's part range, ground and tops), `buildings_wgsl.js` (LED band flag), `crowd.js` (dev-only `devAgents` hook); check tool `tools/trio-identity.mjs`.

Each item below is a consolidated fix from review 1 (R1) and review 2 (R2), or a change found while building.

## Braid
1. **Gap open over most of the height from B1 and B4 (R1, R2 strongest reason).** Shafts are regular hexagons (kind 2, prm 6), apothem 14 m at the base (28 m across flats) tapering to 0.65, on a **34 m** helix radius (spec: 30 x 24 m rounded rectangles on 26 m). One full turn is kept (it is what makes the braid read as two winding bodies). A CPU projection with the real cameras (f = 1241.7 px) and the occluder skylines from the reviews (B1: hidden below y 668, and below y 425 left of x 548; B4: below y 860) gives the gap open (>= 3 px) over **80% of the visible height at B1** (one crossing at 360-422 m) and **84% at B4** (one crossing at 298-362 m), B3 70%. The spec's design measured 48% (R2). The crossings read as an X where the strands pass, not as a long single neck. Search: `scratchpad/i036/braid.mjs` (radius 26-36, apothem 10-15, 0.5/0.75/1 turns, both hands).
2. **Phase by a design rule (R1).** The crown bridge stands across the line to the nearest river water (marched in 1-degree steps from the site with `world.waterDist`), so from the river the shafts stand side by side at the crown. No pose coordinates are used. Handedness: the angle increases with height.
3. **Smooth helix (R1).** 24 segments per turn (22.5 m each), not 12 x 45 m. Each segment leans to the next helix point and twists by 15 degrees; joints match exactly (same centre, angle and scale).
4. **LED mode 3 kept at ~90 m bars (R2).** Short segments would show 24 level-meter bars per shaft. A new part flag `FLAG.LEDBAND` makes show mode 3 fill one band per 90 m (`LED_BAND`) counted from the shaft's base instead of per part, so each shaft shows 6 bars, like the twist's 6 sections. Only Braid shaft parts carry the flag; every other part shades exactly as before. Seed 38 on all shafts (the twist's mode-3 hue and level, cyan edge strips). Hexagons give 6 single edge strips per shaft (no doubled strips at rounded corners, R1).
5. **Clasps** at 1/4, 1/2 and 3/4 of the height: 68 m (centre to centre) x 14 x 8 m green glass with lit underside, lit rails and six trees; ends inside the shafts.
6. **Crown**: lit crown bridge 86 x 22 x 10 m (covers both hexagon tops), hexagonal lantern apothem 7.5 m (corners 8.7 m, inside the 11 m half-depth; R2 overhang fixed), spire on the axis to g + 660 with five ring lights.
7. **Podium roof cap (R2 bare roofs)**: glass garden dome (lobed, 14 m) in the middle, lit balustrade on the podium rim, garden trees on the rim away from the shafts.

## Tripod Lantern
8. Legs as specified (side 22 m, apex outward, 24 m -> 12 m circle, taper 0.6); the lean is computed so the top centroid lands on the 12 m circle (taper scales about the part origin, not the centroid). Glass with `FLAG.LED | FLAG.EDGE`, fixed seed 42.3 (azure edge strips) on all three legs.
9. **Plate corners (R1, R2)**: plates are 3 m larger than in the spec (circumradius 33 m at 110 m, 27 m at 210 m), vertices toward the legs; the legs lie fully inside the plate outline with about 1 m clear.
10. Crown deck (22 m), lantern (17 m, 55 m, taper 0.55, vertices toward the legs so nothing overhangs the deck), mast with three ring lights.
11. **Base roof cap (R2)**: warm glass atrium between the legs, lit parapet on the stone base, garden trees in the three open sectors.

## Offset Pair
12. **Lobbies equal to the old ground colliders.** Each tower stands on a 30 x 30 m lobby block (to g + 9) that is exactly the twin's tower collider box (same centre, size and rotation: A 0.35 rad, B 0.35 + pi/6). The ground footprint is unchanged, and no frozen box sticks out as an invisible corner. Tower A's shaft is at the old tier-0 angle a = 0.35 (R1).
13. Tower A's top tier ends at **g + 420** (spec 418), so its searchlight top keeps the twin's height (see 18).
14. **Fins on the narrowing face (R1)**: the crown's river face is almost upright (it moves 2.5 m) while its flat narrows from 13 m to 3.25 m; each of the seven fins (1.5 m apart) ends where the flat ends and leans with the face.
15. **Lower bridge reaches tower B (R2)**: 64 m long (spec 52), offset 12 m; it enters A by 4-8 m and B by 2.5-3.7 m.
16. Halo masts given (0.5 m thick, 14 m, at 11 m radius); roof cap on tower B; Sky Hall with lit underside, rails and roof trees. Seed 8.8 everywhere (orange edges, R2).

## Isolation, colliders, lights, searchlights, text
17. **Colliders from the new parts above ground (R1, R2).** Old elevated boxes (twist shaft segments 0-1, truss quadrant 0) are dropped; new boxes are made for the new shafts, legs, clasps, plates, decks, lanterns, halls, bridges and crowns, each starting at least 8 m above the ground (asserted). Boxes are fitted inside each part (hexagon = 3 rectangles, triangle = 2, chamfered square = 2, decagon = 3) and shrunk by the lean within a slice, so there is no invisible wall in the Braid's gap or between the Tripod legs. Old boxes that reach the ground keep footprint and bottom; the twin's two are cut at the lobby roof (g + 9); the twist podium and truss base boxes are unchanged. Traffic runs, crowd placement and air corridors are checked identical with `tools/trio-identity.mjs` (results below).
18. **Searchlight tops (R1, R2)**: x, z and order kept; tops sort by `sortY` (the old y). New y: Braid g + 604 (lantern top; the spire passes through the drum as on the twist), Tripod g + 361 (lantern top), tower A g + 420 (unchanged: the drum sits inside the crown's base on the axis, as the twin's sat inside its lantern), tower B g + 360 (not a beam source: within 160 m of A).
19. **Lights (R1, R2)**: every landmark light stays exactly where it is (ground floods); none is moved to a crown.
20. **Tower text**: `selectTowerText` now runs before the trio is replaced (on the old records), so the phrases are identical by construction. A landmark with a glyph part in its range would be left unchanged (none has). A sight-line check (`world.shared.trio.textBlocked`) counts glyphs whose line to the water crosses a new part at glyph height (R2).
21. **Mask for the target rule**: `?lmmask` paints the new trio parts magenta and everything else black; `?lmmask&lmold` paints the old trio (replacement off), so both silhouettes come from one dev build.

## Quick test
22. Held-out cameras follow the spec's rules (two B1-like from the west-bank promenade 400 m north and south of B1, two B4-like at +90 and +180 degrees from B4's bearing, one B3-like at +40 degrees), plus one B2-like street view at the CBD road point about 1 km from the Tripod whose road direction points most nearly at it. Times t = 45 / 50 (show mode 3), per the coordinator. The two B1-like views keep the front-row towers in frame (partly hidden view, R1/R2). Blind pairs are built for the coordinator's two judges; I did not judge them.
