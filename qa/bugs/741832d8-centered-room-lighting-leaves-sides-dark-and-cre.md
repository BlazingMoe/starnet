---
fingerprint: 741832d8
slug: centered-room-lighting-leaves-sides-dark-and-cre
title: Centered room lighting leaves sides dark and creates hotspots
surface: world
severity: P2
status: open
found: 2026-09-06
lane: agent/room-lighting-strip
fix: 5f40c3e60
origin: owner
report: Owner rejected centered lighting and requested even room coverage, 2026-09-06
affected: Source d107e5ef2; installed build unknown
family: room-lighting
installer: unverified
recovery: unconfirmed
---

# Centered room lighting leaves sides dark and creates hotspots

## Symptom

Room centers and two isolated pools look bright while the sides and ends remain dark. Higher brightness presets retain the same uneven distribution. The owner retracted acceptance of the earlier reference-matching layout and asked for evenly distributed lighting.

## Repro

Run the seeded preview at :9197. On source d107e5ef2, inspect wide and tall rooms at LOW and compare side-floor illumination with the center. `node dev/room-lighting-even-proof.mjs before` records measurements; on the fixed candidate use `node dev/room-lighting-even-proof.mjs after` to assert coverage across nine sizes and L/U/overlapping shapes.

## Evidence

Before/after JSON, full room renders and live screenshots are under `.worldshots/even-lighting/`. The old 9x7 room had sampled illumination from .239 to .761 (3.18:1). The corrected room measures .612 to .671 (1.10:1). All nine rectangular sizes have ratios below 1.12; L/U shapes below 1.13; an overlapping-rectangle layout below 1.23. Isolating diffuse fill produces no variation across the irregular room floor, proving rectangle overlap does not stack that fill.

## Verdict

Source fix 5f40c3e60 replaces the circular room fill with one union of interior coverage, including raised north walls. A distributed fixture grid provides restrained highlights at 22% of the former room-fixture strength. `test/stationbake.chunk.test.js` checks both-axis coverage, bounded gains and chunk/full-bake parity; `test/room-lighting-settings.test.js` retains preset behavior. Full regression and final furnished-room proof are pending.

## Regression

Actual browser lightmap sampling covers 5x5 through 60x12/12x60 rooms and L/U/overlap shapes. It excludes exterior chamfers using the renderer's actual interior receiver mask. LOW/MEDIUM/HIGH keep the same distribution and scale exposure only. The previous reference scripts are historical checks of the superseded design; the even-lighting proof is authoritative for the new requirement.

## Sibling coverage

{"adapters":[{"target":"room materials and fixture highlights","state":"blocked","reason":"Browser coverage proof and shared renderer exercised; furnished-scene check pending."}],"entrypoints":[{"target":"rectangular and irregular room geometry","state":"blocked","reason":"Nine sizes plus L/U/overlap layouts verified by the browser proof; real-canvas pixel checks are not registered in the fast suite."}],"displays":[{"target":"world and build preview","state":"blocked","reason":"World verified and chunk parity registered in test/stationbake.chunk.test.js; live build preview and installer pending."}],"lifecycle":[{"target":"lighting presets and reload","state":"blocked","reason":"Existing setting persistence tests retained; updated renderer's live three-level/reload proof in progress."}]}
