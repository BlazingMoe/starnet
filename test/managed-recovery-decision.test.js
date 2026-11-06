'use strict';
const A = require('./_assert.js');
const { decideManagedRecovery } = require('../sidecar/orchestration/managed-recovery-decision.js');
const { managedRecoveryActionId } = require('../sidecar/orchestration/managed-recovery-identity.js');

const schema = 'moe.managed-task-checkpoint.v1';
const action = managedRecoveryActionId;

let out = decideManagedRecovery({ state: 'RESUME_REQUIRED', checkpoint: { schemaVersion: schema, taskId: 'safe', stage: 'contract' } });
A.eq(out.decision, 'RETRY_ALLOWED', 'durably pre-dispatch work may restart');
A.eq(out.retryAllowed, true, 'safe restart remains retryable');
A.eq(out.executionMayHaveStarted, false, 'safe restart preserves pre-execution proof');

out = decideManagedRecovery({ state: 'RESUME_REQUIRED', checkpoint: { schemaVersion: schema, taskId: 'claimed', stage: 'resume-claimed', recoveryClaimId: 'claim-1' } });
A.eq(out.decision, 'VERIFY_CLAIM_OWNER', 'active recovery claim must be resolved first');
A.eq(out.retryAllowed, false, 'active claim never directly retries');

function postBoundary(taskId, verdict) {
  return decideManagedRecovery(
    { state: 'RESUME_REQUIRED', checkpoint: { schemaVersion: schema, taskId, stage: 'dispatch' } },
    { taskId, actionId: action(taskId) },
    { taskId, actionId: action(taskId), authoritative: true, verdict, providerRef: 'provider:' + taskId }
  );
}

out = postBoundary('task-1', 'APPLIED_CONFIRMED');
A.eq(out.decision, 'CONTINUE_CONFIRMED', 'confirmed applied action continues without replay');
A.eq(out.retryAllowed, false, 'confirmed applied action cannot retry');
A.eq(out.outcome, 'APPLIED_CONFIRMED', 'applied outcome is explicit');

out = postBoundary('task-2', 'NOT_APPLIED_CONFIRMED');
A.eq(out.decision, 'RETRY_ALLOWED', 'authoritative not-applied outcome permits retry');
A.eq(out.retryAllowed, true, 'not-applied confirmation is the only post-boundary retry path');

out = postBoundary('task-3', 'PENDING');
A.eq(out.decision, 'FREEZE_UNKNOWN', 'unknown authoritative outcome freezes task');
A.eq(out.retryAllowed, false, 'unknown outcome never retries');

out = decideManagedRecovery(
  { state: 'RESUME_REQUIRED', checkpoint: { schemaVersion: schema, taskId: 'task-a', stage: 'dispatch' } },
  { taskId: 'task-b', actionId: action('task-b') },
  { taskId: 'task-b', actionId: action('task-b'), authoritative: true, verdict: 'NOT_APPLIED_CONFIRMED' }
);
A.eq(out.decision, 'FREEZE_UNKNOWN', 'evidence for another task cannot release this task');
A.eq(out.retryAllowed, false, 'cross-task evidence freezes retry');

out = decideManagedRecovery(
  { state: 'RESUME_REQUIRED', checkpoint: { schemaVersion: schema, taskId: 'task-a', stage: 'dispatch' } },
  { taskId: 'task-a', actionId: 'caller-invented-action' },
  { taskId: 'task-a', actionId: 'caller-invented-action', authoritative: true, verdict: 'NOT_APPLIED_CONFIRMED' }
);
A.eq(out.decision, 'FREEZE_UNKNOWN', 'caller cannot substitute an arbitrary action identity');
A.eq(out.reason, 'reconciliation-request-action-mismatch', 'action mismatch is explicit');
A.eq(out.retryAllowed, false, 'arbitrary action evidence never permits retry');

out = decideManagedRecovery({ state: 'RESUME_REQUIRED', checkpoint: { schemaVersion: schema, taskId: '', stage: 'dispatch' } }, { taskId: '', actionId: '' }, {});
A.eq(out.decision, 'FREEZE_UNKNOWN', 'missing durable task identity remains unknown');
A.eq(out.retryAllowed, false, 'missing durable identity never permits retry');

out = decideManagedRecovery({ state: 'UNKNOWN_TASK' });
A.eq(out.decision, 'BLOCKED_NO_EVIDENCE', 'missing durable evidence stays blocked');
A.eq(out.retryAllowed, false, 'missing evidence never retries');

A.report('managed-recovery-decision.test');
