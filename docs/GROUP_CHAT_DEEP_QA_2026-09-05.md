# Group chat deeper QA — 2026-09-05

Candidate source: `7c77971af`; source lock: `5a623a54f`.
Integrated trunk snapshot: `76b7c042eaa7fc799b232edee91c6b4a62222869`.
Worktree: `C:/Users/andro/gen-trees/group-dm-plan-0904`.

## Defects found and corrected

1. Explicit Retry after restart left the group paused and the new turn queued forever.
   Regression failed with actual queued versus expected completed. Retry now clears
   the paused/halted state after validating the retry target. Live proof: interrupted
   ENGINEER turn `8c612cc4-8cc1-4828-b9fd-1ae50a520993` was retried through the RETRY
   button; the new turn completed with RETRY COMPLETE.
2. Duplicate display names made an exact autocomplete ID ambiguous. Regression failed
   for @peer when two participants were named Peer. Exact stable IDs now take precedence;
   ambiguous display-name-only references still reject rather than guessing.
3. A stopped question could be revived in an agent's prose because the context omitted
   its canceled state. The observed older session contained exactly that reply after
   the user said hey. Context now includes the coordinator's pending/answered/canceled
   question state and explicitly explains that canceled questions need no answer.
4. A restarted service could show a raw JSON parse error for its expired browser token.
   Group requests now explain that refreshing reconnects and that conversation is saved.
   This exact message was observed after the live crash/restart.

## Additional regression coverage

`test/group-sessions.edge.test.js` is part of the fast manifest. It covers explicit
retry after persisted interruption, duplicate display names and exact IDs, canceled
question context, removing a member during a question, late-answer rejection,
wrong-group question and file access, and @all completing once per participant.
The normal group unit and real-host HTTP suites also passed independently.

## Live checks

Deep-test group: `ws_mtopse4vb5gs`, separate from the user's previous test session.
- Three chosen members created through the native picker.
- Uploaded group-shared-proof.txt using the ordinary attachment button. RESEARCHER
  invoked group.read and returned the exact answer violet. The shared preview showed
  the exact contents and hash prefix a5129e733640. Artifact persisted across restart.
- Unsent GROUP DRAFT survived switching to direct OK session and back; response stayed
  in the correct group transcript.
- Hard restart during a running ENGINEER request produced interrupted, never completed.
  RETRY actually resumed and completed, with a new turn linked to the interrupted one.
- A 1 MiB + 1-byte attachment was rejected with an actionable message, retaining both
  draft and file; no message or run was dispatched. Removed file normally afterward.
- @all produced exactly NOVA, RESEARCHER, and ENGINEER responses, attributed separately.
- Normal Stop canceled a fresh Tea/Coffee question before a subsequent status question.

## Full gates

Final full fast and HTTP checks are running sequentially against unchanged source,
using the same manifests with 1200-second outer deadlines. Logs:
`dev/group-deep-fast.log` and `dev/group-deep-http.log`.
Do not infer final green from an intermediate log; update this section on completion.

## Scope of assessment

This is feature merge-readiness QA, not an installed desktop or station-wide release
certification. Watchdog long thresholds use deterministic fault injection. Provider
outputs remain variable: tests prove routing, state and isolation, not universal model
compliance. No merge to trunk or release performed. Preview remains on port 9137 with
isolated existing scratch state; latest launcher PID 10140 (rediscover child if stopping).

Post-fix live question proof: RESEARCHER answered that no question was pending and
explicitly identified Tea/Coffee as canceled; no question card remained. Browser
warning/error log was empty. Uploaded oversized file was removed through its normal
attachment control; only the 51-byte shared proof file exists in the group's artifacts.

Full gate attempt 1 found a stale source-window assertion in agent-model-select.test.js:
load() still refreshed the header, but the test only searched its first 3600 characters.
Replaced the arbitrary window with a function-boundary match; 65 assertions passed.
Final rerun logs are `dev/group-deep-fast-final.log` and
`dev/group-deep-http-final.log`; source bytes remain unchanged from the live proof.
