/* node test/control-mode-accessibility-contract.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('./_assert.js');

const root = path.join(__dirname, '..');
const desktop = fs.readFileSync(path.join(root, 'frontend', 'app', 'controlmode.js'), 'utf8');
const website = fs.readFileSync(path.join(root, 'website', 'app', 'app', 'controlmode.js'), 'utf8');

A.eq(website, desktop, 'Control Mode dialog behavior mirrors desktop and website exactly');
A.ok(desktop.includes("panel.setAttribute('role', 'dialog')"), 'Control Mode declares a dialog role');
A.ok(desktop.includes("panel.setAttribute('aria-modal', 'true')"), 'Control Mode declares modal semantics');
A.ok(desktop.includes("panel.setAttribute('aria-labelledby', 'cm-title')"), 'Control Mode dialog is labelled by its visible title');
A.ok(desktop.includes("panel.setAttribute('aria-hidden', 'true')"), 'Control Mode starts explicitly hidden to assistive technology');
A.ok(desktop.includes('panel.tabIndex = -1'), 'Control Mode panel can receive deterministic programmatic focus');
A.ok(desktop.includes('focusIfPossible(panel)'), 'opening Control Mode moves focus into the dialog');
A.ok(desktop.includes('panelReturnFocus = active && active.isConnected ? active : null'), 'opening Control Mode remembers the invoking focus target');
A.ok(desktop.includes('focusIfPossible(target)'), 'closing a dialog restores focus when the prior target remains connected');
A.ok(desktop.includes("detail.setAttribute('role', 'dialog')"), 'task detail declares a dialog role');
A.ok(desktop.includes("detail.setAttribute('aria-label', 'Managed task details')"), 'task detail has an accessible name');
A.ok(desktop.includes("detail.setAttribute('aria-hidden', 'true')"), 'task detail starts explicitly hidden');
A.ok(desktop.includes("detail.setAttribute('aria-hidden', 'false')"), 'task detail exposes its visible state to assistive technology');
A.ok(desktop.includes('openTaskDetail(t.taskId, row)'), 'task drilldown preserves the invoking row for focus restoration');
A.ok(desktop.includes("ev.key === 'Enter' || ev.key === ' '"), 'task drilldown supports keyboard activation');
A.ok(desktop.includes("row.setAttribute('role', 'button')"), 'keyboard-drillable task rows expose button semantics');
A.ok(desktop.includes("row.setAttribute('aria-label', 'Open task details for ' + t.objective)"), 'task drilldown rows have descriptive accessible names');
A.ok(desktop.includes('.cm-row.cm-drill:focus-visible') && desktop.includes('#control-mode-panel:focus-visible'), 'keyboard focus has a visible indicator');
A.ok(desktop.includes("if (ev.key !== 'Escape' || panel.hidden) return;"), 'Escape closes visible Control Mode dialogs');
A.ok(!/\.innerHTML\s*=/.test(desktop), 'Control Mode does not render telemetry through innerHTML');

const panes = [
  'controlagents.js',
  'controlmemory.js',
  'controlapprovals.js',
  'controlactions.js',
  'controlcosts.js',
  'controlproviders.js'
];
for (const file of panes) {
  const src = fs.readFileSync(path.join(root, 'frontend', 'app', file), 'utf8');
  const mirror = fs.readFileSync(path.join(root, 'website', 'app', 'app', file), 'utf8');
  A.eq(mirror, src, `${file} accessibility semantics mirror desktop and website exactly`);
  A.ok(/host\s*=\s*make\('section'/.test(src), `${file} exposes its surface as a semantic section`);
  A.ok(/host\.setAttribute\('aria-label',\s*'[^']+'\)/.test(src), `${file} section has an accessible name`);
  A.ok(!/\.innerHTML\s*=/.test(src), `${file} renders evidence through text nodes instead of innerHTML`);
}

A.report('control-mode-accessibility-contract.test');
