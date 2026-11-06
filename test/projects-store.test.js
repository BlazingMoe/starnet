'use strict';
// projects-store.test.js — the KNOWN-PROJECTS store (NS-5 Project Lens core).
// Metadata surface for blessed roots: upsert is persist-before-commit (fail-closed); touch is soft
// (best-effort); snapshot is newest-touched-first; grantedAt provenance survives a re-bless.
const assert = require('assert');
const { makeProjectsStore } = require('../sidecar/projects-store.js');

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

function fakeStore() {
  const calls = []; let boom = false;
  return { calls, fail() { boom = true; }, heal() { boom = false; },
    persist(recs) { if (boom) throw new Error('disk full'); calls.push(recs.map(r => Object.assign({}, r))); } };
}

// --- snapshot empty on a clean store ---
{
  const s = fakeStore();
  const ps = makeProjectsStore({ records: [], persist: s.persist, now: () => 1000 });
  ok(ps.snapshot().projects.length === 0, 'clean store snapshot is empty');
  ok(ps.roots().length === 0, 'clean store has no roots');
}

// --- upsert adds a row, persists, stamps grantedAt+lastTouchedAt from the injected clock ---
{
  const recs = []; const s = fakeStore();
  const ps = makeProjectsStore({ records: recs, persist: s.persist, now: () => 5000 });
  const r = ps.upsert('C:/proj/a', { isGitRepo: true, displayPath: 'C:/proj/a' });
  ok(r.ok === true, 'upsert of a new root succeeds');
  ok(recs.length === 1 && recs[0].root === 'C:/proj/a', 'row committed to the shared records array');
  ok(s.calls.length === 1, 'upsert persisted once');
  const p = ps.get('C:/proj/a');
  ok(p.grantedAt === 5000 && p.lastTouchedAt === 5000, 'grantedAt + lastTouchedAt stamped from the clock');
  ok(p.isGitRepo === true, 'isGitRepo metadata stored');
  ok(ps.has('C:/proj/a') === true, 'has() reports the tracked root');
}

// --- upsert FAILS CLOSED when persist throws (nothing enters memory) ---
{
  const recs = []; const s = fakeStore(); s.fail();
  const ps = makeProjectsStore({ records: recs, persist: s.persist, now: () => 1 });
  const r = ps.upsert('C:/proj/b', {});
  ok(r.ok === false, 'upsert returns ok:false when the durable write throws');
  ok(recs.length === 0, 'fail-closed: no row committed when persist failed');
}

// --- re-upsert keeps the ORIGINAL grantedAt but refreshes isGitRepo + bumps lastTouchedAt ---
{
  let t = 100; const recs = []; const s = fakeStore();
  const ps = makeProjectsStore({ records: recs, persist: s.persist, now: () => t });
  ps.upsert('C:/proj/c', { isGitRepo: false });
  t = 200;
  ps.upsert('C:/proj/c', { isGitRepo: true });
  const p = ps.get('C:/proj/c');
  ok(recs.length === 1, 're-upsert does not add a duplicate row');
  ok(p.grantedAt === 100, 'grantedAt provenance is preserved across a re-bless');
  ok(p.lastTouchedAt === 200 && p.isGitRepo === true, 're-bless refreshes lastTouchedAt + isGitRepo');
}

// --- touch bumps lastTouchedAt only for a KNOWN root; never creates a row ---
{
  const recs = []; const s = fakeStore();
  const ps = makeProjectsStore({ records: recs, persist: s.persist, now: () => 1 });
  ps.upsert('C:/proj/d', {});
  ok(ps.touch('C:/proj/d', 9999).ok === true, 'touch of a known root succeeds');
  ok(ps.get('C:/proj/d').lastTouchedAt === 9999, 'touch bumped lastTouchedAt');
  ok(ps.touch('C:/proj/UNKNOWN', 1).ok === false, 'touch of an unknown root is a no-op (never creates)');
  ok(recs.length === 1, 'touch never adds a row');
}

// --- touch is SOFT: a torn persist keeps the in-memory bump (metadata, not a gate) ---
{
  const recs = []; const s = fakeStore();
  const ps = makeProjectsStore({ records: recs, persist: s.persist, now: () => 1 });
  ps.upsert('C:/proj/e', {});
  s.fail();
  ps.touch('C:/proj/e', 4242);
  ok(ps.get('C:/proj/e').lastTouchedAt === 4242, 'soft touch keeps the in-memory bump even when persist throws');
}

// --- snapshot is newest-touched-first (the autonomy surface ordering) ---
{
  let t = 0; const recs = []; const s = fakeStore();
  const ps = makeProjectsStore({ records: recs, persist: s.persist, now: () => t });
  t = 10; ps.upsert('C:/old', {});
  t = 30; ps.upsert('C:/new', {});
  t = 20; ps.upsert('C:/mid', {});
  const order = ps.snapshot().projects.map(p => p.root);
  ok(order[0] === 'C:/new' && order[1] === 'C:/mid' && order[2] === 'C:/old', 'snapshot sorts newest-touched first');
}

