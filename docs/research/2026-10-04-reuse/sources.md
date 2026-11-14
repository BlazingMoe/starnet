# Reuse research sources

Checked 2026-10-04 by Codex through public web retrieval. This is engineering research, not output from a live Moe agent run. Publication dates are unknown unless stated. Repository descriptions establish advertised capabilities, not tested interoperability.

## S1 — GPT Researcher
https://github.com/assafelovic/gpt-researcher

The README documents web/local research, reports with citations, a Python package, and MCP client support for research data sources. GitHub identifies Apache-2.0 licensing. These support evaluating a bounded research adapter; they do not demonstrate a ready-made Moe integration or an MCP server interface. Runtime, dependency, license-notice and provider-cost review remain open.

## S2 — Open Deep Research
https://github.com/langchain-ai/open_deep_research

The repository documents configurable research and report stages, model/search providers and evaluation scripts. GitHub marks it archived on 2026-08-21 and identifies MIT licensing. Useful as an implementation/evaluation reference; maintenance is a reason against adopting it as a new core runtime.

## S3 — Microsoft Agent Framework
https://github.com/microsoft/agent-framework

The README describes agent orchestration, workflow patterns and durability, with Python/.NET implementations and a linked Go SDK. GitHub identifies MIT licensing. This is an architectural reference, not evidence that replacement of Moe's Node runtime would be cheaper or better.

## S4 — Original StarNet and forks
https://github.com/androoAGI/starnet
https://github.com/androoAGI/starnet/forks

Original StarNet remains the directly related implementation source. No independently expanded fork meeting Moe's full objective was verified in this search. The fork-page retrieval was insufficient for a complete inventory and the connector rejected the forks API endpoint. This is an evidence gap, not a claim that suitable forks do not exist.

## S5 — Local execution evidence
../../MOE_LIFE_BUSINESS_AUTOMATION.md
../../../test/harness.integration.test.js

The repository's decision-dossier recipe and shared registry/loop/filesystem integration were inspected. The extended deterministic integration test passed 194 assertions, including four dossier files, read-back tool results and cold journal reconstruction. Model and web responses are fixtures. Probes to standard loopback ports 8787 and 11434 returned ECONNREFUSED; other endpoints and credential readiness were not established.

## S6 — StarNet upstream comparison (2026-10-16)
https://github.com/androoAGI/starnet
https://github.com/androoAGI/starnet/compare/e0a36dcd31787248b877aea01a6e53741012bc46...54899e5ff3f2b002b457757916b3977818db6fc1

GitHub API metadata identifies `feat/harness-backend` as the default branch, current head `54899e5ff3f2b002b457757916b3977818db6fc1`, pushed 2026-10-13, MIT, and not archived. The compare endpoint says the reviewed base `e0a36dcd31787248b877aea01a6e53741012bc46` is the merge base and upstream is 340 commits ahead. The local checkout is at `8f9d2f692cd2e4852352de794d6367ed69e1f868`, clean before this documentation update. A local `git fetch origin --dry-run` could not reach GitHub, so remote immutability was checked via the GitHub connector, not the configured git remote.

The upstream changes were screened against the remaining provider, launch/consent, and routine seams. The provider-auth state module and current Codex provider expose no bounded provider-discovery fix to transplant; the launch smoke limitation remains lack of an active sidecar/provider session. Scheduler behavior already present locally includes per-run iteration and USD caps, explicit unattended grants, tool-family restrictions, run-now floor-room resolution, and target-agent roster config. Upstream adds a `routine-toolsets.js` normalization layer (family IDs, displayed labels, and tool names; strict create/update plus lenient stored-job repair) that is absent locally. Local creation accepts a free-text “allowed toolsets” field, while enforcement intersects only exact capability family IDs. Thus a label/tool-name entry can silently restrict a routine to its free tools. This is a concrete UX reliability seam, not an authorization bypass: normalization must remain restriction-only and unknown stored entries must never widen prior restrictions. No code was ported because safely matching this workspace requires auditing both API and built-in routine create/update paths, persisted legacy jobs, and dynamic connector families; a narrow patch at only one ingress would leave inconsistent behavior. Relevant upstream source at the recorded head: `sidecar/routine-toolsets.js`; related scheduler precedent: commit `dbed8f3a70e08ba1162ba744e64eeab7b3ea7004` aligns Run Now's room with scheduled execution, behavior already present locally.
