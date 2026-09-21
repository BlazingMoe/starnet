'use strict';
const A = require('./_assert.js');
const { decideManagedRecovery } = require('../sidecar/orchestration/managed-recovery-decision.js');

const schema = 'moe.managed-task-checkpoint.v1';

let out = decideManagedRecovery({
  state: 'RESUME_REQUIRED',
  checkpoint: { schemaVersion: schema, taskId: 'safe', stage: 'contract' }
});
A.eq(out.decision, 'RETRY_ALLOWED', 'durably pre-dispatch work may restart');
A.eq(out.retryAllowed, true, 'safe restart remains retryable');
A.eq(out.executionMayHaveStarted, false, 'safe restart preserves pre-execution proof');

out = decideManagedRecovery({
  state: 'RESUME_REQUIRED',
  checkpoint: { schemaVersion: schema, taskId: 'claimed', stage: 'resume-claimed', recoveryClaimId: 'claim-1' }
});
A.eq(out.decision, 'VERIFY_CLAIM_OWNER', 'active recovery claim must be resolved first');
A.eq(out.retryAllowed, false, 'active claim never directly retries');

out = decideManagedRecovery({
  state: 'RESUME_REQUIRED',
  checkpoint: { schemaVersion: schema, taskId: 'task-1', stage: 'dispatch' }
}, { taskId: 'task-1', actionId: 'action-1' }, {
  taskId: 'task-1', actionId: 'action-1', authoritative: true,
  verdict: 'APPLIED_CONFIRMED', providerRef: 'provider:1'
});
A.eq(out.decision, 'CONTINUE_CONFIRMED', 'confirmed applied action continues without replay');
A.eq(out.retryAllowed, false, 'confirmed applied action cannot retry');
A.eq(out.outcome, 'APPLIED_CONFIRMED', 'applied outcome is explicit');

out = decideManagedRecovery({
  state: 'RESUME_REQUIRED',
  checkpoint: { schemaVersion: schema, taskId: 'task-2', stage: 'dispatch' }
}, { taskId: 'task-2', actionId: 'action-2' }, {
  taskId: 'task-2', actionId: 'action-2', authoritative: true,
  verdict: 'NOT_APPLIED_CONFIRMED', providerRef: 'provider:2'
});
A.eq(out.decision, 'RETRY_ALLOWED', 'authoritative not-applied outcome permits retry');
A.eq(out.retryAllowed, true, 'not-applied confirmation is the only post-boundary retry path');
A.eq(out.outcome, 'NOT_APPLIED_CONFIRMED', 'not-applied outcome is explicit');

out = decideManagedRecovery({
  state: 'RESUME_REQUIRED',
  checkpoint: { schemaVersion: schema, taskId: 'task-3', stage: 'dispatch' }
}, { taskId: 'task-3', actionId: 'action-3' }, {
  taskId: 'task-3', actionId: 'action-3', authoritative: true,
  verdict: 'PENDING'
});
A.eq(out.decision, 'FREEZE_UNKNOWN', 'unknown authoritative outcome freezes task');
A.eq(out.retryAllowed, false, 'unknown outcome never retries');
A.eq(out.outcome, 'UNKNOWN', 'uncertainty remains explicit');

out = decideManagedRecovery({ state: 'UNKNOWN_TASK' });
A.eq(out.decision, 'BLOCKED_NO_EVIDENCE', 'missing durable evidence stays blocked');
A.eq(out.retryAllowed, false, 'missing evidence never retries');

A.report('managed-recovery-decision.test');
