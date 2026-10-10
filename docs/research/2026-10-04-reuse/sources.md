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
