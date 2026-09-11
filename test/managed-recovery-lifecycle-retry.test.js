'use strict';
const A = require('./_assert.js');
const { makeManagedRecoveryLifecycleHook } = require('../sidecar/orchestration/managed-recovery-lifecycle.js');

(async () => {
  let discoveryCalls = 0;
  let claimIdCalls = 0;
  let dispatchCalls = 0;

  const store = {
    listRecoveries() {
      discoveryCalls++;
      if (discoveryCalls === 1) throw new Error('temporary discovery failure');
      return { items: [], truncated: false };
    }
  };
  const registry = {
    async dispatch() {
      dispatchCalls++;
      return { ok: true, isError: false, summary: 'unexpected', content: 'unexpected' };
    }
  };

  const hook = makeManagedRecoveryLifecycleHook({
    enabled: true,
    store,
    registry,
    leadAgentId: 'lead-retry',
    claimIdFor() {
      claimIdCalls++;
      return 'claim-unused';
    }
  });

  const first = await hook({ agentId: 'lead-retry' });
  A.eq(first.ok, false, 'scheduler discovery failure is surfaced');
  A.eq(first.phase, 'preflight', 'discovery failure remains pre-execution');
  A.eq(first.reason, 'recovery-discovery-failed', 'discovery failure remains machine-readable');
  A.eq(first.executionMayHaveStarted, false, 'discovery failure cannot invent execution');

  const second = await hook({ agentId: 'lead-retry' });
  A.eq(second.ok, true, 'pure preflight failure leaves lifecycle hook retryable');
  A.eq(second.phase, 'batch', 'retry reaches scheduler after discovery recovers');
  A.eq(second.processed, 0, 'empty authoritative recovery projection performs no work');
  A.eq(discoveryCalls, 2, 'retry performs a fresh authoritative discovery');
  A.eq(claimIdCalls, 0, 'preflight retry path never invents a claim without a candidate');
  A.eq(dispatchCalls, 0, 'preflight retry path never dispatches without a candidate');

  const third = await hook({ agentId: 'lead-retry' });
  A.eq(third.skipped, true, 'successful lifecycle pass consumes the hook');
  A.eq(third.reason, 'managed-recovery-lifecycle-already-invoked', 'post-success repeat remains explicit');
  A.eq(discoveryCalls, 2, 'consumed hook does not discover again');

  A.report('managed-recovery-lifecycle-retry.test');
})().catch(error => { console.error(error); process.exitCode = 1; });
