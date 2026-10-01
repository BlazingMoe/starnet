/* node test/control-action-ui-contract.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('./_assert.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'controlactions.js'), 'utf8');
const mirror = fs.readFileSync(path.join(__dirname, '..', 'website', 'app', 'app', 'controlactions.js'), 'utf8');
const recovery = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'controlrecoveries.js'), 'utf8');
const recoveryMirror = fs.readFileSync(path.join(__dirname, '..', 'website', 'app', 'app', 'controlrecoveries.js'), 'utf8');
const approvals = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'controlapprovals.js'), 'utf8');
const approvalsMirror = fs.readFileSync(path.join(__dirname, '..', 'website', 'app', 'app', 'controlapprovals.js'), 'utf8');

A.ok(src.includes("const ENDPOINT = '/api/control/actions?runs=100&limit=100'"), 'action pane reads the dedicated bounded read-only endpoint');
A.ok(src.includes("trace.schemaVersion === 'moe.control-actions.v1'"), 'action pane requires the expected projection schema');
A.ok(src.includes("'ACTION TRACE'"), 'action pane exposes the action trace surface');
A.ok(src.includes("'RUN JOURNAL · READ ONLY'"), 'action pane identifies the durable truth source and read-only mode');
A.ok(src.includes('Action trace unavailable — no tool calls, phases, or outcomes are inferred.'), 'endpoint outage cannot fabricate an empty action history');
A.ok(src.includes('Tool arguments, raw result content, replay fingerprints, retries, and mutation controls are intentionally absent.'), 'UI states the action trace privacy and mutation boundary');
A.ok(src.includes("item.mutating === true ? 'MUTATING'"), 'real mutation classification is rendered without inference');
A.ok(src.includes("item.ok === true ? 'OK'"), 'real result state is rendered when present');
A.ok(src.includes('fmtWhen(item.startedAt)'), 'only authoritative run start time is rendered');
A.ok(!src.includes('item.durationMs'), 'action duration is not invented');
A.ok(!src.includes('item.argsRaw'), 'tool arguments are not rendered');
A.ok(!src.includes('item.replayFingerprint'), 'replay fingerprints are not rendered');
A.ok(!/Harness\.api\.(post|put|patch|delete)\s*\(/.test(src), 'action pane contains no mutating Harness API calls');
A.ok(!/fetch\s*\([^)]*,\s*\{[^}]*method\s*:\s*['\"](?:POST|PUT|PATCH|DELETE)/is.test(src), 'action pane contains no raw mutating HTTP fallback');
A.ok(src.includes('clearInterval(timer)'), 'action polling stops with Control Mode');
A.eq(mirror, src, 'website action pane mirrors the desktop source exactly');
A.eq(approvalsMirror, approvals, 'website approval pane stays mirrored after chaining action trace');
A.ok(approvals.includes("script.src = 'app/controlactions.js'"), 'approval pane chains the action trace pane');
A.ok(approvals.includes("script.id = 'mo-control-mode-actions'"), 'action trace loader is idempotent');

A.eq(recoveryMirror, recovery, 'website recovery pane mirrors the desktop source exactly');
A.ok(recovery.includes("const ENDPOINT = '/api/managed-task-recoveries?limit=100'"), 'recovery pane reads only the bounded recovery endpoint');
A.ok(recovery.includes("body.recoveries.schemaVersion==='moe.control-recoveries.v1'"), 'recovery pane requires the privacy-safe projection schema');
A.ok(recovery.includes("'RECOVERY STATUS'"), 'recovery pane has an explicit operator-visible title');
A.ok(recovery.includes("label(item.operatorState,'REVIEW')"), 'operator state is rendered from the canonical server projection');
A.ok(recovery.includes("rows.filter(item=>item.operatorState==='SAFE TO RESTART').length"), 'recovery summary counts canonical safe-restart guidance only');
A.ok(recovery.includes("rows.filter(item=>item.operatorState==='DO NOT RETRY').length"), 'recovery summary counts canonical fail-closed guidance only');
A.ok(recovery.includes("'RECOVERY QUEUE · '+rows.length+' TOTAL · '+safe+' SAFE TO RESTART · '+blocked+' DO NOT RETRY · '+review+' REVIEW'"), 'operator gets an at-a-glance recovery queue summary');
A.ok(recovery.includes("setAttribute('aria-label','Recovery queue summary')"), 'recovery summary is explicitly labelled for assistive technology');
A.ok(recovery.includes("'RECONCILIATION '+label(item.reconciliationOutcome)+' · DECISION '+label(item.reconciliationDecision)"), 'operator sees the durable reconciliation decision alongside its outcome');
A.ok(recovery.includes("'WHY · '+label(item.operatorMeaning"), 'plain-language meaning comes from the canonical recovery projection');
A.ok(recovery.includes("'NEXT · '+label(item.nextMove"), 'next move comes from the canonical recovery projection');
A.ok(recovery.includes("window.ControlModeUI.inspectTask(item.taskId,row,item)"), 'recovery rows can open the existing durable managed-task history with durable recovery evidence and without a second detail source');
A.ok(recovery.includes("row.setAttribute('role','button')"), 'drillable recovery rows expose button semantics');
A.ok(recovery.includes("row.setAttribute('aria-label','Open durable task history for '+item.taskId)"), 'recovery drilldown has a descriptive accessible name');
A.ok(recovery.includes("ev.key==='Enter'||ev.key===' '"), 'recovery drilldown supports keyboard activation');
A.ok(!recovery.includes('function operatorMeaning('), 'browser does not maintain a second recovery interpretation');
A.ok(!recovery.includes('function nextMove('), 'browser does not maintain a second next-move policy');
A.ok(recovery.includes('Recovery status unavailable — no task outcome or retry safety is inferred.'), 'recovery outage never fabricates safety');
A.ok(recovery.includes('Provider references and task content are intentionally hidden.'), 'recovery UI preserves provider/task privacy boundary');
A.ok(!/Harness\.api\.(post|put|patch|delete)\s*\(/.test(recovery), 'recovery pane cannot mutate task state');
A.ok(!/fetch\s*\([^)]*,\s*\{[^}]*method\s*:\s*['\"](?:POST|PUT|PATCH|DELETE)/is.test(recovery), 'recovery pane has no raw mutating HTTP fallback');


const routineOpportunity = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'controlroutineopportunity.js'), 'utf8');
const routineOpportunityMirror = fs.readFileSync(path.join(__dirname, '..', 'website', 'app', 'app', 'controlroutineopportunity.js'), 'utf8');
const nightshift = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'controlnightshift.js'), 'utf8');
const nightshiftMirror = fs.readFileSync(path.join(__dirname, '..', 'website', 'app', 'app', 'controlnightshift.js'), 'utf8');

A.eq(routineOpportunityMirror, routineOpportunity, 'website routine-opportunity pane mirrors the desktop source exactly');
A.eq(nightshiftMirror, nightshift, 'website Night Shift pane stays mirrored after chaining routine opportunity');
A.ok(nightshift.includes("script.src='app/controlroutineopportunity.js'"), 'Night Shift chains the routine-opportunity pane');
A.ok(nightshift.includes("script.id='mo-control-mode-routine-opportunity'"), 'routine-opportunity loader is idempotent');
A.ok(routineOpportunity.includes("window.RoutineNudgeStore"), 'routine opportunity reuses StarNet RoutineNudgeStore instead of inventing a second habit detector');
A.ok(routineOpportunity.includes("typeof s.opportunity!=='function'"), 'missing canonical routine evidence fails closed');
A.ok(routineOpportunity.includes('item:s.opportunity()'), 'Control Mode consumes the public read-only routine opportunity projection');
A.ok(!routineOpportunity.includes('s._pick()'), 'Control Mode does not depend on RoutineNudgeStore test seams');
A.ok(routineOpportunity.includes("No schedule-worthy repeated recipe is currently proven"), 'no candidate is reported as no proven opportunity, not fabricated automation');
A.ok(routineOpportunity.includes("No schedule is inferred here."), 'Control Mode does not infer a cadence from incomplete evidence');
A.ok(routineOpportunity.includes("OBSERVE ONLY"), 'routine opportunity declares its read-only boundary');
A.ok(!/Harness\.api\.(post|put|patch|delete)\s*\(/.test(routineOpportunity), 'routine-opportunity pane contains no mutating Harness API calls');
A.ok(!/fetch\s*\([^)]*,\s*\{[^}]*method\s*:\s*['\"](?:POST|PUT|PATCH|DELETE)/is.test(routineOpportunity), 'routine-opportunity pane has no raw mutating HTTP fallback');

// Execute the real classic scripts together: top-level const bindings are visible
// to later scripts, but are not properties of window. A window-only fake misses this.
const vm = require('vm');
function routinePaneHarness(base, withStore = true) {
  class Element {
    constructor() { this.children = []; this.textContent = ''; this.hidden = false; this.isConnected = true; }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.append(node); return node; }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute() {}
    querySelector() { return null; }
  }
  const panel = new Element();
  const intervals = new Map();
  let observe, cronListener, nextTimer = 0, launches = { brief: { n: 5 } }, writes = 0;
  const context = vm.createContext({
    document: { createElement: () => new Element(), getElementById: id => id === 'control-mode-panel' ? panel : null },
    MutationObserver: class { constructor(fn) { observe = fn; } observe() {} },
    setInterval: fn => { intervals.set(++nextTimer, fn); return nextTimer; },
    clearInterval: id => intervals.delete(id),
    localStorage: { getItem: () => null, setItem: () => { writes++; }, removeItem: () => { writes++; } },
    ProspectStore: { launches: () => launches },
    Recipes: { get: id => id === 'brief' ? { name: 'Morning Brief', cadence: null } : null },
    QuerySpine: { subscribe: (key, fn) => { A.eq(key, 'cron', 'real store subscribes to existing cron evidence'); cronListener = fn; return () => {}; } }
  });
  vm.runInContext('window = globalThis', context);
  if (withStore) {
    vm.runInContext(fs.readFileSync(path.join(base, 'routinenudgestore.js'), 'utf8'), context);
    vm.runInContext('RoutineNudgeStore.init()', context);
    cronListener({ hasData: true, data: { jobs: [] } });
    A.eq(vm.runInContext('typeof window.RoutineNudgeStore', context), 'undefined', 'classic-script store is not a window property');
  }
  const paneSource = fs.readFileSync(path.join(base, 'controlroutineopportunity.js'), 'utf8');
  vm.runInContext(paneSource, context);
  const text = node => [node.textContent, ...node.children.map(text)].join(' ');
  return {
    context, intervals, panel, text: () => text(panel), writes: () => writes,
    cron: jobs => cronListener({ hasData: true, data: { jobs } }),
    launches: value => { launches = value; },
    refresh: () => context.ControlModeRoutineOpportunity.refresh(),
    hide: value => { panel.hidden = value; observe(); },
    reload: () => vm.runInContext(paneSource, context)
  };
}

for (const base of ['frontend/app', 'website/app/app']) {
  const h = routinePaneHarness(path.join(__dirname, '..', base));
  A.ok(h.text().includes('CANDIDATE · Morning Brief · 5 MANUAL LAUNCHES'), `${base}: real store evidence reaches the pane`);
  A.ok(h.text().includes('No schedule is inferred here.'), `${base}: missing authored cadence is not invented`);
  h.cron([{ meta: { recipeId: 'brief' } }]); h.refresh();
  A.ok(!h.text().includes('CANDIDATE ·'), `${base}: existing live routine suppresses the candidate`);
  h.cron([]); h.launches({ brief: { n: 2 } }); h.refresh();
  A.ok(!h.text().includes('CANDIDATE ·'), `${base}: canonical launch floor is preserved`);
  h.launches({ brief: { n: 5, rated: { miss: 3 } } }); h.refresh();
  A.ok(!h.text().includes('CANDIDATE ·'), `${base}: canonical quality gate is preserved`);
  h.launches({ brief: { n: 6 } }); h.refresh();
  A.ok(h.text().includes('6 MANUAL LAUNCHES'), `${base}: updates use the same live store`);
  A.eq(h.writes(), 0, `${base}: observing evidence never spends or resets the anti-nag ledger`);
  h.hide(true);
  A.eq(h.intervals.size, 0, `${base}: closing stops polling`);
  h.launches({ brief: { n: 7 } }); h.refresh();
  A.ok(h.text().includes('6 MANUAL LAUNCHES'), `${base}: hidden pane does not render`);
  h.hide(false);
  A.ok(h.text().includes('7 MANUAL LAUNCHES'), `${base}: reopening refreshes current evidence`);
  h.reload();
  A.eq(h.intervals.size, 1, `${base}: repeated loading does not duplicate polling`);
  A.eq(h.panel.children.length, 1, `${base}: repeated loading does not duplicate the pane`);
  vm.runInContext('RoutineNudgeStore.opportunity = () => { throw new Error("unavailable"); }', h.context);
  h.refresh();
  A.ok(h.text().includes('Routine evidence unavailable'), `${base}: failing store stays explicitly unavailable`);
  const absent = routinePaneHarness(path.join(__dirname, '..', base), false);
  A.ok(absent.text().includes('Routine evidence unavailable'), `${base}: absent store fails closed`);
}

A.report('control-action-ui-contract.test');
