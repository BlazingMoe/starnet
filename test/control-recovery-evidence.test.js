'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { projectManagedRecoveryList } = require('../sidecar/control/recovery-view.js');
const { reconcileAndPersistManagedRecovery } = require('../sidecar/orchestration/managed-recovery-transaction.js');
const { makeTaskHistoryStore } = require('../sidecar/orchestration/task-history.js');

function harness(base) {
  class Element {
    constructor(tag) { this.tagName = String(tag || '').toUpperCase(); this.children = []; this.textContent = ''; this.hidden = true; this.disabled = false; this.isConnected = true; this.attributes = {}; this.listeners = {}; this.value = ''; }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.append(node); if (this.tagName === 'SELECT' && node.selected) this.value = node.value; return node; }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    dispatch(name, event = {}) { return this.listeners[name] ? this.listeners[name](event) : undefined; }
    querySelector() { return null; }
  }
  const panel = new Element();
  let body, observe, pollInterval; const requests = [];
  const context = vm.createContext({
    document: { createElement: tag => new Element(tag), getElementById: id => id === 'control-mode-panel' ? panel : null, head: { appendChild() {} } },
    MutationObserver: class { constructor(callback) { observe = callback; } observe() {} }, setInterval: callback => { pollInterval = callback; return 1; }, clearInterval() {},
    URLSearchParams,
    Harness: { api: { get: endpoint => { requests.push(endpoint); const url = new URL(endpoint, 'http://local.test'); assert.equal(url.pathname, '/api/managed-task-recoveries'); assert.equal(url.searchParams.get('limit'), '100'); return typeof body === 'function' ? body(url) : body; } } }
  });
  vm.runInContext('window = globalThis', context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', base, 'controlrecoveries.js'), 'utf8'), context);
  panel.hidden = false;
  const text = node => [node.textContent, ...node.children.map(text)].join(' ');
  const all = node => [node, ...node.children.flatMap(all)];
  const render = async value => { body = value; await context.ControlModeRecoveries.refresh(); return text(panel); };
  render.hide = value => { panel.hidden = value; observe(); };
  render.text = () => text(panel);
  render.nodes = () => all(panel);
  render.requests = requests;
  render.setBody = value => { body = value; };
  render.click = async name => { const button = all(panel).find(node => node.tagName === 'BUTTON' && node.textContent === name); assert.ok(button, 'button exists: ' + name); return button.dispatch('click', { preventDefault() {} }); };
  render.taskRows = () => all(panel).filter(node => node.className === 'cm-action-row').map(node => node.children[0].textContent);
  render.refresh = () => context.ControlModeRecoveries.refresh();
  render.submitFilters = async (agentId, disposition) => {
    const nodes = all(panel), form = nodes.find(node => node.tagName === 'FORM'), input = nodes.find(node => node.tagName === 'INPUT'), select = nodes.find(node => node.tagName === 'SELECT');
    assert.ok(form && input && select, 'recovery filter controls exist'); input.value = agentId; select.value = disposition;
    return form.dispatch('submit', { preventDefault() {} });
  };
  render.typeAgent = value => { const input = all(panel).find(node => node.tagName === 'INPUT'); input.value = value; input.dispatch('input'); };
  render.focusAgent = () => { const input = all(panel).find(node => node.tagName === 'INPUT'); input.dispatch('focus'); return input; };
  render.poll = () => pollInterval ? pollInterval() : context.ControlModeRecoveries.refresh();
  render.moreDisabled = () => all(panel).find(node => node.tagName === 'BUTTON' && node.attributes['aria-label'] === 'Load older recovery records').disabled;
  render.agentDraft = () => all(panel).find(node => node.tagName === 'INPUT').value;
  return render;
}
const envelope = (items, hasMore = false, storageTruncated = false, nextCursor = hasMore ? 'opaque-page-cursor' : '') => ({
  ok: true,
  recoveries: projectManagedRecoveryList({ items, hasMore, storageTruncated, truncated: hasMore || storageTruncated }),
  page: { hasMore, storageTruncated, nextCursor }
});
const safe = { taskId: 'safe', disposition: 'SAFE_RESTART', executionMayHaveStarted: false };
const uncertain = { taskId: 'uncertain', disposition: 'RECONCILE_BEFORE_RETRY', executionMayHaveStarted: true };

