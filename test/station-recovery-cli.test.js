/* node test/station-recovery-cli.test.js — production offline CLI round-trip. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const A = require('./_assert.js');
const Recovery = require('../sidecar/station-recovery.js');
const Save = require('../frontend/app/save.js');

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
const validAgentSave = JSON.stringify({ schema: 'starnet.save', version: 6, agent: { id: 'agent' }, station: { rooms: ['r'], props: ['p'] } });
fs.writeFileSync(browserIn, JSON.stringify({ schema: 'starnet.backup', version: 1, store: { 'starnet.save': validAgentSave, 'starnet.station.v1': '{"room":"r"}' } }));

const backup = run(['backup', '--workspace', ws, '--output', bundle, '--browser-state', browserIn, '--app-version', 'test', '--mutation', '7']);
A.eq(backup.status, 0, 'backup CLI exits green: ' + backup.stderr);
A.ok(fs.existsSync(bundle), 'backup CLI creates the bundle');
A.ok(fs.readFileSync(bundle, 'utf8').indexOf('SECRET') < 0, 'backup CLI excludes credential bytes');
const backupReceipt = JSON.parse(backup.stdout);
A.eq(backupReceipt.ok, true, 'backup CLI prints a machine-readable receipt');
A.eq(backupReceipt.recoveryPoint.lastCompletedMutation, '7', 'backup receipt binds the requested mutation');

const missingBrowserBundle = path.join(root, 'backup', 'missing-browser.starnet-recovery.json');
const missingBrowser = run(['backup', '--workspace', ws, '--output', missingBrowserBundle]);
A.ok(missingBrowser.status !== 0 && /--browser-state is required/.test(missingBrowser.stderr), 'complete backup CLI requires the browser-owned state export');
A.eq(fs.existsSync(missingBrowserBundle), false, 'missing browser export cannot produce a falsely complete recovery point');
const missingAgentState = path.join(root, 'browser-no-agent.json');
fs.writeFileSync(missingAgentState, JSON.stringify({ schema: 'starnet.backup', version: 1, store: { 'starnet.station.v1': '{}' } }));
const invalidBrowserBundle = path.join(root, 'backup', 'invalid-browser.starnet-recovery.json');
const invalidBrowser = run(['backup', '--workspace', ws, '--output', invalidBrowserBundle, '--browser-state', missingAgentState]);
A.ok(invalidBrowser.status !== 0 && /browser export is invalid: backup has no agent/.test(invalidBrowser.stderr), 'backup CLI rejects browser export without the agent save');
A.eq(fs.existsSync(invalidBrowserBundle), false, 'invalid browser export cannot create a recovery point');

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
for (const [label, raw] of [['empty', ''], ['not-json', '{broken']]) {
  const statePath = path.join(root, 'browser-save-' + label + '.json');
  fs.writeFileSync(statePath, JSON.stringify({ schema: 'starnet.backup', version: 1, store: { 'starnet.save': raw } }));
  const failedSaveReplacement = run(['backup', '--workspace', ws, '--output', bundle, '--replace-backup', '--browser-state', statePath]);
  A.ok(failedSaveReplacement.status !== 0 && /browser agent save is not valid JSON/.test(failedSaveReplacement.stderr), 'backup rejects ' + label + ' agent save content');
  A.eq(fs.readFileSync(bundle, 'utf8'), originalBundleBytes, 'rejected ' + label + ' agent save preserves the existing recovery point');
}
const futureState = path.join(root, 'browser-save-future.json');
fs.writeFileSync(futureState, JSON.stringify({ schema: 'starnet.backup', version: 1, store: {
  'starnet.save': JSON.stringify({ schema: 'starnet.save', version: Save.CURRENT + 1, agent: { id: 'future-agent' } })
} }));
const futureSave = run(['backup', '--workspace', ws, '--output', bundle, '--replace-backup', '--browser-state', futureState]);
A.ok(futureSave.status !== 0 && /newer StarNet version/.test(futureSave.stderr), 'backup rejects a future-version agent save');
A.eq(fs.readFileSync(bundle, 'utf8'), originalBundleBytes, 'future-version save rejection preserves the existing recovery point');
const legacyBrowserIn = path.join(root, 'legacy-browser-in.json');
fs.writeFileSync(legacyBrowserIn, JSON.stringify({ schema: 'skynet.backup', version: 1, store: {
  'skynet.save': JSON.stringify({ schema: 'skynet.save', version: 5, agent: { id: 'legacy-agent' } }),
  'skynet.station.v1': '{"legacy":true}'
} }));
const legacyBundle = path.join(root, 'backup', 'legacy.starnet-recovery.json');
const legacyBackup = run(['backup', '--workspace', ws, '--output', legacyBundle, '--browser-state', legacyBrowserIn]);
A.eq(legacyBackup.status, 0, 'backup CLI accepts a valid legacy StarNet browser export');
const legacyInspection = run(['inspect', '--bundle', legacyBundle]);
A.eq(JSON.parse(legacyInspection.stdout).scope, 'station', 'legacy browser state remains a full station recovery scope');
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

const workspaceOnlyBundle = path.join(root, 'backup', 'workspace-only.starnet-recovery.json');
const workspaceOnlyBackup = run(['backup', '--workspace', ws, '--output', workspaceOnlyBundle, '--workspace-only']);
A.eq(JSON.parse(workspaceOnlyBackup.stdout).scope, 'workspace-only', 'explicit backend-only backup reports its narrower scope');
const workspaceOnlyInspection = run(['inspect', '--bundle', workspaceOnlyBundle]);
A.eq(JSON.parse(workspaceOnlyInspection.stdout).scope, 'workspace-only', 'inspection preserves workspace-only scope');

const restore = run(['restore', '--bundle', bundle, '--target', target, '--browser-output', browserOut]);
A.eq(restore.status, 0, 'restore CLI exits green: ' + restore.stderr);
A.eq(fs.readFileSync(path.join(target, 'agent', 'report.md'), 'utf8'), 'deliverable', 'restore CLI recovers deliverable bytes');
A.ok(fs.existsSync(browserOut), 'restore CLI emits browser-state import file');
const restoredBrowser = JSON.parse(fs.readFileSync(browserOut, 'utf8'));
A.eq(restoredBrowser.schema, 'starnet.backup', 'browser restore artifact uses the existing UI import schema');
A.eq(restoredBrowser.store['starnet.station.v1'], '{"room":"r"}', 'browser-owned layout survives the CLI round-trip');

const workspaceOnlyTarget = path.join(root, 'workspace-only-machine', 'workspaces');
const workspaceOnlyBrowserOut = path.join(root, 'workspace-only-browser.json');
const workspaceOnlyRestore = run(['restore', '--bundle', workspaceOnlyBundle, '--target', workspaceOnlyTarget, '--browser-output', workspaceOnlyBrowserOut]);
A.eq(workspaceOnlyRestore.status, 0, 'workspace-only bundle restores its durable profile');
A.eq(JSON.parse(workspaceOnlyRestore.stdout).browserImport.available, false, 'workspace-only restore clearly reports browser state is absent');
A.eq(fs.existsSync(workspaceOnlyBrowserOut), false, 'workspace-only restore does not emit an invalid browser-import file');

const invalidLegacyBundleFile = path.join(root, 'backup', 'legacy-incomplete-browser.starnet-recovery.json');
const invalidLegacyBundle = Recovery.capture({ workspaceRoot: ws, browserStore: { 'starnet.station.v1': '{}' }, now: Date.now(), appVersion: 'legacy-cli', lastCompletedMutation: null });
Recovery.writeBundleAtomic({ bundle: invalidLegacyBundle, file: invalidLegacyBundleFile });
A.eq(Recovery.readBundle(invalidLegacyBundleFile).browser.length, 1, 'legacy incomplete-browser fixture has valid bundle integrity');
const invalidLegacyInspect = run(['inspect', '--bundle', invalidLegacyBundleFile]);
A.ok(invalidLegacyInspect.status !== 0 && /bundle browser state is invalid/.test(invalidLegacyInspect.stderr), 'inspect rejects an integrity-valid bundle with incomplete browser state');
const invalidLegacyTarget = path.join(root, 'invalid-legacy-target', 'workspaces');
const invalidLegacyBrowserOutput = path.join(root, 'invalid-legacy-browser-output.json');
const invalidLegacyRestore = run(['restore', '--bundle', invalidLegacyBundleFile, '--target', invalidLegacyTarget, '--browser-output', invalidLegacyBrowserOutput]);
A.ok(invalidLegacyRestore.status !== 0 && /bundle browser state is invalid/.test(invalidLegacyRestore.stderr), 'restore rejects the incomplete browser state before activation');
A.eq(fs.existsSync(invalidLegacyTarget), false, 'invalid legacy browser state rejection leaves restore target untouched');
A.eq(fs.existsSync(invalidLegacyBrowserOutput), false, 'invalid legacy browser state rejection creates no import file');

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

// Restore browser imports must reject symlink destinations before activating workspace data.
const linkedBrowserTarget = path.join(root, 'linked-browser-target.json');
fs.writeFileSync(linkedBrowserTarget, 'keep this file');
const linkedBrowserOutput = path.join(root, 'linked-browser-output.json');
let fileSymlinkCreated = false;
try {
  fs.symlinkSync(linkedBrowserTarget, linkedBrowserOutput, 'file');
  fileSymlinkCreated = true;
} catch (e) {
  if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(e && e.code)) throw e;
  console.log('SKIP: restore browser-output file symlink test unavailable on this host (' + e.code + ')');
}
if (fileSymlinkCreated) {
  const symlinkRestoreTarget = path.join(root, 'symlink-restore', 'workspaces');
  const linkedBrowserRestore = run(['restore', '--bundle', bundle, '--target', symlinkRestoreTarget, '--browser-output', linkedBrowserOutput]);
  A.ok(linkedBrowserRestore.status !== 0 && /browser output must not be a symbolic link/i.test(linkedBrowserRestore.stderr), 'restore refuses a symlink browser-output destination');
  A.eq(fs.lstatSync(linkedBrowserOutput).isSymbolicLink(), true, 'refused restore preserves the browser-output symlink');
  A.eq(fs.readFileSync(linkedBrowserTarget, 'utf8'), 'keep this file', 'refused restore leaves the symlink target bytes unchanged');
  A.eq(fs.existsSync(symlinkRestoreTarget), false, 'symlink browser-output rejection cannot activate the workspace restore');
}

const danglingTarget = path.join(root, 'missing-browser-target.json');
const danglingOutput = path.join(root, 'dangling-browser-output.json');
let danglingSymlinkCreated = false;
try {
  fs.symlinkSync(danglingTarget, danglingOutput, 'file');
  danglingSymlinkCreated = true;
} catch (e) {
  if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(e && e.code)) throw e;
  console.log('SKIP: restore browser-output dangling symlink test unavailable on this host (' + e.code + ')');
}
if (danglingSymlinkCreated) {
  const danglingRestoreTarget = path.join(root, 'dangling-symlink-restore', 'workspaces');
  const danglingRestore = run(['restore', '--bundle', bundle, '--target', danglingRestoreTarget, '--browser-output', danglingOutput]);
  A.ok(danglingRestore.status !== 0 && /browser output must not be a symbolic link/i.test(danglingRestore.stderr), 'restore refuses a dangling browser-output symlink');
  A.eq(fs.lstatSync(danglingOutput).isSymbolicLink(), true, 'refused restore preserves the dangling browser-output symlink');
  A.eq(fs.existsSync(danglingTarget), false, 'dangling symlink target remains absent');
  A.eq(fs.existsSync(danglingRestoreTarget), false, 'dangling symlink rejection cannot activate the workspace restore');
}

fs.rmSync(root, { recursive: true, force: true });
A.report('station-recovery-cli.test');
