# Paid first-run execution — 2026-09-05

Implementation: `c364e991d`; synchronized with integration `46b944c11` in `19d5c4e03`.
This is a source verification campaign, not an installed release/customer-recovery verdict.

## Proven repairs

- Delayed pairing and boot keychain recovery both restored the link after explicit unlink.
  Both failed against the original running sidecar, then passed after generation fencing
  and serialized disk mutations, including restart.
- A balance request waiting on activity returned the old account's zero after unlink.
  It failed before the repair; the route now discards superseded identity/balance/history.
  An old link's delayed balance verification also cannot clear a newer funded link.
- Persistence failure after the cloud's one-shot confirmation can retry from the server-side
  pending handoff. No token is exposed to the page. Unlink tombstones outrank leftover files;
  whoami's timeout now covers the body as well as connection/headers.
- Optimistic admission holds retain a separate service-observed balance and timestamp for
  display and diagnostics. Admission still accounts for the reservation.
- Copied diagnostics include link/auth state, token source as observed (no unverified OS
  durability claim), hashed account identity, balance/time, source commit when known, active
  screen, and local-run/relay/upstream correlation. Request IDs precede long error text so
  truncation cannot drop the normal correlation pair. Raw provider metadata is excluded.

## Verification

`test/paid-link-lifecycle.e2e.test.js`: six real-sidecar scenarios passed, including funded
link/diagnostic persistence, account switching, and a controlled managed HTTP 400 whose
local/relay/upstream correlation survives both diagnostic truncation and restart.
Registered in HTTP and customer campaigns.
Focused unit results: credits 113 assertions; link 95; diagnostics 47; compatible provider 83.
The customer campaign now explicitly includes credit/link unit regressions as well.

Live browser: the source station opened at :18857 via `node dev/seed.js --keep`; the failure
action copied the expanded report. On the separate :18859 mock-provider station, SETTINGS
-> RUNTIME -> COPY DIAGNOSTICS confirmed copy and included `app screen: screen-game`.
LIVE DOCTOR at 2026-09-05T23:04:24Z reported two round-trip-proven rows: selected local mock
provider (21ms), effective local execution sentinel (97ms), zero failed. Its six unconfigured
connector/channel rows remained explicitly unconfigured. The canned tool-write launcher
hit a checkpoint timeout while the compiler exhausted memory; its canned completion sentence
is not successful file-write evidence. The HTTP customer matrix supplies real tool-read,
second-inference and output assertions separately.

Initial fast gate found absent npm dependencies in the fresh worktree. `npm ci --no-audit
--no-fund` installed the locked dependencies. Initial HTTP gate failed the unrelated
`threads.e2e` no-manifest scenario during build load; isolated retry passed 21 assertions.
Windows compilation first failed with rustc/LLVM out-of-memory; retry uses one compiler job.
The next fast run exposed the generated website mirror's diagnostics drift; `npm run
sync:website` updated that one generated file (zero removals), and its focused gate passed.
The next HTTP run hit `nightshift-focus.e2e`'s legacy restart port collision; isolated rerun
passed all 62 assertions. Neither failed full run is counted as green.

Customer campaign: **29/29 suites GREEN**, exit 0. Windows release-profile build succeeded
with `CARGO_BUILD_JOBS=1` and `npm run tauri -- build --no-bundle` (6m12s).
Artifact: `src-tauri/target/release/skynet-desktop.exe`, 16,177,664 bytes, unsigned.
SHA256: `105fb8f098d501950e2f77cdef3dce206bae7c90e19610cf44430b2bdaa01c1a`.
Build stamp: `46b0badf8b5cf2342fd79b0f0cb3b03d30de67df`, dirty=0,
tree `e63eb7b3d44b54f05a91e9dd23797a129a751dbf`, reproducible-source.
Later changes are documentation and the generated website copy only; this is a compiled
candidate, **not** a bundled installer, signing, installed launch or customer verification.
The two task-owned dev stations were stopped; their scratch evidence was retained.

`qa:ready` returned **NOT READY**: six open customer P1s plus missing Guardian, journey-corps,
Beginner and installed-exe smoke stamps in this fresh worktree. No status was promoted.
Final fast/HTTP and integration outcomes follow after completion.

## Outstanding customer evidence

The three customer reports remain open. None is installer-verified or customer-confirmed
by this work. Apple Silicon hardware/keychain behavior is unavailable here. Fresh GitHub API
evidence for issue 6 confirms Windows x64 v0.10.13 and managed Sonnet, but the generic HTTP
400 still lacks a production correlation. Fly.io log access is unauthenticated on this host.
No production deployment, release publication, customer account modification or support
message was performed. The owner was asked asynchronously for an authenticated environment
and test Mac while local work continued.
