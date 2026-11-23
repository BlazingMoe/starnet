/* node test/cron.chain.test.js — A ROUTINE FIRES A WORK LINE, NOT JUST A RUN.

   A routine fires at ONE dock. If the Commander drew stages downstream of that dock, those stages ARE the
   routine ("every morning research it, then write it up"). This locks the cron-driver's advanceChain seam:
     · the line runs AFTER the job's own run settles but BEFORE finishFire, so the routine's recorded outcome
       and its session transcript carry the LINE's answer, never stage one's raw material;
     · each hop renews the lease — a line that outran the heartbeat would be swept as a zombie and re-fired;
     · A CHAIN FAILURE NEVER CHANGES THE ROUTINE'S OUTCOME (stage one really did run and really did work). */
'use strict';
const A = require('./_assert.js');
const { makeClock } = require('../shared/clock-rng.js');
const cron = require('../sidecar/cron.js');
const cronStore = require('../sidecar/cron-store.js');
const { makeCronDriver } = require('../sidecar/cron-driver.js');
const { redact } = require('../sidecar/context.js');

const T0 = 1700000000000;
const flush = () => new Promise(r => setImmediate(r));

function setup(opts) {
  opts = opts || {};
  const clock = makeClock(T0);
  const schedule = cron.parseSchedule('every 1m', T0);
  const jobSpecs = Array.isArray(opts.jobs) ? opts.jobs : [{ id: 'j1', prompt: 'research the thing', agentId: 'researcher', unattendedGrants: opts.grants, runsLine: opts.runsLine }];
  let store = jobSpecs.map(spec => cronStore.makeJob(Object.assign({ schedule }, spec), { id: spec.id, now: T0 }));
  const events = [], runs = [], chainCalls = [];
  let idN = 0;
  const driver = makeCronDriver({
    getJobs: () => store, setJobs: (j) => { store = j; return true; },
    runOnce: (o) => new Promise((resolve, reject) => { runs.push({ opts: o, resolve, reject }); }),
    emit: (name, payload) => events.push({ name, payload }),
    newId: () => 'run-' + (++idN), newAbort: () => new AbortController(), now: () => clock.now(),
    getKey: () => 'sk-test', defaultModel: 'test/model', persona: 'PERSONA', maxRunMs: 480000,
    advanceChain: opts.advanceChain ? (o) => { chainCalls.push(o); return opts.advanceChain(o); } : undefined,
    stageBriefFor: opts.stageBriefFor
  });
  return { driver, clock, events, runs, chainCalls, getJob: (id) => cronStore.getJob(store, id) };
}
const lastOf = (events, name) => { const m = events.filter(e => e.name === name); return m.length ? m[m.length - 1].payload : undefined; };
// fire the due job and settle its run with `reply`
async function fireAndSettle(s, reply) {
  s.clock.set(T0 + 60000);
  s.driver.applyTick(s.clock.now());
  A.eq(s.runs.length, 1, 'the routine fired one run');
  s.runs[0].opts.emit('agent.token', { delta: reply });
  s.runs[0].opts.emit('agent.run.end', { reason: 'done' });
  s.runs[0].resolve();
  await flush(); await flush(); await flush();
}

