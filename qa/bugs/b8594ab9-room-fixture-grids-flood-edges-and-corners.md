---
fingerprint: b8594ab9
slug: room-fixture-grids-flood-edges-and-corners
title: Room fixture grids flood edges and corners
surface: world
severity: P2
status: fixed
found: 2026-09-06
lane: agent/room-lighting-overhaul
fix: 7e570a506
origin: owner
report: Owner visual comparison of telescope room and wood-floor mancave, 2026-09-05
affected: Source snapshot 07a643772; installed build unknown
family: room-lighting
installer: unverified
recovery: unconfirmed
---

# Room fixture grids flood edges and corners

## Symptom

The telescope room is broadly and evenly lit, including its sides and corners, instead of retaining the centered illumination of the wood-floor mancave reference.

## Repro

Run `node dev/seed.js --keep` on port 9186, then `node dev/room-lighting-proof.mjs before` and `node dev/room-lighting-proof.mjs after`. The before pass intercepts only stationbake.js with the reported source snapshot. Compare six room sizes and the furnished telescope/wood scenes.

## Evidence

Anchor: frontend/app/stationbake.js:3562. Local `.worldshots/room-lighting/` contains before/after PNGs and JSON sampled from the running browser's production lightmap. At 18x18, fixture count is 4 -> 2, center transmission .553 -> .773, corner .580 -> .196. At 40x30, fixtures 20 -> 6 and corner transmission .698 -> .227. Global LIGHT controls are unchanged.

## Verdict

Source implementation 7e570a506 and live browser comparison completed. Installed build and owner recovery remain unverified; this record makes no installed/customer recovery claim.

## Regression

Before, rows hugged the north/south edges and column density grew every eight tiles, creating brighter corners than centers in 18x18 rooms. After, fixtures occupy centered cells with room-scaled radius, and the room fill is centered with tighter falloff reach. Six sampled sizes retain a center at least .20 above all sampled perimeter points.

## Sibling coverage

{"adapters":[{"target":"room material and prop emission","state":"blocked","reason":"Live telescope and plank-floor browser scenes checked; not a registered fast/http pixel test."}],"entrypoints":[{"target":"existing and resized rectangular rooms","state":"blocked","reason":"Six room sizes verified by dev/room-lighting-proof.mjs; irregular multi-rectangle rooms remain a coverage gap."}],"displays":[{"target":"world and build preview bake","state":"blocked","reason":"Shared StationBake renderer changed; live world verified, build preview and installed desktop not exercised."}],"lifecycle":[{"target":"reload/rebake","state":"blocked","reason":"Repeated browser loads and World.loadStation/rebake verified; installed restart not exercised."}]}