for (const base of ['frontend/app', 'website/app/app']) {
  test(`${base}: recovery summary reflects the authoritative returned window`, async () => {
    const render = harness(base);
    const complete = await render(envelope([safe, uncertain]));
    assert.match(complete, /2 SHOWN · 1 SAFE TO RESTART · 1 DO NOT RETRY · 0 REVIEW/);
    assert.doesNotMatch(complete, /2 TOTAL/);
    const bounded = await render(envelope([uncertain], true));
    assert.match(bounded, /1 SHOWN/);
    assert.match(bounded, /Load older recovery records/);
    assert.match(bounded, /DO NOT RETRY/);
    const disk = [];
    const store = makeTaskHistoryStore({ clock: { now: () => 1000 }, io: { readAll: () => disk, append: row => disk.push(row) } });
    store.recordCheckpoint({ taskId: 'older', stage: 'contract', leadAgentId: 'lead', workerAgentId: 'worker' });
    store.recordCheckpoint({ taskId: 'newer', stage: 'dispatch', leadAgentId: 'lead', workerAgentId: 'worker' });
    const page = store.listRecoveries({}, { limit: 1 });
    const fromStore = await render({ ok: true, recoveries: projectManagedRecoveryList(page), page: { hasMore: page.hasMore, storageTruncated: page.storageTruncated, nextCursor: page.hasMore ? 'cursor' : '' } });
    assert.match(fromStore, /1 SHOWN/);
    assert.match(fromStore, /Load older recovery records/);
    const emptyBounded = await render(envelope([], false, true));
    assert.match(emptyBounded, /No recoveries are shown in the retained window/);
    assert.doesNotMatch(emptyBounded, /No managed tasks currently require recovery/);
    const emptyComplete = await render(envelope([]));
    assert.match(emptyComplete, /No managed tasks currently require recovery/);
    assert.match(emptyComplete, /OBSERVE ONLY/);
  });

  test(`${base}: missing or malformed evidence cannot claim an empty recovery queue`, async () => {
    const render = harness(base);
    const view = envelope([]).recoveries;
    for (const recoveries of [
      { ...view, rows: undefined }, { ...view, rows: {} }, { ...view, rows: [null] },
      { ...view, evidence: undefined }, { ...view, evidence: { ...view.evidence, bounded: undefined } },
      { ...view, evidence: { ...view.evidence, authoritative: false } },
      { ...view, evidence: { ...view.evidence, returnedRows: 9 } }
    ]) {
      const text = await render({ ok: true, recoveries });
      assert.match(text, /Recovery status unavailable/);
      assert.doesNotMatch(text, /RECOVERY QUEUE|No managed tasks currently require recovery/);
    }
    assert.match(await render(envelope([safe])), /1 SAFE TO RESTART/);
  });
}

for (const base of ['frontend/app', 'website/app/app']) {
  test(base + ': reopening hides old retry guidance and rejects an earlier response', async () => {
    const render = harness(base);
    await render(envelope([safe]));
    let resolveOld, calls = 0;
    const old = render(() => ++calls === 1 ? new Promise(resolve => { resolveOld = resolve; }) : envelope([uncertain]));
    render.hide(true);
    render.hide(false);
    assert.match(render.text(), /Loading current recovery evidence/);
    assert.doesNotMatch(render.text(), /SAFE TO RESTART|RECOVERY QUEUE/);
    resolveOld(envelope([safe]));
    await old;
    await Promise.resolve();
    assert.match(render.text(), /1 DO NOT RETRY/);
    assert.doesNotMatch(render.text(), /safe SAFE_RESTART/);
    assert.doesNotMatch(render.text(), /Loading current recovery evidence/);
  });
}

