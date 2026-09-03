/* sidecar/process-fault.js — FAIL LOUD, BUT SAFE, on a genuine uncaught exception.

   Before this (2026-09-03 audit): process.on('uncaughtException') only logged + pushed a diagnostics-ring entry
   and the host KEPT SERVING. After an uncaught throw the in-memory state is unproven (a half-applied mutation, a
   torn Map, a run whose settle never fired) while /api/health still said "ok" and the topbar stayed ONLINE — the
   app asserting health the harness could not prove. The Tauri shell already owns a watchdog that respawns an
   exited sidecar within ~3s (src-tauri/src/main.rs spawn_guardian), so the honest move is: record the fault,
   flip the health surface to DEGRADED with the summary, release the locks a clean shutdown would release, and
   exit(1) after a short bounded delay so the shell's recovery path takes over from a KNOWN-GOOD fresh process.

   unhandledRejection is deliberately NOT routed here — a rejected promise nobody awaited is a logging matter
   (the rest of the process is not torn), and it stays on the surface-only path in index.js.

   Pure + injected (no ambient process/timer), so the whole policy is unit-testable:
     makeProcessFaultHandler({ surface, exit, schedule, release, keepAlive, delayMs, now, log })
       -> { onUncaught(err), fault(), isBenign(err) }
   - surface(kind, err)   : the existing log + diagnostics-ring recorder (called FIRST, always).
   - exit(code)           : process.exit in production.
   - schedule(fn, ms)     : setTimeout in production (the exit is deferred so the fault is observable).
   - release()            : best-effort sync hook (lock release / owner claim drop). Any throw is contained.
   - keepAlive            : test-only opt-out (STARNET_UNCAUGHT_KEEP_SERVING=1): surface + mark degraded, but
                            never exit — so a harness that deliberately provokes a throw can keep asserting.
   - BENIGN allowlist     : EPIPE / ERR_STREAM_DESTROYED on a stdio write (the desktop shell or a test runner
                            closed our stdout pipe) is not a torn-state event; those stay surface-only. */
'use strict';

const DEFAULT_DELAY_MS = 500;
const BENIGN_CODES = ['EPIPE', 'ERR_STREAM_DESTROYED'];

function summarize(err) {
  let msg = '';
  try { msg = (err && typeof err.message === 'string') ? err.message : String(err); } catch (_) { msg = 'unprintable error'; }
  msg = msg.replace(/\s+/g, ' ').trim();
  if (msg.length > 200) msg = msg.slice(0, 200) + '…';
  return msg || 'unknown error';
}

function isBenign(err) {
  const code = err && err.code;
  return !!(code && BENIGN_CODES.indexOf(String(code)) >= 0);
}

function makeProcessFaultHandler(deps) {
  deps = deps || {};
  const surface = typeof deps.surface === 'function' ? deps.surface : function () {};
  const exit = typeof deps.exit === 'function' ? deps.exit : function () {};
  const schedule = typeof deps.schedule === 'function' ? deps.schedule : function (fn, ms) { return setTimeout(fn, ms); };
  const release = typeof deps.release === 'function' ? deps.release : function () {};
  const log = typeof deps.log === 'function' ? deps.log : function () {};
  const now = typeof deps.now === 'function' ? deps.now : function () { return null; };   // clock is INJECTED (lint-determinism); index.js passes Date.now
  const keepAlive = !!deps.keepAlive;
  const delayMs = (typeof deps.delayMs === 'number' && deps.delayMs >= 0) ? deps.delayMs : DEFAULT_DELAY_MS;
  let fault = null;   // { kind, message, at, exiting } — set ONCE; the first fault wins, later ones only surface

  function onUncaught(err) {
    try { surface('uncaughtException', err); } catch (e) { log('uncaughtException: surface hook failed (policy continues): ' + summarize(e)); }   // the surface must never mask the fault policy
    if (isBenign(err)) return { action: 'benign' };
    if (fault) return { action: 'already-faulted' };
    fault = { kind: 'uncaughtException', message: summarize(err), at: now(), exiting: !keepAlive };
    if (keepAlive) {
      log('uncaughtException: process marked DEGRADED but kept alive (UNCAUGHT_KEEP_SERVING is set — test opt-out)');
      return { action: 'degraded-kept-alive' };
    }
    log('uncaughtException: state is unproven — health flipped to DEGRADED; exiting(1) in ' + delayMs + 'ms so the shell watchdog restarts a clean process');
    schedule(function () {
      try { release(); } catch (e) { log('uncaughtException: release hook failed: ' + summarize(e)); }
      exit(1);
    }, delayMs);
    return { action: 'exit-scheduled', delayMs: delayMs };
  }

  return { onUncaught: onUncaught, fault: function () { return fault; }, isBenign: isBenign };
}

module.exports = { makeProcessFaultHandler, summarize, isBenign, DEFAULT_DELAY_MS, BENIGN_CODES };
