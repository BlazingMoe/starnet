# Platform connection follow-through

Candidate: `agent/platform-handoff-0905`. This document distinguishes implemented local work from external onboarding dependencies; it is not a release-readiness claim.

## Local behavior

- A clean task run that requests a connector stores a bounded handoff on its originating workstream. Saving/reopening preserves it; a newer run, changed agent, or archived task invalidates it.
- ABILITIES shows pending tasks and offers Continue task only after connector read-back is healthy and any specifically requested tool appears in the inventory. Click rechecks health. No OAuth callback runs work automatically.
- Continuation uses the existing conversation and original connector-write idempotency scope. The backend checks the source run's agent, stream, terminal state and uncertain mutations. This covers identical successful MCP writes; changed arguments, browser actions and expired ledger entries are not an exactly-once guarantee.
- Ordinary browser tools wait up to eight seconds for the durable station profile, respecting cancellation. Contention never substitutes an unsigned temporary profile. Direct session calls fail explicitly when the profile is busy. Login waits after its existing human-consent step.
- COMMS displays a measured browser-session wait while its tool is pending. StarNet-owned persistent browsers receive a graceful shutdown before the bounded forced-stop fallback, so recent cookies can flush to disk. Attached user browsers are never closed.
- Google setup explains preview enrollment, API enablement, consent configuration and test users. Connection offers no longer promise an unverified number of clicks. New Google sign-ins ask the user to choose an account and request identity/email scopes; a bounded request to Google's fixed UserInfo endpoint records a verified email and stable subject alongside the grant. The UI and connector reader show the account at last sign-in. Failed identity reads and providers without an adapter remain unknown; pressing Done in browser login does not prove authentication.

## Remaining production onboarding dependencies

Google's official Gmail MCP remains developer-preview infrastructure requiring Google Cloud configuration:
https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server

A default sign-in flow without each user's Cloud Console setup requires a production OAuth application/service owned by StarNet, a supported redirect and credential architecture, and Google's applicable approval. Do not embed a confidential web-client secret in the public desktop application. No production OAuth project, consent application, hosted callback service or paid aggregator account was configured in this work.

The existing Composio catalog entry is an API-key bridge, not proof of a managed end-user Google onboarding flow. Evaluate and verify that integration before promoting it as a one-click default.

Chrome 136+ does not expose the default profile through remote-debugging flags:
https://developer.chrome.com/blog/remote-debugging-port

The supported existing guided route is browser.login on StarNet's persistent profile. Attaching to an explicitly prepared separate debugging profile remains advanced. A first-class personal-browser extension/bridge is separate work requiring an explicit pairing, tab-selection and revocation design; no extension was built here.

Generic MCP inventories do not establish account identity or operation-level authorization. Google's identity adapter has deterministic tests, but real Google consent/account acceptance still needs the production app. Other provider identity adapters, simultaneous multiple-account slots and operation-level permission disclosure remain follow-up work. Unknown identity must remain unknown. Google identity reference: https://developers.google.com/identity/openid-connect/reference

## Verification

Focused regression: test/platform-handoff.test.js (serialization, binding, replay scope, contention, cancellation and timeout), plus existing connector/browser suites.

Live local acceptance passed with `node dev/platform-live-proof.mjs`: the real seeded app requested Gmail, emitted the connect offer, saved its handoff, connected a mock MCP, survived a sidecar restart, and continued the original task with one run after a double click. That run called the mock MCP. No browser exceptions were recorded.

`node dev/platform-browser-proof.mjs` passed using real Chrome and a local cookie fixture: two production browser sessions shared one durable profile, the second waited without launching an unsigned browser, reused the cookie after the first browser exited, and released the lease. The original force-kill shutdown failed this check; graceful shutdown fixed it.

Receipts live under `dev/.platform-proof/` in this worktree. Full gates and installed-desktop limitations are recorded in the lane's final report; these fixtures are not third-party consent proof.
