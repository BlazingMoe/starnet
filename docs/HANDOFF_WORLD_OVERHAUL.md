# HANDOFF — world visual overhaul (`agent/world-overhaul`)

**Date:** 2026-09-04 · **Branch:** `agent/world-overhaul` · **Worktree:** `C:\Users\andro\gen-trees\world-overhaul`
**HEAD:** `58fc522f3` · **Status:** BUILT, NOT MERGED, Andrew mid-review. Gate/goldens/claims OWED (see §5).

Read `docs/BRAIN.md` + `CLAUDE.md` first; this file is the lane-specific truth.

## 1. What this branch is

Andrew's ask (2026-09-03): *"make StarNet truly look like a $40 pixel-art gorgeous Steam game… without
using too many resources."* Then, across ~15 review rounds: *keep StarNet as it is, immensely improve
textures + lighting, Stardew-level; more depth and detail; the exterior must not glow against the void.*

The branch FOLDS IN two older unmerged lanes first, so one verdict covers all three:
- `agent/world-gorgeous` (09-02 lighting glow-up: physical falloff, cool plate, warm film, reach 1.3)
- `agent/prop-gorgeous` (v46 props) — **its prop ART was later removed** (§3, Andrew rejected the
  beige "golden" workstations); only its harness files under `gal/` remain.

## 2. What Andrew has judged (this is the map — do not re-walk rejected ground)

| Verdict | Thing |
|---|---|
| ❌ "not even slightly a fan… brown tint, too bright, cheaper" | round 1: bloom 0.45, warm film 0.3, dither 0.45, sepia grade, brown stock deck |
| ❌ "way too dark, basically pitch black" | hull exposure 0.25 |
| ❌ "clusterfuck, lower quality… CRT way too strong, curve ridiculous" | the old-TV CRT pass (pitch-2 lines, RGB mask, bleed, roll bar, curve 0.13). **Reverted to previous filter values; the passes still exist at 0 on lab knobs.** |
| ❌ "not sure how I feel about the golden workstations" | v46 prop rebuild — **removed**, trunk's original prop art restored |
| ✅ (accepted, silently) | cool steel stock deck (`#3a3b41`), no sepia, cast shadows, prop light sources, hue-shifted shading, per-room fixture colour, pendants, 30px walls, running lights, exterior exposure 0.4 |
| ✅ "proceed" + reference image | the *Pixel Art Space Station* look: big bolted plates, 2px seams, lit bevels, chunky framed wall panels with braces/pipes, standing tube lamps with fat glows |
| ❓ not judged yet | four new decks (DIAMOND/CARGO/CERAMIC/RESIN), the SPINE polish, the wall/deck polish pass, the prop polish pass |

Standing laws he restated this lane: **subtle CRT, not strong** · exterior darker than interior but not
black · no brown tint · "keep the essence" when polishing (SPINE stayed 4×3 panels).

## 3. What changed (by file)

`frontend/app/stationbake.js`
- `shade()` — hue-shifted shading for every INTERIOR painter (deck, walls, side faces, corner crowns).
  Hull keeps `U.shade` (hull test pins its ladder).
- `HULL_EXPOSURE = 0.4` + `hshade()` — every hull palette scaled darker; hull-skin draw-time LIFTS scaled
  by the same factor so no skin re-brightens itself. `WALL_TONE.cap` 0.30→0.02; `LIGHT.crown` 0.45→0.1.
- LIGHT now `{ambient .84, pool .85, room .46, corridor .34, door .4, floor .24, crown .1, reach 1.3, cool .9, warm .16}`;
  DEPTH `dither .12`; WALL `up 30, corUp 16`. Locks moved with the values in `test/simulation-lighting.test.js`.
- `lampRgbOf()` per room kind (lab cool, bridge cooler, foundry sodium, quarters amber; hab unchanged).
  Lamps export `{…, rgb, hang}`; `bake()` returns `lamps` (chunk path too).
- Deck: `lowFreq()` tone drift (±2.5%), `plateGrade()`/`deckBolt()` helpers, SPINE rebuilt (4×3 panels,
  bevel ladder, paired grain, four-step panel light, real bolts, one character mark per panel), SLAB
  joints two-step, PLANK crowned boards + knot + screw, hazard chevrons on door sills (`bakeThreshold`).
  New decks: `deckDiamond/deckResin/deckCeramic/deckCargo` (registered in `worldmodel.js` FLOOR_MATERIALS + MAT_ORDER).
- Walls: `faceGrade()/hairPair()/rivetAt()` helpers; every recipe uses them; bulkhead gained cable tray,
  vents, conduit drops; a bevelled two-tile SEGMENT FRAME is painted over every room wall face.

`frontend/app/world.js`
- `drawPropLights` (additive per-prop light, cached gradients), `drawBloom` (scale-based, half-rate,
  **default 0**), `drawNavLights` (hull corner running lights), `drawOverhead` (pendant fixtures over
  `lamps` with `hang`), shadow pass after decals, `CRT` gained `bloom/emit/mask/bleed/roll` (all inert
  except `emit 0.6`). `drawGlows` uses the lamp's rgb.

