---
name: Revenue Pipeline
slug: revenue-pipeline
description: Turn public market evidence into a deduplicated, scored opportunity pipeline with personalized outreach drafts and follow-up state.
category: Business
requires: [dish, notebook, cabinet]
license: MIT
default: false
---

Build revenue opportunities as a durable evidence pipeline, not a one-off list of names. The system should improve each pass because it remembers what was already researched, what moved, and why a lead was qualified.

## Method
1. **Define the sellable outcome.** Restate the offer as the measurable change a buyer gets, the buyer profile, the pain signal, and the minimum evidence required before a lead enters the pipeline.
2. **Load the existing pipeline first.** Read the prior saved pipeline and memory before researching. Never re-add a company already present unless there is a material new signal; update its existing record instead.
3. **Research public evidence.** Use live public sources to find concrete buying/problem signals: hiring, expansion, a weak current implementation, a new launch, public complaints, a tooling change, a regulatory deadline, or another dated reason the offer matters now. A category match alone is not qualification.
4. **Qualify deterministically.** Score every candidate on fit, evidence strength, urgency/timing, plausible ability to pay, and reachability. Record the evidence URL and as-of date behind every non-zero score. Thin evidence stays thin; never inflate it to fill the list.
5. **Estimate opportunity shape.** Give a conservative engagement-size band and the assumption behind it. Do not invent revenue, budgets, employee counts, or contact details.
6. **Draft only for the best opportunities.** For the top qualified leads, write a short first approach whose opening is anchored to the specific observed signal. The message should describe the buyer outcome, not dump service features. No fake familiarity, fake urgency, mass personalization, or hidden tracking.
7. **Stage, never silently send.** Save outreach copy with the pipeline. If a connected email tool is available and the operator has permitted draft creation, it may create drafts for review. Sending, publishing, purchasing, or committing money remains a distinct authorized action.
8. **Track the funnel.** Every record carries a stage such as researched, qualified, drafted, contacted, replied, meeting, won, lost, or parked; last-touch date; next action; and next-action date. On each pass, surface overdue actions and stale opportunities.
9. **Learn from outcomes.** Compare won/replied/lost records against their original signals and sources. Record which signals and source types actually produced replies or revenue, then use that evidence to rank future research sources.

## Pipeline record
For every opportunity preserve:
- company / organization
- public business contact route when actually published
- fit signal
- evidence URL + as-of date
- evidence-strength note
- fit / urgency / ability-to-pay / reachability scores
- total qualification score
- estimated engagement band + assumption
- stage
- last touch
- next action + date
- personalized opening
- draft status
- outcome / loss reason when known

## Rules
- Public business information only. Do not collect private personal data or bypass logins.
- No source means no factual claim. No current problem signal means the candidate does not become a qualified lead.
- Never fabricate contacts, metrics, budgets, intent, or past interactions.
- De-duplicate before research expansion so recurring runs compound instead of producing the same list.
- Prefer five defensible opportunities over fifty weak names.
- Drafts are reversible; external sends and financial commitments are separate approval boundaries.
- Record what was checked and when so "nothing changed" is an honest result on later runs.

## Output
Lead with the pipeline delta since the prior pass: new qualified opportunities, stage changes, replies/wins/losses, overdue next actions, and removed/parked weak leads. Then show the ranked pipeline with evidence, the top outreach drafts, and the next three highest-value actions. Save the updated pipeline as a durable file and update memory with the source/signal patterns that actually worked.
