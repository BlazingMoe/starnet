/* node test/bootguard.test.js — the boot guard makes a broken boot LOUD and stays silent on a healthy one.

   frontend/app/bootguard.js is the first app script: it installs window error/unhandledrejection listeners,
   tallies them, and after DOMContentLoaded probes the critical module globals; a missing global or a failed
   <script> renders the fatal banner naming the file. No jsdom in this repo — the module is run in a vm context
   with a hand-rolled window/document stub (it touches only addEventListener, readyState, createElement,
   body.appendChild), which is exactly the dependency budget the module promises. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'frontend', 'app', 'bootguard.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(ROOT, 'frontend', 'index.html'), 'utf8');

const CRITICAL = ['U', 'Harness', 'Save', 'CloudSave', 'World', 'StationUI', 'Chat', 'Channels', 'Personas', 'Onboarding', 'Tutorial', 'App', 'Topbar'];

function fakeEl(tag) {
  const el = { tagName: tag.toUpperCase(), children: [], style: {}, attrs: {}, textContent: '', className: '', id: '' };
  el.appendChild = c => { el.children.push(c); return c; };
  el.setAttribute = (k, v) => { el.attrs[k] = v; };
  el.getAttribute = k => el.attrs[k];
  return el;
}
function textOf(el) { return (el.textContent || '') + el.children.map(textOf).join('\n'); }

/* boot the module in a sandbox. `globals` = the module globals present at DOMContentLoaded time.
   readyState 'loading' so the check is deferred until we fire DOMContentLoaded ourselves. */
function boot(globals, opts) {
  opts = opts || {};
  const handlers = { win: {}, doc: {} };
  const body = fakeEl('body');
  const document = {
    readyState: opts.readyState || 'loading',
    body,
    addEventListener(t, fn) { (handlers.doc[t] = handlers.doc[t] || []).push(fn); },
    createElement: fakeEl
  };
  const sandbox = {
    document,
    location: { href: 'http://127.0.0.1:8787/', reload() { sandbox.__reloaded = (sandbox.__reloaded || 0) + 1; } },
    navigator: { userAgent: 'test-ua' },
    addEventListener(t, fn, cap) { (handlers.win[t] = handlers.win[t] || []).push({ fn, cap }); },
    console
  };
  sandbox.window = sandbox;
  Object.assign(sandbox, globals || {});
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'bootguard.js' });
  const fire = (t, e) => (handlers.win[t] || []).forEach(h => h.fn(e));
  const ready = () => (handlers.doc.DOMContentLoaded || []).forEach(fn => fn({}));
  const banner = () => body.children.find(c => c.id === 'bootguard-fatal') || null;
  return { sandbox, guard: sandbox.BootGuard, handlers, fire, ready, banner, body };
}
const allGlobals = () => Object.fromEntries(CRITICAL.map(n => [n, {}]));