`frontend/app/propsprites.js` — trunk's original F.* art + `drawShadow()`, `lightOf()`/`EMIT` (~90 ids),
hue-shifted `shade()` for all 1112 derived tones, own-hue outline (`inkFor` tally on a type's first
frame), chunkier `box()`/`frontFace()`.

`frontend/css/style.css` — default grade `saturate(1.06) contrast(1.1) brightness(0.94)` (sepia/hue-rotate gone).
`frontend/app/crtlab.js` — mirrors + presets `World: pre-09-03`, `CRT: pre-09-03/old TV/heavy TV`.
`dev/worldshot.mjs` — perf probe (`SKYNET_WS_PERF=1`), real GPU (`SKYNET_WS_GPU=1`), `SKYNET_WS_HOLD=1`.
`gal/shipped-propsprites.js` — trunk prop art for the `gal/shoot.mjs` A/B.

## 4. Measurements (real frames, furnished lounge crop, zoom 2)
trunk → current: luma mean 30→~42, sd 20.7→~27, crushed 12%→~4%. **Frame cost on the RTX: +0.3 ms**
(1.49→1.81 ms; bloom was the only real cost and is off). ⛔ Measure on the real GPU — SwiftShader makes any
full-frame canvas draw look like 3 ms.

## 5. OWED before merge
1. `npm run test:fast` — last GREEN at `e5c93efab`; ~15 commits since. Run it (10 min, alone).
2. Claims re-lock: `node scripts/qa/product-perfect/relock-surface.mjs` (clean tree) → commit → gate again.
3. Goldens: `npm run golden` then `npm run golden:bless` (expect ingame + the two translucent panels to move).
4. Andrew's verdict on §2's "not judged" rows, then `starnet-merge-ritual`. Merging this merges the
   09-02 glow-up too. The prop-gorgeous lane's art is NOT in here any more.

## 6. Recipes
- Shoot: `SKYNET_WS_GPU=1 SKYNET_SHOT_PORT=8964 SKYNET_CDP_PORT=9364 SKYNET_WS_OUT=<dir> node dev/worldshot.mjs <tag>`
  → `<tag>-wide/hab/lounge.png`. Crops: `node dev/worldcmp.mjs A.png B.png x y w h out.png <scale>`
  (lounge `420 180 470 330`, hab `400 100 500 300`). Variants via `SKYNET_WS_VARIANTS` — **cumulative**.
- Props A/B: `MSYS_NO_PATHCONV=1 node gal/shoot.mjs "ids=desk,console&zoom=5&work=1&crop=1&before=/gal/shipped-propsprites.js" C:/…/out.png 8931`
  (Windows-style output path; the sheet is 6000px wide — stack it before judging).
- Live for Andrew: `.claude/launch.json` config `world-overhaul-live` (node sidecar/index.js on :8787 against
  his REAL workspace). It died twice during the session; restart via preview_start.
- Patch scripts: write them to the scratchpad and `node` them; bash heredocs mangled twice.

## 7. Proposed next
Andrew still says the world is "not there". The systematic levers are spent; what remains is hand
authoring: rebuild the eight most-seen props (desk, console, bay, intake, outbox, core, rack, shelf) to
the reference language (thick own-hue outline, fat lit bevels, big simple forms, one accent), one family
per sheet, judged with `gal/shoot.mjs` BEFORE touching the rest. Then wall X-braces and ringed pipes and a
standing tube-lamp prop from the reference.


## 8. September 4 custom-world review continuation

Work is isolated in `agent/world-visual-audit-0904`; the custom seeded preview is on :9177.
Andrew strongly approved the projected prop shadows and refined agent contact shadows.
He rejected the subsequent reflected-light/threshold redesign; that pass was reverted.
Preserve the approved interior brightness, falloff, cool equipment palette and original chairs.
Interior illumination must exclude the exterior shell and wall crowns. The current bake has
an interior receiver shared by the baked exposure and animated glow clip. Window panes must
explicitly use destination-out when clearing the light map. `dev/interior-light-probe.mjs`
checks exterior invariance, receiver classification and transparent window pixels in Chromium.

Latest craftsmanship pass is implemented for review: gasketed equipment access leaves,
layered mounting pads/fasteners, recessed ventilation, sparse metal-deck inspection hatches,
and more resolved bulkhead and shell service fittings. It does not change lighting controls,
chair designs, footprints, capability state, or the custom layout. Reviewed at normal and
close zoom; 17 focused test steps passed, followed by two floor/chunk checks after hatch placement.

Performance / beacon follow-up: running lights now occupy 22 validated flat front-wall panels,
with a recessed 5px housing between the seams. Andrew rejected mounts on the sharp chamfered
corners: keep those clear. Small fronts get one lamp and wider fronts get two; adjoining shapes
share a facade. All housing pixels are opaque shell, outside the interior receiver and floor
tiles; the old 52 unvalidated corner offsets are gone. Geometry checks run during bake.

