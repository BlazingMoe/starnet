# StarNet 0.11.0 owner test candidate — 2026-09-06

The owner explicitly requested packaging 0.11.0 now for a quick manual test, with further preparation and a later release decision. That authorizes local candidate staging despite the public readiness blockers; it does not waive those blockers or authorize publication. The earlier 48-hour soak duration waiver remains recorded.

## Artifact

- Installer: `release/StarNet_0.11.0_x64-setup.exe` in the `release-0110` worktree.
- Windows x64; installer and application version metadata both **0.11.0**.
- Size: **126485028 bytes**.
- SHA-256: `721f0b42acfba41dfe5b5a43b9028e61b2e52e241b0b12d3d3822ce4a1b6239e`.
- Source: `2cfdcb04eb32b5451f2b75445ba694a075a2ebd0`; tree `a8c87eb56d7843f67de0c5184069f8c4fffd6860`.
- Application SHA-256: `92704f94d9e4715dd12afb2c5c56ba9a43ab4d2380e0587320db0297311f788c`.
- Updater signature cryptographically verified against the configured public key. **Windows Authenticode: NotSigned**; these are separate signing mechanisms.

## Verification

The normal version bumper moved all five pins together with `--no-tag`. Release notes were written, the reviewed source surface re-locked, and the full post-bump fast gate passed **727/727**, exit 0. Claims planning authority passed **37 claims / 225 locked files**. No product code changed from the previously verified `979099385` candidate.

The standard local `release-cut.mjs` completed NSIS assembly and explicit updater signing, exit 0. Build metadata shows `reproducible-source`, dirty 0, and the exact source SHA/tree above; both full identifiers are embedded in the executable. All **4269 tracked resource files** staged beside the executable match source bytes. The generated Google native registration also matches its staging copy. This is staging-file verification, not extraction or installed-runtime proof.

Evidence: `gate-0110-postbump.log`, `package-0110.log`, `release/CANDIDATE-RECEIPT.json`, `release/SHA256SUMS.txt`, and `release/TEST-0.11.0.md`. The existing installed application and station data were not modified. The owner will install and test this artifact.

## Google

The approved Desktop client was created and stored in the source repository's release secret. Gmail, Drive, Calendar, Docs, and Sheets APIs are enabled. The exact 11 unique requested scopes and factual usage explanations were saved. Branding, privacy/data-flow review, verification, and real-account consent/refresh/revocation/restart acceptance remain pending. See `GOOGLE_RELEASE_ACTIVATION_0.11.0.md`.

## Release state

No tag, push, hosted draft, publication, or public updater change occurred. Integration remains at `979099385`; this versioned candidate is on `agent/release-0110`. Documentation follow-through is separate from the immutable packaged commit. The local `latest.json` is Windows-only and must not be published as a complete multi-platform release.

Public readiness is still blocked by one QA P1, eight customer P1 records, and exact installed-candidate acceptance, plus the remaining release-train checks. Prior Guardian receipts describe `979099385`, not this versioned candidate. Signed Mac artifacts and acceptance are still owed.

The owner should export a fresh station backup before installing and test preservation, startup/restart, core work, changed UI/voice features, and a 20-minute active/idle session. If final 0.11.0 is rebuilt, this same-version test installation may require manual replacement; automatic update comparison must not be assumed to replace it.