// --- remove forgets a row (persist-before-commit) ---
{
  const recs = []; const s = fakeStore();
  const ps = makeProjectsStore({ records: recs, persist: s.persist, now: () => 1 });
  ps.upsert('C:/gone', {});
  ok(ps.remove('C:/gone').ok === true, 'remove succeeds');
  ok(!ps.has('C:/gone') && recs.length === 0, 'row forgotten from memory');
  ok(ps.remove('C:/never').ok === true, 'removing an absent root is a no-op success');
}

// Explicit bindings survive cold hydration, are idempotent, and clear/rebind rotates the opaque identity.
{
  const persisted = []; let ids = ['opaque_project_id_0001', 'opaque_project_id_0002'];
  const records = [{ root:'C:/bound', displayPath:'C:/bound', grantedAt:1, isGitRepo:true }];
  const ps = makeProjectsStore({ records, persist: rows => { persisted.splice(0, persisted.length, ...rows.map(r => Object.assign({}, r))); }, now:() => 2 });
  const first = ps.bindLessonProject('C:/bound', () => ids.shift());
  const same = ps.bindLessonProject('C:/bound', () => 'should_not_be_used_0000');
  ok(first.ok && first.project.lessonProjectId === 'opaque_project_id_0001', 'explicit bind stores generated opaque identity');
  ok(same.unchanged && same.project.lessonProjectId === first.project.lessonProjectId, 'repeat bind is idempotent');
  const cold = makeProjectsStore({ records:persisted, persist: rows => { persisted.splice(0, persisted.length, ...rows.map(r => Object.assign({}, r))); } });
  ok(cold.get('C:/bound').lessonProjectId === first.project.lessonProjectId, 'binding survives cold store hydration');
  const snapA = Object.freeze({ type:'project', id:cold.get('C:/bound').lessonProjectId });
  ok(cold.clearLessonProject('C:/bound').ok && cold.get('C:/bound').lessonProjectId === null, 'clear invalidates future binding');
  ok(snapA.id === first.project.lessonProjectId, 'in-flight snapshot remains immutable after clear');
  const rebound = cold.bindLessonProject('C:/bound', () => ids.shift());
  ok(rebound.ok && rebound.project.lessonProjectId === 'opaque_project_id_0002' && rebound.project.lessonProjectId !== snapA.id, 'rebind after clear creates a fresh identity');
  const rotated = cold.bindLessonProject('C:/bound', () => 'opaque_project_id_0003', true);
  ok(rotated.ok && rotated.project.lessonProjectId === 'opaque_project_id_0003' && rotated.project.lessonProjectId !== rebound.project.lessonProjectId, 'explicit rebind atomically rotates an existing identity');
  const other = cold.upsert('C:/other', {});
  const otherBind = cold.bindLessonProject('C:/other', () => 'opaque_project_id_0004');
  const runA = Object.freeze({ type:'project', id:rotated.project.lessonProjectId });
  const runB = Object.freeze({ type:'project', id:otherBind.project.lessonProjectId });
  ok(other.ok && otherBind.ok && runA.id !== runB.id, 'concurrent project snapshots remain distinct and independent');
  ok(cold.bindLessonProject('C:/other', () => rotated.project.lessonProjectId, true).ok === false, 'duplicate cross-project identities are rejected');
  ok(cold.bindLessonProject('C:/unknown', () => 'opaque_project_id_0003').ok === false, 'unknown/unblessed project cannot be bound');
}
{
  let fail = false; const records = [{ root:'C:/stable', lessonProjectId:'opaque_project_id_existing' }];
  const ps = makeProjectsStore({ records, persist:() => { if (fail) throw new Error('disk full'); }, now:() => 1 });
  fail = true;
  const cleared = ps.clearLessonProject('C:/stable');
  ok(!cleared.ok && ps.get('C:/stable').lessonProjectId === 'opaque_project_id_existing', 'persistence failure retains previous binding');
  const rebound = ps.bindLessonProject('C:/stable', () => 'opaque_project_id_replacement', true);
  ok(!rebound.ok && ps.get('C:/stable').lessonProjectId === 'opaque_project_id_existing', 'failed explicit rebind retains previous identity');
}
{
  const ps = makeProjectsStore({ records:[{ root:'C:/unpersisted' }] });
  ok(ps.bindLessonProject('C:/unpersisted', () => 'opaque_project_id_0005').ok === false, 'binding fails closed without a durable persistence sink');
}

console.log('projects-store.test.js OK —', n, 'assertions');
