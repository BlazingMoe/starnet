'use strict';
const A = require('./_assert.js');
const { makeManagedRecoveryVerifier } = require('../sidecar/orchestration/managed-recovery-verifier.js');

(async () => {
  let calls = 0;
  const verify = makeManagedRecoveryVerifier({ adapters: {
    stripe: { async verify(req) { calls++; return { authoritative: true, verdict: 'NOT_APPLIED_CONFIRMED', reason: 'provider lookup' }; } }
  }});
  const recovery = { checkpoint: { recoveryProvider: 'stripe', recoveryProviderRef: 'pi_123' } };
  let out = await verify({ taskId: 'task-a', actionId: 'team.delegate_managed:task-a' }, recovery);
  A.eq(out.authoritative, true, 'registered provider adapter can return authoritative evidence');
  A.eq(out.verdict, 'NOT_APPLIED_CONFIRMED', 'supported authoritative verdict is preserved');
  A.eq(out.providerRef, 'pi_123', 'provider reference comes from durable checkpoint, not adapter output');
  A.eq(calls, 1, 'adapter is called exactly once');

  out = await verify({ taskId: 'task-b', actionId: 'team.delegate_managed:task-b' }, { checkpoint: {} });
  A.eq(out.authoritative, false, 'missing durable provider evidence cannot become authoritative');
  A.eq(out.verdict, 'UNKNOWN', 'missing provider evidence freezes unknown');
  A.eq(calls, 1, 'missing durable evidence never calls an adapter');

  out = await makeManagedRecoveryVerifier({ adapters: {} })(
    { taskId: 'task-c', actionId: 'team.delegate_managed:task-c' },
    { checkpoint: { recoveryProvider: 'stripe', recoveryProviderRef: 'pi_456' } }
  );
  A.eq(out.authoritative, false, 'missing adapter is not treated as provider evidence');
  A.eq(out.reason, 'recovery-provider-adapter-unavailable', 'missing adapter has stable reason');

  out = await makeManagedRecoveryVerifier({ adapters: { stripe: { async verify() { return { authoritative: true, verdict: 'invented-success' }; } } } })(
    { taskId: 'task-d', actionId: 'team.delegate_managed:task-d' },
    { checkpoint: { recoveryProvider: 'stripe', recoveryProviderRef: 'pi_789' } }
  );
  A.eq(out.authoritative, false, 'unsupported provider verdict cannot be promoted');
  A.eq(out.verdict, 'UNKNOWN', 'unsupported verdict fails closed');

  A.report('managed-recovery-verifier.test');
})().catch(error => { console.error(error); process.exitCode = 1; });
