# Google account sign-in

> **Moe AI Station private-fork note:** the active deployment target is one private operator.
> Use an OAuth Desktop app registration from a Google Cloud project you control as described in
> `MOE_PRIVATE_OPERATOR_RUNBOOK.md`. The public-publisher activation material below remains
> inherited reference only unless redistribution becomes a future goal.

The operator uses **Sign in with Google**, chooses an account, and approves the listed
permissions. No customer creates a Cloud project, enrolls in an MCP preview, or
enters a client ID, client secret, or API key. The default browser handles consent;
the desktop sidecar receives the loopback callback using state and PKCE S256.

StarNet implements MCP tools locally over the stable Gmail, Drive, Calendar, Docs,
and Sheets APIs. Account tokens stay in the existing protected connector store on
the user's computer. Refresh and reconnect use the existing single-flight OAuth
lifecycle. Agent permission checks still apply to tools, including sending drafts.

## Publisher activation (once for StarNet)

1. Use a StarNet-owned Google Cloud project. Enable Gmail, Drive, Calendar, Docs,
   and Sheets APIs. These are the stable product APIs, not the preview MCP APIs.
2. Configure the Google consent app with StarNet's verified branding, support
   contact, privacy policy, and domains. Select an external audience for public users.
3. Register a **Desktop app** OAuth client. Download its `installed` JSON. A Web
   application client is confidential and must never be embedded in this package;
   staging explicitly rejects that client type. Google native applications cannot
   keep a client secret confidential; PKCE protects each authorization exchange.
4. Request Google's verification for the scopes listed in `sidecar/mcp/catalog.js`.
   Gmail read/compose and broad Drive access have additional verification
   requirements. Testing mode and its limited users/token lifetimes do not establish
   public availability. Complete Google's applicable review before release.
5. Store the installed client JSON in the release repository's Actions secret
   `STARNET_GOOGLE_DESKTOP_CLIENT_JSON`. The public release train stages it into
   `sidecar/mcp/google-client.json`; that generated file is included in the Tauri
   sidecar bundle. Missing/malformed/confidential registrations fail the build.
   This secret setting is a publisher workflow, not a customer setup task.
6. With an approved registration, prove a real external account: sign in, enumerate
   Gmail tools, search and read a known message, create a disposable draft, restart
   StarNet, force expiry in a disposable test workspace, and confirm refresh works.
   Send only to an explicitly authorized test recipient. Test denial, revoked
   access, disconnect, and each Workspace service on the actual signed installer.

For local development, supply the same publisher JSON through the process
environment, or run `node scripts/stage-google-client.mjs`. Do not commit that
generated file. Without a registration, developer builds show a truthful
unavailable state and explain that StarNet must enable the feature. They never
redirect this responsibility to the customer.

## Compatibility and capabilities

Existing manually configured Google Web clients and grants continue to work.
Existing preview MCP connections stay untouched until the user signs in again;
reauthorization moves that catalog connection to the stable API adapter only after
tokens have been durably saved. A failed or cancelled attempt preserves the old grant.
Each service is authorized independently; signing into Gmail does not silently
grant access to Drive or another Google account. Each card can therefore use a
different Google account. Simultaneous accounts within one service remain outside
this change's scope.

Gmail supports search, message/thread/attachment reading, label discovery, reversible
read/unread and inbox/archive state, explicit label changes, structured compose drafts,
thread-safe sender reply drafts, advanced raw drafts and explicit draft sending.
Calendar supports calendar/event reads, free/busy checks, event creation, partial
event updates, deletion, and RSVP changes for the signed-in account's own `self:true`
attendee entry. Drive supports metadata/search, Google Workspace text exports, bounded
text/Markdown/CSV/JSON content reads, one-request text artifact creation, text-content
replacement and metadata updates; `drive.file` limits which files StarNet can modify.
Docs support read/create, simple end-of-document text append and advanced batch updates.
Sheets support read/create, range writes, table-row append and advanced structural batch
updates. Tools return real API errors; there is no simulated connection state. Responses
are bounded to 8 MiB and requests to 2 MiB.

References: [Google native OAuth](https://developers.google.com/identity/protocols/oauth2/native-app),
[Google OAuth verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

## Evidence boundary

Automated mocked-provider tests establish protocol and persistence behavior; they
cannot establish Google approval or access by arbitrary public accounts. Until
the publisher registration and real signed-installer acceptance are recorded,
public Google sign-in remains unverified.
