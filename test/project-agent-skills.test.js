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

function walkFiles(relative) {
  const root = path.join(ROOT, relative);
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(child));
    else out.push(child.replace(/\\/g, '/'));
  }
  return out.sort();
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

// UI quality intake: activate only the reviewed, instruction-only packages.
// Every upstream payload is pinned byte-for-byte; large script-bearing packs
// remain in quarantine and are deliberately absent from the active tree.
const uiSkillBlobs = {
  '.agents/skills/frontend-design/LICENSE.txt': 'f433b1a53f5b830a205fd2df78e2b34974656c7b',
  '.agents/skills/frontend-design/SKILL.md': 'a5333457c414d20d625f307df945842c0952ecc3',
  '.agents/skills/interface-design/agents/openai.yaml': '69138eaaf2083d18e130d6742be141491bc60275',
  '.agents/skills/interface-design/SKILL.md': '92e1df4eb5ca30923149c60f142db7ebeaaad334',
  '.agents/skills/better-typography/agents/openai.yaml': '3baec7d2a846fd811bfa3bf0d41d37de931ad9f0',
  '.agents/skills/better-typography/choosing-fonts.md': 'f20acea6fc5ef4e9692234e28bb67a255efb0589',
  '.agents/skills/better-typography/css-cheat-sheet.md': 'e79e12d59c5addb3ec049b777f279e86118069b1',
  '.agents/skills/better-typography/details-and-accessibility.md': 'bf12e53d65e5e0f07eb67c2dbcf00713754d247c',
  '.agents/skills/better-typography/SKILL.md': '843e22d6c32b930d8aa225d7150201bf6f6c80b6',
  '.agents/skills/better-typography/spacing-and-sizing.md': 'a6523cb8f72ba0781b6be5768053f8043132f349',
  '.agents/skills/better-typography/variable-fonts-and-opentype.md': '5fa1b72c55a21a20d635b900fc20680946cc63cf',
  '.agents/skills/better-typography/wrapping-and-punctuation.md': '4a17017136190ab98647654f6877e8f5aa83e967',
  '.agents/skills/better-accessibility/agents/openai.yaml': '36b942fb8e5b86916b006c2fe4e07fdbde24a112',
  '.agents/skills/better-accessibility/focus-and-keyboard.md': 'ba4982b56ea2e2c8d3af560db0a9277ce1a567b2',
  '.agents/skills/better-accessibility/forms.md': '6e9839d2ea1c2790efd8132027ebf44dd8f206e5',
  '.agents/skills/better-accessibility/hit-areas.md': 'f44d07d20ecd529985b82883273c6830c8ecb9f1',
  '.agents/skills/better-accessibility/motion-and-zoom.md': '7ba3f3a2466c4365bb300df9e8c6fa74b51ad279',
  '.agents/skills/better-accessibility/screen-readers.md': '275394c2b880277fff1abea51098243029dd684d',
  '.agents/skills/better-accessibility/semantics-and-aria.md': '410c022391ab661c074141dab948f8b85a282e79',
  '.agents/skills/better-accessibility/SKILL.md': '5e9ab11b4c109d56c435731198ed23ba0267e529',
  '.agents/skills/better-writing/agents/openai.yaml': '92fca236728b3ff434cf2419968dcc22d67c9f0a',
  '.agents/skills/better-writing/patterns.md': 'be3001190b33523c7e031bf368bcaf15cc19cd07',
  '.agents/skills/better-writing/SKILL.md': '54f93d31197446fc5b4d8645fddaa3ec91baa5c2'
};
for (const [relative, expected] of Object.entries(uiSkillBlobs)) {
  ok(fs.existsSync(path.join(ROOT, relative)), `${relative}: installed`);
  eq(gitBlobSha(relative), expected, `${relative}: exact reviewed upstream blob`);
}

const activeUiSkills = ['frontend-design', 'interface-design', 'better-typography', 'better-accessibility', 'better-writing'];
for (const name of activeUiSkills) {
  const skillRoot = `.agents/skills/${name}`;
  const source = read(`${skillRoot}/SKILL.md`);
  ok(/^---\nname: [^\n]+\ndescription: [^\n]+/.test(source), `${name}: discoverable skill frontmatter`);
  const executable = walkFiles(skillRoot).filter(file => /\.(?:exe|dll|bat|cmd|ps1|sh|py|js|mjs|cjs|ts)$/i.test(file));
  eq(executable.length, 0, `${name}: no executable payload`);
}
ok(read('.agents/skills/interface-design/LICENSE.upstream').includes('Copyright (c) 2026 Damola Akinleye'), 'interface-design retains upstream MIT notice');
for (const name of ['better-typography', 'better-accessibility', 'better-writing']) {
  ok(read(`.agents/skills/${name}/LICENSE.upstream`).includes('Copyright (c) 2026 Jakub Krehel'), `${name}: retains upstream MIT notice`);
}
for (const excluded of ['taste-skill', 'ui-ux-pro-max', 'impeccable', 'shadcn']) {
  ok(!fs.existsSync(path.join(ROOT, '.agents/skills', excluded)), `${excluded}: script-bearing or overlapping package remains inactive`);
}

console.log(`project-agent-skills.test: OK (${assertions} assertions)`);
