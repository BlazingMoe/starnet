'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { projectManagedRecovery } = require('../sidecar/control/recovery-view.js');

function harness(base) {
  const nodes = [];
  class Element {
    constructor() { this.children = []; this.textContent = ''; this.isConnected = true; this.classList = { add() {}, remove() {} }; nodes.push(this); }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.append(child); return child; }
    replaceChildren(...children) { this.children = children; }
    setAttribute() {}
    addEventListener(type, handler) { this[type] = handler; }
    focus() { context.document.activeElement = this; }
  }
  let read;
  const context = vm.createContext({
    document: { createElement: () => new Element(), getElementById: () => null,
      querySelector: () => null, addEventListener() {}, head: new Element(), body: new Element() },
    ControlModeView: { project() {} },
    Harness: { api: { get: url => { assert.match(url, /^\/api\/managed-tasks\//); return read(url); } } },
    setInterval: () => 1, clearInterval() {}
  });
  vm.runInContext('window = globalThis', context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', base, 'controlmode.js'), 'utf8'), context);
  const text = node => [node.textContent, ...node.children.map(text)].join(' ');
  return { button: label => nodes.findLast(n => n.textContent === label), context, Element, ui: context.ControlModeUI, read: fn => { read = fn; }, text: () => text(nodes.find(n => n.id === 'cm-task-detail')) };
}
const recovery = projectManagedRecovery({ taskId: 'task-1', executionMayHaveStarted: true, disposition: 'RECONCILE_BEFORE_RETRY' });

for (const base of ['frontend/app', 'website/app/app']) {
  test(`${base}: recovery warning survives a failed history lookup`, async () => {
    const h = harness(base);
    h.read(() => Promise.reject(new Error('private failure')));
    await h.ui.inspectTask('task-1', null, recovery);
    assert.match(h.text(), /DO NOT RETRY/);
    assert.ok(h.text().includes(recovery.nextMove));
    assert.match(h.text(), /Task history could not be loaded/);
    assert.match(h.text(), /Recovery status when opened/);
    assert.doesNotMatch(h.text(), /private failure/);
    await h.ui.inspectTask('other-task', null, recovery);
    assert.doesNotMatch(h.text(), /DO NOT RETRY/);
  });
  test(`${base}: older requests cannot replace the selected task's evidence`, async () => {
    const h = harness(base);
    let rejectOld;
    h.read(() => new Promise((resolve, reject) => { rejectOld = reject; }));
    const old = h.ui.inspectTask('task-1', null, recovery);
    h.read(() => ({ ok: true, taskId: 'task-2', history: [] }));
    await h.ui.inspectTask('task-2', null, { ...recovery, taskId: 'task-2', operatorState: 'REVIEW' });
    rejectOld(new Error('late failure')); await old;
    assert.match(h.text(), /task-2/);
    assert.match(h.text(), /REVIEW/);
    assert.doesNotMatch(h.text(), /DO NOT RETRY|Task history could not be loaded/);
  });
}

for (const base of ['frontend/app', 'website/app/app']) {
  test(base + ': closing supports dialog focus handoff and ordinary focus return', () => {
    const h = harness(base);
    const trigger = new h.Element();
    const scheduleInput = new h.Element();
    trigger.focus();
    h.ui.open();
    scheduleInput.focus();
    h.ui.close({ restoreFocus: false });
    assert.equal(h.context.document.activeElement, scheduleInput);
    assert.equal(h.ui.panel.hidden, true);
    trigger.focus();
    h.ui.open();
    h.ui.close();
    assert.equal(h.context.document.activeElement, trigger);
  });
}

for (const base of ['frontend/app', 'website/app/app']) {
  test(base + ': task detail rejects invalid envelopes and foreign task rows', async () => {
    const h = harness(base);
    for (const body of [null, {}, { ok: false, error: 'private diagnostic' },
      { ok: true, taskId: 'other-task', history: [{ taskId: 'other-task', objective: 'foreign objective' }] },
      { ok: true, taskId: 'task-1', history: [{ taskId: 'other-task', objective: 'foreign objective' }] },
      { ok: true, taskId: 'task-1', history: [null] },
      { ok: true, taskId: 'task-1', history: {} }
    ]) {
      h.read(() => body);
      await h.ui.inspectTask('task-1', null, recovery);
      assert.match(h.text(), /Task history could not be loaded/);
      assert.match(h.text(), /DO NOT RETRY/);
      assert.doesNotMatch(h.text(), /foreign objective|private diagnostic|No durable history is available/);
    }
    h.read(() => ({ ok: true, taskId: 'task-1', history: [{ taskId: 'task-1', objective: 'verified objective', status: 'accepted' }] }));
    await h.ui.inspectTask('task-1', null, recovery);
    assert.match(h.text(), /verified objective/);
    assert.doesNotMatch(h.text(), /Task history could not be loaded/);
    h.read(() => ({ ok: true, taskId: 'task-1', history: [] }));
    await h.ui.inspectTask('task-1', null, recovery);
    assert.match(h.text(), /No durable history is available/);
  });
}

for (const base of ['frontend/app', 'website/app/app']) {
  test(base + ': detail makes retained and capped history windows explicit', async () => {
    const h = harness(base);
    const body = { ok: true, taskId: 'task-1', history: [{ taskId: 'task-1', objective: 'objective' }] };
    for (const historyWindow of [undefined, { returnedRows: 1, bounded: true }, { returnedRows: 2, bounded: false }]) {
      h.read(() => ({ ...body, historyWindow }));
      await h.ui.inspectTask('task-1');
      assert.match(h.text(), /older records may be omitted/);
    }
    h.read(() => ({ ...body, historyWindow: { returnedRows: 1, bounded: false } }));
    await h.ui.inspectTask('task-1');
    assert.doesNotMatch(h.text(), /older records may be omitted/);
  });
}

for (const base of ['frontend/app', 'website/app/app']) {
  test(base + ': reload only rereads history and retains recovery warnings while waiting', async () => {
    const h = harness(base);
    h.read(() => Promise.reject(new Error('offline')));
    await h.ui.inspectTask('task-1', null, recovery);
    const reload = h.button('RELOAD HISTORY');
    assert.equal(reload.type, 'button');
    let reads = 0, finish;
    h.read(url => { reads++; assert.equal(url, '/api/managed-tasks/task-1'); return new Promise(resolve => { finish = resolve; }); });
    const pending = reload.click();
    reload.click();
    assert.equal(reads, 1);
    assert.match(h.text(), /Loading durable task history/);
    assert.match(h.text(), /DO NOT RETRY/);
    finish({ ok: true, taskId: 'task-1', history: [{ taskId: 'task-1', objective: 'restored history' }] });
    await pending;
    assert.match(h.text(), /restored history/);
    assert.match(h.text(), /DO NOT RETRY/);
    assert.doesNotMatch(h.text(), /Task history could not be loaded|RELOAD HISTORY/);
    reload.click();
    assert.equal(reads, 1);
  });
}

for (const base of ['frontend/app', 'website/app/app']) {
  test(base + ': pending detail can be closed without a late response stealing focus', async () => {
    for (const fails of [false, true]) {
      const h = harness(base);
      h.ui.panel.hidden = false;
      const trigger = new h.Element();
      let resolveRead, rejectRead;
      h.read(() => new Promise((resolve, reject) => { resolveRead = resolve; rejectRead = reject; }));
      const pending = h.ui.inspectTask('task-1', trigger, recovery);
      const back = h.button('ESC · BACK');
      assert.ok(back);
      assert.equal(h.context.document.activeElement, back);
      assert.match(h.text(), /Loading durable task history/);
      assert.match(h.text(), /DO NOT RETRY/);
      back.click();
      assert.equal(h.context.document.activeElement, trigger);
      if (fails) rejectRead(new Error('late error'));
      else resolveRead({ ok: true, taskId: 'task-1', history: [{ taskId: 'task-1', objective: 'late result' }] });
      await pending;
      assert.equal(h.context.document.activeElement, trigger);
      assert.doesNotMatch(h.text(), /late result|Task history could not be loaded|Loading durable task history/);
    }
  });
}