(async function () {

  /* ---- the line's answer replaces stage one's, and the routine still settles OK ---- */
  {
    const s = setup({ advanceChain: async () => ({ text: 'THE FINISHED WRITE-UP', hops: [{ agentId: 'writer' }], stopped: null }) });
    await fireAndSettle(s, 'raw findings about the thing');
    A.eq(s.chainCalls.length, 1, 'the work line was advanced once');
    A.eq(s.chainCalls[0].agentId, 'researcher', "starting at the routine's own dock");
    A.eq(s.chainCalls[0].text, 'raw findings about the thing', "handed stage one's real output");
    A.eq(s.chainCalls[0].originalText, 'research the thing', "and the routine's own prompt as the original ask");
    A.eq(s.chainCalls[0].streamId, 'cron-run-1', "hops ride the ROUTINE's stream so its session shows the whole line");
    A.eq(lastOf(s.events, 'cron.result').outcome, 'ok', 'the routine settles ok');
    A.eq(s.getJob('j1').lastStatus, 'ok', 'and its durable record is clean');
  }

  /* ---- decision metadata reaches the same structured cron.result as the delivered line ---- */
  {
    const decisions = [{ kind: 'filter', outcome: 'route', lane: 'N' }];
    const s = setup({ advanceChain: async () => ({ text: 'line answer', hops: [], stopped: 'budget', decisions, decisionsTruncated: false }) });
    await fireAndSettle(s, 'entry answer');
    const result = lastOf(s.events, 'cron.result');
    A.eq(result.workflowDecisions[0].outcome, 'route', 'the structured result exposes the returned route choice');
    A.eq(result.workflowDecisionsTruncated, false, 'a complete small trace says it is complete');
    A.eq(result.outcome, 'ok', 'planned routing remains separate from the routine outcome');
    A.eq(result.workflowDecisions[0].lane, 'N', 'a budget-stopped line still exposes its decision without claiming the hop ran');
  }

  /* ---- consumer projection repeats trace bounds and drops unrecognized/unbounded row data ---- */
  {
    const excessive = Array.from({ length: 65 }, () => ({ kind: 'route', outcome: 'route', agent: 'w'.repeat(120), agents: Array.from({ length: 17 }, (_, i) => 'branch-' + i), prompt: 'never carry this' }));
    const s = setup({ advanceChain: async () => ({ text: 'line answer', decisions: excessive }) });
    await fireAndSettle(s, 'entry answer');
    const result = lastOf(s.events, 'cron.result');
    A.eq(result.workflowDecisions.length, 64, 'the consumer caps output at the chain hard limit');
    A.eq(result.workflowDecisions[0].agent.length, 80, 'untrusted identifiers are length bounded again at the event seam');
    A.eq(result.workflowDecisions[0].agents.length, 16, 'fan-out agent identifiers are capped at sixteen');
    A.ok(result.workflowDecisionsTruncated, 'overflow and identifier truncation are disclosed');
    A.ok(!Object.prototype.hasOwnProperty.call(result.workflowDecisions[0], 'prompt'), 'arbitrary decision fields are excluded');
    const egress = redact({ workflowDecisions: [{ kind: 'route', outcome: 'route', agent: 'writer api_key=secret-12345' }] });
    A.ok(!egress.workflowDecisions[0].agent.includes('secret-12345'), 'the same existing structural redactor used by cronEmit scrubs trace strings');
  }

  /* ---- a second fire on the same driver cannot inherit the first fire's trace ---- */
  {
    let call = 0;
    const s = setup({ advanceChain: async () => (++call === 1
      ? { text: 'first line', decisions: [{ kind: 'route', outcome: 'route', agent: 'first-only' }] }
      : { text: 'second line' }) });
    await fireAndSettle(s, 'first entry');
    s.clock.set(T0 + 120000);
    s.driver.applyTick(s.clock.now());
    A.eq(s.runs.length, 2, 'the same driver fires the next schedule window');
    s.runs[1].opts.emit('agent.token', { delta: 'second entry' });
    s.runs[1].opts.emit('agent.run.end', { reason: 'done' });
    s.runs[1].resolve();
    await flush(); await flush(); await flush();
    const results = s.events.filter(e => e.name === 'cron.result').map(e => e.payload);
    A.eq(results.length, 2, 'both sequential fires emitted one result');
    A.eq(results[0].workflowDecisions[0].agent, 'first-only', 'the first fire retains its own trace');
    A.ok(!Object.prototype.hasOwnProperty.call(results[1], 'workflowDecisions'), 'the second no-trace fire does not inherit it');
  }

  /* ---- overlapping jobs settling in reverse order keep trace attached to each run/job ---- */
  {
    const pending = Object.create(null);
    const s = setup({
      jobs: [
        { id: 'j1', prompt: 'first prompt', agentId: 'first', runsLine: true },
        { id: 'j2', prompt: 'second prompt', agentId: 'second', runsLine: true }
      ],
      advanceChain: o => new Promise(resolve => { pending[o.agentId] = resolve; })
    });
    s.clock.set(T0 + 60000);
    s.driver.applyTick(s.clock.now());
    A.eq(s.runs.length, 2, 'one driver launches both jobs concurrently');
    for (const run of s.runs) {
      run.opts.emit('agent.token', { delta: run.opts.agentId + ' entry' });
      run.opts.emit('agent.run.end', { reason: 'done' });
      run.resolve();
    }
    await flush(); await flush(); await flush();
    A.ok(pending.first && pending.second, 'both lines are active at once');
    pending.second({ text: 'second line', decisions: [{ kind: 'route', outcome: 'route', agent: 'second-target' }] });
    await flush(); await flush();
    pending.first({ text: 'first line', decisions: [{ kind: 'route', outcome: 'route', agent: 'first-target' }] });
    await flush(); await flush();
    const byJob = Object.fromEntries(s.events.filter(e => e.name === 'cron.result').map(e => [e.payload.jobId, e.payload]));
    const fired = Object.fromEntries(s.events.filter(e => e.name === 'cron.fire').map(e => [e.payload.jobId, e.payload.runId]));
    A.eq(byJob.j1.workflowDecisions[0].agent, 'first-target', 'reverse settlement keeps j1 trace on j1');
    A.eq(byJob.j2.workflowDecisions[0].agent, 'second-target', 'reverse settlement keeps j2 trace on j2');
    A.eq(byJob.j1.runId, fired.j1, 'j1 result keeps its firing runId');
    A.eq(byJob.j2.runId, fired.j2, 'j2 result keeps its firing runId');
  }

  /* ---- no trace from an old/alternate chain seam leaves the historical event shape intact ---- */
  {
    const s = setup({ advanceChain: async () => ({ text: 'line answer', hops: [], stopped: null }) });
    await fireAndSettle(s, 'entry answer');
    const result = lastOf(s.events, 'cron.result');
    A.ok(!Object.prototype.hasOwnProperty.call(result, 'workflowDecisions'), 'trace fields are omitted when absent');
    A.ok(!Object.prototype.hasOwnProperty.call(result, 'workflowDecisionsTruncated'), 'the truncation field is omitted too');
  }

  /* ---- a TRUNCATED entry run buys no hops: the line advances only on reason 'done' ---- */
  // max_turns/budget/missing-terminal set no errMsg, yet finishFire records them as failures. The old gate
  // read only errMsg+buf, so a truncated run spent real money on every downstream hop over partial stage-one
  // material — and then the routine was recorded failed anyway.
  {
    const s = setup({ advanceChain: async () => ({ text: 'SHOULD NEVER RUN', hops: [{}], stopped: null }) });
    s.clock.set(T0 + 60000);
    s.driver.applyTick(s.clock.now());
    A.eq(s.runs.length, 1, 'the routine fired one run');
    s.runs[0].opts.emit('agent.token', { delta: 'partial material before the ceiling' });
    s.runs[0].opts.emit('agent.run.end', { reason: 'max_turns' });
    s.runs[0].resolve();
    await flush(); await flush(); await flush();
    A.eq(s.chainCalls.length, 0, 'a max_turns entry run advances NO downstream hop');
    A.eq(lastOf(s.events, 'cron.result').outcome, 'failed', 'and the routine settles as the failure finishFire already judged it');
  }

  /* ---- the lease is renewed per hop: a long line must not be swept as a zombie ---- */
  {
    let renewed = 0;
    const s = setup({ advanceChain: async (o) => { o.onHop(); o.onHop(); renewed = 2; return { text: 'done', hops: [{}, {}], stopped: null }; } });
    await fireAndSettle(s, 'stage one');
    A.eq(renewed, 2, 'every hop got an onHop callback to renew the lease');
    A.eq(lastOf(s.events, 'cron.result').outcome, 'ok', 'the run settled normally, not as a stale lease');
  }

  /* ---- the driver hands the seam the ENTRY run's reconciled spend (2026-08-10 audit): the chain's $
     ceiling covers the WHOLE line, so advanceChain must know what stage one already cost. ---- */
  {
    const s = setup({ advanceChain: async () => ({ text: 'line done', hops: [{ agentId: 'writer' }], stopped: null }) });
    s.clock.set(T0 + 60000);
    s.driver.applyTick(s.clock.now());
    A.eq(s.runs.length, 1, 'the routine fired one run');
    s.runs[0].opts.emit('agent.token', { delta: 'stage one work' });
    s.runs[0].opts.emit('agent.run.end', { reason: 'done', usd: 0.42 });
    s.runs[0].resolve();
    await flush(); await flush(); await flush();
    A.eq(s.chainCalls.length, 1, 'the line advanced');
    A.eq(s.chainCalls[0].entryUsd, 0.42, "the seam carries stage one's reconciled spend into the chain's ceiling");
  }

  /* ---- A CHAIN FAILURE NEVER CHANGES THE ROUTINE'S OUTCOME ---- */
  {
    const s = setup({ advanceChain: async () => { throw new Error('downstream exploded'); } });
    await fireAndSettle(s, 'stage one really worked');
    A.eq(lastOf(s.events, 'cron.result').outcome, 'ok', 'stage one really ran and really produced work — the routine is ok');
    A.eq(s.getJob('j1').lastStatus, 'ok', 'the durable record agrees');
  }

  /* ---- a line that returns nothing leaves stage one's answer alone ---- */
  {
    const s = setup({ advanceChain: async () => ({ text: '   ', hops: [], stopped: 'x' }) });
    await fireAndSettle(s, 'stage one output');
    A.eq(lastOf(s.events, 'cron.result').outcome, 'ok', 'an empty line never blanks the routine');
  }

  /* ---- GRANTS NEVER FLOW DOWN A LINE (2026-08-04): the unattended grant the Commander recorded names ONE
     agent — the routine's own dock. Stage one runs with it; every downstream hop runs UNGRANTED, so drawing
     a belt to another dock can never silently extend terminal/verify authority onto a different agent. ---- */
  {
    const s = setup({ grants: ['workbench'], advanceChain: async () => ({ text: 'line done', hops: [{ agentId: 'writer' }], stopped: null }) });
    await fireAndSettle(s, 'stage one output');
    A.eq(s.runs[0].opts.unattendedGrants, ['workbench'], "stage one (the routine's own agent) keeps the recorded grant");
    A.eq(s.chainCalls.length, 1, 'the line still advanced');
    A.eq(s.chainCalls[0].unattendedGrants, [], 'the advanceChain seam is handed an EMPTY grants list — hops never inherit authority');
    A.eq(lastOf(s.events, 'cron.result').outcome, 'ok', 'and the routine still settles ok');
  }

  /* ---- THE DOCK'S STANDING BRIEF RIDES A SCHEDULED ENTRY RUN (inbox-trigger, 2026-08-05). A routine's
     fire was the ONE entry-run path that never briefed its dock: the same agent ran WITH its standing brief
     from a routed message (hub.js) and WITHOUT it from a routine. The driver now asks the injected
     stageBriefFor(agentId) — index.js wires router.stageBrief, the same seam the hub and chain handoffs
     read — and appends the brief to the run's SYSTEM under the hub's exact section header. Prompt text
     only: grants/tools/messages are untouched. ---- */
  {
    const s = setup({ stageBriefFor: (aid) => (aid === 'researcher' ? 'Dig three primary sources, cite them.' : null) });
    await fireAndSettle(s, 'stage one output');
    A.eq(s.runs[0].opts.system, 'PERSONA\n\nYOUR STANDING BRIEF FOR THIS STATION:\nDig three primary sources, cite them.',
      "the entry run's system carries the dock's standing brief under the hub's exact section header");
    A.eq(s.runs[0].opts.messages[0].content, 'research the thing', 'the brief rides SYSTEM — the user message is untouched');
    A.eq(s.runs[0].opts.unattendedGrants, [], 'and a brief never smuggles grants');
    A.eq(lastOf(s.events, 'cron.result').outcome, 'ok', 'the routine settles ok');
  }

  /* ---- no seam / no brief -> the exact pre-brief system string (byte-identical) ---- */
  {
    const s = setup({});
    await fireAndSettle(s, 'plain');
    A.eq(s.runs[0].opts.system, 'PERSONA', 'no stageBriefFor seam -> pre-brief system, byte-identical');
  }
  {
    const s = setup({ stageBriefFor: () => null });
    await fireAndSettle(s, 'plain');
    A.eq(s.runs[0].opts.system, 'PERSONA', 'a seam with no brief for this dock -> pre-brief system, byte-identical');
  }

  /* ---- a THROWING brief seam never kills the fire (a brief is an enhancement, not a gate) ---- */
  {
    const s = setup({ stageBriefFor: () => { throw new Error('boom'); } });
    await fireAndSettle(s, 'still works');
    A.eq(s.runs[0].opts.system, 'PERSONA', 'a throwing brief seam degrades to the pre-brief system');
    A.eq(lastOf(s.events, 'cron.result').outcome, 'ok', 'and the routine still settles ok');
  }

  /* ---- NO advanceChain injected = today's single-run routine, untouched ---- */
  {
    const s = setup({});
    await fireAndSettle(s, 'just the one stage');
    A.eq(s.chainCalls.length, 0, 'no chain seam, no chain');
    A.eq(lastOf(s.events, 'cron.result').outcome, 'ok', 'and the routine behaves exactly as before');
  }

  /* ---- a FAILED stage-one run never advances a line (nothing real to hand on) ---- */
  {
    const s = setup({ advanceChain: async () => ({ text: 'should never happen', hops: [{}] }) });
    s.clock.set(T0 + 60000);
    s.driver.applyTick(s.clock.now());
    s.runs[0].opts.emit('agent.run.error', { message: 'provider down' });
    s.runs[0].resolve();
    await flush(); await flush(); await flush();
    A.eq(s.chainCalls.length, 0, 'a failed stage one hands nothing downstream');
    A.eq(lastOf(s.events, 'cron.result').outcome, 'failed', 'and the routine reports the failure honestly');
  }

  /* ---- ONLY A ROUTINE THAT BELONGS TO THE LINE RUNS THE LINE ----
     Work belongs to a line (Andrew's ruling, 2026-08-07). Deciding that from the DOCK alone was a money bug:
     a routine created months before the workflow existed started buying a run per drawn stage the instant its
     agent was crewed onto a line — and the text it delivered became the LAST stage's output instead of its own
     answer. So the intent is durable and OPT-IN (`runsLine` on the job record, set only by the INBOX trigger
     zone's create), and its ABSENCE is terminal. Wired here exactly as the composition root does
     (sidecar/index.js: `lineId: o.runsLine === true ? router.lineOfAgent(o.agentId) : null`), over the REAL
     router and the REAL chain runner, so this proves the semantics rather than a mock's opinion of them. */
  {
    const Pipeline = require('../frontend/app/pipeline.js');
    const { makeRouter } = require('../sidecar/routing/router.js');
    const { makeChainRunner } = require('../sidecar/routing/chain.js');
    const belt = (x, y, dir) => ({ x, y, dir });
    const router = makeRouter();
    A.ok(router.setPlan(Pipeline.compileRoutingPlan({
      props: [{ id: 'i', t: 'intake', x: 0, y: 0, w: 1, h: 1 },
              { id: 'b1', t: 'bay', x: 4, y: 0, w: 1, h: 1, agentId: 'researcher' },
              { id: 'b2', t: 'bay', x: 7, y: 0, w: 1, h: 1, agentId: 'writer' }],
      belts: [belt(1, 0, 'E'), belt(2, 0, 'E'), belt(3, 0, 'E'), belt(5, 0, 'E'), belt(6, 0, 'E')]
    })).ok, 'the routine floor deploys');

    const hopRuns = [];
    const chain = makeChainRunner({
      nextAgent: (a, ctx) => router.chainNext(a, ctx),
      runAgent: async (h) => { hopRuns.push(h.agentId); return { text: h.agentId + ' output' }; },
      now: () => 0
    });
    // the EXACT shape index.js injects, quoted so the two cannot drift apart unnoticed
    const advanceChain = (o) => chain.advance({
      agentId: o.agentId, text: o.text, originalText: o.originalText, signal: o.signal,
      lineId: o.runsLine === true ? router.lineOfAgent(o.agentId) : null,
      runAgent: async (h) => { hopRuns.push(h.agentId); return { text: h.agentId + ' output' }; }
    });

    /* A PRE-EXISTING ROUTINE AT A DOCKED AGENT SPENDS EXACTLY ONE PROVIDER CALL. This is the money case:
       the job was created before the line was ever drawn, so it carries no marker. Its own run happens; the
       drawn stages downstream do NOT, and the answer delivered is the routine's own. */
    {
      const s = setup({ advanceChain });
      A.eq(s.getJob('j1').runsLine, false, 'a routine created without the marker is TERMINAL by default');
      await fireAndSettle(s, 'raw findings about the thing');
      A.eq(s.runs.length, 1, 'PROVIDER CALLS: exactly ONE — the routine\'s own run');
      A.eq(s.chainCalls[0].runsLine, false, 'the driver hands the seam the durable flag, never a guess from the dock');
      A.eq(hopRuns.length, 0, '…and ZERO downstream: a routine that predates the workflow never buys its stages');
      A.eq(lastOf(s.events, 'cron.result').outcome, 'ok', 'the routine still settles ok');
      A.eq(s.getJob('j1').lastOutput, 'raw findings about the thing', "and DELIVERS ITS OWN answer, not a later stage's");
    }

    /* THE SAME FLOOR, THE SAME DOCK — with the marker the Commander set by creating it from the line's
       INBOX trigger zone. Now the routine IS the line's trigger and the drawn stages run. */
    {
      hopRuns.length = 0;
      const s = setup({ advanceChain, runsLine: true });
      A.eq(s.getJob('j1').runsLine, true, 'the INBOX-created routine carries the durable marker');
      await fireAndSettle(s, 'raw findings about the thing');
      A.eq(s.chainCalls[0].runsLine, true, 'the driver passes it through');
      A.eq(hopRuns, ['writer'], "a routine that BELONGS to the line runs that line's next stage");
      A.eq(s.getJob('j1').lastOutput, 'writer output', "and the line's answer is what the routine delivers");
      const result = lastOf(s.events, 'cron.result');
      A.ok(Array.isArray(result.workflowDecisions) && result.workflowDecisions.length > 0, 'the real chain decision reaches the caller-facing cron.result');
      A.eq(result.workflowDecisions[0].kind, 'route', 'the real router route is visible to the structured consumer');
    }

    {
      hopRuns.length = 0;
      const budgetAdvanceChain = (o) => chain.advance({
        agentId: o.agentId, text: o.text, originalText: o.originalText,
        lineId: o.runsLine === true ? router.lineOfAgent(o.agentId) : null,
        entryUsd: 0.01, limits: { maxUsdPerMessage: 0.01 },
        runAgent: async (h) => { hopRuns.push(h.agentId); return { text: h.agentId + ' output' }; }
      });
      const s = setup({ advanceChain: budgetAdvanceChain, runsLine: true });
      await fireAndSettle(s, 'raw findings about the thing');
      const result = lastOf(s.events, 'cron.result');
      A.eq(hopRuns.length, 0, 'the real chain budget stop prevents the selected route from executing');
      A.ok(result.workflowDecisions.some(d => d.kind === 'route' && d.agent === 'writer'), 'the real budget-stopped chain still delivers its planned route decision');
      A.eq(result.outcome, 'ok', 'the entry routine outcome remains distinct from the planned downstream route');
    }

    // a MARKED routine at an agent that crews NO dock: no line to run, and nothing downstream is bought
    hopRuns.length = 0;
    A.eq(router.lineOfAgent('freelancer'), null, 'an undocked agent belongs to no line');
    const off = await chain.advance({ agentId: 'freelancer', text: 'raw findings', lineId: router.lineOfAgent('freelancer') });
    A.eq(off.hops.length, 0, 'so even a marked routine there is terminal');
    A.eq(hopRuns.length, 0, 'PROVIDER CALLS: zero — a routine can never spend on a line it is not on');
  }

  /* ---- THE MARKER IS DURABLE AND CANNOT BE FAKED BY A TRUTHY VALUE ---- */
  {
    const schedule = cron.parseSchedule('every 1m', T0);
    const mk = v => cronStore.makeJob({ id: 'j', prompt: 'p', agentId: 'a', schedule, runsLine: v }, { id: 'j', now: T0 });
    A.eq(mk(undefined).runsLine, false, 'absent -> false (a routine made anywhere else stays terminal)');
    A.eq(mk('yes').runsLine, false, 'a truthy STRING cannot buy a work line');
    A.eq(mk(1).runsLine, false, 'nor can a truthy number');
    A.eq(mk(true).runsLine, true, 'only a literal true opts in');
    let jobs = [mk(undefined)];
    jobs = cronStore.updateJob(jobs, 'j', { runsLine: true }, { now: T0 });
    A.eq(cronStore.getJob(jobs, 'j').runsLine, true, 'and it is an EDITABLE field, so the console can turn it on');
    jobs = cronStore.updateJob(jobs, 'j', { runsLine: 'nope' }, { now: T0 });
    A.eq(cronStore.getJob(jobs, 'j').runsLine, false, 'a patch is re-normalized through the same === true rule');
  }

  A.report('cron.chain');
})();
