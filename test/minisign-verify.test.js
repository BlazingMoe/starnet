#!/usr/bin/env node
'use strict';
// Unit tests for scripts/minisign-verify.mjs — the cryptographic check the release
// pipeline runs on every artifact/.sig pair before a manifest can be assembled.
// Uses test/minisign-test-signer.js (real ed25519 + blake2b512, same doc format as
// Tauri's signer). The derivative intentionally has no production updater key yet,
// so parser/verification coverage must use the isolated test key rather than an
// inherited StarNet release key from tauri.conf.json.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { makeSigner } = require('./minisign-test-signer.js');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'minisign-verify.mjs');

let assertions = 0;
function ok(cond, msg) { assert.ok(cond, msg); assertions++; }
function eq(a, b, msg) { assert.equal(a, b, msg); assertions++; }

(async () => {
  const { parsePublicKey, parseSignature, verifySignature } =
    await import(pathToFileURL(SCRIPT).href);

  const signer = makeSigner();
  const artifact = Buffer.from('installer bytes: not a real installer, but really signed');

  // 1. A real minisign public-key document produced by the isolated test signer parses.
  // Production updater configuration is intentionally absent until Moe AI Station has
  // its own signing identity and release channel.
  {
    const parsed = parsePublicKey(signer.pubkeyDoc);
    eq(parsed.publicKey.length, 32, 'test pubkey is 32 bytes');
    eq(parsed.keyId.length, 8, 'test key id is 8 bytes');
  }

  // 2. Round-trip: prehashed "ED" (Tauri default) verifies, in both supported pubkey forms.
  {
    const { sigFileContent, doc } = signer.sign(artifact, { fileName: 'a.exe' });
    for (const [form, key] of [['doc', signer.pubkeyDoc], ['b64-of-doc', signer.pubkeyB64]]) {
      const res = verifySignature(artifact, sigFileContent, key);
      ok(res.ok, 'ED round-trip verifies (pubkey as ' + form + '): ' + res.reason);
    }
    eq(verifySignature(artifact, sigFileContent, signer.pubkeyDoc).alg, 'ED', 'alg reported');
    ok(verifySignature(artifact, doc, signer.pubkeyDoc).ok, 'raw sig doc verifies');
    ok(/timestamp:1700000000/.test(verifySignature(artifact, sigFileContent, signer.pubkeyDoc).trustedComment),
      'trusted comment surfaced');
  }

  // 3. Legacy non-prehashed "Ed" also verifies.
  {
    const { sigFileContent } = signer.sign(artifact, { alg: 'Ed' });
    const res = verifySignature(artifact, sigFileContent, signer.pubkeyDoc);
    ok(res.ok, 'Ed (legacy raw-message) round-trip verifies: ' + res.reason);
  }

  // 4. Tampered artifact → fail with the artifact-mismatch reason.
  {
    const { sigFileContent } = signer.sign(artifact);
    const tampered = Buffer.concat([artifact, Buffer.from('X')]);
    const res = verifySignature(tampered, sigFileContent, signer.pubkeyDoc);
    ok(!res.ok, 'tampered artifact must fail');
    ok(/does not match the artifact/.test(res.reason), 'tamper reason: ' + res.reason);
  }

  // 5. Signature from a DIFFERENT key → key id mismatch (wrong-key-in-CI scenario).
  {
    const otherSigner = makeSigner();
    const { sigFileContent } = otherSigner.sign(artifact);
    const res = verifySignature(artifact, sigFileContent, signer.pubkeyDoc);
    ok(!res.ok, 'wrong-key signature must fail');
    ok(/key id mismatch/.test(res.reason), 'wrong-key reason: ' + res.reason);
  }

  // 6. Corrupted trusted-comment (global) signature → fail.
  {
    const { sigFileContent } = signer.sign(artifact, { corruptGlobal: true });
    const res = verifySignature(artifact, sigFileContent, signer.pubkeyDoc);
    ok(!res.ok, 'corrupt global signature must fail');
    ok(/trusted-comment/.test(res.reason), 'global-sig reason: ' + res.reason);
  }

  // 7. Malformed inputs throw (they are as fatal as a bad signature, but loudly).
  {
    assert.throws(() => parseSignature('not a signature'), /neither a minisign document/); assertions++;
    assert.throws(() => parsePublicKey(''), /empty/); assertions++;
    assert.throws(() => parsePublicKey('AAAA'), /neither a minisign document|empty\/invalid/); assertions++;
  }

  // 8. CLI: exit 0 on a valid pair, exit 1 on a tampered artifact.
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'minisign-verify-'));
    try {
      const art = path.join(tmp, 'artifact.bin');
      const pub = path.join(tmp, 'test.pub');
      fs.writeFileSync(art, artifact);
      fs.writeFileSync(art + '.sig', signer.sign(artifact, { fileName: 'artifact.bin' }).sigFileContent);
      fs.writeFileSync(pub, signer.pubkeyDoc);
      let res = spawnSync(process.execPath, [SCRIPT, '--artifact', art, '--pubkey', pub], { encoding: 'utf8' });
      eq(res.status, 0, 'CLI valid pair exits 0: ' + res.stderr);
      ok(/^OK/m.test(res.stdout), 'CLI prints OK');
      fs.appendFileSync(art, 'tamper');
      res = spawnSync(process.execPath, [SCRIPT, '--artifact', art, '--pubkey', pub], { encoding: 'utf8' });
      eq(res.status, 1, 'CLI tampered pair exits 1');
      ok(/FAIL/.test(res.stderr), 'CLI prints FAIL');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  console.log('minisign-verify.test: OK (' + assertions + ' assertions)');
})().catch(e => { console.error(e); process.exit(1); });
