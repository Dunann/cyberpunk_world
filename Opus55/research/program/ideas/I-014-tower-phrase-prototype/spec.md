---
id: I-014
title: Tower phrase show (prototype, judged on real images)
status: accepted
score: prototype track (coordinator decision; see LOG.md)
direction: user-requested feature (skyscrapers with text light shows); consolidates I-007/I-010 reviews
family: signage: tower-scale facade text
parent: I-010
proposed_by: coordinator (from the four reviews of I-007 and I-010)
date: 2026-11-24
---

# I-014: Tower phrase show (prototype)

**Why this is a prototype.** The user explicitly asked for "skyscrapers with light shows with text". I-007 and I-010 both failed review at about 5.3–5.5. All four reviews argue from predicted risks (clutter, clear losses on poses the idea doesn't target) that only real images can settle, and all four converged on the same fixes. This prototype builds I-010 with every fix below, and the blind pairwise judge decides.

## Build: the I-010 spec (`ideas/I-010-tower-character-show/spec.md`) with these required changes
1. **Coordinated content, not random characters.**
   - Each river-front cluster shows one short phrase (2–4 characters, low stroke count), one character per front-row tower, in reading order as seen from the water. Example phrases: 山城, 渝州夜, 江城不夜.
   - Towers behind the front row show at most one large character each, from the same phrase, or none.
   - Drop the cross-tower bank canvas entirely.
2. **Readability.** Dim the lit windows under each character: blend the emissive target to darken under the glyph, then add the glyph, so it reads against the windows. Use no extra passes.
3. **Shape handling.** Decide flat or round faces by the generator's shape kind, not by `FLAG.ROUND`. Define face width and radius for every shape kind, including rounded rectangles, triangles and lobed shapes. Skip twisted, leaning or tapered parts unless handled. Do not drop the four Raffles row towers.
4. **Restraint.** Light at most about 40 towers city-wide, chosen by rule:
   - front row facing water;
   - at least 100 m tall;
   - in the hillside, urban, Bund or CBD districts;
   - a fixed seed.
   No characters on landmarks, except as part of a front-row phrase.
5. **Timing.** Text is on all the time. Brightness pulses with the show when it runs (`F.show`). No timing tuned to the capture times.
6. **Distance.** Pad the atlas so far mip levels don't bleed. Apply the same distance dimming to the overlay as to facade emission. Fade LED dots smoothly over a pixel range that does not alias at 1–4 px.
7. **Cost.** No new point lights. Measure with the full `bench.mjs`.

## Targets (forecast every pose that changes)
- **Targets:** B1, A3, A6, G4, G1, G3, A1 and G2. Adoption needs at least 2/3 of these, and no clear loss anywhere.
- **Should not change:** A2, A4, A5, B2, B3, B4.

## Quick test (implementer)
Capture 3 held-out cameras (not eval poses): one riverside, one aerial, one far. Check by eye that the characters read as deliberate signage, not clutter, before the full evaluation.