for (const base of ['frontend/app', 'website/app/app']) {
  test(`${base}: cursor pages remain ordered and duplicate-free when new rows arrive`, async () => {
    const render = harness(base); let firstVersion = 0;
    const responder = url => {
      const cursor = url.searchParams.get('cursor') || '';
      if (url.searchParams.get('agent') === 'worker-x') return envelope([{ ...safe, taskId: 'filtered-row' }]);
      if (!cursor) return firstVersion === 0 ? envelope([safe, uncertain], true, false, 'cursor-one')
        : envelope([{ ...safe, taskId: 'new-row' }, safe, uncertain], true, false, 'cursor-two');
      if (cursor === 'cursor-one') return envelope([{ ...safe, taskId: 'older-row' }]);
      if (cursor === 'cursor-two') return envelope([uncertain, { ...safe, taskId: 'older-two' }]);
      throw new Error('unexpected cursor');
    };
    await render(responder);
    assert.deepEqual(render.taskRows(), ['safe', 'uncertain']);
    await render.click('Load older recovery records');
    assert.deepEqual(render.taskRows(), ['safe', 'uncertain', 'older-row']);
    firstVersion = 1; await render.refresh();
    assert.deepEqual(render.taskRows(), ['new-row', 'safe', 'uncertain'], 'new first-page data clears stale older pages');
    await render.click('Load older recovery records');
    assert.deepEqual(render.taskRows(), ['new-row', 'safe', 'uncertain', 'older-two'], 'overlap from a refreshed cursor never duplicates visible tasks');
    render.typeAgent('worker-x'); await render.refresh();
    assert.equal(render.agentDraft(), 'worker-x', 'live refresh preserves unsubmitted filter context');
    const priorRequests = render.requests.length;
    await render.submitFilters('worker-x', 'SAFE_RESTART');
    const filterUrl = new URL(render.requests[priorRequests], 'http://local.test');
    assert.equal(filterUrl.searchParams.get('agent'), 'worker-x');
    assert.equal(filterUrl.searchParams.get('disposition'), 'SAFE_RESTART');
    assert.equal(filterUrl.searchParams.has('cursor'), false, 'changing filters resets the cursor');
    assert.deepEqual(render.taskRows(), ['filtered-row'], 'filter change clears previous pages and context');
  });

  test(`${base}: polling after loading an older page preserves its tail cursor`, async () => {
    const render = harness(base); let firstPageReads = 0;
    const responder = url => {
      const cursor = url.searchParams.get('cursor') || '';
      if (!cursor) { firstPageReads++; return envelope([safe], true, false, 'cursor-one'); }
      if (cursor === 'cursor-one') return envelope([{ ...safe, taskId: 'middle' }], true, false, 'cursor-two');
      if (cursor === 'cursor-two') return envelope([{ ...safe, taskId: 'oldest' }], false, false, '');
      throw new Error('unexpected cursor ' + cursor);
    };
    await render(responder);
    await render.click('Load older recovery records');
    assert.deepEqual(render.taskRows(), ['safe', 'middle']);
    assert.equal(render.moreDisabled(), false);
    await render.poll();
    assert.deepEqual(render.taskRows(), ['safe', 'middle'], 'unchanged first-page polling preserves loaded older rows');
    await render.click('Load older recovery records');
    assert.deepEqual(render.taskRows(), ['safe', 'middle', 'oldest'], 'next continuation uses the tail cursor after a poll');
    assert.equal(firstPageReads, 2, 'one periodic first-page refresh was performed');
  });

  test(`${base}: polling while editing a filter does not replace the focused control`, async () => {
    const render = harness(base);
    await render(envelope([safe]));
    const focusedInput = render.focusAgent();
    render.typeAgent('partially-typed-agent');
    const requestsBeforePoll = render.requests.length;
    await render.poll();
    assert.equal(render.requests.length, requestsBeforePoll, 'background polling pauses while a filter control has focus');
    assert.equal(render.agentDraft(), 'partially-typed-agent');
    assert.equal(render.nodes().includes(focusedInput), true, 'focused input node survives the poll interval');
  });

  test(`${base}: an in-flight poll cannot redraw after filter editing starts`, async () => {
    const render = harness(base);
    await render(envelope([safe]));
    let resolvePoll;
    render.setBody(() => new Promise(resolve => { resolvePoll = resolve; }));
    const pendingPoll = render.refresh();
    assert.equal(typeof resolvePoll, 'function', 'the periodic refresh request is in flight');
    const focusedInput = render.focusAgent();
    render.typeAgent('typed-during-poll');
    resolvePoll(envelope([{ ...safe, taskId: 'stale-poll-result' }]));
    await pendingPoll;
    assert.deepEqual(render.taskRows(), ['safe'], 'late polling data does not replace the current recovery list');
    assert.equal(render.agentDraft(), 'typed-during-poll');
    assert.equal(render.nodes().includes(focusedInput), true, 'focused input remains mounted after the late response');
  });

  test(`${base}: load more waits for an in-flight first-page refresh`, async () => {
    const render = harness(base);
    await render(envelope([safe], true, false, 'cursor-one'));
    let resolvePoll;
    render.setBody(() => new Promise(resolve => { resolvePoll = resolve; }));
    const pendingPoll = render.refresh();
    const requestsDuringPoll = render.requests.length;
    await render.click('Load older recovery records');
    assert.equal(render.requests.length, requestsDuringPoll, 'a continuation is not started alongside the first-page refresh');
    resolvePoll(envelope([{ ...safe, taskId: 'refreshed-head' }], true, false, 'cursor-new'));
    await pendingPoll;
    assert.deepEqual(render.taskRows(), ['refreshed-head']);
    assert.match(render.text(), /Load older recovery records/);
  });
}

