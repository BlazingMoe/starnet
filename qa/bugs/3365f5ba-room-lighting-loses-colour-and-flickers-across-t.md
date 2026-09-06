---
fingerprint: 3365f5ba
slug: room-lighting-loses-colour-and-flickers-across-t
title: Room lighting loses colour and flickers across the floor
surface: world
severity: P2
status: fixed
found: 2026-09-06
lane: agent/room-lighting-strip
fix: 970df704b
origin: owner
report: Owner reported colourless and constantly moving light in the even-coverage preview, 2026-09-06
affected: Source 28a9ed488; installed build unknown
family: room-lighting
installer: unverified
recovery: unconfirmed
---

# Room lighting loses colour and flickers across the floor

## Symptom

The evenly lit rooms lose warmth and their bright patches pulse rapidly, making light appear to move around the floor. The owner requests richer lighting that complements the pixel art with less motion and little runtime cost.

## Repro

Open the seeded :9197 preview on source 28a9ed488. Observe a furnished wood-floor room for several seconds in the station and Build views. The fixture glow uses 83/210ms sine terms with a 90% intensity range; material warmth and sheen are both reduced by the same 0.22 gain as the coverage cut.

## Evidence

`test/simulation-lighting.test.js` executes both real drawing functions at six times, verifies identical fixture draw commands, gradient reuse, rebake invalidation and state restoration. It also samples source emission over 30 seconds, preserving working-state gating and reduced-motion behavior. `dev/room-lighting-vibrancy-proof.mjs` compares actual browser canvas bakes: furnished reference floor chroma 14.099 -> 16.046, luma 41.259 -> 47.558, zero clipped highlights. PNGs and colour.json are in `.worldshots/vibrant-lighting/`. Furnished station and Build views were inspected live; the existing Build proof reports no degraded layers and unchanged station data. Nine sizes and L/U/overlap coverage checks still pass.

## Verdict

Source fix 970df704b steadies ceiling halos at their previous average intensity, reuses gradients via weak caches, slows and reduces emitted prop-light modulation, and separates material colour/reflection gain from the coverage cut. The room grid and diffuse coverage are preserved. Source behavior has live and focused regression proof; the complete gate result is recorded in the lighting digest. No installer or owner recovery claim is made.

## Regression

Registered `test/simulation-lighting.test.js` passes 77 assertions including temporal stability in both views, allocation reuse, website parity, and all emission modes. `test/stationbake.chunk.test.js` passes 64 assertions; room-lighting-settings passes its default, persistence wiring and exposure checks. The live settings driver verifies all three levels, keyboard activation, fixed fixture layout and reload persistence.

## Sibling coverage

{"adapters":[{"target":"room temperature and material reflection","state":"blocked","reason":"Actual browser wood-floor comparison and furnished metal view pass; this visual driver is not registered in the fast suite."}],"entrypoints":[{"target":"rectangular and irregular room shapes","state":"blocked","reason":"Nine sizes and L/U/overlap browser samples pass; actual canvas coverage is outside the registered fast suite."}],"displays":[{"target":"world and Build fixture glow","state":"covered","test":"test/simulation-lighting.test.js","scenario":"Fixture stability across six times, cache reuse and canvas state restoration in world and Build","gate":"fast"}],"lifecycle":[{"target":"rebake, brightness choices and reduced motion","state":"covered","test":"test/simulation-lighting.test.js","scenario":"Rebake invalidation and reduced motion for all four source emission modes","gate":"fast"}]}
