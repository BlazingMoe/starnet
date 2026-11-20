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
4. Copy the gateway's unified key into the current process environment as `FREELLMAPI_API_KEY`; do not paste it into repository files.
5. Set `FREELLMAPI_URL=http://127.0.0.1:3001` (or the desktop loopback URL).
6. Run `npm run freellmapi:check`. It reads `/v1/models?execution_status=ready` and verifies that at least one real model is currently ready without consuming inference tokens.
7. Preview client changes with the upstream pinned CLI before any write:

   ```powershell
   npx freellmapi@0.16.37 setup-codex --url $env:FREELLMAPI_URL --profile moe-fast --model auto:fast --dry-run
   npx freellmapi@0.16.37 setup-codex --url $env:FREELLMAPI_URL --profile moe-balanced --model auto:balanced --dry-run
   npx freellmapi@0.16.37 setup-codex --url $env:FREELLMAPI_URL --profile moe-smart --model auto:smart --dry-run
   ```

8. Review the printed diff and timestamped-backup target. Only then repeat without `--dry-run`, or prefer `launch-codex` so credentials are injected into the child process rather than written to disk.

The setup command configures Codex CLI, not an already running Codex Desktop task. Restarting this chat does not make the gateway its provider.

## Dispatch contract

| Route | Model | Suitable work | Required return |
| --- | --- | --- | --- |
| mechanical | `auto:fast` | repetitive/bounded edits and prescribed checks | changed files, exact check result, unresolved items |
| implementation | `auto:balanced` | integrated feature slices | diff summary, tests/evidence, compatibility and risk notes |
| architecture-review | `auto:smart` | design, security, diagnosis, independent review | decision/risk analysis, exact evidence, required corrections |

Use `X-FreeLLM-Task-Type: code` where the client supports it. It is only a routing hint. Provider fallback, a ready model, or a zero-dollar response never proves correctness.

## Sources

- Repository and disclaimer: https://github.com/tashfeenahmed/freellmapi
- Install guide: https://github.com/tashfeenahmed/freellmapi/blob/main/docs/en/install/01-install.md
- Coding-agent setup: https://github.com/tashfeenahmed/freellmapi/blob/main/docs/en/clients/01-agent-clients.md
- CLI safety and commands: https://github.com/tashfeenahmed/freellmapi/blob/main/cli/README.md
- Routing and limitations: https://github.com/tashfeenahmed/freellmapi/blob/main/docs/en/api/01-rest-api.md
- Provider terms review: https://github.com/tashfeenahmed/freellmapi/blob/main/docs/en/architecture/00-high-level-index.md#terms-of-service-review