test('frontend/app: an expired continuation clears rows and explains how to restart', async () => {
  const render = harness('frontend/app');
  await render(envelope([safe], true, false, 'cursor-expired'));
  render.setBody(() => { throw new Error('http 410'); });
  await render.click('Load older recovery records');
  assert.deepEqual(render.taskRows(), [], 'expired cursor does not leave a stale queue displayed as current');
  assert.match(render.text(), /invalid or expired.*Reload/i);
  assert.match(render.text(), /Reload recovery history/);
});

for (const base of ['frontend/app', 'website/app/app']) {
  test(base + ': confirmed execution remains explicit after recovery store reload', async () => {
    const disk = []; let now = 1000;
    const options = { io: { readAll: () => disk.slice(), append: row => disk.push(row) }, clock: { now: () => now++ } };
    const store = makeTaskHistoryStore(options);
    store.recordCheckpoint({ taskId: 'confirmed', stage: 'dispatch', leadAgentId: 'lead', workerAgentId: 'worker', objective: 'private objective' });
    const result = await reconcileAndPersistManagedRecovery({
      store, taskId: 'confirmed',
      verifyOutcome: request => ({ ...request, authoritative: true, verdict: 'APPLIED_CONFIRMED', providerRef: 'private-provider-reference' })
    });
    assert.equal(result.persisted, true);
    const reloaded = makeTaskHistoryStore(options);
    const render = harness(base);
    const page = reloaded.listRecoveries({}, { limit: 100 });
    const text = await render({ ok: true, recoveries: projectManagedRecoveryList(page), page: { hasMore: page.hasMore, storageTruncated: page.storageTruncated, nextCursor: '' } });
    assert.match(text, /1 DO NOT RETRY/);
    assert.match(text, /Authoritative evidence confirms this action was already applied/);
    assert.match(text, /does not prove the whole task is complete/);
    assert.doesNotMatch(text, /Execution may already have happened|private objective|private-provider-reference/);
    assert.equal(reloaded.claimSafeRestart('confirmed', 'forbidden').ok, false);
    assert.equal(reloaded.count(), 0);
  });
}
