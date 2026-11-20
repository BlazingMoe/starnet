# Reviewed setup and routing

Reviewed upstream: `tashfeenahmed/freellmapi` release `v0.16.37` and repository documentation at commit `7ad9097fd9d83bc3e1af0f925ea813a913b18dde` on 2026-11-20.

## What the gateway does

FreeLLMAPI is a self-hosted, single-user OpenAI-compatible gateway. It stores separately obtained provider keys, discovers available models, tracks free-tier limits, and retries eligible providers. Its own documentation says it is for personal experimentation and learning, has no SLA, and should not be treated as a production inference substrate.

The gateway does not create provider accounts or keys. Each connected provider keeps its own terms and limits. Do not enable a provider merely because it appears in the catalog. The reviewed upstream terms table marks Cohere unsuitable for personal use and flags several other providers as ambiguous or evaluation-only; exclude them until their current primary terms have been reviewed for this exact private-development use.

## Host requirements and placement

- Node.js `>=20.18 <25` and npm `>=10`, or Docker.
- Store the standalone gateway and its data on `F:`. Do not vendor its repository, database, keys, logs, or dependencies into StarNet.
- Bind only to `127.0.0.1`. Default server URL: `http://127.0.0.1:3001`; desktop app URL: `http://127.0.0.1:31415`.
- Pin a reviewed release instead of tracking `latest`. Preserve the release digest/provenance in the installation record.
- Set a random 32-byte `ENCRYPTION_KEY`; never commit it. Back it up separately because losing it makes stored provider keys unreadable.

## Safe setup sequence

1. Install or build the pinned gateway on `F:` using the upstream install guide. Do not use the pipe-to-shell shortcut for this project.
2. Start it on loopback and create the local dashboard account.
3. The operator chooses providers, accepts their terms, and adds keys in the local dashboard. Prefer providers whose current primary terms permit private developer use. Do not automate account creation or agreement acceptance.
4. Copy the gateway's unified key into the current process environment as `FREELLMAPI_API_KEY`; do not paste it into repository files. With the reviewed Windows desktop runtime, `--desktop-session` may instead retrieve it from the loopback-only desktop session and keep it in process memory.
5. Set `FREELLMAPI_URL=http://127.0.0.1:3001` (or the desktop loopback URL).
6. Run `npm run freellmapi:check`. It reads `/v1/models?execution_status=ready` and verifies that at least one real model is currently ready without consuming inference tokens.
7. Preview client changes with the upstream pinned CLI before any write:

   ```powershell
   npx freellmapi@0.16.37 setup-codex --url $env:FREELLMAPI_URL --profile moe-fast --model mistral-small-3.2-24b --dry-run
   npx freellmapi@0.16.37 setup-codex --url $env:FREELLMAPI_URL --profile moe-balanced --model llama-3.3-70b --dry-run
   npx freellmapi@0.16.37 setup-codex --url $env:FREELLMAPI_URL --profile moe-smart --model nemotron-3-ultra-550b --dry-run
   ```

8. Review the printed diff and timestamped-backup target. Only then repeat without `--dry-run`, or prefer `launch-codex` so credentials are injected into the child process rather than written to disk.

For a bounded draft without persisting the unified key, put the task prompt in a temporary file outside Git and run:

```powershell
node scripts/freellmapi-development.mjs --ask mechanical --prompt-file F:\path\task.txt --desktop-session
node scripts/freellmapi-development.mjs --ask implementation --prompt-file F:\path\task.txt --desktop-session
node scripts/freellmapi-development.mjs --ask architecture-review --prompt-file F:\path\task.txt --desktop-session
```

The prompt and any included code leave the computer for the routed provider. Use synthetic or deliberately selected project context, never secrets, credentials, private user data, or broad repository dumps. The result is marked `untrustedDraft` and must be reviewed before any edit.

The setup command configures Codex CLI, not an already running Codex Desktop task. Restarting this chat does not make the gateway its provider.

## Dispatch contract

| Route | Model | Suitable work | Required return |
| --- | --- | --- | --- |
| mechanical | `mistral-small-3.2-24b` (`auto:fast` fallback) | repetitive/bounded edits and prescribed checks | changed files, exact check result, unresolved items |
| implementation | `llama-3.3-70b` (`auto:balanced` fallback) | integrated feature slices | diff summary, tests/evidence, compatibility and risk notes |
| architecture-review | `nemotron-3-ultra-550b` (`auto:smart` fallback) | design, security, diagnosis, independent review | decision/risk analysis, exact evidence, required corrections |

The three preferred model IDs returned an exact bounded test response through the installed v0.16.37 desktop gateway on 2026-11-20. In the same probe, the automatic aliases were transport-healthy but some selected reasoning models placed their internal analysis in the answer body. Prefer the validated IDs while ready; use the aliases only as availability fallbacks and continue to treat every result as untrusted draft work.

Use `X-FreeLLM-Task-Type: code` where the client supports it. It is only a routing hint. Provider fallback, a ready model, or a zero-dollar response never proves correctness.

## Sources

- Repository and disclaimer: https://github.com/tashfeenahmed/freellmapi
- Install guide: https://github.com/tashfeenahmed/freellmapi/blob/main/docs/en/install/01-install.md
- Coding-agent setup: https://github.com/tashfeenahmed/freellmapi/blob/main/docs/en/clients/01-agent-clients.md
- CLI safety and commands: https://github.com/tashfeenahmed/freellmapi/blob/main/cli/README.md
- Routing and limitations: https://github.com/tashfeenahmed/freellmapi/blob/main/docs/en/api/01-rest-api.md
- Provider terms review: https://github.com/tashfeenahmed/freellmapi/blob/main/docs/en/architecture/00-high-level-index.md#terms-of-service-review
