---
name: freellmapi-development-routing
description: Prepare or use the optional local FreeLLMAPI gateway for private StarNet development, including three task-quality routes, readiness checks, and evidence-based review. Trigger when work names FreeLLMAPI, free model routing, longer low-cost development, or the project's external-model development profiles. Do not use this skill to claim that a current Codex Desktop session, subscription limit, or product provider has changed.
---

# FreeLLMAPI development routing

Use this skill only for the optional external development route. FreeLLMAPI is a local single-user gateway, not a model and not a replacement for the current Codex Desktop runtime.

Before setup or routing work, read [references/setup-and-routing.md](references/setup-and-routing.md). Re-check upstream documentation before changing the pinned reviewed version, endpoints, client configuration, provider eligibility, or security assumptions.

## Three development routes

Classify a task by consequence, not by its size alone:

1. **Mechanical (`auto:fast`)** — bounded repetitive edits, inventories, fixture maintenance, formatting, and prescribed checks. Give exact files and a concrete success test.
2. **Implementation (`auto:balanced`)** — ordinary feature work with explicit ownership, integration constraints, and proportionate tests. Require the worker to return the actual diff, test evidence, and blockers.
3. **Architecture and review (`auto:smart`)** — security boundaries, consequential design, cross-component correctness, diagnosis of ambiguous failures, and review of lower-tier work. The primary project lead still owns final acceptance, commit, push, and CI interpretation.

The virtual routes rank all enabled eligible models that the local gateway reports as usable. They do not call every catalog model for every task, and catalog presence is not evidence of a working key, free capacity, quality, or terms eligibility.

## Reliability contract

- Run `npm run freellmapi:check` before assigning work. It performs model discovery only; it never sends a prompt. A missing key, unreachable gateway, zero ready models, or malformed response is a stop condition.
- Give each worker one bounded responsibility and one observable definition of done. Do not split sequential work or let two workers edit the same files.
- Treat model output as untrusted draft work. Inspect the actual files and rerun the project's ordinary gates. A fluent answer, fallback, or multi-model synthesis is not validation.
- Never silently downgrade architecture/security/final review to a fast route. If the smart route is unavailable, keep the work pending or use the primary lead.
- Never promise unlimited or permanently free capacity. Providers can change quotas, availability, models, pricing, and terms without notice.
- Keep provider and unified keys out of Git, prompts, logs, command arguments, saved notes, and worker outputs. Use the gateway's local encrypted store and process environment only.
- Keep the gateway on loopback. Do not expose it to a LAN or the internet, add accounts, accept provider terms, or enable paid routes without separate operator action.

## Scope boundary

This skill prepares private development delegation only. It does not activate a FreeLLMAPI provider inside Moe AI Station. Product integration remains a separate roadmap item requiring current provider-term review, privacy/data-flow review, truthful cost and usage accounting, failure isolation, explicit opt-in, and authenticated acceptance.
