# Per-agent voices and macOS microphone packaging

Branch: `agent/voice-agents-mac-0906`, based on `3d31e373e`.
Source commits: `d65f8f538` (Mac packaging), `3d3c1ff12` (agent voices).
No integration merge, installer build, or publication.

## Behavior

Settings → Live Voice now selects the station default or an individual stable agent ID.
Assignments are saved in this app/browser, independently of agent names and personalities.
Assigned voices use the built-in TTS route for spoken direct replies and hands-free calls.
Each live speaker retains its voice/engine for the call; an explicit assignment change applies
on a new call. Direct conversations with specialists can speak; other sessions cannot borrow
an active conversation's speaker. Clearing an assignment restores existing station behavior.

The Mac hardened-runtime entitlement now includes `com.apple.security.device.audio-input`.
The existing microphone purpose string remains. Release CI validates both in the actual signed
app, and microphone-denied copy directs desktop users to their system privacy settings.
Customer report: `qa/bugs/8a553481-mac-desktop-microphone-blocked-while-browser-mir.md`.

## Live evidence

Boot: `node dev/seed.js --keep`, isolated worktree, port 9196, no provider credential.
Used the running application's actual Settings controls to summon a test crew member and select:

- NOVA → BELLA, selected button `aria-pressed=true`.
- VOICE TEST → GEORGE, selected button `aria-pressed=true`.
- Station default → ONYX, unchanged by either agent assignment.

Stopped and restarted the sidecar with `--keep`, reloaded the browser, reopened Settings,
and observed BELLA and GEORGE still selected for their respective agents. Clearing NOVA's
assignment selected ONYX and disabled the clear button; restored BELLA for review.
The page reported no browser warning/error logs. New controls had no native white/grey paint.

Authenticated requests to the real running `/api/tts` with the same text, `Voice check.`,
returned HTTP 200 `audio/wav`, `X-Voice-Provider: local-kokoro`, and distinct audio bytes:

| Voice | Bytes | SHA-256 |
| --- | ---: | --- |
| af_bella | 153644 | cdfc35033c715c88e1807091ab1d95cfd8b1051ec89a6c964cee0930c01790b8 |
| bm_george | 153644 | 07ad46a87f1b2865eb447f4e465022ecb488700eebe015eafe2e582d2634c14e |

This proves synthesis returned different files, not human listening or physical microphone capture.

## Validation

- Touched JavaScript syntax checks: passed.
- Desktop voice bundle regression: passed; original entitlement file lacks the required key.
- Voice button behavior: 118 assertions passed, including two speakers, rename stability,
  reload persistence, per-agent live pins, new-call adoption, fallback, bound-session identity,
  Mac recovery text, and failed-storage honesty.
- Live voice UI regression: passed.
- `npm run test:fast`: 725/725 steps, exit 0.
- `npm run qa:customer-journeys`: 29/29 steps, exit 0.
- `npm run test:http`: 101/101 steps, exit 0.

## Remaining verification

This Windows host cannot establish signed macOS WKWebView microphone behavior. The next
Mac candidate must prove allow/deny/reset/restart for Speak and Hands-Free Mic on Apple Silicon,
with the artifact version/hash recorded. The customer symptom remains open and recovery
unconfirmed. No installed desktop, real microphone, or human auditory comparison was verified.
