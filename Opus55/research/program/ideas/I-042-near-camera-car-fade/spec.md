---
id: I-042
title: Near-camera car fade (part 1 of I-040, alone)
status: accepted
score: n/a - part 1 of I-040, reviewed favourably three times (I-032 review-1 and review-2: "a legitimate fix, camera position only"; I-040 review-1: "a genuine fix, not metric gaming ... only B2 changes (13-15% of the frame)"). Accepted by the coordinator as a small defect fix; full review of the I-040 spec covers it.
direction: Attack the weakness (critic-named critical defect at B2)
family: defect repair: camera-proximity fade
parent: I-040 (I-032)
proposed_by: coordinator (split)
date: 2026-11-24
---

# I-042: Near-camera car fade

Exactly part 1 of `ideas/I-040-near-car-fade-and-east-bank/spec.md`: each car's distance from the camera to its body box; dither fade from 2.5 m down to 1.2 m, skipped below 1.2 m, including head/tail light sprites and the wet-road reflection streak. Steep-slope and run-end fades unchanged; no car state or random stream changes. People unchanged. Part 2 (east-bank pass) is dropped (I-040 review-1: it builds on the wrong land).

**Why it is a real fix, not metric gaming:** the player flies freely and can put the camera inside a lane; a car body 1.1 m from the lens is a full-frame slab (B2 critical defect, both critics). Uses only the camera position, applies to every car, standard practice.

**Target by rule:** poses where pixdiff vs main changes at least 1% of pixels. Expected: B2 only (13-15%). All other poses must be identical apart from animation noise (A4 and A5 explicitly checked).

**Checks:** traffic identity (car positions identical; only drawing changes), burst check on 4-frame street bursts for stipple/ghost cars, bench pair (expected ~ +0.01 ms).
