'use strict';
const A = require('./_assert.js');
const { reconcileAuthoritativeOutcome } = require('../sidecar/orchestration/managed-recovery-outcome.js');

const req = { taskId: 'task-1', actionId: 'action-1' };

let out = reconcileAuthoritativeOutcome(req, {
  taskId: 'task-1', actionId: 'action-1', authoritative: true,
  verdict: 'APPLIED_CONFIRMED', providerRef: 'order:123'
});
A.eq(out.ok, true, 'authoritative applied evidence is accepted');
A.eq(out.outcome, 'APPLIED_CONFIRMED', 'applied evidence remains explicit');
A.eq(out.retryAllowed, false, 'confirmed applied side effect cannot be retried');
A.eq(out.providerRef, 'order:123', 'provider reference is preserved');

out = reconcileAuthoritativeOutcome(req, {
  taskId: 'task-1', actionId: 'action-1', authoritative: true,
  verdict: 'NOT_APPLIED_CONFIRMED', providerRef: 'lookup:456'
});
A.eq(out.ok, true, 'authoritative not-applied evidence is accepted');
A.eq(out.outcome, 'NOT_APPLIED_CONFIRMED', 'not-applied evidence remains explicit');
A.eq(out.retryAllowed, true, 'retry is allowed only after authoritative not-applied confirmation');

out = reconcileAuthoritativeOutcome(req, {
  taskId: 'task-1', actionId: 'action-1', authoritative: false,
  verdict: 'NOT_APPLIED_CONFIRMED'
});
A.eq(out.outcome, 'UNKNOWN', 'non-authoritative evidence never permits retry');
A.eq(out.retryAllowed, false, 'non-authoritative evidence freezes retry');

out = reconcileAuthoritativeOutcome(req, {
  taskId: 'task-1', actionId: 'different-action', authoritative: true,
  verdict: 'NOT_APPLIED_CONFIRMED'
});
A.eq(out.outcome, 'UNKNOWN', 'mismatched action evidence cannot reconcile another action');
A.eq(out.retryAllowed, false, 'identity mismatch freezes retry');

out = reconcileAuthoritativeOutcome(req, {
  taskId: 'task-1', actionId: 'action-1', authoritative: true,
  verdict: 'PENDING'
});
A.eq(out.outcome, 'UNKNOWN', 'provider uncertainty remains unknown');
A.eq(out.retryAllowed, false, 'unknown provider outcome freezes retry');

out = reconcileAuthoritativeOutcome({}, {});
A.eq(out.outcome, 'UNKNOWN', 'missing reconciliation identity remains unknown');
A.eq(out.retryAllowed, false, 'missing identity never permits retry');

A.report('managed-recovery-outcome.test');
