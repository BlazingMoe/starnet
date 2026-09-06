# Three room lighting levels

Settings > Appearance > Room Lighting offers LOW, MEDIUM and HIGH. LOW preserves the approved room lighting exactly. MEDIUM and HIGH reduce ambient darkness from .82 to .72 and .62 respectively; fixture positions, radius, falloff, warmth and the .06 animated glow remain unchanged. Selection applies immediately, persists in the existing browser settings store and is included in station backup settings. Old or invalid values resolve to LOW.

Source commit `3da7b2d11`, fingerprints refreshed at `68997fdd5`. The full `npm run test:fast` gate passed all 723 steps, exit 0. Evidence: `.worldshots/room-lighting-settings/test-fast.log`.

Live seeded preview at http://127.0.0.1:9197/: all three controls changed the actual lightmap, with mean transmission .519 / .574 / .631 on the user's preview station. Lamp positions and radius were identical between levels, and glow stayed .06. Selection and aria-pressed state survived reload for every level; native Enter activated the focused button. Controls used station theme colors. HIGH also survived a graceful browser close and a sidecar restart, then the test profile was restored to LOW. The first restart probe force-killed Chrome before its disk flush; rerunning with graceful browser shutdown verified durable persistence.

Reproducible UI proof: `node dev/room-lighting-settings-proof.mjs`. Additional restart receipt and Low/Medium/High room screenshots are under `.worldshots/room-lighting-settings/`. The local preview is retained. This follow-up is committed on `agent/room-lighting-strip`; it is not merged into trunk or packaged in an installer.
