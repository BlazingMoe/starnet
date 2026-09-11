'use strict';
const A = require('./_assert.js');
const R = require('../sidecar/orchestration/org-role.js');

A.eq(R.resolveOrgRole({ role: 'orchestrator' }), 'commander', 'legacy orchestrator derives commander');
A.eq(R.resolveOrgRole({ role: 'specialist' }), 'specialist', 'legacy specialist derives specialist');
A.eq(R.resolveOrgRole({ role: 'specialist', orgRole: 'manager' }), 'manager', 'explicit orgRole wins');
A.eq(R.migrateAgent({ id: 'a', role: 'orchestrator' }).orgRole, 'commander', 'migration adds commander');
A.eq(R.migrateAgent({ id: 'b', role: 'specialist', orgRole: 'worker' }).orgRole, 'worker', 'migration preserves explicit orgRole');
const manager = R.withOrgRole({ id: 'm', role: 'specialist' }, 'manager');
A.ok(manager.ok, 'manager assignment accepted');
A.eq(manager.value.role, 'specialist', 'legacy runtime role preserved');
A.eq(manager.value.orgRole, 'manager', 'organizational role added');
const freshWorker = R.withOrgRole({ id: 'w' }, 'worker');
A.eq(freshWorker.value.role, 'specialist', 'new worker gets compatible legacy role');
A.ok(!R.withOrgRole({ id: 'x' }, 'boss').ok, 'unknown orgRole rejected');
A.report('org-role.test');
