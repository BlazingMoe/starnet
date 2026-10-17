/* node test/org-specialties.test.js — derivative manager/auditor/worker template catalog. */
'use strict';
const A = require('./_assert.js');
const org = require('../shared/org-specialties.js');

const all = org.list();
A.ok(all.length >= 6, 'catalog contains initial manager/reviewer/worker roles');
A.eq(org.get('research-manager').orgRole, 'manager', 'research manager is organizational manager');
A.eq(org.get('engineering-manager').runtimeRole, 'specialist', 'manager preserves legacy runtime compatibility');
A.eq(org.get('independent-auditor').orgRole, 'specialist', 'auditor is a delegable specialist');
A.ok(org.get('independent-auditor').constraints.indexOf('must not audit own work') >= 0, 'auditor template pins independence rule');
A.ok(org.forOrgRole('worker').length >= 2, 'worker templates are queryable by org role');
A.eq(org.get('missing'), null, 'unknown template is explicit null');
A.eq(org.roleForSpecialty('foreman'), 'manager', 'the real Team Lead class is an organizational manager');
A.eq(org.roleForSpecialty('harvester'), 'worker', 'the real Data Collector class is a bounded worker');
A.eq(org.roleForSpecialty('apptester'), 'worker', 'the real QA Tester class is a bounded worker');
A.eq(org.roleForSpecialty('processwriter'), 'worker', 'the real Process Writer class is a bounded worker');
A.eq(org.roleForSpecialty('researcher'), 'specialist', 'ordinary curated classes remain specialists by default');
A.eq(org.roleForSpecialty('missing'), 'specialist', 'unknown specialty ids do not gain elevated hierarchy');
A.report('org-specialties.test');
