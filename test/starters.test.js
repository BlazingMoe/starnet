/* Session starters: evidence, real context navigation, and editable no-history actions. */
'use strict';
const A = require('./_assert.js');
const Starters = require('../frontend/app/starters.js');
const LaunchMemory = require('../frontend/app/launchmemory.js');
const now = 1800000000000, day = 86400000;
const recipes = [{id:'morning',name:'Morning Brief',cadence:'morning'}, {id:'review',name:'Review a draft'}];
const base = {now, recipes};
const session = (id, ago, more = {}) => ({id, title: 'Work ' + id, at:now-ago, ...more});
for (const hour of [0,8,12,20]) {
  const c = Starters.pick({...base,hour,ready:false,hunt:true});
  A.eq(c.map(x=>x.label), ['Plan a task','Compare options','Improve a draft'], 'No history offers useful task templates at hour '+hour);
  A.ok(c.every(x=>x.kind==='draft' && x.description && x.send), 'Templates explain action and require user context');
}
const c = Starters.pick({...base, sessions:[session('older',2*day),session('latest',day)],recent:[{id:'review',at:now-day}],valuesOf:()=>({draft:'saved'})});
A.eq(c.map(x=>x.kind),['session','session','recipe'],'Recent conversations lead, followed by proven recipe');
A.eq(c[0].sessionId,'latest','Sort by actual activity, not caller order');
A.ok(!c[0].send,'Session reopens by id instead of asking a new contextless chat');
A.eq(c[2].values,{draft:'saved'},'Recipe retains saved inputs');
A.ok(c[2].description.includes('saved inputs'),'Recipe explains prefill');
const stale = Starters.pick({...base,sessions:[session('archived',day,{archived:true}),session('busy',day,{busy:true}),session('done',day,{lane:'shipped'}),session('stale',31*day),session('future',-day),session('blank',day,{title:' '})],recent:[{id:'review',at:now-31*day},{id:'gone',at:now-day}]});
A.ok(stale.every(x=>x.kind==='draft'),'Archived, running, shipped, stale, future, untitled and deleted recipes do not surface');
const long = 'A very long meaningful session title with Mixed CASE preserved in full';
A.eq(Starters.pick({...base,sessions:[session('a',day,{title:long})]})[0].label,long,'Preserve full title and casing');
A.eq(Starters.pick({...base,sessions:[session('a',day),session('a',day),session('b',day),session('c',day)]}).length,2,'Deduplicate and cap context shortcuts without padding');
A.eq(Starters.pick({...base,recent:[{id:'review',at:now-day}]}).length,1,'One useful recommendation is enough');
A.notThrows(()=>Starters.pick({...base,recent:[{id:'review',at:now-day}],valuesOf:()=>{throw Error('unavailable');}}),'Missing input store does not discard evidence');
for (const s of [null,{}, {recipes:42,recent:'bad',sessions:'bad'}, {sessions:[null,session('a',day)]}]) A.notThrows(()=>Starters.pick(s),'Malformed or missing signals fail safely');

// ---- LaunchMemory.recent(): newest-first, capped, corrupt-store honest ----
{
  const mem = {};
  LaunchMemory._setStoreForTest({
    getItem: k => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: k => { delete mem[k]; }
  });
  LaunchMemory.reset();
  A.eq(LaunchMemory.recent(), [], 'recent: empty store → []');
  LaunchMemory.save('a', { topic: 'one' }, 100);
  LaunchMemory.save('b', { topic: 'two' }, 300);
  LaunchMemory.save('c', { topic: 'three' }, 200);
  A.eq(LaunchMemory.recent().map(e => e.id), ['b', 'c', 'a'], 'recent: newest-first');
  A.eq(LaunchMemory.recent(2).map(e => e.id), ['b', 'c'], 'recent: cap honored');
  mem[LaunchMemory.KEY] = '{corrupt';
  A.eq(LaunchMemory.recent(), [], 'recent: corrupt store → [] (never a crash)');
}


// Execute the production signal gathering and click handlers, with the real session store.
{
  const fs = require('node:fs'), vm = require('node:vm');
  const Workstreams = require('../frontend/app/workstreams.js');
  Workstreams.reset();
  const active = Workstreams.create(null, { agentId: 'agent' });
  const recent = Workstreams.create('Launch checklist', { agentId: 'agent' });
  recent.history.push({ role: 'user', content: 'Review my checklist' });
  Workstreams.create('Other agent work', { agentId: 'other' }).history.push({ role: 'user', content: 'Private task' });
  Workstreams.create('System only', { agentId: 'agent' }).history.push({ role: 'system', content: 'Connected' });
  Workstreams.switch(active.id);
  class Element {
    constructor() { this.children = []; this.events = {}; this.value = ''; this.className = ''; }
    append(...nodes) { nodes.forEach(n => { n.parent = this; this.children.push(n); }); }
    appendChild(n) { this.append(n); }
    querySelector(sel) { return this.children.find(n => n.className.split(' ').includes(sel.slice(1))) || this.children.map(n => n.querySelector(sel)).find(Boolean) || null; }
    addEventListener(k, fn) { this.events[k] = fn; }
    setAttribute() {}
    focus() { this.focused = true; }
    setSelectionRange() {}
    remove() { this.parent.children = this.parent.children.filter(n => n !== this); }
  }
  const log = new Element(), input = new Element();
  let loaded = null;
  const ctx = vm.createContext({ log, input, activeWs: active, name: 'NOVA', interview: false,
    Starters, Workstreams, document: { createElement: () => new Element() },
    Channels: { isBusy: () => false, snapshot: () => null }, isBusy: () => false, busyPeerFor: () => false,
    load: w => { loaded = w; }, refreshWorkflowViews() {}, autoGrowInput() {},
    submitComposer: () => { throw Error('Starter must not send'); } });
  const source = fs.readFileSync(require('node:path').join(__dirname, '../frontend/app/chat.js'), 'utf8');
  for (const name of ['clearEmptyState', 'pickStarters', 'maybeEmptyState', 'prefill']) {
    const body = A.fnBody(source, 'function ' + name + '(');
    A.ok(body.length > 0 && body.length < 5000, 'Extract bounded production ' + name);
    vm.runInContext(body, ctx);
  }
  vm.runInContext('maybeEmptyState(); maybeEmptyState();', ctx);
  A.eq(log.children.length, 1, 'Repeated idle render does not duplicate suggestions');
  let buttons = log.querySelector('.cmsg-empty-chips').children;
  A.eq(buttons.length, 1, 'Signal adapter excludes other agents and system-only history');
  buttons[0].events.click();
  A.eq(loaded.id, recent.id, 'Click opens exact original session by id');
  A.eq(loaded.history[0].content, 'Review my checklist', 'Original context remains intact');
  Workstreams.archive(recent.id);
  loaded = null;
  buttons[0].events.click();
  A.eq(loaded, null, 'Archived-since-render shortcut does not reopen');
  buttons = log.querySelector('.cmsg-empty-chips').children;
  input.value = 'My existing notes';
  buttons[0].events.click();
  A.ok(input.value.startsWith('My existing notes') && input.value.includes('The outcome I want:'), 'Task starter preserves existing draft and appends scaffold');
  A.ok(input.focused, 'Draft gets focus for editing');
}
A.report('starters');
