/* node test/config-permissions-import.e2e.test.js — permission import is durable across a real sidecar restart. */
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('./_assert.js');
const { SidecarFixture } = require('./helpers/sidecar-fixture.js');

(async () => {
  const fixture = SidecarFixture.create({ prefix: 'starnet-perm-import-', timeoutMs: 15000 });
  const existing = 'path:C:/existing-project';
  try {
    fs.writeFileSync(path.join(fixture.workspace, 'permissions.allow.json'), JSON.stringify({
      version: 1, allow: [existing], meta: { [existing]: { grantedAt: 1 } }
    }), 'utf8');
    await fixture.start();

    const envelope = { starnetExport: 1, sections: { permissions: { allow: ['cabinet:write'] } } };
    const imported = await fixture.json('POST', '/api/config/import', { envelope, only: ['permissions'] });
    A.eq(imported.status, 200, 'permission-only config import succeeds');
    A.ok(imported.body.applied.includes('permissions'), 'response reports the permission section applied');

    const live = await fixture.json('GET', '/api/permissions');
    A.eq(live.body.grants, ['cabinet:write', existing].sort(), 'live authority contains the imported and existing grants');
    const disk = JSON.parse(fs.readFileSync(path.join(fixture.workspace, 'permissions.allow.json'), 'utf8'));
    A.ok(Array.isArray(disk.allow), 'permissions persist as a JSON array, never a serialized Set object');
    A.eq(disk.allow.slice().sort(), ['cabinet:write', existing].sort(), 'disk preserves the imported union');

    await fixture.restart();
    const restarted = await fixture.json('GET', '/api/permissions');
    A.eq(restarted.body.grants, ['cabinet:write', existing].sort(), 'both grants survive a real sidecar restart');
  } finally {
    await fixture.dispose();
  }
  A.report('config-permissions-import.e2e.test');
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