Idle bay/desk/desk2/plant art caches preserve discrete blink/name/mirror/chroma states; working
props still render live. Prop bodies/shadows outside the viewport are culled with a 64px margin.
Projected shadows retain the approved shape, cached at 4x; the floor-clipped shadow pass is cached
at screen resolution and invalidates on camera/layout/bake/resize/context-loss changes. Agent
shadows and interior exposure are unchanged. Interior clip construction now happens during bake.

Real Chromium probes: 192 prop-art comparisons were pixel-identical; 96 shadow comparisons across
four zooms averaged 1.66/255 channel difference in shadow-covered pixels. Cached shadow-pass pixels
matched a fresh render after focus, resize and simulated context loss. Interior/exterior/window
regression probe passed. GPU benchmark (RTX 5060 Ti, 1440x900, 20s settled sample): full station
improved from approximately 37 FPS to 56.8 FPS, with p95 frame interval 16.8ms. The close-up held
60 FPS, with 3.8ms median / 5.5ms p95 frame callback cost. This is a local
renderer measurement, not an all-device performance guarantee. Reproduce with
`node dev/world-performance-probe.mjs review --gpu --settled`; add `--close` for the close-up.
`dev/nav-light-probe.mjs` and `dev/world-cache-probe.mjs` reproduce placement/art/cache checks.

Hallway entrance follow-up: real corridor openings through the room's raised north/back wall
now have splayed jamb faces and mitered crown ends, with a continuous deck through the throat.
The old short corridor rails previously carried straight into the room face. Their stale crown
records also excluded interior light after wall art had painted over them, leaving detached dark
vertical strips. The mouth pass replaces that geometry and removes only the superseded crown
records. Jambs receive interior light; crown tops remain excluded, and glass stays transparent.
It is a bake-only repair bounded to the entrance tiles, with no per-frame work or traversal changes.
`node dev/junction-probe.mjs` compares the custom demo against 14f7ac19a and checks one- through
four-tile entrances with both bulkhead and viewport walls in Chromium. All eight variants remain
walkable, and the custom station's base/light pixel changes stay entirely inside doorway regions
(zero changes outside). The interior/exterior/window probe and six focused test steps also passed.

September 5 doorway depth correction: Andrew observed agents painting through those new jambs.
The doorway had only been drawn in baseCv, beneath every entity. The bake now supplies ten small
solid entrance overlays in the custom demo, sorted with props/bodies at the wall's floor contact.
These include the adjacent solid shoulders so an occluded arm cannot reappear on the next wall
panel. The glass tint stays in the base only; glass panes are excluded from the solid overlays.
Empty station pixels and bodies already in front remain identical. Overlays are created during
bake, skipped offscreen, and rebaked after context loss. Movement/collision rules are unchanged.
`node dev/door-depth-probe.mjs` verifies opaque wall occlusion, visible aperture pixels, unchanged
empty/front views and transparent panes for eight width/material combinations; it also walks the
real movement helper through every fixture in both directions with zero illegal tile transitions,
drives a live custom-world agent across the entrance, and checks context-loss recovery.

September 5 cockpit UI pass (the six approved UI recommendations):
- COMMS now has a cropped, cached agent portrait, clearer identity hierarchy, a recessed multiline
  composer, and more legible conversation headers. Crew portraits reuse the same per-skin cache.
- Crew filters ALL / WORKING / NEEDS YOU read the existing run map and per-workstream pending
  approvals. Hidden rows are excluded from the rail's measured row cuts. Session/project chrome
  has quieter headings, clearer selection, and more breathing room.
- Refit tool shelves collapse; keyboard arming opens the matching shelf. A larger selected prop
  preview shows its actual footprint, facing, flip and capability. It uses the real sprite painter
  once per selection/orientation change; it adds no frame-loop work or placement side effects.
- Abilities distinguishes disabled, enabled-but-missing-prop and available toolsets using the API's
  switch/placement facts. The setup router is a disclosure with one service/catalog route. Config
  opens on three concise summaries; expanding, jumping, editing and rerendering preserve the group.
- Task Board, Outbox, Library and Agent Record links suspend the source window and provide Back.
  Conversation handoffs expose COMMS with a return shortcut. Existing drafts and scroll positions
  survive because navigation uses the window manager's minimize/restore lifecycle.
- `frontend/css/interface.css` supplies shared matte housings, recessed content and consistent
  selected/focus states through theme tokens. Narrow layouts reserve enough space for COMMS.

`node dev/interface-probe.mjs` exercises the custom seeded app without submitting any tasks or model
calls. Its 21 live checks cover portrait bounds and live skin refresh without transcript replay, truthful idle/approval filters, toolset state,
config expansion/editing, preserved drafts and return navigation, selected prop orientation, and
composer fit at 1049/700/475px. Screenshots and results are in `.worldshots/interface/`.
Station art, lighting, chair shape, movement and doorway depth were not modified by this UI pass.
