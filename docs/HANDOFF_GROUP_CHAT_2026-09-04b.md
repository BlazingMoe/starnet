# HANDOFF — agent group chats (state as of 2026-09-04, evening)

Read this, then `docs/HANDOFF_GROUP_DM_2026-09-04.md` (build + UI-pass detail) and, for the
bigger design, `C:\Users\andro\Desktop\gen\docs\HANDOFF_ROOMS_2026-09-04.md` (untracked on trunk).

## Where things are

| Thing | Location | State |
|---|---|---|
| Built group chat | branch `agent/group-dm-plan-0904`, worktree `C:\Users\andro\gen-trees\group-dm-plan-0904` | HEAD `18cf4c67a`, clean, `npm run test:fast` 702 GREEN (`dev/group-ui-fast.log`) |
| UI pass | `8931f86d3` + relock `18cf4c67a` | live-verified on :9137 |
| Trunk | `feat/harness-backend` @ `15eaad159` | does NOT contain any of this |
| Rooms design (bigger model) | artifact + `docs/HANDOFF_ROOMS_2026-09-04.md` | design only, nothing built |

Preview: `node dev/seed.js --keep` from the worktree, `SKYNET_PORT=9137`. Session "Group DM live
test" has NOVA, RESEARCHER, ENGINEER and the proof transcript.

## What it does (verified)

- One COMMS session, several agents on the line. Identity pill `▸ NOVA · RESEARCHER · ENGINEER ▾`
  opens the ADD AGENTS picker; `+ ADD` too. Direct chats show `+ ADD AGENTS` to convert.
- `@name` in the normal composer routes the message to that agent (autocomplete on `@`).
  Clicking a speaker's name arms `to NAME ✕` as the reply target.
- Agents hand off to each other via `group.handoff` / `group.publish` / `group.read` tools
  (sidecar/group-sessions.js). Proof: ENGINEER published a wrong file, RESEARCHER caught it,
  ENGINEER republished, RESEARCHER verified — 4 real sequential turns.
- Shared files: immutable versions ≤1 MiB, chip row `SHARED ▤ file`. Stop/resume via the normal
  Stop button. Turn state renders in the presence voice (`● NAME working`), truthful words.

## What it does NOT do (Andrew asked "works how I intend?" — these are the gaps)

1. Not merged, not in any build.
2. Agent-to-agent is a single sequential handoff. No hop cap, no `@all`, no parallel turns, no
   per-room $ cap, no origin-id loop guard. That is Rooms P2 in the Rooms handoff.
3. Unaddressed messages go to the lead (`leadId`), which is the first/previous agent.

## Andrew's locked UI law for this feature

A group chat is a NORMAL COMMS session with more names on the line. He rejected the earlier
settings-panel version. ⛔ Never reintroduce chat options, turn limits, independent-answer
switches, default-responder dropdown, session instructions, a second composer, or an extra
header row. Only active work / approvals / failures / continuation add contextual controls.

## If the next step is MERGE (ritual)

1. In the worktree: `git merge feat/harness-backend` (MERGE trunk INTO this Codex branch — never
   rebase it). Resolve conflicts here; `frontend/app/chat.js` has moved on trunk (group routing
   lives at ~:799, :1218, :1440, :6189, :6261, :7858 — keep those seams).
2. `npm run sync:website`, commit pathspecs, `node scripts/qa/product-perfect/relock-surface.mjs`
   (clean worktree required), commit the lock.
3. `npm run test:fast` green, and `npm run test:http` (new `/api/groups` route + group-sessions.js).
4. From the integration tree: `git merge agent/group-dm-plan-0904 -m "merge: agent group chats"`,
   rerun test:fast on trunk, `git tag archive/group-dm-0904`, `git merge-base --is-ancestor`
   check before reporting. No Claude co-author trailers.

## If the next step is ROOMS P2 (agents freely @mention each other)

Build ON this lane, not beside it: `sidecar/group-sessions.js` already owns membership, the
durable turn queue and handoffs. Add: origin message id + hop index per turn, `maxHops` per
origin, no-bounce (A→B→A blocked within one origin), pre-hop `roomUsd` check, honest stop line
naming the owed reply, `@all` = one capped hop per member then lead synthesizes. Laws + Hermes
references are in the Rooms handoff.

## Traps hit today

- Browser pane: `ctrl+a` + Return does NOT submit the composer; set `#chat-input.value`, dispatch
  `input`, click `#chat-send`.
- Session list refs shift after reload; re-`find` before clicking.
- `relock-surface.mjs` refuses a dirty worktree — commit first, then relock, then commit the lock.
- Codex branch: merge, never rebase (memory `codex-coexistence-merge-pattern`).
