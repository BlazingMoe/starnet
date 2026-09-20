'use strict';
const A = require('./_assert.js');
const { managedRecoveryReconciliation } = require('../sidecar/orchestration/managed-recovery-reconciliation.js');

const terminal = managedRecoveryReconciliation({ state: 'TERMINAL', terminal: { taskId: 'done' } });
A.eq(terminal.action, 'NONE_TERMINAL', 'terminal tasks require no recovery action');
A.eq(terminal.retryAllowed, false, 'terminal tasks are never replayed');

const unknown = managedRecoveryReconciliation({ state: 'UNKNOWN_TASK' });
A.eq(unknown.ok, false, 'missing durable evidence blocks reconciliation');
A.eq(unknown.action, 'BLOCKED_NO_EVIDENCE', 'unknown task stays explicitly blocked');
A.eq(unknown.executionMayHaveStarted, null, 'unknown evidence must not invent execution state');

const safe = managedRecoveryReconciliation({
  state: 'RESUME_REQUIRED',
  checkpoint: { taskId: 'safe', stage: 'contract' }
});
A.eq(safe.action, 'SAFE_RESTART', 'pre-dispatch contract is safe to restart');
A.eq(safe.retryAllowed, true, 'only durable pre-dispatch state permits replay');
A.eq(safe.executionMayHaveStarted, false, 'pre-dispatch state proves execution did not start');

const claimed = managedRecoveryReconciliation({
  state: 'RESUME_REQUIRED',
  checkpoint: { taskId: 'claimed', stage: 'resume-claimed', recoveryClaimId: 'claim-1' }
});
A.eq(claimed.action, 'VERIFY_CLAIM_OWNER', 'active durable claim must be resolved before replay');
A.eq(claimed.retryAllowed, false, 'claim presence blocks automatic retry');
A.eq(claimed.executionMayHaveStarted, false, 'unfenced claim does not imply tool execution');
A.eq(claimed.claimId, 'claim-1', 'reconciliation preserves durable claim identity');

for (const stage of ['dispatch', 'revision', 'formal-review', 'audit', 'accepted']) {
  const uncertain = managedRecoveryReconciliation({
    state: 'RESUME_REQUIRED',
    checkpoint: { taskId: 'task-' + stage, stage }
  });
  A.eq(uncertain.action, 'VERIFY_AUTHORITATIVE_OUTCOME', stage + ' requires authoritative outcome verification');
  A.eq(uncertain.retryAllowed, false, stage + ' cannot be automatically retried');
  A.eq(uncertain.executionMayHaveStarted, true, stage + ' conservatively preserves possible execution');
}

A.report('managed-recovery-reconciliation.test');
