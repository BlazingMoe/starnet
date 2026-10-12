/* node test/station-recovery-cli.test.js — production offline CLI round-trip. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const A = require('./_assert.js');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-recovery-cli-'));
const ws = path.join(root, 'old-machine', 'workspaces');
const bundle = path.join(root, 'backup', 'station.starnet-recovery.json');
const target = path.join(root, 'new-machine', 'workspaces');
const browserIn = path.join(root, 'browser-in.json');
const browserOut = path.join(root, 'browser-out.json');
function write(rel, value) {
  const f = path.join(ws, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, typeof value === 'string' ? value : JSON.stringify(value));
}
function run(args) { return cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'station-recovery.mjs'), ...args], { cwd: path.join(__dirname, '..'), encoding: 'utf8' }); }

write('agent.save.json', { doc: { agent: { id: 'agent' }, station: { rooms: ['r'], props: ['p'] } } });
write('transcript.jsonl', '{}\n');
write('agent.notebook.json', { entries: [{ id: 'm' }] });
write('cron.jobs.json', { jobs: [{ id: 'r' }] });
write('loops.json', { loops: [{ id: 'l' }] });
write('agent.todo.json', { items: [{ id: 't' }] });
write('projects.json', { projects: [{ id: 'p' }] });
write('agent.deliverables.json', { records: [{ id: 'd' }] });
write('agent/report.md', 'deliverable');
write('permissions.allow.json', { allow: ['fs.write:workspace'] });
write('connectors/state.json', { version: 2, configs: [{ id: 'notion', oauth: true }], oauth: { byId: { notion: { accessToken: 'SECRET' } }, clients: {} } });
fs.writeFileSync(browserIn, JSON.stringify({ schema: 'starnet.backup', version: 1, store: { 'starnet.save': JSON.stringify({ agent: { id: 'agent' }, station: { rooms: ['r'], props: ['p'] } }), 'starnet.station.v1': '{"room":"r"}' } }));

const backup = run(['backup', '--workspace', ws, '--output', bundle, '--browser-state', browserIn, '--app-version', 'test', '--mutation', '7']);
A.eq(backup.status, 0, 'backup CLI exits green: ' + backup.stderr);
A.ok(fs.existsSync(bundle), 'backup CLI creates the bundle');
A.ok(fs.readFileSync(bundle, 'utf8').indexOf('SECRET') < 0, 'backup CLI excludes credential bytes');
const backupReceipt = JSON.parse(backup.stdout);
A.eq(backupReceipt.ok, true, 'backup CLI prints a machine-readable receipt');
A.eq(backupReceipt.recoveryPoint.lastCompletedMutation, '7', 'backup receipt binds the requested mutation');

// An output path must not be captured as an ordinary workspace file or silently replace the only old recovery point.
const nestedBundle = path.join(ws, 'nested.starnet-recovery.json');
const nested = run(['backup', '--workspace', ws, '--output', nestedBundle]);
A.ok(nested.status !== 0 && /outside the captured WORKSPACES/i.test(nested.stderr), 'backup CLI rejects an output inside the captured workspace');
A.eq(fs.existsSync(nestedBundle), false, 'rejected in-workspace output creates no bundle');
const workspaceAlias = path.join(root, 'workspace-alias');
fs.symlinkSync(ws, workspaceAlias, process.platform === 'win32' ? 'junction' : 'dir');
const aliasBundle = run(['backup', '--workspace', ws, '--output', path.join(workspaceAlias, 'alias.starnet-recovery.json')]);
A.ok(aliasBundle.status !== 0 && /outside the captured WORKSPACES/i.test(aliasBundle.stderr), 'backup CLI canonicalizes a symlinked workspace output path');
A.eq(fs.existsSync(path.join(ws, 'alias.starnet-recovery.json')), false, 'symlink alias rejection writes no bundle into the source workspace');
const originalBundleBytes = fs.readFileSync(bundle, 'utf8');
const refusedOverwrite = run(['backup', '--workspace', ws, '--output', bundle]);
A.ok(refusedOverwrite.status !== 0 && /--replace-backup/.test(refusedOverwrite.stderr), 'backup CLI refuses to overwrite an existing recovery point by default');
A.eq(fs.readFileSync(bundle, 'utf8'), originalBundleBytes, 'refused overwrite preserves the existing recovery point byte-for-byte');
const absentReplacement = run(['backup', '--workspace', ws, '--output', path.join(root, 'not-created.json'), '--replace-backup']);
A.ok(absentReplacement.status !== 0 && /requires an existing regular backup file/.test(absentReplacement.stderr), '--replace-backup is accepted only for an existing regular file');
const directoryOutput = path.join(root, 'backup-output-directory');
fs.mkdirSync(directoryOutput);
const refusedDirectory = run(['backup', '--workspace', ws, '--output', directoryOutput]);
A.ok(refusedDirectory.status !== 0 && /regular file/.test(refusedDirectory.stderr), 'backup CLI refuses to treat a directory as an existing bundle');
const badBrowserState = path.join(root, 'invalid-browser-state.json');
fs.writeFileSync(badBrowserState, '{broken');
const failedReplacement = run(['backup', '--workspace', ws, '--output', bundle, '--replace-backup', '--browser-state', badBrowserState]);
A.ok(failedReplacement.status !== 0, 'failed replacement export is reported');
A.eq(fs.readFileSync(bundle, 'utf8'), originalBundleBytes, 'failed replacement export preserves the previous verified backup');
const replace = run(['backup', '--workspace', ws, '--output', bundle, '--replace-backup', '--browser-state', browserIn, '--app-version', 'replacement']);
A.eq(replace.status, 0, 'explicit replacement of an existing regular backup succeeds');
const fileLink = path.join(root, 'linked-backup.json');
try {
  fs.symlinkSync(bundle, fileLink, 'file');
  const targetBeforeSymlinkAttempt = fs.readFileSync(bundle);
  const linked = run(['backup', '--workspace', ws, '--output', fileLink, '--replace-backup']);
  A.ok(linked.status !== 0 && /symbolic link/i.test(linked.stderr), 'backup CLI refuses a symlink destination even with explicit replacement');
  A.eq(fs.readFileSync(bundle).equals(targetBeforeSymlinkAttempt), true, 'symlink rejection leaves the target bytes unchanged');
} catch (e) {
  if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(e && e.code)) throw e;
  console.log('SKIP: file symlink destination test unavailable on this host (' + e.code + ')');
}

const inspect = run(['inspect', '--bundle', bundle]);
A.eq(inspect.status, 0, 'inspect CLI exits green');
const inspection = JSON.parse(inspect.stdout);
A.eq(inspection.appVersion, 'replacement', 'explicit replacement commits the new valid recovery point');
A.eq(inspection.requirements.filter(x => x.status === 'present').length, 11, 'inspect reports all required categories');
A.ok(inspection.reauthentication.some(x => x.id === 'notion'), 'inspect reports connector reauthentication');

const restore = run(['restore', '--bundle', bundle, '--target', target, '--browser-output', browserOut]);
A.eq(restore.status, 0, 'restore CLI exits green: ' + restore.stderr);
A.eq(fs.readFileSync(path.join(target, 'agent', 'report.md'), 'utf8'), 'deliverable', 'restore CLI recovers deliverable bytes');
A.ok(fs.existsSync(browserOut), 'restore CLI emits browser-state import file');
const restoredBrowser = JSON.parse(fs.readFileSync(browserOut, 'utf8'));
A.eq(restoredBrowser.schema, 'starnet.backup', 'browser restore artifact uses the existing UI import schema');
A.eq(restoredBrowser.store['starnet.station.v1'], '{"room":"r"}', 'browser-owned layout survives the CLI round-trip');

const second = run(['restore', '--bundle', bundle, '--target', target]);
A.ok(second.status !== 0 && /not clean/.test(second.stderr), 'restore refuses an existing profile without explicit rollback authority');

const failedTarget = path.join(root, 'failed-machine', 'workspaces');
const invalidBrowserOut = path.join(root, 'browser-output-is-a-directory');
fs.mkdirSync(invalidBrowserOut, { recursive: true });
const failedRestore = run(['restore', '--bundle', bundle, '--target', failedTarget, '--browser-output', invalidBrowserOut]);
A.ok(failedRestore.status !== 0, 'restore reports browser-output preparation failure');
A.eq(fs.existsSync(failedTarget), false, 'browser-output failure cannot activate a partial workspace restore');

for (const [label, outputFor] of [
  ['equal', targetPath => targetPath],
  ['descendant', targetPath => path.join(targetPath, 'browser', 'restore.json')]
]) {
  const collisionTarget = path.join(root, label + '-collision', 'workspaces');
  const collision = run(['restore', '--bundle', bundle, '--target', collisionTarget, '--browser-output', outputFor(collisionTarget)]);
  A.ok(collision.status !== 0 && /browser output/i.test(collision.stderr), 'restore rejects browser output ' + label + ' to workspace target');
  A.eq(fs.existsSync(collisionTarget), false, 'browser output ' + label + ' rejection creates no workspace target');
}

fs.rmSync(root, { recursive: true, force: true });
A.report('station-recovery-cli.test');
