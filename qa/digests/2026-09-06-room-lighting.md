# Room lighting — isolated source repair

Branch: `agent/room-lighting-overhaul`, based on `07a643772`.
Implementation: `7e570a506`.

The owner compared a broadly lit telescope room with a wood-floor mancave whose centered light and dark edges were preferred. Room fixture columns now grow at twice the row pitch; rows sit at cell centers instead of hugging the north/south walls. Radius follows both cell dimensions, and the independent room fill is centered with less reach. Ambient exposure, intensity controls, physical falloff curve, room color, corridor lighting, window spill and prop emissions are preserved. The website renderer mirror is synchronized. No conveyor UI or shared contract file changed.

Live proof: `node dev/seed.js --keep` at `127.0.0.1:9186`, then `node dev/room-lighting-proof.mjs before` / `after`. The baseline intercepts only the renderer source from the starting commit; the seeded backend remains live. Six rectangular room sizes were baked in the running Chromium page and sampled at the center, left/right sides and lower corner. Furnished 18x14 telescope and 12x18 plank/walnut scenes were loaded into the actual World renderer and captured over CRT and animated prop accents. These reconstruct the reference composition; they are not the owner's actual save.

| Room | Fixtures before → after | Center transmission before → after | Corner transmission before → after |
| --- | --- | --- | --- |
| 9x7 | 1 → 1 | .773 → .784 | .290 → .286 |
| 14x9 | 1 → 1 | .745 → .784 | .196 → .247 |
| 18x18 | 4 → 2 | .553 → .773 | .580 → .196 |
| 24x16 | 6 → 2 | .659 → .784 | .655 → .173 |
| 12x24 | 3 → 3 | .784 → .788 | .416 → .357 |
| 40x30 | 20 → 6 | .757 → .553 | .698 → .227 |

Transmission is one minus sampled lightmap alpha, not screenshot luminance. All after cases have at least .20 separation between the center and every sampled perimeter point. The 40x30 center loses some overlapping light but retains distinct separation from the edges. Not every point becomes darker: that is intentional redistribution rather than global dimming.

Local artifacts: `.worldshots/room-lighting/{before,after}.json`, `{before,after}-telescope.png`, `{before,after}-wood.png`, six individual bake PNG pairs, and `test-fast.log`.

Focused checks: `stationbake.chunk` 49 assertions; `simulation-lighting` 39 assertions; syntax and diff whitespace checks pass. Full fast-gate receipt pending. The initial gate lacked `ogg-opus-decoder` because the assigned worktree had no node_modules; `npm ci --ignore-scripts` installed the lockfile dependencies before retry.

Limits: no installed-desktop test, owner recovery, irregular multi-rectangle visual proof, or live build-preview check. The seed had no provider credential and reported an unavailable replay model; no agent execution was claimed. No integration merge, push, deployment or release.
