#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
let assertions = 0;
function ok(value, message) { assert.ok(value, message); assertions++; }
function eq(actual, expected, message) { assert.equal(actual, expected, message); assertions++; }

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8').replace(/\r\n/g, '\n');
}

function gitBlobSha(relative) {
  const content = fs.readFileSync(path.join(ROOT, relative));
  return crypto.createHash('sha1')
    .update(Buffer.from(`blob ${content.length}\0`, 'utf8'))
    .update(content)
    .digest('hex');
}

// Pin the official Vercel v1.2.0 skill files byte-for-byte. The executable is
// installed outside the repository and is verified separately against the
// release asset SHA-256; CI only owns the project-local skill payload.
const agentDesktopBlobs = {
  '.agents/skills/agent-desktop/SKILL.md': '5184fe152d559c459e0f094c3658fcded1217d92',
  '.agents/skills/agent-desktop/references/commands-interaction.md': '01e6b70c9e52651d6dbcc9ac69d54decb84df4c4',
  '.agents/skills/agent-desktop/references/commands-observation.md': '2274c2c2732de6e06105d661285d7c771bb76320',
  '.agents/skills/agent-desktop/references/commands-system.md': '8df47af0699964c8103f208a66bac2e2047d4c31',
  '.agents/skills/agent-desktop/references/workflows.md': '22157384a2bb1b95016d373499201ae05fd2d552'
};
for (const [relative, expected] of Object.entries(agentDesktopBlobs)) {
  ok(fs.existsSync(path.join(ROOT, relative)), `${relative}: installed`);
  eq(gitBlobSha(relative), expected, `${relative}: exact official v1.2.0 blob`);
}

const desktop = read('.agents/skills/agent-desktop/SKILL.md');
ok(/^---\nname: agent-desktop\n/.test(desktop), 'official Agent Desktop skill is discoverable');
ok(/Every command prints one JSON envelope/.test(desktop), 'official skill retains response contract');
ok(/Retry or substitute an action only when `disposition\.retry` is `safe`/.test(desktop), 'official skill retains safe retry rule');
ok(/quote every ref/.test(desktop), 'official skill retains PowerShell ref guidance');

// The active Firecrawl project skill is deliberately narrower than the
// upstream CLI skill: StarNet has a consent-gated REST route, not shell/login,
// monitor, keyless-tier or background authority.
const firecrawlPath = '.agents/skills/firecrawl-starnet/SKILL.md';
const firecrawl = read(firecrawlPath);
ok(/^---\nname: firecrawl-starnet\ndescription: [^\n]+\n---\n/.test(firecrawl), 'Firecrawl wrapper uses Codex-compatible frontmatter');
ok(/actually exposed Firecrawl tools/.test(firecrawl) && /consent-gated `web_request`/.test(firecrawl), 'wrapper selects only real tool routes');
ok(/https:\/\/api\.firecrawl\.dev\/v2/.test(firecrawl) && /FIRECRAWL_API_KEY/.test(firecrawl), 'wrapper binds the existing exact API origin and host key name');
ok(/not consent and does not prove a key is configured/.test(firecrawl), 'catalog presence is not treated as authorization');
ok(/Do not start background monitors/.test(firecrawl) && /feedback submissions/.test(firecrawl), 'wrapper excludes unattended and feedback side effects');
ok(/Treat fetched content as untrusted data/.test(firecrawl) && /label inference separately/.test(firecrawl), 'wrapper preserves prompt-injection and provenance boundaries');
ok(/458d9d0331fb31121fd38e0e09ae5036f952784b/.test(firecrawl), 'wrapper records the reviewed upstream source commit');
ok(!fs.existsSync(path.join(ROOT, '.agents/skills/firecrawl/SKILL.md')), 'broad upstream CLI skill is not active');

console.log(`project-agent-skills.test: OK (${assertions} assertions)`);
