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
    addEventListener() {}
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
  return { context, Element, ui: context.ControlModeUI, read: fn => { read = fn; }, text: () => text(nodes.find(n => n.id === 'cm-task-detail')) };
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
    h.read(() => ({ history: [] }));
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