/* ---- 0. the slot: bootguard is the FIRST script in index.html, ahead of legacymigrate ---- */
const firstScript = INDEX.indexOf('<script');
A.ok(firstScript >= 0 && INDEX.slice(firstScript, firstScript + 80).includes('app/bootguard.js'), 'bootguard.js is the very first <script> in frontend/index.html');
A.ok(INDEX.indexOf('app/bootguard.js') < INDEX.indexOf('app/legacymigrate.js'), 'bootguard loads before legacymigrate (the first store-touching script)');
A.ok(!/bootguard\.js"[^>]*\bdefer\b/.test(INDEX), 'bootguard is NOT deferred — it must be installed before any other script can throw');

/* ---- 1. listeners are installed in the capture phase (a 404\'d <script> error does not bubble) ---- */
{
  const t = boot(allGlobals());
  A.eq(t.guard.installed, true, 'the guard reports its listeners installed');
  const err = (t.handlers.win.error || [])[0];
  A.ok(err && err.cap === true, 'the window error listener is capture-phase (sees resource failures)');
  A.ok((t.handlers.win.unhandledrejection || []).length === 1, 'an unhandledrejection listener is installed');
  A.ok((t.handlers.doc.DOMContentLoaded || []).length === 1, 'the boot check is deferred to DOMContentLoaded while the document is loading');
}

/* ---- 2. HEALTHY boot: every critical global present, no script failures -> NO banner, ever ---- */
{
  const t = boot(allGlobals());
  t.fire('error', { message: 'a cosmetic image 404', target: Object.assign(fakeEl('img'), { src: 'assets/x.png' }) });
  t.fire('unhandledrejection', { reason: new Error('late fetch died') });
  t.ready();
  A.eq(t.banner(), null, 'a healthy boot renders no banner (img 404 + a rejected promise are counted, not fatal)');
  const s = t.guard.state();
  A.eq([s.checked, s.fired, s.missing.length, s.scriptFailures, s.rejections, s.uncaught], [true, false, 0, 0, 1, 0], 'healthy state: checked, not fired, nothing missing, rejection tallied, img error ignored');
  A.ok(t.guard.summaryLine().includes('1 unhandled rejection'), 'summaryLine reports the rejection tally: ' + t.guard.summaryLine());
}
{
  const t = boot(allGlobals());
  t.ready();
  A.eq(t.guard.summaryLine(), 'none recorded since page load', 'a clean boot reports a real zero, never a guess');
  A.ok(t.guard.report().includes('boot check:     passed'), 'report() says the boot check passed');
}

/* ---- 3. a missing critical module -> the banner names the module AND its file ---- */
{
  const g = allGlobals(); delete g.World;
  const t = boot(g);
  t.ready();
  const b = t.banner();
  A.ok(b, 'a missing World global renders the fatal banner');
  const txt = b ? textOf(b) : '';
  A.ok(txt.includes('STATION FAILED TO BOOT'), 'banner carries the fatal heading');
  A.ok(txt.includes('World — app/world.js'), 'banner names the missing module and the file that defines it');
  A.ok(txt.includes('boot check:     FAILED'), 'the embedded report says FAILED');
  A.ok(b && b.attrs.role === 'alert', 'banner is an aria alert');
  const buttons = [];
  (function walk(el) { if (el.tagName === 'BUTTON') buttons.push(el); el.children.forEach(walk); })(b);
  A.eq(buttons.map(x => x.textContent), ['⧉ COPY DIAGNOSTICS', '⟳ RELOAD'], 'banner offers COPY DIAGNOSTICS + RELOAD');
  A.ok(buttons.every(x => /\bbtn(-xl)?\b/.test(x.className)), 'both controls wear station button skins (no white HTML controls)');
  buttons[1].onclick();
  A.eq(t.sandbox.__reloaded, 1, 'RELOAD reloads the page');
  t.ready();
  A.eq(t.body.children.filter(c => c.id === 'bootguard-fatal').length, 1, 'a second check never stacks a second banner');
}

/* ---- 4. a <script> load failure (404/blocked) is fatal even when the probe list is intact ---- */
{
  const t = boot(allGlobals());
  t.fire('error', { target: Object.assign(fakeEl('script'), { src: 'http://127.0.0.1:8787/app/recipes.js' }) });
  t.ready();
  const b = t.banner();
  A.ok(b, 'a failed <script> renders the banner');
  A.ok(b && textOf(b).includes('script did not load — app/recipes.js'), 'banner names the script that failed to load (path only)');
  A.ok(t.guard.summaryLine().includes('1 script load failure(s): app/recipes.js'), 'summaryLine carries the script failure');
}

/* ---- 5. runtime errors are tallied with file:line, bounded, secret-free (counts + message tail only) ---- */
{
  const t = boot(allGlobals());
  for (let i = 0; i < 40; i++) t.fire('error', { message: 'boom ' + i, filename: 'http://127.0.0.1:8787/app/chat.js', lineno: 10 + i });
  const s = t.guard.state();
  A.eq(s.uncaught, 40, 'every uncaught error is counted');
  A.eq(s.errors.length, 24, 'the error tail is bounded');
  A.ok(s.errors[0].startsWith('boom 16 @ app/chat.js:26'), 'tail keeps the most recent entries with file:line: ' + s.errors[0]);
  A.eq(t.guard._internals.reasonText({ message: 'm' }), 'm', 'reasonText prefers .message');
  A.eq(t.guard._internals.reasonText('plain'), 'plain', 'reasonText passes strings through');
}

/* ---- 6. COPY DIAGNOSTICS rides Diag when present (page report + sidecar report), falls back to the clipboard ---- */
(async () => {
  {
    let copied = '';
    const g = allGlobals(); delete g.Chat;
    g.Diag = { fetchText: () => Promise.resolve('SIDECAR REPORT'), copyText: t => { copied = t; return Promise.resolve(true); } };
    const t = boot(g);
    t.ready();
    const b = t.banner();
    const copyBtn = (function find(el) { if (el.tagName === 'BUTTON' && /COPY/.test(el.textContent)) return el; for (const c of el.children) { const r = find(c); if (r) return r; } return null; })(b);
    copyBtn.onclick();
    await new Promise(r => setTimeout(r, 10));
    A.ok(copied.includes('STARNET BOOT GUARD') && copied.includes('Chat (app/chat.js)') && copied.endsWith('SIDECAR REPORT'), 'copy = page-side boot report + the sidecar report via Diag');
    A.eq(copyBtn.textContent, '✓ DIAGNOSTICS COPIED', 'button confirms the copy');
  }
  {
    let copied = '';
    const g = allGlobals(); delete g.Chat;
    const t = boot(g);
    t.sandbox.navigator.clipboard = { writeText: s => { copied = s; return Promise.resolve(); } };
    t.ready();
    const copyBtn = (function find(el) { if (el.tagName === 'BUTTON' && /COPY/.test(el.textContent)) return el; for (const c of el.children) { const r = find(c); if (r) return r; } return null; })(t.banner());
    copyBtn.onclick();
    await new Promise(r => setTimeout(r, 10));
    A.ok(copied.includes('missing:        Chat (app/chat.js)'), 'without Diag the page report still reaches the clipboard');
  }

  /* ---- 7. diagnostics.js appends the page-error line to every copied report ---- */
  {
    const Diag = require('../frontend/app/diagnostics.js');
    A.eq(Diag.withPageErrors('REPORT', { summaryLine: () => '2 uncaught error(s)' }), 'REPORT\npage errors:   2 uncaught error(s)', 'withPageErrors appends the guard tally');
    A.eq(Diag.withPageErrors('REPORT', null), 'REPORT', 'no guard -> text unchanged');
    A.eq(Diag.withPageErrors('', { summaryLine: () => 'x' }), '', 'an empty report stays empty (the caller\'s "could not read" path is preserved)');
    const src = fs.readFileSync(path.join(ROOT, 'frontend', 'app', 'diagnostics.js'), 'utf8');
    A.ok(/\.then\(text => text \? withPageErrors\(text\) : text\)/.test(src), 'Diag.copy() routes the report through withPageErrors');
  }

  /* ---- 8. the probe set is the critical set app.js already guards ---- */
  {
    const t = boot(allGlobals());
    A.eq(t.guard.PROBES.map(p => p.name), CRITICAL, 'the critical probe list is exactly the documented set');
    t.guard.PROBES.forEach(p => A.ok(fs.existsSync(path.join(ROOT, 'frontend', p.file)), 'probe file exists: ' + p.file));
    A.ok(!/new Function\s*\(|[^\w.'"]eval\s*\(/.test(SRC), 'no eval() / new Function() — the desktop CSP forbids it, probes are literal typeofs');
  }
  A.report('bootguard');
})();
